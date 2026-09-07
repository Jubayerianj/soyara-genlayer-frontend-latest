// components/A2A/SwarmPanels.jsx
// ============================================================================
//  Panels for the three working agents added to the swarm.
//
//  Each one shows a fact read from the chain during the run. None of them
//  restate the quote: the summary above already says what the trade is, and a
//  panel that only repeats it in different words is noise on a screen the user
//  is trying to make a decision on.
// ============================================================================

import React from 'react';
import { BarChart3, Gauge, ShieldCheck, AlertTriangle, Check, X, ExternalLink } from 'lucide-react';

const card = (accent) => ({
  padding: '0.65rem 0.75rem',
  borderRadius: '0.5rem',
  background: `${accent}12`,
  border: `1px solid ${accent}40`,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.4rem',
});
const title = (accent) => ({
  display: 'flex', alignItems: 'center', gap: '6px',
  fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.04em',
  textTransform: 'uppercase', color: accent,
});
const body = { fontSize: '0.72rem', lineHeight: 1.55, color: 'var(--text-sub, #cbd5e1)' };

const DEPTH_TONE = {
  deep: { tone: '#10b981', words: 'Deep' },
  comfortable: { tone: '#38bdf8', words: 'Comfortable' },
  thin: { tone: '#f59e0b', words: 'Thin, this order moves the price' },
  dominant: { tone: '#ef4444', words: 'Dominant, a large share of the pool' },
  unknown: { tone: '#94a3b8', words: 'Unverified, no pool could be read' },
};

/**
 * What the pools behind the quote actually hold.
 *
 * Reserves are shown in token units only. There is no price oracle in this app,
 * so any dollar figure here would be invented - and an invented "TVL ~$1,420,000"
 * is exactly the kind of number a user reasonably believes.
 */
export function MarketReadPanel({ analysis, route }) {
  if (!analysis) return null;
  const d = DEPTH_TONE[analysis.depthLabel] || DEPTH_TONE.unknown;
  const highs = (analysis.concerns || []).filter((c) => c.severity === 'high');

  return (
    <div style={card(d.tone)}>
      <div style={title(d.tone)}><BarChart3 size={12} /> Market read</div>

      {analysis.entryReserveHuman && (
        <div style={body}>
          {/* Labelled with the pool's own tokens. On a multi-hop route the entry
              pool holds the intermediate token, not the one being bought, and
              printing the output symbol there stated a wrong fact about a pool. */}
          <strong>{analysis.entryPairLabel}</strong> holds{' '}
          <strong>{Number(analysis.entryReserveHuman).toLocaleString(undefined, { maximumFractionDigits: 4 })} {analysis.entrySymbol}</strong>
          {' / '}
          <strong>{Number(analysis.exitReserveHuman).toLocaleString(undefined, { maximumFractionDigits: 4 })} {analysis.exitSymbol}</strong>
          {analysis.poolCount > 1 ? `, the first of ${analysis.poolCount} pools on this path` : ''}.
        </div>
      )}

      <div style={{ ...body, color: d.tone, fontWeight: 700 }}>
        {analysis.sizeVsDepthPct != null
          ? `${analysis.sizeVsDepthPct.toFixed(2)}% of the ${analysis.entrySymbol} side. ${d.words}.`
          : d.words + '.'}
      </div>

      {analysis.venueSpreadPct != null && analysis.venueSpreadPct > 25 && (
        <div style={{ ...body, color: '#ef4444' }}>
          V2 and V3 disagree by <strong>{analysis.venueSpreadPct.toFixed(1)}%</strong>. A mispricing, not a better route.
        </div>
      )}

      {highs.map((c, i) => (
        <div key={i} style={{ ...body, display: 'flex', gap: '5px', alignItems: 'flex-start', color: '#fca5a5' }}>
          <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: '2px' }} />
          <span dangerouslySetInnerHTML={{ __html: c.text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
        </div>
      ))}
    </div>
  );
}

const RAIL = {
  reuse: { tone: '#10b981', label: 'Verdict reuse' },
  attestor: { tone: '#a78bfa', label: 'Attestor quorum' },
  consensus: { tone: '#f59e0b', label: 'Appeal window' },
  blocked: { tone: '#ef4444', label: 'Blocked' },
  unknown: { tone: '#94a3b8', label: 'Unknown' },
};

/**
 * Which rail will carry the verdict, and how long it has.
 *
 * The three rails differ by nearly three orders of magnitude in latency, and
 * the user was previously given no way to tell which one they were on - so a
 * two-second settlement and a forty-minute one looked identical while waiting.
 */
export function SettlementRailPanel({ strategy }) {
  if (!strategy) return null;
  const r = RAIL[strategy.rail] || RAIL.unknown;
  const mins = strategy.secondsToExpiry > 0 ? Math.round(strategy.secondsToExpiry / 60) : null;

  return (
    <div style={card(r.tone)}>
      <div style={title(r.tone)}><Gauge size={12} /> Settlement rail</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 800, color: r.tone }}>{r.label}</span>
        {strategy.eta && (
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted, #94a3b8)' }}>{strategy.eta}</span>
        )}
      </div>
      <div style={body}>{strategy.rationale}</div>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', fontSize: '0.66rem', color: 'var(--text-muted, #94a3b8)' }}>
        {strategy.attestorThreshold > 0 && <span>Attestor threshold {strategy.attestorThreshold}-of-N</span>}
        {mins != null && <span>Verdict valid {mins} min</span>}
        {strategy.secondsToDeadline > 0 && <span>Order valid {Math.round(strategy.secondsToDeadline / 60)} min</span>}
        {strategy.paused && <span style={{ color: '#ef4444' }}>Executor paused</span>}
      </div>
    </div>
  );
}

