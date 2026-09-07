// lib/swapOrder.js
//
// Building the swap order that GenLayer validates and AgentExecutor settles.
//
// WHY THIS IS ITS OWN MODULE
// --------------------------
// The order IS the thing consensus approves. Every field of it goes into the
// commitment, so if two places in this codebase build it even slightly
// differently, they produce different commitments - and a commitment mismatch
// does not announce itself. The verdict is recorded under one identifier and
// settlement asks about another, both sides look correct in isolation, and the
// only symptom is that trades never settle.
//
// So there is exactly one implementation, and both routes call it:
//
//   /api/genlayer-validate  builds the order and runs the consensus round
//   /api/agent-execute      waits for the verdict on that order and settles it
//
// That split is also what removed the second round. The two routes used to run
// a consensus round EACH - an advisory `validate_proposal` for the UI panel and
// then a binding `validate_swap` at settlement - which on Bradbury meant paying
// the multi-minute round latency twice for one trade. The panel now shows the
// binding round, and settlement consumes its verdict rather than starting over.
//
// ORDER OF OPERATIONS
// -------------------
// Quote first, then validate, then settle. Quoting after validation is what
// once let the agent rewrite `minAmountOut` on its own authority, and nothing
// checked afterwards can recover the property lost by doing it in that order.

import { keccak256, encodePacked, zeroAddress } from 'viem';
import { CONTRACT_ADDRESSES } from '../constants/addresses.js';
import { TOKEN_LIST } from '../constants/tokens.js';
import { quoteBestRouteMultiHop } from './dexQuote.js';
import { buildMultiHopProgram } from '../utils/programBuilder.js';
import { resolveTokenAddress } from './genlayer.js';
import { toRawAmount } from './amounts.js';

/** Platform fee. Consensus-governed: AgentValidator caps it and pins the collector. */
export const PLATFORM_FEE_BPS = 5n;

export function feeCollectorAddress() {
  return CONTRACT_ADDRESSES[4221]?.dexFeeVault
    || process.env.FEE_COLLECTOR_ADDRESS
    || '0x48234eD645676b794a4CbC7483513e58cB04e22E';
}

/**
 * A nonce that is stable across retries but distinct per intent.
 *
 * It has to be both. Regenerating it per attempt would change the commitment,
 * so a caller polling for a pending verdict would wait on an identifier nobody
 * is ever going to approve.
 *
 * Derived from the INTENT - who, what, how much, by when - and deliberately not
 * from the route, which is rebuilt from a fresh quote each time and moves with
 * the pools. Folding the route in here would make the nonce flap for a trade
 * the user considers unchanged.
 */
export function deriveNonce(user, tokenIn, tokenOut, amountIn, deadline) {
  const digest = keccak256(
    encodePacked(
      ['address', 'address', 'address', 'uint256', 'uint256'],
      [user, tokenIn, tokenOut, BigInt(amountIn), BigInt(deadline)]
    )
  );
  // Truncated to 48 bits, not 64, and that is load-bearing.
  //
  // The nonce crosses into the Intelligent Contract as a calldata integer, and
  // several layers between here and there handle it as a JavaScript number. A
  // 64-bit value exceeds Number.MAX_SAFE_INTEGER, so it arrives subtly changed:
  // the IC then computes a commitment over a different nonce, the executor
  // computes one over the original, and the two identifiers never match. The
  // symptom is a trade that consensus approves and settlement rejects, with
  // both sides looking correct in isolation.
  //
  // 48 bits is exactly representable everywhere in the path, and collisions are
  // not a concern: the fields it is derived from already identify the intent,
  // and the nonce only has to separate two otherwise identical ones.
  return BigInt(digest) & ((1n << 48n) - 1n);
}

/** Order fields are bigints; the wire carries them as decimal strings. */
export function serialiseOrder(order) {
  return Object.fromEntries(
    Object.entries(order).map(([k, v]) => [k, typeof v === 'bigint' ? v.toString() : v])
  );
}

export function deserialiseOrder(raw) {
  return {
    user:            raw.user,
    tokenIn:         raw.tokenIn,
    tokenOut:        raw.tokenOut,
    amountIn:        BigInt(raw.amountIn),
    minAmountOut:    BigInt(raw.minAmountOut),
    quotedAmountOut: BigInt(raw.quotedAmountOut),
    slippageBps:     BigInt(raw.slippageBps),
    deadline:        BigInt(raw.deadline),
    router:          raw.router,
    feeBps:          BigInt(raw.feeBps),
    feeCollector:    raw.feeCollector,
    routeHash:       raw.routeHash,
    nonce:           BigInt(raw.nonce),
  };
}

