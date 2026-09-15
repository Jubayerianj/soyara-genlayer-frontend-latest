// services/a2a/studioSwarm.js
// ============================================================================
//  The Soyara swarm on GenLayer Studio Next.
//
//  Same seven agents as the Bradbury swarm (services/a2a/agents.js), working
//  against SoyaraAgentDex instead of AgentValidator + AgentExecutor. The shape
//  of the job is different, and the agents say so rather than pretend:
//
//  - On Bradbury the swarm opens a consensus round itself and settles later.
//    On Studio Next the round IS the settlement, and it is signed by the user's
//    wallet (or, inside a mandate, by the user's agent key). So the swarm
//    deliberates first and the round runs when the user presses Execute.
//  - The Market Analyst reads the same Bradbury pool validators will read and
//    runs the contract's own rules on it (lib/studioNext/market.js). A trade
//    the validators would refuse stops here, before anything is signed.
//
//  Every frame's `text` is one short line; the detail rides in `data`.
// ============================================================================

import { AGENT_REGISTRY, POOLS_URL, liquidityRedirectMessage } from './agents.js';
import { STUDIO_NEXT } from '../../constants/studioNext.js';
import { parseStudioIntent } from '../../lib/studioNext/intent.js';
import * as client from '../../lib/studioNext/client.js';
import {
  readBradburyMarket, bradburyPairFor, consensusCheck, mandateCovers, shortfallBps,
} from '../../lib/studioNext/market.js';

const pct = (bps) => `${(Number(bps) / 100).toFixed(2)}%`;
const price = (e18) => {
  const n = Number((BigInt(e18) * 1_000_000n) / client.ONE) / 1_000_000;
  return n >= 100 ? n.toFixed(2) : n.toPrecision(6).replace(/\.?0+$/, '');
};

/** What the swarm will not settle, in one line each. */
const HELP = 'Try "swap 25 USDC to USDT" or "let my agent swap up to 60 USDC into USDT, 20 per trade".';

/**
 * @param {string} prompt
 * @param {object} ctx
 * @param {string|null} ctx.user          connected wallet, or null
 * @param {string|null} ctx.agentAddress  this browser's agent key for the user
 * @param {function} [ctx.view]           contract read (injected in tests)
 * @param {function} [ctx.readMarket]     Bradbury pool read (injected in tests)
 * @param {function} [ctx.pairFor]        Bradbury factory read (injected in tests)
 */
