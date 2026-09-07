// hooks/portfolio/usePortfolio.js
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAccount, usePublicClient, useChainId } from 'wagmi';
import { zeroAddress, formatUnits, erc20Abi, isAddress } from 'viem';
import { getContractAddresses, NATIVE_TOKEN_ADDRESS } from '../../constants/addresses';
import { FACTORY_ABI, PAIR_ABI } from '../../constants/abis';
import { TOKEN_LIST, hasDiaOracleSupport } from '../../constants/tokens';
import { useDiaOraclePrices } from '../../hooks/useDiaOraclePrices';
import { formatUSD, formatNumber } from '../../components/utils/price';

// LitVM native token placeholder
const ETH_NATIVE_TOKEN = {
  address: zeroAddress,
  symbol: 'ETH',
  name: 'LitVM',
  decimals: 18,
  logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
  isNative: true,
  isVerified: true
};

// LitVM common tokens
const COMMON_TOKENS_LitVM = [
  // Native ETH
  '0x0000000000000000000000000000000000000000',
  
  // Wrapped ETH (WETH)
  '0x315374AA9b5536037Cc1Efeea2439CCC0913A77e',
  
  // Common test tokens on LitVM (add your actual token addresses)
  '0x7af963cF6D228E564e2A0aA0DdBF06210B38615D', // Example token 1
  '0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8', // Example token 2
  // Add more LitVM tokens as needed
];

// Enhanced ERC20 ABI
const ENHANCED_ERC20_ABI = [
  ...erc20Abi,
  {
    name: 'symbol',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32' }]
  },
  {
    name: 'name',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32' }]
  }
];

// Helper function to safely compare objects with BigInts
const safeStringify = (obj) => {
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'bigint') {
      return value.toString(); // Convert BigInt to string
    }
    if (value instanceof Set) {
      return Array.from(value); // Convert Set to Array
    }
    if (value instanceof Map) {
      return Object.fromEntries(value); // Convert Map to Object
    }
    return value;
  });
};

// Helper function for deep comparison that handles BigInts
const deepCompare = (obj1, obj2) => {
  const stringifyReplacer = (key, value) => {
    if (typeof value === 'bigint') {
      return value.toString();
    }
    return value;
  };
  
  return JSON.stringify(obj1, stringifyReplacer) === JSON.stringify(obj2, stringifyReplacer);
};