/**
 * The bindings, verified against the deployed executor.
 *
 * This is the answer to the question that started this work: the verdict is not
 * enforced by a privileged settlement agent, it is enforced by the contract,
 * and the commitment it enforces covers the route, the fee, the fee collector,
 * the recipient and the post-validation quote. The panel proves it per trade by
 * asking the executor to re-derive the commitment from the order, rather than
 * asserting it in a document.
 */
export function BindingsPanel({ audit }) {
  if (!audit?.checks?.length) return null;
  const allPass = audit.passed;
  const tone = allPass ? '#10b981' : audit.allBound ? '#f59e0b' : '#ef4444';

  return (
    <div style={card(tone)}>
      <div style={title(tone)}>
        <ShieldCheck size={12} /> Bindings
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        {audit.checks.map((c, i) => (
          <div key={i} style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', fontSize: '0.7rem', lineHeight: 1.45 }}>
            {c.passed
              ? <Check size={12} color="#10b981" style={{ flexShrink: 0, marginTop: '2px' }} />
              : <X size={12} color="#ef4444" style={{ flexShrink: 0, marginTop: '2px' }} />}
            <span style={{ color: 'var(--text-sub, #cbd5e1)' }}>
              <strong style={{ color: c.passed ? 'var(--text-main, #fff)' : '#fca5a5' }}>{c.name}</strong>
              {' - '}{c.detail}
            </span>
          </div>
        ))}
      </div>
      {audit.onChainCommitment && (
        <div style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: 'var(--text-muted, #94a3b8)', wordBreak: 'break-all' }}>
          executor.getSwapCommitment(order) = {audit.onChainCommitment}
        </div>
      )}
    </div>
  );
}

/**
 * What the settled transaction actually delivered.
 *
 * The panel used to show the quoted figure beside a green tick. That is the
 * expected output, not the delivered one, and the two differ whenever the pool
 * moves between quote and fill. Only one of them is a fact.
 */
export function OutcomePanel({ outcome, route }) {
  if (!outcome) return null;
  if (!outcome.ok) {
    return (
      <div style={card('#ef4444')}>
        <div style={title('#ef4444')}><AlertTriangle size={12} /> Settlement failed</div>
        <div style={body}>{outcome.reason || 'The settlement transaction did not succeed.'}</div>
      </div>
    );
  }
  const tone = outcome.honouredMinimum === false ? '#ef4444' : '#10b981';
  return (
    <div style={card(tone)}>
      <div style={title(tone)}><ShieldCheck size={12} /> Delivered</div>
      <div style={body}>
        Delivered <strong>{outcome.delivered.toLocaleString(undefined, { maximumFractionDigits: 6 })} {route.tokenOut.symbol}</strong>
        {outcome.quoted != null && <> against a quote of <strong>{outcome.quoted.toLocaleString(undefined, { maximumFractionDigits: 6 })}</strong></>}
        {outcome.slipPct != null && Math.abs(outcome.slipPct) >= 0.01 && (
          <> ({outcome.slipPct > 0 ? '+' : ''}{outcome.slipPct.toFixed(3)}%)</>
        )}
{'.'} From the receipt, not the quote.
      </div>
      {outcome.min != null && (
        <div style={{ ...body, color: tone, fontWeight: 700 }}>
          {outcome.honouredMinimum
            ? `Minimum of ${outcome.min.toLocaleString(undefined, { maximumFractionDigits: 6 })} was honoured.`
            : `Below the ${outcome.min.toLocaleString(undefined, { maximumFractionDigits: 6 })} minimum - this should have reverted; report it.`}
        </div>
      )}
      {outcome.gasUsed && (
        <div style={{ fontSize: '0.64rem', color: 'var(--text-muted, #94a3b8)' }}>Gas used {Number(outcome.gasUsed).toLocaleString()}</div>
      )}
    </div>
  );
}

/**
 * Liquidity is not this aggregator's job, so the swarm hands it over rather
 * than half-supporting it. Making that a real link is the point: the previous
 * behaviour quoted a deposit as a swap and settled a trade the user never asked
 * for, which is far worse than saying "not here".
 */
export function PoolsHandoffPanel({ url }) {
  return (
    <div style={card('#38bdf8')}>
      <div style={title('#38bdf8')}>Liquidity</div>
      <div style={body}>
        This swarm settles swaps. Positions are managed on the pools app.
      </div>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          fontSize: '0.75rem', fontWeight: 700, color: '#38bdf8', textDecoration: 'none',
        }}
      >
        Open pools <ExternalLink size={12} />
      </a>
    </div>
  );
}
