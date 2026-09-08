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
// ON RE-PROMPTING - WHY CLIENT WRITES DO NOT AUTO-RETRY
// -----------------------------------------------------
// `writeContractAsync` signs AND sends. There is no way to retry only the send,
// so every retry raises a fresh wallet popup. The first version of this file
// defaulted to three retries, and users reported the swap page "asking for 2, 3
// transactions" - which is exactly what it was doing.
//
// A person cannot tell a retry popup from a duplicate charge. Being asked to
// sign three times for one swap reads as the app trying to take money twice,
// which is far worse than being told to tap the button again. So anything the
// user signs passes WALLET_NO_RETRY: it detects the throttle and reports it
// honestly, and the person retries deliberately.
//
// Automatic retries stay where there is no human in the loop - the server-side
// settlement routes, which hold their own key and prompt nobody.

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
// ---------------------------------------------------------------------------
// PACING: do not trip the limiter in the first place
// ---------------------------------------------------------------------------
//
// The limiter is a GAS RATE limit, so it is tripped by transactions arriving
// too close together - and the app's own flows are the worst offender. An
// approve immediately followed by a swap is two sends inside a second, from one
// account, and the second is refused. Shrinking gas helped; spacing our own
// sends addresses the cause.
//
// Every client send passes through one promise chain, so two transactions can
// never leave at the same instant, and consecutive ones are separated by at
// least MIN_SEND_GAP_MS. A throttle also records when it happened, so the next
// send waits out the delay the node asked for rather than walking into it.
const MIN_SEND_GAP_MS = 1500;
let _chain = Promise.resolve();
let _lastSendAt = 0;
let _throttledUntil = 0;

/** Remember a throttle so the NEXT send waits it out instead of repeating it. */
function noteThrottle(err) {
  _throttledUntil = Math.max(_throttledUntil, Date.now() + retryDelayFrom(err, 0));
}

/**
 * Serialise and space one outgoing transaction.
 *
 * Ordering is preserved: callers are released in the order they arrive.
 */
export function paced(fn) {
  const run = _chain.then(async () => {
    const now = Date.now();
    const waitFor = Math.max(
      _lastSendAt + MIN_SEND_GAP_MS - now,
      _throttledUntil - now,
      0,
    );
    if (waitFor > 0) await new Promise((r) => setTimeout(r, waitFor));
    _lastSendAt = Date.now();
    return fn();
  });
  // The chain must survive a rejected send, or one failure stalls every
  // transaction afterwards.
  _chain = run.then(() => undefined, () => undefined);
  return run;
}

/**
 * Options for a transaction a PERSON signs.
 *
 * This has been wrong in both directions, so the reasoning is worth keeping.
 *
 * It started at three retries. Each retry re-signs - `writeContractAsync` signs
 * AND sends, and no injected wallet lets us resend an already-signed
 * transaction - so users were asked to approve the same swap three or four
 * times, which reads like the app trying to charge them twice.
 *
 * It then went to zero. But the throttle the node reports is SHORT: the
 * observed retryAfterMs values are 385, 562, 632 and 1164 milliseconds. A
 * single attempt that lands inside such a window fails outright, and the user
 * is left clicking a button that looks broken.
 *
 * One retry is the honest middle. It costs at most one extra prompt, it waits
 * out the exact delay the node asked for, and `onRetry` warns the user BEFORE
 * the wallet reopens so the second dialog is expected rather than alarming.
 *
 * Note what this cannot do: pacing our own calls does not pace the SEND. The
 * wallet dialog sits between us and the node, so the raw transaction arrives
 * whenever the person clicks confirm. Retrying after the node's own hint is the
 * only lever we actually hold on a wallet-signed transaction.
 */
export const WALLET_ONE_RETRY = { max: 1 };

/** Kept for callers that genuinely must never re-prompt. */
export const WALLET_NO_RETRY = { max: 0 };

