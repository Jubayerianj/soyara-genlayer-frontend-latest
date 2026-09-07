import { BigInt, BigDecimal, Address } from '@graphprotocol/graph-ts';
import { Swap as V3SwapEvent } from '../../generated/templates/UniswapV3Pool/UniswapV3Pool';
import { Token, Pool, Swap, TokenDayData, TokenHourData } from '../../generated/schema';
import { ZERO_BI, ONE_BI, ZERO_BD, toDecimal } from '../utils/constants';
import { getOrCreateBundle, sqrtPriceX96ToPrice } from '../utils/pricing';

export function handleUniswapV3Swap(event: V3SwapEvent): void {
  let pool = Pool.load(event.address.toHexString().toLowerCase());
  if (pool === null) return;

  let token = Token.load(pool.token);
  if (token === null) return;

  let bundle = getOrCreateBundle();
  let isToken0 = token.id < pool.numeraire.toHexString().toLowerCase();

  // Price calculations
  let priceETH = sqrtPriceX96ToPrice(BigInt.fromI32(0).plus(event.params.sqrtPriceX96), isToken0);
  let priceUSD = priceETH.times(bundle.ethPriceUSD);

  token.priceETH = priceETH;
  token.priceUSD = priceUSD;
  token.marketCapUSD = token.priceUSD.times(toDecimal(token.totalSupply, token.decimals));

  // Determine swap amounts
  let amount0 = toDecimal(event.params.amount0.abs(), token.decimals);
  let amount1 = toDecimal(event.params.amount1.abs(), BigInt.fromI32(18));
  let amountToken = isToken0 ? amount0 : amount1;
  let amountNumeraire = isToken0 ? amount1 : amount0;
  let amountUSD = amountNumeraire.times(bundle.ethPriceUSD);

  // Direction: isBuy (token bought with zkLTC/WETH)
  let isBuy = isToken0 ? event.params.amount0.lt(BigInt.fromI32(0)) : event.params.amount1.lt(BigInt.fromI32(0));

  token.tradeVolumeUSD = token.tradeVolumeUSD.plus(amountUSD);
  token.totalSwaps = token.totalSwaps.plus(ONE_BI);
  token.txCount = token.txCount.plus(ONE_BI);

  // Update bonding curve progress as tokens are bought
  if (!token.isGraduated) {
    let poolInitialTarget = BigDecimal.fromString('334496247');
    let estimatedSold = token.tradeVolumeUSD.div(bundle.ethPriceUSD).times(BigDecimal.fromString('18833777'));
    let currentPct = estimatedSold.div(poolInitialTarget).times(BigDecimal.fromString('100'));
    if (currentPct.gt(BigDecimal.fromString('100'))) {
      currentPct = BigDecimal.fromString('100');
    }
    if (currentPct.lt(ZERO_BD)) {
      currentPct = ZERO_BD;
    }
    token.bondingCurveProgress = currentPct;
  }

  token.save();

  pool.volumeUSD = pool.volumeUSD.plus(amountUSD);
  pool.totalSwaps = pool.totalSwaps.plus(ONE_BI);
  pool.sqrtPriceX96 = BigInt.fromI32(0).plus(event.params.sqrtPriceX96);
  pool.tick = BigInt.fromI32(event.params.tick);
  pool.liquidity = BigInt.fromI32(0).plus(event.params.liquidity);
  pool.save();

  // Create immutable Swap entity
  let swapId = event.transaction.hash.toHexString() + '-' + event.logIndex.toString();
  let swap = new Swap(swapId);
  swap.transactionHash = event.transaction.hash;
  swap.blockNumber = event.block.number;
  swap.timestamp = event.block.timestamp;
  swap.token = token.id;
  swap.pool = event.address;
  swap.sender = event.params.sender;
  swap.recipient = event.params.recipient;
  swap.origin = event.transaction.from;
  swap.amountToken = amountToken;
  swap.amountNumeraire = amountNumeraire;
  swap.amountUSD = amountUSD;
  swap.isBuy = isBuy;
  swap.save();

  // Update TokenDayData (OHLCV candles)
  let dayID = event.block.timestamp.toI32() / 86400;
  let dayDataId = token.id + '-' + dayID.toString();
  let dayData = TokenDayData.load(dayDataId);
  if (dayData === null) {
    dayData = new TokenDayData(dayDataId);
    dayData.date = dayID * 86400;
    dayData.token = token.id;
    dayData.open = priceUSD;
    dayData.high = priceUSD;
    dayData.low = priceUSD;
    dayData.close = priceUSD;
    dayData.volumeUSD = ZERO_BD;
    dayData.volumeToken = ZERO_BD;
    dayData.txCount = ZERO_BI;
  }
  if (priceUSD.gt(dayData.high)) dayData.high = priceUSD;
  if (priceUSD.lt(dayData.low)) dayData.low = priceUSD;
  dayData.close = priceUSD;
  dayData.volumeUSD = dayData.volumeUSD.plus(amountUSD);
  dayData.volumeToken = dayData.volumeToken.plus(amountToken);
  dayData.txCount = dayData.txCount.plus(ONE_BI);
  dayData.save();

  // Update TokenHourData
  let hourIndex = event.block.timestamp.toI32() / 3600;
  let hourStartUnix = hourIndex * 3600;
  let hourDataId = token.id + '-' + hourIndex.toString();
  let hourData = TokenHourData.load(hourDataId);
  if (hourData === null) {
    hourData = new TokenHourData(hourDataId);
    hourData.hourStartUnix = hourStartUnix;
    hourData.token = token.id;
    hourData.open = priceUSD;
    hourData.high = priceUSD;
    hourData.low = priceUSD;
    hourData.close = priceUSD;
    hourData.volumeUSD = ZERO_BD;
    hourData.volumeToken = ZERO_BD;
    hourData.txCount = ZERO_BI;
  }
  if (priceUSD.gt(hourData.high)) hourData.high = priceUSD;
  if (priceUSD.lt(hourData.low)) hourData.low = priceUSD;
  hourData.close = priceUSD;
  hourData.volumeUSD = hourData.volumeUSD.plus(amountUSD);
  hourData.volumeToken = hourData.volumeToken.plus(amountToken);
  hourData.txCount = hourData.txCount.plus(ONE_BI);
  hourData.save();
}
