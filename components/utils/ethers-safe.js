// utils/ethers-safe.js
import { ethers } from 'ethers';

/**
 * Safely parse units with error handling
 */
export function safeParseUnits(value, decimals = 18) {
  try {
    if (!value || value === '' || value === '0') {
      return 0n;
    }
    
    // Handle scientific notation
    if (value.includes('e')) {
      const [base, exponent] = value.split('e');
      if (exponent.startsWith('-')) {
        const pow = 10 ** parseInt(exponent.substring(1));
        value = (parseFloat(base) / pow).toString();
      } else {
        const pow = 10 ** parseInt(exponent);
        value = (parseFloat(base) * pow).toString();
      }
    }
    
    // Remove any trailing decimal points
    value = value.replace(/\.$/, '');
    
    // Handle edge cases
    if (value === '.' || value === '-' || value === '-.') {
      return 0n;
    }
    
    // Use ethers.js for parsing
    return ethers.parseUnits(value, decimals);
  } catch (error) {
    console.error('Error parsing units:', error, 'value:', value, 'decimals:', decimals);
    
    // Fallback: manual parsing for edge cases
    try {
      const [integer = '0', fraction = ''] = value.split('.');
      const fractionPadded = fraction.padEnd(decimals, '0').slice(0, decimals);
      return BigInt(integer + fractionPadded);
    } catch (fallbackError) {
      console.error('Fallback parsing also failed:', fallbackError);
      return 0n;
    }
  }
}

/**
 * Safely format units with error handling
 */
export function safeFormatUnits(value, decimals = 18) {
  try {
    if (!value || value === 0n || value === '0' || value === 0) {
      return '0';
    }
    
    const bigIntValue = BigInt(value.toString());
    
    // Use ethers.js for formatting
    return ethers.formatUnits(bigIntValue, decimals);
  } catch (error) {
    console.error('Error formatting units:', error, 'value:', value, 'decimals:', decimals);
    
    // Fallback: manual formatting
    try {
      const valueStr = value.toString().padStart(decimals + 1, '0');
      const integerPart = valueStr.slice(0, -decimals) || '0';
      const fractionalPart = valueStr.slice(-decimals).replace(/0+$/, '');
      
      if (fractionalPart === '') {
        return integerPart;
      }
      
      return `${integerPart}.${fractionalPart}`;
    } catch (fallbackError) {
      console.error('Fallback formatting also failed:', fallbackError);
      return '0';
    }
  }
}

/**
 * Compare two addresses case-insensitively
 */
