// services/a2a/analysts.js
// ============================================================================
//  Working agents for the Soyara A2A swarm.
//
//  Every agent in here reads the chain and returns findings. None of them
//  narrate. That distinction matters: the swarm already had four voices, and
//  adding three more that only described what the other four had done would
//  have made the feed longer without making a single decision better informed.
//
//  Each one answers a question the others cannot:
//
//    Market Analyst        - is there enough liquidity behind this quote, and do
//                            the venues agree about the price?
//    Settlement Strategist - which rail can actually settle this verdict, and
//                            how long does it have before it expires?
//    Post-Trade Auditor    - does the commitment the network approved really
//                            bind this route, fee, user and quote, and did the
//                            settled trade deliver what was promised?
//
//  The auditor's pre-flight is the team requirement checked live, per trade,
//  against the deployed executor rather than asserted in a README.
// ============================================================================

import { formatUnits, keccak256, decodeEventLog } from 'viem';
import { CONTRACT_ADDRESSES } from '../../constants/addresses.js';
import { TOKEN_LIST } from '../../constants/tokens.js';
import { getQuoteClient } from '../../lib/dexQuote.js';
import { deserialiseOrder, PLATFORM_FEE_BPS } from '../../lib/swapOrder.js';
import { decodeMandate, MANDATE_FIELDS } from '../../lib/mandateCoverage.js';

const ZERO = '0x0000000000000000000000000000000000000000';

const MANDATE_COMPONENT_TYPES = {
  user: 'address', tokenIn: 'address', tokenOut: 'address',
  maxAmountIn: 'uint256', totalBudgetIn: 'uint256', spentIn: 'uint256',
  maxSlippageBps: 'uint256', maxFeeBps: 'uint256',
  feeCollector: 'address', router: 'address', routeHash: 'bytes32', pool: 'address',
  expiry: 'uint64', revoked: 'bool',
};

// The executor reads these agents need, declared inline rather than imported
// from abi/AgentExecutor.json.
//
// A bare JSON import resolves under webpack but not under plain Node ESM, and
// these agents have to be testable against the live chain from a script - a
// mocked version of a market read or a rail choice would pass while the page
// showed something that does not exist. scripts/swarm-agents-test.mjs asserts
// this subset still matches the generated ABI, so drift is caught rather than
// discovered in production.
//
// The SwapOrder field order below is load-bearing: it is the encoding the
// commitment is derived from, and a reordering here would produce a different
// hash with no error anywhere.
const SWAP_ORDER_COMPONENTS = [
  { name: 'user', type: 'address' },
  { name: 'tokenIn', type: 'address' },
  { name: 'tokenOut', type: 'address' },
  { name: 'amountIn', type: 'uint256' },
  { name: 'minAmountOut', type: 'uint256' },
  { name: 'quotedAmountOut', type: 'uint256' },
  { name: 'slippageBps', type: 'uint256' },
  { name: 'deadline', type: 'uint256' },
  { name: 'router', type: 'address' },
  { name: 'feeBps', type: 'uint256' },
  { name: 'feeCollector', type: 'address' },
  { name: 'routeHash', type: 'bytes32' },
  { name: 'nonce', type: 'uint256' },
];

export const EXECUTOR_READ_ABI = [
  { inputs: [], name: 'paused', outputs: [{ type: 'bool' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ type: 'bytes32' }], name: 'commitmentUsed', outputs: [{ type: 'bool' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ type: 'bytes32' }], name: 'verdictExpiry', outputs: [{ type: 'uint64' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ type: 'bytes32' }], name: 'isVerdictLive', outputs: [{ type: 'bool' }], stateMutability: 'view', type: 'function' },
  {
    inputs: [{ name: 'order', type: 'tuple', components: SWAP_ORDER_COMPONENTS }],
    name: 'getSwapCommitment',
    outputs: [{ type: 'bytes32' }],
    stateMutability: 'view',
    type: 'function',
  },
  { inputs: [{ type: 'bytes32' }], name: 'isMandateLive', outputs: [{ type: 'bool' }], stateMutability: 'view', type: 'function' },
  {
    inputs: [{ type: 'bytes32' }],
    name: 'mandates',
    outputs: MANDATE_FIELDS.map((name) => ({ name, type: MANDATE_COMPONENT_TYPES[name] })),
    stateMutability: 'view',
    type: 'function',
  },
];

