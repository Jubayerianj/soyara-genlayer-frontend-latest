// hooks/liquidity/useLiquidity.js


import { useState, useCallback, useMemo } from 'react';
import { useAccount, useWriteContract } from 'wagmi';
import { ethers } from 'ethers';
import { ADDRESSES } from '../../constants/addresses';
import { ROUTER_ABI } from '../../constants/abis';

// ERC20 ABI for approve function
const ERC20_ABI = [
  {
    "inputs": [
      { "internalType": "address", "name": "spender", "type": "address" },
      { "internalType": "uint256", "name": "amount", "type": "uint256" }
    ],
    "name": "approve",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

export const useLiquidity = () => {
  const { address, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();
  
  // State
  const [tokenA, setTokenA] = useState(null);
  const [tokenB, setTokenB] = useState(null);
  const [amountA, setAmountA] = useState('');
  const [amountB, setAmountB] = useState('');
  const [slippage, setSlippage] = useState(0.5); // 0.5% default
  const [deadline, setDeadline] = useState(20); // 20 minutes
  
  // Parse amounts to BigInt
  const parsedAmountA = useMemo(() => {
    if (!tokenA || !amountA || parseFloat(amountA) <= 0) return 0n;
    try {
      return ethers.parseUnits(amountA, tokenA.decimals);
    } catch {
      return 0n;
    }
  }, [tokenA, amountA]);

  const parsedAmountB = useMemo(() => {
    if (!tokenB || !amountB || parseFloat(amountB) <= 0) return 0n;
    try {
      return ethers.parseUnits(amountB, tokenB.decimals);
    } catch {
      return 0n;
    }
  }, [tokenB, amountB]);

  // Calculate min amounts with slippage
  const amountAMin = useMemo(() => {
    if (!parsedAmountA || parsedAmountA <= 0n) return 0n;
    const slippageBps = BigInt(Math.floor(slippage * 100)); // Convert % to basis points
    return (parsedAmountA * (10000n - slippageBps)) / 10000n;
  }, [parsedAmountA, slippage]);

  const amountBMin = useMemo(() => {
    if (!parsedAmountB || parsedAmountB <= 0n) return 0n;
    const slippageBps = BigInt(Math.floor(slippage * 100));
    return (parsedAmountB * (10000n - slippageBps)) / 10000n;
  }, [parsedAmountB, slippage]);

  // Check if ETH is involved
  const isETHInvolved = useMemo(() => {
    return (tokenA?.symbol === 'ETH') || (tokenB?.symbol === 'ETH');
  }, [tokenA, tokenB]);

  // Get WETH address
  const getWETHAddress = () => {
    return ADDRESSES.weth;
  };

  // Simple token approval
  const approveToken = useCallback(async (tokenAddress, amount = ethers.MaxUint256) => {
    try {
      const hash = await writeContractAsync({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [ADDRESSES.router, amount],
      });
      return { hash, success: true };
    } catch (error) {
      console.error('Approval failed:', error);
      return { error, success: false };
    }
  }, [writeContractAsync]);

  // Add liquidity (both ERC20-ERC20 and ETH pairs)
  const addLiquidity = useCallback(async () => {
    if (!address) throw new Error('Please connect your wallet');
    if (!tokenA || !tokenB) throw new Error('Please select both tokens');
    if (!parsedAmountA || parsedAmountA <= 0n || !parsedAmountB || parsedAmountB <= 0n) {
      throw new Error('Please enter valid amounts');
    }

    const deadlineTimestamp = Math.floor(Date.now() / 1000) + (deadline * 60);
    
    if (isETHInvolved) {
      // Handle ETH liquidity (addLiquidityETH)
      const isTokenAETH = tokenA.symbol === 'ETH';
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

      const hash = await writeContractAsync({
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

      return { hash, success: true };
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

      const hash = await writeContractAsync({
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

      return { hash, success: true };
    }
  }, [
    address, tokenA, tokenB, parsedAmountA, parsedAmountB,
    amountAMin, amountBMin, deadline, isETHInvolved, writeContractAsync
  ]);

  // Switch tokens
  const switchTokens = useCallback(() => {
    setTokenA(tokenB);
    setTokenB(tokenA);
    setAmountA(amountB);
    setAmountB(amountA);
  }, [tokenA, tokenB, amountA, amountB]);

  // Reset form
  const resetForm = useCallback(() => {
    setAmountA('');
    setAmountB('');
  }, []);

  return {
    // State
    tokenA,
    tokenB,
    amountA,
    amountB,
    slippage,
    deadline,
    isETHInvolved,
    
    // Setters
    setTokenA,
    setTokenB,
    setAmountA,
    setAmountB,
    setSlippage,
    setDeadline,
    
    // Actions
    approveToken,
    addLiquidity,
    switchTokens,
    resetForm,
    
    // Calculated values
    parsedAmountA,
    parsedAmountB,
    amountAMin,
    amountBMin,
    getWETHAddress,
  };
};