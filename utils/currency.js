import { Token, Ether, CurrencyAmount } from '@uniswap/sdk-core';

export function toUniswapToken(token, chainId) {
  if (token.isNative) {
    return Ether.onChain(chainId);
  }
  return new Token(
    chainId,
    token.address,
    token.decimals,
    token.symbol,
    token.name
  );
}

export function toCurrencyAmount(token, amount, chainId) {
  const currency = toUniswapToken(token, chainId);
  // amount is expected to be a bigint (from viem)
  return CurrencyAmount.fromRawAmount(currency, amount);
}