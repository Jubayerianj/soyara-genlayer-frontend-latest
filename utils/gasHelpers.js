
// utils/gasHelpers.js

import { GasUtils } from '../constants/gas';

export const gasHelpers = {
  // Get network-specific gas configuration
  getNetworkGasConfig: (chainId) => {
    return GasUtils.getConfig(chainId);
  },

  // Calculate appropriate gas for transaction
  calculateTransactionGas: async (publicClient, chainId, transactionConfig) => {
    try {
      // Try to estimate gas
      const estimatedGas = await GasUtils.estimateWithRetry(
        publicClient,
        transactionConfig,
        chainId
      );
      
      // Calculate final gas with buffer
      const finalGas = GasUtils.calculateGas(
        estimatedGas,
        chainId,
        GasUtils.getOperationFromFunction(transactionConfig.functionName)
      );
      
      // Log gas info
      GasUtils.logGasInfo(
        chainId,
        transactionConfig.functionName,
        estimatedGas,
        finalGas
      );
      
      return finalGas;
    } catch (error) {
      console.error('❌ Gas calculation failed:', error);
      
      // Fallback to base gas
      const config = GasUtils.getConfig(chainId);
      const operation = GasUtils.getOperationFromFunction(transactionConfig.functionName);
      const baseGas = config.baseGas[operation] || config.baseGas.default;
      
      console.warn(`⚠ Using fallback base gas: ${baseGas.toString()} for ${operation}`);
      return baseGas;
    }
  },

  // Check if gas is sufficient for network
  validateGasForNetwork: (chainId, estimatedGas) => {
    const config = GasUtils.getConfig(chainId);
    
    if (estimatedGas > config.maxGas) {
      return {
        valid: false,
        message: `Estimated gas (${estimatedGas.toString()}) exceeds network limit (${config.maxGas.toString()})`,
        maxAllowed: config.maxGas,
      };
    }
    
    return {
      valid: true,
      message: `Gas within limits for ${config.name}`,
      maxAllowed: config.maxGas,
    };
  },

  // Format gas for display
  formatGas: (gasAmount) => {
    if (!gasAmount) return '0';
    
    const amount = typeof gasAmount === 'bigint' ? gasAmount : BigInt(gasAmount);
    
    if (amount < 1000n) return amount.toString();
    if (amount < 1000000n) return `${(Number(amount) / 1000).toFixed(1)}K`;
    if (amount < 1000000000n) return `${(Number(amount) / 1000000).toFixed(1)}M`;
    return `${(Number(amount) / 1000000000).toFixed(2)}B`;
  },
};