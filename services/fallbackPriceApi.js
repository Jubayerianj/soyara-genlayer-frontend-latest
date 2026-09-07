// services/fallbackPriceApi.js
import axios from 'axios';

export class FallbackPriceAPI {
  constructor() {
    this.coingeckoClient = axios.create({
      baseURL: 'https://api.coingecko.com/api/v3',
      timeout: 10000
    });
    
    // Mapping from your tokens to Coingecko IDs
    this.tokenToCoingeckoId = {
      'ETH': 'ethereum',
      'WETH': 'ethereum',
      'zkLTC': 'litecoin',
      'wzkLTC': 'litecoin',
      'USDT': 'tether',
      'ZKUSDT': 'tether',
      'USDC': 'usd-coin',
      'ZKUSDC': 'usd-coin',
      'USDC.E': 'usd-coin',
      'WBTC': 'wrapped-bitcoin',
      'BTC': 'bitcoin',
      'ZKBTC': 'bitcoin',
      'NIA': 'nia',
      'LETH': 'ethereum',
      'LXRP': 'ripple',
      'brBNB': 'binancecoin'
    };
  }
  
  async get24hChange(symbol) {
    try {
      const coingeckoId = this.tokenToCoingeckoId[symbol];
      if (!coingeckoId) return 0;
      
      const response = await this.coingeckoClient.get('/simple/price', {
        params: {
          ids: coingeckoId,
          vs_currencies: 'usd',
          include_24hr_change: true
        }
      });
      
      return response.data[coingeckoId]?.usd_24h_change || 0;
    } catch (error) {
      console.warn(`Failed to fetch 24h change for ${symbol}:`, error.message);
      return 0;
    }
  }

  async getMarketData(symbol) {
    try {
      const coingeckoId = this.tokenToCoingeckoId[symbol];
      if (!coingeckoId) return null;

      const response = await this.coingeckoClient.get('/coins/markets', {
        params: {
          vs_currency: 'usd',
          ids: coingeckoId,
          order: 'market_cap_desc',
          per_page: 1,
          page: 1,
          sparkline: false,
          price_change_percentage: '24h'
        }
      });

      if (response.data && response.data.length > 0) {
        const data = response.data[0];
        return {
          price: data.current_price,
          change24h: data.price_change_percentage_24h,
          volume24h: data.total_volume,
          marketCap: data.market_cap,
          tvl: data.total_value_locked || 0
        };
      }
      return null;
    } catch (error) {
      console.warn(`Failed to fetch market data for ${symbol}:`, error.message);
      return null;
    }
  }

  async getMultipleMarketData(symbols) {
    const ids = symbols
      .map(s => this.tokenToCoingeckoId[s])
      .filter(Boolean);
    
    if (ids.length === 0) return {};

    try {
      const response = await this.coingeckoClient.get('/coins/markets', {
        params: {
          vs_currency: 'usd',
          ids: [...new Set(ids)].join(','),
          order: 'market_cap_desc',
          per_page: 250,
          page: 1,
          sparkline: false
        }
      });

      const marketDataMap = {};
      response.data.forEach(data => {
        marketDataMap[data.id] = {
          price: data.current_price,
          change24h: data.price_change_percentage_24h,
          volume24h: data.total_volume,
          marketCap: data.market_cap,
          tvl: data.total_value_locked || 0
        };
      });

      const results = {};
      symbols.forEach(symbol => {
        const id = this.tokenToCoingeckoId[symbol];
        if (id && marketDataMap[id]) {
          results[symbol] = marketDataMap[id];
        }
      });
      return results;
    } catch (error) {
      console.warn(`Failed to fetch multiple market data:`, error.message);
      return {};
    }
  }
  
  async getMultiple24hChanges(symbols) {
    const data = await this.getMultipleMarketData(symbols);
    const changes = {};
    symbols.forEach(s => {
      changes[s] = data[s]?.change24h || 0;
    });
    return changes;
  }
}