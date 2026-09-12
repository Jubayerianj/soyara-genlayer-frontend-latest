// lib/mandate.js
//
// The client half of the mandate rail.
//
// WHY ANY OF THIS EXISTS
// ----------------------
// A per-order GenLayer verdict cannot be fast. It reaches AgentExecutor as an
// EVM-bound external message, and GenVM's `EthSend` emission carries only
// address, calldata, value and fees - no delivery-timing field, unlike
// `PostMessage` and `DeployContract` which both take `on` ("accepted" |
// "finalized"). An Intelligent Contract therefore cannot ask for earlier
// delivery; the chain applies finalization, which on Bradbury is the appeal
// window. Per trade, that is about thirty minutes of waiting.
//
// A mandate pays that once. Consensus approves a bounded authority - this user,
// this pair and direction, a per-trade ceiling, a lifetime budget, a slippage
// and fee cap, one route pinned by hash - and afterwards each trade inside it
// is a single EVM transaction that AgentExecutor checks and prices on chain.
//
// WHAT THIS MODULE DOES
// ---------------------
// It remembers the mandates a user's browser has asked for, hands their ids to
// /api/genlayer-validate (which decides whether one covers a trade before any
// round is opened), and asks for a new one in the background when a trade had
// to take the per-order rail but a mandate could have carried it. That request
// does not speed up the trade in front of the user; it is what makes the next
// one like it settle in seconds.
//
// Nothing here authorises anything. An id in local storage is a lookup key: the
// mandate itself lives on the executor, and only a consensus round can write
// one there.

import { notices } from './notify.js';
import { TOKEN_LIST } from '../constants/tokens.js';

const KEY = 'soyara.mandates.v1';

/** "USDC → USDT" from two addresses, for one-line notices. */
export function pairLabel(tokenIn, tokenOut) {
  const sym = (a) => (TOKEN_LIST[4221] || []).find((t) => String(t.address).toLowerCase() === String(a).toLowerCase())?.symbol
    || `${String(a).slice(0, 6)}…`;
  return `${sym(tokenIn)} → ${sym(tokenOut)}`;
}

/**
 * How long the background watcher keeps checking a requested mandate. Past
 * this, the round is not going to deliver it; the next trade on the pair asks
 * again (see MANDATE_PENDING_MS).
 */
export const MANDATE_WATCH_MS = 3 * 60 * 60 * 1000;

/**
 * How long a requested mandate is left to finalize before it is asked for
 * again. Longer than the observed appeal window, so a round that is simply
 * still finalizing is never duplicated - each request is a consensus round, and
 * the IC can only hold so many unresolved rounds before it refuses new ones.
 */
export const MANDATE_PENDING_MS = 45 * 60 * 1000;

/** After a request fails, wait this long before trying the same pair again. */
const MANDATE_RETRY_MS = 5 * 60 * 1000;

/** Mandates are per user AND per direction: selling USDC is not buying it. */
function slot(user, tokenIn, tokenOut) {
  return [String(user), String(tokenIn), String(tokenOut)].map((s) => s.toLowerCase()).join('|');
}

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    // A corrupt or unavailable store must never block a trade; the worst case
    // is issuing a mandate we already had.
    return {};
  }
}

function writeAll(v) {
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private window */ }
}

export function rememberMandate(user, tokenIn, tokenOut, mandateId, roundTxHash = null, extra = {}) {
  if (!mandateId) return;
  const all = readAll();
  // The round's tx hash is kept so every later liveness check can also nudge it
  // toward finalization. Without that the mandate is approved by consensus and
  // never delivered to the executor, because nothing in the protocol finalizes
  // a round on its own.
  all[slot(user, tokenIn, tokenOut)] = { mandateId, roundTxHash, at: Date.now(), ...extra };
  writeAll(all);
}

export function recallRound(user, tokenIn, tokenOut) {
  const e = readAll()[slot(user, tokenIn, tokenOut)];
  return e ? { roundTxHash: e.roundTxHash || null, at: e.at || null } : null;
}

