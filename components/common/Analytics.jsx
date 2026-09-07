// components/dex/Analytics.jsx



import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useContractRead } from 'wagmi';
import { CONTRACT_ADDRESSES } from '../../constants/addresses';
import { FACTORY_ABI, PAIR_ABI } from '../../constants/abis';
import { formatUnits } from '../utils/format';

const Analytics = () => {
  const [pools, setPools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalPairs: 0,
    totalLiquidity: 0,
    totalVolume: 0,
    feesGenerated: 0,
  });
  const [selectedTimeframe, setSelectedTimeframe] = useState('24h');
  const [searchTerm, setSearchTerm] = useState('');

  // Get all pairs count
  const { data: allPairsLength } = useContractRead({
    address: CONTRACT_ADDRESSES.sepolia.factory,
    abi: FACTORY_ABI,
    functionName: 'allPairsLength',
    enabled: true,
  });

  useEffect(() => {
    const fetchAnalyticsData = async () => {
      if (!allPairsLength) return;

      setLoading(true);
      try {
        const pairCount = allPairsLength.toNumber();
        setStats(prev => ({ ...prev, totalPairs: pairCount }));

        // Fetch first 10 pools for display
        const poolsToFetch = Math.min(pairCount, 10);
        const poolsData = [];

        for (let i = 0; i < poolsToFetch; i++) {
          try {
            const pairAddress = await fetchPairAddress(i);
            if (pairAddress === ethers.constants.AddressZero) continue;

            const poolData = await fetchPoolData(pairAddress, i);
            if (poolData) {
              poolsData.push(poolData);
            }
          } catch (err) {
            console.error(`Error fetching pool ${i}:`, err);
          }
        }

        setPools(poolsData);

        // Calculate total liquidity (simplified)
        const totalLiquidity = poolsData.reduce((sum, pool) => {
          // In production, you'd calculate USD value
          return sum + parseFloat(pool.liquidityUSD || 0);
        }, 0);

        setStats(prev => ({
          ...prev,
          totalLiquidity,
          totalVolume: totalLiquidity * 0.1, // Simulated volume
          feesGenerated: totalLiquidity * 0.003, // 0.3% fees
        }));

      } catch (err) {
        console.error('Error fetching analytics:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAnalyticsData();
  }, [allPairsLength]);

  const fetchPairAddress = async (index) => {
    const provider = new ethers.providers.JsonRpcProvider('https://rpc.sepolia.org');
    const factory = new ethers.Contract(CONTRACT_ADDRESSES.sepolia.factory, FACTORY_ABI, provider);
    return await factory.allPairs(index);
  };

  const fetchPoolData = async (pairAddress, index) => {
    const provider = new ethers.providers.JsonRpcProvider('https://rpc.sepolia.org');
    const pair = new ethers.Contract(pairAddress, PAIR_ABI, provider);
    
    try {
      const [token0, token1, reserves, totalSupply] = await Promise.all([
        pair.token0(),
        pair.token1(),
        pair.getReserves(),
        pair.totalSupply(),
      ]);

      // Get token symbols (simplified - in production you'd have a token registry)
      const token0Symbol = token0.substring(0, 6) + '...';
      const token1Symbol = token1.substring(0, 6) + '...';

      const liquidityUSD = parseFloat(formatUnits(reserves[0], 18)) + 
                         parseFloat(formatUnits(reserves[1], 18));

      const volume24h = liquidityUSD * 0.05; // Simulated
      const fees24h = volume24h * 0.003; // 0.3% fee
      const apr = (fees24h * 365 * 100) / (liquidityUSD || 1);

      return {
        id: index,
        address: pairAddress,
        token0: {
          address: token0,
          symbol: token0Symbol,
        },
        token1: {
          address: token1,
          symbol: token1Symbol,
        },
        liquidityUSD,
        volume24h,
        fees24h,
        apr,
        reserve0: formatUnits(reserves[0], 18),
        reserve1: formatUnits(reserves[1], 18),
        totalSupply: formatUnits(totalSupply, 18),
      };
    } catch (err) {
      console.error(`Error fetching pool data for ${pairAddress}:`, err);
      return null;
    }
  };

  const filteredPools = pools.filter(pool => 
    pool.token0.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
    pool.token1.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
    pool.address.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatCurrency = (value) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(2)}M`;
    }
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(2)}K`;
    }
    return `$${value.toFixed(2)}`;
  };

  const formatAPR = (value) => {
    return `${value.toFixed(2)}%`;
  };

  return (
    <div className="analytics-container">
      <h2 className="section-title">DEX Analytics</h2>

      {/* Timeframe Selector */}
      <div className="timeframe-selector">
        {['24h', '7d', '30d', 'All'].map((timeframe) => (
          <button
            key={timeframe}
            className={`timeframe-button ${selectedTimeframe === timeframe ? 'active' : ''}`}
            onClick={() => setSelectedTimeframe(timeframe)}
          >
            {timeframe}
          </button>
        ))}
      </div>

      {/* Stats Overview */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Pairs</div>
          <div className="stat-value">{stats.totalPairs}</div>
          <div className="stat-change positive">+0.0%</div>
        </div>
        
        <div className="stat-card">
          <div className="stat-label">Total Liquidity</div>
          <div className="stat-value">{formatCurrency(stats.totalLiquidity)}</div>
          <div className="stat-change positive">+0.0%</div>
        </div>
        
        <div className="stat-card">
          <div className="stat-label">24h Volume</div>
          <div className="stat-value">{formatCurrency(stats.totalVolume)}</div>
          <div className="stat-change positive">+0.0%</div>
        </div>
        
        <div className="stat-card">
          <div className="stat-label">Fees Generated</div>
          <div className="stat-value">{formatCurrency(stats.feesGenerated)}</div>
          <div className="stat-change positive">+0.0%</div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="search-section">
        <div className="search-container">
          <input
            type="text"
            placeholder="Search by token or pool address..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
          <div className="search-icon">🔍</div>
        </div>
      </div>

      {/* Pools Table */}
      <div className="pools-table-container">
        {loading ? (
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <p>Loading pools data...</p>
          </div>
        ) : filteredPools.length === 0 ? (
          <div className="empty-state">
            <p>No pools found</p>
          </div>
        ) : (
          <table className="pools-table">
            <thead>
              <tr>
                <th>Pool</th>
                <th>Liquidity</th>
                <th>Volume (24h)</th>
                <th>Fees (24h)</th>
                <th>APR</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPools.map((pool) => (
                <tr key={pool.id}>
                  <td>
                    <div className="pool-info">
                      <div className="pool-tokens">
                        <span className="token-symbol">{pool.token0.symbol}</span>
                        <span className="token-separator">/</span>
                        <span className="token-symbol">{pool.token1.symbol}</span>
                      </div>
                      <div className="pool-address">
                        {pool.address.substring(0, 6)}...{pool.address.substring(pool.address.length - 4)}
                      </div>
                    </div>
                  </td>
                  <td>{formatCurrency(pool.liquidityUSD)}</td>
                  <td>{formatCurrency(pool.volume24h)}</td>
                  <td>{formatCurrency(pool.fees24h)}</td>
                  <td className={`apr ${pool.apr > 0 ? 'positive' : 'negative'}`}>
                    {formatAPR(pool.apr)}
                  </td>
                  <td>
                    <div className="action-buttons">
                      <button className="action-button add">Add</button>
                      <button className="action-button view">View</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Chart Placeholder */}
      <div className="chart-placeholder">
        <div className="chart-header">
          <h3>Liquidity Growth</h3>
          <div className="chart-legend">
            <div className="legend-item">
              <div className="legend-color liquidity"></div>
              <span>Liquidity</span>
            </div>
            <div className="legend-item">
              <div className="legend-color volume"></div>
              <span>Volume</span>
            </div>
          </div>
        </div>
        <div className="chart-content">
          <p>Chart visualization will be available soon</p>
          <div className="chart-bars">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="chart-bar" style={{ height: `${Math.random() * 80 + 20}%` }}></div>
            ))}
          </div>
        </div>
      </div>

      <style jsx>{`
        .analytics-container {
          max-width: 1200px;
          margin: 0 auto;
        }

        .section-title {
          font-size: 1.5rem;
          font-weight: 700;
          text-align: center;
          margin-bottom: 2rem;
          color: #ffffff;
        }

        .timeframe-selector {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 2rem;
          justify-content: center;
        }

        .timeframe-button {
          padding: 0.5rem 1.5rem;
          background: #2d2d4d;
          color: #8a8ab5;
          border: 1px solid transparent;
          border-radius: 8px;
          font-size: 0.875rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .timeframe-button:hover {
          background: #3d3d5d;
          color: #ffffff;
        }

        .timeframe-button.active {
          background: rgba(0, 211, 149, 0.2);
          color: #00d395;
          border-color: #00d395;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(1, 1fr);
          gap: 1rem;
          margin-bottom: 2rem;
        }

        @media (min-width: 768px) {
          .stats-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (min-width: 1024px) {
          .stats-grid {
            grid-template-columns: repeat(4, 1fr);
          }
        }

        .stat-card {
          background: linear-gradient(145deg, #15152b, #0f0f1f);
          border-radius: 12px;
          padding: 1.5rem;
          border: 1px solid #2d2d4d;
          text-align: center;
        }

        .stat-label {
          font-size: 0.875rem;
          color: #8a8ab5;
          margin-bottom: 0.5rem;
        }

        .stat-value {
          font-size: 1.5rem;
          font-weight: 700;
          color: #ffffff;
          margin-bottom: 0.5rem;
        }

        .stat-change {
          font-size: 0.875rem;
          font-weight: 500;
        }

        .stat-change.positive {
          color: #00d395;
        }

        .stat-change.negative {
          color: #ff4444;
        }

        .search-section {
          margin-bottom: 2rem;
        }

        .search-container {
          position: relative;
          max-width: 500px;
          margin: 0 auto;
        }

        .search-input {
          width: 100%;
          background: #1a1a2e;
          border: 1px solid #2d2d4d;
          border-radius: 8px;
          padding: 0.75rem 1rem 0.75rem 3rem;
          color: #ffffff;
          font-size: 0.875rem;
          transition: all 0.2s ease;
        }

        .search-input:focus {
          outline: none;
          border-color: #00d395;
        }

        .search-icon {
          position: absolute;
          left: 1rem;
          top: 50%;
          transform: translateY(-50%);
          color: #8a8ab5;
        }

        .pools-table-container {
          background: linear-gradient(145deg, #15152b, #0f0f1f);
          border-radius: 12px;
          border: 1px solid #2d2d4d;
          overflow: hidden;
          margin-bottom: 2rem;
        }

        .loading-state {
          padding: 3rem;
          text-align: center;
        }

        .loading-spinner {
          width: 40px;
          height: 40px;
          border: 3px solid rgba(0, 211, 149, 0.3);
          border-radius: 50%;
          border-top-color: #00d395;
          animation: spin 1s ease-in-out infinite;
          margin: 0 auto 1rem;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .empty-state {
          padding: 3rem;
          text-align: center;
          color: #8a8ab5;
        }

        .pools-table {
          width: 100%;
          border-collapse: collapse;
        }

        .pools-table th {
          padding: 1rem;
          text-align: left;
          font-size: 0.875rem;
          font-weight: 600;
          color: #8a8ab5;
          border-bottom: 1px solid #2d2d4d;
          background: rgba(255, 255, 255, 0.05);
        }

        .pools-table td {
          padding: 1rem;
          border-bottom: 1px solid #2d2d4d;
          font-size: 0.875rem;
        }

        .pools-table tr:last-child td {
          border-bottom: none;
        }

        .pools-table tr:hover {
          background: rgba(255, 255, 255, 0.05);
        }

        .pool-info {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .pool-tokens {
          display: flex;
          align-items: center;
          gap: 0.25rem;
          font-weight: 600;
          color: #ffffff;
        }

        .token-separator {
          color: #8a8ab5;
        }

        .pool-address {
          font-family: monospace;
          font-size: 0.75rem;
          color: #8a8ab5;
        }

        .apr.positive {
          color: #00d395;
        }

        .apr.negative {
          color: #ff4444;
        }

        .action-buttons {
          display: flex;
          gap: 0.5rem;
        }

        .action-button {
          padding: 0.25rem 0.75rem;
          border-radius: 6px;
          font-size: 0.75rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          border: none;
        }

        .action-button.add {
          background: rgba(0, 211, 149, 0.2);
          color: #00d395;
          border: 1px solid rgba(0, 211, 149, 0.3);
        }

        .action-button.add:hover {
          background: rgba(0, 211, 149, 0.3);
          border-color: #00d395;
        }

        .action-button.view {
          background: rgba(59, 130, 246, 0.2);
          color: #3b82f6;
          border: 1px solid rgba(59, 130, 246, 0.3);
        }

        .action-button.view:hover {
          background: rgba(59, 130, 246, 0.3);
          border-color: #3b82f6;
        }

        .chart-placeholder {
          background: linear-gradient(145deg, #15152b, #0f0f1f);
          border-radius: 12px;
          padding: 1.5rem;
          border: 1px solid #2d2d4d;
        }

        .chart-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
        }

        .chart-header h3 {
          font-size: 1.125rem;
          font-weight: 600;
          color: #ffffff;
        }

        .chart-legend {
          display: flex;
          gap: 1rem;
        }

        .legend-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.875rem;
          color: #8a8ab5;
        }

        .legend-color {
          width: 12px;
          height: 12px;
          border-radius: 2px;
        }

        .legend-color.liquidity {
          background: #00d395;
        }

        .legend-color.volume {
          background: #3b82f6;
        }

        .chart-content {
          text-align: center;
          padding: 2rem 0;
        }

        .chart-content p {
          color: #8a8ab5;
          margin-bottom: 2rem;
        }

        .chart-bars {
          display: flex;
          justify-content: center;
          align-items: flex-end;
          gap: 1rem;
          height: 200px;
          padding: 0 2rem;
        }

        .chart-bar {
          width: 40px;
          background: linear-gradient(to top, #00d395, #00b37d);
          border-radius: 4px 4px 0 0;
          transition: height 0.3s ease;
        }
      `}</style>
    </div>
  );
};

export default Analytics;