
// components/portfolio/WithdrawTransactionModal.jsx

import React, { useState, useEffect } from 'react';

import { motion, AnimatePresence } from 'framer-motion';
import { useWaitForTransactionReceipt } from 'wagmi';
import { CheckCircle, XCircle, AlertCircle, ExternalLink, Loader2 } from 'lucide-react';
import { formatUnits } from 'viem';

const WithdrawTransactionModal = ({
  transactionHash,
  onClose,
  type = 'withdraw',
  isLoading = false,
  isSuccess = false,
  isError = false,
  errorMessage = '',
  token0 = null,
  token1 = null,
  token0Amount = null,
  token1Amount = null,
  lpAmount = null,
  showCloseButton = true,
  autoCloseDelay = 3000,
  onSuccess,
}) => {
  const [isVisible, setIsVisible] = useState(true);
  const [hasAutoClosed, setHasAutoClosed] = useState(false);

  // If transactionHash is provided, use wagmi to track it
  const {
    data: receipt,
    isLoading: isTxLoading,
    isSuccess: isTxSuccess,
    isError: isTxError,
  } = useWaitForTransactionReceipt({
    hash: transactionHash,
    confirmations: 1,
  });

  // Use provided status or wagmi status
  const finalIsLoading = isLoading || isTxLoading;
  const finalIsSuccess = isSuccess || isTxSuccess;
  const finalIsError = isError || isTxError;

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

  const getStatusConfig = () => {
    if (finalIsLoading) {
      return {
        icon: <Loader2 style={{ width: '64px', height: '64px', animation: 'spin 1.5s linear infinite' }} />,
        title: type === 'approve' ? 'Approving LP Tokens' : 'Withdrawing Liquidity',
        description: type === 'approve' 
          ? 'Waiting for approval confirmation...' 
          : 'Processing your withdrawal...',
        color: '#3b82f6',
      };
    }

    if (finalIsSuccess) {
      return {
        icon: <CheckCircle style={{ width: '64px', height: '64px', color: '#0284c7' }} />,
        title: type === 'approve' ? 'Approval Successful!' : 'Withdrawal Successful!',
        description: type === 'approve'
          ? 'LP tokens approved. You can now withdraw liquidity.'
          : 'Liquidity withdrawn successfully.',
        color: '#0284c7',
      };
    }

    if (finalIsError) {
      return {
        icon: <XCircle style={{ width: '64px', height: '64px', color: '#ef4444' }} />,
        title: 'Transaction Failed',
        description: errorMessage || 'Transaction failed. Please try again.',
        color: '#ef4444',
      };
    }

    return {
      icon: <Loader2 style={{ width: '64px', height: '64px', animation: 'spin 1.5s linear infinite' }} />,
      title: 'Processing Transaction',
      description: 'Your transaction is being processed...',
      color: '#3b82f6',
    };
  };

  const status = getStatusConfig();

  // Format transaction hash
  const formatHash = (hash) => {
    if (!hash) return '';
    return `${hash.substring(0, 6)}...${hash.substring(hash.length - 4)}`;
  };

  // Format amounts for display
  const formatAmount = (amount, decimals = 18) => {
    if (!amount) return '0';
    try {
      const formatted = parseFloat(formatUnits(amount, decimals));
      return formatted.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 6,
      });
    } catch {
      return '0';
    }
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
          onClick={handleClose}
        >
          <motion.div
            initial={{ scale: 0.95, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: 20, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: '420px',
              borderRadius: '24px',
              background: 'linear-gradient(145deg, #1c1c2e, #15152b)',
              border: '1px solid #2d2d4d',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4)',
              margin: '20px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            {showCloseButton && (
              <button
                onClick={handleClose}
                style={{
                  position: 'absolute',
                  top: '20px',
                  right: '20px',
                  background: 'transparent',
                  border: 'none',
                  color: '#8a8ab5',
                  cursor: 'pointer',
                  padding: '8px',
                  borderRadius: '8px',
                  transition: 'all 0.2s ease',
                }}
                onMouseOver={(e) => {
                  e.target.style.background = 'rgba(255, 255, 255, 0.1)';
                  e.target.style.color = 'white';
                }}
                onMouseOut={(e) => {
                  e.target.style.background = 'transparent';
                  e.target.style.color = '#8a8ab5';
                }}
                aria-label="Close"
              >
                <XCircle size={24} />
              </button>
            )}

            <div style={{ padding: '32px' }}>
              {/* Status Icon */}
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
                <div style={{ color: status.color }}>
                  {status.icon}
                </div>
              </div>

              {/* Status Title and Message */}
              <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                <h3 style={{ 
                  fontSize: '24px', 
                  fontWeight: '700', 
                  color: '#ffffff', 
                  margin: '0 0 8px 0' 
                }}>
                  {status.title}
                </h3>
                <p style={{ 
                  fontSize: '16px', 
                  color: '#8a8ab5', 
                  lineHeight: '1.5', 
                  margin: 0,
                  maxWidth: '320px',
                  margin: '0 auto'
                }}>
                  {status.description}
                </p>
              </div>

              {/* Withdrawal Details */}
              {type === 'withdraw' && (token0 || token1) && (
                <div style={{ 
                  marginBottom: '24px', 
                  padding: '20px', 
                  background: 'rgba(255, 255, 255, 0.05)',
                  borderRadius: '16px',
                  border: '1px solid #2d2d4d'
                }}>
                  <h4 style={{ 
                    fontSize: '14px', 
                    fontWeight: '500', 
                    color: '#8a8ab5',
                    margin: '0 0 12px 0'
                  }}>
                    You Received
                  </h4>
                  
                  {token0 && token0Amount && (
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between',
                      marginBottom: '12px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {token0.logoURI ? (
                          <img
                            src={token0.logoURI}
                            alt={token0.symbol}
                            style={{ width: '24px', height: '24px', borderRadius: '50%' }}
                          />
                        ) : (
                          <div style={{ 
                            width: '24px', 
                            height: '24px', 
                            borderRadius: '50%', 
                            background: '#2d2d4d',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            <span style={{ fontSize: '10px', color: 'white' }}>
                              {token0.symbol?.charAt(0)}
                            </span>
                          </div>
                        )}
                        <span style={{ 
                          color: 'white', 
                          fontWeight: '500',
                          fontSize: '14px'
                        }}>
                          {token0.symbol}
                        </span>
                      </div>
                      <span style={{ 
                        color: 'white', 
                        fontWeight: '600',
                        fontSize: '14px'
                      }}>
                        {formatAmount(token0Amount, token0.decimals)}
                      </span>
                    </div>
                  )}

                  {token1 && token1Amount && (
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {token1.logoURI ? (
                          <img
                            src={token1.logoURI}
                            alt={token1.symbol}
                            style={{ width: '24px', height: '24px', borderRadius: '50%' }}
                          />
                        ) : (
                          <div style={{ 
                            width: '24px', 
                            height: '24px', 
                            borderRadius: '50%', 
                            background: '#2d2d4d',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            <span style={{ fontSize: '10px', color: 'white' }}>
                              {token1.symbol?.charAt(0)}
                            </span>
                          </div>
                        )}
                        <span style={{ 
                          color: 'white', 
                          fontWeight: '500',
                          fontSize: '14px'
                        }}>
                          {token1.symbol}
                        </span>
                      </div>
                      <span style={{ 
                        color: 'white', 
                        fontWeight: '600',
                        fontSize: '14px'
                      }}>
                        {formatAmount(token1Amount, token1.decimals)}
                      </span>
                    </div>
                  )}

                  {lpAmount && (
                    <div style={{ 
                      marginTop: '16px', 
                      paddingTop: '12px', 
                      borderTop: '1px solid #2d2d4d'
                    }}>
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between',
                        fontSize: '12px'
                      }}>
                        <span style={{ color: '#8a8ab5' }}>LP Tokens Burned</span>
                        <span style={{ color: '#8a8ab5', fontWeight: '500' }}>
                          {formatAmount(lpAmount, 18)} LP
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Transaction Hash */}
              {transactionHash && (
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    padding: '12px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    borderRadius: '8px'
                  }}>
                    <span style={{ 
                      fontSize: '12px', 
                      color: '#8a8ab5' 
                    }}>
                      Transaction
                    </span>
                    <a
                      href={`https://liteforge.explorer.caldera.xyz/tx/${transactionHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        color: '#00d395',
                        textDecoration: 'none',
                        fontSize: '12px',
                        fontWeight: '500',
                        transition: 'all 0.2s ease',
                        background: 'rgba(0, 211, 149, 0.1)',
                        padding: '6px 12px',
                        borderRadius: '8px',
                      }}
                      onMouseOver={(e) => {
                        e.target.style.background = 'rgba(0, 211, 149, 0.2)';
                        e.target.style.color = 'white';
                      }}
                      onMouseOut={(e) => {
                        e.target.style.background = 'rgba(0, 211, 149, 0.1)';
                        e.target.style.color = '#00d395';
                      }}
                    >
                      <span style={{ fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace" }}>
                        {formatHash(transactionHash)}
                      </span>
                      <ExternalLink size={16} />
                    </a>
                  </div>

                  {/* Transaction Details */}
                  {receipt && (
                    <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#8a8ab5' }}>Block</span>
                        <span style={{ 
                          color: 'white', 
                          fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
                          fontWeight: '500'
                        }}>
                          {Number(receipt.blockNumber)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#8a8ab5' }}>Gas Used</span>
                        <span style={{ 
                          color: 'white', 
                          fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
                          fontWeight: '500'
                        }}>
                          {Number(receipt.gasUsed).toLocaleString()}
                        </span>
                      </div>
                      {receipt.effectiveGasPrice && (
                        <div style={{ 
                          gridColumn: 'span 2', 
                          display: 'flex', 
                          justifyContent: 'space-between' 
                        }}>
                          <span style={{ color: '#8a8ab5' }}>Gas Price</span>
                          <span style={{ 
                            color: 'white', 
                            fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
                            fontWeight: '500'
                          }}>
                            {(Number(receipt.effectiveGasPrice) / 1e9).toFixed(2)} Gwei
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '12px' }}>
                {transactionHash && (
                  <a
                    href={`https://liteforge.explorer.caldera.xyz/tx/${transactionHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      background: 'transparent',
                      border: '1px solid #2d2d4d',
                      color: '#8a8ab5',
                      padding: '14px',
                      borderRadius: '16px',
                      fontSize: '16px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      textDecoration: 'none',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseOver={(e) => {
                      e.target.style.background = 'rgba(255, 255, 255, 0.05)';
                      e.target.style.color = 'white';
                      e.target.style.borderColor = '#00d395';
                    }}
                    onMouseOut={(e) => {
                      e.target.style.background = 'transparent';
                      e.target.style.color = '#8a8ab5';
                      e.target.style.borderColor = '#2d2d4d';
                    }}
                  >
                    View on Explorer
                    <ExternalLink size={16} />
                  </a>
                )}
                
                <button
                  onClick={handleClose}
                  style={{
                    flex: 1,
                    background: finalIsSuccess ? '#00d395' : finalIsError ? '#ef4444' : '#2172E5',
                    border: 'none',
                    color: 'white',
                    padding: '14px',
                    borderRadius: '16px',
                    fontSize: '16px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseOver={(e) => {
                    e.target.style.background = finalIsSuccess ? '#00b582' : finalIsError ? '#dc2626' : '#1a5fcc';
                    e.target.style.transform = 'translateY(-1px)';
                  }}
                  onMouseOut={(e) => {
                    e.target.style.background = finalIsSuccess ? '#00d395' : finalIsError ? '#ef4444' : '#2172E5';
                    e.target.style.transform = 'translateY(0)';
                  }}
                >
                  {finalIsSuccess ? 'Done' : 'Close'}
                </button>
              </div>

              {/* Pending Transaction Note */}
              {finalIsLoading && (
                <div style={{ 
                  marginTop: '16px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                  padding: '12px',
                  background: 'rgba(59, 130, 246, 0.1)',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  borderRadius: '8px'
                }}>
                  <AlertCircle size={20} color="#3b82f6" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <p style={{ 
                    fontSize: '12px', 
                    color: '#93c5fd',
                    margin: 0,
                    lineHeight: '1.4'
                  }}>
                    This may take a few moments. You can close this modal and the transaction will continue processing.
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default WithdrawTransactionModal;