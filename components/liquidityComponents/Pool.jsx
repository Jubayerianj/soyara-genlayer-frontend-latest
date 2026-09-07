// components/liquidity/Pools.jsx

// components/liquidity/Pools.jsx
'use client';


import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ethers } from 'ethers';
import { useAccount, useReadContract, usePublicClient } from 'wagmi';
import { CONTRACT_ADDRESSES } from '../../constants/addresses';
import { FACTORY_ABI, PAIR_ABI } from '../../constants/abis';
import { useTokens } from '../../hooks/common/useTokens';
import { ETHERS_CONSTANTS } from '../../constants/ethers';
import LiquidityActionButtons from './LiquidityActionButtons';
import { safeFormatUnits, safeParseUnits, addressesEqual } from '../../utils/ethers-safe';

// Sepolia RPC endpoints
const SEPOLIA_RPC_ENDPOINTS = [
  'https://sepolia.gateway.tenderly.co',
  'https://rpc2.sepolia.org',
  'https://sepolia.infura.io/v3/',
  'https://ethereum-sepolia-rpc.publicnode.com',
  'https://sepolia.gateway.tenderly.co',
  'https://ethereum-sepolia.gateway.tatum.io',
  
];

const getProvider = async () => {
  for (const endpoint of SEPOLIA_RPC_ENDPOINTS) {
    try {
      const provider = new ethers.JsonRpcProvider(endpoint, {
        name: 'sepolia',
        chainId: 11155111,
      });
      
      // Test the connection
      await provider.getBlockNumber();
      console.log('Connected to RPC:', endpoint);
      return provider;
    } catch (err) {
      console.warn('Failed to connect to:', endpoint, err.message);
      continue;
    }
  }
  
  // Fallback to a reliable endpoint
  return new ethers.JsonRpcProvider('https://rpc2.sepolia.org', {
    name: 'sepolia',
    chainId: 11155111,
  });
};

