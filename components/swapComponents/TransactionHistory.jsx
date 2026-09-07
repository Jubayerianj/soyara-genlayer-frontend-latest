
// components/common/TransactionHistory.jsx
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  ExternalLink,
  ChevronDown,
  History as HistoryIcon
} from 'lucide-react';
import { GenLayer } from '../../wagmi.config';

const TransactionHistory = ({ transactions = [], onClear }) => {
  const [expandedTx, setExpandedTx] = useState(null);

  const getStatusIcon = (status) => {
    switch (status) {
      case 'success': return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'failed': return <XCircle className="w-4 h-4 text-red-400" />;
      case 'pending': return <Clock className="w-4 h-4 text-blue-400 animate-pulse" />;
      default: return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (transactions.length === 0) {
    return (
      <div className="transaction-history-empty">
        <HistoryIcon className="w-8 h-8 text-gray-400" />
        <p className="empty-text">No transactions yet</p>
      </div>
    );
  }

  return (
    <div className="transaction-history">
      <div className="history-header">
        <h3 className="history-title">Transaction History</h3>
        {onClear && transactions.length > 0 && (
          <button onClick={onClear} className="clear-button" type="button">
            Clear All
          </button>
        )}
      </div>

      <div className="transactions-list">
        {transactions.map((tx, index) => (
          <motion.div
            key={tx.hash || index}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className={`transaction-item ${tx.status}`}
          >
            <div 
              className="transaction-summary"
              onClick={() => setExpandedTx(expandedTx === tx.hash ? null : tx.hash)}
            >
              <div className="transaction-icon">
                {getStatusIcon(tx.status)}
              </div>
              <div className="transaction-info">
                <div className="transaction-title">
                  {tx.type === 'swap' ? 'Swap' : 'Approve'} {tx.fromToken} → {tx.toToken}
                </div>
                <div className="transaction-time">
                  {formatTime(tx.timestamp)}
                </div>
              </div>
              <div className="transaction-actions">
                <span className="transaction-amount">
                  {tx.fromAmount} {tx.fromToken}
                </span>
                <ChevronDown className={`w-4 h-4 transition-transform ${expandedTx === tx.hash ? 'rotate-180' : ''}`} />
              </div>
            </div>

            <AnimatePresence>
              {expandedTx === tx.hash && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="transaction-details"
                >
                  <div className="details-grid">
                    <div className="detail">
                      <span className="detail-label">Status:</span>
                      <span className={`detail-value status-${tx.status}`}>
                        {tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}
                      </span>
                    </div>
                    <div className="detail">
                      <span className="detail-label">Type:</span>
                      <span className="detail-value">{tx.type}</span>
                    </div>
                    <div className="detail">
                      <span className="detail-label">From:</span>
                      <span className="detail-value">{tx.fromAmount} {tx.fromToken}</span>
                    </div>
                    <div className="detail">
                      <span className="detail-label">To:</span>
                      <span className="detail-value">{tx.toAmount} {tx.toToken}</span>
                    </div>
                    {tx.hash && (
                      <div className="detail">
                        <span className="detail-label">Hash:</span>
                        <div className="detail-value">
                          <a 
                            href={`https://explorer-bradbury.genlayer.com/tx/${tx.hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hash-link"
                          >
                            {`${tx.hash.substring(0, 8)}...${tx.hash.substring(tx.hash.length - 6)}`}
                            <ExternalLink className="w-3 h-3 ml-1" />
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default TransactionHistory;