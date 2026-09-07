// components/common/ConfirmationModal.jsx - BLUE LAGOON DEX DESIGN

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertTriangle, ArrowRight, Shield, Zap, Loader2 } from 'lucide-react';
import { formatNumber } from '../utils/price';

const ConfirmationModal = ({ data, onConfirm, onCancel, isLoading }) => {
  const {
    fromToken,
    toToken,
    fromAmount,
    toAmount,
    minReceived,
    priceImpact,
    slippage,
    exchangeRate
  } = data;

  const getPriceImpactColor = () => {
    if (priceImpact > 3) return '#f87171';
    if (priceImpact > 1) return '#fbbf24';
    return '#34d399';
  };

  const getPriceImpactWarning = () => {
    if (priceImpact > 5) return 'High price impact! You may lose value.';
    if (priceImpact > 2) return 'Medium price impact';
    return null;
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="modal-overlay"
        onClick={onCancel}
      >
        <motion.div
          initial={{ scale: 0.94, opacity: 0, y: 15 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.94, opacity: 0, y: 15 }}
          transition={{ type: 'spring', damping: 22, stiffness: 320 }}
          className="modal-content"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="modal-header">
            <div className="title-group">
              <Zap size={16} className="zap-icon" />
              <h3 className="modal-title">Confirm Swap</h3>
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="modal-close"
              disabled={isLoading}
              title="Cancel"
            >
              <X size={16} />
            </button>
          </div>

          {/* Swap Flow Card */}
          <div className="swap-summary">
            <div className="flow-card">
              <div className="token-side">
                {fromToken?.logoURI ? (
                  <img src={fromToken.logoURI} alt={fromToken.symbol} className="token-logo" />
                ) : (
                  <div className="token-logo-fallback">{fromToken?.symbol?.charAt(0) || 'T'}</div>
                )}
                <div className="token-meta">
                  <span className="token-amount">{formatNumber(fromAmount)}</span>
                  <span className="token-symbol">{fromToken?.symbol}</span>
                </div>
              </div>

              <div className="flow-arrow">
                <ArrowRight size={14} />
              </div>

              <div className="token-side token-side-right">
                <div className="token-meta token-meta-right">
                  <span className="token-amount">{formatNumber(toAmount)}</span>
                  <span className="token-symbol">{toToken?.symbol}</span>
                </div>
                {toToken?.logoURI ? (
                  <img src={toToken.logoURI} alt={toToken.symbol} className="token-logo" />
                ) : (
                  <div className="token-logo-fallback">{toToken?.symbol?.charAt(0) || 'T'}</div>
                )}
              </div>
            </div>

            {getPriceImpactWarning() && (
              <div className="warning-message">
                <AlertTriangle size={15} />
                <span>{getPriceImpactWarning()}</span>
              </div>
            )}
          </div>

          {/* Details Table */}
          <div className="swap-details">
            <div className="detail-row">
              <span className="detail-label">Rate</span>
              <span className="detail-value">
                1 {fromToken?.symbol} ≈ {formatNumber(exchangeRate)} {toToken?.symbol}
              </span>
            </div>

            <div className="detail-row">
              <span className="detail-label">Price Impact</span>
              <span className="detail-value" style={{ color: getPriceImpactColor() }}>
                {priceImpact?.toFixed(2)}%
              </span>
            </div>

            <div className="detail-row">
              <span className="detail-label">Minimum Received</span>
              <span className="detail-value">
                {formatNumber(minReceived)} {toToken?.symbol}
              </span>
            </div>

            <div className="detail-row">
              <span className="detail-label">Slippage Tolerance</span>
              <span className="detail-value">{slippage}%</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="modal-footer">
            <button
              type="button"
              onClick={onCancel}
              className="cancel-button"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="confirm-button"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 size={16} className="spinner" />
                  <span>Confirming in Wallet...</span>
                </>
              ) : (
                <>
                  <Shield size={16} />
                  <span>Confirm Swap</span>
                </>
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>

      <style jsx>{`
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(3, 7, 18, 0.82);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
          padding: 1rem;
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
        }

        .modal-content {
          background:
            radial-gradient(circle at 50% 0%, rgba(6, 182, 212, 0.18), transparent 55%),
            radial-gradient(circle at 80% 100%, rgba(59, 130, 246, 0.12), transparent 50%),
            linear-gradient(180deg, #0d1527 0%, #060913 100%);
          border: 1px solid rgba(56, 189, 248, 0.25);
          border-radius: 24px;
          width: 100%;
          max-width: 440px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          box-shadow: 
            0 25px 70px rgba(0, 0, 0, 0.65),
            0 0 40px rgba(6, 182, 212, 0.12),
            inset 0 1px 1px rgba(255, 255, 255, 0.1);
          color: #f8fafc;
          box-sizing: border-box;
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1.1rem 1.25rem 0.85rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }

        .title-group {
          display: flex;
          align-items: center;
          gap: 0.45rem;
        }

        .zap-icon {
          color: #38bdf8;
        }

        .modal-title {
          font-size: 1rem;
          font-weight: 700;
          color: #ffffff;
          margin: 0;
        }

        .modal-close {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #94a3b8;
          border-radius: 50%;
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s ease;
          padding: 0;
        }

        .modal-close:hover:not(:disabled) {
          background: rgba(239, 68, 68, 0.2);
          border-color: rgba(239, 68, 68, 0.4);
          color: #ef4444;
          transform: scale(1.08);
        }

        .modal-close:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .swap-summary {
          padding: 1.1rem 1.25rem 0.6rem;
        }

        .flow-card {
          width: 100%;
          background: rgba(10, 15, 29, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 16px;
          padding: 0.95rem 1.1rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          box-sizing: border-box;
        }

        .token-side {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          min-width: 0;
        }

        .token-side-right {
          justify-content: flex-end;
        }

        .token-logo {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          object-fit: cover;
          flex-shrink: 0;
          background: rgba(255, 255, 255, 0.05);
        }

        .token-logo-fallback {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: linear-gradient(135deg, #3b82f6, #06b6d4);
          color: #fff;
          font-size: 11px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .token-meta {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }

        .token-meta-right {
          text-align: right;
        }

        .token-amount {
          font-size: 0.95rem;
          font-weight: 700;
          color: #ffffff;
          font-variant-numeric: tabular-nums;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .token-symbol {
          font-size: 0.72rem;
          font-weight: 600;
          color: #94a3b8;
          text-transform: uppercase;
        }

        .flow-arrow {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: rgba(56, 189, 248, 0.12);
          border: 1px solid rgba(56, 189, 248, 0.3);
          color: #38bdf8;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          box-shadow: 0 0 10px rgba(6, 182, 212, 0.2);
        }

        .warning-message {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          margin-top: 0.75rem;
          padding: 0.55rem 0.75rem;
          background: rgba(245, 158, 11, 0.12);
          border: 1px solid rgba(245, 158, 11, 0.3);
          border-radius: 12px;
          color: #fbbf24;
          font-size: 0.76rem;
          font-weight: 500;
        }

        .swap-details {
          padding: 0.6rem 1.25rem 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
        }

        .detail-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.76rem;
        }

        .detail-label {
          color: #94a3b8;
          font-weight: 500;
        }

        .detail-value {
          color: #f1f5f9;
          font-weight: 600;
          font-variant-numeric: tabular-nums;
        }

        .modal-footer {
          padding: 0.75rem 1.25rem 1.25rem;
          display: flex;
          gap: 0.65rem;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
        }

        .cancel-button {
          flex: 1;
          padding: 0.75rem 1rem;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 14px;
          color: #cbd5e1;
          font-size: 0.84rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .cancel-button:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
        }

        .cancel-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .confirm-button {
          flex: 1.5;
          padding: 0.75rem 1rem;
          background: linear-gradient(135deg, #0284c7, #06b6d4);
          border: none;
          border-radius: 14px;
          color: white;
          font-weight: 700;
          font-size: 0.88rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.45rem;
          transition: all 0.2s ease;
          box-shadow: 0 4px 15px rgba(2, 132, 199, 0.35);
        }

        .confirm-button:hover:not(:disabled) {
          filter: brightness(1.1);
          transform: translateY(-1px);
        }

        .confirm-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .spinner {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </AnimatePresence>
  );
};

export default ConfirmationModal;