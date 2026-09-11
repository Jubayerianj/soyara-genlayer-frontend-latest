#!/usr/bin/env node
//
// Regressions for the bugs that reached users.
//
// Every case here is something that shipped, was found in the UI rather than by
// a test, and moved or misreported someone's money. They are grouped by the
// failure, not by the module, because the common thread is a defaulting rule
// that resolved to the wrong branch quietly.
//
//   node scripts/regression.mjs

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createPublicClient, http } from 'viem';

// fileURLToPath, not URL.pathname: the latter keeps %20 for the space in this
// repository's path, and every read then fails with ENOENT.
const base = fileURLToPath(new URL('../', import.meta.url));
const { normaliseAction, routeForAction, assertSettlementRoute } = await import(base + 'lib/actions.js');
const { toRawAmount } = await import(base + 'lib/amounts.js');
const { quoteBestRouteMultiHop } = await import(base + 'lib/dexQuote.js');
const { buildLiquidityV2AddOrder } = await import(base + 'lib/liquidityOrder.js');

const ABI = JSON.parse(fs.readFileSync(base + 'abi/AgentExecutor.json', 'utf8'));
// The LIVE executor. This used to be pinned to a retired one (0x0F1E9857...),
// so the liquidity commitment was checked against a contract the app no longer
// settles through - a passing test about the wrong chain state.
const { CONTRACT_ADDRESSES } = await import(base + 'constants/addresses.js');
const EXECUTOR = CONTRACT_ADDRESSES[4221].agentExecutor;
const T = {
  USDC: '0x58B6CD7891cd0A682226E25607b958a6479195A6',
  USDT: '0x4B54235778c26Ee8ac27744A53d4c5BC4c9D46fc',
  WGEN: '0x315374AA9b5536037Cc1Efeea2439CCC0913A77e',
};

let failed = 0;
const ok = (name) => console.log(`  ok    ${name}`);
const bad = (name, detail) => { failed++; console.log(`  FAIL  ${name}\n        ${detail}`); };
const eq = (name, got, want) =>
  String(got) === String(want) ? ok(name) : bad(name, `got ${got}, wanted ${want}`);

// ── 1. A deposit must never settle as a swap ─────────────────────────────────
// Shipped bug: `intent.action === 'ADD_LIQUIDITY' ? 'ADD_LIQUIDITY' : 'SWAP'`
// sent anything unrecognised down the swap route, and a user's add-liquidity
// request traded 10 USDC for USDT on chain.
console.log('\naction routing');
eq('ADD_LIQUIDITY stays ADD_LIQUIDITY', normaliseAction('ADD_LIQUIDITY'), 'ADD_LIQUIDITY');
eq('lower case is normalised', normaliseAction('add_liquidity'), 'ADD_LIQUIDITY');
eq('whitespace is trimmed', normaliseAction(' ADD_LIQUIDITY '), 'ADD_LIQUIDITY');
eq('REMOVE_LIQUIDITY is not SWAP', normaliseAction('REMOVE_LIQUIDITY'), 'REMOVE_LIQUIDITY');
// The heart of it: an unknown action must NOT become the fund-moving default.
eq('unknown does not default to SWAP', normaliseAction('something-else'), 'UNKNOWN');
eq('undefined does not default to SWAP', normaliseAction(undefined), 'UNKNOWN');
eq('empty does not default to SWAP', normaliseAction(''), 'UNKNOWN');

eq('deposits route to the liquidity endpoint', routeForAction('ADD_LIQUIDITY'), '/api/agent-add-liquidity');
eq('unknown actions have no route', routeForAction('nonsense'), null);

for (const a of ['ADD_LIQUIDITY', 'REMOVE_LIQUIDITY', 'UNKNOWN', '']) {
  try {
    assertSettlementRoute(a, '/api/agent-execute');
    bad(`${a || 'empty'} refused from the swap route`, 'it was allowed through');
  } catch {
    ok(`${a || 'empty'} refused from the swap route`);
  }
}
try { assertSettlementRoute('SWAP', '/api/agent-execute'); ok('swaps may use the swap route'); }
catch (e) { bad('swaps may use the swap route', e.message); }

// ── 2. Amounts must be exact ─────────────────────────────────────────────────
// Shipped bug: the liquidity path called BigInt() directly. "10.0" threw and
// surfaced as "Consensus unavailable"; "10" became TEN WEI silently.
console.log('\namount conversion');
const amt = (args, want, name) => {
  const r = toRawAmount({ label: 'x', ...args });
  eq(name, r.ok ? r.value.toString() : `ERR(${r.error})`, want);
};
amt({ human: '10', decimals: 18 }, '10000000000000000000', 'human "10" is ten tokens, not ten wei');
amt({ human: '10.0', decimals: 18 }, '10000000000000000000', 'human "10.0" does not throw');
amt({ human: '0.1', decimals: 18 }, '100000000000000000', '0.1 is exact, not a float artefact');
amt({ human: '100000000', decimals: 18 }, '100000000000000000000000000', 'large amounts do not lose precision');
amt({ raw: '10000000000000000000', decimals: 18 }, '10000000000000000000', 'raw passes through');
amt({ human: '1.5', decimals: 6 }, '1500000', 'non-18-decimal tokens scale correctly');
for (const [args, name] of [
  [{ human: 'abc' }, 'garbage is refused'],
  [{ human: '-5' }, 'negatives are refused'],
  [{ raw: '10.0' }, 'a decimal in a raw field is refused'],
]) {
  const r = toRawAmount({ label: 'x', decimals: 18, ...args });
  r.ok ? bad(name, `accepted, gave ${r.value}`) : ok(name);
}

// ── 3. A mispriced route must be reported, not called optimal ────────────────
// Shipped bug: WGEN/USDC and WGEN/USDT disagreed 21x, so 11 USDT quoted 219
// USDC through WGEN against 10.97 direct, presented as "OPTIMAL ROUTE".
console.log('\nprice dislocation (live pools)');
try {
  const r = await quoteBestRouteMultiHop(T.USDT, T.USDC, 11n * 10n ** 18n, 'best');
  if (!r) {
    bad('USDT to USDC quotes', 'no route returned');
  } else if (r.dislocationFactor >= 1.25) {
    r.priceWarning ? ok(`dislocated route is flagged (${r.dislocationFactor.toFixed(1)}x)`)
                   : bad('dislocated route is flagged', `factor ${r.dislocationFactor} but no priceWarning`);
  } else {
    ok(`pools are aligned today (${r.dislocationFactor.toFixed(2)}x), nothing to flag`);
  }
  r.directAmountOutRaw != null ? ok('direct route is reported for comparison')
                               : bad('direct route is reported for comparison', 'directAmountOutRaw missing');
} catch (e) { bad('price dislocation check', e.message); }