function decimalsOf(address) {
  const token = TOKEN_LIST[4221]?.find(
    (t) => t.address?.toLowerCase() === String(address).toLowerCase()
      || (address === zeroAddress && t.isNative)
  );
  return token?.decimals ?? 18;
}

/**
 * Turn a UI proposal into the exact raw values a settlement needs.
 *
 * A proposal arrives loosely typed: tokens may be symbols or addresses, amounts
 * may be human-readable ("1.5") or already raw. That is fine for a panel, but
 * this output feeds the commitment, so it is STRICT where the older advisory
 * path is lenient.
 *
 * `validateSwapProposal` silently substitutes 1e18 when an amount fails to
 * parse. For an advisory round that only misreports a number. On the binding
 * path it would open a consensus round - and mint a verdict - for a trade of
 * one whole token that the user never asked for. An unparseable amount is an
 * error here, not a default.
 *
 * @returns `{ ok: true, ... }` or `{ ok: false, error }`
 */
export function normaliseSwapIntent(proposal) {
  const tokenIn = resolveTokenAddress(proposal.tokenIn || proposal.fromToken);
  const tokenOut = resolveTokenAddress(proposal.tokenOut || proposal.toToken);

  if (!proposal.user) {
    // The user is inside the commitment, so it is not optional. It also used to
    // be requested "for the mandate fast path", which no longer exists.
    return { ok: false, error: 'A user address is required: it is part of the settlement commitment.' };
  }
  if (tokenIn === tokenOut) {
    return { ok: false, error: 'tokenIn and tokenOut cannot be the same asset.' };
  }

  const toRaw = (raw, human, decimals, label) => {
    // One implementation, in lib/amounts.js. It used to live here only, which is
    // how the liquidity path ended up with a bare BigInt() instead.
    const r = toRawAmount({ raw, human, decimals, label });
    return r.ok ? { ok: true, value: r.value } : { ok: false, error: r.error };
  };

  const amountIn = toRaw(proposal.amountInRaw, proposal.amountIn, decimalsOf(tokenIn), 'amountIn');
  if (!amountIn.ok) return { ok: false, error: amountIn.error };

  // Optional: only used to detect a stale quote, never to set the floor.
  let expectedMinAmountOut = null;
  if (proposal.minAmountOutRaw || proposal.minAmountOut) {
    const m = toRaw(proposal.minAmountOutRaw, proposal.minAmountOut, decimalsOf(tokenOut), 'minAmountOut');
    if (m.ok) expectedMinAmountOut = m.value;
  }

  let slippageBps = parseInt(proposal.slippageBps ?? 30, 10);
  if (!Number.isFinite(slippageBps) || slippageBps <= 0) slippageBps = 30;

  // Default deadline must clear the appeal window.
  //
  // A trade cannot settle until its consensus round finalizes, because the
  // verdict reaches the executor as an external message and those are delivered
  // on finalization only. On Bradbury that has been observed at roughly 40
  // minutes. The old 20-minute default therefore expired before settlement was
  // even possible, and AgentExecutor's validDeadline would refuse a trade
  // consensus had properly approved.
  const deadline = parseInt(proposal.deadline || (Math.floor(Date.now() / 1000) + 7200), 10);
  if (!Number.isFinite(deadline) || deadline <= Math.floor(Date.now() / 1000)) {
    return { ok: false, error: 'Deadline is missing or already in the past.' };
  }

  return {
    ok: true,
    user: proposal.user,
    tokenIn,
    tokenOut,
    amountIn: amountIn.value,
    expectedMinAmountOut,
    slippageBps,
    deadline,
  };
}

/**
 * Quote live pool state, build the route, and assemble the order.
 *
 * @returns `{ ok: true, order, aggProgram, commitment, quote }`
 *          or `{ ok: false, status, body }` ready to return to the caller.
 */
