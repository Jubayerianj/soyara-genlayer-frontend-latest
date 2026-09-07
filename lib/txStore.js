// lib/txStore.js
//
// Durable record of in-flight and completed agent operations, kept in
// localStorage so status survives closing or reloading /ai and /a2a.
//
// This matters here more than on a normal DEX: a GenVM consensus round runs for
// tens of seconds and sometimes minutes, so a user who closes the tab mid-round
// previously lost every trace of it - no transaction hash, no proposal id, no
// way to learn whether the trade was ever approved. Entries are keyed per wallet
// address and re-polled on mount, so a round that finished while the page was
// closed resolves as soon as it is reopened.
//
// Every accessor is wrapped: localStorage throws outright in some contexts
// (private windows, blocked site data, SSR), and a storage failure must never
// take the page down.

const KEY = 'soyara.activity.v1';
const MAX_ENTRIES = 40;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // a week

function canUse() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readAll() {
  if (!canUse()) return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(entries) {
  if (!canUse()) return;
  try {
    const now = Date.now();
    const pruned = entries
      .filter((e) => e && now - (e.createdAt || 0) < MAX_AGE_MS)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, MAX_ENTRIES);
    window.localStorage.setItem(KEY, JSON.stringify(pruned));
  } catch {
    // Quota exceeded or storage blocked - the app must keep working regardless.
  }
}

/** Stable id so the same round is not recorded twice across reloads. */
function makeId(entry) {
  return entry.txHash || entry.proposalId || `${entry.kind}-${entry.createdAt}`;
}

/**
 * Insert or update an entry. `patch` is merged over any existing record with the
 * same id, so a validation can later be upgraded to "settled" in place.
 */
export function recordActivity(patch) {
  const all = readAll();
  const id = patch.id || makeId({ createdAt: Date.now(), ...patch });
  const existing = all.find((e) => e.id === id);
  const merged = {
    id,
    kind: 'validation',
    status: 'pending',
    createdAt: Date.now(),
    ...existing,
    ...patch,
    updatedAt: Date.now(),
  };
  const next = [merged, ...all.filter((e) => e.id !== id)];
  writeAll(next);
  return merged;
}

/** All entries for one wallet, newest first. Pass no address to get everything. */
export function listActivity(address) {
  const all = readAll();
  if (!address) return all;
  const key = String(address).toLowerCase();
  return all.filter((e) => !e.user || String(e.user).toLowerCase() === key);
}

export function removeActivity(id) {
  writeAll(readAll().filter((e) => e.id !== id));
}

export function clearActivity() {
  if (!canUse()) return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Re-check every still-pending entry against the chain.
 *
 * Called on mount, this is what makes a round that completed while the page was
 * closed show its real verdict instead of staying "pending" forever. It never
 * resubmits - it only reads status for a transaction that already exists.
 *
 * @param {string} address wallet whose entries to resume
 * @param {(entries: object[]) => void} onUpdate called after each resolution
 */
export async function resumePending(address, onUpdate) {
  const pending = listActivity(address).filter(
    (e) => e.status === 'pending' && (e.txHash || e.proposalId)
  );
  if (pending.length === 0) return listActivity(address);

  for (const entry of pending) {
    try {
      const res = await fetch('/api/genlayer-validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkTxHash: entry.txHash, proposalId: entry.proposalId || null }),
      });
      if (!res.ok) continue;
      const data = await res.json();

      // Still undecided - leave it pending so the next visit tries again.
      if (data.pending) {
        recordActivity({ id: entry.id, statusName: data.statusName || entry.statusName });
        continue;
      }

      recordActivity({
        id: entry.id,
        status: data.approved ? 'approved' : data.retryable ? 'undecided' : 'rejected',
        reason: data.reason,
        proposalId: data.proposal_id || entry.proposalId,
        statusName: data.statusName || entry.statusName,
      });
    } catch {
      // Offline or the API is down - keep the entry pending and try next time.
    }
    if (onUpdate) onUpdate(listActivity(address));
  }
  return listActivity(address);
}
