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
// TWO RAILS, ONE PER TRADE
// ------------------------
// Every trade this route settles goes through AgentExecutor, and the executor
// needs an authority only the AgentValidator IC can write. /api/genlayer-validate
// decides which one a trade uses before any round is opened, and the caller
// passes that decision back as `rail`:
//
//   consensus  the order's own verdict. /api/genlayer-validate has built the
//              order and opened its round, and passes both here; this route
//              waits for the verdict to reach the executor and calls
//              `executeSwap`, which consumes it. One round per trade.
//   mandate    a mandate an earlier round issued covers this exact order.
//              This route re-checks that, then calls `executeSwapUnderMandate`
//              once. No round, no appeal window.
//
// A trade never falls from one rail to the other inside a request. If it could,
// the same intent might settle under the mandate now and again later when its
// own verdict landed.
//
// Called without an order it does the whole consensus rail itself: quote,
// build, validate, wait, settle. That path is kept so the route works
// standalone, but it is the slow one, because it starts a round the caller
// could have started earlier.
//
// FAIL-CLOSED: if any step fails, the entire settlement is aborted.

import { createPublicClient, createWalletClient, http, zeroAddress, keccak256 } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import AGENT_EXECUTOR_ABI from '../../abi/AgentExecutor.json';
import { CONTRACT_ADDRESSES } from '../../constants/addresses.js';
import { validateSwapOrder, finalizeRound } from '../../lib/genlayer.js';
import { leaseAgent } from '../../lib/agentPool.js';
import { buildSwapOrder, serialiseOrder, deserialiseOrder } from '../../lib/swapOrder.js';
import { obtainVerdict, isVerdictLive, readVerdictState, VERDICT_POLL_MS, VERDICT_WAIT_MS } from '../../lib/verdict.js';
import { findCoveringMandate, expectedOutUnderMandate, mandateMinAmountOut } from '../../lib/mandateCoverage.js';
import { recordSettled } from '../../lib/settlementBackend.js';
import { nativeInputReason } from '../../lib/nativeInput.js';
import { ensureSettlementKeeper } from '../../lib/settlementKeeper.js';

// Commitments this server is sending a settlement for right now. The browser
// queue and the settlement keeper can ask for the same trade at once.
const SETTLING = new Set();

// The server's own record learns the outcome, whoever asked for the settlement.
function recordServerSettlement(commitment, patch) {
  recordSettled(commitment, patch).catch(() => { /* the record is a convenience, never a blocker */ });
}

