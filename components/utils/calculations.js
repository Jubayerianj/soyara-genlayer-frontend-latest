
// utils/calculations.js

import { ethers } from 'ethers';

// Calculate swap amounts based on reserves
export const calculateSwapAmounts = (
  amountIn,
  reserveIn,
  reserveOut,
  fee = 997 // 0.3% fee (997/1000)
) => {
  if (reserveIn.isZero() || reserveOut.isZero()) {
    return ethers.constants.Zero;
  }

  const amountInWithFee = amountIn.mul(fee);
  const numerator = amountInWithFee.mul(reserveOut);
  const denominator = reserveIn.mul(1000).add(amountInWithFee);
  
  return numerator.div(denominator);
};

// Calculate optimal liquidity amounts
export const calculateOptimalAmounts = (
  amountADesired,
  amountBDesired,
  reserveA,
  reserveB
) => {
  if (reserveA.isZero() || reserveB.isZero()) {
    return { amountA: amountADesired, amountB: amountBDesired };
  }

  const amountBOptimal = amountADesired.mul(reserveB).div(reserveA);
  
  if (amountBOptimal.lte(amountBDesired)) {
    return { amountA: amountADesired, amountB: amountBOptimal };
  } else {
    const amountAOptimal = amountBDesired.mul(reserveA).div(reserveB);
    return { amountA: amountAOptimal, amountB: amountBDesired };
  }
};

// Calculate slippage amounts
export const calculateSlippageAmount = (amount, slippagePercent) => {
  const slippageBasisPoints = slippagePercent * 100;
  const slippageAmount = amount.mul(slippageBasisPoints).div(10000);
  
  return {
    minAmount: amount.sub(slippageAmount),
    maxAmount: amount.add(slippageAmount),
    slippageAmount
  };
};

// Calculate impermanent loss
export const calculateImpermanentLoss = (
  priceRatioChange // newPrice / originalPrice
) => {
  const sqrtRatio = Math.sqrt(priceRatioChange);
  const impermanentLoss = 2 * sqrtRatio / (1 + priceRatioChange) - 1;
  
  return Math.abs(impermanentLoss * 100); // Return as percentage
};

// Calculate trading fees earned
export const calculateTradingFees = (
  volume24h,
  liquidityShare,
  feeRate = 0.003 // 0.3%
) => {
  const totalFees = volume24h * feeRate;
  return totalFees * (liquidityShare / 100);
};

// Calculate APR from trading volume
export const calculateTradingAPR = (
  volume24h,
  liquidity,
  feeRate = 0.003
) => {
  if (liquidity <= 0) return 0;
  
  const dailyFees = volume24h * feeRate;
  const annualFees = dailyFees * 365;
  
  return (annualFees / liquidity) * 100;
};

// Calculate price impact for swap
export const calculatePriceImpact = (
  amountIn,
  reserveIn,
  reserveOut,
  fee = 997
) => {
  if (reserveIn.isZero() || reserveOut.isZero()) return 100;
  
  const amountOut = calculateSwapAmounts(amountIn, reserveIn, reserveOut, fee);
  const priceBefore = reserveOut.mul(10000).div(reserveIn).toNumber() / 10000;
  const priceAfter = reserveOut.sub(amountOut).mul(10000).div(reserveIn.add(amountIn)).toNumber() / 10000;
  
  const impact = ((priceBefore - priceAfter) / priceBefore) * 100;
  return Math.max(0, impact);
};

// Calculate minimum liquidity for profitable position
export const calculateMinLiquidity = (
  gasCost, // in ETH
  expectedDailyVolume,
  positionShare, // as decimal (0.01 for 1%)
  feeRate = 0.003,
  ethPrice = 2000
) => {
  const gasCostUSD = gasCost * ethPrice;
  const dailyFees = expectedDailyVolume * feeRate * positionShare;
  const breakevenDays = gasCostUSD / dailyFees;
  
  return {
    breakevenDays,
    minDailyVolume: gasCostUSD / (feeRate * positionShare),
    recommendedLiquidity: (gasCostUSD * 100) / (feeRate * positionShare * ethPrice)
  };
};

// Calculate optimal swap path
export const findOptimalPath = (pairs, fromToken, toToken, amountIn) => {
  // Simplified path finding - in production use Dijkstra or similar algorithm
  const directPair = pairs.find(p => 
    (p.token0 === fromToken && p.token1 === toToken) ||
    (p.token1 === fromToken && p.token0 === toToken)
  );
  
  if (directPair) {
    return [fromToken, toToken];
  }
  
  // Find path through WETH
  const wethPairFrom = pairs.find(p => 
    (p.token0 === fromToken && p.token1 === 'WETH') ||
    (p.token1 === fromToken && p.token0 === 'WETH')
  );
  
  const wethPairTo = pairs.find(p => 
    (p.token0 === 'WETH' && p.token1 === toToken) ||
    (p.token1 === 'WETH' && p.token0 === toToken)
  );
  
  if (wethPairFrom && wethPairTo) {
    return [fromToken, 'WETH', toToken];
  }
  
  return null;
};

// Calculate position health score
export const calculatePositionHealth = (
  impermanentLoss,
  feesEarned,
  positionDuration,
  gasCosts
) => {
  let score = 100;
  
  // Deduct for impermanent loss
  score -= impermanentLoss * 2; // Weighted 2x
  
  // Add for fees earned relative to duration
  const dailyFees = feesEarned / (positionDuration / (24 * 60 * 60));
  score += Math.min(dailyFees * 10, 30); // Cap at +30
  
  // Deduct for gas costs relative to fees
  if (feesEarned > 0) {
    const gasRatio = gasCosts / feesEarned;
    score -= Math.min(gasRatio * 20, 40); // Cap at -40
  }
  
  return Math.max(0, Math.min(100, score));
};