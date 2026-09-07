// pages/api/agent-execute.js
//
// SERVER-SIDE AGENT SETTLEMENT ROUTE
// ==================================
// This route relays a swap that GenLayer consensus has already approved. It is
// no longer the thing that decides whether the trade may settle.
//
// WHAT CHANGED, AND WHY
// ---------------------
// This file used to BE the enforcement point. It read the verdict off the
// AgentValidator Intelligent Contract, decided it was satisfied, and then wrote
// its own approval into the executor with a privileged onlyAgent call:
//
//     approveTradeWithParams(user, tokenIn, tokenOut, amountIn, minOut, slippage, deadline)
//
// The executor learned nothing about GenLayer from that. Its only real gate was
// "is the caller the agent", so the root of trust was the private key in this
// server's environment and consensus was advisory. Three consequences followed:
//
//   1. Anyone holding AGENT_PRIVATE_KEY could approve and settle a trade
//      GenLayer had never seen.
//   2. The approval hash covered seven fields and left aggProgram, feeBps and
//      feeCollector free, so even a genuine approval could be executed down a
//      different route, or with a fee of the agent's choosing paid to an address
//      of the agent's choosing.
//   3. The re-quote ran AFTER the verdict and rewrote minAmountOut, so the
//      protection the user actually settled with was not the one consensus had
//      approved.
//
// All three are closed. The executor now accepts verdicts only from the
// AgentValidator IC (which reaches the EVM through its ghost contract, so
// msg.sender is the IC's address), the commitment spans the entire order, and
// the quote is settled at the value it was validated at.
//
// TWO WAYS IN
// -----------
// Normally /api/genlayer-validate has already built the order and started its
// consensus round, and passes both here. This route then only waits for the
// verdict to reach the executor and settles - one round per trade.
//
// Called without them it does the whole thing itself: quote, build, validate,
// wait, settle. That path is kept so the route works standalone, but it is the
// slow one, because it starts a round the caller could have started earlier.
//
// FAIL-CLOSED: if any step fails, the entire settlement is aborted.

import { createPublicClient, createWalletClient, http, zeroAddress, keccak256 } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import AGENT_EXECUTOR_ABI from '../../abi/AgentExecutor.json';
import { CONTRACT_ADDRESSES } from '../../constants/addresses.js';
import { validateSwapOrder, finalizeRound } from '../../lib/genlayer.js';
import { leaseAgent } from '../../lib/agentPool.js';
import { buildSwapOrder, serialiseOrder, deserialiseOrder } from '../../lib/swapOrder.js';
import { obtainVerdict, isVerdictLive, VERDICT_POLL_MS, VERDICT_WAIT_MS } from '../../lib/verdict.js';
import { gatherAttestations } from '../../lib/attest.js';

// GenLayer Bradbury Testnet chain config (chain ID 4221)
const genLayerBradbury = {
  id: 4221,
  name: 'GenLayer Bradbury Testnet',
  nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc-bradbury.genlayer.com'] },
    public:  { http: ['https://rpc-bradbury.genlayer.com'] },
  },
};

/**
 * Retry a write that the RPC node throttled.
 *
 * Bradbury replies `-32005 transaction gas rate limit exceeded: node is at
 * capacity, retry in ~Nms`. Settlement cannot rotate senders the way validation
 * can - AgentExecutor's onlyAgent modifier means these calls must come from an
 * authorised relayer - so waiting the hinted interval is the correct remedy
 * here. Without this the throttle surfaced mid-flow as a bare "Request exceeds
 * defined limit", which reads like a failed trade when nothing was submitted.
 */
