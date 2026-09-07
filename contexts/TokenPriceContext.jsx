// contexts/TokenPriceContext.jsx
import React, { createContext, useContext, useMemo } from 'react';
import { useDiaOraclePrices } from '../hooks/useDiaOraclePrices';

const TokenPriceContext = createContext();

export function TokenPriceProvider({ children, tokenSymbols }) {
  const priceData = useDiaOraclePrices(tokenSymbols);

  const value = useMemo(() => ({
    ...priceData,
    // Helper to calculate token value
    calculateTokenValue: (token) => {
      if (!token) return 0;
      const priceInfo = priceData.getTokenPriceData(token);
      const balance = token.balance || 0;
      return balance * priceInfo.priceUSD;
    }
  }), [priceData]);

  return (
    <TokenPriceContext.Provider value={value}>
      {children}
    </TokenPriceContext.Provider>
  );
}

export function useTokenPrices() {
  const context = useContext(TokenPriceContext);
  if (!context) {
    throw new Error('useTokenPrices must be used within TokenPriceProvider');
  }
  return context;
}