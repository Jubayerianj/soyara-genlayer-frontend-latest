// lib/nodeRetry.js
//
// Surviving the Bradbury node's gas rate limiter, on the client.
//
// THE PROBLEM
// -----------
// GenLayer Bradbury rate-limits by gas throughput, not by request count. Under
// load it refuses `eth_sendRawTransaction` with JSON-RPC -32005 and a hint:
//
//   error code -32005: transaction gas rate limit exceeded: node is at
//   capacity, retry in ~562ms, data: {"retryAfterMs":562}
//
// Nothing is wrong with the transaction. It was never submitted, no gas was
// spent, and the same bytes succeed a moment later. The node is telling us
// exactly how long to wait.
//
// The server-side settlement routes have handled this for a while
// (`sendWithRetry` in pages/api/agent-*.js). Every CLIENT write - swap, wrap,
// unwrap, approve, liquidity - did not, so a busy node surfaced to the user as
// a hard failure on a perfectly good trade.
//
// WORSE, IT LIED ABOUT THE CAUSE
// ------------------------------
// viem wraps the RPC error in a ContractFunctionExecutionError, so the message
// the user saw was:
//
//   The contract function "deposit" reverted with the following reason: ...
//
// `deposit` did not revert. It was never called. Reading that, the reasonable
// conclusion is that wrap is broken, which is why this was reported as a
// contract bug rather than as node congestion. `describeTxError` below exists
// so a throttle is never again presented as a revert.
//
// ON RE-PROMPTING
// ---------------
// `writeContractAsync` signs AND sends, so a retry asks the wallet to sign
// again. That is a real cost, and it is why `onRetry` exists: tell the user the
// network is busy BEFORE the second prompt appears, or the extra popup reads as
// the app malfunctioning. One extra prompt beats a dead trade.

/** Does this error mean "the node is busy", rather than "your transaction is bad"? */
export function isNodeThrottle(err) {
  const text = [
    err?.shortMessage,
    err?.message,
    err?.details,
    err?.cause?.message,
    err?.cause?.details,
  ].filter(Boolean).join(' ');

  return /-32005|gas rate limit|node is at capacity|retryAfterMs/i.test(text);
}

/** How long the node asked us to wait, in ms. Falls back to a sane default. */
export function retryDelayFrom(err, attempt = 0) {
  const text = [err?.shortMessage, err?.message, err?.details, err?.cause?.message]
    .filter(Boolean).join(' ');

  const hint = text.match(/retryAfterMs"?\s*:\s*(\d+)/)
    || text.match(/retry in ~?(\d+)\s*ms/i);

  // Add a little on top of the node's own figure, and back off further each
  // attempt: several tabs retrying on exactly the hinted delay would collide
  // again on the same tick.
  const base = hint ? parseInt(hint[1], 10) : 1200;
  return Math.min(8000, base + 250 + attempt * 600);
}

/**
 * Run a transaction-sending function, retrying while the node is throttling.
 *
 * @param fn        the call to make (usually a wagmi writeContractAsync)
 * @param options   label   - for logs
 *                  onRetry - ({attempt, waitMs, max}) => void, to update the UI
 *                            before the wallet prompts again
 *                  max     - attempts after the first (default 3)
 */
export async function withNodeRetry(fn, { label = 'transaction', onRetry, max = 3 } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      // A user who declines in their wallet must never be retried at them.
      if (isUserRejection(err) || !isNodeThrottle(err) || attempt >= max) throw err;

      const waitMs = retryDelayFrom(err, attempt);
      console.warn(`[${label}] node at capacity, retrying in ${waitMs}ms (${attempt + 1}/${max})`);
      onRetry?.({ attempt: attempt + 1, waitMs, max });
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
}

/** Did the user decline the signature? Retrying that is just nagging. */
export function isUserRejection(err) {
  const text = [err?.shortMessage, err?.message, err?.cause?.message].filter(Boolean).join(' ');
  return /user rejected|user denied|rejected the request|ACTION_REJECTED/i.test(text)
    || err?.code === 4001 || err?.cause?.code === 4001;
}

/**
 * A message that says what actually happened.
 *
 * viem's default for a throttled send names the contract function and the word
 * "reverted", which is wrong in both halves.
 */
export function describeTxError(err, action = 'Transaction') {
  if (isUserRejection(err)) return 'You declined the signature in your wallet.';

  if (isNodeThrottle(err)) {
    // Deliberately never says "revert". The whole defect was that a user read
    // viem's wrapper, saw that word, and concluded the contract was broken.
    return 'The GenLayer node is at capacity, so this transaction was never '
      + 'submitted. No gas was spent and the contract was not called. '
      + 'Try again in a few seconds.';
  }

  const insufficient = /insufficient funds|exceeds balance/i.test(
    `${err?.shortMessage || ''} ${err?.message || ''}`
  );
  if (insufficient) return 'Not enough GEN to cover this transaction and its gas.';

  return err?.shortMessage || err?.message || `${action} failed.`;
}
