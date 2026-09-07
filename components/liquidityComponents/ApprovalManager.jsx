import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useWriteContract, useChainId } from 'wagmi';
import { parseUnits } from 'viem';
import { ERC20_ABI } from '../../constants/abis';
import { CONTRACT_ADDRESSES } from '../../constants/addresses';

const ApprovalManager = ({
  token,
  spender,
  amount,
  onApproved,
  onError,
  children
}) => {
  const chainId = useChainId();
  const { writeContractAsync, isPending } = useWriteContract();
  const [isApproving, setIsApproving] = useState(false);

  const handleApprove = async () => {
    if (!token || !spender) {
      onError?.('Invalid token or spender');
      return;
    }

    setIsApproving(true);
    
    try {
      // Use maximum uint256 value for unlimited approval if no amount specified
      const approvalAmount = amount || parseUnits('1000000000', 18); // Use a large number instead of MaxUint256
      
      const tx = await writeContractAsync({
        address: token.address,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [spender, approvalAmount],
      });

      onApproved?.(tx);
    } catch (err) {
      console.error('Approval error:', err);
      onError?.(err.message || 'Failed to approve token');
    } finally {
      setIsApproving(false);
    }
  };

  return children({
    handleApprove,
    isApproving: isApproving || isPending,
    canApprove: !!token && !!spender,
  });
};

// Get contract addresses based on chain
export const getContractAddresses = (chainId) => {
  // LitVM Network (Chain ID: 4441)
  if (chainId === 4441) {
    return CONTRACT_ADDRESSES.LitVM || CONTRACT_ADDRESSES[4441] || CONTRACT_ADDRESSES.default;
  }
  // Sepolia (Chain ID: 11155111)
  if (chainId === 11155111) {
    return CONTRACT_ADDRESSES.sepolia || CONTRACT_ADDRESSES[11155111];
  }
  // Default to LitVM if no match
  return CONTRACT_ADDRESSES.LitVM || CONTRACT_ADDRESSES.default;
};

// Pre-defined approval configurations
export const LIQUIDITY_APPROVALS = {
  // These will be used by components that need to know which contracts to approve
  getRouter: (chainId) => getContractAddresses(chainId)?.router,
  getFactory: (chainId) => getContractAddresses(chainId)?.factory,
  getWETH: (chainId) => getContractAddresses(chainId)?.weth || getContractAddresses(chainId)?.wrappedNative,
};

// Hook for managing multiple approvals
export const useApprovalBatch = (approvals = []) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [approvedHashes, setApprovedHashes] = useState({});

  const nextApproval = () => {
    if (currentIndex < approvals.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const markApproved = (tokenAddress, txHash) => {
    setApprovedHashes(prev => ({
      ...prev,
      [tokenAddress]: txHash
    }));
  };

  const resetApprovals = () => {
    setCurrentIndex(0);
    setApprovedHashes({});
  };

  return {
    currentApproval: approvals[currentIndex],
    currentIndex,
    totalApprovals: approvals.length,
    approvedHashes,
    isComplete: currentIndex >= approvals.length,
    nextApproval,
    markApproved,
    resetApprovals,
    hasApproved: (tokenAddress) => !!approvedHashes[tokenAddress],
  };
};

export default ApprovalManager;