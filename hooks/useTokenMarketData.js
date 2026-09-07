// hooks/useTokenMarketData.js
import { useState, useEffect, useMemo, useCallback } from 'react';
import { FallbackPriceAPI } from '../services/fallbackPriceApi';
import { goldskyService } from '../services/goldskyService';

const fallbackApi = new FallbackPriceAPI();

export function useTokenMarketData(tokens = []) {
  const [marketData, setMarketData] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const tokenSymbols = useMemo(() => tokens.map(t => t.symbol), [tokens]);
  const tokenAddresses = useMemo(() => tokens.map(t => t.address), [tokens]);

  const fetchData = useCallback(async () => {
    if (tokens.length === 0) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // 1. Fetch Global Data from CoinGecko
      const globalData = await fallbackApi.getMultipleMarketData(tokenSymbols);
      
      // 2. Fetch Subgraph Data from Goldsky
      const subgraphData = await goldskyService.fetchMultipleTokenStats(tokenAddresses);

      const combinedData = {};

      tokens.forEach(token => {
        const symbol = token.symbol;
        const address = token.address.toLowerCase();
        
        const global = globalData[symbol] || {};
        const local = subgraphData[address] || {};

        combinedData[address] = {
          price: global.price || 0,
          change24h: global.change24h || 0,
          volume24h: global.volume24h || local.volume24h || 0,
          tvl: global.tvl || local.tvl || 0,
          marketCap: global.marketCap || local.marketCap || 0
        };
      });

      setMarketData(combinedData);
      setError(null);
    } catch (err) {
      console.error('Error fetching market data:', err);
      setError('Failed to fetch market data');
    } finally {
      setLoading(false);
    }
  }, [tokens, tokenSymbols, tokenAddresses]);

  useEffect(() => {
    fetchData();
    
    // Refresh every 5 minutes
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return { marketData, loading, error, refetch: fetchData };
}
