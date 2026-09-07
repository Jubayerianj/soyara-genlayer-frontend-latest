// utils/bigint-safe.js
export function safeBigInt(value) {
  if (value === undefined || value === null) return 0n;
  try {
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number') return BigInt(Math.floor(value));
    if (typeof value === 'string') {
      // Remove decimals for BigInt conversion
      const [integerPart] = value.split('.');
      return BigInt(integerPart || '0');
    }
    return BigInt(value.toString());
  } catch (error) {
    console.error('Error converting to BigInt:', value, error);
    return 0n;
  }
}

export function calculateWithSlippage(amount, slippagePercent) {
  try {
    const amountBigInt = safeBigInt(amount);
    if (amountBigInt === 0n) return 0n;
    
    const slippageBps = BigInt(Math.floor(slippagePercent * 100));
    const numerator = amountBigInt * (10000n - slippageBps);
    return numerator / 10000n;
  } catch (error) {
    console.error('Error calculating with slippage:', error);
    return 0n;
  }
}