export function recallMandate(user, tokenIn, tokenOut) {
  return readAll()[slot(user, tokenIn, tokenOut)]?.mandateId || null;
}

/**
 * Every mandate id remembered for `user`, newest first.
 *
 * /api/genlayer-validate is given all of them and picks the one that covers the
 * trade, so this side never has to agree with the server on how a token is
 * spelled (symbol, checksum, native as zero) to find the right one.
 */
export function recallMandateIds(user) {
  if (!user) return [];
  const prefix = `${String(user).toLowerCase()}|`;
  return Object.entries(readAll())
    .filter(([k, v]) => k.startsWith(prefix) && v?.mandateId)
    .sort((a, b) => (b[1].at || 0) - (a[1].at || 0))
    .map(([, v]) => v.mandateId)
    .slice(0, 8);
}

export function forgetMandate(user, tokenIn, tokenOut) {
  const all = readAll();
  delete all[slot(user, tokenIn, tokenOut)];
  writeAll(all);
}

/**
 * Mandates asked for but not yet seen on the executor, for the background
 * watcher. Each check it makes also nudges the round toward finalization.
 */
export function listUnconfirmedMandates(now = Date.now()) {
  return Object.entries(readAll())
    .filter(([, v]) => v?.mandateId && v?.roundTxHash && !v.live && now - (v.at || 0) < MANDATE_WATCH_MS)
    .map(([k, v]) => {
      const [user, tokenIn, tokenOut] = k.split('|');
      return { user, tokenIn, tokenOut, mandateId: v.mandateId, roundTxHash: v.roundTxHash, at: v.at };
    });
}

/**
 * A lane runs out two ways: its day expires, or its budget is spent. Either
 * drops the user back to the 30-minute rail without a word, so the background
 * job replaces a lane before that happens.
 */
export const MANDATE_RENEW_BEFORE_MS = 2 * 60 * 60 * 1000;

/** Lanes seen live on the executor, for the background job to keep fresh. */
export function listLiveMandates() {
  return Object.entries(readAll())
    .filter(([, v]) => v?.mandateId && v.live)
    .map(([k, v]) => {
      const [user, tokenIn, tokenOut] = k.split('|');
      return { user, tokenIn, tokenOut, mandateId: v.mandateId, maxAmountIn: v.maxAmountIn || null };
    });
}

/** Does this lane need replacing? Takes what /api/agent-mandate reports. */
export function laneIsRunningOut({ expiry, remainingBudget, maxAmountIn }, now = Date.now()) {
  const endsAt = Number(expiry || 0) * 1000;
  if (endsAt > 0 && endsAt - now < MANDATE_RENEW_BEFORE_MS) return true;
  try {
    return BigInt(remainingBudget || 0) < BigInt(maxAmountIn || 0);
  } catch {
    return false;
  }
}

/** Record that a mandate reached the executor. Returns true the first time. */
export function markMandateLive(user, tokenIn, tokenOut) {
  const all = readAll();
  const key = slot(user, tokenIn, tokenOut);
  if (!all[key] || all[key].live) return false;
  all[key] = { ...all[key], live: true, liveAt: Date.now() };
  writeAll(all);
  return true;
}

/**
 * Start a mandate round in the background.
 *
 * Fire-and-forget from the caller's point of view: the round takes the appeal
 * window to become usable, so nothing should wait on it.
 *
 * The ceilings are what make this a bounded authority rather than a blank
 * cheque, and the consensus round enforces its own on top of them (it refuses a
 * per-trade cap above a tenth of the pool's reserve, for one).
 */
