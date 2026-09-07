
// hooks/swap/useSwapSettings.js

import { useState, useEffect, useCallback } from 'react';



// Default settings matching Uniswap's defaults
const DEFAULT_SETTINGS = {
  slippage: 0.5, // 0.5% default slippage
  deadline: 20, // 20 minutes default deadline
  txSpeed: 'standard', // standard, fast, instant
  expertMode: false,
  disableMultihops: false,
  soundEnabled: true,
  theme: 'dark', // dark, light, auto
  customSlippage: false,
};

// Validate slippage value (0.1% - 100%)
const validateSlippage = (value) => {
  const num = parseFloat(value);
  return !isNaN(num) && num >= 0.1 && num <= 100;
};

// Validate deadline value (1 - 60 minutes)
const validateDeadline = (value) => {
  const num = parseInt(value, 10);
  return !isNaN(num) && num >= 1 && num <= 60;
};

export const useSwapSettings = () => {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [isInitialized, setIsInitialized] = useState(false);

  // Load settings from localStorage on mount
  useEffect(() => {
    try {
      const savedSettings = localStorage.getItem('swap-settings');
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        // Validate and merge with defaults
        const mergedSettings = {
          ...DEFAULT_SETTINGS,
          ...parsed,
          slippage: validateSlippage(parsed.slippage) ? parsed.slippage : DEFAULT_SETTINGS.slippage,
          deadline: validateDeadline(parsed.deadline) ? parsed.deadline : DEFAULT_SETTINGS.deadline,
        };
        setSettings(mergedSettings);
      }
      setIsInitialized(true);
    } catch (error) {
      console.error('Failed to load swap settings:', error);
      setSettings(DEFAULT_SETTINGS);
      setIsInitialized(true);
    }
  }, []);

  // Save settings to localStorage whenever they change
  useEffect(() => {
    if (isInitialized) {
      try {
        localStorage.setItem('swap-settings', JSON.stringify(settings));
      } catch (error) {
        console.error('Failed to save swap settings:', error);
      }
    }
  }, [settings, isInitialized]);

  const updateSlippage = useCallback((newSlippage) => {
    if (validateSlippage(newSlippage)) {
      setSettings(prev => ({
        ...prev,
        slippage: newSlippage,
        customSlippage: true,
      }));
      return true;
    }
    return false;
  }, []);

  const updateDeadline = useCallback((newDeadline) => {
    if (validateDeadline(newDeadline)) {
      setSettings(prev => ({
        ...prev,
        deadline: newDeadline,
      }));
      return true;
    }
    return false;
  }, []);

  const toggleExpertMode = useCallback(() => {
    setSettings(prev => ({
      ...prev,
      expertMode: !prev.expertMode,
    }));
  }, []);

  const toggleMultihops = useCallback(() => {
    setSettings(prev => ({
      ...prev,
      disableMultihops: !prev.disableMultihops,
    }));
  }, []);

  const toggleSound = useCallback(() => {
    setSettings(prev => ({
      ...prev,
      soundEnabled: !prev.soundEnabled,
    }));
  }, []);

  const changeTheme = useCallback((theme) => {
    if (['dark', 'light', 'auto'].includes(theme)) {
      setSettings(prev => ({
        ...prev,
        theme,
      }));
    }
  }, []);

  const changeTxSpeed = useCallback((speed) => {
    if (['standard', 'fast', 'instant'].includes(speed)) {
      setSettings(prev => ({
        ...prev,
        txSpeed: speed,
      }));
    }
  }, []);

  const resetToDefaults = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
  }, []);

  const resetSlippage = useCallback(() => {
    setSettings(prev => ({
      ...prev,
      slippage: DEFAULT_SETTINGS.slippage,
      customSlippage: false,
    }));
  }, []);

  // Get gas price based on selected speed (in wei)
  const getGasPrice = useCallback(() => {
    switch (settings.txSpeed) {
      case 'instant':
        return 2; // 2x base fee (simplified)
      case 'fast':
        return 1.5; // 1.5x base fee
      case 'standard':
      default:
        return 1.2; // 1.2x base fee
    }
  }, [settings.txSpeed]);

  // Get recommended slippage based on token volatility
  const getRecommendedSlippage = useCallback((tokenSymbol) => {
    const stablecoins = ['USDC', 'USDT', 'DAI', 'BUSD'];
    const volatileTokens = ['ETH', 'BTC', 'SOL', 'AVAX'];
    
    if (stablecoins.includes(tokenSymbol)) {
      return 0.1; // 0.1% for stablecoins
    } else if (volatileTokens.includes(tokenSymbol)) {
      return 0.5; // 0.5% for major tokens
    } else {
      return 1.0; // 1% for other tokens
    }
  }, []);

  // Get swap settings with validation
  const getValidatedSettings = useCallback(() => {
    return {
      ...settings,
      slippage: validateSlippage(settings.slippage) ? settings.slippage : DEFAULT_SETTINGS.slippage,
      deadline: validateDeadline(settings.deadline) ? settings.deadline : DEFAULT_SETTINGS.deadline,
    };
  }, [settings]);

  // Calculate deadline timestamp (in seconds)
  const getDeadlineTimestamp = useCallback(() => {
    const validated = getValidatedSettings();
    return Math.floor(Date.now() / 1000) + (validated.deadline * 60);
  }, [getValidatedSettings]);

  // Calculate minimum amount out with slippage
  const calculateMinAmountOut = useCallback((amountOut) => {
    if (!amountOut || parseFloat(amountOut) <= 0) return '0';
    
    const validated = getValidatedSettings();
    const slippageMultiplier = 1 - (validated.slippage / 100);
    const minAmount = parseFloat(amountOut) * slippageMultiplier;
    
    return minAmount.toString();
  }, [getValidatedSettings]);

  // Export settings for backup
  const exportSettings = useCallback(() => {
    return JSON.stringify(settings, null, 2);
  }, [settings]);

  // Import settings from backup
  const importSettings = useCallback((importedSettings) => {
    try {
      const parsed = JSON.parse(importedSettings);
      if (parsed && typeof parsed === 'object') {
        // Validate imported settings
        const validSlippage = validateSlippage(parsed.slippage) ? parsed.slippage : DEFAULT_SETTINGS.slippage;
        const validDeadline = validateDeadline(parsed.deadline) ? parsed.deadline : DEFAULT_SETTINGS.deadline;
        
        setSettings({
          ...DEFAULT_SETTINGS,
          ...parsed,
          slippage: validSlippage,
          deadline: validDeadline,
        });
        return true;
      }
    } catch (error) {
      console.error('Failed to import settings:', error);
    }
    return false;
  }, []);

  return {
    // Current settings
    settings: getValidatedSettings(),
    isInitialized,
    
    // Update methods
    updateSlippage,
    updateDeadline,
    toggleExpertMode,
    toggleMultihops,
    toggleSound,
    changeTheme,
    changeTxSpeed,
    
    // Reset methods
    resetToDefaults,
    resetSlippage,
    
    // Calculations
    getGasPrice,
    getRecommendedSlippage,
    getDeadlineTimestamp,
    calculateMinAmountOut,
    
    // Import/Export
    exportSettings,
    importSettings,
    
    // Validation helpers
    validateSlippage,
    validateDeadline,
  };
};

// Settings modal component hook
export const useSettingsModal = () => {
  const [isOpen, setIsOpen] = useState(false);

  const openModal = useCallback(() => {
    setIsOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsOpen(false);
  }, []);

  const toggleModal = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);

  return {
    isOpen,
    openModal,
    closeModal,
    toggleModal,
  };
};

// Quick settings presets
export const SLIPPAGE_PRESETS = [0.1, 0.5, 1.0, 2.0, 3.0, 5.0];
export const DEADLINE_PRESETS = [10, 15, 20, 30, 60];

// Factory for creating settings with validation
export const createSwapSettings = (customSettings = {}) => {
  const baseSettings = { ...DEFAULT_SETTINGS, ...customSettings };
  
  return {
    ...baseSettings,
    slippage: validateSlippage(baseSettings.slippage) ? baseSettings.slippage : DEFAULT_SETTINGS.slippage,
    deadline: validateDeadline(baseSettings.deadline) ? baseSettings.deadline : DEFAULT_SETTINGS.deadline,
  };
};