export async function buildSwapOrder({
  publicClient,
  executor,
  abi,
  user,
  tokenIn,
  tokenOut,
  amountIn,
  slippageBps,
  deadline,
  expectedMinAmountOut = null, // the client's figure, checked for staleness only
}) {
  const tokenInAddr  = tokenIn  === '0x0000000000000000000000000000000000000000' ? zeroAddress : tokenIn;
  const tokenOutAddr = tokenOut === '0x0000000000000000000000000000000000000000' ? zeroAddress : tokenOut;
  const amountInBig    = BigInt(amountIn);
  const slippageBpsBig = BigInt(slippageBps);
  const deadlineBig    = BigInt(deadline);
  const feeBps         = PLATFORM_FEE_BPS;

  // Quote the amount that actually REACHES the pools. AGGFlowEntrypoint takes
  // its fee off the input before the route runs (isInTokenFee: true), so
  // quoting the gross amount overstates the output by exactly the fee. That
  // biased every minAmountOut upward and pushed borderline trades into
  // AGGFlowEntrypoint_InsufficientAmountAfterFees. The validator IC simulates
  // from the post-fee amount, so quoting gross would also put the two sides
  // permanently out of step.
  const routeInputBig = (amountInBig * (10_000n - feeBps)) / 10_000n;

  const wgenAddr = CONTRACT_ADDRESSES[4221]?.wgen || '0x315374AA9b5536037Cc1Efeea2439CCC0913A77e';
  const quoteTokenIn  = tokenInAddr  === zeroAddress ? wgenAddr : tokenInAddr;
  const quoteTokenOut = tokenOutAddr === zeroAddress ? wgenAddr : tokenOutAddr;

  const fresh = await quoteBestRouteMultiHop(quoteTokenIn, quoteTokenOut, routeInputBig, 'best')
    .catch(() => null);

  if (!fresh?.amountOutRaw) {
    // No pool can fill this pair. Any rate shown to the user came from a
    // reference-price fallback, which is a display estimate not backed by
    // liquidity - settling it could only ever revert.
    return {
      ok: false,
      status: 400,
      body: {
        success: false,
        notRoutable: true,
        error:
          'No routable liquidity pool exists for this pair on Soyara DEX, so this trade cannot settle. '
          + 'The displayed rate was a reference estimate, not a live pool quote.',
      },
    };
  }

  const quotedAmountOutBig = fresh.amountOutRaw;
  const minAmountOutBig    = (quotedAmountOutBig * (10_000n - slippageBpsBig)) / 10_000n;

  // If the pool has moved so far that the user's own expectation is no longer
  // reachable within the slippage they accepted, stop and say so rather than
  // quietly settling at a materially worse rate.
  if (expectedMinAmountOut !== undefined && expectedMinAmountOut !== null) {
    const requested = BigInt(expectedMinAmountOut);
    const tolerated = (quotedAmountOutBig * (10_000n + slippageBpsBig)) / 10_000n;
    if (requested > tolerated) {
      return {
        ok: false,
        status: 409,
        body: {
          success: false,
          stale: true,
          error:
            `Price moved beyond your ${Number(slippageBpsBig) / 100}% slippage tolerance since this quote was made. `
            + `The pool now returns ${quotedAmountOutBig} but the trade expected at least ${requested} (raw units). `
            + 'Request a fresh quote and try again.',
          liveAmountOut: quotedAmountOutBig.toString(),
          requestedMinOut: requested.toString(),
        },
      };
    }
  }

  // Build the route from the quote just taken, not from anything the caller
  // supplied. A route and its price are one object; letting them come from
  // different places means the quote being validated can describe a different
  // path from the bytes being executed. Building both here makes them
  // consistent by construction, and drops a trust dependency on route bytes
  // that arrived over the wire.
  const aggProgram = buildMultiHopProgram(
    { address: quoteTokenIn,  isNative: tokenInAddr  === zeroAddress },
    { address: quoteTokenOut, isNative: tokenOutAddr === zeroAddress },
    fresh.hops,
    wgenAddr
  );

  const order = {
    user,
    tokenIn:         tokenInAddr,
    tokenOut:        tokenOutAddr,
    amountIn:        amountInBig,
    minAmountOut:    minAmountOutBig,
    quotedAmountOut: quotedAmountOutBig,
    slippageBps:     slippageBpsBig,
    deadline:        deadlineBig,
    router:          CONTRACT_ADDRESSES[4221].aggregatorEntrypoint,
    feeBps,
    feeCollector:    feeCollectorAddress(),
    routeHash:       keccak256(aggProgram),
    nonce:           deriveNonce(user, tokenInAddr, tokenOutAddr, amountInBig, deadlineBig),
  };

  // Read the commitment from the executor rather than recomputing the hash
  // here. A third independent implementation of the encoding is a third thing
  // that can drift, and a drifted commitment fails silently.
  const commitment = await publicClient.readContract({
    address: executor,
    abi,
    functionName: 'getSwapCommitment',
    args: [order],
  });

  return {
    ok: true,
    order,
    aggProgram,
    commitment,
    quote: {
      amountOutRaw: quotedAmountOutBig,
      hops: fresh.hops,
      dex: fresh.dex,
      isMultiHop: Boolean(fresh.isMultiHop),
      priceImpactPct: fresh.priceImpactPct,
    },
  };
}
