// lib/settlementKeeper.js
//
// The server settles queued trades itself, so a trade finishes with every
// browser tab closed.
//
// Each pass:
//   1. drains the AgentValidator finalization queue, which is what delivers
//      verdicts to the executor (see drainFinalizationQueue);
//   2. for every stored trade (lib/settlementStore.js) whose verdict is now
//      live on AgentExecutor, sends the settlement - the same request the
//      browser queue makes, to the same route, so there is one settlement path.
//
// Double settlement cannot happen: the executor consumes a verdict once
// (CommitmentAlreadyUsed), the route checks that before it sends and holds a
// per-trade lock while it does, and the browser queue checks it too.
//
// It runs inside the app server (started by instrumentation.js, and by the
// routes as a fallback). A serverless deployment would call /api/keeper on a
// schedule instead; any open Soyara tab also pings it once a minute.

import fs from 'node:fs';
import path from 'node:path';
import { createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { CONTRACT_ADDRESSES } from '../constants/addresses.js';
import { drainFinalizationQueue } from './genlayer.js';
import { listSettlements, updateSettlement, TERMINAL_STAGES } from './settlementStore.js';

export const KEEPER_INTERVAL_MS = 30 * 1000;
/** A trade the user still has to approve a token for is retried this rarely. */
export const NEEDS_APPROVAL_RETRY_MS = 5 * 60 * 1000;
/** Other failures back off, capped here. */
const MAX_BACKOFF_MS = 5 * 60 * 1000;

/**
 * One keeper pass over the stored trades. Every dependency is injected, so the
 * decisions can be tested without a chain.
 */
export async function settlementKeeperPass({
  list = listSettlements,
  update = updateSettlement,
  readUsed,
  readLive,
  readExpiry,
  settle,
  drain = null,
  now = Date.now(),
} = {}) {
  const summary = { checked: 0, settled: 0, expired: 0, waiting: 0, blocked: 0, failed: 0 };
  if (drain) { try { await drain(); } catch { /* the next pass drains again */ } }

  for (const e of list()) {
    if (TERMINAL_STAGES.has(e.stage)) continue;
    summary.checked += 1;

    // Past the order's own deadline the executor would refuse it anyway.
    if (Number(e.deadline) > 0 && now > Number(e.deadline) * 1000) {
      update(e.commitment, { stage: 'expired' });
      summary.expired += 1;
      continue;
    }
    try {
      if (await readUsed(e.commitment)) {
        // Settled already - by the browser queue, or an earlier pass.
        update(e.commitment, { stage: 'settled', settledBy: e.settledBy || 'elsewhere' });
        summary.settled += 1;
        continue;
      }
      const expiry = Number(await readExpiry(e.commitment));
      if (expiry > 0 && expiry * 1000 < now) {
        update(e.commitment, { stage: 'expired' });
        summary.expired += 1;
        continue;
      }
      if (!(await readLive(e.commitment))) {
        summary.waiting += 1;
        continue;
      }
    } catch {
      summary.waiting += 1; // an unreadable chain is not a verdict; next pass
      continue;
    }

    // Verdict live. Respect the back-off for trades that failed before.
    const since = now - (e.lastAttemptAt || 0);
    if (e.stage === 'needs-approval' && since < NEEDS_APPROVAL_RETRY_MS) { summary.blocked += 1; continue; }
    const backoff = Math.min(MAX_BACKOFF_MS, (e.attempts || 0) * KEEPER_INTERVAL_MS);
    if ((e.attempts || 0) > 0 && since < backoff) { summary.waiting += 1; continue; }

    let r;
    try { r = await settle(e); } catch (err) { r = { success: false, error: err?.message || 'settle failed' }; }
    if (r?.inFlight) {
      summary.waiting += 1; // the browser queue is settling it right now
    } else if (r?.success) {
      update(e.commitment, { stage: 'settled', execTxHash: r.execTxHash || e.execTxHash || null, settledBy: r.alreadySettled ? (e.settledBy || 'elsewhere') : 'server', settledAt: now, error: null });
      summary.settled += 1;
    } else if (r?.needsApproval || /Insufficient token|approval missing/i.test(r?.error || '')) {
      // Needs the user: a token approval or more balance. Nothing the server can do.
      update(e.commitment, { stage: 'needs-approval', lastAttemptAt: now, error: r?.error || null });
      summary.blocked += 1;
    } else if (r?.verdictExpired) {
      update(e.commitment, { stage: 'expired', error: r.error || null });
      summary.expired += 1;
    } else {
      update(e.commitment, { lastAttemptAt: now, attempts: (e.attempts || 0) + 1, error: r?.error || null });
      summary.failed += 1;
    }
  }
  return summary;
}

// ── The real dependencies ───────────────────────────────────────────────────

let _abi = null;
function executorAbi() {
  if (!_abi) _abi = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'abi', 'AgentExecutor.json'), 'utf8'));
  return _abi;
}

