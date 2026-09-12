// lib/tone.js
//
// One palette for status across the trading surfaces.
//
// Red was doing too much work. A round the validator set did not decide, a
// quote with no pool behind it, a token that still needs one approval, a trade
// consensus refused: none of those is a broken system, and colouring them like
// an alarm made a working product read as failing. So nothing on the trade
// surfaces is red.
//
//   ok         it happened
//   running    it is happening
//   attention  it needs the user, or it did not go through: the line next to
//              this colour says what to do
//   muted      information
//
// The colour never carries the meaning on its own: every attention block is
// written as a plain sentence that reads correctly with no colour at all.

export const TONE = {
  ok:        { color: '#10b981', bg: 'rgba(16, 185, 129, 0.08)',  border: 'rgba(16, 185, 129, 0.25)' },
  running:   { color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.08)',  border: 'rgba(56, 189, 248, 0.25)' },
  attention: { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.09)',  border: 'rgba(245, 158, 11, 0.28)' },
  muted:     { color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.08)', border: 'rgba(148, 163, 184, 0.22)' },
};

/** The tone for a settlement or round stage. */
export function toneFor(stage) {
  if (stage === 'settled' || stage === 'approved' || stage === 'live') return TONE.ok;
  if (stage === 'expired' || stage === 'cancelled' || stage === 'rejected' || stage === 'needs-approval') return TONE.attention;
  return TONE.running;
}
