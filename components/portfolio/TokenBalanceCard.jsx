// components/TokenBalanceCard.jsx
import React from 'react';
import { motion } from 'framer-motion';
import { ExternalLink, TrendingUp, TrendingDown, Minus, CheckCircle, XCircle } from 'lucide-react';
import { formatNumber, formatPriceWithSource, formatValueWithOracleCheck } from '../utils/price';
import { hasDiaOracleSupport } from '../../constants/tokens';

import { useDiaOraclePrices } from '../../hooks/useDiaOraclePrices';

const TokenBalanceCard = ({ token, index }) => {
  const { 
    symbol, 
    name, 
    balance, 
    priceUSD,
    priceChange24h,
    logoURI,
    address,
    isNative,
    lastUpdated
  } = token;

  // Use the optimized hook to get real prices
  const { getTokenPrice } = useDiaOraclePrices([symbol]);
  
  // Get real price data from DIA Oracle
  const priceData = getTokenPrice(symbol);
  const hasOraclePrice = priceData.exists && priceData.priceUSD > 0;
  
  // Calculate real value based on DIA Oracle price
  const realValueUSD = hasOraclePrice ? balance * priceData.priceUSD : 0;
  
  const formatBalance = (balance) => {
    if (balance > 1000000) {
      return `${formatNumber(balance / 1000000)}M`;
    } else if (balance > 1000) {
      return `${formatNumber(balance / 1000)}K`;
    } else if (balance < 0.000001) {
      return balance.toExponential(4);
    } else {
      return formatNumber(balance);
    }
  };

  const { formattedPrice, source, hasPrice } = formatPriceWithSource(priceData, symbol);

  const isNativeToken = isNative || symbol === 'ETH';
  const explorerUrl = `https://liteforge.explorer.caldera.xyz/token/${address}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="token-balance-card"
      data-has-price={hasOraclePrice}
    >
      <div className="token-header">
        <div className="token-info">
          <div className="token-logo-container">
            {logoURI ? (
              <img 
                src={logoURI} 
                alt={symbol}
                className="token-logo"
              />
            ) : (
              <div className="token-logo-placeholder">
                {symbol?.charAt(0) || 'T'}
              </div>
            )}
          </div>
          <div className="token-details">
            <div className="token-title">
              <h4 className="token-symbol">
                {symbol}
                {isNativeToken && <span className="native-badge">Native</span>}
              </h4>
              <div className="oracle-indicator">
                {hasOraclePrice ? (
                  <CheckCircle className="oracle-icon success" size={14} />
                ) : hasDiaOracleSupport(symbol) ? (
                  <XCircle className="oracle-icon warning" size={14} />
                ) : (
                  <XCircle className="oracle-icon error" size={14} />
                )}
                <span className="oracle-status-text">
                  {hasOraclePrice ? 'DIA Oracle' : 
                   hasDiaOracleSupport(symbol) ? 'No Oracle Data' : 'No price support'}
                </span>
              </div>
            </div>
            <p className="token-name">{name}</p>
          </div>
        </div>
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="explorer-link"
          title="View on ETH Explorer"
        >
          <ExternalLink className="link-icon" />
        </a>
      </div>

      <div className="token-balance">
        <div className="balance-info">
          <span className="balance-label">Balance</span>
          <span className="balance-value">{formatBalance(balance)} {symbol}</span>
        </div>
        <div className="value-info">
          <span className="value-label">Value</span>
          <span className={`value-amount ${!hasOraclePrice ? 'zero-value' : ''}`}>
            ${formatNumber(realValueUSD, 2, { tokenSymbol: symbol, hasOraclePrice })}
          </span>
        </div>
      </div>

      <div className="token-metrics">
        <div className="metric">
          <span className="metric-label">Price</span>
          <div className="price-display">
            <span className={`metric-value ${!hasOraclePrice ? 'no-price' : ''}`}>
              {formattedPrice}
            </span>
            <span className="price-source">
              {source}
            </span>
          </div>
        </div>
        <div className={`metric change-metric ${hasOraclePrice ? (priceChange24h >= 0 ? 'positive' : 'negative') : 'neutral'}`}>
          <span className="metric-label">24h Change</span>
          <div className="change-value">
            {hasOraclePrice ? (
              priceChange24h >= 0 ? (
                <TrendingUp className="change-icon" />
              ) : (
                <TrendingDown className="change-icon" />
              )
            ) : (
              <Minus className="change-icon" />
            )}
            <span>{hasOraclePrice ? `${Math.abs(priceChange24h).toFixed(2)}%` : 'N/A'}</span>
          </div>
        </div>
      </div>

      {lastUpdated && (
        <div className="last-updated">
          <span className="update-label">Updated:</span>
          <span className="update-time">
            {new Date(lastUpdated).toLocaleTimeString([], { 
              hour: '2-digit', 
              minute: '2-digit' 
            })}
          </span>
        </div>
      )}

      <style jsx>{`
        .token-balance-card {
          background: linear-gradient(145deg, #0f0f1f, #0a0a15);
          border: 1px solid #2d2d4d;
          border-radius: 16px;
          padding: 1.25rem;
          transition: all 0.3s ease;
          position: relative;
          overflow: hidden;
        }

        .token-balance-card:hover {
          border-color: #00d395;
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(0, 211, 149, 0.1);
        }

        .token-balance-card[data-has-price="false"] {
          opacity: 0.8;
        }

        .token-balance-card[data-has-price="false"]:hover {
          border-color: #8a8ab5;
        }

        /* Token Header */
        .token-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 1rem;
        }

        .token-info {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .token-logo-container {
          position: relative;
          width: 40px;
          height: 40px;
        }

        .token-logo {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          object-fit: cover;
          border: 2px solid #2d2d4d;
        }

        .token-logo-placeholder {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          background: linear-gradient(135deg, #2172E5, #00d395);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: bold;
          font-size: 1rem;
          border: 2px solid #2d2d4d;
        }

        .token-details {
          flex: 1;
        }

        .token-title {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.25rem;
        }

        .token-symbol {
          color: white;
          font-size: 1rem;
          font-weight: 600;
          margin: 0;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .native-badge {
          background: rgba(0, 211, 149, 0.2);
          color: #00d395;
          font-size: 0.625rem;
          padding: 0.125rem 0.375rem;
          border-radius: 4px;
          border: 1px solid rgba(0, 211, 149, 0.3);
        }

        .oracle-indicator {
          display: flex;
          align-items: center;
          gap: 0.25rem;
        }

        .oracle-icon.success {
          color: #00d395;
        }

        .oracle-icon.warning {
          color: #ffb347;
        }

        .oracle-icon.error {
          color: #ff4444;
        }

        .oracle-status-text {
          color: #8a8ab5;
          font-size: 0.75rem;
        }

        .token-name {
          color: #8a8ab5;
          font-size: 0.75rem;
          margin: 0;
          max-width: 150px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .explorer-link {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid #2d2d4d;
          border-radius: 8px;
          color: #8a8ab5;
          text-decoration: none;
          transition: all 0.2s ease;
        }

        .explorer-link:hover {
          background: rgba(0, 211, 149, 0.1);
          border-color: #00d395;
          color: #00d395;
        }

        .link-icon {
          width: 14px;
          height: 14px;
        }

        /* Balance Section */
        .token-balance {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
          padding: 0.75rem;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 12px;
        }

        .balance-info,
        .value-info {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .balance-label,
        .value-label {
          color: #8a8ab5;
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .balance-value {
          color: white;
          font-weight: 600;
          font-size: 0.875rem;
        }

        .value-amount {
          color: #00d395;
          font-weight: 700;
          font-size: 0.875rem;
        }

        .zero-value {
          color: #8a8ab5 !important;
        }

        /* Metrics */
        .token-metrics {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 0.75rem;
          margin-bottom: 0.75rem;
        }

        .metric {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          padding: 0.5rem;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 8px;
        }

        .metric-label {
          color: #8a8ab5;
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .price-display {
          display: flex;
          flex-direction: column;
          gap: 0.125rem;
        }

        .metric-value {
          color: white;
          font-weight: 600;
          font-size: 0.75rem;
        }

        .metric-value.no-price {
          color: #8a8ab5;
        }

        .price-source {
          color: #8a8ab5;
          font-size: 0.625rem;
        }

        .change-metric.positive .change-value {
          color: #00d395;
        }

        .change-metric.negative .change-value {
          color: #ff4444;
        }

        .change-metric.neutral .change-value {
          color: #8a8ab5;
        }

        .change-value {
          display: flex;
          align-items: center;
          gap: 0.375rem;
          font-weight: 600;
          font-size: 0.75rem;
        }

        .change-icon {
          width: 12px;
          height: 12px;
        }

        /* Last Updated */
        .last-updated {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 0.5rem;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
        }

        .update-label {
          color: #8a8ab5;
          font-size: 0.75rem;
        }

        .update-time {
          color: #8a8ab5;
          font-size: 0.75rem;
          font-weight: 500;
        }

        @media (max-width: 480px) {
          .token-metrics {
            grid-template-columns: 1fr;
          }
          
          .token-balance-card {
            padding: 1rem;
          }
        }
      `}</style>
    </motion.div>
  );
};

export default TokenBalanceCard;