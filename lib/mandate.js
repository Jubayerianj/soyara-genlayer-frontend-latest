// lib/mandate.js
//
// The client half of fast agentic settlement.
//
// WHY ANY OF THIS EXISTS
// ----------------------
// A per-order GenLayer verdict cannot be fast. It reaches AgentExecutor as an
// EVM-bound external message, and GenVM's `EthSend` emission carries only
// address, calldata, value and fees - no delivery-timing field, unlike
// `PostMessage` and `DeployContract` which both take `on` ("accepted" |
// "finalized"). An Intelligent Contract therefore cannot ask for earlier
// delivery; the chain applies finalization, which on Bradbury is the appeal
// window. Per trade, that is fifteen to twenty-five minutes of waiting.
//
// A mandate pays that once. Consensus approves a bounded authority - this user,
// this pair and direction, a per-trade ceiling, a lifetime budget, a slippage
// and fee cap, one route pinned by hash - and afterwards each trade is a single
// EVM transaction.
//
// The job of this module is to make that wait invisible: ask for a mandate the
// moment a user shows intent, remember it, and have one ready before they
// decide to trade.
//
// WHAT A MANDATE DOES NOT WEAKEN
// ------------------------------
// It is created by `recordMandate`, which is onlyValidator - so only a
// consensus round can produce one, exactly as for a per-order verdict. Each
// trade is then checked by the EXECUTOR against it: route by hash, fee, fee
// collector, user, per-trade ceiling, lifetime budget. And the executor prices
// the trade itself from the pinned pool's live reserves, so unlike the
// per-order path there is no supplied quote to trust and none that can go
// stale.

const KEY = 'soyara.mandates.v1';

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

export function rememberMandate(user, tokenIn, tokenOut, mandateId) {
  if (!mandateId) return;
  const all = readAll();
  all[slot(user, tokenIn, tokenOut)] = { mandateId, at: Date.now() };
  writeAll(all);
}

export function recallMandate(user, tokenIn, tokenOut) {
  return readAll()[slot(user, tokenIn, tokenOut)]?.mandateId || null;
}

export function forgetMandate(user, tokenIn, tokenOut) {
  const all = readAll();
  delete all[slot(user, tokenIn, tokenOut)];
  writeAll(all);
}

/**
 * Is there a mandate on chain that can settle this trade right now?
 *
 * Checks liveness AND remaining budget, because a mandate whose budget is spent
 * is live but useless - settling against it would revert, and the user would
 * see a failure for something the app could have known about.
 *
 * @returns {{ usable: boolean, mandateId: string|null, reason?: string }}
 */
export async function findUsableMandate({ user, tokenIn, tokenOut, amountIn }) {
  const mandateId = recallMandate(user, tokenIn, tokenOut);
  if (!mandateId) return { usable: false, mandateId: null, reason: 'none issued yet' };

  try {
    const res = await fetch('/api/agent-mandate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mandateId, checkOnly: true }),
    });
    const d = await res.json();

    if (!d.live) return { usable: false, mandateId, reason: 'expired or revoked' };

    const want      = BigInt(amountIn || 0);
    const remaining = BigInt(d.remainingBudget || 0);
    const perTrade  = BigInt(d.maxAmountIn || 0);

    if (want > perTrade)  return { usable: false, mandateId, reason: 'trade exceeds the per-trade ceiling' };
    if (want > remaining) return { usable: false, mandateId, reason: 'mandate budget exhausted' };

    return { usable: true, mandateId };
  } catch (e) {
    // A failed check must degrade to the slow path, never block the trade.
    return { usable: false, mandateId, reason: e?.message || 'check failed' };
  }
}

/**
 * Start a mandate round in the background.
 *
 * Deliberately fire-and-forget from the caller's point of view: the round takes
 * the appeal window to become usable, so nothing should wait on it. Call it as
 * early as possible - on connect, or the moment a proposal names a pair - and
 * by the time the user commits to a trade there is a good chance it is ready.
 *
 * The ceilings are what make this a bounded authority rather than a blank
 * cheque, and the consensus round enforces them independently of whatever is
 * asked for here.
 */
export async function requestMandate({ user, tokenIn, tokenOut, maxAmountIn, totalBudgetIn, maxSlippageBps = 100 }) {
  try {
    const res = await fetch('/api/agent-mandate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user, tokenIn, tokenOut,
        maxAmountIn: String(maxAmountIn),
        totalBudgetIn: String(totalBudgetIn),
        maxSlippageBps,
      }),
    });
    const d = await res.json();
    if (d?.mandateId) {
      rememberMandate(user, tokenIn, tokenOut, d.mandateId);
      return { ok: true, mandateId: d.mandateId };
    }
    return { ok: false, error: d?.error || 'no mandate id returned' };
  } catch (e) {
    return { ok: false, error: e?.message || 'mandate request failed' };
  }
}
