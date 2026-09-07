// components/common/TokenSelectModal.jsx - CLEAN, COMPACT & MODERN WEB3

import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, 
  X, 
  ChevronLeft,
  Check, 
  AlertTriangle,
  Shield,
  Loader2
} from 'lucide-react';
import { addressesEqual } from '../utils/ethers-safe';
import styles from './TokenSelectModal.module.css';

const getNumericBalance = (balance) => {
  if (balance === null || balance === undefined || balance === '') return 0;
  const parsed = typeof balance === 'string' ? parseFloat(balance) : Number(balance);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatTokenBalance = (balance) => {
  const numericBalance = getNumericBalance(balance);

  if (numericBalance === 0) return '0';
  if (numericBalance >= 1000000) return `${(numericBalance / 1000000).toFixed(2)}M`;
  if (numericBalance >= 1000) return `${(numericBalance / 1000).toFixed(2)}K`;
  if (numericBalance >= 1) return numericBalance.toFixed(4);
  if (numericBalance >= 0.0001) return numericBalance.toFixed(6);
  return numericBalance.toExponential(2);
};

const TokenSelectModal = ({
  tokens = [],
  onSelect,
  onClose,
  selectedToken = null,
  title = 'Select a token',
  showBalance = true,
  loading = false,
  excludeToken = null,
  onImportToken,
  chainId = 4441,
  closeOnSelect = true
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showImportForm, setShowImportForm] = useState(false);
  const [importAddress, setImportAddress] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState('');

  const popularTokens = useMemo(() => {
    if (!tokens || !Array.isArray(tokens)) return [];
    return tokens.filter(t => t.isPopular || ['zkLTC', 'ZKUSDC', 'ZKUSDT', 'ZKBTC', 'FSWP', 'LETH'].includes(t.symbol));
  }, [tokens]);

  const filteredTokens = useMemo(() => {
    if (!tokens || !Array.isArray(tokens)) return [];

    let filtered = [...tokens];

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      const isAddressQuery = /^0x[a-fA-F0-9]{40}$/.test(query);
      
      filtered = filtered.filter(token => {
        if (!token) return false;
        if (excludeToken && addressesEqual(token.address, excludeToken.address)) return false;
        
        if (isAddressQuery) {
          return token.address?.toLowerCase() === query.toLowerCase();
        }
        
        const symbolMatch = token.symbol?.toLowerCase().includes(query);
        const nameMatch = token.name?.toLowerCase().includes(query);
        return symbolMatch || nameMatch;
      });
    }

    filtered.sort((a, b) => {
      const balanceDiff = getNumericBalance(b.balance) - getNumericBalance(a.balance);
      if (Math.abs(balanceDiff) > 0.0000001) return balanceDiff;
      if (a.isVerified && !b.isVerified) return -1;
      if (!a.isVerified && b.isVerified) return 1;
      if (a.isPopular && !b.isPopular) return -1;
      if (!a.isPopular && b.isPopular) return 1;
      return a.symbol?.localeCompare(b.symbol || '');
    });

    return filtered;
  }, [tokens, searchQuery, excludeToken]);

  useEffect(() => {
    if (!showImportForm) {
      setImportAddress('');
      setImportError('');
    }
  }, [showImportForm]);

  const handleTokenSelect = (token) => {
    if (onSelect) {
      onSelect(token);
    }
    if (closeOnSelect && onClose) {
      onClose();
    }
  };

  const handleImport = async () => {
    if (!importAddress.trim()) return;

    setImportLoading(true);
    setImportError('');

    try {
      if (onImportToken) {
        const importedToken = await onImportToken(importAddress.trim());
        if (importedToken) {
          handleTokenSelect(importedToken);
        } else {
          setImportError('Token not found or invalid on LitVM');
        }
      }
    } catch (error) {
      setImportError(error.message || 'Failed to import token');
    } finally {
      setImportLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <div className={styles.modalOverlay} onClick={onClose}>
        <motion.div
          initial={{ y: 20, opacity: 0, scale: 0.98 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 20, opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.2 }}
          className={styles.modal}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className={styles.header}>
            {showImportForm ? (
              <div className={styles.headerRow}>
                <button
                  type="button"
                  onClick={() => setShowImportForm(false)}
                  className={styles.backButton}
                >
                  <ChevronLeft size={18} />
                </button>
                <h3>Import Token</h3>
                <button type="button" onClick={onClose} className={styles.closeButton}>
                  <X size={18} />
                </button>
              </div>
            ) : (
              <div className={styles.headerRow}>
                <h3>{title}</h3>
                <button type="button" onClick={onClose} className={styles.closeButton}>
                  <X size={18} />
                </button>
              </div>
            )}
          </div>

          {showImportForm ? (
            <div className={styles.importContainer}>
              <div className={styles.importWarning}>
                <AlertTriangle size={15} />
                <span>Import tokens at your own risk</span>
              </div>

              <div className={styles.importInputWrapper}>
                <input
                  type="text"
                  placeholder="Paste token contract address (0x...)"
                  value={importAddress}
                  onChange={(e) => {
                    setImportAddress(e.target.value);
                    setImportError('');
                  }}
                  className={styles.importInput}
                  autoFocus
                />
              </div>

              {importError && (
                <div className={styles.importError}>
                  {importError}
                </div>
              )}

              <button
                type="button"
                onClick={handleImport}
                disabled={!importAddress.trim() || importLoading}
                className={styles.importButton}
              >
                {importLoading ? (
                  <>
                    <Loader2 className={styles.spinner} size={15} />
                    Importing...
                  </>
                ) : (
                  'Import Token'
                )}
              </button>
            </div>
          ) : (
            <>
              {/* Search Bar */}
              <div className={styles.searchContainer}>
                <Search className={styles.searchIcon} size={16} />
                <input
                  type="text"
                  placeholder="Search name or paste address"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={styles.searchInput}
                  autoFocus
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className={styles.clearSearch}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Popular Tokens Strip */}
              {popularTokens.length > 0 && !searchQuery && (
                <div className={styles.popularTokensList}>
                  {popularTokens.map((token) => (
                    <button
                      key={token.address}
                      type="button"
                      onClick={() => handleTokenSelect(token)}
                      className={`${styles.popularTokenPill} ${
                        selectedToken && addressesEqual(selectedToken.address, token.address) ? styles.popularTokenPillSelected : ''
                      }`}
                    >
                      {token.logoURI ? (
                        <img src={token.logoURI} alt={token.symbol} className={styles.popularTokenLogo} />
                      ) : (
                        <div className={styles.popularTokenLogoFallback}>
                          {token.symbol?.charAt(0) || 'T'}
                        </div>
                      )}
                      <span>{token.symbol}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Token List */}
              <div className={styles.tokenList}>
                {loading ? (
                  <div className={styles.loading}>
                    <Loader2 className={styles.spinnerLarge} size={22} />
                    <span>Loading tokens...</span>
                  </div>
                ) : filteredTokens.length === 0 ? (
                  <div className={styles.empty}>
                    {searchQuery ? (
                      <>
                        <div className={styles.emptyIcon}>🔍</div>
                        <p>No tokens found</p>
                        <button
                          type="button"
                          onClick={() => setShowImportForm(true)}
                          className={styles.importTrigger}
                        >
                          Import {searchQuery.substring(0, 8)}...
                        </button>
                      </>
                    ) : (
                      <>
                        <div className={styles.emptyIcon}>🪙</div>
                        <p>No tokens available</p>
                      </>
                    )}
                  </div>
                ) : (
                  <div className={styles.tokenItems}>
                    {filteredTokens.map((token) => (
                      <TokenItem
                        key={token.address}
                        token={token}
                        isSelected={selectedToken && addressesEqual(selectedToken.address, token.address)}
                        showBalance={showBalance}
                        onClick={() => handleTokenSelect(token)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Footer */}
              {onImportToken && (
                <div className={styles.footer}>
                  <button
                    type="button"
                    onClick={() => setShowImportForm(true)}
                    className={styles.manageTokens}
                  >
                    <Shield size={14} />
                    <span>Import Custom Token</span>
                  </button>
                </div>
              )}
            </>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

const TokenItem = ({ token, isSelected, showBalance, onClick }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${styles.tokenItem} ${isSelected ? styles.selected : ''}`}
    >
      <div className={styles.tokenLeft}>
        <div className={styles.tokenIcon}>
          <img
            src={token.logoURI || token.imageUrl || '/tlogo.png'}
            alt={token.symbol}
            className={styles.tokenImage}
            onError={(e) => {
              e.currentTarget.src = '/tlogo.png';
            }}
          />
        </div>
        <div className={styles.tokenInfo}>
          <div className={styles.tokenSymbolRow}>
            <span className={styles.tokenSymbol}>{token.symbol}</span>
            {token.isVerified && (
              <span className={styles.verifiedBadge} title="Verified Token">✓</span>
            )}
          </div>
          <span className={styles.tokenName}>{token.name}</span>
        </div>
      </div>
      
      <div className={styles.tokenRight}>
        {showBalance && (
          <div className={styles.tokenBalanceGroup}>
            <span className={styles.tokenBalance}>
              {formatTokenBalance(token.balance)}
            </span>
          </div>
        )}
        {isSelected && (
          <Check className={styles.checkIcon} size={15} />
        )}
      </div>
    </button>
  );
};

export default TokenSelectModal;
