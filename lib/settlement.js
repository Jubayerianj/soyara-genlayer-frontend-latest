// lib/settlement.js
//
// The settlement lifecycle, as one shared model.
//
// WHY THIS EXISTS
// ---------------
// Enforcing the GenLayer verdict on chain has a cost the UI cannot hide: an
// Intelligent Contract delivers its verdict to the executor as an external
// message, and those are delivered only after the round's appeal window closes.
// On Bradbury it is 30 minutes after the round's last vote, measured on two
// separate rounds on 2026-09-11.
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

/**
 * The round plus Bradbury's finality window: about a minute of voting, then 30
 * minutes after the last vote (measured). Used for progress, never for logic.
 */
export const APPEAL_WINDOW_MS = 31 * 60 * 1000;

export const STAGES = {
  quoting: {
    label: 'Quoting',
    blurb: 'Finding the best route.',
    needsUser: false,
    seconds: 5,
  },
  validating: {
    label: 'Consensus round',
    blurb: 'Validators are checking the route and price.',
    needsUser: false,
    seconds: 60,
  },
  approving: {
    label: 'Token approval',
    blurb: 'One signature per token, once.',
    needsUser: true,
    seconds: 20,
  },
  finalising: {
    label: 'Appeal window',
    blurb: 'Approved. Waiting for the network to deliver it.',
    needsUser: false,
    seconds: APPEAL_WINDOW_MS / 1000,
  },
  settling: {
    label: 'Settling',
    blurb: 'Settling now.',
    needsUser: false,
    seconds: 20,
  },
  settled: {
    label: 'Settled',
    blurb: 'Done.',
    needsUser: false,
    seconds: 0,
  },
  rejected: {
    label: 'Refused',
    blurb: 'Not approved. Nothing moved.',
    needsUser: false,
    seconds: 0,
  },
  expired: {
    label: 'Expired',
    blurb: 'Approval expired. Nothing moved. Run it again.',
    needsUser: false,
    seconds: 0,
  },
};

export const STAGE_ORDER = ['quoting', 'validating', 'approving', 'settling', 'settled'];

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

const clock = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/**
 * One line for a trade waiting on its verdict: what it is waiting for, and when.
 *
 * `entry.round` is the chain's answer (see roundQueueStatus): how many older
 * rounds must finalize first, and when this one can. Without it, the estimate
 * from validation time is all there is. The line must never read as stuck
 * when the network is simply working through rounds ahead of it.
 */
export function describeWait(entry, now = Date.now()) {
  const r = entry?.round;
  if (r?.ahead > 0) {
    const rounds = `${r.ahead} earlier round${r.ahead === 1 ? '' : 's'}`;
    return r.readyAt ? `Waiting on ${rounds} · about ${clock(r.readyAt)}` : `Waiting on ${rounds} to finish`;
  }
  if (r?.readyAt) {
    return r.readyAt > now + 30_000 ? `Approved · lands about ${clock(r.readyAt)}` : 'Approved · landing now';
  }
  const eta = (entry?.validatedAt || entry?.createdAt || now) + APPEAL_WINDOW_MS;
  return eta > now ? `Approved · about ${formatDuration(eta - now)} left` : 'Approved · landing any moment';
}

/** 0 to 1: how far along the wait is, by the chain's own ETA when known. */
export function waitProgress(entry, now = Date.now()) {
  const start = entry?.validatedAt || entry?.createdAt || now;
  const end = entry?.round?.readyAt || start + APPEAL_WINDOW_MS;
  if (end <= start) return 0.99;
  return Math.max(0.02, Math.min(0.99, (now - start) / (end - start)));
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
    // Which authority settles the trade was fixed when it was submitted.
    rail: base.rail ?? poll.rail ?? null,
    mandate_eligible: base.mandate_eligible ?? poll.mandate_eligible ?? false,
    mandate_note: base.mandate_note ?? poll.mandate_note ?? null,
  };
}

/**
 * Apply a verdict that arrived after the swarm stopped waiting for it.
 *
 * `risk` is the swarm's pending result; `data` is the merged poll response for
 * the same round. Returns the updated result and what happened:
 *
 *   'approved'   consensus approved this exact order; it can be queued
 *   'undecided'  the round ended without a verdict (or was watched too long):
 *                a network condition, never shown as a rejection
 *   'rejected'   consensus refused it
 *
 * Only a real approval makes a trade executable, and the swarm's own slippage
 * cap still applies to it.
 */
export function applyLateVerdict(risk, data) {
  const slippageOk = risk?.checks?.find((c) => c.name === 'Slippage Cap Check')?.passed !== false;
  const approved = Boolean(data?.approved && slippageOk);
  const undecided = !approved && !data?.approved && Boolean(data?.retryable || data?.timedOut);
  const outcome = approved ? 'approved' : undecided ? 'undecided' : 'rejected';
  const reason = slippageOk ? (data?.reason || risk?.reason || '') : 'Slippage exceeds 300 bps cap';
  return {
    outcome,
    risk: {
      ...risk,
      isApproved: approved,
      isPending: false,
      isUndecided: undecided,
      rail: approved ? (data.rail || 'consensus') : null,
      commitment: data?.commitment || risk?.commitment || null,
      tradeHash: data?.commitment || risk?.tradeHash,
      pendingOrder: data?.pendingOrder || risk?.pendingOrder || null,
      pendingProgram: data?.pendingProgram || risk?.pendingProgram || null,
      reason,
      checks: (risk?.checks || []).map((c) => (c.name === 'GenVM AI Coherence Consensus'
        ? {
          ...c,
          passed: Boolean(data?.approved),
          detail: data?.approved
            ? 'Equivalence principle verified across validator nodes'
            : undecided ? 'The round ended without a verdict - not a rejection' : (data?.reason || 'Rejected by consensus'),
        }
        : c)),
    },
  };
}
