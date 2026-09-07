// components/utils/validation.js
import { parseUnits, formatUnits } from 'viem';

// Litvmswap v3 STYLE VALIDATION: All tokens treated equally, minimal blocking

// Validation for swap inputs - Litvmswap v3 STYLE: All tokens treated equally
export const validateSwapInputs = ({
  fromToken,
  toToken,
  fromAmount,
  toAmount,
  isConnected,
  isCorrectNetwork,
  fromTokenBalance,
  fromTokenDecimals = 18,
  toTokenDecimals = 18,
  minAmountOut = '0',
  slippage = 0.5,
  chainId = 4441, // Default to LitVM
}) => {
  // Check wallet connection
  if (!isConnected) {
    return {
      isValid: false,
      message: 'Please connect your wallet',
      field: 'wallet',
      code: 'WALLET_DISCONNECTED'
    };
  }

  // Check network
  if (!isCorrectNetwork) {
    const networkName = chainId === 4441 ? 'LitVM' : chainId === 11155111 ? 'Sepolia' : 'correct network';
    return {
      isValid: false,
      message: `Please switch to LitVM `,
      field: 'network',
      code: 'WRONG_NETWORK'
    };
  
  }

  // Check token selection
  if (!fromToken) {
    return {
      isValid: false,
      message: 'Please select a token to swap from',
      field: 'fromToken',
      code: 'NO_FROM_TOKEN'
    };
  }

  if (!toToken) {
    return {
      isValid: false,
      message: 'Please select a token to swap to',
      field: 'toToken',
      code: 'NO_TO_TOKEN'
    };
  }

  // Check if same token
  if (fromToken.address === toToken.address) {
    return {
      isValid: false,
      message: 'Cannot swap the same token',
      field: 'tokens',
      code: 'SAME_TOKEN'
    };
  }

  // Check amount
  if (!fromAmount || fromAmount.trim() === '') {
    return {
      isValid: false,
      message: 'Please enter an amount',
      field: 'amount',
      code: 'NO_AMOUNT'
    };
  }

  // Validate amount format
  const amountValidation = validateAmount(fromAmount, fromTokenDecimals);
  if (!amountValidation.isValid) {
    return {
      isValid: false,
      message: amountValidation.message,
      field: 'amount',
      code: 'INVALID_AMOUNT'
    };
  }

  // Parse amount safely
  let parsedAmount;
  try {
    // Use safe parsing
    const numAmount = parseFloat(fromAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return {
        isValid: false,
        message: 'Amount must be greater than 0',
        field: 'amount',
        code: 'ZERO_AMOUNT'
      };
    }
    
    parsedAmount = parseUnits(fromAmount, fromTokenDecimals);
  } catch (error) {
    console.error('Parse error:', error);
    return {
      isValid: false,
      message: 'Invalid amount format',
      field: 'amount',
      code: 'INVALID_AMOUNT_FORMAT'
    };
  }

  // Check balance (if balance is provided)
/*   if (fromTokenBalance !== undefined && fromTokenBalance !== null) {
    // For native tokens, leave some for gas
    const isNative = fromToken.isNative || fromToken.symbol === 'ETH' || fromToken.symbol === 'ETH';
    const balanceBuffer = isNative ? parseUnits('0.001', 18) : 0n;
    const availableBalance = fromTokenBalance > balanceBuffer 
      ? fromTokenBalance - balanceBuffer 
      : 0n;
    
    if (parsedAmount > availableBalance) {
      const balanceFormatted = formatUnits(availableBalance, fromTokenDecimals);
      const formattedBalance = parseFloat(balanceFormatted).toFixed(6);
      return {
        isValid: false,
        message: `Insufficient balance. Available: ${formattedBalance} ${fromToken.symbol}`,
        field: 'balance',
        code: 'INSUFFICIENT_BALANCE'
      };
    }
  } */

  // Litvmswap v3 STYLE: Don't validate quote - let contract handle it
  // Just check if we have some value for toAmount (can be 0)
  if (toAmount === undefined || toAmount === null) {
    return {
      isValid: false,
      message: 'Please wait for quote...',
      field: 'quote',
      code: 'QUOTE_LOADING',
      warning: true
    };
  }

  // Litvmswap v3 STYLE: Don't validate minimum received strictly
  // Only warn on extremely bad quotes
  if (minAmountOut && parseFloat(minAmountOut) > 0 && toAmount) {
    const minOutNum = parseFloat(minAmountOut);
    const toAmountNum = parseFloat(toAmount);
    
    if (!isNaN(minOutNum) && !isNaN(toAmountNum) && toAmountNum > 0) {
      // Only warn if output is less than 50% of minimum expected
      if (toAmountNum < minOutNum * 0.5) {
        return {
          isValid: true, // Still valid, just warning
          message: 'Expected output is significantly below minimum',
          field: 'minReceived',
          code: 'BELOW_MINIMUM_WARNING',
          warning: true
        };
      }
    }
  }

  // All checks passed
  return {
    isValid: true,
    message: '',
    field: null,
    code: 'VALID'
  };
};

