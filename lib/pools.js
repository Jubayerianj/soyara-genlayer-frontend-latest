// lib/pools.js
// ============================================================================
//  Liquidity is not the aggregator's job.
//
//  The aggregator routes and settles swaps. Deposits and withdrawals belong to
//  the pools app, which is built for them. Carrying a half-supported liquidity
//  path through the agent surfaces produced a run of confusing failures - a
//  deposit quoted as a swap, a "Deposit into Pool" button that settled a trade -
//  and none of it bought the user anything the pools page does not do better.
//
//  This module is deliberately dependency-free so both the browser swarm and the
//  API routes can share one definition of the handoff. Two copies of a rule like
//  this is how the same bug gets fixed twice and shipped once.
// ============================================================================

export const POOLS_URL = 'https://app.soyara.com/pools';

export function isLiquidityIntent(action) {
  const a = String(action || '').trim().toUpperCase();
  return a === 'ADD_LIQUIDITY' || a === 'REMOVE_LIQUIDITY';
}

/** True when the free-text request is about liquidity rather than a trade. */
export function mentionsLiquidity(text) {
  return /\b(liquidity|lp\b|deposit|provide|pool(?:s)?)\b/i.test(String(text || ''));
}

export function liquidityRedirectMessage(action, tokenA, tokenB) {
  const pair = tokenA && tokenB ? ` for **${tokenA}/${tokenB}**` : '';
  const verb = String(action || '').toUpperCase() === 'REMOVE_LIQUIDITY' ? 'Withdrawing' : 'Adding';
  return `💧 **${verb} liquidity${pair} happens on the pools app**, not here.\n\n`
    + `This swarm routes and settles **swaps**: it compares every venue, reads the pools behind the quote, `
    + `runs the trade through GenLayer consensus, and verifies on-chain that the approved commitment binds `
    + `the route, the fee, you and the quote. Liquidity positions are a different job with a different `
    + `interface.\n\n👉 [Open the pools app](${POOLS_URL})\n\n`
    + `Or tell me a swap and I will take it from there.`;
}
