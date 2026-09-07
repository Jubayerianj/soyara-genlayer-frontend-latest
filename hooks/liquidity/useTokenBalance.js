// hooks/liquidity/useTokenBalance.js


import { useReadContract, useBalance, useReadContracts, useChainId, useAccount } from 'wagmi';
import { ERC20_ABI } from '../../constants/abis';
import { formatUnits } from 'viem';
import { useMemo, useCallback } from 'react';
import { TOKEN_LIST } from '../../constants/tokens';

export const useTokenBalance = (address, tokenA, tokenB) => {
  const chainId = useChainId();
  
  // Get all tokens for current chain to fetch their balances
  const allTokens = useMemo(() => {
    return TOKEN_LIST[chainId] || TOKEN_LIST[4441] || [];
  }, [chainId]);

  // Fetch ETH balance
  const { data: ethBalance, refetch: refetchEthBalance } = useBalance({
    address,
    query: {
      enabled: !!address,
    },
  });

  // Fetch all ERC20 balances in one multicall
  const erc20Tokens = useMemo(() => {
    return allTokens.filter(t => !t.isNative && t.address);
  }, [allTokens]);

  const { data: multicallData, refetch: refetchAllBalances, isLoading: isMulticallLoading } = useReadContracts({
    contracts: erc20Tokens.map(token => ({
      address: token.address,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [address],
    })),
    query: {
      enabled: !!address && erc20Tokens.length > 0,
    },
  });

  // Map balances to token addresses for easy lookup
  const balancesMap = useMemo(() => {
    const map = new Map();
    if (multicallData) {
      erc20Tokens.forEach((token, index) => {
        const result = multicallData[index];
        if (result?.status === 'success' && result.result !== undefined) {
          map.set(token.address.toLowerCase(), result.result);
        }
      });
    }
    return map;
  }, [multicallData, erc20Tokens]);

  // Combined refetch function
  const refetchBalances = useCallback(() => {
    refetchEthBalance();
    refetchAllBalances();
  }, [refetchEthBalance, refetchAllBalances]);

  // Get balance for a specific token
  const getTokenBalance = useCallback((token) => {
    if (!token || !address) return 0n;
    
    if (token.isNative || token.symbol === 'ETH' || token.address === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE') {
      return ethBalance?.value || 0n;
    }
    
    const addr = token.address.toLowerCase();
    if (balancesMap.has(addr)) {
      return balancesMap.get(addr);
    }
    
    return 0n;
  }, [address, ethBalance, balancesMap]);

  // Get formatted balance for display
  const getFormattedBalance = useCallback((token) => {
    if (!token) return '0';
    
    const balance = getTokenBalance(token);
    const decimals = token.decimals || 18;
    
    try {
      return formatUnits(balance, decimals);
    } catch (error) {
      console.error('Error formatting balance:', error);
      return '0';
    }
  }, [getTokenBalance]);

  // Get raw balance for calculations
  const getRawBalance = useCallback((token) => {
    return getTokenBalance(token);
  }, [getTokenBalance]);

  return {
    // Raw balances
    ethBalance: ethBalance?.value || 0n,
    tokenABalance: tokenA ? getTokenBalance(tokenA) : 0n,
    tokenBBalance: tokenB ? getTokenBalance(tokenB) : 0n,
    
    // Actions
    refetchBalances,
    getTokenBalance,
    getFormattedBalance,
    getRawBalance,
    
    // Status
    isLoading: isMulticallLoading,
  };
};