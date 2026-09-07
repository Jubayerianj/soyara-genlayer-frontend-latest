// components/portfolio/PortfolioProvider.jsx
import React, { createContext, useContext, useCallback } from 'react';
import { usePortfolio } from '../../hooks/portfolio/usePortfolio';

const PortfolioContext = createContext(null);

export const usePortfolioContext = () => {
  const context = useContext(PortfolioContext);
  if (!context) {
    throw new Error('usePortfolioContext must be used within PortfolioProvider');
  }
  return context;
};

export const PortfolioProvider = ({ children, address }) => {
  const portfolio = usePortfolio(address);

  // Manual refresh function
  const manualRefresh = useCallback(() => {
    console.log('Manual refresh triggered');
    portfolio.refreshPortfolio();
  }, [portfolio.refreshPortfolio]);

  return (
    <PortfolioContext.Provider value={{ ...portfolio, manualRefresh }}>
      {children}
    </PortfolioContext.Provider>
  );
};