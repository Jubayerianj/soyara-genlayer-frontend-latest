// lib/liquidityOrder.js
//
// Building the V2 deposit that GenLayer validates and AgentExecutor settles.
//
// The same reasoning as lib/swapOrder.js, for the same reason: the commitment
// is what authorises settlement, so if validation and settlement each build the
// deposit their own way they produce different identifiers and the verdict is
// useless. One builder, called by both.
//
// The pairing step is what makes this necessary rather than merely tidy. A V2
// deposit has to match the pool ratio: the router uses one side, derives the
// other, and reverts if the derived amount falls below the caller's minimum,
// which happens whenever the two requested amounts drift even slightly
// off-ratio. So the amounts that settle are NOT the amounts the user typed;
// they are the typed amounts reduced to the pool's live ratio. Validating the
// typed amounts and settling the paired ones was exactly the class of mismatch
// this whole change exists to remove.

import { zeroAddress } from 'viem';
import { CONTRACT_ADDRESSES } from '../constants/addresses.js';
import { TOKEN_LIST } from '../constants/tokens.js';
import { toRawAmount } from './amounts.js';
import { resolveTokenAddress } from './genlayer.js';

const FACTORY_ABI = [{
  inputs: [{ type: 'address' }, { type: 'address' }],
  name: 'getPair', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function',
}];

const PAIR_ABI = [
  { inputs: [], name: 'getReserves', outputs: [{ type: 'uint112' }, { type: 'uint112' }, { type: 'uint32' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'token0', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
];

/** Native GEN cannot be pulled with transferFrom, so both sides use WGEN. */
export function asErc20(address) {
  const wgen = CONTRACT_ADDRESSES[4221]?.wgen || '0x315374AA9b5536037Cc1Efeea2439CCC0913A77e';
  // Resolve first: a proposal may name a token by SYMBOL rather than address.
  //
  // The AI proposal carries tokenA: "USDC" with the address in a separate
  // field, and passing "USDC" through as an address made readContract throw,
  // which the validate route caught and reported as "Consensus unavailable -
  // failed closed". The failure had nothing to do with consensus.
  const resolved = resolveTokenAddress(address);
  return !resolved || resolved === zeroAddress ? wgen : resolved;
}

/**
 * Pair a deposit against live reserves and derive its commitment.
 *
 * @returns `{ ok: true, order, commitment }` or `{ ok: false, status, body }`
 */
export async function buildLiquidityV2AddOrder({
  publicClient, executor, abi,
  user, tokenA, tokenB, amountADesired, amountBDesired, slippageBps = 30, deadline,
  rawA = null, rawB = null,
}) {
  const a = asErc20(tokenA);
  const b = asErc20(tokenB);
  if (!user) return { ok: false, status: 400, body: { error: 'A user address is required: it is part of the settlement commitment.' } };
  if (a.toLowerCase() === b.toLowerCase()) {
    return { ok: false, status: 400, body: { error: 'Both sides of a deposit cannot be the same token.' } };
  }

  // Amounts arrive loosely typed. Converting them with a bare BigInt() threw on
  // "10.0" (surfacing as a 503) and read "10" as TEN WEI, which is a deposit
  // eighteen orders of magnitude too small and raises no error at all.
  const decOf = (addr) => TOKEN_LIST[4221]?.find(
    (t) => t.address?.toLowerCase() === String(addr).toLowerCase()
  )?.decimals ?? 18;

  const aRaw = toRawAmount({ raw: rawA, human: amountADesired, decimals: decOf(a), label: 'Deposit amount A' });
  if (!aRaw.ok) return { ok: false, status: 400, body: { error: aRaw.error } };
  const bRaw = toRawAmount({ raw: rawB, human: amountBDesired, decimals: decOf(b), label: 'Deposit amount B' });
  if (!bRaw.ok) return { ok: false, status: 400, body: { error: bRaw.error } };
  const aDesired = aRaw.value;
  const bDesired = bRaw.value;

  const bps = BigInt(slippageBps);
  const deadlineBig = BigInt(deadline);

  // Reduce the over-supplied side to the pool's ratio. This only ever lowers an
  // amount, so the user is never asked for more than they offered.
  let aFinal = aDesired;
  let bFinal = bDesired;
  let pair = null;
  try {
    const factory = CONTRACT_ADDRESSES[4221]?.factory || '0x4680BCe1632824d30D2F53656dD610736c3e312e';
    pair = await publicClient.readContract({ address: factory, abi: FACTORY_ABI, functionName: 'getPair', args: [a, b] });
    if (pair && pair !== zeroAddress) {
      const [reserves, token0] = await Promise.all([
        publicClient.readContract({ address: pair, abi: PAIR_ABI, functionName: 'getReserves' }),
        publicClient.readContract({ address: pair, abi: PAIR_ABI, functionName: 'token0' }),
      ]);
      const aIsToken0 = String(token0).toLowerCase() === a.toLowerCase();
      const rA = aIsToken0 ? reserves[0] : reserves[1];
      const rB = aIsToken0 ? reserves[1] : reserves[0];
      if (rA > 0n && rB > 0n) {
        const optimalB = (aDesired * rB) / rA;
        if (optimalB <= bDesired) bFinal = optimalB;
        else aFinal = (bDesired * rA) / rB;
      }
    }
  } catch {
    // No pool yet, or reserves unreadable. Deposit the amounts as offered and
    // let the router decide; it is the authority on whether they can be paired.
  }

  const aMin = (aFinal * (10_000n - bps)) / 10_000n;
  const bMin = (bFinal * (10_000n - bps)) / 10_000n;

  const order = {
    user,
    tokenA: a,
    tokenB: b,
    amountADesired: aFinal,
    amountBDesired: bFinal,
    amountAMin: aMin,
    amountBMin: bMin,
    deadline: deadlineBig,
  };

  // Read the commitment from the contract so it cannot drift from
  // TradeHashLib.v2AddHash.
  const commitment = await publicClient.readContract({
    address: executor, abi, functionName: 'getLiquidityV2AddHash',
    args: [user, a, b, aFinal, bFinal, aMin, bMin, deadlineBig],
  });

  return { ok: true, order, commitment, pair };
}

export function serialiseLiquidityOrder(order) {
  return Object.fromEntries(
    Object.entries(order).map(([k, v]) => [k, typeof v === 'bigint' ? v.toString() : v])
  );
}

export function deserialiseLiquidityOrder(raw) {
  return {
    user: raw.user,
    tokenA: raw.tokenA,
    tokenB: raw.tokenB,
    amountADesired: BigInt(raw.amountADesired),
    amountBDesired: BigInt(raw.amountBDesired),
    amountAMin: BigInt(raw.amountAMin),
    amountBMin: BigInt(raw.amountBMin),
    deadline: BigInt(raw.deadline),
  };
}