const FACTORY_ABI = [
  { inputs: [{ type: 'address' }, { type: 'address' }], name: 'getPair', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
];
const PAIR_ABI = [
  { inputs: [], name: 'getReserves', outputs: [{ type: 'uint112' }, { type: 'uint112' }, { type: 'uint32' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'token0', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
];
const ERC20_ABI = [
  { inputs: [{ type: 'address' }], name: 'balanceOf', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ type: 'address' }, { type: 'address' }], name: 'allowance', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'decimals', outputs: [{ type: 'uint8' }], stateMutability: 'view', type: 'function' },
];
const TRANSFER_EVENT = [{
  type: 'event',
  name: 'Transfer',
  inputs: [
    { indexed: true, name: 'from', type: 'address' },
    { indexed: true, name: 'to', type: 'address' },
    { indexed: false, name: 'value', type: 'uint256' },
  ],
}];

const sameAddr = (a, b) => Boolean(a) && Boolean(b) && String(a).toLowerCase() === String(b).toLowerCase();

/**
 * Name a token from its address.
 *
 * A multi-hop route's entry pool does not hold the output token - it holds the
 * intermediate one. Labelling its second reserve with `route.tokenOut.symbol`
 * reported the USDT/WGEN pool as "600.96 USDT / 8.33 USDC", which is a wrong
 * number stated as a fact about a pool. Reserves are labelled with whatever is
 * actually in them.
 */
function nameOf(address) {
  const t = (TOKEN_LIST[4221] || []).find((x) => sameAddr(x.address, address));
  return { symbol: t?.symbol || `${String(address).slice(0, 6)}…`, decimals: t?.decimals ?? 18 };
}

// ── Agent 5: Market Analyst ──────────────────────────────────────────────────

export class MarketAnalystAgent {
  /**
   * Read the pools the route will actually touch.
   *
   * The router reports a quote. This reads the reserves behind it, which is a
   * different question: a quote can be arithmetically perfect and still come
   * off a pool holding four dollars of one side. The 21x USDC/USDT dislocation
   * that produced "11 USDT -> 219 USDC" was visible in the reserves long before
   * it was visible in the output number.
   */
  static async analyse(intent, route) {
    const chainAddrs = CONTRACT_ADDRESSES[4221];
    const factory = chainAddrs?.factory;
    const wgen = chainAddrs?.wgen;
    const client = getQuoteClient();

    const addrOf = (t) => (t?.isNative ? wgen : t?.address);
    const inAddr = addrOf(route.tokenIn);
    const outAddr = addrOf(route.tokenOut);

    // A multi-hop route touches more than one pool, and the shallowest one is
    // what actually constrains the trade - so read every leg, not just the ends.
    const legs = route.isMultiHop && Array.isArray(route.hops) && route.hops.length
      ? route.hops.map((h) => ({ from: h.tokenIn || h.from || inAddr, to: h.tokenOut || h.to || outAddr }))
      : [{ from: inAddr, to: outAddr }];

    const pools = [];
    for (const leg of legs) {
      const pool = await readV2Pool(client, factory, leg.from, leg.to).catch(() => null);
      if (pool) pools.push(pool);
    }

    const concerns = [];
    let depthLabel = 'unknown';
    let sizeVsDepthPct = null;

    // Depth is measured against the leg the trade enters, in that token's own
    // units. No USD anywhere: this app has no price oracle, and inventing one
    // is exactly how a fabricated "TVL ~$1,420,000" reached a user.
    const entry = pools.find((p) => sameAddr(p.tokenA, inAddr)) || pools[0] || null;
    const entrySideA = entry ? nameOf(entry.tokenA) : null;
    const entrySideB = entry ? nameOf(entry.tokenB) : null;
    if (entry) {
      const reserveIn = Number(formatUnits(entry.reserveA, entrySideA.decimals));
      if (reserveIn > 0) {
        sizeVsDepthPct = (route.amountInNum / reserveIn) * 100;
        depthLabel = sizeVsDepthPct < 1 ? 'deep'
          : sizeVsDepthPct < 5 ? 'comfortable'
          : sizeVsDepthPct < 15 ? 'thin'
          : 'dominant';
        if (sizeVsDepthPct >= 15) {
          concerns.push({
            severity: 'high',
            topic: 'depth',
            text: `This order is **${sizeVsDepthPct.toFixed(1)}%** of the ${entrySideA.symbol} side of the `
              + `${entrySideA.symbol}/${entrySideB.symbol} pool `
              + `(${reserveIn.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${entrySideA.symbol} in reserve). `
              + `A trade that large moves the price it is trading against, so the quote degrades as it fills.`,
          });
        } else if (sizeVsDepthPct >= 5) {
          concerns.push({
            severity: 'medium',
            topic: 'depth',
            text: `The order is **${sizeVsDepthPct.toFixed(1)}%** of the ${entrySideA.symbol} reserve in the `
              + `${entrySideA.symbol}/${entrySideB.symbol} pool. `
              + `Fillable, but the price impact is real rather than rounding.`,
          });
        }
      }
    } else {
      concerns.push({
        severity: 'high',
        topic: 'depth',
        text: `No V2 pool could be read for this path, so pool depth is unverified. The quote may come from V3 only.`,
      });
    }

    // Venue agreement. Two independent venues quoting the same pair should land
    // close together; a wide gap means one of them is mispriced, and the
    // aggregator picking the higher number is picking the mispriced one.
    const v2 = parseFloat(route.v2Quote);
    const v3 = parseFloat(route.v3Quote);
    let venueSpreadPct = null;
    if (Number.isFinite(v2) && Number.isFinite(v3) && v2 > 0 && v3 > 0) {
      venueSpreadPct = (Math.abs(v3 - v2) / Math.min(v3, v2)) * 100;
      if (venueSpreadPct > 25) {
        concerns.push({
          severity: 'high',
          topic: 'venue-spread',
          text: `V2 and V3 disagree by **${venueSpreadPct.toFixed(1)}%** on this pair `
            + `(V2 ${v2.toFixed(4)}, V3 ${v3.toFixed(4)} ${route.tokenOut.symbol}). `
            + `That is a mispricing between venues, not a better route.`,
        });
      }
    }

    // The router's own dislocation flag, restated as a finding so the debate
    // can act on it rather than leaving it as a banner nobody answers.
    if (route.priceWarning) {
      concerns.push({
        severity: 'high',
        topic: 'dislocation',
        text: `The winning path pays about **${Number(route.dislocationFactor || 1).toFixed(1)}x** the direct pool. `
          + `Pools on this route disagree about what ${route.tokenIn.symbol} is worth; expect arbitrage to close it before settlement.`,
      });
    }

    return {
      pools: pools.map((p) => ({
        pair: p.pair,
        reserveA: p.reserveA.toString(),
        reserveB: p.reserveB.toString(),
        tokenA: p.tokenA,
        tokenB: p.tokenB,
      })),
      poolCount: pools.length,
      depthLabel,
      sizeVsDepthPct,
      venueSpreadPct,
      // Labelled with the entry pool's own tokens. On a multi-hop route the
      // second side is the intermediate token, not the trade's output.
      entryReserveHuman: entry ? formatUnits(entry.reserveA, entrySideA.decimals) : null,
      entrySymbol: entrySideA?.symbol || null,
      exitReserveHuman: entry ? formatUnits(entry.reserveB, entrySideB.decimals) : null,
      exitSymbol: entrySideB?.symbol || null,
      entryPairLabel: entry ? `${entrySideA.symbol}/${entrySideB.symbol}` : null,
      concerns,
      verdict: concerns.some((c) => c.severity === 'high') ? 'contested'
        : concerns.length ? 'cautioned' : 'clear',
    };
  }
}

async function readV2Pool(client, factory, tokenA, tokenB) {
  if (!factory || !tokenA || !tokenB || sameAddr(tokenA, tokenB)) return null;
  const pair = await client.readContract({
    address: factory, abi: FACTORY_ABI, functionName: 'getPair', args: [tokenA, tokenB],
  });
  if (!pair || pair === ZERO) return null;

  const [reserves, token0] = await Promise.all([
    client.readContract({ address: pair, abi: PAIR_ABI, functionName: 'getReserves' }),
    client.readContract({ address: pair, abi: PAIR_ABI, functionName: 'token0' }),
  ]);
  const aIsToken0 = sameAddr(tokenA, token0);
  return {
    pair,
    tokenA, tokenB,
    reserveA: aIsToken0 ? reserves[0] : reserves[1],
    reserveB: aIsToken0 ? reserves[1] : reserves[0],
  };
}

// ── Agent 6: Settlement Strategist ───────────────────────────────────────────

export class SettlementStrategistAgent {
  /**
   * Report how this trade will settle, from executor state.
   *
   * The authority was fixed when the trade was validated (lib/actions.js):
   *
   *   mandate   - an earlier consensus round's mandate covers this trade. One
   *               executeSwapUnderMandate call, seconds.
   *   reuse     - a live verdict already covers this exact commitment. Instant.
   *   consensus - wait for the GenLayer round to finalize and deliver the
   *               verdict over its ghost contract (appeal window, ~30 min).
   *
   * There was a fourth, an EIP-712 attestor quorum that carried the verdict in
   * about thirty seconds. It has been removed from the executor: nothing on
   * chain tied a signature to a verdict the IC had actually recorded, so those
   * keys were a substitute for consensus rather than a shortcut to it.
   *
   * Every field below is read from the deployed executor. A rail this agent
   * cannot prove is available is never offered.
   */
  static async plan({ rail: decidedRail = null, mandateId = null, commitment, order = null, deadline = null }) {
    const executor = CONTRACT_ADDRESSES[4221]?.agentExecutor;
    const client = getQuoteClient();
    const now = Math.floor(Date.now() / 1000);

    const read = (functionName, args = []) =>
      client.readContract({ address: executor, abi: EXECUTOR_READ_ABI, functionName, args })
        .catch(() => null);

    const paused = await read('paused');

    // ── Mandate: the authority is already on the executor ──────────────────
    if (decidedRail === 'mandate' && mandateId) {
      const [live, raw] = await Promise.all([read('isMandateLive', [mandateId]), read('mandates', [mandateId])]);
      const m = decodeMandate(raw);
      const secondsToExpiry = m ? Math.max(0, m.expiry - now) : 0;
      const blockers = [];
      if (paused === true) blockers.push('The executor is paused - no rail can settle while it is.');
      if (live !== true) blockers.push('The mandate is no longer live on the executor. Validate again for a per-trade round.');
      const rail = blockers.length ? 'blocked' : 'mandate';
      return {
        rail,
        eta: rail === 'mandate' ? '~5 seconds' : null,
        rationale: rail === 'mandate'
          ? `An earlier GenLayer consensus round issued mandate \`${String(mandateId).slice(0, 12)}...\` for you, this pair and `
            + `direction. Settlement is one executeSwapUnderMandate call: the executor checks this trade's size, fee and `
            + `route against the mandate and prices it itself from the pool's live reserves. No new round, no appeal window.`
          : blockers[0],
        blockers,
        paused: paused === true,
        commitmentUsed: false,
        verdictLive: false,
        mandateId,
        remainingBudget: m ? (m.totalBudgetIn - m.spentIn).toString() : null,
        verdictExpiry: m?.expiry || null,
        secondsToExpiry,
        deadline: deadline != null ? Number(deadline) : null,
        secondsToDeadline: deadline != null ? Number(deadline) - now : null,
        executor,
      };
    }

    let used = null;
    let expiry = null;
    if (commitment != null) {
      // These two take bytes32 on the EVM side. Only recordVerdict crosses the
      // GenLayer boundary as uint256, because GenLayer's documented type mapping
      // has no fixed-byte type - so the two forms have to be kept apart here.
      const c = toBytes32(commitment);
      [used, expiry] = await Promise.all([read('commitmentUsed', [c]), read('verdictExpiry', [c])]);
    }

    const expirySec = expiry != null ? Number(expiry) : 0;
    const verdictLive = expirySec > now;
    const secondsToExpiry = verdictLive ? expirySec - now : 0;
    const blockers = [];
    if (paused === true) blockers.push('The executor is paused - no rail can settle while it is.');
    if (used === true) blockers.push('This commitment has already been consumed. Verdicts are single use; a fresh round is required.');
    if (deadline != null && Number(deadline) <= now) {
      blockers.push(`The order deadline passed ${now - Number(deadline)}s ago, so settlement would revert on the deadline check.`);
    }

    let rail, eta, rationale;
    if (blockers.length) {
      rail = 'blocked';
      eta = null;
      rationale = blockers[0];
    } else if (verdictLive) {
      rail = 'reuse';
      eta = '~2 seconds';
      rationale = `A verdict for this exact commitment is already recorded on the executor and stays valid for `
        + `${formatDuration(secondsToExpiry)}. Nothing needs to be re-decided - settlement is a single call.`;
    } else {
      rail = 'consensus';
      eta = '~30 minutes';
      rationale = `The verdict arrives the only way it can: the GenLayer round must finalize and deliver it to the `
        + `executor over the validator's ghost contract. That wait is the appeal window, and it belongs to the `
        + `network. Nothing this server signs can shorten it, which is the point.`;
    }

    return {
      rail, eta, rationale, blockers,
      paused: paused === true,
      commitmentUsed: used === true,
      verdictLive,
      verdictExpiry: expirySec || null,
      secondsToExpiry,
      deadline: deadline != null ? Number(deadline) : null,
      secondsToDeadline: deadline != null ? Number(deadline) - now : null,
      executor,
    };
  }
}

/** Numeric form, for comparing two commitments that may be typed differently. */
function normaliseCommitment(commitment) {
  if (typeof commitment === 'bigint') return commitment;
  return BigInt(String(commitment));
}

/** Padded hex form, which is what every bytes32 argument on the executor wants. */
function toBytes32(commitment) {
  return `0x${normaliseCommitment(commitment).toString(16).padStart(64, '0')}`;
}

function formatDuration(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return 'no time';
  if (sec < 90) return `${sec} seconds`;
  if (sec < 5400) return `${Math.round(sec / 60)} minutes`;
  return `${(sec / 3600).toFixed(1)} hours`;
}

// ── Agent 7: Post-Trade Auditor ──────────────────────────────────────────────

export class PostTradeAuditorAgent {
  /**
   * Verify, against the deployed executor, that the approved commitment really
   * binds this order - and that the bytes about to be executed are the bytes
   * the commitment covers.
   *
   * This is the team's requirement expressed as a check rather than a claim.
   * The commitment is recomputed by the contract from the order struct, so if
   * any field differs from what consensus saw - route, fee, fee collector,
   * user, quote, deadline, nonce - the hashes diverge and this fails. There is
   * no path where a settlement agent substitutes a parameter and still matches.
   */
  static async preflight({ order, program, commitment, user, rail = 'consensus', mandateId = null }) {
    const executor = CONTRACT_ADDRESSES[4221]?.agentExecutor;
    const entrypoint = CONTRACT_ADDRESSES[4221]?.aggregatorEntrypoint;
    const client = getQuoteClient();
    const checks = [];

    // Under a mandate the authority is the mandate, so that is what is
    // audited: every binding it carries, read back from the executor.
    if (rail === 'mandate') {
      return PostTradeAuditorAgent.preflightMandate({ order, program, mandateId, user, client, executor, entrypoint });
    }

    if (!order || !commitment) {
      return {
        checks: [{
          name: 'Order binding', passed: false,
          detail: 'No bound order was returned with the verdict, so there is nothing to audit yet.',
        }],
        passed: false,
        allBound: false,
      };
    }

    const o = typeof order.amountIn === 'bigint' ? order : deserialiseOrder(order);

    // 1. The executor's own hash of this order must equal the approved
    //    commitment. This single check subsumes every field: it is the contract
    //    doing the encoding, not a second implementation in JavaScript.
    let onChainCommitment = null;
    try {
      onChainCommitment = await client.readContract({
        address: executor, abi: EXECUTOR_READ_ABI, functionName: 'getSwapCommitment', args: [o],
      });
    } catch (err) {
      checks.push({ name: 'Executor commitment', passed: false, detail: `Could not read getSwapCommitment: ${err.shortMessage || err.message}` });
    }
    if (onChainCommitment != null) {
      const matches = normaliseCommitment(onChainCommitment) === normaliseCommitment(commitment);
      checks.push({
        name: 'Commitment binds this exact order',
        passed: matches,
        detail: matches
          ? `The executor re-derives the same commitment from this order. Route, fee, fee collector, recipient, quote, deadline and nonce are all inside it.`
          : `MISMATCH. The executor derives a different commitment from this order than the one consensus approved - settlement would revert, correctly.`,
      });
    }

    // 2. The route bytes must hash to the routeHash inside the commitment.
    //    Without this, the commitment would bind a route nobody can check.
    if (program) {
      const progHash = keccak256(program);
      const bound = sameAddr(progHash, o.routeHash);
      checks.push({
        name: 'Route program matches routeHash',
        passed: bound,
        detail: bound
          ? `keccak256(aggProgram) equals the routeHash in the approved order, so the executed path is the validated path.`
          : `The aggregator program does not hash to the committed routeHash - the bytes differ from what was approved.`,
      });
    }

    // 3. Recipient. A verdict that did not name the recipient could be pointed
    //    at anyone by whoever relays it.
    checks.push({
      name: 'Recipient bound to you',
      passed: sameAddr(o.user, user),
      detail: sameAddr(o.user, user)
        ? `Output is bound to ${String(user).slice(0, 8)}…${String(user).slice(-6)}; no relayer can redirect it.`
        : `The order names ${String(o.user).slice(0, 10)}…, not your connected wallet.`,
    });

    // 4. Router and fee. Both live inside the commitment, so a settlement agent
    //    cannot raise the fee or swap the venue after approval.
    checks.push({
      name: 'Router bound',
      passed: sameAddr(o.router, entrypoint),
      detail: `Settlement is pinned to the AGGFlow entrypoint ${String(o.router).slice(0, 10)}…`,
    });
    checks.push({
      name: 'Fee and collector bound',
      passed: o.feeBps <= PLATFORM_FEE_BPS,
      detail: `${Number(o.feeBps) / 100}% to ${String(o.feeCollector).slice(0, 10)}…, fixed inside the commitment.`,
    });

    // 5. Deadline. A verdict outliving its trade is a replay window.
    const now = Math.floor(Date.now() / 1000);
    const secsLeft = Number(o.deadline) - now;
    checks.push({
      name: 'Deadline still open',
      passed: secsLeft > 0,
      detail: secsLeft > 0
        ? `${formatDuration(secsLeft)} remaining before the order expires on-chain.`
        : `Expired ${formatDuration(-secsLeft)} ago.`,
    });

    // 6. Balance and allowance - the two conditions that make a correctly
    //    approved trade revert anyway, and the ones worth catching before the
    //    user signs rather than after.
    if (o.tokenIn && o.tokenIn !== ZERO && user) {
      try {
        const [bal, allow] = await Promise.all([
          client.readContract({ address: o.tokenIn, abi: ERC20_ABI, functionName: 'balanceOf', args: [user] }),
          client.readContract({ address: o.tokenIn, abi: ERC20_ABI, functionName: 'allowance', args: [user, executor] }),
        ]);
        checks.push({
          name: 'Balance covers the order',
          passed: bal >= o.amountIn,
          detail: bal >= o.amountIn ? 'Sufficient input balance.' : 'Input balance is below the order amount.',
        });
        checks.push({
          name: 'Executor allowance in place',
          passed: allow >= o.amountIn,
          detail: allow >= o.amountIn
            ? 'The one-time approval is already granted; settlement needs no further wallet prompt.'
            : 'A one-time approval is still needed for this token.',
        });
      } catch {
        /* a token that cannot be read is reported by the checks that remain */
      }
    }

    const passed = checks.every((c) => c.passed);
    return {
      checks,
      passed,
      allBound: checks.filter((c) => c.name.includes('bound') || c.name.includes('Commitment') || c.name.includes('Route')).every((c) => c.passed),
      onChainCommitment: onChainCommitment != null ? toBytes32(onChainCommitment) : null,
    };
  }

  /**
   * The mandate rail's pre-flight: the same question - what can the settlement
   * agent still change? - asked of a mandate. The answer is only the size of
   * the trade, inside the ceilings consensus set, and each check below is the
   * executor's own record rather than a claim.
   */
  static async preflightMandate({ order, program, mandateId, user, client, executor, entrypoint }) {
    const checks = [];
    const binding = (name, passed, detail) => checks.push({ name, passed, detail, binding: true });

    if (!order || !mandateId) {
      return {
        checks: [{ name: 'Mandate binding', passed: false, detail: 'No mandate or bound order was returned, so there is nothing to audit.', binding: true }],
        passed: false, allBound: false, onChainCommitment: null, mandateId,
      };
    }

    const o = typeof order.amountIn === 'bigint' ? order : deserialiseOrder(order);
    const read = (functionName, args) =>
      client.readContract({ address: executor, abi: EXECUTOR_READ_ABI, functionName, args }).catch(() => null);
    const [live, raw] = await Promise.all([read('isMandateLive', [mandateId]), read('mandates', [mandateId])]);
    const m = decodeMandate(raw);

    binding('Mandate recorded by the validator', Boolean(m && !sameAddr(m.user, ZERO)),
      m && !sameAddr(m.user, ZERO)
        ? 'Present on the executor. Only recordMandate writes one, and only the AgentValidator IC can call it.'
        : 'No mandate is recorded under this id.');
    binding('Mandate is live', live === true,
      live === true ? `Valid for ${formatDuration(Math.max(0, (m?.expiry || 0) - Math.floor(Date.now() / 1000)))}.` : 'Expired, revoked, or never recorded.');
    if (m) {
      binding('Recipient bound to you', sameAddr(m.user, user),
        sameAddr(m.user, user) ? 'Only your tokens move, and the output can only reach you.' : 'The mandate names a different user.');
      binding('Pair and direction bound', sameAddr(m.tokenIn, o.tokenIn) && sameAddr(m.tokenOut, o.tokenOut),
        `${String(m.tokenIn).slice(0, 8)}… to ${String(m.tokenOut).slice(0, 8)}…, never the reverse.`);
      if (program) {
        const routeOk = sameAddr(keccak256(program), m.routeHash);
        binding('Route program matches the mandate', routeOk,
          routeOk
            ? 'keccak256(aggProgram) equals the route hash the validators derived, so the executed path is the one consensus built.'
            : 'The program does not hash to the mandate\'s route; the executor would revert with RouteMismatch.');
      }
      binding('Size within the per-trade ceiling', o.amountIn <= m.maxAmountIn,
        `${o.amountIn} of at most ${m.maxAmountIn} (raw units).`);
      binding('Budget covers this trade', m.spentIn + o.amountIn <= m.totalBudgetIn,
        `${m.totalBudgetIn - m.spentIn} of ${m.totalBudgetIn} left before this trade (raw units).`);
      binding('Fee and collector bound', o.feeBps <= m.maxFeeBps && sameAddr(m.feeCollector, o.feeCollector),
        `At most ${Number(m.maxFeeBps) / 100}% to ${String(m.feeCollector).slice(0, 10)}…, fixed by consensus.`);
      binding('Router bound', sameAddr(m.router, entrypoint),
        `Settlement is pinned to the AGGFlow entrypoint ${String(m.router).slice(0, 10)}….`);
      checks.push({
        name: 'Priced by the executor',
        passed: true,
        detail: `The executor reads pool ${String(m.pool).slice(0, 10)}… at settlement, proves it canonical through the factory, `
          + `and refuses a floor more than ${Number(m.maxSlippageBps) / 100}% below its own price.`,
      });
    }

    if (o.tokenIn && o.tokenIn !== ZERO && user) {
      try {
        const [bal, allow] = await Promise.all([
          client.readContract({ address: o.tokenIn, abi: ERC20_ABI, functionName: 'balanceOf', args: [user] }),
          client.readContract({ address: o.tokenIn, abi: ERC20_ABI, functionName: 'allowance', args: [user, executor] }),
        ]);
        checks.push({ name: 'Balance covers the order', passed: bal >= o.amountIn,
          detail: bal >= o.amountIn ? 'Sufficient input balance.' : 'Input balance is below the order amount.' });
        checks.push({ name: 'Executor allowance in place', passed: allow >= o.amountIn,
          detail: allow >= o.amountIn ? 'The one-time approval is already granted.' : 'A one-time approval is still needed for this token.' });
      } catch {
        /* reported by the checks that remain */
      }
    }

    return {
      checks,
      passed: checks.every((c) => c.passed),
      allBound: checks.filter((c) => c.binding).every((c) => c.passed),
      onChainCommitment: null,
      mandateId,
    };
  }

  /**
   * After settlement: read the receipt and report what actually arrived.
   *
   * The panel used to show the quoted figure next to a green tick, which is the
   * expected output, not the delivered one. Those differ whenever the pool
   * moves between quote and fill, and only one of them is a fact.
   */
  static async audit({ txHash, tokenOut, user, quotedOut, minOut, decimals = 18 }) {
    const client = getQuoteClient();
    const receipt = await client.getTransactionReceipt({ hash: txHash }).catch(() => null);
    if (!receipt) return { ok: false, reason: 'Receipt not available yet.' };

    let delivered = 0n;
    for (const log of receipt.logs || []) {
      if (tokenOut && !sameAddr(log.address, tokenOut)) continue;
      try {
        const ev = decodeEventLog({ abi: TRANSFER_EVENT, data: log.data, topics: log.topics });
        if (ev.eventName === 'Transfer' && sameAddr(ev.args.to, user)) delivered += ev.args.value;
      } catch {
        /* not a Transfer log */
      }
    }

    const deliveredNum = Number(formatUnits(delivered, decimals));
    const quotedNum = quotedOut != null ? Number(formatUnits(BigInt(quotedOut), decimals)) : null;
    const minNum = minOut != null ? Number(formatUnits(BigInt(minOut), decimals)) : null;
    const slipPct = quotedNum ? ((deliveredNum - quotedNum) / quotedNum) * 100 : null;

    return {
      ok: receipt.status === 'success',
      status: receipt.status,
      gasUsed: receipt.gasUsed?.toString() || null,
      deliveredRaw: delivered.toString(),
      delivered: deliveredNum,
      quoted: quotedNum,
      min: minNum,
      slipPct,
      honouredMinimum: minNum == null ? null : deliveredNum >= minNum,
    };
  }
}

// ── Cross-agent debate ───────────────────────────────────────────────────────

/**
 * Turn the analyst's findings into an exchange between agents.
 *
 * A finding that nobody answers is a banner. The point of a swarm is that a
 * concern raised by one agent gets ruled on by another, in front of the user,
 * with the number that settles it - so the "should I do this trade" question is
 * answered by the run rather than left to the user to infer from four green
 * ticks and one red one.
 */
export function buildDebate({ analysis, route, intent, strategy, phase = 'market' }) {
  const turns = [];
  // One sentence per turn. The full finding stays in the analysis the panels
  // render; the debate only has to show who raised what and who answered.
  const firstSentence = (t) => String(t || '').split('. ')[0].replace(/\.$/, '');

  for (const c of analysis.concerns) {
    if (c.topic === 'depth') {
      turns.push({ from: 'market', to: 'router', text: `${firstSentence(c.text)}.` });
      const impact = typeof route.priceImpact === 'number' ? route.priceImpact : parseFloat(route.priceImpact);
      turns.push({
        from: 'router', to: 'market',
        text: Number.isFinite(impact) && impact > 0
          ? `Priced in: **${impact.toFixed(2)}%** impact, and anything worse than ${(intent.slippageBps / 100).toFixed(2)}% below the quote reverts.`
          : `Priced in: the quote uses live reserves, and the minimum received caps the move.`,
      });
    } else if (c.topic === 'venue-spread' || c.topic === 'dislocation') {
      turns.push({ from: 'market', to: 'risk', text: `${firstSentence(c.text)}.` });
      turns.push({
        from: 'risk', to: 'market',
        text: `Noted. Consensus checks the quote, not whether the pool is fairly priced, so treat the minimum as soft.`,
      });
    }
  }

  if (strategy?.rail === 'consensus') {
    turns.push({ from: 'settlement', to: 'intent', text: `Own verdict: settles by itself in ~30 min. You can leave.` });
  } else if (strategy?.rail === 'mandate') {
    turns.push({ from: 'settlement', to: 'risk', text: `Fast lane: one call, and the executor prices the trade from the pool itself.` });
  } else if (strategy?.rail === 'reuse') {
    turns.push({ from: 'settlement', to: 'risk', text: `A verdict for this order is already on chain. Settling in seconds.` });
  } else if (strategy?.rail === 'blocked') {
    turns.push({ from: 'settlement', to: 'intent', text: `⛔ ${firstSentence(strategy.rationale)}.` });
  }

  // Only the market phase gets a closing statement when nothing was raised.
  //
  // Without the phase check this fired on the settlement pass too, so a run that
  // had just heard two objections from the Market Analyst would print "no
  // objection from me" in that same agent's name a few lines later. A debate
  // that contradicts itself is worse than no debate.
  if (!turns.length && phase === 'market') {
    turns.push({ from: 'market', to: 'risk', text: `Deep enough, and the venues agree. No objection.` });
  }

  return turns;
}
