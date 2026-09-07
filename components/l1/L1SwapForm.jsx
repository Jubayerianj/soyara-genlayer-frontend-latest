import React, { useState, useEffect, useMemo } from 'react';
import { 
  Loader2, ChevronDown, ArrowDown, Shield, Zap, Info, ArrowRight, Wallet, Check, AlertCircle, RefreshCw
} from 'lucide-react';

import { useChangeNowSwap } from '../../hooks/useChangeNowSwap';
import { changeNowService } from '../../services/changeNowService';
import { TokenIcon } from './TokenIcon';
import { CurrencyModal } from './CurrencyModal';
import { L1DepositCard } from './L1DepositCard';

export function L1SwapForm({ flow = 'standard', onSwitchToTrack }) {
  const isPrivate = flow === 'private';
  const {
    currencies, popularCurrencies, fromCurrency, toCurrency, 
    amount, setFromCurrency, setToCurrency, setAmount, 
    switchCurrencies, estimate, minAmount, estimateLoading, estimateError,
    transaction, txStatus, isCreating, txError, createExchange, 
    startPolling, stopPolling, reset, formatStatus
  } = useChangeNowSwap();

  const [destinationAddress, setDestinationAddress] = useState('');
  const [refundAddress, setRefundAddress] = useState('');
  const [showRefundInput, setShowRefundInput] = useState(false);
  const [showFromModal, setShowFromModal] = useState(false);
  const [showToModal, setShowToModal] = useState(false);

  const fromStr = (typeof fromCurrency === 'string' ? fromCurrency : fromCurrency?.ticker || 'ltc').toUpperCase();
  const toStr = (typeof toCurrency === 'string' ? toCurrency : toCurrency?.ticker || 'btc').toUpperCase();
  const fromTickerLow = fromStr.toLowerCase();
  const toTickerLow = toStr.toLowerCase();

  // USD Price state
  const [usdPrices, setUsdPrices] = useState({
    ltc: 100, btc: 65000, eth: 3500, sol: 150, xmr: 160, doge: 0.12, usdt: 1.0, usdc: 1.0, bnb: 580
  });

  // Fetch USD prices when currencies change
  useEffect(() => {
    async function fetchPrices() {
      try {
        const prices = await changeNowService.getUsdPrices([fromTickerLow, toTickerLow, 'ltc', 'btc', 'eth', 'sol']);
        if (prices && Object.keys(prices).length > 0) {
          setUsdPrices(prev => ({ ...prev, ...prices }));
        }
      } catch (e) {
        console.error('USD price fetch error:', e);
      }
    }
    fetchPrices();
  }, [fromTickerLow, toTickerLow]);

  const fromUsdPrice = usdPrices[fromTickerLow] || 0;
  const toUsdPrice = usdPrices[toTickerLow] || 0;

  const sendAmountUsd = useMemo(() => {
    const num = Number(amount);
    if (!num || isNaN(num) || !fromUsdPrice) return null;
    return (num * fromUsdPrice).toFixed(2);
  }, [amount, fromUsdPrice]);

  const receiveAmountUsd = useMemo(() => {
    const num = Number(estimate?.estimatedAmount);
    if (!num || isNaN(num) || !toUsdPrice) return null;
    return (num * toUsdPrice).toFixed(2);
  }, [estimate, toUsdPrice]);

  // Auto-fill recipient LTC address from local storage if saved
  useEffect(() => {
    if (typeof window !== 'undefined' && toTickerLow === 'ltc' && !destinationAddress) {
      const savedLtc = localStorage.getItem('litvm_native_ltc_address');
      if (savedLtc) setDestinationAddress(savedLtc);
    }
  }, [toTickerLow, destinationAddress]);

  // Auto-start polling if we have an active transaction
  useEffect(() => {
    if (transaction?.id && !txStatus) {
      startPolling(transaction.id);
    }
    return () => stopPolling();
  }, [transaction, txStatus, startPolling, stopPolling]);

  const handleCreateExchange = async () => {
    if (!destinationAddress) return;
    await createExchange(destinationAddress, refundAddress || undefined);
  };

  // Render active transaction deposit screen (Step 2)
  if (transaction) {
    return (
      <L1DepositCard 
        transaction={transaction}
        txStatus={txStatus}
        fromStr={fromStr}
        toStr={toStr}
        fromTickerLow={fromTickerLow}
        toTickerLow={toTickerLow}
        fromUsdPrice={fromUsdPrice}
        isPrivate={isPrivate}
        formatStatus={formatStatus}
        onSwitchToTrack={onSwitchToTrack}
        reset={reset}
      />
    );
  }

  // Render non-custodial swap form (Step 1)
  return (
    <>
      <div className={`swapCard ${isPrivate ? 'private' : ''}`}>
        {/* Top ChangeNOW Badge */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#38bdf8' }}>
            <Zap size={14} /> Layer 1 Trading

          </div>
          <span style={{ fontSize: 11, background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', padding: '3px 10px', borderRadius: 12, fontWeight: 700, border: '1px solid rgba(16, 185, 129, 0.3)' }}>
            No Account Needed ⚡
          </span>
        </div>

        {isPrivate && (
          <div className="privacyBanner">
            <Shield size={24} color="#38bdf8" />
            <div>
              <p style={{ fontWeight: 600, color: '#38bdf8', marginBottom: 4 }}>Private Relay Enabled</p>
              <p>Your transaction is routed through obfuscated network relays to break on-chain address linkability.</p>
            </div>
          </div>
        )}

        {/* You Send Input Section */}
        <div className={`inputSection ${isPrivate ? 'private' : ''}`}>
          <div className="inputHeader">
            <span>You Send</span>
            {sendAmountUsd ? (
              <span style={{ color: '#94a3b8', fontSize: 12 }}>≈ ${sendAmountUsd} USD</span>
            ) : null}
          </div>

          <div className="inputRow">
            <input 
              type="number"
              className="amountInput"
              placeholder="0.0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <button className="currencySelector" onClick={() => setShowFromModal(true)}>
              <TokenIcon currency={fromTickerLow} size={24} />
              {fromStr}
              <ChevronDown size={16} />
            </button>
          </div>
          
          {sendAmountUsd && (
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 6, textAlign: 'left', fontWeight: 500 }}>
              ≈ ${sendAmountUsd} USD
            </div>
          )}
        </div>

        {/* Currency Switcher Toggle */}
        <div className="switchButtonContainer">
          <button className="switchButton" onClick={switchCurrencies} title="Swap direction">
            <ArrowDown size={18} />
          </button>
        </div>

        {/* You Receive Input Section */}
        <div className={`inputSection ${isPrivate ? 'private' : ''}`}>
          <div className="inputHeader">
            <span>You Get {estimateLoading && <Loader2 size={12} style={{ display: 'inline', marginLeft: 4, animation: 'spin 1s linear infinite' }} />}</span>
            {receiveAmountUsd && <span style={{ color: '#22d3ee', fontSize: 12 }}>≈ ${receiveAmountUsd} USD</span>}
          </div>
          <div className="inputRow">
            <input 
              type="text"
              className="amountInput"
              placeholder="0.0"
              value={estimate?.estimatedAmount || ''}
              disabled
            />
            <button className="currencySelector" onClick={() => setShowToModal(true)}>
              <TokenIcon currency={toTickerLow} size={24} />
              {toStr}
              <ChevronDown size={16} />
            </button>
          </div>
          
          {receiveAmountUsd && (
            <div style={{ fontSize: 12, color: '#22d3ee', marginTop: 6, textAlign: 'left', fontWeight: 600 }}>
              ≈ ${receiveAmountUsd} USD
            </div>
          )}
        </div>

        {/* Rate & Minimum Details Box */}
        <div className="swapDetails">
          <div className="detailRow">
            <span>Minimum Amount</span>
            <span className={`detailValue ${minAmount && Number(amount) < minAmount ? 'error' : ''}`}>
              {minAmount ? `${minAmount} ${fromStr}` : '...'}
            </span>
          </div>
          {estimate?.estimatedAmount && (
            <div className="detailRow">
              <span>Estimated Rate</span>
              <span className="detailValue">
                1 {fromStr} ≈ {(estimate.estimatedAmount / (amount || 1)).toFixed(6)} {toStr}
              </span>
            </div>
          )}
          {fromUsdPrice > 0 && (
            <div className="detailRow">
              <span>1 {fromStr} Market Price</span>
              <span className="detailValue" style={{ color: '#38bdf8' }}>
                ${fromUsdPrice.toLocaleString()} USD
              </span>
            </div>
          )}
        </div>

        {/* Error message */}
        {(estimateError || txError) && (
          <div style={{ padding: '10px 14px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 14, color: '#fca5a5', fontSize: 12, marginTop: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertCircle size={14} /> {estimateError || txError}
          </div>
        )}

        {/* Recipient Address Input */}
        <div style={{ marginTop: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', display: 'block', marginBottom: 6, textAlign: 'left' }}>
            Recipient {toStr} Address:
          </label>
          <input 
            type="text"
            className="destinationInput"
            style={{ marginTop: 0 }}
            placeholder={`Enter your recipient ${toStr} address...`}
            value={destinationAddress}
            onChange={(e) => setDestinationAddress(e.target.value)}
          />
        </div>

        {/* Optional Refund Address Section */}
        <div style={{ marginTop: 12, textAlign: 'left' }}>
          <button 
            type="button"
            onClick={() => setShowRefundInput(!showRefundInput)}
            style={{ background: 'none', border: 'none', color: '#38bdf8', fontSize: 11, cursor: 'pointer', padding: 0, fontWeight: 600, textDecoration: 'underline' }}
          >
            {showRefundInput ? '- Hide Refund Address' : '+ Add Refund Address (Optional)'}
          </button>
          
          {showRefundInput && (
            <input 
              type="text"
              className="destinationInput"
              style={{ marginTop: 8 }}
              placeholder={`Optional ${fromStr} refund address in case swap fails...`}
              value={refundAddress}
              onChange={(e) => setRefundAddress(e.target.value)}
            />
          )}
        </div>

        {/* Action Button: Exchange Now */}
        <button 
          className={`primaryButton ${isPrivate ? 'private' : ''}`}
          disabled={!amount || !destinationAddress || isCreating || (minAmount && Number(amount) < minAmount)}
          onClick={handleCreateExchange}
        >
          {isCreating ? (
            <>
              <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Creating Exchange Order...
            </>
          ) : (
            <>
              {isPrivate ? 'Initiate Private Relay' : 'Exchange Now'} <ArrowRight size={18} />
            </>
          )}
        </button>
      </div>

      {showFromModal && (
        <CurrencyModal 
          isOpen={showFromModal}
          onClose={() => setShowFromModal(false)}
          onSelect={(c) => { setFromCurrency(c); setShowFromModal(false); }}
          currencies={currencies}
          popularCurrencies={popularCurrencies}
        />
      )}
      
      {showToModal && (
        <CurrencyModal 
          isOpen={showToModal}
          onClose={() => setShowToModal(false)}
          onSelect={(c) => { setToCurrency(c); setShowToModal(false); }}
          currencies={currencies}
          popularCurrencies={popularCurrencies}
        />
      )}
    </>
  );
}
