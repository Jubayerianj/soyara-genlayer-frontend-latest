// components/swapComponents/AdvancedFeaturesDropdown.jsx
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronDown, 
  Check, 
  X, 
  AlertTriangle, 
  ExternalLink,
  Shield,
  Database,
  FileCheck,
  Zap,
  Info
} from 'lucide-react';
import { zeroAddress } from 'viem';
import styles from './AdvancedFeaturesDropdown.module.css';

const AdvancedFeaturesDropdown = ({ 
  fromToken,
  toToken,
  pairAddress,
  needsApproval,
  isCheckingAllowance,
  chainId
}) => {
  const [isOpen, setIsOpen] = useState(false);

  // Check if token is verified
  const isTokenVerified = (token) => {
    if (!token) return false;
    return token.isVerified === true;
  };

  // Get verification status
  const getVerificationStatus = (token) => {
    if (!token) return { status: 'none', text: 'No token', verified: false };
    
    if (token.isCustom) {
      return { 
        status: 'custom', 
        text: 'Custom Token', 
        verified: false,
        icon: <AlertTriangle className={styles.iconSm} />
      };
    }
    
    if (isTokenVerified(token)) {
      return { 
        status: 'verified', 
        text: 'Verified', 
        verified: true,
        icon: <Check className={styles.iconSm} />
      };
    }
    
    return { 
      status: 'unverified', 
      text: 'Not Verified', 
      verified: false,
      icon: <X className={styles.iconSm} />
    };
  };

  // Get pool status
  const getPoolStatus = () => {
    if (!pairAddress || pairAddress === zeroAddress) {
      return {
        exists: false,
        text: 'No Pool Found',
        icon: <X className={styles.icon} />,
        className: styles.noPool
      };
    }
    
    return {
      exists: true,
      text: 'Pool Exists',
      icon: <Check className={styles.icon} />,
      className: styles.poolExists
    };
  };

  // Get approval status
  const getApprovalStatus = () => {
    if (!fromToken || fromToken.isNative) {
      return {
        needed: false,
        text: 'Not Required (Native Token)',
        icon: <Check className={styles.icon} />,
        className: styles.approved
      };
    }
    
    if (isCheckingAllowance) {
      return {
        needed: false,
        text: 'Checking...',
        icon: <div className={styles.spinner} />,
        className: styles.checking
      };
    }
    
    if (needsApproval) {
      return {
        needed: true,
        text: 'Approval Required',
        icon: <AlertTriangle className={styles.icon} />,
        className: styles.needsApproval
      };
    }
    
    return {
      needed: false,
      text: 'Approved',
      icon: <Check className={styles.icon} />,
      className: styles.approved
    };
  };

  // Get explorer URL based on chain
  const getExplorerUrl = (address) => {
    if (!address || address === zeroAddress) return '#';
    
    if (chainId === 4441) { // LitVM
      return `https://liteforge.explorer.caldera.xyz/address/${address}`;
    } else if (chainId === 11155111) { // Sepolia
      return `https://sepolia.etherscan.io/address/${address}`;
    }
    return `https://liteforge.explorer.caldera.xyz/address/${address}`;
  };

  const fromTokenStatus = getVerificationStatus(fromToken);
  const toTokenStatus = getVerificationStatus(toToken);
  const poolStatus = getPoolStatus();
  const approvalStatus = getApprovalStatus();

  // Format address for display
  const formatAddress = (address) => {
    if (!address || address === zeroAddress) return 'Not Available';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  // Get quick info for collapsed state
  const getQuickInfo = () => {
    if (poolStatus.exists) {
      return "Pool Found • Ready to Swap";
    } else {
      return "Check Token Details";
    }
  };

  return (
    <div className={styles.container}>
      {/* Dropdown Header */}
      <motion.button
        className={styles.dropdownHeader}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        type="button"
      >
        
        <div className={styles.headerContent}>
          <div className={styles.headerLeft}>
            <Shield className={styles.headerIcon} />
            <span className={styles.headerTitle}>Advanced Features</span>
            <span className={`${styles.badge} ${poolStatus.exists ? styles.liveBadge : styles.infoBadge}`}>
              {poolStatus.exists ? 'Live' : 'Info'}
            </span>
          </div>
          <div className={styles.headerRight}>
            <span className={styles.quickInfo}>
              {getQuickInfo()}
            </span>
            <ChevronDown 
              className={`${styles.chevron} ${isOpen ? styles.rotate : ''}`}
              size={16}
            />
          </div>
        </div>
      </motion.button>

      {/* Dropdown Content */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className={styles.dropdownContent}
          >
            <div className={styles.contentInner}>
              {/* Token Verification Section */}
              <div className={styles.section}>
                <h4 className={styles.sectionTitle}>
                  <FileCheck className={styles.sectionIcon} />
                  Token Verification
                </h4>
                
                <div className={styles.infoGrid}>
                  {/* From Token */}
                  <div className={styles.infoItem}>
                    <div className={styles.infoLabel}>
                      <span>{fromToken?.symbol || 'Token A'}</span>
                      <div className={styles.tooltip}>
                        <Info size={12} />
                        <div className={styles.tooltipContent}>
                          Token verification status
                        </div>
                      </div>
                    </div>
                    <div className={styles.infoValue}>
                      <div className={`${styles.verificationBadge} ${
                        fromTokenStatus.status === 'verified' ? styles.verified :
                        fromTokenStatus.status === 'custom' ? styles.custom : 
                        styles.unverified
                      }`}>
                        {fromTokenStatus.icon}
                        <span>{fromTokenStatus.text}</span>
                      </div>
                      {fromToken?.address && (
                        <a
                          href={getExplorerUrl(fromToken.address)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.explorerLink}
                        >
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                  </div>

                  {/* To Token */}
                  <div className={styles.infoItem}>
                    <div className={styles.infoLabel}>
                      <span>{toToken?.symbol || 'Token B'}</span>
                      <div className={styles.tooltip}>
                        <Info size={12} />
                        <div className={styles.tooltipContent}>
                          Token verification status
                        </div>
                      </div>
                    </div>
                    <div className={styles.infoValue}>
                      <div className={`${styles.verificationBadge} ${
                        toTokenStatus.status === 'verified' ? styles.verified :
                        toTokenStatus.status === 'custom' ? styles.custom : 
                        styles.unverified
                      }`}>
                        {toTokenStatus.icon}
                        <span>{toTokenStatus.text}</span>
                      </div>
                      {toToken?.address && (
                        <a
                          href={getExplorerUrl(toToken.address)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.explorerLink}
                        >
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>

            

              {/* Approval Status Section */}
              <div className={styles.section}>
                <h4 className={styles.sectionTitle}>
                  <Zap className={styles.sectionIcon} />
                  Approval Status
                </h4>
                
                <div className={styles.infoGrid}>
                  <div className={styles.infoItem}>
                    <div className={styles.infoLabel}>
                      <span>Approval Status</span>
                      <div className={styles.tooltip}>
                        <Info size={12} />
                        <div className={styles.tooltipContent}>
                          Token approval status for swapping
                        </div>
                      </div>
                    </div>
                    <div className={`${styles.infoValue} ${approvalStatus.className}`}>
                      {approvalStatus.icon}
                      <span>{approvalStatus.text}</span>
                    </div>
                  </div>
                </div>

                {fromToken && !fromToken.isNative && (
                  <div className={`${styles.warningBox} ${needsApproval ? styles.warning : styles.success}`}>
                    <div className={styles.warningContent}>
                      <AlertTriangle className={styles.warningIcon} />
                      <div>
                        <p className={styles.warningTitle}>
                          {needsApproval ? 'Action Required' : 'Ready to Swap'}
                        </p>
                        <p className={styles.warningMessage}>
                          {needsApproval
                            ? `You need to approve ${fromToken.symbol} before swapping`
                            : `${fromToken.symbol} is approved and ready for trading`}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdvancedFeaturesDropdown;