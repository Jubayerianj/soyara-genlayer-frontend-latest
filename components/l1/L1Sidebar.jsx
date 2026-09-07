import React, { useState, useEffect } from 'react';
import { Wallet, Clock } from 'lucide-react';
import { TokenIcon } from './TokenIcon';

export function WalletGuideSidebar() {
  return (
    <div className="sidebarCard">
      <h3 className="sidebarTitle">
        <Wallet size={18} /> Wallet Support (Desktop & Mobile)
      </h3>
      <p className="sidebarText" style={{ marginBottom: 12 }}>
        Native Layer-1 networks connect seamlessly on desktop and mobile:
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, background: 'rgba(10, 15, 30, 0.6)', borderRadius: 10 }}>
          <img src="https://cakewallet.com/img/cake_logo.png" alt="Cake Wallet" style={{ width: 22, height: 22, borderRadius: 4 }} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#f8fafc' }}>Cake Wallet (Laptop & Mobile)</div>
            <div style={{ fontSize: 10, color: '#94a3b8' }}>Litecoin, MWEB, Bitcoin, Monero</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, background: 'rgba(10, 15, 30, 0.6)', borderRadius: 10 }}>
          <div style={{ width: 22, height: 22, borderRadius: 4, background: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12 }}>
            🛡
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#f8fafc' }}>Trust Wallet (Browser & App)</div>
            <div style={{ fontSize: 10, color: '#94a3b8' }}>Multi-Chain L1 & Web3 Extension</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TransactionHistoryCard({ onSelectTx }) {
  const [history, setHistory] = useState([]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = JSON.parse(localStorage.getItem('litvm_l1_tx_history') || '[]');
        setHistory(saved);
      } catch (err) {
        console.error('Failed to load tx history:', err);
      }
    }
  }, []);

  if (history.length === 0) return null;

  return (
    <div className="sidebarCard">
      <h3 className="sidebarTitle" style={{ justifyContent: 'space-between' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Clock size={18} /> Recent L1 Swaps
        </span>
        <span style={{ fontSize: 11, background: 'rgba(255,255,255,0.08)', padding: '2px 8px', borderRadius: 10, color: '#94a3b8' }}>
          {history.length}
        </span>
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
        {history.slice(0, 5).map(tx => (
          <div 
            key={tx.id}
            onClick={() => onSelectTx(tx.id)}
            style={{ 
              padding: '10px 12px', background: 'rgba(10, 15, 30, 0.6)', 
              borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)',
              cursor: 'pointer', transition: 'all 0.2s'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700 }}>
                <TokenIcon currency={tx.from} size={16} /> {tx.from.toUpperCase()} → <TokenIcon currency={tx.to} size={16} /> {tx.to.toUpperCase()}
              </div>
              <span style={{ fontSize: 10, color: '#38bdf8', fontFamily: 'monospace' }}>
                #{tx.id.slice(0, 8)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8' }}>
              <span>{tx.amount} {tx.from.toUpperCase()}</span>
              <span>{new Date(tx.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
