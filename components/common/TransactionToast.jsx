import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Check, 
  X, 
  Loader2, 
  AlertTriangle, 
  ExternalLink,
  AlertCircle,
  Info
} from 'lucide-react';

const TransactionToast = ({ 
  status,
  onClose,
  autoDismiss = true
}) => {
  const [isVisible, setIsVisible] = useState(true);
  const [progress, setProgress] = useState(100);

  // Auto dismiss logic
  useEffect(() => {
    if (!autoDismiss || status.status === 'pending') return;

    const dismissDelay = status.status === 'success' ? 5000 : 8000;
    
    // Progress bar animation
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

  // Get status configuration
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

  // Format transaction hash
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
            {/* Header */}
            <div className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-3">
                  <div className={`${config.iconBg} ${config.iconColor} p-2 rounded-lg`}>
                    {config.icon}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-white">{config.title}</h3>
                    <p className="text-sm text-gray-300 mt-1">{config.message}</p>
                    

                    {/* Transaction Hash */}
                    {status.txHash && (
                      <div className="mt-3">
                        <a
                          href={`https://liteforge.explorer.caldera.xyz/tx/${status.txHash}`}
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
                
                <button
                  onClick={handleClose}
                  className="text-gray-400 hover:text-white ml-2"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            {/* Progress Bar (for auto-dismiss) */}
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

export default TransactionToast;