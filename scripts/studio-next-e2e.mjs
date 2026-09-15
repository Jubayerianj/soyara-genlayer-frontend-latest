#!/usr/bin/env node
//
// The Studio Next desk's own code paths, run outside the browser.
//
//   node scripts/studio-next-e2e.mjs          intent parsing + a read of the live contract
//   node scripts/studio-next-e2e.mjs --live   also trades on Studio Next, both rails
//
// --live drives lib/studioNext/client.js exactly as the page does: the user's
// writes go through Transaction Kit and an EIP-1193 provider (a local key
// standing in for the wallet, answering eth_sendTransaction the way MetaMask
// does), and the agent's trades go through the session-agent path. Nothing here
// talks to the contract any other way.

import { fileURLToPath } from 'node:url';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const base = fileURLToPath(new URL('../', import.meta.url));
const { parseStudioIntent } = await import(base + 'lib/studioNext/intent.js');
const { STUDIO_NEXT } = await import(base + 'constants/studioNext.js');
const studio = await import(base + 'lib/studioNext/client.js');
const market = await import(base + 'lib/studioNext/market.js');
const { orchestrateStudioSwarm, executeStudioPlan } = await import(base + 'services/a2a/studioSwarm.js');

const LIVE = process.argv.includes('--live');
let failed = 0;
const ok = (name) => console.log(`  ok    ${name}`);
const bad = (name, detail) => { failed += 1; console.log(`  FAIL  ${name}\n        ${detail}`); };
const check = (name, cond, detail = '') => (cond ? ok(name) : bad(name, detail));

// ── intent ──────────────────────────────────────────────────────────────────
console.log('intent');
{
  const s = parseStudioIntent('Swap 25 USDC to USDT');
  check('swap: tokens in sentence order, amount as a string', s.kind === 'swap' && s.tokenIn === 'USDC' && s.tokenOut === 'USDT' && s.amount === '25', JSON.stringify(s));

  const e = parseStudioIntent('swap 0.01 eth for usdc with 0.5% slippage');
  check('swap: decimal amount kept exact, slippage read', e.amount === '0.01' && e.slippageBps === 50 && e.tokenOut === 'USDC', JSON.stringify(e));

  const g = parseStudioIntent('sell 1 gen to usdc');
  check('GEN maps to the tradeable WGEN', g.tokenIn === 'WGEN', JSON.stringify(g));

  const m = parseStudioIntent('Let my agent swap up to 60 USDC into USDT, never more than 20 USDC per trade, for the next hour');
  check('mandate recognised before swap', m.kind === 'mandate', JSON.stringify(m));
  check('mandate budget, cap and duration', m.budget === '60' && m.cap === '20' && m.minutes === 60, JSON.stringify(m));
  check('mandate keeps the user\'s own words for validators', m.instruction.startsWith('Let my agent'));

  const m2 = parseStudioIntent('allow the agent to trade 100 usdt to eth, 10 each, for 30 minutes');
  check('mandate: "10 each" is the cap, 30 minutes is not an amount', m2.budget === '100' && m2.cap === '10' && m2.minutes === 30, JSON.stringify(m2));

  const u = parseStudioIntent('swap 5 wbtc to usdc');
  check('a token with no Studio Next pool asks rather than guesses', u.needs.length > 0, JSON.stringify(u));

  // Shipped: "two tokens and an amount" counted as a swap, so a deposit request
  // was quoted as a trade with a Swap button under it.
  for (const t of ['add 10 usdc and usdt liquidity', 'provide 10 usdc and 10 usdt', 'deposit 10 usdc and usdt on v2', 'remove 50% of my usdc usdt liquidity', 'let my agent add liquidity up to 60 usdc']) {
    check(`"${t}" goes to the pools app, never a swap`, parseStudioIntent(t).kind === 'liquidity', JSON.stringify(parseStudioIntent(t)));
  }
  check('a wrap request routes nowhere', parseStudioIntent('wrap 1 gen').kind === 'wrap');
  const w = parseStudioIntent('swap 5 wbtc to usdc');
  check('a token with no pool is named, not asked about', w.unsupported?.[0] === 'WBTC' && w.needs.length > 0, JSON.stringify(w));
  check('faucet request', parseStudioIntent('get test funds').kind === 'faucet');
  check('revoke request', parseStudioIntent('revoke my mandate').kind === 'revoke');
  check('no amount asks', parseStudioIntent('swap usdc to usdt').needs.includes('how much to sell'));
}