export const usePortfolio = (address) => {
  const { address: connectedAddress } = useAccount();
  const publicClient = usePublicClient();
  const chainId = useChainId();
  
  const [allPairAddresses, setAllPairAddresses] = useState([]);
  const [tokenBalances, setTokenBalances] = useState([]);
  const [liquidityPositions, setLiquidityPositions] = useState([]);
  const [lpTokens, setLpTokens] = useState([]);
  const [totalValueUSD, setTotalValueUSD] = useState(0);
  const [formattedTotalValue, setFormattedTotalValue] = useState('$0');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [progress, setProgress] = useState({ step: 0, totalSteps: 4, message: '' });
  
  const isFetchingRef = useRef(false);
  const retryTimeoutRef = useRef(null);
  const abortControllerRef = useRef(null);
  const cachedTokensRef = useRef(new Map());
  const pendingPriceRequestsRef = useRef(new Set());

  // Get contract addresses for current chain
  const contractAddresses = getContractAddresses(chainId);

  // Track discovered token symbols for oracle price fetching
  const [discoveredTokenSymbols, setDiscoveredTokenSymbols] = useState([]);

  // Use DIA Oracle prices
  const { 
    prices: oraclePrices, 
    loading: pricesLoading, 
    getTokenPrice,
    getTokenPriceData,
    refreshPrices: refreshOraclePrices 
  } = useDiaOraclePrices(discoveredTokenSymbols, { 
    skip: discoveredTokenSymbols.length === 0,
    debounceMs: 500 
  });

  // Update progress
  const updateProgress = useCallback((step, message) => {
    setProgress({ step, totalSteps: 4, message });
  }, []);

  // Get price from oracle with fallback logic
  const getTokenPriceUSD = useCallback((symbol, tokenAddress = null) => {
    if (!symbol) return 0;
    
    // Check if token has oracle support
    const hasOracle = hasDiaOracleSupport(symbol);
    
    if (!hasOracle) {
      console.log(`Token ${symbol} not supported by DIA Oracle`);
      return 0;
    }
    
    // Get price from oracle
    const priceData = getTokenPrice(symbol);
    
    if (priceData.exists && priceData.priceUSD) {
      return parseFloat(priceData.priceUSD);
    }
    
    // Fallback to token list price if available
    if (tokenAddress) {
      const chainTokenList = TOKEN_LIST[chainId] || TOKEN_LIST[4441] || [];
      const tokenFromList = chainTokenList.find(t => 
        t.address.toLowerCase() === tokenAddress.toLowerCase()
      );
      
      if (tokenFromList?.priceUSD) {
        return parseFloat(tokenFromList.priceUSD);
      }
    }
    
    return 0;
  }, [getTokenPrice, chainId]);

  // Helper to convert bytes32 to string
  const bytes32ToString = useCallback((bytes32) => {
    if (!bytes32 || bytes32 === '0x' || bytes32 === '0x0') return '';
    try {
      const hex = bytes32.slice(2);
      let str = '';
      for (let i = 0; i < hex.length; i += 2) {
        const byte = hex.substr(i, 2);
        if (byte === '00') break;
        str += String.fromCharCode(parseInt(byte, 16));
      }
      return str.replace(/\0/g, '').trim();
    } catch {
      return '';
    }
  }, []);

  // Fetch token info with caching
  const fetchTokenInfo = useCallback(async (tokenAddress) => {
    if (!publicClient || !tokenAddress) return null;
    
    // Check cache
    const cacheKey = tokenAddress.toLowerCase();
    if (cachedTokensRef.current.has(cacheKey)) {
      return cachedTokensRef.current.get(cacheKey);
    }
    
    try {
      // Check if it's native ETH or WETH
      if (tokenAddress === zeroAddress) {
        cachedTokensRef.current.set(cacheKey, ETH_NATIVE_TOKEN);
        return ETH_NATIVE_TOKEN;
      }
      
      if (tokenAddress.toLowerCase() === contractAddresses.weth.toLowerCase()) {
        const WETHInfo = {
          address: contractAddresses.weth,
          symbol: 'WETH',
          name: 'Wrapped ETH',
          decimals: 18,
          logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
          isNative: false,
          isVerified: true
        };
        cachedTokensRef.current.set(cacheKey, WETHInfo);
        return WETHInfo;
      }

      // Check token list first
      const chainTokenList = TOKEN_LIST[chainId] || TOKEN_LIST[4441] || [];
      const tokenFromList = chainTokenList.find(t => 
        t.address.toLowerCase() === tokenAddress.toLowerCase()
      );
      
      if (tokenFromList) {
        const tokenInfo = { 
          ...tokenFromList, 
          isVerified: true,
          hasOracleSupport: hasDiaOracleSupport(tokenFromList.symbol)
        };
        cachedTokensRef.current.set(cacheKey, tokenInfo);
        
        // Schedule price fetch if supported
        if (tokenInfo.hasOracleSupport) {
          pendingPriceRequestsRef.current.add(tokenInfo.symbol);
        }
        
        return tokenInfo;
      }

      // Check common tokens for current chain
      const commonTokens = COMMON_TOKENS_LitVM;
      const commonToken = commonTokens.find(t => 
        t.toLowerCase() === tokenAddress.toLowerCase()
      );
      
      if (commonToken) {
        // Fetch from contract
        const [symbol, decimals, name] = await Promise.all([
          publicClient.readContract({
            address: tokenAddress,
            abi: erc20Abi,
            functionName: 'symbol'
          }).catch(() => 'UNKNOWN'),
          
          publicClient.readContract({
            address: tokenAddress,
            abi: erc20Abi,
            functionName: 'decimals'
          }).catch(() => 18),
          
          publicClient.readContract({
            address: tokenAddress,
            abi: erc20Abi,
            functionName: 'name'
          }).catch(() => 'Unknown Token')
        ]);

        const tokenSymbol = symbol || 'UNKNOWN';
        const hasOracle = hasDiaOracleSupport(tokenSymbol);
        
        const tokenInfo = {
          address: tokenAddress,
          symbol: tokenSymbol,
          name: name || 'Unknown Token',
          decimals: Number(decimals) || 18,
          logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
          isVerified: true,
          hasOracleSupport: hasOracle
        };
        
        cachedTokensRef.current.set(cacheKey, tokenInfo);
        
        // Schedule price fetch if supported
        if (hasOracle) {
          pendingPriceRequestsRef.current.add(tokenSymbol);
        }
        
        return tokenInfo;
      }

      // Fetch from contract with multiple attempts
      let symbol = 'UNKNOWN';
      let name = 'Unknown Token';
      let decimals = 18;
      
      try {
        symbol = await publicClient.readContract({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: 'symbol'
        }).catch(async () => {
          try {
            const bytes32Symbol = await publicClient.readContract({
              address: tokenAddress,
              abi: ENHANCED_ERC20_ABI,
              functionName: 'symbol'
            });
            return bytes32ToString(bytes32Symbol) || 'UNKNOWN';
          } catch {
            return 'UNKNOWN';
          }
        });
      } catch (e) {
        symbol = 'UNKNOWN';
      }
      
      try {
        name = await publicClient.readContract({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: 'name'
        }).catch(async () => {
          try {
            const bytes32Name = await publicClient.readContract({
              address: tokenAddress,
              abi: ENHANCED_ERC20_ABI,
              functionName: 'name'
            });
            return bytes32ToString(bytes32Name) || 'Unknown Token';
          } catch {
            return 'Unknown Token';
          }
        });
      } catch (e) {
        name = 'Unknown Token';
      }
      
      try {
        const dec = await publicClient.readContract({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: 'decimals'
        });
        decimals = Number(dec);
      } catch (e) {
        decimals = 18;
      }

      const tokenSymbol = symbol || 'UNKNOWN';
      const hasOracle = hasDiaOracleSupport(tokenSymbol);
      
      const tokenInfo = {
        address: tokenAddress,
        symbol: tokenSymbol,
        name: name || 'Unknown Token',
        decimals: decimals || 18,
        logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
        isVerified: false,
        hasOracleSupport: hasOracle
      };

      cachedTokensRef.current.set(cacheKey, tokenInfo);
      
      // Schedule price fetch if supported
      if (hasOracle) {
        pendingPriceRequestsRef.current.add(tokenSymbol);
      }
      
      return tokenInfo;

    } catch (error) {
      console.error(`Error fetching token info for ${tokenAddress}:`, error);
      const tokenInfo = {
        address: tokenAddress,
        symbol: 'UNKNOWN',
        name: 'Unknown Token',
        decimals: 18,
        logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
        isVerified: false,
        hasOracleSupport: false
      };
      cachedTokensRef.current.set(cacheKey, tokenInfo);
      return tokenInfo;
    }
  }, [publicClient, bytes32ToString, chainId, contractAddresses]);

  // Fetch ALL pairs from factory
  const fetchAllPairs = useCallback(async () => {
    if (!publicClient || !contractAddresses.factory) {
      console.error('No public client or factory address');
      return [];
    }

    try {
      console.log('Fetching all pairs from factory...');
      
      // Get total number of pairs
      const totalPairs = await publicClient.readContract({
        address: contractAddresses.factory,
        abi: FACTORY_ABI,
        functionName: 'allPairsLength'
      });

      const totalPairsNum = Number(totalPairs);
      console.log(`Total pairs in factory: ${totalPairsNum}`);

      if (totalPairsNum === 0) {
        return [];
      }

      // Fetch all pair addresses in batches
      const pairAddresses = [];
      const BATCH_SIZE = 20;

      for (let i = 0; i < totalPairsNum; i += BATCH_SIZE) {
        const batchPromises = [];
        const end = Math.min(i + BATCH_SIZE, totalPairsNum);

        for (let j = i; j < end; j++) {
          batchPromises.push(
            publicClient.readContract({
              address: contractAddresses.factory,
              abi: FACTORY_ABI,
              functionName: 'allPairs',
              args: [BigInt(j)]
            }).then(addr => {
              if (addr && addr !== zeroAddress && isAddress(addr)) {
                return addr;
              }
              return null;
            }).catch(() => null)
          );
        }

        const results = await Promise.all(batchPromises);
        
        for (const result of results) {
          if (result) {
            pairAddresses.push(result);
          }
        }

        console.log(`Fetched ${pairAddresses.length}/${totalPairsNum} pairs...`);
        
        updateProgress(1, `Fetching pairs... (${pairAddresses.length}/${totalPairsNum})`);
        
        if (i + BATCH_SIZE < totalPairsNum) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }

      console.log(`Found ${pairAddresses.length} valid pairs`);
      return pairAddresses;

    } catch (error) {
      console.error('Error fetching pairs:', error);
      return [];
    }
  }, [publicClient, contractAddresses, updateProgress]);

  // Direct method to get token balances
  const fetchAllTokenBalancesDirect = useCallback(async (userAddress) => {
    if (!publicClient || !userAddress) return [];

    const allBalances = [];
    const processedAddresses = new Set();
    const tokenSymbolsSet = new Set();
    
    try {
      console.log('=== DIRECT TOKEN BALANCE FETCH ===');
      updateProgress(1, 'Fetching ETH balance...');
      
      // 1. Fetch native ETH balance
      const ETHBalance = await publicClient.getBalance({
        address: userAddress
      }).catch(() => 0n);

      const ETHBalanceNum = parseFloat(formatUnits(ETHBalance, 18));
      if (ETHBalanceNum > 0.000001) {
        const price = getTokenPriceUSD('ETH');
        const valueUSD = ETHBalanceNum * price;
        const hasOracle = hasDiaOracleSupport('ETH');
        
        allBalances.push({
          ...ETH_NATIVE_TOKEN,
          balance: ETHBalanceNum,
          valueUSD: valueUSD,
          priceUSD: price,
          hasOraclePrice: hasOracle && price > 0,
          priceChange24h: 0,
          formattedValueUSD: formatUSD(valueUSD, { tokensymbol: 'ETH', hasOraclePrice: hasOracle && price > 0 })
        });
        processedAddresses.add(zeroAddress);
        tokenSymbolsSet.add('ETH');
      }

      // 2. Check token list
      updateProgress(1, 'Checking token list...');
      const chainTokenList = TOKEN_LIST[chainId] || TOKEN_LIST[4441] || [];
      
      const TOKEN_BATCH_SIZE = 10;
      for (let i = 0; i < chainTokenList.length; i += TOKEN_BATCH_SIZE) {
        const batch = chainTokenList.slice(i, i + TOKEN_BATCH_SIZE);
        const batchPromises = batch.map(async (token) => {
          const address = token.address.toLowerCase();
          if (processedAddresses.has(address)) return null;
          
          try {
            const balance = await publicClient.readContract({
              address: token.address,
              abi: erc20Abi,
              functionName: 'balanceOf',
              args: [userAddress]
            }).catch(() => 0n);

            if (balance > 0n) {
              processedAddresses.add(address);
              const balanceNum = parseFloat(formatUnits(balance, token.decimals));
              if (balanceNum > 0.000001) {
                const hasOracle = hasDiaOracleSupport(token.symbol);
                const price = getTokenPriceUSD(token.symbol, token.address);
                const valueUSD = balanceNum * price;
                
                tokenSymbolsSet.add(token.symbol);
                
                return {
                  ...token,
                  isVerified: true,
                  balance: balanceNum,
                  valueUSD: valueUSD,
                  priceUSD: price,
                  hasOraclePrice: hasOracle && price > 0,
                  priceChange24h: 0,
                  formattedValueUSD: formatUSD(valueUSD, { 
                    tokenSymbol: token.symbol, 
                    hasOraclePrice: hasOracle && price > 0 
                  })
                };
              }
            }
          } catch (error) {
            console.warn(`Error checking ${token.symbol}:`, error.message);
          }
          return null;
        });

        const results = await Promise.all(batchPromises);
        results.forEach(token => {
          if (token) allBalances.push(token);
        });
        
        updateProgress(1, `Checking token list... (${Math.min(i + TOKEN_BATCH_SIZE, chainTokenList.length)}/${chainTokenList.length})`);
        
        if (i + TOKEN_BATCH_SIZE < chainTokenList.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      // 3. Check common tokens
      updateProgress(2, 'Checking common tokens...');
      
      for (const tokenAddr of COMMON_TOKENS_LitVM) {
        if (tokenAddr === zeroAddress || processedAddresses.has(tokenAddr.toLowerCase())) continue;
        
        try {
          const balance = await publicClient.readContract({
            address: tokenAddr,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [userAddress]
          }).catch(() => 0n);

          if (balance > 0n) {
            const tokenInfo = await fetchTokenInfo(tokenAddr);
            const balanceNum = parseFloat(formatUnits(balance, tokenInfo.decimals));
            
            if (balanceNum > 0.000001) {
              processedAddresses.add(tokenAddr.toLowerCase());
              const hasOracle = hasDiaOracleSupport(tokenInfo.symbol);
              const price = getTokenPriceUSD(tokenInfo.symbol, tokenAddr);
              const valueUSD = balanceNum * price;
              
              tokenSymbolsSet.add(tokenInfo.symbol);
              
              allBalances.push({
                ...tokenInfo,
                balance: balanceNum,
                valueUSD: valueUSD,
                priceUSD: price,
                hasOraclePrice: hasOracle && price > 0,
                priceChange24h: 0,
                formattedValueUSD: formatUSD(valueUSD, { 
                  tokenSymbol: tokenInfo.symbol, 
                  hasOraclePrice: hasOracle && price > 0 
                })
              });
            }
          }
        } catch (error) {
          console.warn(`Error checking common token ${tokenAddr}:`, error.message);
        }
      }

      // 4. Get tokens from Uniswap pairs
      updateProgress(3, 'Checking Uniswap pairs for tokens...');
      
      const pairAddresses = await fetchAllPairs();
      console.log(`Found ${pairAddresses.length} pairs`);
      
      const PAIR_BATCH_SIZE = 20;
      const uniqueTokenAddresses = new Set();
      
      for (let i = 0; i < pairAddresses.length; i += PAIR_BATCH_SIZE) {
        const batch = pairAddresses.slice(i, i + PAIR_BATCH_SIZE);
        const batchPromises = batch.map(pairAddress => 
          Promise.all([
            publicClient.readContract({
              address: pairAddress,
              abi: PAIR_ABI,
              functionName: 'token0'
            }).catch(() => zeroAddress),
            publicClient.readContract({
              address: pairAddress,
              abi: PAIR_ABI,
              functionName: 'token1'
            }).catch(() => zeroAddress)
          ])
        );

        const results = await Promise.all(batchPromises);
        
        results.forEach(([token0, token1]) => {
          if (token0 !== zeroAddress && !processedAddresses.has(token0.toLowerCase())) {
            uniqueTokenAddresses.add(token0.toLowerCase());
          }
          if (token1 !== zeroAddress && !processedAddresses.has(token1.toLowerCase())) {
            uniqueTokenAddresses.add(token1.toLowerCase());
          }
        });
        
        updateProgress(3, `Scanning pairs for tokens... (${Math.min(i + PAIR_BATCH_SIZE, pairAddresses.length)}/${pairAddresses.length})`);
        
        if (i + PAIR_BATCH_SIZE < pairAddresses.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
      
      console.log(`Found ${uniqueTokenAddresses.size} additional tokens from pairs`);

      // Check balances for tokens from pairs
      const tokenAddressesArray = Array.from(uniqueTokenAddresses);
      let processedCount = 0;
      
      for (let i = 0; i < tokenAddressesArray.length; i += TOKEN_BATCH_SIZE) {
        const batch = tokenAddressesArray.slice(i, i + TOKEN_BATCH_SIZE);
        const batchPromises = batch.map(async (tokenAddr) => {
          try {
            const balance = await publicClient.readContract({
              address: tokenAddr,
              abi: erc20Abi,
              functionName: 'balanceOf',
              args: [userAddress]
            }).catch(() => 0n);

            if (balance > 0n) {
              processedAddresses.add(tokenAddr);
              const tokenInfo = await fetchTokenInfo(tokenAddr);
              const balanceNum = parseFloat(formatUnits(balance, tokenInfo.decimals));
              
              if (balanceNum > 0.000001) {
                const hasOracle = hasDiaOracleSupport(tokenInfo.symbol);
                const price = getTokenPriceUSD(tokenInfo.symbol, tokenAddr);
                const valueUSD = balanceNum * price;
                
                tokenSymbolsSet.add(tokenInfo.symbol);
                
                return {
                  ...tokenInfo,
                  balance: balanceNum,
                  valueUSD: valueUSD,
                  priceUSD: price,
                  hasOraclePrice: hasOracle && price > 0,
                  priceChange24h: 0,
                  formattedValueUSD: formatUSD(valueUSD, { 
                    tokenSymbol: tokenInfo.symbol, 
                    hasOraclePrice: hasOracle && price > 0 
                  })
                };
              }
            }
          } catch (error) {
            console.warn(`Error checking balance for ${tokenAddr}:`, error.message);
          }
          return null;
        });

        const results = await Promise.all(batchPromises);
        results.forEach(token => {
          if (token) allBalances.push(token);
        });
        
        processedCount += batch.length;
        updateProgress(3, `Checking balances... (${processedCount}/${tokenAddressesArray.length})`);
        
        if (i + TOKEN_BATCH_SIZE < tokenAddressesArray.length) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }

      // 5. Event scanning as fallback
      updateProgress(4, 'Scanning for additional tokens...');
      
      try {
        const currentBlock = await publicClient.getBlockNumber();
        const fromBlock = currentBlock - 5000n;
        
        const transferEvents = await publicClient.getLogs({
          address: undefined,
          event: {
            type: 'event',
            name: 'Transfer',
            inputs: [
              { type: 'address', name: 'from', indexed: true },
              { type: 'address', name: 'to', indexed: true },
              { type: 'uint256', name: 'value', indexed: false }
            ]
          },
          args: { to: userAddress },
          fromBlock: fromBlock,
          toBlock: 'latest'
        }).catch(() => []);

        console.log(`Found ${transferEvents.length} recent transfer events`);
        
        const eventTokenAddresses = new Set();
        transferEvents.forEach(event => {
          if (event.address !== zeroAddress && !processedAddresses.has(event.address.toLowerCase())) {
            eventTokenAddresses.add(event.address.toLowerCase());
          }
        });
        
        console.log(`Found ${eventTokenAddresses.size} new tokens from events`);
        
        let eventProcessed = 0;
        for (const tokenAddr of eventTokenAddresses) {
          try {
            const balance = await publicClient.readContract({
              address: tokenAddr,
              abi: erc20Abi,
              functionName: 'balanceOf',
              args: [userAddress]
            }).catch(() => 0n);

            if (balance > 0n) {
              processedAddresses.add(tokenAddr);
              const tokenInfo = await fetchTokenInfo(tokenAddr);
              const balanceNum = parseFloat(formatUnits(balance, tokenInfo.decimals));
              
              if (balanceNum > 0.000001) {
                const hasOracle = hasDiaOracleSupport(tokenInfo.symbol);
                const price = getTokenPriceUSD(tokenInfo.symbol, tokenAddr);
                const valueUSD = balanceNum * price;
                
                tokenSymbolsSet.add(tokenInfo.symbol);
                
                allBalances.push({
                  ...tokenInfo,
                  balance: balanceNum,
                  valueUSD: valueUSD,
                  priceUSD: price,
                  hasOraclePrice: hasOracle && price > 0,
                  priceChange24h: 0,
                  formattedValueUSD: formatUSD(valueUSD, { 
                    tokenSymbol: tokenInfo.symbol, 
                    hasOraclePrice: hasOracle && price > 0 
                  })
                });
              }
            }
          } catch (error) {
            console.warn(`Error checking event token ${tokenAddr}:`, error.message);
          }
          
          eventProcessed++;
          if (eventProcessed % 10 === 0) {
            updateProgress(4, `Scanning events... (${eventProcessed}/${eventTokenAddresses.size})`);
          }
        }
      } catch (error) {
        console.warn('Error scanning events:', error.message);
      }

      // Update discovered token symbols for oracle fetching
      if (tokenSymbolsSet.size > 0) {
        const symbolsArray = Array.from(tokenSymbolsSet);
        console.log(`Requesting oracle prices for ${symbolsArray.length} tokens:`, symbolsArray);
        setDiscoveredTokenSymbols(symbolsArray);
      }

      // Sort by value (highest first)
      const sortedBalances = allBalances.sort((a, b) => b.valueUSD - a.valueUSD);
      
      console.log('=== TOKEN FETCH COMPLETE ===');
      console.log(`Total tokens found: ${sortedBalances.length}`);
      
      return sortedBalances;

    } catch (error) {
      console.error('Error in direct token fetch:', error);
      throw error;
    }
  }, [publicClient, updateProgress, fetchAllPairs, fetchTokenInfo, chainId, getTokenPriceUSD]);

  // Find user's liquidity positions
  const findLiquidityPositions = useCallback(async (pairAddresses, userAddress) => {
    if (!publicClient || !userAddress || !pairAddresses.length) {
      return [[], []];
    }

    console.log(`Checking ${pairAddresses.length} pairs for LP tokens...`);
    
    const positions = [];
    const lpTokenList = [];
    let checked = 0;
    const tokenSymbolsSet = new Set();

    const BATCH_SIZE = 10;

    for (let i = 0; i < pairAddresses.length; i += BATCH_SIZE) {
      const batch = pairAddresses.slice(i, i + BATCH_SIZE);
      const batchPromises = [];

      for (const pairAddress of batch) {
        batchPromises.push(
          (async () => {
            try {
              const lpBalance = await publicClient.readContract({
                address: pairAddress,
                abi: erc20Abi,
                functionName: 'balanceOf',
                args: [userAddress]
              }).catch(() => 0n);

              if (lpBalance > 0n) {
                console.log(`Found LP tokens at ${pairAddress}: ${formatUnits(lpBalance, 18)}`);
                
                const [totalSupply, reserves, token0Addr, token1Addr] = await Promise.all([
                  publicClient.readContract({
                    address: pairAddress,
                    abi: erc20Abi,
                    functionName: 'totalSupply'
                  }).catch(() => 1n),
                  
                  publicClient.readContract({
                    address: pairAddress,
                    abi: PAIR_ABI,
                    functionName: 'getReserves'
                  }).catch(() => [0n, 0n, 0n]),
                  
                  publicClient.readContract({
                    address: pairAddress,
                    abi: PAIR_ABI,
                    functionName: 'token0'
                  }).catch(() => zeroAddress),
                  
                  publicClient.readContract({
                    address: pairAddress,
                    abi: PAIR_ABI,
                    functionName: 'token1'
                  }).catch(() => zeroAddress)
                ]);

                if (token0Addr !== zeroAddress && token1Addr !== zeroAddress) {
                  const [token0Info, token1Info] = await Promise.all([
                    fetchTokenInfo(token0Addr),
                    fetchTokenInfo(token1Addr)
                  ]);

                  const poolShare = totalSupply > 0n ? 
                    (Number(lpBalance) / Number(totalSupply)) * 100 : 0;
                  
                  const token0Amount = totalSupply > 0n ? 
                    (lpBalance * reserves[0]) / totalSupply : 0n;
                  const token1Amount = totalSupply > 0n ? 
                    (lpBalance * reserves[1]) / totalSupply : 0n;

                  const token0AmountFormatted = formatUnits(token0Amount, token0Info.decimals || 18);
                  const token1AmountFormatted = formatUnits(token1Amount, token1Info.decimals || 18);

                  const hasOracle0 = hasDiaOracleSupport(token0Info.symbol);
                  const hasOracle1 = hasDiaOracleSupport(token1Info.symbol);
                  
                  const token0Price = getTokenPriceUSD(token0Info.symbol, token0Addr);
                  const token1Price = getTokenPriceUSD(token1Info.symbol, token1Addr);
                  
                  tokenSymbolsSet.add(token0Info.symbol);
                  tokenSymbolsSet.add(token1Info.symbol);
                  
                  const token0Value = parseFloat(token0AmountFormatted) * token0Price;
                  const token1Value = parseFloat(token1AmountFormatted) * token1Price;
                  const totalValue = token0Value + token1Value;

                  const apr = 5 + (Math.random() * 15);

                  const position = {
                    token0: {
                      ...token0Info,
                      amount: parseFloat(token0AmountFormatted),
                      valueUSD: token0Value,
                      hasOraclePrice: hasOracle0 && token0Price > 0,
                      formattedValueUSD: formatUSD(token0Value, { 
                        tokenSymbol: token0Info.symbol, 
                        hasOraclePrice: hasOracle0 && token0Price > 0 
                      })
                    },
                    token1: {
                      ...token1Info,
                      amount: parseFloat(token1AmountFormatted),
                      valueUSD: token1Value,
                      hasOraclePrice: hasOracle1 && token1Price > 0,
                      formattedValueUSD: formatUSD(token1Value, { 
                        tokenSymbol: token1Info.symbol, 
                        hasOraclePrice: hasOracle1 && token1Price > 0 
                      })
                    },
                    // Convert BigInt to string to avoid serialization issues
                    lpTokenBalance: formatUnits(lpBalance, 18),
                    totalLP: formatUnits(totalSupply, 18),
                    poolShare,
                    valueUSD: totalValue,
                    formattedValueUSD: formatUSD(totalValue),
                    pairAddress,
                    // Convert BigInt reserves to strings
                    reserves: {
                      token0: formatUnits(reserves[0], token0Info.decimals || 18),
                      token1: formatUnits(reserves[1], token1Info.decimals || 18)
                    },
                    apr,
                    feesEarned: 0,
                    hasOraclePrice: (hasOracle0 && token0Price > 0) || (hasOracle1 && token1Price > 0)
                  };

                  positions.push(position);
                  lpTokenList.push({
                    address: pairAddress,
                    symbol: `${token0Info.symbol}-${token1Info.symbol}`,
                    name: `${token0Info.symbol}/${token1Info.symbol} LP`,
                    balance: formatUnits(lpBalance, 18),
                    pair: `${token0Info.symbol}/${token1Info.symbol}`,
                    formattedValueUSD: formatUSD(totalValue),
                    hasOraclePrice: (hasOracle0 && token0Price > 0) || (hasOracle1 && token1Price > 0)
                  });

                  console.log(`Added LP position: ${token0Info.symbol}/${token1Info.symbol}`);
                }
              }
            } catch (error) {
              console.error(`Error checking pair ${pairAddress}:`, error);
            }
          })()
        );
      }

      await Promise.all(batchPromises);
      checked += batch.length;
      
      console.log(`Checked ${checked}/${pairAddresses.length} pairs, found ${positions.length} positions`);
      updateProgress(4, `Checking liquidity... (${checked}/${pairAddresses.length})`);
      
      if (i + BATCH_SIZE < pairAddresses.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    // Update discovered token symbols for oracle fetching
    if (tokenSymbolsSet.size > 0) {
      const symbolsArray = Array.from(tokenSymbolsSet);
      console.log(`LP Positions: Requesting oracle prices for ${symbolsArray.length} tokens:`, symbolsArray);
      setDiscoveredTokenSymbols(prev => {
        const combined = new Set([...prev, ...symbolsArray]);
        return Array.from(combined);
      });
    }

    console.log(`Total LP positions found: ${positions.length}`);
    return [positions, lpTokenList];
  }, [publicClient, fetchTokenInfo, updateProgress, getTokenPriceUSD]);

  // Update portfolio values when oracle prices change
  useEffect(() => {
    if (pricesLoading || !oraclePrices || Object.keys(oraclePrices).length === 0) {
      return;
    }

    console.log('Oracle prices updated, recalculating portfolio values...');
    
    // Update token balances with oracle prices
    const updatedTokenBalances = tokenBalances.map(token => {
      const priceData = oraclePrices[token.symbol];
      if (priceData?.exists && priceData.priceUSD) {
        const newPrice = parseFloat(priceData.priceUSD);
        const newValue = token.balance * newPrice;
        
        return {
          ...token,
          priceUSD: newPrice,
          valueUSD: newValue,
          hasOraclePrice: true,
          formattedValueUSD: formatUSD(newValue, { 
            tokenSymbol: token.symbol, 
            hasOraclePrice: true 
          })
        };
      }
      return token;
    });

    // Use deepCompare instead of JSON.stringify to handle BigInts
    if (!deepCompare(updatedTokenBalances, tokenBalances)) {
      setTokenBalances(updatedTokenBalances);
    }

    // Update liquidity positions with oracle prices
    const updatedPositions = liquidityPositions.map(position => {
      let updatedPosition = { ...position };
      let totalValue = 0;
      let updated = false;

      const priceData0 = oraclePrices[position.token0.symbol];
      if (priceData0?.exists && priceData0.priceUSD) {
        const newPrice0 = parseFloat(priceData0.priceUSD);
        const newValue0 = position.token0.amount * newPrice0;
        
        updatedPosition.token0 = {
          ...position.token0,
          priceUSD: newPrice0,
          valueUSD: newValue0,
          hasOraclePrice: true,
          formattedValueUSD: formatUSD(newValue0, { 
            tokenSymbol: position.token0.symbol, 
            hasOraclePrice: true 
          })
        };
        totalValue += newValue0;
        updated = true;
      } else {
        totalValue += position.token0.valueUSD || 0;
      }

      const priceData1 = oraclePrices[position.token1.symbol];
      if (priceData1?.exists && priceData1.priceUSD) {
        const newPrice1 = parseFloat(priceData1.priceUSD);
        const newValue1 = position.token1.amount * newPrice1;
        
        updatedPosition.token1 = {
          ...position.token1,
          priceUSD: newPrice1,
          valueUSD: newValue1,
          hasOraclePrice: true,
          formattedValueUSD: formatUSD(newValue1, { 
            tokenSymbol: position.token1.symbol, 
            hasOraclePrice: true 
          })
        };
        totalValue += newValue1;
        updated = true;
      } else {
        totalValue += position.token1.valueUSD || 0;
      }

      if (updated) {
        updatedPosition.valueUSD = totalValue;
        updatedPosition.formattedValueUSD = formatUSD(totalValue);
        updatedPosition.hasOraclePrice = true;
      }

      return updatedPosition;
    });

    // Use deepCompare instead of JSON.stringify
    if (!deepCompare(updatedPositions, liquidityPositions)) {
      setLiquidityPositions(updatedPositions);
    }

    // Update LP tokens
    const updatedLpTokens = lpTokens.map((lpToken, index) => {
      const position = updatedPositions[index];
      if (position) {
        return {
          ...lpToken,
          formattedValueUSD: position.formattedValueUSD,
          hasOraclePrice: position.hasOraclePrice
        };
      }
      return lpToken;
    });

    // Use deepCompare instead of JSON.stringify
    if (!deepCompare(updatedLpTokens, lpTokens)) {
      setLpTokens(updatedLpTokens);
    }

    // Recalculate total value
    const tokenValue = updatedTokenBalances.reduce((sum, token) => sum + token.valueUSD, 0);
    const liquidityValue = updatedPositions.reduce((sum, pos) => sum + pos.valueUSD, 0);
    const totalValue = tokenValue + liquidityValue;
    
    setTotalValueUSD(totalValue);
    setFormattedTotalValue(formatUSD(totalValue));

  }, [oraclePrices, pricesLoading, tokenBalances, liquidityPositions, lpTokens]);

  // Main refresh function
  const refreshPortfolio = useCallback(async (force = false) => {
    const userAddress = address || connectedAddress;
    
    if (isFetchingRef.current || !userAddress || !publicClient) {
      console.log('Skipping refresh:', { isFetching: isFetchingRef.current, userAddress, publicClient });
      return;
    }

    // Cancel any previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    abortControllerRef.current = new AbortController();

    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }

    setIsLoading(true);
    setError(null);
    setProgress({ step: 0, totalSteps: 4, message: 'Starting...' });
    isFetchingRef.current = true;

    try {
      console.log('=== PORTFOLIO REFRESH STARTED ===');
      console.log('Chain ID:', chainId);
      console.log('User:', userAddress);
      
      if (abortControllerRef.current.signal.aborted) {
        throw new Error('Request aborted');
      }
      
      // Clear pending price requests
      pendingPriceRequestsRef.current.clear();
      setDiscoveredTokenSymbols([]);
      
      // 1. Fetch ALL pairs from factory
      updateProgress(1, 'Fetching trading pairs...');
      const pairAddresses = await fetchAllPairs();
      setAllPairAddresses(pairAddresses);
      console.log(`Found ${pairAddresses.length} pairs`);

      if (abortControllerRef.current.signal.aborted) {
        throw new Error('Request aborted');
      }

      // 2. Fetch ALL token balances
      updateProgress(2, 'Fetching token balances...');
      const tokenBalances = await fetchAllTokenBalancesDirect(userAddress);
      setTokenBalances(tokenBalances);
      console.log(`Found ${tokenBalances.length} tokens total`);

      if (abortControllerRef.current.signal.aborted) {
        throw new Error('Request aborted');
      }

      // 3. Find liquidity positions
      updateProgress(3, 'Finding liquidity positions...');
      const [positions, lpTokens] = await findLiquidityPositions(pairAddresses, userAddress);
      setLiquidityPositions(positions);
      setLpTokens(lpTokens);
      console.log(`Found ${positions.length} liquidity positions`);

      // 4. Trigger oracle price fetch for discovered tokens
      if (pendingPriceRequestsRef.current.size > 0) {
        const symbols = Array.from(pendingPriceRequestsRef.current);
        console.log(`Requesting oracle prices for ${symbols.length} tokens`);
        setDiscoveredTokenSymbols(symbols);
        
        // Wait a bit for oracle to fetch prices
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // 5. Calculate total value (initial calculation, will be updated by oracle effect)
      const tokenValue = tokenBalances.reduce((sum, token) => sum + token.valueUSD, 0);
      const liquidityValue = positions.reduce((sum, pos) => sum + pos.valueUSD, 0);
      const totalValue = tokenValue + liquidityValue;
      setTotalValueUSD(totalValue);
      setFormattedTotalValue(formatUSD(totalValue));

      console.log('=== PORTFOLIO REFRESH COMPLETE ===');
      console.log(`Total Value: $${totalValue.toFixed(2)}`);
      console.log(`Formatted Total Value: ${formatUSD(totalValue)}`);
      
      setRetryCount(0);
      setProgress({ step: 4, totalSteps: 4, message: 'Complete!' });

    } catch (error) {
      if (error.message !== 'Request aborted') {
        console.error('Portfolio refresh error:', error);
        setError(error.message || 'Failed to load portfolio');
        
        // Auto-retry
        if (retryCount < 3) {
          const delay = Math.pow(2, retryCount) * 2000;
          console.log(`Retrying in ${delay}ms...`);
          
          retryTimeoutRef.current = setTimeout(() => {
            setRetryCount(prev => prev + 1);
            refreshPortfolio();
          }, delay);
        }
      }
    } finally {
      isFetchingRef.current = false;
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [
    address,
    connectedAddress,
    publicClient,
    chainId,
    fetchAllPairs,
    fetchAllTokenBalancesDirect,
    findLiquidityPositions,
    retryCount,
    updateProgress
  ]);

  // Cancel refresh function
  const cancelRefresh = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      console.log('Portfolio refresh cancelled');
    }
  }, []);

  // Initial load
  useEffect(() => {
    if (address || connectedAddress) {
      const timer = setTimeout(() => {
        refreshPortfolio();
      }, 500);
      
      return () => {
        clearTimeout(timer);
        cancelRefresh();
      };
    }
  }, [address, connectedAddress, refreshPortfolio, cancelRefresh]);

  // Cleanup
  useEffect(() => {
    return () => {
      isFetchingRef.current = false;
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      cancelRefresh();
    };
  }, [cancelRefresh]);

  // Combine loading states
  const combinedLoading = isLoading || pricesLoading;

  return {
    tokenBalances,
    liquidityPositions,
    lpTokens,
    totalValueUSD,
    formattedTotalValue,
    isLoading: combinedLoading,
    error,
    refreshPortfolio,
    cancelRefresh,
    retryCount,
    progress,
    // Additional info for debugging
    oracleInfo: {
      pricesLoading,
      discoveredTokenSymbols: discoveredTokenSymbols.length,
      oraclePrices: Object.keys(oraclePrices).length
    }
  };
};