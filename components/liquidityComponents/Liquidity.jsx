// components/liquidityComponents/Liquidity.jsx
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  useAccount, 
  useWriteContract, 
  useReadContract, 
  usePublicClient,
  useWaitForTransactionReceipt,
  useChainId,
  useBalance
} from 'wagmi';
import { parseAbi, parseUnits, formatUnits } from 'viem';
import TokenInput from '../common/TokenInput';
import TokenSelectModal from '../common/TokenSelectModal';
import TransactionModal from '../common/TransactionModal';
import AdvancedSettings from './AdvancedSettings';
import { getContractAddresses } from '../../constants/addresses';
import { ROUTER_ABI, FACTORY_ABI, PAIR_ABI, ERC20_ABI } from '../../constants/abis';
import { useTokens } from '../../hooks/common/useTokens';
import { useTokenBalance } from '../../hooks/liquidity/useTokenBalance';
import { ETHERS_CONSTANTS } from '../../constants/ethers';
import { addressesEqual } from '../utils/ethers-safe';
import { GasUtils } from '../../constants/gas';
import { gasHelpers } from '../../utils/gasHelpers';
import { 
  validateLiquidityAddition, 
  calculateLiquidityPriceImpact 
} from '../utils/validation';
import styles from './Liquidity.module.css';

// Helper to safely stringify objects with BigInt
const safeStringify = (obj) => {
  return JSON.stringify(obj, (key, value) =>
    typeof value === 'bigint' ? value.toString() : value, 2
  );
};

// Fixed safeParseUnits function
const safeParseUnits = (value, decimals) => {
  if (!value || value === '' || typeof value !== 'string') {
    return 0n;
  }
  
  try {
    const cleanedValue = value.trim();
    
    if (cleanedValue === '0' || cleanedValue === '0.') {
      return 0n;
    }
    
    if (isNaN(Number(cleanedValue))) {
      console.error(`Invalid number: ${cleanedValue}`);
      return 0n;
    }
    
    return parseUnits(cleanedValue, decimals);
  } catch (error) {
    console.error(`Failed to parse units for value: ${value}, decimals: ${decimals}`, error);
    return 0n;
  }
};

// Improved formatBalance function with proper decimal handling
const formatBalance = (balance, decimals = 18, maxDecimals = 6) => {
  if (!balance || balance === 0n) return '0';
  
  try {
    const formatted = formatUnits(balance, decimals);
    const num = parseFloat(formatted);
    
    // If number is very small, show in scientific notation
    if (num < 0.000001 && num > 0) {
      return num.toExponential(4);
    }
    
    // Format with appropriate decimal places
    const options = {
      minimumFractionDigits: 0,
      maximumFractionDigits: maxDecimals,
      useGrouping: false, // Don't use commas
    };
    
    return num.toLocaleString('en-US', options);
  } catch (error) {
    console.error('Error formatting balance:', error);
    return '0';
  }
};

