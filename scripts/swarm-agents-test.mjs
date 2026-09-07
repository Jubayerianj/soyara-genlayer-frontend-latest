// scripts/swarm-agents-test.mjs
//
// Exercises the three working agents added to the swarm against the LIVE
// Bradbury deployment, plus the liquidity handoff on both surfaces.
//
// These agents make claims about the chain, so the test has to talk to the
// chain. A mocked version of this would have passed while the real page showed
// a rail that does not exist.

import { MarketAnalystAgent, SettlementStrategistAgent, PostTradeAuditorAgent, buildDebate, EXECUTOR_READ_ABI } from '../services/a2a/analysts.js';
import fs from 'node:fs';
import { POOLS_URL, isLiquidityIntent, mentionsLiquidity, liquidityRedirectMessage } from '../lib/pools.js';
import { parseIntent } from '../lib/parseIntent.js';
import { quoteBestRouteMultiHop } from '../lib/dexQuote.js';
import { TOKEN_LIST } from '../constants/tokens.js';
import { parseUnits, formatUnits } from 'viem';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { console.log(`  ok    ${name}${extra ? ' - ' + extra : ''}`); pass++; }
  else { console.log(`  FAIL  ${name}${extra ? ' - ' + extra : ''}`); fail++; }
};
const T = (sym) => (TOKEN_LIST[4221] || []).find((t) => t.symbol === sym);

console.log('\ninline executor ABI matches the generated one');
const FULL_ABI = JSON.parse(fs.readFileSync(new URL('../abi/AgentExecutor.json', import.meta.url), 'utf8'));
const shape = (x) => JSON.stringify({
  name: x.name,
  inputs: (x.inputs || []).map(function walk(i) {
    return i.components ? { type: i.type, components: i.components.map(walk) } : { type: i.type };
  }),
  outputs: (x.outputs || []).map((o) => ({ type: o.type })),
  stateMutability: x.stateMutability,
});
for (const entry of EXECUTOR_READ_ABI) {
  const real = FULL_ABI.find((x) => x.type === 'function' && x.name === entry.name);
  ok(`${entry.name} matches the deployed ABI`, Boolean(real) && shape(real) === shape(entry),
     real ? '' : 'not present in abi/AgentExecutor.json');
}

console.log('\nliquidity handoff');
for (const a of ['ADD_LIQUIDITY', 'REMOVE_LIQUIDITY', 'add_liquidity', '  ADD_LIQUIDITY  ']) {
  ok(`"${a.trim()}" is a liquidity intent`, isLiquidityIntent(a));
}
ok('SWAP is not a liquidity intent', !isLiquidityIntent('SWAP'));
ok('UNKNOWN is not a liquidity intent', !isLiquidityIntent('UNKNOWN'));
ok('empty is not a liquidity intent', !isLiquidityIntent(''));
for (const t of ['add liquidity 10 usdc', 'deposit into the pool', 'provide LP', 'what pools exist']) {
  ok(`"${t}" mentions liquidity`, mentionsLiquidity(t));
}
ok('"swap 100 usdc to wgen" does not', !mentionsLiquidity('swap 100 usdc to wgen'));
const msg = liquidityRedirectMessage('ADD_LIQUIDITY', 'USDC', 'USDT');
ok('redirect names the pools app', msg.includes(POOLS_URL));
ok('redirect does not offer to deposit here', !/\bI will (add|deposit)\b/i.test(msg));

console.log('\nparser still routes liquidity phrasing to a liquidity action');
for (const p of ['add liquidity 10 USDC and USDT', 'deposit 5 WGEN and 100 USDC']) {
  const i = parseIntent(p, { slippageBps: 100 });
  ok(`"${p}" -> ${i.action}`, isLiquidityIntent(i.action));
}

console.log('\nMarket Analyst (live pools)');
const usdc = T('USDC'), usdt = T('USDT'), wgen = T('WGEN');
async function routeFor(a, b, amt) {
  const raw = parseUnits(String(amt), a.decimals);
  const r = await quoteBestRouteMultiHop(a.address, b.address, raw, 'best');
  return {
    tokenIn: a, tokenOut: b, amountInNum: amt,
    isMultiHop: Boolean(r?.isMultiHop), hops: r?.hops || null,
    priceImpact: r?.priceImpactPct ?? 0,
    priceWarning: r?.priceWarning || null,
    dislocationFactor: r?.dislocationFactor ?? 1,
    v2Quote: r?.v2 ? formatUnits(r.v2.amountOutRaw, b.decimals) : '0',
    v3Quote: r?.v3 ? formatUnits(r.v3.amountOutRaw, b.decimals) : '0',
    chosenRoute: r?.dex || 'none',
  };
}

