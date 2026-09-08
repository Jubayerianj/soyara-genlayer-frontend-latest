// lib/actions.js
//
// Which settlement route an intent is allowed to reach.
//
// This exists because a deposit settled as a swap. The rule that decided it was
// an inline ternary in a component:
//
//   action: intent?.action === 'ADD_LIQUIDITY' ? 'ADD_LIQUIDITY' : 'SWAP'
//
// Any value that was not exactly that string fell through to SWAP, so the
// default case of a defaulting rule was the branch that spends money. A user
// asking to add liquidity had 10 USDC traded for USDT on chain.
//
// Two things fix that class of bug rather than the instance: the rule lives
// somewhere it can be tested, and there is no default. An action this module
// does not recognise resolves to UNKNOWN and routes nowhere.

export const KNOWN_ACTIONS = ['SWAP', 'ADD_LIQUIDITY', 'REMOVE_LIQUIDITY', 'WRAP', 'UNWRAP'];

/** Normalise an action. Unrecognised input becomes UNKNOWN, never SWAP. */
export function normaliseAction(raw) {
  const a = String(raw ?? '').trim().toUpperCase();
  return KNOWN_ACTIONS.includes(a) ? a : 'UNKNOWN';
}

/**
 * Direct settlement: the agent proposes, the USER signs, one block.
 *
 * This is the fast path, and it is fast for one reason - it does not wait on a
 * GenLayer verdict. A verdict reaches the executor as an EVM-bound external
 * message delivered only on finalization (GenVM's EthSend carries no
 * delivery-timing field, unlike PostMessage), which is the appeal window,
 * fifteen to twenty-five minutes. Nothing in the app can shorten that.
 *
 * WHAT IT GIVES UP, PLAINLY
 * -------------------------
 * The trade is NOT gated on a consensus verdict. The agent chooses the route,
 * the quote and the fee, and the user's signature is what authorises it - the
 * same trust model as the /swap page, where a person reads a quote and signs
 * it. What protects the user here is the entrypoint's own minAmountOut check
 * and their wallet prompt, not GenLayer.
 *
 * WHAT IT DOES NOT GIVE UP
 * ------------------------
 * Custody. Funds move from the user's wallet to the pool in one transaction
 * they signed; no operator ever holds them, and the output is bound to the
 * user's own address.
 *
 * The consensus path remains available and is what the enforced flow uses.
 * This is a deliberate, named mode - not a silent fallback that drops
 * enforcement when something is misconfigured, which is what was removed here
 * before and what the GenLayer review objected to.
 */
export const DIRECT_SETTLEMENT = 'direct:AGGFlowEntrypoint';

/** The settlement endpoint an action may use, or null if it may not settle. */
export function routeForAction(action, { direct = false } = {}) {
  if (direct && normaliseAction(action) === 'SWAP') return DIRECT_SETTLEMENT;
  switch (normaliseAction(action)) {
    case 'SWAP': return '/api/agent-execute';
    case 'ADD_LIQUIDITY': return '/api/agent-add-liquidity';
    case 'REMOVE_LIQUIDITY': return '/api/agent-remove-liquidity';
    // Wraps are a direct token call, not a settlement route.
    case 'WRAP':
    case 'UNWRAP': return null;
    default: return null;
  }
}

/**
 * Throw unless `action` is allowed to use `route`.
 *
 * Called immediately before the request that moves funds. The branches above it
 * should already have dispatched correctly; this is here because once they did
 * not, and the cost of the check is nothing against the cost of being wrong.
 */
export function assertSettlementRoute(action, route) {
  const a = normaliseAction(action);
  const allowed = routeForAction(a, { direct: route === DIRECT_SETTLEMENT });
  if (allowed !== route) {
    throw new Error(
      `Refusing to settle a ${a} request through ${route}. `
      + `${allowed ? `It may only use ${allowed}.` : 'It has no settlement route.'} `
      + 'Nothing has moved.'
    );
  }
}
