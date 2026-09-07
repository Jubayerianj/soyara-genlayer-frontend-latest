// hooks/portfolio/useAllTokens.js
import { useCallback, useEffect, useState } from 'react';
import { usePublicClient } from 'wagmi';
import { zeroAddress, formatUnits, erc20Abi, getAddress } from 'viem';

export const useAllTokens = (address) => {
  const publicClient = usePublicClient();
  const [allTokens, setAllTokens] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

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

  // Fetch all ERC20 tokens the user has received
  const fetchAllTokens = useCallback(async (userAddress) => {
    if (!publicClient || !userAddress) return [];

    setIsLoading(true);
    try {
      console.log('Fetching all tokens for address:', userAddress);
      
      // Get all Transfer events where user received tokens
      const transferEvents = await publicClient.getLogs({
        address: undefined, // All addresses
        event: ERC20_TRANSFER_ABI[0],
        args: { to: userAddress },
        fromBlock: 0n,
        toBlock: 'latest'
      });

      console.log(`Found ${transferEvents.length} transfer events`);

      // Get unique token addresses
      const tokenAddresses = [...new Set(transferEvents.map(e => e.address).filter(addr => 
        addr !== zeroAddress && 
        addr.toLowerCase() !== userAddress.toLowerCase()
      ))];

      console.log(`Unique token addresses: ${tokenAddresses.length}`);

      // Fetch balance and info for each token
      const tokensWithBalance = [];
      
      for (const tokenAddress of tokenAddresses.slice(0, 50)) { // Limit to 50 tokens for performance
        try {
          // Get balance
          const balance = await publicClient.readContract({
            address: tokenAddress,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [userAddress]
          });

          if (balance > 0n) {
            // Get token info
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

            const formattedBalance = formatUnits(balance, Number(decimals) || 18);
            const balanceNum = parseFloat(formattedBalance);

            if (balanceNum > 0.000001) {
              tokensWithBalance.push({
                address: tokenAddress,
                symbol: symbol || 'UNKNOWN',
                name: name || 'Unknown Token',
                decimals: Number(decimals) || 18,
                balance: balanceNum,
                isVerified: false, // Mark as unverified
                logoURI: 'https://assets.coingecko.com/coins/images/279/standard/ethereum.png'
              });
            }
          }
        } catch (error) {
          console.error(`Error fetching token ${tokenAddress}:`, error);
          continue;
        }
      }

      console.log(`Found ${tokensWithBalance.length} tokens with balance`);
      return tokensWithBalance;

    } catch (error) {
      console.error('Error fetching all tokens:', error);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [publicClient]);

  useEffect(() => {
    if (address) {
      fetchAllTokens(address);
    }
  }, [address, fetchAllTokens]);

  return { allTokens, isLoading, fetchAllTokens };
};