// A small trade against the deepest pool should read as deep and raise nothing.
const smallRoute = await routeFor(usdc, usdt, 1);
const small = await MarketAnalystAgent.analyse({ slippageBps: 100 }, smallRoute);
ok('reads a live pool', small.poolCount > 0, `${small.poolCount} pool(s)`);
ok('reserves are real numbers', Number(small.entryReserveHuman) > 0, `${Number(small.entryReserveHuman).toFixed(2)} USDC`);
ok('1 USDC on the deep pool reads deep', small.depthLabel === 'deep', `${small.sizeVsDepthPct?.toFixed(4)}%`);
ok('no high-severity objection on a tiny trade', !small.concerns.some((c) => c.severity === 'high'));

// The pool that produced "11 USDT -> 219 USDC". The analyst must object.
const badRoute = await routeFor(usdt, usdc, 100);
const bad = await MarketAnalystAgent.analyse({ slippageBps: 100 }, badRoute);
ok('100 USDT is measured against the real reserve', bad.sizeVsDepthPct != null, `${bad.sizeVsDepthPct?.toFixed(2)}%`);
ok('the dislocated pair is contested, not "optimal"', bad.verdict === 'contested' || bad.concerns.length > 0,
   `verdict=${bad.verdict} concerns=${bad.concerns.length}`);

// No USD anywhere. This is the fabrication the analyst exists to avoid.
const asText = JSON.stringify(bad) + JSON.stringify(small);
ok('no invented dollar figures', !/\$[\d,]/.test(asText));

// The multi-hop entry pool is USDT/WGEN, not USDT/USDC. Labelling its second
// reserve with the trade's output symbol reported 8.33 WGEN as "8.33 USDC".
ok('reserves are labelled with the pool\'s own tokens',
   bad.entrySymbol === 'USDT' && bad.exitSymbol !== 'USDC',
   `${bad.entryPairLabel} (entry=${bad.entrySymbol}, exit=${bad.exitSymbol})`);
ok('the direct pair labels both sides correctly',
   small.entrySymbol === 'USDC' && small.exitSymbol === 'USDT', small.entryPairLabel);

console.log('\nSettlement Strategist (live executor)');
const plan = await SettlementStrategistAgent.plan({ commitment: '0x' + '11'.repeat(32), deadline: Math.floor(Date.now() / 1000) + 3600 });
ok('executor is readable', plan.executor && plan.paused === false);
ok('attestor threshold is read, not assumed', plan.attestorThreshold > 0, `${plan.attestorThreshold}-of-N`);
ok('an unknown commitment is not treated as live', plan.verdictLive === false);
ok('picks the fast rail when attestors are armed', plan.rail === 'attestor', `rail=${plan.rail} eta=${plan.eta}`);
ok('rationale is specific', /\d/.test(plan.rationale));

const expired = await SettlementStrategistAgent.plan({ commitment: '0x' + '11'.repeat(32), deadline: Math.floor(Date.now() / 1000) - 60 });
ok('a passed deadline blocks settlement', expired.rail === 'blocked', expired.blockers[0] || '');

console.log('\nPost-Trade Auditor');
const noOrder = await PostTradeAuditorAgent.preflight({ order: null, program: null, commitment: null, user: '0x0000000000000000000000000000000000000001' });
ok('refuses to claim bindings it cannot check', noOrder.passed === false && noOrder.allBound === false);

console.log('\ndebate');
const turns = buildDebate({ analysis: bad, route: badRoute, intent: { slippageBps: 100 }, strategy: plan });
ok('a high-severity finding gets an answer', turns.length >= 2, `${turns.length} turns`);
ok('the answer comes from a different agent', turns.some((t, i) => i > 0 && t.from !== turns[i - 1].from));
ok('the rail is explained in the debate', turns.some((t) => t.from === 'settlement'));
const clean = buildDebate({ analysis: { concerns: [] }, route: smallRoute, intent: { slippageBps: 100 }, strategy: null, phase: 'market' });
ok('a clean read still produces a statement', clean.length >= 1);

// The settlement pass must not put "no objection from me" in the Market
// Analyst's name moments after that same agent raised two objections.
const railOnly = buildDebate({ analysis: { concerns: [] }, route: badRoute, intent: { slippageBps: 100 }, strategy: plan, phase: 'settlement' });
ok('the settlement pass never speaks for the market analyst',
   !railOnly.some((t) => t.from === 'market'), railOnly.map((t) => t.from).join(','));
const slowRail = buildDebate({ analysis: { concerns: [] }, route: badRoute, intent: { slippageBps: 100 }, strategy: { rail: 'consensus' }, phase: 'settlement' });
ok('the slow rail is explained rather than silently falling through',
   slowRail.length === 1 && slowRail[0].from === 'settlement');

console.log(`\n${fail === 0 ? 'All swarm agent checks passed.' : fail + ' CHECK(S) FAILED'}  (${pass} passed)`);
process.exit(fail === 0 ? 0 : 1);
