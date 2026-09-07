// components/AIAgent/SettlementBinding.jsx
//
// Shows what GenLayer consensus actually approved, and why the settlement agent
// cannot change it.
//
// This panel exists because the guarantee changed shape. It used to be "an
// approval hash covers the amounts", which is not something worth showing a
// user. It is now "one identifier covers the route, the fee, who receives the
// fee, you, and the quote it was checked against, and only the validator
// contract can approve it". That IS worth showing, because the interesting
// question for anyone letting an agent trade on their behalf is not whether the
// numbers were checked but what the agent is still free to change afterwards.
//
// The answer this panel gives is: nothing.

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ShieldCheck, Link2, Copy, Check, Route, Coins, User, TrendingUp,
  Lock, Loader2, CircleDot,
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

const short = (v, head = 10, tail = 8) =>
  !v ? '' : v.length <= head + tail + 2 ? v : `${v.slice(0, head)}…${v.slice(-tail)}`;

/** Raw units to a readable figure, without pulling in a formatting dependency. */
function humanise(raw, decimals = 18, places = 6) {
  try {
    const v = BigInt(raw);
    const base = 10n ** BigInt(decimals);
    const whole = v / base;
    const frac = (v % base).toString().padStart(decimals, '0').slice(0, places).replace(/0+$/, '');
    return frac ? `${whole}.${frac}` : `${whole}`;
  } catch {
    return String(raw ?? '');
  }
}

/**
 * The lifecycle, as the user experiences it.
 *
 * `finalising` is a real state and not a spinner for a slow network: an
 * Intelligent Contract delivers its verdict to the executor as an external
 * message, and those are delivered only once the round can no longer be
 * appealed. Until then consensus has approved the trade and the executor still
 * will not honour it. Collapsing that into "pending" would make a correct,
 * expected wait look like something had gone wrong.
 */
const STAGES = [
  { key: 'quoted',     label: 'Quoted',     hint: 'Route and price read from live pools' },
  { key: 'validating', label: 'Validating', hint: 'Validators re-derive the quote from pool reserves' },
  { key: 'finalising', label: 'Finalising', hint: 'Appeal window closing before the verdict is delivered' },
  { key: 'enforceable',label: 'Enforceable',hint: 'The executor now holds the verdict' },
  { key: 'settled',    label: 'Settled',    hint: 'Verdict consumed, single use' },
];