export async function* orchestrateStudioSwarm(prompt, ctx = {}) {
  const A = AGENT_REGISTRY;
  const view = ctx.view || client.view;
  const readMarket = ctx.readMarket || readBradburyMarket;
  const pairFor = ctx.pairFor || bradburyPairFor;
  const user = ctx.user || null;
  const nowSec = Math.floor(Date.now() / 1000);
  const tick = () => new Promise((r) => setTimeout(r, 0));

  yield { agent: A.intent, type: 'MESSAGE', text: 'Reading your request', status: 'working' };
  const intent = parseStudioIntent(prompt);

  if (intent.kind === 'liquidity') {
    yield {
      agent: A.intent, type: 'REDIRECTED', status: 'complete',
      data: { url: POOLS_URL, action: intent.action },
      text: `${liquidityRedirectMessage(intent.action, intent.tokenIn, intent.tokenOut)} (Bradbury)`,
    };
    return;
  }
  if (intent.unsupported?.length) {
    yield { agent: A.intent, type: 'INTENT_UNCLEAR', status: 'error', data: intent, text: client.unsupportedLine(intent.unsupported) };
    return;
  }
  if (intent.needs?.length) {
    yield { agent: A.intent, type: 'INTENT_UNCLEAR', status: 'error', data: intent, text: `I need ${intent.needs.join(', ')}.` };
    return;
  }
  if (intent.kind !== 'swap' && intent.kind !== 'mandate') {
    yield { agent: A.intent, type: 'INTENT_UNCLEAR', status: 'error', data: intent, text: HELP };
    return;
  }

  const isMandate = intent.kind === 'mandate';
  const amountIn = client.toRaw(isMandate ? intent.cap : intent.amount);
  const budget = isMandate ? client.toRaw(intent.budget) : null;
  if (!amountIn || (isMandate && !budget)) {
    yield { agent: A.intent, type: 'INTENT_UNCLEAR', status: 'error', data: intent, text: HELP };
    return;
  }
  yield {
    agent: A.intent, type: 'INTENT_PARSED', status: 'complete', data: intent,
    text: isMandate
      ? `Mandate · ${intent.budget} ${intent.tokenIn} → ${intent.tokenOut} · ${intent.cap} per trade · ${intent.minutes} min`
      : `${intent.amount} ${intent.tokenIn} → ${intent.tokenOut} · max slippage ${pct(intent.slippageBps)}`,
  };

  // ── Router: the contract quotes its own pool ────────────────────────────────
  yield { agent: A.router, type: 'MESSAGE', text: 'Quoting the Studio Next pool', status: 'working' };
  await tick();
  const [quote, desk] = await Promise.all([
    view('quote', [intent.tokenIn, intent.tokenOut, amountIn]),
    view('get_desk', [user || '', 6]),
  ]);
  if (!quote?.ok) {
    yield {
      agent: A.router, type: 'ROUTE_REJECTED', status: 'error', data: { quote },
      text: `No ${intent.tokenIn}/${intent.tokenOut} pool on Studio Next. Pools: ${STUDIO_NEXT.pairs.join(', ')}.`,
    };
    return;
  }
  const pool = (desk.pools || []).find((p) => p.pair === quote.pair);
  const amountOut = BigInt(quote.amount_out);
  yield {
    agent: A.router, type: 'ROUTE_SIMULATED', status: 'complete', data: { quote, pool },
    text: isMandate
      ? `A ${intent.cap} ${intent.tokenIn} trade fills ${client.fmt(amountOut)} ${intent.tokenOut} from the ${quote.pair} pool now`
      : `${quote.pair} pool · ${client.fmt(amountOut)} ${intent.tokenOut} · impact and fee ${pct(quote.impact_bps)}`,
  };

  // ── Market Analyst: the market validators will read ─────────────────────────
  yield { agent: A.market, type: 'MESSAGE', text: 'Reading the Bradbury pool validators will check', status: 'working' };
  await tick();
  let check = null;
  let marketError = null;
  try {
    const market = await readMarket(pool);
    check = consensusCheck({ pool, tokenIn: intent.tokenIn, amountIn, slippageBps: intent.slippageBps, market });
  } catch (err) {
    marketError = err.message;
  }
  const concerns = [];
  if (!check) {
    concerns.push({ severity: 'medium', topic: 'unread', text: "Couldn't read the Bradbury pool, so validators' view is unchecked here" });
  } else {
    if (check.refusal === 'market') {
      concerns.push({
        severity: 'high', topic: 'depth',
        text: `${isMandate ? 'The per-trade cap' : 'This order'} is ${pct(check.shareBps)} of the live Bradbury market; validators refuse above 10%`,
      });
    }
    if (!isMandate && check.refusal === 'slippage') {
      concerns.push({ severity: 'high', topic: 'price', text: `The fill would be ${pct(check.shortfallBps)} under the live price, over your ${pct(intent.slippageBps)} limit` });
    }
    if (check.reanchors) {
      concerns.push({ severity: 'medium', topic: 'drift', text: `The pool is ${pct(check.driftBps)} off the live price; a consensus round moves it back first` });
    }
  }
  yield {
    agent: A.market, type: 'MARKET_READ', data: { check, concerns, marketError },
    status: concerns.some((c) => c.severity === 'high') ? 'warning' : 'complete',
    text: check
      ? `Bradbury price ${price(check.marketPrice)} · pool ${check.driftBps <= 1 ? 'agrees' : `${pct(check.driftBps)} off`} · ${isMandate ? 'cap' : 'order'} is ${check.shareBps < 1 ? '<0.01%' : pct(check.shareBps)} of the market`
      : "Couldn't read the Bradbury pool; validators will read it themselves",
  };

  // ── Debate ──────────────────────────────────────────────────────────────────
  const turns = [];
  if (check?.refusal === 'market') {
    turns.push({ from: 'market', to: 'risk', text: `${isMandate ? 'Cap' : 'Order'} is ${pct(check.shareBps)} of the Bradbury ${quote.pair} market.` });
    turns.push({ from: 'risk', to: 'intent', text: `Validators refuse above 10%. The most it takes is ${client.fmt(check.maxAmountIn)} ${intent.tokenIn}.` });
  }
  if (!isMandate && check?.refusal === 'slippage') {
    turns.push({ from: 'market', to: 'risk', text: `The fill is ${pct(check.shortfallBps)} under the live price.` });
    turns.push({ from: 'risk', to: 'intent', text: `Over your ${pct(intent.slippageBps)} limit, so validators would refuse it.` });
  }
  if (check?.reanchors) {
    turns.push({ from: 'market', to: 'router', text: `The pool is ${pct(check.driftBps)} off the live price.` });
    turns.push({ from: 'router', to: 'market', text: 'The round moves it back before pricing, so the fill is at the live price.' });
  }
  if (check && !turns.length) {
    turns.push({
      from: 'market', to: 'risk',
      text: isMandate
        ? 'The cap fits the market and the pool agrees with it. No objection.'
        : `Within ${pct(check.shortfallBps)} of the live price. No objection.`,
    });
  }
  for (const turn of turns) {
    await tick();
    yield { agent: A[turn.from], type: 'DEBATE', status: 'working', data: { to: turn.to }, text: `→ ${A[turn.to].name}: ${turn.text}` };
  }

  // ── Settlement Strategist: which signer, and what stops it ──────────────────
  yield { agent: A.settlement, type: 'MESSAGE', text: 'Picking the rail', status: 'working' };
  await tick();
  const balance = desk.balances ? BigInt(desk.balances[intent.tokenIn] || 0) : null;
  const needed = isMandate ? budget : amountIn;
  let blocked = null;
  if (!user) blocked = 'Connect a wallet to settle. The trade is tied to your address.';
  else if (balance !== null && balance < needed) blocked = `You hold ${client.fmt(balance)} ${intent.tokenIn}. Get test funds first.`;
  else if (check?.refusal === 'market') blocked = `Over 10% of the live market. The most it takes is ${client.fmt(check.maxAmountIn)} ${intent.tokenIn}.`;
  else if (!isMandate && check?.refusal === 'slippage') blocked = `The fill is ${pct(check.shortfallBps)} under the market, over your ${pct(intent.slippageBps)} limit.`;

  let rail = isMandate ? 'mandate-grant' : 'consensus';
  let mandate = null;
  let passedOver = null;
  if (!isMandate && !blocked) {
    const active = (desk.mandates || []).filter((m) => m.status === 'active' && m.token_in === intent.tokenIn && m.token_out === intent.tokenOut);
    for (const m of active) {
      const cover = mandateCovers({
        mandate: m, agentAddress: ctx.agentAddress, tokenIn: intent.tokenIn, tokenOut: intent.tokenOut,
        amountIn, fillPrice: BigInt(quote.fill_price), nowSec,
      });
      if (cover.ok) { rail = 'mandate'; mandate = m; break; }
      passedOver = passedOver || cover.why;
    }
  }
  // A consensus round re-anchors a drifted pool before pricing, so its fill is
  // the post-anchor one; a floor from the stale quote could sit above it.
  const expectedOut = rail === 'consensus' && check?.reanchors ? check.amountOut : amountOut;
  const floorBps = rail === 'mandate' ? Math.min(intent.slippageBps, Number(mandate.max_slippage_bps)) : intent.slippageBps;
  const minOut = isMandate ? 0n : (expectedOut * BigInt(10000 - floorBps)) / 10000n;
  yield {
    agent: A.settlement, type: 'SETTLEMENT_PLAN', status: blocked ? 'error' : 'complete',
    data: { rail, mandate, blocked, passedOver },
    text: blocked
      ? blocked
      : rail === 'mandate'
        ? `Your agent settles it under your mandate · no popup, about 8s`
        : rail === 'mandate-grant'
          ? 'One consensus round, then your agent trades inside it with no popup'
          : `Consensus round · you sign, validators read Bradbury, about 12s${passedOver ? ` (your mandate is ${passedOver})` : ''}`,
  };

  // ── Risk: what consensus will decide, not a verdict ─────────────────────────
  if (!blocked) {
    yield {
      agent: A.risk, type: 'CONSENSUS_PLANNED', status: 'complete', data: { rail },
      text: rail === 'mandate'
        ? 'The contract checks budget, cap, expiry and price band; no web read needed'
        : rail === 'mandate-grant'
          ? 'Validators read the market, and each model checks the caps against your words'
          : `Validators re-read the Bradbury pool and refuse a fill over ${pct(intent.slippageBps)}`,
    };
  }

  // ── Post-Trade Auditor: pre-flight against both chains ──────────────────────
  yield { agent: A.auditor, type: 'MESSAGE', text: 'Checking the pool against Bradbury', status: 'working' };
  await tick();
  const checks = [];
  try {
    const canonical = await pairFor(pool.base, pool.quote);
    checks.push({ name: 'Priced from the canonical Bradbury pair', passed: canonical.toLowerCase() === pool.market.toLowerCase(), detail: pool.market });
  } catch (err) {
    checks.push({ name: 'Priced from the canonical Bradbury pair', passed: false, detail: err.message });
  }
  if (user) {
    checks.push({
      name: isMandate ? 'Balance covers the budget' : 'Balance covers the trade',
      passed: balance !== null && balance >= needed,
      detail: `${client.fmt(balance ?? 0n)} ${intent.tokenIn}`,
    });
  }
  if (rail === 'mandate') {
    checks.push({ name: 'Mandate covers amount, budget and expiry', passed: true, detail: `${client.fmt(mandate.remaining)} ${intent.tokenIn} left` });
  }
  if (isMandate && ctx.agentAddress && user) {
    checks.push({ name: 'Agent key is not your wallet', passed: ctx.agentAddress.toLowerCase() !== user.toLowerCase(), detail: client.short(ctx.agentAddress) });
  }
  const passed = checks.filter((c) => c.passed).length;
  yield {
    agent: A.auditor, type: 'AUDIT_PREFLIGHT', data: { checks }, status: passed === checks.length ? 'complete' : 'error',
    text: passed === checks.length
      ? `✓ ${passed}/${checks.length} pre-flight checks`
      : `Pre-flight: ${checks.filter((c) => !c.passed).map((c) => c.name.toLowerCase()).join(', ')}`,
  };

  // ── Dev Inspector: the call, and what the contract refuses ──────────────────
  const dev = inspectStudioCall({ intent, rail, mandate, amountIn, minOut, check });
  yield {
    agent: A.dev, type: 'DEV_INSPECTED', status: 'complete', data: dev,
    text: `✓ ${dev.method} · ${dev.tamperVectors.length} tampered inputs the contract refuses`,
  };

  const payload = {
    kind: isMandate ? 'mandate' : 'swap',
    intent, quote, pool, check, concerns, rail, mandate, blocked,
    amountIn, amountOut: expectedOut, minOut, budget,
    balances: desk.balances || null,
    preflight: checks, dev,
  };
  const highs = concerns.filter((c) => c.severity === 'high').length;
  yield {
    agent: A.intent,
    type: blocked ? 'SWARM_HALTED' : 'SWARM_COMPLETE',
    status: blocked ? 'error' : 'ready',
    payload,
    text: blocked
      ? 'Stopped here. Nothing was sent, and nothing moved.'
      : highs
        ? `⚠️ ${highs} objection${highs === 1 ? '' : 's'} from ${A.market.name}. Your call.`
        : rail === 'mandate'
          ? '✓ All agents agree. Execute settles it with your agent, no popup.'
          : rail === 'mandate-grant'
            ? '✓ All agents agree. Sign the mandate; validators decide in about 20s.'
            : '✓ All agents agree. Execute to sign; validators decide in about 12s.',
  };
}

