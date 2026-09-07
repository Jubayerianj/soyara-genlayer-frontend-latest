// hooks/liquidity/useForceAllowanceCheck.js

import { useQueryClient } from '@tanstack/react-query';
import { useReadContract } from 'wagmi';
import { CONTRACT_ADDRESSES } from '../../constants/addresses';
import { ERC20_ABI } from '../../constants/abis';
import { LitVM } from '../../wagmi.config';

//gg
export const useForceAllowanceCheck = () => {
  const queryClient = useQueryClient();

  const forceCheckAllowance = (tokenAddress, ownerAddress, spender) => {
    if (!tokenAddress || !ownerAddress) return null;

    // Invalidate the cache for this specific allowance query
    queryClient.invalidateQueries({
      queryKey: [
        'readContract',
        {
          address: tokenAddress,
          functionName: 'allowance',
          args: [ownerAddress, spender || CONTRACT_ADDRESSES[LitVM.id].router],
        },
      ],
    });

    // Force a fresh network request
    const { data, refetch } = useReadContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [ownerAddress, spender || CONTRACT_ADDRESSES[LitVM.id].router],
      query: {
        enabled: true,
        staleTime: 0, // Always stale
        gcTime: 0, // No cache
        retry: false,
      },
    });

    return { data, refetch };
  };

  return { forceCheckAllowance };
};