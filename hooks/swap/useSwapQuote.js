// hooks/swap/useSwapQoute.js

import { useState, useEffect, useCallback, useMemo } from 'react';

import { usePublicClient } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { useBestRoute } from './useBestRoute';
import { DEX_CONFIG } from '../../constants/dex';

// Fee configuration (0.05% in basis points)
const FEE_BPS = 5n;           // 5 basis points = 0.05%
const FEE_DENOMINATOR = 10000n;

export function useSwapQuote({ chainId, slippage, referrerFeeBps = 0n }) {
  const publicClient = usePublicClient();

  // Token state
  const [fromToken, setFromToken] = useState(null);
  const [toToken, setToToken] = useState(null);
  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');

  // Fetch best route (only for non‑wrap/unwrap pairs)
  const { route, loading, error } = useBestRoute(
    chainId,
    fromToken,
    toToken,
    fromAmount
  );

  // Get the wrapped token address (WGEN on GenLayer)
  const wethAddress = (chainId ? DEX_CONFIG[chainId]?.weth : null) || '0x315374AA9b5536037Cc1Efeea2439CCC0913A77e';

  // Determine if current pair is a wrap/unwrap operation
  const isWrap = useMemo(() => {
    if (!fromToken || !toToken || !wethAddress) return false;
    const isFromNative = fromToken.isNative || fromToken.symbol === 'GEN';
    const isToWrapped = toToken.address?.toLowerCase() === wethAddress.toLowerCase() || toToken.symbol === 'WGEN';
    return !!(isFromNative && isToWrapped);
  }, [fromToken, toToken, wethAddress]);

  const isUnwrap = useMemo(() => {
    if (!fromToken || !toToken || !wethAddress) return false;
    const isFromWrapped = fromToken.address?.toLowerCase() === wethAddress.toLowerCase() || fromToken.symbol === 'WGEN';
    const isToNative = toToken.isNative || toToken.symbol === 'GEN';
    return !!(isFromWrapped && isToNative);
  }, [fromToken, toToken, wethAddress]);

  const isWrapOrUnwrap = isWrap || isUnwrap;

  // Calculate raw output from route (BigInt)
  const rawOutputWei = useMemo(() => {
    if (!route) return null;
    return BigInt(route.amountOut.quotient.toString());
  }, [route]);

  // Apply platform fee + referrer fee to get net output (output token fee)
  const netOutputWei = useMemo(() => {
    if (!rawOutputWei) return null;
    const totalFeeBps = FEE_BPS + BigInt(referrerFeeBps);
    // net = raw * (10000 - totalFee) / 10000
    return (rawOutputWei * (FEE_DENOMINATOR - totalFeeBps)) / FEE_DENOMINATOR;
  }, [rawOutputWei, referrerFeeBps]);

  // Update toAmount based on wrap/unwrap or net output after fee
  useEffect(() => {
    // Handle wrap/unwrap (1:1 conversion, no fee)
    if (isWrapOrUnwrap) {
      if (fromAmount && parseFloat(fromAmount) > 0) {
        setToAmount(fromAmount);
      } else {
        setToAmount('');
      }
      return;
    }

    // Normal swap: use net output after fee
    if (netOutputWei && toToken) {
      const amountOut = formatUnits(netOutputWei, toToken.decimals);
      setToAmount(amountOut);
    } else {
      setToAmount('');
    }
  }, [isWrapOrUnwrap, fromAmount, netOutputWei, toToken]);

  // Compute price impact (simplified)
  const priceImpact = useMemo(() => {
    if (!route || !fromAmount || !toAmount) return 0;
    const inNum = parseFloat(fromAmount);
    const outNum = parseFloat(toAmount);
    if (inNum <= 0) return 0;
    return ((outNum / inNum - 1) * 100);
  }, [route, fromAmount, toAmount]);

  // Minimum received after slippage (applied to net output after fee)
  const minReceived = useMemo(() => {
    if (isWrapOrUnwrap) return null; // no slippage for wrap/unwrap
    if (!toAmount || !toToken) return null;
    const netAmountNum = parseFloat(toAmount);
    if (netAmountNum <= 0) return null;
    const min = netAmountNum * (1 - slippage / 100);
    return min.toFixed(toToken.decimals);
  }, [isWrapOrUnwrap, toAmount, slippage, toToken]);

  // Switch tokens
  const switchTokens = useCallback(() => {
    setFromToken(toToken);
    setToToken(fromToken);
    setFromAmount('');
    setToAmount('');
  }, [fromToken, toToken]);

  // Refresh quote (forces route refetch)
  const refreshQuote = useCallback(() => {
    // No need to do anything – route will refetch when dependencies change
  }, []);

  // Expose quote data (raw route + net output info)
  const quoteData = route ? {
    ...route,
    rawOutputWei,
    netOutputWei,
    feeBps: FEE_BPS,
  } : null;

  const [networkFeeFormatted, setNetworkFeeFormatted] = useState('~$0.001');

  useEffect(() => {
    async function calculateFee() {
      if (!publicClient) return;
      try {
        const gasPrice = await publicClient.getGasPrice();
        const gasLimit = 2200000n;
        const feeWei = gasLimit * gasPrice;
        const feeEth = parseFloat(formatUnits(feeWei, 18));
        setNetworkFeeFormatted(`~${feeEth.toFixed(4)} zkLTC`);
      } catch (err) {
        setNetworkFeeFormatted('~$0.001');
      }
    }
    calculateFee();
  }, [publicClient, chainId]);

  return {
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
    exchangeRate: null,
    minReceived,
    isLoading: loading,
    error,
    refreshQuote,
    quoteData,
    isWrap,
    isUnwrap,
    networkFeeFormatted,
  };
}