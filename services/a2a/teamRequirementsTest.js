// services/a2a/teamRequirementsTest.js
// ============================================================================
//  Settlement verification suite for /a2a/dev
//
//  Every check asks the DEPLOYED AgentExecutor on Bradbury, with an eth_call
//  from the address that would really send the transaction, and reports what
//  the contract answered. None of them opens a consensus round or spends gas.
//
//  This replaces a suite that hashed parameters in JavaScript, "proved" replay
//  protection by deleting a key from an object, and marked itself PASSED
//  whatever happened - against a design (an agent-written approval reverting
//  with TradeNotApproved) that the executor no longer has.
// ============================================================================

import { keccak256 } from 'viem';
import AGENT_EXECUTOR_ABI from '../../abi/AgentExecutor.json';
import { CONTRACT_ADDRESSES, INTELLIGENT_CONTRACTS } from '../../constants/addresses.js';
import { probe, deriveCommitment, readRoles, sampleOrder, probeClient, SAMPLE_PROGRAM } from '../../lib/settlementProbe.js';

const A = CONTRACT_ADDRESSES[4221];
const EXECUTOR = A.agentExecutor;
const ATTACKER = '0x9999999999999999999999999999999999999999';
const same = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

const call = (from, functionName, args) =>
  probe({ abi: AGENT_EXECUTOR_ABI, executor: EXECUTOR, from, functionName, args });

let rolesCache = null;
async function roles() {
  if (!rolesCache) rolesCache = await readRoles({ abi: AGENT_EXECUTOR_ABI, executor: EXECUTOR });
  return rolesCache;
}

const result = (passed, detail) => ({ passed, status: passed ? 'PASSED' : 'FAILED', detail });
const said = (r) => (r.wouldSucceed ? 'the call would have gone through' : `${r.error}(${r.args.map(String).map((a) => (a.length > 14 ? `${a.slice(0, 10)}...` : a)).join(', ')})`);

