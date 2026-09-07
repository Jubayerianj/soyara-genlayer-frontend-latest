
// components/liquidity/LiquidityActionButtons.jsx

// components/liquidityComponents/LiquidityActionButtons.jsx - Updated
import React from 'react';
import { motion } from 'framer-motion';
import { FaWallet, FaPlus, FaLock } from 'react-icons/fa';

const LiquidityActionButtons = ({
  // State
  isConnected = false,
  tokenA = null,
  tokenB = null,
  amountA = '',
  amountB = '',
  
  // Actions
  onConnectWallet = () => {},
  onApproveTokenA = () => {},
  onApproveTokenB = () => {},
  onAddLiquidity = () => {},
  onCreatePool = () => {},
  
  // Status
  needsApprovalA = false,
  needsApprovalB = false,
  isSubmitting = false,
  isApproving = false,
  isCreating = false,
  
  // Tokens
  tokenASymbol = '',
  tokenBSymbol = '',
  
  // Pool info
  poolExists = false,
  
  // Customization
  size = 'lg',
  showCreate = false,
  className = '',
}) => {
  
  // Determine button state
  const getButtonState = () => {
    if (!isConnected) {
      return {
        text: 'Connect Wallet',
        icon: FaWallet,
        onClick: onConnectWallet,
        disabled: false,
        loading: false,
        variant: 'connect',
        show: true,
      };
    }

    if (!tokenA || !tokenB) {
      return {
        text: 'Select Tokens',
        icon: null,
        onClick: () => {},
        disabled: true,
        loading: false,
        variant: 'default',
        show: true,
      };
    }

    if (!amountA || !amountB || parseFloat(amountA) <= 0 || parseFloat(amountB) <= 0) {
      return {
        text: 'Enter Amounts',
        icon: null,
        onClick: () => {},
        disabled: true,
        loading: false,
        variant: 'default',
        show: true,
      };
    }

    if (isApproving) {
      return {
        text: 'Approving...',
        icon: null,
        onClick: () => {},
        disabled: true,
        loading: true,
        variant: 'approve',
        show: true,
      };
    }

    if (needsApprovalA) {
      return {
        text: `Approve ${tokenASymbol || 'Token A'}`,
        icon: FaLock,
        onClick: onApproveTokenA,
        disabled: false,
        loading: false,
        variant: 'approve',
        show: true,
      };
    }

    if (needsApprovalB) {
      return {
        text: `Approve ${tokenBSymbol || 'Token B'}`,
        icon: FaLock,
        onClick: onApproveTokenB,
        disabled: false,
        loading: false,
        variant: 'approve',
        show: true,
      };
    }

    if (isSubmitting) {
      return {
        text: poolExists ? 'Adding Liquidity...' : 'Creating Pool...',
        icon: null,
        onClick: () => {},
        disabled: true,
        loading: true,
        variant: 'add',
        show: true,
      };
    }

    return {
      text: poolExists ? 'Add Liquidity' : 'Create Pool',
      icon: FaPlus,
      onClick: poolExists ? onAddLiquidity : onCreatePool,
      disabled: false,
      loading: false,
      variant: poolExists ? 'add' : 'create',
      show: true,
    };
  };

  const buttonState = getButtonState();

  const sizes = {
    sm: 'px-4 py-2.5 text-sm h-10',
    md: 'px-6 py-3 text-base h-12',
    lg: 'px-8 py-4 text-lg h-14',
    xl: 'px-10 py-5 text-xl h-16',
  };

  const variants = {
    connect: 'bg-gradient-to-r from-[#0284c7] to-[#0369a1]',
    approve: 'bg-gradient-to-r from-[#0284c7] to-[#38bdf8]',
    add: 'bg-gradient-to-r from-[#0284c7] to-[#0369a1]',
    create: 'bg-gradient-to-r from-[#38bdf8] to-[#0284c7]',
    default: 'bg-[#0284c7]',
  };

  if (!buttonState.show) return null;

  return (
    <div className={`liquidity-action-buttons ${className}`}>
      <motion.button
        whileHover={{ scale: buttonState.disabled ? 1 : 1.02 }}
        whileTap={{ scale: buttonState.disabled ? 1 : 0.98 }}
        onClick={buttonState.onClick}
        disabled={buttonState.disabled}
        className={`
          ${variants[buttonState.variant] || variants.default}
          ${sizes[size]}
          w-full
          text-white font-semibold rounded-xl transition-all duration-300 
          focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#0f0f1f]
          disabled:opacity-50 disabled:cursor-not-allowed
          shadow-lg hover:shadow-xl
          flex items-center justify-center gap-3
        `}
      >
        {buttonState.loading ? (
          <>
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            <span>{buttonState.text}</span>
          </>
        ) : (
          <>
            {buttonState.icon && <buttonState.icon size={20} />}
            <span>{buttonState.text}</span>
          </>
        )}
      </motion.button>
    </div>
  );
};

export default LiquidityActionButtons;