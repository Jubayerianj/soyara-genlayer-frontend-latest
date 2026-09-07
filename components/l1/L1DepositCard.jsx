import React, { useState } from 'react';
import { CheckCircle, Loader2, Check, Copy, Smartphone, Search, ExternalLink } from 'lucide-react';
import { TokenIcon } from './TokenIcon';
import { changeNowService } from '../../services/changeNowService';

export function L1DepositCard({ 
  transaction, 
  txStatus, 
  fromStr, 
  toStr, 
  fromTickerLow, 
  toTickerLow, 
  fromUsdPrice, 
  isPrivate, 
  formatStatus,
  onSwitchToTrack, 
  reset 
}) {
  const [copySuccess, setCopySuccess] = useState('');

  const currentStatusStr = txStatus?.status || 'waiting';
  const statusInfo = formatStatus(currentStatusStr);

  // Explicitly extract send deposit amount (source ticker e.g. 1 LTC)
  const sendAmount = transaction?.sendAmount || txStatus?.amountSend || txStatus?.amountExpectedFrom || '1';

  // Explicitly extract receive payout amount (target ticker e.g. 0.0236726 ETH)
  const receiveAmount = txStatus?.amountReceive || txStatus?.amountExpectedTo || transaction?.receiveAmount || '-';

  const getDepositUri = (ticker, addr, amt) => {
    const t = ticker.toLowerCase();
    if (t === 'ltc') return `litecoin:${addr}?amount=${amt}`;
    if (t === 'btc') return `bitcoin:${addr}?amount=${amt}`;
    if (t === 'xmr') return `monero:${addr}?tx_amount=${amt}`;
    if (t === 'doge') return `dogecoin:${addr}?amount=${amt}`;
    if (t === 'sol') return `solana:${addr}?amount=${amt}`;
    if (t === 'eth' || t === 'bsc' || t === 'polygon' || t === 'arb') return `ethereum:${addr}?value=${amt}`;
    return `${t}:${addr}?amount=${amt}`;
  };

  const depositUri = getDepositUri(fromTickerLow, transaction.payinAddress, sendAmount);
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(depositUri)}&color=0f172a&bg=ffffff`;

  const getStageNum = (st) => {
    switch (st) {
      case 'new': return 1;
      case 'waiting': return 2;
      case 'confirming': return 3;
      case 'exchanging': return 4;
      case 'sending': return 5;
      case 'finished': return 6;
      default: return 2;
    }
  };

  const currentStage = getStageNum(currentStatusStr);

  const stagesList = [
    { num: 1, name: 'Created' },
    { num: 2, name: 'Awaiting Deposit' },
    { num: 3, name: 'Confirming' },
    { num: 4, name: 'Exchanging' },
    { num: 5, name: 'Sending to You' },
  ];

  const copyToClipboard = (text, type) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopySuccess(type);
      setTimeout(() => setCopySuccess(''), 2000);
    }
  };

  return (
    <div className={`swapCard ${isPrivate ? 'private' : ''}`}>
      <div className="activeTxView">
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ background: 'rgba(6, 182, 212, 0.15)', color: '#22d3ee', padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
            ORDER ID: {transaction.id}
          </span>
          
          <div style={{ 
            display: 'flex', alignItems: 'center', gap: 6, 
            padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, 
            background: statusInfo.color + '25', color: statusInfo.color,
            border: `1px solid ${statusInfo.color}50`
          }}>
            {statusInfo.pulsing && <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusInfo.color, animation: 'pulse 1.5s infinite' }} />}
            {statusInfo.label}
          </div>
        </div>

        <h2 style={{ margin: '0 0 16px 0', fontSize: '22px', fontWeight: 800 }}>
          {isPrivate ? 'Private Transfer Created' : 'Non-Custodial Swap Order'}
        </h2>

        {/* ChangeNOW 5-Step Visual Stepper Bar */}
        <div style={{ margin: '0 0 20px 0', padding: '16px 14px', background: 'rgba(10, 15, 30, 0.7)', borderRadius: 16, border: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 12, letterSpacing: '0.5px', textAlign: 'left' }}>
            LitVMSwap Progress Tracker (Live 5s Polling)
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
            {stagesList.map((st) => {
              const isDone = currentStage > st.num;
              const isCurrent = currentStage === st.num;

              let circleBg = 'rgba(255,255,255,0.08)';
              let circleColor = '#64748b';
              let circleBorder = '1px solid rgba(255,255,255,0.1)';

              if (isDone) {
                circleBg = '#0284c7';
                circleColor = '#ffffff';
                circleBorder = 'none';
              } else if (isCurrent) {
                circleBg = statusInfo.color;
                circleColor = '#ffffff';
                circleBorder = `2px solid ${statusInfo.color}`;
              }

              return (
                <div key={st.num} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, zIndex: 2 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: circleBg, color: circleColor, border: circleBorder,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 800, fontSize: 12, transition: 'all 0.3s ease',
                    boxShadow: isCurrent ? `0 0 10px ${statusInfo.color}80` : 'none'
                  }}>
                    {isDone ? <Check size={14} color="#fff" /> : st.num}
                  </div>
                  <span style={{ 
                    fontSize: 10, marginTop: 6, fontWeight: isCurrent ? 700 : 500,
                    color: isCurrent ? '#f8fafc' : isDone ? '#38bdf8' : '#64748b',
                    textAlign: 'center', lineHeight: 1.1
                  }}>
                    {st.name}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Dynamic Status Banner */}
        {currentStatusStr === 'finished' ? (
          <div style={{ padding: 16, background: 'rgba(2, 132, 199, 0.15)', border: '1px solid rgba(2, 132, 199, 0.4)', borderRadius: 16, marginBottom: 20, textAlign: 'left' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#38bdf8', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircle size={20} /> Swap Completed Successfully!
            </div>
            <p style={{ margin: '0 0 10px 0', fontSize: 12, color: '#cbd5e1' }}>
              Your funds have been delivered to recipient address: <strong>{transaction.payoutAddress}</strong>
            </p>
            {txStatus?.payoutHash && (
              <a 
                href={changeNowService.getExplorerUrl(toTickerLow, txStatus.payoutHash)} 
                target="_blank" 
                rel="noreferrer" 
                style={{ fontSize: 12, color: '#38bdf8', fontWeight: 700, textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                View Payout Tx on Blockchain Explorer <ExternalLink size={12} />
              </a>
            )}
          </div>
        ) : currentStatusStr === 'confirming' || currentStatusStr === 'exchanging' || currentStatusStr === 'sending' ? (
          <div style={{ padding: 16, background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.4)', borderRadius: 16, marginBottom: 20, textAlign: 'left' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#60a5fa', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> {statusInfo.label} in Progress...
            </div>
            <p style={{ margin: 0, fontSize: 12, color: '#cbd5e1' }}>
              Deposit detected on-chain! LitVMSwap is executing your swap. This page will update automatically.
            </p>
          </div>
        ) : (
          /* Deposit Instructions Card (when waiting) */
          <div className="depositCard">
            <h3 className="depositTitle">1. Send Deposit Amount</h3>
            <div className="depositAmount">
              <TokenIcon currency={fromTickerLow} size={28} /> {sendAmount} {fromStr}
              <button 
                className="copyButton" 
                onClick={() => copyToClipboard(sendAmount, 'amount')}
              >
                {copySuccess === 'amount' ? <Check size={14} color="#38bdf8" /> : <Copy size={14} />} Copy
              </button>
            </div>
            {fromUsdPrice > 0 && (
              <div style={{ fontSize: 13, color: '#94a3b8', marginTop: -14, marginBottom: 16 }}>
                ≈ ${(Number(sendAmount) * fromUsdPrice).toFixed(2)} USD
              </div>
            )}

            {/* Expected Receive Payout Info */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(0,0,0,0.2)', borderRadius: 12, marginBottom: 16, fontSize: 12 }}>
              <span style={{ color: '#94a3b8' }}>Expected Payout:</span>
              <span style={{ color: '#22d3ee', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                <TokenIcon currency={toTickerLow} size={16} /> ~ {receiveAmount} {toStr}
              </span>
            </div>
            
            <h3 className="depositTitle">2. To This Deposit Address</h3>
            <div className="depositAddressBox">
              <span className="addressText">{transaction.payinAddress}</span>
              <button 
                className="copyButton" 
                onClick={() => copyToClipboard(transaction.payinAddress, 'address')}
              >
                {copySuccess === 'address' ? <Check size={14} color="#38bdf8" /> : <Copy size={14} />} Copy
              </button>
            </div>

            {/* QR Code */}
            <div className="qrBox">
              <img src={qrUrl} alt="Deposit QR Code" className="qrImg" />
              <p style={{ margin: '8px 0 0 0', fontSize: 11, color: '#475569', fontWeight: 600 }}>
                Scan on Desktop or Tap Mobile Link Below
              </p>
            </div>

            {/* Desktop & Mobile Universal Link Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              <a href={depositUri} className="walletLinkBtn" style={{ background: 'linear-gradient(135deg, rgba(244, 114, 182, 0.2), rgba(59, 130, 246, 0.2))', borderColor: 'rgba(244, 114, 182, 0.4)', color: '#f472b6', fontWeight: 700 }}>
                🍰 Open Payment in Cake Wallet App (Laptop & Mobile)
              </a>
              <a href={depositUri} className="walletLinkBtn">
                <Smartphone size={16} /> Open in Trust Wallet / Native Crypto Wallet
              </a>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
          <button 
            className="primaryButton"
            onClick={() => onSwitchToTrack(transaction.id)}
            style={{ flex: 1, margin: 0 }}
          >
            <Search size={16} /> Open Detailed Live Tracker
          </button>
          <button 
            className="copyButton"
            onClick={reset}
            style={{ padding: '16px 20px', borderRadius: 16 }}
          >
            New Swap
          </button>
        </div>
      </div>
    </div>
  );
}
