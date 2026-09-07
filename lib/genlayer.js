import { createClient, chains } from 'genlayer-js';
import { INTELLIGENT_CONTRACTS, CONTRACT_ADDRESSES } from '../constants/addresses.js';
import { TOKEN_LIST, findTokenByAddress } from '../constants/tokens.js';

export const GENLAYER_CONFIG = {
  chainId: 4221,
  chainName: 'GenLayer Bradbury Testnet',
  rpcUrl: 'https://rpc-bradbury.genlayer.com',
  explorerUrl: 'https://explorer-bradbury.genlayer.com',
  agentValidator: INTELLIGENT_CONTRACTS.agentValidator,
  liquidityValidator: INTELLIGENT_CONTRACTS.liquidityValidator,
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
 * Turn a decided (ACCEPTED+) transaction receipt from AgentValidator.validate_proposal
 * into the standard validation-result shape used by validateSwapProposal and
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

function interpretValidationReceipt(receipt, ctx) {
  const { txHash, validatorAddress, action, tokenIn, tokenOut, amountInRaw, minAmountOutRaw, slippageBps, router, deadline } = ctx;

  const base = {
    proposalId: '',
    txHash,
    // The real GenVM lifecycle state (PENDING / PROPOSING / COMMITTING /
    // REVEALING / ACCEPTED / FINALIZED ...). Surfaced so the UI can show what
    // the round is actually doing instead of an opaque spinner.
    statusName: receipt?.statusName || null,
    executionResult: receipt?.txExecutionResultName || null,
    contractAddress: validatorAddress,
    contractName: 'AgentValidator (GenLayer IC)',
    network: GENLAYER_CONFIG.chainName,
    chainId: GENLAYER_CONFIG.chainId,
    timestamp: new Date().toISOString(),
  };

  // ── Round ended without a verdict → retryable, NOT a rejection ──────────
  if (UNDECIDED_STATUSES.includes(receipt?.statusName)) {
    return {
      ...base,
      success: true,
      approved: false, // still fail-closed: settlement stays blocked
      retryable: true,
      reason:
        `GenVM round ended as ${receipt.statusName} - the validator set did not reach a majority. ` +
        `This is a network condition, not a rejection of your trade. Submitting a fresh consensus round usually resolves it.`,
    };
  }

  // ── Genuine failures: the contract raised, or the tx was cancelled ──────
  if (receipt?.txExecutionResultName === 'FINISHED_WITH_ERROR' || receipt?.statusName === 'CANCELED') {
    return {
      ...base,
      success: false,
      approved: false,
      reason: `GenLayer consensus failed: ${receipt?.statusName || receipt?.txExecutionResultName} - failed closed`,
    };
  }

  // NOTE: `receipt.result` is the CONSENSUS VOTE enum (0 IDLE / 1 AGREE /
  // 2 DISAGREE / 3 TIMEOUT) - it is NOT the contract's return payload. A write
  // transaction's return value cannot be recovered from the receipt at all.
  // Reading `receipt.result.approved` therefore always yielded `undefined`,
  // which made every validation - including approved ones - report as rejected.
  //
  // The verdict is now persisted on-chain by validate_proposal and read back
  // with the `get_validation` view; see readValidationVerdict(). This function
  // only classifies the round's consensus outcome.
  const decided = receipt?.statusName === 'ACCEPTED' || receipt?.statusName === 'FINALIZED';
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
    reason: `GenVM round finished (${receipt?.statusName || 'unknown status'}) without a usable result - retry to run a fresh round.`,
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
 * This is how the app learns whether `validate_proposal` approved a trade,
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

/** The proposal_id the contract will assign to these exact parameters (view). */
export async function computeProposalId(args) {
  const client = getGenLayerClient();
  try {
    return await client.readContract({
      address: GENLAYER_CONFIG.agentValidator,
      functionName: 'compute_proposal_id',
      args: [args.action, args.tokenIn, args.tokenOut, String(args.amountIn), String(args.minAmountOut), parseInt(args.slippageBps, 10), parseInt(args.deadline, 10)],
    });
  } catch (err) {
    console.warn('[genlayer] compute_proposal_id failed:', err?.shortMessage || err?.message);
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

/**
 * Push a decided consensus round towards finalization.
 *
 * This is not housekeeping, it is part of the settlement path. An Intelligent
 * Contract delivers its verdict to AgentExecutor as an external message, and
 * external messages are emitted on finalization only. Finalization is a call
 * that somebody has to make, so a round nobody finalizes produces a trade that
 * can never settle, however cleanly consensus approved it.
 *
 * Safe to call repeatedly: it does nothing until the appeal window has elapsed.
 *
 * @param {string} txHash   the consensus round to finalize
 * @param {object} account  any funded account; anyone may finalize
 */
export async function finalizeRound(txHash, account) {
  const client = getGenLayerClient();
  if (!txHash || !account || typeof client.finalizeIdlenessTxs !== 'function') return false;
  try {
    await client.finalizeIdlenessTxs({ account, txIds: [txHash] });
    return true;
  } catch {
    // Expected while the appeal window is open.
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

/**
 * Consensus round for a V3 mint.
 *
 * Ticks are passed as strings because they are signed and routinely negative
 * below spot; the IC sign-extends them the way Solidity's abi.encode does.
 */
export async function validateLiquidityV3Add(op, options = {}) {
  return _liquidityRound('validate_liquidity_v3_add', [
    String(op.user), String(op.token0), String(op.token1),
    parseInt(op.fee, 10),
    String(op.tickLower), String(op.tickUpper),
    String(op.amount0Desired), String(op.amount1Desired),
    String(op.amount0Min), String(op.amount1Min),
    parseInt(op.deadline, 10),
  ], options);
}

/**
 * Consensus round for a V3 decrease-liquidity.
 *
 * token0/token1 are included because AgentExecutor reads them to enforce its
 * whitelist, which makes them inputs to whether the call is permitted - so they
 * belong in the commitment even though the withdrawal itself follows tokenId.
 */
export async function validateLiquidityV3Remove(op, options = {}) {
  return _liquidityRound('validate_liquidity_v3_remove', [
    String(op.user), String(op.tokenId),
    String(op.token0), String(op.token1),
    String(op.liquidity),
    String(op.amount0Min), String(op.amount1Min),
    parseInt(op.deadline, 10),
  ], options);
}

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

/**
 * Establish a trading mandate: ONE consensus round that authorises many trades.
 *
 * This is the slow call, and it is meant to be made rarely (once per session /
 * per agent). Afterwards `checkTradeAgainstMandate` validates each trade with an
 * instant view, so per-trade latency stops depending on GenVM round timing.
 *
 * @param {object} terms   { user, tokens[], maxAmountIn, maxSlippageBps, expiresAt, maxTrades }
 * @param {object} account signer for the consensus write (a pool lane)
 */
export async function issueTradingMandate(terms, account) {
  const client = getGenLayerClient();
  const validatorAddress = GENLAYER_CONFIG.agentValidator;

  const tokens = Array.isArray(terms.tokens) ? terms.tokens.join(',') : String(terms.tokens || '');
  const args = [
    terms.user,
    tokens.toLowerCase(),
    String(terms.maxAmountIn),
    parseInt(terms.maxSlippageBps, 10),
    parseInt(terms.expiresAt, 10),
    parseInt(terms.maxTrades, 10),
  ];

  const txHash = await client.writeContract({
    account,
    address: validatorAddress,
    functionName: 'issue_trading_mandate',
    args,
    value: 0n,
  });

  try {
    const receipt = await client.waitForTransactionReceipt({ hash: txHash, status: 'ACCEPTED', retries: 8, fullTransaction: true });
    const interpreted = interpretValidationReceipt(receipt, { txHash, validatorAddress });
    const result = receipt?.result ?? null;
    return {
      ...interpreted,
      mandateId: result?.mandate_id || '',
      txHash,
    };
  } catch (err) {
    if (String(err?.message || '').includes('Timed out waiting')) {
      return {
        success: true,
        approved: false,
        pending: true,
        mandateId: '',
        txHash,
        reason: 'Mandate round submitted and awaiting GenVM consensus - poll this txHash.',
        contractAddress: validatorAddress,
      };
    }
    throw err;
  }
}

/** Read a mandate's committed terms (view - instant). */
export async function getMandate(mandateId) {
  const client = getGenLayerClient();
  try {
    return await client.readContract({
      address: GENLAYER_CONFIG.agentValidator,
      functionName: 'get_mandate',
      args: [mandateId],
    });
  } catch (err) {
    console.error('[genlayer] get_mandate failed:', err?.shortMessage || err?.message);
    return null;
  }
}

/**
 * Fast path: validate a trade against an already consensus-approved mandate.
 *
 * `check_mandate` is a @gl.public.view, so this is a plain read - no consensus
 * round, no activation wait, no multi-minute latency. Its authority comes from
 * `issue_trading_mandate`, which DID run full Optimistic Democracy consensus
 * when the session's mandate was established.
 *
 * ADVISORY ONLY - nothing here can make a trade settle.
 *
 * The description above is how this worked when the settlement agent enforced
 * the verdict. It no longer does. AgentExecutor accepts verdicts only from the
 * AgentValidator IC, delivered over its ghost contract, and `check_mandate` is
 * a view that emits nothing - so a mandate cannot produce one. The IC reflects
 * this by returning `settlement_authority: false`.
 *
 * Kept for risk-envelope bookkeeping and session UI. No caller in the
 * settlement path uses it; every trade needs its own `validate_swap` round.
 *
 * Returns null when there is no usable mandate.
 */
export async function checkTradeAgainstMandate(mandateId, trade) {
  if (!mandateId) return null;
  const client = getGenLayerClient();

  try {
    const result = await client.readContract({
      address: GENLAYER_CONFIG.agentValidator,
      functionName: 'check_mandate',
      args: [
        mandateId,
        trade.user,
        trade.tokenIn,
        trade.tokenOut,
        String(trade.amountIn),
        parseInt(trade.slippageBps, 10),
        parseInt(trade.deadline, 10),
      ],
    });

    const approved = Boolean(result && result.approved);
    return {
      success: true,
      approved,
      viaMandate: true,
      mandateId,
      reason: result?.reason || (approved ? 'Trade is within a GenVM consensus-approved mandate' : 'Trade falls outside the mandate'),
      proposalId: approved ? `mandate_${mandateId}` : '',
      contractAddress: GENLAYER_CONFIG.agentValidator,
      contractName: 'AgentValidator (GenLayer IC)',
      network: GENLAYER_CONFIG.chainName,
      chainId: GENLAYER_CONFIG.chainId,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    console.warn('[genlayer] mandate check unavailable, falling back to full consensus:', err?.shortMessage || err?.message);
    return null;
  }
}

/**
 * Unstick a validate_proposal transaction that GenLayer validators never voted
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
 * Poll for the outcome of a validate_proposal transaction that previously
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
 * Validate a Swap Execution Proposal using GenLayer AgentValidator IC.
 *
 * Uses the correct GenLayer WRITE flow (writeContract + waitForTransactionReceipt)
 * because validate_proposal is decorated @gl.public.write and mutates contract state
 * (validated_count, approved_count, rejected_count).
 *
 * Fails CLOSED on any consensus failure: approved: false is returned, never true.
 *
 * @param {object} proposal  - Trade proposal fields
 * @param {object} options   - { account, privateKey } - signer for the write tx.
 *                             If neither is provided, falls back to readContract
 *                             (non-state-mutating preview only, for UI display).
 */
/**
 * ADVISORY pre-trade validation. It does NOT authorise settlement.
 *
 * This runs `validate_proposal`, which predates the settlement binding and
 * never sees the route, the fee, the fee collector or the user - so it cannot
 * produce the identifier AgentExecutor checks, and it emits no verdict. Its
 * result is for the pre-trade UI panel only.
 *
 * The binding round is `validateSwapOrder` (IC method `validate_swap`), which
 * /api/agent-execute runs over the exact order it is about to settle.
 */
export async function validateSwapProposal(proposal, options = {}) {
  // `validate_proposal` was removed from AgentValidator.
  //
  // It authorised nothing (it never saw the route, the fee or the user, so it
  // could not produce the identifier the executor checks) and the contract is
  // deployed as source against a per-block size limit, so dead weight has a
  // real cost. Calling it now makes the round run and the contract raise, which
  // surfaces as "consensus failed: ACCEPTED" and reads like a refusal.
  //
  // Fail here instead, naming the method that replaced it.
  return {
    success: false,
    approved: false,
    reason:
      'validate_proposal no longer exists on AgentValidator. Swaps validate through '
      + 'validate_swap and V2 liquidity through validate_liquidity_v2_add / _remove, '
      + 'which are the methods bound to the settlement contract.',
    proposalId: '',
    contractAddress: GENLAYER_CONFIG.agentValidator,
    contractName: 'AgentValidator (GenLayer IC)',
    network: GENLAYER_CONFIG.chainName,
    chainId: GENLAYER_CONFIG.chainId,
    timestamp: new Date().toISOString(),
  };
}

async function _retiredValidateSwapProposal(proposal, options = {}) {
  const client = getGenLayerClient();
  const validatorAddress = GENLAYER_CONFIG.agentValidator;

  const action = (proposal.action || 'SWAP').toUpperCase();
  const tokenIn = resolveTokenAddress(proposal.tokenIn || proposal.fromToken);
  const tokenOut = resolveTokenAddress(proposal.tokenOut || proposal.toToken);

  // Decimal scaling helper
  const tokenInObj = TOKEN_LIST[4221]?.find(t => t.address.toLowerCase() === tokenIn.toLowerCase() || (tokenIn === '0x0000000000000000000000000000000000000000' && t.isNative));
  const tokenOutObj = TOKEN_LIST[4221]?.find(t => t.address.toLowerCase() === tokenOut.toLowerCase() || (tokenOut === '0x0000000000000000000000000000000000000000' && t.isNative));

  const decimalsIn = tokenInObj?.decimals || 18;
  const decimalsOut = tokenOutObj?.decimals || 18;

  let amountInRaw = proposal.amountInRaw;
  if (!amountInRaw && proposal.amountIn !== undefined) {
    try {
      const parsed = BigInt(Math.floor(parseFloat(proposal.amountIn) * (10 ** decimalsIn)));
      amountInRaw = parsed.toString();
    } catch {
      amountInRaw = '1000000000000000000';
    }
  }
  if (!amountInRaw || amountInRaw === '0') amountInRaw = '1000000000000000000';

  let minAmountOutRaw = proposal.minAmountOutRaw;
  if (!minAmountOutRaw && proposal.minAmountOut !== undefined) {
    try {
      const parsed = BigInt(Math.floor(parseFloat(proposal.minAmountOut) * (10 ** decimalsOut)));
      minAmountOutRaw = parsed.toString();
    } catch {
      minAmountOutRaw = '950000000000000000';
    }
  }
  if (!minAmountOutRaw) minAmountOutRaw = '1';

  let slippageBps = parseInt(proposal.slippageBps || 30, 10);
  if (isNaN(slippageBps)) slippageBps = 30;

  const defaultRouter = CONTRACT_ADDRESSES[4221]?.aggregatorEntrypoint || '0x95feE6Cb918Ed9C621E36082EE8D998873031EaA';
  const router = proposal.router || defaultRouter;

  const deadline = parseInt(proposal.deadline || (Math.floor(Date.now() / 1000) + 1200), 10);

  const extraData = typeof proposal.extraData === 'string'
    ? proposal.extraData
    : JSON.stringify(proposal.extraData || { route: proposal.route || 'V2', model: proposal.model || 'v2' });

  const callArgs = [
    action,
    tokenIn,
    tokenOut,
    String(amountInRaw),
    String(minAmountOutRaw),
    slippageBps,
    router,
    deadline,
    extraData.slice(0, 500),
  ];

  // ── Fast path: this exact proposal already has a recorded verdict ─────────
  // Verdicts persist on-chain, so an identical set of parameters resolves via a
  // view in ~1s instead of running another multi-minute consensus round.
  const proposalId = await computeProposalId({
    action, tokenIn, tokenOut,
    amountIn: String(amountInRaw), minAmountOut: String(minAmountOutRaw),
    slippageBps, deadline,
  });
  if (proposalId) {
    const recorded = await readValidationVerdict(proposalId);
    if (recorded) {
      return {
        success: true,
        approved: recorded.approved,
        reason: recorded.approved
          ? 'Consensus-approved on GenVM (verdict already recorded on-chain)'
          : recorded.reason,
        proposalId,
        contractAddress: validatorAddress,
        contractName: 'AgentValidator (GenLayer IC)',
        network: GENLAYER_CONFIG.chainName,
        chainId: GENLAYER_CONFIG.chainId,
        timestamp: new Date().toISOString(),
        details: { action, tokenIn, tokenOut, amountInRaw: String(amountInRaw), minAmountOutRaw: String(minAmountOutRaw), slippageBps, router, deadline },
      };
    }
  }

  // The mandate fast path that used to sit here has been removed.
  //
  // It admitted individual trades through `check_mandate`, a @gl.public.view -
  // a read, not a consensus round, and exactly what the GenLayer review called
  // "validating through a read simulation". It mattered because the settlement
  // agent acted on the answer.
  //
  // It cannot matter any more: AgentExecutor's verdict registry is closed to
  // every key an operator holds, and a view emits nothing, so a mandate can no
  // longer make anything settle. What it COULD still do is show the user a
  // green "validated by GenLayer" panel for a trade that will then be refused
  // on chain for want of a verdict - a fast answer that is wrong in the only
  // direction that matters. Better removed than kept as decoration.
  //
  // `issue_trading_mandate` and `check_mandate` remain on the IC for risk
  // bookkeeping, and both now return `settlement_authority: false`.

  // ── GenLayer Write Flow (correct path) ────────────────────────────────────
  // validate_proposal is @gl.public.write - it MUST be called as a write
  // transaction so GenLayer's Optimistic Democracy consensus is triggered.
  // readContract only simulates locally on one node - it bypasses consensus.
  const account = options.account || (options.privateKey ? createAccount(options.privateKey) : null);

  if (account && typeof client.writeContract === 'function') {
    try {
      // The node throttles per sender and tells us how long to wait, so a
      // throttled submission is worth retrying rather than reporting as a
      // rejected trade. Nothing has been submitted when this fires.
      let txHash;
      for (let attempt = 0; ; attempt += 1) {
        try {
          txHash = await client.writeContract({
            account,
            address: validatorAddress,
            functionName: 'validate_proposal',
            args: callArgs,
            value: 0n,
            // Size of the validator set for this round.
            //
            // Fewer validators = fewer independent re-executions (each of which
            // makes its own LLM call inside strict_eq) and less commit/reveal
            // coordination, so rounds finish sooner. It is left UNSET by default
            // on purpose: shrinking the set weakens the Optimistic Democracy
            // quorum, which is the exact property the GenLayer review is
            // assessing. Set GENLAYER_VALIDATORS=1 only for demos where latency
            // matters more than quorum strength - never for a submission.
            ...(process.env.GENLAYER_VALIDATORS
              ? { numOfInitialValidators: Number(process.env.GENLAYER_VALIDATORS) }
              : {}),
          });
          break;
        } catch (submitErr) {
          const limited = parseRateLimit(submitErr);
          if (!limited || attempt >= 3) throw submitErr;
          const wait = limited.retryAfterMs + 250 * attempt;
          console.warn(`[genlayer] node at capacity, retrying submit in ${wait}ms (attempt ${attempt + 1}/4)`);
          await new Promise((r) => setTimeout(r, wait));
        }
      }

      if (typeof client.waitForTransactionReceipt === 'function') {
        // NOTE: wait for ACCEPTED, not FINALIZED. ACCEPTED is the point at which
        // Optimistic Democracy consensus has decided the result (genlayer-js's own
        // DECIDED_STATES includes ACCEPTED) - the execution result is already final
        // at this point. FINALIZED only comes after the appeal-bond window closes.
        //
        // Bradbury testnet consensus rounds can occasionally take much longer than
        // any reasonable synchronous HTTP request should block for (observed: several
        // minutes under load). Rather than waiting indefinitely (bad UX) or timing out
        // and reporting a false "rejected" (misleading - the trade may still approve
        // moments later), this waits a bounded amount and, on timeout, returns
        // pending:true with the txHash so the caller can poll checkSwapValidationStatus
        // instead of treating a slow round as a rejection.
        try {
          const receipt = await client.waitForTransactionReceipt({
            hash: txHash,
            status: 'ACCEPTED',
            // Was 8 (~24s). Polling is now far cheaper than this wait: a poll
            // reads the recorded verdict directly and returns in ~1.5s, so
            // blocking here just delayed the moment the caller could start
            // checking. Keep a short inline wait for the genuinely fast case,
            // then hand straight over to the poll loop.
            retries: 2, // ~6s
            fullTransaction: true,
          });
          const interpreted = interpretValidationReceipt(receipt, { txHash, validatorAddress, action, tokenIn, tokenOut, amountInRaw, minAmountOutRaw, slippageBps, router, deadline });
          if (interpreted.needsVerdictLookup && proposalId) {
            const verdict = await readValidationVerdict(proposalId);
            if (verdict) {
              return { ...interpreted, approved: verdict.approved, reason: verdict.reason, proposalId, needsVerdictLookup: false };
            }
            // Round succeeded but the verdict is not readable yet - retryable,
            // never a rejection.
            return { ...interpreted, retryable: true, reason: 'Consensus reached but the verdict is not yet readable - retry shortly.' };
          }
          return interpreted;
        } catch (waitErr) {
          if (String(waitErr?.message || '').includes('Timed out waiting')) {
            return {
              success: true,
              approved: false,
              pending: true,
              reason: 'Still awaiting GenVM Optimistic Democracy consensus - this can take several minutes on Bradbury testnet under load. Not rejected - check back shortly.',
              // Carry the id so the poller can read the verdict once it lands.
              proposalId: proposalId || '',
              txHash,
              contractAddress: validatorAddress,
              contractName: 'AgentValidator (GenLayer IC)',
              network: GENLAYER_CONFIG.chainName,
              chainId: GENLAYER_CONFIG.chainId,
              timestamp: new Date().toISOString(),
            };
          }
          throw waitErr;
        }
      }
    } catch (writeErr) {
      // A submission revert means the round never started - decode it so this
      // does not read as "your trade was rejected".
      const submissionDetail = await describeSubmissionRevert(writeErr?.shortMessage || writeErr?.message);
      // Write tx failed (network, rejected, etc.) → fail closed
      console.error('AgentValidator write tx failed (failing closed):', writeErr);
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
  }

  // ── Fallback: Read simulation (no account / signer available) ────────────
  // This path is used for UI previews only. It does NOT mutate contract state
  // and does NOT constitute proper GenLayer write-flow consensus. The result
  // must NOT be used to gate actual settlement.
  try {
    const result = await client.readContract({
      address: validatorAddress,
      functionName: 'validate_proposal',
      args: callArgs,
    });

    const isApproved = Boolean(result && result.approved);

    return {
      success: true,
      approved: isApproved,
      reason: result?.reason || (isApproved ? 'Simulation approved (read-only preview - not consensus)' : 'Simulation rejected by validator'),
      proposalId: result?.proposal_id || (isApproved ? `sim_${Date.now()}` : ''),
      txHash: null,
      contractAddress: validatorAddress,
      contractName: 'AgentValidator (GenLayer IC)',
      network: GENLAYER_CONFIG.chainName,
      chainId: GENLAYER_CONFIG.chainId,
      timestamp: new Date().toISOString(),
      isSimulation: true,  // Caller must check this - simulations do NOT gate settlement
      details: {
        action,
        tokenIn,
        tokenOut,
        amountInRaw: String(amountInRaw),
        minAmountOutRaw: String(minAmountOutRaw),
        slippageBps,
        router,
        deadline,
      },
    };
  } catch (err) {
    console.error('AgentValidator IC invocation error (failing closed):', err);
    return {
      success: false,
      approved: false,
      reason: err?.shortMessage || err?.message || 'GenLayer Intelligent Contract consensus unavailable - failed closed',
      proposalId: '',
      contractAddress: validatorAddress,
      contractName: 'AgentValidator (GenLayer IC)',
      network: GENLAYER_CONFIG.chainName,
      chainId: GENLAYER_CONFIG.chainId,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * ADVISORY liquidity validation via the separate LiquidityValidator IC.
 *
 * It does NOT authorise settlement, and it is not in the settlement path.
 * AgentExecutor accepts verdicts only from the AgentValidator IC, so a
 * different Intelligent Contract cannot produce one however it votes.
 *
 * The binding rounds are `validateLiquidityV2Add` / `validateLiquidityV2Remove`
 * / `validateLiquidityV3Add` / `validateLiquidityV3Remove`, which the
 * /api/agent-add-liquidity and /api/agent-remove-liquidity routes run against
 * AgentValidator over the exact operation they are about to settle.
 *
 * Kept for the pre-trade UI panel and the docs page.
 */
export async function validateLiquidityProposal(proposal, options = {}) {
  const client = getGenLayerClient();
  const validatorAddress = GENLAYER_CONFIG.liquidityValidator;

  const isV3 = proposal.model === 'v3' || proposal.isV3;
  const isRemove = proposal.action === 'REMOVE_LIQUIDITY';

  // ── V2 add-liquidity goes through the SAME enforced path as swaps ─────────
  // Everything below this branch calls `client.readContract`, i.e. a local
  // simulation on a single node that never triggers Optimistic Democracy - the
  // "validates through a read simulation" the GenLayer review rejected.
  //
  // LiquidityValidator cannot back an enforced flow as deployed: it has no
  // verdict persistence (no `get_validation`, no `compute_proposal_id`), so a
  // verdict it issues cannot be re-read on-chain at settlement time.
  // AgentValidator already accepts ADD_LIQUIDITY and records the verdict, so a
  // V2 deposit is validated by a real consensus write there and
  // /api/agent-add-liquidity verifies that verdict before binding the one-time
  // approval. Mapping is tokenA→token_in, tokenB→token_out,
  // amountA→amount_in, amountB→min_amount_out; the settlement route derives the
  // proposal id from exactly the same mapping.
  // Withdrawals validate through AgentValidator as well, so the verdict is
  // recorded and /api/agent-remove-liquidity can read it back. Mapping matches
  // the settlement route: tokenA/tokenB, amountIn = LP burned, minAmountOut =
  // the minimum of side A.
  if (!isV3) {
    const tokenAIn = proposal.tokenA ?? proposal.token0 ?? proposal.tokenIn;
    const tokenBIn = proposal.tokenB ?? proposal.token1 ?? proposal.tokenOut;
    if (tokenAIn && tokenBIn) {
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

      if (isRemove) {
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
  }

  // Accept the swap-shaped field names too. The /a2a swarm describes every
  // action with tokenIn/tokenOut, so reading only tokenA/tokenB left both
  // undefined - and resolveTokenAddress(undefined) returns the zero address,
  // making the pair look like NATIVE/NATIVE. Every liquidity proposal was then
  // rejected with "tokenA and tokenB cannot be the same".
  const rawTokenA = proposal.tokenA ?? proposal.token0 ?? proposal.tokenIn;
  const rawTokenB = proposal.tokenB ?? proposal.token1 ?? proposal.tokenOut;

  if (!rawTokenA || !rawTokenB) {
    return {
      success: false,
      approved: false,
      reason: 'Liquidity proposal is missing its token pair (expected tokenA/tokenB, token0/token1, or tokenIn/tokenOut).',
      proposalId: '',
      contractAddress: validatorAddress,
      contractName: 'LiquidityValidator (GenLayer IC)',
      network: GENLAYER_CONFIG.chainName,
      chainId: GENLAYER_CONFIG.chainId,
      timestamp: new Date().toISOString(),
    };
  }

  const tokenA = resolveTokenAddress(rawTokenA);
  const tokenB = resolveTokenAddress(rawTokenB);

  const deadline = parseInt(proposal.deadline || (Math.floor(Date.now() / 1000) + 1200), 10);

  try {
    let result;
    let functionName;
    let args;

    if (isRemove) {
      if (isV3) {
        functionName = 'validate_remove_liquidity_v3';
        args = [
          String(proposal.tokenId || '1'),
          String(proposal.liquidity || '1000000'),
          String(proposal.amount0Min || '0'),
          String(proposal.amount1Min || '0'),
          deadline,
        ];
      } else {
        functionName = 'validate_remove_liquidity_v2';
        args = [
          tokenA,
          tokenB,
          String(proposal.lpAmount || '1000000000000000000'),
          String(proposal.minAmountA || '0'),
          String(proposal.minAmountB || '0'),
          deadline,
        ];
      }
    } else {
      // Add Liquidity
      if (isV3) {
        functionName = 'validate_add_liquidity_v3';
        args = [
          tokenA,
          tokenB,
          parseInt(proposal.fee || 3000, 10),
          parseInt(proposal.tickLower || -887220, 10),
          parseInt(proposal.tickUpper || 887220, 10),
          String(proposal.amount0Desired || '1000000000000000000'),
          String(proposal.amount1Desired || '1000000000000000000'),
          String(proposal.amount0Min || '900000000000000000'),
          String(proposal.amount1Min || '900000000000000000'),
          deadline,
        ];
      } else {
        // As with the token pair, accept the swap-shaped amount fields the
        // /a2a swarm sends (amountInRaw / minAmountOutRaw) so a liquidity
        // proposal is not silently validated against placeholder amounts.
        const amountARaw = String(proposal.amountARaw ?? proposal.amountA ?? proposal.amountInRaw ?? '1000000000000000000');
        const amountBRaw = String(proposal.amountBRaw ?? proposal.amountB ?? proposal.minAmountOutRaw ?? '1000000000000000000');
        // Minimums default to 0.5% below the desired amounts - comfortably
        // inside the IC's 300 bps implied-slippage cap.
        const minARaw = String(proposal.minAmountARaw ?? proposal.minAmountA ?? (BigInt(amountARaw) * 995n) / 1000n);
        const minBRaw = String(proposal.minAmountBRaw ?? proposal.minAmountB ?? (BigInt(amountBRaw) * 995n) / 1000n);

        functionName = 'validate_add_liquidity_v2';
        args = [tokenA, tokenB, amountARaw, amountBRaw, minARaw, minBRaw, deadline];
      }
    }

    // Execute read contract simulation
    result = await client.readContract({
      address: validatorAddress,
      functionName,
      args,
    });

    const isApproved = Boolean(result && result.approved);

    return {
      success: true,
      approved: isApproved,
      reason: result?.reason || (isApproved ? 'Liquidity validation passed on GenVM' : 'Liquidity proposal rejected by GenLayer consensus'),
      proposalId: result?.proposal_id || (isApproved ? `liq_${Date.now()}` : ''),
      contractAddress: validatorAddress,
      contractName: 'LiquidityValidator (GenLayer IC)',
      network: GENLAYER_CONFIG.chainName,
      chainId: GENLAYER_CONFIG.chainId,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    console.error('LiquidityValidator IC invocation error (failing closed):', err);
    return {
      success: false,
      approved: false,
      reason: err?.shortMessage || err?.message || 'Liquidity validation failed on GenLayer IC - failed closed',
      proposalId: '',
      contractAddress: validatorAddress,
      contractName: 'LiquidityValidator (GenLayer IC)',
      network: GENLAYER_CONFIG.chainName,
      chainId: GENLAYER_CONFIG.chainId,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Fetch stats from both Intelligent Contracts
 */
export async function getIntelligentContractStats() {
  const client = getGenLayerClient();
  try {
    const [agentStats, liqStats] = await Promise.all([
      client.readContract({
        address: GENLAYER_CONFIG.agentValidator,
        functionName: 'get_stats',
        args: [],
      }).catch(() => null),
      client.readContract({
        address: GENLAYER_CONFIG.liquidityValidator,
        functionName: 'get_stats',
        args: [],
      }).catch(() => null),
    ]);

    return {
      agentValidator: {
        address: GENLAYER_CONFIG.agentValidator,
        stats: agentStats,
      },
      liquidityValidator: {
        address: GENLAYER_CONFIG.liquidityValidator,
        stats: liqStats,
      },
    };
  } catch (err) {
    console.error('Failed to get Intelligent Contract stats:', err);
    return null;
  }
}
