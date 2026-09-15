// lib/studioNext/client.js
//
// Talking to SoyaraAgentDex on Studio Next from the browser.
//
// Two signers, on purpose:
//
//  - The USER's wallet signs what needs the user's consent: a consensus swap,
//    issuing a mandate, revoking one. Those go through Transaction Kit, which
//    quotes the fee deposit from live prices and the measured fee profile.
//  - A SESSION AGENT key, generated in this browser and never sent anywhere,
//    signs trades under a mandate and relays the faucet. The contract only lets
//    it spend inside a mandate the user's wallet signed, so it needs no trust
//    beyond what the user granted, and no wallet popup per trade.
//
// Imported only from the client (the desk is loaded with ssr: false).

import { createAccount, createClient, generatePrivateKey, isSuccessful } from 'genlayer-js-next';
import { studioDevnet } from 'genlayer-js-next/chains';
import { createTransactionKit } from '@genlayer/transaction-kit';
import { STUDIO_NEXT, STUDIO_NEXT_FEE_PROFILE } from '../../constants/studioNext.js';

export const ONE = 10n ** 18n;

export const studioChain = {
  ...studioDevnet,
  name: STUDIO_NEXT.name,
  rpcUrls: { default: { http: [STUDIO_NEXT.rpc] } },
};

export const txUrl = (hash) => `${STUDIO_NEXT.explorer}/tx/${hash}`;
export const addressUrl = (address) => `${STUDIO_NEXT.explorer}/address/${address}`;
export const short = (v) => (v ? `${String(v).slice(0, 6)}…${String(v).slice(-4)}` : '');

// ── amounts ─────────────────────────────────────────────────────────────────

/** "12.5" -> 12500000000000000000n. Exact: digits are split, never multiplied as floats. */
export function toRaw(decimal) {
  const text = String(decimal ?? '').trim();
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const [whole, frac = ''] = text.split('.');
  return BigInt(whole) * ONE + BigInt((frac + '0'.repeat(18)).slice(0, 18) || '0');
}

/** Raw 18-decimal units to a short human string, truncated so it never overstates. */
export function fmt(raw, places = 4) {
  let v;
  try { v = BigInt(raw ?? 0); } catch { return '0'; }
  const whole = v / ONE;
  let frac = (v % ONE).toString().padStart(18, '0');
  if (whole === 0n && v > 0n) {
    const firstDigit = frac.search(/[1-9]/);
    frac = frac.slice(0, Math.max(places, firstDigit + 3));
  } else {
    frac = frac.slice(0, places);
  }
  frac = frac.replace(/0+$/, '');
  return `${whole.toLocaleString('en-US')}${frac ? `.${frac}` : ''}`;
}

/** 1e18-scaled price -> number, for display only. */
export const priceNumber = (raw) => Number(BigInt(raw || 0) * 1_000_000n / ONE) / 1_000_000;

export function requestId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// ── reads ───────────────────────────────────────────────────────────────────

let reader;
function readClient() {
  if (!reader) reader = createClient({ chain: studioChain });
  return reader;
}

export function plain(value) {
  if (value instanceof Map) return Object.fromEntries([...value].map(([k, v]) => [k, plain(v)]));
  if (Array.isArray(value)) return value.map(plain);
  if (typeof value === 'bigint') return value.toString();
  return value;
}

const rateLimited = (err) => /rate limit|429|too many requests/i.test(String(err?.details || err?.message || err?.shortMessage || ''));

/**
 * A contract read. Studio Next allows 30 contract reads a minute per client
 * (the "standard" bucket, which fee quotes also draw from), so a read that is
 * refused for rate is retried after the window moves instead of failing.
 */
export async function view(functionName, args = [], { attempts = 4 } = {}) {
  for (let i = 1; ; i += 1) {
    try {
      return plain(await readClient().readContract({ address: STUDIO_NEXT.dex, functionName, args }));
    } catch (err) {
      if (!rateLimited(err) || i >= attempts) throw err;
      await new Promise((r) => setTimeout(r, 4000 * i));
    }
  }
}

async function rpc(body) {
  const res = await fetch(STUDIO_NEXT.rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || 'Studio Next RPC error');
  return json.result;
}

export async function gasBalance(address) {
  return BigInt(await rpc(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [address, 'latest'] })));
}

/**
 * Top an address up with Studio's built-in faucet when it is low on GEN for
 * fee deposits. The amount is in wei and goes in as an integer literal so it is
 * exact.
 */
export async function ensureGas(address, { min = ONE / 10n, topUp = 10n * ONE } = {}) {
  const have = await gasBalance(address);
  if (have >= min) return have;
  await rpc(`{"jsonrpc":"2.0","id":1,"method":"sim_fundAccount","params":["${address}",${topUp.toString()}]}`);
  return gasBalance(address);
}

// ── the user's wallet ───────────────────────────────────────────────────────

