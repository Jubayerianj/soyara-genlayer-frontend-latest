// lib/providers.js
import { ethers } from 'ethers';
import { GenLayer } from '../wagmi.config';

// List of reliable RPC endpoints for GenLayer Testnet
export const RPC_ENDPOINTS = {
  [GenLayer.id]: [
    'https://rpc.testnet-chain.genlayer.com',
  ],
};

// Backward compatibility alias
export const LitVM = GenLayer;

// Get working RPC endpoint for a specific chain
const getWorkingRPC = async (chainId = GenLayer.id) => {
  const endpoints = RPC_ENDPOINTS[chainId] || RPC_ENDPOINTS[GenLayer.id];
  
  for (const endpoint of endpoints) {
    try {
      const provider = new ethers.JsonRpcProvider(endpoint);
      await provider.getNetwork();
      return endpoint;
    } catch (err) {
      console.warn(`Failed to connect to ${endpoint} for chain ${chainId}:`, err.message);
      continue;
    }
  }
  return 'https://rpc.testnet-chain.genlayer.com';
};

const providerInstances = {};

export const getProvider = async (chainId = GenLayer.id) => {
  if (!providerInstances[chainId]) {
    const rpcUrl = await getWorkingRPC(chainId);
    
    const chainConfig = {
      name: GenLayer.name,
      chainId: GenLayer.id,
      nativeCurrency: GenLayer.nativeCurrency,
    };
    
    providerInstances[chainId] = new ethers.JsonRpcProvider(rpcUrl, chainConfig);
    
    providerInstances[chainId].on('error', (error) => {
      console.error(`Provider error for chain ${chainId}:`, error);
      delete providerInstances[chainId];
    });
  }
  return providerInstances[chainId];
};

export const getBrowserProvider = (chainId = GenLayer.id) => {
  if (typeof window !== 'undefined' && window.ethereum) {
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      
      const switchToChain = async () => {
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: `0x${chainId.toString(16)}` }],
          });
        } catch (switchError) {
          if (switchError.code === 4902) {
            try {
              const params = {
                chainId: `0x${GenLayer.id.toString(16)}`,
                chainName: GenLayer.name,
                nativeCurrency: GenLayer.nativeCurrency,
                rpcUrls: GenLayer.rpcUrls.default.http,
                blockExplorerUrls: [GenLayer.blockExplorers.default.url],
              };
              
              await window.ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [params],
              });
            } catch (addError) {
              console.error('Failed to add chain:', addError);
            }
          }
          console.error('Failed to switch chain:', switchError);
        }
      };
      
      return {
        provider,
        switchToChain,
      };
    } catch (error) {
      console.error('Error creating browser provider:', error);
      return null;
    }
  }
  return null;
};

export const getCurrentProvider = async () => {
  if (typeof window !== 'undefined' && window.ethereum) {
    try {
      const browserProvider = getBrowserProvider();
      if (browserProvider) {
        return browserProvider.provider;
      }
    } catch (error) {
      console.error('Error getting browser provider:', error);
    }
  }
  
  return getProvider(GenLayer.id);
};

export const getChainInfo = (chainId) => {
  return {
    name: GenLayer.name,
    symbol: GenLayer.nativeCurrency.symbol,
    explorer: GenLayer.blockExplorers.default.url,
    testnet: GenLayer.testnet,
  };
};

export const isCorrectNetwork = async (desiredChainId = GenLayer.id) => {
  try {
    if (typeof window !== 'undefined' && window.ethereum) {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const network = await provider.getNetwork();
      return network.chainId === BigInt(desiredChainId);
    }
    return false;
  } catch (error) {
    console.error('Error checking network:', error);
    return false;
  }
};

export const addGenLayerToWallet = async () => {
  if (typeof window !== 'undefined' && window.ethereum) {
    try {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: `0x${GenLayer.id.toString(16)}`,
          chainName: GenLayer.name,
          nativeCurrency: GenLayer.nativeCurrency,
          rpcUrls: GenLayer.rpcUrls.default.http,
          blockExplorerUrls: [GenLayer.blockExplorers.default.url],
        }],
      });
      return true;
    } catch (error) {
      console.error('Failed to add GenLayer to wallet:', error);
      return false;
    }
  }
  return false;
};

export const switchToGenLayer = async () => {
  if (typeof window !== 'undefined' && window.ethereum) {
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${GenLayer.id.toString(16)}` }],
      });
      return true;
    } catch (error) {
      if (error.code === 4902) {
        return await addGenLayerToWallet();
      }
      console.error('Failed to switch to GenLayer:', error);
      return false;
    }
  }
  return false;
};