export async function withNodeRetry(fn, { label = 'transaction', onRetry, max = 3 } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      // A user who declines in their wallet must never be retried at them.
      if (isUserRejection(err)) throw err;
      if (isNodeThrottle(err)) noteThrottle(err);
      if (!isNodeThrottle(err) || attempt >= max) throw err;

      noteThrottle(err);
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

/**
 * Why did gas estimation fail, in terms the person can act on?
 *
 * An estimate that reverts is the most useful signal the swap page gets: it
 * means the transaction WOULD fail, and it usually says why. Discarding it and
 * sending anyway with a large gas limit produced the worst possible outcome -
 * the node refused the oversized request, and the user was told the network was
 * busy when the real problem was their own allowance.
 */
export function describeSimulationFailure(err, tokenSymbol = 'this token') {
  const text = [err?.shortMessage, err?.message, err?.details, err?.cause?.message]
    .filter(Boolean).join(' ');

  if (/transfer amount exceeds allowance|insufficient allowance|ERC20: transfer amount exceeds allowance/i.test(text)) {
    return `The router is not approved to move your ${tokenSymbol}. Approve it and try the swap again.`;
  }
  if (/transfer amount exceeds balance|insufficient balance|ds-math-sub-underflow/i.test(text)) {
    return `Not enough ${tokenSymbol} in your wallet for this swap.`;
  }
  if (/INSUFFICIENT_OUTPUT_AMOUNT|INSUFFICIENT_LIQUIDITY|slippage/i.test(text)) {
    return 'The price moved past your slippage limit while this quote was on screen. '
      + 'Refresh the quote, or raise slippage slightly, and try again.';
  }
  if (/insufficient funds/i.test(text)) {
    return 'Not enough GEN to pay for gas on this swap.';
  }
  return 'This swap would fail on-chain, so it was not submitted. '
    + (err?.shortMessage || err?.message || 'The route or your balance may have changed - refresh the quote.');
}

// ---------------------------------------------------------------------------
// WHICH RPC IS THE WALLET ACTUALLY USING?
// ---------------------------------------------------------------------------
//
// This mattered more than anything else and went unexamined for six attempts.
//
// The throttle arrives as `RPC 0x107d Custom eth_sendRawTransaction`. 0x107d is
// 4221 - and "Custom" means MetaMask is talking to an endpoint the USER added,
// which is not necessarily the one this app recommends. Transactions are
// broadcast by the wallet through ITS endpoint, so an app-side RPC config, and
// every measurement taken against an app-side endpoint, can be describing a
// node that is not involved in the failure at all.
//
// A throttle on a 46,770-gas approve, from an account sending nothing, on a
// chain whose blocks are a third full, is not the chain being busy. It is one
// endpoint being busy. So when a send is throttled, find out which endpoint
// refused it.
export const RECOMMENDED_RPC = 'https://rpc-bradbury.genlayer.com';

/**
 * The URL the injected wallet is broadcasting through, if it will tell us.
 *
 * Best-effort: most wallets do not expose this, so failure is expected and
 * must never break a transaction.
 */
export async function walletRpcUrl() {
  try {
    const eth = typeof window !== 'undefined' ? window.ethereum : null;
    if (!eth) return null;
    // MetaMask keeps the active network's URL here on recent versions; other
    // wallets expose nothing, which is fine.
    const known = eth.networkVersion && eth._state?.networkConfiguration?.rpcUrl;
    return known || eth.rpcUrl || null;
  } catch {
    return null;
  }
}

/**
 * Is the endpoint the wallet uses actually able to take transactions?
 *
 * Sends a deliberately invalid raw transaction. Nothing can execute, and the
 * node's answer separates two very different situations:
 *
 *   -32602 "failed to decode"  the endpoint is accepting writes; the throttle
 *                              is transient and retrying is the right move
 *   -32005 / rate limit        this endpoint is refusing writes outright, and
 *                              no amount of retrying from the app will help -
 *                              the wallet needs a different RPC URL
 */
export async function probeWriteCapacity(url = RECOMMENDED_RPC) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_sendRawTransaction', params: ['0x02f8'] }),
    });
    const body = await res.json();
    const msg = body?.error?.message || '';
    const code = body?.error?.code;
    if (code === -32005 || /rate limit|at capacity/i.test(msg)) {
      return { accepting: false, reason: msg || 'rate limited' };
    }
    return { accepting: true, reason: msg };
  } catch (e) {
    return { accepting: null, reason: e?.message || 'unreachable' };
  }
}

/**
 * The message for a throttle, sharpened by what the endpoints actually say.
 *
 * If the recommended endpoint is taking writes while the wallet's send was
 * refused, then the wallet is on a different, busier RPC - and telling the
 * person to "try again in a few seconds" is useless advice for a problem that
 * will not clear.
 */
export async function explainThrottle() {
  const probe = await probeWriteCapacity();
  if (probe.accepting) {
    return 'Your wallet\'s RPC endpoint refused this transaction, but '
      + `${RECOMMENDED_RPC} is accepting transactions right now. Your wallet is `
      + 'likely on a different, busier endpoint for GenLayer. In your wallet, edit '
      + `the GenLayer network and set the RPC URL to ${RECOMMENDED_RPC}, then try again.`;
  }
  return 'The GenLayer node is refusing transactions from every endpoint at the '
    + 'moment, so this is network-wide congestion rather than your setup. '
    + 'Nothing was spent. Try again shortly.';
}