/** The contract call a plan makes, and the inputs SoyaraAgentDex refuses. */
export function inspectStudioCall({ intent, rail, mandate, amountIn, minOut, check }) {
  if (rail === 'mandate-grant') {
    return {
      method: 'issue_mandate',
      args: ['request_id', 'agent key', intent.tokenIn, intent.tokenOut, `${intent.budget}`, `${intent.cap}`, intent.slippageBps, intent.minutes, 'your words'],
      tamperVectors: [
        { param: 'agent', tampered: 'your own wallet', refused: 'The agent must be a different address' },
        { param: 'per_trade_cap', tampered: 'above the budget', refused: 'Per-trade cap must be above zero and within the budget' },
        { param: 'caps', tampered: 'looser than your words', refused: 'Validators found the caps looser than your instruction' },
        { param: 'ttl_minutes', tampered: 'over 24 hours', refused: 'Mandates last between 1 minute and 24 hours' },
      ],
    };
  }
  if (rail === 'mandate') {
    return {
      method: 'swap_under_mandate',
      args: ['request_id', client.short(mandate?.id), client.fmt(amountIn), client.fmt(minOut)],
      tamperVectors: [
        { param: 'amount_in', tampered: 'over the per-trade cap', refused: 'Over the per-trade cap' },
        { param: 'mandate_id', tampered: "another user's mandate", refused: "Only the mandate's agent or its owner can use it" },
        { param: 'timing', tampered: 'after revoke or expiry', refused: 'Mandate was revoked / Mandate expired' },
        { param: 'price', tampered: 'pool pushed off the band', refused: "Price left the mandate's band" },
      ],
    };
  }
  return {
    method: 'swap',
    args: ['request_id', intent.tokenIn, intent.tokenOut, client.fmt(amountIn), client.fmt(minOut), intent.slippageBps],
    tamperVectors: [
      { param: 'request_id', tampered: 'reuse a settled one', refused: 'request_id already used' },
      { param: 'min_amount_out', tampered: 'above the fill', refused: 'Output below your minimum' },
      { param: 'max_slippage_bps', tampered: '400', refused: 'Slippage must be between 0.01% and 3%' },
      { param: 'amount_in', tampered: check ? `over ${client.fmt(check.maxAmountIn)} ${intent.tokenIn}` : 'over 10% of the market', refused: 'Too large for the live market' },
    ],
  };
}