const SettlementBinding = ({ order, commitment, stage = 'quoted', validatorAddress, executorAddress, txHash }) => {
  const { theme } = useTheme();
  const isDark = theme !== 'light';
  const [copied, setCopied] = useState(false);

  if (!commitment && !order) return null;

  const textMain = isDark ? '#f8fafc' : '#0f172a';
  const textSub = isDark ? '#cbd5e1' : '#334155';
  const textMuted = isDark ? '#94a3b8' : '#64748b';
  const boxBg = isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc';
  const boxBorder = isDark ? 'rgba(255, 255, 255, 0.07)' : '#e2e8f0';
  const accent = '#0284c7';

  const stageIndex = Math.max(0, STAGES.findIndex((s) => s.key === stage));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(commitment);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked; the value is on screen either way */
    }
  };

  // Exactly the parameters the review named, plus the two that make a verdict
  // valid on one chain and one contract only.
  const bound = order ? [
    { icon: User,       label: 'Recipient',   value: short(order.user, 8, 6),
      note: 'Output can only reach this address' },
    { icon: Route,      label: 'Route',       value: short(order.routeHash, 8, 6),
      note: 'Hash of the exact aggregator program' },
    { icon: Coins,      label: 'Fee',         value: `${Number(order.feeBps) / 100}% to ${short(order.feeCollector, 6, 4)}`,
      note: 'Rate and recipient both fixed' },
    { icon: TrendingUp, label: 'Quote',       value: humanise(order.quotedAmountOut),
      note: 'The pool price validators verified' },
    { icon: Lock,       label: 'Floor',       value: humanise(order.minAmountOut),
      note: `One ${Number(order.slippageBps) / 100}% band below the quote` },
  ] : [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      style={{
        border: `1px solid ${boxBorder}`,
        borderRadius: '14px',
        background: boxBg,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '12px 14px',
        borderBottom: `1px solid ${boxBorder}`,
        background: isDark ? 'rgba(2, 132, 199, 0.07)' : 'rgba(2, 132, 199, 0.05)',
      }}>
        <ShieldCheck size={16} color={accent} />
        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: textMain, letterSpacing: '0.01em' }}>
          Consensus binding
        </span>
        <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: textMuted }}>
          enforced on chain
        </span>
      </div>

      {/* Stage rail */}
      <div style={{ display: 'flex', padding: '12px 14px 4px', gap: '6px' }}>
        {STAGES.map((s, i) => {
          const done = i < stageIndex;
          const active = i === stageIndex;
          const colour = done ? '#10b981' : active ? accent : (isDark ? 'rgba(255,255,255,0.15)' : '#cbd5e1');
          return (
            <div key={s.key} style={{ flex: 1, minWidth: 0 }} title={s.hint}>
              <div style={{ height: '3px', borderRadius: '2px', background: colour, marginBottom: '6px' }} />
              <div style={{
                fontSize: '0.63rem',
                color: active ? textMain : textMuted,
                fontWeight: active ? 700 : 500,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                display: 'flex', alignItems: 'center', gap: '3px',
              }}>
                {active && (stage === 'validating' || stage === 'finalising')
                  ? <Loader2 size={9} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                  : <CircleDot size={9} style={{ flexShrink: 0, opacity: done || active ? 1 : 0.4 }} />}
                {s.label}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ padding: '4px 14px 12px', fontSize: '0.7rem', color: textMuted, lineHeight: 1.5 }}>
        {STAGES[stageIndex]?.hint}
      </div>

      {/* The identifier */}
      {commitment && (
        <div style={{ padding: '0 14px 12px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            border: `1px solid ${boxBorder}`, borderRadius: '10px',
            padding: '9px 11px',
            background: isDark ? 'rgba(0,0,0,0.25)' : '#ffffff',
          }}>
            <Link2 size={13} color={textMuted} style={{ flexShrink: 0 }} />
            <code style={{
              fontSize: '0.72rem', color: textSub, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
            }}>
              {short(commitment, 14, 10)}
            </code>
            <button
              onClick={copy}
              aria-label="Copy commitment"
              style={{
                border: 'none', background: 'transparent', cursor: 'pointer',
                color: copied ? '#10b981' : textMuted, padding: '2px', display: 'flex', flexShrink: 0,
              }}
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
          </div>
        </div>
      )}

      {/* What the identifier covers */}
      {bound.length > 0 && (
        <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
          {bound.map(({ icon: Icon, label, value, note }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'flex-start', gap: '9px' }}>
              <Icon size={13} color={accent} style={{ marginTop: '2px', flexShrink: 0 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'baseline' }}>
                  <span style={{ fontSize: '0.74rem', color: textMuted, fontWeight: 600 }}>{label}</span>
                  <span style={{
                    fontSize: '0.74rem', color: textMain, fontWeight: 600,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{value}</span>
                </div>
                <div style={{ fontSize: '0.66rem', color: textMuted, lineHeight: 1.4 }}>{note}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* The point of the whole thing */}
      <div style={{
        padding: '10px 14px',
        borderTop: `1px solid ${boxBorder}`,
        fontSize: '0.68rem', color: textMuted, lineHeight: 1.55,
      }}>
        Only the validator contract can approve this identifier, and it reaches the
        executor directly. The settlement agent relays the trade and cannot alter
        any value above: a change of even one produces a different identifier that
        nothing has approved.
        {validatorAddress && (
          <div style={{ marginTop: '6px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.64rem' }}>
            validator {short(validatorAddress, 8, 6)}
            {executorAddress ? ` → executor ${short(executorAddress, 8, 6)}` : ''}
          </div>
        )}
        {txHash && (
          <a
            href={`https://explorer-bradbury.genlayer.com/tx/${txHash}`}
            target="_blank" rel="noreferrer"
            style={{ color: accent, textDecoration: 'none', fontSize: '0.66rem', display: 'inline-block', marginTop: '6px' }}
          >
            View consensus round
          </a>
        )}
      </div>
    </motion.div>
  );
};

export default SettlementBinding;
