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

console.log(failed === 0 ? '\nAll regression checks passed.' : `\n${failed} FAILURE(S)`);
process.exit(failed === 0 ? 0 : 1);
