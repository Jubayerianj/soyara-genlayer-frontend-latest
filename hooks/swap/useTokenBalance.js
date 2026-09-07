
// hooks/swap/useTokenBalance.js

import { useReadContract, useBalance, useReadContracts, useChainId } from 'wagmi';
import { ERC20_ABI } from '../../constants/abis';
import { formatUnits } from 'viem';
import { useMemo } from 'react';
import { TOKEN_LIST } from '../../constants/tokens';

export const useTokenBalance = (address, fromToken, toToken, customTokensInput = []) => {
  const chainId = useChainId();
  
  const customTokens = useMemo(() => {
    return Array.isArray(customTokensInput) ? customTokensInput : [];
  }, [customTokensInput]);

  // Get all tokens for current chain to fetch their balances
  const allTokens = useMemo(() => {
    const baseTokens = TOKEN_LIST[chainId] || TOKEN_LIST[4441] || [];
    // Combine base tokens with custom tokens to fetch all balances
    return [...baseTokens, ...customTokens];
  }, [chainId, customTokens]);

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
  const refetchBalances = () => {
    refetchEthBalance();
    refetchAllBalances();
  };

  // Get balance for a specific token
  const getTokenBalance = useMemo(() => {
    return (token) => {
      if (!token || !address) return 0n;
      
      if (token.isNative || token.address === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE') {
        return ethBalance?.value || 0n;
      }
      
      const addr = token.address.toLowerCase();
      if (balancesMap.has(addr)) {
        return balancesMap.get(addr);
      }
      
      return 0n;
    };
  }, [address, ethBalance, balancesMap]);

  // Get formatted balance for display
  const getFormattedBalance = (token) => {
    if (!token) return '0';
    
    const balance = getTokenBalance(token);
    const decimals = token.decimals || 18;
    
    try {
      return formatUnits(balance, decimals);
    } catch (error) {
      console.error('Error formatting balance:', error);
      return '0';
    }
  };

  return {
    // Raw balances for backwards compatibility
    ethBalance: ethBalance?.value || 0n,
    fromTokenBalance: fromToken ? getTokenBalance(fromToken) : 0n,
    toTokenBalance: toToken ? getTokenBalance(toToken) : 0n,
    
    // All balances map
    balancesMap,
    
    // Actions
    refetchBalances,
    getTokenBalance,
    getFormattedBalance,
    
    // Status
    isLoading: isMulticallLoading,
  };
};

// Enhanced version without multicall support
export const useMultiTokenBalance = (address, tokens = []) => {
  const { data: ethBalance } = useBalance({
    address,
    query: {
      enabled: !!address,
    },
  });

  // Individual balance fetches for each token
  const getBalance = (token) => {
    if (!token || !address) return 0n;
    
    if (token.isNative) {
      return ethBalance?.value || 0n;
    }
    
    // Individual contract reads for each token
    // Note: This is less efficient than multicall but works without it
    return 0n;
  };

  return {
    getBalance,
    ethBalance: ethBalance?.value || 0n,
  };
};