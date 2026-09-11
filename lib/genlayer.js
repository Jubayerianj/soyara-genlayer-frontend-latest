import { createClient, chains } from 'genlayer-js';
import { createPublicClient, http, encodeFunctionData } from 'viem';
import { INTELLIGENT_CONTRACTS, CONTRACT_ADDRESSES } from '../constants/addresses.js';
import { TOKEN_LIST } from '../constants/tokens.js';

export const GENLAYER_CONFIG = {
  chainId: 4221,
  chainName: 'GenLayer Bradbury Testnet',
  rpcUrl: 'https://rpc-bradbury.genlayer.com',
  explorerUrl: 'https://explorer-bradbury.genlayer.com',
  // The only Intelligent Contract the settlement path answers to. The separate
  // LiquidityValidator contract authorises nothing and nothing here calls it.
  agentValidator: INTELLIGENT_CONTRACTS.agentValidator,
};

let cachedClient = null;

export function getGenLayerClient() {
  if (!cachedClient) {
    cachedClient = createClient({
      chain: chains.testnetBradbury,
    });
  }
  return cachedClient;
}

/**
 * Turn a decided (ACCEPTED+) receipt from a binding AgentValidator round
 * (validate_swap, validate_liquidity_v2_add / _remove, issue_trading_mandate)
 * into the standard validation-result shape used by _consensusRound and
 * checkSwapValidationStatus.
 */
// GenVM round outcomes where the network never REACHED a verdict. genlayer-js
// counts these as "decided states", so waitForTransactionReceipt({status:'ACCEPTED'})
// resolves on them and the receipt carries no `result` - which previously fell
// through to the generic branch below and got labelled "Rejected by GenLayer
// consensus". That is wrong and was the cause of trades being shown as rejected
// when the validator had actually approved them (or simply never voted):
// a round that ends without a majority is a NETWORK condition, not a verdict
// on the trade. These are retryable by submitting a fresh consensus round.
const UNDECIDED_STATUSES = ['UNDETERMINED', 'LEADER_TIMEOUT', 'VALIDATORS_TIMEOUT'];

/**
 * The round's lifecycle state, whichever spelling the SDK used.
 *
 * THIS IS NOT COSMETIC. genlayer-js returns a receipt whose keys are a MIX of
 * conventions - `resultName` and `txExecutionResultName` are camelCase, but the
 * round status is `status_name`:
 *
 *   { status: 7, status_name: 'FINALIZED', resultName: 'AGREE',
 *     txExecutionResultName: 'FINISHED_WITH_RETURN' }
 *
 * Every read here was `receipt.statusName`, which is undefined. The effects
 * were not subtle:
 *
 *   - `decided` (ACCEPTED || FINALIZED) was ALWAYS false, so a round that had
 *     genuinely reached consensus was never recognised as having done so;
 *   - `statusName` reached the UI as null, and ConsensusProgress maps a missing
 *     status to phase 1, "Waiting for validator selection". Past 90s that
 *     renders as "the round has not been picked up by a validator set yet".
 *
 * So the contract could approve every single round - it had approved 7 of 7 -
 * while the app insisted the network had never even activated them. Read both
 * spellings, and prefer whichever is present.
 */
export function roundStatusName(receipt) {
  return receipt?.status_name || receipt?.statusName || null;
}

function interpretValidationReceipt(receipt, ctx) {
  const { txHash, validatorAddress, action, tokenIn, tokenOut, amountInRaw, minAmountOutRaw, slippageBps, router, deadline } = ctx;

  const base = {
    proposalId: '',
    txHash,
    // The real GenVM lifecycle state (PENDING / PROPOSING / COMMITTING /
    // REVEALING / ACCEPTED / FINALIZED ...). Surfaced so the UI can show what
    // the round is actually doing instead of an opaque spinner.
    statusName: roundStatusName(receipt),
    executionResult: receipt?.txExecutionResultName || null,
    contractAddress: validatorAddress,
    contractName: 'AgentValidator (GenLayer IC)',
    network: GENLAYER_CONFIG.chainName,
    chainId: GENLAYER_CONFIG.chainId,
    timestamp: new Date().toISOString(),
  };

  // ── Round ended without a verdict → retryable, NOT a rejection ──────────
  if (UNDECIDED_STATUSES.includes(roundStatusName(receipt))) {
    return {
      ...base,
      success: true,
      approved: false, // still fail-closed: settlement stays blocked
      retryable: true,
      reason:
        `GenVM round ended as ${roundStatusName(receipt)} - the validator set did not reach a majority. ` +
        `This is a network condition, not a rejection of your trade. Submitting a fresh consensus round usually resolves it.`,
    };
  }

  // ── Genuine failures: the contract raised, or the tx was cancelled ──────
  if (receipt?.txExecutionResultName === 'FINISHED_WITH_ERROR' || roundStatusName(receipt) === 'CANCELED') {
    return {
      ...base,
      success: false,
      approved: false,
      reason: `GenLayer consensus failed: ${roundStatusName(receipt) || receipt?.txExecutionResultName} - failed closed`,
    };
  }

  // NOTE: `receipt.result` is the CONSENSUS VOTE enum (0 IDLE / 1 AGREE /
  // 2 DISAGREE / 3 TIMEOUT) - it is NOT the contract's return payload. A write
  // transaction's return value cannot be recovered from the receipt at all.
  // Reading `receipt.result.approved` therefore always yielded `undefined`,
  // which made every validation - including approved ones - report as rejected.
  //
  // Every binding method persists its verdict on-chain, and it is read back
  // with the `get_validation` view; see readVerdict(). This function
  // only classifies the round's consensus outcome.
  const status = roundStatusName(receipt);
  const decided = status === 'ACCEPTED' || status === 'FINALIZED';
  const ranToCompletion = receipt?.txExecutionResultName === 'FINISHED_WITH_RETURN';

  if (decided && ranToCompletion) {
    return {
      ...base,
      success: true,
      approved: false,      // caller must resolve the verdict via get_validation
      needsVerdictLookup: true,
      reason: 'Consensus reached - reading the recorded verdict.',
      details: action ? { action, tokenIn, tokenOut, amountInRaw: String(amountInRaw), minAmountOutRaw: String(minAmountOutRaw), slippageBps, router, deadline } : undefined,
    };
  }

  // Decided state but the contract did not run to completion - ambiguous, so
  // treat as retryable rather than asserting the validator rejected the trade.
  return {
    ...base,
    success: true,
    approved: false,
    retryable: true,
    reason: `GenVM round finished (${roundStatusName(receipt) || 'unknown status'}) without a usable result - retry to run a fresh round.`,
  };
}

