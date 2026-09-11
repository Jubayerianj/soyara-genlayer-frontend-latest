#!/usr/bin/env node
//
// Both settlement rails, end to end, through the running app's own API routes.
//
//   node scripts/rails-e2e.mjs --user 0x... [--base http://localhost:3000] [--rail both|mandate|consensus]
//
// The user must hold the input tokens and have approved AgentExecutor once.
// The server holds the lane and relayer keys; this script holds none.
//
//   mandate    POST /api/agent-mandate, wait for the round to FINALIZE and the
//              mandate to appear on the executor, then validate a trade with
//              the mandate id: /api/genlayer-validate must answer rail
//              'mandate' without opening a round, and /api/agent-execute must
//              settle it with executeSwapUnderMandate.
//   consensus  validate a trade with NO mandate: its own validate_swap round.
//              Wait for the verdict to reach the executor, then settle it with
//              executeSwap, which consumes the verdict.
//
// Each rail waits out one appeal window (30 minutes after the last vote on Bradbury). They
// run concurrently. Every step is logged with its transaction hash.

import { createPublicClient, http, decodeEventLog } from 'viem';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const base = fileURLToPath(new URL('../', import.meta.url));
const ABI = JSON.parse(fs.readFileSync(base + 'abi/AgentExecutor.json', 'utf8'));
const { CONTRACT_ADDRESSES } = await import(base + 'constants/addresses.js');

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const USER = arg('user');
const BASE = arg('base', 'http://localhost:3000');
const RAIL = arg('rail', 'both');
if (!USER) { console.error('--user 0x... is required'); process.exit(2); }