// Validate amount format
export const validateAmount = (amount, decimals = 18) => {
  if (!amount || amount === '') {
    return { isValid: false, message: 'Amount is required' };
  }

  // Check for multiple decimal points
  if ((amount.match(/\./g) || []).length > 1) {
    return { isValid: false, message: 'Invalid amount format' };
  }

  // Check for valid characters (numbers and decimal point)
  if (!/^[0-9]*\.?[0-9]*$/.test(amount)) {
    return { isValid: false, message: 'Only numbers and decimal point allowed' };
  }

  // Check if it's a valid number
  const num = parseFloat(amount);
  if (isNaN(num)) {
    return { isValid: false, message: 'Invalid number' };
  }

  // Check if negative
  if (num < 0) {
    return { isValid: false, message: 'Amount cannot be negative' };
  }

  // Check if too large (prevent overflow)
  if (num > 1e12) { // 1 trillion max
    return { isValid: false, message: 'Amount too large' };
  }

  // Check decimal places
  const decimalPart = amount.includes('.') ? amount.split('.')[1] : '';
  if (decimalPart.length > decimals) {
    return { 
      isValid: false, 
      message: `Maximum ${decimals} decimal places allowed` 
    };
  }

  return { isValid: true, message: '' };
};

// Validate slippage - Super-Secured: Strict bounds (0.1% - 10%)
export const validateSlippage = (slippage) => {
  const num = parseFloat(slippage);
  
  if (isNaN(num)) {
    return { isValid: false, message: 'Invalid slippage value' };
  }

  if (num < 0.1) {
    return { 
      isValid: false, 
      message: 'Slippage must be at least 0.1% for security' 
    };
  }

  const maxSlippage = 10;
  if (num > maxSlippage) {
    return { 
      isValid: false, 
      message: `Slippage cannot exceed ${maxSlippage}% to prevent high loss` 
    };
  }

  if (num > 3) {
    return { 
      isValid: true, 
      message: 'High slippage. Front-running risk increases.',
      warning: true 
    };
  }

  return { isValid: true, message: '' };
};

// Validate transaction deadline - Super-Secured: Strict bounds (5 - 60 min)
export const validateDeadline = (deadline) => {
  const num = parseInt(deadline, 10);
  
  if (isNaN(num)) {
    return { isValid: false, message: 'Invalid deadline value' };
  }

  if (num < 5) {
    return { isValid: false, message: 'Deadline must be at least 5 minutes' };
  }

  if (num > 60) {
    return { isValid: false, message: 'Deadline cannot exceed 60 minutes' };
  }

  return { isValid: true, message: '' };
};

/**
 * Super-Secured: Calculate Price Impact for Liquidity
 * Returns the percentage deviation from current market reserves.
 */
export const calculateLiquidityPriceImpact = (amountA, amountB, reserveA, reserveB) => {
  if (!amountA || !amountB || !reserveA || !reserveB || reserveA === 0n || reserveB === 0n) {
    return 0;
  }

  // Current market ratio: reserveA / reserveB
  // Input ratio: amountA / amountB
  // Deviation = |(inputRatio / marketRatio) - 1| * 100
  
  // To avoid floating point, we use BigInt for precision
  // inputRatio / marketRatio = (amountA / amountB) / (reserveA / reserveB)
  // = (amountA * reserveB) / (amountB * reserveA)
  
  const numerator = amountA * reserveB;
  const denominator = amountB * reserveA;
  
  if (denominator === 0n) return 0;
  
  // Calculate deviation in basis points (1/100th of 1%)
  const ratioBps = (numerator * 10000n) / denominator;
  const deviationBps = ratioBps > 10000n ? ratioBps - 10000n : 10000n - ratioBps;
  
  return Number(deviationBps) / 100; // Return as percentage (e.g. 1.5 for 1.5%)
};

