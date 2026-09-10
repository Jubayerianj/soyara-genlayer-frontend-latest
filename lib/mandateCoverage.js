// lib/mandateCoverage.js
//
// Does a consensus-issued mandate cover one exact order?
//
// WHY THIS IS ITS OWN MODULE
// --------------------------
// An agent trade settles under exactly ONE authority, and both of them are
// written by the AgentValidator Intelligent Contract and enforced by
// AgentExecutor on chain:
//
//   consensus  a per-order verdict for this order's commitment. Single use,
//              consumed by `executeSwap`. Arrives when the round finalizes.
//   mandate    a bounded authority a consensus round issued earlier for this
//              user, pair and direction. Each trade under it is one
//              `executeSwapUnderMandate` call, so it settles in seconds.
//
// The rail is chosen ONCE, before any consensus round is opened, and never
// changed afterwards. If a trade could reach both, the same intent could settle
// twice: once under the mandate straight away, and again when the per-order
// verdict landed and the settlement queue relayed it. So /api/genlayer-validate
// decides the rail with this module and does not open a round for a covered
// trade, and /api/agent-execute re-checks coverage with the same module at the
// moment of settlement.
//
// Nothing here authorises anything. The executor re-checks every condition
// below itself and prices the trade from the pinned pool's live reserves. This
// module only decides whether asking it is worth a transaction, and which rail
// the UI may promise.

import { keccak256 } from 'viem';

const ZERO = '0x0000000000000000000000000000000000000000';
const same = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

/** `TradingMandate` field order, as the public `mandates(bytes32)` getter returns it. */
export const MANDATE_FIELDS = Object.freeze([
  'user', 'tokenIn', 'tokenOut',
  'maxAmountIn', 'totalBudgetIn', 'spentIn',
  'maxSlippageBps', 'maxFeeBps',
  'feeCollector', 'router', 'routeHash', 'pool',
  'expiry', 'revoked',
]);

const BIGINT_FIELDS = new Set(['maxAmountIn', 'totalBudgetIn', 'spentIn', 'maxSlippageBps', 'maxFeeBps']);

/**
 * A mandate must outlive the transaction that spends it. One that expires in
 * five seconds is technically live, and choosing it would promise a fast trade
 * that then reverts with MandateExpired.
 */
export const MANDATE_EXPIRY_MARGIN_SEC = 120;

/** At most this many remembered ids are checked per request. */
export const MAX_MANDATE_IDS = 8;

/**
 * Name the fields of a `mandates(id)` result.
 *
 * The getter returns a positional tuple, and reading it by index is how
 * /api/agent-mandate came to report the route hash as the expiry. Decoding by
 * name, in one place, removes that class of mistake.
 */
export function decodeMandate(raw) {
  if (!raw) return null;
  const out = {};
  MANDATE_FIELDS.forEach((f, i) => {
    const v = Array.isArray(raw) ? raw[i] : raw[f];
    if (BIGINT_FIELDS.has(f)) out[f] = BigInt(v ?? 0);
    else if (f === 'expiry') out[f] = Number(v ?? 0);
    else if (f === 'revoked') out[f] = Boolean(v);
    else out[f] = v;
  });
  return out;
}

/** True when `id` is a 32-byte hex string. Anything else is not looked up. */
export function isMandateId(id) {
  return typeof id === 'string' && /^0x[0-9a-fA-F]{64}$/.test(id);
}

/**
 * Could the route in this quote ever be covered by a mandate?
 *
 * A mandate pins ONE program: the single-hop V2 route the validators build
 * themselves (`build_v2_route_program`), which pulls an ERC-20 from the user.
 * A trade whose best route is a V3 pool, a multi-hop path, or native GEN on
 * either side can only settle against a per-order verdict - and it must, since
 * Soyara always takes the best route rather than the fastest one.
 */
export function isMandateEligibleRoute({ order, hops }) {
  if (!order) return false;
  if (same(order.tokenIn, ZERO) || same(order.tokenOut, ZERO)) return false;
  return Array.isArray(hops) && hops.length === 1 && String(hops[0]?.poolType).toLowerCase() === 'v2';
}

/**
 * Pure check: does `mandate` cover `order` settled with a program hashing to
 * `routeHash`? Mirrors `executeSwapUnderMandate`, plus the margin above.
 *
 * @returns {{ covered: boolean, reason: string }}
 */
