import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Search, XCircle } from 'lucide-react';
import { TokenIcon } from './TokenIcon';

export function CurrencyModal({ isOpen, onClose, onSelect, currencies = [], popularCurrencies = [] }) {
  const [search, setSearch] = useState('');

  if (!isOpen) return null;

  const filtered = currencies.filter(c => 
    c.ticker.toLowerCase().includes(search.toLowerCase()) ||
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="modalOverlay" onClick={onClose}>
      <motion.div 
        className="modalContent"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="modalHeader">
          <h3 className="modalTitle">Select Asset</h3>
          <button className="closeButton" onClick={onClose}><XCircle size={20} /></button>
        </div>

        <div className="searchBox">
          <Search size={18} color="#94a3b8" />
          <input 
            type="text"
            className="searchInput"
            placeholder="Search by token name or symbol..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        {!search && (
          <div className="popularSection">
            <span className="sectionTitle">Popular Layer-1 Assets</span>
            <div className="popularGrid">
              {popularCurrencies.map(c => (
                <button 
                  key={c.ticker} 
                  className="popularChip"
                  onClick={() => onSelect(c.ticker)}
                >
                  <TokenIcon currency={c} size={18} />
                  <span>{c.ticker.toUpperCase()}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="currencyList">
          {filtered.slice(0, 100).map(c => (
            <div 
              key={c.ticker}
              className="currencyItem"
              onClick={() => onSelect(c.ticker)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <TokenIcon currency={c} size={28} />
                <div>
                  <div className="currencySymbol">{c.ticker.toUpperCase()}</div>
                  <div className="currencyName">{c.name}</div>
                </div>
              </div>
              <span className="networkBadge">
                {c.network ? c.network.toUpperCase() : 'NATIVE'}
              </span>
            </div>
          ))}

          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '30px 0', color: '#64748b', fontSize: 14 }}>
              No matching assets found.
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
