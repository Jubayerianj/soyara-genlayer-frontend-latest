// components/swapComponents/SwapActionButton.jsx
import React from 'react';
import { 
  Wallet, RefreshCw, AlertTriangle, ArrowRight, 
  Check, Loader2, Zap, Shield, Unlock, Repeat 
} from 'lucide-react';
import styles from './SwapActionButton.module.css';

const SwapActionButton = ({
  state = 'idle',
  onClick,
  disabled = false,
  isLoading = false,
  size = 'large',
  fullWidth = true,
  className = '',
  tooltip = '',
  priceImpact = 0,
  needsApproval = false,
  approvalToken = null,
  chainId = 4221, // Default to GenLayer
  isConnected,
  ...props
}) => {
  // Get native token symbol based on chain
  const getNativeTokenSymbol = () => {
    return 'GEN';
  };

  // Get button text, icon and style based on state
  const getButtonConfig = () => {
    const nativeToken = 'GEN';
    const wrappedToken = 'WGEN';
    
    switch (state) {
      case 'disconnect':
        return {
          text: 'Connect Wallet',
          icon: <Wallet size={18} />,
          className: 'primary',
          showSpinner: false
        };
      case 'wrong_network':
        return {
          text: `Switch to GenLayer Testnet`,
          icon: <RefreshCw size={18} />,
          className: 'warning',
          showSpinner: false
        };
      case 'no_liquidity':
        return {
          text: 'No Liquidity',
          icon: <AlertTriangle size={18} />,
          className: 'disabled',
          showSpinner: false
        };
      case 'insufficient_liquidity':
        return {
          text: 'Insufficient Liquidity',
          icon: <AlertTriangle size={18} />,
          className: 'disabled',
          showSpinner: false
        };
      case 'approve':
        return {
          text: `Approve ${approvalToken || 'Token'}`,
          icon: <Unlock size={18} />,
          className: 'secondary',
          showSpinner: false
        };
      case 'approving':
        return {
          text: 'Approving...',
          icon: <Loader2 size={18} className={styles.spinning} />,
          className: 'secondary',
          showSpinner: true
        };
      case 'swap':
        return {
          text: 'Swap',
          icon: <ArrowRight size={18} />,
          className: priceImpact > 5 ? 'warning' : 'primary',
          showSpinner: false
        };
      case 'swapping':
        return {
          text: 'Swapping...',
          icon: <Loader2 size={18} className={styles.spinning} />,
          className: 'primary',
          showSpinner: true
        };
      case 'wrap':
        return {
          text: `Wrap GEN to WGEN`,
          icon: <Zap size={18} />,
          className: 'primary',
          showSpinner: false
        };
      case 'unwrap':
        return {
          text: `Unwrap WGEN to GEN`,
          icon: <Repeat size={18} />,
          className: 'primary',
          showSpinner: false
        };
      case 'insufficient_balance':
        return {
          text: 'Insufficient Balance',
          icon: <AlertTriangle size={18} />,
          className: 'disabled',
          showSpinner: false
        };
      case 'select_token':
        return {
          text: 'Select Token',
          icon: <Wallet size={18} />,
          className: 'disabled',
          showSpinner: false
        };
      case 'enter_amount':
        return {
          text: 'Enter Amount',
          icon: <ArrowRight size={18} />,
          className: 'disabled',
          showSpinner: false
        };
      case 'high_price_impact':
        return {
          text: 'Swap',
          icon: <ArrowRight size={18} />,
          className: priceImpact > 5 ? 'warning' : 'primary',
          showSpinner: false
        };
      case 'loading':
        return {
          text: 'Loading...',
          icon: <Loader2 size={18} className={styles.spinning} />,
          className: 'disabled',
          showSpinner: true
        };
      case 'no_quote':
        return {
          text: 'No Quote Available',
          icon: <AlertTriangle size={18} />,
          className: 'disabled',
          showSpinner: false
        };
      case 'connect_wallet':
        return {
          text: 'Connect Wallet',
          icon: <Wallet size={18} />,
          className: 'primary',
          showSpinner: false
        };
      default:
        return {
          text: 'Swap',
          icon: <ArrowRight size={18} />,
          className: 'primary',
          showSpinner: false
        };
    }
  };

  const config = getButtonConfig();
  const isDisabled = disabled || config.className.includes('disabled') || isLoading;

  // Size mapping for CSS module
  const sizeClass = {
    small: styles.small,
    medium: styles.medium,
    large: styles.large
  }[size] || styles.large;

  // Variant mapping
  const variantClass = {
    primary: styles.primary,
    secondary: styles.secondary,
    warning: styles.warning,
    disabled: styles.disabled
  }[config.className] || styles.primary;

  // Clean props to avoid passing non-DOM attributes
  const cleanProps = { ...props };
  delete cleanProps.isConnected;
  delete cleanProps.network;

  return (
    <div className={`${styles.container} ${fullWidth ? styles.fullWidth : ''}`}>
      
      <button
        onClick={!isDisabled ? onClick : undefined}
        disabled={isDisabled}
        className={`${styles.button} ${sizeClass} ${variantClass} ${className}`}
        {...cleanProps}
      >
        <span className={styles.icon}>{config.icon}</span>
        <span className={styles.text}>{config.text}</span>
        {(config.showSpinner || isLoading) && (
          <span className={styles.spinner}>{config.icon}</span>
        )}
      </button>

      {needsApproval && state !== 'approve' && state !== 'approving' && (
        <div className={styles.approvalHint}>
          <Shield size={12} />
          <span>Approval required</span>
        </div>
      )}

    </div>
  );
};

export default SwapActionButton;