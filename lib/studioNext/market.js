// lib/studioNext/market.js
//
// What SoyaraAgentDex's validators will see, computed before anything is sent.
//
// The contract prices a consensus swap against the live Bradbury V2 pair for
// the same tokens. The swarm reads that same pair and runs the contract's own
// integer rules on it, so the Market Analyst can say "validators will refuse
// this" instead of letting a user sign a transaction that cannot settle.
//
// Every formula here mirrors SoyaraAgentDex.py (amount_out_for, shortfall_bps,
// deviation_bps, re_anchor) and every threshold comes from constants that
// scripts/studio-next-e2e.mjs checks against the deployed contract. The quote
// check there also compares amountOutFor with the contract's own `quote`.

import { STUDIO_NEXT } from '../../constants/studioNext.js';

export const ONE = 10n ** 18n;
const BPS = 10000n;
const GET_RESERVES = '0x0902f1ac';

export function amountOutFor(amountIn, reserveIn, reserveOut, feeBps = BigInt(STUDIO_NEXT.swapFeeBps)) {
  if (amountIn <= 0n || reserveIn <= 0n || reserveOut <= 0n) return 0n;
  const inAfterFee = amountIn * (BPS - feeBps);
  return (inAfterFee * reserveOut) / (reserveIn * BPS + inAfterFee);
}

export const priceE18 = (amountOut, amountIn) => (amountIn > 0n ? (amountOut * ONE) / amountIn : 0n);

export function shortfallBps(value, reference) {
  if (reference <= 0n || value >= reference) return 0;
  return Number(((reference - value) * BPS) / reference);
}

export function deviationBps(a, b) {
  if (b <= 0n) return Number(BPS);
  const d = a > b ? a - b : b - a;
  return Number((d * BPS) / b);
}

function isqrt(n) {
  if (n <= 0n) return 0n;
  let x = n;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + n / x) / 2n;
  }
  return x;
}

export function reAnchor(reserveBase, reserveQuote, marketBase, marketQuote) {
  const k = reserveBase * reserveQuote;
  const newBase = isqrt((k * marketBase) / marketQuote);
  if (newBase <= 0n) return [reserveBase, reserveQuote];
  return [newBase, k / newBase];
}

/** getReserves() on the Bradbury pair, in the pool's base/quote order. */
export async function readBradburyMarket(pool, { fetchImpl = fetch } = {}) {
  const res = await fetchImpl(STUDIO_NEXT.bradburyRpc, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: pool.market, data: GET_RESERVES }, 'latest'] }),
  });
  const json = await res.json();
  if (!json?.result || json.result.length < 130) throw new Error('Bradbury pool did not answer');
  const word = json.result.slice(2);
  const r0 = BigInt(`0x${word.slice(0, 64)}`);
  const r1 = BigInt(`0x${word.slice(64, 128)}`);
  const t = STUDIO_NEXT.bradburyTokens;
  const baseIsToken0 = t[pool.base].toLowerCase() < t[pool.quote].toLowerCase();
  const [reserveBase, reserveQuote] = baseIsToken0 ? [r0, r1] : [r1, r0];
  if (reserveBase <= 0n || reserveQuote <= 0n) throw new Error('Bradbury pool is empty');
  return { reserveBase, reserveQuote };
}

/**
 * The Bradbury V2 factory's pair for two tokens. The auditor uses it to prove
 * the market a Studio Next pool is priced from is the canonical pair, not an
 * address someone typed into the contract.
 */
export async function bradburyPairFor(symbolA, symbolB, { fetchImpl = fetch } = {}) {
  const a = STUDIO_NEXT.bradburyTokens[symbolA];
  const b = STUDIO_NEXT.bradburyTokens[symbolB];
  const data = `0xe6a43905${a.slice(2).toLowerCase().padStart(64, '0')}${b.slice(2).toLowerCase().padStart(64, '0')}`;
  const res = await fetchImpl(STUDIO_NEXT.bradburyRpc, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: STUDIO_NEXT.bradburyV2Factory, data }, 'latest'] }),
  });
  const json = await res.json();
  if (!json?.result) throw new Error('Bradbury factory did not answer');
  return `0x${json.result.slice(-40)}`;
}

/**
 * The consensus rail's checks for one trade, as the contract runs them.
 *
 * @returns {{
 *   marketPrice: bigint, poolPrice: bigint, fillPrice: bigint, amountOut: bigint,
 *   driftBps: number, reanchors: boolean, shareBps: number, maxAmountIn: bigint,
 *   shortfallBps: number, refusal: string|null
 * }}
 */
export function consensusCheck({ pool, tokenIn, amountIn, slippageBps, market }) {
  const sellsBase = tokenIn === pool.base;
  const marketIn = sellsBase ? market.reserveBase : market.reserveQuote;
  const marketOut = sellsBase ? market.reserveQuote : market.reserveBase;
  const marketPrice = (marketOut * ONE) / marketIn;

  let reserveBase = BigInt(pool.reserve_base);
  let reserveQuote = BigInt(pool.reserve_quote);
  const reserveIn0 = sellsBase ? reserveBase : reserveQuote;
  const reserveOut0 = sellsBase ? reserveQuote : reserveBase;
  const poolPrice = (reserveOut0 * ONE) / reserveIn0;
  const driftBps = deviationBps(poolPrice, marketPrice);
  const reanchors = driftBps > STUDIO_NEXT.maxPoolDriftBps;
  if (reanchors) [reserveBase, reserveQuote] = reAnchor(reserveBase, reserveQuote, market.reserveBase, market.reserveQuote);
  const reserveIn = sellsBase ? reserveBase : reserveQuote;
  const reserveOut = sellsBase ? reserveQuote : reserveBase;

  const amountOut = amountOutFor(amountIn, reserveIn, reserveOut);
  const fillPrice = priceE18(amountOut, amountIn);
  const shortfall = shortfallBps(fillPrice, marketPrice);
  const shareBps = Number((amountIn * BPS) / marketIn);
  const maxAmountIn = (marketIn * BigInt(STUDIO_NEXT.maxTradeShareBps)) / BPS;

  let refusal = null;
  if (amountIn > maxAmountIn) refusal = 'market';
  else if (shortfall > slippageBps) refusal = 'slippage';

  return { marketPrice, poolPrice, fillPrice, amountOut, driftBps, reanchors, shareBps, maxAmountIn, shortfallBps: shortfall, refusal };
}

/** Whether an active mandate can carry this trade under the contract's rules. */
export function mandateCovers({ mandate, agentAddress, tokenIn, tokenOut, amountIn, fillPrice, nowSec }) {
  if (!mandate || mandate.status !== 'active') return { ok: false, why: 'no active mandate' };
  if (mandate.token_in !== tokenIn || mandate.token_out !== tokenOut) return { ok: false, why: 'other pair' };
  if (!agentAddress || mandate.agent.toLowerCase() !== agentAddress.toLowerCase()) return { ok: false, why: 'another agent' };
  if (BigInt(mandate.per_trade_cap) < amountIn) return { ok: false, why: 'over its per-trade cap', cap: true };
  if (BigInt(mandate.remaining) < amountIn) return { ok: false, why: 'over its budget left', budget: true };
  if (Number(mandate.expires_at) <= nowSec + 20) return { ok: false, why: 'about to expire', expiry: true };
  if (shortfallBps(fillPrice, BigInt(mandate.ref_price)) > Number(mandate.max_slippage_bps)) return { ok: false, why: 'the price left its band', band: true };
  return { ok: true };
}
