// components/swapComponents/SwapTransactionModal.jsx - GORGEOUS BLUE LAGOON DESIGN

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWaitForTransactionReceipt } from 'wagmi';
import { CheckCircle2, XCircle, AlertCircle, ExternalLink, Loader2, ArrowRight, X } from 'lucide-react';
import styles from './SwapTransactionModal.module.css';

const SwapTransactionModal = ({
  transactionHash,
  onClose,
  type = 'swap',
  isLoading = false,
  isSuccess = false,
  isError = false,
  errorMessage = '',
  fromToken = null,
  toToken = null,
  fromAmount = null,
  toAmount = null,
  showCloseButton = true,
  autoCloseDelay = 10000,
  onSuccess,
  chainId = 4441,
}) => {
  const [isVisible, setIsVisible] = useState(true);
  const [hasAutoClosed, setHasAutoClosed] = useState(false);
  const [countdown, setCountdown] = useState(autoCloseDelay / 1000);

  // Track transaction receipt
  const {
    data: receipt,
    isLoading: isTxLoading,
    isSuccess: isTxSuccess,
    isError: isTxError,
  } = useWaitForTransactionReceipt({
    hash: transactionHash,
    confirmations: 1,
  });

  // Use provided status or wagmi status - Success takes priority
  const finalIsLoading = (isLoading || isTxLoading) && !(isSuccess || isTxSuccess);
  const finalIsSuccess = isSuccess || isTxSuccess;
  const finalIsError = isError || isTxError;

  // Countdown timer for auto-close - ONLY for success state
  useEffect(() => {
    let interval;
    if (finalIsSuccess && autoCloseDelay > 0 && isVisible) {
      setCountdown(autoCloseDelay / 1000);
      interval = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [finalIsSuccess, autoCloseDelay, isVisible]);

  // Auto-close on success
  useEffect(() => {
    if (finalIsSuccess && autoCloseDelay > 0 && !hasAutoClosed) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        setHasAutoClosed(true);
        setTimeout(() => {
          onClose?.();
          onSuccess?.();
        }, 300);
      }, autoCloseDelay);

      return () => clearTimeout(timer);
    }
  }, [finalIsSuccess, autoCloseDelay, onClose, onSuccess, hasAutoClosed]);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(() => {
      onClose?.();
      if (finalIsSuccess) {
        onSuccess?.();
      }
    }, 300);
  };

  // Get status configuration
  const getStatusConfig = () => {
    if (finalIsSuccess) {
      return {
        themeClass: styles.successTheme,
        icon: <CheckCircle2 size={38} />,
        title: type === 'approval' ? 'Approval Successful!' :
               type === 'wrap' ? 'Wrap Successful!' :
               type === 'unwrap' ? 'Unwrap Successful!' : 'Swap Successful!',
        description: type === 'approval' ? `${fromToken?.symbol || 'Token'} approved successfully. You can now swap.` :
                    type === 'wrap' ? `Successfully wrapped ${fromAmount || ''} ${fromToken?.symbol || 'ETH'} to ${toToken?.symbol || 'WETH'}` :
                    type === 'unwrap' ? `Successfully unwrapped ${fromAmount || ''} ${fromToken?.symbol || 'WETH'} to ${toToken?.symbol || 'ETH'}` :
                    `Successfully swapped ${fromAmount || ''} ${fromToken?.symbol || ''} for ${toAmount || ''} ${toToken?.symbol || ''}`,
        statusText: 'success',
      };
    }

    if (finalIsError) {
      return {
        themeClass: styles.errorTheme,
        icon: <XCircle size={38} />,
        title: 'Transaction Rejected',
        description: errorMessage || 'Transaction was rejected or failed. Please try again.',
        statusText: 'rejected',
      };
    }

    if (finalIsLoading) {
      return {
        themeClass: styles.pendingTheme,
        icon: <Loader2 size={38} className={styles.spinner} />,
        title: type === 'approval' ? `Approving ${fromToken?.symbol || 'Token'}` : 
               type === 'wrap' ? `Wrapping ${fromToken?.symbol || 'ETH'}` :
               type === 'unwrap' ? `Unwrapping ${fromToken?.symbol || 'WETH'}` : 'Swap Pending',
        description: type === 'approval' ? `Waiting for ${fromToken?.symbol || 'token'} approval on-chain...` :
                    type === 'wrap' ? `Wrapping ${fromAmount || ''} ${fromToken?.symbol || 'ETH'} to ${toToken?.symbol || 'WETH'}...` :
                    type === 'unwrap' ? `Unwrapping ${fromAmount || ''} ${fromToken?.symbol || 'WETH'} to ${toToken?.symbol || 'ETH'}...` :
                    'Waiting for blockchain confirmation...',
        statusText: 'pending',
      };
    }

    return {
      themeClass: styles.pendingTheme,
      icon: <Loader2 size={38} className={styles.spinner} />,
      title: 'Processing Transaction',
      description: 'Your transaction is being submitted to the network...',
      statusText: 'processing',
    };
  };

  const status = getStatusConfig();

  const getExplorerUrl = (hash) => {
    if (chainId === 4441) {
      return `https://liteforge.explorer.caldera.xyz/tx/${hash}`;
    } else if (chainId === 11155111) {
      return `https://sepolia.etherscan.io/tx/${hash}`;
    }
    return `https://liteforge.explorer.caldera.xyz/tx/${hash}`;
  };

  const formatHash = (hash) => {
    if (!hash) return '';
    return `${hash.substring(0, 6)}...${hash.substring(hash.length - 4)}`;
  };

  const formatAmount = (amount) => {
    if (!amount) return '0';
    try {
      const num = parseFloat(amount);
      if (num > 1000000) return `${(num / 1000000).toFixed(2)}M`;
      if (num > 1000) return `${(num / 1000).toFixed(2)}K`;
      if (num < 0.0001) return num.toExponential(2);
      return num.toFixed(4);
    } catch {
      return amount;
    }
  };

  const progressPercent = autoCloseDelay > 0 ? ((countdown / (autoCloseDelay / 1000)) * 100) : 0;

  return (
    <AnimatePresence>
      {isVisible && (
        <div className={styles.modalOverlay} onClick={handleClose}>
          <motion.div
            initial={{ scale: 0.94, opacity: 0, y: 15 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 15 }}
            transition={{ type: 'spring', damping: 22, stiffness: 320 }}
            className={`${styles.modalCard} ${status.themeClass}`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            {showCloseButton && (
              <button
                type="button"
                onClick={handleClose}
                className={styles.closeBtn}
                title="Close"
              >
                <X size={16} />
              </button>
            )}

            <div className={styles.content}>
              {/* Status Animated Icon with Glow */}
              <div className={styles.statusIconWrap}>
                <div className={styles.iconGlowRing} />
                <div className={styles.iconCircle}>
                  {status.icon}
                </div>
              </div>

              {/* Status Title and Description */}
              <h3 className={styles.title}>{status.title}</h3>
              <p className={styles.description}>{status.description}</p>

              {/* Asset Flow Card */}
              {fromToken && toToken && type === 'swap' && (
                <div className={styles.flowCard}>
                  <div className={styles.tokenSide}>
                    {fromToken.logoURI ? (
                      <img src={fromToken.logoURI} alt={fromToken.symbol} className={styles.tokenLogo} />
                    ) : (
                      <div className={styles.tokenLogoFallback}>
                        {fromToken.symbol?.charAt(0) || 'T'}
                      </div>
                    )}
                    <div className={styles.tokenMeta}>
                      <span className={styles.tokenAmount}>{formatAmount(fromAmount)}</span>
                      <span className={styles.tokenSymbol}>{fromToken.symbol}</span>
                    </div>
                  </div>

                  <div className={styles.flowArrow}>
                    <ArrowRight size={14} />
                  </div>

                  <div className={styles.tokenSide} style={{ justifyContent: 'flex-end' }}>
                    <div className={styles.tokenMeta} style={{ textAlign: 'right' }}>
                      <span className={styles.tokenAmount}>{formatAmount(toAmount)}</span>
                      <span className={styles.tokenSymbol}>{toToken.symbol}</span>
                    </div>
                    {toToken.logoURI ? (
                      <img src={toToken.logoURI} alt={toToken.symbol} className={styles.tokenLogo} />
                    ) : (
                      <div className={styles.tokenLogoFallback}>
                        {toToken.symbol?.charAt(0) || 'T'}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Wrap/Unwrap Asset Flow */}
              {(type === 'wrap' || type === 'unwrap') && fromToken && toToken && (
                <div className={styles.flowCard}>
                  <div className={styles.tokenSide}>
                    <div className={styles.tokenMeta}>
                      <span className={styles.tokenAmount}>{formatAmount(fromAmount)}</span>
                      <span className={styles.tokenSymbol}>{fromToken.symbol}</span>
                    </div>
                  </div>
                  <div className={styles.flowArrow}>
                    <ArrowRight size={14} />
                  </div>
                  <div className={styles.tokenSide}>
                    <div className={styles.tokenMeta} style={{ textAlign: 'right' }}>
                      <span className={styles.tokenAmount}>{formatAmount(fromAmount)}</span>
                      <span className={styles.tokenSymbol}>{toToken.symbol}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Transaction Hash Link */}
              {transactionHash && (
                <a
                  href={getExplorerUrl(transactionHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.hashPill}
                >
                  <span>Tx:</span>
                  <code>{formatHash(transactionHash)}</code>
                  <ExternalLink size={12} />
                </a>
              )}

              {/* Action Buttons */}
              <div className={styles.actionRow}>
                <button
                  type="button"
                  onClick={handleClose}
                  className={styles.primaryBtn}
                >
                  {finalIsSuccess ? 'Done' : finalIsError ? 'Close' : 'Dismiss'}
                </button>

                {transactionHash && (
                  <a
                    href={getExplorerUrl(transactionHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.explorerBtn}
                  >
                    <span>Explorer</span>
                    <ExternalLink size={13} />
                  </a>
                )}
              </div>
            </div>

            {/* Auto-close Progress Bar (Success only) */}
            {finalIsSuccess && autoCloseDelay > 0 && (
              <div className={styles.progressBarBg}>
                <div
                  className={styles.progressBarFill}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default SwapTransactionModal;