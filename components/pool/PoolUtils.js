import { formatUnits, parseUnits } from 'viem';

export const DEFAULT_CHAIN = 4221;
export const DEADLINE_MINUTES = 20;
export const SLIPPAGE_PERCENT = 0.5;
export const PRICE_RATIO_GUARD_PERCENT = 3;
export const BPS_DENOMINATOR = 10000n;

export const V3_FEE_OPTIONS = [
  { label: '0.05%', value: 500 },
  { label: '0.3%', value: 3000 },
  { label: '1%', value: 10000 },
];

const Q32 = 2n ** 32n;
const Q96 = 2n ** 96n;
const Q128 = 2n ** 128n;
const MAX_UINT256 = (1n << 256n) - 1n;

export const V3_MIN_TICK = -887272;
export const V3_MAX_TICK = 887272;

export const getV3TickSpacing = (fee) => {
  if (fee === 500) return 10;
  if (fee === 3000) return 60;
  if (fee === 10000) return 200;
  throw new Error('Selected V3 fee tier is not enabled on this factory');
};

const mulShift128 = (value, multiplier) => (value * multiplier) >> 128n;

export const getSqrtRatioAtTick = (tick) => {
  if (!Number.isInteger(tick) || tick < V3_MIN_TICK || tick > V3_MAX_TICK) {
    throw new Error('Invalid V3 tick');
  }

  const absTick = tick < 0 ? -tick : tick;
  let ratio = (absTick & 0x1) !== 0
    ? 0xfffcb933bd6fad37aa2d162d1a594001n
    : 0x100000000000000000000000000000000n;

  if ((absTick & 0x2) !== 0) ratio = mulShift128(ratio, 0xfff97272373d413259a46990580e213an);
  if ((absTick & 0x4) !== 0) ratio = mulShift128(ratio, 0xfff2e50f5f656932ef12357cf3c7fdccn);
  if ((absTick & 0x8) !== 0) ratio = mulShift128(ratio, 0xffe5caca7e10e4e61c3624eaa0941cd0n);
  if ((absTick & 0x10) !== 0) ratio = mulShift128(ratio, 0xffcb9843d60f6159c9db58835c926644n);
  if ((absTick & 0x20) !== 0) ratio = mulShift128(ratio, 0xff973b41fa98c081472e6896dfb254c0n);
  if ((absTick & 0x40) !== 0) ratio = mulShift128(ratio, 0xff2ea16466c96a3843ec78b326b52861n);
  if ((absTick & 0x80) !== 0) ratio = mulShift128(ratio, 0xfe5dee046a99a2a811c461f1969c3053n);
  if ((absTick & 0x100) !== 0) ratio = mulShift128(ratio, 0xfcbe86c7900a88aedcffc83b479aa3a4n);
  if ((absTick & 0x200) !== 0) ratio = mulShift128(ratio, 0xf987a7253ac413176f2b074cf7815e54n);
  if ((absTick & 0x400) !== 0) ratio = mulShift128(ratio, 0xf3392b0822b70005940c7a398e4b70f3n);
  if ((absTick & 0x800) !== 0) ratio = mulShift128(ratio, 0xe7159475a2c29b7443b29c7fa6e889d9n);
  if ((absTick & 0x1000) !== 0) ratio = mulShift128(ratio, 0xd097f3bdfd2022b8845ad8f792aa5825n);
  if ((absTick & 0x2000) !== 0) ratio = mulShift128(ratio, 0xa9f746462d870fdf8a65dc1f90e061e5n);
  if ((absTick & 0x4000) !== 0) ratio = mulShift128(ratio, 0x70d869a156d2a1b890bb3df62baf32f7n);
  if ((absTick & 0x8000) !== 0) ratio = mulShift128(ratio, 0x31be135f97d08fd981231505542fcfan);
  if ((absTick & 0x10000) !== 0) ratio = mulShift128(ratio, 0x9aa508b5b7a84e1c677de54f3e99bcn);
  if ((absTick & 0x20000) !== 0) ratio = mulShift128(ratio, 0x5d6af8dedb81196699c329225ee604n);
  if ((absTick & 0x40000) !== 0) ratio = mulShift128(ratio, 0x2216e584f5fa1ea926041bedfe98n);
  if ((absTick & 0x80000) !== 0) ratio = mulShift128(ratio, 0x48a170391f7dc42444e8fa2n);

  if (tick > 0) ratio = MAX_UINT256 / ratio;
  const quotient = ratio / Q32;
  return ratio % Q32 === 0n ? quotient : quotient + 1n;
};

