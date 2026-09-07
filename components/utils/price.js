// utils/price.js
import { formatUnits, parseUnits } from 'viem';
import { hasDiaOracleSupport } from '../../constants/tokens';


// Cache for formatted values
const formatCache = new Map();
const CACHE_DURATION = 60000; // 1 minute cache

export const calculatePriceImpact = (amountIn, amountOut, reserveIn, reserveOut) => {
  if (!amountIn || !reserveIn || !reserveOut) return 0;
  
  const amountInNum = parseFloat(amountIn);
  const reserveInNum = parseFloat(reserveIn);
  const reserveOutNum = parseFloat(reserveOut);
  
  if (reserveInNum === 0 || reserveOutNum === 0) return 0;
  
  const expectedOutput = (amountInNum * reserveOutNum) / (reserveInNum + amountInNum);
  const actualOutput = parseFloat(amountOut);
  
  if (expectedOutput === 0) return 0;
  
  const impact = ((expectedOutput - actualOutput) / expectedOutput) * 100;
  return Math.max(0, impact);
};

export const calculateMinReceived = (amountOut, slippage) => {
  if (!amountOut) return '0';
  
  const amount = parseFloat(amountOut);
  const minAmount = amount * (1 - slippage / 100);
  return minAmount.toString();
};

// Enhanced formatNumber that properly handles zero values for non-DIA tokens
export const formatNumber = (num, decimals = 6, options = {}) => {
  const { tokenSymbol = null, hasOraclePrice = false } = options;
  
  // If token doesn't have oracle support and number is provided, show 0
  if (tokenSymbol && !hasOraclePrice && num && parseFloat(num) > 0) {
    return '0';
  }
  
  if (!num || isNaN(parseFloat(num))) return '0';
  
  const number = parseFloat(num);
  
  // Handle zero values
  if (number === 0) return '0';
  
  // Check cache
  const cacheKey = `${number}_${decimals}_${tokenSymbol}_${hasOraclePrice}`;
  const cached = formatCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
    return cached.value;
  }
  
  let result;
  
  if (number < 0.000001) {
    result = '<0.000001';
  } else if (number < 0.0001) {
    result = number.toFixed(6);
  } else if (number < 0.01) {
    result = number.toFixed(4);
  } else if (number < 1) {
    result = number.toFixed(3);
  } else if (number < 1000) {
    result = number.toFixed(2);
  } else if (number < 1000000) {
    result = number.toLocaleString('en-US', { maximumFractionDigits: 2 });
  } else if (number >= 100000000000000) {
    result = (number / 100000000000000).toFixed(2) + 'T';
  } else if (number >= 1000000000) {
    result = (number / 1000000000).toFixed(2) + 'B';
  } else if (number >= 1000000) {
    result = (number / 1000000).toFixed(2) + 'M';
  } else {
    result = number.toLocaleString('en-US');
  }
  
  // Cache the result
  formatCache.set(cacheKey, { value: result, timestamp: Date.now() });
  
  // Clean old cache entries
  if (formatCache.size > 1000) {
    const now = Date.now();
    for (const [key, entry] of formatCache.entries()) {
      if (now - entry.timestamp > CACHE_DURATION * 5) {
        formatCache.delete(key);
      }
    }
  }
  
  return result;
};

// Enhanced formatUSD that checks oracle support
export const formatUSD = (num, options = {}) => {
  const { tokenSymbol = null, hasOraclePrice = false } = options;
  
  // If token doesn't have oracle support and number is provided, show $0
  if (tokenSymbol && !hasOraclePrice && num && parseFloat(num) > 0) {
    return '$0';
  }
  
  if (!num || isNaN(parseFloat(num))) return '$0';
  
  const number = parseFloat(num);
  
  // Handle zero values
  if (number === 0) return '$0';
  
  // Check cache
  const cacheKey = `usd_${number}_${tokenSymbol}_${hasOraclePrice}`;
  const cached = formatCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
    return cached.value;
  }
  
  let result;
  
  if (number < 0.01) {
    result = '$' + number.toFixed(6);
  } else if (number < 1) {
    result = '$' + number.toFixed(4);
  } else if (number < 1000) {
    result = '$' + number.toFixed(2);
  } else if (number < 1000000) {
    result = '$' + number.toLocaleString('en-US', { maximumFractionDigits: 2 });
  } else if (number >= 100000000000000) {
    result = "$" + (number / 100000000000000).toFixed(2) + 'T';
  } else if (number >= 1000000000) {
    result = "$" + (number / 1000000000).toFixed(2) + 'B';
  } else if (number >= 1000000) {
    result = "$" + (number / 1000000).toFixed(2) + 'M';
  } else {
    result = "$" + number.toLocaleString('en-US');
  }
  
  // Cache the result
  formatCache.set(cacheKey, { value: result, timestamp: Date.now() });
  
  return result;
};

