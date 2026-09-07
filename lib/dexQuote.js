// lib/dexQuote.js
//
// EXECUTION-ACCURATE QUOTING
// ==========================
// Shared by /ai (pages/api/agent-v2.js) and /a2a (services/a2a/agents.js) so the
// two can never drift apart.
//
// Why this exists: quotes are not display-only. `minAmountOut` is derived from
// them and enforced on-chain, so an optimistic quote makes the swap revert with
// `AGGFlowEntrypoint_InsufficientAmountAfterFees()`. A quote must therefore be
// a LOWER BOUND on what the pool will actually deliver.
//
// Two rules follow from that:
//
//  1. V3 is only quoted through the real Quoter (`quoteExactInputSingle`), which
//     walks ticks and accounts for price impact. Deriving a V3 quote from the
//     `slot0` spot price ignores price impact entirely and over-promises badly
//     on thin pools - that is what caused the reverts. If the Quoter is
//     unavailable or reverts (e.g. liquidity is out of range at the current
//     price), V3 is treated as UNROUTABLE rather than guessed at.
//
//  2. The AGGFlowEntrypoint fee is taken from the INPUT token before the swap,
//     so quoting must run against the post-fee input amount.

import { createPublicClient, http } from 'viem';
import { CONTRACT_ADDRESSES } from '../constants/addresses.js';

const RPC = 'https://rpc-bradbury.genlayer.com';

export const genLayerBradburyChain = {
  id: 4221,
  name: 'GenLayer Bradbury Testnet',
  nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
  rpcUrls: { default: { http: [RPC] }, public: { http: [RPC] } },
};

let cached = null;
export function getQuoteClient() {
  if (!cached) cached = createPublicClient({ chain: genLayerBradburyChain, transport: http(RPC) });
  return cached;
}

// Fee charged by AGGFlowEntrypoint on the input token (see agent-execute.js).
export const ENTRYPOINT_FEE_BPS = 5n;

export const V3_FEE_TIERS = [500, 3000, 10000];

const V2_FACTORY_ABI = [{ name: 'getPair', type: 'function', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'address' }] }];
const V2_PAIR_ABI = [
  { name: 'getReserves', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint112' }, { type: 'uint112' }, { type: 'uint32' }] },
  { name: 'token0', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
];
const V3_FACTORY_ABI = [{ name: 'getPool', type: 'function', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'address' }, { type: 'uint24' }], outputs: [{ type: 'address' }] }];
const QUOTER_ABI = [{
  name: 'quoteExactInputSingle',
  type: 'function',
  stateMutability: 'nonpayable', // revert-based: must be simulated, not read
  inputs: [
    { name: 'tokenIn', type: 'address' },
    { name: 'tokenOut', type: 'address' },
    { name: 'fee', type: 'uint24' },
    { name: 'amountIn', type: 'uint256' },
    { name: 'sqrtPriceLimitX96', type: 'uint160' },
  ],
  outputs: [{ name: 'amountOut', type: 'uint256' }],
}];

/** Input actually reaching the pool after the entrypoint's input-side fee. */
export function applyEntrypointFee(amountInWei) {
  return (amountInWei * (10000n - ENTRYPOINT_FEE_BPS)) / 10000n;
}

