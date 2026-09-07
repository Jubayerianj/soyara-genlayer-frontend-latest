import { useWriteContract, useSimulateContract, useReadContract } from 'wagmi';
import { parseEther } from 'viem';
import { SUPER_TRANSACTIONS_ADDRESS, SUPER_TRANSACTIONS_ABI } from '../constants/superTransactions';

export const FEE = '0.0001';

const DYNAMIC_ARGS_FUNCTIONS = ['deployToken', 'deployCollection'];

export function useSuperTxWrite(functionName, initialArgs = []) {
  const shouldSimulate = !DYNAMIC_ARGS_FUNCTIONS.includes(functionName) || 
    (functionName === 'deployToken' && initialArgs.length === 3) ||
    (functionName === 'deployCollection' && initialArgs.length === 2);

  const { data: simulateData, error: simulateError } = useSimulateContract({
    address: SUPER_TRANSACTIONS_ADDRESS,
    abi: SUPER_TRANSACTIONS_ABI,
    functionName,
    args: shouldSimulate ? initialArgs : undefined,
    value: parseEther(FEE),
    query: { enabled: shouldSimulate },
  });

  const { writeContract, data, isPending, isSuccess, error: writeError } = useWriteContract();

  const write = (overrideArgs) => {
    const finalArgs = overrideArgs !== undefined ? overrideArgs : initialArgs;
    const safeArgs = Array.isArray(finalArgs) ? finalArgs : [];

    if (simulateData?.request) {
      writeContract({
        ...simulateData.request,
        args: safeArgs,
      });
    } else {
      writeContract({
        address: SUPER_TRANSACTIONS_ADDRESS,
        abi: SUPER_TRANSACTIONS_ABI,
        functionName,
        args: safeArgs,
        value: parseEther(FEE),
      });
    }
  };

  return {
    write,
    data,
    isLoading: isPending,
    isSuccess,
    error: writeError || simulateError,
  };
}

export function useUserStats(address) {
  return useReadContract({
    address: SUPER_TRANSACTIONS_ADDRESS,
    abi: SUPER_TRANSACTIONS_ABI,
    functionName: 'getUserStats',
    args: [address],
    query: { enabled: !!address },
  });
}

export function useGlobalStats() {
  const result = useReadContract({
    address: SUPER_TRANSACTIONS_ADDRESS,
    abi: SUPER_TRANSACTIONS_ABI,
    functionName: 'getGlobalStats',
    // No args, always enabled
  });
  
  // Debug logging (remove in production)
  if (result.data) {
    console.log('Global stats raw data:', result.data);
  }
  if (result.error) {
    console.error('Global stats error:', result.error);
  }
  
  return result;
}