const Pool = () => {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { tokens, refreshBalances } = useTokens();
  
  const [userPools, setUserPools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPool, setSelectedPool] = useState(null);
  const [removeAmount, setRemoveAmount] = useState('');
  const [isRemoving, setIsRemoving] = useState(false);
  const [error, setError] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [provider, setProvider] = useState(null);

  // Initialize provider
  useEffect(() => {
    const initProvider = async () => {
      try {
        const prov = await getProvider();
        setProvider(prov);
      } catch (err) {
        console.error('Failed to initialize provider:', err);
        // Set a fallback provider
        setProvider(new ethers.JsonRpcProvider('https://rpc2.sepolia.org', {
          name: 'sepolia',
          chainId: 11155111,
        }));
      }
    };

    initProvider();
  }, []);

  // Get all pairs from factory using wagmi
  const { data: allPairsLength, refetch: refetchPairsLength } = useReadContract({
    address: CONTRACT_ADDRESSES.sepolia.factory,
    abi: FACTORY_ABI,
    functionName: 'allPairsLength',
    chainId: 11155111,
  });

  // Fetch user's LP positions
  const fetchUserPools = useCallback(async () => {
    if (!isConnected || !address || !provider) {
      setUserPools([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      const pairs = [];
      const pairCount = allPairsLength ? Number(allPairsLength) : 0;
      
      // Check limited number of pairs for demo
      const limit = Math.min(pairCount, 10);
      
      for (let i = 0; i < limit; i++) {
        try {
          const pairAddress = await fetchPairAddress(i);
          if (!pairAddress || addressesEqual(pairAddress, ETHERS_CONSTANTS.ZeroAddress)) {
            continue;
          }

          const pairInfo = await fetchPairInfo(pairAddress);
          if (pairInfo && pairInfo.userLiquidity > ETHERS_CONSTANTS.Zero) {
            pairs.push({
              ...pairInfo,
              index: i,
              address: pairAddress,
            });
          }
        } catch (err) {
          console.error(`Error fetching pair ${i}:`, err);
          continue;
        }
      }

      setUserPools(pairs);
    } catch (err) {
      console.error('Error fetching user pools:', err);
      setError('Failed to load pools. Please try again later.');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [isConnected, address, provider, allPairsLength]);

  const fetchPairAddress = async (index) => {
    if (!provider) return ETHERS_CONSTANTS.ZeroAddress;
    
    try {
      const factory = new ethers.Contract(
        CONTRACT_ADDRESSES.sepolia.factory,
        FACTORY_ABI,
        provider
      );
      return await factory.allPairs(index);
    } catch (err) {
      console.error('Error fetching pair address:', err);
      return ETHERS_CONSTANTS.ZeroAddress;
    }
  };

  const fetchPairInfo = async (pairAddress) => {
    if (!provider || !address) return null;
    
    try {
      const pair = new ethers.Contract(pairAddress, PAIR_ABI, provider);
      
      const [token0, token1, reserves, totalSupply, userBalance] = await Promise.all([
        pair.token0(),
        pair.token1(),
        pair.getReserves(),
        pair.totalSupply(),
        pair.balanceOf(address),
      ]);

      const token0Info = tokens.find(t => addressesEqual(t.address, token0));
      const token1Info = tokens.find(t => addressesEqual(t.address, token1));

      // Ensure values are BigInt
      const userBalanceBigInt = BigInt(userBalance.toString());
      const totalSupplyBigInt = BigInt(totalSupply.toString());
      const reserve0BigInt = BigInt(reserves[0].toString());
      const reserve1BigInt = BigInt(reserves[1].toString());

      const userShare = totalSupplyBigInt > ETHERS_CONSTANTS.Zero 
        ? (Number(userBalanceBigInt) * 10000) / Number(totalSupplyBigInt) / 100
        : 0;

      const userToken0 = totalSupplyBigInt > ETHERS_CONSTANTS.Zero 
        ? (reserve0BigInt * userBalanceBigInt) / totalSupplyBigInt
        : ETHERS_CONSTANTS.Zero;

      const userToken1 = totalSupplyBigInt > ETHERS_CONSTANTS.Zero 
        ? (reserve1BigInt * userBalanceBigInt) / totalSupplyBigInt
        : ETHERS_CONSTANTS.Zero;

      // Calculate USD value (simplified)
      const token0Value = Number(safeFormatUnits(userToken0, token0Info?.decimals || 18));
      const token1Value = Number(safeFormatUnits(userToken1, token1Info?.decimals || 18));
      const totalValue = (token0Value + token1Value).toFixed(2);

      return {
        token0: token0Info || { 
          address: token0, 
          symbol: token0Info?.symbol || 'Unknown', 
          decimals: token0Info?.decimals || 18,
          logoURI: token0Info?.logoURI
        },
        token1: token1Info || { 
          address: token1, 
          symbol: token1Info?.symbol || 'Unknown', 
          decimals: token1Info?.decimals || 18,
          logoURI: token1Info?.logoURI
        },
        reserves: {
          token0: reserve0BigInt,
          token1: reserve1BigInt,
        },
        totalSupply: totalSupplyBigInt,
        userLiquidity: userBalanceBigInt,
        userShare,
        userTokens: {
          token0: userToken0,
          token1: userToken1,
        },
        totalValue,
      };
    } catch (err) {
      console.error('Error fetching pair info:', err);
      return null;
    }
  };

  const handleRemoveLiquidity = async () => {
    if (!selectedPool || !removeAmount || parseFloat(removeAmount) <= 0) {
      setError('Please select a pool and enter amount');
      return;
    }

    setIsRemoving(true);
    setError('');

    try {
      // In a real implementation, you would:
      // 1. Approve router to spend LP tokens
      // 2. Call removeLiquidity on router
      // For now, simulate transaction
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      setIsRemoving(false);
      setRemoveAmount('');
      setSelectedPool(null);
      
      // Refresh data
      await refreshPools();
      await refreshBalances();
      
      // Show success message
      alert('Liquidity removed successfully!');
      
    } catch (err) {
      setError(err.message);
      setIsRemoving(false);
    }
  };

  const handleSelectPool = (pool) => {
    setSelectedPool(pool);
    setRemoveAmount(safeFormatUnits(pool.userLiquidity, 18)); // LP tokens are 18 decimals
  };

  const setMaxRemoveAmount = () => {
    if (selectedPool) {
      setRemoveAmount(safeFormatUnits(selectedPool.userLiquidity, 18));
    }
  };

  const refreshPools = async () => {
    setIsRefreshing(true);
    await fetchUserPools();
    if (allPairsLength) {
      refetchPairsLength();
    }
  };

  const userPoolsList = useMemo(() => {
    return userPools.sort((a, b) => 
      Number(b.userLiquidity) - Number(a.userLiquidity)
    );
  }, [userPools]);

  // Initial fetch
  useEffect(() => {
    if (isConnected && address && provider) {
      fetchUserPools();
    }
  }, [isConnected, address, provider, allPairsLength, fetchUserPools]);

  return (
    <div className="pool-container">
      <div className="header-section">
        <h2 className="section-title">Your Liquidity Pools</h2>
        <div className="header-actions">
          <button
            onClick={refreshPools}
            disabled={isRefreshing || loading}
            className="refresh-button"
            type="button"
          >
            {isRefreshing ? (
              <div className="spinner-small"></div>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 4v6h-6" />
                <path d="M1 20v-6h6" />
                <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
              </svg>
            )}
          </button>
          <div className="stats-summary">
            <span className="stat-item">
              <span className="stat-label">Total Pools:</span>
              <span className="stat-value">{userPoolsList.length}</span>
            </span>
            <span className="stat-item">
              <span className="stat-label">Total Value:</span>
              <span className="stat-value">
                ${userPoolsList.reduce((sum, pool) => sum + parseFloat(pool.totalValue), 0).toFixed(2)}
              </span>
            </span>
          </div>
        </div>
      </div>

      {!isConnected ? (
        <div className="connect-warning">
          <div className="warning-icon">🔒</div>
          <h3>Wallet Not Connected</h3>
          <p>Connect your wallet to view your liquidity positions</p>
          <div className="connect-button-wrapper">
            <LiquidityActionButtons
              isConnected={false}
              onConnectWallet={() => {}}
            />
          </div>
        </div>
      ) : loading ? (
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>Loading your pools...</p>
        </div>
      ) : error ? (
        <div className="error-state">
          <div className="error-icon">⚠️</div>
          <h3>Error Loading Pools</h3>
          <p>{error}</p>
          <button
            onClick={refreshPools}
            className="retry-button"
            type="button"
          >
            Try Again
          </button>
        </div>
      ) : userPoolsList.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🏊‍♂️</div>
          <h3>No liquidity positions found</h3>
          <p>Add liquidity to a pool to earn trading fees</p>
          <button
            onClick={() => window.location.href = '/liquidity'}
            className="add-liquidity-button"
            type="button"
          >
            Add Liquidity
          </button>
        </div>
      ) : (
        <>
          <div className="pools-grid">
            {userPoolsList.map((pool) => (
              <div
                key={pool.address}
                className={`pool-card ${selectedPool?.address === pool.address ? 'selected' : ''}`}
                onClick={() => handleSelectPool(pool)}
              >
                <div className="pool-header">
                  <div className="pool-tokens">
                    <div className="token-icons">
                      <div className="token-icon">
                        {pool.token0.logoURI ? (
                          <img src={pool.token0.logoURI} alt={pool.token0.symbol} />
                        ) : (
                          <div className="token-icon-fallback">
                            {pool.token0.symbol.charAt(0)}
                          </div>
                        )}
                      </div>
                      <div className="token-icon second">
                        {pool.token1.logoURI ? (
                          <img src={pool.token1.logoURI} alt={pool.token1.symbol} />
                        ) : (
                          <div className="token-icon-fallback">
                            {pool.token1.symbol.charAt(0)}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="token-pair">
                      <span className="token-symbol">{pool.token0.symbol}</span>
                      <span className="token-separator">/</span>
                      <span className="token-symbol">{pool.token1.symbol}</span>
                    </div>
                    <span className="pool-share">{pool.userShare.toFixed(2)}% share</span>
                  </div>
                  <div className="pool-value">
                    <div className="value-amount">
                      ${pool.totalValue}
                    </div>
                    <div className="token-amounts">
                      {parseFloat(safeFormatUnits(pool.userTokens.token0, pool.token0.decimals)).toFixed(4)} {pool.token0.symbol} +{' '}
                      {parseFloat(safeFormatUnits(pool.userTokens.token1, pool.token1.decimals)).toFixed(4)} {pool.token1.symbol}
                    </div>
                  </div>
                </div>
                
                <div className="pool-details">
                  <div className="detail-row">
                    <span className="detail-label">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 6v6l4 2" />
                      </svg>
                      Your LP Tokens
                    </span>
                    <span className="detail-value">
                      {parseFloat(safeFormatUnits(pool.userLiquidity, 18)).toFixed(6)}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                      </svg>
                      Pool Reserves
                    </span>
                    <span className="detail-value">
                      {parseFloat(safeFormatUnits(pool.reserves.token0, pool.token0.decimals)).toFixed(2)} {pool.token0.symbol} /{' '}
                      {parseFloat(safeFormatUnits(pool.reserves.token1, pool.token1.decimals)).toFixed(2)} {pool.token1.symbol}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {selectedPool && (
            <div className="remove-liquidity-card">
              <div className="card-header">
                <h3 className="remove-title">Remove Liquidity</h3>
                <button
                  onClick={() => setSelectedPool(null)}
                  className="close-button"
                  type="button"
                  aria-label="Close"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              
              <div className="selected-pool-info">
                <div className="pool-token-display">
                  <div className="selected-token-icons">
                    <div className="selected-token-icon">
                      {selectedPool.token0.logoURI ? (
                        <img src={selectedPool.token0.logoURI} alt={selectedPool.token0.symbol} />
                      ) : (
                        <div className="selected-token-icon-fallback">
                          {selectedPool.token0.symbol.charAt(0)}
                        </div>
                      )}
                    </div>
                    <div className="selected-token-icon second">
                      {selectedPool.token1.logoURI ? (
                        <img src={selectedPool.token1.logoURI} alt={selectedPool.token1.symbol} />
                      ) : (
                        <div className="selected-token-icon-fallback">
                          {selectedPool.token1.symbol.charAt(0)}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="selected-token-symbols">
                    <span className="token-symbol">{selectedPool.token0.symbol}</span>
                    <span className="token-separator">/</span>
                    <span className="token-symbol">{selectedPool.token1.symbol}</span>
                  </div>
                </div>
                <div className="pool-address">
                  {selectedPool.address.substring(0, 6)}...{selectedPool.address.substring(selectedPool.address.length - 4)}
                </div>
              </div>

              <div className="remove-input-section">
                <div className="input-header">
                  <label className="input-label">Amount to Remove</label>
                  <div className="input-subtitle">
                    Balance: {parseFloat(safeFormatUnits(selectedPool.userLiquidity, 18)).toFixed(6)} LP tokens
                  </div>
                </div>
                <div className="remove-input-container">
                  <input
                    type="number"
                    placeholder="0.0"
                    value={removeAmount}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === '' || parseFloat(value) >= 0) {
                        setRemoveAmount(value);
                      }
                    }}
                    disabled={isRemoving}
                    className="remove-input"
                    min="0"
                    step="any"
                  />
                  <button
                    type="button"
                    onClick={setMaxRemoveAmount}
                    disabled={isRemoving}
                    className="max-remove-button"
                  >
                    MAX
                  </button>
                </div>
                
                {/* Breakdown of what you'll receive */}
                <div className="breakdown-section">
                  <div className="breakdown-title">You will receive:</div>
                  <div className="breakdown-tokens">
                    <div className="breakdown-token">
                      <span className="token-amount">
                        {selectedPool.totalSupply > ETHERS_CONSTANTS.Zero 
                          ? parseFloat(safeFormatUnits(
                              (BigInt(selectedPool.reserves.token0) * safeParseUnits(removeAmount || '0', 18)) / 
                              selectedPool.totalSupply,
                              selectedPool.token0.decimals
                            )).toFixed(6)
                          : '0.000000'
                        }
                      </span>
                      <span className="token-symbol">{selectedPool.token0.symbol}</span>
                    </div>
                    <div className="breakdown-token">
                      <span className="token-amount">
                        {selectedPool.totalSupply > ETHERS_CONSTANTS.Zero 
                          ? parseFloat(safeFormatUnits(
                              (BigInt(selectedPool.reserves.token1) * safeParseUnits(removeAmount || '0', 18)) / 
                              selectedPool.totalSupply,
                              selectedPool.token1.decimals
                            )).toFixed(6)
                          : '0.000000'
                        }
                      </span>
                      <span className="token-symbol">{selectedPool.token1.symbol}</span>
                    </div>
                  </div>
                </div>
              </div>

              {error && (
                <div className="error-message">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span>{error}</span>
                </div>
              )}

              {/* Use LiquidityActionButtons for remove */}
              <div className="remove-action-buttons">
                <LiquidityActionButtons
                  isConnected={isConnected}
                  amountA={removeAmount}
                  onRemoveLiquidity={handleRemoveLiquidity}
                  isRemoving={isRemoving}
                  showRemove={true}
                  size="lg"
                />
              </div>
            </div>
          )}
        </>
      )}

      <style jsx>{`
        .pool-container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 1rem;
        }

        .header-section {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2rem;
          flex-wrap: wrap;
          gap: 1rem;
        }

        .section-title {
          font-size: 1.75rem;
          font-weight: 700;
          color: #ffffff;
          margin: 0;
        }

        .header-actions {
          display: flex;
          align-items: center;
          gap: 1.5rem;
        }

        .refresh-button {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid #2d2d4d;
          border-radius: 8px;
          padding: 0.5rem;
          color: #8a8ab5;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .refresh-button:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.1);
          color: #00d395;
          border-color: #00d395;
        }

        .refresh-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .spinner-small {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(0, 211, 149, 0.3);
          border-radius: 50%;
          border-top-color: #00d395;
          animation: spin 1s ease-in-out infinite;
        }

        .stats-summary {
          display: flex;
          gap: 1.5rem;
          font-size: 0.875rem;
        }

        .stat-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .stat-label {
          color: #8a8ab5;
        }

        .stat-value {
          color: #ffffff;
          font-weight: 600;
          background: rgba(255, 255, 255, 0.05);
          padding: 0.25rem 0.75rem;
          border-radius: 6px;
        }

        .connect-warning {
          text-align: center;
          padding: 4rem 2rem;
          background: linear-gradient(145deg, #15152b, #0f0f1f);
          border-radius: 16px;
          border: 1px solid #2d2d4d;
        }

        .warning-icon {
          font-size: 4rem;
          margin-bottom: 1.5rem;
          opacity: 0.7;
        }

        .connect-warning h3 {
          font-size: 1.5rem;
          color: #ffffff;
          margin-bottom: 1rem;
        }

        .connect-warning p {
          color: #8a8ab5;
          font-size: 1rem;
          margin-bottom: 2rem;
        }

        .connect-button-wrapper {
          max-width: 300px;
          margin: 0 auto;
        }

        .loading-state {
          text-align: center;
          padding: 4rem 2rem;
        }

        .loading-spinner {
          width: 60px;
          height: 60px;
          border: 3px solid rgba(0, 211, 149, 0.3);
          border-radius: 50%;
          border-top-color: #00d395;
          animation: spin 1s ease-in-out infinite;
          margin: 0 auto 1.5rem;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .loading-state p {
          color: #8a8ab5;
          font-size: 1rem;
        }

        .error-state {
          text-align: center;
          padding: 4rem 2rem;
          background: linear-gradient(145deg, #15152b, #0f0f1f);
          border-radius: 16px;
          border: 1px solid #2d2d4d;
        }

        .error-icon {
          font-size: 4rem;
          margin-bottom: 1.5rem;
          opacity: 0.7;
        }

        .error-state h3 {
          font-size: 1.5rem;
          color: #ff4444;
          margin-bottom: 1rem;
        }

        .error-state p {
          color: #8a8ab5;
          font-size: 1rem;
          margin-bottom: 2rem;
        }

        .retry-button {
          background: linear-gradient(145deg, #f59e0b, #d97706);
          color: white;
          border: none;
          padding: 0.75rem 2rem;
          border-radius: 12px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .retry-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(245, 158, 11, 0.3);
        }

        .empty-state {
          text-align: center;
          padding: 4rem 2rem;
          background: linear-gradient(145deg, #15152b, #0f0f1f);
          border-radius: 16px;
          border: 1px solid #2d2d4d;
        }

        .empty-icon {
          font-size: 4rem;
          margin-bottom: 1.5rem;
          opacity: 0.7;
        }

        .empty-state h3 {
          font-size: 1.5rem;
          margin-bottom: 0.5rem;
          color: #ffffff;
        }

        .empty-state p {
          color: #8a8ab5;
          font-size: 1rem;
          margin-bottom: 2rem;
        }

        .add-liquidity-button {
          background: linear-gradient(145deg, #FF007A, #2172E5);
          color: white;
          border: none;
          padding: 0.75rem 2rem;
          border-radius: 12px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .add-liquidity-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(255, 0, 122, 0.3);
        }

        .pools-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
          gap: 1.5rem;
          margin-bottom: 2rem;
        }

        @media (max-width: 768px) {
          .pools-grid {
            grid-template-columns: 1fr;
          }
        }

        .pool-card {
          background: linear-gradient(145deg, #15152b, #0f0f1f);
          border-radius: 16px;
          padding: 1.5rem;
          border: 1px solid #2d2d4d;
          cursor: pointer;
          transition: all 0.3s ease;
          position: relative;
          overflow: hidden;
        }

        .pool-card:hover {
          border-color: #00d395;
          transform: translateY(-4px);
          box-shadow: 0 8px 32px rgba(0, 211, 149, 0.15);
        }

        .pool-card.selected {
          border-color: #00d395;
          background: rgba(0, 211, 149, 0.05);
        }

        .pool-card.selected::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: linear-gradient(90deg, #00d395, #00b37d);
        }

        .pool-header {
          margin-bottom: 1.5rem;
        }

        .pool-tokens {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 1rem;
        }

        .token-icons {
          display: flex;
          position: relative;
          margin-right: 0.75rem;
        }

        .token-icon {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          border: 2px solid #0f0f1f;
          overflow: hidden;
          background: #2d2d4d;
        }

        .token-icon.second {
          margin-left: -10px;
        }

        .token-icon img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .token-icon-fallback {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(145deg, #FF007A, #2172E5);
          color: white;
          font-weight: 600;
          font-size: 0.75rem;
        }

        .token-pair {
          display: flex;
          align-items: center;
          gap: 0.25rem;
          flex: 1;
        }

        .token-symbol {
          font-weight: 600;
          color: #ffffff;
          font-size: 1rem;
        }

        .token-separator {
          color: #8a8ab5;
        }

        .pool-share {
          font-size: 0.875rem;
          color: #00d395;
          background: rgba(0, 211, 149, 0.1);
          padding: 0.25rem 0.75rem;
          border-radius: 20px;
          font-weight: 600;
          white-space: nowrap;
        }

        .pool-value {
          text-align: right;
        }

        .value-amount {
          font-size: 1.25rem;
          font-weight: 700;
          color: #ffffff;
          margin-bottom: 0.25rem;
        }

        .token-amounts {
          font-size: 0.875rem;
          color: #8a8ab5;
          line-height: 1.4;
        }

        .pool-details {
          border-top: 1px solid #2d2d4d;
          padding-top: 1.25rem;
        }

        .detail-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.75rem;
        }

        .detail-row:last-child {
          margin-bottom: 0;
        }

        .detail-label {
          color: #8a8ab5;
          font-size: 0.875rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .detail-value {
          color: #ffffff;
          font-size: 0.875rem;
          font-weight: 500;
          text-align: right;
        }

        .remove-liquidity-card {
          background: linear-gradient(145deg, #15152b, #0f0f1f);
          border-radius: 20px;
          padding: 2rem;
          border: 1px solid #2d2d4d;
          margin-top: 2rem;
          position: relative;
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2rem;
        }

        .remove-title {
          font-size: 1.5rem;
          font-weight: 700;
          color: #ffffff;
          margin: 0;
        }

        .close-button {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid #2d2d4d;
          border-radius: 8px;
          padding: 0.5rem;
          color: #8a8ab5;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .close-button:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #ffffff;
          border-color: #ff4444;
        }

        .selected-pool-info {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2rem;
          padding: 1.25rem;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          border: 1px solid #2d2d4d;
        }

        .selected-pool-info:hover {
          border-color: #00d395;
        }

        .selected-token-icons {
          display: flex;
          position: relative;
          margin-right: 0.75rem;
        }

        .selected-token-icon {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          border: 2px solid #0f0f1f;
          overflow: hidden;
          background: #2d2d4d;
        }

        .selected-token-icon.second {
          margin-left: -8px;
        }

        .selected-token-icon img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .selected-token-icon-fallback {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(145deg, #FF007A, #2172E5);
          color: white;
          font-weight: 600;
          font-size: 0.875rem;
        }

        .selected-token-symbols {
          display: flex;
          align-items: center;
          gap: 0.25rem;
          font-size: 1.125rem;
          font-weight: 600;
        }

        .pool-address {
          font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
          font-size: 0.875rem;
          color: #8a8ab5;
          background: rgba(255, 255, 255, 0.05);
          padding: 0.5rem 0.75rem;
          border-radius: 6px;
        }

        .remove-input-section {
          margin-bottom: 2rem;
        }

        .input-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.75rem;
        }

        .input-label {
          display: block;
          font-size: 1rem;
          font-weight: 600;
          color: #ffffff;
        }

        .input-subtitle {
          font-size: 0.875rem;
          color: #8a8ab5;
        }

        .remove-input-container {
          display: flex;
          align-items: center;
          background: #1a1a2e;
          border: 1px solid #2d2d4d;
          border-radius: 12px;
          padding: 1rem 1.25rem;
          transition: all 0.2s ease;
          margin-bottom: 1.5rem;
        }

        .remove-input-container:focus-within {
          border-color: #00d395;
          box-shadow: 0 0 0 1px rgba(0, 211, 149, 0.1);
        }

        .remove-input {
          flex: 1;
          background: transparent;
          border: none;
          color: #ffffff;
          font-size: 1.5rem;
          font-weight: 600;
          outline: none;
          width: 100%;
        }

        .remove-input::placeholder {
          color: #5a5a7a;
        }

        .remove-input:disabled {
          opacity: 0.5;
        }

        .max-remove-button {
          background: rgba(0, 211, 149, 0.1);
          color: #00d395;
          border: 1px solid rgba(0, 211, 149, 0.3);
          border-radius: 8px;
          padding: 0.5rem 1rem;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          white-space: nowrap;
        }

        .max-remove-button:hover:not(:disabled) {
          background: rgba(0, 211, 149, 0.2);
          border-color: #00d395;
          transform: translateY(-1px);
        }

        .max-remove-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .breakdown-section {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          padding: 1.25rem;
          border: 1px solid #2d2d4d;
        }

        .breakdown-title {
          font-size: 0.875rem;
          color: #8a8ab5;
          margin-bottom: 1rem;
          font-weight: 500;
        }

        .breakdown-tokens {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1rem;
        }

        @media (max-width: 480px) {
          .breakdown-tokens {
            grid-template-columns: 1fr;
          }
        }

        .breakdown-token {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 8px;
          border: 1px solid #2d2d4d;
        }

        .token-amount {
          font-weight: 600;
          color: #ffffff;
          font-size: 0.875rem;
        }

        .error-message {
          background-color: rgba(255, 68, 68, 0.2);
          color: #ff4444;
          padding: 1rem 1.25rem;
          border-radius: 12px;
          margin-bottom: 1.5rem;
          font-size: 0.875rem;
          border: 1px solid rgba(255, 68, 68, 0.3);
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .remove-action-buttons {
          margin-top: 2rem;
        }

        @media (max-width: 768px) {
          .pool-container {
            padding: 0 0.75rem;
          }

          .header-section {
            flex-direction: column;
            align-items: stretch;
            gap: 1rem;
          }

          .header-actions {
            flex-direction: column;
            align-items: stretch;
            gap: 1rem;
          }

          .stats-summary {
            justify-content: space-between;
          }

          .remove-liquidity-card {
            padding: 1.5rem;
          }

          .selected-pool-info {
            flex-direction: column;
            gap: 1rem;
            align-items: stretch;
          }

          .pool-address {
            align-self: flex-start;
          }
        }
      `}</style>
    </div>
  );
};

export default Pool;