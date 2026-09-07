// hooks/common/useTokens.js - UPDATED VERSION

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAccount, useChainId, useBalance, usePublicClient } from 'wagmi';
import { parseAbi } from 'viem';
import { useTokenAllowances } from './useTokenAllowance';
import { useTokenBalances } from '../liquidity/useTokenBalances';
import { getContractAddresses } from '../../constants/addresses';
import { getTokensForChain, findTokenByAddress } from '../../constants/tokens'; // ADDED IMPORT
import { addressesEqual } from '../../components/utils/ethers-safe';
import { ETHERS_CONSTANTS } from '../../constants/ethers';

// Define LitVM Network
const LitVM_ORO_TESTNET = {
  id: 4441,
  name: 'Ethereum',
  network: 'LitVM-oro-testnet',
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
      name: 'ETH Explorer',
      url: 'https://liteforge.explorer.caldera.xyz/',
    },
  },
  testnet: true,
};

// Default tokens based on chain - FIXED: Use getTokensForChain
const getDefaultTokens = (chainId) => {
  const ADDRESSES = getContractAddresses(chainId);
  const isLitVM = chainId === 4441;
  
  // Get ALL tokens from constants/tokens.js for this chain
  const tokensFromConstants = getTokensForChain(chainId);
  
  // If we have tokens from constants, return them
  if (tokensFromConstants && tokensFromConstants.length > 0) {
    console.log(`✅ Loaded ${tokensFromConstants.length} tokens from constants for chain ${chainId}:`, 
      tokensFromConstants.map(t => `${t.symbol} (${t.address})`));
    return tokensFromConstants;
  }
  
  // Fallback: If no tokens in constants, create basic ones
  console.log(`⚠ No tokens in constants for chain ${chainId}, creating basic tokens`);
  
  const defaultTokens = [
    {
      address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      symbol: isLitVM ? 'ETH' : 'ETH',
      name: isLitVM ? 'LitVM Native' : 'Ethereum',
      decimals: 18,
      isNative: true,
      logoURI: `https://ui-avatars.com/api/?name=${isLitVM ? 'ETH' : 'ETH'}&background=0e0e23&color=fff&size=128`,
      chainId,
      isPopular: true,
      isVerified: true,
    }
  ];
  
  // Add wrapped token if address exists
  if (ADDRESSES?.weth) {
    defaultTokens.push({
      address: ADDRESSES.weth,
      symbol: isLitVM ? 'WETH' : 'WETH',
      name: isLitVM ? 'Wrapped ETH' : 'Wrapped ETH',
      decimals: 18,
      isNative: false,
      logoURI: `https://ui-avatars.com/api/?name=${isLitVM ? 'WETH' : 'WETH'}&background=0e0e23&color=fff&size=128`,
      chainId,
      isPopular: true,
      isVerified: true,
    });
  }
  
  return defaultTokens;
};

// ERC20 ABI for reading token details
const ERC20_ABI = parseAbi([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
]);

