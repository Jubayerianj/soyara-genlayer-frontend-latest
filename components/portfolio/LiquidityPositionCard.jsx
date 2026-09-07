// components/portfolio/LiquidityPositionCard.jsx
import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { PieChart, TrendingUp, TrendingDown, Download, ExternalLink } from 'lucide-react';
import { formatNumber } from '../utils/price';
import { useChainId } from 'wagmi';
import { LitVM } from '../../wagmi.config';
import { useDiaOraclePrices } from '../../hooks/useDiaOraclePrices';
import { hasDiaOracleSupport } from '../../constants/tokens';

const LiquidityPositionCard = ({ position, index, onWithdrawClick }) => {
  const { 
    token0, 
    token1, 
    poolShare, 
    lpTokenBalance, 
    totalLP, 
    valueUSD,
    pairAddress,
    reserves,
    feesEarned,
    apr
  } = position;

  const chainId = useChainId();
  
  // Get real prices from DIA Oracle for both tokens
  const { getTokenPrice } = useDiaOraclePrices([token0.symbol, token1.symbol]);
  
  // Calculate real token values using DIA Oracle prices
  const token0PriceData = getTokenPrice(token0.symbol);
  const token1PriceData = getTokenPrice(token1.symbol);
  
  const realToken0Value = token0.amount * (token0PriceData.priceUSD || 0);
  const realToken1Value = token1.amount * (token1PriceData.priceUSD || 0);
  const realTotalValue = realToken0Value + realToken1Value;
  
  // Check if both tokens have oracle prices
  const hasOraclePrices = token0PriceData.exists && token1PriceData.exists;
  
  const formatPoolShare = (share) => {
    if (share < 0.01) return '< 0.01%';
    return `${formatNumber(share)}%`;
  };

  const formatAPR = (apr) => {
    if (apr < 0.01) return '< 0.01%';
    return `${formatNumber(apr)}%`;
  };

  const handleWithdraw = () => {
    onWithdrawClick(position);
  };

  // Get explorer URL based on chain
  const getExplorerUrl = () => {
    if (chainId === 4441 || chainId === LitVM.id) {
      return `https://liteforge.explorer.caldera.xyz/address/${pairAddress}`;
    }
    // Fallback for other chains
    return `https://etherscan.io/address/${pairAddress}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="liquidity-position-card"
      data-has-oracle={hasOraclePrices}
    >
      <div className="position-header">
        <div className="pool-tokens">
          <div className="token-pair">
            <div className="token-icons">
              <img 
                src={token0.logoURI} 
                alt={token0.symbol} 
                className="token-icon token-icon-0"
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.src = 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png';
                }}
              />
              <img 
                src={token1.logoURI} 
                alt={token1.symbol} 
                className="token-icon token-icon-1"
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.src = 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png';
                }}
              />
            </div>
            <div className="token-names">
              <div className="pair-title">
                <h4>{token0.symbol}/{token1.symbol}</h4>
                <div className="oracle-status">
                  {hasOraclePrices ? (
                    <span className="oracle-badge oracle-available">
                      DIA Oracle
                    </span>
                  ) : (
                    <span className="oracle-badge oracle-unavailable">
                      No Oracle Data
                    </span>
                  )}
                </div>
              </div>
              <p className="pool-name">LitVMSwap Pool</p>
            </div>
          </div>
        </div>
        <div className="position-value">
          <span className="value-label">Value</span>
          <h3 className="value-amount">${formatNumber(realTotalValue)}</h3>
          <div className="value-source">
            {hasOraclePrices ? (
              <span className="source-text">Real-time DIA Oracle</span>
            ) : (
              <span className="source-text">Mock data</span>
            )}
          </div>
        </div>
      </div>

      <div className="position-details">
        <div className="detail-row">
          <span className="detail-label">Pool Share</span>
          <span className="detail-value">{formatPoolShare(poolShare)}</span>
        </div>
        <div className="detail-row">
          <span className="detail-label">LP Tokens</span>
          <span className="detail-value">
            {formatNumber(lpTokenBalance)} / {formatNumber(totalLP)}
          </span>
        </div>
        <div className="detail-row">
          <span className="detail-label">Estimated APR</span>
          <span className={`detail-value ${apr > 10 ? 'high-apr' : apr > 5 ? 'medium-apr' : 'low-apr'}`}>
            {formatAPR(apr)}
          </span>
        </div>
      </div>

      <div className="token-amounts">
        <div className="token-amount">
          <div className="token-info">
            <img 
              src={token0.logoURI} 
              alt={token0.symbol} 
              className="amount-token-icon"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png';
              }}
            />
            <div className="token-symbol-info">
              <span className="token-symbol">{token0.symbol}</span>
              <span className="token-price">
                {hasDiaOracleSupport(token0.symbol) ? 
                  `$${formatNumber(token0PriceData.priceUSD)}` : 
                  'No Oracle Price'
                }
              </span>
            </div>
          </div>
          <div className="amount-info">
            <span className="amount-value">{formatNumber(token0.amount)}</span>
            <span className={`amount-usd ${realToken0Value === 0 ? 'zero-value' : ''}`}>
              ≈ ${formatNumber(realToken0Value)}
            </span>
          </div>
        </div>
        <div className="token-amount">
          <div className="token-info">
            <img 
              src={token1.logoURI} 
              alt={token1.symbol} 
              className="amount-token-icon"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png';
              }}
            />
            <div className="token-symbol-info">
              <span className="token-symbol">{token1.symbol}</span>
              <span className="token-price">
                {hasDiaOracleSupport(token1.symbol) ? 
                  `$${formatNumber(token1PriceData.priceUSD)}` : 
                  'No Oracle Price'
                }
              </span>
            </div>
          </div>
          <div className="amount-info">
            <span className="amount-value">{formatNumber(token1.amount)}</span>
            <span className={`amount-usd ${realToken1Value === 0 ? 'zero-value' : ''}`}>
              ≈ ${formatNumber(realToken1Value)}
            </span>
          </div>
        </div>
      </div>

      <div className="position-actions">
        <button
          onClick={handleWithdraw}
          className="withdraw-button"
        >
          <Download className="withdraw-icon" />
          Withdraw
        </button>
        <a
          href={getExplorerUrl()}
          target="_blank"
          rel="noopener noreferrer"
          className="explorer-link"
        >
          <ExternalLink className="explorer-icon" />
          View Pool
        </a>
      </div>

      <style jsx>{`
        .liquidity-position-card {
          background: linear-gradient(145deg, #0f0f1f, #0a0a15);
          border: 1px solid #2d2d4d;
          border-radius: 20px;
          padding: 1.5rem;
          transition: all 0.3s ease;
        }

        .liquidity-position-card:hover {
          border-color: #00d395;
          transform: translateY(-2px);
          box-shadow: 0 10px 30px rgba(0, 211, 149, 0.1);
        }

        .liquidity-position-card[data-has-oracle="false"] {
          opacity: 0.8;
          border-color: #4a4a6d;
        }

        .liquidity-position-card[data-has-oracle="false"]:hover {
          border-color: #8a8ab5;
        }

        .position-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 1.5rem;
          padding-bottom: 1rem;
          border-bottom: 1px solid #2d2d4d;
        }

        .pool-tokens {
          flex: 1;
        }

        .token-pair {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .token-icons {
          position: relative;
          width: 56px;
          height: 56px;
        }

        .token-icon {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          border: 2px solid #0f0f1f;
          object-fit: cover;
          position: absolute;
        }

        .token-icon-0 {
          z-index: 2;
          top: 0;
          left: 0;
        }

        .token-icon-1 {
          z-index: 1;
          bottom: 0;
          right: 0;
        }

        .token-names h4 {
          color: white;
          font-size: 1.125rem;
          margin: 0 0 0.25rem 0;
        }

        .pair-title {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 0.25rem;
        }

        .oracle-status {
          display: flex;
          align-items: center;
        }

        .oracle-badge {
          font-size: 0.625rem;
          padding: 0.125rem 0.375rem;
          border-radius: 4px;
          font-weight: 500;
        }

        .oracle-available {
          background: rgba(0, 211, 149, 0.2);
          color: #00d395;
          border: 1px solid rgba(0, 211, 149, 0.3);
        }

        .oracle-unavailable {
          background: rgba(138, 138, 181, 0.2);
          color: #8a8ab5;
          border: 1px solid rgba(138, 138, 181, 0.3);
        }

        .pool-name {
          color: #8a8ab5;
          font-size: 0.875rem;
          margin: 0;
        }

        .position-value {
          text-align: right;
        }

        .value-label {
          display: block;
          color: #8a8ab5;
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 0.25rem;
        }

        .value-amount {
          color: white;
          font-size: 1.25rem;
          font-weight: 700;
          margin: 0 0 0.25rem 0;
        }

        .value-source {
          margin-top: 0.25rem;
        }

        .source-text {
          color: #8a8ab5;
          font-size: 0.75rem;
          font-style: italic;
        }

        .position-details {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1rem;
          margin-bottom: 1.5rem;
          padding: 1rem;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 12px;
        }

        .detail-row {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .detail-label {
          color: #8a8ab5;
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .detail-value {
          color: white;
          font-weight: 600;
          font-size: 0.875rem;
        }

        .high-apr {
          color: #00d395;
        }

        .medium-apr {
          color: #f59e0b;
        }

        .low-apr {
          color: #8a8ab5;
        }

        .token-amounts {
          margin-bottom: 1.5rem;
        }

        .token-amount {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.875rem;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          margin-bottom: 0.75rem;
        }

        .token-amount:last-child {
          margin-bottom: 0;
        }

        .token-info {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .token-symbol-info {
          display: flex;
          flex-direction: column;
          gap: 0.125rem;
        }

        .amount-token-icon {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          object-fit: cover;
        }

        .token-symbol {
          color: white;
          font-weight: 500;
          font-size: 0.875rem;
        }

        .token-price {
          color: #8a8ab5;
          font-size: 0.75rem;
        }

        .amount-info {
          text-align: right;
        }

        .amount-value {
          display: block;
          color: white;
          font-weight: 600;
          font-size: 0.875rem;
          margin-bottom: 0.125rem;
        }

        .amount-usd {
          color: #00d395;
          font-size: 0.75rem;
        }

        .amount-usd.zero-value {
          color: #8a8ab5;
        }

        .position-actions {
          display: flex;
          gap: 0.75rem;
        }

        .withdraw-button {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 0.75rem 1.5rem;
          background: linear-gradient(145deg, #00d395, #00b37d);
          color: white;
          border: none;
          border-radius: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .withdraw-button:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 20px rgba(0, 211, 149, 0.3);
        }

        .withdraw-icon {
          width: 16px;
          height: 16px;
        }

        .explorer-link {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 0.75rem 1.5rem;
          background: transparent;
          border: 1px solid #2d2d4d;
          color: #8a8ab5;
          border-radius: 12px;
          text-decoration: none;
          font-weight: 500;
          transition: all 0.2s ease;
        }

        .explorer-link:hover {
          background: rgba(0, 211, 149, 0.1);
          border-color: #00d395;
          color: #00d395;
        }

        .explorer-icon {
          width: 16px;
          height: 16px;
        }

        @media (max-width: 480px) {
          .position-details {
            grid-template-columns: 1fr;
            gap: 0.75rem;
          }

          .position-actions {
            flex-direction: column;
          }
          
          .token-amount {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.75rem;
          }
          
          .amount-info {
            text-align: left;
            width: 100%;
          }
        }
      `}</style>
    </motion.div>
  );
};

export default LiquidityPositionCard;