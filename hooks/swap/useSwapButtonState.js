// hooks/swap/useSwapButtonState.js
import { useMemo } from 'react';
import { parseUnits } from 'viem';
import { DEX_CONFIG } from '../../constants/dex';   // <-- new import

// Helper function to format units
const formatUnits = (value, decimals) => {
  if (!value) return '0';
  try {
    const bigIntValue = BigInt(value);
    const divisor = BigInt(10 ** decimals);
    const integerPart = bigIntValue / divisor;
    const fractionalPart = bigIntValue % divisor;
    
    if (fractionalPart === 0n) {
      return integerPart.toString();
    }
    
    const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
    // Remove trailing zeros
    const trimmedFractional = fractionalStr.replace(/0+$/, '');
    
    return `${integerPart}.${trimmedFractional}`;
  } catch (error) {
    console.error('Error formatting units:', error);
    return '0';
  }
};

// Helper to get native token symbol
const getNativeTokenSymbol = (chainId) => {
  return 'GEN';
};

export const useSwapButtonState = ({
  fromToken,
  toToken,
  fromAmount,
  toAmount,
  fromTokenBalance,
  toTokenBalance,
  ethBalance,
  quoteData,
  isValidQuote,
  isLoadingQuote,
  isApproving,
  isSwapping,
  needsApproval,
  hasError,
  priceImpact,
  slippage,
  network,
  isConnected,
  isCorrectNetwork,
  chainId = 4221, // Default to GenLayer
}) => {
  return useMemo(() => {
    // Default state
    let state = 'idle';
    let isDisabled = false;
    let tooltip = '';
    let needsConfirmation = false;
    
    // Get chain specific values
    const nativeTokenSymbol = getNativeTokenSymbol(chainId);
    const wethAddress = (chainId ? DEX_CONFIG[chainId]?.weth : null) || '0x315374AA9b5536037Cc1Efeea2439CCC0913A77e';

    // Check if wallet is connected
    if (!isConnected) {
      state = 'disconnect';
      isDisabled = false;
      tooltip = 'Connect your wallet to swap';
      return { state, isDisabled, tooltip, needsConfirmation };
    }

    // Check if on correct network
    if (!isCorrectNetwork) {
      state = 'wrong_network';
      isDisabled = false;
      tooltip = `Switch to GenLayer Testnet`;
      return { state, isDisabled, tooltip, needsConfirmation };
    }

    // Check if tokens are selected
    if (!fromToken || !toToken) {
      state = 'select_token';
      isDisabled = true;
      tooltip = 'Select tokens to swap';
      return { state, isDisabled, tooltip, needsConfirmation };
    }

    // Check if amount is entered
    if (!fromAmount || parseFloat(fromAmount) <= 0) {
      state = 'enter_amount';
      isDisabled = true;
      tooltip = 'Enter an amount to swap';
      return { state, isDisabled, tooltip, needsConfirmation };
    }

    // Check balance
    const isFromNative = fromToken.isNative || fromToken.symbol === 'GEN';
    if (isFromNative) {
      if (ethBalance !== undefined && ethBalance !== null) {
        const ethBalanceNum = parseFloat(formatUnits(ethBalance, 18));
        const fromAmountNum = parseFloat(fromAmount);
        
        if (ethBalanceNum < fromAmountNum) {
          state = 'insufficient_balance';
          isDisabled = true;
          tooltip = `Insufficient GEN balance. You have ${ethBalanceNum.toFixed(4)} GEN`;
          return { state, isDisabled, tooltip, needsConfirmation };
        }
      }
    } else if (fromTokenBalance !== undefined && fromTokenBalance !== null) {
      const tokenBalanceNum = parseFloat(formatUnits(fromTokenBalance, fromToken.decimals || 18));
      const fromAmountNum = parseFloat(fromAmount);
      
      if (tokenBalanceNum < fromAmountNum) {
        state = 'insufficient_balance';
        isDisabled = true;
        tooltip = `Insufficient ${fromToken.symbol} balance. You have ${tokenBalanceNum.toFixed(4)} ${fromToken.symbol}`;
        return { state, isDisabled, tooltip, needsConfirmation };
      }
    }

    // Check for wrap/unwrap operations using token addresses & symbols
    const isToWrapped = toToken.address?.toLowerCase() === wethAddress?.toLowerCase() || toToken.symbol === 'WGEN';
    const isFromWrapped = fromToken.address?.toLowerCase() === wethAddress?.toLowerCase() || fromToken.symbol === 'WGEN';
    const isToNative = toToken.isNative || toToken.symbol === 'GEN';

    const isWrap = isFromNative && isToWrapped;
    const isUnwrap = isFromWrapped && isToNative;

    if (isWrap) {
      state = 'wrap';
      isDisabled = false;
      tooltip = `Wrap GEN to WGEN (1:1)`;
      return { state, isDisabled, tooltip, needsConfirmation };
    }

    if (isUnwrap) {
      state = 'unwrap';
      isDisabled = false;
      tooltip = `Unwrap WGEN to GEN (1:1)`;
      return { state, isDisabled, tooltip, needsConfirmation };
    }

    // Check if quote is loading
    if (isLoadingQuote) {
      state = 'loading';
      isDisabled = true;
      tooltip = 'Fetching quote...';
      return { state, isDisabled, tooltip, needsConfirmation };
    }

    // Check if token needs approval
    if (!fromToken.isNative && needsApproval) {
      if (isApproving) {
        state = 'approving';
        isDisabled = true;
        tooltip = 'Approving token...';
      } else {
        state = 'approve';
        isDisabled = false;
        tooltip = `Approve ${fromToken.symbol} to swap`;
      }
      return { state, isDisabled, tooltip, needsConfirmation };
    }

    // Check if swapping is in progress
    if (isSwapping) {
      state = 'swapping';
      isDisabled = true;
      tooltip = 'Swapping in progress...';
      return { state, isDisabled, tooltip, needsConfirmation };
    }

    // Price impact state handling (same as before)
    const isCustomToken = fromToken?.isCustom || toToken?.isCustom;

    if (isCustomToken) {
      if (priceImpact > 50) {
        state = 'high_price_impact';
        isDisabled = false;
        tooltip = "Excellent, you got the great deal.";
        needsConfirmation = true;
      } else if (priceImpact > 30) {
        state = 'swap';
        isDisabled = false;
        tooltip = 'Wow, You Got the best Deal';
      } else if (priceImpact > 10) {
        state = 'swap';
        isDisabled = false;
        tooltip = 'Thank you for using our service';
      } else {
        state = 'swap';
        isDisabled = false;
        tooltip = "Great, you're own added tokens";
      }
    } else {
      if (priceImpact > 20) {
        state = 'high_price_impact';
        isDisabled = false;
        tooltip = "Excellent, You Got The Great Deal";
        needsConfirmation = true;
      } else if (priceImpact > 10) {
        state = 'swap';
        isDisabled = false;
        tooltip = 'Excellent, you got the great deal.';
      } else if (priceImpact > 5) {
        state = 'swap';
        isDisabled = false;
        tooltip = 'Wow, You Got the best Deal';
      } else if (priceImpact > 1) {
        state = 'swap';
        isDisabled = false;
        tooltip = 'Thank you for using our service';
      } else {
        state = 'swap';
        isDisabled = false;
        tooltip = 'Swap tokens';
      }
    }

    // Check for any errors
    if (hasError) {
      state = 'error';
      isDisabled = true;
    }

    return { state, isDisabled, tooltip, needsConfirmation };
  }, [
    fromToken,
    toToken,
    fromAmount,
    toAmount,
    fromTokenBalance,
    toTokenBalance,
    ethBalance,
    quoteData,
    isValidQuote,
    isLoadingQuote,
    isApproving,
    isSwapping,
    needsApproval,
    hasError,
    priceImpact,
    slippage,
    network,
    isConnected,
    isCorrectNetwork,
    chainId,
  ]);
};