export function addressesEqual(a, b) {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Truncate address for display
 */
export function truncateAddress(address, start = 6, end = 4) {
  if (!address || address.length < start + end) return address;
  return `${address.slice(0, start)}...${address.slice(-end)}`;
}

/**
 * Validate address format
 */
export function isValidAddress(address) {
  try {
    return ethers.isAddress(address);
  } catch {
    return false;
  }
}

/**
 * Calculate with slippage (in basis points)
 */
export function calculateWithSlippage(amount, slippageBps) {
  try {
    const amountBigInt = BigInt(amount.toString());
    const slippageBigInt = BigInt(slippageBps);
    
    // amount * (10000 - slippage) / 10000
    return (amountBigInt * (10000n - slippageBigInt)) / 10000n;
  } catch (error) {
    console.error('Error calculating with slippage:', error);
    return 0n;
  }
}

/**
 * Calculate price impact
 */
export function calculatePriceImpact(amountIn, reserveIn, reserveOut) {
  try {
    if (!amountIn || !reserveIn || !reserveOut) return 0;
    
    const amountInBig = BigInt(amountIn.toString());
    const reserveInBig = BigInt(reserveIn.toString());
    const reserveOutBig = BigInt(reserveOut.toString());
    
    if (reserveInBig === 0n || reserveOutBig === 0n) return 100; // 100% impact for new pool
    
    // k = reserveIn * reserveOut
    // newReserveIn = reserveIn + amountIn
    // newReserveOut = k / newReserveIn
    // priceImpact = 1 - (newReserveOut / reserveOut)
    
    const k = reserveInBig * reserveOutBig;
    const newReserveIn = reserveInBig + amountInBig;
    const newReserveOut = k / newReserveIn;
    
    const impact = 1 - (Number(newReserveOut) / Number(reserveOutBig));
    return Math.max(0, Math.min(100, impact * 100));
  } catch (error) {
    console.error('Error calculating price impact:', error);
    return 0;
  }
}

/**
 * Calculate LP token share
 */
export function calculateLPTokenShare(lpBalance, totalSupply, reserve0, reserve1, decimals0, decimals1) {
  try {
    if (!lpBalance || !totalSupply || totalSupply === 0n) {
      return {
        share: 0,
        amount0: 0n,
        amount1: 0n
      };
    }
    
    const share = (Number(lpBalance) / Number(totalSupply)) * 100;
    const amount0 = (BigInt(reserve0.toString()) * BigInt(lpBalance.toString())) / BigInt(totalSupply.toString());
    const amount1 = (BigInt(reserve1.toString()) * BigInt(lpBalance.toString())) / BigInt(totalSupply.toString());
    
    return {
      share,
      amount0,
      amount1,
      formatted0: safeFormatUnits(amount0, decimals0),
      formatted1: safeFormatUnits(amount1, decimals1)
    };
  } catch (error) {
    console.error('Error calculating LP token share:', error);
    return {
      share: 0,
      amount0: 0n,
      amount1: 0n,
      formatted0: '0',
      formatted1: '0'
    };
  }
}

/**
 * Calculate swap amounts
 */
export function calculateSwapAmount(amountIn, reserveIn, reserveOut, feeBps = 30n) {
  try {
    const amountInBig = BigInt(amountIn.toString());
    const reserveInBig = BigInt(reserveIn.toString());
    const reserveOutBig = BigInt(reserveOut.toString());
    
    if (reserveInBig === 0n || reserveOutBig === 0n) return 0n;
    
    // amountInWithFee = amountIn * (10000 - fee)
    const amountInWithFee = amountInBig * (10000n - feeBps);
    
    // amountOut = (amountInWithFee * reserveOut) / (reserveIn * 10000 + amountInWithFee)
    const numerator = amountInWithFee * reserveOutBig;
    const denominator = reserveInBig * 10000n + amountInWithFee;
    
    return numerator / denominator;
  } catch (error) {
    console.error('Error calculating swap amount:', error);
    return 0n;
  }
}

/**
 * Get minimum amount out with slippage
 */
export function getAmountOutMin(amountOut, slippageBps) {
  const amountOutBig = BigInt(amountOut.toString());
  return calculateWithSlippage(amountOutBig, slippageBps);
}

/**
 * Generate salt for create2
 */
export function generateSalt(token0, token1) {
  const sortedTokens = [token0, token1].sort((a, b) => 
    a.toLowerCase() < b.toLowerCase() ? -1 : 1
  );
  return ethers.solidityPackedKeccak256(['address', 'address'], sortedTokens);
}

/**
 * Format percentage
 */
export function formatPercentage(value, decimals = 2) {
  return `${Number(value).toFixed(decimals)}%`;
}

/**
 * Format USD value
 */
export function formatUSD(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

/**
 * Get network name from chain ID (LitVM support)
 */
export function getNetworkName(chainId) {
  switch (chainId) {
    case 4441:
      return 'LitVM Network';
    case 11155111:
      return 'Sepolia';
    case 1:
      return 'Ethereum Mainnet';
    case 5:
      return 'Goerli';
    default:
      return `Chain ${chainId}`;
  }
}

/**
 * Get native currency symbol from chain ID
 */
export function getNativeCurrencySymbol(chainId) {
  switch (chainId) {
    case 4441:
      return 'ETH';
    case 11155111:
      return 'ETH';
    case 1:
      return 'ETH';
    default:
      return 'ETH';
  }
}

/**
 * Get block explorer URL for chain
 */
export function getExplorerUrl(chainId) {
  switch (chainId) {
    case 4441:
      return 'https://explorer.LitVM.network';
    case 11155111:
      return 'https://sepolia.etherscan.io';
    case 1:
      return 'https://etherscan.io';
    default:
      return 'https://explorer.LitVM.network';
  }
}

/**
 * Get RPC URL for chain
 */
export function getRpcUrl(chainId) {
  switch (chainId) {
    case 4441:
      return 'https://rpc.LitVM.org';
    case 11155111:
      return 'https://rpc.sepolia.org';
    case 1:
      return 'https://mainnet.infura.io/v3/';
    default:
      return 'https://rpc.LitVM.org';
  }
}

/**
 * Check if chain is LitVM
 */
export function isLitVM(chainId) {
  return chainId === 4441;
}

/**
 * Check if chain is Sepolia
 */
export function isSepolia(chainId) {
  return chainId === 11155111;
}

/**
 * Check if chain is supported
 */
export function isSupportedChain(chainId) {
  return isLitVM(chainId) || isSepolia(chainId);
}

/**
 * Sleep utility
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get default token for chain
 */
export function getDefaultTokenForChain(chainId) {
  if (isLitVM(chainId)) {
    return {
      address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      symbol: 'ETH',
      name: 'LitVM Native',
      decimals: 18,
      isNative: true,
      isBaseToken: true,
      isPopular: true,
      isCustom: false,
      isVerified: true
    };
  } else if (isSepolia(chainId)) {
    return {
      address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      symbol: 'ETH',
      name: 'Ethereum',
      decimals: 18,
      isNative: true,
      isBaseToken: true,
      isPopular: true,
      isCustom: false,
      isVerified: true
    };
  }
  return null;
}

/**
 * Format transaction hash with explorer link
 */
export function formatTxHash(txHash, chainId) {
  const explorerUrl = getExplorerUrl(chainId);
  return {
    hash: txHash,
    shortHash: `${txHash.substring(0, 6)}...${txHash.substring(txHash.length - 4)}`,
    explorerUrl: `${explorerUrl}/tx/${txHash}`,
    explorerName: isLitVM(chainId) ? 'ETH Explorer' : 'Etherscan'
  };
}

/**
 * Format address with explorer link
 */
export function formatAddress(address, chainId) {
  const explorerUrl = getExplorerUrl(chainId);
  return {
    address,
    shortAddress: `${address.substring(0, 6)}...${address.substring(address.length - 4)}`,
    explorerUrl: `${explorerUrl}/address/${address}`,
    explorerName: isLitVM(chainId) ? 'ETH Explorer' : 'Etherscan'
  };
}