export const useTokens = () => {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [importedTokens, setImportedTokens] = useState([]);
  
  // Load imported tokens from localStorage on mount
  useEffect(() => {
    const loadImportedTokens = () => {
      try {
        const storedTokens = JSON.parse(localStorage.getItem('LitVMSwap_imported_tokens') || '[]');
        console.log(`📦 Loaded ${storedTokens.length} imported tokens from localStorage`);
        setImportedTokens(storedTokens);
      } catch (err) {
        console.error('Error loading imported tokens from localStorage:', err);
        setImportedTokens([]);
      }
    };
    
    loadImportedTokens();
  }, []);

  // Initialize tokens based on chain
  useEffect(() => {
    const initializeTokens = async () => {
      setLoading(true);
      setError(null);
      
      try {
        if (!chainId) {
          console.log('❌ No chainId, cannot load tokens');
          setTokens([]);
          setLoading(false);
          return;
        }
        
        console.log(`🔗 Initializing tokens for chain ${chainId}...`);
        
        // Start with default tokens for current chain
        const defaultTokens = getDefaultTokens(chainId);
        console.log(`📋 Default tokens: ${defaultTokens.length}`, 
          defaultTokens.map(t => `${t.symbol} (${t.address})`));
        
        let tokenList = [...defaultTokens];
        
        // Add imported tokens for current chain
        const chainImportedTokens = importedTokens.filter(t => t.chainId === chainId);
        console.log(`📦 Imported tokens for chain ${chainId}: ${chainImportedTokens.length}`);
        
        // Verify imported tokens still exist on-chain (only if we have publicClient)
        const verifiedImportedTokens = [];
        
        if (publicClient && chainImportedTokens.length > 0) {
          for (const token of chainImportedTokens) {
            try {
              const [name, symbol, decimals] = await Promise.all([
                publicClient.readContract({
                  address: token.address,
                  abi: ERC20_ABI,
                  functionName: 'name',
                }).catch(() => token.name || 'Unknown Token'),
                
                publicClient.readContract({
                  address: token.address,
                  abi: ERC20_ABI,
                  functionName: 'symbol',
                }).catch(() => token.symbol || 'UNKNOWN'),
                
                publicClient.readContract({
                  address: token.address,
                  abi: ERC20_ABI,
                  functionName: 'decimals',
                }).catch(() => token.decimals || 18),
              ]);
              
              verifiedImportedTokens.push({
                ...token,
                name: String(name),
                symbol: String(symbol),
                decimals: Number(decimals),
                isCustom: true,
                isVerified: false,
                logoURI: token.logoURI || `https://ui-avatars.com/api/?name=${symbol}&background=0e0e23&color=fff&size=128`,
              });
            } catch (err) {
              console.warn(`Token ${token.address} no longer accessible, keeping cached version:`, err);
              verifiedImportedTokens.push({
                ...token,
                isCustom: true,
                isVerified: false,
              });
            }
          }
        } else {
          // If no publicClient, just use imported tokens as-is
          verifiedImportedTokens.push(...chainImportedTokens.map(t => ({
            ...t,
            isCustom: true,
            isVerified: false,
          })));
        }
        
        tokenList = [...tokenList, ...verifiedImportedTokens];
        
        // Remove duplicates by address (case-insensitive), prefer custom tokens over defaults
        const tokenMap = new Map();
        tokenList.forEach(token => {
          const key = token.address.toLowerCase();
          const existing = tokenMap.get(key);
          
          // Prefer custom tokens over defaults
          if (!existing || (token.isCustom && !existing.isCustom)) {
            tokenMap.set(key, token);
          }
        });
        
        const finalTokens = Array.from(tokenMap.values());
        console.log(`✅ Final token list for chain ${chainId}: ${finalTokens.length} tokens`);
        console.log('📋 Token list:', finalTokens.map(t => ({
          symbol: t.symbol,
          address: t.address,
          isVerified: t.isVerified,
          isPopular: t.isPopular,
          isCustom: t.isCustom
        })));
        
        setTokens(finalTokens);
      } catch (err) {
        console.error('❌ Error initializing tokens:', err);
        setError('Failed to load tokens. Please check your network connection.');
        setTokens([]);
      } finally {
        setLoading(false);
      }
    };
    
    initializeTokens();
  }, [chainId, importedTokens, publicClient]);

  // Memoize ERC20 tokens - CRITICAL FIX for React Hook order
  const erc20Tokens = useMemo(() => {
    return tokens.filter(t => !t.isNative);
  }, [tokens]);
  
  // Get balances for ERC20 tokens - MUST BE CALLED UNCONDITIONALLY
  const { 
    balances: erc20Balances, 
    isLoading: balancesLoading, 
    refetch: refetchERC20Balances 
  } = useTokenBalances(erc20Tokens);
  
  // Get allowances for ERC20 tokens - MUST BE CALLED UNCONDITIONALLY
  const { 
    allowances, 
    isLoading: allowancesLoading, 
    refetch: refetchAllowances 
  } = useTokenAllowances(erc20Tokens);

  // Get ETH/ETH balance separately
  const { data: nativeBalance, refetch: refetchNative } = useBalance({
    address,
    query: {
      enabled: isConnected && address,
    }
  });

  // Combine native balance with ERC20 balances
  const allBalances = useMemo(() => {
    const balances = { ...erc20Balances };
    const nativeAddress = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
    
    if (nativeBalance?.value !== undefined) {
      balances[nativeAddress] = nativeBalance.value;
    } else {
      balances[nativeAddress] = 0n;
    }
    
    return balances;
  }, [erc20Balances, nativeBalance]);

  // Helper function to check if address is native token
  const isNativeToken = useCallback((address) => {
    if (!address) return false;
    const addr = address.toLowerCase();
    return addr === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
  }, []);

  // Combine allowances - native ETH doesn't need allowance
  const allAllowances = useMemo(() => {
    const allowancesMap = { ...allowances };
    const nativeAddress = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
    
    // Native token is always approved
    allowancesMap[nativeAddress] = { 
      allowance: ETHERS_CONSTANTS.MaxUint256, 
      hasAllowance: true,
      allowanceNumber: Number(ETHERS_CONSTANTS.MaxUint256),
      status: 'native'
    };
    
    return allowancesMap;
  }, [allowances]);

  // Import new token from address
  const importToken = useCallback(async (tokenAddress) => {
    try {
      if (!tokenAddress || !/^0x[a-fA-F0-9]{40}$/.test(tokenAddress)) {
        throw new Error('Invalid token address format');
      }
      
      const addressLower = tokenAddress.toLowerCase();
      
      // Check if token already exists
      const existingToken = findTokenByAddress(addressLower, chainId) || 
                           tokens.find(t => t.address.toLowerCase() === addressLower);
      
      if (existingToken) {
        console.log(`✅ Token ${existingToken.symbol} already exists`);
        return existingToken;
      }
      
      if (!publicClient) {
        throw new Error('Cannot connect to blockchain');
      }
      
      console.log('🔍 Fetching token details for:', tokenAddress);
      
      // Fetch token details from blockchain
      const [name, symbol, decimals] = await Promise.all([
        publicClient.readContract({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: 'name',
        }).catch(() => 'Unknown Token'),
        
        publicClient.readContract({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: 'symbol',
        }).catch(() => 'UNKNOWN'),
        
        publicClient.readContract({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: 'decimals',
        }).catch(() => 18),
      ]);
      
      // Validate token details
      if (!name || !symbol) {
        throw new Error('Token not found or contract does not implement ERC20 correctly');
      }
      
      const token = {
        address: tokenAddress,
        symbol: String(symbol),
        name: String(name),
        decimals: Number(decimals),
        isNative: false,
        isCustom: true,
        isVerified: false,
        chainId: chainId,
        logoURI: `https://ui-avatars.com/api/?name=${symbol}&background=0e0e23&color=fff&size=128`,
      };
      
      console.log('✅ Token details fetched:', token);
      
      // Save to localStorage
      const storedTokens = JSON.parse(localStorage.getItem('LitVMSwap_imported_tokens') || '[]');
      const exists = storedTokens.some(t => 
        t.address.toLowerCase() === addressLower
      );
      
      if (!exists) {
        const updatedTokens = [...storedTokens, token];
        localStorage.setItem('LitVMSwap_imported_tokens', JSON.stringify(updatedTokens));
        setImportedTokens(updatedTokens);
      }
      
      // Update tokens state
      setTokens(prev => {
        // Check if token already in list
        if (prev.some(t => t.address.toLowerCase() === addressLower)) {
          return prev;
        }
        return [...prev, token];
      });
      
      return token;
    } catch (err) {
      console.error('❌ Error importing token:', err);
      
      // Provide more specific error messages
      let errorMessage = err.message || 'Failed to import token';
      
      if (err.message.includes('ContractFunctionExecutionError')) {
        errorMessage = 'Token contract not found or not ERC20 compliant';
      } else if (err.message.includes('Invalid input')) {
        errorMessage = 'Invalid token address';
      } else if (err.message.includes('timeout') || err.message.includes('Network error')) {
        errorMessage = 'Network error. Please check your connection';
      }
      
      throw new Error(errorMessage);
    }
  }, [chainId, tokens, publicClient]);

  // Remove imported token
  const removeImportedToken = useCallback((tokenAddress) => {
    try {
      const storedTokens = JSON.parse(localStorage.getItem('LitVMSwap_imported_tokens') || '[]');
      const updatedTokens = storedTokens.filter(
        t => t.address.toLowerCase() !== tokenAddress.toLowerCase()
      );
      localStorage.setItem('LitVMSwap_imported_tokens', JSON.stringify(updatedTokens));
      setImportedTokens(updatedTokens);
      
      // Update tokens state (keep default tokens)
      const defaultTokens = getDefaultTokens(chainId);
      setTokens(prev => prev.filter(t => {
        const isDefault = defaultTokens.some(dt => 
          dt.address.toLowerCase() === t.address.toLowerCase()
        );
        const isTokenToRemove = t.address.toLowerCase() === tokenAddress.toLowerCase();
        return !isTokenToRemove || isDefault;
      }));
      
      return true;
    } catch (err) {
      console.error('Error removing token:', err);
      throw err;
    }
  }, [chainId]);

  // Get token by address
  const getTokenByAddress = useCallback((address) => {
    if (!address) return null;
    return tokens.find(t => addressesEqual(t.address, address));
  }, [tokens]);

  // Get token by symbol
  const getTokenBySymbol = useCallback((symbol) => {
    if (!symbol) return null;
    return tokens.find(t => t.symbol.toLowerCase() === symbol.toLowerCase());
  }, [tokens]);

  // Check if token has allowance
  const checkTokenAllowance = useCallback((tokenAddress, amount) => {
    if (!tokenAddress) return { hasAllowance: true, allowance: 0n };
    
    const addr = tokenAddress.toLowerCase();
    
    // Native ETH/ETH doesn't need allowance
    if (isNativeToken(addr)) {
      return { 
        hasAllowance: true, 
        allowance: ETHERS_CONSTANTS.MaxUint256 
      };
    }
    
    const allowanceData = allAllowances[addr];
    if (!allowanceData) return { hasAllowance: false, allowance: 0n };
    
    // Handle BigInt comparison safely
    try {
      const allowance = BigInt(allowanceData.allowance || 0);
      const amountBigInt = BigInt(amount || 0);
      const hasAllowance = allowance >= amountBigInt;
      
      return {
        hasAllowance,
        allowance,
      };
    } catch (err) {
      console.error('Error checking allowance:', err);
      return { hasAllowance: false, allowance: 0n };
    }
  }, [allAllowances, isNativeToken]);

  // Refresh all data
  const refreshAll = useCallback(() => {
    refetchNative();
    refetchERC20Balances();
    refetchAllowances();
  }, [refetchNative, refetchERC20Balances, refetchAllowances]);

  // Clear all imported tokens
  const clearImportedTokens = useCallback(() => {
    localStorage.removeItem('LitVMSwap_imported_tokens');
    setImportedTokens([]);
    setTokens(prev => prev.filter(t => !t.isCustom));
  }, []);

  // Helper to check if on LitVM
  const isLitVM = chainId === LitVM_ORO_TESTNET.id;

  return {
    tokens,
    balances: allBalances,
    allowances: allAllowances,
    loading: loading || balancesLoading || allowancesLoading,
    error,
    importToken,
    removeImportedToken,
    clearImportedTokens,
    getTokenByAddress,
    getTokenBySymbol,
    checkTokenAllowance,
    refreshBalances: refreshAll,
    refetch: refreshAll,
    importedTokens,
    isLitVM,
    nativeSymbol: isLitVM ? 'ETH' : 'ETH',
    chainId,
  };
};