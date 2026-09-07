// hooks/swap/useDiaPrice.js
import { useState, useEffect, useCallback } from 'react';
import { fetchDiaPrice, getCachedDiaPrice, hasDiaSupport } from '../../utils/diaOracle';

export const useDiaPrice = (tokenSymbol, chainId = 4441, autoFetch = true) => {
  const [price, setPrice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchPrice = useCallback(async (forceRefresh = false) => {
    if (!tokenSymbol || !hasDiaSupport(tokenSymbol)) {
      setError(`No DIA Oracle support for ${tokenSymbol}`);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let priceData;
      if (forceRefresh) {
        priceData = await fetchDiaPrice(tokenSymbol, chainId);
      } else {
        priceData = await getCachedDiaPrice(tokenSymbol, chainId);
      }

      setPrice(priceData.price);
      setLastUpdated(priceData.timestamp);
    } catch (err) {
      console.error('Error in useDiaPrice:', err);
      setError(err.message || 'Failed to fetch price');
      setPrice(null);
    } finally {
      setLoading(false);
    }
  }, [tokenSymbol, chainId]);

  useEffect(() => {
    if (autoFetch && tokenSymbol && hasDiaSupport(tokenSymbol)) {
      fetchPrice();
    }
  }, [tokenSymbol, autoFetch, fetchPrice]);

  return {
    price,
    loading,
    error,
    lastUpdated,
    refresh: () => fetchPrice(true),
    hasSupport: hasDiaSupport(tokenSymbol),
    symbol: tokenSymbol
  };
};