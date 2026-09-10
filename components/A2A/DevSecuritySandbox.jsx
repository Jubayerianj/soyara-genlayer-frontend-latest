// components/A2A/DevSecuritySandbox.jsx
//
// The settlement contract, questioned live.
//
// Both halves of this panel ask the DEPLOYED AgentExecutor with eth_calls from
// the address that would really send each transaction. Nothing is hashed in
// JavaScript and nothing is marked passed in advance: the suite reports what
// the contract answered, and the tamper playground shows the commitment the
// executor itself derives for the original order and for the altered one.
import React, { useEffect, useMemo, useState } from 'react';
import {
  Play,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  Lock,
  Code2,
  RotateCcw,
} from 'lucide-react';
import AGENT_EXECUTOR_ABI from '../../abi/AgentExecutor.json';
import { COMPREHENSIVE_TESTS } from '../../services/a2a/teamRequirementsTest';
import { CONTRACT_ADDRESSES } from '../../constants/addresses';
import { probe, deriveCommitment, readRoles, sampleOrder, SAMPLE_PROGRAM } from '../../lib/settlementProbe';
import styles from '../../styles/A2A.module.css';

const A = CONTRACT_ADDRESSES[4221];
const EXECUTOR = A.agentExecutor;
const ATTACKER = '0x9999999999999999999999999999999999999999';

const TAMPERS = {
  none: { label: 'Original order', apply: (o) => o },
  user: { label: 'Redirect the output', apply: (o) => ({ ...o, user: ATTACKER }) },
  amountIn: { label: 'Double the amount', apply: (o) => ({ ...o, amountIn: o.amountIn * 2n }) },
  feeBps: { label: 'Raise the fee', apply: (o) => ({ ...o, feeBps: 50n }) },
  minAmountOut: { label: 'Zero the floor', apply: (o) => ({ ...o, minAmountOut: 0n }) },
  slippageBps: { label: 'Slippage 5% (> 3% cap)', apply: (o) => ({ ...o, slippageBps: 500n, minAmountOut: (o.quotedAmountOut * 9_500n) / 10_000n }) },
};

const short = (v) => (v ? `${String(v).slice(0, 12)}…${String(v).slice(-8)}` : '');

