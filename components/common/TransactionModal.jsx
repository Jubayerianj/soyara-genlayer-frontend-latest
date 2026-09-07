
// components/common/TransactionModal.jsx

import React, { useState, useEffect } from 'react';

import { motion, AnimatePresence } from 'framer-motion';
import { useWaitForTransactionReceipt } from 'wagmi';

const TransactionModal = ({
  transactionHash,
  onClose,
  title = 'Transaction',
  description = 'Your transaction is being processed...',
  successMessage = 'Transaction completed successfully!',
  errorMessage = 'Transaction failed. Please try again.',
  isLoading = false,
  isSuccess = false,
  showCloseButton = true,
  autoCloseDelay = 3000,
  className = ''
}) => {
  const [isVisible, setIsVisible] = useState(true);
  const [hasAutoClosed, setHasAutoClosed] = useState(false);

  // If transactionHash is provided, use wagmi to track it
  const {
    data: receipt,
    isLoading: isTxLoading,
    isSuccess: isTxSuccess,
    isError: isTxError
  } = useWaitForTransactionReceipt({
    hash: transactionHash,
    confirmations: 1,
  });

  // Use provided status or wagmi status
  const finalIsLoading = isLoading || isTxLoading;
  const finalIsSuccess = isSuccess || isTxSuccess;
  const finalIsError = isTxError;

  // Auto-close on success (Uniswap style)
  useEffect(() => {
    if (finalIsSuccess && autoCloseDelay > 0 && !hasAutoClosed) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        setHasAutoClosed(true);
        setTimeout(() => onClose?.(), 300);
      }, autoCloseDelay);

      return () => clearTimeout(timer);
    }
  }, [finalIsSuccess, autoCloseDelay, onClose, hasAutoClosed]);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(() => onClose?.(), 300);
  };

  const getStatusConfig = () => {
    if (finalIsLoading) {
      return {
        icon: (
          <div className="spinner">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2v4" />
              <path d="m16.2 7.8 2.9-2.9" />
              <path d="M18 12h4" />
              <path d="m16.2 16.2 2.9 2.9" />
              <path d="M12 18v4" />
              <path d="m7.8 16.2-2.9 2.9" />
              <path d="M6 12H2" />
              <path d="m7.8 7.8-2.9-2.9" />
            </svg>
          </div>
        ),
        color: '#2172E5',
        title: title,
        message: description
      };
    }
    
    if (finalIsSuccess) {
      return {
        icon: (
          <div className="success-icon">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          </div>
        ),
        color: '#00d395',
        title: 'Success',
        message: successMessage
      };
    }
    
    if (finalIsError) {
      return {
        icon: (
          <div className="error-icon">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
        ),
        color: '#ff4444',
        title: 'Failed',
        message: errorMessage
      };
    }
    
    return {
      icon: (
        <div className="spinner">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2v4" />
            <path d="m16.2 7.8 2.9-2.9" />
            <path d="M18 12h4" />
            <path d="m16.2 16.2 2.9 2.9" />
            <path d="M12 18v4" />
            <path d="m7.8 16.2-2.9 2.9" />
            <path d="M6 12H2" />
            <path d="m7.8 7.8-2.9-2.9" />
          </svg>
        </div>
      ),
      color: '#2172E5',
      title: 'Processing',
      message: description
    };
  };

  const status = getStatusConfig();

  // Format transaction hash for display
  const formatTransactionHash = (hash) => {
    if (!hash) return '';
    return `${hash.substring(0, 6)}...${hash.substring(hash.length - 4)}`;
  };

  // Format gas used
  const formatGasUsed = (gasUsed) => {
    if (!gasUsed) return '';
    return Number(gasUsed).toLocaleString();
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="transaction-modal-overlay"
          onClick={handleClose}
        >
          <motion.div
            initial={{ scale: 0.95, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: 20, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={`transaction-modal ${className}`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button (Uniswap style - top right) */}
            {showCloseButton && (
              <button
                className="modal-close-button"
                onClick={handleClose}
                aria-label="Close"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}

            <div className="modal-content">
              {/* Status Icon */}
              <div className="status-icon" style={{ color: status.color }}>
                {status.icon}
              </div>
              
              {/* Status Title and Message */}
              <div className="status-content">
                <h3 className="status-title">{status.title}</h3>
                <p className="status-message">{status.message}</p>
              </div>

              {/* Transaction Details (Uniswap shows this only when available) */}
              {transactionHash && (
                <div className="transaction-details">
                  <div className="transaction-hash">
                    <span className="hash-label">Transaction</span>

                    <a
                      href={`https://liteforge.explorer.caldera.xyz/tx/${transactionHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hash-link"
                    >
                      <span className="hash-text">
                        {formatTransactionHash(transactionHash)}
                      </span>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                        <path d="M15 3h6v6" />
                        <path d="M10 14L21 3" />
                      </svg>
                    </a>
                  </div>

                  {/* Receipt Details (Uniswap shows block number and gas) */}
                  {receipt && (
                    <div className="receipt-details">
                      <div className="receipt-row">
                        <span className="receipt-label">Block</span>
                        <span className="receipt-value">{Number(receipt.blockNumber)}</span>
                      </div>
                      <div className="receipt-row">
                        <span className="receipt-label">Gas Used</span>
                        <span className="receipt-value">
                          {formatGasUsed(receipt.gasUsed)}
                        </span>
                      </div>
                      {receipt.effectiveGasPrice && (
                        <div className="receipt-row">
                          <span className="receipt-label">Gas Price</span>
                          <span className="receipt-value">
                            {(Number(receipt.effectiveGasPrice) / 1e9).toFixed(2)} Gwei
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons (Uniswap style) */}
              <div className="action-buttons">
                {transactionHash && (
                  <a
                    href={`https://liteforge.explorer.caldera.xyz/tx/${transactionHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="view-on-explorer-button"
                  >
                    View on LitVM Explorer
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                      <path d="M15 3h6v6" />
                      <path d="M10 14L21 3" />
                    </svg>
                  </a>
                )}
                
                <button
                  type="button"
                  onClick={handleClose}
                  className={`close-button ${finalIsSuccess ? 'success' : ''}`}
                >
                  {finalIsSuccess ? 'Done' : 'Close'}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default TransactionModal;

// Add these styles at the end of the file
const styles = `
  .transaction-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 20px;
  }

  .transaction-modal {
    background: linear-gradient(145deg, #1c1c2e, #15152b);
    border-radius: 24px;
    padding: 32px;
    width: 100%;
    max-width: 420px;
    position: relative;
    border: 1px solid #2d2d4d;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
  }

  .modal-close-button {
    position: absolute;
    top: 20px;
    right: 20px;
    background: transparent;
    border: none;
    color: #8a8ab5;
    cursor: pointer;
    padding: 8px;
    border-radius: 8px;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .modal-close-button:hover {
    background: rgba(255, 255, 255, 0.1);
    color: white;
  }

  .modal-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
  }

  .status-icon {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .spinner svg {
    animation: spin 1.5s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .success-icon svg {
    stroke: #00d395;
  }

  .error-icon svg {
    stroke: #ff4444;
  }

  .status-content {
    text-align: center;
    width: 100%;
  }

  .status-title {
    font-size: 24px;
    font-weight: 700;
    color: #ffffff;
    margin: 0 0 8px 0;
  }

  .status-message {
    font-size: 16px;
    color: #8a8ab5;
    line-height: 1.5;
    margin: 0;
    max-width: 320px;
  }

  .transaction-details {
    width: 100%;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 16px;
    padding: 20px;
    border: 1px solid #2d2d4d;
  }

  .transaction-hash {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    padding-bottom: 16px;
    border-bottom: 1px solid #2d2d4d;
  }

  .hash-label {
    color: #8a8ab5;
    font-size: 14px;
    font-weight: 500;
  }

  .hash-link {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #00d395;
    text-decoration: none;
    font-size: 14px;
    font-weight: 500;
    transition: all 0.2s ease;
    background: rgba(0, 211, 149, 0.1);
    padding: 6px 12px;
    border-radius: 8px;
  }

  .hash-link:hover {
    background: rgba(0, 211, 149, 0.2);
    color: white;
  }

  .hash-text {
    font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
  }

  .receipt-details {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .receipt-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .receipt-label {
    color: #8a8ab5;
    font-size: 14px;
  }

  .receipt-value {
    color: #ffffff;
    font-size: 14px;
    font-weight: 600;
    font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
  }

  .action-buttons {
    display: flex;
    gap: 12px;
    width: 100%;
  }

  .view-on-explorer-button {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background: transparent;
    border: 1px solid #2d2d4d;
    color: #8a8ab5;
    padding: 14px;
    border-radius: 16px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    text-decoration: none;
    transition: all 0.2s ease;
  }

  .view-on-explorer-button:hover {
    background: rgba(255, 255, 255, 0.05);
    color: white;
    border-color: #00d395;
  }

  .close-button {
    flex: 1;
    background: #2172E5;
    border: none;
    color: white;
    padding: 14px;
    border-radius: 16px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .close-button:hover {
    background: #1a5fcc;
    transform: translateY(-1px);
  }

  .close-button.success {
    background: #00d395;
  }

  .close-button.success:hover {
    background: #00b582;
  }

  @media (max-width: 768px) {
    .transaction-modal {
      padding: 24px;
      max-width: 100%;
    }

    .status-title {
      font-size: 20px;
    }

    .status-message {
      font-size: 14px;
    }

    .action-buttons {
      flex-direction: column;
    }

    .view-on-explorer-button,
    .close-button {
      width: 100%;
    }
  }
`;

// Add styles to document head
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement("style");
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);
}