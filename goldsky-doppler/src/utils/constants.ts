import { BigDecimal, BigInt, Address } from '@graphprotocol/graph-ts';

export let ZERO_BI = BigInt.fromI32(0);
export let ONE_BI = BigInt.fromI32(1);
export let ZERO_BD = BigDecimal.fromString('0');
export let ONE_BD = BigDecimal.fromString('1');
export let BI_18 = BigInt.fromI32(18);

export let FACTORY_ADDRESS = '0x803CDD17e0be6652f407fe39e6779b93cfAb1c19';
export let WETH_ADDRESS = '0x315374AA9b5536037Cc1Efeea2439CCC0913A77e'; // Wrapped zkLTC on LitVM
export let DEFAULT_ETH_USD_PRICE = BigDecimal.fromString('44.22'); // zkLTC USD price from DIA Oracle

export function exponentToBigDecimal(decimals: BigInt): BigDecimal {
  let bd = BigDecimal.fromString('1');
  for (let i = ZERO_BI; i.lt(decimals); i = i.plus(ONE_BI)) {
    bd = bd.times(BigDecimal.fromString('10'));
  }
  return bd;
}

export function toDecimal(amount: BigInt, decimals: BigInt): BigDecimal {
  return amount.toBigDecimal().div(exponentToBigDecimal(decimals));
}
