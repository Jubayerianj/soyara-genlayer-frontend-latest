// contexts/TokenContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAccount, useChainId } from 'wagmi';
import { createPublicClient, http, parseAbi } from 'viem';


// Define LitVM Network
const LitVM = {
  id: 4441,
  name: 'Ethereum',
  network: 'Ethereum',
  nativeCurrency: {
    name: 'ETH',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://liteforge.rpc.caldera.xyz/infra-partner-http'],
    },
  },
  blockExplorers: {
    default: {
      name: 'LitVM Explorer',
      url: 'https://liteforge.explorer.caldera.xyz/',
    },
  },

};

const ERC20_ABI = parseAbi([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)'
]);

const publicClient = createPublicClient({
  chain: LitVM,
  transport: http('https://liteforge.rpc.caldera.xyz/infra-partner-http')
});

const TokenContext = createContext(null);

export const TokenProvider = ({ children }) => {
  const { address } = useAccount();
  const chainId = useChainId();
  const [customTokens, setCustomTokens] = useState([]);
  const [customPairs, setCustomPairs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load custom tokens and pairs from localStorage
  useEffect(() => {
    if (!address || chainId !== LitVM.id) return;
    
    try {
      const storedTokens = localStorage.getItem(`custom_tokens_${chainId}_${address}`);
      if (storedTokens) {
        setCustomTokens(JSON.parse(storedTokens));
      }

      const storedPairs = localStorage.getItem(`custom_pairs_${chainId}_${address}`);
      if (storedPairs) {
        setCustomPairs(JSON.parse(storedPairs));
      }
      setIsLoaded(true);
    } catch (error) {
      console.error('Error loading custom data:', error);
      setIsLoaded(true);
    }
  }, [address, chainId]);

  // Save custom tokens to localStorage
  useEffect(() => {
    if (!address || chainId !== LitVM.id || !isLoaded) return;
    
    try {
      localStorage.setItem(
        `custom_tokens_${chainId}_${address}`,
        JSON.stringify(customTokens)
      );
    } catch (error) {
      console.error('Error saving custom tokens:', error);
    }
  }, [customTokens, address, chainId, isLoaded]);

  // Save custom pairs to localStorage
  useEffect(() => {
    if (!address || chainId !== LitVM.id || !isLoaded) return;
    
    try {
      localStorage.setItem(
        `custom_pairs_${chainId}_${address}`,
        JSON.stringify(customPairs)
      );
    } catch (error) {
      console.error('Error saving custom pairs:', error);
    }
  }, [customPairs, address, chainId, isLoaded]);

  const validateTokenAddress = (address) => {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  };

  const getTokenLogo = async (symbol, address) => {
    const sources = [
      `https://liteforge.explorer.caldera.xyz/token/${address}`,
      `https://tokens.1inch.io/${address}.png`,
      `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/${address}/logo.png`,
      `https://api.coingecko.com/api/v3/coins/ethereum/contract/${address}`
    ];

    for (const source of sources) {
      try {
        const response = await fetch(source, { method: 'HEAD' });
        if (response.ok) {
          return source;
        }
      } catch (error) {
        continue;
      }
    }

    return `https://ui-avatars.com/api/?name=${symbol}&background=random&color=fff&size=128`;
  };

  const getTokenInfo = useCallback(async (address) => {
    try {
      const [name, symbol, decimals] = await Promise.all([
        publicClient.readContract({
          address,
          abi: ERC20_ABI,
          functionName: 'name'
        }).catch(() => 'Unknown Token'),
        
        publicClient.readContract({
          address,
          abi: ERC20_ABI,
          functionName: 'symbol'
        }).catch(() => 'UNKNOWN'),
        
        publicClient.readContract({
          address,
          abi: ERC20_ABI,
          functionName: 'decimals'
        }).catch(() => 18)
      ]);

      const logoURI = await getTokenLogo(symbol, address);

      return {
        address: address.toLowerCase(),
        name: name || 'Unknown Token',
        symbol: symbol || 'UNKNOWN',
        decimals: Number(decimals) || 18,
        logoURI,
        isCustom: true,
        isVerified: false
      };
    } catch (error) {
      console.error('Error fetching token info:', error);
      throw new Error('Failed to fetch token information');
    }
  }, []);

  const addCustomToken = useCallback(async (address) => {
    if (!validateTokenAddress(address)) {
      throw new Error('Invalid token address format');
    }

    const normalizedAddress = address.toLowerCase();
    
    if (customTokens.some(token => token.address === normalizedAddress)) {
      throw new Error('Token already imported');
    }

    setIsLoading(true);
    try {
      const tokenInfo = await getTokenInfo(normalizedAddress);
      
      const newToken = {
        ...tokenInfo,
        addedAt: Date.now()
      };

      setCustomTokens(prev => [...prev, newToken]);
      return newToken;
    } catch (error) {
      console.error('Error adding custom token:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [customTokens, getTokenInfo]);

  const removeCustomToken = useCallback((address) => {
    const normalizedAddress = address.toLowerCase();
    setCustomTokens(prev => prev.filter(token => token.address !== normalizedAddress));
  }, []);

  const addCustomPair = useCallback((tokenA, tokenB) => {
    const [a, b] = [tokenA.address.toLowerCase(), tokenB.address.toLowerCase()].sort();
    const key = `${a}:${b}`;
    
    if (customPairs.some(p => p.key === key)) {
      return;
    }

    const newPair = {
      key,
      tokenA,
      tokenB,
      isCustom: true,
      addedAt: Date.now()
    };

    setCustomPairs(prev => [...prev, newPair]);
    return newPair;
  }, [customPairs]);

  const removeCustomPair = useCallback((key) => {
    setCustomPairs(prev => prev.filter(p => p.key !== key));
  }, []);

  const isTokenCustom = useCallback((address) => {
    if (!address) return false;
    return customTokens.some(token => token.address.toLowerCase() === address.toLowerCase());
  }, [customTokens]);

  const value = {
    customTokens,
    addCustomToken,
    removeCustomToken,
    customPairs,
    addCustomPair,
    removeCustomPair,
    isTokenCustom,
    isLoading
  };

  return (
    <TokenContext.Provider value={value}>
      {children}
    </TokenContext.Provider>
  );
};

export const useTokenContext = () => {
  const context = useContext(TokenContext);
  if (context === null) {
    throw new Error('useTokenContext must be used within a TokenProvider');
  }
  return context;
};