/**
 * Turn a ConsensusMain submission revert into something a user can act on.
 *
 * A failed `addTransaction` is NOT a verdict - the proposal never reached the
 * validators at all - but it surfaced as a raw "EVM tx ... was reverted", which
 * reads exactly like a rejected trade. The important case is PendingQueueFull:
 * an Intelligent Contract may hold only so many unresolved consensus rounds, and
 * once stalled rounds fill that queue every new submission bounces until they
 * clear.
 */
/**
 * True when a write failed because the RPC node is throttling, not because the
 * transaction is bad.
 *
 * Bradbury returns `-32005 transaction gas rate limit exceeded: node is at
 * capacity, retry in ~Nms` with a `retryAfterMs` hint. The app used to surface
 * this as a flat "Request exceeds defined limit" with `retryable: false`, i.e.
 * as though the validator had refused the trade - when in fact the proposal was
 * never submitted at all. Throttling is per sender, so simply waiting (or using
 * another funded lane) clears it.
 */
export function parseRateLimit(err) {
  const text = `${err?.shortMessage || ''} ${err?.message || ''} ${err?.details || ''}`;
  if (!/-32005|gas rate limit|at capacity|exceeds defined limit|rate limit/i.test(text)) return null;
  const hinted = text.match(/retryAfterMs"?\s*:\s*(\d+)/) || text.match(/retry in ~?(\d+)\s*ms/i);
  return { retryAfterMs: hinted ? Math.min(10000, parseInt(hinted[1], 10)) : 1500 };
}

export async function describeSubmissionRevert(message) {
  const text = String(message || '');

  // A failed addTransaction reads like this, and carries only the tx hash -
  // the revert data is not in the message, so replay the call to recover it.
  const isSubmissionRevert = /consensus contract .* was reverted/i.test(text);
  if (!isSubmissionRevert) return null;

  const generic = {
    retryable: true,
    reason:
      'GenLayer did not accept the proposal for consensus, so no round ever started - '
      + 'your trade was neither validated nor rejected. This is a network-side condition; retry shortly.',
  };

  const hash = text.match(/0x[0-9a-fA-F]{64}/);
  if (!hash) return generic;

  try {
    const res = await fetch(GENLAYER_CONFIG.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionByHash', params: [hash[0]] }),
    });
    const { result: tx } = await res.json();
    if (!tx) return generic;

    const call = await fetch(GENLAYER_CONFIG.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'eth_call',
        params: [{ from: tx.from, to: tx.to, data: tx.input, value: tx.value }, tx.blockNumber || 'latest'],
      }),
    });
    const { error } = await call.json();
    const data = typeof error?.data === 'string' ? error.data : '';
    const selector = data.slice(0, 10).toLowerCase();

    // PendingQueueFull(address recipient, uint256 max): an Intelligent Contract
    // may hold only so many unresolved rounds. Once stalled rounds fill that
    // queue, every new submission bounces until they clear - nothing to do with
    // the trade itself.
    if (selector === '0xd48a82a3') {
      const max = data.length >= 138 ? parseInt(data.slice(-64), 16) : null;
      return {
        queueFull: true,
        retryable: true,
        reason:
          `GenLayer could not accept the proposal: the AgentValidator contract already has the maximum `
          + `number of unresolved consensus rounds queued${max ? ` (${max})` : ''}. This is a network backlog, `
          + `not a rejection - your trade was never validated or refused. Submissions resume once the stalled `
          + `rounds clear.`,
      };
    }
    if (selector === '0x0844056a') {
      return {
        retryable: true,
        reason:
          'GenLayer could not accept the proposal: an earlier round from the same sender is still at the '
          + 'head of the queue. A collision, not a rejection - retry shortly.',
      };
    }
    return generic;
  } catch {
    return generic;
  }
}

/**
 * Read a recorded validation verdict (instant view).
 *
 * This is how the app learns whether a binding round approved a trade,
 * since the write's return value is not recoverable from its receipt. It also
 * short-circuits repeat validations of identical parameters: once a verdict is
 * recorded, it is readable forever without another consensus round.
 */
export async function readValidationVerdict(proposalId) {
  if (!proposalId) return null;
  const client = getGenLayerClient();
  try {
    const v = await client.readContract({
      address: GENLAYER_CONFIG.agentValidator,
      functionName: 'get_validation',
      args: [proposalId],
    });
    if (!v || !v.found) return null;
    return { approved: Boolean(v.approved), reason: v.reason, proposalId };
  } catch (err) {
    console.warn('[genlayer] get_validation failed:', err?.shortMessage || err?.message);
    return null;
  }
}

