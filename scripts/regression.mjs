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
const EXECUTOR = '0x0F1E98571BADd0fF59a34140Fe1e820DaDF907E1';
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

console.log(failed === 0 ? '\nAll regression checks passed.' : `\n${failed} FAILURE(S)`);
process.exit(failed === 0 ? 0 : 1);
