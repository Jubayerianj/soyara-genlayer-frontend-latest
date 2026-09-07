// hooks/common/useTokenAllowance.js - PRODUCTION VERSION

import { useReadContracts, useChainId, useAccount } from 'wagmi';
import { ERC20_ABI } from '../../constants/abis';
import { getContractAddresses } from '../../constants/addresses';
import { ETHERS_CONSTANTS } from '../../constants/ethers';
import { useMemo } from 'react';
import { NATIVE_TOKEN_ADDRESS } from '../../constants/tokens';

export const useTokenAllowances = (tokens = []) => {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  
  // Always compute this unconditionally at the top
  const ADDRESSES = getContractAddresses(chainId);
  
  // Memoize the filtered tokens - THIS MUST COME BEFORE ANY CONDITIONAL RETURNS
  const erc20Tokens = useMemo(() => {
    if (!tokens || tokens.length === 0) return [];
    return tokens.filter(token => {
      if (!token || !token.address) return false;
      const addr = token.address.toLowerCase();
      // Filter out native ETH
      return addr !== NATIVE_TOKEN_ADDRESS;
    });
  }, [tokens]);

  // Now compute enabled state
  const enabled = ADDRESSES?.router && isConnected && address && erc20Tokens.length > 0;
  
  const allowanceContracts = erc20Tokens.map(token => ({
    address: token.address,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [address, ADDRESSES.router]
  }));

  const { data, isLoading, refetch, error } = useReadContracts({
    contracts: allowanceContracts,
    query: {
      enabled: enabled,
      retry: 2, // Increased retry for production
      retryDelay: 2000,
    }
  });

  // Process allowances - always return consistent structure
  const allowances = {};
  
  if (enabled && data) {
    erc20Tokens.forEach((token, index) => {
      const addr = token.address.toLowerCase();
      const allowanceData = data?.[index];
      
      if (allowanceData?.result !== undefined && allowanceData.status === 'success') {
        try {
          const result = allowanceData.result;
          let allowance;
          
          if (typeof result === 'bigint') {
            allowance = result;
          } else if (typeof result === 'number') {
            allowance = BigInt(result);
          } else if (typeof result === 'string') {
            allowance = BigInt(result);
          } else {
            allowance = 0n;
          }
          
          allowances[addr] = {
            allowance,
            hasAllowance: allowance > 0n,
            allowanceNumber: Number(allowance),
            status: 'success'
          };
        } catch (err) {
          console.error('Error processing allowance for token:', token.address, err);
          allowances[addr] = {
            allowance: 0n,
            hasAllowance: false,
            allowanceNumber: 0,
            status: 'error'
          };
        }
      } else {
        allowances[addr] = {
          allowance: 0n,
          hasAllowance: false,
          allowanceNumber: 0,
          status: allowanceData?.status || 'pending'
        };
      }
    });
  }

  // Add native token allowance (always approved)
  allowances[NATIVE_TOKEN_ADDRESS] = {
    allowance: ETHERS_CONSTANTS.MaxUint256,
    hasAllowance: true,
    allowanceNumber: Number(ETHERS_CONSTANTS.MaxUint256),
    status: 'native'
  };

  return {
    allowances,
    isLoading: enabled ? isLoading : false,
    refetch: enabled ? refetch : () => Promise.resolve(),
    error
  };
};