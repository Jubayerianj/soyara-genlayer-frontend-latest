// components/ActivityPanel.jsx
//
// "Recent activity" list backed by lib/txStore (localStorage), shown on /ai and
// /a2a. Its job is to answer the question a user has after closing the tab
// mid-round: did my trade go through?
//
// On mount it re-polls anything still pending, so a consensus round that
// completed while the page was closed resolves the moment you come back.

import React, { useEffect, useState, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { ExternalLink, Loader2, CheckCircle2, XCircle, AlertTriangle, Trash2, History } from 'lucide-react';
import { listActivity, resumePending, clearActivity } from '../lib/txStore';

const STATUS = {
  pending: { icon: Loader2, color: '#38bdf8', label: 'Awaiting consensus', spin: true },
  approved: { icon: CheckCircle2, color: '#34d399', label: 'Approved' },
  settled: { icon: CheckCircle2, color: '#34d399', label: 'Settled' },
  rejected: { icon: XCircle, color: '#ef4444', label: 'Rejected' },
  undecided: { icon: AlertTriangle, color: '#f59e0b', label: 'No majority - retryable' },
  failed: { icon: XCircle, color: '#ef4444', label: 'Failed' },
};

function ago(ts) {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function ActivityPanel({ isDark = true, limit = 6 }) {
  const { address } = useAccount();
  const [entries, setEntries] = useState([]);
  const [resuming, setResuming] = useState(false);

  const refresh = useCallback(() => setEntries(listActivity(address)), [address]);

  useEffect(() => {
    refresh();
    let cancelled = false;
    // Resolve anything that finished while the page was closed.
    setResuming(true);
    resumePending(address, (next) => { if (!cancelled) setEntries(next); })
      .then((next) => { if (!cancelled) setEntries(next); })
      .finally(() => { if (!cancelled) setResuming(false); });
    return () => { cancelled = true; };
  }, [address, refresh]);

  // Keep relative timestamps honest without re-reading storage constantly.
  useEffect(() => {
    const id = setInterval(refresh, 15000);
    return () => clearInterval(id);
  }, [refresh]);

  if (entries.length === 0) return null;

  const border = isDark ? 'rgba(255,255,255,0.10)' : '#e2e8f0';
  const muted = isDark ? 'rgba(255,255,255,0.55)' : '#64748b';

  return (
    <div style={{ border: `1px solid ${border}`, borderRadius: 12, padding: '0.85rem 0.95rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 9 }}>
        <History size={14} color={muted} />
        <strong style={{ fontSize: '0.82rem' }}>Recent activity</strong>
        {resuming && <Loader2 size={11} style={{ animation: 'spin 1s linear infinite', opacity: 0.6 }} />}
        <button
          type="button"
          onClick={() => { clearActivity(); refresh(); }}
          title="Clear history stored in this browser"
          style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: muted, padding: 2, display: 'flex' }}
        >
          <Trash2 size={12} />
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {entries.slice(0, limit).map((e) => {
          const s = STATUS[e.status] || STATUS.pending;
          const Icon = s.icon;
          return (
            <div key={e.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <Icon
                size={13}
                color={s.color}
                style={{ marginTop: 2, flexShrink: 0, ...(s.spin ? { animation: 'spin 1s linear infinite' } : {}) }}
              />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '0.76rem', fontWeight: 600 }}>
                  {e.label || `${e.kind === 'liquidity' ? 'Add liquidity' : 'Swap'}${e.pair ? ` · ${e.pair}` : ''}`}
                </div>
                <div style={{ fontSize: '0.68rem', color: muted, lineHeight: 1.4 }}>
                  <span style={{ color: s.color }}>{s.label}</span>
                  {e.statusName && e.status === 'pending' && <> · {e.statusName}</>}
                  {' · '}{ago(e.createdAt)}
                </div>
              </div>
              {(e.settleTxHash || e.txHash) && (
                <a
                  href={`https://explorer-bradbury.genlayer.com/tx/${e.settleTxHash || e.txHash}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ color: muted, display: 'flex', marginTop: 2 }}
                  title="View on explorer"
                >
                  <ExternalLink size={11} />
                </a>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: '0.63rem', color: muted, marginTop: 9, lineHeight: 1.45 }}>
        Stored in this browser only. Rounds still running are re-checked automatically when you
        return, so you can close the page mid-consensus without losing track of a trade.
      </div>
    </div>
  );
}
