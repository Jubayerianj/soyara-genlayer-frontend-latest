import React, { createContext, useContext, useMemo } from 'react';
import { useWeb3 } from '../hooks/useWeb3';
import { useSwap } from '../hooks/useSwap';
import { useLiquidity } from '../hooks/useLiquidity';
import { usePool } from '../hooks/usePool';
import { useTokens } from '../hooks/useTokens';

const Web3Context = createContext();

export const useDex = () => useContext(Web3Context);

export const Web3Provider = ({ children }) => {
  const web3 = useWeb3();
  const swap = useSwap();
  const liquidity = useLiquidity();
  const pool = usePool();
  const tokens = useTokens();

  const value = useMemo(() => ({
    // Core Web3
    ...web3,
    
    // Features
    swap,
    liquidity,
    pool,
    tokens,
    
    // Combined status
    isInitialized: web3.isConnected && tokens.tokens.length > 0,
    isLoading: web3.isConnecting || swap.isLoading || liquidity.isLoading || pool.loading || tokens.loading,
    
    // Combined actions
    refreshAll: async () => {
      await tokens.refreshBalances();
      await pool.fetchUserPools();
      swap.refreshQuote?.();
      liquidity.refetchPair?.();
    },
    
    // Combined errors
    hasError: web3.error || swap.error || liquidity.error || pool.error || tokens.error,
    clearAllErrors: () => {
      web3.setError('');
      swap.setError?.('');
      liquidity.setError?.('');
      tokens.setError?.('');
    },
  }), [web3, swap, liquidity, pool, tokens]);

  return (
    <Web3Context.Provider value={value}>
      {children}
    </Web3Context.Provider>
  );
};

// Custom hooks for specific contexts
export const useSwapContext = () => {
  const context = useContext(Web3Context);
  if (!context) {
    throw new Error('useSwapContext must be used within Web3Provider');
  }
  return context.swap;
};

export const useLiquidityContext = () => {
  const context = useContext(Web3Context);
  if (!context) {
    throw new Error('useLiquidityContext must be used within Web3Provider');
  }
  return context.liquidity;
};

export const usePoolContext = () => {
  const context = useContext(Web3Context);
  if (!context) {
    throw new Error('usePoolContext must be used within Web3Provider');
  }
  return context.pool;
};

export const useTokensContext = () => {
  const context = useContext(Web3Context);
  if (!context) {
    throw new Error('useTokensContext must be used within Web3Provider');
  }
  return context.tokens;
};