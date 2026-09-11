#!/usr/bin/env node
//
// The app's settlement surface, checked against the DEPLOYED contracts.
//
//   npm run test:settlement
//
// Three questions, each answered by the chain or by the source itself rather
// than by a document:
//
//   1. Does every Intelligent Contract method this app calls exist on the
//      deployed AgentValidator? A call to a method the contract does not have is
//      a consensus round that runs and raises - which is how the V3 liquidity
//      wrappers were left calling validators removed to fit the deploy limit.
//   2. Do the agent surfaces settle only through AgentExecutor? The hook they
//      share must contain no path to AGGFlowEntrypoint, and no rail may resolve
//      by default.
//   3. Does the deployed executor refuse what it should? Every probe is an
//      eth_call from the address that would really send it: no gas, no round.
//
// Read-only. Needs no keys.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { keccak256 } from 'viem';

const base = fileURLToPath(new URL('../', import.meta.url));
const { CONTRACT_ADDRESSES, INTELLIGENT_CONTRACTS } = await import(base + 'constants/addresses.js');
const { probe, deriveCommitment, readRoles, sampleOrder, probeClient, SAMPLE_PROGRAM } = await import(base + 'lib/settlementProbe.js');
const { settlementRailOf } = await import(base + 'lib/actions.js');
const { createClient, chains } = await import('genlayer-js');

const ABI = JSON.parse(fs.readFileSync(base + 'abi/AgentExecutor.json', 'utf8'));
const A = CONTRACT_ADDRESSES[4221];
const EXECUTOR = A.agentExecutor;
const IC = INTELLIGENT_CONTRACTS.agentValidator;

let failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) console.log(`  ok    ${name}${detail ? ` - ${detail}` : ''}`);
  else { failed += 1; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
};
const same = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

// ── source files the app ships ───────────────────────────────────────────────
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.next', 'subgraph', 'subgraph-v2', 'goldsky-doppler', 'server-indexer', 'points-deployment', 'mocks'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(js|jsx|mjs)$/.test(e.name)) out.push(p);
  }
  return out;
}
const APP_DIRS = ['lib', 'pages', 'services', 'hooks', 'components', 'utils'].map((d) => path.join(base, d));
const files = APP_DIRS.filter((d) => fs.existsSync(d)).flatMap((d) => walk(d));
const read = (p) => fs.readFileSync(p, 'utf8');
const rel = (p) => path.relative(base, p);
// Comments explain history ("this used to call X"); only code is checked.
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');

// ── 1. IC surface ────────────────────────────────────────────────────────────
console.log('\nIntelligent Contract surface (deployed AgentValidator)');
const gl = createClient({ chain: chains.testnetBradbury });
const schema = await gl.getContractSchema(IC);
const deployed = new Set(Object.keys(schema.methods || {}));
ok('the deployed AgentValidator answers with its schema', deployed.size > 0, `${deployed.size} methods at ${IC}`);

