// lib/studioNext/intent.js
//
// What a chat message asks the Studio Next desk to do.
//
// Token and direction come from the shared parser (lib/parseIntent.js), so the
// ordering rules learned on Bradbury apply here too. Amounts are read here as
// decimal STRINGS, never as floats, because they become raw 18-decimal units.
//
// A mandate request is recognised before a swap, since "let my agent swap up
// to 60 USDC into USDT" contains a swap verb and must not become a trade.
//
// Only a request the shared parser reads as a SWAP becomes one. An earlier
// version also treated "two tokens and an amount" as a swap, which made
// "add 10 USDC and USDT liquidity" a quoted trade with a Swap button under it:
// the same defaulting bug that once sold a user's USDC on Bradbury. Liquidity
// goes to the pools app, and anything unrecognised routes nowhere.

import { parseIntent, normalizeSymbol } from '../parseIntent.js';
import { isLiquidityIntent } from '../pools.js';
import { STUDIO_NEXT } from '../../constants/studioNext.js';

const NUMBER = /\d+(?:\.\d+)?/g;

/** GEN is the fee token on Studio Next; the tradeable one is WGEN. */
function studioSymbol(sym) {
  if (!sym) return null;
  const s = sym === 'GEN' ? 'WGEN' : sym;
  return STUDIO_NEXT.tokens.includes(s) ? s : null;
}

function minutesFrom(text) {
  if (/\b(?:for|within)\s+(?:the\s+next\s+|a\s+|an\s+|one\s+)?day\b/.test(text)) return 24 * 60;
  if (/\b(?:for|within)\s+(?:the\s+next\s+|an\s+|one\s+)?hour\b/.test(text)) return 60;
  const m = /(\d+(?:\.\d+)?)\s*(minutes?|mins?|m|hours?|hrs?|h|days?|d)\b/.exec(text);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const unit = m[2][0];
  return Math.round(unit === 'm' ? n : unit === 'h' ? n * 60 : n * 24 * 60);
}

/** Remove durations and percentages so they are never read as token amounts. */
function stripNonAmounts(text) {
  return text
    .replace(/\d+(?:\.\d+)?\s*%/g, ' ')
    .replace(/\d+(?:\.\d+)?\s*(?:minutes?|mins?|hours?|hrs?|days?)\b/g, ' ')
    .replace(/\b\d+(?:\.\d+)?\s*(?:m|h|d)\b/g, ' ');
}

function slippageFrom(text) {
  const m = /(\d+(?:\.\d+)?)\s*%/.exec(text);
  if (!m || !/slippage|tolerance|slip\b|worst|below/.test(text)) return STUDIO_NEXT.defaultSlippageBps;
  return Math.min(STUDIO_NEXT.maxSlippageBps, Math.max(1, Math.round(parseFloat(m[1]) * 100)));
}

const MANDATE = /\b(?:let|allow|authori[sz]e|permit|give|grant)\b[^.]*\bagent\b|\bmandate\b|\bfast lane\b|\bauto[- ]?trad/;

export function parseStudioIntent(input) {
  const raw = String(input || '').trim();
  const text = raw.toLowerCase();

  if (!text) return { kind: 'help', needs: [] };
  if (/\b(?:faucet|test funds|test tokens|get funds|fund me|claim)\b/.test(text)) return { kind: 'faucet', needs: [] };
  if (/\b(?:revoke|cancel|stop)\b[^.]*\b(?:mandate|agent|fast lane)\b/.test(text)) return { kind: 'revoke', needs: [] };
  if (/\bbalances?\b|\bportfolio\b|\bwhat do i (?:have|hold)\b/.test(text) && !MANDATE.test(text)) return { kind: 'balances', needs: [] };

  const shared = parseIntent(raw);
  if (isLiquidityIntent(shared.action)) {
    return { kind: 'liquidity', action: shared.action, tokenIn: shared.tokenIn, tokenOut: shared.tokenOut, needs: [] };
  }
  if (shared.action === 'WRAP' || shared.action === 'UNWRAP') return { kind: 'wrap', needs: [] };
  const tokenIn = studioSymbol(shared.tokenIn);
  const tokenOut = studioSymbol(shared.tokenOut);
  const needs = [];
  // A named token with no pool here is not something to ask about: say which
  // tokens exist instead. Callers show `unsupported` before `needs`.
  const unsupported = [shared.tokenIn, shared.tokenOut].filter((s) => s && !studioSymbol(s));
  if (unsupported.length) {
    return { kind: MANDATE.test(text) ? 'mandate' : 'swap', unsupported, needs: [`a token with a Studio Next pool`] };
  }

  const amounts = stripNonAmounts(text).match(NUMBER) || [];

  if (MANDATE.test(text)) {
    const capMatch = /(\d+(?:\.\d+)?)\s*(?:[a-z]+\s+)?(?:(?:per|each|a)\s+(?:trade|swap|time|order)\b|each\b|apiece\b)/.exec(stripNonAmounts(text))
      || /\b(?:per|each)\s+(?:trade|swap|order)\s*(?:of\s+|max\s+|up to\s+|at most\s+)?(\d+(?:\.\d+)?)/.exec(stripNonAmounts(text));
    const budgetMatch = /\b(?:up to|budget(?: of)?|total(?: of)?|in total|at most|maximum of)\s+(\d+(?:\.\d+)?)/.exec(stripNonAmounts(text));
    const cap = capMatch ? capMatch[1] : null;
    let budget = budgetMatch && budgetMatch[1] !== cap ? budgetMatch[1] : null;
    if (!budget) budget = amounts.find((a) => a !== cap) || null;
    if (!tokenIn || !tokenOut) needs.push('which token the agent sells and which it buys');
    if (tokenIn && tokenOut && tokenIn === tokenOut) needs.push('two different tokens');
    if (!budget) needs.push('a total budget, like "up to 60 USDC"');
    const minutes = minutesFrom(text) ?? STUDIO_NEXT.defaultMandateMinutes;
    return {
      kind: 'mandate',
      tokenIn,
      tokenOut,
      budget,
      cap: cap || budget,
      minutes: Math.min(STUDIO_NEXT.maxMandateMinutes, Math.max(1, minutes)),
      slippageBps: slippageFrom(text),
      instruction: raw.slice(0, 280),
      needs,
    };
  }

  if (shared.action === 'SWAP' || shared.action === 'COMPARE') {
    if (!tokenIn) needs.push('which token to sell');
    if (!tokenOut) needs.push('which token to buy');
    if (tokenIn && tokenOut && tokenIn === tokenOut) needs.push('two different tokens');
    if (!amounts.length) needs.push('how much to sell');
    return {
      kind: 'swap',
      tokenIn,
      tokenOut,
      amount: amounts[0] || null,
      slippageBps: slippageFrom(text),
      needs,
    };
  }

  if (/\bmandates?\b|\bmy agent\b/.test(text)) return { kind: 'mandates', needs: [] };
  return { kind: 'help', needs: [], symbol: normalizeSymbol(shared.tokenIn) };
}