/** Exact V2 output - mirrors the on-chain constant-product math (0.30% fee). */
export async function quoteV2(tokenInAddr, tokenOutAddr, amountInWei) {
  const client = getQuoteClient();
  const pair = await client.readContract({
    address: CONTRACT_ADDRESSES[4221].factory,
    abi: V2_FACTORY_ABI,
    functionName: 'getPair',
    args: [tokenInAddr, tokenOutAddr],
  }).catch(() => null);
  if (!pair || pair === '0x0000000000000000000000000000000000000000') return null;

  const [reserves, token0] = await Promise.all([
    client.readContract({ address: pair, abi: V2_PAIR_ABI, functionName: 'getReserves' }),
    client.readContract({ address: pair, abi: V2_PAIR_ABI, functionName: 'token0' }),
  ]);
  const isToken0In = token0.toLowerCase() === tokenInAddr.toLowerCase();
  const [reserve0, reserve1] = reserves;
  const reserveIn = isToken0In ? reserve0 : reserve1;
  const reserveOut = isToken0In ? reserve1 : reserve0;
  if (reserveIn === 0n || reserveOut === 0n) return null;

  const amountInWithFee = amountInWei * 997n;
  const amountOutRaw = (amountInWithFee * reserveOut) / (reserveIn * 1000n + amountInWithFee);
  if (amountOutRaw <= 0n) return null;

  const spotOutRaw = (amountInWei * reserveOut) / reserveIn;
  const priceImpactPct = spotOutRaw > 0n ? Number(((spotOutRaw - amountOutRaw) * 10000n) / spotOutRaw) / 100 : 0;

  return { pool: pair, amountOutRaw, feeTier: 3000, priceImpactPct: Math.max(0, priceImpactPct), dex: 'v2' };
}

/**
 * V3 output via the real Quoter. Returns null when no tier can actually fill -
 * deliberately, so callers never build a minAmountOut the pool cannot honour.
 */
export async function quoteV3(tokenInAddr, tokenOutAddr, amountInWei) {
  const client = getQuoteClient();
  const quoter = CONTRACT_ADDRESSES[4221].v3Quoter;
  const factory = CONTRACT_ADDRESSES[4221].v3Factory;
  if (!quoter) return null;

  // Probe every fee tier concurrently. Walking them one at a time meant up to
  // six serial RPC round trips (getPool then simulate, per tier) on the hot
  // quoting path - the dominant cost of a quote.
  const pools = await Promise.all(
    V3_FEE_TIERS.map((fee) =>
      client.readContract({
        address: factory, abi: V3_FACTORY_ABI, functionName: 'getPool', args: [tokenInAddr, tokenOutAddr, fee],
      }).then((pool) => ({ fee, pool })).catch(() => ({ fee, pool: null }))
    )
  );

  const live = pools.filter(
    (p) => p.pool && p.pool !== '0x0000000000000000000000000000000000000000'
  );
  if (live.length === 0) return null;

  const quotes = await Promise.all(
    live.map(({ fee, pool }) =>
      client.simulateContract({
        address: quoter,
        abi: QUOTER_ABI,
        functionName: 'quoteExactInputSingle',
        args: [tokenInAddr, tokenOutAddr, fee, amountInWei, 0n],
      })
        .then(({ result }) =>
          typeof result === 'bigint' && result > 0n
            ? { pool, amountOutRaw: result, feeTier: fee, priceImpactPct: fee / 10000, dex: 'v3' }
            : null
        )
        // This tier cannot fill this size (out-of-range liquidity, or no
        // quoter). Skip it rather than substituting an optimistic estimate.
        .catch(() => null)
    )
  );

  let best = null;
  for (const q of quotes) {
    if (q && (!best || q.amountOutRaw > best.amountOutRaw)) best = q;
  }
  return best;
}

/**
 * Best executable route for a swap.
 *
 * @returns {{amountOutRaw: bigint, dex: 'v2'|'v3', feeTier: number, pool: string,
 *            priceImpactPct: number, effectiveAmountInRaw: bigint}|null}
 */
export async function quoteBestRoute(tokenInAddr, tokenOutAddr, amountInWei, dexPref = 'best') {
  // Quote against what actually reaches the pool after the entrypoint fee.
  const effectiveIn = applyEntrypointFee(amountInWei);

  const [v3, v2] = await Promise.all([
    dexPref !== 'v2' ? quoteV3(tokenInAddr, tokenOutAddr, effectiveIn).catch(() => null) : null,
    dexPref !== 'v3' ? quoteV2(tokenInAddr, tokenOutAddr, effectiveIn).catch(() => null) : null,
  ]);

  const chosen = (v3 && v2) ? (v3.amountOutRaw >= v2.amountOutRaw ? v3 : v2) : (v3 || v2);
  if (!chosen) return null;
  return { ...chosen, effectiveAmountInRaw: effectiveIn, v3, v2 };
}