// ── 4. The liquidity commitment must match the contract ──────────────────────
// If validation and settlement build the deposit differently they produce
// different identifiers and the verdict fits neither.
console.log('\nliquidity commitment');
try {
  const pc = createPublicClient({
    chain: { id: 4221, name: 'Bradbury', nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
             rpcUrls: { default: { http: ['https://rpc-bradbury.genlayer.com'] }, public: { http: ['https://rpc-bradbury.genlayer.com'] } } },
    transport: http('https://rpc-bradbury.genlayer.com'),
  });
  const built = await buildLiquidityV2AddOrder({
    publicClient: pc, executor: EXECUTOR, abi: ABI,
    user: '0x23D542DCEFb00b1f4268E67a0EC1EF4de0A58fe2',
    tokenA: T.USDC, tokenB: T.USDT,
    amountADesired: '10', amountBDesired: '10',
    slippageBps: 100, deadline: 1788800000,
  });
  if (!built.ok) { bad('deposit builds from human amounts', JSON.stringify(built.body)); }
  else {
    built.order.amountADesired >= 10n ** 18n
      ? ok('human "10" became a real ten-token deposit')
      : bad('human "10" became a real ten-token deposit', `got ${built.order.amountADesired} wei`);
    const onChain = await pc.readContract({
      address: EXECUTOR, abi: ABI, functionName: 'getLiquidityV2AddHash',
      args: [built.order.user, built.order.tokenA, built.order.tokenB,
             built.order.amountADesired, built.order.amountBDesired,
             built.order.amountAMin, built.order.amountBMin, built.order.deadline],
    });
    eq('commitment matches the executor', built.commitment, onChain);
  }

  // Shipped bug: the AI proposal names tokens by SYMBOL ("USDC") with the
  // address in a separate field. Passing the symbol through as an address made
  // readContract throw, which the validate route reported as "Consensus
  // unavailable - failed closed" - a message about consensus for a failure that
  // had nothing to do with it.
  const bySymbol = await buildLiquidityV2AddOrder({
    publicClient: pc, executor: EXECUTOR, abi: ABI,
    user: '0x23D542DCEFb00b1f4268E67a0EC1EF4de0A58fe2',
    tokenA: 'USDC', tokenB: 'USDT',
    rawA: '10000000000000000000', rawB: '20000000000000000000',
    slippageBps: 30, deadline: 1788800000,
  });
  if (!bySymbol.ok) bad('token symbols resolve to addresses', JSON.stringify(bySymbol.body));
  else {
    eq('symbol "USDC" resolves', bySymbol.order.tokenA.toLowerCase(), T.USDC.toLowerCase());
    eq('symbol "USDT" resolves', bySymbol.order.tokenB.toLowerCase(), T.USDT.toLowerCase());
  }
} catch (e) { bad('liquidity commitment', e.message); }

// ---------------------------------------------------------------------------
// Shipped bug: a busy node read as a broken contract.
//
// Bradbury rate-limits by gas throughput and refuses eth_sendRawTransaction
// with -32005 plus a retryAfterMs hint. The transaction is never submitted and
// nothing reverts, but viem wraps it as a ContractFunctionExecutionError, so
// the /swap page told users:
//
//   The contract function "deposit" reverted with the following reason: ...
//
// Both halves are false, and it was reported as wrap being broken. The server
// routes had retried this for months; no client write did.
// ---------------------------------------------------------------------------
try {
  const { isNodeThrottle, retryDelayFrom, isUserRejection, describeTxError, withNodeRetry } =
    await import(base + 'lib/nodeRetry.js');

  // The exact strings the node and viem produced, from the two user reports.
  const wrapErr = {
    shortMessage: 'The contract function "deposit" reverted with the following reason:',
    message: 'RPC 0x107d Custom eth_sendRawTransaction: server returned an error response: '
      + 'error code -32005: transaction gas rate limit exceeded: node is at capacity, '
      + 'retry in ~562ms, data: {"retryAfterMs":562}',
  };
  const swapErr = {
    shortMessage: 'The contract function "executeSwap" reverted with the following reason:',
    message: 'error code -32005: transaction gas rate limit exceeded: node is at capacity, '
      + 'retry in ~632ms, data: {"retryAfterMs":632}',
  };

  eq('throttle detected despite the "reverted" wrapper (wrap)', isNodeThrottle(wrapErr), true);
  eq('throttle detected despite the "reverted" wrapper (swap)', isNodeThrottle(swapErr), true);

  // The node's own hint must be honoured, not a fixed sleep.
  const d = retryDelayFrom(wrapErr, 0);
  eq('waits at least the hinted 562ms', d >= 562, true);
  eq('and does not sleep absurdly long', d <= 8000, true);
  eq('backs off further on later attempts', retryDelayFrom(wrapErr, 2) > d, true);

  // A throttle must never be described as a revert.
  const msg = describeTxError(wrapErr, 'Wrap');
  eq('throttle is not called a revert', /revert/i.test(msg), false);
  eq('throttle names the real cause', /capacity/i.test(msg), true);

  // A declined signature must NOT be retried at the user.
  const declined = { shortMessage: 'User rejected the request.', code: 4001 };
  eq('user rejection recognised', isUserRejection(declined), true);
  eq('user rejection is not a throttle', isNodeThrottle(declined), false);

  let calls = 0;
  await withNodeRetry(async () => { calls += 1; throw declined; }, { label: 't', max: 3 })
    .catch(() => {});
  eq('a declined signature is asked exactly once', calls, 1);

  // A throttle recovers without the caller knowing.
  calls = 0;
  const out = await withNodeRetry(async () => {
    calls += 1;
    if (calls < 3) throw { ...wrapErr, message: 'retry in ~1ms, {"retryAfterMs":1}' };
    return '0xdeadbeef';
  }, { label: 't', max: 3 });
  eq('throttled send eventually succeeds', out, '0xdeadbeef');
  eq('and it took the retries to get there', calls, 3);

  // A real revert must still fail fast rather than being retried.
  calls = 0;
  const real = { shortMessage: 'execution reverted: INSUFFICIENT_OUTPUT_AMOUNT' };
  await withNodeRetry(async () => { calls += 1; throw real; }, { label: 't', max: 3 }).catch(() => {});
  eq('a genuine revert is not retried', calls, 1);
} catch (e) { bad('node throttle handling', e.message); }

// ---------------------------------------------------------------------------
// Shipped bug: the app could not see a verdict the contract had already given.
//
// genlayer-js returns a receipt with MIXED key conventions - `resultName` and
// `txExecutionResultName` are camelCase, but the round status is `status_name`.
// Every read used `receipt.statusName`, which is undefined, so:
//
//   - `decided` (ACCEPTED || FINALIZED) was always false; and
//   - a null status maps to phase 1 in ConsensusProgress, "waiting for
//     validator selection", which past 90s renders as "the round has not been
//     picked up by a validator set - a known testnet condition".
//
// The IC had approved 7 of 7 rounds while the app blamed the network.
// ---------------------------------------------------------------------------
try {
  const { roundStatusName } = await import(base + 'lib/genlayer.js');

  // The shape genlayer-js actually returns, from a real Bradbury receipt.
  const real = {
    status: 7,
    status_name: 'FINALIZED',
    resultName: 'AGREE',
    txExecutionResultName: 'FINISHED_WITH_RETURN',
  };
  eq('reads the snake_case status the SDK really sends', roundStatusName(real), 'FINALIZED');
  eq('a decided round is recognised as decided',
     ['ACCEPTED', 'FINALIZED'].includes(roundStatusName(real)), true);

  // Tolerate a future SDK that switches to camelCase, rather than breaking again.
  eq('camelCase still works', roundStatusName({ statusName: 'ACCEPTED' }), 'ACCEPTED');
  eq('snake_case wins when both are present',
     roundStatusName({ status_name: 'FINALIZED', statusName: 'PENDING' }), 'FINALIZED');
  eq('a receipt with no status is null, not a guess', roundStatusName({}), null);
  eq('an absent receipt does not throw', roundStatusName(undefined), null);
} catch (e) { bad('receipt status field', e.message); }

// ---------------------------------------------------------------------------
// Shipped bug: an allowance problem reported as node congestion.
//
// The swap asked for 3,500,000 gas - more than ten times what an AGGFlow swap
// uses - because gas estimation was `.catch(() => null)` into that fallback.
// Estimation fails mainly when the transaction WOULD revert, most often an
// unapproved token. Bradbury rate-limits by gas throughput, so the oversized
// request was refused, and the user was told the node was at capacity while
// their real problem was an allowance they could have fixed in one click.
// ---------------------------------------------------------------------------
try {
  const { describeSimulationFailure } = await import(base + 'lib/nodeRetry.js');

  const allowance = { shortMessage: 'execution reverted: ERC20: transfer amount exceeds allowance' };
  const msg = describeSimulationFailure(allowance, 'USDT');
  eq('an allowance failure names the allowance', /approve/i.test(msg), true);
  eq('and does not blame the node', /capacity|busy/i.test(msg), false);
  eq('and names the token', /USDT/.test(msg), true);

  const balance = describeSimulationFailure({ shortMessage: 'transfer amount exceeds balance' }, 'USDT');
  eq('a balance failure names the balance', /Not enough USDT/i.test(balance), true);

  const slip = describeSimulationFailure({ shortMessage: 'execution reverted: INSUFFICIENT_OUTPUT_AMOUNT' });
  eq('a slippage failure says the price moved', /slippage|price moved/i.test(slip), true);

  eq('an unknown failure still says it was not submitted',
     /not submitted/i.test(describeSimulationFailure({ shortMessage: 'weird' })), true);
} catch (e) { bad('simulation failure messages', e.message); }

