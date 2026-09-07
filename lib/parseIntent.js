// lib/parseIntent.js
//
// One natural-language intent parser, shared by /ai (pages/api/agent-v2.js) and
// /a2a (services/a2a/agents.js).
//
// There used to be two independent parsers, and every parsing bug had to be
// found and fixed twice - the reversed-direction bug ("swap 0.1 GEN to USDC"
// buying GEN) and the venue bug both shipped in both files. One parser, one set
// of tests.
//
// Design rules learned from those bugs:
//
//  1. NEVER invent a token. An under-specified or misspelled request returns
//     `needs` so the caller can ask, rather than defaulting to a pair the user
//     never named and trading it.
//  2. Order tokens by POSITION IN THE SENTENCE, never by position in a list.
//  3. Match tokens on word boundaries - "wgen" contains "gen".
//  4. Swaps always route 'best' through the aggregator. A venue is only
//     meaningful for liquidity, where it selects which pool the position lives
//     in.
//  5. Strip venue markers and percentages before reading amounts, or "v2" and
//     "0.3%" get read as trade sizes.

export const KNOWN_TOKENS = ['USDC', 'USDT', 'GEN', 'WGEN', 'WBTC', 'ETH', 'FSWP'];

const ALIASES = {
  // "usd" is by far the most common shorthand people type for USDC, and
  // rejecting it sent users round a loop of clarification questions.
  ZKUSDC: 'USDC', USDCE: 'USDC', 'USD-C': 'USDC', USD: 'USDC', USDCOIN: 'USDC',
  UDSC: 'USDC', USCD: 'USDC',
  ZKUSDT: 'USDT', TETHER: 'USDT', UDST: 'USDT', USTD: 'USDT',
  WSOMI: 'WGEN', 'WRAPPED GEN': 'WGEN',
  GENLAYER: 'GEN', SOMI: 'GEN',
  ZKBTC: 'WBTC', BTC: 'WBTC', BITCOIN: 'WBTC',
  LETH: 'ETH', ETHEREUM: 'ETH',
  SOYARA: 'FSWP', SOY: 'FSWP', FLIPSWAP: 'FSWP',
};

export function normalizeSymbol(raw) {
  if (!raw) return null;
  const s = String(raw).trim().toUpperCase();
  if (KNOWN_TOKENS.includes(s)) return s;
  return ALIASES[s] || null;
}

/** Every known symbol/alias, longest first so "WGEN" wins over "GEN". */
const MATCHABLE = [...KNOWN_TOKENS, ...Object.keys(ALIASES)].sort((a, b) => b.length - a.length);

function findTokens(text) {
  const seen = [];
  for (const word of MATCHABLE) {
    const m = new RegExp(`\\b${word.replace(/[-\s]/g, '[-\\s]?')}\\b`, 'i').exec(text);
    if (!m) continue;
    const sym = normalizeSymbol(word);
    if (!sym) continue;
    // Keep the earliest mention of each resolved symbol.
    const prior = seen.find((x) => x.sym === sym);
    if (prior) { if (m.index < prior.at) prior.at = m.index; continue; }
    seen.push({ sym, at: m.index });
  }
  return seen.sort((a, b) => a.at - b.at).map((x) => x.sym);
}

/**
 * Parse a natural-language trading request.
 *
 * @returns {{
 *   action: 'SWAP'|'ADD_LIQUIDITY'|'REMOVE_LIQUIDITY'|'WRAP'|'UNWRAP'|'COMPARE'|'QUESTION',
 *   tokenIn: string|null, tokenOut: string|null,
 *   amountIn: number|null, amountOut: number|null, percent: number|null,
 *   slippageBps: number, venue: 'best'|'v2'|'v3',
 *   needs: string[],           // what must be clarified before acting
 *   confident: boolean,        // safe to build a proposal from
 *   raw: string
 * }}
 */