/**
 * Settle a plan the swarm agreed on, then audit what the contract recorded.
 *
 * @param {object} p
 * @param {object} p.payload   the SWARM_COMPLETE payload
 * @param {object} p.kit       Transaction Kit for the user's wallet (consensus and grant)
 * @param {object} p.agent     the session agent (mandate rail)
 * @param {string} p.user
 * @param {function} [p.onStep]
 */
export async function executeStudioPlan({ payload, kit, agent, user, onStep = () => {} }) {
  const { intent, rail } = payload;
  const rid = client.requestId();
  const started = Date.now();
  let submitted;
  if (rail === 'mandate') {
    onStep({ step: 'agent' });
    submitted = await client.submitAsAgent(agent, 'swap_under_mandate', [rid, payload.mandate.id, payload.amountIn, payload.minOut]);
  } else if (rail === 'mandate-grant') {
    submitted = await client.submitAsUser(kit, 'issue_mandate', [
      rid, agent.address, intent.tokenIn, intent.tokenOut, payload.budget, payload.amountIn,
      intent.slippageBps, intent.minutes, intent.instruction,
    ], onStep);
  } else {
    submitted = await client.submitAsUser(kit, 'swap', [
      rid, intent.tokenIn, intent.tokenOut, payload.amountIn, payload.minOut, intent.slippageBps,
    ], onStep);
  }
  const verdict = await client.readVerdict(rid);
  const after = rail === 'mandate-grant' ? null : await client.view('get_balances', [user]).catch(() => null);
  return {
    rid,
    txId: submitted.txId,
    ok: Boolean(submitted.ok),
    verdict,
    seconds: Math.max(1, Math.round((Date.now() - started) / 1000)),
    audit: rail === 'mandate-grant' ? null : auditStudioTrade({ payload, verdict, after }),
  };
}