export function mandateCoversOrder({ mandate, order, routeHash, nowSec = Math.floor(Date.now() / 1000) }) {
  const no = (reason) => ({ covered: false, reason });

  if (!mandate || same(mandate.user, ZERO)) return no('no mandate is recorded under this id');
  if (mandate.revoked) return no('the mandate was revoked');
  if (Number(mandate.expiry) < nowSec + MANDATE_EXPIRY_MARGIN_SEC) return no('the mandate has expired or is about to');

  if (!same(mandate.user, order.user)) return no('the mandate belongs to a different user');
  if (!same(mandate.tokenIn, order.tokenIn) || !same(mandate.tokenOut, order.tokenOut)) {
    return no('the mandate covers a different pair or direction');
  }

  const amountIn = BigInt(order.amountIn);
  if (amountIn <= 0n) return no('the trade size is zero');
  if (amountIn > mandate.maxAmountIn) return no('the trade is larger than the mandate\'s per-trade ceiling');
  if (mandate.spentIn + amountIn > mandate.totalBudgetIn) return no('the mandate\'s budget would be exceeded');

  if (BigInt(order.feeBps) > mandate.maxFeeBps) return no('the fee is above the mandate\'s fee ceiling');
  if (!same(mandate.feeCollector, order.feeCollector)) return no('the fee collector differs from the mandate\'s');
  if (!same(mandate.router, order.router)) return no('the router differs from the mandate\'s');

  // The one that matters for best execution. A mandate pins one route; when the
  // aggregator's best route for this size is somewhere else, the per-order
  // rail settles the better route rather than the mandate settling a worse one.
  if (!same(mandate.routeHash, routeHash)) {
    return no('the best route for this trade is not the pool the mandate pins');
  }

  return { covered: true, reason: 'covered' };
}

/** Read and decode one mandate. Null when it cannot be read. */
export async function readMandate({ publicClient, executor, abi, mandateId }) {
  if (!isMandateId(mandateId)) return null;
  try {
    const raw = await publicClient.readContract({
      address: executor, abi, functionName: 'mandates', args: [mandateId],
    });
    return decodeMandate(raw);
  } catch {
    return null;
  }
}

/**
 * The first remembered mandate that covers this order, if any.
 *
 * @param mandateIds  ids the caller remembers for this user. Order is kept, so
 *                    the most recently issued one should come first.
 * @returns `{ covered: true, mandateId, mandate }` or `{ covered: false, reasons }`
 */
export async function findCoveringMandate({ publicClient, executor, abi, mandateIds, order, aggProgram }) {
  const ids = [...new Set((Array.isArray(mandateIds) ? mandateIds : [mandateIds]).filter(isMandateId))]
    .slice(0, MAX_MANDATE_IDS);
  if (!ids.length || !order || !aggProgram) return { covered: false, reasons: ['no mandate to check'] };

  const routeHash = keccak256(aggProgram);
  const reasons = [];
  for (const mandateId of ids) {
    const mandate = await readMandate({ publicClient, executor, abi, mandateId });
    const verdict = mandateCoversOrder({ mandate, order, routeHash });
    if (verdict.covered) return { covered: true, mandateId, mandate };
    reasons.push(`${mandateId.slice(0, 10)}: ${verdict.reason}`);
  }
  return { covered: false, reasons };
}

/**
 * The output the executor will expect for this trade, computed the way
 * `_quoteV2` does: fee off the input first, then the 0.30% constant-product
 * curve against the pool's live reserves.
 */
export function expectedOutUnderMandate({ amountIn, feeBps, reserveIn, reserveOut }) {
  const a = BigInt(amountIn);
  const rin = BigInt(reserveIn);
  const rout = BigInt(reserveOut);
  if (rin === 0n || rout === 0n || a === 0n) return 0n;
  const routeInput = (a * (10_000n - BigInt(feeBps))) / 10_000n;
  const inWithFee = routeInput * 997n;
  return (inWithFee * rout) / (rin * 1000n + inWithFee);
}

/**
 * The floor to settle with under a mandate.
 *
 * The executor refuses a floor more than the mandate's slippage band below its
 * own live price, so a relayer cannot lower a user's protection. It must also
 * never be below the minimum the user was quoted: if the pool has moved
 * against them beyond their tolerance, the trade should fail rather than fill
 * at a price they did not accept. Taking the higher of the two satisfies both,
 * and the tighter of the two slippage settings applies.
 */
export function mandateMinAmountOut({ order, mandate, expectedOut }) {
  const slip = BigInt(order.slippageBps) < mandate.maxSlippageBps ? BigInt(order.slippageBps) : mandate.maxSlippageBps;
  const floor = (BigInt(expectedOut) * (10_000n - slip)) / 10_000n;
  const quoted = BigInt(order.minAmountOut);
  return floor > quoted ? floor : quoted;
}
