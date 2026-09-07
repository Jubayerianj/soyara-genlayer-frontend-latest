
// hooks/common/useTokenBalances.js

import { useAccount, useReadContracts } from 'wagmi';
import { ERC20_ABI } from '../../constants/abis';

export const useTokenBalances = (tokens) => {
  const { address } = useAccount();

  const balanceContracts = tokens.map(token => ({
    address: token.address,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [address]
  }));

  const { data, isLoading, refetch } = useReadContracts({
    contracts: balanceContracts,
    query: {
      enabled: address && tokens.length > 0,
    }
  });

  // FIXED: Handle BigInt safely
  const balances = tokens.reduce((acc, token, index) => {
    const balanceData = data?.[index];
    let balance;
    
    try {
      if (balanceData?.result !== undefined) {
        // Convert to BigInt safely
        balance = BigInt(balanceData.result.toString());
      } else {
        balance = 0n;
      }
    } catch (err) {
      console.error('Error processing balance:', err);
      balance = 0n;
    }
    
    acc[token.address.toLowerCase()] = balance;
    return acc;
  }, {});

  return {
    balances,
    isLoading,
    refetch
  };
};