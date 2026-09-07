// services/LitVMDiaOracle.js
import { ethers } from 'ethers';
import { DIA_ORACLE_CONFIG } from '../constants/oracleConfig';

// Standard DIA Oracle ABI
const DIA_ORACLE_ABI = [
  'function getValue(string memory key) external view returns (uint128 price, uint128 timestamp)',
  'function assetUpdate(string memory key) external view returns (uint128 price, uint128 supply)'
];

// AggregatorV3Interface for DIA Adapters
const AGGREGATOR_V3_ABI = [
  'function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
  'function decimals() external view returns (uint8)'
];

export class LitVMDiaOracle {
  constructor() {
    try {
      this.provider = new ethers.JsonRpcProvider(DIA_ORACLE_CONFIG.RPC_URL);
      
      // General Oracle Contract
      if (DIA_ORACLE_CONFIG.ADDRESS && DIA_ORACLE_CONFIG.ADDRESS !== '0x...') {
        this.contract = new ethers.Contract(
          DIA_ORACLE_CONFIG.ADDRESS,
          DIA_ORACLE_ABI,
          this.provider
        );
        this.mode = 'live';
        console.log('✅ DIA General Oracle initialized');
      } else {
        this.mode = 'adapters-only';
        console.log('ℹ️ DIA Oracle in ADAPTERS-ONLY mode');
      }
    } catch (error) {
      console.warn('⚠️ Failed to initialize DIA Oracle:', error.message);
      this.mode = 'fallback';
    }
    
    this.cache = new Map();
    this.pendingRequests = new Map();
    this.adapterContracts = new Map();
  }

  // Get adapter contract for a symbol
  getAdapterContract(symbol) {
    const adapterAddress = DIA_ORACLE_CONFIG.ADAPTERS[symbol];
    if (!adapterAddress) return null;

    if (this.adapterContracts.has(adapterAddress)) {
      return this.adapterContracts.get(adapterAddress);
    }

    const contract = new ethers.Contract(
      adapterAddress,
      AGGREGATOR_V3_ABI,
      this.provider
    );
    this.adapterContracts.set(adapterAddress, contract);
    return contract;
  }

  // Get price with caching
  async getPriceBySymbol(symbol) {
    const cacheKey = symbol;
    const now = Date.now();
    
    // Check cache
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (now - cached.timestamp < 30000) { // 30 second cache
        return cached.data;
      }
    }
    
    // Check if request is already pending
    if (this.pendingRequests.has(cacheKey)) {
      return this.pendingRequests.get(cacheKey);
    }
    
    // Create new request
    const requestPromise = this.fetchPrice(symbol)
      .then(result => {
        this.cache.set(cacheKey, { data: result, timestamp: now });
        this.pendingRequests.delete(cacheKey);
        return result;
      })
      .catch(error => {
        this.pendingRequests.delete(cacheKey);
        console.error(`Failed to fetch price for ${symbol}:`, error.message);
        return this.getZeroPriceResponse(symbol);
      });
    
    this.pendingRequests.set(cacheKey, requestPromise);
    return requestPromise;
  }

  // Actual price fetch
  async fetchPrice(symbol) {
    if (this.mode === 'fallback') {
      return this.getZeroPriceResponse(symbol);
    }

    // 1. Try Adapter first
    const adapter = this.getAdapterContract(symbol);
    if (adapter) {
      try {
        const [, answer, , updatedAt] = await adapter.latestRoundData();
        
        // Use 18 decimals for adapters as per docs, but try to fetch if possible
        let decimals = 18;
        try {
          decimals = await adapter.decimals();
        } catch (e) {
          // Fallback to 18
        }

        const price = Number(ethers.formatUnits(answer, decimals));
        
        return {
          priceUSD: price,
          timestamp: Number(updatedAt),
          lastUpdated: new Date(Number(updatedAt) * 1000).toISOString(),
          exists: price > 0,
          symbol: symbol,
          source: 'DIA Adapter'
        };
      } catch (error) {
        console.warn(`Adapter fetch failed for ${symbol}, trying general oracle...`, error.message);
      }
    }

    // 2. Fallback to General Oracle
    if (this.mode === 'live' || this.mode === 'adapters-only') {
      const diaKey = DIA_ORACLE_CONFIG.TOKEN_SYMBOL_MAP[symbol];
      
      if (!diaKey || !this.contract) {
        return this.getZeroPriceResponse(symbol);
      }
      
      try {
        let priceRaw, timestamp;
        
        // Try getValue method
        try {
          [priceRaw, timestamp] = await this.contract.getValue(diaKey);
        } catch (error) {
          // Fallback to assetUpdate
          [priceRaw, timestamp] = await this.contract.assetUpdate(diaKey);
        }
        
        // Use 8 decimals for general DIA oracle
        const price = Number(ethers.formatUnits(priceRaw, 8));
        
        return {
          priceUSD: price,
          timestamp: Number(timestamp),
          lastUpdated: new Date(Number(timestamp) * 1000).toISOString(),
          exists: price > 0,
          symbol: symbol,
          diaKey: diaKey,
          source: 'DIA General Oracle'
        };
      } catch (error) {
        console.error(`Failed to fetch DIA price for ${symbol}:`, error.message);
      }
    }
    
    return this.getZeroPriceResponse(symbol);
  }

  // Get multiple prices with batching
  async getPricesForSymbols(symbols) {
    if (!symbols || symbols.length === 0) return {};
    
    const results = {};
    const uniqueSymbols = [...new Set(symbols)];
    
    // Fetch in parallel but with concurrency limit
    const batchSize = 10;
    for (let i = 0; i < uniqueSymbols.length; i += batchSize) {
      const batch = uniqueSymbols.slice(i, i + batchSize);
      const batchPromises = batch.map(symbol => 
        this.getPriceBySymbol(symbol).then(price => ({ symbol, price }))
      );
      
      const batchResults = await Promise.all(batchPromises);
      batchResults.forEach(({ symbol, price }) => {
        results[symbol] = price;
      });
    }
    
    return results;
  }

  // Helper to get zero price response
  getZeroPriceResponse(symbol) {
    return {
      priceUSD: 0,
      timestamp: 0,
      lastUpdated: null,
      exists: false,
      symbol: symbol,
      source: 'No Data'
    };
  }

  // Clear cache
  clearCache() {
    this.cache.clear();
    this.pendingRequests.clear();
  }
}