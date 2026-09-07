// hooks/liquidity/usePool.js
import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { useAccount, useContractRead } from 'wagmi';
import { ADDRESSES } from '../../constants/addresses';
import { FACTORY_ABI, PAIR_ABI, ERC20_ABI } from '../../constants/abis';
import { formatUnits } from '../../components/utils/format';

export const usePool = () => {
  const { address, isConnected } = useAccount();
  const [userPools, setUserPools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Get all pairs count
  const { data: allPairsLength } = useContractRead({
    address: ADDRESSES.factory,
    abi: FACTORY_ABI,
    functionName: 'allPairsLength',
    enabled: true,
  });

  const fetchUserPools = useCallback(async () => {
    if (!isConnected || !address || !allPairsLength) {
      setUserPools([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const pairs = [];
      const pairCount = allPairsLength.toNumber();
      
      // Limit to first 20 pairs for performance
      const limit = Math.min(pairCount, 20);
      
      for (let i = 0; i < limit; i++) {
        try {
          const pairAddress = await fetchPairAddress(i);
          if (pairAddress === ethers.constants.AddressZero) continue;

          const pairInfo = await fetchPairInfo(pairAddress);
          if (pairInfo.userLiquidity.gt(0)) {
            pairs.push({
              ...pairInfo,
              index: i,
              address: pairAddress,
            });
          }
        } catch (err) {
          console.error(`Error fetching pair ${i}:`, err);
        }
      }

      setUserPools(pairs);
    } catch (err) {
      console.error('Error fetching user pools:', err);
      setError('Failed to load pools');
    } finally {
      setLoading(false);
    }
  }, [isConnected, address, allPairsLength]);

  const fetchPairAddress = async (index) => {
    const provider = new ethers.providers.JsonRpcProvider('https://liteforge.rpc.caldera.xyz/infra-partner-http');
    const factory = new ethers.Contract(ADDRESSES.factory, FACTORY_ABI, provider);
    return await factory.allPairs(index);
  };

  const fetchPairInfo = async (pairAddress) => {
    const provider = new ethers.providers.JsonRpcProvider('https://liteforge.rpc.caldera.xyz/infra-partner-http');
    const pair = new ethers.Contract(pairAddress, PAIR_ABI, provider);
    
    const [token0, token1, reserves, totalSupply, userBalance] = await Promise.all([
      pair.token0(),
      pair.token1(),
      pair.getReserves(),
      pair.totalSupply(),
      address ? pair.balanceOf(address) : ethers.constants.Zero,
    ]);

    // Fetch token info
    const token0Contract = new ethers.Contract(token0, ERC20_ABI, provider);
    const token1Contract = new ethers.Contract(token1, ERC20_ABI, provider);
    
    const [token0Symbol, token0Decimals, token1Symbol, token1Decimals] = await Promise.all([
      token0Contract.symbol().catch(() => 'UNKNOWN'),
      token0Contract.decimals().catch(() => 18),
      token1Contract.symbol().catch(() => 'UNKNOWN'),
      token1Contract.decimals().catch(() => 18),
    ]);

    const userShare = totalSupply.gt(0) 
      ? userBalance.mul(10000).div(totalSupply).toNumber() / 100
      : 0;
    
    const userToken0 = totalSupply.gt(0)
      ? reserves[0].mul(userBalance).div(totalSupply)
      : ethers.constants.Zero;
    
    const userToken1 = totalSupply.gt(0)
      ? reserves[1].mul(userBalance).div(totalSupply)
      : ethers.constants.Zero;

    return {
      token0: {
        address: token0,
        symbol: token0Symbol,
        decimals: token0Decimals,
      },
      token1: {
        address: token1,
        symbol: token1Symbol,
        decimals: token1Decimals,
      },
      reserves: {
        token0: reserves[0],
        token1: reserves[1],
      },
      totalSupply,
      userLiquidity: userBalance,
      userShare,
      userTokens: {
        token0: userToken0,
        token1: userToken1,
      },
      liquidityUSD: 0, // Would calculate with prices
    };
  };

  const removeLiquidity = async (pool, amount) => {
    // This would be implemented with contract calls
    // For now, return a promise that simulates the action
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          success: true,
          hash: '0x' + Math.random().toString(16).substring(2, 42),
        });
      }, 2000);
    });
  };

  const getPoolStats = () => {
    const totalPools = userPools.length;
    const totalLiquidity = userPools.reduce((sum, pool) => sum + pool.liquidityUSD, 0);
    const totalFees = userPools.reduce((sum, pool) => sum + (pool.liquidityUSD * 0.003), 0); // 0.3% estimated fees

    return {
      totalPools,
      totalLiquidity,
      totalFees,
      averageAPR: totalLiquidity > 0 ? (totalFees * 365 * 100) / totalLiquidity : 0,
    };
  };

  useEffect(() => {
    fetchUserPools();
  }, [fetchUserPools]);

  return {
    // State
    userPools,
    loading,
    error,
    
    // Actions
    fetchUserPools,
    removeLiquidity,
    
    // Calculated values
    poolStats: getPoolStats(),
    
    // Status
    hasPools: userPools.length > 0,
  };
};