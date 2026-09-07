
// hooks/liquidity/useTokenApproval.js
import { useCallback } from 'react';
import { useWriteContract, useReadContract } from 'wagmi';
import { CONTRACT_ADDRESSES } from '../../constants/addresses';
import { ERC20_ABI } from '../../constants/abis';
import { LitVM } from '../../wagmi.config';

export const useTokenApproval = () => {
  const { writeContractAsync } = useWriteContract();

  // Simple allowance check
  const useAllowance = (tokenAddress, ownerAddress, amount) => {
    const { data: allowance, refetch } = useReadContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [ownerAddress, CONTRACT_ADDRESSES[LitVM.id].router],
      query: {
        enabled: !!tokenAddress && !!ownerAddress,
      }
    });

    const hasEnoughAllowance = allowance ? allowance >= amount : false;

    return {
      allowance,
      hasEnoughAllowance,
      refetch
    };
  };

  // Super-Secured: Approve specific amount (NO infinite approvals by default)
  const approve = useCallback(async (tokenAddress, amount) => {
    if (!amount || amount === 0n) {
      return { error: 'Invalid approval amount', success: false };
    }

    try {
      const hash = await writeContractAsync({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [CONTRACT_ADDRESSES[LitVM.id].router, amount],
      });
      return { hash, success: true };
    } catch (error) {
      console.error('Approval failed:', error);
      return { error, success: false };
    }
  }, [writeContractAsync]);

  return {
    useAllowance,
    approve
  };
};