// ── Multi-hop routing ───────────────────────────────────────────────────────
//
// A real aggregator does not give up when two tokens have no direct pool.
// WBTC/USDT has no pair, but WBTC→WGEN→USDT does - previously that was reported
// as "no route" and the trade was refused. These are the tokens deep enough to
// be worth routing through.
const HOP_TOKENS = ['wgen', 'usdc', 'usdt'];

function hopAddresses() {
  const c = CONTRACT_ADDRESSES[4221] || {};
  const list = [c.wgen, c.usdc, c.usdt].filter(Boolean);
  // Fall back to the known addresses if the constants are shaped differently.
  return list.length ? list : [
    '0x315374AA9b5536037Cc1Efeea2439CCC0913A77e',
    '0x58B6CD7891cd0A682226E25607b958a6479195A6',
    '0x4B54235778c26Ee8ac27744A53d4c5BC4c9D46fc',
  ];
}

/**
 * Best executable route including two-hop paths.
 *
 * Returns the same shape as quoteBestRoute plus `hops`, an ordered list of
 * {pool, poolType, fee, tokenIn, tokenOut} the program builder turns into a
 * chained AGGFlow program. A direct route is simply a one-hop path, so callers
 * can treat both uniformly.
 */
export async function quoteBestRouteMultiHop(tokenInAddr, tokenOutAddr, amountInWei, dexPref = 'best') {
  const direct = await quoteBestRoute(tokenInAddr, tokenOutAddr, amountInWei, dexPref).catch(() => null);

  const inLower = String(tokenInAddr).toLowerCase();
  const outLower = String(tokenOutAddr).toLowerCase();

  const candidates = hopAddresses().filter((m) => {
    const ml = String(m).toLowerCase();
    return ml !== inLower && ml !== outLower;
  });

  // Price each two-hop path end to end: the first leg's real output is the
  // second leg's input, so impact compounds correctly rather than being
  // estimated.
  const twoHop = await Promise.all(candidates.map(async (mid) => {
    try {
      const legA = await quoteBestRoute(tokenInAddr, mid, amountInWei, dexPref);
      if (!legA?.amountOutRaw) return null;
      const legB = await quoteBestRoute(mid, tokenOutAddr, legA.amountOutRaw, dexPref);
      if (!legB?.amountOutRaw) return null;
      return {
        amountOutRaw: legB.amountOutRaw,
        dex: `${legA.dex}+${legB.dex}`,
        priceImpactPct: (legA.priceImpactPct || 0) + (legB.priceImpactPct || 0),
        pool: legA.pool,
        feeTier: legA.feeTier,
        via: mid,
        hops: [
          { pool: legA.pool, poolType: legA.dex, fee: legA.feeTier, tokenIn: tokenInAddr, tokenOut: mid },
          { pool: legB.pool, poolType: legB.dex, fee: legB.feeTier, tokenIn: mid, tokenOut: tokenOutAddr },
        ],
      };
    } catch {
      return null;
    }
  }));

  const all = [
    direct ? { ...direct, hops: [{ pool: direct.pool, poolType: direct.dex, fee: direct.feeTier, tokenIn: tokenInAddr, tokenOut: tokenOutAddr }] } : null,
    ...twoHop,
  ].filter(Boolean);

  if (all.length === 0) return null;

  // Best executable output wins - that is the whole promise of an aggregator.
  all.sort((a, b) => (b.amountOutRaw > a.amountOutRaw ? 1 : b.amountOutRaw < a.amountOutRaw ? -1 : 0));
  const best = all[0];
  // ── Is the winning route pricing off broken pools? ───────────────────────
  //
  // The aggregator picks the highest output, which is its job, and the
  // constant-product maths behind each hop is exact. Neither of those stops the
  // answer being nonsense when two pools disagree about what a token is worth.
  //
  // Observed on this testnet: WGEN/USDC held 2.65 WGEN against 4,127 USDC
  // (1 WGEN = 1,557 USDC) while WGEN/USDT held 8.33 WGEN against 601 USDT
  // (1 WGEN = 72 USDT). A 21x disagreement. Routing USDT to USDC through WGEN
  // therefore quoted 219 USDC for 11 USDT, against 10.97 on the direct pool, and
  // every number in that quote was arithmetically correct.
  //
  // What was missing was anyone comparing the two. A multi-hop route paying
  // wildly more than the direct route is not a better route; it is a reading off
  // a mispriced pool, it will be arbitraged, and a minimum built from it is a
  // floor no pool has promised to honour. So measure the gap and say so. The
  // route is still the aggregator's to choose - this reports, it does not
  // override - but the caller can no longer present it as merely optimal.
  const dislocationFactor = direct?.amountOutRaw > 0n && best.amountOutRaw > direct.amountOutRaw
    ? Number((best.amountOutRaw * 100n) / direct.amountOutRaw) / 100
    : 1;

  // A hop that eats a meaningful share of a pool moves the price against itself,
  // and a thin pool is where dislocations live in the first place.
  const worstImpact = Math.max(0, ...(best.hops || []).map((h) => Number(h.priceImpactPct || 0)));

  const dislocated = dislocationFactor >= 1.25;

  return {
    ...best,
    effectiveAmountInRaw: applyEntrypointFee(amountInWei),
    isMultiHop: best.hops.length > 1,
    improvedOverDirect: direct && best.amountOutRaw > direct.amountOutRaw
      ? Number(((best.amountOutRaw - direct.amountOutRaw) * 10000n) / direct.amountOutRaw) / 100
      : 0,
    directAmountOutRaw: direct?.amountOutRaw ?? null,
    dislocationFactor,
    worstHopImpactPct: worstImpact,
    priceWarning: dislocated
      ? {
          severity: dislocationFactor >= 3 ? 'severe' : 'high',
          factor: dislocationFactor,
          directAmountOutRaw: direct?.amountOutRaw?.toString() ?? null,
          bestAmountOutRaw: best.amountOutRaw.toString(),
          reason:
            `This route pays about ${dislocationFactor.toFixed(1)}x what the direct pool pays, `
            + 'which means the pools it passes through disagree about the price rather than that '
            + 'the route is better. A quote built on a mispriced pool is usually arbitraged before '
            + 'it settles, and the minimum received is a floor no pool has committed to.',
        }
      : null,
  };
}


