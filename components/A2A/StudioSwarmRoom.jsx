// components/A2A/StudioSwarmRoom.jsx
//
// The trader swarm on GenLayer Studio Next.
//
// Same agents and the same two cards as SwarmWarRoom, driving
// services/a2a/studioSwarm.js against SoyaraAgentDex. The agents deliberate
// first; the consensus round runs when the user presses Execute, because on
// Studio Next that round is the settlement and the user's wallet (or, inside a
// mandate, the user's agent key) signs it.
//
// The trade surfaces' rules hold here too: the trade, one status line, the
// action, and everything else behind Details. Nothing is red (lib/tone.js).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAccount } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { Zap, ShieldCheck, Play, RotateCcw, Loader2, User, Bot, ExternalLink, Coins } from 'lucide-react';
import { formatGen } from '@genlayer/transaction-kit-react';

import { AGENT_REGISTRY, POOLS_URL } from '../../services/a2a/agents';
import { orchestrateStudioSwarm, executeStudioPlan, receiptLine } from '../../services/a2a/studioSwarm';
import * as studio from '../../lib/studioNext/client';
import { STUDIO_NEXT } from '../../constants/studioNext';
import { PoolsHandoffPanel } from './SwarmPanels';
import { TONE } from '../../lib/tone';
import { notify } from '../../lib/notify';
import styles from '../../styles/A2A.module.css';

const PRESET_CHIPS = [
  { label: '25 USDC to USDT', query: 'Swap 25 USDC to USDT' },
  { label: 'Agent mandate', query: 'Let my agent swap up to 60 USDC into USDT, 20 per trade, for an hour' },
  { label: 'Too big for the market', query: 'Swap 400 USDC to ETH' },
  { label: 'ETH to USDC', query: 'Swap 0.01 ETH to USDC' },
];

const clock = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const pct = (bps) => `${(Number(bps) / 100).toFixed(2)}%`;
const declined = (e) => e?.code === 4001 || /user rejected|user denied|rejected the request/i.test(String(e?.message || e?.shortMessage || ''));

/** **bold** without innerHTML: frame text can carry what the user typed. */
function Rich({ text }) {
  return String(text || '').split(/(\*\*[^*]+\*\*)/g).map((part, i) => (
    part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : <React.Fragment key={i}>{part}</React.Fragment>
  ));
}

function Row({ label, children }) {
  return (
    <div className={styles.statRow}>
      <span>{label}</span>
      <span className={styles.statVal}>{children}</span>
    </div>
  );
}

