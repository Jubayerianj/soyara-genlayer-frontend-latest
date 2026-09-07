// lib/settlement.js
//
// The settlement lifecycle, as one shared model.
//
// WHY THIS EXISTS
// ---------------
// Enforcing the GenLayer verdict on chain has a cost the UI cannot hide: an
// Intelligent Contract delivers its verdict to the executor as an external
// message, and those are delivered only after the round's appeal window closes.
// On Bradbury that has been observed at roughly 40 minutes.
//
// The old flow treated that as one long spinner and then asked for a token
// approval at the end, so the user watched a loader for half an hour and was
// then interrupted for a signature. Both halves of that are wrong. A wait this
// long is not a modal step; it is a background job, and anything requiring the
// user's attention should happen at the START of it, while they are still here.
//
// So the model below names each stage, says what is actually happening, and
// says which of them need the user. The UI renders from this rather than
// inventing its own vocabulary in three places.

/** Observed appeal window on Bradbury. Used for progress, never for logic. */
export const APPEAL_WINDOW_MS = 40 * 60 * 1000;

export const STAGES = {
  quoting: {
    label: 'Quoting',
    blurb: 'Reading live pool reserves and picking the best route.',
    needsUser: false,
    seconds: 5,
  },
  validating: {
    label: 'Consensus round',
    blurb: 'Validators decode the route, verify every pool against the factory, and re-derive the price from live reserves.',
    needsUser: false,
    seconds: 60,
  },
  approving: {
    label: 'Token approval',
    blurb: 'One signature, once per token, ever. Requested now so nothing interrupts you later.',
    needsUser: true,
    seconds: 20,
  },
  attesting: {
    label: 'Verifying verdict',
    blurb: 'Attestors are confirming what the validators recorded, and signing it for the settlement contract.',
    needsUser: false,
    seconds: 5,
  },
  finalising: {
    label: 'Appeal window',
    blurb: 'Fallback path. Consensus approved, and with attestation switched off the verdict only reaches the settlement contract once the round can no longer be appealed.',
    needsUser: false,
    seconds: APPEAL_WINDOW_MS / 1000,
  },
  settling: {
    label: 'Settling',
    blurb: 'The verdict is on the contract. Relaying the trade now.',
    needsUser: false,
    seconds: 20,
  },
  settled: {
    label: 'Settled',
    blurb: 'Done. The verdict was single use and is now spent.',
    needsUser: false,
    seconds: 0,
  },
  rejected: {
    label: 'Refused',
    blurb: 'Consensus did not approve this trade, so nothing can settle.',
    needsUser: false,
    seconds: 0,
  },
  expired: {
    label: 'Expired',
    blurb: 'The verdict passed its validity window before it could be spent. Re-run to get a fresh one.',
    needsUser: false,
    seconds: 0,
  },
};

export const STAGE_ORDER = ['quoting', 'validating', 'approving', 'attesting', 'settling', 'settled'];

/**
 * Remaining time for a settlement waiting on the appeal window.
 *
 * Deliberately an ESTIMATE and labelled as one wherever it is shown. The window
 * is a protocol parameter, not something this app is told, so presenting a
 * countdown as fact would be a promise the app cannot keep.
 */
export function estimateReadyAt(validatedAt) {
  if (!validatedAt) return null;
  return validatedAt + APPEAL_WINDOW_MS;
}

export function formatDuration(ms) {
  if (ms == null) return '';
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

/** Terminal stages: nothing further will happen on its own. */
export function isTerminal(stage) {
  return stage === 'settled' || stage === 'rejected' || stage === 'expired';
}


/**
 * GenVM round phases, in the words a user can act on.
 *
 * The protocol reports ACTIVATED / PROPOSING / COMMITTING / REVEALING /
 * ACCEPTED. Rendering those verbatim is jargon; rendering none of them is a
 * spinner. A round takes roughly 20 to 30 seconds and moves through every one
 * of these, so showing which one it is on turns an opaque wait into visible
 * progress of the same length.
 */
export const ROUND_PHASES = {
  PENDING:     { label: 'Queued',              step: 1, of: 5 },
  ACTIVATED:   { label: 'Validators selected', step: 2, of: 5 },
  PROPOSING:   { label: 'Leader executing',    step: 3, of: 5 },
  COMMITTING:  { label: 'Validators voting',   step: 4, of: 5 },
  REVEALING:   { label: 'Revealing votes',     step: 4, of: 5 },
  ACCEPTED:    { label: 'Verdict reached',     step: 5, of: 5 },
  FINALIZED:   { label: 'Verdict reached',     step: 5, of: 5 },
};

export function describeRoundPhase(statusName) {
  const p = ROUND_PHASES[String(statusName || '').toUpperCase()];
  return p ? `${p.label} (${p.step}/${p.of})` : 'Submitting to validators';
}

/**
 * Carry the settlement handoff across a poll.
 *
 * A consensus round returns two different kinds of thing. The bound order, its
 * aggregator program and the commitment are computed once when the round is
 * submitted and cannot change for that round. The verdict - approved, pending,
 * retryable, which phase - is what the poll is asking about.
 *
 * Every caller used to overwrite the whole response with the poll result, and
 * the status-check path does not (and cannot) return an order: it is given only
 * a transaction hash. So any round slow enough to need a single poll silently
 * lost `pendingOrder`, `pendingProgram` and `commitment`.
 *
 * The damage was invisible and downstream. The Post-Trade Auditor could not
 * verify a single binding; the settlement queue's enqueue is guarded on
 * `approved && pendingOrder && pendingProgram`, so an approved trade from a slow
 * round never reached the queue at all and simply stopped, approved and
 * unsettled, with nothing on screen explaining why.
 *
 * Merging instead of replacing keeps the immutable half and takes the verdict
 * from the poll.
 */
export function mergeVerdictResponse(base, poll) {
  if (!poll) return base;
  if (!base) return poll;
  return {
    ...base,
    ...poll,
    // Never let a poll blank out a value it was never in a position to compute.
    commitment: poll.commitment ?? base.commitment ?? null,
    pendingOrder: poll.pendingOrder ?? base.pendingOrder ?? null,
    pendingProgram: poll.pendingProgram ?? base.pendingProgram ?? null,
    orderKind: poll.orderKind ?? base.orderKind ?? null,
    quoted_amount_out: poll.quoted_amount_out ?? base.quoted_amount_out ?? null,
    min_amount_out: poll.min_amount_out ?? base.min_amount_out ?? null,
    proposal_id: poll.proposal_id || base.proposal_id || '',
  };
}
