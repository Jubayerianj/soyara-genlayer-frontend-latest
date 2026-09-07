// pages/api/genlayer-validate.js
//
// Validation route - opens the BINDING consensus round for a swap.
//
// This used to run `validate_proposal`, an advisory round that populated the UI
// panel and authorised nothing, after which /api/agent-execute ran a SECOND
// round - the binding one - at settlement. On Bradbury that meant paying the
// multi-minute round latency twice for a single trade, and it meant the panel
// showed a verdict on something other than what would actually settle.
//
// For swaps this route now builds the exact order that will be settled and runs
// `validate_swap` over it. It returns that order, so /api/agent-execute can wait
// for the verdict and settle without starting anything new. One round per trade,
// and the thing the user was shown is the thing that settles.
//
// validate_swap is @gl.public.write, so it MUST go through writeContract +
// waitForTransactionReceipt to trigger Optimistic Democracy across validators.
//
// When AGENT_PRIVATE_KEY is set in .env.local, the server-side agent wallet
// signs the write transaction. If not set, falls back to read simulation
// (marked isSimulation=true - callers must NOT use simulations to gate settlement).

import { validateSwapOrder, validateLiquidityV2Add, validateLiquidityProposal, checkSwapValidationStatus, finalizeStuckValidation, GENLAYER_CONFIG } from '../../lib/genlayer.js';
import { leaseAgent, getKeeperAccount, poolStatus } from '../../lib/agentPool.js';
import { createPublicClient, http } from 'viem';
import AGENT_EXECUTOR_ABI from '../../abi/AgentExecutor.json';
import { CONTRACT_ADDRESSES } from '../../constants/addresses.js';
import { buildSwapOrder, serialiseOrder, normaliseSwapIntent } from '../../lib/swapOrder.js';
import { buildLiquidityV2AddOrder, serialiseLiquidityOrder } from '../../lib/liquidityOrder.js';

