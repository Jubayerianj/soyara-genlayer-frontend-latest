import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const ConfirmModal = ({ isOpen, proposal, onConfirm, onCancel, isExecuting }) => {
  if (!isOpen || !proposal) return null;

  return (
    <AnimatePresence>
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(8px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          style={{
            background: '#080b14',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '20px',
            padding: '24px',
            width: '100%',
            maxWidth: '420px',
            boxShadow: '0 24px 48px rgba(0,0,0,0.4)'
          }}
        >
          <h2 style={{ color: '#f1f5f9', margin: '0 0 20px 0', fontSize: '1.25rem', textAlign: 'center' }}>
            Confirm {proposal.action || 'Transaction'}
          </h2>

          <div style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.05)',
            borderRadius: '16px',
            padding: '16px',
            marginBottom: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#94a3b8' }}>Pay</span>
              <span style={{ color: '#f1f5f9', fontWeight: 600 }}>
                {proposal.amountIn || proposal.fromAmount || proposal.amountA} {proposal.tokenIn || proposal.fromToken || proposal.tokenA}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#94a3b8' }}>Receive (Est.)</span>
              <span style={{ color: '#10b981', fontWeight: 600 }}>
                {proposal.expectedOutput || `${proposal.minAmountOut || proposal.minToAmount || proposal.amountB} ${proposal.tokenOut || proposal.toToken || proposal.tokenB}`}
              </span>
            </div>
            <div style={{ height: '1px', background: 'rgba(255,255,255,0.08)' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#94a3b8' }}>Route</span>
              <span style={{ color: '#f1f5f9' }}>{proposal.route || 'AGGFlow Entrypoint'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#94a3b8' }}>Price Impact</span>
              <span style={{ color: '#f1f5f9' }}>{proposal.priceImpact || '<0.01%'}</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button 
              onClick={onCancel}
              disabled={isExecuting}
              style={{
                flex: 1,
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '12px',
                padding: '12px',
                color: '#f1f5f9',
                fontWeight: 600,
                cursor: isExecuting ? 'not-allowed' : 'pointer',
                opacity: isExecuting ? 0.5 : 1
              }}
            >
              Cancel
            </button>
            <button 
              onClick={onConfirm}
              disabled={isExecuting}
              style={{
                flex: 1,
                background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                border: 'none',
                borderRadius: '12px',
                padding: '12px',
                color: '#fff',
                fontWeight: 600,
                cursor: isExecuting ? 'not-allowed' : 'pointer',
                opacity: isExecuting ? 0.7 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {isExecuting ? 'Executing...' : 'Confirm'}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default ConfirmModal;
