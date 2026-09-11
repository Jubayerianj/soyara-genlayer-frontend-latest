// lib/settlementBackend.js
//
// Where the server's record of queued trades lives. Server-side only.
//
// With SETTLEMENT_SERVER_URL set, a separate always-on settlement server holds
// the trades and settles them (github.com/Jubayerianj/soyaradex-server). This
// app hands each trade over when its consensus round opens, and asks the
// server where it stands. That is the setup for a host that cannot keep a
// timer running, such as serverless functions.
//
// Without it, the record is a file on this server and this server's own keeper
// settles (lib/settlementStore.js, lib/settlementKeeper.js): one long-running
// host, or development.

import * as local from './settlementStore.js';

const TIMEOUT_MS = 4000;
const serverUrl = () => String(process.env.SETTLEMENT_SERVER_URL || '').trim().replace(/\/+$/, '');

export const usesSettlementServer = () => Boolean(serverUrl());

async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${serverUrl()}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.SETTLEMENT_SERVER_KEY || ''}`,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `settlement server answered HTTP ${res.status}`);
  return data;
}

/** Hand a trade over. Throws if the settlement server refused it. */
export async function registerTrade(entry) {
  if (!usesSettlementServer()) return local.registerSettlement(entry);
  return call('/v1/settlements', {
    method: 'POST',
    body: {
      commitment: entry.commitment,
      order: entry.order,
      program: entry.program,
      validationTxHash: entry.validationTxHash || null,
      label: entry.label || null,
    },
  });
}

/** Where a trade stands, or null when nobody holds it (or the server is unreachable). */
export async function getTrade(commitment) {
  if (!usesSettlementServer()) return local.getSettlement(commitment);
  return call(`/v1/settlements/${commitment}`).catch(() => null);
}

export async function findTradeByRound(txHash) {
  if (!usesSettlementServer()) return local.findSettlementByRound(txHash);
  return call(`/v1/settlements?round=${txHash}`).catch(() => null);
}

export async function cancelTrade(commitment) {
  if (!usesSettlementServer()) return local.cancelSettlement(commitment);
  return call(`/v1/settlements/${commitment}/cancel`, { method: 'POST' }).catch(() => null);
}

/** This app settled a trade itself. The settlement server sees the spent commitment on its own. */
export async function recordSettled(commitment, patch) {
  if (usesSettlementServer()) return null;
  return local.updateSettlement(commitment, patch);
}
