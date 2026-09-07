import React, { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/router';
import { Search, TrendingUp, TrendingDown, ArrowRight, Info } from 'lucide-react';
import { useDiaOraclePrices } from '../../hooks/useDiaOraclePrices';
import { useTokenMarketData } from '../../hooks/useTokenMarketData';
import { getTokensWithTradingView, hasDiaOracleSupport } from '../../constants/tokens';

const ExploreTokenList = () => {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);
  
  const tokens = useMemo(() => {
    const tvTokens = getTokensWithTradingView(4441);
    return tvTokens.filter(token => hasDiaOracleSupport(token.symbol));
  }, []);
  const symbols = useMemo(() => tokens.map(t => t.symbol), [tokens]);
  
  const { prices, loading: oracleLoading } = useDiaOraclePrices(symbols);
  const { marketData, loading: marketLoading } = useTokenMarketData(tokens);

  const filteredTokens = tokens.filter(token => 
    token.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    token.symbol.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatPrice = (price) => {
    if (!price || price === 0) return '$0.00';
    if (price < 0.0001) return `$${price.toFixed(8)}`;
    if (price < 0.01) return `$${price.toFixed(6)}`;
    if (price < 1) return `$${price.toFixed(4)}`;
    return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatLargeNumber = (num) => {
    if (!num || num === 0) return '$0.00';
    if (num >= 1000000000) return `$${(num / 1000000000).toFixed(2)}B`;
    if (num >= 1000000) return `$${(num / 1000000).toFixed(2)}M`;
    if (num >= 1000) return `$${(num / 1000).toFixed(2)}K`;
    return `$${num.toFixed(2)}`;
  };

  const handleTrade = (address) => {
    router.push(`/trade/${address}`);
  };

  return (
    <div className="explore-container">
      <div className="explore-header-section">
        <div className="title-area">
          <h1 className="explore-title">Explore</h1>
          <p className="explore-subtitle">Discover and trade the most popular tokens on LitVM.</p>
        </div>
        
        <div className="actions-area">
          <div className="search-wrapper">
            <Search className="search-icon" size={18} />
            <input 
              type="text" 
              placeholder="Search tokens..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
          </div>
        </div>
      </div>

      <div className="token-table-container">
        <table className="token-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Token</th>
              <th>Price</th>
              <th>24h Change</th>
              <th>24h Volume</th>
              <th>Market Cap</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredTokens.map((token, index) => {
              const address = token.address.toLowerCase();
              const tokenMarketData = marketData[address] || {};
              const priceData = prices[token.symbol] || { priceUSD: 0 };
              
              // Prefer DIA Oracle price if available, otherwise use market data price
              const price = priceData.priceUSD > 0 ? priceData.priceUSD : (tokenMarketData.price || 0);
              const change = tokenMarketData.change24h || 0;
              const volume = tokenMarketData.volume24h || 0;
              const mcap = tokenMarketData.marketCap || 0;

              return (
                <tr key={token.address} onClick={() => handleTrade(token.address)} className="token-row">
                  <td className="row-index">{index + 1}</td>
                  <td>
                    <div className="token-info">
                      <img src={token.logoURI} alt={token.symbol} className="token-logo" />
                      <div className="token-details">
                        <div className="token-symbol">{token.symbol}</div>
                        <div className="token-name">{token.name}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="token-price">{formatPrice(price)}</div>
                  </td>
                  <td>
                    <div className={`token-change ${change >= 0 ? 'positive' : 'negative'}`}>
                      {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                    </div>
                  </td>
                  <td>
                    <div className="token-stats">{formatLargeNumber(volume)}</div>
                  </td>
                  <td>
                    <div className="token-stats">{formatLargeNumber(mcap)}</div>
                  </td>
                  <td className="action-cell">
                    <button className="trade-btn-mini">Trade</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <style jsx>{`
        .explore-container {
          max-width: 1280px;
          margin: 0 auto;
          padding: 40px 20px;
          color: #fff;
        }

        .explore-header-section {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          margin-bottom: 32px;
          gap: 24px;
        }

        .explore-title {
          font-size: 32px;
          font-weight: 700;
          margin: 0 0 8px 0;
          letter-spacing: -0.02em;
        }

        .explore-subtitle {
          color: #9ca3af;
          font-size: 16px;
          margin: 0;
        }

        .search-wrapper {
          position: relative;
          width: 320px;
        }

        .search-icon {
          position: absolute;
          left: 16px;
          top: 50%;
          transform: translateY(-50%);
          color: #6b7280;
        }

        .search-input {
          width: 100%;
          background: #111111;
          border: 1px solid #222;
          border-radius: 12px;
          padding: 12px 16px 12px 48px;
          color: white;
          outline: none;
          font-size: 15px;
          transition: all 0.2s;
        }

        .search-input:focus {
          border-color: #E21010;
          background: #161616;
        }

        .tabs-container {
          display: flex;
          gap: 8px;
          margin-bottom: 24px;
          border-bottom: 1px solid #222;
          padding-bottom: 1px;
        }

        .tab-button {
          background: none;
          border: none;
          color: #6b7280;
          font-size: 16px;
          font-weight: 600;
          padding: 12px 16px;
          cursor: pointer;
          position: relative;
          transition: color 0.2s;
        }

        .tab-button.active {
          color: #10bbe2;
        }

        .tab-button.active::after {
          content: '';
          position: absolute;
          bottom: -1px;
          left: 0;
          right: 0;
          height: 2px;
          background: #E21010;
        }

        .tab-button.disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .token-table-container {
          background: #0a0a0a;
          border: 1px solid #1a1a1a;
          border-radius: 16px;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }

        .token-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
          min-width: 850px;
        }

        .token-table th {
          padding: 16px 24px;
          color: #6b7280;
          font-weight: 600;
          font-size: 12px;
          text-transform: uppercase;
          border-bottom: 1px solid #1a1a1a;
          letter-spacing: 0.05em;
          white-space: nowrap;
        }

        .token-row {
          cursor: pointer;
          transition: background 0.2s;
        }

        .token-row:hover {
          background: #111111;
        }

        .token-table td {
          padding: 16px 24px;
          border-bottom: 1px solid #1a1a1a;
          vertical-align: middle;
        }

        .row-index {
          color: #4b5563;
          font-weight: 500;
          width: 40px;
        }

        .token-info {
          display: flex;
          align-items: center;
          gap: 12px;
          white-space: nowrap;
        }

        .token-logo {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: #1a1a1a;
          flex-shrink: 0;
        }

        .token-details {
          display: flex;
          flex-direction: column;
        }

        .token-symbol {
          font-weight: 700;
          color: #fff;
          font-size: 15px;
        }

        .token-name {
          color: #6b7280;
          font-size: 13px;
        }

        .token-price {
          color: #fff;
          font-weight: 600;
          font-family: 'JetBrains Mono', monospace;
        }

        .token-change {
          font-weight: 600;
          font-size: 14px;
        }

        .positive { color: #38bdf8; }
        .negative { color: #ef4444; }

        .token-stats {
          color: #fff;
          font-weight: 500;
        }

        .action-cell {
          text-align: right;
        }

        .trade-btn-mini {
          background: #1a1a1a;
          color: #fff;
          border: 1px solid #333;
          padding: 6px 16px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .token-row:hover .trade-btn-mini {
          background: #038c23;
          border-color: #07801d;
        }

        @media (max-width: 768px) {
          .explore-header-section {
            flex-direction: column;
            align-items: flex-start;
          }
          .search-wrapper {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
};

export default ExploreTokenList;