export default function StudioSwarmRoom() {
  const { address, isConnected, connector } = useAccount();
  const { openConnectModal } = useConnectModal();

  const [prompt, setPrompt] = useState('');
  const [timeline, setTimeline] = useState([
    { agent: AGENT_REGISTRY.intent, text: 'Swarm on Studio Next. Say a trade, or tap a preset.', time: 'Ready' },
  ]);
  const [isRunning, setIsRunning] = useState(false);
  const [liveStatus, setLiveStatus] = useState(null);
  const [payload, setPayload] = useState(null);
  const [handoff, setHandoff] = useState(false);
  // null | { state: 'running' } | { state: 'done' | 'refused', result } | { state: 'error', text }
  const [exec, setExec] = useState(null);
  const [desk, setDesk] = useState(null);
  const [funding, setFunding] = useState(null);
  const scrollRef = useRef(null);

  const agent = useMemo(() => (address ? studio.sessionAgent(address) : null), [address]);

  const push = useCallback((agentMeta, text, time = clock()) => {
    setTimeline((prev) => [...prev, { agent: agentMeta, text, time }]);
  }, []);

  useEffect(() => {
    const box = scrollRef.current?.parentElement;
    if (box) box.scrollTo({ top: box.scrollHeight, behavior: 'smooth' });
  }, [timeline, isRunning, liveStatus]);

  // One contract read (get_desk): Studio Next allows 30 a minute per client.
  const refreshDesk = useCallback(async () => {
    if (!address) { setDesk(null); return; }
    try { setDesk(await studio.view('get_desk', [address, 6])); } catch { /* keep the last one */ }
  }, [address]);
  useEffect(() => { refreshDesk(); }, [refreshDesk]);

  const handleRun = async (q) => {
    const text = (typeof q === 'string' && q) || prompt;
    if (!text.trim() || isRunning || exec?.state === 'running') return;
    setPrompt('');
    setPayload(null);
    setHandoff(false);
    setExec(null);
    setIsRunning(true);
    setTimeline((prev) => [...prev, { isUser: true, text, time: clock() }]);
    try {
      const run = orchestrateStudioSwarm(text, { user: address || null, agentAddress: agent?.address || null });
      for await (const step of run) {
        if (step.type === 'MESSAGE') { setLiveStatus({ agent: step.agent, text: step.text }); continue; }
        if (step.type === 'REDIRECTED') setHandoff(true);
        if (step.payload) setPayload(step.payload);
        push(step.agent, step.text);
      }
    } catch (err) {
      push(AGENT_REGISTRY.risk, `Could not finish: ${String(err?.shortMessage || err?.message || err).split('\n')[0].slice(0, 90)}`, 'Note');
    } finally {
      setLiveStatus(null);
      setIsRunning(false);
    }
  };

  const handleExecute = async () => {
    if (!payload || payload.blocked || exec?.state === 'running') return;
    if (!isConnected || !address) { openConnectModal?.(); return; }
    setExec({ state: 'running' });
    const rail = payload.rail;
    const signer = rail === 'mandate' ? AGENT_REGISTRY.settlement : AGENT_REGISTRY.risk;
    try {
      let kit = null;
      if (rail !== 'mandate') {
        setLiveStatus({ agent: signer, text: 'Preparing your wallet' });
        kit = await studio.userKitFromConnector(connector, address);
      }
      if (rail !== 'consensus') await studio.ensureGas(agent.address);
      const result = await executeStudioPlan({
        payload, kit, agent, user: address,
        onStep: (s) => {
          if (s.step === 'sign') setLiveStatus({ agent: signer, text: `Sign in your wallet · deposit ${formatGen(s.quote.feeValue)} GEN, refunded when final` });
          if (s.step === 'submitted') setLiveStatus({ agent: AGENT_REGISTRY.risk, text: rail === 'mandate-grant' ? 'Validators checking the market and your words' : 'Validators reading the Bradbury pool' });
          if (s.step === 'agent') setLiveStatus({ agent: AGENT_REGISTRY.settlement, text: 'Your agent is settling it' });
        },
      });
      const v = result.verdict;
      const href = studio.txUrl(result.txId);
      if (!v) {
        push(AGENT_REGISTRY.risk, 'The round ended without a result. Nothing moved. Run it again.');
        setExec({ state: 'error', text: 'Round ended without a result. Nothing moved.', href });
      } else if (v.approved) {
        const line = payload.kind === 'mandate'
          ? `✓ Mandate live · ${payload.intent.budget} ${payload.intent.tokenIn} → ${payload.intent.tokenOut} · ${payload.intent.cap} per trade`
          : `✓ Settled · ${studio.fmt(v.amount_in)} ${v.token_in} → ${studio.fmt(v.amount_out)} ${v.token_out} · ${pct(result.audit?.underMarketBps ?? 0)} under market · ${result.seconds}s`;
        push(rail === 'mandate' ? AGENT_REGISTRY.settlement : AGENT_REGISTRY.risk, line);
        const receipt = receiptLine({ payload, result });
        if (receipt) push(AGENT_REGISTRY.auditor, receipt, 'Audit');
        notify({ id: `studio:${result.rid}`, kind: 'success', title: line.replace('✓ ', '').split(' · ').slice(0, 2).join(' · '), body: 'Studio Next swarm', href });
        setExec({ state: 'done', result, href });
      } else {
        push(AGENT_REGISTRY.risk, `Not ${payload.kind === 'mandate' ? 'granted' : 'settled'} · ${v.reason}`);
        notify({ id: `studio:${result.rid}`, kind: 'warning', title: `Not settled · ${v.reason}`.slice(0, 90), body: 'Studio Next swarm', href });
        setExec({ state: 'refused', result, href });
      }
      refreshDesk();
    } catch (err) {
      const text = declined(err)
        ? 'Wallet request declined. Nothing was sent.'
        : `Could not send · ${String(err?.shortMessage || err?.message || err).split('\n')[0].slice(0, 80)}`;
      push(AGENT_REGISTRY.risk, text);
      setExec({ state: 'error', text });
    } finally {
      setLiveStatus(null);
    }
  };

  const getFunds = async () => {
    if (!isConnected || !address) { openConnectModal?.(); return; }
    setFunding('running');
    try {
      const res = await studio.claimTestFunds(address, agent);
      setFunding(res.ok ? 'done' : 'cooldown');
      if (res.ok) push(AGENT_REGISTRY.intent, '✓ Funded · 1,000 USDC · 1,000 USDT · 0.25 ETH · 2 WGEN');
      refreshDesk();
    } catch {
      setFunding('error');
    }
  };

  // ── render ────────────────────────────────────────────────────────────────

  const running = exec?.state === 'running';
  const settled = exec?.state === 'done';
  const high = (payload?.concerns || []).find((c) => c.severity === 'high');
  const statusText = (() => {
    if (!payload) return null;
    if (running) return 'Running';
    if (settled) return payload.kind === 'mandate' ? 'Mandate live' : 'Settled';
    if (exec?.state === 'refused') return payload.kind === 'mandate' ? 'Not granted · nothing moved' : 'Not settled · nothing moved';
    if (payload.blocked) return 'Stopped · nothing sent';
    if (payload.rail === 'mandate') return 'Ready · your agent, no popup';
    if (payload.rail === 'mandate-grant') return 'Ready · you sign once';
    return 'Ready · you sign';
  })();
  const statusTone = settled ? TONE.ok : (payload?.blocked || exec?.state === 'refused' || exec?.state === 'error') ? TONE.attention : running ? TONE.running : TONE.muted;
  const executeLabel = !isConnected
    ? 'Connect wallet'
    : payload?.rail === 'mandate' ? 'Execute with your agent'
      : payload?.rail === 'mandate-grant' ? 'Sign mandate'
        : 'Execute';
  const balances = desk?.balances;
  const activeMandate = (desk?.mandates || []).find((m) => m.status === 'active');

  return (
    <div className={styles.swarmGrid}>
      <div className={styles.cardBox}>
        <div className={styles.cardHeader}>
          <div className={styles.cardTitleText}>
            <Zap size={16} color="var(--blue-primary, #0284c7)" />
            <span>Dialogue</span>
          </div>
          <button onClick={() => setTimeline([])} className={styles.chip} type="button">
            <RotateCcw size={11} style={{ display: 'inline', marginRight: '3px' }} /> Clear
          </button>
        </div>

        <div className={styles.chipsBar}>
          {PRESET_CHIPS.map((c) => (
            <button key={c.label} type="button" className={styles.chip} onClick={() => handleRun(c.query)} disabled={isRunning || running}>
              {c.label}
            </button>
          ))}
        </div>

        <form className={styles.quickInputWrap} onSubmit={(e) => { e.preventDefault(); handleRun(); }}>
          <input
            id="studio-swarm-intent"
            className={styles.quickInput}
            placeholder="Swap 25 USDC to USDT, or let my agent trade up to 60 USDC"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={isRunning || running}
          />
          <button type="submit" className={styles.runBtn} disabled={isRunning || running || !prompt.trim()}>
            <Play size={14} /> Run
          </button>
        </form>

        <div className={styles.timelineFeed}>
          {timeline.map((item, idx) => (
            <div key={idx} className={styles.timelineItem}>
              <div
                className={styles.timelineAvatar}
                style={{
                  background: item.isUser ? 'var(--blue-glow, rgba(2, 132, 199, 0.15))' : `${item.agent?.color}20`,
                  color: item.isUser ? 'var(--blue-primary, #0284c7)' : item.agent?.color,
                }}
              >
                {item.isUser ? <User size={13} /> : <Bot size={13} />}
              </div>
              <div className={styles.timelineBody}>
                <div className={styles.timelineHeader}>
                  <span className={styles.timelineName} style={{ color: item.isUser ? 'var(--blue-primary, #0284c7)' : item.agent?.color }}>
                    {item.isUser ? 'You' : item.agent?.name}
                  </span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted, #94a3b8)' }}>{item.time}</span>
                </div>
                <div className={styles.timelineText}><Rich text={item.text} /></div>
              </div>
            </div>
          ))}
          {(isRunning || running) && (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '0.8rem', color: 'var(--text-muted, #94a3b8)', padding: '0.4rem' }}>
              <div className={styles.agentDotWorking} />
              <span>
                {liveStatus
                  ? <><strong style={{ color: liveStatus.agent?.color }}>{liveStatus.agent?.name}</strong> · {liveStatus.text}</>
                  : 'Working'}
              </span>
            </div>
          )}
          <div ref={scrollRef} />
        </div>
      </div>

      <div className={styles.cardBox}>
        <div className={styles.cardHeader}>
          <div className={styles.cardTitleText}>
            <ShieldCheck size={16} color="#10b981" />
            <span>Settlement</span>
          </div>
          <a
            href={studio.addressUrl(STUDIO_NEXT.dex)}
            target="_blank"
            rel="noreferrer"
            className={styles.chip}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}
          >
            SoyaraAgentDex {studio.short(STUDIO_NEXT.dex)} <ExternalLink size={10} />
          </a>
        </div>

        {payload ? (
          <div className={styles.summaryBox}>
            <div style={{
              padding: '0.65rem 0.75rem',
              background: 'var(--blue-glow, rgba(2, 132, 199, 0.08))',
              borderRadius: '0.5rem',
              border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.1))',
            }}>
              <div style={{ fontSize: '0.98rem', fontWeight: 750, color: 'var(--text-main, #ffffff)' }}>
                {payload.kind === 'mandate'
                  ? `Agent mandate · ${payload.intent.budget} ${payload.intent.tokenIn} → ${payload.intent.tokenOut}`
                  : `${payload.intent.amount} ${payload.intent.tokenIn} → ~${studio.fmt(payload.amountOut)} ${payload.intent.tokenOut}`}
              </div>
              <div style={{ fontSize: '0.71rem', color: 'var(--text-muted, #94a3b8)', marginTop: '3px', lineHeight: 1.5 }}>
                {payload.kind === 'mandate'
                  ? `${payload.intent.cap} per trade · ${payload.intent.minutes} min · worst ${pct(payload.intent.slippageBps)} under market`
                  : `At least ${studio.fmt(payload.minOut)} ${payload.intent.tokenOut} · slippage ${pct(payload.intent.slippageBps)} · ${payload.quote.pair} pool on Studio Next`}
              </div>
            </div>

            {(payload.blocked || high) && !settled && (
              <div style={{
                padding: '0.6rem 0.75rem', borderRadius: '0.5rem',
                background: TONE.attention.bg, border: `1px solid ${TONE.attention.border}`,
                fontSize: '0.74rem', lineHeight: 1.55, color: 'var(--text-sub, #cbd5e1)',
              }}>
                {payload.blocked || high.text}
              </div>
            )}

            <div className={styles.statRow}>
              <span>Status</span>
              <span className={styles.statVal} style={{ color: statusTone.color, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                {running && <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />}
                {statusText}
                {exec?.href && (
                  <a href={exec.href} target="_blank" rel="noreferrer" style={{ color: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                    Tx <ExternalLink size={10} />
                  </a>
                )}
              </span>
            </div>

            <details style={{ fontSize: '0.78rem' }}>
              <summary style={{ cursor: 'pointer', color: 'var(--text-muted, #94a3b8)', fontWeight: 600, padding: '2px 0' }}>
                Details
              </summary>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', marginTop: '0.6rem' }}>
                {payload.check && (
                  <>
                    <Row label="Live Bradbury price">{studio.fmt(payload.check.marketPrice, 6)} {payload.intent.tokenOut}</Row>
                    <Row label="Pool vs market">{payload.check.driftBps <= 1 ? 'agrees' : `${pct(payload.check.driftBps)} off${payload.check.reanchors ? ', re-anchored first' : ''}`}</Row>
                    <Row label={payload.kind === 'mandate' ? 'Cap vs market' : 'Order vs market'}>{payload.check.shareBps < 1 ? '<0.01%' : pct(payload.check.shareBps)} · max {studio.fmt(payload.check.maxAmountIn)} {payload.intent.tokenIn}</Row>
                  </>
                )}
                {payload.pool && (
                  <Row label="Bradbury market">
                    <a href={`${STUDIO_NEXT.bradburyExplorer}/address/${payload.pool.market}`} target="_blank" rel="noreferrer" style={{ color: 'var(--blue-primary, #0284c7)' }}>
                      {payload.pool.pair} {studio.short(payload.pool.market)}
                    </a>
                  </Row>
                )}
                {payload.preflight.map((c) => (
                  <Row key={c.name} label={c.name}>
                    <span style={{ color: c.passed ? TONE.ok.color : TONE.attention.color }}>{c.passed ? 'yes' : 'no'}</span>
                  </Row>
                ))}
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted, #94a3b8)', marginBottom: '3px' }}>Contract call</div>
                  <div className={styles.hashBoxMini}>{payload.dev.method}({payload.dev.args.join(', ')})</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted, #94a3b8)' }}>Refused by the contract</div>
                  {payload.dev.tamperVectors.map((t) => (
                    <div key={t.param} style={{ fontSize: '0.72rem', color: 'var(--text-sub, #cbd5e1)' }}>
                      <code>{t.param}</code> {t.tampered}: {t.refused}
                    </div>
                  ))}
                </div>
                {exec?.result?.rid && <Row label="Request id"><span style={{ fontFamily: 'monospace' }}>{studio.short(exec.result.rid)}</span></Row>}
              </div>
            </details>

            {!settled && (
              <button
                type="button"
                onClick={isConnected ? handleExecute : () => openConnectModal?.()}
                disabled={Boolean(payload.blocked) || running || isRunning}
                className={styles.executeBtn}
              >
                {running ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Zap size={16} />}
                {payload.blocked ? 'Stopped' : running ? 'Running' : executeLabel}
              </button>
            )}

            {exec?.state === 'error' && (
              <div style={{ padding: '0.5rem 0.75rem', background: TONE.attention.bg, border: `1px solid ${TONE.attention.border}`, borderRadius: '0.5rem', color: TONE.attention.color, fontSize: '0.8rem', fontWeight: 600 }}>
                {exec.text}
              </div>
            )}
          </div>
        ) : handoff ? (
          <div style={{ padding: '0.5rem' }}>
            <PoolsHandoffPanel url={POOLS_URL} />
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-muted, #94a3b8)', fontSize: '0.85rem' }}>
            Run a trade to see it here.
          </div>
        )}

        <div style={{ borderTop: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))', marginTop: '0.9rem', paddingTop: '0.7rem', display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.74rem', color: 'var(--text-muted, #94a3b8)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <span>
              {balances
                ? STUDIO_NEXT.tokens.map((s) => `${studio.fmt(balances[s], 2)} ${s}`).join(' · ')
                : isConnected ? 'Reading balances' : 'Connect a wallet to trade on Studio Next'}
            </span>
            <button
              type="button"
              onClick={getFunds}
              disabled={funding === 'running'}
              style={{ background: 'none', border: 'none', padding: 0, color: 'var(--blue-primary, #0284c7)', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.74rem' }}
            >
              {funding === 'running' ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Coins size={11} />}
              {funding === 'cooldown' ? 'Faucet used this hour' : 'Get test funds'}
            </button>
          </div>
          {activeMandate && (
            <span>
              Agent mandate: {studio.fmt(activeMandate.remaining)} of {studio.fmt(activeMandate.budget)} {activeMandate.token_in} → {activeMandate.token_out} left · {studio.fmt(activeMandate.per_trade_cap)} per trade
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
