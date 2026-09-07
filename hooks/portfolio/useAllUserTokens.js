// hooks/portfolio/useAllUserTokens.js
import { useCallback, useState } from 'react';
import { usePublicClient } from 'wagmi';
import { zeroAddress, formatUnits, erc20Abi } from 'viem';

// Enhanced ERC20 ABI to handle different symbol formats
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

// Common ERC20 Transfer event ABI
const ERC20_TRANSFER_ABI = [
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'value', type: 'uint256', indexed: false }
    ]
  }
];

export const useAllUserTokens = () => {
  const publicClient = usePublicClient();
  const [isLoading, setIsLoading] = useState(false);

  // Helper to convert bytes32 to string
  const bytes32ToString = (bytes32) => {
    if (!bytes32 || bytes32 === '0x') return '';
    try {
      // Remove '0x' prefix and trailing zeros
      const hex = bytes32.slice(2);
      let str = '';
      for (let i = 0; i < hex.length; i += 2) {
        const byte = hex.substr(i, 2);
        if (byte === '00') break;
        str += String.fromCharCode(parseInt(byte, 16));
      }
      return str;
    } catch {
      return '';
    }
  };

  // Function to get token metadata with multiple fallbacks
  const getTokenMetadata = async (tokenAddress) => {
    try {
      // First try standard ERC20 methods
      const [symbol, decimals, name] = await Promise.all([
        publicClient.readContract({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: 'symbol'
        }).catch(async () => {
          // Try bytes32 symbol
          try {
            const bytes32Symbol = await publicClient.readContract({
              address: tokenAddress,
              abi: ENHANCED_ERC20_ABI,
              functionName: 'symbol'
            }).catch(() => null);
            
            if (bytes32Symbol && bytes32Symbol !== '0x') {
              return bytes32ToString(bytes32Symbol);
            }
            return 'UNKNOWN';
          } catch {
            return 'UNKNOWN';
          }
        }),
        
        publicClient.readContract({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: 'decimals'
        }).catch(() => 18),
        
        publicClient.readContract({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: 'name'
        }).catch(async () => {
          // Try bytes32 name
          try {
            const bytes32Name = await publicClient.readContract({
              address: tokenAddress,
              abi: ENHANCED_ERC20_ABI,
              functionName: 'name'
            }).catch(() => null);
            
            if (bytes32Name && bytes32Name !== '0x') {
              return bytes32ToString(bytes32Name);
            }
            return 'Unknown Token';
          } catch {
            return 'Unknown Token';
          }
        })
      ]);

      return {
        symbol: symbol || 'UNKNOWN',
        name: name || 'Unknown Token',
        decimals: Number(decimals) || 18
      };
    } catch (error) {
      console.error(`Error fetching metadata for ${tokenAddress}:`, error);
      return {
        symbol: 'UNKNOWN',
        name: 'Unknown Token',
        decimals: 18
      };
    }
  };

  // Function to fetch all tokens user holds (including unverified)
  const fetchAllUserTokens = useCallback(async (userAddress) => {
    if (!publicClient || !userAddress) {
      console.error('Missing publicClient or userAddress');
      return [];
    }

    setIsLoading(true);
    console.log('=== FETCHING ALL USER TOKENS ===');
    console.log('User:', userAddress);

    try {
      const allTokens = [];
      const processedAddresses = new Set();
      
      // Strategy 1: Check known token list first (for better performance)
      console.log('Strategy 1: Checking known token transfers...');
      
      // Use a larger block range - adjust based on your needs
      const currentBlock = await publicClient.getBlockNumber();
      const START_BLOCK = 0n; // From genesis - you might want to adjust this
      const MAX_BLOCKS_TO_SCAN = 200000n; // Limit to prevent timeout
      
      let fromBlock = currentBlock - MAX_BLOCKS_TO_SCAN;
      if (fromBlock < START_BLOCK) fromBlock = START_BLOCK;

      console.log(`Scanning from block ${fromBlock} to ${currentBlock}`);
      
      try {
        // Get all Transfer events where user received tokens
        const transferEvents = await publicClient.getLogs({
          address: undefined, // All addresses
          event: ERC20_TRANSFER_ABI[0],
          args: { to: userAddress },
          fromBlock: fromBlock,
          toBlock: currentBlock
        });

        console.log(`Found ${transferEvents.length} transfer events to user`);

        // Process unique token addresses from transfer events
        for (const event of transferEvents) {
          const tokenAddress = event.address;
          
          if (tokenAddress === zeroAddress || processedAddresses.has(tokenAddress)) {
            continue;
          }
          
          processedAddresses.add(tokenAddress);
          
          try {
            // Check balance first (cheaper call)
            const balance = await publicClient.readContract({
              address: tokenAddress,
              abi: erc20Abi,
              functionName: 'balanceOf',
              args: [userAddress]
            });

            if (balance > 0n) {
              const metadata = await getTokenMetadata(tokenAddress);
              const decimalCount = metadata.decimals;
              const balanceFormatted = formatUnits(balance, decimalCount);
              const balanceNum = parseFloat(balanceFormatted);

              if (balanceNum > 0.000001) {
                allTokens.push({
                  address: tokenAddress,
                  symbol: metadata.symbol,
                  name: metadata.name,
                  decimals: decimalCount,
                  balance: balanceNum,
                  isVerified: false,
                  logoURI: `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/${tokenAddress}/logo.png`
                });

                console.log(`Found: ${metadata.symbol} (${tokenAddress.slice(0, 10)}...), Balance: ${balanceNum}`);
              }
            }
          } catch (error) {
            console.warn(`Skipping token ${tokenAddress}:`, error.message);
            continue;
          }
        }
      } catch (logError) {
        console.warn('Could not fetch transfer logs:', logError);
        // Continue with other strategies
      }

      // Strategy 2: Check if user has interacted with any known contracts
      console.log('Strategy 2: Checking user transactions...');
      
      try {
        // Get user's transactions
        const transactions = await publicClient.getTransactionCount({
          address: userAddress,
          blockTag: 'latest'
        });

        // If user has transactions, they might have tokens from contract interactions
        if (transactions > 0) {
          console.log(`User has ${transactions} transactions, scanning contract interactions...`);
          
          // You could add logic here to parse transaction receipts
          // to find token contract interactions
        }
      } catch (txError) {
        console.warn('Could not fetch transaction count:', txError);
      }

      // Strategy 3: Check common token contracts (optional - can be heavy)
      console.log('Strategy 3: Checking common token patterns...');
      
      // This is where you could add checking for specific token patterns
      // or use a token list from an external API

      console.log(`Total tokens found: ${allTokens.length}`);
      
      // Sort by balance (highest first)
      return allTokens.sort((a, b) => b.balance - a.balance);

    } catch (error) {
      console.error('Error in fetchAllUserTokens:', error);
      return [];
    } finally {
      setIsLoading(false);
      console.log('=== TOKEN FETCH COMPLETE ===');
    }
  }, [publicClient]);

  return { fetchAllUserTokens, isLoading };
};