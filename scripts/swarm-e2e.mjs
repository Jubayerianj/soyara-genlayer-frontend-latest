// scripts/swarm-e2e.mjs
//
// Runs the REAL orchestrateSwarm generator - the same code path /a2a runs -
// against the running dev server and the live Bradbury deployment.
//
// The swarm calls /api/genlayer-validate with a relative URL, so fetch is
// pointed at localhost here rather than stubbed. Stubbing it would test the
// generator's control flow while proving nothing about whether a consensus
// round, a rail choice or a binding check actually works.

const BASE = process.env.SWARM_BASE || 'http://localhost:3000';
const USER = process.env.SWARM_USER || '0x23D542DCEFb00b1f4268E67a0EC1EF4de0A58fe2';
const realFetch = globalThis.fetch;
globalThis.fetch = (url, init) =>
  realFetch(typeof url === 'string' && url.startsWith('/') ? BASE + url : url, init);

const { orchestrateSwarm } = await import('../services/a2a/agents.js');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { console.log(`  ok    ${n}${x ? ' - ' + x : ''}`); pass++; } else { console.log(`  FAIL  ${n}${x ? ' - ' + x : ''}`); fail++; } };

async function run(prompt, { user = USER } = {}) {
  const frames = [];
  for await (const f of orchestrateSwarm(prompt, user, {})) {
    frames.push(f);
    const name = (f.agent?.name || '?').padEnd(24);
    console.log(`    ${f.agent?.icon || ' '} ${name} [${f.type}] ${String(f.text).replace(/\n+/g, ' ').slice(0, 118)}`);
  }
  return frames;
}

console.log('\n=== 1. liquidity is handed off before any work is done ===');
{
  const f = await run('add liquidity 10 USDC and USDT');
  const types = f.map((x) => x.type);
  ok('redirects', types.includes('REDIRECTED'));
  ok('no route was quoted', !types.includes('ROUTE_SIMULATED'));
  ok('no consensus round was opened', !types.includes('CONSENSUS_REACHED'));
  ok('nothing became executable', !types.includes('SWARM_COMPLETE'));
  ok('names the pools app', f.some((x) => String(x.text).includes('app.soyara.com/pools')));
}

console.log('\n=== 2. an under-specified request is refused, not guessed ===');
{
  const f = await run('swap 34 udc to usdt');
  ok('asks instead of trading', f.some((x) => x.type === 'INTENT_UNCLEAR'));
  ok('no proposal prepared', !f.some((x) => x.type === 'SWARM_COMPLETE'));
}

console.log('\n=== 3. no wallet: consensus is refused because the verdict binds a recipient ===');
{
  const f = await run('swap 1 USDC to USDT', { user: null });
  ok('market read still ran', f.some((x) => x.type === 'MARKET_READ'));
  ok('stops at the wallet', f.some((x) => String(x.text).includes('Connect a wallet')));
  ok('no consensus round without a recipient', !f.some((x) => x.type === 'SETTLEMENT_PLAN'));
}

console.log('\n=== 4. full seven-agent swap run (live consensus) ===');
{
  const f = await run('swap 1 USDC to USDT with 1% slippage');
  const t = f.map((x) => x.type);
  const agents = new Set(f.map((x) => x.agent?.id));
  ok('router quoted', t.includes('ROUTE_SIMULATED'));
  ok('market analyst read the pools', t.includes('MARKET_READ'));
  ok('agents debated', t.includes('DEBATE'));
  ok('consensus round ran', t.includes('CONSENSUS_REACHED'));

  const done = f.find((x) => x.type === 'SWARM_COMPLETE');
  if (done) {
    ok('settlement rail chosen', t.includes('SETTLEMENT_PLAN'));
    ok('bindings audited', t.includes('AUDIT_PREFLIGHT'));
    ok('at least five distinct agents spoke', agents.size >= 5, `${agents.size} agents`);

    const strategy = done.payload?.strategy;
    const audit = done.payload?.audit;
    const analysis = done.payload?.analysis;
    ok('rail is a real one', ['reuse', 'attestor', 'consensus', 'blocked'].includes(strategy?.rail), `rail=${strategy?.rail} eta=${strategy?.eta}`);
    ok('market read has live reserves', Number(analysis?.entryReserveHuman) > 0, `${Number(analysis?.entryReserveHuman).toFixed(2)} USDC`);
    if (done.payload?.risk?.isApproved) {
      ok('executor re-derives the same commitment', audit?.checks?.some((c) => c.name.startsWith('Commitment binds') && c.passed));
      ok('route program hashes to the committed routeHash', audit?.checks?.some((c) => c.name.startsWith('Route program') && c.passed));
      ok('recipient is bound', audit?.checks?.some((c) => c.name.startsWith('Recipient') && c.passed));
      ok('fee and collector are bound', audit?.checks?.some((c) => c.name.startsWith('Fee and collector') && c.passed));
    } else {
      console.log('  note  consensus still pending; binding checks need an approved verdict');
    }
  } else {
    console.log('  note  swarm halted before completion (see frames above)');
  }
}

console.log('\n=== 5. the dislocated pair objects instead of calling itself optimal ===');
{
  // USDT -> USDC routes through WGEN, where the two pools disagree ~21x about
  // what WGEN is worth. This is the path that produced "11 USDT -> 219 USDC".
  const f = await run('swap 100 USDT to USDC with 1% slippage');
  const done = f.find((x) => x.type === 'SWARM_COMPLETE');
  const market = f.find((x) => x.type === 'MARKET_READ');
  ok('market read ran on the bad pair', Boolean(market));
  ok('the analyst objects', done?.payload?.analysis?.concerns?.length > 0,
     `${done?.payload?.analysis?.concerns?.length ?? 0} concern(s), verdict=${done?.payload?.analysis?.verdict}`);
  if (done) {
    ok('the closing line does not call it an agreement',
       !/Swarm agreement reached/.test(done.text), done.text.slice(0, 80));
    ok('the closing line names the objection', /objection/i.test(done.text));
  }
}

console.log('\n=== 6. a poll never erases the settlement handoff ===');
{
  const { mergeVerdictResponse } = await import('../lib/settlement.js');
  const submitted = { approved: false, pending: true, commitment: '0xabc', pendingOrder: { user: '0x1' }, pendingProgram: '0xdead', proposal_id: 'p1' };
  const polled = { approved: true, pending: false, reason: 'done', proposal_id: '' };
  const merged = mergeVerdictResponse(submitted, polled);
  ok('the verdict comes from the poll', merged.approved === true && merged.pending === false);
  ok('the commitment survives', merged.commitment === '0xabc');
  ok('the bound order survives', merged.pendingOrder?.user === '0x1');
  ok('the route program survives', merged.pendingProgram === '0xdead');
  ok('an empty proposal id does not erase the real one', merged.proposal_id === 'p1');
  ok('a fresh commitment from the poll wins',
     mergeVerdictResponse(submitted, { ...polled, commitment: '0xnew' }).commitment === '0xnew');
}

console.log(`\n${fail === 0 ? 'All swarm e2e checks passed.' : fail + ' CHECK(S) FAILED'}  (${pass} passed)`);
process.exit(fail === 0 ? 0 : 1);