/** What the Post-Trade Auditor checks once the contract has answered. */
export function auditStudioTrade({ payload, verdict, after }) {
  if (!verdict?.approved) return { ok: false };
  const delivered = BigInt(verdict.amount_out);
  const before = payload.balances;
  const { tokenIn, tokenOut } = payload.intent;
  let balancesMatch = null;
  if (before && after) {
    const spent = BigInt(before[tokenIn]) - BigInt(after[tokenIn]);
    const got = BigInt(after[tokenOut]) - BigInt(before[tokenOut]);
    balancesMatch = spent === BigInt(verdict.amount_in) && got === delivered;
  }
  return {
    ok: true,
    delivered,
    honouredMinimum: delivered >= payload.minOut,
    underMarketBps: shortfallBps(BigInt(verdict.fill_price), BigInt(verdict.market_price)),
    balancesMatch,
  };
}

/** The auditor's closing line for a settled trade. */
export function receiptLine({ payload, result }) {
  const a = result.audit;
  if (!a?.ok) return null;
  const parts = [
    `Receipt: ${client.fmt(a.delivered)} ${payload.intent.tokenOut} delivered`,
    a.honouredMinimum ? 'minimum honoured' : 'below the minimum',
  ];
  if (a.balancesMatch === true) parts.push('balances moved exactly');
  if (a.balancesMatch === false) parts.push('balances also changed elsewhere');
  return parts.join(' · ');
}
