
// hooks/liquidity/useLiquidityAllowance.js

import { useMemo } from 'react';
import { ADDRESSES } from '../../constants/addresses';
import { useTokenAllowance } from '../common/useTokenAllowance';
import { ETHERS_CONSTANTS } from '../../constants/ethers';

export const useLiquidityAllowance = (tokenA, tokenB, amountA, amountB) => {
  const routerAddress = ADDRESSES.router;

  // Token A allowance
  const {
    allowance: allowanceA,
    allowanceBigInt: allowanceABigInt,
    needsApproval: needsApprovalA,
    approve: approveA,
    approveAmount: approveAmountA,
    refetchAllowance: refetchAllowanceA,
    isApproving: isApprovingA,
    isLoading: isLoadingA,
  } = useTokenAllowance(
    tokenA?.symbol !== 'ETH' ? tokenA?.address : undefined,
    routerAddress
  );

  // Token B allowance
  const {
    allowance: allowanceB,
    allowanceBigInt: allowanceBBigInt,
    needsApproval: needsApprovalB,
    approve: approveB,
    approveAmount: approveAmountB,
    refetchAllowance: refetchAllowanceB,
    isApproving: isApprovingB,
    isLoading: isLoadingB,
  } = useTokenAllowance(
    tokenB?.symbol !== 'ETH' ? tokenB?.address : undefined,
    routerAddress
  );

  // Determine if ETH is involved
  const isETHInvolved = useMemo(() => {
    if (!tokenA || !tokenB) return false;
    return tokenA.symbol === 'ETH' || tokenB.symbol === 'ETH';
  }, [tokenA, tokenB]);

  // Check which tokens need approval
  const getTokensNeedingApproval = useMemo(() => {
    const tokens = [];
    
    if (!tokenA || !tokenB || !amountA || !amountB) {
      return tokens;
    }

    try {
      // Parse amounts to BigInt
      const parseAmount = (amount, decimals) => {
        if (!amount || parseFloat(amount) <= 0) return 0n;
        try {
          const [integer, decimal = ''] = amount.split('.');
          const decimalPadded = decimal.padEnd(decimals, '0').slice(0, decimals);
          return BigInt(integer + decimalPadded);
        } catch {
          return 0n;
        }
      };

      const amountABigInt = parseAmount(amountA, tokenA.decimals || 18);
      const amountBBigInt = parseAmount(amountB, tokenB.decimals || 18);

      // Check token A
      if (tokenA.symbol !== 'ETH' && amountABigInt > 0n) {
        if (allowanceABigInt < amountABigInt) {
          tokens.push({
            token: tokenA,
            amount: amountABigInt,
            allowance: allowanceABigInt,
            isTokenA: true,
            isApproved: false,
          });
        } else {
          tokens.push({
            token: tokenA,
            amount: amountABigInt,
            allowance: allowanceABigInt,
            isTokenA: true,
            isApproved: true,
          });
        }
      }

      // Check token B
      if (tokenB.symbol !== 'ETH' && amountBBigInt > 0n) {
        if (allowanceBBigInt < amountBBigInt) {
          tokens.push({
            token: tokenB,
            amount: amountBBigInt,
            allowance: allowanceBBigInt,
            isTokenA: false,
            isApproved: false,
          });
        } else {
          tokens.push({
            token: tokenB,
            amount: amountBBigInt,
            allowance: allowanceBBigInt,
            isTokenA: false,
            isApproved: true,
          });
        }
      }
    } catch (error) {
      console.error('Error checking approval tokens:', error);
    }

    return tokens;
  }, [tokenA, tokenB, amountA, amountB, allowanceABigInt, allowanceBBigInt]);

  // Get next token that needs approval
  const getNextApprovalToken = useMemo(() => {
    const tokensNeedingApproval = getTokensNeedingApproval.filter(t => !t.isApproved);
    return tokensNeedingApproval.length > 0 ? tokensNeedingApproval[0] : null;
  }, [getTokensNeedingApproval]);

  // Check if all tokens are approved
  const areAllTokensApproved = useMemo(() => {
    if (!tokenA || !tokenB || !amountA || !amountB) return false;
    
    const tokensNeedingApproval = getTokensNeedingApproval.filter(t => !t.isApproved);
    return tokensNeedingApproval.length === 0;
  }, [getTokensNeedingApproval, tokenA, tokenB, amountA, amountB]);

  // Check if any approval is in progress
  const isAnyApproving = isApprovingA || isApprovingB;

  // Approve the next token that needs approval
  const approveNextToken = async () => {
    const nextToken = getNextApprovalToken;
    if (!nextToken) return null;

    try {
      if (nextToken.isTokenA) {
        return await approveAmountA(nextToken.amount);
      } else {
        return await approveAmountB(nextToken.amount);
      }
    } catch (error) {
      console.error('Error approving next token:', error);
      throw error;
    }
  };

  // Approve all tokens that need approval
  const approveAllTokens = async () => {
    const tokensNeedingApproval = getTokensNeedingApproval.filter(t => !t.isApproved);
    
    const results = [];
    for (const token of tokensNeedingApproval) {
      try {
        if (token.isTokenA) {
          const result = await approveAmountA(token.amount);
          results.push({ token: token.token, result, success: true });
        } else {
          const result = await approveAmountB(token.amount);
          results.push({ token: token.token, result, success: true });
        }
        
        // Small delay between approvals
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        results.push({ token: token.token, error, success: false });
        throw error;
      }
    }
    
    return results;
  };

  // Refresh all allowances
  const refreshAllAllowances = () => {
    refetchAllowanceA();
    refetchAllowanceB();
  };

  return {
    // Individual token allowances
    tokenA: {
      allowance: allowanceA,
      allowanceBigInt: allowanceABigInt,
      needsApproval: needsApprovalA,
      approve: approveA,
      approveAmount: approveAmountA,
      refetchAllowance: refetchAllowanceA,
      isApproving: isApprovingA,
      isLoading: isLoadingA,
    },
    
    tokenB: {
      allowance: allowanceB,
      allowanceBigInt: allowanceBBigInt,
      needsApproval: needsApprovalB,
      approve: approveB,
      approveAmount: approveAmountB,
      refetchAllowance: refetchAllowanceB,
      isApproving: isApprovingB,
      isLoading: isLoadingB,
    },
    
    // Combined state
    areAllTokensApproved,
    isAnyApproving,
    isLoading: isLoadingA || isLoadingB,
    
    // Tokins needing approval
    tokensNeedingApproval: getTokensNeedingApproval.filter(t => !t.isApproved),
    tokensApproved: getTokensNeedingApproval.filter(t => t.isApproved),
    nextTokenToApprove: getNextApprovalToken,
    
    // Actions
    approveNextToken,
    approveAllTokens,
    refreshAllAllowances,
    
    // Status flags
    isETHInvolved,
    hasTokensSelected: !!tokenA && !!tokenB,
    hasAmountsEntered: !!amountA && !!amountB && parseFloat(amountA) > 0 && parseFloat(amountB) > 0,
    
    // Helper functions
    needsAnyApproval: () => getTokensNeedingApproval.filter(t => !t.isApproved).length > 0,
    getTokenApprovalStatus: (isTokenA) => {
      const token = getTokensNeedingApproval.find(t => t.isTokenA === isTokenA);
      return token ? !token.isApproved : false;
    },
  };
};