async function sendWithRetry(fn, label) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      const text = `${err?.shortMessage || ''} ${err?.message || ''} ${err?.details || ''}`;
      const throttled = /-32005|gas rate limit|at capacity|exceeds defined limit/i.test(text);
      if (!throttled || attempt >= 4) throw err;
      const hint = text.match(/retryAfterMs"?\s*:\s*(\d+)/) || text.match(/retry in ~?(\d+)\s*ms/i);
      const wait = Math.min(8000, (hint ? parseInt(hint[1], 10) : 1500) + attempt * 500);
      console.warn(`[settlement] ${label} throttled by node, retrying in ${wait}ms (attempt ${attempt + 1}/5)`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const agentPrivateKey = process.env.AGENT_PRIVATE_KEY;

  // Resolve the executor from the SAME constant the client approves against.
  // Env vars are only read at server startup, so after a redeploy the browser
  // (which hot-reloads constants) would approve the new executor while this
  // route still pulled tokens with the old one. The user's allowance then sat
  // on a different contract and settlement failed inside the token's
  // transferFrom - surfacing as the token's SafeMath error,
  // "ds-math-sub-underflow", which looks like a routing/liquidity bug.
  const agentExecutorAddress = CONTRACT_ADDRESSES[4221]?.agentExecutor
    || process.env.AGENT_EXECUTOR_ADDRESS
    || process.env.NEXT_PUBLIC_AGENT_EXECUTOR_ADDRESS;

  if (!agentPrivateKey) {
    console.error('[agent-execute] AGENT_PRIVATE_KEY not set - settlement aborted (fail-closed)');
    return res.status(503).json({ success: false, error: 'Settlement agent not configured - fail-closed' });
  }

  if (!agentExecutorAddress || agentExecutorAddress === zeroAddress) {
    console.error('[agent-execute] AGENT_EXECUTOR_ADDRESS not set - settlement aborted (fail-closed)');
    return res.status(503).json({
      success: false,
      error: 'AgentExecutor not deployed - settlement blocked (fail-closed)',
    });
  }

  const {
    user,
    tokenIn,
    tokenOut,
    amountIn,
    minAmountOut,   // client's reference figure; the settled floor is derived live
    slippageBps,
    deadline,
    // Handed over by /api/genlayer-validate: the exact order its consensus round
    // was opened against. Sending them back is also how a caller resumes after a
    // `pending` response.
    pendingOrder,
    pendingProgram,
    // True when a round for this commitment has already been submitted, so this
    // route waits instead of opening a second one.
    validationSubmitted,
    // The round to finalize while waiting. Without it a resumed settlement can
    // only watch, and finalization is a call somebody has to make.
    validationTxHash,
  } = req.body;

  const resuming = Boolean(pendingOrder && pendingProgram);

  if (!resuming && (!user || !tokenIn || !tokenOut || !amountIn || slippageBps === undefined || !deadline)) {
    return res.status(400).json({ error: 'Missing required trade parameters' });
  }

  try {
    const pkHex = agentPrivateKey.startsWith('0x') ? agentPrivateKey : `0x${agentPrivateKey}`;
    const account = privateKeyToAccount(pkHex);

    const publicClient = createPublicClient({
      chain: genLayerBradbury,
      transport: http('https://rpc-bradbury.genlayer.com'),
    });
    const walletClient = createWalletClient({
      account,
      chain: genLayerBradbury,
      transport: http('https://rpc-bradbury.genlayer.com'),
    });

    // ── STEP 1: Resolve the order ────────────────────────────────────────────
    //
    // Taking the order back from the caller is safe precisely because of the
    // architecture this change is about: nothing in this process can authorise
    // a trade. A tampered order simply hashes to a commitment no verdict backs,
    // and the executor refuses it. The caller is holding a receipt, not a
    // permission.
    //
    // It also has to work this way. Re-quoting on a retry would rebuild the
    // route from current pools, and a route that moved by a single pool produces
    // a different commitment - so the verdict the previous attempt was waiting
    // for would be orphaned and the caller could poll forever.
    let order;
    let aggProgram;
    let commitment;

    if (resuming) {
      order = deserialiseOrder(pendingOrder);
      aggProgram = pendingProgram;

      if (order.routeHash.toLowerCase() !== keccak256(aggProgram).toLowerCase()) {
        return res.status(400).json({
          success: false,
          error: 'The supplied order does not match the routing program sent with it.',
        });
      }

      commitment = await publicClient.readContract({
        address: agentExecutorAddress,
        abi: AGENT_EXECUTOR_ABI,
        functionName: 'getSwapCommitment',
        args: [order],
      });
      console.log('[agent-execute] settling a pre-validated order, skipping re-quote');
    } else {
      const built = await buildSwapOrder({
        publicClient,
        executor: agentExecutorAddress,
        abi: AGENT_EXECUTOR_ABI,
        user, tokenIn, tokenOut, amountIn, slippageBps, deadline,
        expectedMinAmountOut: minAmountOut,
      });
      if (!built.ok) return res.status(built.status).json(built.body);
      ({ order, aggProgram, commitment } = built);
    }

    console.log(`[agent-execute] commitment ${commitment.slice(0, 10)}... user=${order.user}`);
    console.log(`[agent-execute] amountIn=${order.amountIn} quoted=${order.quotedAmountOut} minOut=${order.minAmountOut} slippage=${order.slippageBps}bps`);

    // ── STEP 2: Pre-flight allowance / balance check ─────────────────────────
    // AgentExecutor pulls tokenIn from the user with transferFrom. If the user
    // has not approved THIS executor (or is short on balance), the token's own
    // SafeMath reverts with "ds-math-sub-underflow" - an opaque message that
    // reads like a routing or liquidity bug. Check first and say plainly what is
    // wrong and which contract needs approving.
    if (order.tokenIn !== zeroAddress) {
      const erc20Abi = [
        { name: 'allowance', type: 'function', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }] },
        { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
      ];
      const [allowance, balance] = await Promise.all([
        publicClient.readContract({ address: order.tokenIn, abi: erc20Abi, functionName: 'allowance', args: [order.user, agentExecutorAddress] }),
        publicClient.readContract({ address: order.tokenIn, abi: erc20Abi, functionName: 'balanceOf', args: [order.user] }),
      ]);

      if (balance < order.amountIn) {
        return res.status(400).json({
          success: false,
          error: `Insufficient balance: wallet holds ${balance} but the trade needs ${order.amountIn} (raw units).`,
          needsApproval: false,
        });
      }
      if (allowance < order.amountIn) {
        return res.status(400).json({
          success: false,
          error: `Token approval missing for the settlement contract. Approve at least ${order.amountIn} (raw units) for AgentExecutor at ${agentExecutorAddress}, then execute again.`,
          needsApproval: true,
          spender: agentExecutorAddress,
        });
      }
    }

    // ── STEP 3: The consensus verdict ────────────────────────────────────────
    //
    // Ask the EXECUTOR, not the validator. The validator can only say what it
    // decided; the executor is what will enforce it, and between the two sits
    // the finalization delay - external messages from an IC are delivered on
    // finalization, never on acceptance.
    const lease = leaseAgent?.();
    const nudge = (txHash) => finalizeRound(txHash, lease?.account || account);

    // ── FAST RAIL ────────────────────────────────────────────────────────────
    //
    // Ask the attestors before settling in to wait.
    //
    // The consensus round decides in about twenty seconds; what takes forty
    // minutes is finalization, and the only reason settlement waits for it is
    // that the IC's verdict travels as an external message. The verdict itself
    // is readable from the IC as soon as the round is accepted, so if attestors
    // will vouch for it the executor can verify their quorum over the same
    // commitment and settle now.
    //
    // This never widens what may settle. gatherAttestations refuses unless the
    // IC has recorded an approval for this exact commitment, and the executor
    // still checks every parameter against it. The rail can also be switched off
    // on chain by setting the threshold to zero, in which case this falls
    // through to the consensus rail below.
    let attestations = [];
    let settlementRail = 'genlayer_consensus';

    const alreadyLive = await isVerdictLive({
      publicClient, executor: agentExecutorAddress, abi: AGENT_EXECUTOR_ABI, commitment,
    });

    if (!alreadyLive) {
      try {
        const att = await gatherAttestations(commitment);
        if (att.ok) {
          attestations = att.attestations;
          settlementRail = 'attestor_quorum';
          console.log(`[agent-execute] fast rail: ${att.attestors.length} attestations over ${commitment.slice(0, 10)}...`);
        } else if (att.status === 403) {
          // The IC recorded a REFUSAL. That is a verdict, and waiting will not
          // turn it into an approval.
          return res.status(403).json({
            success: false, notValidated: true, error: att.error, commitment,
          });
        }
      } catch (e) {
        console.warn('[agent-execute] attestation unavailable, falling back to the consensus rail:', e.message);
      }
    }

    let verdict;
    if (alreadyLive || attestations.length > 0) {
      verdict = { live: true, pending: false, rejected: false, reason: null, validationTxHash: validationTxHash || null };
    } else if (validationSubmitted) {
      // A round is already in flight for exactly this commitment. Opening a
      // second one would pay the multi-minute latency twice for one trade.
      //
      // Finalization still has to be driven, though: the round will sit in
      // `Accepted` until somebody calls it, and the verdict rides an external
      // message that is only emitted at that point.
      let live = await isVerdictLive({ publicClient, executor: agentExecutorAddress, abi: AGENT_EXECUTOR_ABI, commitment });
      const until = Date.now() + VERDICT_WAIT_MS;
      while (!live && Date.now() < until) {
        await new Promise((r) => setTimeout(r, VERDICT_POLL_MS));
        if (validationTxHash) { try { await nudge(validationTxHash); } catch { /* window open */ } }
        live = await isVerdictLive({ publicClient, executor: agentExecutorAddress, abi: AGENT_EXECUTOR_ABI, commitment });
      }
      verdict = { live, pending: !live, rejected: false, reason: null, validationTxHash: validationTxHash || null };
    } else {
      verdict = await obtainVerdict({
        publicClient,
        executor: agentExecutorAddress,
        abi: AGENT_EXECUTOR_ABI,
        commitment,
        submit: () => validateSwapOrder({ ...order, aggProgram }, lease ? { account: lease.account } : {}),
        finalize: nudge,
      });
    }

    if (verdict.rejected) {
      return res.status(403).json({
        success: false,
        notValidated: true,
        error: `GenLayer consensus rejected this trade: ${verdict.reason}`,
        commitment,
        validationTxHash: verdict.validationTxHash,
      });
    }

    if (!verdict.live) {
      // Not a rejection. The round is still working its way to finalization, and
      // the commitment is stable, so the same request will pick it up.
      return res.status(202).json({
        success: false,
        pending: true,
        error:
          'GenLayer consensus has not yet finalised a verdict for these exact parameters. '
          + 'The validator IC delivers its approval to the executor on finalization, which is '
          + 'still in progress - retry this request shortly.',
        commitment,
        validationTxHash: verdict.validationTxHash,
        // Send these back on the retry to resume THIS settlement rather than
        // starting a new one against a freshly quoted route.
        pendingOrder: serialiseOrder(order),
        pendingProgram: aggProgram,
        validationSubmitted: true,
      });
    }

    console.log(`[agent-execute] verdict live on executor for ${commitment.slice(0, 10)}...`);

    // ── STEP 4: Settle ───────────────────────────────────────────────────────
    // AgentExecutor internally:
    //   1. Validates all params, including that keccak256(aggProgram) matches the
    //      approved routeHash and that minAmountOut sits in the slippage band
    //      below the validated quote
    //   2. Re-derives the commitment and consumes the verdict - reverts with
    //      NoConsensusVerdict if anything differs from what was approved
    //   3. Pulls tokenIn from the user, routes, and sends output straight to them
    //
    // `attestations` is empty on the consensus rail (the executor already holds
    // the verdict) and carries the quorum on the fast rail.
    const isNative = order.tokenIn === zeroAddress;
    const execTxHash = await sendWithRetry(() => walletClient.writeContract({
      address: agentExecutorAddress,
      abi: AGENT_EXECUTOR_ABI,
      functionName: 'executeSwap',
      args: [order, aggProgram, attestations],
      value: isNative ? order.amountIn : 0n,
    }), 'executeSwap');

    console.log(`[agent-execute] executeSwap submitted: ${execTxHash}`);
    const execReceipt = await publicClient.waitForTransactionReceipt({ hash: execTxHash });

    if (execReceipt.status !== 'success') {
      return res.status(500).json({
        success: false,
        error: 'executeSwap transaction reverted - the settled parameters did not match the consensus verdict',
        execTxHash,
        commitment,
      });
    }

    console.log(`[agent-execute] Swap executed successfully in block ${execReceipt.blockNumber}`);

    return res.status(200).json({
      success: true,
      commitment,
      validationTxHash: verdict.validationTxHash,
      execTxHash,
      blockNumber: execReceipt.blockNumber.toString(),
      explorerUrl: `https://explorer-bradbury.genlayer.com/tx/${execTxHash}`,
      quotedAmountOut: order.quotedAmountOut.toString(),
      minAmountOut: order.minAmountOut.toString(),
      verifiedVia: { path: settlementRail, commitment },
      // Which road the verdict travelled. Both require a consensus approval
      // for this exact commitment; they differ only in how it reached the
      // executor, and therefore in how long it took.
      rail: settlementRail,
    });

  } catch (err) {
    console.error('[agent-execute] Settlement error (fail-closed):', err);

    let errorMessage = err?.shortMessage || err?.message || 'Settlement failed - fail-closed';
    if (errorMessage.includes('NoConsensusVerdict')) {
      errorMessage = 'No GenLayer verdict exists for these exact parameters - settlement refused (fail-closed).';
    } else if (errorMessage.includes('CommitmentAlreadyUsed')) {
      // Not a failure. The verdict was spent, which is what settling is.
      return res.status(200).json({
        success: true,
        alreadySettled: true,
        error: null,
        reason: 'This trade has already settled. A consensus verdict is single use, so a second attempt finds it spent.',
      });
    } else if (errorMessage.includes('VerdictExpired')) {
      errorMessage = 'The consensus verdict expired before settlement - request a fresh validation.';
    } else if (errorMessage.includes('RouteMismatch')) {
      errorMessage = 'The routing program does not match the route GenLayer approved.';
    } else if (errorMessage.includes('QuoteInconsistent')) {
      errorMessage = 'minAmountOut is not within the approved slippage band below the validated quote.';
    } else if (errorMessage.includes('FeeTooHigh')) {
      errorMessage = 'The order carries a fee above the on-chain cap.';
    } else if (errorMessage.includes('Unauthorized')) {
      errorMessage = 'Agent wallet is not an authorised relayer on AgentExecutor - check AGENT_PRIVATE_KEY.';
    } else if (errorMessage.includes('DeadlineExpired')) {
      errorMessage = 'Trade deadline has expired - request a new validation and retry.';
    } else if (errorMessage.includes('SlippageExceeded')) {
      errorMessage = 'Slippage exceeds the on-chain cap.';
    }

    return res.status(500).json({ success: false, error: errorMessage });
  }
}