export const parseInputAmount = (value, decimals) => {
  if (!value || value === '') return 0n;
  
  try {
    const cleaned = value.replace(/,/g, '').replace(/\.+$/, '');
    return parseUnits(cleaned, decimals);
  } catch (error) {
    console.error('Error parsing amount:', error);
    return 0n;
  }
};

export const formatTokenAmount = (amount, decimals, format = true, options = {}) => {
  const { tokenSymbol = null, hasOraclePrice = false } = options;
  
  if (!amount) return '0';
  
  try {
    const formatted = formatUnits(amount, decimals);
    
    if (tokenSymbol && !hasOraclePrice && parseFloat(formatted) > 0) {
      return format ? '0' : '0';
    }
    
    return format ? formatNumber(formatted, decimals, options) : formatted;
  } catch (error) {
    console.error('Error formatting amount:', error);
    return '0';
  }
};

export const formatLargeNumber = (num, options = {}) => {
  const { tokenSymbol = null, hasOraclePrice = false } = options;
  
  // If token doesn't have oracle support and number is provided, show 0
  if (tokenSymbol && !hasOraclePrice && num && parseFloat(num) > 0) {
    return '0';
  }
  
  if (!num || isNaN(parseFloat(num))) return '0';
  
  const number = parseFloat(num);
  
  if (number === 0) return '0';
  
  let result;
  
  if (number < 0.000001) {
    result = '<0.000001';
  } else if (number < 0.001) {
    result = number.toFixed(8);
  } else if (number < 1) {
    result = number.toFixed(4);
  } else if (number < 1000) {
    result = number.toFixed(2);
  } else if (number < 10000) {
    result = number.toFixed(1);
  } else if (number < 1000000) {
    result = number.toLocaleString('en-US', { maximumFractionDigits: 0 });
  } else if (number >= 1000000000000) {
    result = (number / 1000000000000).toFixed(2) + 'T';
  } else if (number >= 1000000000) {
    result = (number / 1000000000).toFixed(2) + 'B';
  } else if (number >= 1000000) {
    result = (number / 1000000).toFixed(2) + 'M';
  } else {
    result = number.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }
  
  return result;
};

// Format price with source - now includes token checking
export const formatPriceWithSource = (priceData, tokenSymbol = null) => {
  if (!priceData || !priceData.exists) {
    return {
      formattedPrice: '$0',
      source: 'No Oracle',
      hasPrice: false
    };
  }
  
  // Double-check token support
  if (tokenSymbol && !hasDiaOracleSupport(tokenSymbol)) {
    return {
      formattedPrice: '$0',
      source: 'Unsupported Token',
      hasPrice: false
    };
  }
  
  return {
    formattedPrice: `$${formatNumber(priceData.priceUSD)}`,
    source: 'DIA Oracle',
    hasPrice: true,
    lastUpdated: priceData.lastUpdated
  };
};

// New: Smart value formatting that checks oracle support
export const formatValueWithOracleCheck = (amount, price, tokenSymbol) => {
  const hasOracle = hasDiaOracleSupport(tokenSymbol);
  
  if (!hasOracle && price && parseFloat(price) > 0) {
    return {
      formattedValue: '$0',
      value: 0,
      hasOracleSupport: false,
      message: 'Token not supported by DIA Oracle'
    };
  }
  
  if (!amount || !price || parseFloat(price) === 0) {
    return {
      formattedValue: '$0',
      value: 0,
      hasOracleSupport: hasOracle,
      message: hasOracle ? 'No price available' : 'No oracle support'
    };
  }
  
  const amountNum = parseFloat(amount);
  const priceNum = parseFloat(price);
  const value = amountNum * priceNum;
  
  return {
    formattedValue: formatUSD(value, { tokenSymbol, hasOraclePrice: hasOracle }),
    value: value,
    hasOracleSupport: hasOracle,
    message: hasOracle ? 'DIA Oracle price' : 'No oracle support'
  };
};

// New: Batch format utility for multiple tokens
export const formatTokenValues = (tokens, prices) => {
  return tokens.map(token => {
    const priceData = prices[token.symbol] || { priceUSD: 0, exists: false };
    const hasOracle = hasDiaOracleSupport(token.symbol);
    
    let value = 0;
    if (hasOracle && priceData.exists && token.balance) {
      value = token.balance * priceData.priceUSD;
    }
    
    return {
      ...token,
      valueUSD: value,
      hasOraclePrice: hasOracle && priceData.exists,
      formattedValue: formatUSD(value, { 
        tokenSymbol: token.symbol, 
        hasOraclePrice: hasOracle && priceData.exists 
      })
    };
  });
};

// Clear cache utility (useful for testing)
export const clearFormatCache = () => {
  formatCache.clear();
};