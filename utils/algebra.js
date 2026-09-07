// utils/algebra.js
import { zeroAddress } from 'viem';
import { decodeAbiParameters } from 'viem';
import JSBI from 'jsbi';

/* =========================
   Algebra ABIs
========================= */
export const ALGEBRA_FACTORY_ABI = [
  {
    type: 'function',
    name: 'poolByPair',
    stateMutability: 'view',
    inputs: [
      { name: 'token0', type: 'address' },
      { name: 'token1', type: 'address' },
    ],
    outputs: [{ name: 'pool', type: 'address' }],
  },
];

/* =========================
   Helpers
========================= */
function sortTokens(tokenA, tokenB) {
  return tokenA.address.toLowerCase() < tokenB.address.toLowerCase()
    ? [tokenA, tokenB]
    : [tokenB, tokenA];
}

const Q96 = JSBI.exponentiate(JSBI.BigInt(2), JSBI.BigInt(96));

function sqrtPriceX96ToPrice(sqrtPriceX96) {
  const sqrtJSBI = JSBI.BigInt(String(sqrtPriceX96));
  const numerator = JSBI.multiply(sqrtJSBI, sqrtJSBI);
  const denominator = JSBI.multiply(Q96, Q96);
  return { numerator, denominator };
}

function getAlgebraAmountOut(sqrtPriceX96, tokenIn, amountIn, token0, token1, fee) {
  const isToken0In = tokenIn.address.toLowerCase() === token0.address.toLowerCase();
  const sqrtJSBI = JSBI.BigInt(String(sqrtPriceX96));
  const { numerator, denominator } = sqrtPriceX96ToPrice(sqrtJSBI);

  let effectiveIn = JSBI.BigInt(String(amountIn));
  if (fee > 0) {
    const feeMultiplier = JSBI.BigInt(1_000_000 - fee);
    effectiveIn = JSBI.divide(
      JSBI.multiply(effectiveIn, feeMultiplier),
      JSBI.BigInt(1_000_000)
    );
  }

  let amountOut;
  if (isToken0In) {
    amountOut = JSBI.divide(JSBI.multiply(effectiveIn, numerator), denominator);
  } else {
    amountOut = JSBI.divide(JSBI.multiply(effectiveIn, denominator), numerator);
  }
  return amountOut;
}

/* =========================
   Fetch Algebra Pool (SILENT)
========================= */
export async function fetchAlgebraPool(publicClient, factory, tokenIn, tokenOut) {
  try {
    const [token0, token1] = sortTokens(tokenIn, tokenOut);

    const poolAddress = await publicClient.readContract({
      address: factory,
      abi: ALGEBRA_FACTORY_ABI,
      functionName: 'poolByPair',
      args: [token0.address, token1.address],
    });

    if (!poolAddress || poolAddress === zeroAddress) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`Algebra poolByPair returned 0x0 for ${tokenIn.symbol}/${tokenOut.symbol}`);
      }
      return null;
    }

    return { address: poolAddress, token0, token1 };
  } catch (err) {
    // Completely silent - this is expected when pool doesn't exist or factory is different
    if (process.env.NODE_ENV === 'development') {
      console.log(`fetchAlgebraPool silent fail (no pool or wrong factory): ${tokenIn.symbol}/${tokenOut.symbol}`);
    }
    return null;
  }
}

/* =========================
   ROBUST Algebra Quote
========================= */
export async function getAlgebraQuote(publicClient, pool, tokenIn, amountIn) {
  try {
    const data = await publicClient.call({
      to: pool.address,
      data: '0xe76c01e4', // globalState()
    });

    const raw = data?.data ?? data;
    if (!raw || raw === '0x') {
      if (process.env.NODE_ENV === 'development') console.warn('globalState returned empty');
      return null;
    }

    let sqrtPriceX96, tick, fee = 0;

    // Try 6-return (most common)
    try {
      const decoded = decodeAbiParameters(
        [
          { type: 'uint160' },
          { type: 'int24' },
          { type: 'uint16' },
          { type: 'uint8' },
          { type: 'uint16' },
          { type: 'bool' },
        ],
        raw
      );
      sqrtPriceX96 = decoded[0];
      tick = decoded[1];
      fee = Number(decoded[2]);
    } catch (_) {}

    // Fallback: 4-return
    if (!sqrtPriceX96) {
      try {
        const decoded = decodeAbiParameters(
          [
            { type: 'uint160' },
            { type: 'int24' },
            { type: 'uint16' },
            { type: 'uint16' },
          ],
          raw
        );
        sqrtPriceX96 = decoded[0];
        tick = decoded[1];
        fee = Number(decoded[2]);
      } catch (_) {}
    }

    if (!sqrtPriceX96 || typeof tick === 'undefined') {
      if (process.env.NODE_ENV === 'development') {
        console.warn('Algebra globalState decode failed for pool', pool.address);
      }
      return null;
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('✅ Algebra V4 Pool State:', {
        pool: pool.address,
        sqrtPriceX96: sqrtPriceX96.toString(),
        tick: tick.toString(),
        fee,
      });
    }

    const amountOutRaw = getAlgebraAmountOut(
      sqrtPriceX96,
      tokenIn,
      amountIn,
      pool.token0,
      pool.token1,
      fee
    );

    return amountOutRaw;
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('getAlgebraQuote failed:', err.shortMessage || err.message);
    }
    return null;
  }
}