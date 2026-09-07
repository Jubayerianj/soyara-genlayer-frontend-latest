// components/swapComponents/RatesInfoDropDown.jsx
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Info, Zap, Shield, TrendingDown, Clock } from 'lucide-react';
import styles from './RatesInfoDropdown.module.css';

const RatesInfoDropdown = ({
  exchangeRate,
  priceImpact,
  minimumReceived,
  slippageTolerance,
  fromToken,
  toToken,
  fromAmount,
  toAmount,
  networkFee,
  isLoading = false
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const formatExchangeRate = () => {
    if (!exchangeRate?.rate || !fromToken || !toToken) return '-';
    try {
      const r = exchangeRate.rate;
      let rFormatted = '';
      if (r >= 1000000) rFormatted = `${(r / 1000000).toFixed(2)}M`;
      else if (r >= 1000) rFormatted = `${(r / 1000).toFixed(2)}K`;
      else if (r >= 1) rFormatted = r.toFixed(4);
      else rFormatted = r.toFixed(6);

      return `1 ${fromToken.symbol} = ${rFormatted} ${toToken.symbol}`;
    } catch (error) {
      console.error('Error formatting exchange rate:', error);
      return '-';
    }
  };

  const formatPriceImpact = () => {
    if (priceImpact === undefined || priceImpact === null) return '-';
    const impact = typeof priceImpact === 'number' ? priceImpact : parseFloat(priceImpact);
    if (isNaN(impact)) return '-';
    const getColorClass = () => {
      if (impact > 50) return styles.critical;
      if (impact > 20) return styles.high;
      if (impact > 5) return styles.warning;
      return styles.normal;
    };
    return (
      <span className={`${styles.priceImpact} ${getColorClass()}`}>
        {impact.toFixed(2)}%
      </span>
    );
  };

  const formatMinimumReceived = () => {
    if (!minimumReceived || !toToken) return '-';
    try {
      const minAmount = typeof minimumReceived === 'number' 
        ? minimumReceived 
        : parseFloat(minimumReceived);
      if (isNaN(minAmount) || minAmount <= 0) return '-';
      if (minAmount >= 1000000) {
        return `${(minAmount / 1000000).toFixed(3)}M ${toToken.symbol}`;
      } else if (minAmount >= 1000) {
        return `${(minAmount / 1000).toFixed(3)}K ${toToken.symbol}`;
      } else if (minAmount >= 1) {
        return `${minAmount.toFixed(4)} ${toToken.symbol}`;
      } else if (minAmount >= 0.001) {
        return `${minAmount.toFixed(6)} ${toToken.symbol}`;
      } else {
        return `${minAmount.toExponential(4)} ${toToken.symbol}`;
      }
    } catch (error) {
      console.error('Error formatting minimum received:', error);
      return '-';
    }
  };

  const formatSlippageTolerance = () => {
    if (slippageTolerance === undefined || slippageTolerance === null) return '-';
    const slippage = typeof slippageTolerance === 'number' 
      ? slippageTolerance 
      : parseFloat(slippageTolerance);
    if (isNaN(slippage)) return '-';
    const getSlippageClass = () => {
      if (slippage > 10) return styles.critical;
      if (slippage > 5) return styles.high;
      if (slippage > 2) return styles.warning;
      return styles.normal;
    };
    return (
      <span className={getSlippageClass()}>
        {slippage}%
      </span>
    );
  };

  const LoadingSkeleton = () => (
    <div className={styles.loadingSkeleton}>
      <div className={styles.skeletonLine}></div>
      <div className={styles.skeletonLine}></div>
      <div className={styles.skeletonLine}></div>
      <div className={styles.skeletonLine}></div>
    </div>
  );

  const getQuickInfo = () => {
    if (isLoading) return "Loading...";
    if (!fromToken || !toToken || !fromAmount || parseFloat(fromAmount) <= 0) {
      return "Enter amount to see rates";
    }
    try {
      if (exchangeRate?.rate) {
        const rate = exchangeRate.rate.toFixed(6);
        return `1 ${fromToken.symbol} ≈ ${rate} ${toToken.symbol}`;
      }
      return "Calculating...";
    } catch (error) {
      return "Rate unavailable";
    }
  };

  return (
    <div className={styles.container}>
      <motion.button
        className={styles.dropdownHeader}
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        aria-expanded={isOpen}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        type="button"
      >
        <div className={styles.headerContent}>
          <div className={styles.headerLeft}>
            <Zap className={styles.headerIcon} />
            <span className={styles.headerTitle}>Swap Details</span>
          </div>
          <div className={styles.headerRight}>
            <span className={styles.quickInfo}>
              {getQuickInfo()}
            </span>
            <ChevronDown 
              className={`${styles.chevron} ${isOpen ? styles.rotate : ''}`}
              size={16}
            />
          </div>
        </div>
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className={styles.dropdownContent}
          >
            {isLoading ? (
              <LoadingSkeleton />
            ) : (
              <div className={styles.ratesGrid}>
                <div className={styles.rateItem}>
                  <div className={styles.rateLabel}>
                    <div className={styles.labelContent}>
                      <span>Exchange Rate</span>
                      <div className={styles.tooltip}>
                        <Info size={12} />
                        <div className={styles.tooltipContent}>
                          The conversion rate between the two tokens
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className={styles.rateValue}>
                    {formatExchangeRate()}
                  </div>
                </div>



                <div className={styles.rateItem}>
                  <div className={styles.rateLabel}>
                    <div className={styles.labelContent}>
                      <span>Minimum Received</span>
                      <div className={styles.tooltip}>
                        <Info size={12} />
                        <div className={styles.tooltipContent}>
                          Minimum amount you will receive after slippage
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className={styles.rateValue}>
                    {formatMinimumReceived()}
                  </div>
                </div>

                <div className={styles.rateItem}>
                  <div className={styles.rateLabel}>
                    <div className={styles.labelContent}>
                      <span>Slippage Tolerance</span>
                      <div className={styles.tooltip}>
                        <Info size={12} />
                        <div className={styles.tooltipContent}>
                          Maximum price movement you accept
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className={styles.rateValue}>
                    {formatSlippageTolerance()}
                  </div>
                </div>

                <div className={styles.networkFee}>
                  <div className={styles.feeLabel}>
                    <span>Network Fee</span>
                    <div className={styles.tooltip}>
                      <Info size={12} />
                      <div className={styles.tooltipContent}>
                        Estimated gas fee for this transaction
                      </div>
                    </div>
                  </div>

                  <div className={styles.feeValue}>
                    <span className={styles.feeAmount}>{networkFee || '~$0.001'}</span>
                    <span className={styles.feeNote}>(Estimated)</span>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default RatesInfoDropdown;