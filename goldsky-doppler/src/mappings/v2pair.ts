import { BigInt, BigDecimal } from '@graphprotocol/graph-ts';
import { Swap as V2SwapEvent, Sync as V2SyncEvent } from '../../generated/templates/UniswapV2Pair/UniswapV2Pair';
import { Token, Pool, Swap, TokenDayData, TokenHourData } from '../../generated/schema';
import { ZERO_BI, ONE_BI, ZERO_BD, toDecimal } from '../utils/constants';
import { getOrCreateBundle } from '../utils/pricing';

export function handleUniswapV2Swap(event: V2SwapEvent): void {
  let pool = Pool.load(event.address.toHexString().toLowerCase());
  if (pool === null) return;

  let token = Token.load(pool.token);
  if (token === null) return;

  let bundle = getOrCreateBundle();
  let isToken0 = token.id < pool.numeraire.toHexString().toLowerCase();

  let amount0In = toDecimal(event.params.amount0In, isToken0 ? token.decimals : BigInt.fromI32(18));
  let amount1In = toDecimal(event.params.amount1In, isToken0 ? BigInt.fromI32(18) : token.decimals);
  let amount0Out = toDecimal(event.params.amount0Out, isToken0 ? token.decimals : BigInt.fromI32(18));
  let amount1Out = toDecimal(event.params.amount1Out, isToken0 ? BigInt.fromI32(18) : token.decimals);

  let amountToken = isToken0 ? amount0In.plus(amount0Out) : amount1In.plus(amount1Out);
  let amountNumeraire = isToken0 ? amount1In.plus(amount1Out) : amount0In.plus(amount0Out);
  let amountUSD = amountNumeraire.times(bundle.ethPriceUSD);

  let isBuy = isToken0 ? event.params.amount0Out.gt(ZERO_BI) : event.params.amount1Out.gt(ZERO_BI);

  token.tradeVolumeUSD = token.tradeVolumeUSD.plus(amountUSD);
  token.totalSwaps = token.totalSwaps.plus(ONE_BI);
  token.txCount = token.txCount.plus(ONE_BI);
  token.save();

  pool.volumeUSD = pool.volumeUSD.plus(amountUSD);
  pool.totalSwaps = pool.totalSwaps.plus(ONE_BI);
  pool.save();

  let swapId = event.transaction.hash.toHexString() + '-' + event.logIndex.toString();
  let swap = new Swap(swapId);
  swap.transactionHash = event.transaction.hash;
  swap.blockNumber = event.block.number;
  swap.timestamp = event.block.timestamp;
  swap.token = token.id;
  swap.pool = event.address;
  swap.sender = event.params.sender;
  swap.recipient = event.params.to;
  swap.origin = event.transaction.from;
  swap.amountToken = amountToken;
  swap.amountNumeraire = amountNumeraire;
  swap.amountUSD = amountUSD;
  swap.isBuy = isBuy;
  swap.save();
}

export function handleUniswapV2Sync(event: V2SyncEvent): void {
  let pool = Pool.load(event.address.toHexString().toLowerCase());
  if (pool === null) return;

  let token = Token.load(pool.token);
  if (token === null) return;

  let bundle = getOrCreateBundle();
  let isToken0 = token.id < pool.numeraire.toHexString().toLowerCase();

  let reserve0 = toDecimal(BigInt.fromI32(0).plus(event.params.reserve0), isToken0 ? token.decimals : BigInt.fromI32(18));
  let reserve1 = toDecimal(BigInt.fromI32(0).plus(event.params.reserve1), isToken0 ? BigInt.fromI32(18) : token.decimals);

  if (reserve0.gt(ZERO_BD) && reserve1.gt(ZERO_BD)) {
    let priceETH = isToken0 ? reserve1.div(reserve0) : reserve0.div(reserve1);
    let priceUSD = priceETH.times(bundle.ethPriceUSD);

    token.priceETH = priceETH;
    token.priceUSD = priceUSD;
    token.marketCapUSD = token.priceUSD.times(toDecimal(token.totalSupply, token.decimals));
    token.save();
  }
}
