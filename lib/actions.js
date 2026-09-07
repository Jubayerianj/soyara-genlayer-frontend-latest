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

/** The settlement endpoint an action may use, or null if it may not settle. */
export function routeForAction(action) {
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
  const allowed = routeForAction(a);
  if (allowed !== route) {
    throw new Error(
      `Refusing to settle a ${a} request through ${route}. `
      + `${allowed ? `It may only use ${allowed}.` : 'It has no settlement route.'} `
      + 'Nothing has moved.'
    );
  }
}