const V2_PAIR_ABI = [
  { name: 'getReserves', type: 'function', stateMutability: 'view', inputs: [],
    outputs: [{ type: 'uint112' }, { type: 'uint112' }, { type: 'uint32' }] },
  { name: 'token0', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
];

/** Revert names a mandate settlement can hit, and what each one means for the caller. */
const MANDATE_UNAVAILABLE = /NoMandate|MandateExpired|MandateRevoked|MandateAmountExceeded|MandateBudgetExceeded|RouteMismatch|FeeTooHigh|RouterNotApproved|NotCanonicalPool|FactoryNotSet/;
const PRICE_MOVED = /QuoteInconsistent|InsufficientAmountAfterFees|0x499c1728|INSUFFICIENT_OUTPUT/;

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
    // Which authority settles this trade, as /api/genlayer-validate decided.
    // Only an explicit 'mandate' takes the mandate rail; anything else is the
    // consensus rail, which is the one every older caller already used.
    rail: requestedRail,
    mandateId,
  } = req.body;

  ensureSettlementKeeper();
  const resuming = Boolean(pendingOrder && pendingProgram);
  const onMandateRail = requestedRail === 'mandate';

  if (onMandateRail && (!resuming || !mandateId)) {
    return res.status(400).json({
      success: false,
      error: 'The mandate rail needs the order it was checked against and the mandate id. Validate the trade again.',
    });
  }

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

    // Never pay for a trade. With native GEN in, AgentExecutor would take the
    // input from this relayer's transaction, not from the user's wallet.
    if (order.tokenIn === zeroAddress) {
      return res.status(400).json({ success: false, wrapFirst: true, error: nativeInputReason() });
    }

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
    //
    // Any funded account may finalize, so the relayer nudges. A sender lane is
    // leased only if this request actually opens a round (see `submit` below):
    // this route used to lease one on every call and never give it back, so a
    // handful of settle attempts parked every lane for its full TTL and
    // /api/genlayer-validate reported "all lanes are mid-round" to new trades.
    const nudge = (txHash) => finalizeRound(txHash, account);

    // ── NO ATTESTOR RAIL ─────────────────────────────────────────────────────
    //
    // There used to be a fast rail here: a quorum of attestors read the verdict
    // out of the IC as soon as the round was accepted and signed the same
    // commitment, so settlement did not have to wait out the appeal window.
    // It has been removed, along with the executor entry points that accepted
    // it.
    //
    // The reason is that nothing ON CHAIN tied an attestation to a verdict the
    // IC had really recorded. The check lived here, in this server. To the
    // executor, M signatures were simply a substitute for GenLayer consensus,
    // which is the one thing the executor exists to refuse. A guarantee that
    // depends on the honesty of the process asking for it is not a guarantee.
    //
    // So settlement now waits for the verdict to arrive as an external message
    // on finalization. That is slower, and it is the actual GenLayer guarantee.
    const settlementRail = 'consensus';

    // ── MANDATE RAIL: an authority an earlier consensus round issued ─────────
    //
    // One transaction, seconds, no round and no appeal window. It is not a
    // bypass: the mandate was written by recordMandate, which is onlyValidator,
    // so only a consensus round could have created it, and the executor checks
    // this trade against it - user, pair, direction, per-trade ceiling,
    // lifetime budget, fee and collector, router, and the route by hash - and
    // prices it itself from the pinned pool's live reserves.
    //
    // This branch never hands over to the consensus rail. Either the mandate
    // settles this trade, or the caller is told it cannot and validates again.
    if (onMandateRail) {
      const coverage = await findCoveringMandate({
        publicClient, executor: agentExecutorAddress, abi: AGENT_EXECUTOR_ABI,
        mandateIds: [mandateId], order, aggProgram,
      });
      if (!coverage.covered) {
        return res.status(409).json({
          success: false,
          rail: 'mandate',
          mandateUnavailable: true,
          mandateId,
          error:
            `This trade is no longer covered by its mandate (${String(coverage.reasons?.[0] || 'not covered').replace(/^0x[0-9a-fA-F]{8}: /, '')}). `
            + 'Nothing was sent. Validate it again to settle it against its own consensus verdict.',
        });
      }
      const m = coverage.mandate;

      // The floor the executor will accept, computed the way it computes it.
      let minAmountOut;
      try {
        const [reserves, token0] = await Promise.all([
          publicClient.readContract({ address: m.pool, abi: V2_PAIR_ABI, functionName: 'getReserves' }),
          publicClient.readContract({ address: m.pool, abi: V2_PAIR_ABI, functionName: 'token0' }),
        ]);
        const inIsToken0 = String(token0).toLowerCase() === String(order.tokenIn).toLowerCase();
        const expectedOut = expectedOutUnderMandate({
          amountIn: order.amountIn,
          feeBps: order.feeBps,
          reserveIn: inIsToken0 ? reserves[0] : reserves[1],
          reserveOut: inIsToken0 ? reserves[1] : reserves[0],
        });
        minAmountOut = mandateMinAmountOut({ order, mandate: m, expectedOut });
      } catch (e) {
        return res.status(503).json({
          success: false, rail: 'mandate',
          error: `The mandate's pool could not be read, so nothing was sent: ${e?.shortMessage || e?.message}`,
        });
      }

      const args = [mandateId, order.amountIn, minAmountOut, order.feeBps, aggProgram];

      // Simulate first. A revert here costs nothing and names the reason; a
      // revert on chain costs gas and says less.
      try {
        await publicClient.simulateContract({
          account, address: agentExecutorAddress, abi: AGENT_EXECUTOR_ABI,
          functionName: 'executeSwapUnderMandate', args,
        });
      } catch (e) {
        const why = `${e?.shortMessage || ''} ${e?.message || ''}`;
        if (PRICE_MOVED.test(why)) {
          return res.status(409).json({
            success: false, rail: 'mandate', stale: true, mandateId,
            error: 'The pool moved past your slippage tolerance since this trade was quoted. Nothing was sent. '
              + 'Request a fresh quote.',
          });
        }
        return res.status(409).json({
          success: false, rail: 'mandate', mandateUnavailable: MANDATE_UNAVAILABLE.test(why), mandateId,
          error: `The executor would refuse this trade under its mandate (${(e?.shortMessage || e?.message || 'reverted').slice(0, 200)}). `
            + 'Nothing was sent.',
        });
      }

      console.log(`[agent-execute] mandate ${mandateId.slice(0, 10)}... covers this order - settling now`);
      const execTxHash = await sendWithRetry(() => walletClient.writeContract({
        address: agentExecutorAddress,
        abi: AGENT_EXECUTOR_ABI,
        functionName: 'executeSwapUnderMandate',
        args,
      }), 'executeSwapUnderMandate');

      let receipt;
      try {
        receipt = await publicClient.waitForTransactionReceipt({ hash: execTxHash });
      } catch {
        // Sent, outcome unknown. Retrying could settle the trade twice, so the
        // caller is given the hash and told to look rather than to try again.
        return res.status(504).json({
          success: false, rail: 'mandate', sentUnconfirmed: true, execTxHash, mandateId,
          error: `The settlement transaction was sent but is not confirmed yet (${execTxHash}). Do not retry; `
            + 'check the transaction first.',
        });
      }

      if (receipt.status !== 'success') {
        return res.status(500).json({
          success: false, rail: 'mandate', execTxHash, mandateId,
          error: 'executeSwapUnderMandate reverted on chain. Nothing moved. Validate the trade again.',
        });
      }

      return res.status(200).json({
        success: true,
        rail: 'mandate',
        execTxHash,
        // Older clients read `hash` on this rail.
        hash: execTxHash,
        mandateId,
        blockNumber: receipt.blockNumber.toString(),
        minAmountOut: minAmountOut.toString(),
        explorerUrl: `https://explorer-bradbury.genlayer.com/tx/${execTxHash}`,
      });
    }

    const alreadyLive = await isVerdictLive({
      publicClient, executor: agentExecutorAddress, abi: AGENT_EXECUTOR_ABI, commitment,
    });

    // An EXPIRED verdict is not a pending one.
    //
    // The round already ran and its approval already lapsed, so waiting is
    // futile - and because the commitment is derived from the order's fields,
    // retrying rebuilds the same identifier and finds the same dead entry. The
    // only way forward is a fresh round, which needs a commitment that is not
    // already spent or stale.
    const vstate = await readVerdictState({
      publicClient, executor: agentExecutorAddress, abi: AGENT_EXECUTOR_ABI, commitment,
    });
    if (vstate.expired) {
      console.log(`[agent-execute] verdict for ${commitment.slice(0, 10)}... EXPIRED at ${vstate.expiry}; a fresh round is required`);
      return res.status(409).json({
        success: false,
        verdictExpired: true,
        error:
          'GenLayer approved this trade, but the approval expired before it was settled. '
          + 'Approvals are time-boxed so a verdict cannot be spent against a stale price. '
          + 'Request a fresh quote and run consensus again - nothing was spent.',
        commitment,
        expiredAt: vstate.expiry,
      });
    }

    let verdict;
    if (alreadyLive) {
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
        // A lane is held only while its round is in flight: GenLayer queues
        // rounds per sender, so reusing a lane mid-round collides. A round
        // that decided at once hands its lane straight back.
        submit: async () => {
          const lease = leaseAgent();
          try {
            const r = await validateSwapOrder({ ...order, aggProgram }, lease ? { account: lease.account } : {});
            if (lease) {
              if (r?.pending && r?.txHash) lease.markSubmitted(r.txHash);
              else lease.release();
            }
            return r;
          } catch (e) {
            lease?.release();
            throw e;
          }
        },
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

    // ── One settlement per trade ─────────────────────────────────────────────
    // The browser queue and the server keeper can both ask to settle the same
    // trade. The executor would refuse the second (CommitmentAlreadyUsed), but
    // that is a wasted, failed transaction. So: spent already means settled,
    // and a settlement already being sent from this server is not sent twice.
    const spent = await publicClient.readContract({
      address: agentExecutorAddress, abi: AGENT_EXECUTOR_ABI, functionName: 'commitmentUsed', args: [commitment],
    }).catch(() => false);
    if (spent) {
      return res.status(200).json({ success: true, alreadySettled: true, commitment, error: null });
    }
    const lockKey = String(commitment).toLowerCase();
    if (SETTLING.has(lockKey)) {
      return res.status(202).json({ success: false, pending: true, inFlight: true, commitment, error: 'This trade is being settled right now.' });
    }
    SETTLING.add(lockKey);
    try {

    // ── STEP 4: Settle ───────────────────────────────────────────────────────
    // AgentExecutor internally:
    //   1. Validates all params, including that keccak256(aggProgram) matches the
    //      approved routeHash and that minAmountOut sits in the slippage band
    //      below the validated quote
    //   2. Re-derives the commitment and consumes the verdict - reverts with
    //      NoConsensusVerdict if anything differs from what was approved
    //   3. Pulls tokenIn from the user, routes, and sends output straight to them
    //
    // There is no attestations argument any more: the executor already holds
    // the verdict, or the call reverts with NoConsensusVerdict.
    // No value, ever: the input comes from the user's wallet (checked above).
    const execTxHash = await sendWithRetry(() => walletClient.writeContract({
      address: agentExecutorAddress,
      abi: AGENT_EXECUTOR_ABI,
      functionName: 'executeSwap',
      args: [order, aggProgram],
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
    recordServerSettlement(commitment, { stage: 'settled', execTxHash, settledAt: Date.now() });

    return res.status(200).json({
      success: true,
      commitment,
      validationTxHash: verdict.validationTxHash,
      execTxHash,
      blockNumber: execReceipt.blockNumber.toString(),
      explorerUrl: `https://explorer-bradbury.genlayer.com/tx/${execTxHash}`,
      quotedAmountOut: order.quotedAmountOut.toString(),
      minAmountOut: order.minAmountOut.toString(),
      verifiedVia: { path: 'genlayer_consensus', commitment },
      // The authority this settlement consumed: the order's own single-use
      // verdict. The mandate rail returns earlier with rail 'mandate'.
      rail: settlementRail,
    });
    } finally {
      SETTLING.delete(lockKey);
    }

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
