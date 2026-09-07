// hooks/liquidity/useLiquidityPosition.js
import { useState, useEffect, useCallback, useMemo } from 'react';
import { ethers } from 'ethers';
import { useAccount, useReadContract } from 'wagmi';
import { ADDRESSES } from '../../constants/addresses';
import { FACTORY_ABI, PAIR_ABI, ERC20_ABI } from '../../constants/abis';
import { ETHERS_CONSTANTS } from '../../constants/ethers';
import { safeFormatUnits, addressesEqual, calculateLPTokenShare } from '../../utils/ethers-safe';

export const useLiquidityPosition = () => {
  const { address, isConnected } = useAccount();
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [totalValue, setTotalValue] = useState(0n);
  const [totalFees, setTotalFees] = useState(0n);

  // Get all pairs count
  const { data: allPairsLength, refetch: refetchPairsLength } = useReadContract({
    address: ADDRESSES.factory,
    abi: FACTORY_ABI,
    functionName: 'allPairsLength',
    enabled: true,
  });

  // Fetch all user positions
  const fetchPositions = useCallback(async () => {
    if (!isConnected || !address || !allPairsLength) {
      setPositions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const provider = new ethers.JsonRpcProvider('https://liteforge.rpc.caldera.xyz/infra-partner-http');
      const factory = new ethers.Contract(ADDRESSES.factory, FACTORY_ABI, provider);
      
      const pairCount = Number(allPairsLength);
      const positionsList = [];
      let totalValueBig = 0n;
      let totalFeesBig = 0n;

      // Check first 50 pairs (adjust as needed)
      const checkCount = Math.min(pairCount, 50);
      
      for (let i = 0; i < checkCount; i++) {
        try {
          const pairAddress = await factory.allPairs(i);
          const position = await fetchPositionDetails(pairAddress, provider);
          
          if (position && position.lpBalance > 0n) {
            positionsList.push(position);
            totalValueBig += position.value;
            totalFeesBig += position.earnedFees;
          }
        } catch (err) {
          console.error(`Error fetching pair ${i}:`, err);
          continue;
        }
      }

      setPositions(positionsList);
      setTotalValue(totalValueBig);
      setTotalFees(totalFeesBig);
    } catch (err) {
      console.error('Error fetching positions:', err);
      setError('Failed to load liquidity positions');
    } finally {
      setLoading(false);
    }
  }, [isConnected, address, allPairsLength]);

  // Fetch detailed position info
  const fetchPositionDetails = async (pairAddress, provider) => {
    try {
      const pair = new ethers.Contract(pairAddress, PAIR_ABI, provider);
      
      const [
        token0Address,
        token1Address,
        reserves,
        totalSupply,
        lpBalance,
        token0Contract,
        token1Contract
      ] = await Promise.all([
        pair.token0(),
        pair.token1(),
        pair.getReserves(),
        pair.totalSupply(),
        address ? pair.balanceOf(address) : 0n,
        new ethers.Contract(await pair.token0(), ERC20_ABI, provider),
        new ethers.Contract(await pair.token1(), ERC20_ABI, provider)
      ]);

      // Get token info
      const [token0Symbol, token0Decimals, token1Symbol, token1Decimals] = await Promise.all([
        token0Contract.symbol().catch(() => 'Unknown'),
        token0Contract.decimals().catch(() => 18),
        token1Contract.symbol().catch(() => 'Unknown'),
        token1Contract.decimals().catch(() => 18)
      ]);

      // Calculate user share
      const share = totalSupply > 0n 
        ? (Number(lpBalance) * 10000) / Number(totalSupply) / 100
        : 0;

      // Calculate token amounts
      const token0Amount = totalSupply > 0n 
        ? (reserves[0] * lpBalance) / totalSupply
        : 0n;
      
      const token1Amount = totalSupply > 0n 
        ? (reserves[1] * lpBalance) / totalSupply
        : 0n;

      // Format amounts
      const formattedToken0 = safeFormatUnits(token0Amount, token0Decimals);
      const formattedToken1 = safeFormatUnits(token1Amount, token1Decimals);

      // TODO: Fetch prices and calculate USD value
      const value = token0Amount + token1Amount; // Simplified - replace with actual USD calculation
      const earnedFees = 0n; // TODO: Calculate earned fees from collected fees

      return {
        pairAddress,
        token0: {
          address: token0Address,
          symbol: token0Symbol,
          decimals: token0Decimals,
          amount: token0Amount,
          formatted: formattedToken0
        },
        token1: {
          address: token1Address,
          symbol: token1Symbol,
          decimals: token1Decimals,
          amount: token1Amount,
          formatted: formattedToken1
        },
        lpBalance,
        totalSupply,
        share,
        reserves: {
          token0: reserves[0],
          token1: reserves[1]
        },
        value,
        earnedFees,
        formattedValue: safeFormatUnits(value, 18),
        formattedFees: safeFormatUnits(earnedFees, 18),
        timestamp: Date.now()
      };
    } catch (err) {
      console.error('Error fetching position details:', err);
      return null;
    }
  };

  // Get specific position by pair address
  const getPosition = useCallback(async (pairAddress) => {
    if (!pairAddress || !isConnected) return null;
    
    try {
      const provider = new ethers.JsonRpcProvider('https://liteforge.rpc.caldera.xyz/infra-partner-http');
      return await fetchPositionDetails(pairAddress, provider);
    } catch (err) {
      console.error('Error getting position:', err);
      return null;
    }
  }, [isConnected]);

  // Calculate position value
  const calculatePositionValue = useCallback((position) => {
    if (!position) return 0n;
    
    // TODO: Implement actual USD value calculation using price feeds
    return position.token0.amount + position.token1.amount;
  }, []);

  // Calculate total positions value
  const calculateTotalValue = useCallback(() => {
    return positions.reduce((total, position) => total + position.value, 0n);
  }, [positions]);

  // Calculate total earned fees
  const calculateTotalFees = useCallback(() => {
    return positions.reduce((total, position) => total + position.earnedFees, 0n);
  }, [positions]);

  // Remove liquidity (simplified - would need contract calls)
  const removeLiquidity = useCallback(async (position, amountPercent = 100) => {
    // TODO: Implement actual removal with contract calls
    console.log('Removing liquidity:', position, amountPercent);
    return { success: true, hash: '0x...' };
  }, []);

  // Auto-refresh positions
  useEffect(() => {
    if (isConnected) {
      fetchPositions();
      
      // Set up refresh interval
      const interval = setInterval(fetchPositions, 30000); // Refresh every 30 seconds
      return () => clearInterval(interval);
    }
  }, [isConnected, fetchPositions]);

  // Memoized calculations
  const positionStats = useMemo(() => {
    const totalPositions = positions.length;
    const activePositions = positions.filter(p => p.lpBalance > 0n).length;
    const averageShare = positions.length > 0 
      ? positions.reduce((sum, p) => sum + p.share, 0) / positions.length
      : 0;
    
    const largestPosition = positions.length > 0 
      ? positions.reduce((max, p) => p.value > max.value ? p : max, positions[0])
      : null;

    return {
      totalPositions,
      activePositions,
      averageShare,
      largestPosition,
      totalValue: safeFormatUnits(totalValue, 18),
      totalFees: safeFormatUnits(totalFees, 18)
    };
  }, [positions, totalValue, totalFees]);

  return {
    // State
    positions,
    loading,
    error,
    totalValue,
    totalFees,
    
    // Actions
    fetchPositions,
    getPosition,
    removeLiquidity,
    refreshPositions: fetchPositions,
    
    // Getters
    getPositionByPair: (pairAddress) => 
      positions.find(p => addressesEqual(p.pairAddress, pairAddress)),
    
    // Calculations
    calculatePositionValue,
    calculateTotalValue,
    calculateTotalFees,
    
    // Stats
    stats: positionStats,
    
    // Status
    hasPositions: positions.length > 0,
    isConnected,
    
    // Formatted values
    formattedTotalValue: safeFormatUnits(totalValue, 18),
    formattedTotalFees: safeFormatUnits(totalFees, 18)
  };
};