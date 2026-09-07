import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, ChevronDown, AlertCircle } from 'lucide-react';
import TokenSelectModal from '../common/TokenSelectModal';
import styles from './AddCustomPairModal.module.css';

export default function AddCustomPairModal({
  isOpen,
  onClose,
  tokens,
  onImportToken,
  chainId,
  addCustomPair,
  setSelectedKey,
  getLogo
}) {
  const [tokenA, setTokenA] = useState(null);
  const [tokenB, setTokenB] = useState(null);
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [selectorTarget, setSelectorTarget] = useState('A'); // 'A' or 'B'
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSelectTokenClick = (target) => {
    setSelectorTarget(target);
    setIsSelectorOpen(true);
  };

  const handleTokenSelect = (token) => {
    if (selectorTarget === 'A') {
      if (tokenB && token.address.toLowerCase() === tokenB.address.toLowerCase()) {
        setError('Token A and Token B must be different');
        return;
      }
      setTokenA(token);
      setError('');
    } else {
      if (tokenA && token.address.toLowerCase() === tokenA.address.toLowerCase()) {
        setError('Token A and Token B must be different');
        return;
      }
      setTokenB(token);
      setError('');
    }
    setIsSelectorOpen(false);
  };

  const handleAddPair = () => {
    if (!tokenA || !tokenB) {
      setError('Please select both tokens');
      return;
    }
    if (tokenA.symbol === 'AURA' || tokenB.symbol === 'AURA') {
      const otherToken = tokenA.symbol === 'AURA' ? tokenB : tokenA;
      if (otherToken.symbol !== 'zkLTC' && !otherToken.isNative && otherToken.symbol !== 'ZKUSDC') {
        setError('AURA can only be paired with zkLTC or ZKUSDC');
        return;
      }
    }
    if (tokenA.symbol === 'CLINIC' || tokenB.symbol === 'CLINIC') {
      const otherToken = tokenA.symbol === 'CLINIC' ? tokenB : tokenA;
      if (otherToken.symbol !== 'zkLTC' && !otherToken.isNative && otherToken.symbol !== 'ZKUSDC') {
        setError('CLINIC can only be paired with zkLTC or ZKUSDC');
        return;
      }
    }

    try {
      const newPair = addCustomPair(tokenA, tokenB);
      if (newPair) {
        setSelectedKey(newPair.key);
      }
      // Reset state and close modal
      setTokenA(null);
      setTokenB(null);
      setError('');
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to add custom pair');
    }
  };

  const handleModalClose = () => {
    setTokenA(null);
    setTokenB(null);
    setError('');
    onClose();
  };

  return (
    <AnimatePresence>
      <div className={styles.modalOverlay} onClick={handleModalClose}>
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className={styles.modal}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className={styles.header}>
            <h3>Add Custom Liquidity Pair</h3>
            <button onClick={handleModalClose} className={styles.closeButton}>
              <X size={20} />
            </button>
          </div>

          {/* Body */}
          <div className={styles.body}>
            <p className={styles.description}>
              Select any two tokens to create a custom liquidity pair. Once added, you can provide liquidity for this pair on either V2 or V3 pools.
            </p>

            <div className={styles.selectorGrid}>
              {/* Token A Selector */}
              <div 
                className={`${styles.tokenSelector} ${tokenA ? styles.selected : ''}`}
                onClick={() => handleSelectTokenClick('A')}
              >
                <span className={styles.label}>Token A</span>
                {tokenA ? (
                  <div className={styles.tokenDisplay}>
                    <img src={getLogo(tokenA)} alt={tokenA.symbol} className={styles.tokenLogo} />
                    <div className={styles.tokenMeta}>
                      <strong>{tokenA.symbol}</strong>
                      <span>{tokenA.name}</span>
                    </div>
                  </div>
                ) : (
                  <div className={styles.placeholder}>
                    <span>Select Token</span>
                    <ChevronDown size={16} />
                  </div>
                )}
              </div>

              {/* Plus Divider */}
              <div className={styles.divider}>
                <Plus size={20} />
              </div>

              {/* Token B Selector */}
              <div 
                className={`${styles.tokenSelector} ${tokenB ? styles.selected : ''}`}
                onClick={() => handleSelectTokenClick('B')}
              >
                <span className={styles.label}>Token B</span>
                {tokenB ? (
                  <div className={styles.tokenDisplay}>
                    <img src={getLogo(tokenB)} alt={tokenB.symbol} className={styles.tokenLogo} />
                    <div className={styles.tokenMeta}>
                      <strong>{tokenB.symbol}</strong>
                      <span>{tokenB.name}</span>
                    </div>
                  </div>
                ) : (
                  <div className={styles.placeholder}>
                    <span>Select Token</span>
                    <ChevronDown size={16} />
                  </div>
                )}
              </div>
            </div>

            {error && (
              <div className={styles.errorBox}>
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <button
              onClick={handleAddPair}
              disabled={!tokenA || !tokenB}
              className={styles.actionButton}
            >
              Add Pair to Dashboard
            </button>
          </div>
        </motion.div>
      </div>

      {isSelectorOpen && (
        <TokenSelectModal
          tokens={tokens}
          onSelect={handleTokenSelect}
          onClose={() => setIsSelectorOpen(false)}
          title={`Select Token ${selectorTarget}`}
          onImportToken={onImportToken}
          chainId={chainId}
          closeOnSelect={true}
          excludeToken={selectorTarget === 'A' ? tokenB : tokenA}
        />
      )}
    </AnimatePresence>
  );
}