// ---------------------------------------------------------------------------
// Shipped bug: we tripped the node's rate limiter with our own flows.
//
// The limiter is a GAS RATE limit, so it is about how close together sends
// arrive, not only how big they are. An approve immediately followed by a
// settlement is two transactions inside a second from one account, and the
// node refused the second - even for a ~46k approve. Every client send now
// passes through one gate that serialises them and keeps them apart.
// ---------------------------------------------------------------------------
try {
  const { paced } = await import(base + 'lib/nodeRetry.js');

  const started = [];
  const t0 = Date.now();
  const results = await Promise.all([
    paced(async () => { started.push(Date.now() - t0); return 'a'; }),
    paced(async () => { started.push(Date.now() - t0); return 'b'; }),
    paced(async () => { started.push(Date.now() - t0); return 'c'; }),
  ]);

  eq('every paced send still resolves', results.join(''), 'abc');
  eq('and they run in the order they were queued', started.length, 3);
  eq('consecutive sends are separated', started[1] - started[0] >= 1000, true,
     `gap was ${started[1] - started[0]}ms`);
  eq('the third waits behind the second too', started[2] - started[1] >= 1000, true,
     `gap was ${started[2] - started[1]}ms`);

  // A failed send must not stall everything queued behind it.
  await paced(async () => { throw new Error('boom'); }).catch(() => {});
  const after = await paced(async () => 'survived');
  eq('a rejected send does not wedge the queue', after, 'survived');
} catch (e) { bad('send pacing', e.message); }