export async function requestMandate({ user, tokenIn, tokenOut, maxAmountIn = null, totalBudgetIn = null, maxSlippageBps = 100 }) {
  try {
    const res = await fetch('/api/agent-mandate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // No bounds means "size it to the pool": the route reads the pinned
      // pool's reserve and asks for the most consensus allows, one notch under
      // its limit. A caller with its own policy still passes them.
      body: JSON.stringify({
        user, tokenIn, tokenOut,
        ...(maxAmountIn ? { maxAmountIn: String(maxAmountIn) } : {}),
        ...(totalBudgetIn ? { totalBudgetIn: String(totalBudgetIn) } : {}),
        maxSlippageBps,
      }),
    });
    const d = await res.json();
    // Remember it only if a round actually carries it.
    if (res.ok && d?.mandateId && (d.roundTxHash || d.approved)) {
      // The bounds the round actually carries, not the ones asked for.
      rememberMandate(user, tokenIn, tokenOut, d.mandateId, d.roundTxHash, {
        maxAmountIn: String(d.requested?.maxAmountIn ?? maxAmountIn ?? ''),
        totalBudgetIn: String(d.requested?.totalBudgetIn ?? totalBudgetIn ?? ''),
      });
      return { ok: true, mandateId: d.mandateId, roundTxHash: d.roundTxHash || null, requested: d.requested || null };
    }
    return { ok: false, error: d?.error || 'no mandate id returned' };
  } catch (e) {
    return { ok: false, error: e?.message || 'mandate request failed' };
  }
}

/**
 * After a trade had to take the per-order rail, make the next one like it fast.
 *
 * Called with the order /api/genlayer-validate built, and only when that route
 * said a mandate could carry a trade of this shape (`mandate_eligible`). Does
 * nothing while an earlier request for the same pair and direction is still
 * finalizing, so one browser cannot stack up consensus rounds.
 *
 * @returns {{ status: 'requested'|'pending'|'backoff'|'failed'|'skipped', mandateId?, error? }}
 */
export async function ensureMandateRequested({ user, tokenIn, tokenOut, amountIn, slippageBps = 100 }) {
  if (!user || !tokenIn || !tokenOut || !amountIn) return { status: 'skipped' };
  const all = readAll();
  const key = slot(user, tokenIn, tokenOut);
  const entry = all[key];
  const now = Date.now();

  let size;
  try { size = BigInt(amountIn); } catch { return { status: 'skipped' }; }
  if (size <= 0n) return { status: 'skipped' };

  // A lane too small for the trade in hand is why that trade is on the slow
  // rail. Asking again is worth one round: the pool may hold more than it did,
  // and the lane is sized from the pool now rather than from an older trade.
  let ceiling = 0n;
  try { ceiling = BigInt(entry?.maxAmountIn || 0); } catch { ceiling = 0n; }
  const outgrown = ceiling > 0n && size > ceiling;

  if (entry?.mandateId && !outgrown && now - (entry.at || 0) < MANDATE_PENDING_MS) {
    return { status: 'pending', mandateId: entry.mandateId };
  }
  if (entry?.failedAt && now - entry.failedAt < MANDATE_RETRY_MS) {
    return { status: 'backoff' };
  }
  // One upgrade attempt per pair per pending window: a pool does not deepen
  // every five minutes, and each attempt is a consensus round.
  if (outgrown && now - (entry.upgradedAt || 0) < MANDATE_PENDING_MS) {
    return { status: 'backoff' };
  }

  const r = await requestMandate({
    user, tokenIn, tokenOut,
    maxSlippageBps: Math.max(1, Math.min(Number(slippageBps) || 100, 300)),
  });
  if (r.ok) {
    if (outgrown) {
      // Remembered after the request, because storing the new mandate rewrites
      // this slot.
      const marked = readAll();
      marked[key] = { ...(marked[key] || {}), upgradedAt: now };
      writeAll(marked);
    }
    // Asked for in the background, so it is announced rather than silent: a
    // mandate is an authority over the user's trades in this direction.
    notices.fastLaneRequested(r.mandateId, pairLabel(tokenIn, tokenOut));
    return { status: 'requested', mandateId: r.mandateId, requested: r.requested };
  }

  const next = readAll();
  next[key] = { ...(next[key] || {}), failedAt: Date.now(), lastError: r.error };
  writeAll(next);
  return { status: 'failed', error: r.error };
}