const Liquidity = () => {
  const { address, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const chainId = useChainId();
  
  // Get native ETH balance directly
  const { data: nativeBalanceData } = useBalance({
    address,
    query: {
      enabled: !!address,
    },
  });
  
  // FIXED: Get addresses based on chainId
  const ADDRESSES = useMemo(() => {
    return getContractAddresses(chainId);
  }, [chainId]);
  
  // Get network gas configuration
  const gasConfig = useMemo(() => {
    return GasUtils.getConfig(chainId);
  }, [chainId]);
  
  const { tokens, refreshBalances, importToken } = useTokens();
  
  // Refs to track previous values
  const prevTokenARef = useRef(null);
  const prevTokenBRef = useRef(null);
  const prevAmountARef = useRef('');
  const prevAmountBRef = useRef('');
  
  // State
  const [showTokenAModal, setShowTokenAModal] = useState(false);
  const [showTokenBModal, setShowTokenBModal] = useState(false);
  const [showTxModal, setShowTxModal] = useState(false);
  const [txHash, setTxHash] = useState(null);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [approvingToken, setApprovingToken] = useState(null);
  const [reserves, setReserves] = useState({ reserve0: 0n, reserve1: 0n });
  const [isCheckingReserves, setIsCheckingReserves] = useState(false);
  
  // Token states
  const [tokenA, setTokenA] = useState(null);
  const [tokenB, setTokenB] = useState(null);
  const [amountA, setAmountA] = useState('');
  const [amountB, setAmountB] = useState('');

  // Slippage and deadline settings
  const [slippage, setSlippage] = useState(0.5);
  const [deadlineMinutes, setDeadlineMinutes] = useState(20);

  // Allowance dropdown state
  const [isAllowanceDropdownOpen, setIsAllowanceDropdownOpen] = useState(false);

  // Use the token balance hook
  const { 
    getTokenBalance, 
    getFormattedBalance, 
    refetchBalances: refreshTokenBalances 
  } = useTokenBalance(address, tokenA, tokenB);

  // Helper function to check if token is native (ETH)
  const isNativeToken = useCallback((token) => {
    if (!token) return false;
    return token.isNative || token.symbol === 'ETH';
  }, []);

  // Get token balances with native token support
  const tokenABalance = useMemo(() => {
    if (!tokenA || !address) return 0n;
    
    // For native ETH, use direct balance
    if (isNativeToken(tokenA)) {
      return nativeBalanceData?.value || 0n;
    }
    
    return getTokenBalance(tokenA);
  }, [tokenA, address, getTokenBalance, isNativeToken, nativeBalanceData]);

  const tokenBBalance = useMemo(() => {
    if (!tokenB || !address) return 0n;
    
    // For native ETH, use direct balance
    if (isNativeToken(tokenB)) {
      return nativeBalanceData?.value || 0n;
    }
    
    return getTokenBalance(tokenB);
  }, [tokenB, address, getTokenBalance, isNativeToken, nativeBalanceData]);

  // Get formatted balances for display
  const formattedBalanceA = useMemo(() => {
    if (!tokenA || !address) return '0';
    const balance = tokenABalance;
    return formatBalance(balance, tokenA.decimals, 6);
  }, [tokenA, address, tokenABalance]);

  const formattedBalanceB = useMemo(() => {
    if (!tokenB || !address) return '0';
    const balance = tokenBBalance;
    return formatBalance(balance, tokenB.decimals, 6);
  }, [tokenB, address, tokenBBalance]);

  const modalTokens = useMemo(() => {
    return tokens.map((token) => ({
      ...token,
      balance: formatBalance(
        isNativeToken(token) ? (nativeBalanceData?.value || 0n) : getTokenBalance(token),
        token.decimals,
        6
      ),
    }));
  }, [tokens, getTokenBalance, isNativeToken, nativeBalanceData]);

  // Parse amounts with proper decimal handling
  const parsedAmountA = useMemo(() => {
    if (!tokenA || !amountA || parseFloat(amountA) <= 0) return 0n;
    try {
      const parsed = safeParseUnits(amountA, tokenA.decimals);
      return parsed;
    } catch (error) {
      console.error(`❌ Failed to parse amount A: ${amountA} ${tokenA.symbol}`, error);
      return 0n;
    }
  }, [tokenA, amountA]);

  const parsedAmountB = useMemo(() => {
    if (!tokenB || !amountB || parseFloat(amountB) <= 0) return 0n;
    try {
      const parsed = safeParseUnits(amountB, tokenB.decimals);
      return parsed;
    } catch (error) {
      console.error(`❌ Failed to parse amount B: ${amountB} ${tokenB.symbol}`, error);
      return 0n;
    }
  }, [tokenB, amountB]);

  // ============ CALCULATE MINIMUM AMOUNTS WITH SLIPPAGE ============
  const amountAMin = useMemo(() => {
    if (!parsedAmountA || parsedAmountA <= 0n) return 0n;
    const slippageBps = BigInt(Math.floor(slippage * 100));
    const minAmount = (parsedAmountA * (10000n - slippageBps)) / 10000n;
    return minAmount;
  }, [parsedAmountA, slippage]);

  const amountBMin = useMemo(() => {
    if (!parsedAmountB || parsedAmountB <= 0n) return 0n;
    const slippageBps = BigInt(Math.floor(slippage * 100));
    const minAmount = (parsedAmountB * (10000n - slippageBps)) / 10000n;
    return minAmount;
  }, [parsedAmountB, slippage]);

  // Format minimum amounts for display
  const formattedAmountAMin = useMemo(() => {
    if (!amountAMin || amountAMin <= 0n) return '0';
    return formatBalance(amountAMin, tokenA?.decimals || 18);
  }, [amountAMin, tokenA]);

  const formattedAmountBMin = useMemo(() => {
    if (!amountBMin || amountBMin <= 0n) return '0';
    return formatBalance(amountBMin, tokenB?.decimals || 18);
  }, [amountBMin, tokenB]);

  // Calculate deadline timestamp
  const deadlineTimestamp = useMemo(() => {
    return Math.floor(Date.now() / 1000) + deadlineMinutes * 60;
  }, [deadlineMinutes]);

  // Check if native token () is involved
  const isNativeInvolved = useMemo(() => {
    return isNativeToken(tokenA) || isNativeToken(tokenB);
  }, [tokenA, tokenB, isNativeToken]);

  // Get token addresses for contract calls
  const tokenAAddress = useMemo(() => {
    if (!tokenA) return null;
    // If token is native ETH, use WII (wrapped) address
    return isNativeToken(tokenA) ? ADDRESSES?.weth : tokenA.address;
  }, [tokenA, ADDRESSES, isNativeToken]);

  const tokenBAddress = useMemo(() => {
    if (!tokenB) return null;
    return isNativeToken(tokenB) ? ADDRESSES?.weth : tokenB.address;
  }, [tokenB, ADDRESSES, isNativeToken]);

  // Check if we have all required addresses
  const canReadContract = useMemo(() => {
    return ADDRESSES && ADDRESSES.factory && tokenAAddress && tokenBAddress;
  }, [ADDRESSES, tokenAAddress, tokenBAddress]);

  // Get pair address from factory
  const { data: pairAddress } = useReadContract({
    address: ADDRESSES?.factory,
    abi: FACTORY_ABI,
    functionName: 'getPair',
    args: tokenAAddress && tokenBAddress ? [tokenAAddress, tokenBAddress] : undefined,
    query: {
      enabled: canReadContract,
    }
  });

  const poolExists = useMemo(() => {
    return pairAddress && pairAddress !== ETHERS_CONSTANTS.ZeroAddress;
  }, [pairAddress]);

  // Fetch reserves when pool exists
  useEffect(() => {
    const fetchReserves = async () => {
      if (!pairAddress || pairAddress === ETHERS_CONSTANTS.ZeroAddress || !tokenAAddress || !tokenBAddress) {
        setReserves({ reserve0: 0n, reserve1: 0n });
        return;
      }

      setIsCheckingReserves(true);
      try {
        const reservesData = await publicClient.readContract({
          address: pairAddress,
          abi: PAIR_ABI,
          functionName: 'getReserves',
        });

        // Determine which reserve corresponds to which token
        const token0 = tokenAAddress < tokenBAddress ? tokenAAddress : tokenBAddress;
        const token1 = tokenAAddress < tokenBAddress ? tokenBAddress : tokenAAddress;
        
        const isTokenA0 = tokenAAddress === token0;
        
        setReserves({
          reserve0: reservesData[0],
          reserve1: reservesData[1],
          token0,
          token1,
          isTokenA0,
        });
      } catch (error) {
        console.error('❌ Failed to fetch reserves:', error);
        setReserves({ reserve0: 0n, reserve1: 0n });
      } finally {
        setIsCheckingReserves(false);
      }
    };

    if (poolExists) {
      fetchReserves();
    } else {
      setReserves({ reserve0: 0n, reserve1: 0n });
    }
  }, [pairAddress, poolExists, tokenAAddress, tokenBAddress, publicClient]);

  // Calculate optimal ratio based on reserves
  const calculateOptimalAmount = useCallback((inputAmount, inputReserve, outputReserve) => {
    if (!inputAmount || inputAmount === 0n || !inputReserve || !outputReserve || inputReserve === 0n) {
      return 0n;
    }
    
    const optimalOutput = (inputAmount * outputReserve) / inputReserve;
    return optimalOutput;
  }, []);

  // Suggest optimal amount when one amount changes and pool exists
  useEffect(() => {
    if (!poolExists || !reserves.reserve0 || !reserves.reserve1 || isCheckingReserves) {
      return;
    }

    const { reserve0, reserve1, isTokenA0 } = reserves;
    
    const tokenAReserve = isTokenA0 ? reserve0 : reserve1;
    const tokenBReserve = isTokenA0 ? reserve1 : reserve0;

    if (parsedAmountA > 0n && tokenAReserve > 0n) {
      const suggestedB = calculateOptimalAmount(parsedAmountA, tokenAReserve, tokenBReserve);
      if (suggestedB > 0n) {
        const suggestedBFormatted = formatBalance(suggestedB, tokenB?.decimals || 18);
      }
    }

    if (parsedAmountB > 0n && tokenBReserve > 0n) {
      const suggestedA = calculateOptimalAmount(parsedAmountB, tokenBReserve, tokenAReserve);
      if (suggestedA > 0n) {
        const suggestedAFormatted = formatBalance(suggestedA, tokenA?.decimals || 18);
      }
    }
  }, [parsedAmountA, parsedAmountB, amountA, amountB, poolExists, reserves, isCheckingReserves, tokenA, tokenB, calculateOptimalAmount]);

  // ============ MANUAL ALLOWANCE CHECK (WITH NATIVE TOKEN FIX) ============
  const [allowanceA, setAllowanceA] = useState(null);
  const [allowanceB, setAllowanceB] = useState(null);
  const [isCheckingA, setIsCheckingA] = useState(false);
  const [isCheckingB, setIsCheckingB] = useState(false);

  const checkAllowanceManually = useCallback(async (token, isTokenA) => {
    if (!token || !address) {
      if (isTokenA) {
        setAllowanceA(0n);
        setIsCheckingA(false);
      } else {
        setAllowanceB(0n);
        setIsCheckingB(false);
      }
      return;
    }

    // CRITICAL FIX: Skip allowance check for native token
    if (isNativeToken(token)) {
      if (isTokenA) {
        setAllowanceA(ETHERS_CONSTANTS.MaxUint256);
        setIsCheckingA(false);
      } else {
        setAllowanceB(ETHERS_CONSTANTS.MaxUint256);
        setIsCheckingB(false);
      }
      return;
    }

    // Check if we have router address
    if (!ADDRESSES?.router) {
      console.error('Router address not available');
      return;
    }

    if (isTokenA) setIsCheckingA(true);
    else setIsCheckingB(true);

    try {
      const allowance = await publicClient.readContract({
        address: token.address,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [address, ADDRESSES.router],
      });

      if (isTokenA) {
        setAllowanceA(allowance);
        setIsCheckingA(false);
      } else {
        setAllowanceB(allowance);
        setIsCheckingB(false);
      }
    } catch (error) {
      console.error(`❌ Error checking allowance for ${token.symbol}:`, error);
      if (isTokenA) {
        setAllowanceA(0n);
        setIsCheckingA(false);
      } else {
        setAllowanceB(0n);
        setIsCheckingB(false);
      }
    }
  }, [address, publicClient, ADDRESSES, isNativeToken]);

  // Check allowance when token or amount changes
  useEffect(() => {
    if (tokenA && (tokenA !== prevTokenARef.current || amountA !== prevAmountARef.current)) {
      prevTokenARef.current = tokenA;
      prevAmountARef.current = amountA;
      checkAllowanceManually(tokenA, true);
    }
  }, [tokenA, amountA, checkAllowanceManually]);

  useEffect(() => {
    if (tokenB && (tokenB !== prevTokenBRef.current || amountB !== prevAmountBRef.current)) {
      prevTokenBRef.current = tokenB;
      prevAmountBRef.current = amountB;
      checkAllowanceManually(tokenB, false);
    }
  }, [tokenB, amountB, checkAllowanceManually]);

  // Check if allowances are sufficient
  const hasAllowanceA = useMemo(() => {
    if (!tokenA || isNativeToken(tokenA)) return true;
    if (!allowanceA || !parsedAmountA || parsedAmountA === 0n) return false;
    return allowanceA >= parsedAmountA;
  }, [tokenA, allowanceA, parsedAmountA, isNativeToken]);

  const hasAllowanceB = useMemo(() => {
    if (!tokenB || isNativeToken(tokenB)) return true;
    if (!allowanceB || !parsedAmountB || parsedAmountB === 0n) return false;
    return allowanceB >= parsedAmountB;
  }, [tokenB, allowanceB, parsedAmountB, isNativeToken]);

  // Check if amounts are in correct ratio for existing pool
  const checkAmountRatio = useCallback(() => {
    if (!poolExists || !reserves.reserve0 || !reserves.reserve1 || isCheckingReserves) {
      return { isValid: true, error: '' };
    }

    const { reserve0, reserve1, isTokenA0 } = reserves;
    const tokenAReserve = isTokenA0 ? reserve0 : reserve1;
    const tokenBReserve = isTokenA0 ? reserve1 : reserve0;

    if (tokenAReserve === 0n || tokenBReserve === 0n) {
      return { isValid: true, error: '' };
    }

    const ratio = (tokenAReserve * 1000000n) / tokenBReserve;
    const inputRatio = (parsedAmountA * 1000000n) / (parsedAmountB || 1n);

    const tolerance = 50000n;
    const lowerBound = ratio - (ratio * tolerance / 1000000n);
    const upperBound = ratio + (ratio * tolerance / 1000000n);

    if (inputRatio < lowerBound || inputRatio > upperBound) {
      const expectedB = (parsedAmountA * tokenBReserve) / tokenAReserve;
      
      return {
        isValid: false,
        error: `Amounts are not in the correct ratio. Expected: ${formatBalance(expectedB, tokenB?.decimals || 18)} ${tokenB?.symbol}`,
        expectedB,
      };
    }

    return { isValid: true, error: '' };
  }, [poolExists, reserves, isCheckingReserves, parsedAmountA, parsedAmountB, amountA, amountB, tokenA, tokenB]);

  // ============ HANDLE APPROVAL (EXACT AMOUNT, NOT UNLIMITED) ============
  const handleApprove = useCallback(async (token, amountToApprove) => {
    if (!token) {
      setError('Invalid token');
      return null;
    }

    // CRITICAL FIX: Cannot approve native token
    if (isNativeToken(token)) {
      setError(`Cannot approve native ${token.symbol}. Use wrapped version instead.`);
      return null;
    }

    if (!ADDRESSES?.router) {
      setError('Router address not available');
      return null;
    }

    if (!amountToApprove || amountToApprove <= 0n) {
      setError('Invalid approval amount');
      return null;
    }

    setError('');
    setApprovingToken(token);
    
    try {
      // Calculate gas for approval
      let gasLimit;
      try {
        gasLimit = await GasUtils.estimateWithRetry(
          publicClient,
          {
            address: token.address,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [ADDRESSES.router, amountToApprove],
            account: address,
          },
          chainId
        );
      } catch (estimateError) {
        gasLimit = gasConfig.baseGas.approve;
      }

      const gasToUse = GasUtils.calculateGas(gasLimit, chainId, 'approve');

      const hash = await writeContractAsync({
        address: token.address,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [ADDRESSES.router, amountToApprove],  // EXACT AMOUNT instead of MaxUint256
        gas: gasToUse,
      });

      setTxHash(hash);
      setShowTxModal(true);
      return hash;
    } catch (err) {
      console.error('❌ Approval error:', err);
      setError(err.message || 'Failed to approve token');
      setApprovingToken(null);
      return null;
    }
  }, [writeContractAsync, ADDRESSES, isNativeToken, publicClient, chainId, gasConfig, address]);

  // ============ UPDATED: HANDLE ADD LIQUIDITY WITH CHAIN-SPECIFIC GAS ============
  const handleAddLiquidity = useCallback(async () => {
    if (!ADDRESSES || !ADDRESSES.router || !ADDRESSES.factory) {
      setError('Contract addresses not configured for this network');
      return;
    }

    if (!address || !tokenA || !tokenB) {
      setError('Please connect wallet and select tokens');
      return;
    }

    // Prevent ETH-WETH pair (same asset)
    const isTokenAWETH = tokenA.address === ADDRESSES.weth;
    const isTokenBWETH = tokenB.address === ADDRESSES.weth;
    const isTokenAETH = isNativeToken(tokenA);
    const isTokenBETH = isNativeToken(tokenB);
    
    // Check if trying to create ETH-WETH pool
    if ((isTokenAETH && isTokenBWETH) || (isTokenBETH && isTokenAWETH)) {
      setError('Cannot create ETH-WETH pool. They are the same asset.');
      return;
    }

    // Check balances
    if (tokenABalance < parsedAmountA) {
      setError(`Insufficient ${tokenA.symbol} balance`);
      return;
    }
    
    if (tokenBBalance < parsedAmountB) {
      setError(`Insufficient ${tokenB.symbol} balance`);
      return;
    }

    // Double-check allowances (skip for native tokens)
    if (!isNativeToken(tokenA) && !hasAllowanceA) {
      setError(`Please approve ${tokenA.symbol} first`);
      return;
    }
    
    if (!isNativeToken(tokenB) && !hasAllowanceB) {
      setError(`Please approve ${tokenB.symbol} first`);
      return;
    }

    // Super-Secured Phase 3: Price Ratio Guard
    const validation = validateLiquidityAddition({
      amountA: parsedAmountA,
      amountB: parsedAmountB,
      reserveA: reserves[0],
      reserveB: reserves[1],
      slippage: slippage,
      deadline: deadlineMinutes,
      poolExists: poolExists,
      isNewPool: !poolExists
    });

    if (!validation.isValid) {
      setError(validation.message);
      return;
    }

    if (validation.warning) {
      // Use success state for non-blocking warnings
      console.warn('Security Warning:', validation.message);
    }

    setIsSubmitting(true);
    setError('');

    try {
      let gasLimit;
      let transactionConfig;
      
      try {
        if (isNativeInvolved) {
          const isTokenANative = isNativeToken(tokenA);
          const erc20Token = isTokenANative ? tokenB : tokenA;
          const nativeAmount = isTokenANative ? parsedAmountA : parsedAmountB;
          const erc20Amount = isTokenANative ? parsedAmountB : parsedAmountA;
          const erc20AmountMin = isTokenANative ? amountBMin : amountAMin;
          const nativeAmountMin = isTokenANative ? amountAMin : amountBMin;

          transactionConfig = {
            address: ADDRESSES.router,
            abi: ROUTER_ABI,
            functionName: 'addLiquidityETH',
            args: [
              erc20Token.address,
              erc20Amount,
              erc20AmountMin,
              nativeAmountMin,
              address,
              deadlineTimestamp
            ],
            value: nativeAmount,
            account: address,
          };

          // Super-Secured Phase 4: Pre-Transaction Simulation
          try {
            await publicClient.simulateContract(transactionConfig);
          } catch (simErr) {
            setError(`Security Alert: Simulation failed. ${simErr.message}. Transaction aborted for your safety.`);
            setIsSubmitting(false);
            return;
          }

          gasLimit = await GasUtils.estimateWithRetry(publicClient, transactionConfig, chainId);
        } else {
          transactionConfig = {
            address: ADDRESSES.router,
            abi: ROUTER_ABI,
            functionName: 'addLiquidity',
            args: [
              tokenA.address,
              tokenB.address,
              parsedAmountA,
              parsedAmountB,
              amountAMin,
              amountBMin,
              address,
              deadlineTimestamp
            ],
            account: address,
          };

          // Super-Secured Phase 4: Pre-Transaction Simulation
          try {
            await publicClient.simulateContract(transactionConfig);
          } catch (simErr) {
            setError(`Security Alert: Simulation failed. ${simErr.message}. Transaction aborted for your safety.`);
            setIsSubmitting(false);
            return;
          }

          gasLimit = await GasUtils.estimateWithRetry(publicClient, transactionConfig, chainId);
        }

        // Validate gas against network limits
        const gasValidation = gasHelpers.validateGasForNetwork(chainId, gasLimit);
        if (!gasValidation.valid) {
          setError(`Gas limit too high for ${gasConfig.name}: ${gasValidation.message}`);
          setIsSubmitting(false);
          return;
        }

        // Calculate final gas with network-specific buffer
        const operation = isNativeInvolved ? 'addLiquidityETH' : 'addLiquidity';
        const gasToUse = GasUtils.calculateGas(gasLimit, chainId, operation);

        // Execute transaction
        const hash = await writeContractAsync({
          ...transactionConfig,
          gas: gasToUse,
        });

        setTxHash(hash);
        setShowTxModal(true);
      } catch (err) {
        console.error('❌ Transaction preparation failed:', err);
        
        let errorMessage = err.message || err.details || 'Transaction failed';
        
        // Improved error handling with network-specific messages
        if (errorMessage.includes('INSUFFICIENT_A_AMOUNT') || errorMessage.includes('INSUFFICIENT_B_AMOUNT')) {
          errorMessage = poolExists 
            ? 'Amounts not in correct ratio for existing pool.' 
            : `Amounts too small for new pool on ${gasConfig.name}. Try increasing amounts.`;
        } else if (errorMessage.includes('TRANSFER_FROM_FAILED')) {
          errorMessage = 'Token transfer failed. Check allowance and balance.';
        } else if (errorMessage.includes('INSUFFICIENT_LIQUIDITY_MINTED')) {
          errorMessage = poolExists
            ? 'Amount too small for existing pool.'
            : `Amount too small for new pool on ${gasConfig.name}. Try increasing to at least 10.0 tokens each.`;
        } else if (errorMessage.includes('EXPIRED')) {
          errorMessage = 'Transaction expired. Increase deadline.';
        } else if (errorMessage.includes('INSUFFICIENT_OUTPUT_AMOUNT')) {
          errorMessage = 'Slippage too high. Try increasing slippage tolerance.';
        } else if (errorMessage.includes('INSUFFICIENT_LIQUIDITY')) {
          errorMessage = 'Insufficient liquidity in pool.';
        } else if (errorMessage.includes('INVALID_PATH')) {
          errorMessage = 'Invalid token pair.';
        } else if (errorMessage.includes('SafeERC20')) {
          errorMessage = 'Token approval or transfer failed.';
        } else if (errorMessage.includes('Pair: INSUFFICIENT_LIQUIDITY')) {
          errorMessage = 'Pool doesn\'t exist. Try creating it with a larger initial deposit.';
        } else if (errorMessage.includes('IDENTICAL_ADDRESSES')) {
          errorMessage = 'Cannot create pool with same tokens.';
        } else if (errorMessage.includes('gas')) {
          errorMessage = `Gas error on ${gasConfig.name}: ${errorMessage}. Try with lower amounts.`;
        }
        
        setError(errorMessage);
        setIsSubmitting(false);
        return;
      }
    } catch (err) {
      console.error('❌ Add liquidity error:', err);
      setError(err.message || 'Transaction failed');
      setIsSubmitting(false);
    }
  }, [
    address, tokenA, tokenB, amountA, amountB, parsedAmountA, parsedAmountB, 
    hasAllowanceA, hasAllowanceB, writeContractAsync, ADDRESSES,
    amountAMin, amountBMin, deadlineTimestamp, isNativeInvolved,
    publicClient, poolExists, checkAmountRatio, isNativeToken,
    tokenABalance, tokenBBalance, chainId, gasConfig
  ]);

  // ============ TRANSACTION MONITORING ============
  const { isLoading: isTxLoading, isSuccess: isTxSuccess, isError: isTxError } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  // Handle transaction completion (success or error)
  useEffect(() => {
    if ((isTxSuccess || isTxError) && txHash) {
      // Stop submitting state regardless of success/failure
      setIsSubmitting(false);
      
      const wasApproval = !!approvingToken;
      const approvedToken = approvingToken;
      
      if (isTxSuccess && wasApproval) {
        // Refresh allowance for the approved token
        if (approvedToken.address === tokenA?.address) {
          checkAllowanceManually(tokenA, true);
        }
        if (approvedToken.address === tokenB?.address) {
          checkAllowanceManually(tokenB, false);
        }
        
        // Clear approval state
        setApprovingToken(null);
      }
      
      // Always refresh balances on success
      if (isTxSuccess) {
        refreshTokenBalances();
        refreshBalances();
        
        // Only clear inputs for non-approval transactions (liquidity additions)
        if (!wasApproval) {
          setAmountA('');
          setAmountB('');
        }
      }
      
      // DO NOT clear txHash here – let modal stay open for manual close
    }
  }, [isTxSuccess, isTxError, txHash, approvingToken, tokenA, tokenB, refreshTokenBalances, refreshBalances, checkAllowanceManually]);

  // ============ UI HANDLERS ============
  const handleMainButton = useCallback(async () => {
    if (!isConnected) {
      setError('Connect wallet');
      return;
    }

    if (!tokenA || !tokenB) {
      setError('Select tokens');
      return;
    }

    // Prevent ETH-WETH pair
    const isTokenAWETH = tokenA.address === ADDRESSES?.weth;
    const isTokenBWETH = tokenB.address === ADDRESSES?.weth;
    const isTokenAETH = isNativeToken(tokenA);
    const isTokenBETH = isNativeToken(tokenB);
    
    if ((isTokenAETH && isTokenBWETH) || (isTokenBETH && isTokenAWETH)) {
      setError('Cannot create ETH-WETH pool. They are the same asset.');
      return;
    }

    if (!amountA || !amountB || parseFloat(amountA) <= 0 || parseFloat(amountB) <= 0) {
      setError('Enter amounts');
      return;
    }

    // Check balances
    if (tokenABalance < parsedAmountA) {
      setError(`Insufficient ${tokenA.symbol} balance`);
      return;
    }

    if (tokenBBalance < parsedAmountB) {
      setError(`Insufficient ${tokenB.symbol} balance`);
      return;
    }

    // Check which token needs approval (skip native tokens)
    const needsApproval = [];
    if (!isNativeToken(tokenA) && !hasAllowanceA) needsApproval.push(tokenA);
    if (!isNativeToken(tokenB) && !hasAllowanceB) needsApproval.push(tokenB);

    if (needsApproval.length > 0) {
      const tokenToApprove = needsApproval[0];
      // Determine exact amount to approve based on which token it is
      const amountToApprove = tokenToApprove.address === tokenA?.address ? parsedAmountA : parsedAmountB;
      await handleApprove(tokenToApprove, amountToApprove);
    } else {
      await handleAddLiquidity();
    }
  }, [isConnected, tokenA, tokenB, amountA, amountB, tokenABalance, tokenBBalance, parsedAmountA, parsedAmountB, hasAllowanceA, hasAllowanceB, handleApprove, handleAddLiquidity, ADDRESSES, isNativeToken]);

  // Get button text
  const getButtonText = useCallback(() => {
    if (!isConnected) return 'Connect Wallet';
    if (!tokenA || !tokenB) return 'Select Tokens';
    if (!amountA || !amountB || parseFloat(amountA) <= 0 || parseFloat(amountB) <= 0) {
      return 'Enter Amounts';
    }
    
    if (!isNativeToken(tokenA) && !hasAllowanceA) return `Approve ${tokenA.symbol}`;
    if (!isNativeToken(tokenB) && !hasAllowanceB) return `Approve ${tokenB.symbol}`;
    if (isSubmitting || approvingToken) return 'Confirming...';
    return poolExists ? 'Add Liquidity' : 'Create Pool';
  }, [isConnected, tokenA, tokenB, amountA, amountB, hasAllowanceA, hasAllowanceB, isSubmitting, approvingToken, poolExists, isNativeToken]);

  // Format address for display
  const formatAddress = (address) => {
    if (!address) return '';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  // Simple switch tokens
  const switchTokens = useCallback(() => {
    const tempToken = tokenA;
    const tempAmount = amountA;
    setTokenA(tokenB);
    setTokenB(tempToken);
    setAmountA(amountB);
    setAmountB(tempAmount);
  }, [tokenA, tokenB, amountA, amountB]);

  // Handle token select
  const handleTokenASelect = useCallback((token) => {
    if (tokenB) {
      // Prevent ETH-WETH pair
      const isTokenETH = isNativeToken(token);
      const isTokenWETH = token.address === ADDRESSES?.weth;
      const isTokenBETH = isNativeToken(tokenB);
      const isTokenBWETH = tokenB.address === ADDRESSES?.weth;
      
      if ((isTokenETH && isTokenBWETH) || (isTokenWETH && isTokenBETH)) {
        setError('Cannot select ETH and WETH together');
        return;
      }
      
      if (addressesEqual(token.address, tokenB.address)) {
        setTokenB(null);
        setAmountB('');
      }
    }
    setTokenA(token);
    setShowTokenAModal(false);
    setError('');
  }, [tokenB, ADDRESSES, isNativeToken]);

  const handleTokenBSelect = useCallback((token) => {
    if (tokenA) {
      // Prevent ETH-WETH pair
      const isTokenETH = isNativeToken(token);
      const isTokenWETH = token.address === ADDRESSES?.weth;
      const isTokenAETH = isNativeToken(tokenA);
      const isTokenAWETH = tokenA.address === ADDRESSES?.weth;
      
      if ((isTokenETH && isTokenAWETH) || (isTokenWETH && isTokenAETH)) {
        setError('Cannot select ETH and WETH together');
        return;
      }
      
      if (addressesEqual(token.address, tokenA.address)) {
        setTokenA(null);
        setAmountA('');
      }
    }
    setTokenB(token);
    setShowTokenBModal(false);
    setError('');
  }, [tokenA, ADDRESSES, isNativeToken]);

  // Handle max (with gas consideration for native token)
  const handleMaxA = useCallback(() => {
    if (tokenA && tokenABalance > 0n) {
      const balance = parseFloat(formattedBalanceA);
      // Leave some ETH for gas if it's native token
      const max = isNativeToken(tokenA) ? Math.max(0, balance - 0.01) : balance;
      setAmountA(max.toFixed(tokenA.decimals || 6));
    }
  }, [tokenA, tokenABalance, formattedBalanceA, isNativeToken]);

  const handleMaxB = useCallback(() => {
    if (tokenB && tokenBBalance > 0n) {
      const balance = parseFloat(formattedBalanceB);
      const max = isNativeToken(tokenB) ? Math.max(0, balance - 0.01) : balance;
      setAmountB(max.toFixed(tokenB.decimals || 6));
    }
  }, [tokenB, tokenBBalance, formattedBalanceB, isNativeToken]);

  // Suggest optimal amounts
  const handleSuggestAmounts = useCallback(() => {
    if (!poolExists || !reserves.reserve0 || !reserves.reserve1 || isCheckingReserves) {
      setError('Cannot suggest amounts: Pool data not available');
      return;
    }

    const { reserve0, reserve1, isTokenA0 } = reserves;
    const tokenAReserve = isTokenA0 ? reserve0 : reserve1;
    const tokenBReserve = isTokenA0 ? reserve1 : reserve0;

    if (parsedAmountA > 0n && tokenAReserve > 0n) {
      const suggestedB = (parsedAmountA * tokenBReserve) / tokenAReserve;
      if (suggestedB > 0n) {
        const suggestedBFormatted = formatBalance(suggestedB, tokenB?.decimals || 18);
        setAmountB(suggestedBFormatted);
      }
    } else if (parsedAmountB > 0n && tokenBReserve > 0n) {
      const suggestedA = (parsedAmountB * tokenAReserve) / tokenBReserve;
      if (suggestedA > 0n) {
        const suggestedAFormatted = formatBalance(suggestedA, tokenA?.decimals || 18);
        setAmountA(suggestedAFormatted);
      }
    } else {
      const baseAmount = parseUnits('0.01', 18);
      if (tokenAReserve > 0n && tokenBReserve > 0n) {
        const suggestedB = (baseAmount * tokenBReserve) / tokenAReserve;
        const suggestedAFormatted = formatBalance(baseAmount, tokenA?.decimals || 18);
        const suggestedBFormatted = formatBalance(suggestedB, tokenB?.decimals || 18);
        
        setAmountA(suggestedAFormatted);
        setAmountB(suggestedBFormatted);
      }
    }
  }, [poolExists, reserves, isCheckingReserves, parsedAmountA, parsedAmountB, tokenA, tokenB]);

  // Close modal (manual close)
  const closeModal = useCallback(() => {
    setShowTxModal(false);
    setTxHash(null);
    setIsSubmitting(false);    // Ensure submitting flag is cleared
    setApprovingToken(null);   // Clear any pending approval
  }, []);

  // Get modal info
  const getModalInfo = useCallback(() => {
    if (approvingToken) {
      return {
        title: `Approve ${approvingToken.symbol}`,
        description: `Approving ${approvingToken.symbol}...`,
        successMessage: `${approvingToken.symbol} approved!`,
        errorMessage: `Failed to approve ${approvingToken.symbol}`,
      };
    }
    return {
      title: poolExists ? 'Add Liquidity' : 'Create Pool',
      description: poolExists ? 'Adding liquidity...' : 'Creating pool...',
      successMessage: poolExists ? 'Liquidity added!' : 'Pool created!',
      errorMessage: poolExists ? 'Failed to add liquidity' : 'Failed to create pool',
    };
  }, [approvingToken, poolExists]);

  // Add network warning if not on LitVM
  const networkWarning = useMemo(() => {
    if (chainId && chainId !== 4441) {
      return (
        <div className={styles.networkWarning}>
          ⚠ You are not connected to LitVM Network (Chain ID: 4441). 
          Current chain ID: {chainId}. Switch to LitVM for proper functionality.
        </div>
      );
    }
    return null;
  }, [chainId]);

  return (
    <div className={styles.liquidity}>
      <h2>Add Liquidity</h2>

      {networkWarning}
      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.card}>
        {/* Token A */}
        <div className={styles.inputSection}>
          <TokenInput
            token={tokenA}
            amount={amountA}
            onAmountChange={setAmountA}
            onTokenSelect={() => setShowTokenAModal(true)}
            onMaxClick={handleMaxA}
            balance={formattedBalanceA}
            disabled={isSubmitting || approvingToken}
            showBalance={true}
          />
        </div>

        {/* Switch */}
        <div className={styles.switchWrapper}>
          <button 
            onClick={switchTokens}
            disabled={isSubmitting || approvingToken}
          >
            ↓↑
          </button>
        </div>

        {/* Token B */}
        <div className={styles.inputSection}>
          <TokenInput
            token={tokenB}
            amount={amountB}
            onAmountChange={setAmountB}
            onTokenSelect={() => setShowTokenBModal(true)}
            onMaxClick={handleMaxB}
            balance={formattedBalanceB}
            disabled={isSubmitting || approvingToken}
            showBalance={true}
          />
        </div>

        {/* Pool Info and Suggestions */}
        {poolExists && tokenA && tokenB && (
          <div className={styles.poolInfo}>
            <div className={styles.poolStatusRow}>
              <span>Pool Status:</span>
              <span className={styles.existingPool}>Existing Pool</span>
            </div>
            
            {reserves.reserve0 > 0n && reserves.reserve1 > 0n && !isCheckingReserves && (
              <>
                <div className={styles.reservesInfo}>
                  <div className={styles.reserveItem}>
                    <span>{tokenA.symbol} Reserve:</span>
                    <span>{formatBalance(reserves.isTokenA0 ? reserves.reserve0 : reserves.reserve1, tokenA.decimals)}</span>
                  </div>
                  <div className={styles.reserveItem}>
                    <span>{tokenB.symbol} Reserve:</span>
                    <span>{formatBalance(reserves.isTokenA0 ? reserves.reserve1 : reserves.reserve0, tokenB.decimals)}</span>
                  </div>
                </div>
                
                <button
                  onClick={handleSuggestAmounts}
                  disabled={isSubmitting || approvingToken || isCheckingReserves}
                  className={styles.suggestButton}
                >
                  Set Market Price
                </button>
                
                {parsedAmountA > 0n && parsedAmountB > 0n && (
                  <div className={styles.ratioCheck}>
                    {(() => {
                      const ratioCheck = checkAmountRatio();
                      if (!ratioCheck.isValid) {
                        return (
                          <div className={styles.ratioWarning}>
                            ⚠ Dear, it's necessary to set market price.
                          </div>
                        );
                      }
                      return (
                        <div className={styles.ratioOk}>
                          ✅ Amounts are in correct ratio
                        </div>
                      );
                    })()}
                  </div>
                )}
              </>
            )}
            
            {isCheckingReserves && (
              <div className={styles.loadingReserves}>
                🔄 Loading pool data...
              </div>
            )}
          </div>
        )}

        {!poolExists && tokenA && tokenB && (
          <div className={styles.poolInfo}>
            <div className={styles.poolStatusRow}>
              <span>Pool Status:</span>
              <span className={styles.newPool}>New Pool</span>
            </div>
            <div className={styles.newPoolInfo}>
              ⚠ You are creating a new pool. Make sure both amounts are reasonable.
              {chainId === 4441 && (
                <div className={styles.LitVMNote}>
                  <strong>LitVM Note:</strong> New pools require larger initial deposits (minimum 10.0 tokens each).
                </div>
              )}
            </div>
          </div>
        )}

        {/* Advanced Settings Dropdown */}
        <AdvancedSettings
          slippage={slippage}
          setSlippage={setSlippage}
          deadlineMinutes={deadlineMinutes}
          setDeadlineMinutes={setDeadlineMinutes}
          isSubmitting={isSubmitting}
          approvingToken={approvingToken}
          tokenA={tokenA}
          tokenB={tokenB}
          formattedBalanceA={formattedBalanceA}
          formattedBalanceB={formattedBalanceB}
          pairAddress={pairAddress}
          ETHERS_CONSTANTS={ETHERS_CONSTANTS}
          formattedAmountAMin={formattedAmountAMin}
          formattedAmountBMin={formattedAmountBMin}
          tokenABalance={tokenABalance}
          tokenBBalance={tokenBBalance}
          parsedAmountA={parsedAmountA}
          parsedAmountB={parsedAmountB}
        />

        {/* Allowance Status - DROPDOWN DESIGN */}
        {tokenA && tokenB && amountA && amountB && parseFloat(amountA) > 0 && parseFloat(amountB) > 0 && (
          <div className={styles.allowanceDropdown}>
            <div 
              className={`${styles.dropdownHeader} ${isAllowanceDropdownOpen ? styles.dropdownOpen : ''}`}
              onClick={() => setIsAllowanceDropdownOpen(!isAllowanceDropdownOpen)}
            >
              <div className={styles.dropdownHeaderContent}>
                <div className={styles.dropdownTitle}>
                  <span className={styles.dropdownIcon}>
                    {isAllowanceDropdownOpen ? '▼' : '▶'}
                  </span>
                  <span>Allowance Status</span>
                </div>
                <div className={styles.dropdownSummary}>
                  {/* Show summary of allowance status */}
                  {!isNativeToken(tokenA) && !isNativeToken(tokenB) ? (
                    <span className={`${styles.summaryBadge} ${hasAllowanceA && hasAllowanceB ? styles.approved : styles.needsApproval}`}>
                      {hasAllowanceA && hasAllowanceB ? '✅ All Approved' : '⚠ Needs Approval'}
                    </span>
                  ) : (
                    <span className={`${styles.summaryBadge} ${styles.approved}`}>
                      ✅ Checked
                    </span>
                  )}
                </div>
              </div>
            </div>
            
            {isAllowanceDropdownOpen && (
              <div className={styles.dropdownContent}>
                <div className={styles.allowanceItems}>
                  {/* Token A Allowance */}
                  {!isNativeToken(tokenA) && (
                    <div className={styles.allowanceItem}>
                      <div className={styles.tokenAllowanceInfo}>
                        <div className={styles.tokenInfo}>
                          <span className={styles.tokenSymbol}>{tokenA.symbol}</span>
                          <span className={styles.tokenAddress}>
                            ({tokenA.address ? formatAddress(tokenA.address) : 'N/A'})
                          </span>
                        </div>
                        <div className={styles.allowanceStatus}>
                          {isCheckingA ? (
                            <span className={styles.checkingStatus}>🔄 Checking...</span>
                          ) : hasAllowanceA ? (
                            <span className={styles.approvedStatus}>
                              ✅ Approved
                              <span className={styles.statusDetail}>
                                (Allowance: {formatBalance(allowanceA, tokenA.decimals)})
                              </span>
                            </span>
                          ) : (
                            <span className={styles.needsApprovalStatus}>
                              ⚠ Needs Approval
                              <span className={styles.statusDetail}>
                                (Allowance: {formatBalance(allowanceA, tokenA.decimals)} / Needed: {formatBalance(parsedAmountA, tokenA.decimals)})
                              </span>
                            </span>
                          )}
                        </div>
                      </div>
                      {!hasAllowanceA && !isCheckingA && (
                        <button
                          onClick={() => handleApprove(tokenA, parsedAmountA)}
                          disabled={isSubmitting || approvingToken}
                          className={styles.approveButton}
                        >
                          Approve {tokenA.symbol}
                        </button>
                      )}
                    </div>
                  )}
                  
                  {/* Token B Allowance */}
                  {!isNativeToken(tokenB) && (
                    <div className={styles.allowanceItem}>
                      <div className={styles.tokenAllowanceInfo}>
                        <div className={styles.tokenInfo}>
                          <span className={styles.tokenSymbol}>{tokenB.symbol}</span>
                          <span className={styles.tokenAddress}>
                            ({tokenB.address ? formatAddress(tokenB.address) : 'N/A'})
                          </span>
                        </div>
                        <div className={styles.allowanceStatus}>
                          {isCheckingB ? (
                            <span className={styles.checkingStatus}>🔄 Checking...</span>
                          ) : hasAllowanceB ? (
                            <span className={styles.approvedStatus}>
                              ✅ Approved
                              <span className={styles.statusDetail}>
                                (Allowance: {formatBalance(allowanceB, tokenB.decimals)})
                              </span>
                            </span>
                          ) : (
                            <span className={styles.needsApprovalStatus}>
                              ⚠ Needs Approval
                              <span className={styles.statusDetail}>
                                (Allowance: {formatBalance(allowanceB, tokenB.decimals)} / Needed: {formatBalance(parsedAmountB, tokenB.decimals)})
                              </span>
                            </span>
                          )}
                        </div>
                      </div>
                      {!hasAllowanceB && !isCheckingB && (
                        <button
                          onClick={() => handleApprove(tokenB, parsedAmountB)}
                          disabled={isSubmitting || approvingToken}
                          className={styles.approveButton}
                        >
                          Approve {tokenB.symbol}
                        </button>
                      )}
                    </div>
                  )}
                  
                  {/* Native Token Info */}
                  {(isNativeToken(tokenA) || isNativeToken(tokenB)) && (
                    <div className={styles.nativeTokenInfo}>
                      <div className={styles.nativeTokenHeader}>
                        <span className={styles.nativeIcon}>🌐</span>
                        <span>Native Token (ETH)</span>
                      </div>
                      <div className={styles.nativeTokenDetails}>
                        <div className={styles.nativeDetail}>
                          <span>Status:</span>
                          <span className={styles.autoApproved}>✅ Auto-approved (native token)</span>
                        </div>
                        <div className={styles.nativeDetail}>
                          <span>Note:</span>
                          <span>Native tokens don't require approval. They're sent directly with the transaction.</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                
                <div className={styles.allowanceActions}>
                  <button
                    onClick={() => {
                      if (tokenA) checkAllowanceManually(tokenA, true);
                      if (tokenB) checkAllowanceManually(tokenB, false);
                    }}
                    className={styles.recheckButton}
                    disabled={isCheckingA || isCheckingB || isSubmitting || approvingToken}
                  >
                    🔄 Re-check Allowances
                  </button>
                  <div className={styles.allowanceHelp}>
                    <span className={styles.helpIcon}>ℹ️</span>
                    <span>Allowance lets the router spend your tokens. Required once per token.</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Main Button */}
        <button
          onClick={handleMainButton}
          disabled={!isConnected || !tokenA || !tokenB || !amountA || !amountB || isSubmitting || approvingToken}
          className={`${styles.mainButton} ${(!hasAllowanceA || !hasAllowanceB) ? styles.approve : ''}`}
        >
          {getButtonText()}
        </button>
      </div>

      {/* Debug Info - Remove in production */}
      <div className={styles.debugInfo}>
        <details>
          <summary>Debug Info</summary>
          <pre>
            {safeStringify({
              chainId,
              network: gasConfig.name,
              tokenA: tokenA?.symbol,
              tokenB: tokenB?.symbol,
              tokenADecimals: tokenA?.decimals,
              tokenBDecimals: tokenB?.decimals,
              amountA: amountA,
              amountB: amountB,
              parsedAmountA: parsedAmountA?.toString(),
              parsedAmountB: parsedAmountB?.toString(),
              tokenABalance: tokenABalance?.toString(),
              tokenBBalance: tokenBBalance?.toString(),
              formattedBalanceA: formattedBalanceA,
              formattedBalanceB: formattedBalanceB,
              slippage: slippage + '%',
              deadline: deadlineMinutes + ' minutes',
              amountAMin: amountAMin?.toString(),
              amountBMin: amountBMin?.toString(),
              allowanceA: allowanceA?.toString(),
              allowanceB: allowanceB?.toString(),
              hasAllowanceA,
              hasAllowanceB,
              isCheckingA,
              isCheckingB,
              poolExists,
              isNativeInvolved,
              isTokenANative: isNativeToken(tokenA),
              isTokenBNative: isNativeToken(tokenB),
              pairAddress,
              tokenAAddress,
              tokenBAddress,
              reserves: {
                reserve0: reserves.reserve0?.toString(),
                reserve1: reserves.reserve1?.toString(),
                isTokenA0: reserves.isTokenA0,
              },
              isCheckingReserves,
              nativeBalance: nativeBalanceData?.value?.toString(),
              ADDRESSES: ADDRESSES ? {
                factory: ADDRESSES.factory,
                router: ADDRESSES.router,
                weth: ADDRESSES.weth,
              } : '❌ Undefined',
            })}
          </pre>
        </details>
      </div>

      {/* Modals */}
      {showTokenAModal && (
        <TokenSelectModal
          tokens={modalTokens}
          onSelect={handleTokenASelect}
          onClose={() => setShowTokenAModal(false)}
          selectedToken={tokenA}
          title="Choose first token"
          onImportToken={importToken}
        />
      )}

      {showTokenBModal && (
        <TokenSelectModal
          tokens={modalTokens}
          onSelect={handleTokenBSelect}
          onClose={() => setShowTokenBModal(false)}
          selectedToken={tokenB}
          title="Choose second token"
          onImportToken={importToken}
        />
      )}

      {showTxModal && txHash && (
        <TransactionModal
          transactionHash={txHash}
          onClose={closeModal}
          isLoading={isTxLoading}
          isSuccess={isTxSuccess}
          {...getModalInfo()}
        />
      )}
    </div>
  );
};

export default Liquidity;
