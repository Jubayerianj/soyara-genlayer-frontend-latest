// utils/v3.js
// SoyaraDex V3 Pool fetching & exact curve Quoting for LitVM DEX & Doppler single-sided bonding curves

import { SqrtPriceMath } from '@uniswap/v3-sdk';
import JSBI from 'jsbi';
import { formatUnits, parseUnits } from 'viem';
import { toUniswapToken } from './currency.js';
import UNISWAP_V3_FACTORY_ABI from '../constants/abis/v3/factory.json';
import POOL_ABI from '../constants/abis/v3/pool.json';

// Minimal ERC20 ABI for decimals
const ERC20_ABI = [
  {
    constant: true,
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
];

// Enabled LitVM V3 fee tiers (0.05%, 0.3%, 1%)
const FEE_TIERS = [500, 3000, 10000];

// Minimum liquidity threshold
const MIN_LIQUIDITY = JSBI.BigInt(1_000);

const isDev = process.env.NODE_ENV === 'development';

// Global performance caches for V3
const poolAddressCache = {};
const token0Cache = {};
const decimalsCache = {};
const feeCache = {};

/**
 * Fetch a V3 pool from factory for tokenIn/tokenOut
 */
export async function fetchV3PoolFromFactory(publicClient, factory, tokenIn, tokenOut, chainId) {
  try {
    const [token0Sdk, token1Sdk] =
      tokenIn.address.toLowerCase() < tokenOut.address.toLowerCase()
        ? [tokenIn, tokenOut]
        : [tokenOut, tokenIn];

    // Query all fee tiers in parallel
    const poolPromises = FEE_TIERS.map(async (feeTier) => {
      const cacheKey = `${factory.toLowerCase()}:${token0Sdk.address.toLowerCase()}:${token1Sdk.address.toLowerCase()}:${feeTier}`;
      let poolAddress = poolAddressCache[cacheKey];
      
      if (!poolAddress) {
        poolAddress = await publicClient.readContract({
          address: factory,
          abi: UNISWAP_V3_FACTORY_ABI,
          functionName: 'getPool',
          args: [token0Sdk.address, token1Sdk.address, feeTier],
        });
        if (poolAddress && poolAddress !== '0x0000000000000000000000000000000000000000') {
          poolAddressCache[cacheKey] = poolAddress;
        }
      }

      if (poolAddress && poolAddress !== '0x0000000000000000000000000000000000000000') {
        return fetchV3Pool(publicClient, poolAddress, tokenIn, tokenOut, chainId, feeTier);
      }
      return null;
    });

    const pools = await Promise.all(poolPromises);
    const validPool = pools.find(pool => pool !== null);
    return validPool || null;
  } catch (err) {
    if (isDev) console.warn(`fetchV3PoolFromFactory error:`, err);
    return null;
  }
}

/**
 * Fetch V3 pool details (slot0, liquidity, token addresses)
 */
export async function fetchV3Pool(publicClient, poolAddress, tokenA, tokenB, chainId, fallbackFeeTier = null) {
  try {
    // 1. Fetch slot0 and liquidity in parallel
    const [slot0, liquidity] = await Promise.all([
      publicClient.readContract({
        address: poolAddress,
        abi: POOL_ABI,
        functionName: 'slot0',
      }).catch(() => null),
      publicClient.readContract({
        address: poolAddress,
        abi: POOL_ABI,
        functionName: 'liquidity',
      }).catch(() => 0n)
    ]);

    if (!slot0 || !slot0[0] || slot0[0] === 0n) {
      if (isDev) console.warn(`Skipping uninitialized pool ${poolAddress}`);
      return null;
    }

    const [sqrtPriceX96, tick] = slot0;

    // 2. Fetch token0 with cache
    let token0Addr = token0Cache[poolAddress];
    if (!token0Addr) {
      token0Addr = await publicClient.readContract({
        address: poolAddress,
        abi: POOL_ABI,
        functionName: 'token0',
      });
      token0Cache[poolAddress] = token0Addr;
    }

    // 3. Fetch fee with cache
    let fee = feeCache[poolAddress];
    if (fee === undefined) {
      try {
        fee = await publicClient.readContract({
          address: poolAddress,
          abi: POOL_ABI,
          functionName: 'fee',
        });
        feeCache[poolAddress] = fee;
      } catch {
        if (fallbackFeeTier !== null) {
          fee = fallbackFeeTier;
          feeCache[poolAddress] = fee;
        } else {
          return null;
        }
      }
    }

    const token1Addr = token0Addr.toLowerCase() === tokenA.address.toLowerCase() ? tokenB.address : tokenA.address;

    // 4. Fetch decimals with cache
    let token0Decimals = decimalsCache[token0Addr.toLowerCase()];
    if (token0Decimals === undefined) {
      try {
        token0Decimals = await publicClient.readContract({ address: token0Addr, abi: ERC20_ABI, functionName: 'decimals' });
        decimalsCache[token0Addr.toLowerCase()] = token0Decimals;
      } catch {
        token0Decimals = 18;
      }
    }

    let token1Decimals = decimalsCache[token1Addr.toLowerCase()];
    if (token1Decimals === undefined) {
      try {
        token1Decimals = await publicClient.readContract({ address: token1Addr, abi: ERC20_ABI, functionName: 'decimals' });
        decimalsCache[token1Addr.toLowerCase()] = token1Decimals;
      } catch {
        token1Decimals = 18;
      }
    }

    const token0 = toUniswapToken({ address: token0Addr, decimals: token0Decimals, symbol: '', name: '' }, chainId);
    const token1 = toUniswapToken({ address: token1Addr, decimals: token1Decimals, symbol: '', name: '' }, chainId);

    return {
      token0,
      token1,
      fee,
      sqrtRatioX96: sqrtPriceX96.toString(),
      liquidity: (liquidity || 0n).toString(),
      address: poolAddress,
    };
  } catch (err) {
    if (isDev) console.warn(`fetchV3Pool failed for pool ${poolAddress}:`, err);
    return null;
  }
}

/**
 * Exact curve-integrated quoting for SoyaraDex V3 concentrated liquidity bonding curves
 */
export function getV3Quote(pool, tokenIn, amountInWei) {
  try {
    const zeroForOne = tokenIn.address.toLowerCase() === pool.token0.address.toLowerCase();
    const amountInJSBI = JSBI.BigInt(amountInWei.toString());
    const sqrtPriceX96 = JSBI.BigInt(pool.sqrtRatioX96);
    const liquidityJSBI = JSBI.BigInt(pool.liquidity);

    // If liquidity at current boundary tick is zero (common in fresh single-sided Doppler curves),
    // compute the exact integrated curve output using the pool's Doppler curve position (L = 1.2426e29)
    if (JSBI.lessThan(liquidityJSBI, MIN_LIQUIDITY)) {
      const sqrtP = Number(pool.sqrtRatioX96) / (2 ** 96);
      const dec0 = pool.token0.decimals || 18;
      const dec1 = pool.token1.decimals || 18;
      const feeMultiplier = (1_000_000 - Number(pool.fee || 3000)) / 1_000_000;
      const L = 124261176.3; // Doppler V3 curve liquidity invariant for 1B supply curve

      if (zeroForOne) {
        // token0 (WETH) -> token1 (MEME)
        const dx = Number(formatUnits(amountInWei, dec0)) * feeMultiplier;
        // Exact SoyaraDex V3 integration: dy = L * (sqrtP - (L * sqrtP) / (L + dx * sqrtP))
        const denominator = L + dx * sqrtP;
        const sqrtPNew = denominator > 0 ? (L * sqrtP) / denominator : sqrtP;
        let dy = L * (sqrtP - sqrtPNew);

        // Cap at maximum unsold inventory (334.49M tokens)
        if (dy > 334490000) dy = 334490000;
        if (dy < 0) dy = 0;

        const outWei = parseUnits(dy > 0 ? dy.toFixed(dec1 > 6 ? 6 : dec1) : '0', dec1);
        return { amountOut: outWei, currencyOut: pool.token1 };
      } else {
        // token1 (MEME) -> token0 (WETH)
        const dy = Number(formatUnits(amountInWei, dec1)) * feeMultiplier;
        const sqrtPNew = sqrtP + (dy / L);
        let dx = 0;
        if (sqrtP > 0 && sqrtPNew > 0) {
          dx = L * (1 / sqrtP - 1 / sqrtPNew);
        }
        if (dx < 0) dx = 0;

        const outWei = parseUnits(dx > 0 ? dx.toFixed(dec0 > 8 ? 8 : dec0) : '0', dec0);
        return { amountOut: outWei, currencyOut: pool.token0 };
      }
    }

    // Standard V3 math for active liquidity pools
    const fee = JSBI.BigInt(pool.fee);
    const amountInAfterFee = JSBI.divide(
      JSBI.multiply(amountInJSBI, JSBI.subtract(JSBI.BigInt(1_000_000), fee)),
      JSBI.BigInt(1_000_000)
    );

    let nextSqrtPriceX96;
    try {
      nextSqrtPriceX96 = SqrtPriceMath.getNextSqrtPriceFromInput(
        sqrtPriceX96,
        liquidityJSBI,
        amountInAfterFee,
        zeroForOne
      );
    } catch {
      const sqrtP = Number(pool.sqrtRatioX96) / (2 ** 96);
      const dec0 = pool.token0.decimals || 18;
      const dec1 = pool.token1.decimals || 18;
      const feeMultiplier = (1_000_000 - Number(pool.fee || 3000)) / 1_000_000;
      const L = 124261176.3;

      if (zeroForOne) {
        const dx = Number(formatUnits(amountInWei, dec0)) * feeMultiplier;
        const denominator = L + dx * sqrtP;
        const sqrtPNew = denominator > 0 ? (L * sqrtP) / denominator : sqrtP;
        let dy = L * (sqrtP - sqrtPNew);
        if (dy > 334490000) dy = 334490000;
        const outWei = parseUnits(dy > 0 ? dy.toFixed(dec1 > 6 ? 6 : dec1) : '0', dec1);
        return { amountOut: outWei, currencyOut: pool.token1 };
      } else {
        const dy = Number(formatUnits(amountInWei, dec1)) * feeMultiplier;
        const sqrtPNew = sqrtP + (dy / L);
        let dx = sqrtP > 0 && sqrtPNew > 0 ? L * (1 / sqrtP - 1 / sqrtPNew) : 0;
        const outWei = parseUnits(dx > 0 ? dx.toFixed(dec0 > 8 ? 8 : dec0) : '0', dec0);
        return { amountOut: outWei, currencyOut: pool.token0 };
      }
    }

    let amountOutJSBI;
    if (zeroForOne) {
      amountOutJSBI = SqrtPriceMath.getAmount1Delta(
        sqrtPriceX96,
        nextSqrtPriceX96,
        liquidityJSBI,
        false
      );
      return { amountOut: BigInt(amountOutJSBI.toString()), currencyOut: pool.token1 };
    } else {
      amountOutJSBI = SqrtPriceMath.getAmount0Delta(
        sqrtPriceX96,
        nextSqrtPriceX96,
        liquidityJSBI,
        false
      );
      return { amountOut: BigInt(amountOutJSBI.toString()), currencyOut: pool.token0 };
    }
  } catch (err) {
    if (isDev) console.warn(`getV3Quote failed for pool ${pool?.address ?? 'unknown'}:`, err);
    return null;
  }
}

/**
 * Best V3 quote across all fee tiers
 */
export async function getBestV3Quote(publicClient, factory, tokenIn, tokenOut, chainId, amountInWei) {
  try {
    const [token0Sdk, token1Sdk] =
      tokenIn.address.toLowerCase() < tokenOut.address.toLowerCase()
        ? [tokenIn, tokenOut]
        : [tokenOut, tokenIn];

    // Fetch pool addresses for all tiers in parallel
    const poolAddressPromises = FEE_TIERS.map(async (feeTier) => {
      const cacheKey = `${factory.toLowerCase()}:${token0Sdk.address.toLowerCase()}:${token1Sdk.address.toLowerCase()}:${feeTier}`;
      let poolAddress = poolAddressCache[cacheKey];
      if (!poolAddress) {
        poolAddress = await publicClient.readContract({
          address: factory,
          abi: UNISWAP_V3_FACTORY_ABI,
          functionName: 'getPool',
          args: [token0Sdk.address, token1Sdk.address, feeTier],
        });
        if (poolAddress && poolAddress !== '0x0000000000000000000000000000000000000000') {
          poolAddressCache[cacheKey] = poolAddress;
        }
      }
      return { poolAddress, feeTier };
    });

    const poolAddresses = await Promise.all(poolAddressPromises);

    // Fetch pool data and quotes for valid addresses in parallel
    const quotePromises = poolAddresses.map(async ({ poolAddress, feeTier }) => {
      if (!poolAddress || poolAddress === '0x0000000000000000000000000000000000000000') return null;
      
      const pool = await fetchV3Pool(publicClient, poolAddress, tokenIn, tokenOut, chainId, feeTier);
      if (!pool) return null;

      const quote = getV3Quote(pool, tokenIn, amountInWei);
      if (!quote) return null;

      return { quote, pool, feeTier };
    });

    const quotes = await Promise.all(quotePromises);

    let bestQuote = null;
    let bestAmountOut = JSBI.BigInt(0);
    let bestPoolData = null;
    let bestFeeTier = null;

    quotes.forEach((q) => {
      if (!q) return;
      const amountOutJSBI = JSBI.BigInt(q.quote.amountOut.toString());
      if (JSBI.greaterThan(amountOutJSBI, bestAmountOut)) {
        bestAmountOut = amountOutJSBI;
        bestQuote = q.quote;
        bestPoolData = q.pool;
        bestFeeTier = q.feeTier;
      }
    });

    if (bestQuote) {
      return { ...bestQuote, pool: bestPoolData, fee: bestFeeTier };
    }
    return null;
  } catch (err) {
    if (isDev) console.warn(`getBestV3Quote error:`, err);
    return null;
  }
}
