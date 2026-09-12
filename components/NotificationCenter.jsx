// components/NotificationCenter.jsx
//
// One-line notices for everything that happens in the background, and a bell
// that keeps the recent ones. Backed by lib/notify.js (localStorage), so a
// trade that settles while the user is on another page or tab still reports.

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, CheckCircle2, AlertTriangle, Info, Loader2, X } from 'lucide-react';
import { useTheme } from './contexts/ThemeContext';
import { listNotices, subscribeNotices, dismissNotice, markAllRead, clearNotices } from '../lib/notify';
import { TONE } from '../lib/tone';

const KIND = {
  pending: { color: '#8b5cf6', Icon: Loader2, spin: true },
  success: { color: '#10b981', Icon: CheckCircle2 },
  error:   { color: TONE.attention.color, Icon: AlertTriangle },
  warning: { color: '#f59e0b', Icon: AlertTriangle },
  info:    { color: '#0284c7', Icon: Info },
};

function ago(ts) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 45) return 'now';
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

function useNotices() {
  const [list, setList] = useState([]);
  useEffect(() => {
    const sync = () => setList(listNotices());
    sync();
    return subscribeNotices(sync);
  }, []);
  return list;
}

function Row({ n, isDark, onDismiss, compact }) {
  const { color, Icon, spin } = KIND[n.kind] || KIND.info;
  const main = isDark ? '#f8fafc' : '#0f172a';
  const muted = isDark ? '#94a3b8' : '#64748b';
  const body = (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', minWidth: 0 }}>
      <Icon size={16} color={color} style={{ flexShrink: 0, marginTop: 1, ...(spin ? { animation: 'spin 1s linear infinite' } : null) }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 650, color: main, lineHeight: 1.35 }}>{n.title}</div>
        {n.body && <div style={{ fontSize: '0.72rem', color: muted, lineHeight: 1.4, marginTop: 2 }}>{n.body}</div>}
      </div>
      {!compact && <span style={{ fontSize: '0.66rem', color: muted, flexShrink: 0 }}>{ago(n.updatedAt)}</span>}
      {onDismiss && (
        <button type="button" onClick={() => onDismiss(n.id)} aria-label="Dismiss"
                style={{ background: 'none', border: 'none', color: muted, cursor: 'pointer', padding: 0, display: 'flex', flexShrink: 0 }}>
          <X size={13} />
        </button>
      )}
    </div>
  );
  return n.href
    ? <a href={n.href} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>{body}</a>
    : body;
}

/** Toasts, bottom right. Mounted once in _app. */
export function NotificationToasts() {
  const { theme } = useTheme();
  const isDark = theme !== 'light';
  const [shown, setShown] = useState([]); // notices currently on screen
  const seen = useRef(new Map());          // id -> updatedAt already shown
  const timers = useRef(new Map());

  useEffect(() => {
    const hide = (id) => {
      setShown((s) => s.filter((x) => x.id !== id));
      clearTimeout(timers.current.get(id));
      timers.current.delete(id);
    };
    const sync = () => {
      const now = Date.now();
      for (const n of listNotices()) {
        // Only what changed just now. Older notices live in the bell.
        if (now - n.updatedAt > 8000 || seen.current.get(n.id) === n.updatedAt) continue;
        seen.current.set(n.id, n.updatedAt);
        setShown((s) => [n, ...s.filter((x) => x.id !== n.id)].slice(0, 3));
        clearTimeout(timers.current.get(n.id));
        timers.current.set(n.id, setTimeout(() => hide(n.id), n.kind === 'error' ? 8000 : 5000));
      }
    };
    sync();
    const off = subscribeNotices(sync);
    return () => {
      off();
      for (const t of timers.current.values()) clearTimeout(t);
    };
  }, []);

  const bg = isDark ? 'rgba(15,23,42,0.96)' : '#ffffff';
  const border = isDark ? 'rgba(255,255,255,0.10)' : '#e2e8f0';

  return (
    <div style={{
      position: 'fixed', right: 16, bottom: 16, zIndex: 9999,
      display: 'flex', flexDirection: 'column', gap: 8, width: 'min(340px, calc(100vw - 32px))',
      pointerEvents: 'none',
    }}>
      <AnimatePresence initial={false}>
        {shown.map((n) => (
          <motion.div
            key={n.id}
            layout
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.18 }}
            style={{
              pointerEvents: 'auto', background: bg, border: `1px solid ${border}`,
              borderLeft: `3px solid ${(KIND[n.kind] || KIND.info).color}`,
              borderRadius: 12, padding: '10px 12px',
              boxShadow: isDark ? '0 10px 30px rgba(0,0,0,0.45)' : '0 10px 30px rgba(15,23,42,0.12)',
            }}
          >
            <Row n={n} isDark={isDark} compact onDismiss={(id) => setShown((s) => s.filter((x) => x.id !== id))} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/** The bell in the header: unread count, a pulse while something is running, and the history. */
export function NotificationBell({ className }) {
  const { theme } = useTheme();
  const isDark = theme !== 'light';
  const list = useNotices();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const unread = list.filter((n) => !n.read).length;
  const running = list.some((n) => n.kind === 'pending');
  const bg = isDark ? 'rgba(15,23,42,0.98)' : '#ffffff';
  const border = isDark ? 'rgba(255,255,255,0.10)' : '#e2e8f0';
  const muted = isDark ? '#94a3b8' : '#64748b';

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        className={className}
        aria-label="Notifications"
        title="Notifications"
        onClick={() => { setOpen((o) => !o); if (!open && unread) markAllRead(); }}
        style={{ position: 'relative' }}
      >
        <Bell size={17} />
        {(unread > 0 || running) && (
          <span style={{
            position: 'absolute', top: 3, right: 3, minWidth: 15, height: 15, padding: '0 4px',
            borderRadius: 999, fontSize: '0.6rem', fontWeight: 800, lineHeight: '15px', textAlign: 'center',
            // The count is not a warning: unread notices are brand-coloured,
            // and only the notice itself carries a tone.
            color: '#fff', background: '#8b5cf6',
            animation: running && !unread ? 'pulse 1.6s ease-in-out infinite' : undefined,
          }}>
            {unread > 0 ? (unread > 9 ? '9+' : unread) : ''}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 10000,
              width: 'min(360px, calc(100vw - 24px))', maxHeight: 420, overflowY: 'auto',
              background: bg, border: `1px solid ${border}`, borderRadius: 14, padding: 10,
              boxShadow: isDark ? '0 16px 40px rgba(0,0,0,0.5)' : '0 16px 40px rgba(15,23,42,0.14)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', padding: '2px 4px 8px' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: isDark ? '#f8fafc' : '#0f172a' }}>Notifications</span>
              {list.length > 0 && (
                <button type="button" onClick={clearNotices}
                        style={{ marginLeft: 'auto', background: 'none', border: 'none', color: muted, fontSize: '0.7rem', cursor: 'pointer' }}>
                  Clear
                </button>
              )}
            </div>
            {list.length === 0 ? (
              <div style={{ fontSize: '0.75rem', color: muted, padding: '14px 6px', textAlign: 'center' }}>Nothing yet</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {list.slice(0, 20).map((n) => (
                  <div key={n.id} style={{ padding: '8px 6px', borderRadius: 10, background: n.read ? 'transparent' : (isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc') }}>
                    <Row n={n} isDark={isDark} onDismiss={dismissNotice} />
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