/**
 * Super-Secured: Validate Liquidity Addition
 * Comprehensive check for ratio deviation, slippage, and deadlines.
 */
export const validateLiquidityAddition = ({
  amountA,
  amountB,
  reserveA,
  reserveB,
  slippage,
  deadline,
  poolExists,
  isNewPool = false
}) => {
  // 1. Basic format checks
  const slippageVal = validateSlippage(slippage);
  if (!slippageVal.isValid) return slippageVal;

  const deadlineVal = validateDeadline(deadline);
  if (!deadlineVal.isValid) return deadlineVal;

  // 2. Price Ratio Guard (Only for existing pools)
  if (poolExists && !isNewPool) {
    const impact = calculateLiquidityPriceImpact(amountA, amountB, reserveA, reserveB);
    
    // Strict block at 3% deviation
    if (impact > 3) {
      return {
        isValid: false,
        message: `Price deviation (${impact.toFixed(2)}%) exceeds the 3% safety limit. Set market price to prevent loss.`,
        code: 'PRICE_DEVIATION_TOO_HIGH'
      };
    }
    
    // Warning at 1% deviation
    if (impact > 1) {
      return {
        isValid: true,
        message: `Price deviation is ${impact.toFixed(2)}%. Slight arbitrage loss possible.`,
        warning: true,
        code: 'PRICE_DEVIATION_WARNING'
      };
    }
  }

  // 3. New Pool Safety (Warn that user sets price)
  if (isNewPool) {
    return {
      isValid: true,
      message: 'You are setting the initial pool price. Ensure the ratio is correct!',
      warning: true,
      code: 'NEW_POOL_PRICE_SETTING'
    };
  }

  return { isValid: true, message: '', code: 'VALID' };
};

// Validate price impact - NOW COMPLETELY NEUTRAL (no warnings, no messages)
export const validatePriceImpact = (impact) => {
  // Always return a neutral result – no messages, no warnings.
  return { isValid: true, message: '', severity: 'none' };
};

// Validate token address for import
export const validateTokenAddress = async (address, publicClient) => {
  if (!address || typeof address !== 'string') {
    return { isValid: false, message: 'Address is required' };
  }

  const cleanAddress = address.toLowerCase().trim();

  // Check ETH/ETH address format
  if (cleanAddress === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
    return { isValid: true, message: '', isNative: true };
  }

  // Basic Ethereum address regex
  const regex = /^0x[a-fA-F0-9]{40}$/;
  if (!regex.test(cleanAddress)) {
    return { isValid: false, message: 'Invalid Ethereum address format' };
  }

  // Check for zero address
  if (cleanAddress === '0x0000000000000000000000000000000000000000') {
    return { isValid: false, message: 'Cannot use zero address' };
  }

  // Check if it's a contract (if publicClient is provided)
  if (publicClient) {
    try {
      // Get contract code to verify it's a contract
      const code = await publicClient.getBytecode({ address: cleanAddress });
      if (!code || code === '0x') {
        return { 
          isValid: false, 
          message: 'No contract found at this address' 
        };
      }

      return { 
        isValid: true, 
        message: '', 
        address: cleanAddress 
      };
    } catch (err) {
      console.error('Error validating token address:', err);
      return { 
        isValid: false, 
        message: 'Error validating token address. Please try again.' 
      };
    }
  }

  // If no publicClient, just do basic validation
  return { 
    isValid: true, 
    message: '', 
    address: cleanAddress,
    note: 'Advanced validation not available'
  };
};

// Validate token symbol
export const validateTokenSymbol = (symbol) => {
  if (!symbol || symbol.trim() === '') {
    return { isValid: false, message: 'Token symbol is required' };
  }

  if (symbol.length > 20) {
    return { isValid: false, message: 'Symbol too long (max 20 characters)' };
  }

  if (!/^[a-zA-Z0-9]+$/.test(symbol)) {
    return { isValid: false, message: 'Symbol can only contain letters and numbers' };
  }

  return { isValid: true, message: '' };
};

