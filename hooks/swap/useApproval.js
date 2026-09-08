// /hooks/swap/useApproval.js


import { useMemo } from 'react';
import { useReadContract, useWriteContract } from 'wagmi';
import { ERC20_ABI } from '../../constants/abis';

import { parseUnits } from '../../components/utils/format';
import { withNodeRetry, paced, WALLET_NO_RETRY } from '../../lib/nodeRetry';

export const useApproval = (token, spender, amount) => {
  const { writeContractAsync, isPending } = useWriteContract();

  // Read current allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: token?.address,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: token && spender ? [token.address, spender] : undefined,
    query: {
      enabled: !!token?.address && !!spender,
    }
  });

  // Check if approval is needed
  const needsApproval = useMemo(() => {
    if (!token || token.isNative || !amount || !allowance) return false;
    
    try {
      const parsedAmount = parseUnits(amount, token.decimals);
      return BigInt(allowance) < BigInt(parsedAmount);
    } catch (error) {
      console.error('Error checking approval:', error);
      return true;
    }
  }, [token, amount, allowance]);

  // Approve token
  const approve = async () => {
    if (!token?.address || !spender) {
      throw new Error('Token and spender are required');
    }

    try {
      const txHash = await withNodeRetry(() => paced(() => writeContractAsync({
        address: token.address,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [spender, parseUnits(amount, token.decimals)],
      })), { label: 'approve', ...WALLET_NO_RETRY });
      
      return txHash;
    } catch (error) {
      console.error('Approval failed:', error);
      throw error;
    }
  };

  // Approve infinite amount
  const approveInfinite = async () => {
    if (!token?.address || !spender) {
      throw new Error('Token and spender are required');
    }

    try {
      const txHash = await withNodeRetry(() => paced(() => writeContractAsync({
        address: token.address,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [spender, 2n ** 256n - 1n], // Max uint256
      })), { label: 'approve-infinite', ...WALLET_NO_RETRY });
      
      return txHash;
    } catch (error) {
      console.error('Infinite approval failed:', error);
      throw error;
    }
  };

  return {
    allowance,
    needsApproval,
    approve,
    approveInfinite,
    isApproving: isPending,
    refetchAllowance,
  };
};