let _client = null;
function chainClient() {
  if (!_client) {
    _client = createPublicClient({
      chain: { id: 4221, name: 'GenLayer Bradbury', nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 }, rpcUrls: { default: { http: ['https://rpc-bradbury.genlayer.com'] } } },
      transport: http('https://rpc-bradbury.genlayer.com'),
    });
  }
  return _client;
}

function keeperAccount() {
  const key = process.env.AGENT_PRIVATE_KEY;
  if (!key) return null;
  try { return privateKeyToAccount(key.startsWith('0x') ? key : `0x${key}`); } catch { return null; }
}

/** Where this server answers, for the settlement request. */
function selfBaseUrl() {
  return process.env.KEEPER_BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;
}

export function realKeeperDeps() {
  const executor = CONTRACT_ADDRESSES[4221]?.agentExecutor;
  const read = (functionName, commitment) => chainClient().readContract({ address: executor, abi: executorAbi(), functionName, args: [commitment] });
  const account = keeperAccount();
  return {
    readUsed: (c) => read('commitmentUsed', c),
    readLive: (c) => read('isVerdictLive', c),
    readExpiry: (c) => read('verdictExpiry', c),
    drain: account ? () => drainFinalizationQueue({ account }) : null,
    // Exactly the request the browser queue sends, to the same route.
    settle: async (e) => {
      const res = await fetch(`${selfBaseUrl()}/api/agent-execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rail: 'consensus',
          pendingOrder: e.order,
          pendingProgram: e.program,
          validationSubmitted: true,
          validationTxHash: e.validationTxHash,
        }),
      });
      return res.json().catch(() => ({ success: false, error: `HTTP ${res.status}` }));
    },
  };
}

/**
 * One pass now, never two at once. For /api/keeper and the interval. The flag
 * lives on globalThis because Next can load this module once per route bundle.
 */
export async function runKeeperOnce() {
  if (globalThis.__soyaraKeeperRunning) return { skipped: true };
  globalThis.__soyaraKeeperRunning = true;
  try {
    return await settlementKeeperPass(realKeeperDeps());
  } finally {
    globalThis.__soyaraKeeperRunning = false;
  }
}

/** Start the interval once per server process. Safe to call from anywhere. */
export function ensureSettlementKeeper() {
  if (typeof window !== 'undefined' || globalThis.__soyaraSettlementKeeper) return;
  globalThis.__soyaraSettlementKeeper = true;
  const tick = () => runKeeperOnce()
    .then((s) => { if (s?.settled || s?.expired) console.log('[keeper]', JSON.stringify(s)); })
    .catch((err) => console.warn('[keeper] pass failed:', err?.message));
  setTimeout(tick, 15 * 1000);
  setInterval(tick, KEEPER_INTERVAL_MS);
  console.log('[keeper] settlement keeper running');
}
