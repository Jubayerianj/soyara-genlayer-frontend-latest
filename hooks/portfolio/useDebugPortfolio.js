// hooks/portfolio/useDebugPortfolio.js



import { useCallback, useEffect } from 'react';
import { useAccount, useReadContract, useChainId } from 'wagmi';
import { zeroAddress } from 'viem';
import { getContractAddresses } from '../../constants/addresses';
import { FACTORY_ABI, PAIR_ABI } from '../../constants/abis';

export const useDebugPortfolio = (address) => {
  const { address: connectedAddress } = useAccount();
  const chainId = useChainId();
  
  // Get contract addresses for current chain
  const contractAddresses = getContractAddresses(chainId);
  
  // Debug: Get total pairs count
  const { data: totalPairsData } = useReadContract({
    address: contractAddresses.factory,
    abi: FACTORY_ABI,
    functionName: 'allPairsLength',
    query: {
      enabled: !!address && !!contractAddresses.factory,
    }
  });
  
  // Debug: Get first pair address
  const { data: firstPairAddress } = useReadContract({
    address: contractAddresses.factory,
    abi: FACTORY_ABI,
    functionName: 'allPairs',
    args: [0n],
    query: {
      enabled: totalPairsData && Number(totalPairsData) > 0,
    }
  });
  
  // Debug: Get pair info for first pair
  const { data: pairTokens } = useReadContract({
    address: firstPairAddress || zeroAddress,
    abi: PAIR_ABI,
    functionName: 'token0',
    query: {
      enabled: !!firstPairAddress && firstPairAddress !== zeroAddress,
    }
  });
  
  const debugFetch = useCallback(async () => {
    const userAddress = address || connectedAddress;
    if (!userAddress) return;
    
    console.log('=== DEBUG PORTFOLIO ===');
    console.log('Chain ID:', chainId);
    console.log('User address:', userAddress);
    console.log('Factory address:', contractAddresses.factory);
    console.log('Total pairs in factory:', totalPairsData ? Number(totalPairsData) : 'Loading...');
    console.log('First pair address:', firstPairAddress);
    console.log('First pair token0:', pairTokens);
    
    // Check some common pairs on LitVM
    console.log('Checking LitVM pairs...');
    
    // You can add LitVM-specific token checks here
    if (chainId === 4441) {
      console.log('LitVM detected, checking native tokens...');
      // Add LitVM specific debug checks
    }
    
  }, [address, connectedAddress, chainId, contractAddresses, totalPairsData, firstPairAddress, pairTokens]);
  
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      debugFetch();
    }
  }, [debugFetch]);
  
  return {
    totalPairs: totalPairsData ? Number(totalPairsData) : 0,
    firstPairAddress,
    pairTokens,
    debugFetch,
    chainId,
    factoryAddress: contractAddresses.factory
  };
};