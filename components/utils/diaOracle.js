// components/utils/diaOracle.js
import { createPublicClient, http } from 'viem';
import { DIA_ORACLE_CONFIG } from '../../constants/oracleConfig';


// Minimal DIA Oracle ABI
export const DIA_ORACLE_ABI = [
  {
    "inputs": [{"internalType": "string", "name": "key", "type": "string"}],
    "name": "getValue",
    "outputs": [
      {"internalType": "uint128", "name": "", "type": "uint128"},
      {"internalType": "uint128", "name": "", "type": "uint128"}
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

// AggregatorV3Interface for DIA Adapters
export const AGGREGATOR_V3_ABI = [
  {
    "inputs": [],
    "name": "latestRoundData",
    "outputs": [
      {"internalType": "uint80", "name": "roundId", "type": "uint80"},
      {"internalType": "int256", "name": "answer", "type": "int256"},
      {"internalType": "uint256", "name": "startedAt", "type": "uint256"},
      {"internalType": "uint256", "name": "updatedAt", "type": "uint256"},
      {"internalType": "uint80", "name": "answeredInRound", "type": "uint80"}
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "decimals",
    "outputs": [{"internalType": "uint8", "name": "", "type": "uint8"}],
    "stateMutability": "view",
    "type": "function"
  }
];

// Create public client for DIA Oracle
export const createDiaClient = (rpcUrl = DIA_ORACLE_CONFIG.RPC_URL) => {
  return createPublicClient({
    transport: http(rpcUrl),
  });
};

// Fetch price from DIA Oracle
export const fetchDiaPrice = async (symbol, chainId = 4441) => {
  try {
    const client = createDiaClient();

    // 1. Try Adapter first
    const adapterAddress = DIA_ORACLE_CONFIG.ADAPTERS[symbol];
    if (adapterAddress) {
      try {
        const [,, , updatedAt, ] = await client.readContract({
          address: adapterAddress,
          abi: AGGREGATOR_V3_ABI,
          functionName: 'latestRoundData',
        });
        
        const answer = await client.readContract({
          address: adapterAddress,
          abi: AGGREGATOR_V3_ABI,
          functionName: 'latestRoundData',
        }).then(res => res[1]);

        let decimals = 18;
        try {
          decimals = await client.readContract({
            address: adapterAddress,
            abi: AGGREGATOR_V3_ABI,
            functionName: 'decimals',
          });
        } catch (e) {}

        const priceInUSD = Number(answer) / 10 ** Number(decimals);

        return {
          price: priceInUSD,
          timestamp: Number(updatedAt),
          symbol: symbol,
          source: 'DIA Adapter',
          chainId,
          updatedAt: Date.now()
        };
      } catch (error) {
        console.warn(`Viem adapter fetch failed for ${symbol}:`, error.message);
      }
    }

    // 2. Fallback to General Oracle
    const diaSymbol = DIA_ORACLE_CONFIG.TOKEN_SYMBOL_MAP[symbol];
    if (!diaSymbol) {
      throw new Error(`No DIA Oracle mapping for ${symbol}`);
    }
    
    // Fetch price from DIA Oracle
    const [price, timestamp] = await client.readContract({
      address: DIA_ORACLE_CONFIG.ADDRESS,
      abi: DIA_ORACLE_ABI,
      functionName: 'getValue',
      args: [diaSymbol],
    });

    const priceInUSD = Number(price) / 10 ** 8;

    return {
      price: priceInUSD,
      timestamp: Number(timestamp),
      symbol: symbol,
      source: 'DIA General Oracle',
      chainId,
      updatedAt: Date.now()
    };
  } catch (error) {
    console.error(`Error fetching DIA price for ${symbol}:`, error);
    throw error;
  }
};

// Batch fetch multiple prices
export const fetchDiaPrices = async (symbols, chainId = 4441) => {
  try {
    const pricePromises = symbols.map(symbol => 
      fetchDiaPrice(symbol, chainId).catch(error => {
        console.error(`Failed to fetch price for ${symbol}:`, error);
        return { symbol, error: error.message };
      })
    );

    const results = await Promise.all(pricePromises);
    
    // Format results
    const prices = {};
    results.forEach(result => {
      if (result.price !== undefined) {
        prices[result.symbol] = {
          price: result.price,
          timestamp: result.timestamp,
          source: 'DIA'
        };
      }
    });

    return prices;
  } catch (error) {
    console.error('Error fetching batch DIA prices:', error);
    return {};
  }
};

// Get DIA Oracle price with cache
const priceCache = new Map();
const CACHE_DURATION = DIA_ORACLE_CONFIG.UPDATE_INTERVAL || 120000;

export const getCachedDiaPrice = async (symbol, chainId = 4441) => {
  const cacheKey = `${symbol}-${chainId}`;
  const cached = priceCache.get(cacheKey);
  
  if (cached && Date.now() - cached.cachedAt < CACHE_DURATION) {
    return cached.data;
  }

  try {
    const priceData = await fetchDiaPrice(symbol, chainId);
    priceCache.set(cacheKey, {
      data: priceData,
      cachedAt: Date.now()
    });
    
    return priceData;
  } catch (error) {
    // Return cached data even if expired if new fetch fails
    if (cached) {
      console.warn(`Using expired cache for ${symbol}, fetch failed:`, error);
      return cached.data;
    }
    throw error;
  }
};

// Check if token has DIA support
export const hasDiaSupport = (tokenSymbol) => {
  return tokenSymbol in DIA_ORACLE_CONFIG.TOKEN_SYMBOL_MAP;
};

// Format price for display
export const formatDiaPrice = (price, decimals = 6) => {
  if (!price) return 'N/A';
  return `$${price.toFixed(decimals)}`;
};