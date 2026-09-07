// components/A2A/AgentPlayground.jsx
//
// No-code agent-to-agent studio for /a2a/dev.
//
// Nothing here is mocked. Every control changes what the agents really do, and
// every message on the wire carries the actual payload one agent handed the
// next - live pool addresses and quotes, the real GenVM consensus transaction,
// and the one-time trade hash bound on AgentExecutor.
//
// Design intent: one decision on screen at a time. A dev picks a strategy and
// launches; the individual knobs exist but stay folded away until wanted.

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useAccount } from 'wagmi';
import {
  Play, Square, ChevronDown, ChevronRight, Coins, Check,
  MessageSquare, Cpu, ShieldCheck, Wrench, Loader2, AlertTriangle, Sliders,
  BarChart3, Gauge, Search,
} from 'lucide-react';
import { orchestrateSwarm, AGENT_REGISTRY, IntentAgent, RouterMathAgent } from '../../services/a2a/agents';
import styles from '../../styles/A2A.module.css';

const PROTOCOL_FEE_BPS = 5; // what AGGFlowEntrypoint actually charges

const PRESETS = ['Swap 50 USDC to USDT', 'Swap 0.05 GEN to USDC', 'Swap 100 USDT to USDC'];

// One click sets every parameter. These are real values handed to the agents.
const STRATEGIES = {
  // No venue setting: swaps always take the aggregator's best route. Pinning a
  // venue can only match or worsen the fill, so it is an outcome to display,
  // never a control to offer.
  safe: { label: 'Safe', hint: 'Tight slippage, small trades only', slippageBps: 50, maxImpactPct: 1 },
  balanced: { label: 'Balanced', hint: 'Sensible defaults for most orders', slippageBps: 100, maxImpactPct: 5 },
  aggressive: { label: 'Aggressive', hint: 'Will accept thin pools and impact', slippageBps: 300, maxImpactPct: 15 },
};

// Every agent that can speak needs a lane here, in the order the swarm runs
// them. A missing lane is not cosmetic: the timeline maps each frame onto a key
// and falls back to 'intent', so an agent without a lane has its findings filed
// under someone else's name.
const STEPS = [
  { key: 'intent', reg: AGENT_REGISTRY.intent, Icon: MessageSquare, short: 'Intent', does: 'Reads the order' },
  { key: 'router', reg: AGENT_REGISTRY.router, Icon: Cpu, short: 'Route', does: 'Quotes live pools' },
  { key: 'market', reg: AGENT_REGISTRY.market, Icon: BarChart3, short: 'Depth', does: 'Reads reserves' },
  { key: 'risk', reg: AGENT_REGISTRY.risk, Icon: ShieldCheck, short: 'Consensus', does: 'GenVM validates' },
  { key: 'settlement', reg: AGENT_REGISTRY.settlement, Icon: Gauge, short: 'Rail', does: 'Picks settlement' },
  { key: 'auditor', reg: AGENT_REGISTRY.auditor, Icon: Search, short: 'Bindings', does: 'Verifies on chain' },
  { key: 'dev', reg: AGENT_REGISTRY.dev, Icon: Wrench, short: 'Inspect', does: 'Checks calldata' },
];

const ACCENT = '#0ea5e9';

