// components/liquidityComponents/AdvancedSettings.jsx
import React, { useState } from 'react';
import styles from './Liquidity.module.css';

const AdvancedSettings = ({
  slippage,
  setSlippage,
  deadlineMinutes,
  setDeadlineMinutes,
  isSubmitting,
  approvingToken,
  tokenA,
  tokenB,
  formattedBalanceA,
  formattedBalanceB,
  pairAddress,
  ETHERS_CONSTANTS,
  formattedAmountAMin,
  formattedAmountBMin,
  tokenABalance,
  tokenBBalance,
  parsedAmountA,
  parsedAmountB
}) => {
  const [isOpen, setIsOpen] = useState(false);

  // Format address for display
  const formatAddress = (address) => {
    if (!address) return '';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  // Calculate balance percentage used
  const getBalancePercentageUsed = (balance, parsedAmount) => {
    if (!balance || !parsedAmount || balance === 0n) return 0;
    return (Number(parsedAmount) / Number(balance)) * 100;
  };

  return (
    <div className={styles.advancedSettings}>
      <div 
        className={styles.advancedHeader}
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className={styles.advancedHeaderContent}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" 
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            />
          </svg>
          <span>Advanced Settings</span>
        </div>
        <div className={styles.advancedHeaderArrow}>
          <svg 
            width="16" 
            height="16" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor"
            style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
          >
            <path d="M6 9l6 6 6-6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>

      {isOpen && (
        <div className={styles.advancedContent}>
          {/* Slippage Tolerance */}
          <div className={styles.settingGroup}>
            <div className={styles.settingLabel}>
              <span>Slippage Tolerance</span>
              <span className={styles.slippageValue}>{slippage}%</span>
            </div>
            <div className={styles.slippageOptions}>
              {[0.1, 0.5, 1.0, 3.0].map((option) => (
                <button
                  key={option}
                  className={`${styles.slippageOption} ${slippage === option ? styles.activeSlippage : ''}`}
                  onClick={() => setSlippage(option)}
                  disabled={isSubmitting || approvingToken}
                  type="button"
                >
                  {option}%
                </button>
              ))}
              <div className={styles.customSlippage}>
                <input
                  type="number"
                  value={slippage}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value);
                    if (!isNaN(value) && value >= 0.1 && value <= 50) {
                      setSlippage(value);
                    }
                  }}
                  min="0.1"
                  max="50"
                  step="0.1"
                  disabled={isSubmitting || approvingToken}
                  className={styles.slippageInput}
                />
                <span>%</span>
              </div>
            </div>
            <div className={styles.settingDescription}>
              Your transaction will revert if the price changes unfavorably by more than this percentage.
            </div>
          </div>

          {/* Transaction Deadline */}
          <div className={styles.settingGroup}>
            <div className={styles.settingLabel}>
              <span>Transaction Deadline</span>
              <span className={styles.deadlineValue}>{deadlineMinutes} mins</span>
            </div>
            <div className={styles.deadlineInputGroup}>
              <input
                type="range"
                min="1"
                max="120"
                value={deadlineMinutes}
                onChange={(e) => setDeadlineMinutes(parseInt(e.target.value))}
                disabled={isSubmitting || approvingToken}
                className={styles.deadlineSlider}
              />
              <div className={styles.deadlineOptions}>
                {[5, 10, 20, 30, 60].map((mins) => (
                  <button
                    key={mins}
                    className={`${styles.deadlineOption} ${deadlineMinutes === mins ? styles.activeDeadline : ''}`}
                    onClick={() => setDeadlineMinutes(mins)}
                    disabled={isSubmitting || approvingToken}
                    type="button"
                  >
                    {mins}m
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.settingDescription}>
              Your transaction will revert if it is pending for more than this period of time.
            </div>
          </div>

          {/* Minimum Amounts */}
          {(parsedAmountA > 0n || parsedAmountB > 0n) && (
            <div className={styles.settingGroup}>
              <div className={styles.settingLabel}>
                <span>Minimum Received</span>
              </div>
              <div className={styles.minAmountsGroup}>
                {tokenA && parsedAmountA > 0n && (
                  <div className={styles.minAmountItem}>
                    <span>{tokenA.symbol}:</span>
                    <span>{formattedAmountAMin || '0'}</span>
                  </div>
                )}
                {tokenB && parsedAmountB > 0n && (
                  <div className={styles.minAmountItem}>
                    <span>{tokenB.symbol}:</span>
                    <span>{formattedAmountBMin || '0'}</span>
                  </div>
                )}
              </div>
              <div className={styles.settingDescription}>
                Minimum amounts you will receive based on {slippage}% slippage tolerance.
              </div>
            </div>
          )}

          {/* Balance Status */}
          {(tokenA || tokenB) && (
            <div className={styles.settingGroup}>
              <div className={styles.settingLabel}>
                <span>Balance Status</span>
              </div>
              <div className={styles.balanceStatusGroup}>
                {tokenA && (
                  <div className={styles.balanceItem}>
                    <div className={styles.balanceInfo}>
                      <span>{tokenA.symbol} Balance:</span>
                      <span>{formattedBalanceA} {tokenA.symbol}</span>
                    </div>
                    {parsedAmountA > 0n && tokenABalance > 0n && (
                      <div className={styles.balanceProgress}>
                        <div className={styles.balanceProgressBar}>
                          <div 
                            className={styles.balanceProgressFill}
                            style={{ 
                              width: `${Math.min(getBalancePercentageUsed(tokenABalance, parsedAmountA), 100)}%`,
                              backgroundColor: getBalancePercentageUsed(tokenABalance, parsedAmountA) > 90 ? '#ff6b6b' : 
                                            getBalancePercentageUsed(tokenABalance, parsedAmountA) > 50 ? '#ffa726' : '#4cd964'
                            }}
                          />
                        </div>
                        <span className={styles.balancePercentage}>
                          {Math.round(getBalancePercentageUsed(tokenABalance, parsedAmountA))}% used
                        </span>
                      </div>
                    )}
                  </div>
                )}
                {tokenB && (
                  <div className={styles.balanceItem}>
                    <div className={styles.balanceInfo}>
                      <span>{tokenB.symbol} Balance:</span>
                      <span>{formattedBalanceB} {tokenB.symbol}</span>
                    </div>
                    {parsedAmountB > 0n && tokenBBalance > 0n && (
                      <div className={styles.balanceProgress}>
                        <div className={styles.balanceProgressBar}>
                          <div 
                            className={styles.balanceProgressFill}
                            style={{ 
                              width: `${Math.min(getBalancePercentageUsed(tokenBBalance, parsedAmountB), 100)}%`,
                              backgroundColor: getBalancePercentageUsed(tokenBBalance, parsedAmountB) > 90 ? '#ff6b6b' : 
                                            getBalancePercentageUsed(tokenBBalance, parsedAmountB) > 50 ? '#ffa726' : '#4cd964'
                            }}
                          />
                        </div>
                        <span className={styles.balancePercentage}>
                          {Math.round(getBalancePercentageUsed(tokenBBalance, parsedAmountB))}% used
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Pair Contract */}
          {pairAddress && pairAddress !== ETHERS_CONSTANTS.ZeroAddress && (
            <div className={styles.settingGroup}>
              <div className={styles.settingLabel}>
                <span>Pair Contract</span>
              </div>
              <div className={styles.pairContract}>
                <div className={styles.contractAddress}>
                  <span className={styles.addressLabel}>Address:</span>
                  <span className={styles.addressValue}>{formatAddress(pairAddress)}</span>
                </div>
                <a
                  href={`https://liteforge.explorer.caldera.xyz/address/${pairAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.etherscanLink}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M15 3h6v6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M10 14L21 3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  View on Explorer
                </a>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdvancedSettings;