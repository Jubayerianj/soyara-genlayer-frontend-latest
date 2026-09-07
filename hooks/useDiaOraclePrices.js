// hooks/useDiaOraclePrices.js
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { LitVMDiaOracle } from '../services/LitVMDiaOracle';
import { DIA_ORACLE_CONFIG } from '../constants/oracleConfig';

// Cache to store prices globally across components
const priceCache = {
  data: {},
  lastUpdated: null,
  isFetching: false
};

export function useDiaOraclePrices(tokenSymbols = [], options = {}) {
  const { skip = false, debounceMs = 300 } = options;
  
  const [localPrices, setLocalPrices] = useState({});
  const [loading, setLoading] = useState(!skip);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  
  const oracleRef = useRef(null);
  const timeoutRef = useRef(null);
  const mountedRef = useRef(true);

  // Memoize token symbols to prevent unnecessary re-fetches
  const memoizedSymbols = useMemo(() => {
    return Array.isArray(tokenSymbols) 
      ? [...new Set(tokenSymbols)] // Remove duplicates
      : [];
  }, [JSON.stringify(tokenSymbols)]); // Stringify for deep comparison

  // Initialize oracle lazily
  const getOracle = useCallback(() => {
    if (!oracleRef.current) {
      oracleRef.current = new LitVMDiaOracle();
    }
    return oracleRef.current;
  }, []);

  // Check if we need to fetch prices for these symbols
  const needsFetch = useCallback((symbols) => {
    if (symbols.length === 0) return false;
    
    // Check cache for missing or stale data
    const now = Date.now();
    const cacheAge = priceCache.lastUpdated ? now - priceCache.lastUpdated : Infinity;
    const isCacheStale = cacheAge > DIA_ORACLE_CONFIG.UPDATE_INTERVAL;
    
    // Check if any symbol is missing from cache or data is stale
    const missingSymbols = symbols.filter(symbol => 
      !priceCache.data[symbol] || isCacheStale
    );
    
    return missingSymbols.length > 0 || isCacheStale;
  }, []);

  // Fetch prices with debouncing
  const fetchPrices = useCallback(async (symbols) => {
    if (!mountedRef.current || symbols.length === 0) return;
    
    // Check if we're already fetching
    if (priceCache.isFetching) {
      console.log('⏳ Price fetch already in progress, skipping...');
      return;
    }
    
    priceCache.isFetching = true;
    setLoading(true);
    
    try {
      const oracle = getOracle();
      const priceData = await oracle.getPricesForSymbols(symbols);
      
      // Update cache
      priceCache.data = { ...priceCache.data, ...priceData };
      priceCache.lastUpdated = Date.now();
      
      if (mountedRef.current) {
        // Only update local state for requested symbols
        const filteredData = {};
        symbols.forEach(symbol => {
          filteredData[symbol] = priceCache.data[symbol] || 
            oracle.getZeroPriceResponse(symbol);
        });
        
        setLocalPrices(filteredData);
        setLastUpdated(new Date().toISOString());
        setError(null);
      }
      
    } catch (err) {
      console.error('Failed to fetch oracle prices:', err);
      
      if (mountedRef.current) {
        setError('Failed to fetch prices from DIA Oracle');
        // Use cache data even if fetch failed
        const cachedData = {};
        symbols.forEach(symbol => {
          cachedData[symbol] = priceCache.data[symbol] || {
            priceUSD: 0,
            exists: false,
            symbol
          };
        });
        setLocalPrices(cachedData);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
      priceCache.isFetching = false;
    }
  }, [getOracle]);

  // Debounced fetch
  const debouncedFetch = useCallback((symbols) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    timeoutRef.current = setTimeout(() => {
      if (mountedRef.current) {
        fetchPrices(symbols);
      }
    }, debounceMs);
  }, [fetchPrices, debounceMs]);

  // Initial fetch and setup
  useEffect(() => {
    mountedRef.current = true;
    
    if (skip || memoizedSymbols.length === 0) {
      setLoading(false);
      return;
    }
    
    // Check cache first
    const cachedData = {};
    let allCached = true;
    
    memoizedSymbols.forEach(symbol => {
      if (priceCache.data[symbol]) {
        cachedData[symbol] = priceCache.data[symbol];
      } else {
        allCached = false;
      }
    });
    
    if (allCached && priceCache.lastUpdated) {
      const cacheAge = Date.now() - priceCache.lastUpdated;
      if (cacheAge < DIA_ORACLE_CONFIG.UPDATE_INTERVAL) {
        setLocalPrices(cachedData);
        setLoading(false);
        setLastUpdated(new Date(priceCache.lastUpdated).toISOString());
        return;
      }
    }
    
    // Fetch if needed
    if (needsFetch(memoizedSymbols)) {
      debouncedFetch(memoizedSymbols);
    } else {
      setLocalPrices(cachedData);
      setLoading(false);
    }
    
    return () => {
      mountedRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [memoizedSymbols, skip, needsFetch, debouncedFetch]);

  // Get price for specific symbol (no re-render trigger)
  const getTokenPrice = useCallback((symbol) => {
    if (!symbol) return { priceUSD: 0, exists: false, symbol: '' };
    
    // Check local state first, then cache
    if (localPrices[symbol]) {
      return localPrices[symbol];
    }
    
    if (priceCache.data[symbol]) {
      return priceCache.data[symbol];
    }
    
    return { priceUSD: 0, exists: false, symbol };
  }, [localPrices]);

  // Get price for token object
  const getTokenPriceData = useCallback((token) => {
    if (!token) return { priceUSD: 0, exists: false };
    
    const symbol = token.symbol || token;
    return getTokenPrice(symbol);
  }, [getTokenPrice]);

  // Manual refresh
  const refreshPrices = useCallback(() => {
    if (memoizedSymbols.length > 0) {
      return fetchPrices(memoizedSymbols);
    }
    return Promise.resolve();
  }, [memoizedSymbols, fetchPrices]);

  return {
    prices: localPrices,
    loading,
    error,
    lastUpdated,
    getTokenPrice,
    getTokenPriceData,
    refreshPrices,
    // Expose cache info for debugging
    _cache: {
      size: Object.keys(priceCache.data).length,
      lastUpdated: priceCache.lastUpdated,
      isFetching: priceCache.isFetching
    }
  };
}

// Export a singleton for global use
export const diaOracleService = {
  getPrice: (symbol) => {
    return priceCache.data[symbol] || { priceUSD: 0, exists: false, symbol };
  },
  getAllPrices: () => ({ ...priceCache.data }),
  refresh: async (symbols) => {
    if (!symbols || symbols.length === 0) return;
    
    try {
      const oracle = new LitVMDiaOracle();
      const newData = await oracle.getPricesForSymbols(symbols);
      priceCache.data = { ...priceCache.data, ...newData };
      priceCache.lastUpdated = Date.now();
      return newData;
    } catch (error) {
      console.error('Global price refresh failed:', error);
      return null;
    }
  }
};