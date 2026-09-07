// hooks/liquidity/useLiquidityOperations.js
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAccount, useWriteContract, useReadContract } from 'wagmi';
import { parseUnits } from 'viem';
import { ethers } from 'ethers';
import { ADDRESSES } from '../../constants/addresses';
import { ROUTER_ABI, FACTORY_ABI, ERC20_ABI } from '../../constants/abis';
import { ETHERS_CONSTANTS } from '../../constants/ethers';
import { safeParseUnits, addressesEqual } from '../../components/utils/ethers-safe';
import { useTokenApproval } from './useTokenApproval';

export const useLiquidityOperations = () => {
  const { address, isConnected } = useAccount();
  const { writeContractAsync, isPending: isWritePending } = useWriteContract();
  
  // Use the new token approval hook
  const {
    approveToken,
    clearTokenApproval,
    isPending: isApprovalPending,
  } = useTokenApproval();
  
  // Token states
  const [tokenA, setTokenA] = useState(null);
  const [tokenB, setTokenB] = useState(null);
  const [amountA, setAmountA] = useState('');
  const [amountB, setAmountB] = useState('');
  const [slippage, setSlippage] = useState(0.5);
  const [deadline, setDeadline] = useState(20);
  
  // Operation states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [txHash, setTxHash] = useState(null);
  
  // Local allowance states
  const [allowanceA, setAllowanceA] = useState({
    hasAllowance: false,
    hasBeenChecked: false,
    isLoading: false,
    allowance: null
  });
  
  const [allowanceB, setAllowanceB] = useState({
    hasAllowance: false,
    hasBeenChecked: false,
    isLoading: false,
    allowance: null
  });
  
  // Parse amounts to BigInt
  const parsedAmountA = useMemo(() => {
    if (!tokenA || !amountA || parseFloat(amountA) <= 0) return 0n;
    try {
      return safeParseUnits(amountA, tokenA.decimals);
    } catch {
      return 0n;
    }
  }, [tokenA, amountA]);

  const parsedAmountB = useMemo(() => {
    if (!tokenB || !amountB || parseFloat(amountB) <= 0) return 0n;
    try {
      return safeParseUnits(amountB, tokenB.decimals);
    } catch {
      return 0n;
    }
  }, [tokenB, amountB]);

  // Check if ETH is involved
  const isETHInvolved = useMemo(() => {
    return (tokenA?.symbol === 'ETH') || (tokenB?.symbol === 'ETH');
  }, [tokenA, tokenB]);

  // Get pair address
  const tokenAAddress = useMemo(() => {
    if (!tokenA) return null;
    return tokenA.symbol === 'ETH' ? ADDRESSES.weth : tokenA.address;
  }, [tokenA]);

  const tokenBAddress = useMemo(() => {
    if (!tokenB) return null;
    return tokenB.symbol === 'ETH' ? ADDRESSES.weth : tokenB.address;
  }, [tokenB]);

  const { data: pairAddress, refetch: refetchPair } = useReadContract({
    address: ADDRESSES.factory,
    abi: FACTORY_ABI,
    functionName: 'getPair',
    args: tokenAAddress && tokenBAddress ? [tokenAAddress, tokenBAddress] : undefined,
    query: {
      enabled: !!tokenAAddress && !!tokenBAddress,
    }
  });

  // Check if pool exists
  const poolExists = useMemo(() => {
    return pairAddress && pairAddress !== ETHERS_CONSTANTS.ZeroAddress;
  }, [pairAddress]);

  // Use useReadContract hooks for allowances
  const { data: tokenAAllowance, refetch: refetchTokenAAllowance } = useReadContract({
    address: tokenA?.symbol !== 'ETH' ? tokenA?.address : undefined,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: tokenA && address ? [address, ADDRESSES.router] : undefined,
    query: {
      enabled: !!tokenA && tokenA.symbol !== 'ETH' && !!address,
    }
  });

  const { data: tokenBAllowance, refetch: refetchTokenBAllowance } = useReadContract({
    address: tokenB?.symbol !== 'ETH' ? tokenB?.address : undefined,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: tokenB && address ? [address, ADDRESSES.router] : undefined,
    query: {
      enabled: !!tokenB && tokenB.symbol !== 'ETH' && !!address,
    }
  });

  // Update allowance states when allowance data changes
  useEffect(() => {
    if (tokenA && tokenA.symbol !== 'ETH' && tokenAAllowance !== undefined) {
      const hasAllowance = tokenAAllowance !== null && parsedAmountA > 0n 
        ? tokenAAllowance >= parsedAmountA 
        : false;
      
      setAllowanceA(prev => ({
        ...prev,
        hasAllowance,
        hasBeenChecked: true,
        allowance: tokenAAllowance,
        isLoading: false
      }));
    }
  }, [tokenA, tokenAAllowance, parsedAmountA]);

  useEffect(() => {
    if (tokenB && tokenB.symbol !== 'ETH' && tokenBAllowance !== undefined) {
      const hasAllowance = tokenBAllowance !== null && parsedAmountB > 0n 
        ? tokenBAllowance >= parsedAmountB 
        : false;
      
      setAllowanceB(prev => ({
        ...prev,
        hasAllowance,
        hasBeenChecked: true,
        allowance: tokenBAllowance,
        isLoading: false
      }));
    }
  }, [tokenB, tokenBAllowance, parsedAmountB]);

  // Get tokens with required amounts for approval check
  const tokensForApprovalCheck = useMemo(() => {
    const tokens = [];
    
    if (tokenA && tokenA.symbol !== 'ETH' && parsedAmountA > 0n) {
      tokens.push({
        token: tokenA,
        requiredAmount: parsedAmountA
      });
    }
    
    if (tokenB && tokenB.symbol !== 'ETH' && parsedAmountB > 0n) {
      tokens.push({
        token: tokenB,
        requiredAmount: parsedAmountB
      });
    }
    
    return tokens;
  }, [tokenA, tokenB, parsedAmountA, parsedAmountB]);

  // Get tokens needing approval
  const tokensNeedingApproval = useMemo(() => {
    const needsApproval = [];
    
    if (tokenA && tokenA.symbol !== 'ETH' && parsedAmountA > 0n) {
      if (!allowanceA.hasAllowance) {
        needsApproval.push({
          token: tokenA,
          requiredAmount: parsedAmountA
        });
      }
    }
    
    if (tokenB && tokenB.symbol !== 'ETH' && parsedAmountB > 0n) {
      if (!allowanceB.hasAllowance) {
        needsApproval.push({
          token: tokenB,
          requiredAmount: parsedAmountB
        });
      }
    }
    
    return needsApproval;
  }, [tokenA, tokenB, parsedAmountA, parsedAmountB, allowanceA, allowanceB]);

  // Get next token to approve
  const nextTokenToApprove = useMemo(() => {
    return tokensNeedingApproval[0] || null;
  }, [tokensNeedingApproval]);

  // Check if all tokens are approved
  const areAllTokensApprovedFlag = useMemo(() => {
    if (tokensForApprovalCheck.length === 0) return true;
    
    return tokensForApprovalCheck.every(tokenInfo => {
      if (tokenInfo.token.address === tokenA?.address) {
        return allowanceA.hasAllowance;
      }
      if (tokenInfo.token.address === tokenB?.address) {
        return allowanceB.hasAllowance;
      }
      return false;
    });
  }, [tokensForApprovalCheck, tokenA, tokenB, allowanceA, allowanceB]);

  // Calculate min amounts with slippage
  const amountAMin = useMemo(() => {
    if (!parsedAmountA || parsedAmountA <= 0n) return 0n;
    const slippageBps = BigInt(Math.floor(slippage * 100));
    return (parsedAmountA * (10000n - slippageBps)) / 10000n;
  }, [parsedAmountA, slippage]);

  const amountBMin = useMemo(() => {
    if (!parsedAmountB || parsedAmountB <= 0n) return 0n;
    const slippageBps = BigInt(Math.floor(slippage * 100));
    return (parsedAmountB * (10000n - slippageBps)) / 10000n;
  }, [parsedAmountB, slippage]);

  // Switch tokens
  const switchTokens = useCallback(() => {
    // Clear allowance states for old tokens
    if (tokenA) clearTokenApproval(tokenA.address);
    if (tokenB) clearTokenApproval(tokenB.address);
    
    // Reset local allowance states
    setAllowanceA({
      hasAllowance: false,
      hasBeenChecked: false,
      isLoading: false,
      allowance: null
    });
    
    setAllowanceB({
      hasAllowance: false,
      hasBeenChecked: false,
      isLoading: false,
      allowance: null
    });
    
    setTokenA(tokenB);
    setTokenB(tokenA);
    setAmountA(amountB);
    setAmountB(amountA);
  }, [tokenA, tokenB, amountA, amountB, clearTokenApproval]);

  // Check allowances for both tokens
  const checkAllowances = useCallback(async () => {
    if (!tokenA || !tokenB || !address) {
      return false;
    }
    
    setError('');
    
    try {
      // Set loading states
      if (tokenA.symbol !== 'ETH') {
        setAllowanceA(prev => ({ ...prev, isLoading: true }));
        await refetchTokenAAllowance();
      }
      
      if (tokenB.symbol !== 'ETH') {
        setAllowanceB(prev => ({ ...prev, isLoading: true }));
        await refetchTokenBAllowance();
      }
      
      // Wait a moment for the refetch to complete and state to update
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Return true if all tokens have allowance
      return areAllTokensApprovedFlag;
    } catch (err) {
      console.error('Error checking allowances:', err);
      setError('Failed to check allowances. Please try again.');
      
      // Reset loading states on error
      setAllowanceA(prev => ({ ...prev, isLoading: false }));
      setAllowanceB(prev => ({ ...prev, isLoading: false }));
      
      return false;
    }
  }, [tokenA, tokenB, address, refetchTokenAAllowance, refetchTokenBAllowance, areAllTokensApprovedFlag]);

  // Handle approval
  const handleApproveToken = useCallback(async (token) => {
    if (!token || token.symbol === 'ETH' || !approveToken) {
      setError('Invalid token or approval function not available');
      return null;
    }
    
    setError('');
    
    try {
      // Set loading state for this token
      if (tokenA?.address === token.address) {
        setAllowanceA(prev => ({ ...prev, isLoading: true }));
      }
      if (tokenB?.address === token.address) {
        setAllowanceB(prev => ({ ...prev, isLoading: true }));
      }
      
      const targetAmount = tokenA?.address === token.address 
        ? (amountA ? parseUnits(amountA, token.decimals || 18) : undefined)
        : (amountB ? parseUnits(amountB, token.decimals || 18) : undefined);
      
      const result = await approveToken(token, { amount: targetAmount || ETHERS_CONSTANTS.MaxUint256 });
      
      if (result?.success) {
        // Refetch the allowance to get updated value
        if (tokenA?.address === token.address) {
          await refetchTokenAAllowance();
        }
        if (tokenB?.address === token.address) {
          await refetchTokenBAllowance();
        }
        
        // Return the transaction hash
        return result.txHash;
      }
      
      return null;
    } catch (err) {
      console.error('Approval error:', err);
      setError(err.message || 'Failed to approve token');
      
      // Reset loading state on error
      if (tokenA?.address === token.address) {
        setAllowanceA(prev => ({ ...prev, isLoading: false }));
      }
      if (tokenB?.address === token.address) {
        setAllowanceB(prev => ({ ...prev, isLoading: false }));
      }
      
      return null;
    }
  }, [approveToken, tokenA, tokenB, refetchTokenAAllowance, refetchTokenBAllowance]);

  // Add liquidity
  const handleAddLiquidity = async () => {
    if (!address) {
      setError('Please connect your wallet');
      return null;
    }

    if (!tokenA || !tokenB) {
      setError('Please select both tokens');
      return null;
    }

    if (!parsedAmountA || parsedAmountA <= 0n || !parsedAmountB || parsedAmountB <= 0n) {
      setError('Please enter valid amounts');
      return null;
    }

    if (addressesEqual(tokenA.address, tokenB.address)) {
      setError('Cannot create pool with same token');
      return null;
    }

    // Double-check that all tokens are approved
    if (!areAllTokensApprovedFlag) {
      setError('All tokens must be approved before adding liquidity');
      return null;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const deadlineTimestamp = Math.floor(Date.now() / 1000) + (deadline * 60);
      let tx;

      if (isETHInvolved) {
        // Handle ETH liquidity
        const isTokenAETH = tokenA.symbol === 'ETH';
        const ethToken = isTokenAETH ? tokenA : tokenB;
        const erc20Token = isTokenAETH ? tokenB : tokenA;
        
        const ethAmount = isTokenAETH ? parsedAmountA : parsedAmountB;
        const erc20Amount = isTokenAETH ? parsedAmountB : parsedAmountA;
        const erc20AmountMin = isTokenAETH ? amountBMin : amountAMin;
        const ethAmountMin = isTokenAETH ? amountAMin : amountBMin;

        console.log('Adding liquidity with ETH:', {
          token: erc20Token.address,
          tokenAmount: erc20Amount.toString(),
          tokenAmountMin: erc20AmountMin.toString(),
          ethAmountMin: ethAmountMin.toString(),
          ethValue: ethAmount.toString(),
        });

        tx = await writeContractAsync({
          address: ADDRESSES.router,
          abi: ROUTER_ABI,
          functionName: 'addLiquidityETH',
          args: [
            erc20Token.address,
            erc20Amount,
            erc20AmountMin,
            ethAmountMin,
            address,
            deadlineTimestamp
          ],
          value: ethAmount,
        });
      } else {
        // Handle ERC20-ERC20 liquidity
        console.log('Adding liquidity ERC20-ERC20:', {
          tokenA: tokenA.address,
          tokenB: tokenB.address,
          amountA: parsedAmountA.toString(),
          amountB: parsedAmountB.toString(),
          amountAMin: amountAMin.toString(),
          amountBMin: amountBMin.toString(),
        });

        tx = await writeContractAsync({
          address: ADDRESSES.router,
          abi: ROUTER_ABI,
          functionName: 'addLiquidity',
          args: [
            tokenA.address,
            tokenB.address,
            parsedAmountA,
            parsedAmountB,
            amountAMin,
            amountBMin,
            address,
            deadlineTimestamp
          ],
        });
      }

      setTxHash(tx);
      return tx;
    } catch (err) {
      console.error('Add liquidity error:', err);
      const errorMsg = err.message || err.details || 'Failed to add liquidity';
      
      // Parse common errors
      if (errorMsg.includes('INSUFFICIENT_A_AMOUNT') || errorMsg.includes('INSUFFICIENT_B_AMOUNT')) {
        setError('Insufficient token balance');
      } else if (errorMsg.includes('TRANSFER_FROM_FAILED')) {
        setError('Token transfer failed. Check allowance and balance.');
      } else if (errorMsg.includes('INSUFFICIENT_LIQUIDITY')) {
        setError('Insufficient liquidity in pool');
      } else if (errorMsg.includes('EXPIRED')) {
        setError('Transaction expired. Increase deadline.');
      } else {
        setError(errorMsg);
      }
      
      return null;
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reset form
  const resetForm = useCallback(() => {
    setAmountA('');
    setAmountB('');
    setError('');
    setTxHash(null);
    
    // Reset allowance objects
    setAllowanceA({
      hasAllowance: false,
      hasBeenChecked: false,
      isLoading: false,
      allowance: null
    });
    
    setAllowanceB({
      hasAllowance: false,
      hasBeenChecked: false,
      isLoading: false,
      allowance: null
    });
    
    // Clear allowance states when form is reset
    if (tokenA) clearTokenApproval(tokenA.address);
    if (tokenB) clearTokenApproval(tokenB.address);
  }, [tokenA, tokenB, clearTokenApproval]);

  // Refresh all allowances
  const refreshAllAllowances = useCallback(async () => {
    await checkAllowances();
  }, [checkAllowances]);

  // Reset allowance check when amounts change significantly
  useEffect(() => {
    if (tokenA && tokenA.symbol !== 'ETH' && parsedAmountA > 0n) {
      clearTokenApproval(tokenA.address);
      setAllowanceA(prev => ({
        ...prev,
        hasBeenChecked: false,
        hasAllowance: false
      }));
    }
    if (tokenB && tokenB.symbol !== 'ETH' && parsedAmountB > 0n) {
      clearTokenApproval(tokenB.address);
      setAllowanceB(prev => ({
        ...prev,
        hasBeenChecked: false,
        hasAllowance: false
      }));
    }
  }, [tokenA, tokenB, parsedAmountA, parsedAmountB, clearTokenApproval]);

  // Check if can add liquidity
  const canAddLiquidity = useMemo(() => {
    if (!isConnected || !tokenA || !tokenB) return false;
    if (addressesEqual(tokenA.address, tokenB.address)) return false;
    if (!parsedAmountA || !parsedAmountB || parsedAmountA <= 0n || parsedAmountB <= 0n) return false;
    if (!areAllTokensApprovedFlag) return false;
    if (isSubmitting || isApprovalPending) return false;
    
    return true;
  }, [isConnected, tokenA, tokenB, parsedAmountA, parsedAmountB, areAllTokensApprovedFlag, isSubmitting, isApprovalPending]);

  // Loading state
  const isLoading = useMemo(() => {
    return isWritePending || isSubmitting || isApprovalPending || allowanceA.isLoading || allowanceB.isLoading;
  }, [isWritePending, isSubmitting, isApprovalPending, allowanceA.isLoading, allowanceB.isLoading]);

  // Get allowance checking status
  const isCheckingAllowances = useMemo(() => {
    return allowanceA.isLoading || allowanceB.isLoading;
  }, [allowanceA.isLoading, allowanceB.isLoading]);

  return {
    // State
    tokenA,
    tokenB,
    amountA,
    amountB,
    slippage,
    deadline,
    isSubmitting,
    error,
    txHash,
    isETHInvolved,
    poolExists,
    isCheckingAllowances,
    
    // Setters
    setTokenA,
    setTokenB,
    setAmountA,
    setAmountB,
    setSlippage,
    setDeadline,
    setError,
    setTxHash,
    
    // Actions
    switchTokens,
    handleApproveToken,
    handleAddLiquidity,
    resetForm,
    refreshAllAllowances,
    checkAllowances,
    
    // Calculated values
    parsedAmountA,
    parsedAmountB,
    amountAMin,
    amountBMin,
    
    // Allowance state
    allowanceA,
    allowanceB,
    areAllTokensApproved: areAllTokensApprovedFlag,
    tokensNeedingApproval,
    nextTokenToApprove,
    
    // Status
    canAddLiquidity,
    isLoading,
    
    // Refs
    refetchPair,
  };
};