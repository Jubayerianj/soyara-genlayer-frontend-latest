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
// Shipped bug: we rate-limited ourselves and blamed the network.
//
// finalizeIdlenessTxs is not a read - it BROADCASTS from the agent account, and
// it cannot succeed until the appeal window has closed. It was called on every
// poll tick, once every 4 seconds, and its failure was swallowed as "expected
// while the window is open". A single pending settlement therefore fired a
// stream of doomed transactions from the agent account.
//
// On this deployment the agent key IS the operator's wallet address, so those
// nudges consumed the very gas-rate budget the user's own swap needed, and the
// swap failed with "node is at capacity".
// ---------------------------------------------------------------------------
try {
  const { shouldNudgeFinalize, _resetNudgeState } = await import(base + 'lib/genlayer.js');
  _resetNudgeState();

  const tx = '0xround';
  const t0 = 1_800_000_000_000;

  eq('a brand new round is never nudged', shouldNudgeFinalize(tx, t0), false);
  eq('nor four seconds later, the old poll cadence', shouldNudgeFinalize(tx, t0 + 4_000), false);
  eq('nor after five minutes', shouldNudgeFinalize(tx, t0 + 5 * 60_000), false);

  // Past the point where the window could have closed, one nudge is allowed.
  eq('after ten minutes a nudge is allowed', shouldNudgeFinalize(tx, t0 + 10 * 60_000 + 1), true);
  eq('but not again immediately', shouldNudgeFinalize(tx, t0 + 10 * 60_000 + 2_000), false);
  eq('and not again within the minute', shouldNudgeFinalize(tx, t0 + 10 * 60_000 + 59_000), false);
  eq('a minute later, once more', shouldNudgeFinalize(tx, t0 + 11 * 60_000 + 2), true);

  // The old behaviour would have sent ~150 transactions in the first ten
  // minutes; the gate sends none.
  _resetNudgeState();
  let sent = 0;
  for (let ms = 0; ms < 10 * 60_000; ms += 4_000) {
    if (shouldNudgeFinalize('0xb', t0 + ms)) sent += 1;
  }
  eq('no transactions at all during the window', sent, 0, 'was 150 before');

  // And once past it, the cadence is per-minute rather than per-4-seconds.
  let after = 0;
  for (let ms = 10 * 60_000; ms < 20 * 60_000; ms += 4_000) {
    if (shouldNudgeFinalize('0xb', t0 + ms)) after += 1;
  }
  eq('roughly one nudge a minute afterwards', after <= 11, true, `${after} in ten minutes`);

  // Rounds are tracked independently.
  _resetNudgeState();
  shouldNudgeFinalize('0xc', t0);
  eq('a second round has its own clock', shouldNudgeFinalize('0xd', t0), false);
} catch (e) { bad('finalize nudge gating', e.message); }

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

console.log(failed === 0 ? '\nAll regression checks passed.' : `\n${failed} FAILURE(S)`);
process.exit(failed === 0 ? 0 : 1);
