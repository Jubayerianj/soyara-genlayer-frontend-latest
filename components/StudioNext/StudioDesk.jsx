// components/StudioNext/StudioDesk.jsx
//
// /ai on GenLayer Studio Next.
//
// Studio Next has no EVM layer, so this desk trades against one Intelligent
// Contract, SoyaraAgentDex, that both judges and settles:
//
//   swap                 the user signs; validators read the live Bradbury pool
//                        and the trade settles or is refused in that round
//   issue_mandate        the user signs once; validators check the caps against
//                        the live market and against the user's own words
//   swap_under_mandate   the session agent signs; no popup, settles in seconds
//
// The page follows the trade surfaces' rules: the trade, one status line, the
// action, and everything else behind Details. Nothing is red (lib/tone.js).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAccount } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { Send, RotateCcw, Loader2, ExternalLink, Bot, ShieldCheck, Zap, Coins } from 'lucide-react';
import { formatGen } from '@genlayer/transaction-kit-react';

import ChatMessage from '../AIAgent/ChatMessage';
import aiStyles from '../../styles/AIPage.module.css';
import styles from '../../styles/StudioDesk.module.css';
import { TONE } from '../../lib/tone';
import { notify } from '../../lib/notify';
import { STUDIO_NEXT } from '../../constants/studioNext';
import { parseStudioIntent } from '../../lib/studioNext/intent';
import { POOLS_URL } from '../../lib/pools';
import * as studio from '../../lib/studioNext/client';

const STARTERS = [
  'Get test funds',
  'Swap 25 USDC to USDT',
  'Let my agent swap up to 60 USDC into USDT, 20 per trade, for an hour',
  'Swap 0.01 ETH to USDC',
  'Revoke my mandate',
];

const BRADBURY_EXPLORER = 'https://explorer-bradbury.genlayer.com';
const TX_KEY = 'soyara.studioNext.tx';

function rememberTx(rid, txId) {
  try {
    const all = JSON.parse(window.localStorage.getItem(TX_KEY) || '{}');
    all[rid] = txId;
    const keys = Object.keys(all);
    if (keys.length > 200) delete all[keys[0]];
    window.localStorage.setItem(TX_KEY, JSON.stringify(all));
  } catch { /* links are a convenience */ }
}

function txFor(rid) {
  try { return JSON.parse(window.localStorage.getItem(TX_KEY) || '{}')[rid] || null; } catch { return null; }
}

const secondsSince = (t) => Math.max(1, Math.round((Date.now() - t) / 1000));
const pct = (bps) => `${(Number(bps) / 100).toFixed(2)}%`;
const declined = (e) => e?.code === 4001 || /user rejected|user denied|rejected the request/i.test(String(e?.message || e?.shortMessage || ''));