/**
 * Submit a swap order for a full GenVM consensus round.
 *
 * This replaces `validateSwapProposal` for swaps. The difference is not the
 * plumbing but what crosses the boundary: the IC now receives the ROUTE PROGRAM
 * itself, the fee, the fee collector, the user and the quote, decodes the route,
 * checks every pool it touches against the V2/V3 factories, and re-derives the
 * output from live reserves. A quote the pools would not honour, or a route
 * through a contract the factories never deployed, is rejected here rather than
 * discovered at settlement.
 *
 * On approval the IC emits an external message to AgentExecutor.recordVerdict.
 * That message is delivered on FINALIZATION, so the verdict appears on chain a
 * while after this call returns - poll `isVerdictLive(commitment)` on the
 * executor rather than treating the receipt as permission to settle.
 *
 * @param {object} order   full settlement surface, including aggProgram
 * @param {object} options { account } - a leased pool lane for the write
 */
export async function validateSwapOrder(order, options = {}) {
  const client = getGenLayerClient();
  const validatorAddress = GENLAYER_CONFIG.agentValidator;

  const args = [
    String(order.user),
    String(order.tokenIn),
    String(order.tokenOut),
    String(order.amountIn),
    String(order.minAmountOut),
    String(order.quotedAmountOut),
    parseInt(order.slippageBps, 10),
    parseInt(order.deadline, 10),
    String(order.router),
    parseInt(order.feeBps, 10),
    String(order.feeCollector),
    String(order.aggProgram),
    parseInt(order.nonce, 10),
  ];

  return _consensusRound('validate_swap', args, options, 'SWAP', options.commitment);
}

/**
 * Ask consensus for a TRADING MANDATE: one round, then settlement in seconds.
 *
 * This is the round that buys the speed. A per-order verdict cannot be fast,
 * because it reaches the executor as an EVM-bound external message and those
 * are delivered on finalization - `EthSend` carries no delivery-timing field,
 * unlike `PostMessage`, so nothing an Intelligent Contract does can hurry it.
 * Paying that appeal window per trade is what made settlement feel broken.
 *
 * A mandate pays it once. The round verifies the pool against the V2 factory,
 * reads its live reserves, refuses an illiquid pool or an oversized cap, builds
 * the route program itself, and hands the executor a bounded authority. Every
 * trade under it is then a single EVM transaction.
 *
 * Issue this in the BACKGROUND - at wallet connect, or the moment a user shows
 * intent - so the wait is over before anyone asks to trade.
 */
export async function issueTradingMandate(m, options = {}) {
  const args = [
    String(m.user),
    String(m.tokenIn),
    String(m.tokenOut),
    String(m.maxAmountIn),
    String(m.totalBudgetIn),
    parseInt(m.maxSlippageBps, 10),
    parseInt(m.maxFeeBps, 10),
    String(m.feeCollector),
    String(m.router),
    parseInt(m.ttlSeconds, 10),
    parseInt(m.nonce, 10),
  ];

  return _consensusRound('issue_trading_mandate', args, options, 'MANDATE', options.commitment);
}

/**
 * Read back the verdict a round recorded, by commitment.
 *
 * This lookup is not optional plumbing. A GenLayer write's RETURN VALUE cannot
 * be recovered from its receipt - `receipt.result` is the consensus vote enum,
 * not the contract's payload - so a decided round tells you only that the
 * validators agreed, never what they agreed. Skipping this step is what made
 * approved trades surface in the UI as "Rejected by Validator", because
 * `approved` defaults to false and nothing ever resolved it.
 *
 * Returns null when no verdict is recorded yet, which is different from a
 * recorded rejection and must not be collapsed into one.
 */