// ── amounts ─────────────────────────────────────────────────────────────────
console.log('amounts');
check('toRaw is exact', studio.toRaw('0.1') === 10n ** 17n && studio.toRaw('25') === 25n * 10n ** 18n);
check('toRaw refuses junk', studio.toRaw('1e5') === null && studio.toRaw('') === null);
check('fmt truncates', studio.fmt(1999999999999999999n, 2) === '1.99');

// ── the live contract ───────────────────────────────────────────────────────
console.log('contract');
const config = await studio.view('get_config');
check(`contract answers at ${STUDIO_NEXT.dex}`, Array.isArray(config.tokens) && config.tokens.join() === STUDIO_NEXT.tokens.join(), JSON.stringify(config).slice(0, 200));
// Every method the desk names must exist on the deployed contract: a renamed
// method is a button that fails for every user, found only by clicking it.
{
  const fs = await import('node:fs');
  const { createClient } = await import('genlayer-js-next');
  const schema = await createClient({ chain: studio.studioChain }).getContractSchema(STUDIO_NEXT.dex);
  const deployed = new Set(Object.keys(schema.methods || {}));
  const named = new Set();
  for (const f of ['components/StudioNext/StudioDesk.jsx', 'lib/studioNext/client.js']) {
    const src = fs.readFileSync(base + f, 'utf8');
    for (const m of src.matchAll(/(?:submitAsUser\(kit,|submitAsAgent\(agent,|view\()\s*'([a-z_]+)'/g)) named.add(m[1]);
  }
  check('the desk names contract methods', named.size >= 6, [...named].join(', '));
  for (const m of named) check(`${m} exists on the deployed contract`, deployed.has(m), [...deployed].join(', '));

  // Retired Studio Next deployments: code pointing at one reads a contract
  // without get_desk.
  const RETIRED = ['0xf7DA1Bde8af830aDCfBecf922097Ee0F6b09b4E2', '0xEf3ED991197eFE7c7904A23D54f38Eb1105Db082'];
  const hits = ['constants/studioNext.js', 'components/StudioNext/StudioDesk.jsx', 'lib/studioNext/client.js', 'pages/ai.jsx', 'pages/docs.jsx']
    .filter((f) => RETIRED.some((a) => fs.readFileSync(base + f, 'utf8').toLowerCase().includes(a.toLowerCase())));
  check('no code targets a retired Studio Next deployment', hits.length === 0, hits.join(', '));
}

// The desk refreshes with this single read; Studio Next allows 30 contract reads a minute.
const desk = await studio.view('get_desk', ['', 6]);
const pools = desk.pools || [];
check('get_desk answers in one read', Array.isArray(desk.pools) && !('balances' in desk), JSON.stringify(desk).slice(0, 200));
check('every pool seeded', pools.length === 4 && pools.every((p) => BigInt(p.reserve_base) > 0n), JSON.stringify(pools).slice(0, 200));
check('pool pairs match the app', pools.map((p) => p.pair).join() === STUDIO_NEXT.pairs.join());

// The swarm predicts refusals with the contract's rules. If they drift from the
// deployed contract, it would stop trades validators accept, or wave through
// ones they refuse.
console.log('contract rules the swarm uses');
check('fee, trade share and drift limits match the contract',
  config.swap_fee_bps === STUDIO_NEXT.swapFeeBps && config.max_trade_share_bps === STUDIO_NEXT.maxTradeShareBps && config.max_pool_drift_bps === STUDIO_NEXT.maxPoolDriftBps,
  JSON.stringify({ fee: config.swap_fee_bps, share: config.max_trade_share_bps, drift: config.max_pool_drift_bps }));
check('Bradbury token addresses match the contract',
  Object.entries(STUDIO_NEXT.bradburyTokens).every(([k, v]) => String(config.bradbury_tokens[k]).toLowerCase() === v.toLowerCase()), JSON.stringify(config.bradbury_tokens));
for (const p of pools) {
  const canonical = await market.bradburyPairFor(p.base, p.quote);
  check(`${p.pair} is priced from the canonical Bradbury pair`, canonical.toLowerCase() === p.market.toLowerCase(), `${canonical} vs ${p.market}`);
  const sell = 10n ** 17n;
  const q = await studio.view('quote', [p.base, p.quote, sell]);
  const mine = market.amountOutFor(sell, BigInt(p.reserve_base), BigInt(p.reserve_quote));
  check(`${p.pair} quote math matches the contract`, String(mine) === q.amount_out, `${mine} vs ${q.amount_out}`);
}

// ── the swarm, read-only ─────────────────────────────────────────────────────
console.log('swarm (reads only)');
async function runSwarm(text, ctx) {
  const frames = [];
  for await (const f of orchestrateStudioSwarm(text, ctx)) frames.push(f);
  return frames;
}
const reader = '0x54BD3e64063420c933f566a5217C670563Dd1C07';
{
  const f = await runSwarm('Swap 25 USDC to USDT', { user: reader, agentAddress: null });
  const shown = f.filter((x) => x.type !== 'MESSAGE');
  const done = f.find((x) => x.type === 'SWARM_COMPLETE');
  check('a clean trade reaches every agent in order',
    ['agent_intent', 'agent_router', 'agent_market', 'agent_settlement', 'agent_risk', 'agent_auditor', 'agent_dev'].every((id) => shown.some((x) => x.agent.id === id)), shown.map((x) => x.type).join(' > '));
  check('and ends ready on the consensus rail', done?.payload?.rail === 'consensus' && !done.payload.blocked, JSON.stringify(done?.payload?.blocked));
  const longest = Math.max(...shown.map((x) => x.text.length));
  check('every frame is one short line', longest <= 120 && !shown.some((x) => x.text.includes('\n')), `${longest} chars`);
  check('no frame uses an em dash', !shown.some((x) => x.text.includes('\u2014')));
  check('the floor sits below the expected fill', done.payload.minOut < done.payload.amountOut);
}
{
  const f = await runSwarm('Swap 400 USDC to ETH', { user: reader, agentAddress: null });
  const halt = f.find((x) => x.type === 'SWARM_HALTED');
  check('an order over 10% of the live market stops before signing', Boolean(halt) && /most it takes/.test(halt.payload.blocked), JSON.stringify(halt?.payload?.blocked));
}
{
  const f = await runSwarm('Let my agent swap up to 60 USDC into USDT, 20 per trade, for an hour', { user: reader, agentAddress: '0x' + 'b2'.repeat(20) });
  const done = f.find((x) => x.type === 'SWARM_COMPLETE' || x.type === 'SWARM_HALTED');
  check('a mandate request plans a grant, not a trade', done?.payload?.kind === 'mandate' && done.payload.rail === 'mandate-grant', JSON.stringify(done?.payload?.rail));
}
{
  const f = await runSwarm('add 10 usdc and usdt liquidity', { user: reader });
  check('a liquidity request is handed to the pools app', f.some((x) => x.type === 'REDIRECTED') && !f.some((x) => x.payload));
  const g = await runSwarm('Swap 25 USDC to USDT', { user: null });
  const halt = g.find((x) => x.type === 'SWARM_HALTED');
  check('without a wallet the swarm stops at settlement', /Connect a wallet/.test(halt?.payload?.blocked || ''), JSON.stringify(halt?.payload?.blocked));
}

if (LIVE) {
  console.log('live (Studio Next)');

  // A wallet stand-in: answers what genlayer-js asks an injected wallet.
  function localWallet(pk) {
    const account = privateKeyToAccount(pk);
    const call = async (method, params = []) => {
      const res = await fetch(STUDIO_NEXT.rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
      const json = await res.json();
      if (json.error) throw Object.assign(new Error(json.error.message), { code: json.error.code });
      return json.result;
    };
    return {
      address: account.address,
      async request({ method, params = [] }) {
        if (method === 'eth_chainId') return `0x${STUDIO_NEXT.chainId.toString(16)}`;
        if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [account.address];
        if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain') return null;
        if (method === 'eth_sendTransaction') {
          const tx = params[0];
          if (parseInt(tx.chainId, 16) !== STUDIO_NEXT.chainId) throw new Error(`wrong chain ${tx.chainId}`);
          const signed = await account.signTransaction({
            chainId: STUDIO_NEXT.chainId, type: 'legacy', to: tx.to, data: tx.data,
            value: BigInt(tx.value || 0), nonce: Number(BigInt(tx.nonce)), gas: BigInt(tx.gas), gasPrice: BigInt(tx.gasPrice || 0),
          });
          return call('eth_sendRawTransaction', [signed]);
        }
        return call(method, params);
      },
    };
  }

  // sessionAgent keeps its key in localStorage, as in the browser.
  const store = new Map();
  globalThis.window = { localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) } };

  const wallet = localWallet(generatePrivateKey());
  const user = wallet.address;
  const agent = studio.sessionAgent(user);
  check('session agent is a different address, and stable', agent.address !== user && studio.sessionAgent(user).address === agent.address);

  await studio.ensureGas(user);
  await studio.ensureGas(agent.address);
  await studio.ensureWalletOnStudio(wallet);

  let t = Date.now();
  const faucet = await studio.submitAsAgent(agent, 'claim_test_tokens', [user]);
  const bal = await studio.view('get_balances', [user]);
  check(`faucet relayed by the agent (${((Date.now() - t) / 1000).toFixed(1)}s)`, faucet.ok && BigInt(bal.USDC) === 1000n * studio.ONE, JSON.stringify(bal));

  const kit = studio.userKit(wallet, user);
  const amount = studio.toRaw('10');
  const q = await studio.view('quote', ['USDC', 'USDT', amount]);
  const minOut = BigInt(q.amount_out) * 9900n / 10000n;
  const rid = studio.requestId();
  const steps = [];
  t = Date.now();
  const swap = await studio.submitAsUser(kit, 'swap', [rid, 'USDC', 'USDT', amount, minOut, 100], (s) => steps.push(s.step));
  const v = await studio.readVerdict(rid);
  check(`consensus swap through Transaction Kit (${((Date.now() - t) / 1000).toFixed(1)}s, deposit ${studio.fmt(swap.quote.feeValue, 6)} GEN, ${swap.quote.source} profile)`,
    swap.ok && v?.approved === true, JSON.stringify({ ok: swap.ok, v, steps }));
  check('kit reported sign, then tracked to decided', steps[0] === 'sign' && steps.includes('decided'), steps.join(' > '));

  const mid = studio.requestId();
  const words = 'let my agent swap up to 30 usdc into usdt, 10 per trade, for an hour';
  const intent = parseStudioIntent(words);
  t = Date.now();
  const mandate = await studio.submitAsUser(kit, 'issue_mandate', [
    mid, agent.address, intent.tokenIn, intent.tokenOut, studio.toRaw(intent.budget), studio.toRaw(intent.cap),
    intent.slippageBps, intent.minutes, intent.instruction,
  ]);
  const vm = await studio.readVerdict(mid);
  check(`mandate from the parsed words (${((Date.now() - t) / 1000).toFixed(1)}s)`, mandate.ok && vm?.approved === true, JSON.stringify(vm));

  if (vm?.approved) {
    const r2 = studio.requestId();
    t = Date.now();
    const a = await studio.submitAsAgent(agent, 'swap_under_mandate', [r2, mid, studio.toRaw('10'), 0n]);
    const va = await studio.readVerdict(r2);
    check(`agent trade under the mandate, no wallet (${((Date.now() - t) / 1000).toFixed(1)}s)`, a.ok && va?.approved === true, JSON.stringify(va));

    const r3 = studio.requestId();
    await studio.submitAsAgent(agent, 'swap_under_mandate', [r3, mid, studio.toRaw('11'), 0n]);
    const vr = await studio.readVerdict(r3);
    check('agent over the per-trade cap is refused', vr?.approved === false && /per-trade cap/.test(vr.reason), JSON.stringify(vr));
  }

  // ── the swarm's own plans, executed ────────────────────────────────────────
  console.log('live swarm (Studio Next)');
  const planFor = async (text) => {
    let payload = null;
    for await (const f of orchestrateStudioSwarm(text, { user, agentAddress: agent.address })) if (f.payload) payload = f.payload;
    return payload;
  };
  // The mandate above has 10 of 30 USDC left after one trade, so 5 USDC rides it.
  const lane = await planFor('Swap 5 USDC to USDT');
  check('the swarm hands a covered trade to the agent', lane?.rail === 'mandate' && !lane.blocked, JSON.stringify({ rail: lane?.rail, blocked: lane?.blocked }));
  if (lane?.rail === 'mandate') {
    t = Date.now();
    const r = await executeStudioPlan({ payload: lane, kit: null, agent, user });
    check(`swarm agent trade settled (${((Date.now() - t) / 1000).toFixed(1)}s)`, r.verdict?.approved === true, JSON.stringify(r.verdict));
    check('auditor: balances moved exactly as the verdict says', r.audit?.balancesMatch === true && r.audit?.honouredMinimum === true, JSON.stringify(r.audit, (k, v) => typeof v === 'bigint' ? v.toString() : v));
  }
  const own = await planFor('Swap 15 USDC to USDT');
  check('a trade over the mandate cap takes a consensus round', own?.rail === 'consensus' && !own.blocked, JSON.stringify({ rail: own?.rail, blocked: own?.blocked }));
  if (own?.rail === 'consensus') {
    t = Date.now();
    const r = await executeStudioPlan({ payload: own, kit, agent, user });
    check(`swarm consensus trade signed and settled (${((Date.now() - t) / 1000).toFixed(1)}s)`, r.ok && r.verdict?.approved === true, JSON.stringify(r.verdict));
    check('auditor: minimum honoured, balances exact', r.audit?.honouredMinimum === true && r.audit?.balancesMatch === true, JSON.stringify(r.audit, (k, v) => typeof v === 'bigint' ? v.toString() : v));
  }
}

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
