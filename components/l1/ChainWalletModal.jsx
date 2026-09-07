import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Wallet, XCircle, ArrowRight, ExternalLink } from 'lucide-react';
import { WalletIcon } from './TokenIcon';
import { changeNowService } from '../../services/changeNowService';

export function ChainWalletModal({ ticker = 'LTC', onClose, onConnectTrustWallet, openConnectModal, nativeLtcAddress = '', onSaveLtcAddress }) {
  const [isTrustInstalled, setIsTrustInstalled] = useState(false);
  const [ltcInput, setLtcInput] = useState(nativeLtcAddress || '');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const wallets = changeNowService.getRecommendedWallets(ticker);
  const isLtc = ticker.toLowerCase() === 'ltc';

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

  const handleSaveLtc = () => {
    if (onSaveLtcAddress) {
      onSaveLtcAddress(ltcInput.trim());
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        onClose();
      }, 800);
    }
  };

  const handleWalletClick = (w) => {
    const isTrust = w.name.toLowerCase().includes('trust');

    if (isTrust && onConnectTrustWallet) {
      onConnectTrustWallet();
      onClose();
      return;
    }

    if (openConnectModal) {
      openConnectModal();
      onClose();
      return;
    }

    onClose();
  };

  return (
    <div className="modalOverlay" onClick={onClose}>
      <motion.div 
        className="modalContent"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: 460 }}
      >
        <div className="modalHeader">
          <h3 className="modalTitle" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Wallet size={20} color="#38bdf8" /> Connect {ticker} Wallet
          </h3>
          <button className="closeButton" onClick={onClose}><XCircle size={20} /></button>
        </div>

        <div style={{ padding: 20 }}>
          {/* Native LTC Connection Card */}
          {isLtc && (
            <div style={{ padding: 16, background: 'rgba(10, 15, 30, 0.7)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: 16, marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#38bdf8', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                ⚡ Connect Native Litecoin (LTC) Wallet Address
              </div>
              <p style={{ margin: '0 0 10px 0', fontSize: 11, color: '#94a3b8', lineHeight: 1.4 }}>
                Enter your LTC address from <strong>Cake Wallet</strong> or <strong>Trust Wallet</strong> (native LTC) to auto-fill recipient/refund addresses.
              </p>
              
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <input
                  type="text"
                  placeholder="Paste LTC address (ltc1q... or L... or M...)"
                  value={ltcInput}
                  onChange={(e) => setLtcInput(e.target.value)}
                  style={{
                    flex: 1,
                    background: 'rgba(0, 0, 0, 0.4)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 10,
                    padding: '10px 12px',
                    color: '#f8fafc',
                    fontSize: 12,
                    fontFamily: 'monospace',
                    outline: 'none'
                  }}
                />
                <button
                  onClick={handleSaveLtc}
                  style={{
                    background: saveSuccess ? '#0284c7' : 'linear-gradient(135deg, #0284c7, #38bdf8)',
                    border: 'none',
                    borderRadius: 10,
                    color: '#fff',
                    padding: '10px 14px',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {saveSuccess ? 'Saved ✓' : 'Connect LTC'}
                </button>
              </div>

              {nativeLtcAddress && (
                <div style={{ fontSize: 11, color: '#38bdf8', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Connected: {nativeLtcAddress.slice(0, 10)}...{nativeLtcAddress.slice(-6)}</span>
                  <button 
                    onClick={() => { if (onSaveLtcAddress) onSaveLtcAddress(''); setLtcInput(''); }}
                    style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Disconnect
                  </button>
                </div>
              )}
            </div>
          )}

          {isTrustInstalled && (
            <div 
              onClick={() => {
                if (onConnectTrustWallet) onConnectTrustWallet();
                else if (openConnectModal) openConnectModal();
                onClose();
              }}
              style={{
                padding: '14px 16px',
                background: 'linear-gradient(135deg, rgba(2, 132, 199, 0.25), rgba(56, 189, 248, 0.25))',
                border: '1px solid rgba(56, 189, 248, 0.5)',
                borderRadius: 16,
                marginBottom: 16,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                transition: 'all 0.2s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 18 }}>
                  🛡
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#38bdf8' }}>Trust Wallet Extension Detected</div>
                  <div style={{ fontSize: 11, color: '#bae6fd' }}>Click to connect extension directly</div>
                </div>
              </div>
              <span style={{ padding: '6px 12px', background: '#0284c7', borderRadius: 10, fontSize: 12, fontWeight: 700, color: '#fff' }}>
                Connect ⚡
              </span>
            </div>
          )}

          {isLtc && (
            <div style={{ padding: 14, background: 'rgba(59, 130, 246, 0.12)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: 16, marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#60a5fa', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                <img src="https://cakewallet.com/img/cake_logo.png" alt="Cake Wallet" style={{ width: 20, height: 20, borderRadius: 4 }} /> Cake Wallet Integration for Litecoin
              </div>
              <p style={{ margin: 0, fontSize: 12, color: '#cbd5e1', lineHeight: 1.5 }}>
                Cake Wallet is installed on your laptop/mobile device. Enter your LTC address above to connect, or click Create Swap Order to send payment with 1-click Cake Wallet app links.
              </p>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {wallets.map(w => {
              const isTrust = w.name.toLowerCase().includes('trust');
              return (
                <div
                  key={w.name}
                  onClick={() => handleWalletClick(w)}
                  style={{ 
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
                    padding: '14px 16px', background: 'rgba(10, 15, 30, 0.6)', 
                    border: isTrust && isTrustInstalled ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)', 
                    borderRadius: 14,
                    color: '#f8fafc', transition: 'all 0.2s',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <WalletIcon wallet={w} size={28} />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {w.name}
                        {isTrust && isTrustInstalled && (
                          <span style={{ fontSize: 10, background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', padding: '2px 6px', borderRadius: 6, fontWeight: 700 }}>
                            Installed
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>
                        {isTrust && isTrustInstalled ? 'Click to connect browser extension' : 'Click to connect wallet'}
                      </div>
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 12, color: '#38bdf8', fontWeight: 600, padding: '4px 10px', background: 'rgba(6, 182, 212, 0.12)', borderRadius: 8 }}>
                      Connect ⚡
                    </span>
                    <a
                      href={w.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      title={`Visit ${w.name} website`}
                      style={{ fontSize: 11, color: '#64748b', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 2, padding: '4px 6px', borderRadius: 6, background: 'rgba(255,255,255,0.05)' }}
                    >
                      <ExternalLink size={12} />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>

          <button 
            className="primaryButton"
            onClick={() => {
              if (openConnectModal) openConnectModal();
              else onClose();
            }}
            style={{ marginTop: 20, padding: 14, fontSize: 14 }}
          >
            Open All Web3 Wallets <ArrowRight size={16} />
          </button>
        </div>
      </motion.div>
    </div>
  );
}