export default function AgentPlayground() {
  const { address: userAddress } = useAccount();

  const [prompt, setPrompt] = useState(PRESETS[0]);
  const [strategy, setStrategy] = useState('balanced');
  const [custom, setCustom] = useState(null);   // non-null once fine-tuned
  const [showTuning, setShowTuning] = useState(false);
  const [agentFeeBps, setAgentFeeBps] = useState(10);

  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);

  const [bus, setBus] = useState([]);
  const [running, setRunning] = useState(false);
  const [openMsg, setOpenMsg] = useState({});
  const [runs, setRuns] = useState([]);

  const abortRef = useRef(false);
  const endRef = useRef(null);

  const config = custom || STRATEGIES[strategy];

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [bus]);

  // ── Live preview: real parse + real quote, no LLM call, debounced ─────────
  useEffect(() => {
    let cancelled = false;
    if (!prompt.trim()) { setPreview(null); return undefined; }
    setPreviewing(true);
    const t = setTimeout(async () => {
      try {
        const intent = IntentAgent.parse(prompt, config);
        const route = await RouterMathAgent.simulateRoute(intent);
        if (!cancelled) setPreview({ intent, route });
      } catch {
        if (!cancelled) setPreview(null);
      } finally {
        if (!cancelled) setPreviewing(false);
      }
    }, 550);
    return () => { cancelled = true; clearTimeout(t); };
  }, [prompt, config]);

  // route.priceImpact is a formatted string ("50.060%"), not a number - Number()
  // returns NaN on it, which silently blanked the impact readout and disabled
  // the over-ceiling warning.
  const impact = preview ? parseFloat(preview.route.priceImpact) : null;
  const overCeiling = impact != null && Number.isFinite(impact) && impact > Number(config.maxImpactPct);
  const noPool = preview?.route?.isLiveQuote === false;

  const launch = useCallback(async () => {
    if (running || !prompt.trim()) return;
    abortRef.current = false;
    setBus([]);
    setRunning(true);
    const started = Date.now();
    try {
      const onProgress = (text, _meta) => {
        setBus((prev) => [...prev, {
          id: `p-${prev.length}`, key: 'risk', agent: AGENT_REGISTRY.risk,
          type: 'CONSENSUS_WAIT', text, status: 'working', data: null,
          at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        }]);
      };
      for await (const step of orchestrateSwarm(prompt, userAddress || '0x0000000000000000000000000000000000000000', { ...config, onProgress })) {
        if (abortRef.current) break;
        const key = Object.keys(AGENT_REGISTRY).find((k) => AGENT_REGISTRY[k].id === step.agent?.id) || 'intent';
        setBus((prev) => [...prev, {
          id: `${prev.length}-${step.type}`,
          key, agent: step.agent, type: step.type, text: step.text,
          status: step.status, data: step.data || step.payload || null,
          at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        }]);
        if (step.type === 'ROUTE_SIMULATED' && step.data) {
          const r = step.data;
          setRuns((prev) => [...prev, {
            pair: `${r.tokenIn?.symbol}/${r.tokenOut?.symbol}`,
            notional: Number(r.expectedOutNum) || 0,
            outSymbol: r.tokenOut?.symbol,
            live: r.isLiveQuote !== false,
            secs: (Date.now() - started) / 1000,
          }]);
        }
      }
    } catch (err) {
      setBus((prev) => [...prev, {
        id: `err-${prev.length}`, key: 'risk', agent: AGENT_REGISTRY.risk,
        type: 'ERROR', status: 'error', data: null,
        text: `Swarm error: ${err?.message || String(err)}`,
        at: new Date().toLocaleTimeString(),
      }]);
    } finally { setRunning(false); }
  }, [prompt, config, userAddress, running]);

  // Which pipeline steps have reported in
  const stepState = useMemo(() => {
    const st = {};
    for (const m of bus) {
      if (m.status === 'error') st[m.key] = 'error';
      else if (m.status === 'complete' || m.status === 'ready') st[m.key] = 'done';
      else if (!st[m.key]) st[m.key] = 'active';
    }
    return st;
  }, [bus]);

  const earnings = useMemo(() => {
    const live = runs.filter((r) => r.live);
    const volume = live.reduce((s, r) => s + r.notional, 0);
    return {
      trades: live.length, volume,
      protocol: (volume * PROTOCOL_FEE_BPS) / 10000,
      agent: (volume * agentFeeBps) / 10000,
      symbol: live[live.length - 1]?.outSymbol || '',
    };
  }, [runs, agentFeeBps]);

  const panel = {
    background: 'var(--card-bg, rgba(255,255,255,0.025))',
    border: '1px solid var(--border-color, rgba(255,255,255,0.08))',
    borderRadius: 14,
    padding: '1.1rem',
  };
  const muted = { opacity: 0.55 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>

      {/* ── Order + launch ─────────────────────────────────────────────────── */}
      <div style={panel}>
        <div style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 10 }}>What should the swarm do?</div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !running) launch(); }}
            placeholder="Swap 50 USDC to USDT"
            style={{
              flex: '1 1 320px', padding: '11px 13px', borderRadius: 10, fontSize: '0.9rem',
              background: 'var(--input-bg, rgba(0,0,0,0.22))',
              border: '1px solid var(--border-color, rgba(255,255,255,0.12))',
              color: 'var(--text-main, #fff)', fontFamily: 'inherit',
            }}
          />
          <button
            type="button"
            onClick={running ? () => { abortRef.current = true; } : launch}
            disabled={!prompt.trim() || noPool}
            style={{
              padding: '11px 22px', borderRadius: 10, border: 'none',
              cursor: (!prompt.trim() || noPool) ? 'not-allowed' : 'pointer',
              fontWeight: 700, fontSize: '0.88rem', color: '#fff',
              display: 'flex', alignItems: 'center', gap: 7,
              background: running ? '#ef4444' : (noPool ? 'rgba(255,255,255,0.12)' : ACCENT),
            }}
          >
            {running ? <><Square size={15} /> Stop</> : <><Play size={15} /> Launch</>}
          </button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 9 }}>
          {PRESETS.map((p) => (
            <button key={p} type="button" className={styles.chip} onClick={() => setPrompt(p)} style={{ fontSize: '0.68rem' }}>
              {p}
            </button>
          ))}
        </div>

        {/* Smart preview - real quote against live reserves */}
        <div style={{
          marginTop: 12, padding: '9px 12px', borderRadius: 9, fontSize: '0.78rem',
          background: noPool || overCeiling ? 'rgba(245,158,11,0.09)' : 'rgba(255,255,255,0.035)',
          border: `1px solid ${noPool || overCeiling ? 'rgba(245,158,11,0.3)' : 'transparent'}`,
          display: 'flex', alignItems: 'center', gap: 8, minHeight: 38,
        }}>
          {previewing ? (
            <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /><span style={muted}>Quoting live pools…</span></>
          ) : !preview ? (
            <span style={muted}>Type an order to see a live quote.</span>
          ) : noPool ? (
            <><AlertTriangle size={14} color="#f59e0b" />
              <span>No pool exists for <strong>{preview.route.tokenIn.symbol}/{preview.route.tokenOut.symbol}</strong> - this order cannot settle.</span></>
          ) : (
            <>
              <Check size={14} color={overCeiling ? '#f59e0b' : '#34d399'} />
              <span>
                <strong>{preview.intent.amountIn} {preview.route.tokenIn.symbol}</strong> →{' '}
                <strong>{preview.route.expectedOutNum.toFixed(6)} {preview.route.tokenOut.symbol}</strong>
                <span style={muted}> · impact {Number.isFinite(impact) ? `${impact.toFixed(2)}%` : 'n/a'} · {preview.route.chosenRoute}</span>
              </span>
              {overCeiling && (
                <span style={{ marginLeft: 'auto', color: '#f59e0b', fontWeight: 600, fontSize: '0.72rem' }}>
                  above your {config.maxImpactPct}% ceiling - the swarm will halt
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Strategy (one decision) + folded fine-tuning ───────────────────── */}
      <div style={panel}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: '0.95rem', fontWeight: 700 }}>Agent policy</div>
          <button
            type="button"
            onClick={() => setShowTuning((v) => !v)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: ACCENT, fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <Sliders size={12} /> {showTuning ? 'Hide' : 'Fine-tune'}
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {Object.entries(STRATEGIES).map(([k, s]) => {
            const active = !custom && strategy === k;
            return (
              <button
                key={k} type="button"
                onClick={() => { setStrategy(k); setCustom(null); }}
                style={{
                  flex: '1 1 150px', textAlign: 'left', padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                  background: active ? 'rgba(14,165,233,0.12)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${active ? ACCENT : 'var(--border-color, rgba(255,255,255,0.09))'}`,
                  color: 'inherit',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: 2 }}>{s.label}</div>
                <div style={{ ...muted, fontSize: '0.68rem', lineHeight: 1.35 }}>{s.hint}</div>
              </button>
            );
          })}
        </div>

        <div style={{ ...muted, fontSize: '0.7rem', marginTop: 9 }}>
          {config.slippageBps} bps slippage · best route via aggregator · halts above {config.maxImpactPct}% impact
          {custom && <em> · customised</em>}
        </div>

        {showTuning && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border-color, rgba(255,255,255,0.08))', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 16 }}>
            <Tune label="Slippage tolerance" value={`${config.slippageBps} bps`}
                  help="Validated by the IC and enforced on-chain. Max 300.">
              <input type="range" min={10} max={300} step={10} value={config.slippageBps}
                     onChange={(e) => setCustom({ ...config, slippageBps: Number(e.target.value) })}
                     style={{ width: '100%', accentColor: ACCENT }} />
            </Tune>
            <Tune label="Max price impact" value={`${config.maxImpactPct}%`}
                  help="Hard stop - the swarm halts before requesting consensus.">
              <input type="range" min={0.1} max={30} step={0.1} value={config.maxImpactPct}
                     onChange={(e) => setCustom({ ...config, maxImpactPct: Number(e.target.value) })}
                     style={{ width: '100%', accentColor: ACCENT }} />
            </Tune>

          </div>
        )}
      </div>

      {/* ── Pipeline ───────────────────────────────────────────────────────── */}
      <div style={{ ...panel, padding: '0.9rem 1.1rem' }}>
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 6, flexWrap: 'wrap' }}>
          {STEPS.map((s, i) => {
            const st = stepState[s.key];
            const on = st === 'done' ? '#34d399' : st === 'error' ? '#ef4444' : st === 'active' ? ACCENT : 'var(--text-muted, #64748b)';
            return (
              <React.Fragment key={s.key}>
                <div style={{ flex: '1 1 120px', display: 'flex', alignItems: 'center', gap: 8, opacity: st ? 1 : 0.42 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: st ? `${on}1f` : 'rgba(255,255,255,0.05)', color: on,
                  }}>
                    {st === 'active'
                      ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                      : st === 'done' ? <Check size={14} /> : <s.Icon size={14} />}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.76rem', fontWeight: 700 }}>{s.short}</div>
                    <div style={{ ...muted, fontSize: '0.64rem' }}>{s.does}</div>
                  </div>
                </div>
                {i < STEPS.length - 1 && <ChevronRight size={14} style={{ alignSelf: 'center', opacity: 0.22 }} />}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* ── Wire + economics ───────────────────────────────────────────────── */}
      <div className={styles.studioSplit}>
        <div style={{ ...panel, minHeight: 300 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: '0.95rem', fontWeight: 700 }}>Agent-to-agent wire</span>
            <span style={{ ...muted, fontSize: '0.68rem' }}>
              {running ? 'live' : bus.length ? `${bus.length} messages` : 'idle'}
            </span>
          </div>

          {bus.length === 0 && !running ? (
            <div style={{ ...muted, fontSize: '0.8rem', lineHeight: 1.65, padding: '1rem 0' }}>
              Launch to watch the agents negotiate. Each message can be expanded to reveal the exact
              payload handed to the next agent - live pool addresses, quoted amounts in wei, the GenVM
              consensus transaction hash, and the one-time trade hash bound on AgentExecutor.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 560, overflowY: 'auto' }}>
              {bus.map((m) => {
                const S = STEPS.find((x) => x.key === m.key);
                const Icon = S?.Icon || MessageSquare;
                const tone = m.status === 'error' ? '#ef4444' : (m.status === 'complete' || m.status === 'ready') ? '#34d399' : ACCENT;
                const open = openMsg[m.id];
                return (
                  <div key={m.id} style={{ borderLeft: `2px solid ${tone}`, paddingLeft: 11, paddingTop: 2, paddingBottom: 2 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
                      <Icon size={12} color={tone} />
                      <strong style={{ fontSize: '0.74rem' }}>{m.agent?.name}</strong>
                      <span style={{ ...muted, fontSize: '0.6rem', marginLeft: 'auto' }}>{m.at}</span>
                    </div>
                    <div style={{ fontSize: '0.78rem', lineHeight: 1.55, opacity: 0.9 }}
                         dangerouslySetInnerHTML={{ __html: mdLite(m.text) }} />
                    {m.data && (
                      <>
                        <button type="button" onClick={() => setOpenMsg((e) => ({ ...e, [m.id]: !e[m.id] }))}
                                style={{ marginTop: 5, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: tone, fontSize: '0.67rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
                          {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />} payload
                        </button>
                        {open && (
                          <pre style={{
                            marginTop: 5, marginBottom: 0, fontSize: '0.64rem', lineHeight: 1.5,
                            background: 'rgba(0,0,0,0.32)', padding: 9, borderRadius: 8,
                            overflowX: 'auto', maxHeight: 240, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                          }}>{safeJson(m.data)}</pre>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
              <div ref={endRef} />
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          <div style={panel}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
              <Coins size={15} color="#fbbf24" />
              <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>Earnings</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: 4 }}>
              <span style={muted}>Your fee</span><span style={muted}>{agentFeeBps} bps</span>
            </div>
            <input type="range" min={0} max={100} step={1} value={agentFeeBps}
                   onChange={(e) => setAgentFeeBps(Number(e.target.value))}
                   style={{ width: '100%', accentColor: '#fbbf24', marginBottom: 10 }} />
            <Row k="Trades" v={String(earnings.trades)} />
            <Row k="Volume" v={`${earnings.volume.toFixed(4)} ${earnings.symbol}`} />
            <Row k={`Protocol (${PROTOCOL_FEE_BPS} bps)`} v={`${earnings.protocol.toFixed(6)}`} />
            <Row k="You earn" v={`${earnings.agent.toFixed(6)} ${earnings.symbol}`} accent="#fbbf24" />
            <div style={{ ...muted, fontSize: '0.64rem', marginTop: 9, lineHeight: 1.5 }}>
              From real routed volume this session. The {PROTOCOL_FEE_BPS} bps protocol fee is live;
              your agent fee is a model - collecting it needs a fee split in the settlement contract.
            </div>
          </div>

          <div style={{ ...panel, background: 'rgba(245,158,11,0.05)', borderColor: 'rgba(245,158,11,0.25)' }}>
            <div style={{ display: 'flex', gap: 7, fontSize: '0.7rem', lineHeight: 1.55, opacity: 0.9 }}>
              <AlertTriangle size={13} color="#f59e0b" style={{ flexShrink: 0, marginTop: 2 }} />
              <span>Each launch places a real GenVM consensus transaction. Rounds take about a minute
                and sometimes time out on the validator set - that is the network, not your policy.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Tune({ label, value, help, children }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.73rem', marginBottom: 5 }}>
        <span style={{ opacity: 0.85 }}>{label}</span>
        <strong style={{ opacity: 0.7 }}>{value}</strong>
      </div>
      {children}
      <div style={{ opacity: 0.45, fontSize: '0.64rem', marginTop: 4, lineHeight: 1.4 }}>{help}</div>
    </div>
  );
}

function Row({ k, v, accent }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '3px 0', fontSize: '0.75rem' }}>
      <span style={{ opacity: 0.6 }}>{k}</span>
      <strong style={{ color: accent || 'inherit' }}>{v}</strong>
    </div>
  );
}

/** Minimal **bold** / `code` renderer. Text is agent-authored, and escaped first. */
function mdLite(t) {
  return String(t || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code style="background:rgba(0,0,0,.3);padding:1px 4px;border-radius:3px;font-size:.92em">$1</code>');
}

/** BigInt-safe JSON - payloads carry wei values. */
function safeJson(d) {
  try {
    return JSON.stringify(d, (_k, v) => (typeof v === 'bigint' ? `${v.toString()} (bigint)` : v), 2);
  } catch { return String(d); }
}
