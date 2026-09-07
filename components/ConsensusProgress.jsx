// components/ConsensusProgress.jsx
//
// Shared "what is actually happening" panel for a GenVM consensus round, used by
// both /ai (ProposalPanel) and /a2a (SwarmWarRoom).
//
// A consensus round takes tens of seconds and sometimes minutes, and a bare
// spinner for that long reads as a hang - users concluded their trade had been
// rejected when it was simply still being voted on. This shows the REAL
// lifecycle phase reported by the receipt (statusName), how long it has been
// running, and plainly what the network is doing, plus the one reassurance that
// actually matters: nothing has moved yet.

import React, { useEffect, useState } from 'react';
import { Loader2, Check, ExternalLink, ShieldCheck } from 'lucide-react';

// The real GenVM Optimistic Democracy lifecycle. `match` lists the receipt
// statusName values that mean this phase is current.
const PHASES = [
  {
    key: 'submitted',
    label: 'Proposal submitted',
    match: [],
    detail: 'Your trade parameters were sent to the AgentValidator Intelligent Contract as a consensus transaction.',
  },
  {
    key: 'activation',
    label: 'Waiting for validator selection',
    match: ['PENDING', 'ACTIVATED'],
    detail: 'GenLayer picks the validator set with a VRF proof. Only the network can do this, so the wait here is the testnet, not your trade.',
  },
  {
    key: 'voting',
    label: 'Validators voting',
    match: ['PROPOSING', 'COMMITTING'],
    detail: 'The leader runs your proposal and each validator independently re-runs it, then commits a sealed vote.',
  },
  {
    key: 'revealing',
    label: 'Revealing votes',
    match: ['REVEALING'],
    detail: 'Validators reveal their sealed votes. A majority must agree for the round to be accepted.',
  },
  {
    key: 'recorded',
    label: 'Verdict recorded on-chain',
    match: ['ACCEPTED', 'FINALIZED'],
    detail: 'The verdict is written into contract state, where settlement reads it back before binding the one-time approval.',
  },
];

function phaseIndex(statusName) {
  if (!statusName) return 1; // submitted, awaiting activation
  const i = PHASES.findIndex((p) => p.match.includes(String(statusName).toUpperCase()));
  return i === -1 ? 1 : i;
}

export default function ConsensusProgress({
  statusName,
  txHash,
  startedAt,
  isRetryRound = false,
  isDark = true,
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startedAt) return undefined;
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const current = phaseIndex(statusName);
  // Sitting at activation for a long time is the specific Bradbury failure mode
  // worth naming, rather than a generic "still working".
  const stalledAtActivation = current <= 1 && elapsed > 90;
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const clock = mins > 0 ? `${mins}m ${String(secs).padStart(2, '0')}s` : `${secs}s`;

  const border = isDark ? 'rgba(255,255,255,0.10)' : '#e2e8f0';
  const muted = isDark ? 'rgba(255,255,255,0.55)' : '#64748b';

  return (
    <div style={{
      border: `1px solid ${border}`,
      borderRadius: 12,
      padding: '0.95rem 1rem',
      background: isDark ? 'rgba(56,189,248,0.05)' : 'rgba(2,132,199,0.04)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
        <Loader2 size={15} color="#38bdf8" style={{ animation: 'spin 1s linear infinite' }} />
        <strong style={{ fontSize: '0.86rem' }}>
          {isRetryRound ? 'Running a fresh consensus round' : 'Reaching consensus on GenLayer'}
        </strong>
        <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: muted, fontVariantNumeric: 'tabular-nums' }}>
          {clock}
        </span>
      </div>

      <div style={{ fontSize: '0.74rem', color: muted, lineHeight: 1.5, marginBottom: 10 }}>
        This normally takes 30–60 seconds and can take longer when the validator set is busy.
        A slow round is <strong>not</strong> a rejection.
      </div>

      {/* Past ~90s the round is no longer "normal slow". Say so, rather than
          leaving a progress bar implying it is still on track. */}
      {elapsed > 90 && (
        <div style={{
          marginBottom: 10, padding: '8px 10px', borderRadius: 8,
          background: 'rgba(245,158,11,0.09)', border: '1px solid rgba(245,158,11,0.28)',
          fontSize: '0.72rem', lineHeight: 1.5,
        }}>
          <strong style={{ color: '#f59e0b' }}>This is taking longer than usual.</strong>{' '}
          {stalledAtActivation
            ? 'The round has not been picked up by a validator set yet. On Bradbury this is a known testnet condition - only the network can activate a transaction, so there is nothing to fix on your side.'
            : 'The validator set has not returned a verdict yet.'}{' '}
          Your trade is unaffected and no funds have moved. You can close this page - the round is
          saved and will be re-checked automatically when you come back.
        </div>
      )}

      {/* Real lifecycle phases */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {PHASES.map((p, i) => {
          const done = i < current;
          const active = i === current;
          const tone = done ? '#34d399' : active ? '#38bdf8' : muted;
          return (
            <div key={p.key} style={{ display: 'flex', gap: 9, opacity: done || active ? 1 : 0.45 }}>
              <div style={{
                width: 18, height: 18, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: done ? 'rgba(52,211,153,0.15)' : active ? 'rgba(56,189,248,0.15)' : 'transparent',
                border: `1px solid ${tone}`, color: tone,
              }}>
                {done ? <Check size={10} />
                  : active ? <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} />
                    : <span style={{ fontSize: '0.55rem', fontWeight: 700 }}>{i + 1}</span>}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.76rem', fontWeight: active ? 700 : 500, color: active ? tone : 'inherit' }}>
                  {p.label}
                </div>
                {active && (
                  <div style={{ fontSize: '0.7rem', color: muted, lineHeight: 1.45, marginTop: 2 }}>
                    {p.detail}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* The reassurance that actually matters */}
      <div style={{
        marginTop: 11, paddingTop: 10, borderTop: `1px solid ${border}`,
        display: 'flex', gap: 7, alignItems: 'flex-start',
      }}>
        <ShieldCheck size={13} color="#34d399" style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: '0.72rem', color: muted, lineHeight: 1.5 }}>
          <strong style={{ color: isDark ? '#e2e8f0' : '#0f172a' }}>Nothing has moved.</strong>{' '}
          No tokens have left your wallet and no approval has been bound yet - settlement only
          happens after the verdict is recorded and read back on-chain. It is safe to wait, and
          safe to leave this page.
        </div>
      </div>

      {txHash && (
        <a
          href={`https://explorer-bradbury.genlayer.com/tx/${txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            marginTop: 9, display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: '0.7rem', color: '#38bdf8', textDecoration: 'none',
          }}
        >
          <ExternalLink size={11} /> Follow the consensus transaction
        </a>
      )}
    </div>
  );
}