export function parseIntent(input, defaults = {}) {
  const raw = String(input || '');
  const text = raw.toLowerCase();
  const DEFAULT_SLIPPAGE_BPS = defaults.slippageBps ?? 100;

  const needs = [];
  const tokens = findTokens(text);

  // ── Venue ────────────────────────────────────────────────────────────────
  // Only meaningful for liquidity. Swaps are forced to 'best' below.
  const wantsV3 = /\bv3\b|\bconcentrated\b|\bclamm\b/.test(text);
  const wantsV2 = /\bv2\b|\bconstant product\b|\bclassic\b/.test(text);

  // ── Amounts ──────────────────────────────────────────────────────────────
  const percentMatch = text.match(/(\d+(?:\.\d+)?)\s*%/);
  const cleaned = text
    .replace(/\d+(?:\.\d+)?\s*%/g, ' ')   // slippage / percentages
    .replace(/\bv[23]\b/g, ' ');          // venue markers
  const numbers = (cleaned.match(/\d+(?:\.\d+)?/g) || []).map(Number);

  // ── Slippage ─────────────────────────────────────────────────────────────
  // A percentage is slippage only when the wording says so; otherwise (e.g.
  // "remove 50% liquidity") it is a size.
  const slippageStated = /slippage|tolerance|slip\b/.test(text) && percentMatch;
  const slippageBps = slippageStated
    ? Math.round(parseFloat(percentMatch[1]) * 100)
    : DEFAULT_SLIPPAGE_BPS;

  // ── Action ───────────────────────────────────────────────────────────────
  const mentionsLiquidity = /\bliquidity\b|\blp\b|\bpool\b|\bposition\b/.test(text);
  const addVerb = /\badd\b|\bprovide\b|\bdeposit\b|\bsupply\b|\bseed\b|\bmint\b/.test(text);
  const removeVerb = /\bremove\b|\bwithdraw\b|\bexit\b|\bpull\b|\bburn\b|\bredeem\b/.test(text);
  const swapVerb = /\bswap\b|\btrade\b|\bbuy\b|\bsell\b|\bexchange\b|\bconvert\b/.test(text);
  const compareVerb = /\bcompare\b|\bvs\b|\bversus\b|\bbetter\b|\bwhich route\b/.test(text);
  const wrapVerb = /\bwrap\b/.test(text) && !/\bunwrap\b/.test(text);
  const unwrapVerb = /\bunwrap\b/.test(text);

  // "and" joins the two sides of a DEPOSIT; "to"/"for"/"into" mark the
  // destination of a SWAP. This distinction matters more than the word
  // "liquidity": "add 10 usdt and usdc on v3" contains no liquidity keyword at
  // all, and was previously parsed as a swap - which then really did sell the
  // user's USDT instead of depositing it.
  const joinsWithAnd = /\b(?:and|\+|&|plus|with)\b/.test(text);
  const hasSwapPreposition = /\b(?:to|for|into)\s+[a-z]/i.test(text);
  const depositShape = addVerb && tokens.length >= 2 && joinsWithAnd && !hasSwapPreposition;

  let action;
  if (wrapVerb) action = 'WRAP';
  else if (unwrapVerb) action = 'UNWRAP';
  else if (mentionsLiquidity && removeVerb) action = 'REMOVE_LIQUIDITY';
  else if (mentionsLiquidity && (addVerb || !removeVerb)) action = 'ADD_LIQUIDITY';
  else if (depositShape) action = 'ADD_LIQUIDITY';
  else if (removeVerb && !swapVerb) action = 'REMOVE_LIQUIDITY';
  else if (compareVerb && !swapVerb) action = 'COMPARE';
  else if (swapVerb) action = 'SWAP';
  else if (tokens.length >= 2 && numbers.length > 0 && hasSwapPreposition) action = 'SWAP';
  else if (tokens.length >= 2 && numbers.length > 0 && !addVerb) action = 'SWAP';
  else if (addVerb && tokens.length >= 2) action = 'ADD_LIQUIDITY';
  else action = 'QUESTION';

  // ── Direction ────────────────────────────────────────────────────────────
  // A token introduced by to/for/into is the DESTINATION. Used to resolve the
  // one-token case correctly instead of assuming the named token is the source.
  const destWord = /\b(?:to|for|into)\s+([a-z][a-z0-9-]*)/i.exec(text);
  const namedDest = destWord ? normalizeSymbol(destWord[1]) : null;
  const destUnrecognised = Boolean(destWord && !namedDest
    && !/\bthe\b|\bmy\b|\ba\b|\bpool\b|\bliquidity\b/i.test(destWord[1]));

  let tokenIn = null;
  let tokenOut = null;
  if (tokens.length >= 2) {
    [tokenIn, tokenOut] = tokens;
  } else if (tokens.length === 1) {
    if (namedDest === tokens[0]) { tokenOut = tokens[0]; }
    else { tokenIn = tokens[0]; }
  }

  if (action === 'WRAP') { tokenIn = 'GEN'; tokenOut = 'WGEN'; }
  if (action === 'UNWRAP') { tokenIn = 'WGEN'; tokenOut = 'GEN'; }

  // ── What is missing? ─────────────────────────────────────────────────────
  if (destUnrecognised) needs.push(`unrecognised token "${destWord[1]}"`);
  if (action === 'SWAP' || action === 'COMPARE') {
    if (!tokenIn) needs.push('which token to swap from');
    if (!tokenOut) needs.push('which token to receive');
    if (tokenIn && tokenOut && tokenIn === tokenOut) needs.push('two different tokens');
    // A deposit verb on something we read as a swap is the dangerous ambiguity:
    // "add 10 usdt and usdc" once parsed as SWAP and really did sell the user's
    // USDT. When both readings are plausible, ask - never trade on a guess.
    if (addVerb) needs.push('whether you meant to SWAP these tokens or ADD LIQUIDITY with them');
    if (removeVerb) needs.push('whether you meant to SWAP or REMOVE LIQUIDITY');
  }
  if (action === 'ADD_LIQUIDITY') {
    // One named token is not a dead end - the caller can look up which pools
    // exist for it and either pick the only one or offer the choices. Telling
    // the user "both tokens for the pool" and nothing else made them retry the
    // same request over and over.
    if (!tokenIn && !tokenOut) needs.push('which two tokens to pool');
    else if (!tokenIn || !tokenOut) needs.push('pair-token');
  }
  if (action === 'REMOVE_LIQUIDITY') {
    if (!tokenIn || !tokenOut) needs.push('which pool to withdraw from');
    if (!percentMatch && numbers.length === 0) needs.push('how much to withdraw');
  }

  const percent = action === 'REMOVE_LIQUIDITY' && percentMatch
    ? parseFloat(percentMatch[1])
    : null;

  return {
    action,
    tokenIn,
    tokenOut,
    amountIn: numbers.length > 0 ? numbers[0] : null,
    amountOut: numbers.length > 1 ? numbers[1] : null,
    percent,
    slippageBps: Math.min(300, Math.max(1, slippageBps)),
    // Swaps ALWAYS take the aggregator's best route; a named venue is honoured
    // only where it genuinely selects a pool (liquidity).
    venue: (action === 'ADD_LIQUIDITY' || action === 'REMOVE_LIQUIDITY')
      ? (wantsV3 ? 'v3' : wantsV2 ? 'v2' : 'v2')
      : 'best',
    venueRequested: wantsV3 ? 'v3' : wantsV2 ? 'v2' : null,
    needs,
    confident: needs.length === 0 && action !== 'QUESTION',
    raw,
  };
}
