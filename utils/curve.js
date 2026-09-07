// utils/curve.js
import { toUniswapToken } from './currency';

// Meta-Registry ABI (correct function name: get_pool)
const CURVE_REGISTRY_ABI = [
  {
    inputs: [
      { name: '_from', type: 'address' },
      { name: '_to', type: 'address' },
    ],
    name: 'get_pool',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
];

// Pool ABI for coins and get_dy (unchanged)
const CURVE_POOL_ABI = [
  {
    inputs: [],
    name: 'coins',
    outputs: [{ name: '', type: 'address[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'i', type: 'int128' },
      { name: 'j', type: 'int128' },
      { name: 'dx', type: 'uint256' },
    ],
    name: 'get_dy',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
];

/**
 * Fetch a Curve pool from the Meta-Registry and get quote.
 */
export async function fetchCurvePoolAndQuote(
  publicClient,
  registryAddress,
  tokenIn,
  tokenOut,
  amountInWei
) {
  try {
    const tokenInAddr = tokenIn.address;
    const tokenOutAddr = tokenOut.address;

    // 1. Get pool address from registry (returns zero address if no pool)
    const poolAddress = await publicClient.readContract({
      address: registryAddress,
      abi: CURVE_REGISTRY_ABI,
      functionName: 'get_pool',
      args: [tokenInAddr, tokenOutAddr],
    });

    if (!poolAddress || poolAddress === '0x0000000000000000000000000000000000000000') {
      return null;
    }

    // 2. Get list of coins in the pool
    const coins = await publicClient.readContract({
      address: poolAddress,
      abi: CURVE_POOL_ABI,
      functionName: 'coins',
    });

    // 3. Find indices of tokenIn and tokenOut
    const tokenInLower = tokenInAddr.toLowerCase();
    const tokenOutLower = tokenOutAddr.toLowerCase();
    let fromIndex = null;
    let toIndex = null;

    for (let i = 0; i < coins.length; i++) {
      const coinLower = coins[i].toLowerCase();
      if (coinLower === tokenInLower) fromIndex = i;
      if (coinLower === tokenOutLower) toIndex = i;
    }

    if (fromIndex === null || toIndex === null) return null;

    // 4. Get quote (output amount)
    const amountOutWei = await publicClient.readContract({
      address: poolAddress,
      abi: CURVE_POOL_ABI,
      functionName: 'get_dy',
      args: [BigInt(fromIndex), BigInt(toIndex), amountInWei],
    });

    if (!amountOutWei || amountOutWei === 0n) return null;

    // poolType = 0 (stable) works for most Curve pools; the aggregator's _swapCurve uses same interface
    return {
      poolAddress,
      poolType: 0,
      fromIndex,
      toIndex,
      amountOutWei,
    };
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(`Curve registry error:`, err);
    }
    return null;
  }
}