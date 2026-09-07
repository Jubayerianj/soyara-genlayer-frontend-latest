// components/portfolio/RefreshButton.jsx
import React from 'react';
import { RefreshCw } from 'lucide-react';
import { usePortfolioContext } from './PortfolioProvider';

const RefreshButton = () => {
  const { isLoading, manualRefresh } = usePortfolioContext();

  return (
    <button
      onClick={manualRefresh}
      disabled={isLoading}
      className="refresh-button"
    >
      <RefreshCw className={`refresh-icon ${isLoading ? 'spinning' : ''}`} />
      {isLoading ? 'Refreshing...' : 'Refresh'}
    </button>
  );
};