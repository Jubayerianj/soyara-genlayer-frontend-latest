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
 * The rails an agent trade can settle on. Both end in AgentExecutor, and both
 * need an authority that only the AgentValidator Intelligent Contract can
 * write:
 *
 *   consensus  a per-order verdict for this exact order's commitment. Single
 *              use, consumed by `executeSwap`. It reaches the executor when
 *              the consensus round finalizes.
 *   mandate    a bounded authority an earlier consensus round issued for this
 *              user, pair and direction. The executor checks each trade
 *              against it and prices it from the pinned pool's live reserves
 *              (`executeSwapUnderMandate`), so it settles in seconds.
 *
 * There is no third rail. The agent surfaces used to have one, "direct
 * settlement", where the user signed an AGGFlowEntrypoint swap and no verdict
 * was checked at all. It was the default for /ai and /a2a and it is gone: an
 * agent trade that the executor has not been authorised to settle does not
 * settle. People who want to sign a swap themselves use /swap, which says so.
 */
export const SETTLEMENT_RAILS = Object.freeze(['consensus', 'mandate']);

/**
 * The rail a validation result authorises, or null.
 *
 * Deliberately strict. A missing or unrecognised rail resolves to null, never
 * to a default: a defaulting rule must not be able to route a trade somewhere
 * nobody chose.
 */
export function settlementRailOf(validation) {
  if (!validation?.approved) return null;
  const rail = String(validation.rail ?? '').trim().toLowerCase();
  if (rail === 'mandate') return validation.mandate_id || validation.mandateId ? 'mandate' : null;
  if (rail === 'consensus') return 'consensus';
  return null;
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