const sortSqrtRatios = (sqrtRatioAX96, sqrtRatioBX96) => (
  sqrtRatioAX96 > sqrtRatioBX96
    ? [sqrtRatioBX96, sqrtRatioAX96]
    : [sqrtRatioAX96, sqrtRatioBX96]
);

export const integerSqrt = (value) => {
  if (value < 0n) throw new Error('Cannot square root negative bigint');
  if (value < 2n) return value;

  let small = integerSqrt(value >> 2n) << 1n;
  let large = small + 1n;
  return large * large > value ? small : large;
};

export const encodeSqrtRatioX96 = (amount1, amount0) => {
  if (!amount0 || amount0 <= 0n) return 0n;
  return integerSqrt((amount1 << 192n) / amount0);
};

export const getAmount0Delta = (sqrtRatioAX96, sqrtRatioBX96, liquidity) => {
  if (!liquidity || liquidity <= 0n) return 0n;
  const [sqrtA, sqrtB] = sortSqrtRatios(sqrtRatioAX96, sqrtRatioBX96);
  return (((liquidity << 96n) * (sqrtB - sqrtA)) / sqrtB) / sqrtA;
};

export const getAmount1Delta = (sqrtRatioAX96, sqrtRatioBX96, liquidity) => {
  if (!liquidity || liquidity <= 0n) return 0n;
  const [sqrtA, sqrtB] = sortSqrtRatios(sqrtRatioAX96, sqrtRatioBX96);
  return (liquidity * (sqrtB - sqrtA)) / Q96;
};

export const calculateV3PositionTokenAmounts = ({
  sqrtPriceX96,
  currentTick,
  tickLower,
  tickUpper,
  liquidity,
}) => {
  if (!sqrtPriceX96 || sqrtPriceX96 <= 0n || !liquidity || liquidity <= 0n) {
    return { amount0: 0n, amount1: 0n };
  }

  try {
    const sqrtLowerX96 = getSqrtRatioAtTick(Number(tickLower));
    const sqrtUpperX96 = getSqrtRatioAtTick(Number(tickUpper));
    const tick = Number(currentTick);

    if (tick < Number(tickLower)) {
      return {
        amount0: getAmount0Delta(sqrtLowerX96, sqrtUpperX96, liquidity),
        amount1: 0n,
      };
    }

    if (tick < Number(tickUpper)) {
      return {
        amount0: getAmount0Delta(sqrtPriceX96, sqrtUpperX96, liquidity),
        amount1: getAmount1Delta(sqrtLowerX96, sqrtPriceX96, liquidity),
      };
    }

    return {
      amount0: 0n,
      amount1: getAmount1Delta(sqrtLowerX96, sqrtUpperX96, liquidity),
    };
  } catch {
    return { amount0: 0n, amount1: 0n };
  }
};

export const applySlippage = (amount, slippagePercent = SLIPPAGE_PERCENT) => {
  const slippageBps = BigInt(Math.floor(slippagePercent * 100));
  return (amount * (BPS_DENOMINATOR - slippageBps)) / BPS_DENOMINATOR;
};

export const subIn256 = (left, right) => {
  const result = left - right;
  return result < 0n ? result + MAX_UINT256 + 1n : result;
};

