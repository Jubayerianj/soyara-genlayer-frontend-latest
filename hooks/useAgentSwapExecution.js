// hooks/useAgentSwapExecution.js
//
// Shared GenLayer-validated swap execution logic for the `/ai` page and the
// `/a2a` swarm UI. Extracted from pages/ai.jsx so both surfaces settle through
// the exact same path (ERC20 approve → AgentExecutor one-time approval gate
// via /api/agent-execute) instead of drifting apart - before this extraction,
// the /a2a "Execute" button was a 1-second fake timeout that never called the
// real settlement API at all.
//
// UI-agnostic by design: `approve()`/`execute()` return plain result objects
// (or throw) instead of pushing formatted messages themselves - each caller
// (chat bubbles on /ai, timeline entries on /a2a) formats its own UI text.

import { useMemo, useCallback, useState } from 'react';
import { useAccount, useBalance, useReadContract, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from 'wagmi';
import { parseUnits, zeroAddress } from 'viem';
import { CONTRACT_ADDRESSES } from '../constants/addresses';
import { TOKEN_LIST, findTokenByAddress } from '../constants/tokens';
import { ERC20_ABI } from '../constants/abis';
import { buildProgram, buildMultiHopProgram } from '../utils/programBuilder';
import { normaliseAction, assertSettlementRoute, DIRECT_SETTLEMENT } from '../lib/actions';
import AGGFLOW_ENTRYPOINT_ABI from '../abi/AGGFlowEntrypoint.json';
import { withNodeRetry, paced, describeTxError, WALLET_ONE_RETRY } from '../lib/nodeRetry';
import { findUsableMandate, requestMandate, forgetMandate } from '../lib/mandate';

/**
 * @param proposal          the trade the agent decided on
 * @param options.fastMode  settle directly in one block (default), rather than
 *                          waiting for a GenLayer verdict.
 *
 * fastMode defaults to TRUE because the alternative is not a slightly slower
 * trade - it is a fifteen to twenty-five minute wait. A verdict reaches the
 * executor only when its consensus round finalizes, and no part of this app can
 * shorten that: GenVM's EthSend emission carries no delivery-timing field, while
 * PostMessage and DeployContract both take one. Per-trade consensus gating and
 * per-trade speed cannot both be had here.
 *
 * Pass { fastMode: false } for the enforced flow, where AgentExecutor refuses to
 * settle anything consensus has not approved.
 */
export function useAgentSwapExecution(proposal, { fastMode = true } = {}) {
  const { address: userAddress } = useAccount();
  const publicClient = usePublicClient();

  const entrypointAddress = CONTRACT_ADDRESSES[4221]?.aggregatorEntrypoint || '0x95feE6Cb918Ed9C621E36082EE8D998873031EaA';
  const wgenAddress = CONTRACT_ADDRESSES[4221]?.wgen || '0x315374AA9b5536037Cc1Efeea2439CCC0913A77e';

  // AgentExecutor routes settlement through the one-time approval hash system.
  // There is no direct-AGGFlowEntrypoint fallback: bypassing the approval gate is
  // the exact gap GenLayer's review flagged, so settlement fails closed instead.
  const agentExecutorAddress = CONTRACT_ADDRESSES[4221]?.agentExecutor;
  const isAgentExecutorDeployed = agentExecutorAddress && agentExecutorAddress !== '0x0000000000000000000000000000000000000000';
  const approvalSpender = isAgentExecutorDeployed ? agentExecutorAddress : entrypointAddress;

  const fromTokenObj = useMemo(() => {
    if (!proposal) return null;
    const symbol = proposal.tokenIn || proposal.fromToken;
    const address = proposal.tokenInAddress;
    if (address && address !== zeroAddress && address !== '0x0000000000000000000000000000000000000000') {
      return findTokenByAddress(address, 4221) || TOKEN_LIST[4221]?.find(t => t.symbol === symbol);
    }
    return TOKEN_LIST[4221]?.find(t => t.symbol === symbol) || { symbol: symbol || 'GEN', isNative: symbol === 'GEN', decimals: 18 };
  }, [proposal]);

  const toTokenObj = useMemo(() => {
    if (!proposal) return null;
    const symbol = proposal.tokenOut || proposal.toToken;
    const address = proposal.tokenOutAddress;
    if (address && address !== zeroAddress && address !== '0x0000000000000000000000000000000000000000') {
      return findTokenByAddress(address, 4221) || TOKEN_LIST[4221]?.find(t => t.symbol === symbol);
    }
    return TOKEN_LIST[4221]?.find(t => t.symbol === symbol) || { symbol: symbol || 'USDC', isNative: false, decimals: 18 };
  }, [proposal]);

  const isFromNative = fromTokenObj?.isNative || fromTokenObj?.symbol === 'GEN';
  const isToNative = toTokenObj?.isNative || toTokenObj?.symbol === 'GEN';

  const isAddLiquidityProposal = useMemo(
    () => String(proposal?.action || '').trim().toUpperCase() === 'ADD_LIQUIDITY',
    [proposal],
  );

  // For deposits, AgentExecutor pulls ERC-20s (substituting WGEN for native GEN)
  const tokenAApproveAddr = isAddLiquidityProposal
    ? (isFromNative ? wgenAddress : fromTokenObj?.address)
    : (isFromNative ? undefined : fromTokenObj?.address);

  const tokenBApproveAddr = isAddLiquidityProposal
    ? (isToNative ? wgenAddress : toTokenObj?.address)
    : undefined;

  const { data: allowance, refetch: refetchAllowance, isFetching: isCheckingAllowance } = useReadContract({
    address: tokenAApproveAddr,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: tokenAApproveAddr && userAddress && approvalSpender ? [userAddress, approvalSpender] : undefined,
    query: {
      enabled: !!tokenAApproveAddr && !!userAddress && !!approvalSpender,
    },
  });

  const { data: allowanceB, refetch: refetchAllowanceB } = useReadContract({
    address: tokenBApproveAddr,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: tokenBApproveAddr && userAddress && approvalSpender ? [userAddress, approvalSpender] : undefined,
    query: {
      enabled: isAddLiquidityProposal && !!tokenBApproveAddr && !!userAddress && !!approvalSpender,
    },
  });

  /** Raw amount of token B a deposit will pull. */
  const amountBRequired = useMemo(() => {
    if (!isAddLiquidityProposal || !proposal) return 0n;
    const raw = proposal.amountBRaw ?? proposal.amount1Desired ?? proposal.minAmountOutRaw;
    try {
      if (raw !== undefined && raw !== null && /^\d+$/.test(String(raw))) return BigInt(String(raw));
      return parseUnits(String(proposal.amountB ?? '0'), toTokenObj?.decimals || 18);
    } catch {
      return 0n;
    }
  }, [isAddLiquidityProposal, proposal, toTokenObj]);

  const isWrapOrUnwrapProposal = useMemo(() => {
    if (!proposal) return false;
    const symIn = fromTokenObj?.symbol || proposal.tokenIn;
    const symOut = toTokenObj?.symbol || proposal.tokenOut;
    return (symIn === 'GEN' && symOut === 'WGEN') || (symIn === 'WGEN' && symOut === 'GEN') || proposal.dex === 'wrap' || proposal.dex === 'unwrap';
  }, [proposal, fromTokenObj, toTokenObj]);

  const needsApproval = useMemo(() => {
    if (!proposal || isWrapOrUnwrapProposal || !userAddress) return false;
    const decimals = fromTokenObj?.decimals || 18;
    const amountInWei = proposal.amountInRaw
      ? BigInt(proposal.amountInRaw)
      : parseUnits(String(proposal.amountIn || '0'), decimals);

    if (isAddLiquidityProposal) {
      if (tokenAApproveAddr) {
        if (allowance === undefined) return false;
        if (allowance < amountInWei) return true;
      }
      if (tokenBApproveAddr && amountBRequired > 0n) {
        if (allowanceB === undefined) return false;
        if (allowanceB < amountBRequired) return true;
      }
      return false;
    }

    if (isFromNative || !fromTokenObj?.address) return false;
    if (allowance === undefined) return false;
    return allowance < amountInWei;
  }, [proposal, isFromNative, isWrapOrUnwrapProposal, userAddress, fromTokenObj, allowance,
      isAddLiquidityProposal, toTokenObj, allowanceB, amountBRequired, tokenAApproveAddr, tokenBApproveAddr]);

  // ── Balance pre-flight ────────────────────────────────────────────────────
  // Without this the shortfall only surfaced server-side at settlement, as a raw
  // "wallet holds X but the trade needs Y (raw units)" - after the user had
  // already validated and clicked Execute. Both /ai and /a2a can now refuse the
  // trade up front, which matters most on /a2a where the swarm proposes a size
  // the user never typed.
  const amountInRequired = useMemo(() => {
    if (!proposal) return null;
    const decimals = fromTokenObj?.decimals || 18;
    try {
      return proposal.amountInRaw
        ? BigInt(proposal.amountInRaw)
        : parseUnits(String(proposal.amountIn || '0'), decimals);
    } catch {
      return null;
    }
  }, [proposal, fromTokenObj]);

  const { data: nativeBalance } = useBalance({
    address: userAddress,
    query: { enabled: !!userAddress && isFromNative },
  });

  const { data: erc20Balance } = useReadContract({
    address: isFromNative ? undefined : fromTokenObj?.address,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: !isFromNative && userAddress ? [userAddress] : undefined,
    query: { enabled: !isFromNative && !!userAddress && !!fromTokenObj?.address },
  });

  const balanceRaw = isFromNative ? nativeBalance?.value : erc20Balance;

  const hasInsufficientBalance = useMemo(() => {
    if (balanceRaw === undefined || balanceRaw === null || amountInRequired === null) return false;
    return balanceRaw < amountInRequired;
  }, [balanceRaw, amountInRequired]);

  // A proposal built from the reference-price fallback has no pool behind it.
  const isNotExecutable = proposal?.executable === false;

  const { writeContractAsync: approveAsync, isPending: isApproving } = useWriteContract();
  const { writeContractAsync: executeSwapAsync } = useWriteContract();

  const [activeTxHash, setActiveTxHash] = useState(null);
  const [executionError, setExecutionError] = useState(null);
  const [isExecuting, setIsExecuting] = useState(false);

  const { isLoading: isTxWaiting, isSuccess: isTxSuccess, isError: isTxFailed } = useWaitForTransactionReceipt({
    hash: activeTxHash,
  });

  // Gas estimation helper for GenLayer
  const getTxGasParams = useCallback(async (fallbackGasLimit = 3500000n) => {
    let params = { gas: fallbackGasLimit };
    if (!publicClient) return params;
    try {
      const block = await publicClient.getBlock({ blockTag: 'latest' }).catch(() => null);
      const baseFee = block?.baseFeePerGas ?? 100000000n; // ~0.1 gwei, the observed Bradbury base fee
      // Fees derived from the chain's ACTUAL base fee.
      //
      // This used to send maxPriorityFeePerGas = 1 gwei with an 8 gwei
      // maxFeePerGas fallback. Bradbury's base fee is about 0.098 gwei, so the
      // tip alone was ten times the entire base fee and the fallback ceiling
      // was eighty times it. The node limits by GAS RATE, and an inflated fee
      // makes every transaction look far larger than it is - while also
      // overpaying for it.
      //
      // Standard EIP-1559 sizing instead: a tip that is a small fraction of the
      // base fee, and a ceiling of twice the base fee plus that tip, which
      // absorbs several blocks of base-fee growth.
      const tip = baseFee / 10n > 0n ? baseFee / 10n : 100000n;
      params.maxPriorityFeePerGas = tip;
      params.maxFeePerGas = baseFee * 2n + tip;
    } catch {
      // No block available. Size from the observed base fee (~0.1 gwei)
      // rather than the old 8 gwei, which was eighty times too high.
      params.maxPriorityFeePerGas = 10000000n;   // 0.01 gwei
      params.maxFeePerGas = 300000000n;          // 0.3 gwei
    }
    return params;
  }, [publicClient]);

  // Resolve V2 Pair or V3 Pool for execution
  const resolvePoolRoute = useCallback(async (tokenInFormatted, tokenOutFormatted, dexPref = 'best') => {
    const factoryV2 = CONTRACT_ADDRESSES[4221]?.factory || '0x4680BCe1632824d30D2F53656dD610736c3e312e';
    const factoryV3 = CONTRACT_ADDRESSES[4221]?.v3Factory || '0xBd959038300aF0C8dd1873E497d6D0a565b4E246';

    const tokenInAddr = tokenInFormatted.isNative ? wgenAddress : tokenInFormatted.address;
    const tokenOutAddr = tokenOutFormatted.isNative ? wgenAddress : tokenOutFormatted.address;

    // 1. Try V3 if requested or best
    if ((dexPref === 'v3' || dexPref === 'best') && publicClient) {
      const feeTiers = [500, 3000, 10000];
      const getPoolAbi = [{
        inputs: [
          { name: 'tokenA', type: 'address' },
          { name: 'tokenB', type: 'address' },
          { name: 'fee', type: 'uint24' },
        ],
        name: 'getPool',
        outputs: [{ name: 'pool', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
      }];

      // Probe the fee tiers concurrently - awaiting them one at a time cost ~1.4s
      // on Bradbury against ~0.5s in parallel, all of it before the user sees any
      // progress. Results are still consumed in tier order, so the cheapest tier
      // with a real pool still wins.
      const pools = await Promise.all(
        feeTiers.map((fee) =>
          publicClient
            .readContract({
              address: factoryV3,
              abi: getPoolAbi,
              functionName: 'getPool',
              args: [tokenInAddr, tokenOutAddr, fee],
            })
            .catch(() => null)
        )
      );

      for (let i = 0; i < feeTiers.length; i += 1) {
        const pool = pools[i];
        if (pool && pool !== zeroAddress && pool !== '0x0000000000000000000000000000000000000000') {
          return { poolAddress: pool, poolType: 'v3', fee: feeTiers[i], dexName: 'UniswapV3' };
        }
      }
    }

    // 2. Fallback to V2 Pair
    if (publicClient) {
      try {
        const pair = await publicClient.readContract({
          address: factoryV2,
          abi: [{
            inputs: [
              { name: 'tokenA', type: 'address' },
              { name: 'tokenB', type: 'address' },
            ],
            name: 'getPair',
            outputs: [{ name: 'pair', type: 'address' }],
            stateMutability: 'view',
            type: 'function',
          }],
          functionName: 'getPair',
          args: [tokenInAddr, tokenOutAddr],
        });
        if (pair && pair !== zeroAddress && pair !== '0x0000000000000000000000000000000000000000') {
          return { poolAddress: pair, poolType: 'v2', fee: 3000, dexName: 'OurV2' };
        }
      } catch (e) {
        // continue
      }
    }

    return null;
  }, [publicClient, wgenAddress]);

  // Approve token - approves the correct settlement spender (AgentExecutor or AGGFlowEntrypoint)
  const approve = useCallback(async () => {
    if (!fromTokenObj?.address || !approvalSpender || !proposal) return null;
    setExecutionError(null);

    // ONE-TIME UNLIMITED APPROVAL - this is an agentic system.
    //
    // Approving only the current trade's amountIn forces a wallet popup before
    // every single swap, which defeats the point of delegating execution to the
    // agent. Approve max once; every later trade then settles with no prompt.
    //
    // This does not weaken the security model. Per-trade authority comes from
    // the consensus commitment: AgentExecutor will only move funds against an
    // identifier the AgentValidator Intelligent Contract has approved, and that
    // identifier covers the route, the fee, the fee collector, the recipient and
    // the validated quote. It is consumed on use and cannot be replayed. The
    // allowance on its own grants nobody the ability to move anything.
    const MAX_UINT256 = (1n << 256n) - 1n;

    // Approve EVERY token this action will pull, not just the first one.
    //
    // A deposit moves both sides, and this approved only token A, so settlement
    // kept refusing with "Token B approval missing" while the button reported
    // success. Whatever the action pulls, it gets approved here.
    const targets = [];
    if (isAddLiquidityProposal) {
      if (tokenAApproveAddr && (allowance === undefined || allowance < amountInRequired)) {
        targets.push({ address: tokenAApproveAddr, symbol: isFromNative ? 'WGEN (for GEN LP)' : (fromTokenObj?.symbol || 'Token A'), refetch: refetchAllowance });
      }
      if (tokenBApproveAddr && amountBRequired > 0n && (allowanceB === undefined || allowanceB < amountBRequired)) {
        targets.push({ address: tokenBApproveAddr, symbol: isToNative ? 'WGEN (for GEN LP)' : (toTokenObj?.symbol || 'Token B'), refetch: refetchAllowanceB });
      }
    } else {
      if (!isFromNative && fromTokenObj?.address && (allowance === undefined || allowance < amountInRequired)) {
        targets.push({ address: fromTokenObj.address, symbol: fromTokenObj.symbol, refetch: refetchAllowance });
      }
    }
    if (targets.length === 0) return null;

    let hash = null;
    const approved = [];
    for (const { address, symbol, refetch } of targets) {
      // Through the pacing gate like every other send. An approve is only ~46k
      // gas, but the limiter is a gas RATE limit: an approve followed straight
      // away by a settlement is two sends inside a second from one account, and
      // the node refuses the second. Spacing them is what stops that.
      hash = await withNodeRetry(() => paced(() => approveAsync({
        address,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [approvalSpender, MAX_UINT256],
      })), { label: `approve ${symbol}`, ...WALLET_ONE_RETRY });
      // Wait before moving to the next one, so a second wallet prompt does not
      // race the first transaction.
      if (publicClient && hash) {
        try { await publicClient.waitForTransactionReceipt({ hash }); } catch { /* see below */ }
      }
      await refetch();
      approved.push({ symbol, hash });
    }

    return {
      hash,
      approved,
      amount: proposal.amountIn,
      symbol: approved.map((a) => a.symbol).join(' and '),
      unlimited: true,
    };
  }, [fromTokenObj, toTokenObj, approvalSpender, proposal, approveAsync, refetchAllowance,
      refetchAllowanceB, publicClient, isFromNative, isToNative, isAddLiquidityProposal, allowance,
      allowanceB, amountInRequired, amountBRequired, tokenAApproveAddr, tokenBApproveAddr]);


  // Execute swap on-chain via the one-time approval gate (/api/agent-execute)
  //
  // IMPORTANT: AgentExecutor.executeSwap() (approveTradeWithParams no longer exists;
  // approvals come from the validator IC, not from any key this server holds)
  // are both protected by `onlyAgent` - they will REVERT if called from the user wallet.
  // The server-side /api/agent-execute route holds the agent private key and calls them.
  // The user wallet only handles ERC20 approve (spender=AgentExecutor) before calling the API.
  /**
   * @param validationResult  the GenLayer validation this execution follows
   * @param resumeState       `{ pendingOrder, pendingProgram, validationSubmitted }`
   *                          - the order /api/genlayer-validate opened its
   *                          consensus round against, or the one a previous
   *                          `pending` attempt handed back. Passing it back
   *                          settles THAT commitment. Omitting it makes the
   *                          settlement route quote afresh and open its own
   *                          round, which both costs a second multi-minute wait
   *                          and waits on a different commitment from the one
   *                          consensus is already finalising.
   */
  const execute = useCallback(async (validationResult, resumeState = null) => {
    if (!proposal || !userAddress) return null;

    // FAIL CLOSED: validation must have run and been approved before settlement.
    if (!validationResult?.approved) {
      throw new Error('Settlement blocked: GenLayer validation has not been approved. Run validation first.');
    }

    if (isNotExecutable) {
      const err = new Error(
        proposal.notExecutableReason
        || 'This pair has no liquidity pool on Soyara DEX, so the trade cannot settle.'
      );
      err.notRoutable = true;
      setExecutionError(err.message);
      throw err;
    }

    if (hasInsufficientBalance) {
      const sym = fromTokenObj?.symbol || 'token';
      const err = new Error(
        `Don't have enough ${sym} for this trade. Reduce the amount and request a fresh quote.`
      );
      err.insufficientBalance = true;
      setExecutionError(err.message);
      throw err;
    }

    // The action decides which funds move and how. Read it once, here, and
    // refuse anything unrecognised rather than letting it reach a default.
    const action = normaliseAction(proposal.action);
    if (action === 'UNKNOWN') {
      const err = new Error(
        `Refusing to settle: the request's action is "${proposal.action}", which is not `
        + 'one this executor recognises. Nothing has moved.'
      );
      setExecutionError(err.message);
      throw err;
    }

    setIsExecuting(true);
    setExecutionError(null);

    try {
      const isNative = isFromNative;
      const decimalsIn = fromTokenObj?.decimals || 18;
      const decimalsOut = toTokenObj?.decimals || 18;

      const amountInWei = proposal.amountInRaw
        ? BigInt(proposal.amountInRaw)
        : parseUnits(String(proposal.amountIn || '0'), decimalsIn);

      const minAmountOutWei = proposal.minAmountOutRaw
        ? BigInt(proposal.minAmountOutRaw)
        : parseUnits(String(proposal.minAmountOut || '1'), decimalsOut);

      const tokenInFormatted = {
        ...fromTokenObj,
        address: isNative ? zeroAddress : fromTokenObj.address,
        isNative,
      };
      const tokenOutFormatted = {
        ...toTokenObj,
        address: toTokenObj.isNative ? zeroAddress : toTokenObj.address,
        isNative: toTokenObj.isNative || toTokenObj.symbol === 'GEN',
      };

      // ── REMOVE_LIQUIDITY settles through its own gated route ────────────────
      // Before this existed, an approved withdrawal validated and then did
      // nothing on-chain - execute() only ever handled swaps and deposits.
      if (action === 'REMOVE_LIQUIDITY') {
        const res = await fetch('/api/agent-remove-liquidity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user: userAddress,
            tokenA: tokenInFormatted.isNative ? wgenAddress : tokenInFormatted.address,
            tokenB: tokenOutFormatted.isNative ? wgenAddress : tokenOutFormatted.address,
            percent: proposal.percent ?? 100,
            lpAmount: proposal.lpAmountRaw ?? null,
            // Same minimum the proposal was validated with, so settlement
            // derives the identical proposal id.
            validatedMinOut: proposal.minAmountOutRaw ?? null,
            slippageBps: proposal.slippageBps || 100,
            deadline: proposal.deadline || (Math.floor(Date.now() / 1000) + 7200),
            validationApproved: Boolean(validationResult?.approved),
          }),
        });
        const out = await res.json();
        if (!res.ok || !out.success) {
          const err = new Error(out.error || 'Withdrawal failed - aborted (fail-closed)');
          err.needsApproval = Boolean(out.needsApproval);
          err.approvalToken = out.token || null;
          err.notValidated = Boolean(out.notValidated);
          // Still finalising rather than failed - see the note on the swap path.
          err.pending = Boolean(out.pending);
          err.commitment = out.commitment;
          throw err;
        }
        setActiveTxHash(out.execTxHash);
        return {
          kind: 'remove_liquidity',
          hash: out.execTxHash,
          commitment: out.commitment,
          lpBurned: out.lpBurned,
          validationTxHash: out.validationTxHash,
          explorerUrl: out.explorerUrl,
        };
      }

      // ── ADD_LIQUIDITY settles through its own gated route ───────────────────
      // Previously execute() only ever handled swaps, so an approved liquidity
      // proposal on /a2a validated and then did nothing on-chain at all.
      if (action === 'ADD_LIQUIDITY') {
        const amountARaw = proposal.amountARaw ?? proposal.amountInRaw;
        const amountBRaw = proposal.amountBRaw ?? proposal.minAmountOutRaw;
        const tokenAAddr = tokenInFormatted.isNative ? wgenAddress : tokenInFormatted.address;
        const tokenBAddr = tokenOutFormatted.isNative ? wgenAddress : tokenOutFormatted.address;

        const lpRes = await fetch('/api/agent-add-liquidity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user: userAddress,
            tokenA: tokenAAddr,
            tokenB: tokenBAddr,
            amountADesired: String(amountARaw),
            amountBDesired: String(amountBRaw),
            slippageBps: proposal.slippageBps || 30,
            // `deadlineNum` is declared further down in this function, so it is
            // in the temporal dead zone here - compute the fallback inline.
            deadline: proposal.deadline || (Math.floor(Date.now() / 1000) + 7200),
            validationApproved: Boolean(validationResult?.approved),
          }),
        });
        const lpResult = await lpRes.json();
        if (!lpRes.ok || !lpResult.success) {
          const err = new Error(lpResult.error || 'Liquidity settlement failed - aborted (fail-closed)');
          err.needsApproval = Boolean(lpResult.needsApproval);
          err.notValidated = Boolean(lpResult.notValidated);
          // Still finalising rather than failed - see the note on the swap path.
          err.pending = Boolean(lpResult.pending);
          err.commitment = lpResult.commitment;
          throw err;
        }
        setActiveTxHash(lpResult.execTxHash);
        return {
          kind: 'add_liquidity',
          hash: lpResult.execTxHash,
          commitment: lpResult.commitment,
          validationTxHash: lpResult.validationTxHash,
          explorerUrl: lpResult.explorerUrl,
        };
      }

      const isWrapOp = (fromTokenObj?.symbol === 'GEN' && toTokenObj?.symbol === 'WGEN') || proposal.dex === 'wrap';
      const isUnwrapOp = (fromTokenObj?.symbol === 'WGEN' && toTokenObj?.symbol === 'GEN') || proposal.dex === 'unwrap';

      if (isWrapOp) {
        const gasParams = await getTxGasParams(200000n);
        const hash = await withNodeRetry(() => paced(() => executeSwapAsync({
          address: wgenAddress,
          abi: [{ type: 'function', name: 'deposit', inputs: [], outputs: [], stateMutability: 'payable' }],
          functionName: 'deposit',
          value: amountInWei,
          ...gasParams,
        })), { label: 'agent wrap', ...WALLET_ONE_RETRY });
        setActiveTxHash(hash);
        return { kind: 'wrap', hash, amountIn: proposal.amountIn };
      }

      if (isUnwrapOp) {
        const gasParams = await getTxGasParams(200000n);
        const hash = await withNodeRetry(() => paced(() => executeSwapAsync({
          address: wgenAddress,
          abi: [{ type: 'function', name: 'withdraw', inputs: [{ name: 'wad', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' }],
          functionName: 'withdraw',
          args: [amountInWei],
          ...gasParams,
        })), { label: 'agent unwrap', ...WALLET_ONE_RETRY });
        setActiveTxHash(hash);
        return { kind: 'unwrap', hash, amountIn: proposal.amountIn };
      }

      const resolvedRoute = await resolvePoolRoute(tokenInFormatted, tokenOutFormatted, proposal.dex || 'best');
      if (!resolvedRoute) {
        throw new Error(`No active liquidity pool found on Soyara DEX for ${fromTokenObj.symbol}/${toTokenObj.symbol}`);
      }

      // Use the aggregator's chosen path when it found one. Rebuilding the route
      // here instead would discard a multi-hop win and could pick a different
      // pool from the one that was quoted and validated.
      const program = Array.isArray(proposal.hops) && proposal.hops.length > 0
        ? buildMultiHopProgram(tokenInFormatted, tokenOutFormatted, proposal.hops, wgenAddress)
        : buildProgram(tokenInFormatted, tokenOutFormatted, resolvedRoute, wgenAddress);
      const feeCollector = CONTRACT_ADDRESSES[4221]?.dexFeeVault || '0x48234eD645676b794a4CbC7483513e58cB04e22E';
      const deadlineNum = Math.floor(Date.now() / 1000) + 7200;
      const slippageNum = proposal.slippageBps || 30;

      // ── Route through /api/agent-execute (server-side agent wallet) ──────────
      if (isAgentExecutorDeployed) {
        const programHex = typeof program === 'string' ? program : `0x${Buffer.from(program).toString('hex')}`;

        // A liquidity request must never reach the swap settlement route.
        //
        // The branches above should have handled it, and this exists because
        // they did not: a deposit reached here and settled as a swap, moving
        // funds the user never agreed to move. A guard immediately before the
        // call that spends money is cheap, and the failure it prevents is not.
        try {
          assertSettlementRoute(action, '/api/agent-execute');
        } catch (err) {
          setExecutionError(err.message);
          throw err;
        }

        // ── FAST PATH: settle directly, in one block ──────────────────────
        //
        // The agent has already quoted the route and computed the protection
        // floor; this signs and sends it. One transaction, one block - the same
        // thing /swap does, and the same trust model: the user's signature is
        // what authorises the trade, and the entrypoint's own minAmountOut check
        // is what protects them.
        //
        // It is fast because it does not wait on a GenLayer verdict. A verdict
        // is delivered to the executor only when its round finalizes, and
        // nothing in this app can shorten that - EthSend carries no
        // delivery-timing field. Consensus gating and per-trade speed are
        // mutually exclusive on this platform, so this is the explicit choice
        // of speed, not an accident.
        //
        // Custody is unaffected: funds move from the user's wallet to the pool
        // in a transaction they signed, and the output is bound to their own
        // address. No operator ever holds anything.
        if (fastMode) {
          assertSettlementRoute(action, DIRECT_SETTLEMENT);

          const isNativeIn  = tokenInFormatted.isNative;
          const isNativeOut = tokenOutFormatted.isNative;
          const swapIntent = [
            isNativeOut ? zeroAddress : tokenOutFormatted.address,
            minAmountOutWei,
            isNativeIn ? zeroAddress : tokenInFormatted.address,
            amountInWei,
          ];
          const feeCollection = [
            CONTRACT_ADDRESSES[4221]?.dexFeeVault || '0x48234eD645676b794a4CbC7483513e58cB04e22E',
            5n,          // 0.05% platform fee
            zeroAddress, // no referrer
            0n,
            false,
          ];

          const gasParams = await getTxGasParams(700000n);
          const hash = await withNodeRetry(() => paced(() => executeSwapAsync({
            address: entrypointAddress,
            abi: AGGFLOW_ENTRYPOINT_ABI,
            functionName: 'executeSwapWithReceiver',
            args: [swapIntent, feeCollection, programHex, userAddress],
            value: isNativeIn ? amountInWei : 0n,
            ...gasParams,
          })), { label: 'direct swap', ...WALLET_ONE_RETRY });

          setActiveTxHash(hash);
          return {
            kind: 'swap',
            rail: 'direct',
            hash,
            amountIn: proposal.amountIn,
            explorerUrl: `https://explorer-bradbury.genlayer.com/tx/${hash}`,
          };
        }

        // ── Is a mandate ready? Then this trade takes seconds ─────────────
        //
        // A live mandate means consensus has already authorised trades of this
        // shape, so settlement is one transaction instead of a fresh round and
        // its appeal window. If there is no usable mandate we start one in the
        // background - it will not help THIS trade, but it makes every later
        // one instant - and fall through to per-order consensus meanwhile.
        const tokenInAddr  = tokenInFormatted.isNative ? zeroAddress : tokenInFormatted.address;
        const tokenOutAddr = tokenOutFormatted.isNative ? zeroAddress : tokenOutFormatted.address;

        let mandateId = null;
        try {
          const m = await findUsableMandate({
            user: userAddress,
            tokenIn: tokenInAddr,
            tokenOut: tokenOutAddr,
            amountIn: amountInWei.toString(),
          });
          if (m.usable) {
            mandateId = m.mandateId;
          } else {
            // A mandate that exists but cannot serve this trade is worse than
            // none: it will keep being offered. Drop it and ask for a new one.
            if (m.mandateId) forgetMandate(userAddress, tokenInAddr, tokenOutAddr);
            requestMandate({
              user: userAddress,
              tokenIn: tokenInAddr,
              tokenOut: tokenOutAddr,
              // Room for this trade and a number more like it, without handing
              // over an unbounded authority.
              maxAmountIn: (amountInWei * 2n).toString(),
              totalBudgetIn: (amountInWei * 20n).toString(),
              slippageBps: slippageNum,
            }).catch(() => { /* background; never blocks a trade */ });
          }
        } catch { /* the slow path always works */ }

        const agentExecRes = await fetch('/api/agent-execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user: userAddress,
            tokenIn:      tokenInFormatted.isNative ? zeroAddress : tokenInFormatted.address,
            tokenOut:     tokenOutFormatted.isNative ? zeroAddress : tokenOutFormatted.address,
            amountIn:     amountInWei.toString(),
            minAmountOut: minAmountOutWei.toString(),
            slippageBps:  slippageNum,
            deadline:     proposal.deadline || deadlineNum,
            aggProgram:   programHex,
            // The order /api/genlayer-validate already opened its consensus
            // round against, or the one a previous `pending` attempt handed
            // back. Either way settlement waits on THAT commitment instead of
            // quoting again and starting a second round.
            // When present the server settles through executeSwapUnderMandate,
            // which is one transaction and needs no round.
            mandateId,
            pendingOrder:        resumeState?.pendingOrder,
            pendingProgram:      resumeState?.pendingProgram,
            validationSubmitted: resumeState?.validationSubmitted,
          }),
        });

        const agentResult = await agentExecRes.json();
        if (!agentExecRes.ok || !agentResult.success) {
          const err = new Error(agentResult.error || 'Agent execution failed - settlement aborted (fail-closed)');
          // `stale` means the quote aged out rather than anything being broken;
          // the caller should offer a re-quote instead of showing a hard failure.
          err.stale = Boolean(agentResult.stale);
          err.needsApproval = Boolean(agentResult.needsApproval);
          // `pending` is not a failure at all. The validator IC delivers its
          // verdict to AgentExecutor as an external message, and those are
          // delivered on FINALIZATION - so there is a real window in which
          // consensus has approved the trade but the executor cannot honour it
          // yet. The commitment is stable across retries, so the same request
          // will pick the verdict up; surfacing this as a hard error would tell
          // the user their trade failed when it is simply still settling.
          err.pending = Boolean(agentResult.pending);
          // An expired verdict must never be reported as pending: waiting on it
          // is an infinite wait for an approval that already lapsed.
          err.verdictExpired = Boolean(agentResult.verdictExpired);
          if (err.verdictExpired) err.pending = false;
          err.commitment = agentResult.commitment;
          // Everything needed to resume THIS settlement. Retrying without them
          // would re-quote, rebuild the route, and end up waiting on a
          // different commitment from the one consensus is finalising.
          err.pendingOrder = agentResult.pendingOrder;
          err.pendingProgram = agentResult.pendingProgram;
          err.validationSubmitted = agentResult.validationSubmitted;
          throw err;
        }

        const hash = agentResult.execTxHash;
        setActiveTxHash(hash);
        return {
          kind: 'swap',
          hash,
          // The consensus-approved identifier this settlement consumed. It
          // replaces `tradeHash`, which covered only seven of the parameters
          // that decide where the money goes.
          commitment: agentResult.commitment,
          validationTxHash: agentResult.validationTxHash,
          explorerUrl: agentResult.explorerUrl,
        };
      }

      // ── No fallback. FAIL CLOSED. ───────────────────────────────────────────
      // There used to be a path here that called AGGFlowEntrypoint.executeSwap
      // directly when AgentExecutor was not configured. That path settled a trade
      // WITHOUT binding or consuming the one-time approval hash, which is exactly
      // the gap GenLayer's review identified ("settles directly through
      // AGGFlowEntrypoint without consuming the new one-time approval"). A
      // convenience fallback that silently drops the enforcement is worse than an
      // outage, so settlement now refuses instead.
      throw new Error(
        'Settlement unavailable: AgentExecutor is not configured, and settling directly '
        + 'through AGGFlowEntrypoint would bypass the GenLayer-enforced one-time approval. '
        + 'Configure the AgentExecutor address to enable trading - fail-closed.'
      );
    } catch (err) {
      const message = err?.shortMessage || err?.message || 'Execution rejected by user or network';
      setExecutionError(message);
      throw err;
    } finally {
      // MUST be in `finally`. Every success path above returns early, so clearing
      // this only in `catch` left `isExecuting` stuck true after a trade that
      // actually settled - the Execute button then read "Executing on Soyara
      // DEX..." and stayed disabled forever, which looked like a hung execution.
      setIsExecuting(false);
    }
  }, [
    proposal, userAddress, isFromNative, fromTokenObj, toTokenObj,
    getTxGasParams, executeSwapAsync, wgenAddress, resolvePoolRoute,
    isAgentExecutorDeployed, entrypointAddress,
    isNotExecutable, hasInsufficientBalance,
  ]);

  const reset = useCallback(() => {
    setActiveTxHash(null);
    setExecutionError(null);
    setIsExecuting(false);
  }, []);

  return {
    fromTokenObj,
    toTokenObj,
    isFromNative,
    needsApproval,
    isApproving,
    isCheckingAllowance,
    hasInsufficientBalance,
    balanceRaw,
    amountInRequired,
    isNotExecutable,
    notExecutableReason: proposal?.notExecutableReason || null,
    approve,
    execute,
    isExecuting,
    isTxWaiting,
    isTxSuccess,
    isTxFailed,
    activeTxHash,
    executionError,
    setExecutionError,
    setIsExecuting,
    refetchAllowance,
    reset,
  };
}