export async function ensureWalletOnStudio(provider) {
  const hex = `0x${STUDIO_NEXT.chainId.toString(16)}`;
  const current = await provider.request({ method: 'eth_chainId' });
  if (parseInt(current, 16) === STUDIO_NEXT.chainId) return;
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hex }] });
  } catch (err) {
    const missing = err?.code === 4902 || err?.data?.originalError?.code === 4902
      || /unrecognized|not been added|unknown chain|not added/i.test(String(err?.message || ''));
    if (!missing) throw err;
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: hex,
        chainName: STUDIO_NEXT.name,
        nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
        rpcUrls: [STUDIO_NEXT.rpc],
        blockExplorerUrls: [STUDIO_NEXT.explorer],
      }],
    });
  }
}

export function userKit(provider, account) {
  return createTransactionKit({ chain: studioChain, provider, account, suggestions: STUDIO_NEXT_FEE_PROFILE });
}

/**
 * A Transaction Kit for the connected wallet, ready to sign on Studio Next:
 * the wallet is switched (or the network added) and topped up for deposits.
 * Shared by the /ai desk and the swarm so the two cannot prepare it differently.
 */
export async function userKitFromConnector(connector, account) {
  const provider = await connector?.getProvider?.();
  if (!provider) throw new Error('No wallet provider');
  await ensureWalletOnStudio(provider);
  await ensureGas(account);
  return userKit(provider, account);
}

/**
 * Quote, sign in the wallet, and track to the decision. `onStep` hears
 * 'quote' (with the deposit), 'sign', then each tracked phase.
 *
 * Preset 'low' budgets one appeal round, which is what a trade needs; the
 * deposit is refunded at finalization for anything not used.
 */
export async function submitAsUser(kit, method, args, onStep = () => {}) {
  const tx = { kind: 'write', address: STUDIO_NEXT.dex, method, args };
  const quote = await kit.estimate({ preset: 'low' }, tx);
  if (quote.verification?.status === 'mismatch' && !kit.allowUnverified) {
    throw new Error('Fee prices changed while quoting. Try again.');
  }
  onStep({ step: 'sign', quote });
  const { genlayerTxId } = await kit.submit(quote, tx);
  onStep({ step: 'submitted', txId: genlayerTxId, quote });
  const status = await kit.track(genlayerTxId, (s) => onStep({ step: s.phase, txId: genlayerTxId, status: s, quote }), { until: 'decided' });
  return { txId: genlayerTxId, quote, ok: Boolean(status.successful), status };
}

// ── the session agent ───────────────────────────────────────────────────────

const agentKey = (user) => `soyara.studioNext.agent.${String(user).toLowerCase()}`;

export function sessionAgent(user) {
  let pk = null;
  try { pk = window.localStorage.getItem(agentKey(user)); } catch { /* storage blocked */ }
  if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) {
    pk = generatePrivateKey();
    try { window.localStorage.setItem(agentKey(user), pk); } catch { /* one key per page load then */ }
  }
  const account = createAccount(pk);
  return { address: account.address, client: createClient({ chain: studioChain, account }) };
}

/** The agent signs locally: fees from the measured profile, then wait for the decision. */
export async function submitAsAgent(agent, method, args) {
  const p = STUDIO_NEXT_FEE_PROFILE.methods[method];
  const estimate = await agent.client.estimateTransactionFees({
    leaderTimeunitsAllocation: BigInt(p.leaderTimeunitsAllocation),
    validatorTimeunitsAllocation: BigInt(p.validatorTimeunitsAllocation),
    executionBudgetPerRound: BigInt(p.executionBudgetPerRound),
    totalMessageFees: BigInt(p.totalMessageFees),
    appealRounds: 0n,
    rotations: [BigInt(p.rotationsPerRound)],
  });
  const txId = await agent.client.writeContract({
    address: STUDIO_NEXT.dex,
    functionName: method,
    args,
    value: 0n,
    fees: { distribution: estimate.distribution, feeValue: estimate.feeValue },
  });
  const receipt = await agent.client.waitForTransactionReceipt({
    hash: txId, waitUntil: 'decided', interval: 1500, retries: 240, fullTransaction: true,
  });
  return { txId, ok: isSuccessful(receipt), deposit: estimate.feeValue, receipt };
}

/**
 * Test balances for `user`, relayed by the session agent so the user needs no
 * signature: both are topped up with GEN for deposits first.
 * @returns {{ ok: boolean, txId: string }} ok is false when the hourly faucet was already used
 */
export async function claimTestFunds(user, agent) {
  await Promise.all([ensureGas(user), ensureGas(agent.address)]);
  const res = await submitAsAgent(agent, 'claim_test_tokens', [user]);
  return { ok: res.ok, txId: res.txId };
}

/** The contract's pools, and what a missing token should tell the user. */
export const unsupportedLine = (symbols) => `${symbols.join(' and ')} ${symbols.length === 1 ? 'has' : 'have'} no pool on Studio Next. Pools: ${STUDIO_NEXT.pairs.join(', ')}.`;

/** A verdict is written in the same round it answers, so it is readable at once; a short retry covers read lag. */
export async function readVerdict(rid, tries = 5) {
  for (let i = 0; i < tries; i += 1) {
    const v = await view('get_verdict', [rid]);
    if (v && v.request_id) return v;
    await new Promise((r) => setTimeout(r, 1200));
  }
  return null;
}
