import React, { useState, useEffect } from 'react';
import { Wallet } from 'lucide-react';
import { WalletIcon } from './TokenIcon';
import { changeNowService } from '../../services/changeNowService';

export function RecommendedWalletTip({ ticker = 'LTC', onConnectTrustWallet, openConnectModal }) {
  const [isTrustInstalled, setIsTrustInstalled] = useState(false);
  const wallets = changeNowService.getRecommendedWallets(ticker);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const installed = Boolean(
        window.trustwallet ||
        window.ethereum?.isTrust ||
        window.ethereum?.isTrustWallet ||
        (window.ethereum?.providers && window.ethereum.providers.some(p => p.isTrust || p.isTrustWallet))
      );
      setIsTrustInstalled(installed);
    }
  }, []);

  return (
    <div style={{ marginTop: 16, padding: '12px 14px', background: 'rgba(10, 15, 30, 0.5)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#38bdf8' }}>
          <Wallet size={14} /> Recommended Wallets for {ticker}:
        </div>
        {isTrustInstalled && (
          <span 
            onClick={() => { if (onConnectTrustWallet) onConnectTrustWallet(); else if (openConnectModal) openConnectModal(); }}
            style={{ fontSize: 11, color: '#34d399', fontWeight: 700, cursor: 'pointer', background: 'rgba(16, 185, 129, 0.15)', padding: '2px 8px', borderRadius: 8, border: '1px solid rgba(16, 185, 129, 0.3)' }}
          >
            🛡 Trust Wallet Connected/Ready
          </span>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {wallets.map(w => {
          const isTrust = w.name.toLowerCase().includes('trust');
          return (
            <button
              key={w.name}
              onClick={() => {
                if (isTrust && onConnectTrustWallet) onConnectTrustWallet();
                else if (openConnectModal) openConnectModal();
              }}
              style={{ 
                display: 'inline-flex', alignItems: 'center', gap: 6, 
                padding: '6px 14px', background: isTrust && isTrustInstalled ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.06)', 
                borderRadius: 20, fontSize: 11, color: isTrust && isTrustInstalled ? '#34d399' : '#e2e8f0',
                fontWeight: 600, border: isTrust && isTrustInstalled ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(255,255,255,0.08)',
                cursor: 'pointer'
              }}
            >
              <WalletIcon wallet={w} size={16} /> Connect {w.name} {isTrust ? '⚡' : ''}
            </button>
          );
        })}
      </div>
    </div>
  );
}