// Validate token decimals
export const validateTokenDecimals = (decimals) => {
  const num = parseInt(decimals, 10);
  
  if (isNaN(num)) {
    return { isValid: false, message: 'Invalid decimals value' };
  }

  if (num < 0) {
    return { isValid: false, message: 'Decimals cannot be negative' };
  }

  if (num > 36) {
    return { isValid: false, message: 'Decimals cannot exceed 36' };
  }

  return { isValid: true, message: '' };
};

// Validate gas price
export const validateGasPrice = (gasPrice, maxGasPrice = '200') => {
  const num = parseFloat(gasPrice);
  const max = parseFloat(maxGasPrice);

  if (isNaN(num)) {
    return { isValid: false, message: 'Invalid gas price' };
  }

  if (num <= 0) {
    return { isValid: false, message: 'Gas price must be positive' };
  }

  if (num > max) {
    return { 
      isValid: false, 
      message: `Gas price exceeds maximum of ${max} Gwei` 
    };
  }

  return { isValid: true, message: '' };
};

// Validate swap path
export const validateSwapPath = (path = []) => {
  if (!Array.isArray(path)) {
    return { isValid: false, message: 'Path must be an array' };
  }

  if (path.length < 2) {
    return { isValid: false, message: 'Path must contain at least 2 tokens' };
  }

  if (path.length > 5) {
    return { isValid: false, message: 'Path cannot exceed 5 hops' };
  }

  // Check for duplicate addresses in path
  const uniqueAddresses = new Set(path.map(p => p.toLowerCase()));
  if (uniqueAddresses.size !== path.length) {
    return { isValid: false, message: 'Path contains duplicate tokens' };
  }

  return { isValid: true, message: '' };
};

// Validate swap quote - Litvmswap v3 STYLE: Don't block on errors
export const validateSwapQuote = (quote, minExpected = '0') => {
  if (!quote || !quote.data || !Array.isArray(quote.data)) {
    return { 
      isValid: true, // Changed to true for Uniswap style
      message: 'No quote data available. You can still try the swap.',
      code: 'NO_QUOTE_DATA',
      warning: true
    };
  }

  if (quote.error) {
    return { 
      isValid: true, // Changed to true for Uniswap style
      message: 'Quote error. Contract will handle validation.',
      code: 'QUOTE_ERROR',
      warning: true
    };
  }

  if (quote.isLoading) {
    return { 
      isValid: false, 
      message: 'Loading quote...',
      code: 'QUOTE_LOADING',
      warning: true
    };
  }

  const amounts = quote.data;
  if (amounts.length < 2) {
    return { 
      isValid: true, // Changed to true for Uniswap style
      message: 'Incomplete quote data. Try anyway.',
      code: 'INCOMPLETE_QUOTE',
      warning: true
    };
  }

  const outputAmount = amounts[amounts.length - 1];
  if (outputAmount === 0n) {
    return { 
      isValid: true, // Changed to true for Uniswap style
      message: 'No liquidity found. Contract will revert if invalid.',
      code: 'NO_LIQUIDITY_WARNING',
      warning: true
    };
  }

  return { 
    isValid: true, 
    message: '',
    code: 'QUOTE_VALID',
    outputAmount: outputAmount.toString()
  };
};

