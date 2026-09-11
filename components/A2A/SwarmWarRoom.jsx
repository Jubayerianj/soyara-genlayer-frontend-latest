// components/A2A/SwarmWarRoom.jsx
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Send, Zap, ShieldCheck, Play, RotateCcw, CheckCircle2, XCircle, Loader2, User, Bot } from 'lucide-react';
import { useAccount } from 'wagmi';
import { orchestrateSwarm, AGENT_REGISTRY, POOLS_URL } from '../../services/a2a/agents';
import { PostTradeAuditorAgent } from '../../services/a2a/analysts';
import { MarketReadPanel, SettlementRailPanel, BindingsPanel, OutcomePanel, PoolsHandoffPanel } from './SwarmPanels';
import SettlementQueue from '../SettlementQueue';
import { useSettlementQueue } from '../../hooks/useSettlementQueue';
import { normaliseAction } from '../../lib/actions';
import { useAgentSwapExecution } from '../../hooks/useAgentSwapExecution';
import ConsensusProgress from '../ConsensusProgress';
import BalanceStrip from '../BalanceStrip';
import { recordActivity } from '../../lib/txStore';
import { ensureMandateRequested } from '../../lib/mandate';
import { mergeVerdictResponse, applyLateVerdict, describeWait } from '../../lib/settlement';
import { notices } from '../../lib/notify';
import { isNativeGen, nativeInputReason } from '../../lib/nativeInput';
import styles from '../../styles/A2A.module.css';
import { describeTxError, explainThrottle, isNodeThrottle } from '../../lib/nodeRetry';

const PRESET_CHIPS = [
  { label: '100 USDC to WGEN', query: 'Swap 100 USDC to WGEN with 0.3% slippage' },
  { label: 'Compare venues', query: 'Compare V2 vs V3 route for 500 USDT to GEN' },
  { label: 'Thin pool', query: 'Swap 2 WGEN to USDC' },
  { label: 'Slippage cap', query: 'Test 4% slippage to verify fail-closed cap' },
];