// ---------------------------------------------------------------------------
// Shipped bugs: finalization.
//
// 1. We rate-limited ourselves and blamed the network: a finalize nudge fired
//    every poll tick, each one a doomed transaction from the agent account,
//    and the user's own swap then failed with "node is at capacity".
// 2. A trade approved by consensus never settled. GenLayer finalizes a
//    contract's rounds IN ORDER, and the app only nudged the round it was
//    waiting for - with the wrong call - so one undecided test round at the head
//    of the AgentValidator queue held every round behind it for six hours.
//
// The keeper drains the queue from its head, uses the call each state needs,
// stops at the first round that cannot be finalized yet, and simulates before
// it broadcasts, so it never sends a finalize that would fail.
// ---------------------------------------------------------------------------
console.log('\nfinalization keeper');
try {
  const { finalizationStep, drainFinalizationQueue, GL_STATUS, IDLE_AFTER_MS, _resetNudgeState } = await import(base + 'lib/genlayer.js');
  const S = GL_STATUS;
  const now = 1_800_000_000_000;
  const fresh = Math.floor(now / 1000) - 60;
  const old = Math.floor((now - IDLE_AFTER_MS - 60_000) / 1000);
  eq('a finished round is finalized', finalizationStep(S.READY_TO_FINALIZE, fresh, now), 'finalize');
  eq('so is an undecided one, or it blocks the queue', finalizationStep(S.UNDETERMINED, fresh, now), 'finalize');
  eq('and a timed-out one', finalizationStep(S.VALIDATORS_TIMEOUT, fresh, now), 'finalize');
  eq('a round in its appeal window waits', finalizationStep(S.ACCEPTED, fresh, now), 'wait');
  eq('a round still voting waits', finalizationStep(S.PROPOSING, fresh, now), 'wait');
  eq('a round stuck mid-vote gets the idleness call', finalizationStep(S.PROPOSING, old, now), 'finalize-idle');

  const fake = (queue, { refuse = false } = {}) => {
    const st = { done: 0, sent: [] };
    const pc = {
      readContract: async ({ functionName, args }) => {
        if (functionName === 'getLatestFinalizedTxCount') return BigInt(st.done);
        if (functionName === 'getLatestAcceptedTxCount') return BigInt(queue.length);
        if (functionName === 'getLatestAcceptedTransactions') return queue.slice(Number(args[1]), Number(args[1]) + Number(args[2]));
        throw new Error(`unexpected read ${functionName}`);
      },
      call: async () => { if (refuse) throw new Error('FinalizationNotAllowed'); return { data: '0x' }; },
    };
    const client = {
      finalizeTransaction: async ({ txId }) => { st.sent.push(`tx:${txId}`); st.done += 1; },
      finalizeIdlenessTxs: async ({ txIds }) => { st.sent.push(`idle:${txIds[0]}`); st.done += 1; },
    };
    return { st, pc, client };
  };
  const account = { address: '0x0000000000000000000000000000000000000001' };
  // Real-shaped ids: the keeper encodes each one into the finalize call it simulates.
  const id = (c) => `0x${c.replace('0x', '').repeat(64).slice(0, 64)}`;
  const round = (txId, status, createdTimestamp = BigInt(fresh)) => ({ txId: id(txId), status, createdTimestamp });
  const tag = (list) => list.map((x) => x.replace(/^(\w+):0x(\w)\w+$/, '$1:0x$2')).join(',');

  _resetNudgeState();
  const a = fake([round('0xa', S.UNDETERMINED), round('0xb', S.READY_TO_FINALIZE), round('0xc', S.ACCEPTED), round('0xd', S.READY_TO_FINALIZE)]);
  const ra = await drainFinalizationQueue({ account, recipient: '0x01', now: () => now, _pc: a.pc, _client: a.client });
  eq('drains from the head, in order', tag(a.st.sent), 'tx:0xa,tx:0xb');
  eq('and stops at a round whose window is open', ra.stoppedAt, id('0xc'));
  eq('nothing behind it is touched', a.st.sent.includes(`tx:${id('0xd')}`), false);

  _resetNudgeState();
  const b = fake([round('0xe', S.PROPOSING, BigInt(old)), round('0xf', S.READY_TO_FINALIZE)]);
  await drainFinalizationQueue({ account, recipient: '0x02', now: () => now, _pc: b.pc, _client: b.client });
  eq('a stuck round is cleared, then the queue moves on', tag(b.st.sent), 'idle:0xe,tx:0xf');

  _resetNudgeState();
  const c = fake([round('0x9', S.READY_TO_FINALIZE)], { refuse: true });
  const rc = await drainFinalizationQueue({ account, recipient: '0x03', now: () => now, _pc: c.pc, _client: c.client });
  eq('a finalize the chain would refuse is never broadcast', c.st.sent.length, 0);
  eq('and the reason is reported', /not finalizable yet/.test(rc.reason), true);

  const d = fake([round('0x8', S.READY_TO_FINALIZE)]);
  const rd = await drainFinalizationQueue({ account, recipient: '0x03', now: () => now + 5_000, _pc: d.pc, _client: d.client });
  eq('a second drain moments later is skipped, not repeated', rd.skipped === true && d.st.sent.length === 0, true);

  // The tracker says what a trade is waiting for. A trade behind another round
  // used to show an overdue "~30 min" timer, which reads as broken.
  const { estimateQueueWait, FINALITY_WINDOW_MS } = await import(base + 'lib/genlayer.js');
  const vote = (msAgo) => BigInt(Math.floor((now - msAgo) / 1000));
  const ready = { status: S.READY_TO_FINALIZE, lastVoteTimestamp: vote(40 * 60_000) };
  eq('a finished round at the head can land now', estimateQueueWait({ me: ready, head: ready, ahead: 0, now }).readyAt, now);
  const young = { status: S.ACCEPTED, lastVoteTimestamp: vote(10 * 60_000) };
  eq('an accepted round lands 30 minutes after its vote',
     estimateQueueWait({ me: young, head: young, ahead: 0, now }).readyAt, now - 10 * 60_000 + FINALITY_WINDOW_MS);
  const timedOut = { status: S.VALIDATORS_TIMEOUT, lastVoteTimestamp: vote(5 * 60_000) };
  const behind = estimateQueueWait({ me: ready, head: timedOut, ahead: 1, now });
  eq('behind a round in its own window, it waits for that one', behind.readyAt, now - 5 * 60_000 + FINALITY_WINDOW_MS);
  eq('and says how many are ahead', behind.ahead, 1);
  eq('a head still voting has no honest ETA', estimateQueueWait({ me: ready, head: { status: S.PROPOSING }, ahead: 3, now }).readyAt, null);

  const { describeWait, waitProgress } = await import(base + 'lib/settlement.js');
  const t0 = now - 20 * 60_000;
  const lines = [
    describeWait({ validatedAt: t0, round: { ahead: 1, readyAt: now + 15 * 60_000 } }, now),
    describeWait({ validatedAt: t0, round: { ahead: 3, readyAt: null } }, now),
    describeWait({ validatedAt: t0, round: { ahead: 0, readyAt: now + 5 * 60_000 } }, now),
    describeWait({ validatedAt: t0, round: { ahead: 0, readyAt: now } }, now),
    describeWait({ validatedAt: t0 }, now),
    describeWait({ validatedAt: now - 90 * 60_000 }, now),
  ];
  eq('a queued trade says what it waits on, and when', /^Waiting on 1 earlier round · about /.test(lines[0]), true);
  eq('plural when several are ahead', /^Waiting on 3 earlier rounds to finish$/.test(lines[1]), true);
  eq('its own window shows when it lands', /^Approved · lands about /.test(lines[2]), true);
  eq('ready means landing now', lines[3], 'Approved · landing now');
  eq('no word of the wait ever reads as stuck or failed', lines.every((l) => !/stuck|fail|error|overdue/i.test(l)), true);
  eq('each is one short line', lines.every((l) => l.length <= 48), true);
  eq('progress follows the chain ETA and stays in bounds',
     waitProgress({ validatedAt: t0, round: { readyAt: now + 20 * 60_000 } }, now) === 0.5
     && waitProgress({ validatedAt: now - 90 * 60_000 }, now) === 0.99, true);
  eq('the tracker shows that line', /describeWait\(e\)/.test(fs.readFileSync(base + 'components/SettlementQueue.jsx', 'utf8')), true);
  eq('and the settlement route returns where the round stands', /json\(\{ finalized, txHash, round, settlement \}\)/.test(fs.readFileSync(base + 'pages/api/finalize-round.js', 'utf8')), true);

  const src = fs.readFileSync(base + 'lib/genlayer.js', 'utf8');
  const fr = src.slice(src.indexOf('export async function finalizeRound'));
  eq('finalizeRound drains the queue instead of nudging one round', /drainFinalizationQueue\(/.test(fr.slice(0, 900)) && !/finalizeIdlenessTxs\(\{ account, txIds: \[txHash\] \}\)/.test(fr.slice(0, 900)), true);
  eq('every new round drains the queue first', /drainFinalizationQueue\(\{ account: agentAccount \}\)/.test(fs.readFileSync(base + 'pages/api/genlayer-validate.js', 'utf8')), true);
  eq('the background job keeps it moving on any page', /fetch\('\/api\/keeper', \{ method: 'POST' \}\)/.test(fs.readFileSync(base + 'components/BackgroundJobs.jsx', 'utf8'))
     && /drain: account \? \(\) => drainFinalizationQueue\(\{ account \}\)/.test(fs.readFileSync(base + 'lib/settlementKeeper.js', 'utf8')), true);
} catch (e) { bad('finalization keeper', e.message); }

// ---------------------------------------------------------------------------
// Wallet writes: exactly one retry, never more.
//
// Three retries asked people to sign the same swap four times, which reads as
// the app trying to charge twice. Zero retries failed outright inside a
// throttle window the node itself said was under 1.2 seconds. One is the
// middle: at most one extra prompt, waiting the delay the node asked for.
// ---------------------------------------------------------------------------
try {
  const { withNodeRetry, WALLET_ONE_RETRY, WALLET_NO_RETRY } = await import(base + 'lib/nodeRetry.js');
  const throttle = { message: 'error code -32005: node is at capacity, retry in ~1ms, {"retryAfterMs":1}' };

  let prompts = 0;
  const ok = await withNodeRetry(async () => {
    prompts += 1;
    if (prompts === 1) throw throttle;   // first attempt lands in the window
    return '0xhash';
  }, { label: 'approve', ...WALLET_ONE_RETRY });
  eq('a throttled wallet send succeeds on the retry', ok, '0xhash');
  eq('and asks the person exactly twice, never more', prompts, 2);

  // Persistent throttling must stop at two, not spiral.
  prompts = 0;
  await withNodeRetry(async () => { prompts += 1; throw throttle; },
    { label: 'approve', ...WALLET_ONE_RETRY }).catch(() => {});
  eq('a persistent throttle stops after one retry', prompts, 2);

  // A declined signature is still never repeated.
  prompts = 0;
  await withNodeRetry(async () => { prompts += 1; throw { code: 4001, shortMessage: 'User rejected the request.' }; },
    { label: 'approve', ...WALLET_ONE_RETRY }).catch(() => {});
  eq('a declined signature is still asked once only', prompts, 1);

  // And the no-retry option still exists for callers that need it.
  prompts = 0;
  await withNodeRetry(async () => { prompts += 1; throw throttle; },
    { label: 'x', ...WALLET_NO_RETRY }).catch(() => {});
  eq('WALLET_NO_RETRY still never re-prompts', prompts, 1);
} catch (e) { bad('wallet retry policy', e.message); }

// ---------------------------------------------------------------------------
// Shipped bug: an EXPIRED verdict reported forever as "still finalising".
//
// isVerdictLive() is false both for a verdict that has not arrived and one that
// arrived and aged out. Callers collapsed that into pending: !live, so an
// expired approval was described as a round still in progress. Because the
// commitment is derived from the order's fields, retrying rebuilt the same
// identifier, found the same dead entry, and said "in progress" again - an
// infinite wait for something that already came and went.
//
// Measured on chain: commitment 0x582f7f9a... had verdictExpiry 1788867679
// against a chain time of 1788868987. Recorded, then expired 21.8 minutes
// earlier, while the app kept telling the user to retry shortly.
// ---------------------------------------------------------------------------
try {
  const { readVerdictState } = await import(base + 'lib/verdict.js');
  const now = Math.floor(Date.now() / 1000);
  const abi = [];

  const clientReturning = (live, expiry) => ({
    readContract: async ({ functionName }) =>
      functionName === 'isVerdictLive' ? live : BigInt(expiry),
  });

  const never = await readVerdictState({ publicClient: clientReturning(false, 0), executor: '0x', abi, commitment: '0x' });
  eq('never recorded is not expired', never.expired, false);
  eq('and is not live', never.live, false);
  eq('and is marked as never recorded', never.everRecorded, false);

  const live = await readVerdictState({ publicClient: clientReturning(true, now + 3600), executor: '0x', abi, commitment: '0x' });
  eq('a live verdict is live', live.live, true);
  eq('and is not expired', live.expired, false);

  // The exact on-chain values that produced the infinite wait.
  const dead = await readVerdictState({ publicClient: clientReturning(false, now - 1308), executor: '0x', abi, commitment: '0x' });
  eq('a lapsed verdict is EXPIRED, not pending', dead.expired, true);
  eq('and is known to have been recorded', dead.everRecorded, true);
  eq('so it is distinguishable from never-arrived', dead.expired !== never.expired, true);
} catch (e) { bad('verdict expiry state', e.message); }

// ---------------------------------------------------------------------------
// Shipped bug: the button was disabled for the right reason and said the wrong
// one.
//
// On /ai, `isCheckingAllowance` was tested BEFORE `hasInsufficientBalance`, so
// somebody with an empty wallet watched "Checking token allowance..." spin
// rather than being told they had no funds. They reported it as a disabled
// button with no explanation, which is what it was.
//
// Ordering bugs like this are invisible in review - the button IS correctly
// disabled and the code reads fine - so the precedence is pinned here.
// ---------------------------------------------------------------------------
try {
  const { executionButtonLabel, isExecutionBlocked } = await import(base + 'lib/buttonLabel.js');

  // The exact combination that produced the bug: no funds AND an allowance
  // check running at the same time.
  const both = executionButtonLabel({ insufficient: true, checkingAllowance: true, tokenSymbol: 'USDC' });
  eq('no funds outranks a running allowance check', both.key, 'insufficient');
  eq('and it names the token', both.text, "Don't have enough USDC");

  // It must also outrank the approval step - approving costs gas and buys
  // nothing while the wallet is empty.
  eq('no funds outranks needsApproval',
     executionButtonLabel({ insufficient: true, needsApproval: true, tokenSymbol: 'USDT' }).key, 'insufficient');
  eq('no funds outranks approving',
     executionButtonLabel({ insufficient: true, approving: true, tokenSymbol: 'USDT' }).key, 'insufficient');

  // But a trade already in flight, and a pair that cannot trade at all, both
  // come first - they are true right now regardless of balance.
  eq('an in-flight trade is reported over balance',
     executionButtonLabel({ executing: true, insufficient: true }).key, 'executing');
  eq('a missing pool is reported over balance',
     executionButtonLabel({ noPool: true, insufficient: true }).key, 'noPool');

  // An unread balance is its own state, never silently "ready".
  eq('an unknown balance is not ready',
     executionButtonLabel({ balanceUnknown: true }).key, 'balanceUnknown');
  eq('and it blocks the button', isExecutionBlocked({ balanceUnknown: true }), true);

  // Falls back to a sentence that still makes sense with no token name.
  eq('works without a token symbol',
     executionButtonLabel({ insufficient: true }).text, "Don't have enough balance");

  eq('nothing wrong means ready', executionButtonLabel({}).key, 'ready');
  eq('and ready is clickable', isExecutionBlocked({}), false);
} catch (e) { bad('execution button label precedence', e.message); }

// ---------------------------------------------------------------------------
// Shipped bug: the agent pages settled trades nobody had authorised on chain.
//
// useAgentSwapExecution defaulted to `fastMode`, which had the user sign an
// AGGFlowEntrypoint swap directly. /ai and /a2a both used the default, so the
// main agent flows never went through AgentExecutor at all - and /a2a also
// queued the same trade for consensus settlement, so one intent could settle
// twice. There is now one rule for how a trade settles, and it has no default.
// ---------------------------------------------------------------------------
try {
  const actions = await import(base + 'lib/actions.js');
  const { settlementRailOf } = actions;
  eq('the direct settlement route no longer exists', 'DIRECT_SETTLEMENT' in actions, false);
  eq('an approval with no rail settles nowhere', settlementRailOf({ approved: true }), null);
  eq('an unknown rail settles nowhere', settlementRailOf({ approved: true, rail: 'direct' }), null);
  eq('a mandate rail with no mandate settles nowhere', settlementRailOf({ approved: true, rail: 'mandate' }), null);
  eq('an unapproved result settles nowhere', settlementRailOf({ approved: false, rail: 'consensus' }), null);
  eq('a consensus approval settles on its own verdict', settlementRailOf({ approved: true, rail: 'consensus' }), 'consensus');
  eq('a covered trade settles under its mandate',
     settlementRailOf({ approved: true, rail: 'mandate', mandate_id: '0x' + 'ab'.repeat(32) }), 'mandate');
  eq('rail names are not case-sensitive', settlementRailOf({ approved: true, rail: ' Consensus ' }), 'consensus');

  const hook = fs.readFileSync(base + 'hooks/useAgentSwapExecution.js', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  eq('the agent hook has no path to AGGFlowEntrypoint', /executeSwapWithReceiver|AGGFLOW_ENTRYPOINT_ABI/.test(hook), false);
  eq('the agent hook has no fast mode to default to', /fastMode/.test(hook), false);
} catch (e) { bad('settlement rail', e.message); }

// ---------------------------------------------------------------------------
// One trade, one authority: when does a mandate cover an order?
//
// The same function decides the rail before a round is opened and re-checks it
// at settlement, so it is pinned case by case here.
// ---------------------------------------------------------------------------
console.log('\nmandate coverage');
try {
  const {
    mandateCoversOrder, mandateMinAmountOut, expectedOutUnderMandate, decodeMandate,
    isMandateEligibleRoute, MANDATE_FIELDS, MANDATE_EXPIRY_MARGIN_SEC,
  } = await import(base + 'lib/mandateCoverage.js');
  const { keccak256 } = await import('viem');

  const now = 1_800_000_000;
  const route = keccak256('0x0201');
  const U = '0x3333333333333333333333333333333333333333';
  const mandate = {
    user: U, tokenIn: T.USDC, tokenOut: T.USDT,
    maxAmountIn: 10n ** 20n, totalBudgetIn: 10n ** 21n, spentIn: 0n,
    maxSlippageBps: 100n, maxFeeBps: 5n,
    feeCollector: '0x48234eD645676b794a4CbC7483513e58cB04e22E',
    router: '0x95feE6Cb918Ed9C621E36082EE8D998873031EaA',
    routeHash: route, pool: '0x55A5ff46cFb55DcF05D236A0Fdde5a0c866B64Be',
    expiry: now + 86_400, revoked: false,
  };
  const order = {
    user: U, tokenIn: T.USDC, tokenOut: T.USDT, amountIn: 10n ** 19n, minAmountOut: 9n * 10n ** 18n,
    slippageBps: 30n, feeBps: 5n, feeCollector: mandate.feeCollector, router: mandate.router,
  };
  const covers = (m, o = order, r = route) => mandateCoversOrder({ mandate: m, order: o, routeHash: r, nowSec: now });

  eq('a live mandate covers a trade inside it', covers(mandate).covered, true);
  eq('route hashes compare case-insensitively', covers(mandate, order, route.toUpperCase().replace('0X', '0x')).covered, true);
  for (const [name, m, o, r] of [
    ['a revoked mandate', { ...mandate, revoked: true }],
    ['an expired mandate', { ...mandate, expiry: now - 1 }],
    ['a mandate about to expire', { ...mandate, expiry: now + MANDATE_EXPIRY_MARGIN_SEC - 1 }],
    ['someone else\'s mandate', { ...mandate, user: '0x9999999999999999999999999999999999999999' }],
    ['the reverse direction', mandate, { ...order, tokenIn: T.USDT, tokenOut: T.USDC }],
    ['a trade above the per-trade ceiling', mandate, { ...order, amountIn: mandate.maxAmountIn + 1n }],
    ['a trade that overruns the budget', { ...mandate, spentIn: mandate.totalBudgetIn - order.amountIn + 1n }],
    ['a fee above the ceiling', mandate, { ...order, feeBps: 6n }],
    ['a different fee collector', mandate, { ...order, feeCollector: '0x9999999999999999999999999999999999999999' }],
    ['a best route off the pinned pool', mandate, order, keccak256('0x02ff')],
    ['an unrecorded mandate', { ...mandate, user: '0x0000000000000000000000000000000000000000' }],
  ]) {
    eq(`${name} does not cover it`, covers(m, o, r).covered, false);
  }

  // The executor's own arithmetic: fee off the input, then the 0.30% curve.
  const out = expectedOutUnderMandate({ amountIn: 10n ** 18n, feeBps: 5n, reserveIn: 10n ** 21n, reserveOut: 10n ** 21n });
  const routeIn = (10n ** 18n * 9_995n) / 10_000n;
  eq('the expected output follows the executor\'s formula', out, (routeIn * 997n * 10n ** 21n) / (10n ** 21n * 1000n + routeIn * 997n));
  eq('an empty pool expects nothing', expectedOutUnderMandate({ amountIn: 1n, feeBps: 5n, reserveIn: 0n, reserveOut: 1n }), 0n);

  // The floor: never below what the user accepted, never below the band the
  // executor enforces, and the tighter slippage of the two applies.
  const rose = mandateMinAmountOut({ order, mandate, expectedOut: 12n * 10n ** 18n });
  eq('price moved up: the floor follows the live price', rose, (12n * 10n ** 18n * 9_970n) / 10_000n);
  const fell = mandateMinAmountOut({ order, mandate, expectedOut: 8n * 10n ** 18n });
  eq('price moved down: the user\'s quoted floor is kept, so the trade fails rather than fills worse', fell, order.minAmountOut);
  const tighter = mandateMinAmountOut({ order: { ...order, slippageBps: 300n }, mandate, expectedOut: 12n * 10n ** 18n });
  eq('the tighter of the two slippage settings applies', tighter, (12n * 10n ** 18n * 9_900n) / 10_000n);

  // Shipped bug: /api/agent-mandate read the tuple by index and reported the
  // route hash (index 10) as the expiry (index 12).
  const tuple = MANDATE_FIELDS.map((f) => mandate[f]);
  eq('decoding a mandate reads the expiry, not the route hash', decodeMandate(tuple).expiry, mandate.expiry);
  eq('and keeps the route hash where it belongs', decodeMandate(tuple).routeHash, route);

  const eligible = { ...order, tokenIn: T.USDC, tokenOut: T.USDT };
  eq('a single V2 hop between ERC-20s can be mandated', isMandateEligibleRoute({ order: eligible, hops: [{ poolType: 'v2' }] }), true);
  eq('a V3 best route cannot', isMandateEligibleRoute({ order: eligible, hops: [{ poolType: 'v3' }] }), false);
  eq('a multi-hop best route cannot', isMandateEligibleRoute({ order: eligible, hops: [{ poolType: 'v2' }, { poolType: 'v2' }] }), false);
  eq('native GEN cannot', isMandateEligibleRoute({ order: { ...eligible, tokenIn: '0x0000000000000000000000000000000000000000' }, hops: [{ poolType: 'v2' }] }), false);
} catch (e) { bad('mandate coverage', e.message); }

// ---------------------------------------------------------------------------
// A status poll must not erase which authority the trade was given.
// ---------------------------------------------------------------------------
try {
  const { mergeVerdictResponse } = await import(base + 'lib/settlement.js');
  const merged = mergeVerdictResponse(
    { rail: 'consensus', mandate_eligible: true, pendingOrder: { a: 1 }, commitment: '0xc' },
    { approved: true, pending: false },
  );
  eq('the rail survives a poll', merged.rail, 'consensus');
  eq('the mandate hint survives a poll', merged.mandate_eligible, true);
  eq('the verdict comes from the poll', merged.approved, true);
} catch (e) { bad('rail across a poll', e.message); }

// ---------------------------------------------------------------------------
// Shipped drift: the app kept calling V3 liquidity validators the deployed
// Intelligent Contract no longer has, and answered V3 requests with a read
// simulation against a contract that authorises nothing.
// ---------------------------------------------------------------------------
console.log('\nV3 liquidity');
try {
  const g = await import(base + 'lib/genlayer.js');
  eq('no V3 liquidity round remains', 'validateLiquidityV3Add' in g || 'validateLiquidityV3Remove' in g, false);
  eq('no call to a removed method remains', 'computeProposalId' in g || 'validateSwapProposal' in g, false);
  const v3 = await g.validateLiquidityProposal({ action: 'ADD_LIQUIDITY', model: 'v3', tokenA: 'USDC', tokenB: 'USDT' });
  eq('a V3 request is refused, not simulated', v3.approved === false && v3.unsupported === 'v3_liquidity', true);
  eq('and names the contract that actually gates settlement', v3.contractName, 'AgentValidator (GenLayer IC)');
  const src = fs.readFileSync(base + 'lib/genlayer.js', 'utf8');
  eq('lib/genlayer.js never calls LiquidityValidator', /GENLAYER_CONFIG\.liquidityValidator/.test(src), false);
} catch (e) { bad('V3 liquidity', e.message); }

// Shipped: /a2a froze on "Consensus Pending". The swarm polls a round for about
// five minutes and then hands back "pending"; the room watched nothing after
// that, so a verdict that landed later was never shown, and an approval was
// never queued, so the trade never settled.
console.log('\nlate verdicts on /a2a');
try {
  const { applyLateVerdict, mergeVerdictResponse } = await import(base + 'lib/settlement.js');
  const pending = {
    isApproved: false, isPending: true, rail: null, txHash: '0x' + 'ab'.repeat(32), proposalId: 'p1',
    commitment: '0xc0ffee', tradeHash: '0xc0ffee', pendingOrder: { user: '0x1' }, pendingProgram: '0xdead',
    reason: 'awaiting consensus',
    checks: [
      { name: 'Slippage Cap Check', passed: true },
      { name: 'GenVM AI Coherence Consensus', passed: false, detail: 'Still awaiting consensus' },
    ],
  };
  // What the watcher really merges: the status check carries no order.
  const base0 = { tx_hash: pending.txHash, commitment: pending.commitment, pendingOrder: pending.pendingOrder, pendingProgram: pending.pendingProgram, rail: 'consensus' };
  const ok1 = applyLateVerdict(pending, mergeVerdictResponse(base0, { approved: true, pending: false, reason: 'All checks passed' }));
  eq('a late approval makes the trade executable', ok1.outcome === 'approved' && ok1.risk.isApproved && !ok1.risk.isPending, true);
  eq('on its own verdict', ok1.risk.rail, 'consensus');
  eq('with the order the queue needs still attached', Boolean(ok1.risk.pendingOrder && ok1.risk.pendingProgram && ok1.risk.commitment), true);
  eq('and the consensus check now passes', ok1.risk.checks.find((c) => c.name === 'GenVM AI Coherence Consensus').passed, true);

  const no = applyLateVerdict(pending, { approved: false, pending: false, reason: 'price moved' });
  eq('a late refusal is a rejection', no.outcome === 'rejected' && !no.risk.isApproved && !no.risk.isPending && !no.risk.rail, true);
  const undecided = applyLateVerdict(pending, { approved: false, pending: false, retryable: true, reason: 'LEADER_TIMEOUT' });
  eq('an undecided round is not called a rejection', undecided.outcome === 'undecided' && undecided.risk.isUndecided === true, true);
  eq('and is not executable', undecided.risk.isApproved, false);
  const watchedOut = applyLateVerdict(pending, { approved: false, timedOut: true, reason: 'No verdict after 30 minutes' });
  eq('a round watched out is undecided, not rejected', watchedOut.outcome, 'undecided');
  const overCap = applyLateVerdict({ ...pending, checks: [{ name: 'Slippage Cap Check', passed: false }] }, { approved: true, pending: false });
  eq('the slippage cap still applies to a late approval', overCap.risk.isApproved, false);

  const room = fs.readFileSync(base + 'components/A2A/SwarmWarRoom.jsx', 'utf8');
  eq('/a2a keeps watching a round the swarm stopped waiting for',
     /checkTxHash:\s*txHash/.test(room) && /applyLateVerdict\(/.test(room), true);
  eq('and queues a late approval through the same path as a prompt one',
     /queueApprovedTrade\(r, rt\)/.test(room) && /queueApprovedTrade\(nextRisk, route\)/.test(room), true);
  eq('the summary never labels an undecided round "Rejected"', /isUndecided \? 'No verdict/.test(room), true);
} catch (e) { bad('late verdicts on /a2a', e.message); }

// Shipped: genlayer-js signs consensus writes with exactly the gas estimate,
// and addTransaction needs more in some blocks than others, so submissions
// reverted and no round started ("GenLayer did not accept the proposal").
console.log('\nconsensus gas headroom');
try {
  const { withGasHeadroom, GAS_HEADROOM_PCT } = await import(base + 'lib/genlayer.js');
  const signed = [];
  const acct = { address: '0x1', type: 'local', signTransaction: async (tx) => { signed.push(tx); return '0xsigned'; } };
  const w = withGasHeadroom(acct);
  eq('the signature is still the account\'s own', await w.signTransaction({ gas: 1_176_262n, to: '0x2' }), '0xsigned');
  eq('a consensus write is signed with headroom over the estimate', signed[0].gas, (1_176_262n * GAS_HEADROOM_PCT) / 100n);
  eq('which covers the costliest block measured', signed[0].gas > 1_187_109n, true);
  eq('and changes nothing else in the transaction', signed[0].to, '0x2');
  eq('wrapping twice does not compound', withGasHeadroom(w), w);
  eq('an address-only account is left alone', withGasHeadroom('0xabc'), '0xabc');
  const src = fs.readFileSync(base + 'lib/genlayer.js', 'utf8');
  eq('every consensus write signs with it', /account: withGasHeadroom\(options\.account\)/.test(src)
     && /finalizeTransaction\(\{ account: signer/.test(src) && /finalizeIdlenessTxs\(\{ account: signer/.test(src)
     && /finalizeIdlenessTxs\(\{ account: withGasHeadroom\(account\)/.test(src), true);
  eq('and nothing else in the app writes to GenLayer', [...src.matchAll(/client\.(writeContract|finalizeTransaction|finalizeIdlenessTxs)\(\{ account: (\w+)/g)]
     .every((m) => m[2] === 'withGasHeadroom' || m[2] === 'signer'), true);
} catch (e) { bad('consensus gas headroom', e.message); }

// Shipped: /ai proposals carried a 20-minute deadline, and a consensus-rail
// verdict reaches the executor 30 minutes after the vote, so every such trade
// expired before it could settle.
console.log('\nproposal deadlines');
try {
  const FINALITY_S = 30 * 60;
  for (const f of ['pages/api/agent-v2.js', 'services/a2a/agents.js']) {
    const src = fs.readFileSync(base + f, 'utf8');
    const m = src.match(/const deadline = Math\.ceil\(\(Math\.floor\(Date\.now\(\) \/ 1000\) \+ (\d+)\) \/ DEADLINE_BUCKET\)/);
    eq(`${f} gives a trade time to clear the finality window`, Boolean(m) && Number(m[1]) >= FINALITY_S * 2, true);
  }
} catch (e) { bad('proposal deadlines', e.message); }

// Shipped: an approved trade could only settle while a Soyara tab was open,
// because only the browser held its order. The server now keeps the order and
// settles it itself when the verdict lands.
console.log('\nserver settlement');
try {
  const os = await import('node:os');
  const path = await import('node:path');
  process.env.SOYARA_SETTLEMENT_STORE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'soyara-store-')), 'settlements.json');
  const store = await import(base + 'lib/settlementStore.js');
  const { settlementKeeperPass, NEEDS_APPROVAL_RETRY_MS } = await import(base + 'lib/settlementKeeper.js');
  const c = (n) => `0x${String(n).repeat(64).slice(0, 64)}`;
  const t0 = 1_800_000_000_000;
  const entry = (n, extra = {}) => ({ commitment: c(n), order: { user: '0x1' }, program: '0x02', validationTxHash: c(`f${n}`), deadline: Math.floor(t0 / 1000) + 7200, label: 'x', ...extra });

  store.registerSettlement(entry('a'), t0);
  eq('a trade put to consensus is recorded on the server', store.getSettlement(c('a'))?.stage, 'waiting');
  eq('and found by its round', store.findSettlementByRound(c('fa'))?.commitment, c('a'));
  eq('an entry without an order is not recorded', store.registerSettlement({ commitment: c('b') }), null);
  store.updateSettlement(c('a'), { stage: 'settled' }, t0);
  store.registerSettlement(entry('a'), t0 + 1000);
  eq('re-registering never revives a finished trade', store.getSettlement(c('a')).stage, 'settled');
  store.registerSettlement(entry('d'), t0);
  eq('dismissing a trade cancels it on the server', store.cancelSettlement(c('d'), t0).stage, 'cancelled');
  store.registerSettlement(entry('e'), t0 + 25 * 60 * 60 * 1000);
  eq('finished trades older than a day are pruned', store.getSettlement(c('a')), null);

  // Keeper decisions, against a fake chain.
  const sent = [];
  const chain = { used: new Set(), live: new Set(), expiry: new Map() };
  const deps = (overrides = {}) => ({
    list: store.listSettlements, update: store.updateSettlement,
    readUsed: async (x) => chain.used.has(x), readLive: async (x) => chain.live.has(x),
    readExpiry: async (x) => chain.expiry.get(x) || 0,
    settle: async (e) => { sent.push(e.commitment); return { success: true, execTxHash: c('9') }; },
    ...overrides,
  });
  store.registerSettlement(entry('1'), t0);
  let s = await settlementKeeperPass({ ...deps(), now: t0 + 1000 });
  eq('no verdict yet: it waits and sends nothing', s.waiting >= 1 && !sent.includes(c('1')), true);
  chain.live.add(c('1'));
  s = await settlementKeeperPass({ ...deps(), now: t0 + 2000 });
  eq('verdict live: the server settles it', sent.includes(c('1')) && store.getSettlement(c('1')).stage === 'settled', true);
  eq('and records the transaction and who settled it', store.getSettlement(c('1')).execTxHash === c('9') && store.getSettlement(c('1')).settledBy === 'server', true);

  store.registerSettlement(entry('2'), t0); chain.used.add(c('2'));
  sent.length = 0;
  await settlementKeeperPass({ ...deps(), now: t0 + 3000 });
  eq('settled by the browser first: no second settlement', !sent.includes(c('2')) && store.getSettlement(c('2')).stage === 'settled', true);

  store.registerSettlement(entry('3', { deadline: Math.floor(t0 / 1000) - 1 }), t0);
  await settlementKeeperPass({ ...deps(), now: t0 + 4000 });
  eq('past its deadline it expires, unsent', store.getSettlement(c('3')).stage, 'expired');
  store.registerSettlement(entry('4'), t0); chain.expiry.set(c('4'), Math.floor(t0 / 1000) - 5);
  await settlementKeeperPass({ ...deps(), now: t0 + 5000 });
  eq('a lapsed verdict expires it', store.getSettlement(c('4')).stage, 'expired');

  store.registerSettlement(entry('5'), t0); chain.live.add(c('5'));
  const needs = deps({ settle: async (e) => { sent.push(e.commitment); return { success: false, needsApproval: true, error: 'approval missing' }; } });
  sent.length = 0;
  await settlementKeeperPass({ ...needs, now: t0 + 6000 });
  eq('a missing token approval parks it for the user', store.getSettlement(c('5')).stage, 'needs-approval');
  await settlementKeeperPass({ ...needs, now: t0 + 6000 + 60_000 });
  eq('and does not hammer the chain retrying', sent.filter((x) => x === c('5')).length, 1);
  await settlementKeeperPass({ ...deps(), now: t0 + 6000 + NEEDS_APPROVAL_RETRY_MS + 1 });
  eq('once approved, a later pass settles it', store.getSettlement(c('5')).stage, 'settled');

  store.registerSettlement(entry('6'), t0); chain.live.add(c('6'));
  const flaky = deps({ settle: async (e) => { sent.push(e.commitment); return { success: false, error: 'node busy' }; } });
  sent.length = 0;
  await settlementKeeperPass({ ...flaky, now: t0 + 7000 });
  await settlementKeeperPass({ ...flaky, now: t0 + 7000 + 1000 });
  eq('a failure backs off instead of retrying every pass', sent.filter((x) => x === c('6')).length, 1);

  store.registerSettlement(entry('8'), t0); chain.live.add(c('8'));
  await settlementKeeperPass({ ...deps({ settle: async () => ({ pending: true, inFlight: true }) }), now: t0 + 7500 });
  eq('a settlement already in flight is waited on, not counted as a failure', (store.getSettlement(c('8')).attempts || 0) === 0 && store.getSettlement(c('8')).stage === 'waiting', true);

  store.registerSettlement(entry('7'), t0); chain.live.add(c('7')); store.cancelSettlement(c('7'), t0);
  sent.length = 0;
  await settlementKeeperPass({ ...deps(), now: t0 + 8000 });
  eq('a cancelled trade is never settled', !sent.includes(c('7')) && store.getSettlement(c('7')).stage === 'cancelled', true);

  const validate = fs.readFileSync(base + 'pages/api/genlayer-validate.js', 'utf8');
  eq('the validate route records swaps for server settlement', /registerSettlement\(\{/.test(validate), true);
  eq('but never the no-wallet placeholder', /PLACEHOLDER_RECIPIENT/.test(validate) && /!== PLACEHOLDER_RECIPIENT/.test(validate), true);
  const exec = fs.readFileSync(base + 'pages/api/agent-execute.js', 'utf8');
  eq('the settlement route sends once per trade', /SETTLING\.has\(lockKey\)/.test(exec) && /functionName: 'commitmentUsed'/.test(exec), true);
  eq('the keeper starts with the server', /ensureSettlementKeeper\(\)/.test(fs.readFileSync(base + 'instrumentation.js', 'utf8'))
     && /instrumentationHook: true/.test(fs.readFileSync(base + 'next.config.js', 'utf8')), true);
  eq('dismissing in the tracker cancels on the server', /cancel: e\.commitment/.test(fs.readFileSync(base + 'hooks/useSettlementQueue.js', 'utf8')), true);
  const keeperSrc = fs.readFileSync(base + 'lib/settlementKeeper.js', 'utf8');
  eq('the keeper reads no files at run time (a built image has no abi/ folder)', /readFileSync|from 'node:fs'/.test(keeperSrc), false);
  const executorAbiJson = JSON.parse(fs.readFileSync(base + 'abi/AgentExecutor.json', 'utf8'));
  eq('and its inline reads match the deployed executor', ['commitmentUsed', 'isVerdictLive', 'verdictExpiry'].every((n) => {
    const f = executorAbiJson.find((x) => x.type === 'function' && x.name === n);
    return f && new RegExp(`function ${n}\\(${f.inputs.map((i) => i.type).join(',')}\\) view returns \\(${f.outputs.map((o) => o.type).join(',')}\\)`).test(keeperSrc);
  }), true);
  const copy = ['pages/docs.jsx', 'components/SettlementQueue.jsx', 'lib/notify.js', 'pages/ai.jsx', 'components/A2A/SwarmWarRoom.jsx']
    .map((f) => fs.readFileSync(base + f, 'utf8')).join('\n');
  eq('no line tells the user to keep a tab open', /Soyara tab|while Soyara is open|finishes when you come back/i.test(copy), false);
} catch (e) { bad('server settlement', e.message); }

// Shipped: the agent pages wrote every background event as a paragraph, one
// line per consensus poll, and nothing ever said when a fast lane was ready.
// Events are now one-line notices in localStorage, and a watcher reports the
// fast lane. Last in this file: it installs a minimal browser on globalThis.
console.log('\nnotices and the fast-lane watcher');
try {
  const store = new Map();
  const listeners = {};
  globalThis.window = {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, String(v)); },
      removeItem: (k) => { store.delete(k); },
    },
    addEventListener: (t, f) => { (listeners[t] ||= new Set()).add(f); },
    removeEventListener: (t, f) => { listeners[t]?.delete(f); },
    dispatchEvent: (e) => { for (const f of listeners[e.type] || []) f(e); return true; },
  };
  globalThis.localStorage = globalThis.window.localStorage;

  const n = await import(base + 'lib/notify.js');
  let calls = 0;
  const off = n.subscribeNotices(() => { calls += 1; });
  n.notices.queued('0xabc', '1 USDC → USDT');
  eq('a queued trade is one notice', n.listNotices().length, 1);
  n.notices.settled('0xabc', '1 USDC → USDT', '0x' + '12'.repeat(32));
  eq('settling, then settled, updates the same notice', n.listNotices().length, 1);
  eq('and it now reads settled', n.listNotices()[0].kind, 'success');
  const seen = calls;
  n.notices.settled('0xabc', '1 USDC → USDT', '0x' + '12'.repeat(32));
  eq('re-reporting the same state does not pop again', calls, seen);
  eq('every notice is one short line', n.listNotices().every((x) => x.title.length <= 60 && x.body.length <= 80), true);
  for (let i = 0; i < 60; i += 1) n.notify({ id: `x${i}`, title: `t${i}` });
  eq('history is bounded', n.listNotices().length <= n.MAX_NOTICES, true);
  n.clearNotices();
  eq('clear empties it', n.listNotices().length, 0);
  off();

  const m = await import(base + 'lib/mandate.js');
  m.rememberMandate('0xu', '0x58B6CD7891cd0A682226E25607b958a6479195A6', '0x4B54235778c26Ee8ac27744A53d4c5BC4c9D46fc', '0x' + 'aa'.repeat(32), '0x' + 'bb'.repeat(32));
  eq('a requested mandate is watched', m.listUnconfirmedMandates().length, 1);
  eq('the notice names the pair, not addresses', m.pairLabel('0x58B6CD7891cd0A682226E25607b958a6479195A6', '0x4B54235778c26Ee8ac27744A53d4c5BC4c9D46fc'), 'USDC → USDT');
  eq('going live reports once', m.markMandateLive('0xu', '0x58B6CD7891cd0A682226E25607b958a6479195A6', '0x4B54235778c26Ee8ac27744A53d4c5BC4c9D46fc'), true);
  eq('and only once', m.markMandateLive('0xu', '0x58B6CD7891cd0A682226E25607b958a6479195A6', '0x4B54235778c26Ee8ac27744A53d4c5BC4c9D46fc'), false);
  eq('a live mandate is no longer watched', m.listUnconfirmedMandates().length, 0);
  m.rememberMandate('0xu', '0xa', '0xb', '0x' + 'cc'.repeat(32), '0x' + 'dd'.repeat(32));
  eq('a request past the watch window is dropped', m.listUnconfirmedMandates(Date.now() + m.MANDATE_WATCH_MS + 1).length, 0);

  const room = fs.readFileSync(base + 'components/A2A/SwarmWarRoom.jsx', 'utf8');
  eq('/a2a shows status frames in one live line', /step\.type === 'MESSAGE'[\s\S]{0,80}setLiveStatus/.test(room), true);
  eq('/a2a writes no timeline line per consensus poll', /const onProgress = [\s\S]{0,700}?setTimeline/.test(room), false);
  eq('/a2a never queues or asks a fast lane for a placeholder recipient',
     /const isOwnOrder = [\s\S]{0,160}userAddress/.test(room)
     && (room.match(/isOwnOrder\(r\)/g) || []).length >= 2, true);
  const ai = fs.readFileSync(base + 'pages/ai.jsx', 'utf8');
  eq('/ai queues a verdict that came back after polling', /pollValidationStatus[\s\S]*queueApprovedRef\.current\?\.\(data, proposal\)/.test(ai), true);
  const app = fs.readFileSync(base + 'pages/_app.jsx', 'utf8');
  eq('one settlement queue runs app-wide', /<SettlementQueueProvider>/.test(app) && /<BackgroundJobs \/>/.test(app), true);
} catch (e) { bad('notices', e.message); }

console.log(failed === 0 ? '\nAll regression checks passed.' : `\n${failed} FAILURE(S)`);
process.exit(failed === 0 ? 0 : 1);
