// constants/gas.js - GENLAYER ONLY

// Network-specific gas configurations
export const GAS_CONFIG = {
  // GenLayer Testnet (Chain ID: 4221)
  4221: {
    name: 'GenLayer',
    maxGas: 50000000n,
    bufferPercentage: 25,
    baseGas: {
      addLiquidity: 5000000n,
      addLiquidityETH: 6000000n,
      createPool: 30000000n,
      approve: 1000000n,
      swap: 2000000n,
    },
    retryConfig: {
      maxRetries: 3,
      retryDelay: 1000,
    }
  },
  // Default configuration
  default: {
    name: 'GenLayer',
    maxGas: 50000000n,
    bufferPercentage: 25,
    baseGas: {
      addLiquidity: 5000000n,
      addLiquidityETH: 6000000n,
      createPool: 30000000n,
      approve: 1000000n,
      swap: 2000000n,
    },
    retryConfig: {
      maxRetries: 3,
      retryDelay: 1000,
    }
  }
};

// Gas calculation utilities
export class GasUtils {
  static getConfig(chainId) {
    return GAS_CONFIG[4221] || GAS_CONFIG.default;
  }

  static calculateGas(estimatedGas, chainId, operation = 'default') {
    const config = this.getConfig(chainId);
    
    // Use operation-specific base gas if estimation fails
    if (!estimatedGas || estimatedGas === 0n) {
      return config.baseGas[operation] || config.baseGas.addLiquidity;
    }

    // Apply buffer percentage
    const bufferGas = estimatedGas * (100n + BigInt(config.bufferPercentage)) / 100n;
    
    // Cap at max gas
    const finalGas = bufferGas > config.maxGas ? config.maxGas : bufferGas;
    
    console.log(`⛽ Gas calculation for ${config.name} (${chainId}):`, {
      operation,
      estimated: estimatedGas.toString(),
      bufferApplied: bufferGas.toString(),
      maxAllowed: config.maxGas.toString(),
      final: finalGas.toString(),
    });

    return finalGas;
  }

  static async estimateWithRetry(publicClient, config, chainId) {
    const gasConfig = this.getConfig(chainId);
    
    for (let i = 0; i < gasConfig.retryConfig.maxRetries; i++) {
      try {
        const estimated = await publicClient.estimateContractGas(config);
        console.log(`⛽ Gas estimate attempt ${i + 1} for ${chainId}: ${estimated.toString()}`);
        return estimated;
      } catch (error) {
        console.warn(`⚠ Gas estimation attempt ${i + 1} failed:`, error.message);
        
        if (i === gasConfig.retryConfig.maxRetries - 1) {
          const operation = this.getOperationFromFunction(config.functionName);
          console.log(`🔄 Using base gas for ${operation} on chain ${chainId}`);
          return gasConfig.baseGas[operation] || gasConfig.baseGas.default;
        }
        
        await new Promise(resolve => setTimeout(resolve, gasConfig.retryConfig.retryDelay));
      }
    }
  }

  static getOperationFromFunction(functionName) {
    const functionMap = {
      'addLiquidity': 'addLiquidity',
      'addLiquidityETH': 'addLiquidityETH',
      'createPair': 'createPool',
      'approve': 'approve',
      'swapExactTokensForTokens': 'swap',
      'swapExactETHForTokens': 'swap',
      'swapExactTokensForETH': 'swap',
      'removeLiquidity': 'removeLiquidity',
    };
    
    return functionMap[functionName] || 'default';
  }

  static logGasInfo(chainId, operation, estimatedGas, finalGas) {
    const config = this.getConfig(chainId);
    
    console.group(`📊 Gas Information for ${config.name} (${chainId})`);
    console.log(`Operation: ${operation}`);
    console.log(`Network: ${config.name}`);
    console.log(`Max Gas: ${config.maxGas.toString()}`);
    console.log(`Buffer: ${config.bufferPercentage}%`);
    console.log(`Estimated: ${estimatedGas?.toString() || 'N/A'}`);
    console.log(`Final: ${finalGas.toString()}`);
    console.groupEnd();
  }
}