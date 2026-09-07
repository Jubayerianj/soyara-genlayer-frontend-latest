import { useState, useEffect, useCallback } from 'react';

const rpcEndpoints = {
  // LitVM Network
  4441: [
    'https://liteforge.rpc.caldera.xyz/infra-partner-http',
    'https://LitVM-oro-rpc.publicnode.com',
    'https://LitVM-oro-testnet-rpc.polkachu.com',
  ],
  // Sepolia (keep for reference)
  11155111: [
    'https://sepolia.gateway.tenderly.co',
    'https://eth-sepolia.g.alchemy.com/v2/demo',
    'https://rpc.sepolia.org',
    'https://sepolia.infura.io/v3/',
  ],
  // Mainnet (keep for reference)
  1: [
    'https://eth.llamarpc.com',
    'https://eth-mainnet.g.alchemy.com/v2/demo',
    'https://rpc.ankr.com/eth',
  ]
};

export const useRpcFallback = (chainId) => {
  const [currentEndpoint, setCurrentEndpoint] = useState(0);
  const [isHealthy, setIsHealthy] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const testRpcHealth = useCallback(async (endpoint) => {
    try {
      setIsLoading(true);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_blockNumber',
          params: [],
          id: 1,
        }),
      });
      
      const data = await response.json();
      return data && data.result;
    } catch (error) {
      console.error(`RPC endpoint ${endpoint} is unhealthy:`, error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const switchToNextEndpoint = useCallback(async () => {
    if (!chainId) return;
    
    const endpoints = rpcEndpoints[chainId];
    
    if (!endpoints || endpoints.length <= 1) return;
    
    const nextIndex = (currentEndpoint + 1) % endpoints.length;
    const nextEndpoint = endpoints[nextIndex];
    
    const isHealthy = await testRpcHealth(nextEndpoint);
    
    if (isHealthy) {
      setCurrentEndpoint(nextIndex);
      setIsHealthy(true);
      console.log(`Switched to RPC endpoint: ${nextEndpoint}`);
    } else {
      // Try the next one after delay
      setTimeout(() => switchToNextEndpoint(), 1000);
    }
  }, [chainId, currentEndpoint, testRpcHealth]);

  useEffect(() => {
    if (!chainId) return;
    
    const checkHealth = async () => {
      const endpoints = rpcEndpoints[chainId];
      
      if (!endpoints || endpoints.length === 0) {
        console.warn(`No RPC endpoints configured for chain ${chainId}`);
        return;
      }
      
      const currentUrl = endpoints[currentEndpoint];
      const healthy = await testRpcHealth(currentUrl);
      
      if (!healthy) {
        setIsHealthy(false);
        console.warn(`Current RPC endpoint unhealthy: ${currentUrl}`);
        await switchToNextEndpoint();
      } else {
        setIsHealthy(true);
      }
    };
    
    // Check health every 30 seconds
    const interval = setInterval(checkHealth, 30000);
    checkHealth(); // Initial check
    
    return () => clearInterval(interval);
  }, [chainId, currentEndpoint, testRpcHealth, switchToNextEndpoint]);

  const getCurrentEndpoint = () => {
    const endpoints = rpcEndpoints[chainId];
    return endpoints ? endpoints[currentEndpoint] : '';
  };

  const getEndpointsForChain = () => {
    return rpcEndpoints[chainId] || [];
  };

  const manuallySwitchEndpoint = async (index) => {
    if (!chainId) return;
    
    const endpoints = rpcEndpoints[chainId];
    if (!endpoints || index >= endpoints.length) return;
    
    const endpoint = endpoints[index];
    const healthy = await testRpcHealth(endpoint);
    
    if (healthy) {
      setCurrentEndpoint(index);
      setIsHealthy(true);
      return true;
    }
    return false;
  };

  return {
    currentEndpoint: getCurrentEndpoint(),
    isHealthy,
    isLoading,
    switchToNextEndpoint,
    manuallySwitchEndpoint,
    endpoints: getEndpointsForChain(),
    currentIndex: currentEndpoint,
  };
};

// LitVM specific RPC helper
export const useLitVMRpc = () => {
  const LitVMRpc = useRpcFallback(4441);
  
  return {
    ...LitVMRpc,
    // LitVM specific methods
    addLitVMToWallet: async () => {
      try {
        if (window.ethereum) {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: '0x538', // 4441 in hex
              chainname: 'Ethereum',
              nativeCurrency: {
                name: 'ETH',
                symbol: 'ETH',
                decimals: 18
              },
              rpcUrls: [LitVMRpc.currentEndpoint || 'https://liteforge.rpc.caldera.xyz/infra-partner-http'],
              blockExplorerUrls: ['https://liteforge.explorer.caldera.xyz/']
            }]
          });
          return true;
        }
      } catch (error) {
        console.error('Failed to add LitVM to wallet:', error);
        return false;
      }
    }
  };
};