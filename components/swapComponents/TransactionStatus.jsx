
// components/common/TransactionStatus.jsx


import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Loader2, 
  ExternalLink,
  Copy,
  ChevronDown,
  X
} from 'lucide-react';
import { useWaitForTransactionReceipt } from 'wagmi';

const TransactionStatus = ({
  txHash,
  status = 'pending', // 'pending', 'success', 'error', 'warning'
  title,
  message,
  details,
  onDismiss,
  autoDismiss = false, // Changed to false by default
  dismissAfter = 8000,
  showExplorerLink = true,
  explorerUrl = 'https://liteforge.explorer.caldera.xyz/tx/',
  className = ''
}) => {
  const [isVisible, setIsVisible] = useState(true);
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);

  // Check transaction status if we have a hash
  const { data: receipt, isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash: txHash,
    confirmations: 1,
    query: {
      enabled: !!txHash && status === 'pending'
    }
  });

  // Update status when transaction confirms
  useEffect(() => {
    if (receipt && status === 'pending') {
      // Transaction confirmed - check if successful
      if (receipt.status === 'success') {
        // Success - parent component should update status
      } else {
        // Failed - parent component should update status
      }
    }
  }, [receipt, status]);

  // Auto-dismiss for success messages (optional)
  useEffect(() => {
    if (autoDismiss && status === 'success') {
      const timer = setTimeout(() => {
        handleDismiss();
      }, dismissAfter);

      return () => clearTimeout(timer);
    }
  }, [autoDismiss, status, dismissAfter]);

  const handleDismiss = () => {
    setIsVisible(false);
    setTimeout(() => {
      if (onDismiss) onDismiss();
    }, 300); // Wait for animation to complete
  };

  const handleCopy = async () => {
    if (txHash) {
      await navigator.clipboard.writeText(txHash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getStatusConfig = () => {
    switch (status) {
      case 'success':
        return {
          icon: CheckCircle,
          iconColor: 'text-green-400',
          bgColor: 'bg-gray-900',
          borderColor: 'border-green-500',
          title: title || 'Transaction Successful',
          message: message || 'Your transaction has been completed successfully.'
        };
      case 'error':
        return {
          icon: XCircle,
          iconColor: 'text-red-400',
          bgColor: 'bg-gray-900',
          borderColor: 'border-red-500',
          title: title || 'Transaction Failed',
          message: message || 'Your transaction has failed. Please try again.'
        };
      case 'warning':
        return {
          icon: AlertCircle,
          iconColor: 'text-yellow-400',
          bgColor: 'bg-gray-900',
          borderColor: 'border-yellow-500',
          title: title || 'Warning',
          message: message || 'There was an issue with your transaction.'
        };
      case 'pending':
      default:
        return {
          icon: Loader2,
          iconColor: 'text-blue-400',
          bgColor: 'bg-gray-900',
          borderColor: 'border-blue-500',
          title: title || 'Transaction Pending',
          message: message || 'Your transaction is being processed...'
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  if (!isVisible) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      className={`transaction-status ${config.bgColor} ${config.borderColor} ${className}`}
      style={{
        background: 'rgba(15, 15, 31, 0.95)',
        backdropFilter: 'blur(10px)',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)'
      }}
    >
      <div className="status-header">
        <div className="status-icon">
          <Icon className={`w-5 h-5 ${config.iconColor} ${status === 'pending' ? 'animate-spin' : ''}`} />
        </div>
        <div className="status-content">
          <h4 className="status-title">{config.title}</h4>
          <p className="status-message">{config.message}</p>
          
          {txHash && (
            <div className="transaction-hash">
              <span className="hash-label">Transaction Hash:</span>
              <div className="hash-actions">
                <code className="hash-value">
                  {`${txHash.substring(0, 10)}...${txHash.substring(txHash.length - 8)}`}
                </code>
                <button
                  onClick={handleCopy}
                  className="copy-button"
                  title="Copy transaction hash"
                  type="button"
                >
                  <Copy className={`w-4 h-4 ${copied ? 'text-green-400' : 'text-gray-400'}`} />
                </button>
                {showExplorerLink && (
                  <a
                    href={`${explorerUrl}${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="explorer-link"
                    title="View on explorer"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
            </div>
          )}

          {details && (
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="details-toggle"
              type="button"
            >
              <span>Details</span>
              <ChevronDown className={`w-4 h-4 transition-transform ${showDetails ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
        <button
          onClick={handleDismiss}
          className="dismiss-button"
          type="button"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <AnimatePresence>
        {showDetails && details && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="details-panel"
          >
            <div className="details-content">
              {Object.entries(details).map(([key, value]) => (
                <div key={key} className="detail-row">
                  <span className="detail-key">{key}:</span>
                  <span className="detail-value">{String(value)}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style jsx>{`
        .transaction-status {
          border-radius: 12px;
          border: 2px solid;
          padding: 1rem;
          margin-bottom: 1rem;
          position: relative;
          overflow: hidden;
          z-index: 1000;
        }

        .status-header {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          position: relative;
          z-index: 10;
        }

        .status-icon {
          flex-shrink: 0;
          margin-top: 0.125rem;
        }

        .status-content {
          flex: 1;
          min-width: 0;
        }

        .status-title {
          font-weight: 600;
          color: white;
          margin-bottom: 0.25rem;
          font-size: 0.9375rem;
        }

        .status-message {
          color: rgba(255, 255, 255, 0.9);
          font-size: 0.875rem;
          line-height: 1.4;
          margin-bottom: 0.75rem;
        }

        .transaction-hash {
          background: rgba(0, 0, 0, 0.3);
          border-radius: 6px;
          padding: 0.5rem;
          margin-bottom: 0.75rem;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .hash-label {
          display: block;
          font-size: 0.75rem;
          color: rgba(255, 255, 255, 0.7);
          margin-bottom: 0.25rem;
        }

        .hash-actions {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .hash-value {
          font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
          font-size: 0.8125rem;
          color: rgba(255, 255, 255, 0.95);
          background: rgba(0, 0, 0, 0.4);
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .copy-button,
        .explorer-link {
          color: rgba(255, 255, 255, 0.6);
          background: rgba(0, 0, 0, 0.4);
          padding: 0.375rem;
          border-radius: 4px;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .copy-button:hover {
          color: rgba(255, 255, 255, 0.9);
          background: rgba(0, 0, 0, 0.6);
        }

        .explorer-link:hover {
          color: #00d395;
          background: rgba(0, 0, 0, 0.6);
        }

        .dismiss-button {
          color: rgba(255, 255, 255, 0.5);
          background: transparent;
          padding: 0.25rem;
          border-radius: 4px;
          transition: all 0.2s ease;
          flex-shrink: 0;
          margin-left: 0.25rem;
        }

        .dismiss-button:hover {
          color: rgba(255, 255, 255, 0.9);
          background: rgba(255, 255, 255, 0.1);
        }

        .details-toggle {
          display: flex;
          align-items: center;
          gap: 0.25rem;
          color: rgba(255, 255, 255, 0.7);
          font-size: 0.8125rem;
          background: rgba(255, 255, 255, 0.05);
          padding: 0.5rem 0.75rem;
          border-radius: 6px;
          transition: all 0.2s ease;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .details-toggle:hover {
          color: rgba(255, 255, 255, 0.9);
          background: rgba(255, 255, 255, 0.1);
        }

        .details-panel {
          margin-top: 0.75rem;
          border-top: 1px solid rgba(255, 255, 255, 0.2);
          padding-top: 0.75rem;
        }

        .details-content {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .detail-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.8125rem;
          padding: 0.25rem 0;
        }

        .detail-key {
          color: rgba(255, 255, 255, 0.7);
        }

        .detail-value {
          color: rgba(255, 255, 255, 0.95);
          font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
          text-align: right;
          max-width: 60%;
          word-break: break-word;
        }

        /* Remove progress bar since we don't want auto-dismiss */
        .progress-bar {
          display: none;
        }
      `}</style>
    </motion.div>
  );
};

export default TransactionStatus;