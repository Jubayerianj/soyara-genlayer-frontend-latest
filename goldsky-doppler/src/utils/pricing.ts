import { BigDecimal, BigInt, Address } from '@graphprotocol/graph-ts';
import { Bundle } from '../../generated/schema';
import { ZERO_BD, ONE_BD, DEFAULT_ETH_USD_PRICE } from './constants';

export function getOrCreateBundle(): Bundle {
  let bundle = Bundle.load('1');
  if (bundle === null) {
    bundle = new Bundle('1');
    bundle.ethPriceUSD = DEFAULT_ETH_USD_PRICE;
    bundle.save();
  }
  return bundle as Bundle;
}

export function sqrtPriceX96ToPrice(sqrtPriceX96: BigInt, isToken0: boolean): BigDecimal {
  let q96 = BigInt.fromI32(2).pow(96).toBigDecimal();
  let sqrt = sqrtPriceX96.toBigDecimal().div(q96);
  let price = sqrt.times(sqrt);
  
  if (price.equals(ZERO_BD)) {
    return ZERO_BD;
  }
  
  if (isToken0) {
    return ONE_BD.div(price);
  }
  return price;
}
