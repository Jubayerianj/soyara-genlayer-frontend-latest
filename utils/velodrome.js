// utils/velodrome.js

const VELODROME_FACTORY_ABI = [
  {
    inputs: [
      { name: 'tokenA', type: 'address' },
      { name: 'tokenB', type: 'address' },
      { name: 'tickSpacing', type: 'int24' },
    ],
    name: 'getPool',
    outputs: [{ name: 'pool', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
];

const SLIPSTREAM_POOL_ABI = [
  {
    name: 'slot0',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'sqrtPriceX96', type: 'uint160' },
      { name: 'tick', type: 'int24' },
      { name: 'observationIndex', type: 'uint16' },
    ],
  },
  {
    name: 'liquidity',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint128' }],
  },
  {
    name: 'token0',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'token1',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
];

/**
 * Fetch a Velodrome Slipstream pool and normalize it into the same shape
 * expected by your existing V3 quote helper.
 */
export async function fetchVelodromePoolFromFactory(
  publicClient,
  factory,
  tokenIn,
  tokenOut,
  chainId,
  tickSpacings
) {
  try {
    const isDevelopment = process.env.NODE_ENV === 'development';

    const [token0Sdk, token1Sdk] =
      tokenIn.address.toLowerCase() < tokenOut.address.toLowerCase()
        ? [tokenIn, tokenOut]
        : [tokenOut, tokenIn];

    for (const spacing of tickSpacings) {
      if (isDevelopment) {
        console.log(`🔍 Slipstream tickSpacing ${spacing}`);
      }

      const poolAddress = await publicClient.readContract({
        address: factory,
        abi: VELODROME_FACTORY_ABI,
        functionName: 'getPool',
        args: [token0Sdk.address, token1Sdk.address, spacing],
      });

      if (
        !poolAddress ||
        poolAddress === '0x0000000000000000000000000000000000000000'
      ) {
        continue;
      }

      if (isDevelopment) {
        console.log(`✅ Slipstream pool found: ${poolAddress}`);
      }

      try {
        const [slot0, liquidity, token0Addr, token1Addr] = await Promise.all([
          publicClient.readContract({
            address: poolAddress,
            abi: SLIPSTREAM_POOL_ABI,
            functionName: 'slot0',
          }),
          publicClient.readContract({
            address: poolAddress,
            abi: SLIPSTREAM_POOL_ABI,
            functionName: 'liquidity',
          }),
          publicClient.readContract({
            address: poolAddress,
            abi: SLIPSTREAM_POOL_ABI,
            functionName: 'token0',
          }),
          publicClient.readContract({
            address: poolAddress,
            abi: SLIPSTREAM_POOL_ABI,
            functionName: 'token1',
          }),
        ]);

        const sqrtPriceX96 = slot0[0];
        const tick = slot0[1];

        if (!liquidity || liquidity === 0n) {
          if (isDevelopment) {
            console.warn(`⚠️ Skip pool ${poolAddress} (no liquidity)`);
          }
          continue;
        }

        if (isDevelopment) {
          console.log(`✅ Slipstream pool ready`);
        }

        return {
          address: poolAddress,
          sqrtRatioX96: sqrtPriceX96.toString(), // IMPORTANT: matches your v3 quote helper
          liquidity: liquidity.toString(),
          tick,
          token0: {
            ...token0Sdk,
            address: token0Addr,
          },
          token1: {
            ...token1Sdk,
            address: token1Addr,
          },
          fee: 0,
          tickSpacing: spacing,
        };
      } catch (err) {
        console.warn(`⚠️ Slipstream pool read failed: ${poolAddress}`, err);
        continue;
      }
    }

    return null;
  } catch (err) {
    console.warn('Velodrome fetch error:', err);
    return null;
  }
}