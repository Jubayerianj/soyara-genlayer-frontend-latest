// components/SettlementQueue.jsx
//
// The tracker for trades waiting on their consensus verdict.
//
// The point of this panel is that the user does not have to be here. Once a
// consensus round is submitted, the trade lives in the queue, the queue watches
// the chain, and settlement happens on its own. So this is a status board, not
// a progress modal: it never blocks anything, it survives navigation and
// reloads, and the only thing it ever asks for is a token approval, which it
// asks for at the start rather than at the end.

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock, CheckCircle2, AlertTriangle, ExternalLink, X, ShieldCheck,
  ChevronDown, ChevronUp, Loader2, Hourglass,
} from 'lucide-react';
import { useTheme } from './contexts/ThemeContext';
import { STAGES, isTerminal, describeWait, waitProgress } from '../lib/settlement';

const EXPLORER = 'https://explorer-bradbury.genlayer.com/tx/';
const short = (v, a = 8, b = 6) => (!v ? '' : v.length <= a + b + 2 ? v : `${v.slice(0, a)}…${v.slice(-b)}`);

function StageBadge({ stage, queued = false, isDark }) {
  const map = {
    settled:    { c: '#10b981', Icon: CheckCircle2 },
    rejected:   { c: '#ef4444', Icon: AlertTriangle },
    expired:    { c: '#f59e0b', Icon: AlertTriangle },
    ready:      { c: '#10b981', Icon: ShieldCheck },
    settling:   { c: '#0284c7', Icon: Loader2 },
    validating: { c: '#0284c7', Icon: Loader2 },
    finalising: { c: '#8b5cf6', Icon: Hourglass },
  };
  const { c, Icon } = map[stage] || { c: '#64748b', Icon: Clock };
  // Behind another round is "In queue", not a window that seems to never end.
  const label = stage === 'ready' ? 'Ready' : stage === 'finalising' && queued ? 'In queue' : (STAGES[stage]?.label || stage);
  const spin = stage === 'settling' || stage === 'validating';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px',
      background: `${c}1a`, color: c, borderRadius: '999px',
      padding: '3px 9px', fontSize: '0.68rem', fontWeight: 700, whiteSpace: 'nowrap',
    }}>
      <Icon size={11} style={spin ? { animation: 'spin 1s linear infinite' } : undefined} />
      {label}
    </span>
  );
}

const SettlementQueue = ({ queue, onApprove, compact = false }) => {
  const { theme } = useTheme();
  const isDark = theme !== 'light';
  const [open, setOpen] = useState(true);
  const [, forceTick] = useState(0);

  // The wait line and progress move with time, so re-render on its own even when
  // nothing about the queue changed.
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const entries = queue?.entries || [];
  if (entries.length === 0) return null;

  const textMain = isDark ? '#f8fafc' : '#0f172a';
  const textMuted = isDark ? '#94a3b8' : '#64748b';
  const boxBg = isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc';
  const boxBorder = isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0';

  const pending = entries.filter((e) => !isTerminal(e.stage));

  return (
    <div style={{ border: `1px solid ${boxBorder}`, borderRadius: '14px', background: boxBg, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: '9px',
          padding: '11px 14px', background: 'transparent', border: 'none',
          cursor: 'pointer', color: textMain, textAlign: 'left',
        }}
      >
        <ShieldCheck size={15} color="#0284c7" />
        <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>Settlement queue</span>
        <span style={{ fontSize: '0.7rem', color: textMuted }}>
          {pending.length > 0 ? `${pending.length} in flight` : 'all clear'}
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          {entries.some((e) => isTerminal(e.stage)) && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); queue.clearFinished(); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); queue.clearFinished(); } }}
              style={{ fontSize: '0.68rem', color: textMuted, textDecoration: 'underline', cursor: 'pointer' }}
            >
              clear finished
            </span>
          )}
          {open ? <ChevronUp size={15} color={textMuted} /> : <ChevronDown size={15} color={textMuted} />}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: '9px' }}>
              {entries.map((e) => {
                // Progress and wording follow the chain's own answer - how many
                // rounds are ahead and when this one can land - so a longer wait
                // reads as queued, not stuck.
                const pct = e.stage === 'finalising'
                  ? Math.round(waitProgress(e) * 100)
                  : isTerminal(e.stage) || e.stage === 'ready' ? 100 : 8;

                return (
                  <div key={e.id} style={{
                    border: `1px solid ${boxBorder}`, borderRadius: '11px',
                    padding: '10px 11px', background: isDark ? 'rgba(0,0,0,0.22)' : '#fff',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: textMain }}>
                        {e.label || 'Swap'}
                      </span>
                      <StageBadge stage={e.stage} queued={(e.round?.ahead || 0) > 0} isDark={isDark} />
                      <span style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {e.validationTxHash && (
                          <a href={`${EXPLORER}${e.validationTxHash}`} target="_blank" rel="noreferrer"
                             title="Consensus round"
                             style={{ color: textMuted, display: 'flex' }}>
                            <ExternalLink size={12} />
                          </a>
                        )}
                        <span role="button" tabIndex={0} title="Dismiss"
                              onClick={() => queue.remove(e.id)}
                              onKeyDown={(ev) => { if (ev.key === 'Enter') queue.remove(e.id); }}
                              style={{ color: textMuted, display: 'flex', cursor: 'pointer' }}>
                          <X size={12} />
                        </span>
                      </span>
                    </div>

                    {!isTerminal(e.stage) && (
                      <div style={{ height: '3px', borderRadius: '2px', background: isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0', marginBottom: '6px' }}>
                        <div style={{
                          width: `${pct}%`, height: '100%', borderRadius: '2px',
                          background: e.stage === 'ready' ? '#10b981' : '#8b5cf6',
                          transition: 'width 0.6s ease',
                        }} />
                      </div>
                    )}

                    <div style={{ fontSize: '0.68rem', color: textMuted, lineHeight: 1.5 }}>
                      {e.stage === 'finalising'
                        ? describeWait(e)
                        : (STAGES[e.stage]?.blurb || '')}
                    </div>

                    {e.needsApproval && (
                      <button
                        onClick={() => onApprove?.(e)}
                        style={{
                          marginTop: '8px', width: '100%', padding: '7px',
                          borderRadius: '8px', border: 'none', cursor: 'pointer',
                          background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                          color: '#fff', fontSize: '0.72rem', fontWeight: 700,
                        }}
                      >
                        Approve to finish
                      </button>
                    )}

                    {e.error && !e.needsApproval && (
                      <div style={{ marginTop: '6px', fontSize: '0.66rem', color: '#ef4444', lineHeight: 1.45 }}>
                        {e.error}
                      </div>
                    )}

                    {e.execTxHash && (
                      <a href={`${EXPLORER}${e.execTxHash}`} target="_blank" rel="noreferrer"
                         style={{ marginTop: '6px', display: 'inline-block', fontSize: '0.68rem', color: '#0284c7', textDecoration: 'none' }}>
                        View settlement {short(e.execTxHash)}
                      </a>
                    )}

                    {/* The line above says what it waits for and when; a raw
                        elapsed-time counter only alarmed without explaining. */}
                  </div>
                );
              })}
            </div>

            <div style={{
              padding: '9px 14px', borderTop: `1px solid ${boxBorder}`,
              fontSize: '0.66rem', color: textMuted, lineHeight: 1.5,
            }}>
              Settles by itself, even with Soyara closed.
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SettlementQueue;
