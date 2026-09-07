
// hooks/contracts/useFactory.js


import { useReadContract, useWriteContract } from 'wagmi';
import { ADDRESSES } from '../../constants/addresses';
import { FACTORY_ABI } from '../../constants/abis';
import { ETHERS_CONSTANTS } from '../../constants/ethers';

export const useFactory = () => {
  const { writeContractAsync } = useWriteContract();

  // Get all pairs length
  const { data: allPairsLength, refetch: refetchPairsLength } = useReadContract({
    address: ADDRESSES.factory,
    abi: FACTORY_ABI,
    functionName: 'allPairsLength',
  });

  // Get pair address
  const getPair = (tokenA, tokenB) => {
    const { data: pairAddress, refetch: refetchPair } = useReadContract({
      address: ADDRESSES.factory,
      abi: FACTORY_ABI,
      functionName: 'getPair',
      args: [tokenA, tokenB],
      query: {
        enabled: !!tokenA && !!tokenB,
      }
    });

    return { pairAddress, refetchPair };
  };

  // Create new pair
  const createPair = async (tokenA, tokenB) => {
    if (!tokenA || !tokenB) {
      throw new Error('Both tokens are required');
    }

    if (tokenA.toLowerCase() === tokenB.toLowerCase()) {
      throw new Error('Identical tokens');
    }

    try {
      const tx = await writeContractAsync({
        address: ADDRESSES.factory,
        abi: FACTORY_ABI,
        functionName: 'createPair',
        args: [tokenA, tokenB],
      });

      // Refresh pairs count
      setTimeout(() => {
        refetchPairsLength();
      }, 5000);

      return tx;
    } catch (error) {
      console.error('Create pair error:', error);
      throw error;
    }
  };

  // Get pair at index
  const getPairAtIndex = (index) => {
    const { data: pairAddress } = useReadContract({
      address: ADDRESSES.factory,
      abi: FACTORY_ABI,
      functionName: 'allPairs',
      args: [BigInt(index)],
      query: {
        enabled: index !== undefined && index >= 0,
      }
    });

    return pairAddress;
  };

  return {
    // Read functions
    allPairsLength,
    getPair,
    getPairAtIndex,
    
    // Write functions
    createPair,
    
    // Actions
    refetchPairsLength,
    
    // Status
    isFactoryAvailable: !!ADDRESSES.factory,
  };
};