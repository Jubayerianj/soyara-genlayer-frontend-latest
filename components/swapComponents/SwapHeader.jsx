// components/swapComponents/SwapHeader.jsx
import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Settings, 
  ChevronDown,
  X,
  Check,
  AlertTriangle,
  Info,
  Zap,
  RefreshCw,
  Shield,
  Clock,
  Edit3,
  Save,
  Percent,
} from 'lucide-react';

const SwapHeader = ({ 
  title = "Swap",
  onSettingsClick,
  settingsActive = false,
  isLoading = false,
  onRefresh,
  showBalance = false,
  balance = "0.00",
  onBalanceClick,
  // V2-specific props
  slippage = 0.5,
  deadline = 20,
  onSlippageChange,
  onDeadlineChange
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [slippageInput, setSlippageInput] = useState(slippage.toString());
  const [isEditingSlippage, setIsEditingSlippage] = useState(false);
  const [deadlineInput, setDeadlineInput] = useState(deadline.toString());
  const [isEditingDeadline, setIsEditingDeadline] = useState(false);
  const slippageInputRef = useRef(null);
  const deadlineInputRef = useRef(null);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus input when editing
  useEffect(() => {
    if (isEditingSlippage && slippageInputRef.current) {
      slippageInputRef.current.focus();
      slippageInputRef.current.select();
    }
  }, [isEditingSlippage]);

  useEffect(() => {
    if (isEditingDeadline && deadlineInputRef.current) {
      deadlineInputRef.current.focus();
      deadlineInputRef.current.select();
    }
  }, [isEditingDeadline]);

  // Update local state when props change
  useEffect(() => {
    setSlippageInput(slippage.toString());
  }, [slippage]);

  useEffect(() => {
    setDeadlineInput(deadline.toString());
  }, [deadline]);

  // Slippage presets
  const slippagePresets = [0.1, 0.5, 1, 5];

  const handleSlippagePreset = (value) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue >= 0.1 && numValue <= 100) {
      onSlippageChange?.(numValue);
      setSlippageInput(value.toString());
      setIsEditingSlippage(false);
    }
  };

  const handleSlippageInput = (e) => {
    const value = e.target.value;
    
    // Allow only numbers and decimal point
    if (value === '' || /^[0-9]*\.?[0-9]*$/.test(value)) {
      setSlippageInput(value);
    }
  };

  const saveSlippage = () => {
    const numValue = parseFloat(slippageInput);
    if (!isNaN(numValue) && numValue >= 0.1 && numValue <= 100) {
      onSlippageChange?.(numValue);
      setIsEditingSlippage(false);
    } else {
      // Reset to current value if invalid
      setSlippageInput(slippage.toString());
      setIsEditingSlippage(false);
    }
  };

  const handleSlippageKeyDown = (e) => {
    if (e.key === 'Enter') {
      saveSlippage();
    } else if (e.key === 'Escape') {
      setSlippageInput(slippage.toString());
      setIsEditingSlippage(false);
    }
  };

  const handleDeadlineInput = (e) => {
    const value = e.target.value;
    
    // Allow only numbers
    if (value === '' || /^[0-9]*$/.test(value)) {
      setDeadlineInput(value);
    }
  };

  const saveDeadline = () => {
    const numValue = parseInt(deadlineInput);
    if (!isNaN(numValue) && numValue >= 1 && numValue <= 60) {
      onDeadlineChange?.(numValue);
      setIsEditingDeadline(false);
    } else {
      // Reset to current value if invalid
      setDeadlineInput(deadline.toString());
      setIsEditingDeadline(false);
    }
  };

  const handleDeadlineKeyDown = (e) => {
    if (e.key === 'Enter') {
      saveDeadline();
    } else if (e.key === 'Escape') {
      setDeadlineInput(deadline.toString());
      setIsEditingDeadline(false);
    }
  };

  // Get warning color for slippage
  const getSlippageColor = (value) => {
    if (value < 0.5) return '#00d395'; // green
    if (value <= 1) return '#f59e0b'; // yellow
    if (value <= 5) return '#f97316'; // orange
    return '#ef4444'; // red
  };

  // Get warning for high slippage
  const getSlippageWarning = (value) => {
    if (value < 0.5) return 'Low (Safe for stable pairs)';
    if (value <= 1) return 'Normal (Good for most pairs)';
    if (value <= 5) return 'High (Use with caution)';
    return 'Very High (Risky)';
  };

  return (
    <div style={styles.swapHeader}>
      {/* Left side - Title and Balance */}
      <div style={styles.headerLeft}>
        <h1 style={styles.headerTitle}>
          {title}
          {showBalance && (
            <button 
              onClick={onBalanceClick}
              style={styles.balanceIndicator}
              type="button"
            >
              <span style={styles.balanceAmount}>${balance}</span>
              <ChevronDown style={styles.chevronIcon} />
            </button>
          )}
        </h1>
      </div>

      {/* Right side - Settings with dropdown */}
      <div style={styles.headerRight} ref={dropdownRef}>
        {/* Refresh Button */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onRefresh}
          style={{
            ...styles.settingsButton,
            background: isLoading ? 'rgba(2, 132, 199, 0.2)' : 'rgba(255, 255, 255, 0.1)',
            borderColor: isLoading ? '#0284c7' : 'rgba(255, 255, 255, 0.2)',
          }}
          disabled={isLoading}
          title="Refresh"
          type="button"
        >
          <RefreshCw 
            style={{
              width: '20px',
              height: '20px',
              color: isLoading ? '#38bdf8' : 'white',
              animation: isLoading ? 'spin 1s linear infinite' : 'none'
            }} 
          />
        </motion.button>

        {/* Settings button */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => {
            onSettingsClick?.();
            setIsDropdownOpen(!isDropdownOpen);
          }}
          style={{
            ...styles.settingsButton,
            background: settingsActive ? 'rgba(0, 211, 149, 0.2)' : 'rgba(255, 255, 255, 0.1)',
            borderColor: settingsActive ? '#00d395' : 'rgba(255, 255, 255, 0.2)',
          }}
          disabled={isLoading}
          title="Settings"
          type="button"
        >
          <div style={styles.settingsIconWrapper}>
            <motion.div
              animate={settingsActive ? { rotate: 180 } : { rotate: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              style={styles.settingsIcon}
            >
              <Settings style={{ width: '20px', height: '20px', color: 'white' }} />
            </motion.div>
            
            {settingsActive && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                style={styles.activeDot}
              />
            )}
          </div>
        </motion.button>

        {/* Settings dropdown */}
        <AnimatePresence>
          {isDropdownOpen && (
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              style={styles.settingsDropdown}
            >
              {/* Dropdown header */}
              <div style={styles.dropdownHeader}>
                <h3 style={styles.dropdownTitle}>
                  <Settings style={{ width: '20px', height: '20px', color: '#d1d5db', marginRight: '8px' }} />
                  Swap Settings
                </h3>
                <button
                  onClick={() => setIsDropdownOpen(false)}
                  style={styles.dropdownClose}
                  type="button"
                >
                  <X style={{ width: '16px', height: '16px' }} />
                </button>
              </div>

              {/* Dropdown content */}
              <div style={styles.dropdownContent}>
                {/* Current Slippage Display */}
                <div style={styles.currentSettingsDisplay}>
                  <div style={styles.currentSettingItem}>
                    <Shield style={{ width: '16px', height: '16px', color: '#60a5fa', marginRight: '8px' }} />
                    <span style={styles.currentSettingLabel}>Current Slippage:</span>
                    <span style={{ ...styles.currentSettingValue, color: getSlippageColor(slippage) }}>
                      {slippage}%
                    </span>
                    <span style={styles.currentSettingWarning}>
                      {getSlippageWarning(slippage)}
                    </span>
                  </div>
                  <div style={styles.currentSettingItem}>
                    <Clock style={{ width: '16px', height: '16px', color: '#34d399', marginRight: '8px' }} />
                    <span style={styles.currentSettingLabel}>Current Deadline:</span>
                    <span style={styles.currentSettingValue}>{deadline}m</span>
                  </div>
                </div>

                {/* Slippage Tolerance Section */}
                <div style={styles.dropdownSection}>
                  <div style={styles.sectionHeader}>
                    <Percent style={{ width: '16px', height: '16px', color: '#60a5fa', marginRight: '8px' }} />
                    <span style={styles.sectionTitle}>Slippage Tolerance</span>
                    {isEditingSlippage && (
                      <button
                        onClick={saveSlippage}
                        style={styles.editSaveBtn}
                        type="button"
                      >
                        <Save style={{ width: '12px', height: '12px' }} />
                      </button>
                    )}
                  </div>
                  
                  <div style={styles.slippageControls}>
                    {/* Preset buttons */}
                    <div style={styles.slippagePresets}>
                      {slippagePresets.map((value) => (
                        <button
                          key={value}
                          onClick={() => handleSlippagePreset(value)}
                          style={{
                            ...styles.slippagePreset,
                            background: slippage === value ? 'rgba(0, 211, 149, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                            borderColor: slippage === value ? '#00d395' : 'rgba(255, 255, 255, 0.1)',
                            color: slippage === value ? '#00d395' : '#8a8ab5',
                          }}
                          disabled={isEditingSlippage}
                          type="button"
                        >
                          {value}%
                        </button>
                      ))}
                    </div>

                    {/* Custom input */}
                    <div style={{
                      ...styles.customSlippageContainer,
                      borderStyle: isEditingSlippage ? 'solid' : 'dashed',
                      borderColor: isEditingSlippage ? '#00d395' : 'rgba(255, 255, 255, 0.2)',
                    }}>
                      {isEditingSlippage ? (
                        <div style={styles.customInputWrapper}>
                          <input
                            ref={slippageInputRef}
                            type="text"
                            value={slippageInput}
                            onChange={handleSlippageInput}
                            onKeyDown={handleSlippageKeyDown}
                            onBlur={saveSlippage}
                            style={styles.customSlippageInput}
                            placeholder="Enter %"
                            maxLength={6}
                          />
                          <span style={styles.inputSuffix}>%</span>
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={saveSlippage}
                            style={styles.saveInputBtn}
                            type="button"
                          >
                            <Check style={{ width: '16px', height: '16px' }} />
                          </motion.button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setIsEditingSlippage(true)}
                          style={styles.customSlippageBtn}
                          type="button"
                        >
                          <Edit3 style={{ width: '12px', height: '12px', marginRight: '8px' }} />
                          Custom
                          {slippage > 0 && !slippagePresets.includes(slippage) && (
                            <span style={{ marginLeft: '8px', color: '#60a5fa' }}>({slippage}%)</span>
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={styles.sectionDescription}>
                    Your transaction will revert if the price changes unfavorably by more than this percentage.
                  </div>
                </div>

                {/* Divider */}
                <div style={styles.dropdownDivider} />

                {/* Quick actions */}
                <div style={styles.dropdownActions}>
                  <button
                    onClick={() => {
                      onRefresh?.();
                      setIsDropdownOpen(false);
                    }}
                    style={styles.dropdownActionBtn}
                    type="button"
                  >
                    <RefreshCw style={{ width: '16px', height: '16px', marginRight: '8px' }} />
                    Refresh Quotes
                  </button>
                  
                  <button
                    onClick={() => {
                      // Reset to defaults
                      handleSlippagePreset(0.5);
                      onDeadlineChange?.(20);
                      setIsDropdownOpen(false);
                    }}
                    style={{
                      ...styles.dropdownActionBtn,
                      color: '#ef4444',
                    }}
                    type="button"
                  >
                    <AlertTriangle style={{ width: '16px', height: '16px', marginRight: '8px' }} />
                    Reset to Defaults
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

// Styles object for inline styles
const styles = {
  swapHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 1rem 1rem',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    marginBottom: '1rem',
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: '1.75rem',
    fontWeight: 700,
    color: 'white',
    margin: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  balanceIndicator: {
    background: 'rgba(255, 255, 255, 0.1)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    borderRadius: '20px',
    padding: '6px 12px',
    fontWeight: 600,
    color: 'white',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    fontSize: '14px',
  },
  balanceAmount: {
    color: '#00d395',
  },
  chevronIcon: {
    width: '12px',
    height: '12px',
    marginLeft: '4px',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    position: 'relative',
  },
  settingsButton: {
    background: 'rgba(255, 255, 255, 0.1)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    borderRadius: '16px',
    width: '44px',
    height: '44px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    color: 'white',
    position: 'relative',
  },
  settingsIconWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeDot: {
    position: 'absolute',
    top: '-2px',
    right: '-2px',
    width: '8px',
    height: '8px',
    background: '#00d395',
    borderRadius: '50%',
    border: '2px solid #1c1c2e',
  },
  settingsDropdown: {
    position: 'absolute',
    top: 'calc(100% + 10px)',
    right: 0,
    width: '384px',
    background: 'rgba(30, 30, 46, 0.95)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '20px',
    zIndex: 1000,
    overflow: 'hidden',
    backdropFilter: 'blur(10px)',
  },
  dropdownHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
  },
  dropdownTitle: {
    fontWeight: 600,
    color: 'white',
    margin: 0,
    display: 'flex',
    alignItems: 'center',
    fontSize: '16px',
  },
  dropdownClose: {
    background: 'rgba(255, 255, 255, 0.1)',
    border: 'none',
    borderRadius: '8px',
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    color: '#8a8ab5',
  },
  dropdownContent: {
    padding: '20px',
  },
  currentSettingsDisplay: {
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '12px',
    padding: '12px',
    marginBottom: '20px',
  },
  currentSettingItem: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: '8px',
    fontSize: '13px',
  },
  currentSettingLabel: {
    color: '#8a8ab5',
    marginRight: '8px',
  },
  currentSettingValue: {
    fontSize: '14px',
    fontWeight: 700,
    marginRight: '8px',
  },
  currentSettingWarning: {
    fontSize: '12px',
    color: '#8a8ab5',
    marginLeft: 'auto',
  },
  dropdownSection: {
    marginBottom: '24px',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: '16px',
    position: 'relative',
  },
  sectionTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: 'white',
  },
  editSaveBtn: {
    position: 'absolute',
    right: 0,
    background: 'rgba(0, 211, 149, 0.1)',
    border: '1px solid rgba(0, 211, 149, 0.3)',
    borderRadius: '6px',
    width: '24px',
    height: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    color: '#00d395',
  },
  slippageControls: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  slippagePresets: {
    display: 'flex',
    gap: '8px',
  },
  slippagePreset: {
    flex: 1,
    padding: '10px 12px',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '10px',
    color: '#8a8ab5',
    fontWeight: 600,
    cursor: 'pointer',
    textAlign: 'center',
    fontSize: '14px',
  },
  customSlippageContainer: {
    width: '100%',
    border: '1px dashed rgba(255, 255, 255, 0.2)',
    borderRadius: '10px',
    overflow: 'hidden',
  },
  customSlippageBtn: {
    width: '100%',
    padding: '12px',
    background: 'rgba(255, 255, 255, 0.05)',
    border: 'none',
    borderRadius: '10px',
    color: '#8a8ab5',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
  },
  customInputWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  customSlippageInput: {
    flex: 1,
    padding: '12px 50px 12px 16px',
    background: 'rgba(255, 255, 255, 0.1)',
    border: '1px solid rgba(0, 211, 149, 0.4)',
    borderRadius: '10px',
    color: 'white',
    fontWeight: 600,
    outline: 'none',
    fontSize: '14px',
  },
  inputSuffix: {
    position: 'absolute',
    right: '50px',
    color: '#8a8ab5',
    fontWeight: 600,
    fontSize: '14px',
  },
  saveInputBtn: {
    position: 'absolute',
    right: '8px',
    background: 'rgba(0, 211, 149, 0.2)',
    border: '1px solid rgba(0, 211, 149, 0.4)',
    borderRadius: '8px',
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    color: '#00d395',
  },
  sectionDescription: {
    fontSize: '12px',
    color: '#8a8ab5',
    lineHeight: 1.4,
    marginTop: '12px',
  },
  dropdownDivider: {
    height: '1px',
    background: 'rgba(255, 255, 255, 0.1)',
    margin: '20px 0',
  },
  dropdownActions: {
    display: 'flex',
    gap: '8px',
  },
  dropdownActionBtn: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '12px',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '12px',
    color: '#8a8ab5',
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: '14px',
  },
};

// Add spin animation to global styles
const globalStyles = `
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;

// Add global styles to document head
if (typeof document !== 'undefined') {
  const styleEl = document.createElement('style');
  styleEl.textContent = globalStyles;
  document.head.appendChild(styleEl);
}

export default SwapHeader;