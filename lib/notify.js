// lib/notify.js
//
// App-wide notifications, kept in localStorage.
//
// Everything that happens in the background - a consensus round, a trade
// waiting on its verdict, a fast lane being issued - reports here in one line,
// instead of writing paragraphs into the page. Stored notices survive a reload
// and reach every open tab, so a trade that settles while the user is on
// another page still tells them.
//
// A notice is keyed by `id`. Notifying again with the same id updates it in
// place, which is how one trade goes "Settling" -> "Settled" without leaving
// two entries behind.

const KEY = 'soyara.notices.v1';
const EVENT = 'soyara:notices';
export const MAX_NOTICES = 40;

const hasStorage = () => {
  try { return typeof window !== 'undefined' && Boolean(window.localStorage); } catch { return false; }
};

function readAll() {
  if (!hasStorage()) return [];
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function writeAll(list) {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_NOTICES)));
  } catch { /* storage full or blocked: notices are a convenience, never a blocker */ }
  try { window.dispatchEvent(new CustomEvent(EVENT)); } catch { /* no DOM */ }
}

/** Newest first. */
export function listNotices() {
  return readAll().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

/**
 * Add or update a notice.
 *
 * @param {object} n
 * @param {string} [n.id]     same id updates in place
 * @param {'pending'|'success'|'error'|'warning'|'info'} [n.kind]
 * @param {string} n.title    one short line
 * @param {string} [n.body]   optional second line
 * @param {string} [n.href]   optional link
 * @returns {string} the id
 */
export function notify({ id, kind = 'info', title, body = '', href = null } = {}) {
  if (!title) return null;
  const now = Date.now();
  const key = id || `n-${now}-${Math.random().toString(36).slice(2, 7)}`;
  const all = readAll();
  const prev = all.find((x) => x.id === key);
  // Only a real change pops the notice again. Re-reporting the same state (a
  // poll that learned nothing new) must not flash the same toast every tick.
  const changed = !prev || prev.kind !== kind || prev.title !== title || prev.body !== body;
  if (!changed) return key;
  const next = {
    id: key,
    kind,
    title: String(title),
    body: String(body || ''),
    href: href || null,
    createdAt: prev?.createdAt || now,
    updatedAt: now,
    read: false,
  };
  writeAll([next, ...all.filter((x) => x.id !== key)]);
  return key;
}

export function dismissNotice(id) {
  writeAll(readAll().filter((x) => x.id !== id));
}

export function markAllRead() {
  writeAll(readAll().map((x) => ({ ...x, read: true })));
}

export function clearNotices() {
  writeAll([]);
}

/** Calls `fn` whenever notices change, in this tab or another. Returns an unsubscribe. */
export function subscribeNotices(fn) {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (e) => { if (!e || e.key === KEY) fn(); };
  window.addEventListener(EVENT, fn);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener('storage', onStorage);
  };
}

// ── The app's events, worded once ───────────────────────────────────────────
//
// Every surface reports the same event the same way, so /ai and /a2a never
// describe one trade in two vocabularies.

const shortHash = (h) => (h ? `${String(h).slice(0, 6)}…${String(h).slice(-4)}` : '');

export const notices = {
  roundRunning: (txHash, label) => notify({
    id: `round:${txHash}`, kind: 'pending', title: `Consensus running · ${label}`, body: 'Validators usually answer in under a minute',
  }),
  roundApproved: (txHash, label, rail) => notify({
    id: `round:${txHash || label}`, kind: 'success', title: `Approved · ${label}`,
    body: rail === 'mandate' ? 'Fast lane: settles in ~5s' : 'Settles by itself in ~30 min',
  }),
  roundRejected: (txHash, label, reason) => notify({
    id: `round:${txHash || label}`, kind: 'error', title: `Rejected · ${label}`, body: reason ? String(reason).slice(0, 120) : '',
  }),
  roundUndecided: (txHash, label) => notify({
    id: `round:${txHash || label}`, kind: 'warning', title: `No verdict · ${label}`, body: 'Network hiccup, not a rejection. Run it again.',
  }),
  queued: (commitment, label) => notify({
    id: `settle:${commitment}`, kind: 'pending', title: `Settling · ${label}`, body: 'About 30 min. Runs by itself in any Soyara tab.',
  }),
  settled: (id, label, txHash) => notify({
    id: `settle:${id}`, kind: 'success', title: `Settled · ${label}`, body: txHash ? `Tx ${shortHash(txHash)}` : '',
  }),
  needsApproval: (id, label) => notify({
    id: `settle:${id}`, kind: 'warning', title: `Approve to finish · ${label}`, body: 'One signature, then it settles by itself',
  }),
  settleFailed: (id, label, error) => notify({
    id: `settle:${id}`, kind: 'error', title: `Settlement failed · ${label}`, body: error ? String(error).slice(0, 120) : '',
  }),
  verdictExpired: (id, label) => notify({
    id: `settle:${id}`, kind: 'warning', title: `Expired · ${label}`, body: 'The approval ran out before settling. Nothing moved.',
  }),
  fastLaneRequested: (mandateId, pair) => notify({
    id: `lane:${mandateId}`, kind: 'pending', title: `Fast lane requested · ${pair}`, body: 'Ready in ~30 min, then trades settle in ~5s',
  }),
  fastLaneReady: (mandateId, pair) => notify({
    id: `lane:${mandateId}`, kind: 'success', title: `Fast lane ready · ${pair}`, body: 'This pair and direction now settle in ~5s',
  }),
  tokenApproval: (hash, symbol) => notify({
    id: `approve:${hash}`, kind: 'info', title: `${symbol} approved once`, body: 'No more wallet prompts for this token',
  }),
};
