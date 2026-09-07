// components/market/MarketCard.jsx
import { motion } from 'framer-motion';
import { Zap, TrendingUp, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { formatUnits } from 'viem';
import { useState, useEffect } from 'react';

// LitVM Network configuration
const LitVM_CONFIG = {
  chainId: 4441,
  explorerUrl: 'https://explorer.LitVM.network',
  nativeSymbol: 'ETH'
};

const MarketCard = ({ 
  pool, 
  isExpanded, 
  onExpand, 
  onAddLiquidity, 
  onTrade,
  calculateAPR 
}) => {
  
  // Format currency function
  const formatCurrency = (value) => {
    if (!value) return '$0.00';
    
    const numValue = typeof value === 'bigint' 
      ? parseFloat(formatUnits(value, 18)) 
      : parseFloat(value);
    
    if (numValue >= 1000000) {
      return `$${(numValue / 1000000).toFixed(2)}M`;
    } else if (numValue >= 1000) {
      return `$${(numValue / 1000).toFixed(2)}K`;
    } else if (numValue < 0.01 && numValue > 0) {
      return `$${numValue.toFixed(6)}`;
    } else {
      return `$${numValue.toFixed(2)}`;
    }
  };

  // Format bigint with decimals
  const formatBigInt = (value, decimals) => {
    if (!value || value === 0n) return '0';
    
    try {
      const numValue = typeof value === 'bigint' 
        ? parseFloat(formatUnits(value, decimals || 18)) 
        : parseFloat(value);
      
      if (numValue >= 1000000) {
        return `${(numValue / 1000000).toFixed(3)}M`;
      } else if (numValue >= 1000) {
        return `${(numValue / 1000).toFixed(2)}K`;
      } else if (numValue < 0.000001) {
        return numValue.toExponential(4);
      } else if (numValue < 0.01) {
        return numValue.toFixed(6);
      } else if (numValue < 1) {
        return numValue.toFixed(4);
      } else {
        return numValue.toFixed(2);
      }
    } catch (error) {
      console.error('Error formatting bigint:', error);
      return '0';
    }
  };

  // Calculate APR safely
  const safeCalculateAPR = () => {
    try {
      if (calculateAPR) {
        return calculateAPR(pool?.volume24h, pool?.tvl);
      }
      
      // Default calculation if no function provided
      if (!pool?.volume24h || !pool?.tvl) return 0;
      
      const volume = typeof pool.volume24h === 'bigint' 
        ? parseFloat(formatUnits(pool.volume24h, 18)) 
        : parseFloat(pool.volume24h);
      
      const tvl = typeof pool.tvl === 'bigint' 
        ? parseFloat(formatUnits(pool.tvl, 18)) 
        : parseFloat(pool.tvl);
      
      if (tvl === 0) return 0;
      
      // Assuming 0.3% fee on volume
      const dailyFee = volume * 0.003;
      const yearlyFee = dailyFee * 365;
      const apr = (yearlyFee / tvl) * 100;
      
      return isFinite(apr) ? Math.max(0, apr.toFixed(2)) : 0;
    } catch (error) {
      console.error('Error calculating APR:', error);
      return 0;
    }
  };

  const apr = safeCalculateAPR();
  
  let aprClass = 'market-card__apr';
  if (apr > 20) aprClass += ' market-card__apr--high';
  else if (apr > 10) aprClass += ' market-card__apr--medium';
  else aprClass += ' market-card__apr--low';

  // Check if pool data is valid
  if (!pool) {
    return (
      <div className="market-card market-card--empty">
        <div className="market-card__content">
          <div className="market-card__loading">Loading pool data...</div>
        </div>
      </div>
    );
  }

  // Ensure token objects have required properties
  const token0 = pool.token0 || { symbol: 'Unknown', name: 'Unknown Token', address: '', decimals: 18 };
  const token1 = pool.token1 || { symbol: 'Unknown', name: 'Unknown Token', address: '', decimals: 18 };
  
  // Ensure reserves exist
  const reserves = pool.reserves || { reserve0: 0n, reserve1: 0n };
  
  // Ensure TVL and volume exist
  const tvl = pool.tvl || 0n;
  const volume24h = pool.volume24h || 0n;
  
  // Get token addresses safely
  const token0Address = token0.address || '';
  const token1Address = token1.address || '';
  const poolAddress = pool.address || '';

  // Check if pool is a ETH pair
  const isETHPair = token0.symbol === LitVM_CONFIG.nativeSymbol || 
                    token1.symbol === LitVM_CONFIG.nativeSymbol;

  // Get explorer URL for token/pool
  const getExplorerUrl = (address) => {
    if (!address) return '';
    return `${LitVM_CONFIG.explorerUrl}/address/${address}`;
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        whileHover={{ y: -2 }}
        className="market-card"
      >
        <div className="market-card__content">
          {/* Card Header - Always Visible */}
          <div className="market-card__header">
            <div className="market-card__tokens">
              <div className="market-card__token-icons">
                <div className="market-card__token-icon market-card__token-icon--primary">
                  {token0.symbol ? token0.symbol.charAt(0).toUpperCase() : '?'}
                </div>
                <div className="market-card__token-icon market-card__token-icon--secondary">
                  {token1.symbol ? token1.symbol.charAt(0).toUpperCase() : '?'}
                </div>
              </div>
              <div className="market-card__token-info">
                <h3 className="market-card__pair">
                  {token0.symbol}/{token1.symbol}
                </h3>
                <p className="market-card__names">
                  {token0.name}/{token1.name}
                </p>
                {isETHPair && (
                  <span className="market-card__ETH-badge">
                    ETH Pair
                  </span>
                )}
              </div>
            </div>
            
            <div className="market-card__stats-summary">
              <div className="market-card__stat">
                <span className="market-card__stat-label">TVL</span>
                <span className="market-card__stat-value">{formatCurrency(tvl)}</span>
              </div>
              <div className="market-card__stat">
                <span className="market-card__stat-label">24h Vol</span>
                <span className="market-card__stat-value">{formatCurrency(volume24h)}</span>
              </div>
              <div className={aprClass}>
                {typeof apr === 'number' ? apr.toFixed(2) : '0.00'}% APR
              </div>
            </div>
          </div>

          {/* Expand Button */}
          <button 
            onClick={() => onExpand(poolAddress)}
            className="market-card__expand-btn"
            disabled={!poolAddress}
          >
            {isExpanded ? (
              <>
                <ChevronUp className="market-card__expand-icon" />
                Hide Details
              </>
            ) : (
              <>
                <ChevronDown className="market-card__expand-icon" />
                View Details
              </>
            )}
          </button>

          {/* Expanded Content */}
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="market-card__details"
            >
              <div className="market-card__detail-section">
                <h4 className="market-card__detail-title">Reserves</h4>
                <div className="market-card__reserves">
                  <div className="market-card__reserve">
                    <div className="market-card__reserve-token">{token0.symbol}</div>
                    <div className="market-card__reserve-amount">
                      {formatBigInt(reserves.reserve0, token0.decimals)}
                    </div>
                  </div>
                  <div className="market-card__reserve">
                    <div className="market-card__reserve-token">{token1.symbol}</div>
                    <div className="market-card__reserve-amount">
                      {formatBigInt(reserves.reserve1, token1.decimals)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="market-card__detail-section">
                <h4 className="market-card__detail-title">Token Details</h4>
                <div className="market-card__token-details">
                  <div className="market-card__token-detail">
                    <div className="market-card__token-label">Token 0</div>
                    <div className="market-card__token-address" title={token0Address}>
                      {token0.symbol} - {token0.name}
                      <div className="market-card__token-decimals">
                        Decimals: {token0.decimals || 18}
                      </div>
                    </div>
                    {token0Address && (
                      <a
                        href={getExplorerUrl(token0Address)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="market-card__explorer-link"
                      >
                        ETH Explorer <ExternalLink className="market-card__link-icon" />
                      </a>
                    )}
                  </div>
                  <div className="market-card__token-detail">
                    <div className="market-card__token-label">Token 1</div>
                    <div className="market-card__token-address" title={token1Address}>
                      {token1.symbol} - {token1.name}
                      <div className="market-card__token-decimals">
                        Decimals: {token1.decimals || 18}
                      </div>
                    </div>
                    {token1Address && (
                      <a
                        href={getExplorerUrl(token1Address)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="market-card__explorer-link"
                      >
                        ETH Explorer <ExternalLink className="market-card__link-icon" />
                      </a>
                    )}
                  </div>
                </div>
              </div>

              <div className="market-card__detail-section">
                <h4 className="market-card__detail-title">Pool Information</h4>
                <div className="market-card__pool-info">
                  <div className="market-card__info-item">
                    <span className="market-card__info-label">Pool Type:</span>
                    <span className="market-card__info-value">
                      {isETHPair ? 'ETH Pair' : 'Token Pair'}
                    </span>
                  </div>
                  <div className="market-card__info-item">
                    <span className="market-card__info-label">Network:</span>
                    <span className="market-card__info-value">
                      LitVM Network
                    </span>
                  </div>
                  <div className="market-card__info-item">
                    <span className="market-card__info-label">Chain ID:</span>
                    <span className="market-card__info-value">
                      {LitVM_CONFIG.chainId}
                    </span>
                  </div>
                  <div className="market-card__info-item">
                    <span className="market-card__info-label">Total Supply:</span>
                    <span className="market-card__info-value">
                      {pool.totalSupply ? formatBigInt(pool.totalSupply, 18) : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="market-card__actions">
                <button
                  onClick={() => onAddLiquidity(pool)}
                  className="market-card__action-btn market-card__action-btn--primary"
                  disabled={!pool}
                >
                  <Zap className="market-card__action-icon" />
                  Add Liquidity
                </button>
                <button
                  onClick={() => onTrade(pool)}
                  className="market-card__action-btn market-card__action-btn--secondary"
                  disabled={!pool}
                >
                  <TrendingUp className="market-card__action-icon" />
                  Trade
                </button>
              </div>

              {poolAddress && (
                <div className="market-card__contract-link">
                  <a
                    href={getExplorerUrl(poolAddress)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="market-card__pool-link"
                  >
                    Pool Contract: {poolAddress.slice(0, 6)}...{poolAddress.slice(-4)}
                    <ExternalLink className="market-card__link-icon" />
                  </a>
                </div>
              )}
            </motion.div>
          )}
        </div>
      </motion.div>

      <style jsx>{`
        /* Market Card Styles */
        .market-card {
          background: linear-gradient(to bottom right, #111827, #000);
          border: 1px solid #374151;
          border-radius: 1rem;
          overflow: hidden;
          transition: all 0.3s;
          margin-bottom: 1rem;
        }

        .market-card:hover {
          border-color: rgba(16, 185, 129, 0.3);
          box-shadow: 0 10px 30px -15px rgba(0, 0, 0, 0.5);
        }

        .market-card--empty {
          background: rgba(31, 41, 55, 0.5);
          border: 1px dashed #4b5563;
          min-height: 120px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .market-card__loading {
          color: #9ca3af;
          text-align: center;
          padding: 2rem;
        }

        .market-card__content {
          padding: 1.5rem;
        }

        .market-card__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 1rem;
          flex-wrap: wrap;
          gap: 1rem;
        }

        .market-card__tokens {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          flex: 1;
          min-width: 200px;
        }

        .market-card__token-icons {
          display: flex;
          position: relative;
        }

        .market-card__token-icon {
          width: 2.5rem;
          height: 2.5rem;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: bold;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
          font-size: 0.875rem;
        }

        .market-card__token-icon--primary {
          background: linear-gradient(to bottom right, #3b82f6, #1d4ed8);
          z-index: 2;
        }

        .market-card__token-icon--secondary {
          background: linear-gradient(to bottom right, #0284c7, #38bdf8);
          margin-left: -0.5rem;
          z-index: 1;
        }

        .market-card__token-info {
          flex: 1;
          min-width: 0;
        }

        .market-card__pair {
          font-size: 1.125rem;
          font-weight: bold;
          margin: 0 0 0.25rem 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          color: #fff;
        }

        .market-card__names {
          color: #9ca3af;
          font-size: 0.875rem;
          margin: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .market-card__ETH-badge {
          display: inline-block;
          background: rgba(52, 211, 153, 0.2);
          color: #34d399;
          font-size: 0.75rem;
          padding: 0.125rem 0.5rem;
          border-radius: 9999px;
          margin-top: 0.25rem;
          font-weight: 600;
        }

        .market-card__stats-summary {
          display: flex;
          align-items: center;
          gap: 1.5rem;
          flex-wrap: wrap;
        }

        .market-card__stat {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 0.25rem;
        }

        .market-card__stat-label {
          color: #9ca3af;
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .market-card__stat-value {
          font-size: 1rem;
          font-weight: 600;
          color: #fff;
        }

        .market-card__apr {
          padding: 0.375rem 0.75rem;
          border-radius: 9999px;
          font-size: 0.875rem;
          font-weight: 600;
          white-space: nowrap;
        }

        .market-card__apr--high {
          background: rgba(34, 197, 94, 0.1);
          color: #4ade80;
        }

        .market-card__apr--medium {
          background: rgba(234, 179, 8, 0.1);
          color: #facc15;
        }

        .market-card__apr--low {
          background: rgba(59, 130, 246, 0.1);
          color: #60a5fa;
        }

        .market-card__expand-btn {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          background: rgba(31, 41, 55, 0.3);
          border: 1px solid #374151;
          border-radius: 0.75rem;
          color: #34d399;
          padding: 0.75rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.3s;
          margin-bottom: 1rem;
        }

        .market-card__expand-btn:hover:not(:disabled) {
          background: #374151;
          color: #38bdf8;
        }

        .market-card__expand-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .market-card__expand-icon {
          width: 1rem;
          height: 1rem;
        }

        .market-card__details {
          border-top: 1px solid #374151;
          padding-top: 1.5rem;
        }

        .market-card__detail-section {
          margin-bottom: 1.5rem;
        }

        .market-card__detail-title {
          font-size: 1rem;
          font-weight: 600;
          margin-bottom: 0.75rem;
          color: #fff;
        }

        .market-card__reserves {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1rem;
          background: rgba(31, 41, 55, 0.3);
          padding: 1rem;
          border-radius: 0.75rem;
        }

        .market-card__reserve {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .market-card__reserve-token {
          font-weight: 500;
          color: #fff;
          font-size: 0.875rem;
        }

        .market-card__reserve-amount {
          color: #9ca3af;
          font-size: 0.875rem;
          font-family: monospace;
        }

        .market-card__token-details {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1rem;
        }

        .market-card__token-detail {
          background: rgba(31, 41, 55, 0.3);
          padding: 1rem;
          border-radius: 0.75rem;
        }

        .market-card__token-label {
          color: #9ca3af;
          font-size: 0.875rem;
          margin-bottom: 0.25rem;
        }

        .market-card__token-address {
          font-weight: 500;
          margin-bottom: 0.5rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          color: #fff;
          font-size: 0.875rem;
        }

        .market-card__token-decimals {
          color: #9ca3af;
          font-size: 0.75rem;
          margin-top: 0.25rem;
        }

        .market-card__explorer-link {
          color: #60a5fa;
          font-size: 0.75rem;
          display: flex;
          align-items: center;
          gap: 0.25rem;
          text-decoration: none;
          transition: color 0.3s;
        }

        .market-card__explorer-link:hover {
          color: #93c5fd;
        }

        .market-card__pool-info {
          background: rgba(31, 41, 55, 0.3);
          padding: 1rem;
          border-radius: 0.75rem;
        }

        .market-card__info-item {
          display: flex;
          justify-content: space-between;
          margin-bottom: 0.5rem;
        }

        .market-card__info-item:last-child {
          margin-bottom: 0;
        }

        .market-card__info-label {
          color: #9ca3af;
          font-size: 0.875rem;
        }

        .market-card__info-value {
          color: #fff;
          font-size: 0.875rem;
          font-weight: 500;
        }

        .market-card__actions {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 0.75rem;
          margin: 1.5rem 0;
        }

        .market-card__action-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 0.75rem;
          border-radius: 0.5rem;
          border: none;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s;
        }

        .market-card__action-btn--primary {
          background: linear-gradient(to right, #0284c7, #0369a1);
          color: white;
        }

        .market-card__action-btn--primary:hover:not(:disabled) {
          background: linear-gradient(to right, #0369a1, #1d4ed8);
          transform: translateY(-2px);
          box-shadow: 0 10px 15px -3px rgba(2, 132, 199, 0.2);
        }

        .market-card__action-btn--primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .market-card__action-btn--secondary {
          background: #1f2937;
          border: 1px solid #374151;
          color: white;
        }

        .market-card__action-btn--secondary:hover:not(:disabled) {
          background: #374151;
          transform: translateY(-2px);
        }

        .market-card__action-btn--secondary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .market-card__action-icon {
          width: 1rem;
          height: 1rem;
        }

        .market-card__contract-link {
          text-align: center;
          padding-top: 1rem;
          border-top: 1px solid #374151;
        }

        .market-card__pool-link {
          color: #9ca3af;
          font-size: 0.75rem;
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          text-decoration: none;
          transition: color 0.3s;
        }

        .market-card__pool-link:hover {
          color: #d1d5db;
        }

        .market-card__link-icon {
          width: 0.75rem;
          height: 0.75rem;
        }

        /* Responsive adjustments */
        @media (max-width: 768px) {
          .market-card__header {
            flex-direction: column;
            align-items: flex-start;
            gap: 1rem;
          }
          
          .market-card__stats-summary {
            width: 100%;
            justify-content: space-between;
          }
          
          .market-card__stat {
            align-items: flex-start;
          }
          
          .market-card__token-details {
            grid-template-columns: 1fr;
            gap: 0.75rem;
          }
          
          .market-card__actions {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 640px) {
          .market-card__tokens {
            min-width: 100%;
          }
          
          .market-card__stats-summary {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.75rem;
          }
          
          .market-card__reserves {
            grid-template-columns: 1fr;
          }
          
          .market-card__content {
            padding: 1rem;
          }
        }

        /* Animation for expand/collapse */
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes slideDown {
          from { height: 0; opacity: 0; }
          to { height: auto; opacity: 1; }
        }

        @keyframes slideUp {
          from { height: auto; opacity: 1; }
          to { height: 0; opacity: 0; }
        }
      `}</style>
    </>
  );
};

export default MarketCard;