export default function DevSecuritySandbox() {
  const [testResults, setTestResults] = useState({});
  const [runningId, setRunningId] = useState(null);
  const [runningAll, setRunningAll] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  // One base order for the session, so the original commitment stays put.
  const baseOrder = useMemo(() => sampleOrder({ addresses: A }), []);
  const [tamper, setTamper] = useState('none');
  const current = useMemo(() => TAMPERS[tamper].apply(baseOrder), [tamper, baseOrder]);

  const [baseCommitment, setBaseCommitment] = useState(null);
  const [currentCommitment, setCurrentCommitment] = useState(null);
  const [simResult, setSimResult] = useState(null);
  const [probing, setProbing] = useState(false);

  useEffect(() => {
    deriveCommitment({ abi: AGENT_EXECUTOR_ABI, executor: EXECUTOR, order: baseOrder })
      .then(setBaseCommitment).catch(() => setBaseCommitment(null));
  }, [baseOrder]);

  useEffect(() => {
    let live = true;
    setCurrentCommitment(null);
    setSimResult(null);
    deriveCommitment({ abi: AGENT_EXECUTOR_ABI, executor: EXECUTOR, order: current })
      .then((c) => { if (live) setCurrentCommitment(c); }).catch(() => {});
    return () => { live = false; };
  }, [current]);

  const categories = [...new Set(COMPREHENSIVE_TESTS.map((t) => t.category))];
  const filteredTests = categoryFilter === 'ALL'
    ? COMPREHENSIVE_TESTS
    : COMPREHENSIVE_TESTS.filter((t) => t.category === categoryFilter);

  const runOne = async (test) => {
    try {
      const res = await test.run();
      setTestResults((prev) => ({ ...prev, [test.id]: res }));
    } catch (err) {
      setTestResults((prev) => ({ ...prev, [test.id]: { passed: false, detail: err.shortMessage || err.message } }));
    }
  };

  const handleRunSingle = async (test) => {
    setRunningId(test.id);
    await runOne(test);
    setRunningId(null);
  };

  const handleRunAll = async () => {
    setRunningAll(true);
    setTestResults({});
    for (const t of filteredTests) {
      setRunningId(t.id);
      await runOne(t);
    }
    setRunningId(null);
    setRunningAll(false);
  };

  const totalRun = Object.keys(testResults).length;
  const passedCount = Object.values(testResults).filter((r) => r.passed).length;
  const differs = baseCommitment && currentCommitment && String(baseCommitment).toLowerCase() !== String(currentCommitment).toLowerCase();

  // Ask the executor what it would do with the order on screen.
  const handleProbe = async () => {
    setProbing(true);
    setSimResult(null);
    try {
      const roles = await readRoles({ abi: AGENT_EXECUTOR_ABI, executor: EXECUTOR });
      const r = await probe({
        abi: AGENT_EXECUTOR_ABI, executor: EXECUTOR, from: roles.agent,
        functionName: 'executeSwap', args: [current, SAMPLE_PROGRAM],
      });
      setSimResult(r.wouldSucceed
        ? { status: 'WOULD SETTLE', desc: 'The executor would accept this call.' }
        : {
            status: 'REVERTED',
            error: `${r.error}(${r.args.map((a) => short(String(a))).join(', ')})`,
            desc: r.error === 'NoConsensusVerdict'
              ? (tamper === 'none'
                ? 'No verdict exists for this sample order, so the executor refuses it. A real trade settles only after consensus records one for exactly this commitment.'
                : `The altered order hashes to a different commitment. A verdict recorded for the original could never settle it.`)
              : `Refused by the executor's own parameter checks, before any verdict is even consulted.`,
          });
    } catch (err) {
      setSimResult({ status: 'ERROR', desc: err.shortMessage || err.message });
    } finally {
      setProbing(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Suite */}
      <div className={styles.cardBox}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.85rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
              <ShieldCheck size={18} color="#10b981" />
              <h2 style={{ fontSize: '1rem', fontWeight: 800, margin: 0, color: 'var(--text-main, #ffffff)' }}>
                Settlement Verification Suite
              </h2>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted, #94a3b8)' }}>
              Every check is an eth_call against the deployed AgentExecutor ({short(EXECUTOR)}), from the address that would
              really send it. No gas, no consensus round, and the result is whatever the contract answers.
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {totalRun > 0 && (
              <span className={passedCount === totalRun ? styles.statusBadgeGood : styles.statusBadgeBad}>
                {passedCount} / {totalRun} Passed
              </span>
            )}
            <button
              onClick={handleRunAll}
              disabled={runningAll || runningId !== null}
              className={styles.executeBtn}
              style={{ padding: '0.45rem 0.95rem', fontSize: '0.825rem' }}
            >
              <Play size={13} />
              {runningAll ? 'Asking the chain...' : `Run ${filteredTests.length} Checks`}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.85rem', flexWrap: 'wrap' }}>
          {['ALL', ...categories].map((c) => (
            <button
              key={c}
              type="button"
              className={styles.chip}
              style={{
                borderColor: categoryFilter === c ? 'var(--blue-primary, #0284c7)' : undefined,
                color: categoryFilter === c ? 'var(--blue-primary, #0284c7)' : undefined,
                fontWeight: 600,
              }}
              onClick={() => setCategoryFilter(c)}
            >
              {c === 'ALL' ? `All (${COMPREHENSIVE_TESTS.length})` : `${c} (${COMPREHENSIVE_TESTS.filter((t) => t.category === c).length})`}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginTop: '0.75rem' }}>
          {filteredTests.map((test) => {
            const res = testResults[test.id];
            const isRunning = runningId === test.id;
            return (
              <div
                key={test.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.55rem 0.75rem',
                  background: 'var(--bg-well, rgba(255, 255, 255, 0.02))',
                  border: `1px solid ${res ? (res.passed ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)') : 'var(--border-subtle, rgba(255, 255, 255, 0.06))'}`,
                  borderRadius: '0.5rem',
                  flexWrap: 'wrap',
                  gap: '0.4rem',
                }}
              >
                <div style={{ flex: 1, minWidth: '240px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '0.825rem', fontWeight: 700, color: 'var(--text-main, #ffffff)' }}>{test.title}</span>
                    <span className={styles.chip} style={{ fontSize: '0.65rem', padding: '0.1rem 0.35rem' }}>{test.category}</span>
                  </div>
                  <div style={{ fontSize: '0.725rem', color: 'var(--text-muted, #94a3b8)', marginTop: '2px' }}>
                    {test.directive}
                  </div>
                  {res && (
                    <div style={{ marginTop: '0.25rem', fontSize: '0.725rem', color: res.passed ? '#10b981' : '#ef4444', display: 'flex', alignItems: 'flex-start', gap: '4px' }}>
                      {res.passed ? <CheckCircle2 size={12} style={{ flexShrink: 0, marginTop: 2 }} /> : <XCircle size={12} style={{ flexShrink: 0, marginTop: 2 }} />}
                      <span style={{ wordBreak: 'break-word' }}>{res.detail}</span>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => handleRunSingle(test)}
                  disabled={isRunning || runningAll}
                  className={styles.chip}
                  style={{
                    borderColor: res ? (res.passed ? '#10b981' : '#ef4444') : 'var(--blue-primary, #0284c7)',
                    color: res ? (res.passed ? '#10b981' : '#ef4444') : 'var(--blue-primary, #0284c7)',
                    fontWeight: 600,
                    fontSize: '0.725rem',
                    padding: '0.25rem 0.6rem',
                  }}
                >
                  {isRunning ? 'Asking...' : res ? (res.passed ? 'Passed' : 'Failed') : 'Run'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tamper playground */}
      <div className={styles.devGrid}>
        <div className={styles.cardBox}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitleText}>
              <Code2 size={15} color="var(--blue-primary, #0284c7)" />
              <span>Tamper With an Order</span>
            </div>
            <button onClick={() => setTamper('none')} className={styles.chip}>
              <RotateCcw size={10} style={{ display: 'inline', marginRight: '3px' }} /> Reset
            </button>
          </div>

          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #94a3b8)', marginBottom: '0.65rem' }}>
            Change one field of a well-formed order and see what the executor derives and does:
          </div>

          <div className={styles.tamperRow} style={{ marginTop: 0 }}>
            {Object.entries(TAMPERS).filter(([k]) => k !== 'none').map(([key, t]) => (
              <button key={key} type="button" className={styles.tamperBtn} onClick={() => setTamper(key)}
                style={tamper === key ? { borderColor: '#ef4444', color: '#ef4444' } : undefined}>
                {t.label}
              </button>
            ))}
          </div>

          <div style={{ marginTop: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.45rem', fontSize: '0.725rem' }}>
            <div>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted, #94a3b8)' }}>Recipient:</span>
              <div style={{ fontFamily: 'monospace', color: current.user !== baseOrder.user ? '#ef4444' : 'var(--text-main, #ffffff)' }}>{current.user}</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
              <span>amountIn: <strong style={{ color: current.amountIn !== baseOrder.amountIn ? '#ef4444' : 'inherit' }}>{String(current.amountIn)}</strong></span>
              <span>fee: <strong style={{ color: current.feeBps !== baseOrder.feeBps ? '#ef4444' : 'inherit' }}>{String(current.feeBps)} bps</strong></span>
              <span>floor: <strong style={{ color: current.minAmountOut !== baseOrder.minAmountOut ? '#ef4444' : 'inherit' }}>{String(current.minAmountOut)}</strong></span>
              <span>slippage: <strong style={{ color: current.slippageBps !== baseOrder.slippageBps ? '#ef4444' : 'inherit' }}>{String(current.slippageBps)} bps</strong></span>
            </div>
          </div>
        </div>

        <div className={styles.cardBox}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitleText}>
              <Lock size={15} color="#10b981" />
              <span>What the Executor Derives</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
            <div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted, #94a3b8)' }}>getSwapCommitment(original order):</div>
              <div className={styles.hashBoxMini} style={{ color: '#10b981' }}>{baseCommitment || 'reading…'}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted, #94a3b8)' }}>getSwapCommitment(order on the left):</div>
              <div className={styles.hashBoxMini} style={{ color: differs ? '#ef4444' : '#10b981' }}>{currentCommitment || 'reading…'}</div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {differs ? (
                <span className={styles.statusBadgeBad}><XCircle size={12} /> Different commitment</span>
              ) : (
                <span className={styles.statusBadgeGood}><CheckCircle2 size={12} /> Same commitment</span>
              )}
              <button
                onClick={handleProbe}
                disabled={probing}
                className={styles.chip}
                style={{ borderColor: 'var(--blue-primary, #0284c7)', color: 'var(--blue-primary, #0284c7)', fontWeight: 600 }}
              >
                {probing ? 'Asking the executor…' : 'Ask the executor to settle it'}
              </button>
            </div>

            {simResult && (
              <div style={{ padding: '0.45rem 0.65rem', background: 'var(--bg-well, rgba(0,0,0,0.2))', borderRadius: '0.45rem', border: '1px solid var(--border-subtle, rgba(255,255,255,0.06))', fontSize: '0.75rem' }}>
                <span style={{ color: 'var(--text-muted, #94a3b8)' }}>Result: </span>
                <strong style={{ color: simResult.status === 'REVERTED' ? '#ef4444' : '#10b981' }}>{simResult.status}</strong>
                {simResult.error && <div style={{ fontFamily: 'monospace', fontSize: '0.68rem', marginTop: '2px', wordBreak: 'break-all' }}>{simResult.error}</div>}
                <div style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '0.7rem', marginTop: '2px' }}>{simResult.desc}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
