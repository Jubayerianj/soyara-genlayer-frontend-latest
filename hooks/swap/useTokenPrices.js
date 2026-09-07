// hooks/swap/useTokenPrices.js
import { useState, useEffect, useCallback } from 'react';
import { fetchDiaPrices, hasDiaSupport } from '../../utils/diaOracle';
import { DIA_ORACLE_CONFIG } from '../../constants/oracleConfig';

export const useTokenPrices = (tokenSymbols = [], chainId = 4441) => {
  const [prices, setPrices] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchPrices = useCallback(async (forceRefresh = false) => {
    // Filter symbols that have DIA support
    const supportedSymbols = tokenSymbols.filter(symbol => hasDiaSupport(symbol));
    
    if (supportedSymbols.length === 0) {
      setPrices({});
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const priceData = await fetchDiaPrices(supportedSymbols, chainId);
      
      setPrices(priceData);
      setLastUpdated(Date.now());
    } catch (err) {
      console.error('Error in useTokenPrices:', err);
      setError(err.message || 'Failed to fetch prices');
      setPrices({});
    } finally {
      setLoading(false);
    }
  }, [tokenSymbols, chainId]);

  useEffect(() => {
    if (tokenSymbols.length > 0) {
      fetchPrices();
    }
  }, [tokenSymbols, fetchPrices]);

  // Get price for specific token
  const getPrice = useCallback((symbol) => {
    const diaSymbol = symbol in DIA_ORACLE_CONFIG.TOKEN_SYMBOL_MAP 
      ? DIA_ORACLE_CONFIG.TOKEN_SYMBOL_MAP[symbol]
      : symbol;
    
    return prices[diaSymbol]?.price || null;
  }, [prices]);

  // Calculate exchange rate between two tokens
  const getExchangeRate = useCallback((fromSymbol, toSymbol) => {
    const fromPrice = getPrice(fromSymbol);
    const toPrice = getPrice(toSymbol);
    
    if (!fromPrice || !toPrice || toPrice === 0) return null;
    
    return fromPrice / toPrice;
  }, [getPrice]);

  // Calculate USD value
  const getUSDValue = useCallback((symbol, amount) => {
    const price = getPrice(symbol);
    if (!price || !amount) return null;
    
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum)) return null;
    
    return amountNum * price;
  }, [getPrice]);

  return {
    prices,
    loading,
    error,
    lastUpdated,
    refresh: () => fetchPrices(true),
    getPrice,
    getExchangeRate,
    getUSDValue,
    hasSupport: (symbol) => hasDiaSupport(symbol)
  };
};