// Validate token import with comprehensive checks
export const validateTokenImport = async (tokenAddress, publicClient, chainId = 4441) => {
  // Step 1: Basic address validation
  const addressValidation = await validateTokenAddress(tokenAddress, publicClient);
  if (!addressValidation.isValid) {
    return addressValidation;
  }

  if (addressValidation.isNative) {
    const nativeSymbol = chainId === 4441 ? 'ETH' : 'ETH';
    return { 
      isValid: true, 
      message: `${nativeSymbol} is already available`, 
      token: { 
        address: tokenAddress,
        symbol: nativeSymbol,
        name: chainId === 4441 ? 'LitVM Native' : 'Ethereum',
        decimals: 18,
        isNative: true
      }
    };
  }

  if (!publicClient) {
    return { 
      isValid: false, 
      message: 'Cannot connect to blockchain for validation' 
    };
  }

  try {
    const erc20Abi = [
      'function name() view returns (string)',
      'function symbol() view returns (string)',
      'function decimals() view returns (uint8)',
    ];

    // Fetch token details with error handling
    const [name, symbol, decimals] = await Promise.all([
      publicClient.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: 'name',
      }).catch(() => 'Unknown Token'),
      
      publicClient.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: 'symbol',
      }).catch(() => 'UNKNOWN'),
      
      publicClient.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: 'decimals',
      }).catch(() => 18),
    ]);

    // Step 3: Validate token details
    const symbolValidation = validateTokenSymbol(String(symbol));
    if (!symbolValidation.isValid) {
      return symbolValidation;
    }

    const decimalsValidation = validateTokenDecimals(Number(decimals));
    if (!decimalsValidation.isValid) {
      return decimalsValidation;
    }

    const token = {
      address: tokenAddress,
      symbol: String(symbol),
      name: String(name),
      decimals: Number(decimals),
      isCustom: true,
      isVerified: false,
    };

    return {
      isValid: true,
      message: 'Token validated successfully',
      token,
    };

  } catch (error) {
    console.error('Error validating token:', error);
    
    let errorMessage = 'Failed to validate token';
    
    if (error.message.includes('ContractFunctionExecutionError')) {
      errorMessage = 'Token contract not found or not ERC20 compliant';
    } else if (error.message.includes('Invalid input')) {
      errorMessage = 'Invalid token address';
    } else if (error.message.includes('timeout') || error.message.includes('Network error')) {
      errorMessage = 'Network error. Please check your connection';
    }
    
    return {
      isValid: false,
      message: errorMessage,
      error: error.message,
    };
  }
};

// Sanitize amount input
export const sanitizeAmount = (input) => {
  if (!input || input === '') return '';
  
  // Remove any commas and extra decimal points
  let sanitized = input.replace(/,/g, '');
  
  // Remove leading zeros (but keep zero if it's the only character)
  if (sanitized.startsWith('0') && sanitized.length > 1 && !sanitized.startsWith('0.')) {
    sanitized = sanitized.replace(/^0+/, '');
    if (sanitized === '' || sanitized.startsWith('.')) {
      sanitized = '0' + sanitized;
    }
  }
  
  // Ensure only one decimal point
  const parts = sanitized.split('.');
  if (parts.length > 2) {
    sanitized = parts[0] + '.' + parts.slice(1).join('');
  }
  
  return sanitized;
};

// Format validation error for display - UNISWAP STYLE
export const formatValidationError = (error, chainId = 4441) => {
  if (!error) return null;
  
  // Map error codes to user-friendly messages
  const errorMessages = {
    'WALLET_DISCONNECTED': 'Please connect your wallet',
    'WRONG_NETWORK': `Please switch to LitVM network`,
    'NO_FROM_TOKEN': 'Please select a token to swap from',
    'NO_TO_TOKEN': 'Please select a token to swap to',
    'SAME_TOKEN': 'Cannot swap the same token',
    'NO_AMOUNT': 'Please enter an amount',
    'INVALID_AMOUNT': 'Invalid amount',
    'INVALID_AMOUNT_FORMAT': 'Invalid amount format',
    'ZERO_AMOUNT': 'Amount must be greater than 0',
    'INSUFFICIENT_BALANCE': 'Insufficient balance',
    'QUOTE_LOADING': 'Please wait for quote...',
    'BELOW_MINIMUM_WARNING': 'Expected output below minimum (warning)',
    'NO_LIQUIDITY_WARNING': 'No liquidity found (try anyway)',
  };
  
  // Check if it's a warning code
  if (error.code && (error.code.endsWith('_WARNING') || error.warning)) {
    return {
      message: errorMessages[error.code] || error.message || 'Validation warning',
      severity: 'warning'
    };
  }
  
  return {
    message: errorMessages[error.code] || error.message || 'Validation error',
    severity: 'error'
  };
};

// Get validation severity color
export const getValidationSeverity = (validation) => {
  if (!validation.isValid) return 'error';
  if (validation.warning) return 'warning';
  return 'success';
};

