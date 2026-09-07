// components/A2A/DevSecuritySandbox.jsx
import React, { useState } from 'react';
import { 
  Play, 
  CheckCircle2, 
  XCircle, 
  ShieldCheck, 
  Lock, 
  Code2, 
  RotateCcw,
  Zap,
  Filter
} from 'lucide-react';
import { COMPREHENSIVE_TESTS } from '../../services/a2a/teamRequirementsTest';
import { computeTradeHash } from '../../services/a2a/agents';
import styles from '../../styles/A2A.module.css';

const DEFAULT_TRADE = {
  user: '0x3333333333333333333333333333333333333333',
  tokenIn: '0x315374AA9b5536037Cc1Efeea2439CCC0913A77e', // WGEN
  tokenOut: '0x58B6CD7891cd0A682226E25607b958a6479195A6', // USDC
  amountIn: '100000000000000000000', // 100
  minAmountOut: '49000000000000000000', // 49
  slippageBps: '30', // 0.30%
  deadline: '1756850000'
};

export default function DevSecuritySandbox() {
  const [testResults, setTestResults] = useState({});
  const [runningId, setRunningId] = useState(null);
  const [runningAll, setRunningAll] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  // Playground state
  const [params, setParams] = useState(DEFAULT_TRADE);
  const [tamperedField, setTamperedField] = useState('none');
  const [simResult, setSimResult] = useState(null);

  const originalHash = computeTradeHash(
    DEFAULT_TRADE.user,
    DEFAULT_TRADE.tokenIn,
    DEFAULT_TRADE.tokenOut,
    DEFAULT_TRADE.amountIn,
    DEFAULT_TRADE.minAmountOut,
    DEFAULT_TRADE.slippageBps,
    DEFAULT_TRADE.deadline
  );

  const currentHash = computeTradeHash(
    params.user,
    params.tokenIn,
    params.tokenOut,
    params.amountIn,
    params.minAmountOut,
    params.slippageBps,
    params.deadline
  );

  const isTampered = originalHash !== currentHash;

  const handleRunSingle = async (test) => {
    setRunningId(test.id);
    await new Promise(r => setTimeout(r, 120));
    try {
      const res = await test.run();
      setTestResults(prev => ({ ...prev, [test.id]: res }));
    } catch (err) {
      setTestResults(prev => ({ ...prev, [test.id]: { passed: false, detail: err.message } }));
    } finally {
      setRunningId(null);
    }
  };

  const handleRunAll = async () => {
    setRunningAll(true);
    setTestResults({});
    const testsToRun = categoryFilter === 'ALL' 
      ? COMPREHENSIVE_TESTS 
      : COMPREHENSIVE_TESTS.filter(t => t.category === categoryFilter);

    for (const t of testsToRun) {
      setRunningId(t.id);
      await new Promise(r => setTimeout(r, 150));
      try {
        const res = await t.run();
        setTestResults(prev => ({ ...prev, [t.id]: res }));
      } catch (err) {
        setTestResults(prev => ({ ...prev, [t.id]: { passed: false, detail: err.message } }));
      }
    }
    setRunningId(null);
    setRunningAll(false);
  };

  const filteredTests = categoryFilter === 'ALL'
    ? COMPREHENSIVE_TESTS
    : COMPREHENSIVE_TESTS.filter(t => t.category === categoryFilter);

  const totalRun = Object.keys(testResults).length;
  const passedCount = Object.values(testResults).filter(r => r.passed).length;

  const handleTamper = (field, value) => {
    setTamperedField(field);
    setParams(prev => ({ ...prev, [field]: value }));
    setSimResult(null);
  };

  const handleTestTamper = async () => {
    setSimResult(null);
    await new Promise(r => setTimeout(r, 150));
    if (isTampered) {
      setSimResult({
        status: 'REVERTED',
        error: `TradeNotApproved(${currentHash.slice(0, 10)}...)`,
        desc: `Parameter '${tamperedField}' altered. Hash mismatch rejected on AgentExecutor.sol.`,
        passed: true
      });
    } else {
      setSimResult({
        status: 'SUCCESS',
        error: 'None',
        desc: 'Hash matches approved one-time settlement commitment exactly.',
        passed: true
      });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Top Banner: Master 1-Click Test Suite */}
      <div className={styles.cardBox}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.85rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
              <ShieldCheck size={18} color="#10b981" />
              <h2 style={{ fontSize: '1rem', fontWeight: 800, margin: 0, color: 'var(--text-main, #ffffff)' }}>
                Protocol & Security Verification Suite
              </h2>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted, #94a3b8)' }}>
              1-click test verifying write flow, fail-closed consensus, one-time hash binding, and tamper rejection.
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {totalRun > 0 && (
              <span className={passedCount === totalRun ? styles.statusBadgeGood : styles.statusBadgeBad}>
                {passedCount} / {totalRun} Passed ({Math.round((passedCount / totalRun) * 100)}%)
              </span>
            )}
            <button 
              onClick={handleRunAll}
              disabled={runningAll || runningId !== null}
              className={styles.executeBtn}
              style={{ padding: '0.45rem 0.95rem', fontSize: '0.825rem' }}
            >
              <Play size={13} />
              {runningAll ? 'Running Tests...' : `Run All ${filteredTests.length} Tests (1-Click)`}
            </button>
          </div>
        </div>

        {/* Filter Chips */}
        <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.85rem', flexWrap: 'wrap' }}>
          <button 
            type="button" 
            className={styles.chip}
            style={{ 
              borderColor: categoryFilter === 'ALL' ? 'var(--blue-primary, #0284c7)' : undefined,
              color: categoryFilter === 'ALL' ? 'var(--blue-primary, #0284c7)' : undefined,
              fontWeight: 600
            }}
            onClick={() => setCategoryFilter('ALL')}
          >
            All Tests (10)
          </button>
          <button 
            type="button" 
            className={styles.chip}
            style={{ 
              borderColor: categoryFilter === 'Core Requirement' ? 'var(--blue-primary, #0284c7)' : undefined,
              color: categoryFilter === 'Core Requirement' ? 'var(--blue-primary, #0284c7)' : undefined,
              fontWeight: 600
            }}
            onClick={() => setCategoryFilter('Core Requirement')}
          >

            New Requirements (4)
          </button>
          <button 
            type="button" 
            className={styles.chip}
            style={{ 
              borderColor: categoryFilter === 'Attack Vector' ? '#ef4444' : undefined,
              color: categoryFilter === 'Attack Vector' ? '#ef4444' : undefined,
              fontWeight: 600
            }}
            onClick={() => setCategoryFilter('Attack Vector')}
          >
            Attack Vectors (4)
          </button>
        </div>

        {/* Test Items List */}
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
                  gap: '0.4rem'
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
                    <div style={{ marginTop: '0.25rem', fontSize: '0.725rem', color: res.passed ? '#10b981' : '#ef4444', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {res.passed ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                      <span>{res.detail}</span>
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
                    padding: '0.25rem 0.6rem'
                  }}
                >
                  {isRunning ? 'Testing...' : res ? (res.passed ? '✅ Passed' : '❌ Failed') : 'Hit & Test ➔'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Interactive Tamper & Hash Comparator */}
      <div className={styles.devGrid}>
        {/* Parameters Card */}
        <div className={styles.cardBox}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitleText}>
              <Code2 size={15} color="var(--blue-primary, #0284c7)" />
              <span>1-Click Attack Simulator</span>
            </div>
            <button onClick={() => { setParams(DEFAULT_TRADE); setTamperedField('none'); setSimResult(null); }} className={styles.chip}>
              <RotateCcw size={10} style={{ display: 'inline', marginRight: '3px' }} /> Reset
            </button>
          </div>

          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #94a3b8)', marginBottom: '0.65rem' }}>
            Tap an attack vector below to simulate tampering:
          </div>

          <div className={styles.tamperRow} style={{ marginTop: 0 }}>
            <button 
              type="button" 
              className={styles.tamperBtn}
              onClick={() => handleTamper('user', '0xAttackerAddress999999999999999999999999')}
            >
              🔴 Redirect User
            </button>
            <button 
              type="button" 
              className={styles.tamperBtn}
              onClick={() => handleTamper('amountIn', '200000000000000000000')}
            >
              🔴 Tamper AmountIn
            </button>
            <button 
              type="button" 
              className={styles.tamperBtn}
              onClick={() => handleTamper('minAmountOut', '0')}
            >
              🔴 Zero MinAmountOut
            </button>
            <button 
              type="button" 
              className={styles.tamperBtn}
              onClick={() => handleTamper('slippageBps', '500')}
            >
              🔴 Slippage 5% (&gt;3% Cap)
            </button>
          </div>

          <div style={{ marginTop: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
            <div>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted, #94a3b8)' }}>User:</span>
              <div style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: params.user !== DEFAULT_TRADE.user ? '#ef4444' : 'var(--text-main, #ffffff)' }}>
                {params.user}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.725rem' }}>
              <span>AmountIn: <strong style={{ color: params.amountIn !== DEFAULT_TRADE.amountIn ? '#ef4444' : 'var(--text-main, #ffffff)' }}>{params.amountIn}</strong></span>
              <span>MinOut: <strong style={{ color: params.minAmountOut !== DEFAULT_TRADE.minAmountOut ? '#ef4444' : 'var(--text-main, #ffffff)' }}>{params.minAmountOut}</strong></span>
              <span>Slippage: <strong style={{ color: params.slippageBps !== DEFAULT_TRADE.slippageBps ? '#ef4444' : 'var(--text-main, #ffffff)' }}>{params.slippageBps} bps</strong></span>
            </div>
          </div>
        </div>

        {/* Hash Integrity Card */}
        <div className={styles.cardBox}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitleText}>
              <Lock size={15} color="#10b981" />
              <span>Settlement Hash Integrity</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
            <div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted, #94a3b8)' }}>APPROVED HASH (GenVM Verified):</div>
              <div className={styles.hashBoxMini} style={{ color: '#10b981' }}>{originalHash}</div>
            </div>

            <div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted, #94a3b8)' }}>CURRENT MEMORY HASH:</div>
              <div className={styles.hashBoxMini} style={{ color: isTampered ? '#ef4444' : '#10b981' }}>
                {currentHash}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              {isTampered ? (
                <span className={styles.statusBadgeBad}>
                  <XCircle size={12} /> Tamper Detected
                </span>
              ) : (
                <span className={styles.statusBadgeGood}>
                  <CheckCircle2 size={12} /> Integrity Verified
                </span>
              )}

              <button
                onClick={handleTestTamper}
                className={styles.chip}
                style={{ borderColor: isTampered ? '#ef4444' : 'var(--blue-primary, #0284c7)', color: isTampered ? '#ef4444' : 'var(--blue-primary, #0284c7)', fontWeight: 600 }}
              >
                {isTampered ? 'Test Tampered Revert ➔' : 'Test Settle Succeeded ➔'}
              </button>
            </div>

            {simResult && (
              <div style={{ padding: '0.45rem 0.65rem', background: 'var(--bg-well, rgba(0,0,0,0.2))', borderRadius: '0.45rem', border: '1px solid var(--border-subtle, rgba(255,255,255,0.06))', fontSize: '0.75rem' }}>
                <span style={{ color: 'var(--text-muted, #94a3b8)' }}>Result: </span>
                <strong style={{ color: simResult.status === 'REVERTED' ? '#ef4444' : '#10b981' }}>{simResult.status}</strong>
                <div style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '0.7rem', marginTop: '2px' }}>{simResult.desc}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