export const COMPREHENSIVE_TESTS = [
  // ── Category 1: what the review asked for ────────────────────────────────
  {
    id: 'req_1_validator_only',
    title: '1. Only the AgentValidator IC can write a verdict',
    directive: 'recordVerdict from the settlement agent and from the owner must both be refused.',
    category: 'Core Requirement',
    run: async () => {
      const r = await roles();
      const owner = await probeClient().readContract({ address: EXECUTOR, abi: AGENT_EXECUTOR_ABI, functionName: 'owner' });
      const future = BigInt(Math.floor(Date.now() / 1000) + 3600);
      const [byAgent, byOwner] = await Promise.all([
        call(r.agent, 'recordVerdict', [1n, future]),
        call(owner, 'recordVerdict', [1n, future]),
      ]);
      const passed = !byAgent.wouldSucceed && byAgent.error === 'NotValidator'
        && !byOwner.wouldSucceed && byOwner.error === 'NotValidator'
        && same(r.validator, INTELLIGENT_CONTRACTS.agentValidator);
      return result(passed,
        `agent → ${said(byAgent)}; owner → ${said(byOwner)}; executor.genLayerValidator() = ${String(r.validator).slice(0, 10)}... `
        + `(${same(r.validator, INTELLIGENT_CONTRACTS.agentValidator) ? 'the AgentValidator IC' : 'NOT the configured IC'})`);
    },
  },
  {
    id: 'req_2_unapproved_cannot_settle',
    title: '2. An order consensus has not approved cannot settle',
    directive: 'executeSwap on a well-formed order with no verdict, sent by the authorised agent.',
    category: 'Core Requirement',
    run: async () => {
      const r = await roles();
      const order = sampleOrder({ addresses: A });
      const [commitment, out] = await Promise.all([
        deriveCommitment({ abi: AGENT_EXECUTOR_ABI, executor: EXECUTOR, order }),
        call(r.agent, 'executeSwap', [order, SAMPLE_PROGRAM]),
      ]);
      const passed = !out.wouldSucceed && out.error === 'NoConsensusVerdict' && same(out.args[0], commitment);
      return result(passed, `executor refused with ${said(out)} - the commitment it derived for this exact order`);
    },
  },
  {
    id: 'req_3_every_field_bound',
    title: '3. Route, fee, recipient and quote are all inside the commitment',
    directive: 'The executor must derive a different commitment when any settlement field changes.',
    category: 'Core Requirement',
    run: async () => {
      const base = sampleOrder({ addresses: A });
      const variants = {
        route: { routeHash: keccak256('0x02') },
        fee: { feeBps: 50n },
        feeCollector: { feeCollector: ATTACKER },
        recipient: { user: ATTACKER },
        quote: { quotedAmountOut: base.quotedAmountOut + 1n },
        minAmountOut: { minAmountOut: base.minAmountOut + 1n },
        amountIn: { amountIn: base.amountIn * 2n },
        router: { router: ATTACKER },
        deadline: { deadline: base.deadline + 1n },
        nonce: { nonce: base.nonce + 1n },
      };
      const baseC = await deriveCommitment({ abi: AGENT_EXECUTOR_ABI, executor: EXECUTOR, order: base });
      const diffs = await Promise.all(Object.entries(variants).map(async ([k, o]) => {
        const c = await deriveCommitment({ abi: AGENT_EXECUTOR_ABI, executor: EXECUTOR, order: { ...base, ...o } });
        return [k, !same(c, baseC)];
      }));
      const unbound = diffs.filter(([, d]) => !d).map(([k]) => k);
      return result(unbound.length === 0,
        unbound.length === 0
          ? `All ${diffs.length} fields change the commitment the executor derives (base ${String(baseC).slice(0, 10)}...), so a verdict for one order can never settle another.`
          : `NOT bound: ${unbound.join(', ')}`);
    },
  },
  {
    id: 'req_4_no_forged_mandate',
    title: '4. A mandate cannot be invented by the agent',
    directive: 'executeSwapUnderMandate with an id no consensus round wrote, and recordMandate from the agent.',
    category: 'Core Requirement',
    run: async () => {
      const r = await roles();
      const id = keccak256('0x736f79617261');
      const future = BigInt(Math.floor(Date.now() / 1000) + 3600);
      const [spend, mint] = await Promise.all([
        call(r.agent, 'executeSwapUnderMandate', [id, 1_000_000_000_000_000_000n, 1n, 5n, SAMPLE_PROGRAM]),
        call(r.agent, 'recordMandate', [
          BigInt(id), r.agent, A.USDC || '0x58B6CD7891cd0A682226E25607b958a6479195A6',
          '0x4B54235778c26Ee8ac27744A53d4c5BC4c9D46fc', 10n ** 30n, 10n ** 30n, 100n, 5n,
          A.dexFeeVault, A.aggregatorEntrypoint, BigInt(keccak256(SAMPLE_PROGRAM)),
          '0x55A5ff46cFb55DcF05D236A0Fdde5a0c866B64Be', future,
        ]),
      ]);
      const passed = !spend.wouldSucceed && spend.error === 'NoMandate' && !mint.wouldSucceed && mint.error === 'NotValidator';
      return result(passed, `spend unknown mandate → ${said(spend)}; agent writes a mandate → ${said(mint)}`);
    },
  },

  // ── Category 2: attack vectors ──────────────────────────────────────────
  {
    id: 'atk_redirect_recipient',
    title: '5. Attack: redirect the output to another address',
    directive: 'Same order, attacker as recipient: a different commitment, which no verdict backs.',
    category: 'Attack Vector',
    run: async () => {
      const r = await roles();
      const honest = sampleOrder({ addresses: A });
      const evil = { ...honest, user: ATTACKER };
      const [hc, ec, out] = await Promise.all([
        deriveCommitment({ abi: AGENT_EXECUTOR_ABI, executor: EXECUTOR, order: honest }),
        deriveCommitment({ abi: AGENT_EXECUTOR_ABI, executor: EXECUTOR, order: evil }),
        call(r.agent, 'executeSwap', [evil, SAMPLE_PROGRAM]),
      ]);
      const passed = !same(hc, ec) && !out.wouldSucceed && out.error === 'NoConsensusVerdict' && same(out.args[0], ec);
      return result(passed, `commitment moves ${String(hc).slice(0, 10)}... → ${String(ec).slice(0, 10)}...; executor: ${said(out)}`);
    },
  },
  {
    id: 'atk_zero_min_out',
    title: '6. Attack: drop the minimum received to zero',
    directive: 'A floor below the validated quote is refused before any verdict is consulted.',
    category: 'Attack Vector',
    run: async () => {
      const r = await roles();
      const out = await call(r.agent, 'executeSwap', [sampleOrder({ addresses: A, overrides: { minAmountOut: 0n } }), SAMPLE_PROGRAM]);
      return result(!out.wouldSucceed && out.error === 'QuoteInconsistent', `executor: ${said(out)}`);
    },
  },
  {
    id: 'atk_swap_route',
    title: '7. Attack: execute different route bytes than the order commits to',
    directive: 'An aggProgram that does not hash to order.routeHash is refused.',
    category: 'Attack Vector',
    run: async () => {
      const r = await roles();
      const out = await call(r.agent, 'executeSwap', [sampleOrder({ addresses: A }), '0x02']);
      return result(!out.wouldSucceed && out.error === 'RouteMismatch', `executor: ${said(out)}`);
    },
  },
  {
    id: 'atk_outsider_relay',
    title: '8. Attack: an unregistered address relays a trade',
    directive: 'Settlement functions are onlyAgent; anyone else is refused outright.',
    category: 'Attack Vector',
    run: async () => {
      const out = await call(ATTACKER, 'executeSwap', [sampleOrder({ addresses: A }), SAMPLE_PROGRAM]);
      return result(!out.wouldSucceed && out.error === 'Unauthorized', `executor: ${said(out)}`);
    },
  },

  // ── Category 3: guardrails ──────────────────────────────────────────────
  {
    id: 'test_slippage_cap',
    title: '9. Guardrail: slippage above the on-chain cap',
    directive: 'A 5% slippage order is refused by the executor itself, no consensus round needed.',
    category: 'Guardrail',
    run: async () => {
      const r = await roles();
      const quoted = 1_000_000_000_000_000_000n;
      const out = await call(r.agent, 'executeSwap', [sampleOrder({
        addresses: A,
        overrides: { slippageBps: 500n, minAmountOut: (quoted * 9_500n) / 10_000n },
      }), SAMPLE_PROGRAM]);
      return result(!out.wouldSucceed && out.error === 'SlippageExceeded',
        `executor: ${said(out)} (cap ${r.maxSlippageBps} bps)`);
    },
  },
  {
    id: 'test_v3_liquidity_fails_closed',
    title: '10. Liquidity: V3 positions cannot settle through the agent path',
    directive: 'executeAddLiquidityV3 has no validator to approve it; the validate route refuses V3 before any round.',
    category: 'Liquidity',
    run: async () => {
      const r = await roles();
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
      const [onChain, route] = await Promise.all([
        call(r.agent, 'executeAddLiquidityV3', ['0x3333333333333333333333333333333333333333', {
          token0: '0x4B54235778c26Ee8ac27744A53d4c5BC4c9D46fc',
          token1: '0x58B6CD7891cd0A682226E25607b958a6479195A6',
          fee: 3000, tickLower: -60, tickUpper: 60,
          amount0Desired: 10n ** 18n, amount1Desired: 10n ** 18n,
          amount0Min: 0n, amount1Min: 0n,
          recipient: '0x3333333333333333333333333333333333333333', deadline,
        }]),
        fetch('/api/genlayer-validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'ADD_LIQUIDITY', model: 'v3', tokenA: 'USDC', tokenB: 'USDT', amountA: '1', amountB: '1' }),
        }).then(async (res) => ({ status: res.status, body: await res.json().catch(() => ({})) })).catch(() => null),
      ]);
      const refusedOnChain = !onChain.wouldSucceed && onChain.error === 'NoConsensusVerdict';
      const refusedByRoute = route?.status === 400 && route?.body?.unsupported === 'v3_liquidity' && route?.body?.approved === false;
      return result(refusedOnChain && refusedByRoute,
        `executeAddLiquidityV3 → ${said(onChain)}; /api/genlayer-validate → ${route ? `HTTP ${route.status}, ${route.body?.unsupported || 'no refusal'}` : 'unreachable'} (no round opened)`);
    },
  },
  {
    id: 'test_unknown_action_fails_closed',
    title: '11. Fail-closed: an unrecognised action never reaches consensus',
    directive: 'The validate route refuses an action it does not know instead of defaulting to a swap.',
    category: 'Guardrail',
    run: async () => {
      const res = await fetch('/api/genlayer-validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'MALICIOUS_DRAIN', tokenIn: 'USDC', tokenOut: 'USDT', amountIn: '1' }),
      });
      const body = await res.json().catch(() => ({}));
      return result(res.status === 400 && body.approved === false, `HTTP ${res.status}: ${body.reason || 'no reason given'}`);
    },
  },
];

export const TEAM_REQUIREMENTS = COMPREHENSIVE_TESTS.slice(0, 4);
