import React, { useState, useMemo } from 'react';
import { Search, Plus, Trash2 } from 'lucide-react';
import styles from '../../pages/PoolPage.module.css';

const Sidebar = ({
  catalog,
  catalogLoading,
  pairOptions,
  selectedKey,
  setSelectedKey,
  setAmountA,
  setAmountB,
  setWithdrawPercent,
  setError,
  setSuccess,
  setModalConfig,
  setIsTokenModalOpen,
  setIsAddPairModalOpen,
  removeCustomPair,
  getLogo
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredPairs = useMemo(() => {
    const list = catalog.length ? catalog : pairOptions;
    if (!searchQuery) return list;
    const query = searchQuery.toLowerCase();
    return list.filter(
      (pair) =>
        pair.tokenA.symbol.toLowerCase().includes(query) ||
        pair.tokenB.symbol.toLowerCase().includes(query)
    );
  }, [searchQuery, catalog, pairOptions]);

  return (
    <aside className={styles.sidebar}>
      <div className={styles.sidebarHeader}>
        <div className={styles.sidebarTitleRow}>
          <h2>Pool Markets</h2>
          <div className={styles.sidebarActionGroup}>
            <button 
              type="button"
              className={styles.sidebarActionButton}
              onClick={() => {
                setModalConfig({ type: 'customToken', title: 'Import Token' });
                setIsTokenModalOpen(true);
              }}
              title="Import Custom Token"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
        
        {/* Dynamic Search Bar */}
        <div className={styles.searchBar}>
          <Search size={13} className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search by token..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className={styles.pairList}>
        {filteredPairs.length === 0 ? (
          <div className={styles.noPairsFound}>
            <span>No pairs found</span>
          </div>
        ) : (
          filteredPairs.map((pair) => {
            const active = pair.key === selectedKey;

            return (
              <button
                key={pair.key}
                type="button"
                className={`${styles.pairCard} ${active ? styles.pairCardActive : ''}`}
                onClick={() => {
                  setSelectedKey(pair.key);
                  setAmountA('');
                  setAmountB('');
                  setWithdrawPercent(100);
                  setError('');
                  setSuccess('');
                }}
              >
                <div className={styles.pairIcons}>
                  <img src={getLogo(pair.tokenA)} alt={pair.tokenA.symbol} className={styles.pairLogo} />
                  <img src={getLogo(pair.tokenB)} alt={pair.tokenB.symbol} className={styles.pairLogo} />
                </div>
                
                <div className={styles.pairInfoCol}>
                  <div className={styles.pairSymbolsRow}>
                    <strong>{pair.tokenA.symbol}</strong>
                    <span className={styles.dividerSlash}>/</span>
                    <strong>{pair.tokenB.symbol}</strong>
                  </div>
                  <div className={styles.pairBadgeRow}>
                    <span className={`${styles.statusBadgeText} ${pair.hasPool ? styles.statusLive : styles.statusNew}`}>
                      {pair.hasPool ? 'Active' : 'New'}
                    </span>
                    {pair.hasPosition && (
                      <span className={styles.positionBadgeText}>LP Holding</span>
                    )}
                  </div>
                </div>

                {pair.isCustom && (
                  <div 
                    className={styles.removeCustomPair}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeCustomPair(pair.key);
                      if (active) setSelectedKey('');
                    }}
                    title="Remove Custom Pair"
                  >
                    <Trash2 size={12} />
                  </div>
                )}
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
};

export default Sidebar;