// Create validation summary
export const createValidationSummary = (validations) => {
  const errors = validations.filter(v => !v.isValid);
  const warnings = validations.filter(v => v.isValid && v.warning);
  
  return {
    isValid: errors.length === 0,
    hasWarnings: warnings.length > 0,
    errors,
    warnings,
    summary: errors.length > 0 
      ? `${errors.length} error${errors.length > 1 ? 's' : ''} found`
      : warnings.length > 0
      ? `${warnings.length} warning${warnings.length > 1 ? 's' : ''} found`
      : 'All validations passed'
  };
};

// Get token warnings for display
export const getTokenWarnings = (token) => {
  const warnings = [];
  
  if (token && token.decimals) {
    if (token.decimals > 18) {
      warnings.push(`High decimals (${token.decimals})`);
    }
  }
  
  if (token && token.symbol) {
    if (token.symbol.length > 10) {
      warnings.push('Long symbol name');
    }
  }
  
  return warnings;
};

// Litvmswap v3 STYLE: Simple swap validation (just the basics)
export const validateSimpleSwap = ({
  fromToken,
  toToken,
  fromAmount,
  isConnected,
  isCorrectNetwork,
  fromTokenBalance,
  chainId = 4441
}) => {
  // Basic checks only - let contract handle the rest
  
  if (!isConnected) {
    return { isValid: false, message: 'Connect wallet' };
  }
  
  if (!isCorrectNetwork) {
    const networkName = chainId === 4441 ? 'LitVM' : 'Sepolia';
    return { isValid: false, message: `Switch to ${networkName}` };
  }
  
  if (!fromToken || !toToken) {
    return { isValid: false, message: 'Select tokens' };
  }
  
  if (!fromAmount || parseFloat(fromAmount) <= 0) {
    return { isValid: false, message: 'Enter amount' };
  }
  
  if (fromToken.address === toToken.address) {
    return { isValid: false, message: 'Same token' };
  }
  
  // Balance check (critical)
  if (fromTokenBalance !== undefined && fromTokenBalance !== null) {
    try {
      const parsedAmount = parseUnits(fromAmount, fromToken.decimals || 18);
      if (parsedAmount > fromTokenBalance) {
        return { isValid: false, message: 'Insufficient balance' };
      }
    } catch (error) {
      // If we can't parse, still allow (contract will handle)
      console.warn('Balance check failed:', error);
    }
  }
  
  // All basic checks passed
  return { isValid: true, message: '' };
};

// Check if validation should block swap (only critical errors)
export const shouldBlockSwap = (validation) => {
  if (!validation.isValid) {
    // These are critical errors that should block the swap
    const blockingCodes = [
      'WALLET_DISCONNECTED',
      'WRONG_NETWORK',
      'NO_FROM_TOKEN',
      'NO_TO_TOKEN',
      'SAME_TOKEN',
      'NO_AMOUNT',
      'INVALID_AMOUNT',
      'INVALID_AMOUNT_FORMAT',
      'ZERO_AMOUNT',
      'INSUFFICIENT_BALANCE'
    ];
    
    return blockingCodes.includes(validation.code);
  }
  
  // Warnings don't block swap
  if (validation.warning) {
    return false;
  }
  
  return false;
};

// New: Safe validation wrapper
export const safeValidateSwap = (params) => {
  try {
    return validateSwapInputs(params);
  } catch (error) {
    console.error('Validation error:', error);
    // On validation error, still allow swap (Uniswap style)
    return {
      isValid: true,
      message: 'Validation error, but you can try anyway',
      warning: true,
      code: 'VALIDATION_ERROR'
    };
  }
};

export default {
  validateSwapInputs,
  validateSimpleSwap,
  validateAmount,
  validateSlippage,
  validateDeadline,
  validateTokenAddress,
  validateTokenSymbol,
  validateTokenDecimals,
  validateTokenImport,
  validatePriceImpact,
  validateGasPrice,
  validateSwapPath,
  validateSwapQuote,
  sanitizeAmount,
  formatValidationError,
  getValidationSeverity,
  createValidationSummary,
  getTokenWarnings,
  shouldBlockSwap,
  safeValidateSwap,
};