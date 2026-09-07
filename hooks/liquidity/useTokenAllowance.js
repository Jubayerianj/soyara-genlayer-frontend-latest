// hooks/liquidity/useTokenAllowance.js


import { useReadContract } from 'wagmi'
import { CONTRACT_ADDRESSES } from '../../constants/addresses'
import { ERC20_ABI } from '../../constants/abis'
import { LitVM } from '../../wagmi.config'

//gg

export const useTokenAllowance = (tokenAddress, ownerAddress, amount) => {
  const { data, isLoading, refetch, isError } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [ownerAddress, CONTRACT_ADDRESSES[LitVM.id].router],
    query: {
      enabled: !!tokenAddress && !!ownerAddress && !!amount,
      // Cache settings for performance
      staleTime: 30000, // 30 seconds
      gcTime: 60000, // 1 minute
      refetchOnWindowFocus: false, // Don't refetch when window focused
      refetchOnReconnect: false, // Don't refetch on reconnect
    },
  })

  const hasAllowance = data && amount ? data >= amount : false

  return {
    allowance: data || 0n,
    isLoading,
    hasAllowance,
    refetch,
    isError,
  }
}