function minutesLeft(expiresAt) {
  const s = Number(expiresAt) - Math.floor(Date.now() / 1000);
  if (s <= 0) return 'ended';
  return s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m left` : `${Math.ceil(s / 60)} min left`;
}

function timeAgo(at) {
  const s = Math.floor(Date.now() / 1000) - Number(at);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

/** How far the fill sits under the market price, in bps. */
function underMarket(fillPrice, marketPrice) {
  const f = BigInt(fillPrice || 0);
  const m = BigInt(marketPrice || 0);
  if (m === 0n || f >= m) return 0;
  return Number(((m - f) * 10000n) / m);
}

export default function StudioDesk({ isDark }) {
  const { address, isConnected, connector } = useAccount();
  const { openConnectModal } = useConnectModal();

  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Studio Next. Validators price every trade against the live Bradbury pool. Try **swap 25 USDC to USDT**.' },
  ]);
  const [input, setInput] = useState('');
  const [plan, setPlan] = useState(null);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pools, setPools] = useState([]);
  const [reachable, setReachable] = useState(true);
  const [acct, setAcct] = useState({ balances: null, gas: null, mandates: [], trades: [] });
  const feedRef = useRef(null);

  const agent = useMemo(() => (address ? studio.sessionAgent(address) : null), [address]);

  const say = useCallback((content) => setMessages((prev) => [...prev, { role: 'assistant', content }]), []);
  const show = useCallback((tone, text, href = null) => setStatus({ tone, text, href }), []);

  useEffect(() => {
    const box = feedRef.current;
    if (box) box.scrollTo({ top: box.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  // One contract read per refresh (get_desk): Studio Next allows 30 a minute
  // per client, and fee quotes for the user's own trades draw on the same
  // allowance. The GEN balance is a plain RPC read with a much larger one.
  const refresh = useCallback(async () => {
    try {
      const [desk, g] = await Promise.all([
        studio.view('get_desk', [address || '', 6]),
        address ? studio.gasBalance(address) : Promise.resolve(null),
      ]);
      setPools(desk.pools || []);
      setAcct({ balances: desk.balances || null, gas: g, mandates: desk.mandates || [], trades: desk.trades || [] });
      setReachable(true);
    } catch {
      setReachable(false);
    }
  }, [address]);

  const busyRef = useRef(false);
  useEffect(() => { busyRef.current = busy; }, [busy]);

  useEffect(() => {
    refresh();
    const id = setInterval(() => {
      if (busyRef.current || document.visibilityState !== 'visible') return;
      refresh();
    }, 30000);
    return () => clearInterval(id);
  }, [refresh]);

  // ── signing helpers ────────────────────────────────────────────────────────

  const walletKit = useCallback(() => studio.userKitFromConnector(connector, address), [connector, address]);

  const needWallet = useCallback(() => {
    if (isConnected && address) return false;
    show('attention', 'Connect a wallet to trade on Studio Next');
    openConnectModal?.();
    return true;
  }, [isConnected, address, openConnectModal, show]);

  const finish = useCallback((rid, v, label, started) => {
    const txId = txFor(rid);
    const href = txId ? studio.txUrl(txId) : null;
    if (!v) {
      show('attention', 'Round ended without a result. Nothing moved. Try again.', href);
      say('Round ended without a result. Nothing moved.');
      return;
    }
    if (v.approved) {
      // A settled trade leaves no armed button behind: pressing Swap again
      // would place the same trade a second time.
      setPlan(null);
      const text = v.kind === 'mandate'
        ? `Mandate live · ${label}`
        : `Settled · ${studio.fmt(v.amount_in)} ${v.token_in} → ${studio.fmt(v.amount_out)} ${v.token_out} · ${pct(underMarket(v.fill_price, v.market_price))} under market · ${secondsSince(started)}s`;
      show('ok', text, href);
      say(`✓ ${text}`);
      notify({ id: `studio:${rid}`, kind: 'success', title: text.split(' · ').slice(0, 2).join(' · '), body: 'Studio Next', href });
    } else {
      const text = `Not ${v.kind === 'mandate' ? 'granted' : 'settled'} · ${v.reason}`;
      show('attention', text, href);
      say(text);
      notify({ id: `studio:${rid}`, kind: 'warning', title: text.slice(0, 90), body: 'Studio Next', href });
    }
    refresh();
  }, [refresh, say, show]);

  const failed = useCallback((err) => {
    if (declined(err)) {
      show('attention', 'Wallet request declined. Nothing was sent.');
      return;
    }
    const msg = String(err?.shortMessage || err?.message || err || 'Something went wrong').split('\n')[0].slice(0, 90);
    show('attention', `Could not send · ${msg}`);
  }, [show]);

  // ── actions ───────────────────────────────────────────────────────────────

  const getFunds = useCallback(async () => {
    if (needWallet()) return;
    setBusy(true);
    show('running', 'Getting test funds');
    try {
      const res = await studio.claimTestFunds(address, agent);
      if (res.ok) {
        const text = 'Funded · 1,000 USDC · 1,000 USDT · 0.25 ETH · 2 WGEN';
        show('ok', text, studio.txUrl(res.txId));
        say(`✓ ${text}`);
      } else {
        show('attention', 'Faucet already used this hour. Your balances are below.', studio.txUrl(res.txId));
      }
      refresh();
    } catch (err) {
      failed(err);
    } finally {
      setBusy(false);
    }
  }, [needWallet, address, agent, show, say, refresh, failed]);

  const runConsensusSwap = useCallback(async (p) => {
    if (needWallet()) return;
    setBusy(true);
    const started = Date.now();
    const rid = studio.requestId();
    try {
      show('running', 'Preparing');
      const kit = await walletKit();
      const minOut = (BigInt(p.quote.amount_out) * BigInt(10000 - p.slippageBps)) / 10000n;
      await studio.submitAsUser(kit, 'swap', [rid, p.tokenIn, p.tokenOut, p.amountRaw, minOut, p.slippageBps], (s) => {
        if (s.step === 'sign') show('running', `Sign in your wallet · deposit ${formatGen(s.quote.feeValue)} GEN, refunded when final`);
        if (s.step === 'submitted') {
          rememberTx(rid, s.txId);
          show('running', 'Validators reading the live Bradbury pool', studio.txUrl(s.txId));
        }
      });
      finish(rid, await studio.readVerdict(rid), '', started);
    } catch (err) {
      failed(err);
    } finally {
      setBusy(false);
    }
  }, [needWallet, walletKit, show, finish, failed]);

  const runAgentSwap = useCallback(async (p) => {
    if (needWallet()) return;
    setBusy(true);
    const started = Date.now();
    const rid = studio.requestId();
    try {
      show('running', 'Agent settling under your mandate');
      await studio.ensureGas(agent.address);
      const minOut = (BigInt(p.quote.amount_out) * BigInt(10000 - p.slippageBps)) / 10000n;
      const res = await studio.submitAsAgent(agent, 'swap_under_mandate', [rid, p.mandate.id, p.amountRaw, minOut]);
      rememberTx(rid, res.txId);
      const v = await studio.readVerdict(rid);
      finish(rid, v, '', started);
      if (v && !v.approved && /band/.test(v.reason)) {
        setPlan({ ...p, rail: 'consensus', mandate: null });
      }
    } catch (err) {
      failed(err);
    } finally {
      setBusy(false);
    }
  }, [needWallet, agent, show, finish, failed]);

  const grantMandate = useCallback(async (p) => {
    if (needWallet()) return;
    setBusy(true);
    const started = Date.now();
    const rid = studio.requestId();
    const label = `${p.budget} ${p.tokenIn} → ${p.tokenOut} · ${p.cap} per trade · ${p.minutes} min`;
    try {
      show('running', 'Preparing');
      await studio.ensureGas(agent.address);
      const kit = await walletKit();
      await studio.submitAsUser(kit, 'issue_mandate', [
        rid, agent.address, p.tokenIn, p.tokenOut, p.budgetRaw, p.capRaw, p.slippageBps, p.minutes, p.instruction,
      ], (s) => {
        if (s.step === 'sign') show('running', `Sign in your wallet · deposit ${formatGen(s.quote.feeValue)} GEN, refunded when final`);
        if (s.step === 'submitted') {
          rememberTx(rid, s.txId);
          show('running', 'Validators checking the market and your words', studio.txUrl(s.txId));
        }
      });
      finish(rid, await studio.readVerdict(rid), label, started);
      setPlan(null);
    } catch (err) {
      failed(err);
    } finally {
      setBusy(false);
    }
  }, [needWallet, agent, walletKit, show, finish, failed]);

  const revoke = useCallback(async (mandateId) => {
    if (needWallet()) return;
    setBusy(true);
    try {
      show('running', 'Preparing');
      const kit = await walletKit();
      const res = await studio.submitAsUser(kit, 'revoke_mandate', [mandateId], (s) => {
        if (s.step === 'sign') show('running', 'Sign in your wallet to revoke');
        if (s.step === 'submitted') show('running', 'Revoking', studio.txUrl(s.txId));
      });
      if (res.ok) {
        show('ok', 'Mandate revoked · the agent can no longer trade it', studio.txUrl(res.txId));
        say('✓ Mandate revoked.');
      } else {
        show('attention', 'Revoke did not go through. The mandate is unchanged.', studio.txUrl(res.txId));
      }
      refresh();
    } catch (err) {
      failed(err);
    } finally {
      setBusy(false);
    }
  }, [needWallet, walletKit, show, say, refresh, failed]);

  // ── chat ──────────────────────────────────────────────────────────────────

  const activeMandates = acct.mandates.filter((m) => m.status === 'active');

  const planSwap = useCallback(async (intent) => {
    const amountRaw = studio.toRaw(intent.amount);
    if (!amountRaw) { say('Tell me an amount, like **swap 25 USDC to USDT**.'); return; }
    show('running', 'Quoting');
    const quote = await studio.view('quote', [intent.tokenIn, intent.tokenOut, amountRaw]);
    if (!quote.ok) {
      setPlan(null);
      show('attention', quote.reason === 'No pool' ? `No ${intent.tokenIn}/${intent.tokenOut} pool on Studio Next` : 'That pool is not ready yet');
      say(`No ${intent.tokenIn}/${intent.tokenOut} pool here. Pools: ${STUDIO_NEXT.pairs.join(', ')}.`);
      return;
    }
    const balance = acct.balances ? BigInt(acct.balances[intent.tokenIn] || 0) : null;
    const now = Math.floor(Date.now() / 1000);
    const mandate = agent && activeMandates.find((m) => m.token_in === intent.tokenIn && m.token_out === intent.tokenOut
      && m.agent.toLowerCase() === agent.address.toLowerCase()
      && BigInt(m.per_trade_cap) >= amountRaw && BigInt(m.remaining) >= amountRaw
      && Number(m.expires_at) > now + 20
      && underMarket(quote.fill_price, m.ref_price) <= Number(m.max_slippage_bps));
    const p = {
      kind: 'swap', ...intent, amountRaw, quote,
      slippageBps: mandate ? Math.min(intent.slippageBps, Number(mandate.max_slippage_bps)) : intent.slippageBps,
      rail: mandate ? 'mandate' : 'consensus', mandate: mandate || null,
    };
    setPlan(p);
    const line = `${intent.amount} ${intent.tokenIn} → ${studio.fmt(quote.amount_out)} ${intent.tokenOut}`;
    if (balance !== null && balance < amountRaw) {
      show('attention', `Not enough ${intent.tokenIn} · get test funds first`);
      say(`Quote · ${line}. You hold ${studio.fmt(balance)} ${intent.tokenIn}.`);
      return;
    }
    if (mandate) {
      say(`Quote · ${line} · your agent settles it, no popup.`);
      runAgentSwap(p);
    } else {
      show('muted', 'Ready · validators check this against the live Bradbury pool');
      say(`Quote · ${line}. Press **Swap** to sign.`);
    }
  }, [acct.balances, activeMandates, agent, runAgentSwap, say, show]);

  const handleSend = useCallback(async (textArg) => {
    const text = (typeof textArg === 'string' ? textArg : input).trim();
    if (!text || busy) return;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    const intent = parseStudioIntent(text);

    if (intent.unsupported?.length) { say(studio.unsupportedLine(intent.unsupported)); return; }
    if (intent.needs?.length) { say(`I need ${intent.needs.join(', ')}.`); return; }

    try {
      if (intent.kind === 'faucet') { await getFunds(); return; }
      if (intent.kind === 'balances') {
        if (!acct.balances) { say('Connect a wallet to see balances.'); return; }
        say(STUDIO_NEXT.tokens.map((s) => `${studio.fmt(acct.balances[s])} ${s}`).join(' · '));
        return;
      }
      if (intent.kind === 'mandates') {
        say(activeMandates.length
          ? activeMandates.map((m) => `${m.token_in} → ${m.token_out} · ${studio.fmt(m.remaining)} left · ${minutesLeft(m.expires_at)}`).join('\n')
          : 'No active mandate. Try **let my agent swap up to 60 USDC into USDT, 20 per trade**.');
        return;
      }
      if (intent.kind === 'revoke') {
        if (!activeMandates.length) { say('No active mandate to revoke.'); return; }
        await revoke(activeMandates[0].id);
        return;
      }
      if (intent.kind === 'mandate') {
        const budgetRaw = studio.toRaw(intent.budget);
        const capRaw = studio.toRaw(intent.cap);
        if (!budgetRaw || !capRaw) { say('Give a budget, like **up to 60 USDC**.'); return; }
        setPlan({ ...intent, budgetRaw, capRaw });
        show('muted', 'Ready · validators check the caps against the market and your words');
        say(`Mandate · ${intent.budget} ${intent.tokenIn} → ${intent.tokenOut} · ${intent.cap} per trade · ${intent.minutes} min. Press **Grant** to sign.`);
        return;
      }
      if (intent.kind === 'liquidity') {
        setPlan(null);
        say(`Liquidity is not offered on Studio Next. Pools are on Bradbury: ${POOLS_URL}`);
        return;
      }
      if (intent.kind === 'wrap') { say('No wrapping here: WGEN trades directly on Studio Next.'); return; }
      if (intent.kind === 'swap') { await planSwap(intent); return; }
      say('I trade USDC, USDT, ETH and WGEN here. Try **swap 25 USDC to USDT** or **get test funds**.');
    } catch (err) {
      failed(err);
    }
  }, [input, busy, say, getFunds, acct.balances, activeMandates, revoke, planSwap, show, failed]);

  const reset = () => {
    setMessages([{ role: 'assistant', content: 'Cleared. Try **swap 25 USDC to USDT**.' }]);
    setPlan(null);
    setStatus(null);
  };

  // ── render ────────────────────────────────────────────────────────────────

  const tone = status ? TONE[status.tone] || TONE.muted : null;
  const railTone = plan?.rail === 'mandate' ? TONE.ok : TONE.running;
  const pool = plan ? pools.find((x) => x.pair === plan.quote?.pair || x.pair === `${plan.tokenIn}/${plan.tokenOut}` || x.pair === `${plan.tokenOut}/${plan.tokenIn}`) : null;

  return (
    <div className={aiStyles.mainGrid}>
      <div className={aiStyles.chatCard}>
        <div className={aiStyles.chatHeader}>
          <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Assistant</span>
          <button type="button" onClick={reset} className={aiStyles.resetBtn} title="Reset conversation">
            <RotateCcw size={14} />
            <span>Reset</span>
          </button>
        </div>

        <div className={aiStyles.messagesContainer} ref={feedRef}>
          {messages.map((m, i) => <ChatMessage key={i} role={m.role} content={m.content} />)}
        </div>

        <div className={aiStyles.startersWrapper}>
          <div className={aiStyles.startersScroll}>
            {STARTERS.map((s) => (
              <button key={s} type="button" className={aiStyles.starterChip} onClick={() => handleSend(s)} disabled={busy}>
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className={aiStyles.inputWrapper}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Swap 25 USDC to USDT, or let my agent trade up to 60 USDC"
            className={aiStyles.textInput}
            disabled={busy}
          />
          <button
            type="button"
            onClick={() => handleSend()}
            disabled={!input.trim() || busy}
            className={`${aiStyles.sendButton} ${(!input.trim() || busy) ? aiStyles.sendButtonDisabled : ''}`}
          >
            {busy ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={16} />}
          </button>
        </div>
      </div>

      <div className={aiStyles.proposalCard}>
        <div className={aiStyles.proposalHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldCheck size={18} style={{ color: '#0284c7' }} />
            <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>Trade</span>
          </div>
          <a className={styles.link} href={studio.addressUrl(STUDIO_NEXT.dex)} target="_blank" rel="noreferrer">
            SoyaraAgentDex {studio.short(STUDIO_NEXT.dex)} <ExternalLink size={11} />
          </a>
        </div>

        <div className={aiStyles.proposalBody}>
          <div className={styles.section}>
            {plan?.kind === 'swap' && (
              <div className={styles.trade}>
                <div className={styles.label}>
                  <span>Swap</span>
                  <span className={styles.rail} style={{ color: railTone.color, background: railTone.bg, borderColor: railTone.border }}>
                    {plan.rail === 'mandate' ? <><Zap size={11} /> Agent · no popup</> : <><ShieldCheck size={11} /> Consensus · you sign</>}
                  </span>
                </div>
                <div className={styles.tradeMain}>
                  {plan.amount} {plan.tokenIn} → {studio.fmt(plan.quote.amount_out)} {plan.tokenOut}
                </div>
                <div className={styles.row}><span>Pool price</span><span>{studio.fmt(plan.quote.pool_price, 6)} {plan.tokenOut}</span></div>
                <div className={styles.row}><span>Price impact and fee</span><span>{pct(plan.quote.impact_bps)}</span></div>
                <div className={styles.row}><span>Checked against</span><span>live Bradbury pool</span></div>
                <details className={styles.details}>
                  <summary>Details</summary>
                  <div className={styles.detailsBody}>
                    <div className={styles.row}><span>Minimum received</span><span>{studio.fmt((BigInt(plan.quote.amount_out) * BigInt(10000 - plan.slippageBps)) / 10000n)} {plan.tokenOut}</span></div>
                    <div className={styles.row}><span>Slippage limit</span><span>{pct(plan.slippageBps)}</span></div>
                    {pool && (
                      <div className={styles.row}>
                        <span>Bradbury market</span>
                        <a className={styles.link} href={`${BRADBURY_EXPLORER}/address/${pool.market}`} target="_blank" rel="noreferrer">
                          {pool.pair} {studio.short(pool.market)} <ExternalLink size={10} />
                        </a>
                      </div>
                    )}
                    {plan.mandate && <div className={styles.row}><span>Mandate</span><span className={styles.mono}>{studio.short(plan.mandate.id)}</span></div>}
                  </div>
                </details>
              </div>
            )}

            {plan?.kind === 'mandate' && (
              <div className={styles.trade}>
                <div className={styles.label}>
                  <span>Agent mandate</span>
                  <span className={styles.rail} style={{ color: TONE.running.color, background: TONE.running.bg, borderColor: TONE.running.border }}>
                    <Bot size={11} /> Consensus once
                  </span>
                </div>
                <div className={styles.tradeMain}>{plan.budget} {plan.tokenIn} → {plan.tokenOut}</div>
                <div className={styles.row}><span>Per trade</span><span>{plan.cap} {plan.tokenIn}</span></div>
                <div className={styles.row}><span>Lasts</span><span>{plan.minutes} min</span></div>
                <div className={styles.row}><span>Worst price</span><span>{pct(plan.slippageBps)} under market</span></div>
                <details className={styles.details}>
                  <summary>Details</summary>
                  <div className={styles.detailsBody}>
                    <div>Validators read the live Bradbury pool, then each one&apos;s model checks these caps against your words:</div>
                    <div className={styles.mono}>&ldquo;{plan.instruction}&rdquo;</div>
                    {agent && <div className={styles.row}><span>Agent key (this browser)</span><span className={styles.mono}>{studio.short(agent.address)}</span></div>}
                  </div>
                </details>
              </div>
            )}

            {!plan && (
              <div className={styles.muted}>Ask for a trade or a mandate in the chat.</div>
            )}

            {status && (
              <div className={styles.status} style={{ color: tone.color, background: tone.bg, borderColor: tone.border }}>
                {status.tone === 'running' && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />}
                <span>{status.text}</span>
                {status.href && <a href={status.href} target="_blank" rel="noreferrer">Tx <ExternalLink size={11} /></a>}
              </div>
            )}

            <div className={styles.actions}>
              {!isConnected ? (
                <button type="button" className={styles.primary} onClick={() => openConnectModal?.()}>Connect wallet</button>
              ) : plan?.kind === 'swap' ? (
                <button
                  type="button"
                  className={styles.primary}
                  disabled={busy}
                  onClick={() => (plan.rail === 'mandate' ? runAgentSwap(plan) : runConsensusSwap(plan))}
                >
                  {busy ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : null}
                  {plan.rail === 'mandate' ? 'Run again' : 'Swap'}
                </button>
              ) : plan?.kind === 'mandate' ? (
                <button type="button" className={styles.primary} disabled={busy} onClick={() => grantMandate(plan)}>
                  {busy ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : null}
                  Grant
                </button>
              ) : null}
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.label}>
              <span>Balances on Studio Next</span>
              <button type="button" className={styles.link} onClick={getFunds} disabled={busy}>
                <Coins size={11} /> Get test funds
              </button>
            </div>
            <div className={styles.balances}>
              {STUDIO_NEXT.tokens.map((s) => (
                <div key={s} className={styles.balance}>
                  <span className={styles.balanceSym}>{s}</span>
                  <span className={styles.balanceAmt}>{acct.balances ? studio.fmt(acct.balances[s], 2) : '·'}</span>
                </div>
              ))}
            </div>
            {acct.gas !== null && <div className={styles.muted}>GEN for fees: {studio.fmt(acct.gas, 3)}</div>}
            {!reachable && <div className={styles.muted} style={{ color: TONE.attention.color }}>Studio Next is not answering. Retrying.</div>}
          </div>

          <div className={styles.section}>
            <div className={styles.label}><span>Agent mandates</span></div>
            {activeMandates.length === 0 ? (
              <div className={styles.muted}>None active. The agent trades only inside one you grant.</div>
            ) : (
              <div className={styles.list}>
                {activeMandates.map((m) => (
                  <div key={m.id} className={styles.item}>
                    <div className={styles.itemMain}>
                      <span className={styles.itemTitle}>{m.token_in} → {m.token_out} · {studio.fmt(m.remaining)} of {studio.fmt(m.budget)} left</span>
                      <span className={styles.muted}>{studio.fmt(m.per_trade_cap)} per trade · {minutesLeft(m.expires_at)} · {m.trades} trade{Number(m.trades) === 1 ? '' : 's'}</span>
                    </div>
                    <button type="button" className={styles.link} onClick={() => revoke(m.id)} disabled={busy}>Revoke</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={styles.section}>
            <div className={styles.label}><span>Recent trades</span></div>
            {acct.trades.length === 0 ? (
              <div className={styles.muted}>No trades yet.</div>
            ) : (
              <div className={styles.list}>
                {acct.trades.map((t) => {
                  const txId = txFor(t.request_id);
                  const rt = t.rail === 'mandate' ? TONE.ok : TONE.running;
                  return (
                    <div key={t.index} className={styles.item}>
                      <div className={styles.itemMain}>
                        <span className={styles.itemTitle}>{studio.fmt(t.amount_in)} {t.token_in} → {studio.fmt(t.amount_out)} {t.token_out}</span>
                        <span className={styles.muted}>
                          <span style={{ color: rt.color, fontWeight: 700 }}>{t.rail === 'mandate' ? 'Agent' : 'Consensus'}</span>
                          {' · '}{pct(underMarket(t.fill_price, t.market_price))} under market · {timeAgo(t.at)}
                        </span>
                      </div>
                      {txId && <a className={styles.link} href={studio.txUrl(txId)} target="_blank" rel="noreferrer"><ExternalLink size={12} /></a>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className={styles.section}>
            <details className={styles.details}>
              <summary>How to verify</summary>
              <div className={styles.detailsBody}>
                <div>Every trade and mandate is a transaction on Studio Next. Open the Tx link to see the validators&apos; votes.</div>
                <div>Each pool is priced from the Bradbury pool below. A trade more than 10% of that market, or filling beyond your slippage, is refused and the reason is stored.</div>
                {pools.map((p) => (
                  <div key={p.pair} className={styles.row}>
                    <span>{p.pair} · {studio.fmt(p.price, 4)}</span>
                    <a className={styles.link} href={`${BRADBURY_EXPLORER}/address/${p.market}`} target="_blank" rel="noreferrer">
                      Bradbury {studio.short(p.market)} <ExternalLink size={10} />
                    </a>
                  </div>
                ))}
                <div className={styles.row}>
                  <span>Contract</span>
                  <a className={styles.link} href={studio.addressUrl(STUDIO_NEXT.dex)} target="_blank" rel="noreferrer">
                    {studio.short(STUDIO_NEXT.dex)} <ExternalLink size={10} />
                  </a>
                </div>
              </div>
            </details>
          </div>
        </div>
      </div>
    </div>
  );
}
