import React, { useState, useEffect } from 'react';
import { Loader2, Check, Share2, ExternalLink } from 'lucide-react';
import { TokenIcon } from './TokenIcon';
import { changeNowService } from '../../services/changeNowService';

export function L1Tracker({ initialTxId = '' }) {
  const [txId, setTxId] = useState(initialTxId);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);

  useEffect(() => {
    if (initialTxId) {
      setTxId(initialTxId);
      handleCheck(initialTxId);
    }
  }, [initialTxId]);

  const handleCheck = async (idToCheck) => {
    const targetId = idToCheck || txId;
    if (!targetId) return;
    setLoading(true);
    setError('');
    
    try {
      const data = await changeNowService.getStatus(targetId);
      if (data && !data.error) {
        setStatus(data);
      } else {
        setError(data?.error || 'Order not found. Please verify the ID.');
        setStatus(null);
      }
    } catch (err) {
      setError('Failed to fetch status. Check your order ID.');
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  const copyLink = () => {
    if (typeof window !== 'undefined') {
      const url = `${window.location.origin}/l1?tx=${txId}`;
      navigator.clipboard.writeText(url);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };

  const statusInfo = status ? changeNowService.formatStatus(status.status) : null;
  const fromTicker = status?.fromCurrency?.toUpperCase() || 'LTC';
  const toTicker = status?.toCurrency?.toUpperCase() || 'BTC';

  // Determine stage progress index (0 to 4)
  const getStageIndex = (st) => {
    switch (st) {
      case 'new': return 0;
      case 'waiting': return 1;
      case 'confirming': return 2;
      case 'exchanging': return 3;
      case 'sending': return 3;
      case 'finished': return 4;
      default: return 1;
    }
  };

  const currentStage = status ? getStageIndex(status.status) : 0;

  return (
    <div className="swapCard" style={{ maxWidth: 540 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800 }}>Live Order Tracker</h2>
        <span style={{ background: 'rgba(6, 182, 212, 0.1)', color: '#22d3ee', padding: '4px 10px', borderRadius: 12, fontSize: 12, fontWeight: 700 }}>
          ⚡ LitVM Engine
        </span>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
        <input 
          type="text"
          className="amountInput"
          placeholder="Enter Order ID (e.g. 8a3f91...)"
          value={txId}
          onChange={(e) => setTxId(e.target.value)}
          style={{ fontSize: '15px', background: 'rgba(10, 15, 30, 0.7)', padding: '12px 16px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)' }}
        />
        <button 
          className="primaryButton"
          onClick={() => handleCheck(txId)}
          disabled={!txId || loading}
          style={{ width: 'auto', margin: 0, padding: '12px 20px', fontSize: 14, borderRadius: 14 }}
        >
          {loading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : 'Track'}
        </button>
      </div>

      {error && (
        <div style={{ padding: 14, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 14, color: '#fca5a5', fontSize: 13, marginBottom: 20 }}>
          ⚠️ {error}
        </div>
      )}

      {status && statusInfo && (
        <div className="depositCard" style={{ margin: 0, textAlign: 'left' }}>
          {/* Header Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div>
              <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>ORDER STATUS</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: statusInfo.color, marginTop: 4 }}>
                {statusInfo.label}
              </div>
            </div>
            <button className="copyButton" onClick={copyLink}>
              {copySuccess ? <Check size={14} color="#38bdf8" /> : <Share2 size={14} />} {copySuccess ? 'Copied Link' : 'Share Order'}
            </button>
          </div>

          {/* 5-Step Visual Timeline */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative', marginBottom: 12 }}>
              <div style={{ position: 'absolute', top: 12, left: '10%', right: '10%', height: 2, background: 'rgba(255,255,255,0.1)', zIndex: 0 }} />
              <div style={{ position: 'absolute', top: 12, left: '10%', width: `${(currentStage / 4) * 80}%`, height: 2, background: '#06b6d4', zIndex: 0, transition: 'width 0.5s ease' }} />
              
              {['Order Created', 'Deposit Pending', 'Confirming', 'Exchanging', 'Delivered'].map((stepName, idx) => {
                const isPassed = currentStage >= idx;
                const isCurrent = currentStage === idx;
                return (
                  <div key={stepName} style={{ zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <div style={{ 
                      width: 26, height: 26, borderRadius: '50%', 
                      background: isPassed ? '#06b6d4' : '#1e293b', 
                      color: isPassed ? '#ffffff' : '#64748b',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 700,
                      border: isCurrent ? '3px solid #22d3ee' : 'none',
                      boxShadow: isCurrent ? '0 0 12px rgba(34, 211, 238, 0.5)' : 'none'
                    }}>
                      {isPassed ? '✓' : idx + 1}
                    </div>
                    <span style={{ fontSize: 10, color: isPassed ? '#f8fafc' : '#64748b', fontWeight: isCurrent ? 700 : 500 }}>
                      {stepName}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Swap Amounts Card */}
          <div style={{ background: 'rgba(0,0,0,0.3)', padding: 16, borderRadius: 14, marginBottom: 20 }}>
            <div className="detailRow">
              <span>Deposit Amount</span>
              <span className="detailValue" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <TokenIcon currency={fromTicker} size={18} /> {status.amountSend || status.amountExpectedFrom || '-'} {fromTicker}
              </span>
            </div>
            <div className="detailRow">
              <span>Receiving Amount</span>
              <span className="detailValue" style={{ color: '#22d3ee', display: 'flex', alignItems: 'center', gap: 6 }}>
                <TokenIcon currency={toTicker} size={18} /> {status.amountReceive || status.amountExpectedTo || '-'} {toTicker}
              </span>
            </div>
            {status.payinAddress && (
              <div className="detailRow" style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <span>Deposit Address</span>
                <span className="addressText" style={{ fontSize: 12 }}>{status.payinAddress.slice(0, 10)}...{status.payinAddress.slice(-8)}</span>
              </div>
            )}
            {status.payoutAddress && (
              <div className="detailRow">
                <span>Destination Address</span>
                <span className="addressText" style={{ fontSize: 12 }}>{status.payoutAddress.slice(0, 10)}...{status.payoutAddress.slice(-8)}</span>
              </div>
            )}
          </div>

          {/* Explorer Links */}
          {(status.payinHash || status.payoutHash) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {status.payinHash && (
                <a 
                  href={changeNowService.getExplorerUrl(fromTicker, status.payinHash)}
                  target="_blank" 
                  rel="noreferrer"
                  className="walletLinkBtn"
                >
                  Deposit Transaction Explorer <ExternalLink size={14} />
                </a>
              )}
              {status.payoutHash && (
                <a 
                  href={changeNowService.getExplorerUrl(toTicker, status.payoutHash)}
                  target="_blank" 
                  rel="noreferrer"
                  className="walletLinkBtn"
                  style={{ borderColor: 'rgba(34, 197, 94, 0.3)', color: '#4ade80' }}
                >
                  Payout Transaction Explorer <ExternalLink size={14} />
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