export async function readVerdict(commitment) {
  if (!commitment) return null;
  const client = getGenLayerClient();
  try {
    const v = await client.readContract({
      address: GENLAYER_CONFIG.agentValidator,
      functionName: 'get_validation',
      args: [String(commitment)],
    });
    if (!v || !v.found) return null;
    return { approved: Boolean(v.approved), reason: v.reason || '' };
  } catch (err) {
    console.warn('[genlayer] get_validation failed:', err?.shortMessage || err?.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Finalization: per contract, in order, and only when it can succeed
// ---------------------------------------------------------------------------
//
// An Intelligent Contract delivers its verdict to AgentExecutor as an external
// message, and those are emitted on finalization only. Finalization is a call
// somebody has to make: on an idle contract nothing in the protocol makes it,
// so a round nobody finalizes produces a trade that can never settle, however
// cleanly consensus approved it.
//
// Two things about that call were wrong here, and together they stalled every
// trade behind them:
//
//   1. GenLayer finalizes a contract's rounds IN ORDER. A round cannot be
//      finalized while an older round to the same contract is unfinalized
//      (FinalizationNotAllowed). The app only ever nudged the round it was
//      waiting for, and the rounds most likely to sit at the head are the ones
//      nobody waits for - an undecided round, a preview, an abandoned run. One
//      undecided test round held the AgentValidator queue for six hours, and
//      every round behind it sat in READY_TO_FINALIZE with its verdict
//      undelivered.
//   2. It used finalizeIdlenessTxs, the remedy for rounds that stopped
//      progressing, for rounds that had simply finished.
//
// So the keeper drains the queue from its head: finalize each round that can
// be finalized, in order, with the call that fits its state, and stop at the
// first one that cannot yet (its appeal window is still open). Every call is
// simulated first, so nothing doomed is ever broadcast from the agent account,
// which is what used to eat its gas-rate budget and fail the user's own swaps
// with "node is at capacity".
export const GL_STATUS = Object.freeze({
  PENDING: 1, PROPOSING: 2, COMMITTING: 3, REVEALING: 4, ACCEPTED: 5, UNDETERMINED: 6,
  FINALIZED: 7, CANCELED: 8, APPEAL_REVEALING: 9, APPEAL_COMMITTING: 10,
  READY_TO_FINALIZE: 11, VALIDATORS_TIMEOUT: 12, LEADER_TIMEOUT: 13,
});
const FINALIZABLE = new Set([GL_STATUS.READY_TO_FINALIZE, GL_STATUS.UNDETERMINED, GL_STATUS.VALIDATORS_TIMEOUT, GL_STATUS.LEADER_TIMEOUT]);
const IN_FLIGHT = new Set([GL_STATUS.PENDING, GL_STATUS.PROPOSING, GL_STATUS.COMMITTING, GL_STATUS.REVEALING]);
/** A round still mid-vote after this long has stopped progressing. */
export const IDLE_AFTER_MS = 15 * 60 * 1000;
/** One drain per contract at a time, at most this often. */
const DRAIN_MIN_GAP_MS = 20 * 1000;
const _drains = new Map(); // recipient -> last drain start

export function _resetNudgeState() { _drains.clear(); } // tests only

/**
 * What the keeper does with the round at the head of a contract's queue.
 * @returns 'finalize' | 'finalize-idle' | 'wait'
 */
export function finalizationStep(status, createdAtSec, nowMs = Date.now()) {
  const s = Number(status);
  if (FINALIZABLE.has(s)) return 'finalize';
  if (IN_FLIGHT.has(s) && nowMs - Number(createdAtSec) * 1000 > IDLE_AFTER_MS) return 'finalize-idle';
  // ACCEPTED (appeal window still open), an appeal in progress, or a round
  // that is still voting: nothing to do yet, and nothing behind it can move.
  return 'wait';
}

let _glPublic = null;
function glPublicClient() {
  if (!_glPublic) {
    _glPublic = createPublicClient({
      chain: { id: 4221, name: 'GenLayer Bradbury', nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 }, rpcUrls: { default: { http: ['https://rpc-bradbury.genlayer.com'] } } },
      transport: http('https://rpc-bradbury.genlayer.com'),
    });
  }
  return _glPublic;
}

/**
 * Finalize a contract's decided rounds, oldest first, until one cannot be.
 *
 * @param {object} p
 * @param {object} p.account    any funded account; anyone may finalize
 * @param {string} [p.recipient] the contract whose queue to drain (the AgentValidator)
 * @param {number} [p.maxSteps]  cap on rounds finalized per call
 * @returns {{ finalized: Array<{txId, how}>, stoppedAt: string|null, reason: string, skipped?: boolean }}
 */
export async function drainFinalizationQueue({
  account,
  recipient = INTELLIGENT_CONTRACTS.agentValidator,
  maxSteps = 8,
  now = () => Date.now(),
  _pc = null,
  _client = null,
} = {}) {
  if (!account) return { finalized: [], stoppedAt: null, reason: 'no account' };
  const key = String(recipient).toLowerCase();
  if (now() - (_drains.get(key) || 0) < DRAIN_MIN_GAP_MS) {
    return { finalized: [], stoppedAt: null, reason: 'drained moments ago', skipped: true };
  }
  _drains.set(key, now());

  const { consensusDataContract: data, consensusMainContract: main } = chains.testnetBradbury;
  const pc = _pc || glPublicClient();
  const client = _client || getGenLayerClient();
  const read = (functionName, args) => pc.readContract({ address: data.address, abi: data.abi, functionName, args });
  const finalized = [];

  for (let step = 0; step < maxSteps; step += 1) {
    const [done, accepted] = await Promise.all([
      read('getLatestFinalizedTxCount', [recipient]),
      read('getLatestAcceptedTxCount', [recipient]),
    ]);
    if (BigInt(done) >= BigInt(accepted)) return { finalized, stoppedAt: null, reason: 'queue clear' };

    const [head] = await read('getLatestAcceptedTransactions', [recipient, BigInt(done), 1n]);
    if (!head) return { finalized, stoppedAt: null, reason: 'queue head unreadable' };

    const action = finalizationStep(head.status, head.createdTimestamp, now());
    if (action === 'wait') return { finalized, stoppedAt: head.txId, reason: `head round is status ${Number(head.status)}` };

    const functionName = action === 'finalize' ? 'finalizeTransaction' : 'finalizeIdlenessTxs';
    const args = action === 'finalize' ? [head.txId] : [[head.txId]];
    try {
      // Would it succeed? A refusal here costs nothing; a refused broadcast
      // costs the account's rate budget and shows up as a failure on chain.
      await pc.call({ account: account.address, to: main.address, data: encodeFunctionData({ abi: main.abi, functionName, args }) });
    } catch (err) {
      return { finalized, stoppedAt: head.txId, reason: `not finalizable yet (${err?.shortMessage || err?.message || 'refused'})` };
    }
    try {
      if (action === 'finalize') await client.finalizeTransaction({ account, txId: head.txId });
      else await client.finalizeIdlenessTxs({ account, txIds: [head.txId] });
      finalized.push({ txId: head.txId, how: functionName });
    } catch (err) {
      return { finalized, stoppedAt: head.txId, reason: err?.shortMessage || err?.message || 'finalize failed' };
    }
  }
  return { finalized, stoppedAt: null, reason: 'step limit' };
}

/** Measured on Bradbury (2026-09-11, two rounds): a round can be finalized 30 minutes after its last vote. */
export const FINALITY_WINDOW_MS = 30 * 60 * 1000;

const STATUS_NAME = Object.fromEntries(Object.entries(GL_STATUS).map(([k, v]) => [v, k]));

/**
 * Pure: when can `me` be finalized, given the round at the head of the queue.
 *
 * A round can be finalized once its own window has passed AND every older
 * round to the same contract has been finalized, so the answer is the later of
 * the two. A head that is still voting has no known end, and neither then does
 * anything behind it.
 */
export function estimateQueueWait({ me, head, ahead, now = Date.now() }) {
  const readyOf = (t) => {
    const s = Number(t?.status);
    if (s === GL_STATUS.READY_TO_FINALIZE) return now;
    const lastVote = Number(t?.lastVoteTimestamp) * 1000;
    const finished = [GL_STATUS.ACCEPTED, GL_STATUS.UNDETERMINED, GL_STATUS.VALIDATORS_TIMEOUT, GL_STATUS.LEADER_TIMEOUT].includes(s);
    return finished && lastVote > 0 ? lastVote + FINALITY_WINDOW_MS : null;
  };
  const own = readyOf(me);
  const front = ahead > 0 ? readyOf(head) : own;
  const readyAt = own == null || front == null ? null : Math.max(own, front, now);
  return {
    inQueue: true,
    ahead,
    status: STATUS_NAME[Number(me?.status)] || null,
    headStatus: ahead > 0 ? STATUS_NAME[Number(head?.status)] || null : null,
    readyAt,
  };
}

/**
 * Where a round stands in its contract's finalization queue, for the tracker:
 * how many older rounds must finalize first, and when its verdict can land.
 * A round not in the unfinalized part of the queue is either finalized already
 * or not yet accepted.
 */
export async function roundQueueStatus({ txHash, recipient = INTELLIGENT_CONTRACTS.agentValidator, now = Date.now(), _pc = null } = {}) {
  const { consensusDataContract: data } = chains.testnetBradbury;
  const pc = _pc || glPublicClient();
  const read = (functionName, args) => pc.readContract({ address: data.address, abi: data.abi, functionName, args });
  const [done, accepted] = await Promise.all([
    read('getLatestFinalizedTxCount', [recipient]),
    read('getLatestAcceptedTxCount', [recipient]),
  ]);
  const open = BigInt(accepted) - BigInt(done);
  const list = open > 0n ? await read('getLatestAcceptedTransactions', [recipient, BigInt(done), open > 50n ? 50n : open]) : [];
  const idx = list.findIndex((t) => String(t.txId).toLowerCase() === String(txHash).toLowerCase());
  if (idx < 0) return { inQueue: false, ahead: 0, status: null, headStatus: null, readyAt: null };
  return estimateQueueWait({ me: list[idx], head: list[0], ahead: idx, now });
}

/**
 * Push a decided round towards finalization - by draining its contract's
 * queue, since it cannot finalize ahead of older rounds.
 *
 * Safe to call as often as a caller likes: the drain gates itself, and it only
 * ever broadcasts a finalize the chain has just said will succeed.
 *
 * @param {string} txHash   the round the caller is waiting on
 * @param {object} account  any funded account; anyone may finalize
 * @returns true if this call finalized `txHash`
 */
export async function finalizeRound(txHash, account, _submittedAt = null) {
  if (!txHash || !account) return false;
  try {
    const r = await drainFinalizationQueue({ account });
    if (r.finalized.length) {
      console.log(`[genlayer] finalized ${r.finalized.length} round(s) in queue order${r.stoppedAt ? `; next is waiting (${r.reason})` : ''}`);
    }
    return r.finalized.some((f) => String(f.txId).toLowerCase() === String(txHash).toLowerCase());
  } catch (err) {
    console.warn('[genlayer] finalization drain failed:', err?.shortMessage || err?.message);
    return false;
  }
}

/**
 * Consensus round for a V2 add-liquidity operation.
 *
 * Liquidity used to settle through the agent's own `approveTrade(hash)` call,
 * with no consensus involvement at settlement at all. It now goes through the
 * same registry as swaps, and the IC additionally confirms that the pair being
 * deposited into is the one the Soyara V2 factory actually deployed.
 */
export async function validateLiquidityV2Add(op, options = {}) {
  return _liquidityRound('validate_liquidity_v2_add', [
    String(op.user), String(op.tokenA), String(op.tokenB),
    String(op.amountADesired), String(op.amountBDesired),
    String(op.amountAMin), String(op.amountBMin),
    parseInt(op.deadline, 10),
  ], options);
}

/**
 * Consensus round for a V2 remove-liquidity operation.
 *
 * The IC checks that `lpToken` IS the canonical pair for the two tokens, which
 * is the check that stops a real LP position being burned against a look-alike
 * contract.
 */
export async function validateLiquidityV2Remove(op, options = {}) {
  return _liquidityRound('validate_liquidity_v2_remove', [
    String(op.user), String(op.tokenA), String(op.tokenB),
    String(op.lpToken), String(op.lpAmount),
    String(op.amountAMin), String(op.amountBMin),
    parseInt(op.deadline, 10),
  ], options);
}

/*
 * There is no V3 liquidity round.
 *
 * AgentValidator's `validate_liquidity_v3_add` / `_remove` were removed when the
 * deployable build hit GenVM's per-block pubdata limit, and nothing on the
 * agent path settles a V3 position: the executor's V3 entry points need a
 * verdict only that validator could have recorded, so they fail closed. The
 * two wrappers that called those methods are gone with them - a call to a
 * method the deployed contract does not have is a round that runs and raises.
 * V3 positions are managed on the pools app.
 */

const _liquidityRound = (functionName, args, options) =>
  // The commitment has to travel with the round.
  //
  // Without it `_consensusRound` cannot do its two cheap wins - reuse a verdict
  // already on record, and read the verdict back once the round decides - and,
  // worse, it returns an empty `proposal_id`. The client then polls with nothing
  // to look the verdict up by, so a deposit that consensus had already approved
  // sat on "Consensus Pending" until the poll budget ran out and the UI froze
  // there. Swaps passed it; liquidity did not.
  _consensusRound(functionName, args, options, undefined, options?.commitment);

/**
 * Submit one binding consensus round and interpret its outcome.
 *
 * Shared by every binding validator entry point. The important part is what it
 * does with a SUBMISSION failure: an RPC throttle means the round never
 * started, which is not a rejection of the trade and must not be reported as
 * one. It comes back as `rateLimited`, which /api/genlayer-validate uses to
 * rotate to a different sender lane - waiting is the wrong remedy, because
 * Bradbury throttles per sender, so a throttled lane stays throttled however
 * long you wait while another funded lane submits immediately.
 */
async function _consensusRound(functionName, args, options, action = undefined, commitment = null) {
  const client = getGenLayerClient();
  const validatorAddress = GENLAYER_CONFIG.agentValidator;

  // Is there already a verdict for this exact commitment?
  //
  // The commitment is deterministic for a given intent, and the IC keeps its
  // verdicts, so a repeat of the same trade, a retry after a timeout, or a
  // second tab asking the same question all resolve to an identifier that has
  // already been decided. Paying for another consensus round in that case buys
  // nothing and costs the user the whole wait again.
  //
  // This is a plain read and returns in milliseconds.
  if (commitment) {
    const existing = await readVerdict(commitment);
    if (existing) {
      return {
        success: true,
        approved: existing.approved,
        pending: false,
        reason: existing.approved
          ? `${existing.reason} (verdict already on record, no new round needed)`
          : existing.reason,
        proposalId: commitment,
        reused: true,
        txHash: null,
        contractAddress: validatorAddress,
        contractName: 'AgentValidator (GenLayer IC)',
        network: GENLAYER_CONFIG.chainName,
        chainId: GENLAYER_CONFIG.chainId,
        timestamp: new Date().toISOString(),
      };
    }
  }

  let txHash;
  try {
    txHash = await client.writeContract({
      account: options.account,
      address: validatorAddress,
      functionName,
      args,
      value: 0n,
    });
  } catch (writeErr) {
    const submissionDetail = await describeSubmissionRevert(writeErr?.shortMessage || writeErr?.message);
    console.error(`AgentValidator.${functionName} submission failed (failing closed):`, writeErr);
    return {
      success: false,
      approved: false,
      ...submissionDetail,
      ...(parseRateLimit(writeErr) ? { retryable: true, rateLimited: true } : {}),
      reason:
        (parseRateLimit(writeErr)
          ? 'The GenLayer RPC node is at capacity and throttled the submission, so no consensus round started. '
            + 'Your trade was not validated or rejected - retry in a moment.'
          : null)
        || submissionDetail?.reason
        || writeErr?.shortMessage
        || writeErr?.message
        || 'GenLayer write transaction failed - consensus unavailable, failed closed',
      proposalId: '',
      contractAddress: validatorAddress,
      contractName: 'AgentValidator (GenLayer IC)',
      network: GENLAYER_CONFIG.chainName,
      chainId: GENLAYER_CONFIG.chainId,
      timestamp: new Date().toISOString(),
    };
  }

  try {
    // Wait briefly, then hand back the tx hash.
    //
    // Blocking here for the whole round meant the browser sat on one request
    // with nothing to render, so a 25 second consensus round looked like a hung
    // app. Returning early lets the client poll and show the round's real phase
    // (Activated, Proposed, Committed, Revealing, Accepted) as it happens. The
    // wait is the same length; the difference is that it is legible.
    const receipt = await client.waitForTransactionReceipt({
      hash: txHash, status: 'ACCEPTED', retries: 3, fullTransaction: true,
    });
    const interpreted = interpretValidationReceipt(receipt, { txHash, validatorAddress, action });

    // The round decided. Now find out WHAT it decided - see readVerdict.
    if (interpreted.needsVerdictLookup) {
      const verdict = await readVerdict(commitment);
      if (verdict) {
        return {
          ...interpreted,
          approved: verdict.approved,
          reason: verdict.reason || interpreted.reason,
          proposalId: commitment || interpreted.proposalId,
          txHash,
        };
      }
      // Decided but the verdict is not readable yet. That is a timing gap, not
      // a rejection, so it must come back as pending for the caller to poll.
      return {
        ...interpreted,
        pending: true,
        proposalId: commitment || interpreted.proposalId,
        reason: 'Consensus round decided; waiting for the recorded verdict to become readable.',
        txHash,
      };
    }

    return { ...interpreted, proposalId: commitment || interpreted.proposalId, txHash };
  } catch (err) {
    if (String(err?.message || '').includes('Timed out waiting')) {
      // The round is running; the caller polls the EXECUTOR for the verdict,
      // because acceptance is not yet authority - finalization is.
      return {
        success: true,
        approved: false,
        pending: true,
        txHash,
        proposalId: commitment || '',
        reason: 'Consensus round submitted and still running - poll for the verdict.',
        contractAddress: validatorAddress,
      };
    }
    throw err;
  }
}

/*
 * REMOVED: the legacy issueTradingMandate / checkTradeAgainstMandate pair.
 *
 * They targeted an older IC shape - tokens as a comma-joined string, a
 * maxTrades counter, and a `check_mandate` view the executor consulted through
 * the agent server. That design put the mandate check OFF chain: the server
 * asked the IC whether a trade was allowed and then settled on its own say-so,
 * which is precisely the "privileged settlement agent enforces the verdict"
 * shape the review rejected.
 *
 * The replacement inverts it. `issue_trading_mandate` (see above) emits
 * recordMandate to AgentExecutor over the IC's ghost, so the mandate lives ON
 * CHAIN and only a consensus round can create it. Per-trade checking is then
 * done by the executor itself in executeSwapUnderMandate - route by hash, fee,
 * collector, user, ceilings - and it prices the trade from live pool reserves
 * rather than asking anyone.
 *
 * Nothing calls these, and leaving them would leave a working path back to the
 * design the review turned down.
 */


/**
 * Unstick a consensus round that GenLayer validators never voted
 * on (status stays PENDING with txExecutionResult NOT_VOTED).
 *
 * These do not clear on their own, they accumulate against the agent account,
 * and once enough pile up new `addTransaction` calls start reverting at the
 * ConsensusMain contract - which surfaced in the UI as a bogus
 * "Rejected by Validator: transaction reverted" error. `finalizeIdlenessTxs`
 * is GenLayer's own public remedy for idle transactions (the same thing
 * `genlayer finalize-batch` does), so the app calls it itself instead of
 * requiring manual CLI intervention.
 *
 * @param {string} txHash    the stuck GenLayer transaction id
 * @param {object} account   the agent account (needed to sign the public call)
 */
export async function finalizeStuckValidation(txHash, account) {
  const client = getGenLayerClient();
  if (!account || typeof client.finalizeIdlenessTxs !== 'function') return { finalized: false };

  try {
    const evmTxHash = await client.finalizeIdlenessTxs({ account, txIds: [txHash] });
    console.log(`[genlayer] finalized idle validation tx ${txHash} (evm tx ${evmTxHash})`);
    return { finalized: true, evmTxHash };
  } catch (err) {
    console.error('[genlayer] finalizeIdlenessTxs failed:', err?.shortMessage || err?.message);
    return { finalized: false, error: err?.shortMessage || err?.message };
  }
}

/**
 * Poll for the outcome of a binding consensus round that previously
 * returned pending:true. Does a SHORT bounded wait (does not resubmit the
 * transaction) so callers can call this repeatedly from the UI without
 * creating more load on the network.
 */
export async function checkSwapValidationStatus(txHash, proposalId = null) {
  const client = getGenLayerClient();
  const validatorAddress = GENLAYER_CONFIG.agentValidator;

  try {
    // ── Cheap check first: is the verdict already recorded? ──────────────────
    // This is a poll, so it runs repeatedly. waitForTransactionReceipt blocks
    // for ~11s before giving up (retries x interval), which made each poll cost
    // far more than the sleep between polls - a finished round could sit
    // undetected for ten seconds. `get_validation` is a single view read, so
    // ask it directly and return the instant the verdict exists.
    if (proposalId) {
      const early = await readValidationVerdict(proposalId);
      if (early) {
        return {
          success: true,
          approved: early.approved,
          pending: false,
          reason: early.reason,
          proposalId,
          txHash,
          contractAddress: validatorAddress,
          contractName: 'AgentValidator (GenLayer IC)',
          network: GENLAYER_CONFIG.chainName,
          chainId: GENLAYER_CONFIG.chainId,
          timestamp: new Date().toISOString(),
        };
      }
    }

    const receipt = await client.waitForTransactionReceipt({
      hash: txHash,
      status: 'ACCEPTED',
      // One attempt only: this function is called on a polling loop, so a long
      // internal wait here just duplicates the caller's own cadence.
      retries: 1,
      // Without this the SDK returns a stripped receipt and statusName /
      // txExecutionResultName come back undefined, so the round looks unusable.
      fullTransaction: true,
    });
    const interpreted = interpretValidationReceipt(receipt, { txHash, validatorAddress });

    // The receipt cannot carry the contract's verdict, so read it back.
    if (interpreted.needsVerdictLookup) {
      if (proposalId) {
        // Re-read a few times before giving up.
        //
        // State can lag the round by a moment, and the caller's response to
        // "not readable" is to run an ENTIRE fresh consensus round - 60-120s to
        // recover from what is often a 1-2s lag. Liquidity felt far slower than
        // swaps largely because of this. A cheap view read is the right retry.
        for (let attempt = 0; attempt < 4; attempt += 1) {
          const verdict = await readValidationVerdict(proposalId);
          if (verdict) {
            return { ...interpreted, approved: verdict.approved, reason: verdict.reason, proposalId, needsVerdictLookup: false };
          }
          if (attempt < 3) await new Promise((r) => setTimeout(r, 1500));
        }
        return {
          ...interpreted,
          retryable: true,
          reason: 'Consensus reached but the contract recorded no verdict - the round failed closed. A fresh round is needed.',
        };
      }

      // Consensus SUCCEEDED but we have no proposal id to look the verdict up
      // with. That is a lookup gap on our side, not a verdict - returning it as
      // {approved:false, retryable:false} made the UI render a red "Rejected by
      // Validator" for a round the validators had just accepted. Anything that
      // reaches this branch must stay retryable.
      return {
        ...interpreted,
        retryable: true,
        reason:
          'Consensus reached, but this app could not read the verdict back - the proposal id was '
          + 'not carried through the poll. Your trade was NOT rejected. Re-checking resolves it.',
      };
    }
    return interpreted;
  } catch (err) {
    if (String(err?.message || '').includes('Timed out waiting')) {
      return {
        success: true,
        approved: false,
        pending: true,
        reason: 'Still awaiting GenVM consensus - not rejected, check back shortly.',
        proposalId: '',
        statusName: 'PENDING',
        txHash,
        contractAddress: validatorAddress,
        contractName: 'AgentValidator (GenLayer IC)',
        network: GENLAYER_CONFIG.chainName,
        chainId: GENLAYER_CONFIG.chainId,
        timestamp: new Date().toISOString(),
      };
    }
    console.error('checkSwapValidationStatus error (failing closed):', err);
    return {
      success: false,
      approved: false,
      reason: err?.shortMessage || err?.message || 'Status check failed - failed closed',
      proposalId: '',
      txHash,
      contractAddress: validatorAddress,
      contractName: 'AgentValidator (GenLayer IC)',
      network: GENLAYER_CONFIG.chainName,
      chainId: GENLAYER_CONFIG.chainId,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Normalize a token address or symbol into a 0x address
 */
export function resolveTokenAddress(tokenOrAddress) {
  if (!tokenOrAddress) return '0x0000000000000000000000000000000000000000';
  
  if (typeof tokenOrAddress === 'object') {
    if (tokenOrAddress.isNative) return '0x0000000000000000000000000000000000000000';
    return tokenOrAddress.address || '0x0000000000000000000000000000000000000000';
  }

  const str = String(tokenOrAddress).trim();
  if (str.startsWith('0x') && str.length === 42) {
    if (str.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
      return '0x0000000000000000000000000000000000000000';
    }
    return str;
  }

  // Symbol lookup
  const token = TOKEN_LIST[4221]?.find(
    (t) => t.symbol.toLowerCase() === str.toLowerCase() || t.name.toLowerCase() === str.toLowerCase()
  );

  if (token) {
    if (token.isNative) return '0x0000000000000000000000000000000000000000';
    return token.address;
  }

  return str;
}

/**
 * Liquidity validation for the pools app's V2 flow.
 *
 * Both operations go through a BINDING round on AgentValidator - the same
 * contract the executor takes verdicts from - over the exact operation the
 * settlement route will execute:
 *
 *   ADD_LIQUIDITY     -> validate_liquidity_v2_add
 *   REMOVE_LIQUIDITY  -> validate_liquidity_v2_remove
 *
 * V3 is refused, not simulated. AgentValidator has no V3 liquidity validator,
 * so no verdict can exist for a V3 mint or burn and AgentExecutor would refuse
 * one. This function used to answer V3 requests with a `readContract` against
 * the separate LiquidityValidator contract: a single-node simulation that
 * authorised nothing, presented as a consensus result. That is gone, and so is
 * every call to LiquidityValidator.
 *
 * The aggregator's agent surfaces never reach this: they hand liquidity to the
 * pools app before anything is quoted.
 */
export async function validateLiquidityProposal(proposal, options = {}) {
  const base = {
    success: false,
    approved: false,
    proposalId: '',
    contractAddress: GENLAYER_CONFIG.agentValidator,
    contractName: 'AgentValidator (GenLayer IC)',
    network: GENLAYER_CONFIG.chainName,
    chainId: GENLAYER_CONFIG.chainId,
    timestamp: new Date().toISOString(),
  };

  if (proposal.model === 'v3' || proposal.isV3) {
    return {
      ...base,
      unsupported: 'v3_liquidity',
      reason:
        'V3 liquidity is not validated or settled through the agent path: AgentValidator has no V3 liquidity '
        + 'validator, so the settlement contract could never honour one. Manage V3 positions on the pools app.',
    };
  }

  // Accept the swap-shaped field names too. The /a2a swarm describes every
  // action with tokenIn/tokenOut, so reading only tokenA/tokenB left both
  // undefined - and resolveTokenAddress(undefined) returns the zero address,
  // making the pair look like NATIVE/NATIVE.
  const tokenAIn = proposal.tokenA ?? proposal.token0 ?? proposal.tokenIn;
  const tokenBIn = proposal.tokenB ?? proposal.token1 ?? proposal.tokenOut;
  if (!tokenAIn || !tokenBIn) {
    return {
      ...base,
      reason: 'Liquidity proposal is missing its token pair (expected tokenA/tokenB, token0/token1, or tokenIn/tokenOut).',
    };
  }

  // Use the WRAPPED address for native on both sides of the flow.
  const WGEN = CONTRACT_ADDRESSES[4221]?.wgen || '0x315374AA9b5536037Cc1Efeea2439CCC0913A77e';
  const asErc20 = (t) => {
    const resolved = resolveTokenAddress(t);
    return (!resolved || resolved === '0x0000000000000000000000000000000000000000') ? WGEN : resolved;
  };
  const tokenA = asErc20(tokenAIn);
  const tokenB = asErc20(tokenBIn);
  const amountARaw = String(proposal.amountARaw ?? proposal.amountA ?? proposal.amountInRaw ?? '0');
  const amountBRaw = String(proposal.amountBRaw ?? proposal.amountB ?? proposal.minAmountOutRaw ?? '0');
  const slippageBps = Number(proposal.slippageBps ?? 30);
  const deadline = parseInt(proposal.deadline || (Math.floor(Date.now() / 1000) + 7200), 10);
  const amountAMin = proposal.amountAMin ?? String((BigInt(amountARaw || '0') * BigInt(10000 - slippageBps)) / 10000n);
  const amountBMin = proposal.amountBMin ?? String((BigInt(amountBRaw || '0') * BigInt(10000 - slippageBps)) / 10000n);

  if (proposal.action === 'REMOVE_LIQUIDITY') {
    return validateLiquidityV2Remove({
      user: proposal.user || '0x0000000000000000000000000000000000000000',
      tokenA,
      tokenB,
      lpToken: proposal.lpToken || proposal.pair || '0x0000000000000000000000000000000000000000',
      lpAmount: String(proposal.lpAmount || proposal.amountInRaw || '0'),
      amountAMin: String(proposal.minAmountA || amountAMin),
      amountBMin: String(proposal.minAmountB || amountBMin),
      deadline,
    }, options);
  }

  return validateLiquidityV2Add({
    user: proposal.user || '0x0000000000000000000000000000000000000000',
    tokenA,
    tokenB,
    amountADesired: amountARaw,
    amountBDesired: amountBRaw,
    amountAMin,
    amountBMin,
    deadline,
  }, options);
}
