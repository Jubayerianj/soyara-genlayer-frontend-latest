// hooks/useProvider.js
import { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { getProvider } from '../lib/providers';

// LitVM configuration
const LitVM_CONFIG = {
  chainId: 4441,
  name: 'Ethereum',
  rpcUrl: 'https://liteforge.rpc.caldera.xyz/infra-partner-http',
  nativeSymbol: 'ETH'
};

export const useProvider = () => {
  const [provider, setProvider] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    
    const initProvider = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // Try to get the provider from the lib
        let prov;
        try {
          prov = await getProvider();
        } catch (err) {
          console.log('getProvider failed, using fallback:', err);
          prov = null;
        }
        
        if (!prov) {
          // Fallback to LitVM public RPC
          prov = new ethers.JsonRpcProvider(LitVM_CONFIG.rpcUrl, {
            name: LitVM_CONFIG.name,
            chainId: LitVM_CONFIG.chainId,
          });
        }
        
        if (mounted) {
          setProvider(prov);
        }
      } catch (err) {
        console.error('Failed to initialize provider:', err);
        if (mounted) {
          setError(err.message);
          
          // Final fallback - try a different LitVM RPC
          try {
            const fallbackProvider = new ethers.JsonRpcProvider(
              'https://json-rpc.dos.sentry.testnet.v3.ETHvalidator.com',
              {
                name: LitVM_CONFIG.name,
                chainId: LitVM_CONFIG.chainId,
              }
            );
            setProvider(fallbackProvider);
          } catch (fallbackError) {
            console.error('Fallback provider also failed:', fallbackError);
          }
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    initProvider();

    return () => {
      mounted = false;
    };
  }, []);

  return { provider, isLoading, error };
};

// Helper function to create a provider for LitVM
export const createLitVMProvider = (signer = null) => {
  const provider = new ethers.JsonRpcProvider(LitVM_CONFIG.rpcUrl, {
    name: LitVM_CONFIG.name,
    chainId: LitVM_CONFIG.chainId,
  });
  
  if (signer && provider.getSigner) {
    return provider.getSigner();
  }
  
  return provider;
};

// Helper to check if connected to LitVM
export const isLitVM = (chainId) => {
  return chainId === LitVM_CONFIG.chainId;
};