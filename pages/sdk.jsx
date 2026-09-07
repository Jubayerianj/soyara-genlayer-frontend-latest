// pages/sdk.jsx
//
// Developer landing page for @soyaradex/sdk.
//
// The single most important thing this page has to communicate is WHERE each
// piece runs. Quoting, routing and intent parsing need no key and no backend;
// validation and settlement sign transactions and therefore do. Developers who
// miss that distinction build the wrong thing, so it is the first section.

import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import {
  Terminal, Package, Cpu, ShieldCheck, Coins, Copy, Check,
  ArrowRight, Server, Globe, BookOpen,
} from 'lucide-react';
import { useTheme } from '../components/contexts/ThemeContext';
import { INTELLIGENT_CONTRACTS, CONTRACT_ADDRESSES } from '../constants/addresses';

function Code({ children, isDark }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    try {
      navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard blocked - the text is still selectable */ }
  };
  return (
    <div style={{ position: 'relative' }}>
      <pre style={{
        background: isDark ? 'rgba(0,0,0,0.35)' : '#0f172a',
        color: isDark ? '#e2e8f0' : '#e2e8f0',
        padding: '14px 16px', borderRadius: 10, overflowX: 'auto',
        fontSize: '0.8rem', lineHeight: 1.65, margin: 0,
      }}>{children}</pre>
      <button
        type="button" onClick={copy}
        style={{
          position: 'absolute', top: 8, right: 8, background: 'rgba(255,255,255,0.08)',
          border: 'none', borderRadius: 6, padding: '4px 7px', cursor: 'pointer',
          color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.68rem',
        }}
      >
        {copied ? <><Check size={11} /> copied</> : <><Copy size={11} /> copy</>}
      </button>
    </div>
  );
}