/**
 * The amount of `tokenB` that pairs with `amountA` at the pool's live ratio.
 *
 * A deposit is not a trade, and quoting it as one is wrong in a way that looks
 * plausible: a swap quote deducts the 0.30% fee and applies price impact,
 * neither of which happens when you add liquidity. On a balanced stable pool
 * that showed "15 USDC + 14.9472 USDT" where the real pairing is ~15 USDT.
 *
 * Returns null when no pool exists yet, where any ratio is valid because the
 * depositor sets the opening price.
 */
export async function quoteV2Pairing(tokenAAddr, tokenBAddr, amountAWei) {
  const client = getQuoteClient();
  const pair = await client.readContract({
    address: CONTRACT_ADDRESSES[4221].factory,
    abi: V2_FACTORY_ABI,
    functionName: 'getPair',
    args: [tokenAAddr, tokenBAddr],
  }).catch(() => null);
  if (!pair || pair === '0x0000000000000000000000000000000000000000') return null;

  const [reserves, token0] = await Promise.all([
    client.readContract({ address: pair, abi: V2_PAIR_ABI, functionName: 'getReserves' }),
    client.readContract({ address: pair, abi: V2_PAIR_ABI, functionName: 'token0' }),
  ]);
  const aIsToken0 = String(token0).toLowerCase() === String(tokenAAddr).toLowerCase();
  const rA = aIsToken0 ? reserves[0] : reserves[1];
  const rB = aIsToken0 ? reserves[1] : reserves[0];
  if (rA === 0n || rB === 0n) return null;

  return { pool: pair, amountBWei: (BigInt(amountAWei) * rB) / rA, reserveA: rA, reserveB: rB };
}
