// lib/settlementStore.js
//
// The server's own record of consensus-rail trades waiting on their verdict.
//
// The browser used to be the only thing holding a queued trade's order, so a
// trade could only settle while a Soyara tab was open: close them all and an
// approved trade waited for the user to come back, or expired. The server
// already builds the order when it opens the consensus round, so it keeps a
// copy here and settles the trade itself when the verdict lands (see
// lib/settlementKeeper.js).
//
// A JSON file on the app server's disk, written atomically: enough for one
// long-running server. A serverless deployment would keep the same records in a
// database behind these same functions.
//
// Nothing here authorises anything. An entry is a receipt - the order and its
// route - and the executor still refuses it unless the AgentValidator recorded
// a verdict for exactly that order.

import fs from 'node:fs';
import path from 'node:path';

const MAX_ENTRIES = 200;
const KEEP_FINISHED_MS = 24 * 60 * 60 * 1000;
export const TERMINAL_STAGES = new Set(['settled', 'expired', 'cancelled']);

function storeFile() {
  return process.env.SOYARA_SETTLEMENT_STORE || path.join(process.cwd(), '.soyara', 'settlements.json');
}

function readAll() {
  try {
    const v = JSON.parse(fs.readFileSync(storeFile(), 'utf8'));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function writeAll(list) {
  const file = storeFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Write then rename, so a crash mid-write never leaves half a file behind.
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(list));
  fs.renameSync(tmp, file);
}

const same = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

/** Finished entries older than a day go, and the list never grows unbounded. */
function prune(list, now = Date.now()) {
  return list
    .filter((e) => !(TERMINAL_STAGES.has(e.stage) && now - (e.updatedAt || 0) > KEEP_FINISHED_MS))
    .slice(0, MAX_ENTRIES);
}

export function listSettlements() {
  return readAll();
}

export function getSettlement(commitment) {
  return readAll().find((e) => same(e.commitment, commitment)) || null;
}

export function findSettlementByRound(txHash) {
  return readAll().find((e) => same(e.validationTxHash, txHash)) || null;
}

/**
 * Remember a trade whose consensus round was just opened. Re-registering the
 * same commitment refreshes it, but never revives a finished one.
 */
export function registerSettlement(entry, now = Date.now()) {
  if (!entry?.commitment || !entry.order || !entry.program) return null;
  const all = readAll();
  const prev = all.find((e) => same(e.commitment, entry.commitment));
  if (prev && TERMINAL_STAGES.has(prev.stage)) return prev;
  const next = {
    stage: 'waiting',
    attempts: 0,
    createdAt: now,
    ...prev,
    ...entry,
    updatedAt: now,
  };
  writeAll(prune([next, ...all.filter((e) => !same(e.commitment, entry.commitment))], now));
  return next;
}

export function updateSettlement(commitment, patch, now = Date.now()) {
  const all = readAll();
  let found = null;
  const next = all.map((e) => {
    if (!same(e.commitment, commitment)) return e;
    found = { ...e, ...patch, updatedAt: now };
    return found;
  });
  if (found) writeAll(prune(next, now));
  return found;
}

/** The user dismissed the trade: the server must not settle it behind their back. */
export function cancelSettlement(commitment, now = Date.now()) {
  const e = getSettlement(commitment);
  if (!e || TERMINAL_STAGES.has(e.stage)) return e;
  return updateSettlement(commitment, { stage: 'cancelled' }, now);
}