export default function SdkPage() {
  const { theme } = useTheme();
  const isDark = theme !== 'light';
  const [fee, setFee] = useState(10);
  const [volume, setVolume] = useState(50000);

  const border = isDark ? 'rgba(255,255,255,0.10)' : '#e2e8f0';
  const muted = isDark ? 'rgba(255,255,255,0.6)' : '#64748b';
  const card = { border: `1px solid ${border}`, borderRadius: 14, padding: '1.25rem' };
  const h2 = { fontSize: '1.15rem', fontWeight: 750, margin: '0 0 6px' };

  const earn = (volume * fee) / 10000;

  return (
    <>
      <Head>
        <title>Build Agents · Soyara SDK</title>
        <meta name="description" content="Build trading agents on Soyara - natural-language intent parsing, best-route aggregation, and consensus-gated settlement on GenLayer." />
      </Head>

      <main style={{ maxWidth: 960, margin: '0 auto', padding: '2rem 1.25rem 4rem' }}>
        {/* Hero */}
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', fontWeight: 700, color: '#0ea5e9', border: '1px solid rgba(14,165,233,0.35)', borderRadius: 999, padding: '4px 11px', marginBottom: 14 }}>
            <Package size={12} /> @soyaradex/sdk
          </div>
          <h1 style={{ fontSize: '2.1rem', fontWeight: 800, margin: '0 0 10px', lineHeight: 1.2 }}>
            Build agents that trade on GenLayer
          </h1>
          <p style={{ color: muted, fontSize: '1rem', lineHeight: 1.65, maxWidth: 680, margin: 0 }}>
            Soyara is an AI-native DEX where every trade is gated by a real consensus round before
            it can settle. The SDK gives your agent the same intent parsing, best-route aggregation
            and settlement path the app itself uses.
          </p>
          <div style={{ marginTop: 18, maxWidth: 560 }}>
            <Code isDark={isDark}>{`npm install @soyaradex/sdk viem`}</Code>
            <p style={{ color: muted, fontSize: '0.74rem', lineHeight: 1.5, marginTop: 8, marginBottom: 0 }}>
              Published on npm.{' '}
              <a
                href="https://www.npmjs.com/package/@soyaradex/sdk"
                target="_blank" rel="noreferrer"
                style={{ color: '#0ea5e9', textDecoration: 'none' }}
              >
                View the package
              </a>
              . <code>viem</code> is a peer dependency, so install it alongside.
            </p>
          </div>
        </div>

        {/* Where things run - the thing developers most need to know */}
        <section style={{ ...card, marginBottom: '1.25rem' }}>
          <h2 style={h2}>Do you need a server?</h2>
          <p style={{ color: muted, fontSize: '0.86rem', lineHeight: 1.6, marginTop: 0 }}>
            Partly - and it decides how you build. Everything your agent needs to <em>think</em> runs
            anywhere with a public RPC and no key at all. Only the two steps that sign transactions
            need a backend.
          </p>

          <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
            {[
              { icon: Globe, k: 'parseIntent', d: 'natural language → structured intent', server: false },
              { icon: Globe, k: 'quoteBestRouteMultiHop', d: 'live best-route pricing, direct + multi-hop', server: false },
              { icon: Globe, k: 'buildProgram', d: 'AGGFlow settlement calldata', server: false },
              { icon: Server, k: 'validate', d: 'GenLayer consensus write - needs a funded account', server: true },
              { icon: Server, k: 'settleSwap / addLiquidity / removeLiquidity', d: 'needs an authorised agent on AgentExecutor', server: true },
            ].map((r) => (
              <div key={r.k} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: '0.83rem' }}>
                <r.icon size={14} color={r.server ? '#f59e0b' : '#34d399'} style={{ marginTop: 3, flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <code style={{ fontWeight: 700 }}>{r.k}</code>
                  <span style={{ color: muted }}> - {r.d}</span>
                  <span style={{ color: r.server ? '#f59e0b' : '#34d399', fontWeight: 600 }}>
                    {r.server ? '  · server' : '  · no server'}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <p style={{ color: muted, fontSize: '0.78rem', lineHeight: 1.55, marginBottom: 0, marginTop: 14 }}>
            Settlement functions on <code>AgentExecutor</code> carry an <code>onlyAgent</code> modifier,
            so the caller must be a registered agent. The contract now supports{' '}
            <strong>multiple agents</strong>, so you can register your own address and settle directly
            rather than routing through someone else&apos;s server.
          </p>
        </section>

        {/* Quick start */}
        <section style={{ ...card, marginBottom: '1.25rem' }}>
          <h2 style={h2}><Terminal size={16} style={{ verticalAlign: -2 }} /> Quick start</h2>
          <p style={{ color: muted, fontSize: '0.84rem', marginTop: 0, marginBottom: 12 }}>
            Understand and price a request in one call - no key required.
          </p>
          <Code isDark={isDark}>{`import { understand, SoyaraClient } from '@soyaradex/sdk';

// 1. Parse + price. Pure + public RPC, no key.
const { intent, quote } = await understand('swap 50 USDC to USDT');

if (!intent.confident) {
  // Never guess - a wrong guess spends real funds.
  return ask(\`I need: \${intent.needs.join(', ')}\`);
}

console.log(quote.amountOutRaw, quote.isMultiHop ? \`via \${quote.via}\` : 'direct');

// 2. Consensus, then settle.
const soyara = new SoyaraClient({ baseUrl: 'https://your-deployment.example' });

const verdict = await soyara.validate(proposal, {
  onProgress: ({ phase, attempt }) => console.log(phase, attempt),
});

if (verdict.approved) {
  const receipt = await soyara.settleSwap(trade);
  console.log('settled:', receipt.explorerUrl);
}`}</Code>
        </section>

        {/* Why it's safe */}
        <section style={{ ...card, marginBottom: '1.25rem' }}>
          <h2 style={h2}><ShieldCheck size={16} style={{ verticalAlign: -2 }} /> What &ldquo;consensus-gated&rdquo; actually means</h2>
          <ol style={{ color: muted, fontSize: '0.85rem', lineHeight: 1.75, paddingLeft: 20, margin: '8px 0 0' }}>
            <li>
              <code>validate</code> submits a <strong>write</strong> to the AgentValidator Intelligent
              Contract. Validators are selected by VRF, each independently re-executes the proposal,
              then they commit and reveal. This takes tens of seconds - by design, not a bug.
            </li>
            <li>The verdict is recorded in contract state and read back with <code>get_validation</code>.</li>
            <li>
              Settlement derives the proposal id <strong>on-chain from the exact parameters being
              settled</strong> and checks that verdict itself. Passing <code>validationApproved: true</code>{' '}
              is not enough - a fabricated id returns <strong>403</strong>.
            </li>
            <li>
              <code>AgentExecutor</code> binds a one-time hash over those parameters and{' '}
              <strong>consumes</strong> it. Change any parameter and it reverts with{' '}
              <code>TradeNotApproved</code>; the hash cannot be replayed.
            </li>
          </ol>
          <p style={{ color: muted, fontSize: '0.78rem', marginBottom: 0, marginTop: 12 }}>
            A slow or undecided round is a network condition, not a rejection - <code>validate</code>{' '}
            reports <code>retryable</code> and never throws for it.
          </p>
        </section>

        {/* Earnings */}
        <section style={{ ...card, marginBottom: '1.25rem' }}>
          <h2 style={h2}><Coins size={16} style={{ verticalAlign: -2, color: '#fbbf24' }} /> How agents earn</h2>
          <p style={{ color: muted, fontSize: '0.85rem', lineHeight: 1.6, marginTop: 0 }}>
            An agent charges a fee in basis points on the volume it routes. Move the sliders to see
            what that looks like.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px,1fr))', gap: 18, marginTop: 14 }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: 5 }}>
                <span>Your fee</span><strong>{fee} bps ({(fee / 100).toFixed(2)}%)</strong>
              </div>
              <input type="range" min={1} max={100} value={fee} onChange={(e) => setFee(Number(e.target.value))} style={{ width: '100%', accentColor: '#fbbf24' }} />
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: 5 }}>
                <span>Monthly volume routed</span><strong>${volume.toLocaleString()}</strong>
              </div>
              <input type="range" min={1000} max={1000000} step={1000} value={volume} onChange={(e) => setVolume(Number(e.target.value))} style={{ width: '100%', accentColor: '#fbbf24' }} />
            </div>
          </div>

          <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 10, background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.28)' }}>
            <div style={{ fontSize: '0.75rem', color: muted }}>Your agent would earn</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fbbf24' }}>
              ${earn.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: muted }}> / month</span>
            </div>
            <div style={{ fontSize: '0.72rem', color: muted, marginTop: 4 }}>
              volume × bps ÷ 10 000, on top of the protocol&apos;s own 5 bps.
            </div>
          </div>

          <p style={{ color: muted, fontSize: '0.78rem', lineHeight: 1.55, marginTop: 12, marginBottom: 0 }}>
            <strong>Being straight about status:</strong> the protocol fee is live on-chain today.
            Agent fee-sharing is a model - collecting it automatically needs a fee split in the
            settlement contract, which is not deployed yet. Until then an agent can charge off-chain
            or run as a service.
          </p>
        </section>

        {/* Build ideas */}
        <section style={{ ...card, marginBottom: '1.25rem' }}>
          <h2 style={h2}><Cpu size={16} style={{ verticalAlign: -2 }} /> What to build</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))', gap: 12, marginTop: 12 }}>
            {[
              ['Chat trading bot', 'Take orders in plain language in Telegram or Discord. parseIntent does the understanding; the swarm does the rest.'],
              ['Rebalancer', 'Watch a portfolio and route trades back to target weights, each one consensus-approved before it settles.'],
              ['Best-execution router', 'Quote across every venue with quoteBestRouteMultiHop and settle where the fill is best.'],
              ['Guarded treasury agent', 'Policy limits enforced by consensus, so an agent literally cannot execute outside its mandate.'],
            ].map(([t, d]) => (
              <div key={t} style={{ border: `1px solid ${border}`, borderRadius: 10, padding: '11px 13px' }}>
                <div style={{ fontWeight: 700, fontSize: '0.86rem', marginBottom: 4 }}>{t}</div>
                <div style={{ color: muted, fontSize: '0.78rem', lineHeight: 1.5 }}>{d}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Contracts */}
        <section style={{ ...card, marginBottom: '1.25rem' }}>
          <h2 style={h2}><BookOpen size={16} style={{ verticalAlign: -2 }} /> Live contracts</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 10, fontSize: '0.78rem' }}>
            {[
              ['AgentValidator (IC)', INTELLIGENT_CONTRACTS.agentValidator],
              ['AgentExecutor', CONTRACT_ADDRESSES[4221]?.agentExecutor],
              ['AGGFlowEntrypoint', CONTRACT_ADDRESSES[4221]?.aggregatorEntrypoint],
            ].filter(([, a]) => a).map(([k, a]) => (
              <div key={k} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
                <span style={{ color: muted, minWidth: 160 }}>{k}</span>
                <a href={`https://explorer-bradbury.genlayer.com/address/${a}`} target="_blank" rel="noopener noreferrer"
                   style={{ color: '#0ea5e9', textDecoration: 'none', wordBreak: 'break-all' }}>{a}</a>
              </div>
            ))}
          </div>
        </section>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link href="/a2a/dev" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#0ea5e9', color: '#fff', padding: '11px 18px', borderRadius: 10, textDecoration: 'none', fontWeight: 700, fontSize: '0.88rem' }}>
            Try the Agent Studio <ArrowRight size={15} />
          </Link>
          <Link href="/ai" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${border}`, padding: '11px 18px', borderRadius: 10, textDecoration: 'none', fontWeight: 700, fontSize: '0.88rem', color: 'inherit' }}>
            See it trade
          </Link>
        </div>
      </main>
    </>
  );
}
