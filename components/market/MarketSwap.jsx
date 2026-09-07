'use client';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAccount, useChainId } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { 
  Settings, 
  RefreshCw, 
  ArrowDown, 
  ChevronDown, 
  Zap, 
  Shield, 
  AlertCircle 
} from 'lucide-react';

import { useSwap } from '../../hooks/swap/useSwap';
import { useTokenBalance } from '../../hooks/swap/useTokenBalance';
import { useSwapSettings } from '../../hooks/swap/useSwapSettings';
import { useSwapQuote } from '../../hooks/swap/useSwapQuote';
import { useSwapButtonState } from '../../hooks/swap/useSwapButtonState';
import { TOKEN_LIST } from '../../constants/tokens';

import TokenSelectModal from '../common/TokenSelectModal';
import SwapTransactionModal from '../swapComponents/SwapTransactionModal';
import styles from './MarketSwap.module.css';

const MarketSwap = ({ initialToToken }) => {
  const { address, isConnected } = useAccount();
  const chainId = useChainId() || 4441;
  const { openConnectModal } = useConnectModal();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const [showFromModal, setShowFromModal] = useState(false);
  const [showToModal, setShowToModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const currentTokenList = useMemo(() => TOKEN_LIST[chainId] || TOKEN_LIST[4441] || [], [chainId]);

  const { settings, updateSlippage, updateDeadline } = useSwapSettings();

  const {
    fromToken,
    toToken,
    fromAmount,
    toAmount,
    setFromToken,
    setToToken,
    setFromAmount,
    switchTokens,
    priceImpact,
    minReceived,
    isLoading: quoteLoading,
    error: quoteError,
    refreshQuote,
    quoteData
  } = useSwapQuote({
    ...settings,
    chainId
  });

  const {
    executeSwap,
    approveToken,
    needsApproval,
    isApproving,
    isSwapping,
    transactionStatus,
    resetTransactionStatus,
    wrapETH,
    unwrapWETH,
    refetchAllowance
  } = useSwap({
    fromToken,
    toToken,
    fromAmount,
    toAmount,
    slippage: settings.slippage,
    chainId,
    route: quoteData,
    userAddress: address
  });

  const {
    ethBalance,
    fromTokenBalance,
    toTokenBalance,
    refetchBalances,
    getFormattedBalance
  } = useTokenBalance(address, fromToken, toToken);

  // Set default tokens
  useEffect(() => {
    if (currentTokenList.length > 0) {
      if (!fromToken) {
        const native = currentTokenList.find(t => t.isNative);
        if (native) setFromToken(native);
      }
      if (initialToToken && !toToken) {
        setToToken(initialToToken);
      } else if (!toToken) {
        const defaultTo = currentTokenList.find(t => !t.isNative && t.symbol !== 'wzkLTC');
        if (defaultTo) setToToken(defaultTo);
      }
    }
  }, [chainId, currentTokenList, initialToToken, fromToken, toToken, setFromToken, setToToken]);

  const buttonState = useSwapButtonState({
    fromToken,
    toToken,
    fromAmount,
    toAmount,
    fromTokenBalance,
    toTokenBalance,
    ethBalance,
    quoteData,
    isLoadingQuote: quoteLoading,
    isApproving,
    isSwapping,
    needsApproval,
    hasError: !!quoteError,
    priceImpact,
    slippage: settings.slippage,
    isConnected,
    isCorrectNetwork: true
  });

  const handleButtonClick = async () => {
    if (!isConnected) {
      openConnectModal?.();
      return;
    }

    const state = buttonState.state;
    if (state === 'approve') {
      await approveToken();
    } else if (state === 'swap' || state === 'high_price_impact') {
      await executeSwap();
    } else if (state === 'wrap') {
      await wrapETH();
    } else if (state === 'unwrap') {
      await unwrapWETH();
    }
  };

  const handleMaxClick = () => {
    if (!fromToken) return;
    const balance = fromToken.isNative ? ethBalance : fromTokenBalance;
    if (balance) {
      if (fromToken.isNative) {
        const b = parseFloat(getFormattedBalance(fromToken));
        setFromAmount(Math.max(0, b - 0.01).toString());
      } else {
        setFromAmount(getFormattedBalance(fromToken));
      }
    }
  };

  const tokens = useMemo(() => {
    return currentTokenList.map(t => ({
      ...t,
      balance: getFormattedBalance(t)
    }));
  }, [currentTokenList, getFormattedBalance]);

  if (!mounted) return null;

  return (
    <div className={styles.swapContainer}>
      {transactionStatus.show && (
        <SwapTransactionModal
          transactionHash={transactionStatus.txHash}
          onClose={resetTransactionStatus}
          type={transactionStatus.type}
          isLoading={transactionStatus.status === 'pending'}
          isSuccess={transactionStatus.status === 'success'}
          isError={transactionStatus.status === 'error'}
          errorMessage={transactionStatus.message}
          fromToken={fromToken}
          toToken={toToken}
          fromAmount={fromAmount}
          toAmount={toAmount}
          chainId={chainId}
          onSuccess={() => {
            refetchBalances();
            refreshQuote();
            refetchAllowance();
          }}
        />
      )}

      <div className={styles.swapCard}>
        <div className={styles.cardHeader}>
          <div className={styles.headerLeft}>
            <Zap size={18} className={styles.headerIcon} />
            <h2>Swap</h2>
          </div>
          <div className={styles.headerRight}>
            <button className={styles.iconBtn} onClick={refreshQuote}>
              <RefreshCw size={16} className={quoteLoading ? 'animate-spin' : ''} />
            </button>
            <button className={styles.iconBtn} onClick={() => setShowSettings(!showSettings)}>
              <Settings size={16} />
            </button>
          </div>
        </div>

        <div className={styles.swapArea}>
          <div className={styles.inputSection}>
            <div className={styles.labelRow}>
              <span>From</span>
              <div className={styles.balanceInfo}>
                <span>Balance: {getFormattedBalance(fromToken)}</span>
                <button className={styles.maxBtn} onClick={handleMaxClick}>MAX</button>
              </div>
            </div>
            <div className={styles.inputRow}>
              <input 
                type="number" 
                className={styles.amountInput} 
                placeholder="0.0"
                value={fromAmount}
                onChange={(e) => setFromAmount(e.target.value)}
              />
              <button className={styles.tokenBtn} onClick={() => setShowFromModal(true)}>
                {fromToken ? (
                  <>
                    <img src={fromToken.logoURI} alt={fromToken.symbol} className={styles.tokenIcon} />
                    <span>{fromToken.symbol}</span>
                  </>
                ) : <span>Select</span>}
                <ChevronDown size={14} />
              </button>
            </div>
          </div>

          <div className={styles.switchRow}>
            <button className={styles.switchBtn} onClick={switchTokens}>
              <ArrowDown size={16} />
            </button>
          </div>

          <div className={styles.inputSection}>
            <div className={styles.labelRow}>
              <span>To (Estimated)</span>
              <span>Balance: {getFormattedBalance(toToken)}</span>
            </div>
            <div className={styles.inputRow}>
              <input 
                type="number" 
                className={styles.amountInput} 
                placeholder="0.0"
                value={toAmount}
                readOnly
              />
              <button className={styles.tokenBtn} onClick={() => setShowToModal(true)}>
                {toToken ? (
                  <>
                    <img src={toToken.logoURI} alt={toToken.symbol} className={styles.tokenIcon} />
                    <span>{toToken.symbol}</span>
                  </>
                ) : <span>Select</span>}
                <ChevronDown size={14} />
              </button>
            </div>
          </div>
        </div>

        {fromAmount && toAmount && (
          <div className={styles.priceInfo}>
            1 {fromToken?.symbol} = {(parseFloat(toAmount) / parseFloat(fromAmount)).toFixed(6)} {toToken?.symbol}
          </div>
        )}

        <div className={styles.detailsArea}>
          <div className={styles.detailRow}>
            <span>Price Impact</span>
            <span style={{ color: priceImpact > 5 ? '#ef4444' : '#fff' }}>
              {priceImpact ? `${priceImpact.toFixed(2)}%` : '< 0.01%'}
            </span>
          </div>
          <div className={styles.detailRow}>
            <span>Min. Received</span>
            <span>{minReceived ? `${parseFloat(minReceived).toFixed(4)} ${toToken?.symbol}` : '0.00'}</span>
          </div>
        </div>

        <button 
          className={styles.actionBtn} 
          onClick={handleButtonClick}
          disabled={buttonState.isDisabled || isApproving || isSwapping}
        >
          {isApproving ? 'Approving...' : isSwapping ? 'Swapping...' : buttonState.label}
        </button>

        <div className={styles.footerInfo}>
          <Shield size={12} />
          <span>Secure Trade on LitVM</span>
        </div>
      </div>

      {showFromModal && (
        <TokenSelectModal 
          tokens={tokens}
          onSelect={(t) => { setFromToken(t); setShowFromModal(false); }}
          onClose={() => setShowFromModal(false)}
          selectedToken={fromToken}
        />
      )}

      {showToModal && (
        <TokenSelectModal 
          tokens={tokens}
          onSelect={(t) => { setToToken(t); setShowToModal(false); }}
          onClose={() => setShowToModal(false)}
          selectedToken={toToken}
        />
      )}
    </div>
  );
};

export default MarketSwap;