// Calls aimed at the Intelligent Contract: the two round helpers, and any
// read/write whose address is the IC. (Matching every snake_case functionName
// would sweep in Curve pools, which are EVM contracts with Vyper-style names.)
const icCalls = new Map();
const note = (method, file) => {
  if (!icCalls.has(method)) icCalls.set(method, new Set());
  icCalls.get(method).add(rel(file));
};
const ROUND_HELPER = /_(?:consensus|liquidity)Round\(\s*['"]([a-z][a-z0-9_]*)['"]/g;
const IC_ADDRESSED = /address:\s*(?:GENLAYER_CONFIG\.agentValidator|INTELLIGENT_CONTRACTS\.agentValidator|validatorAddress)\s*,[\s\S]{0,160}?functionName:\s*['"]([a-z][a-z0-9_]*)['"]/g;
for (const f of files) {
  const src = code(read(f));
  for (const m of src.matchAll(ROUND_HELPER)) note(m[1], f);
  for (const m of src.matchAll(IC_ADDRESSED)) note(m[1], f);
}

// The documentation pages show code a reader will copy. A method named there
// that the deployed contract does not have is the same drift in prose.
const DOC_PAGES = ['pages/docs.jsx', 'pages/dev.jsx', 'pages/sdk.jsx'].map((p) => path.join(base, p));
const DOC_METHOD = /\b(validate_[a-z0-9_]+|issue_trading_mandate|compute_proposal_id|check_mandate|get_validation)\b/g;
for (const f of DOC_PAGES) {
  if (!fs.existsSync(f)) continue;
  for (const m of read(f).matchAll(DOC_METHOD)) note(m[1], f);
}
ok('the app calls at least the binding validators', ['validate_swap', 'issue_trading_mandate'].every((m) => icCalls.has(m)),
   [...icCalls.keys()].join(', '));
for (const [method, where] of icCalls) {
  ok(`${method} exists on the deployed contract`, deployed.has(method), `called from ${[...where].join(', ')}`);
}
const v3OnChain = [...deployed].filter((m) => /liquidity.*v3|v3.*liquidity/.test(m));
ok('the deployed contract has no V3 liquidity validator', v3OnChain.length === 0, v3OnChain.join(', '));
const v3Calls = [...icCalls.keys()].filter((m) => /v3/.test(m));
ok('the app makes no V3 liquidity call', v3Calls.length === 0, v3Calls.join(', '));
ok('the app never calls the LiquidityValidator contract',
   !files.some((f) => /GENLAYER_CONFIG\.liquidityValidator|address:\s*INTELLIGENT_CONTRACTS\.liquidityValidator/.test(read(f))),
   files.filter((f) => /GENLAYER_CONFIG\.liquidityValidator/.test(read(f))).map(rel).join(', '));

// ── 1b. Nothing targets a retired contract ───────────────────────────────────
// Two test scripts kept settling against the 2026-09-07 executor, one of them
// signing attestor verdicts for a parameter the deployed executor does not
// have. A retired address in code is a call that will be refused, or a
// description of a trust model that no longer exists.
console.log('\nRetired contracts');
const RETIRED = {
  '0xa835c0a86dD64726eF23D83a8ca7D60b542EE2e4': 'pre-enforcement executor',
  '0x0F1E98571BADd0fF59a34140Fe1e820DaDF907E1': 'executor, 2026-09-07 pair',
  '0xf47492A969b2bC8f99B62Bdf8958541F2234C42b': 'AgentValidator, 2026-09-07 pair',
  '0x758d57cF9c96bC6235c1fA3929209A1C42346E18': 'executor, 2026-09-08 pair',
  '0x0a7125fdFAf4092b10Be8f509ce76A2AE7f5735A': 'AgentValidator, 2026-09-08 pair',
  '0x0c4F0F784cC06fb6964e2C9Ab4704ebfB4d64cFb': 'AgentValidator, first mandate build',
  '0x7aBa03DD415A096845A9C0ce8893E86EF74f8a98': 'earlier AgentValidator',
  // Every earlier AgentValidator, from the deployment record.
  ...Object.fromEntries([
    '0x8627CfDC1df6DcD813113FA2F400B35a99a781D4', '0x001E00a816fa93bC2cA07587d929Aa98C31051DD',
    '0x7ABa94668afC24463Be323f9bB65BD4b4F480d89', '0xf06FC7dA4d0dd806971d0Dd01A29bfE514BAa92B',
    '0x78FA2A758bdB65a66F4B9C08D8DC54066d0e0395', '0x69c33B036a982e7C7107b1634451A0C227cB2BBA',
    '0x683cBF11F807aB184ed2B4a5dDDC9E49dbBa0f51', '0x440FB164C93cC5657a1b1F53e8B4E1113c43AB9D',
    '0x7B6B4aFC5098fFe85124D4242577f06DCe497d0b', '0xDBFB9DDAc98084a792d2a8884B4FEbDD4F52F506',
    '0x2CA6e67846a9B30E1E175Ee4D1bd8b90f4c12C6e', '0xFc77C6A20B1102979f5887A5efe9611a2Ef6Afd5',
  ].map((a) => [a, `AgentValidator ${a.slice(0, 10)}`])),
};
const scriptFiles = walk(path.join(base, 'scripts'));
for (const [addr, what] of Object.entries(RETIRED)) {
  const hits = [...files, ...scriptFiles].filter((f) => code(read(f)).toLowerCase().includes(addr.toLowerCase())
    && !f.endsWith('settlement-surface.mjs'));
  ok(`no code targets the retired ${what}`, hits.length === 0, hits.map(rel).join(', '));
}
// The /sdk page tells developers what to call. Every SDK import and client
// method it shows must exist in the SDK: its quick start once called
// `settleSwap(trade)` with a `trade` that was never defined.
const SDK_DIR = path.join(base, '../../contracts-sdks-others/sdk');
if (fs.existsSync(path.join(SDK_DIR, 'src/index.js'))) {
  const sdk = await import(path.join(SDK_DIR, 'src/index.js'));
  const page = read(path.join(base, 'pages/sdk.jsx'));
  const imported = [...page.matchAll(/import\s*\{([^}]+)\}\s*from\s*'@soyaradex\/sdk'/g)]
    .flatMap((m) => m[1].split(',').map((x) => x.trim()).filter(Boolean));
  const missingImports = imported.filter((n) => !(n in sdk));
  ok('the /sdk page imports only what the SDK exports', imported.length > 0 && missingImports.length === 0,
     missingImports.join(', ') || imported.join(', '));
  const methods = [...new Set([...page.matchAll(/\bsoyara\.([a-zA-Z]+)\(/g)].map((m) => m[1]))];
  const missingMethods = methods.filter((m) => typeof sdk.SoyaraClient.prototype[m] !== 'function');
  ok('and calls only methods SoyaraClient has', methods.length > 0 && missingMethods.length === 0,
     missingMethods.join(', ') || methods.join(', '));
  ok('and settles the validated result, not an undefined trade', !/settleSwap\(\s*trade\s*\)/.test(page));
} else {
  console.log('  note  SDK source not beside the app; /sdk page API check skipped');
}
// The files a newcomer reads first. .env.local.example told them the agent
// route "calls approveTradeWithParams", and .env.example pointed
// GENLAYER_AGENT_VALIDATOR at a validator retired long before.
const SETUP_DOCS = ['README.md', '.env.example', '.env.local.example'].map((p) => path.join(base, p)).filter((p) => fs.existsSync(p));
const RETIRED_FOR_DOCS = [...Object.keys(RETIRED), '0xEFb9473B5269A79d72Df4b6E73E310791a185eeC'];
for (const f of SETUP_DOCS) {
  const src = read(f);
  const stale = [
    ...RETIRED_FOR_DOCS.filter((a) => src.toLowerCase().includes(a.toLowerCase())),
    ...(src.match(/approveTradeWithParams|validate_proposal|check_mandate|attestor|GENLAYER_MANDATE_ID/gi) || []),
  ];
  ok(`${rel(f)} names no retired contract or removed method`, stale.length === 0, stale.join(', '));
}
ok('the live address maps carry no LiquidityValidator',
   !('liquidityValidator' in INTELLIGENT_CONTRACTS) && !('liquidityValidator' in A));
const attestorSigners = [...files, ...scriptFiles].filter((f) => !f.endsWith('settlement-surface.mjs')
  && /SettlementVerdict|ATTESTOR_PRIVATE_KEYS/.test(code(read(f))));
ok('nothing signs an attestor verdict', attestorSigners.length === 0, attestorSigners.map(rel).join(', '));

// ── 2. The agent path settles only through AgentExecutor ─────────────────────
console.log('\nAgent surfaces: no direct settlement');
const hook = code(read(path.join(base, 'hooks/useAgentSwapExecution.js')));
ok('the shared agent hook never calls AGGFlowEntrypoint', !/executeSwapWithReceiver|AGGFlowEntrypoint\.json|AGGFLOW_ENTRYPOINT_ABI/.test(hook));
ok('the shared agent hook has no fast/direct mode', !/fastMode|DIRECT_SETTLEMENT|rail:\s*'direct'/.test(hook));
const actions = await import(base + 'lib/actions.js');
ok('there is no direct settlement route to select', !('DIRECT_SETTLEMENT' in actions));
for (const [name, v] of [
  ['no rail', { approved: true }],
  ['an unknown rail', { approved: true, rail: 'direct' }],
  ['a mandate rail with no id', { approved: true, rail: 'mandate' }],
  ['an unapproved result', { approved: false, rail: 'consensus' }],
]) {
  ok(`${name} settles nowhere`, settlementRailOf(v) === null, `got ${settlementRailOf(v)}`);
}
ok('an approved consensus result settles on its own verdict', settlementRailOf({ approved: true, rail: 'consensus' }) === 'consensus');
ok('a covered result settles under its mandate', settlementRailOf({ approved: true, rail: 'mandate', mandate_id: '0x' + '1'.repeat(64) }) === 'mandate');
for (const page of ['pages/ai.jsx', 'components/A2A/SwarmWarRoom.jsx']) {
  const src = read(path.join(base, page));
  ok(`${page} uses the shared hook and passes no settlement override`,
     /useAgentSwapExecution\((currentProposal|proposalForExecution)\)/.test(src) && !/fastMode/.test(src));
}

// ── 3. The deployed executor refuses what it should ──────────────────────────
console.log('\nDeployed executor (eth_call, no gas)');
const roles = await readRoles({ abi: ABI, executor: EXECUTOR });
ok('executor is bound to the configured AgentValidator', same(roles.validator, IC), `${roles.validator}`);
const icConfig = await gl.readContract({ address: IC, functionName: 'get_config', args: [] });
const icExec = icConfig?.agent_executor ?? icConfig?.get?.('agent_executor');
ok('the AgentValidator is bound back to this executor', same(icExec, EXECUTOR), `${icExec}`);
ok('executor is not paused', roles.paused === false);

const call = (from, functionName, args) => probe({ abi: ABI, executor: EXECUTOR, from, functionName, args });
const order = sampleOrder({ addresses: A });
const commitment = await deriveCommitment({ abi: ABI, executor: EXECUTOR, order });

let r = await call(roles.agent, 'executeSwap', [order, SAMPLE_PROGRAM]);
ok('an unapproved order cannot settle', !r.wouldSucceed && r.error === 'NoConsensusVerdict' && same(r.args[0], commitment),
   `${r.error}(${r.args[0] ?? ''})`);

const evil = { ...order, user: '0x9999999999999999999999999999999999999999' };
const evilC = await deriveCommitment({ abi: ABI, executor: EXECUTOR, order: evil });
r = await call(roles.agent, 'executeSwap', [evil, SAMPLE_PROGRAM]);
ok('a redirected recipient lands on a commitment no verdict backs', !same(evilC, commitment) && r.error === 'NoConsensusVerdict' && same(r.args[0], evilC));

for (const [field, overrides] of [
  ['fee', { feeBps: 50n }], ['fee collector', { feeCollector: evil.user }], ['route', { routeHash: keccak256('0x02') }],
  ['quote', { quotedAmountOut: order.quotedAmountOut + 1n }], ['nonce', { nonce: 2n }],
]) {
  const c = await deriveCommitment({ abi: ABI, executor: EXECUTOR, order: { ...order, ...overrides } });
  ok(`the ${field} is inside the commitment`, !same(c, commitment));
}

r = await call(roles.agent, 'executeSwap', [order, '0x02']);
ok('route bytes that do not match the order are refused', r.error === 'RouteMismatch', r.error);
r = await call(roles.agent, 'executeSwap', [{ ...order, minAmountOut: 0n }, SAMPLE_PROGRAM]);
ok('a zero floor is refused', r.error === 'QuoteInconsistent', r.error);
r = await call(evil.user, 'executeSwap', [order, SAMPLE_PROGRAM]);
ok('an unregistered relayer is refused', r.error === 'Unauthorized', r.error);

const future = BigInt(Math.floor(Date.now() / 1000) + 3600);
r = await call(roles.agent, 'recordVerdict', [BigInt(commitment), future]);
ok('the settlement agent cannot write a verdict', r.error === 'NotValidator', r.error);
const owner = await probeClient().readContract({ address: EXECUTOR, abi: ABI, functionName: 'owner' });
r = await call(owner, 'recordVerdict', [BigInt(commitment), future]);
ok('the owner cannot write a verdict', r.error === 'NotValidator', r.error);

const fakeMandate = keccak256('0x736f79617261');
r = await call(roles.agent, 'executeSwapUnderMandate', [fakeMandate, 10n ** 18n, 1n, 5n, SAMPLE_PROGRAM]);
ok('an unwritten mandate cannot be spent', r.error === 'NoMandate', r.error);

r = await call(roles.agent, 'executeAddLiquidityV3', ['0x3333333333333333333333333333333333333333', {
  token0: '0x4B54235778c26Ee8ac27744A53d4c5BC4c9D46fc', token1: '0x58B6CD7891cd0A682226E25607b958a6479195A6',
  fee: 3000, tickLower: -60, tickUpper: 60, amount0Desired: 10n ** 18n, amount1Desired: 10n ** 18n,
  amount0Min: 0n, amount1Min: 0n, recipient: '0x3333333333333333333333333333333333333333', deadline: future,
}]);
ok('the executor\'s V3 entry point fails closed (no validator can approve it)', r.error === 'NoConsensusVerdict', r.error);

console.log(failed === 0 ? '\nSettlement surface matches the deployed contracts.' : `\n${failed} FAILURE(S)`);
process.exit(failed === 0 ? 0 : 1);