export const calculateV3UncollectedFees = ({
  currentTick,
  tickLower,
  tickUpper,
  liquidity,
  feeGrowthInside0LastX128,
  feeGrowthInside1LastX128,
  feeGrowthGlobal0X128,
  feeGrowthGlobal1X128,
  lowerFeeGrowthOutside0X128,
  lowerFeeGrowthOutside1X128,
  upperFeeGrowthOutside0X128,
  upperFeeGrowthOutside1X128,
  tokensOwed0 = 0n,
  tokensOwed1 = 0n,
}) => {
  if (!liquidity || liquidity <= 0n) {
    return { fees0: tokensOwed0, fees1: tokensOwed1 };
  }

  const tick = Number(currentTick);
  const lower = Number(tickLower);
  const upper = Number(tickUpper);

  const feeGrowthBelow0X128 = tick >= lower
    ? lowerFeeGrowthOutside0X128
    : subIn256(feeGrowthGlobal0X128, lowerFeeGrowthOutside0X128);
  const feeGrowthBelow1X128 = tick >= lower
    ? lowerFeeGrowthOutside1X128
    : subIn256(feeGrowthGlobal1X128, lowerFeeGrowthOutside1X128);
  const feeGrowthAbove0X128 = tick < upper
    ? upperFeeGrowthOutside0X128
    : subIn256(feeGrowthGlobal0X128, upperFeeGrowthOutside0X128);
  const feeGrowthAbove1X128 = tick < upper
    ? upperFeeGrowthOutside1X128
    : subIn256(feeGrowthGlobal1X128, upperFeeGrowthOutside1X128);

  const feeGrowthInside0X128 = subIn256(
    subIn256(feeGrowthGlobal0X128, feeGrowthBelow0X128),
    feeGrowthAbove0X128
  );
  const feeGrowthInside1X128 = subIn256(
    subIn256(feeGrowthGlobal1X128, feeGrowthBelow1X128),
    feeGrowthAbove1X128
  );

  const accrued0 = (liquidity * subIn256(feeGrowthInside0X128, feeGrowthInside0LastX128)) / Q128;
  const accrued1 = (liquidity * subIn256(feeGrowthInside1X128, feeGrowthInside1LastX128)) / Q128;

  return {
    fees0: tokensOwed0 + accrued0,
    fees1: tokensOwed1 + accrued1,
  };
};

export const compactNumber = (value, digits = 4) => {
  const numeric = typeof value === 'string' ? parseFloat(value) : Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return '0';
  if (numeric >= 1000000) return `${(numeric / 1000000).toFixed(2)}M`;
  if (numeric >= 1000) return `${(numeric / 1000).toFixed(2)}K`;
  if (numeric >= 1) return numeric.toFixed(Math.min(digits, 4));
  if (numeric >= 0.0001) return numeric.toFixed(6);
  return numeric.toExponential(2);
};

export const formatBigIntBalance = (value, decimals = 18, digits = 6) => {
  if (!value || value === 0n) return '0';
  try {
    const formatted = formatUnits(value, decimals);
    const numeric = parseFloat(formatted);
    if (!Number.isFinite(numeric) || numeric <= 0) return '0';
    return numeric.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: digits,
      useGrouping: false,
    });
  } catch {
    return '0';
  }
};

export const safeParseAmount = (amount, decimals = 18) => {
  if (!amount || Number(amount) <= 0) return 0n;
  try {
    return parseUnits(amount, decimals);
  } catch {
    return 0n;
  }
};

export const resolveTokenAddress = (token, addresses) => {
  if (!token) return '0x0000000000000000000000000000000000000000';
  return token.isNative ? addresses?.weth || '0x0000000000000000000000000000000000000000' : token.address;
};

export const makePairKey = (tokenA, tokenB) => {
  const [a, b] = [tokenA.address.toLowerCase(), tokenB.address.toLowerCase()].sort();
  return `${a}:${b}`;
};

export const formatSharePercent = (balance, totalSupply) => {
  if (!balance || !totalSupply || totalSupply === 0n) return '0.0000%';
  const scaled = (balance * 1000000n) / totalSupply;
  const integer = scaled / 10000n;
  const fraction = (scaled % 10000n).toString().padStart(4, '0');
  return `${integer.toString()}.${fraction}%`;
};

export const buildPairs = (tokens, addresses) => {
  const pairs = [];
  const baseSymbols = ['GEN', 'WGEN', 'USDC', 'USDT', 'WBTC', 'ETH', 'FSWP'];

  for (let i = 0; i < tokens.length; i += 1) {
    for (let j = i + 1; j < tokens.length; j += 1) {
      const tokenA = tokens[i];
      const tokenB = tokens[j];
      const wrappedNative = addresses?.weth?.toLowerCase();

      if (
        (tokenA.isNative && tokenB.address.toLowerCase() === wrappedNative) ||
        (tokenB.isNative && tokenA.address.toLowerCase() === wrappedNative)
      ) {
        continue;
      }

      // Base token pairing restriction: at least one token must be a base asset
      const isABase = baseSymbols.includes(tokenA.symbol) || tokenA.isNative;
      const isBBase = baseSymbols.includes(tokenB.symbol) || tokenB.isNative;
      if (!isABase && !isBBase) {
        continue;
      }

      pairs.push({
        key: makePairKey(tokenA, tokenB),
        tokenA,
        tokenB,
      });
    }
  }

  return pairs;
};

export const getLogo = (token) => token?.logoURI || '';
