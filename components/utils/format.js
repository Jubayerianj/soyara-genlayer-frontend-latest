// utils/format.js
import { ethers } from 'ethers';

/**
 * Format large numbers with suffixes (K, M, B)
 */
export function formatLargeNumber(num, decimals = 2) {
  if (!num && num !== 0) return '0';
  
  const number = typeof num === 'string' ? parseFloat(num) : num;
  
  if (Math.abs(number) >= 1.0e9) {
    return (number / 1.0e9).toFixed(decimals) + 'B';
  }
  if (Math.abs(number) >= 1.0e6) {
    return (number / 1.0e6).toFixed(decimals) + 'M';
  }
  if (Math.abs(number) >= 1.0e3) {
    return (number / 1.0e3).toFixed(decimals) + 'K';
  }
  
  return number.toFixed(decimals);
}

/**
 * Format token amount with proper decimals
 */
export function formatTokenAmount(amount, decimals = 18, maxDecimals = 6) {
  if (!amount || amount === '0') return '0';
  
  const parsed = parseFloat(ethers.formatUnits(amount, decimals));
  
  // Find the number of significant decimals
  const stringAmount = parsed.toString();
  const [integer, fraction = ''] = stringAmount.split('.');
  
  if (integer.length > 6) {
    return formatLargeNumber(parsed, 2);
  }
  
  if (!fraction || parseFloat(fraction) === 0) {
    return integer;
  }
  
  // Trim trailing zeros
  const trimmedFraction = fraction.replace(/0+$/, '');
  const finalFraction = trimmedFraction.slice(0, maxDecimals);
  
  if (finalFraction.length === 0) {
    return integer;
  }
  
  return `${integer}.${finalFraction}`;
}

/**
 * Format percentage with color
 */
export function formatPercentage(value, isPositive = null) {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  const formatted = `${num >= 0 ? '+' : ''}${num.toFixed(2)}%`;
  
  if (isPositive !== null) {
    return {
      value: formatted,
      color: isPositive ? '#00d395' : '#ff4444',
      isPositive
    };
  }
  
  return {
    value: formatted,
    color: num >= 0 ? '#00d395' : '#ff4444',
    isPositive: num >= 0
  };
}

/**
 * Format time remaining
 */
export function formatTimeRemaining(timestamp) {
  const now = Math.floor(Date.now() / 1000);
  const diff = timestamp - now;
  
  if (diff <= 0) return 'Expired';
  
  const hours = Math.floor(diff / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  const seconds = diff % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

/**
 * Format transaction hash for display
 */
export function formatTransactionHash(hash) {
  if (!hash || hash.length < 10) return hash;
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
}

/**
 * Format gas price
 */
export function formatGasPrice(gwei) {
  if (gwei < 0.001) return '< 0.001 Gwei';
  if (gwei < 1) return `${gwei.toFixed(3)} Gwei`;
  if (gwei < 1000) return `${gwei.toFixed(2)} Gwei`;
  return `${(gwei / 1000).toFixed(2)} Twei`;
}

/**
 * Format balance with currency symbol
 */
export function formatBalance(balance, symbol = '') {
  if (!balance) return `0 ${symbol}`.trim();
  
  const num = typeof balance === 'string' ? parseFloat(balance) : balance;
  
  if (num === 0) return `0 ${symbol}`.trim();
  
  if (num < 0.000001) {
    return `< 0.000001 ${symbol}`.trim();
  }
  
  if (num < 0.001) {
    return `${num.toFixed(6)} ${symbol}`.trim();
  }
  
  if (num < 1) {
    return `${num.toFixed(4)} ${symbol}`.trim();
  }
  
  if (num < 1000) {
    return `${num.toFixed(2)} ${symbol}`.trim();
  }
  
  return `${formatLargeNumber(num, 2)} ${symbol}`.trim();
}

/**
 * Parse units safely
 */
export function parseUnits(value, decimals = 18) {
  try {
    if (!value || value === '' || value === '0') {
      return ethers.toBigInt(0);
    }
    return ethers.parseUnits(value.toString(), decimals);
  } catch (error) {
    console.error('Error parsing units:', error);
    return ethers.toBigInt(0);
  }
}

/**
 * Format units safely
 */
export function formatUnits(value, decimals = 18) {
  try {
    if (!value || value === 0n || value === '0') {
      return '0';
    }
    return ethers.formatUnits(BigInt(value.toString()), decimals);
  } catch (error) {
    console.error('Error formatting units:', error);
    return '0';
  }
}

/**
 * Shorten string in the middle
 */
export function shortenString(str, start = 6, end = 4) {
  if (!str || str.length <= start + end) return str;
  return `${str.slice(0, start)}...${str.slice(-end)}`;
}

/**
 * Capitalize first letter
 */
export function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Format date
 */
export function formatDate(timestamp, includeTime = true) {
  const date = new Date(timestamp * 1000);
  
  const options = {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  };
  
  if (includeTime) {
    options.hour = '2-digit';
    options.minute = '2-digit';
    options.second = '2-digit';
  }
  
  return date.toLocaleDateString('en-US', options);
}