export default function SwarmWarRoom({ mode = 'user' }) {
  const { address: userAddress, isConnected } = useAccount();

  const [prompt, setPrompt] = useState('');
  const [timeline, setTimeline] = useState([
    {
      agent: AGENT_REGISTRY.intent,
      text: 'A2A Swarm online. Enter your trade intent or tap a preset above to begin multi-agent negotiation.',
      time: 'Ready'
    }
  ]);
  const [isRunning, setIsRunning] = useState(false);
  const [payload, setPayload] = useState(null);
  const [execState, setExecState] = useState(null); // null | 'approving' | 'executing' | 'done' | 'error'
  const [execErrorMsg, setExecErrorMsg] = useState(null);
  // Consensus rounds dominate the wait here, so the timeline gets a live panel
  // showing the real phase and elapsed time rather than sitting silent.
  const [consensus, setConsensus] = useState(null); // {startedAt, statusName, txHash, retry}
  // What is running right now, in one line. Status frames update this in
  // place instead of piling up in the timeline.
  const [liveStatus, setLiveStatus] = useState(null); // {agent, text}
  // A liquidity request is handed to the pools app rather than quoted here.
  const [poolsHandoff, setPoolsHandoff] = useState(false);
  // What the settled transaction actually delivered, read back from its
  // receipt. The quoted figure is an expectation; this is the fact.
  const [outcome, setOutcome] = useState(null);
  // Before/after balances around settlement - the agent wallet settles with no
  // wallet prompt, so this delta is the user's direct confirmation of movement.
  // Approved trades wait here rather than pinning the war room open.
  //
  // The swarm finishes in seconds; the appeal window that has to close before
  // the verdict reaches the executor runs to about 30 minutes. Holding the
  // room in a loading state for the second of those would strand the user on a
  // page for something that does not need them.
  const settlementQueue = useSettlementQueue();

  const [balanceSnapshot, setBalanceSnapshot] = useState(null);
  const [liveBalances, setLiveBalances] = useState(null);
  const [balanceRefreshKey, setBalanceRefreshKey] = useState(0);

  const scrollRef = useRef(null);
  // The last request, so a trade whose mandate the executor refused can be
  // re-run on its own consensus round without the user retyping it.
  const lastPromptRef = useRef('');
  // Mandates the executor refused at settlement this session - never offered
  // again, so a refusal the pre-check cannot foresee cannot loop.
  const failedMandatesRef = useRef(new Set());

  useEffect(() => {
    // Scroll the feed, never the window: scrollIntoView moved the whole page
    // on load and tucked the card under the header.
    const box = scrollRef.current?.parentElement;
    if (box) box.scrollTo({ top: box.scrollHeight, behavior: 'smooth' });
  }, [timeline, isRunning]);

  // Normalize the swarm's proposal shape (agents.js RiskValidatorAgent.validate)
  // into what useAgentSwapExecution expects (matches pages/ai.jsx's buildProposalObject):
  // tokenIn/tokenOut as symbols + a separate *Address field, amountIn/minAmountOut as
  // human-readable numbers + a separate *Raw wei-string field.
  const proposalForExecution = useMemo(() => {
    if (!payload) return null;
    const { route, intent } = payload;
    return {
      // Normalise, and never silently fall back to SWAP.
      //
      // This was `intent?.action === 'ADD_LIQUIDITY' ? 'ADD_LIQUIDITY' : 'SWAP'`.
      // Any value that was not exactly that string - a different case, stray
      // whitespace, REMOVE_LIQUIDITY, undefined - collapsed to SWAP, and
      // execute() then moved the user's funds through a trade they had not
      // asked for. A deposit request settled as a 10 USDC to USDT swap on chain
      // because of that one ternary. A defaulting rule must never resolve to the
      // branch that spends money.
      action: normaliseAction(intent?.action),
      tokenIn: route.tokenIn.symbol,
      tokenOut: route.tokenOut.symbol,
      tokenInAddress: route.tokenIn.isNative ? undefined : route.tokenIn.address,
      tokenOutAddress: route.tokenOut.isNative ? undefined : route.tokenOut.address,
      tokenA: route.tokenIn.symbol,
      tokenB: route.tokenOut.symbol,
      tokenAAddress: route.tokenIn.address,
      tokenBAddress: route.tokenOut.address,
      amountIn: route.amountInNum,
      amountInRaw: route.amountInWei,
      minAmountOut: route.minAmountOutNum,
      minAmountOutRaw: route.minAmountOutWei,
      amountA: route.amountInNum,
      amountB: route.expectedOutNum,
      amountARaw: route.amountInWei,
      amountBRaw: route.minAmountOutWei,
      amount0Desired: route.amountInWei,
      amount1Desired: route.minAmountOutWei,
      amount0Min: route.minAmountInWei || route.amountInWei,
      amount1Min: route.minAmountOutWei,
      slippageBps: intent?.slippageBps || 100,
      dex: route.chosenRoute?.includes('V3') ? 'v3' : 'v2',
      // The aggregator's chosen path, so settlement rebuilds exactly what was quoted.
      hops: route.hops || null,
      isMultiHop: Boolean(route.isMultiHop),
      deadline: payload.risk?.proposal?.deadline,
      // When no pool can fill the pair, RouterMathAgent falls back to a rough
      // 1:1 estimate so the swarm dialogue can still complete. That estimate has
      // no liquidity behind it and can only revert, so it must never be
      // executable - e.g. ETH has no pool on Bradbury at all.
      // And never from native GEN: the relayer would pay for it (lib/nativeInput.js).
      executable: route.isLiveQuote !== false && !isNativeGen(route.tokenIn),
      notExecutableReason: isNativeGen(route.tokenIn)
        ? nativeInputReason(intent?.amountIn ?? null, route.tokenOut.symbol)
        : route.isLiveQuote === false
          ? `No pool for ${route.tokenIn.symbol}/${route.tokenOut.symbol} on Soyara, so this rate cannot be executed.`
          : null,
      priceImpactPct: typeof route.priceImpact === 'number' ? route.priceImpact : null,
      highImpact: typeof route.priceImpact === 'number' && route.priceImpact >= 5,
    };
  }, [payload]);

  const {
    fromTokenObj,
    toTokenObj,
    needsApproval,
    hasInsufficientBalance,
    isNotExecutable,
    notExecutableReason,
    isApproving,
    approve,
    execute,
    isTxWaiting,
    isTxSuccess,
    isTxFailed,
    activeTxHash,
    executionError,
    reset: resetExecution,
  } = useAgentSwapExecution(proposalForExecution);

  // The approval state belongs to the payload on screen, which changes after
  // the handlers below were created. Reading it through refs means a verdict
  // that lands minutes later acts on the current values, not the ones from
  // before the swarm ran.
  const approveRef = useRef(approve);
  const needsApprovalRef = useRef(needsApproval);
  approveRef.current = approve;
  needsApprovalRef.current = needsApproval;

  // One path for a trade consensus approved on its own round, whether the
  // verdict arrived while the swarm was running or after it had finished.
  // Queue it, and get the one signature it needs out of the way now, while the
  // user is still watching. A mandate-covered trade is never queued: it has no
  // verdict of its own to wait for, and queueing it would give one intent two
  // ways to settle.
  // Only for the wallet that is actually connected. Without one the swarm runs
  // for a placeholder recipient so the page can still show a full run, and a
  // queue entry or a fast lane for that address could never be used.
  const isOwnOrder = (r) => Boolean(userAddress)
    && String(r?.pendingOrder?.user || '').toLowerCase() === String(userAddress).toLowerCase();

  const queueApprovedTrade = (r, rt) => {
    if (!(r?.isApproved && r?.rail === 'consensus' && r?.pendingOrder && r?.pendingProgram && isOwnOrder(r))) return false;
    settlementQueue.enqueue({
      commitment: r.commitment,
      order: r.pendingOrder,
      program: r.pendingProgram,
      validationTxHash: r.txHash || null,
      validatedAt: Date.now(),
      stage: 'finalising',
      label: `${rt?.amountInNum ?? ''} ${rt?.tokenIn?.symbol} → ${rt?.tokenOut?.symbol}`,
    });
    if (needsApprovalRef.current) {
      approveRef.current?.().catch(() => { /* surfaced on the queue entry */ });
    }
    return true;
  };

  // This trade took its own round. When a mandate could carry trades like it,
  // ask for one in the background and say so: it does not speed up this trade,
  // but the next one in this direction settles in seconds.
  const requestFastLaneFor = (r, rt) => {
    if (!(r?.rail === 'consensus' && r?.mandateEligible && r?.pendingOrder && isOwnOrder(r))) return;
    const o = r.pendingOrder;
    // Announced by lib/mandate as a notice; the bell tracks it until it is live.
    ensureMandateRequested({
      user: o.user, tokenIn: o.tokenIn, tokenOut: o.tokenOut,
      amountIn: o.amountIn, slippageBps: Number(o.slippageBps) || 100,
    }).catch(() => { /* background; never blocks a trade */ });
  };

  // A round the swarm stopped waiting for is still running.
  //
  // The swarm polls a round for about five minutes and then hands back
  // "pending". Nothing watched it after that: the room sat on "Consensus
  // Pending" for good, and an approval that arrived a minute later was never
  // queued, so the trade never settled. Keep watching the SAME round - a new
  // one would be a second authority for one intent - and act on its verdict
  // when it comes. A new swarm run replaces the payload and stops the watch, so
  // an abandoned trade is never settled behind the user's back.
  const resolvedRoundsRef = useRef(new Set());
  useEffect(() => {
    const r = payload?.risk;
    const txHash = r?.txHash;
    if (isRunning || !r?.isPending || !txHash || resolvedRoundsRef.current.has(txHash)) return undefined;

    const route = payload.route;
    const base = {
      tx_hash: txHash,
      proposal_id: r.proposalId || null,
      commitment: r.commitment || null,
      pendingOrder: r.pendingOrder || null,
      pendingProgram: r.pendingProgram || null,
      rail: 'consensus',
      mandate_eligible: r.mandateEligible,
      mandate_note: r.mandateNote || null,
    };
    const WATCH_LIMIT_MS = 30 * 60 * 1000;
    const startedAt = Date.now();
    let cancelled = false;
    let timer = null;

    const settleOutcome = (data) => {
      resolvedRoundsRef.current.add(txHash);
      const { risk: nextRisk, outcome } = applyLateVerdict(r, data);
      const approved = outcome === 'approved';
      const undecided = outcome === 'undecided';
      const { reason } = nextRisk;
      setPayload((p) => (p?.risk?.txHash === txHash ? { ...p, risk: nextRisk } : p));
      recordActivity({
        id: r.proposalId || txHash,
        kind: 'swap',
        status: approved ? 'approved' : undecided ? 'undecided' : 'rejected',
        reason,
      });

      const label = `${route?.amountInNum ?? ''} ${route?.tokenIn?.symbol} → ${route?.tokenOut?.symbol}`;
      let text;
      if (approved) {
        notices.roundApproved(txHash, label, nextRisk.rail);
        const queued = queueApprovedTrade(nextRisk, route);
        requestFastLaneFor(nextRisk, route);
        text = queued ? '✓ Approved by GenLayer consensus · settling by itself' : '✓ Approved by GenLayer consensus';
      } else if (undecided) {
        notices.roundUndecided(txHash, label);
        text = '↻ No verdict from the network, not a rejection. Run it again.';
      } else {
        notices.roundRejected(txHash, label, reason);
        text = `✗ Rejected · ${String(reason || 'consensus did not approve').split('. ')[0]}`;
      }
      setTimeline((prev) => [...prev, { agent: AGENT_REGISTRY.risk, text, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
    };

    const tick = async (attempt) => {
      if (cancelled) return;
      let data = null;
      try {
        const res = await fetch('/api/genlayer-validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // After a few minutes, also let the server clear a round validators
          // never picked up, so idle rounds do not pile up on a lane.
          body: JSON.stringify({ checkTxHash: txHash, proposalId: base.proposal_id, finalizeIfStuck: attempt >= 24 }),
        });
        if (res.ok) data = mergeVerdictResponse(base, await res.json());
      } catch {
        // A failed check is not a verdict; try again on the next tick.
      }
      if (cancelled) return;

      if (data && !data.pending && !data.needs_verdict_lookup) {
        settleOutcome(data);
        return;
      }
      if (Date.now() - startedAt > WATCH_LIMIT_MS) {
        settleOutcome({ approved: false, timedOut: true, reason: 'No verdict after 30 minutes of watching.' });
        return;
      }
      timer = setTimeout(() => tick(attempt + 1), attempt < 24 ? 5000 : 15000);
    };

    tick(0);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload, isRunning]);

  useEffect(() => {
    if (isTxSuccess && activeTxHash) {
      setExecState('done');
      setBalanceRefreshKey((k) => k + 1);
    } else if (isTxFailed && activeTxHash) {
      setExecState('error');
      setExecErrorMsg('The settlement transaction reverted on GenLayer.');
    }
  }, [isTxSuccess, isTxFailed, activeTxHash]);

  useEffect(() => {
    if (executionError) {
      setExecState('error');
      setExecErrorMsg(executionError);
    }
  }, [executionError]);

  const handleStartSwarm = async (q) => {
    const textToRun = (typeof q === 'string' && q) || prompt;
    if (!textToRun.trim() || isRunning) return;
    lastPromptRef.current = textToRun;

    setPrompt('');
    setPayload(null);
    setExecState(null);
    setExecErrorMsg(null);
    resetExecution();
    setConsensus(null);
    setPoolsHandoff(false);
    setOutcome(null);
    setLiveStatus(null);
    setIsRunning(true);

    setTimeline(prev => [
      ...prev,
      { isUser: true, text: textToRun, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
    ]);

    try {
      // Consensus rounds run for tens of seconds. Without this the timeline sat
      // completely still for the whole wait and read as a hang.
      const onProgress = (text, meta) => {
        // The live consensus panel shows the phase; one line per poll used to
        // fill the timeline with forty near-identical messages.
        setConsensus((prev) => ({
          startedAt: prev?.startedAt || Date.now(),
          statusName: meta?.statusName ?? prev?.statusName ?? null,
          txHash: meta?.txHash ?? prev?.txHash ?? null,
          retry: meta?.retry ?? prev?.retry ?? false,
        }));
      };
      const generator = orchestrateSwarm(
        textToRun,
        userAddress || '0x3333333333333333333333333333333333333333',
        { onProgress, excludeMandateIds: [...failedMandatesRef.current] }
      );
      for await (const step of generator) {
        if (step.type === 'MESSAGE') {
          setLiveStatus({ agent: step.agent, text: step.text });
          continue;
        }
        if (step.type === 'REDIRECTED') {
          setPoolsHandoff(true);
        }

        if (step.type === 'SWARM_COMPLETE') {
          setPayload(step.payload);
          const r = step.payload?.risk;
          const rt = step.payload?.route;
          queueApprovedTrade(r, rt);
          requestFastLaneFor(r, rt);

          // The round outlived the swarm's wait. The watcher above keeps
          // checking it, and the bell tracks it until it resolves.
          if (r?.isPending && r?.txHash) {
            notices.roundRunning(r.txHash, `${rt?.amountInNum ?? ''} ${rt?.tokenIn?.symbol} → ${rt?.tokenOut?.symbol}`);
          }

          if (r) {
            recordActivity({
              id: r.proposalId || `swarm-${Date.now()}`,
              kind: 'swap',
              user: userAddress,
              pair: `${rt?.tokenIn?.symbol} → ${rt?.tokenOut?.symbol}`,
              label: `Swarm ${rt?.amountInNum ?? ''} ${rt?.tokenIn?.symbol} → ${rt?.tokenOut?.symbol}`,
              proposalId: r.proposalId || null,
              status: r.isApproved ? 'approved' : r.isPending ? 'pending' : 'rejected',
              reason: r.reason,
            });
          }
        }

        setTimeline(prev => [
          ...prev,
          {
            agent: step.agent,
            text: step.text,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);
      }
    } catch (err) {
      setTimeline(prev => [
        ...prev,
        { agent: AGENT_REGISTRY.risk, text: `Error: ${err.message}`, time: 'Alert' }
      ]);
    } finally {
      setConsensus(null);
      setLiveStatus(null);
      setIsRunning(false);
    }
  };

  // Real settlement through AgentExecutor, on the rail consensus chose - see
  // hooks/useAgentSwapExecution.js. A mandate-covered trade settles in one
  // transaction; a trade with its own verdict settles when that verdict lands.
  // (This was once a fake 1s timeout that never submitted anything.)
  const handleExecute = async () => {
    if (!isConnected || !userAddress) {
      alert('Please connect wallet on GenLayer Testnet.');
      return;
    }
    if (!payload?.risk?.isApproved) return;

    setExecErrorMsg(null);

    try {
      if (needsApproval) {
        setExecState('approving');
        const approveResult = await approve();
        if (approveResult) notices.tokenApproval(approveResult.hash, approveResult.symbol);
      }

      setExecState('executing');
      setBalanceSnapshot(liveBalances);
      const validationResult = {
        approved: payload.risk.isApproved,
        proposal_id: payload.risk.proposalId,
        commitment: payload.risk.commitment,
        // The authority consensus chose for this trade. Without it the hook
        // refuses to settle rather than guess.
        rail: payload.risk.rail,
        mandate_id: payload.risk.mandateId,
        tx_hash: payload.risk.txHash,
      };
      const resumeState = {
        pendingOrder: payload.risk.pendingOrder,
        pendingProgram: payload.risk.pendingProgram,
        validationSubmitted: payload.risk.validationSubmitted,
      };
      const result = await execute(validationResult, resumeState);
      setBalanceRefreshKey((k) => k + 1);
      if (!result) return;

      const shortTx = (h) => (h ? `${h.slice(0, 6)}…${h.slice(-4)}` : '');
      let text;
      if (result.kind === 'wrap') {
        text = `✓ Wrapped · tx ${shortTx(result.hash)}`;
      } else if (result.kind === 'unwrap') {
        text = `✓ Unwrapped · tx ${shortTx(result.hash)}`;
      } else if (result.kind === 'swap') {
        recordActivity({
          id: result.hash, kind: 'swap', user: userAddress,
          pair: `${proposalForExecution?.tokenIn} → ${proposalForExecution?.tokenOut}`,
          label: `Settled ${proposalForExecution?.amountIn} ${proposalForExecution?.tokenIn} → ${proposalForExecution?.tokenOut}`,
          settleTxHash: result.hash, status: 'settled',
        });

        // The Post-Trade Auditor closes the loop: the panel above showed what
        // was quoted, and this reads the receipt for what was delivered.
        PostTradeAuditorAgent.audit({
          txHash: result.hash,
          tokenOut: payload.route.tokenOut.isNative ? null : payload.route.tokenOut.address,
          user: userAddress,
          quotedOut: payload.risk?.pendingOrder?.quotedAmountOut || null,
          minOut: payload.route.minAmountOutWei || null,
          decimals: payload.route.tokenOut.decimals,
        }).then((o) => {
          setOutcome(o);
          if (!o?.ok) return;
          setTimeline((prev) => [...prev, {
            agent: AGENT_REGISTRY.auditor,
            text: `Receipt: **${o.delivered.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${payload.route.tokenOut.symbol}** delivered · `
              + (o.honouredMinimum === false ? '⚠️ below the committed minimum' : 'minimum honoured'),
            time: 'Audit',
          }]);
        }).catch(() => { /* the receipt panel simply stays empty */ });
        const label = `${proposalForExecution?.amountIn} ${proposalForExecution?.tokenIn} → ${proposalForExecution?.tokenOut}`;
        notices.settled(result.commitment || result.mandateId || result.hash, label, result.hash);
        text = `✓ Settled${result.rail === 'mandate' ? ' in the fast lane' : ''} · tx ${shortTx(result.hash)}`;
      } else {
        text = `✓ Submitted · tx ${shortTx(result.hash)}`;
      }
      setTimeline(prev => [...prev, { agent: AGENT_REGISTRY.dev, text, time: 'Settlement' }]);
    } catch (err) {
      console.error('A2A execution failed:', err);

      // The mandate could not carry this trade after all. Nothing was sent.
      // Re-run the swarm without it, which gives the trade its own round.
      if (err?.mandateUnavailable) {
        if (payload?.risk?.mandateId) failedMandatesRef.current.add(String(payload.risk.mandateId).toLowerCase());
        setTimeline(prev => [...prev, {
          agent: AGENT_REGISTRY.settlement,
          text: 'Fast lane no longer covers this. Re-running on its own round.',
          time: 'Mandate',
        }]);
        setExecState(null);
        if (lastPromptRef.current) setTimeout(() => handleStartSwarm(lastPromptRef.current), 0);
        return;
      }

      if (err?.verdictExpired) {
        setTimeline(prev => [...prev, {
          agent: AGENT_REGISTRY.risk,
          text: '⌛ Approval expired before settling. Nothing moved. Run it again.',
          time: 'Expired',
        }]);
        setExecState(null);
        return;
      }

      if (err?.pending) {
        // Hand it to the settlement queue rather than asking the user to come
        // back and click again. The verdict rides an external message that is
        // delivered only on finalization, about 30 minutes out - "wait a moment"
        // was off by an order of magnitude, and nothing was watching for it.
        if (err.pendingOrder && err.pendingProgram && err.commitment) {
          settlementQueue.enqueue({
            commitment: err.commitment,
            order: err.pendingOrder,
            program: err.pendingProgram,
            validationTxHash: err.validationTxHash || null,
            validatedAt: Date.now(),
            stage: 'finalising',
            label: `${proposalForExecution?.amountIn ?? ''} ${proposalForExecution?.tokenIn || ''} → ${proposalForExecution?.tokenOut || ''}`,
          });
        }
        setTimeline(prev => [
          ...prev,
          { agent: AGENT_REGISTRY.risk, text: '⏳ Queued · settles by itself in ~30 min', time: 'Queued' }
        ]);
        setExecState(null);
        return;
      }
      setExecState('error');
      // Not err.shortMessage. For a node throttle viem says 'The contract
      // function "approve" reverted with the following reason: ... -32005 ...',
      // which is wrong twice over - approve was never called, and nothing
      // reverted. This page kept showing that after /ai was fixed, because it
      // has its own error handler.
      setExecErrorMsg(describeTxError(err, 'Execution'));
      if (isNodeThrottle(err)) {
        explainThrottle().then(setExecErrorMsg).catch(() => {});
      }
    }
  };

  return (
    <div className={styles.swarmGrid}>
      {/* Left: Interactive Dialogue Box */}
      <div className={styles.cardBox}>
        <div className={styles.cardHeader}>
          <div className={styles.cardTitleText}>
            <Zap size={16} color="var(--blue-primary, #0284c7)" />
            <span>Dialogue</span>
          </div>
          <button onClick={() => setTimeline([])} className={styles.chip}>
            <RotateCcw size={11} style={{ display: 'inline', marginRight: '3px' }} /> Clear
          </button>
        </div>

        {/* Preset Chips */}
        <div className={styles.chipsBar}>
          {PRESET_CHIPS.map((c, i) => (
            <button key={i} className={styles.chip} onClick={() => handleStartSwarm(c.query)} disabled={isRunning}>
              {c.label}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <form 
          className={styles.quickInputWrap}
          onSubmit={(e) => {
            e.preventDefault();
            handleStartSwarm();
          }}
        >
          <input 
            className={styles.quickInput}
            placeholder="Type trade intent (e.g., 'Swap 100 USDC to WGEN')..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={isRunning}
          />
          <button type="submit" className={styles.runBtn} disabled={isRunning || !prompt.trim()}>
            <Play size={14} /> Run
          </button>
        </form>

        {/* Timeline */}
        {settlementQueue.entries.length > 0 && (
          <div style={{ margin: '0 0 12px' }}>
            <SettlementQueue queue={settlementQueue} onApprove={() => approve()} />
          </div>
        )}

        <div className={styles.timelineFeed}>
          {timeline.map((item, idx) => (
            <div key={idx} className={styles.timelineItem}>
              <div 
                className={styles.timelineAvatar} 
                style={{ 
                  background: item.isUser ? 'var(--blue-glow, rgba(2, 132, 199, 0.15))' : `${item.agent?.color}20`,
                  color: item.isUser ? 'var(--blue-primary, #0284c7)' : item.agent?.color
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
                <div 
                  className={styles.timelineText}
                  dangerouslySetInnerHTML={{ 
                    __html: item.text
                      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                      .replace(/`(.*?)`/g, '<code>$1</code>') 
                  }}
                />
              </div>
            </div>
          ))}
          {isRunning && (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '0.8rem', color: 'var(--text-muted, #94a3b8)', padding: '0.4rem' }}>
              <div className={styles.agentDotWorking} />
              <span>
                {liveStatus
                  ? <><strong style={{ color: liveStatus.agent?.color }}>{liveStatus.agent?.name}</strong> · {liveStatus.text}…</>
                  : 'Working…'}
              </span>
            </div>
          )}
          {proposalForExecution && (
              <div style={{ margin: '0.6rem 0' }}>
                <BalanceStrip
                  tokens={[fromTokenObj, toTokenObj]}
                  snapshot={balanceSnapshot}
                  refreshKey={balanceRefreshKey}
                  onLoaded={setLiveBalances}
                />
              </div>
            )}
            {consensus && (
              <div style={{ margin: '0.6rem 0' }}>
                <ConsensusProgress
                  statusName={consensus.statusName}
                  txHash={consensus.txHash}
                  startedAt={consensus.startedAt}
                  isRetryRound={consensus.retry}
                />
              </div>
            )}
            <div ref={scrollRef} />
        </div>
      </div>

      {/* Right: Clean Settlement Summary Card */}
      <div className={styles.cardBox}>
        <div className={styles.cardHeader}>
          <div className={styles.cardTitleText}>
            <ShieldCheck size={16} color="#10b981" />
            <span>Settlement</span>
          </div>
        </div>

        {payload ? (
          <div className={styles.summaryBox}>
            {/* "Optimal" is a claim, and it is only true when the pools on the
                path agree about the price. When they do not, the highest-paying
                route is a reading off a mispriced pool, and labelling it optimal
                is how a 20x-wrong number reached the user looking authoritative. */}
            <div style={{
              padding: '0.6rem 0.75rem',
              background: payload.route.priceWarning
                ? 'rgba(239, 68, 68, 0.10)'
                : 'var(--blue-glow, rgba(2, 132, 199, 0.08))',
              borderRadius: '0.5rem',
              border: payload.route.priceWarning
                ? '1px solid rgba(239, 68, 68, 0.45)'
                : '1px solid var(--border-subtle, rgba(255, 255, 255, 0.1))',
            }}>
              <div style={{ fontSize: '0.7rem', color: payload.route.priceWarning ? '#ef4444' : 'var(--text-muted, #94a3b8)', fontWeight: 700 }}>
                {payload.route.priceWarning ? 'UNRELIABLE PRICE' : 'BEST FILL'}
              </div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-main, #ffffff)' }}>
                {payload.route.chosenRoute}
              </div>
            </div>

            {payload.route.priceWarning && (
              <div style={{
                padding: '0.6rem 0.75rem', borderRadius: '0.5rem',
                background: 'rgba(239, 68, 68, 0.07)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                fontSize: '0.72rem', lineHeight: 1.55, color: 'var(--text-sub, #cbd5e1)',
              }}>
Pools disagree <strong>{payload.route.dislocationFactor.toFixed(1)}x</strong> on this route. The minimum below is not reliable.
              </div>
            )}

            <div className={styles.statRow}>
              <span>You get</span>
              <span className={styles.statVal}>
                {`~${payload.route.expectedOutNum.toFixed(4)} ${payload.route.tokenOut.symbol} for ${payload.route.amountInNum} ${payload.route.tokenIn.symbol}`}
              </span>
            </div>

            <div className={styles.statRow}>
              <span>{payload.route.priceWarning ? 'Minimum (unreliable)' : 'Minimum'}</span>
              <span className={styles.statVal}>
                {`${payload.route.minAmountOutNum.toFixed(4)} ${payload.route.tokenOut.symbol} (${(payload.intent.slippageBps / 100).toFixed(2)}%)`}
              </span>
            </div>

            <div className={styles.statRow}>
              <span>Consensus</span>
              <span
                className={styles.statVal}
                style={{ color: payload.risk.isApproved ? '#10b981' : (payload.risk.isPending || payload.risk.isUndecided) ? '#f59e0b' : '#f43f5e' }}
              >
                {payload.risk.isApproved
                  ? (payload.risk.rail === 'mandate' ? '⚡ Fast lane' : '✓ Approved')
                  : payload.risk.isPending
                    ? '⏳ Waiting for validators'
                    : payload.risk.isUndecided ? 'No verdict - run again' : '✗ Rejected'}
              </span>
            </div>

            <div className={styles.statRow}>
              <span>Settles</span>
              <span className={styles.statVal}>
                {(() => {
                  // The live answer for this trade once it is queued: what it is
                  // waiting for and when, not a fixed "~30 min".
                  const queued = settlementQueue.entries.find((e) => e.commitment && e.commitment === payload.risk.commitment);
                  if (queued?.stage === 'settled') return '✓ Settled';
                  if (queued && queued.stage === 'finalising') return describeWait(queued);
                  return payload.risk.rail === 'mandate' ? 'In ~5s' : 'By itself in ~30 min';
                })()}
              </span>
            </div>

            {/* The proof and the agents' findings, one tap away: a trader needs
                the numbers above to decide, and the rest to check. */}
            <details style={{ fontSize: '0.78rem' }}>
              <summary style={{ cursor: 'pointer', color: 'var(--text-muted, #94a3b8)', fontWeight: 600, padding: '2px 0' }}>
                Details
              </summary>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '0.6rem' }}>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted, #94a3b8)', marginBottom: '3px' }}>
                    {payload.risk.rail === 'mandate' ? 'Mandate' : 'Commitment (single use)'}
                  </div>
                  <div className={styles.hashBoxMini}>{payload.risk.tradeHash}</div>
                </div>
                <MarketReadPanel analysis={payload.analysis} route={payload.route} />
                <BindingsPanel audit={payload.audit} />
                <SettlementRailPanel strategy={payload.strategy} />
              </div>
            </details>

            <button
              onClick={handleExecute}
              disabled={!payload.risk.isApproved || payload.risk.isPending || execState === 'approving' || execState === 'executing' || isTxWaiting || hasInsufficientBalance || isNotExecutable}
              className={styles.executeBtn}
            >
              {(execState === 'approving' || execState === 'executing' || isTxWaiting) && (
                <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
              )}
              {execState !== 'approving' && execState !== 'executing' && !isTxWaiting && <Zap size={16} />}
              {isNotExecutable
                ? 'No Liquidity Pool for This Pair'
                : hasInsufficientBalance
                ? `Don't have enough ${proposalForExecution?.tokenIn || 'balance'}`
                : execState === 'approving'
                ? `Approving ${proposalForExecution?.tokenIn}...`
                : execState === 'executing' || isTxWaiting
                  ? 'Settling on GenLayer...'
                  : needsApproval
                    ? `Approve ${proposalForExecution?.tokenIn} & Execute`
                    : 'Execute'}
            </button>

            {execState === 'done' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '0.5rem 0.75rem', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '0.5rem', color: '#10b981', fontSize: '0.8rem', fontWeight: 600 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle2 size={16} />
                  Settled - ~{payload.route.expectedOutNum.toFixed(6)} {payload.route.tokenOut.symbol} sent to {userAddress ? `${userAddress.slice(0, 6)}…${userAddress.slice(-4)}` : 'your wallet'}
                  {activeTxHash && (
                    <span style={{ marginLeft: 'auto', fontSize: '0.7rem', fontFamily: 'monospace', color: '#10b981' }}>
                      {activeTxHash.slice(0, 10)}…{activeTxHash.slice(-8)}
                    </span>
                  )}
                </div>
                {/* ERC-20 output is invisible in most wallets until the token is
                    imported - say so, or a successful swap looks like lost funds. */}
                {!payload.route.tokenOut.isNative && (
                  <div style={{ fontWeight: 500, fontSize: '0.7rem', color: 'var(--text-muted, #94a3b8)' }}>
                    Not in your wallet? Import {payload.route.tokenOut.symbol}: <code style={{ fontSize: '0.66rem' }}>{payload.route.tokenOut.address}</code>
                  </div>
                )}
              </div>
            )}

            {outcome && <OutcomePanel outcome={outcome} route={payload.route} />}

            {execState === 'error' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0.5rem 0.75rem', background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.3)', borderRadius: '0.5rem', color: '#f43f5e', fontSize: '0.8rem', fontWeight: 600 }}>
                <XCircle size={16} /> {execErrorMsg || 'Execution failed'}
              </div>
            )}
          </div>
        ) : poolsHandoff ? (
          <div style={{ padding: '0.5rem' }}>
            <PoolsHandoffPanel url={POOLS_URL} />
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-muted, #94a3b8)', fontSize: '0.85rem' }}>
            Run a trade to see it here.
          </div>
        )}
      </div>
    </div>
  );
}
