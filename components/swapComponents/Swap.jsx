'use client';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/router';
import { useAccount, useChainId, useReadContract, usePublicClient, useSwitchChain } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertCircle,
  Info,
  ChevronDown,
  X,
  Check,
  AlertTriangle,
  Loader2,
  ExternalLink,
  ChevronRight,
  Settings,
  RefreshCw,
  ArrowDown,
  Shield,
  CheckCircle,
  XCircle,
  Sparkles,
  Zap,
  Eye,
  EyeOff
} from 'lucide-react';
import { formatUnits, parseUnits, zeroAddress } from 'viem';

import SwapTransactionModal from './SwapTransactionModal';
import TokenInput from '../common/TokenInput';
import TokenSelectModal from '../common/TokenSelectModal';
import SwapActionButton from './SwapActionButton';
import SwapSkeleton from './SwapSkeleton';
import SwapHeader from './SwapHeader';
import ConfirmationModal from '../common/ConfirmationModal';
import RatesInfoDropdown from './RatesInfoDropdown';
import AdvancedFeaturesDropdown from './AdvancedFeaturesDropdown';

// Import hooks
import { useSwap } from '../../hooks/swap/useSwap';
import { useTokenBalance } from '../../hooks/swap/useTokenBalance';
import { useSwapSettings } from '../../hooks/swap/useSwapSettings';
import { useSwapQuote } from '../../hooks/swap/useSwapQuote';
import { useSwapButtonState } from '../../hooks/swap/useSwapButtonState';
import { useDiaOraclePrices } from '../../hooks/useDiaOraclePrices';

// Import constants
import { TOKEN_LIST } from '../../constants/tokens';
import { CONTRACT_ADDRESSES, getContractAddresses } from '../../constants/addresses';
import { FACTORY_ABI } from '../../constants/abis';

// Import utilities
import { formatNumber } from '../utils/price';
import { addressesEqual } from '../utils/ethers-safe';
import { validateSwapInputs, validatePriceImpact } from '../utils/validation';

// Import CSS Modules
import styles from './Swap.module.css';

// Import chains
import { GenLayer } from '../../wagmi.config';

// Minimal ERC20 ABI for fetching token info
const ERC20_ABI = [
  {
    "constant": true,
    "inputs": [],
    "name": "name",
    "outputs": [{"name": "", "type": "string"}],
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [],
    "name": "symbol",
    "outputs": [{"name": "", "type": "string"}],
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [],
    "name": "decimals",
    "outputs": [{"name": "", "type": "uint8"}],
    "type": "function"
  }
];

// Safe parseUnits function
const safeParseUnits = (value, decimals = 18) => {
  if (!value || value === '' || value === undefined || value === null) return 0n;
  const strValue = value.toString().trim();
  if (strValue === '') return 0n;
  try {
    const numValue = parseFloat(strValue);
    if (isNaN(numValue)) return 0n;
    if (numValue === 0) return 0n;
    const [integerPart, decimalPart = ''] = strValue.split('.');
    const cleanDecimalPart = decimalPart.slice(0, decimals);
    const cleanValue = decimalPart ? `${integerPart}.${cleanDecimalPart}` : integerPart;
    return parseUnits(cleanValue, decimals);
  } catch (error) {
    console.error('Error in safeParseUnits:', error, 'value:', value, 'decimals:', decimals);
    return 0n;
  }
};

// Safe formatUnits function
const safeFormatUnits = (value, decimals = 18) => {
  if (!value || value === 0n) return '0';
  try {
    return formatUnits(value, decimals);
  } catch (error) {
    console.error('Error in safeFormatUnits:', error);
    return '0';
  }
};