const EXECUTOR = CONTRACT_ADDRESSES[4221].agentExecutor;
const USDC = '0x58B6CD7891cd0A682226E25607b958a6479195A6';
const USDT = '0x4B54235778c26Ee8ac27744A53d4c5BC4c9D46fc';
const chain = { id: 4221, name: 'Bradbury', nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc-bradbury.genlayer.com'] } } };
const client = createPublicClient({ chain, transport: http('https://rpc-bradbury.genlayer.com') });

const t0 = Date.now();
const log = (rail, msg) => console.log(`[${String(Math.round((Date.now() - t0) / 1000)).padStart(5)}s] ${rail.padEnd(9)} ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function post(path, body) {
  const res = await fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ...json };
}

/** Events the executor emitted in a settlement, by name. */
async function executorEvents(hash) {
  const r = await client.getTransactionReceipt({ hash });
  const names = [];
  for (const l of r.logs) {
    if (l.address.toLowerCase() !== EXECUTOR.toLowerCase()) continue;
    try { names.push(decodeEventLog({ abi: ABI, data: l.data, topics: l.topics }).eventName); } catch { /* not ours */ }
  }
  return { status: r.status, block: r.blockNumber, names };
}

async function validateUntilDecided(rail, body) {
  let v = await post('/api/genlayer-validate', body);
  log(rail, `validate -> HTTP ${v.status} rail=${v.rail} approved=${v.approved} pending=${v.pending} round=${v.tx_hash || '-'}`);
  for (let i = 0; v.pending && i < 120; i += 1) {
    await sleep(5000);
    const p = await post('/api/genlayer-validate', { checkTxHash: v.tx_hash, proposalId: v.proposal_id });
    v = { ...v, ...p, pendingOrder: v.pendingOrder, pendingProgram: v.pendingProgram, commitment: v.commitment, rail: v.rail };
    if (i % 6 === 0) log(rail, `  round ${v.statusName || 'pending'}...`);
  }
  return v;
}

async function mandateRail() {
  const R = 'mandate';
  // --mandate/--round reuse a mandate already requested, instead of paying for
  // another round.
  const req = arg('mandate')
    ? { mandateId: arg('mandate'), roundTxHash: arg('round'), roundSubmittedAt: Number(arg('submittedAt', Date.now())) }
    : await post('/api/agent-mandate', {
      user: USER, tokenIn: USDC, tokenOut: USDT,
      maxAmountIn: String(2n * 10n ** 18n), totalBudgetIn: String(20n * 10n ** 18n), maxSlippageBps: 100,
    });
  if (!req.mandateId || !req.roundTxHash) throw new Error(`mandate request failed: ${JSON.stringify(req)}`);
  log(R, `issue_trading_mandate round ${req.roundTxHash} -> mandate ${req.mandateId}`);

  // Poll the route: each poll also nudges the round toward finalization.
  let live = false;
  for (let i = 0; !live && i < 60; i += 1) {
    const c = await post('/api/agent-mandate', {
      mandateId: req.mandateId, checkOnly: true, roundTxHash: req.roundTxHash, roundSubmittedAt: req.roundSubmittedAt,
    }).catch((e) => ({ live: false, note: e.message }));
    live = Boolean(c.live);
    if (live) { log(R, `mandate LIVE on executor: budget ${c.remainingBudget}, per-trade ${c.maxAmountIn}, expiry ${c.expiry}`); break; }
    if (i % 3 === 0) log(R, `  mandate not on the executor yet (finalization pending)`);
    await sleep(60_000);
  }
  if (!live) throw new Error('mandate never became live');

  const v = await validateUntilDecided(R, {
    action: 'SWAP', user: USER, tokenIn: 'USDC', tokenOut: 'USDT', amountIn: '1', slippageBps: 30, mandateIds: [req.mandateId],
  });
  if (v.rail !== 'mandate' || !v.approved) throw new Error(`expected the mandate rail, got ${v.rail}: ${v.reason}`);
  if (v.tx_hash) throw new Error('a round was opened for a mandate-covered trade');
  log(R, `covered by ${v.mandate_id} - no round opened`);

  const s = await post('/api/agent-execute', {
    rail: 'mandate', mandateId: v.mandate_id, pendingOrder: v.pendingOrder, pendingProgram: v.pendingProgram,
  });
  if (!s.success) throw new Error(`mandate settlement failed: ${JSON.stringify(s)}`);
  const ev = await executorEvents(s.execTxHash);
  log(R, `SETTLED ${s.execTxHash} block ${ev.block} status ${ev.status} events [${ev.names.join(', ')}]`);
  if (!ev.names.includes('MandateSpent') || !ev.names.includes('SwapExecuted')) throw new Error('expected MandateSpent and SwapExecuted');
  return { rail: R, hash: s.execTxHash, mandateId: v.mandate_id };
}

async function consensusRail() {
  const R = 'consensus';
  // --resume <file> picks up an approved round saved by an earlier run, so a
  // wait that outlived the script (a timeout, a laptop asleep) is not lost.
  let v;
  if (arg('resume')) {
    v = JSON.parse(fs.readFileSync(arg('resume'), 'utf8'));
    log(R, `resuming round ${v.tx_hash}, commitment ${v.commitment}`);
  } else {
    // Same pair, no mandate ids: this trade gets a round of its own. A round
    // that ends undecided (LEADER_TIMEOUT, UNDETERMINED) is a network
    // condition, not a verdict - the app runs a fresh round, and so does this.
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      v = await validateUntilDecided(R, {
        action: 'SWAP', user: USER, tokenIn: 'USDC', tokenOut: 'USDT', amountIn: '2', slippageBps: 30,
      });
      if (v.approved || !v.retryable) break;
      log(R, `  round undecided (${v.reason?.slice(0, 60)}...), fresh round ${attempt + 1}/3`);
    }
    if (v.rail !== 'consensus' || !v.approved) throw new Error(`expected an approved consensus round, got ${v.rail}/${v.approved}: ${v.reason}`);
    log(R, `approved by consensus, commitment ${v.commitment}`);
    const saved = `rails-e2e.consensus.${v.commitment.slice(2, 10)}.json`;
    fs.writeFileSync(saved, JSON.stringify({
      rail: v.rail, approved: v.approved, tx_hash: v.tx_hash, commitment: v.commitment,
      pendingOrder: v.pendingOrder, pendingProgram: v.pendingProgram,
    }, null, 2));
    log(R, `  saved to ${saved}; continue a cut-short wait with --rail consensus --resume ${saved}`);
  }

  const body = {
    rail: 'consensus', pendingOrder: v.pendingOrder, pendingProgram: v.pendingProgram,
    validationSubmitted: true, validationTxHash: v.tx_hash,
  };
  for (let i = 0; i < 90; i += 1) {
    // One failed read (a node hiccup, a laptop waking up) must not end a wait
    // that takes most of an hour. Log it and try again next tick.
    let live = false;
    try {
      live = await client.readContract({ address: EXECUTOR, abi: ABI, functionName: 'isVerdictLive', args: [v.commitment] });
    } catch (e) {
      log(R, `  read failed (${e.shortMessage || e.message}), retrying`);
      await sleep(15_000);
      continue;
    }
    if (live) {
      log(R, 'verdict LIVE on executor - settling');
      const s = await post('/api/agent-execute', body);
      if (!s.success) throw new Error(`consensus settlement failed: ${JSON.stringify(s)}`);
      const ev = await executorEvents(s.execTxHash);
      log(R, `SETTLED ${s.execTxHash} block ${ev.block} status ${ev.status} events [${ev.names.join(', ')}]`);
      if (!ev.names.includes('VerdictConsumed') || !ev.names.includes('SwapExecuted')) throw new Error('expected VerdictConsumed and SwapExecuted');
      const used = await client.readContract({ address: EXECUTOR, abi: ABI, functionName: 'commitmentUsed', args: [v.commitment] });
      log(R, `commitmentUsed(${v.commitment.slice(0, 10)}...) = ${used} - single use`);
      return { rail: R, hash: s.execTxHash, commitment: v.commitment };
    }
    // Drive finalization the way the settlement queue does.
    await post('/api/finalize-round', { txHash: v.tx_hash, submittedAt: t0 }).catch(() => null);
    if (i % 3 === 0) log(R, '  verdict not on the executor yet (appeal window)');
    await sleep(60_000);
  }
  throw new Error('verdict never reached the executor');
}

const jobs = [];
if (RAIL === 'both' || RAIL === 'mandate') jobs.push(mandateRail());
if (RAIL === 'both' || RAIL === 'consensus') jobs.push(consensusRail());
const results = await Promise.allSettled(jobs);
let failed = 0;
for (const r of results) {
  if (r.status === 'fulfilled') console.log(`PASS ${r.value.rail}: ${r.value.hash}`);
  else { failed += 1; console.log(`FAIL ${r.reason?.message || r.reason}`); }
}
process.exit(failed ? 1 : 0);
