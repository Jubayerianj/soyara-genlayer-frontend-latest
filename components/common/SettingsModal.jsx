// components/common/SettingsModal.jsx 

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Settings as SettingsIcon, 
  AlertTriangle,
  Bell,
  Zap,
  Globe,
  Volume2,
  Moon,
  Sun,
  Shield,
  Clock,
  Check,
  RefreshCw,
  Download,
  Upload
} from 'lucide-react';
import { useSwapSettings, SLIPPAGE_PRESETS, DEADLINE_PRESETS } from '../../hooks/swap/useSwapSettings';

const SettingsModal = ({ isOpen, onClose }) => {
  const {
    settings,
    updateSlippage,
    updateDeadline,
    toggleExpertMode,
    toggleMultihops,
    toggleSound,
    changeTheme,
    changeTxSpeed,
    resetToDefaults,
    resetSlippage,
    exportSettings,
    importSettings
  } = useSwapSettings();

  const [importData, setImportData] = useState('');
  const [showImportError, setShowImportError] = useState(false);
  const [showExportSuccess, setShowExportSuccess] = useState(false);

  const handleImport = () => {
    if (importSettings(importData)) {
      setImportData('');
      setShowImportError(false);
    } else {
      setShowImportError(true);
    }
  };

  const handleExport = () => {
    const settingsJson = exportSettings();
    navigator.clipboard.writeText(settingsJson);
    setShowExportSuccess(true);
    setTimeout(() => setShowExportSuccess(false), 2000);
  };

  // Inline styles
  const styles = {
    // Global animations
    animations: {
      '@keyframes spin': {
        from: { transform: 'rotate(0deg)' },
        to: { transform: 'rotate(360deg)' }
      },
      '@keyframes pulse': {
        '0%, 100%': { opacity: 1 },
        '50%': { opacity: 0.7 }
      },
      '@keyframes pulse-danger': {
        '0%, 100%': { 
          opacity: 1,
          transform: 'scale(1)'
        },
        '50%': { 
          opacity: 0.8,
          transform: 'scale(1.02)'
        }
      },
      '@keyframes fadeIn': {
        from: { opacity: 0, transform: 'translateY(-10px)' },
        to: { opacity: 1, transform: 'translateY(0)' }
      },
      '@keyframes shake': {
        '0%, 100%': { transform: 'translateX(0)' },
        '25%': { transform: 'translateX(-2px)' },
        '75%': { transform: 'translateX(2px)' }
      }
    },

    // Icon style functions with vibrant colors
    getIconStyle: (color, size = 20) => ({
      width: `${size}px`,
      height: `${size}px`,
      color: color,
      transition: 'all 0.3s ease',
      filter: 'drop-shadow(0px 2px 3px rgba(0, 0, 0, 0.2))'
    }),

    getHoverIconStyle: (color) => ({
      transform: 'scale(1.15)',
      filter: `drop-shadow(0px 3px 6px ${color}40)`
    }),

    // Color palette
    colors: {
      primary: '#0284c7',
      secondary: '#38bdf8',
      warning: '#64748b',
      danger: '#ef4444',
      info: '#3b82f6',
      success: '#38bdf8',
      light: '#ffffff',
      dark: '#03050a',
      accent1: '#60a5fa',
      accent2: '#0284c7',
    },

    // Layout styles
    modalOverlay: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '16px',
      backdropFilter: 'blur(4px)'
    },

    modalContent: {
      background: 'linear-gradient(145deg, #080e1e, #03050a)',
      border: '1px solid rgba(56, 189, 248, 0.2)',
      borderRadius: '24px',
      width: '100%',
      maxWidth: '480px',
      maxHeight: '80vh',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)'
    },

    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '24px 24px 16px',
      borderBottom: '1px solid rgba(56, 189, 248, 0.12)'
    },

    content: {
      flex: 1,
      overflowY: 'auto',
      padding: '24px'
    },

    section: {
      marginBottom: '32px'
    },

    sectionHeader: {
      display: 'flex',
      alignItems: 'center',
      marginBottom: '16px',
      gap: '12px'
    },

    sectionTitle: {
      fontSize: '16px',
      fontWeight: 600,
      color: 'white',
      flex: 1
    },

    // Button and input styles
    getPresetButtonStyle: (isActive, type = 'slippage') => {
      const baseStyle = {
        padding: '8px 16px',
        background: 'rgba(255, 255, 255, 0.05)',
        color: '#94a3b8',
        border: '1px solid transparent',
        borderRadius: '8px',
        fontSize: '14px',
        fontWeight: 500,
        cursor: 'pointer',
        transition: 'all 0.3s ease'
      };
      
      if (isActive) {
        return {
          ...baseStyle,
          background: 'rgba(2, 132, 199, 0.2)',
          color: '#38bdf8',
          borderColor: '#0284c7',
          boxShadow: '0 0 10px rgba(2, 132, 199, 0.3)'
        };
      }
      
      return baseStyle;
    },

    getToggleSwitchStyle: (isActive) => ({
      width: '44px',
      height: '24px',
      background: isActive ? styles.colors.secondary : '#2d2d4d',
      border: `1px solid ${isActive ? styles.colors.secondary : '#4d4d7d'}`,
      borderRadius: '12px',
      position: 'relative',
      cursor: 'pointer',
      transition: 'all 0.3s ease',
      boxShadow: isActive ? `0 0 8px ${styles.colors.secondary}40` : 'none'
    }),

    getToggleKnobStyle: (isActive) => ({
      position: 'absolute',
      top: '2px',
      left: isActive ? 'calc(100% - 20px)' : '2px',
      width: '18px',
      height: '18px',
      background: 'white',
      borderRadius: '50%',
      transition: 'transform 0.3s ease',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.3)'
    }),

    // Warning and error styles
    warningMessage: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px',
      background: 'rgba(245, 158, 11, 0.1)',
      border: `1px solid ${styles.colors.warning}50`,
      borderRadius: '6px',
      color: styles.colors.warning,
      fontSize: '12px',
      animation: 'pulse 2s infinite'
    },

    dangerMessage: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px',
      background: 'rgba(239, 68, 68, 0.1)',
      border: `1px solid ${styles.colors.danger}50`,
      borderRadius: '6px',
      color: styles.colors.danger,
      fontSize: '12px',
      animation: 'pulse-danger 1s infinite'
    },

    // Input container style
    inputContainer: {
      display: 'flex',
      alignItems: 'center',
      background: '#2d2d4d',
      border: '1px solid transparent',
      borderRadius: '8px',
      overflow: 'hidden',
      transition: 'all 0.3s ease'
    },

    // Transaction speed button style
    getTxSpeedButtonStyle: (isActive) => ({
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '12px 16px',
      background: isActive ? 'rgba(251, 191, 36, 0.2)' : '#2d2d4d',
      border: `1px solid ${isActive ? styles.colors.light : 'transparent'}`,
      borderRadius: '8px',
      color: isActive ? styles.colors.light : '#8a8ab5',
      cursor: 'pointer',
      transition: 'all 0.3s ease',
      boxShadow: isActive ? `0 0 10px ${styles.colors.light}30` : 'none'
    }),

    // Expert mode warning
    expertModeWarning: {
      marginTop: '16px',
      padding: '16px',
      background: 'rgba(239, 68, 68, 0.1)',
      border: `1px solid ${styles.colors.danger}30`,
      borderRadius: '8px',
      animation: 'fadeIn 0.5s ease'
    },

    // Import/Export styles
    exportButton: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '12px 16px',
      background: 'rgba(16, 185, 129, 0.1)',
      color: styles.colors.secondary,
      border: `1px solid ${styles.colors.secondary}30`,
      borderRadius: '8px',
      fontSize: '14px',
      fontWeight: 500,
      cursor: 'pointer',
      transition: 'all 0.3s ease'
    },

    importButton: {
      padding: '12px 24px',
      background: 'rgba(139, 92, 246, 0.1)',
      color: styles.colors.primary,
      border: `1px solid ${styles.colors.primary}30`,
      borderRadius: '8px',
      fontSize: '14px',
      fontWeight: 500,
      cursor: 'pointer',
      transition: 'all 0.3s ease'
    },

    // Reset button
    resetButton: {
      width: '100%',
      padding: '12px 16px',
      background: 'rgba(239, 68, 68, 0.1)',
      color: styles.colors.danger,
      border: `1px solid ${styles.colors.danger}30`,
      borderRadius: '8px',
      fontSize: '14px',
      fontWeight: 500,
      cursor: 'pointer',
      transition: 'all 0.3s ease'
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={styles.modalOverlay}
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, y: 20, opacity: 0 }}
            style={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header with animated close button */}
            <div style={styles.header}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <SettingsIcon style={styles.getIconStyle(styles.colors.primary, 24)} />
                <h2 style={{ 
                  fontSize: '20px', 
                  fontWeight: 600, 
                  color: 'white',
                  background: 'linear-gradient(45deg, #0284c7, #38bdf8)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent'
                }}>
                  Settings
                </h2>
              </div>
              <button
                onClick={onClose}
                style={{
                  padding: '8px',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                  e.currentTarget.style.transform = 'scale(1.1)';
                  const icon = e.currentTarget.querySelector('svg');
                  if (icon) {
                    icon.style.transform = 'rotate(90deg)';
                    icon.style.color = styles.colors.danger;
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.transform = 'scale(1)';
                  const icon = e.currentTarget.querySelector('svg');
                  if (icon) {
                    icon.style.transform = 'rotate(0deg)';
                    icon.style.color = 'white';
                  }
                }}
              >
                <X style={{
                  width: '20px',
                  height: '20px',
                  color: 'white',
                  transition: 'transform 0.3s ease, color 0.3s ease'
                }} />
              </button>
            </div>

            {/* Content */}
            <div style={styles.content}>
              {/* Slippage Tolerance */}
              <div style={styles.section}>
                <div style={styles.sectionHeader}>
                  <Shield 
                    style={styles.getIconStyle(styles.colors.secondary)}
                    onMouseEnter={(e) => {
                      Object.assign(e.currentTarget.style, styles.getHoverIconStyle(styles.colors.secondary));
                    }}
                    onMouseLeave={(e) => {
                      Object.assign(e.currentTarget.style, styles.getIconStyle(styles.colors.secondary));
                    }}
                  />
                  <h3 style={styles.sectionTitle}>Slippage Tolerance</h3>
                  <button
                    onClick={resetSlippage}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      fontSize: '14px',
                      color: styles.colors.info,
                      cursor: 'pointer',
                      transition: 'all 0.3s ease',
                      padding: '4px 8px',
                      borderRadius: '4px'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = styles.colors.primary;
                      e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = styles.colors.info;
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    Reset
                  </button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
                  {SLIPPAGE_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      onClick={() => updateSlippage(preset)}
                      style={styles.getPresetButtonStyle(settings.slippage === preset, 'slippage')}
                      onMouseEnter={(e) => {
                        if (settings.slippage !== preset) {
                          e.currentTarget.style.background = '#e1e1f1ff';
                          e.currentTarget.style.color = 'white';
                          e.currentTarget.style.transform = 'translateY(-2px)';
                          e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (settings.slippage !== preset) {
                          const baseStyle = styles.getPresetButtonStyle(false, 'slippage');
                          Object.assign(e.currentTarget.style, baseStyle);
                        }
                      }}
                    >
                      {preset}%
                    </button>
                  ))}
                </div>
                <div style={{
                  ...styles.inputContainer,
                  marginBottom: '8px'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = styles.colors.secondary;
                  e.currentTarget.style.boxShadow = `0 0 10px ${styles.colors.secondary}30`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'transparent';
                  e.currentTarget.style.boxShadow = 'none';
                }}
                >
                  <input
                    type="text"
                    value={settings.slippage}
                    onChange={(e) => updateSlippage(e.target.value)}
                    style={{
                      flex: 1,
                      background: 'transparent',
                      border: 'none',
                      color: 'white',
                      padding: '12px 16px',
                      fontSize: '14px',
                      minWidth: 0
                    }}
                    onFocus={(e) => e.currentTarget.style.outline = 'none'}
                  />
                  <span style={{
                    padding: '12px 16px',
                    background: 'rgba(255, 255, 255, 0.1)',
                    color: '#8a8ab5',
                    fontSize: '14px',
                    transition: 'all 0.3s ease'
                  }}>
                    %
                  </span>
                </div>
                {settings.slippage < 0.5 && (
                  <div style={styles.warningMessage}>
                    <AlertTriangle style={styles.getIconStyle(styles.colors.warning, 16)} />
                    <span>Your transaction may fail</span>
                  </div>
                )}
                {settings.slippage > 5 && (
                  <div style={styles.dangerMessage}>
                    <AlertTriangle style={styles.getIconStyle(styles.colors.danger, 16)} />
                    <span>High slippage tolerance</span>
                  </div>
                )}
              </div>

              {/* Transaction Deadline */}
              <div style={styles.section}>
                <div style={styles.sectionHeader}>
                  <Clock 
                    style={styles.getIconStyle(styles.colors.warning)}
                    onMouseEnter={(e) => {
                      Object.assign(e.currentTarget.style, styles.getHoverIconStyle(styles.colors.warning));
                    }}
                    onMouseLeave={(e) => {
                      Object.assign(e.currentTarget.style, styles.getIconStyle(styles.colors.warning));
                    }}
                  />
                  <h3 style={styles.sectionTitle}>Transaction Deadline</h3>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
                  {DEADLINE_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      onClick={() => updateDeadline(preset)}
                      style={styles.getPresetButtonStyle(settings.deadline === preset, 'deadline')}
                      onMouseEnter={(e) => {
                        if (settings.deadline !== preset) {
                          e.currentTarget.style.background = '#3d3d5d';
                          e.currentTarget.style.color = 'white';
                          e.currentTarget.style.transform = 'translateY(-2px)';
                          e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (settings.deadline !== preset) {
                          const baseStyle = styles.getPresetButtonStyle(false, 'deadline');
                          Object.assign(e.currentTarget.style, baseStyle);
                        }
                      }}
                    >
                      {preset}m
                    </button>
                  ))}
                </div>
                <div style={styles.inputContainer}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = styles.colors.warning;
                  e.currentTarget.style.boxShadow = `0 0 10px ${styles.colors.warning}30`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'transparent';
                  e.currentTarget.style.boxShadow = 'none';
                }}
                >
                  <input
                    type="text"
                    value={settings.deadline}
                    onChange={(e) => updateDeadline(e.target.value)}
                    style={{
                      flex: 1,
                      background: 'transparent',
                      border: 'none',
                      color: 'white',
                      padding: '12px 16px',
                      fontSize: '14px',
                      minWidth: 0
                    }}
                    onFocus={(e) => e.currentTarget.style.outline = 'none'}
                  />
                  <span style={{
                    padding: '12px 16px',
                    background: 'rgba(255, 255, 255, 0.1)',
                    color: '#8a8ab5',
                    fontSize: '14px',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.3s ease'
                  }}>
                    minutes
                  </span>
                </div>
              </div>

              {/* Transaction Speed */}
              <div style={styles.section}>
                <div style={styles.sectionHeader}>
                  <Zap 
                    style={styles.getIconStyle(styles.colors.light)}
                    onMouseEnter={(e) => {
                      Object.assign(e.currentTarget.style, styles.getHoverIconStyle(styles.colors.light));
                    }}
                    onMouseLeave={(e) => {
                      Object.assign(e.currentTarget.style, styles.getIconStyle(styles.colors.light));
                    }}
                  />
                  <h3 style={styles.sectionTitle}>Transaction Speed</h3>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {['standard', 'fast', 'instant'].map((speed) => (
                    <button
                      key={speed}
                      onClick={() => changeTxSpeed(speed)}
                      style={styles.getTxSpeedButtonStyle(settings.txSpeed === speed)}
                      onMouseEnter={(e) => {
                        if (settings.txSpeed !== speed) {
                          e.currentTarget.style.background = '#bdbdedff';
                          e.currentTarget.style.color = 'white';
                          e.currentTarget.style.transform = 'translateX(4px)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (settings.txSpeed !== speed) {
                          e.currentTarget.style.background = '#2d2d4d';
                          e.currentTarget.style.color = '#8a8ab5';
                          e.currentTarget.style.transform = 'translateX(0)';
                        }
                      }}
                    >
                      <div style={{ fontWeight: 600, textTransform: 'capitalize' }}>{speed}</div>
                      <div style={{ fontSize: '12px', opacity: 0.8 }}>
                        {speed === 'standard' && '~30 seconds'}
                        {speed === 'fast' && '~15 seconds'}
                        {speed === 'instant' && '~5 seconds'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Interface Settings */}
              <div style={styles.section}>
                <div style={styles.sectionHeader}>
                  <Globe 
                    style={styles.getIconStyle(styles.colors.accent2)}
                    onMouseEnter={(e) => {
                      Object.assign(e.currentTarget.style, styles.getHoverIconStyle(styles.colors.accent2));
                    }}
                    onMouseLeave={(e) => {
                      Object.assign(e.currentTarget.style, styles.getIconStyle(styles.colors.accent2));
                    }}
                  />
                  <h3 style={styles.sectionTitle}>Interface Settings</h3>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', color: '#8a8ab5', fontSize: '14px' }}>
                      <Sun style={styles.getIconStyle(styles.colors.light, 16)} />
                      <span style={{ marginLeft: '8px' }}>Theme</span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {['dark', 'light', 'auto'].map((theme) => (
                        <button
                          key={theme}
                          onClick={() => changeTheme(theme)}
                          style={{
                            padding: '4px 12px',
                            background: settings.theme === theme ? 'rgba(34, 197, 94, 0.2)' : '#2d2d4d',
                            color: settings.theme === theme ? styles.colors.success : '#8a8ab5',
                            border: `1px solid ${settings.theme === theme ? styles.colors.success : 'transparent'}`,
                            borderRadius: '6px',
                            fontSize: '12px',
                            cursor: 'pointer',
                            transition: 'all 0.3s ease'
                          }}
                          onMouseEnter={(e) => {
                            if (settings.theme !== theme) {
                              e.currentTarget.style.background = '#3d3d5d';
                              e.currentTarget.style.color = 'white';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (settings.theme !== theme) {
                              e.currentTarget.style.background = '#2d2d4d';
                              e.currentTarget.style.color = '#8a8ab5';
                            }
                          }}
                        >
                          {theme.charAt(0).toUpperCase() + theme.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', color: '#8a8ab5', fontSize: '14px' }}>
                      <Volume2 style={styles.getIconStyle(styles.colors.info, 16)} />
                      <span style={{ marginLeft: '8px' }}>Transaction Sounds</span>
                    </div>
                    <button
                      onClick={toggleSound}
                      style={styles.getToggleSwitchStyle(settings.soundEnabled)}
                      onMouseEnter={(e) => {
                        if (settings.soundEnabled) {
                          e.currentTarget.style.boxShadow = `0 0 12px ${styles.colors.secondary}60`;
                        } else {
                          e.currentTarget.style.boxShadow = '0 0 8px rgba(255, 255, 255, 0.1)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.boxShadow = settings.soundEnabled ? 
                          `0 0 8px ${styles.colors.secondary}40` : 'none';
                      }}
                    >
                      <div style={styles.getToggleKnobStyle(settings.soundEnabled)} />
                    </button>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', color: '#8a8ab5', fontSize: '14px' }}>
                      <Bell style={styles.getIconStyle(styles.colors.accent1, 16)} />
                      <span style={{ marginLeft: '8px' }}>Notifications</span>
                    </div>
                    <button style={styles.getToggleSwitchStyle(true)}>
                      <div style={styles.getToggleKnobStyle(true)} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Expert Mode */}
              <div style={styles.section}>
                <div style={styles.sectionHeader}>
                  <AlertTriangle 
                    style={styles.getIconStyle(styles.colors.danger)}
                    onMouseEnter={(e) => {
                      Object.assign(e.currentTarget.style, styles.getHoverIconStyle(styles.colors.danger));
                      e.currentTarget.style.animation = 'shake 0.5s ease';
                    }}
                    onMouseLeave={(e) => {
                      Object.assign(e.currentTarget.style, styles.getIconStyle(styles.colors.danger));
                      e.currentTarget.style.animation = 'none';
                    }}
                  />
                  <h3 style={styles.sectionTitle}>Expert Mode</h3>
                  <button
                    onClick={toggleExpertMode}
                    style={styles.getToggleSwitchStyle(settings.expertMode)}
                    onMouseEnter={(e) => {
                      if (settings.expertMode) {
                        e.currentTarget.style.boxShadow = `0 0 12px ${styles.colors.danger}60`;
                      } else {
                        e.currentTarget.style.boxShadow = '0 0 8px rgba(239, 68, 68, 0.2)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.boxShadow = settings.expertMode ? 
                        `0 0 8px ${styles.colors.danger}40` : 'none';
                    }}
                  >
                    <div style={styles.getToggleKnobStyle(settings.expertMode)} />
                  </button>
                </div>
                {settings.expertMode && (
                  <div style={styles.expertModeWarning}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', color: '#8a8ab5', fontSize: '14px' }}>
                        <RefreshCw style={styles.getIconStyle(styles.colors.dark, 16)} />
                        <span style={{ marginLeft: '8px' }}>Disable Multihops</span>
                      </div>
                      <button
                        onClick={toggleMultihops}
                        style={styles.getToggleSwitchStyle(settings.disableMultihops)}
                      >
                        <div style={styles.getToggleKnobStyle(settings.disableMultihops)} />
                      </button>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', color: styles.colors.danger, fontSize: '12px', lineHeight: 1.4 }}>
                      <AlertTriangle style={styles.getIconStyle(styles.colors.danger, 16)} />
                      <span>Expert mode turns off confirmation prompts and allows high slippage trades. Use at your own risk.</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Import/Export */}
              <div style={styles.section}>
                <div style={styles.sectionHeader}>
                  <Download 
                    style={styles.getIconStyle('#9CA3AF')}
                    onMouseEnter={(e) => {
                      Object.assign(e.currentTarget.style, styles.getHoverIconStyle('#6B7280'));
                    }}
                    onMouseLeave={(e) => {
                      Object.assign(e.currentTarget.style, styles.getIconStyle('#9CA3AF'));
                    }}
                  />
                  <h3 style={styles.sectionTitle}>Backup Settings</h3>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <button
                    onClick={handleExport}
                    style={styles.exportButton}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(16, 185, 129, 0.2)';
                      e.currentTarget.style.borderColor = styles.colors.secondary;
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = `0 4px 12px ${styles.colors.secondary}30`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(16, 185, 129, 0.1)';
                      e.currentTarget.style.borderColor = `${styles.colors.secondary}30`;
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    {showExportSuccess ? (
                      <>
                        <Check style={{ ...styles.getIconStyle(styles.colors.success, 16), marginRight: '8px' }} />
                        <span>Copied to clipboard!</span>
                      </>
                    ) : (
                      <>
                        <Upload style={{ ...styles.getIconStyle(styles.colors.secondary, 16), marginRight: '8px' }} />
                        <span>Export Settings</span>
                      </>
                    )}
                  </button>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      value={importData}
                      onChange={(e) => setImportData(e.target.value)}
                      placeholder="Paste settings JSON"
                      style={{
                        flex: 1,
                        background: '#bbbbedff',
                        border: '1px solid transparent',
                        borderRadius: '8px',
                        padding: '12px 16px',
                        color: 'white',
                        fontSize: '14px',
                        transition: 'all 0.3s ease'
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.outline = 'none';
                        e.currentTarget.style.borderColor = styles.colors.primary;
                        e.currentTarget.style.boxShadow = `0 0 10px ${styles.colors.primary}30`;
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = 'transparent';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    />
                    <button
                      onClick={handleImport}
                      style={styles.importButton}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(139, 92, 246, 0.2)';
                        e.currentTarget.style.borderColor = styles.colors.primary;
                        e.currentTarget.style.transform = 'scale(1.05)';
                        e.currentTarget.style.boxShadow = `0 4px 12px ${styles.colors.primary}30`;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(139, 92, 246, 0.1)';
                        e.currentTarget.style.borderColor = `${styles.colors.primary}30`;
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      Import
                    </button>
                  </div>
                  {showImportError && (
                    <div style={{
                      ...styles.dangerMessage,
                      animation: 'shake 0.5s ease'
                    }}>
                      <AlertTriangle style={styles.getIconStyle(styles.colors.danger, 16)} />
                      <span>Invalid settings format</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Reset All */}
              <div style={styles.section}>
                <button
                  onClick={resetToDefaults}
                  style={styles.resetButton}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                    e.currentTarget.style.borderColor = styles.colors.danger;
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = `0 4px 12px ${styles.colors.danger}30`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                    e.currentTarget.style.borderColor = `${styles.colors.danger}30`;
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  Reset All Settings
                </button>
              </div>
            </div>

            {/* Global animations */}
            <style>
              {Object.entries(styles.animations).map(([key, value]) => {
                const css = Object.entries(value)
                  .map(([prop, val]) => {
                    if (typeof val === 'object') {
                      return Object.entries(val).map(([subProp, subVal]) => 
                        `${subProp}: ${subVal};`
                      ).join(' ');
                    }
                    return `${prop}: ${val};`;
                  })
                  .join(' ');
                return `${key} { ${css} }`;
              }).join('\n')}
              
              {`
                /* Smooth scrolling */
                .settings-content {
                  scroll-behavior: smooth;
                }

                /* Selection color */
                ::selection {
                  background: rgba(139, 92, 246, 0.3);
                  color: white;
                }

                /* Responsive adjustments */
                @media (max-width: 768px) {
                  .settings-modal-content {
                    border-radius: 16px;
                    max-width: 95%;
                  }
                  
                  .settings-header {
                    padding: 16px;
                  }
                  
                  .settings-content {
                    padding: 16px;
                  }
                  
                  button {
                    border-radius: 6px !important;
                  }
                  
                  input {
                    font-size: 14px !important;
                  }
                }
              `}
            </style>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SettingsModal;