// Transaction Toast Component
const TransactionToast = ({
  status,
  onClose,
  autoDismiss = true,
  chainId
}) => {
  const [isVisible, setIsVisible] = useState(true);
  const [progress, setProgress] = useState(100);

  const getExplorerUrl = (hash) => {
    return `https://explorer-bradbury.genlayer.com/tx/${hash}`;
  };

  useEffect(() => {
    if (!autoDismiss || status.status === 'pending') return;
    const dismissDelay = status.status === 'success' ? 5000 : 8000;
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev <= 0) {
          clearInterval(interval);
          return 0;
        }
        return prev - (100 / (dismissDelay / 50));
      });
    }, 50);
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(() => onClose?.(), 300);
    }, dismissDelay);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [status.status, autoDismiss, onClose]);

  const getStatusConfig = () => {
    const baseConfig = {
      icon: <Info className="w-5 h-5" />,
      bgColor: 'bg-gray-800',
      borderColor: 'border-gray-700',
      textColor: 'text-gray-200',
      iconBg: 'bg-gray-700',
      iconColor: 'text-gray-400'
    };
    switch (status.status) {
      case 'pending':
        return {
          ...baseConfig,
          icon: <Loader2 className="w-5 h-5 animate-spin" />,
          title: status.title || 'Transaction Pending',
          message: status.message || 'Waiting for confirmation...',
          bgColor: 'bg-blue-900/30',
          borderColor: 'border-blue-800',
          iconBg: 'bg-blue-800',
          iconColor: 'text-blue-400'
        };
      case 'success':
        return {
          ...baseConfig,
          icon: <Check className="w-5 h-5" />,
          title: status.title || 'Transaction Successful',
          message: status.message || 'Transaction completed successfully!',
          bgColor: 'bg-green-900/30',
          borderColor: 'border-green-800',
          iconBg: 'bg-green-800',
          iconColor: 'text-green-400'
        };
      case 'error':
        return {
          ...baseConfig,
          icon: <X className="w-5 h-5" />,
          title: status.title || 'Transaction Failed',
          message: status.message || 'Transaction failed. Please try again.',
          bgColor: 'bg-red-900/30',
          borderColor: 'border-red-800',
          iconBg: 'bg-red-800',
          iconColor: 'text-red-400'
        };
      case 'rejected':
        return {
          ...baseConfig,
          icon: <AlertTriangle className="w-5 h-5" />,
          title: status.title || 'Transaction Rejected',
          message: status.message || 'You rejected the transaction in your wallet.',
          bgColor: 'bg-yellow-900/30',
          borderColor: 'border-yellow-800',
          iconBg: 'bg-yellow-800',
          iconColor: 'text-yellow-400'
        };
      default:
        return {
          ...baseConfig,
          title: status.title || 'Transaction',
          message: status.message || 'Processing...'
        };
    }
  };

  const config = getStatusConfig();
  const handleClose = () => {
    setIsVisible(false);
    setTimeout(() => onClose?.(), 300);
  };
  const formatHash = (hash) => {
    if (!hash) return '';
    return `${hash.substring(0, 6)}...${hash.substring(hash.length - 4)}`;
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, x: 300 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 300 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed top-4 right-4 z-50 w-96"
        >
          <div className={`${config.bgColor} border ${config.borderColor} rounded-xl shadow-xl overflow-hidden`}>
            <div className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-3">
                  <div className={`${config.iconBg} ${config.iconColor} p-2 rounded-lg`}>
                    {config.icon}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-white">{config.title}</h3>
                    <p className="text-sm text-gray-300 mt-1">{config.message}</p>
                    {status.txHash && (
                      <div className="mt-3">
                        <a
                          href={getExplorerUrl(status.txHash)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center text-sm text-blue-400 hover:text-blue-300"
                        >
                          {formatHash(status.txHash)}
                          <ExternalLink className="w-3 h-3 ml-1" />
                        </a>
                      </div>
                    )}
                  </div>
                </div>
                <button onClick={handleClose} className="text-gray-400 hover:text-white ml-2">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            {autoDismiss && status.status !== 'pending' && (
              <div className="h-1 bg-gray-800 overflow-hidden">
                <motion.div
                  initial={{ width: '100%' }}
                  animate={{ width: `${progress}%` }}
                  className={`h-full ${
                    status.status === 'success' ? 'bg-green-500' :
                    status.status === 'error' ? 'bg-red-500' :
                    status.status === 'rejected' ? 'bg-yellow-500' : 'bg-gray-500'
                  }`}
                />
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const Swap = ({ referrerAddress, referrerFeeBps = 0n, initialFromToken, initialToToken, isFirstBuy = false }) => {
  const router = useRouter();
  const { from, to } = router.query || {};
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { openConnectModal } = useConnectModal();
  const { switchChain } = useSwitchChain();

  const [showFromModal, setShowFromModal] = useState(false);
  const [showToModal, setShowToModal] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [confirmationData, setConfirmationData] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState(null);
  const hasSetDefaultTokens = useRef(false);
  const [pairAddress, setPairAddress] = useState(null);

  // Custom tokens state
  const [customTokens, setCustomTokens] = useState([]);
  const [isLoadingCustomToken, setIsLoadingCustomToken] = useState(false);

  // Transaction history state
  const [transactionHistory, setTransactionHistory] = useState([]);

  // Add state for showing/hiding details
  const [showSwapDetails, setShowSwapDetails] = useState(true);
  const [rotation, setRotation] = useState(0);

  // Get current chain info
  const isGenLayer = !chainId || chainId === GenLayer.id || chainId === 4221;
  const isCorrectNetwork = isGenLayer;

  // Get contract addresses for current chain
  const currentAddresses = useMemo(() => {
    return CONTRACT_ADDRESSES[4221];
  }, []);

  // Get token list for current chain
  const currentTokenList = useMemo(() => {
    return TOKEN_LIST[4221] || [];
  }, []);

  // Resolve initial tokens from query parameters (by symbol or contract address)
  const initialFromTokenResolved = useMemo(() => {
    if (from && currentTokenList.length > 0) {
      const found = currentTokenList.find(
        (t) =>
          t.symbol.toLowerCase() === from.toLowerCase() ||
          t.address.toLowerCase() === from.toLowerCase()
      );
      if (found) return found;
    }
    return initialFromToken;
  }, [from, currentTokenList, initialFromToken]);

  const initialToTokenResolved = useMemo(() => {
    if (to && currentTokenList.length > 0) {
      const found = currentTokenList.find(
        (t) =>
          t.symbol.toLowerCase() === to.toLowerCase() ||
          t.address.toLowerCase() === to.toLowerCase()
      );
      if (found) return found;
    }
    return initialToToken;
  }, [to, currentTokenList, initialToToken]);

  // Settings hook
  const {
    settings,
    updateSlippage,
    updateDeadline
  } = useSwapSettings();
  // Swap quote hook
  const {
    fromToken,
    toToken,
    fromAmount,
    toAmount,
    setFromToken,
    setToToken,
    setFromAmount,
    setToAmount,
    switchTokens,
    priceImpact,
    exchangeRate,
    minReceived,
    isLoading: quoteLoading,
    error: quoteError,
    refreshQuote,
    quoteData,
    networkFeeFormatted,
  } = useSwapQuote({
    ...settings,
    chainId,
    referrerFeeBps
  });

  // Determine if active trade is initial buy on fresh bonding curve with no prior liquidity
  const isFirstBuyActive = useMemo(() => {
    if (!toToken) return false;
    // Exclude tokens that already have established liquidity, oracle feeds, or graduation
    if (toToken.hasOraclePrice || toToken.isBaseToken || toToken.isNative) return false;
    if (toToken.isVerified) return false;
    const sym = (toToken.symbol || '').toUpperCase();
    if (sym === 'WZKLTC' || sym === 'ZKLTC' || sym === 'LITVMSWAP' || sym === 'LXRP' || sym === 'BRBNB' || sym === 'ZKUSDC' || sym === 'ZKUSDT' || sym === 'ZKBTC' || sym === 'LETH' || sym === 'WETH') return false;
    if (toToken.address && toToken.address.toLowerCase() === '0x315374aa9b5536037cc1efeea2439ccc0913a77e') return false;
    if (toToken.isGraduated || (toToken.bondingCurveProgress && toToken.bondingCurveProgress > 0)) return false;
    if (toToken.liquidityUSD && toToken.liquidityUSD > 0) return false;

    // Only active if explicitly flagged as isFirstBuy OR if it is a verified Doppler token with 0% progress, not graduated, and 0 pool liquidity
    if (isFirstBuy) return true;
    if (toToken.isDoppler && toToken.bondingCurveProgress === 0 && !toToken.isGraduated && (!toToken.liquidityUSD || toToken.liquidityUSD === 0)) return true;
    return false;
  }, [isFirstBuy, toToken]);

  // Swap execution hook
  const {
    executeSwap,
    approveToken,
    needsApproval,
    isApproving,
    isSwapping,
    transactionStatus,
    resetTransactionStatus,
    wrapETH,
    unwrapWETH,
    checkApproval,
    refetchAllowance,
    isCheckingAllowance,
  } = useSwap({
    fromToken,
    toToken,
    fromAmount,
    toAmount,
    slippage: settings.slippage,
    chainId,
    route: quoteData,
    userAddress: address,
    referrerAddress,
    referrerFeeBps
  });

  // Token balance hook
  const {
    ethBalance,
    fromTokenBalance,
    toTokenBalance,
    refetchBalances,
    getFormattedBalance
  } = useTokenBalance(address, fromToken, toToken, customTokens);

  // DIA Oracle Prices hook for USD estimates
  const tokenSymbols = useMemo(() => [fromToken?.symbol, toToken?.symbol].filter(Boolean), [fromToken, toToken]);
  const { getTokenPrice } = useDiaOraclePrices(tokenSymbols);

  const { fromTokenPrice, toTokenPrice, fromValueUSD, toValueUSD } = useMemo(() => {
    let fromPrice = getTokenPrice(fromToken?.symbol)?.priceUSD || 0;
    let toPrice = getTokenPrice(toToken?.symbol)?.priceUSD || 0;

    // Derived price calculations if one of them is missing oracle pricing
    if (exchangeRate && exchangeRate > 0) {
      if (fromPrice > 0 && toPrice === 0) {
        toPrice = fromPrice / exchangeRate;
      } else if (toPrice > 0 && fromPrice === 0) {
        fromPrice = toPrice * exchangeRate;
      }
    }

    const fromVal = fromAmount && parseFloat(fromAmount) > 0 ? (parseFloat(fromAmount) * fromPrice) : 0;
    const toVal = toAmount && parseFloat(toAmount) > 0 ? (parseFloat(toAmount) * toPrice) : 0;

    return {
      fromTokenPrice: fromPrice,
      toTokenPrice: toPrice,
      fromValueUSD: fromVal,
      toValueUSD: toVal
    };
  }, [fromToken, toToken, fromAmount, toAmount, exchangeRate, getTokenPrice]);

  const formatUSD = useCallback((value) => {
    if (!value || value === 0) return '$0.00';
    if (value < 0.01) {
      return `$${value.toFixed(6)}`;
    }
    return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }, []);

  const formatUnitPrice = useCallback((price) => {
    if (!price || price === 0) return '';
    if (price < 0.01) {
      return `$${price.toFixed(6)}`;
    }
    return `$${price.toFixed(2)}`;
  }, []);

  // Load custom tokens from localStorage on mount
  useEffect(() => {
    if (!isCorrectNetwork) return;
    try {
      const stored = localStorage.getItem(`custom_tokens_${chainId}_${address || 'guest'}`);
      if (stored) {
        setCustomTokens(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Error loading custom tokens:', error);
    }
  }, [address, chainId, isCorrectNetwork]);

  // Save custom tokens to localStorage
  useEffect(() => {
    if (!isCorrectNetwork || customTokens.length === 0) return;
    try {
      localStorage.setItem(
        `custom_tokens_${chainId}_${address || 'guest'}`,
        JSON.stringify(customTokens)
      );
    } catch (error) {
      console.error('Error saving custom tokens:', error);
    }
  }, [customTokens, address, chainId, isCorrectNetwork]);

  // Load showSwapDetails preference
  useEffect(() => {
    const savedPreference = localStorage.getItem('swap_show_details');
    if (savedPreference !== null) {
      setShowSwapDetails(savedPreference === 'true');
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('swap_show_details', showSwapDetails.toString());
  }, [showSwapDetails]);

  // Add successful transactions to history
  useEffect(() => {
    if (transactionStatus.show &&
        (transactionStatus.status === 'success' || transactionStatus.status === 'error')) {
      const newHistory = {
        ...transactionStatus,
        timestamp: Date.now(),
        type: transactionStatus.type || 'swap',
        fromToken: fromToken?.symbol,
        toToken: toToken?.symbol,
        fromAmount,
        toAmount,
        chainId
      };
      setTransactionHistory(prev => [newHistory, ...prev.slice(0, 49)]);
    }
  }, [transactionStatus, fromToken, toToken, fromAmount, toAmount, chainId]);

  // Helper function to import a custom token
  const handleImportToken = async (tokenAddress) => {
    if (!publicClient) {
      throw new Error('Wallet not connected');
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(tokenAddress)) {
      throw new Error('Invalid token address format');
    }
    const normalizedAddress = tokenAddress.toLowerCase();
    if (customTokens.some(token => token.address === normalizedAddress)) {
      throw new Error('Token already imported');
    }
    const existingToken = currentTokenList.find(
      token => token.address.toLowerCase() === normalizedAddress
    );
    if (existingToken) {
      throw new Error('Token is already in the default list');
    }
    setIsLoadingCustomToken(true);
    try {
      const [name, symbol, decimals] = await Promise.all([
        publicClient.readContract({
          address: normalizedAddress,
          abi: ERC20_ABI,
          functionName: 'name'
        }).catch(() => 'Unknown Token'),
        publicClient.readContract({
          address: normalizedAddress,
          abi: ERC20_ABI,
          functionName: 'symbol'
        }).catch(() => 'UNKNOWN'),
        publicClient.readContract({
          address: normalizedAddress,
          abi: ERC20_ABI,
          functionName: 'decimals'
        }).catch(() => 18)
      ]);
      const newToken = {
        address: normalizedAddress,
        name: name || 'Unknown Token',
        symbol: symbol || 'UNKNOWN',
        decimals: Number(decimals) || 18,
        logoURI: `https://ui-avatars.com/api/?name=${symbol || 'TKN'}&background=random&color=fff&size=128`,
        isCustom: true,
        isVerified: false,
        isPopular: false,
        chainId
      };
      setCustomTokens(prev => [...prev, newToken]);
      return newToken;
    } catch (error) {
      console.error('Error importing token:', error);
      throw new Error('Failed to fetch token information');
    } finally {
      setIsLoadingCustomToken(false);
    }
  };

  // Helper function to get pool address
  const getPoolAddress = useCallback((tokenA, tokenB) => {
    if (!tokenA || !tokenB || !tokenA.address || !tokenB.address) return null;
    const tokenAAddress = tokenA.isNative ? currentAddresses.weth : tokenA.address;
    const tokenBAddress = tokenB.isNative ? currentAddresses.weth : tokenB.address;
    const addresses = [tokenAAddress, tokenBAddress].sort((a, b) => {
      return a.toLowerCase() < b.toLowerCase() ? -1 : 1;
    });
    return addresses;
  }, [currentAddresses]);

  // Get pool address when tokens are selected
  const poolArgs = useMemo(() => {
    if (!fromToken || !toToken || !fromToken.address || !toToken.address) return undefined;
    return getPoolAddress(fromToken, toToken);
  }, [fromToken, toToken, getPoolAddress]);

  // Check if pool exists
  const { data: poolAddressData } = useReadContract({
    address: currentAddresses?.factory,
    abi: FACTORY_ABI,
    functionName: 'getPair',
    args: poolArgs,
    query: {
      enabled: !!poolArgs &&
              poolArgs[0] &&
              poolArgs[1] &&
              currentAddresses?.factory &&
              currentAddresses.factory !== zeroAddress,
    }
  });

  useEffect(() => {
    if (poolAddressData && poolAddressData !== zeroAddress) {
      setPairAddress(poolAddressData);
    } else {
      setPairAddress(null);
    }
  }, [poolAddressData]);

  useEffect(() => {
    if (error) {
      setError(null);
    }
  }, [fromToken, toToken, fromAmount, toAmount]);

  // Set default tokens once route is ready and list is loaded
  useEffect(() => {
    if (!router.isReady || currentTokenList.length === 0) return;

    if (!hasSetDefaultTokens.current) {
      if (initialFromTokenResolved) {
        setFromToken(initialFromTokenResolved);
      } else if (!fromToken) {
        const nativeToken = currentTokenList.find(t => t.isNative);
        if (nativeToken) setFromToken(nativeToken);
      }
      
      if (initialToTokenResolved) {
        setToToken(initialToTokenResolved);
      } else if (!toToken) {
        const defaultToken = currentTokenList.find(t => !t.isNative && t.symbol !== 'WETH');
        if (defaultToken) setToToken(defaultToken);
      }
      hasSetDefaultTokens.current = true;
    }
  }, [router.isReady, currentTokenList, initialFromTokenResolved, initialToTokenResolved, fromToken, toToken]);

  // React to initialToToken prop updates (e.g. from trade page)
  useEffect(() => {
    if (initialToToken && (!toToken || toToken.address?.toLowerCase() !== initialToToken.address?.toLowerCase())) {
      setToToken(initialToToken);
    }
  }, [initialToToken, toToken]);

  useEffect(() => {
    if (initialFromToken && (!fromToken || fromToken.address?.toLowerCase() !== initialFromToken.address?.toLowerCase())) {
      setFromToken(initialFromToken);
    }
  }, [initialFromToken, fromToken]);

  // Sync selected tokens to URL query parameters dynamically (only on standalone swap page)
  useEffect(() => {
    if (!router.isReady) return;
    if (router.pathname !== '/swap') return;
    
    const query = { ...router.query };
    
    let changed = false;
    if (fromToken && query.from !== fromToken.symbol) {
      query.from = fromToken.symbol;
      changed = true;
    }
    if (toToken && query.to !== toToken.symbol) {
      query.to = toToken.symbol;
      changed = true;
    }

    if (changed) {
      router.replace(
        {
          pathname: router.pathname,
          query,
        },
        undefined,
        { shallow: true }
      );
    }
  }, [fromToken, toToken, router.isReady, router.pathname]);

  const combinedError = error;
  const hasLiquidity = true;

  // Button state management
  const buttonStateResult = useSwapButtonState({
    fromToken,
    toToken,
    fromAmount,
    toAmount,
    fromTokenBalance,
    toTokenBalance,
    ethBalance,
    quoteData,
    isLoadingQuote: quoteLoading,
    isApproving,
    isSwapping,
    needsApproval,
    hasError: !!combinedError,
    priceImpact,
    slippage: settings.slippage,
    network: 'GenLayer Testnet',
    isConnected,
    isCorrectNetwork,
    chainId: 4221,
  });

  const buttonState = !isConnected ? {
    state: 'connect_wallet',
    isDisabled: false,
    tooltip: 'Connect your wallet to swap tokens'
  } : buttonStateResult;

  const isTransactionInProgress = isApproving || isSwapping || isCheckingAllowance;
  const isInputDisabled = isTransactionInProgress || !fromToken || !isCorrectNetwork;
  const isLoading = quoteLoading || isTransactionInProgress || isLoadingCustomToken;

  // Get token balance for display
  const getTokenBalance = useCallback((token) => {
    if (!token) return '--';
    if (!address) return '--';
    if (token.isNative) {
      return ethBalance ? safeFormatUnits(ethBalance, 18) : '0';
    }
    if (fromToken && token.address && addressesEqual(token.address, fromToken.address)) {
      return fromTokenBalance
        ? safeFormatUnits(fromTokenBalance, token.decimals)
        : '0';
    }
    if (toToken && token.address && addressesEqual(token.address, toToken.address)) {
      return toTokenBalance
        ? safeFormatUnits(toTokenBalance, token.decimals)
        : '0';
    }
    return '0';
  }, [address, ethBalance, fromToken, fromTokenBalance, toToken, toTokenBalance]);

  // Available tokens - combine predefined and custom
  const tokens = useMemo(() => {
    try {
      const nativeToken = currentTokenList.find(t => t.isNative);
      if (!nativeToken) return [];
      const baseTokens = [{
        ...nativeToken,
        balance: getFormattedBalance(nativeToken)
      }];
      const enhancedTokens = currentTokenList
        .filter(token => !token.isNative)
        .map(token => ({
          ...token,
          balance: getFormattedBalance(token),
          isPopular: ['ZKUSDC', 'wzkLTC', 'ZKUSDT', 'ZKBTC', 'LETH', 'AURA', 'CLINIC'].includes(token.symbol),
          isCustom: false,
          isVerified: true
        }));
      const enhancedCustomTokens = customTokens.map(token => ({
        ...token,
        balance: getFormattedBalance(token),
        isCustom: true,
        isVerified: false
      }));
      return [...baseTokens, ...enhancedTokens, ...enhancedCustomTokens];
    } catch (error) {
      console.error('Error creating tokens list:', error);
      return [];
    }
  }, [currentTokenList, customTokens, getFormattedBalance]);

  // Format amount for display
  const formatDisplayAmount = useCallback((amount) => {
    if (!amount || amount === '') return '';
    try {
      const numAmount = parseFloat(amount);
      if (isNaN(numAmount)) return '';
      if (numAmount > 1000000) {
        return `${(numAmount / 1000000).toFixed(4)}M`;
      } else if (numAmount > 1000) {
        return `${(numAmount / 1000).toFixed(4)}K`;
      } else if (numAmount < 0.000001) {
        return numAmount.toExponential(4);
      } else {
        return numAmount.toFixed(6);
      }
    } catch (error) {
      console.error('Error formatting amount:', error);
      return amount;
    }
  }, []);

  // Handle token selection
  const handleFromTokenSelect = (token) => {
    if (toToken && addressesEqual(token.address, toToken.address)) {
      switchTokens();
    } else {
      setFromToken(token);
    }
    setShowFromModal(false);
  };

  const handleToTokenSelect = (token) => {
    if (fromToken && addressesEqual(token.address, fromToken.address)) {
      switchTokens();
    } else {
      setToToken(token);
    }
    setShowToModal(false);
  };

  // Handle max amount
  const handleMaxClick = () => {
    if (!fromToken) return;
    if (!address) {
      setFromAmount('1.0');
      return;
    }
    try {
      let balance = '0';
      if (fromToken.isNative) {
        balance = ethBalance ? safeFormatUnits(ethBalance, 18) : '0';
      } else if (fromTokenBalance && fromToken.decimals) {
        balance = safeFormatUnits(fromTokenBalance, fromToken.decimals);
      }
      const balanceNum = parseFloat(balance);
      if (balanceNum > 0) {
        if (fromToken.isNative) {
          // Reserve 0.005 zkLTC to cover network gas fees on native token swaps
          const maxAmount = Math.max(0, balanceNum - 0.005);
          setFromAmount(maxAmount > 0 ? maxAmount.toFixed(6) : '0');
        } else {
          // Set 100% of ERC20 token balance
          setFromAmount(balance);
        }
      } else {
        setFromAmount('0');
      }
    } catch (error) {
      console.error('Error in handleMaxClick:', error);
      setError('Failed to calculate max amount');
      setFromAmount('0');
    }
  };

  // Validate inputs
  const validateInputs = useCallback(() => {
    try {
      if (!fromAmount || fromAmount === '' || parseFloat(fromAmount) <= 0) {
        setError('Please enter a valid amount');
        return false;
      }
      if (!address) {
        return true;
      }
      const validation = validateSwapInputs({
        fromToken,
        toToken,
        fromAmount,
        toAmount,
        isConnected,
        isCorrectNetwork,
        fromTokenBalance: fromToken?.isNative ? ethBalance : fromTokenBalance,
        fromTokenDecimals: fromToken?.decimals || 18,
        toTokenDecimals: toToken?.decimals || 18,
        minAmountOut: minReceived,
        slippage: settings.slippage,
      });
      if (!validation.isValid) {
        if (validation.warning) {
          console.warn('Validation warning:', validation.message);
          return true;
        }
        setError(validation.message);
        return false;
      }
      if (isFirstBuyActive && fromToken?.isNative && parseFloat(fromAmount) > 0.005) {
        setError('First buy on a new launch is limited to max 0.005 zkLTC');
        return false;
      }
      if (priceImpact !== undefined) {
        const priceImpactValidation = validatePriceImpact(priceImpact);
        if (priceImpactValidation.severity === 'critical') {
          setError(priceImpactValidation.message);
          return false;
        }
      }
      return true;
    } catch (error) {
      console.error('Validation error:', error);
      return true;
    }
  }, [fromToken, toToken, fromAmount, toAmount, address, isConnected, isCorrectNetwork, ethBalance, fromTokenBalance, minReceived, settings.slippage, priceImpact]);

  // Get formatted balance for display
  const getDisplayBalance = useCallback((token) => {
    if (!token) return '--';
    if (!address) return '--';
    if (token.isNative) {
      return ethBalance ? safeFormatUnits(ethBalance, 18) : '0';
    }
    if (token.address && fromToken && token.address === fromToken.address && fromTokenBalance) {
      return safeFormatUnits(fromTokenBalance, token.decimals);
    }
    if (token.address && toToken && token.address === toToken.address && toTokenBalance) {
      return safeFormatUnits(toTokenBalance, token.decimals);
    }
    return '0';
  }, [address, fromToken, toToken, fromTokenBalance, toTokenBalance, ethBalance]);

  const formatSelectorBalance = useCallback((token) => {
    const balance = getDisplayBalance(token);
    const numeric = parseFloat(balance);

    if (!Number.isFinite(numeric) || numeric <= 0) return '0.0000';
    if (numeric >= 1000000) return `${(numeric / 1000000).toFixed(2)}M`;
    if (numeric >= 1000) return `${(numeric / 1000).toFixed(2)}K`;
    if (numeric >= 1) return numeric.toFixed(4);
    if (numeric >= 0.0001) return numeric.toFixed(6);
    return numeric.toExponential(2);
  }, [getDisplayBalance]);

  // Format min received
  const formatMinReceived = useCallback(() => {
    if (!minReceived || !toToken) return '-';
    try {
      const minNum = parseFloat(minReceived);
      if (isNaN(minNum) || minNum <= 0) return '-';
      if (minNum > 1000000) {
        return `${(minNum / 1000000).toFixed(2)}M`;
      } else if (minNum > 1000) {
        return `${(minNum / 1000).toFixed(2)}K`;
      } else if (minNum < 0.001) {
        return minNum.toExponential(2);
      } else {
        return formatNumber(minNum);
      }
    } catch (error) {
      console.error('Error formatting min received:', error);
      return minReceived;
    }
  }, [minReceived, toToken]);

  // Handle from amount change
  const handleFromAmountChange = (value) => {
    if (value === '' || /^[0-9]*\.?[0-9]*$/.test(value)) {
      if (value === '') {
        setFromAmount('');
        return;
      }
      if (value === '0') {
        setFromAmount('0');
        return;
      }
      if (value === '.') {
        setFromAmount('0.');
        return;
      }
      if (value.startsWith('00') && !value.startsWith('0.')) {
        const normalized = value.replace(/^0+/, '') || '0';
        setFromAmount(normalized);
        return;
      }
      setFromAmount(value);
    }
  };

  // Handle button click
  const handleButtonClick = useCallback(async () => {
    try {
      const { state } = buttonState;
      console.log('Button clicked with state:', state);
      setError(null);
      if (state === 'connect_wallet' || state === 'disconnect') {
        openConnectModal?.();
        return;
      }
      if (state === 'wrong_network') {
        switchChain?.({ chainId: GenLayer.id });
        return;
      }
      if (!validateInputs()) {
        return;
      }
      switch (state) {
        case 'disconnect':
          openConnectModal?.();
          break;
        case 'wrong_network':
          switchChain?.({ chainId: GenLayer.id });
          break;
        case 'wrap':
          await wrapETH();
          break;
        case 'unwrap':
          await unwrapWETH();
          break;
        case 'approve':
          await approveToken();
          break;
        case 'swap':
        case 'high_price_impact':
          await executeSwap();
          break;
        default:
          console.log('Button state:', state);
      }
    } catch (error) {
      console.error('Error in handleButtonClick:', error);
    }
  }, [buttonState, validateInputs, wrapETH, unwrapWETH, approveToken, executeSwap, openConnectModal, switchChain]);

  // Confirm swap
  const confirmSwap = useCallback(async () => {
    try {
      setShowConfirmation(false);
      await executeSwap();
    } catch (error) {
      console.error('Swap failed:', error);
    }
  }, [executeSwap]);

  // Clear transaction history
  const clearTransactionHistory = () => {
    setTransactionHistory([]);
  };

  // Handle refresh
  const handleRefresh = () => {
    if (address) {
      refetchBalances();
    }
    refreshQuote();
    if (refetchAllowance) refetchAllowance();
    if (checkApproval) checkApproval();
    setError(null);
  };

  // Calculate total portfolio value (simplified)
  const totalPortfolioValue = useMemo(() => {
    return "1,245.67";
  }, []);

  // Debug info
  const debugInfo = useMemo(() => ({
    chainId,
    isGenLayer,
    isConnected,
    fromToken: fromToken?.symbol,
    toToken: toToken?.symbol,
    fromAmount,
    toAmount,
    buttonState: buttonState.state,
    needsApproval,
    pairAddress: pairAddress ? `${pairAddress.substring(0, 6)}...${pairAddress.substring(pairAddress.length - 4)}` : 'none',
    currentAddresses: currentAddresses ? {
      factory: currentAddresses.factory,
      router: currentAddresses.router,
      weth: currentAddresses.weth
    } : 'none'
  }), [chainId, isGenLayer, isConnected, fromToken, toToken, fromAmount, toAmount, buttonState.state, needsApproval, pairAddress, currentAddresses]);

  useEffect(() => {
    console.log('Swap debug info:', debugInfo);
  }, [debugInfo]);

  // Calculate exchange rate for display
  const calculatedExchangeRate = useMemo(() => {
    if (!fromAmount || !toAmount || parseFloat(fromAmount) <= 0 || parseFloat(toAmount) <= 0) {
      return null;
    }
    return parseFloat(toAmount) / parseFloat(fromAmount);
  }, [fromAmount, toAmount]);

  const getPriceImpactClass = (impact) => {
    if (!impact) return '';
    if (impact < 2) return styles.priceImpactLow;
    if (impact < 5) return styles.priceImpactMedium;
    return styles.priceImpactHigh;
  };

  // ==============================
  // NEW RENDER – Ultra‑Premium UI
  // ==============================
  return (
    <div className={styles.swapContainer}>
      {/* Transaction Toast */}
      {transactionStatus.show && (
        <SwapTransactionModal
          transactionHash={transactionStatus.txHash}
          onClose={resetTransactionStatus}
          type={transactionStatus.type}
          isLoading={transactionStatus.status === 'pending'}
          isSuccess={transactionStatus.status === 'success'}
          isError={transactionStatus.status === 'error'}
          errorMessage={transactionStatus.message}
          fromToken={fromToken}
          toToken={toToken}
          fromAmount={fromAmount}
          toAmount={toAmount}
          chainId={chainId}
          onSuccess={() => {
            if (address) {
              refetchBalances();
            }
            refreshQuote();
            if (refetchAllowance) refetchAllowance();
          }}
        />
      )}

      <div className={styles.swapCard}>
        {/* Modern Header */}
        <div className={styles.cardHeader}>
          <div className={styles.headerLeft}>

            <div className={styles.networkBadge}>GenLayer</div>
          </div>

          <div className={styles.headerRight}>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleRefresh}
              className={styles.iconButton}
              disabled={isLoading}
              title="Refresh"
            >
              <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowSettings(!showSettings)}
              className={`${styles.iconButton} ${showSettings ? styles.iconButtonActive : ''}`}
              title="Transaction Settings"
              type="button"
            >
              <Settings size={18} />
            </motion.button>
          </div>
        </div>

        {/* Main Swap Area */}
        <div className={styles.swapArea}>
          {isFirstBuyActive && (
            <div className={styles.firstBuyBanner}>
              <div className={styles.firstBuyHeader}>
                <Zap size={14} className={styles.firstBuyIcon} />
                <span>Initial Launch: First buy must be <strong>0.005 zkLTC or below</strong></span>
              </div>
              <button
                type="button"
                className={styles.firstBuyBtn}
                onClick={() => handleFromAmountChange('0.005')}
              >
                Set 0.005
              </button>
            </div>
          )}

          {/* From Token Input */}
          <div className={styles.tokenInput}>
            <div className={styles.tokenInputLabel}>
              <span>You pay</span>
              <div className={styles.tokenInputMeta}>
                {fromToken && (
                  <span className={styles.balanceChip}>
                    Balance {formatSelectorBalance(fromToken)}
                  </span>
                )}
                <button onClick={handleMaxClick} className={styles.maxButton} disabled={isInputDisabled}>
                  Max
                </button>
              </div>
            </div>
            <div className={styles.tokenInputBox}>
              <button
                onClick={() => setShowFromModal(true)}
                className={styles.tokenSelector}
                disabled={isTransactionInProgress || !isCorrectNetwork}
              >
                {fromToken ? (
                  <>
                    <div className={styles.tokenIcon}>
                      {fromToken.logoURI ? (
                        <img src={fromToken.logoURI} alt={fromToken.symbol} />
                      ) : (
                        <div className={styles.tokenIconFallback}>
                          {fromToken.symbol?.charAt(0)}
                        </div>
                      )}
                    </div>
                    <div className={styles.tokenSelectorMeta}>
                      <span className={styles.tokenSelectorKicker}>Selected asset</span>
                      <span>{fromToken.symbol}</span>
                    </div>
                    <ChevronDown size={16} />
                  </>
                ) : (
                  <>
                    <div className={styles.tokenSelectorMeta}>
                      <span className={styles.tokenSelectorKicker}>Choose asset</span>
                      <span>Select token</span>
                    </div>
                    <ChevronDown size={16} />
                  </>
                )}
              </button>
              <div className={styles.amountPanel}>
                <input
                  type="text"
                  value={fromAmount}
                  onChange={(e) => handleFromAmountChange(e.target.value)}
                  placeholder="0.0"
                  className={styles.amountInput}
                  disabled={isInputDisabled}
                />
                {fromTokenPrice > 0 && fromAmount && parseFloat(fromAmount) > 0 && (
                  <div className={styles.usdValue}>
                    ≈ {formatUSD(fromValueUSD)} <span className={styles.usdUnitPrice}>({formatUnitPrice(fromTokenPrice)})</span>
                  </div>
                )}
                <div className={styles.balanceInfo}>
                  {fromToken ? `${fromToken.symbol} amount` : 'Enter amount'}
                </div>
              </div>
            </div>
          </div>

          {/* Switch Button */}
          <div className={styles.switchButton}>
            <motion.button
              whileTap={{ scale: 0.85 }}
              onClick={() => {
                setRotation(prev => prev + 180);
                switchTokens();
              }}
              disabled={isTransactionInProgress || !fromToken || !toToken}
              className={styles.switchBtnClassy}
            >
              <motion.div
                animate={{ rotate: rotation }}
                transition={{ type: "spring", stiffness: 260, damping: 18 }}
                className={styles.switchIconContainer}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={styles.classySwapArrow}
                >
                  <path d="M7 16V4M7 4L3 8M7 4L11 8M17 8v12M17 20l-4-4M17 20l4-4" />
                </svg>
              </motion.div>
            </motion.button>
          </div>

          {/* To Token Input */}
          <div className={styles.tokenInput}>
            <div className={styles.tokenInputLabel}>
              <span>You receive</span>
              {toToken && (
                <div className={styles.tokenInputMeta}>
                  <span className={styles.balanceChip}>
                    Wallet {formatSelectorBalance(toToken)}
                  </span>
                </div>
              )}
            </div>
            <div className={styles.tokenInputBox}>
              <button
                onClick={() => setShowToModal(true)}
                className={styles.tokenSelector}
                disabled={isTransactionInProgress || !isCorrectNetwork}
              >
                {toToken ? (
                  <>
                    <div className={styles.tokenIcon}>
                      {toToken.logoURI ? (
                        <img src={toToken.logoURI} alt={toToken.symbol} />
                      ) : (
                        <div className={styles.tokenIconFallback}>
                          {toToken.symbol?.charAt(0)}
                        </div>
                      )}
                    </div>
                    <div className={styles.tokenSelectorMeta}>
                      <span className={styles.tokenSelectorKicker}>Selected asset</span>
                      <span>{toToken.symbol}</span>
                    </div>
                    <ChevronDown size={16} />
                  </>
                ) : (
                  <>
                    <div className={styles.tokenSelectorMeta}>
                      <span className={styles.tokenSelectorKicker}>Choose asset</span>
                      <span>Select token</span>
                    </div>
                    <ChevronDown size={16} />
                  </>
                )}
              </button>
              <div className={styles.amountPanel}>
                <input
                  type="text"
                  value={toAmount || ''}
                  readOnly
                  placeholder="0.0"
                  className={styles.amountInput}
                />
                {toTokenPrice > 0 && toAmount && parseFloat(toAmount) > 0 && (
                  <div className={styles.usdValue}>
                    ≈ {formatUSD(toValueUSD)} <span className={styles.usdUnitPrice}>({formatUnitPrice(toTokenPrice)})</span>
                  </div>
                )}
                <div className={styles.balanceInfo}>
                  {toToken ? `Estimated ${toToken.symbol} output` : 'Estimated output'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Token Verification Badges */}
        {(fromToken?.isCustom || toToken?.isCustom) && (
          <div className={styles.tokenVerificationAlert}>
            <AlertTriangle size={15} />
            <span>Imported coin detected, verify contract address before trading.</span>
          </div>
        )}

        {/* Clickable Rate Dropdown Trigger */}
        {fromToken && toToken && fromAmount && parseFloat(fromAmount) > 0 && (
          <div 
            onClick={() => setShowSwapDetails(!showSwapDetails)}
            className={styles.rateDropdownTrigger}
          >
            <div className={styles.rateLeft}>
              <Zap size={13} className={styles.rateZapIcon} />
              <span className={styles.rateDropdownText}>
                1 {fromToken.symbol} ≈ {calculatedExchangeRate ? calculatedExchangeRate.toFixed(6) : '-'} {toToken.symbol}
              </span>
            </div>
            <div className={styles.rateRight}>
              <ChevronDown size={14} className={`${styles.rateDropdownChevron} ${showSwapDetails ? styles.rotate180 : ''}`} />
            </div>
          </div>
        )}

        {/* Collapsible Details Accordion */}
        <AnimatePresence>
          {showSwapDetails && fromToken && toToken && fromAmount && parseFloat(fromAmount) > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0, y: -6 }}
              animate={{ opacity: 1, height: 'auto', y: 0 }}
              exit={{ opacity: 0, height: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className={styles.swapDetails}
            >
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Minimum received</span>
                <span className={styles.detailValue}>{minReceived ? `${formatNumber(minReceived)} ${toToken?.symbol}` : '-'}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Slippage tolerance</span>
                <span className={styles.detailValue}>{settings.slippage}%</span>
              </div>
              {quoteData?.route && (
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Route</span>
                  <span className={`${styles.detailValue} ${styles.routeText}`}>{quoteData.route.join(' → ')}</span>
                </div>
              )}
              {priceImpact !== null && priceImpact !== undefined && (
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Price impact</span>
                  <span className={`${styles.detailValue} ${getPriceImpactClass(priceImpact)}`}>{priceImpact.toFixed(2)}%</span>
                </div>
              )}
              {quoteData?.feeBps && (
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Platform Fee</span>
                  <span className={styles.detailValue}>{(Number(quoteData.feeBps) / 100).toFixed(2)}%</span>
                </div>
              )}
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Network Fee</span>
                <span className={styles.detailValue}>{networkFeeFormatted || '~$0.001'}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Settings Panel */}
        <AnimatePresence>
          {showSettings && (
            <motion.div
              initial={{ opacity: 0, height: 0, y: -8 }}
              animate={{ opacity: 1, height: 'auto', y: 0 }}
              exit={{ opacity: 0, height: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className={styles.settingsPanel}
            >
              <div className={styles.settingsHeader}>
                <span className={styles.settingsTitle}>Transaction Settings</span>
                <button
                  type="button"
                  onClick={() => setShowSettings(false)}
                  className={styles.settingsCloseBtn}
                  title="Close Settings"
                >
                  <X size={15} />
                </button>
              </div>

              {/* Slippage Section */}
              <div className={styles.settingsSection}>
                <div className={styles.settingsLabelRow}>
                  <label className={styles.settingsLabel}>Slippage tolerance</label>
                  <span className={styles.settingsCurrentVal}>{settings.slippage}%</span>
                </div>
                <div className={styles.slippageButtons}>
                  {[0.1, 0.5, 1.0].map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => updateSlippage(value)}
                      className={`${styles.slippageButton} ${Math.abs(settings.slippage - value) < 0.01 ? styles.active : ''}`}
                    >
                      {value}%
                    </button>
                  ))}
                  <div className={styles.slippageCustom}>
                    <input
                      type="number"
                      value={settings.slippage}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val) && val >= 0.1 && val <= 100) updateSlippage(val);
                      }}
                      step="0.1"
                      min="0.1"
                      max="100"
                      placeholder="Custom"
                    />
                    <span className={styles.customSuffix}>%</span>
                  </div>
                </div>
              </div>

              {/* Deadline Section */}
              <div className={styles.settingsSection}>
                <div className={styles.settingsLabelRow}>
                  <label className={styles.settingsLabel}>Transaction Deadline</label>
                </div>
                <div className={styles.deadlineContainer}>
                  <div className={styles.deadlineInput}>
                    <input
                      type="number"
                      value={settings.deadline}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val) && val >= 1 && val <= 60) updateDeadline(val);
                      }}
                      min="1"
                      max="60"
                    />
                    <span className={styles.deadlineSuffix}>minutes</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error Messages */}
        {combinedError && (
          <div className={styles.errorAlert}>
            <AlertCircle size={18} />
            <span>{combinedError}</span>
          </div>
        )}

        {/* Network Warning */}
        {!isCorrectNetwork && (
          <div className={styles.networkAlert}>
            <AlertTriangle size={18} />
            <span>Please switch to LitVM network</span>
          </div>
        )}




        {/* Action Button */}
        <div className={styles.actionButton}>
          <SwapActionButton
            onClick={handleButtonClick}
            state={buttonState.state}
            disabled={buttonState.isDisabled}
            isLoading={isTransactionInProgress}
            priceImpact={priceImpact}
            network="GenLayer Testnet"
            size="large"
            fullWidth={true}
            tooltip={buttonState.tooltip}
            needsApproval={needsApproval}
            approvalToken={fromToken?.symbol}
            isConnected={isConnected}
          />
        </div>

        {/* Footer Note */}
        <div className={styles.footerNote}>
          <Shield size={14} />
          <span>Trade securely on decentralized exchange</span>
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showFromModal && (
          <TokenSelectModal
            tokens={tokens}
            onSelect={handleFromTokenSelect}
            onClose={() => setShowFromModal(false)}
            selectedToken={fromToken}
            title="Choose token to swap from"
            excludeToken={toToken}
            showBalance={true}
            loading={isLoading}
            onImportToken={handleImportToken}
            networkName="GenLayer Testnet"
            isConnected={isConnected}
          />
        )}

        {showToModal && (
          <TokenSelectModal
            tokens={tokens}
            onSelect={handleToTokenSelect}
            onClose={() => setShowToModal(false)}
            selectedToken={toToken}
            title="Choose token to receive"
            excludeToken={fromToken}
            showBalance={true}
            loading={isLoading}
            onImportToken={handleImportToken}
            networkName="GenLayer Testnet"
            isConnected={isConnected}
          />
        )}

        {showConfirmation && confirmationData && (
          <ConfirmationModal
            data={confirmationData}
            onConfirm={confirmSwap}
            onCancel={() => setShowConfirmation(false)}
            isLoading={isSwapping}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default Swap;