const genLayerBradbury = {
  id: 4221,
  name: 'GenLayer Bradbury Testnet',
  nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc-bradbury.genlayer.com'] },
    public:  { http: ['https://rpc-bradbury.genlayer.com'] },
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const proposal = req.body;

  if (!proposal) {
    return res.status(400).json({ error: 'Proposal payload is required' });
  }

  // Keeper account for public calls (finalising idle transactions).
  const agentAccount = getKeeperAccount();

  // ── Polling path: check status of an already-submitted validate_proposal tx ──
  // Used when a prior call returned pending:true. This does NOT resubmit a
  // transaction - it just re-checks the existing one, so polling repeatedly
  // never adds more load to the network.
  if (proposal.checkTxHash) {
    try {
      // proposalId lets the status check read the recorded verdict - a write's
      // return value is not recoverable from its receipt.
      let statusResult = await checkSwapValidationStatus(proposal.checkTxHash, proposal.proposalId || null);

      // Caller exhausted its poll budget and the round never got votes. Left
      // alone these idle txs pile up against the agent account and eventually
      // make new addTransaction calls revert at ConsensusMain (surfacing as a
      // bogus "Rejected by Validator"). Clear it, then report it as retryable.
      if (proposal.finalizeIfStuck && statusResult.pending && agentAccount) {
        const finalizeResult = await finalizeStuckValidation(proposal.checkTxHash, agentAccount);
        if (finalizeResult.finalized) {
          statusResult = {
            ...statusResult,
            pending: false,
            retryable: true,
            reason: 'GenVM validators never voted on this round, so it was cleared automatically. This is a network condition, not a rejection - run another round to continue.',
          };
        }
      }

      return res.status(200).json({
        approved:         Boolean(statusResult.approved),
        pending:          Boolean(statusResult.pending),
        retryable:        Boolean(statusResult.retryable),
        reason:           statusResult.reason,
        // Echo back the id the caller supplied when the status check itself
        // could not resolve one. Otherwise a poller that follows this response
        // loses the proposal id after the first poll and can never look the
        // verdict up - the round then reports "Consensus reached - reading the
        // recorded verdict" forever.
        proposal_id:      statusResult.proposalId || proposal.proposalId || '',
        genlayer_contract: statusResult.contractAddress,
        contract_name:    statusResult.contractName,
        network:          statusResult.network,
        chainId:          statusResult.chainId,
        timestamp:        statusResult.timestamp,
        tx_hash:          statusResult.txHash || proposal.checkTxHash,
        // Real GenVM lifecycle phase, so the UI can show what the round is
        // actually doing instead of an unexplained spinner.
        statusName:       statusResult.statusName || null,
        consensus_mode:   'Optimistic Democracy (GenVM write tx)',
        is_write_flow:    true,
        live_execution:   Boolean(statusResult.success),
      });
    } catch (error) {
      console.error('API /genlayer-validate status-check error (failing closed):', error);
      return res.status(503).json({ approved: false, pending: true, reason: 'Status check unavailable - try again shortly' });
    }
  }

  const action = (proposal.action || 'SWAP').toUpperCase();
  const isV2Liquidity = action === 'ADD_LIQUIDITY' && proposal.model !== 'v3' && !proposal.isV3;

  if (!['SWAP', 'ADD_LIQUIDITY', 'REMOVE_LIQUIDITY'].includes(action)) {
    return res.status(400).json({
      approved: false,
      reason: `Unsupported action '${action}'. Allowed: SWAP, ADD_LIQUIDITY, REMOVE_LIQUIDITY`,
    });
  }

  // ── Reserve a sender lane ───────────────────────────────────────────────
  // GenLayer serialises consensus rounds per sender, so two rounds signed by
  // the same key collide and the second reverts. Each in-flight round gets its
  // own account from the pool.
  let lease = leaseAgent();

  if (!lease) {
    const status = poolStatus();
    if (status.total === 0) {
      console.warn('[genlayer-validate] no agent keys configured - falling back to read simulation');
    } else {
      // Every lane is mid-round. This is congestion, not a rejection.
      return res.status(200).json({
        approved: false,
        pending: true,
        reason: `All ${status.total} validation lanes are mid-round. This is queue congestion, not a rejection - retrying shortly will go through.`,
        proposal_id: '',
        genlayer_contract: GENLAYER_CONFIG.agentValidator,
        contract_name: 'AgentValidator (GenLayer IC)',
        network: GENLAYER_CONFIG.chainName,
        chainId: GENLAYER_CONFIG.chainId,
        timestamp: new Date().toISOString(),
        consensus_mode: 'Optimistic Democracy (GenVM write tx)',
        is_write_flow: true,
        live_execution: false,
      });
    }
  }

  // Pass the leased account so genlayer.js uses the consensus WRITE flow
  // (writeContract + waitForTransactionReceipt). Without it, it falls back to
  // readContract (simulation only, which does not satisfy the consensus gate).
  const options = lease ? { account: lease.account } : {};

  try {
    let validationResult;

    // The RPC node throttles PER SENDER, so a lane that is at capacity stays at
    // capacity no matter how long we wait - while another funded lane submits
    // instantly. Waiting is the wrong remedy; rotating is. Try successive lanes
    // before reporting a throttle to the user.
    // For a swap, build the order the settlement will use and validate THAT.
    // Everything downstream - the commitment, the verdict, the executor's checks
    // - is derived from this object, so it has to be built once and carried
    // through rather than reconstructed later from the same inputs.
    let swapOrder = null;
    let swapProgram = null;
    let swapCommitment = null;

    if (action === 'SWAP') {
      const executorAddress = CONTRACT_ADDRESSES[4221]?.agentExecutor;
      if (!executorAddress) {
        return res.status(503).json({
          approved: false,
          reason: 'AgentExecutor is not configured, so no commitment can be derived - failed closed.',
          proposal_id: '',
        });
      }

      const publicClient = createPublicClient({
        chain: genLayerBradbury,
        transport: http('https://rpc-bradbury.genlayer.com'),
      });

      // A proposal arrives loosely typed - tokens as symbols, amounts as
      // human-readable strings. Normalise strictly before anything reaches the
      // commitment: on this path a mis-parsed amount would not just misreport a
      // number, it would mint a consensus verdict for a trade the user never
      // asked for.
      const intent = normaliseSwapIntent(proposal);
      if (!intent.ok) {
        if (lease) lease.release();
        return res.status(400).json({ approved: false, reason: intent.error, proposal_id: '' });
      }

      const built = await buildSwapOrder({
        publicClient,
        executor: executorAddress,
        abi: AGENT_EXECUTOR_ABI,
        user:        intent.user,
        tokenIn:     intent.tokenIn,
        tokenOut:    intent.tokenOut,
        amountIn:    intent.amountIn,
        slippageBps: intent.slippageBps,
        deadline:    intent.deadline,
        expectedMinAmountOut: intent.expectedMinAmountOut,
      });

      if (!built.ok) {
        if (lease) lease.release();
        return res.status(built.status).json({
          approved: false,
          reason: built.body.error,
          proposal_id: '',
          ...built.body,
        });
      }

      swapOrder = built.order;
      swapProgram = built.aggProgram;
      swapCommitment = built.commitment;
    }

    // A V2 deposit is built here for the same reason a swap is: the amounts that
    // settle are the typed amounts REDUCED TO THE POOL RATIO, not the typed
    // amounts. Validating one set and settling the other produces two different
    // commitments and a verdict that fits neither.
    //
    // It also has to go to `validate_liquidity_v2_add`. The old path called
    // `validate_proposal`, which no longer exists on the validator, so every
    // deposit came back as "consensus failed: ACCEPTED" - the round ran and the
    // contract raised on a missing method.
    let liquidityOrder = null;
    if (isV2Liquidity) {
      const executorAddress = CONTRACT_ADDRESSES[4221]?.agentExecutor;
      const publicClient = createPublicClient({
        chain: genLayerBradbury,
        transport: http('https://rpc-bradbury.genlayer.com'),
      });
      const built = await buildLiquidityV2AddOrder({
        publicClient,
        executor: executorAddress,
        abi: AGENT_EXECUTOR_ABI,
        user: proposal.user,
        // Prefer the explicit address fields. `tokenA` is often a SYMBOL.
        tokenA: proposal.tokenAAddress ?? proposal.tokenA ?? proposal.token0 ?? proposal.tokenIn,
        tokenB: proposal.tokenBAddress ?? proposal.tokenB ?? proposal.token1 ?? proposal.tokenOut,
        // Raw and human amounts are kept apart on purpose. Collapsing them with
        // ?? meant a human "10" was read as ten WEI, and "10.0" threw.
        rawA: proposal.amountARaw ?? proposal.amount0Desired ?? proposal.amountInRaw ?? null,
        rawB: proposal.amountBRaw ?? proposal.amount1Desired ?? proposal.minAmountOutRaw ?? null,
        amountADesired: proposal.amountA ?? null,
        amountBDesired: proposal.amountB ?? null,
        slippageBps: proposal.slippageBps ?? 30,
        deadline: proposal.deadline || (Math.floor(Date.now() / 1000) + 7200),
      });
      if (!built.ok) {
        if (lease) lease.release();
        return res.status(built.status).json({ approved: false, reason: built.body.error, proposal_id: '' });
      }
      liquidityOrder = built.order;
      swapCommitment = built.commitment;
    }

    const run = (opts) => {
      if (action === 'SWAP') {
        return validateSwapOrder({ ...swapOrder, aggProgram: swapProgram }, { ...opts, commitment: swapCommitment });
      }
      if (isV2Liquidity) {
        return validateLiquidityV2Add(liquidityOrder, { ...opts, commitment: swapCommitment });
      }
      return validateLiquidityProposal(proposal, opts);
    };

    let currentLease = lease;
    let opts = options;
    const triedLeases = [];

    for (let attempt = 0; ; attempt += 1) {
      validationResult = await run(opts);
      if (!validationResult.rateLimited || attempt >= 3) break;

      // This lane is throttled - hand it back and take a different one.
      if (currentLease) triedLeases.push(currentLease);
      const nextLease = leaseAgent();
      if (!nextLease || (currentLease && nextLease.account?.address === currentLease.account?.address)) {
        if (nextLease && nextLease !== currentLease) nextLease.release();
        break; // no distinct lane free - report the throttle honestly
      }
      console.warn(`[genlayer-validate] lane ${currentLease?.account?.address?.slice(0, 10)} throttled, rotating to ${nextLease.account.address.slice(0, 10)}`);
      currentLease = nextLease;
      opts = { account: nextLease.account };
    }

    // Release every lane we tried and did not keep.
    for (const l of triedLeases) { try { l.release(); } catch { /* already released */ } }
    lease = currentLease;

    // Keep the lane reserved only while its round is genuinely in flight;
    // a decided round frees it immediately for the next request.
    if (lease) {
      if (validationResult.pending && validationResult.txHash) lease.markSubmitted(validationResult.txHash);
      else lease.release();
    }

    // FAIL CLOSED: if consensus fails, approved must be false
    const approved = Boolean(validationResult.approved);

    return res.status(200).json({
      approved,
      pending:          Boolean(validationResult.pending),
      retryable:        Boolean(validationResult.retryable),
      reason:           validationResult.reason,
      proposal_id:      validationResult.proposalId || '',
      genlayer_contract: validationResult.contractAddress,
      contract_name:    validationResult.contractName,
      network:          validationResult.network,
      chainId:          validationResult.chainId,
      timestamp:        validationResult.timestamp,
      tx_hash:          validationResult.txHash || null,
      statusName:       validationResult.statusName || null,
      queue_full:       Boolean(validationResult.queueFull),
      rate_limited:     Boolean(validationResult.rateLimited),
      // The round decided but its verdict has not been read back yet. Callers
      // must treat this as pending: a GenLayer write's return value is not in
      // its receipt, so `approved` is false here only because nothing has
      // resolved it, never because the validators refused the trade.
      needs_verdict_lookup: Boolean(validationResult.needsVerdictLookup),
      via_mandate:      Boolean(validationResult.viaMandate),
      consensus_mode:   validationResult.viaMandate
        ? 'Mandate (pre-approved by GenVM consensus - instant view check)'
        : validationResult.isSimulation
        ? 'Read simulation (no consensus - not write flow)'
        : 'Optimistic Democracy (GenVM write tx)',
      is_write_flow:    !validationResult.isSimulation,
      live_execution:   Boolean(validationResult.success),
      details:          validationResult.details || null,

      // The settlement handoff. /api/agent-execute takes these back verbatim and
      // waits for the verdict on this exact commitment instead of quoting again
      // and opening a second round. Passing them is safe because nothing in the
      // settlement route can authorise a trade: a tampered order hashes to a
      // commitment no verdict backs, and the executor refuses it.
      commitment:           swapCommitment,
      pendingOrder:         swapOrder ? serialiseOrder(swapOrder)
                            : liquidityOrder ? serialiseLiquidityOrder(liquidityOrder) : null,
      orderKind:            swapOrder ? 'swap' : liquidityOrder ? 'v2_add' : null,
      pendingProgram:       swapProgram,
      validationSubmitted:  action === 'SWAP' && Boolean(validationResult.txHash),
      quoted_amount_out:    swapOrder ? swapOrder.quotedAmountOut.toString() : null,
      min_amount_out:       swapOrder ? swapOrder.minAmountOut.toString() : null,
    });
  } catch (error) {
    console.error('API /genlayer-validate error (failing closed):', error);
    if (lease) lease.release();

    // FAIL CLOSED: Never return approved=true when consensus is unavailable
    return res.status(503).json({
      approved:         false,
      reason:           'Consensus unavailable - failed closed',
      proposal_id:      '',
      genlayer_contract: action === 'SWAP' ? GENLAYER_CONFIG.agentValidator : GENLAYER_CONFIG.liquidityValidator,
      contract_name:    action === 'SWAP' ? 'AgentValidator (GenLayer IC)' : 'LiquidityValidator (GenLayer IC)',
      network:          GENLAYER_CONFIG.chainName,
      chainId:          GENLAYER_CONFIG.chainId,
      timestamp:        new Date().toISOString(),
      consensus_mode:   'Optimistic Democracy (GenVM)',
      is_write_flow:    false,
      live_execution:   false,
    });
  }
}
