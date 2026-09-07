import { UniswapV2PairTemplate } from '../../generated/templates';
import { PairCreated } from '../../generated/UniswapV2Factory/UniswapV2Factory';
import { V2Pair } from '../../generated/schema';
import { ONE_BI, ZERO_BD, ZERO_BI, loadOrCreateProtocol, loadOrCreateToken } from './common';

export function handlePairCreated(event: PairCreated): void {
  let protocol = loadOrCreateProtocol(event);
  let token0 = loadOrCreateToken(event.params.token0, event);
  let token1 = loadOrCreateToken(event.params.token1, event);

  let pair = new V2Pair(event.params.pair.toHexString());
  pair.factory = event.address;
  pair.token0 = token0.id;
  pair.token1 = token1.id;
  pair.reserve0 = ZERO_BI;
  pair.reserve1 = ZERO_BI;
  pair.reserve0Decimal = ZERO_BD;
  pair.reserve1Decimal = ZERO_BD;
  pair.txCount = ZERO_BI;
  pair.swapCount = ZERO_BI;
  pair.mintCount = ZERO_BI;
  pair.burnCount = ZERO_BI;
  pair.volumeToken0 = ZERO_BD;
  pair.volumeToken1 = ZERO_BD;
  pair.createdAtTimestamp = event.block.timestamp;
  pair.createdAtBlock = event.block.number;
  pair.save();

  protocol.totalV2Pairs = protocol.totalV2Pairs.plus(ONE_BI);
  protocol.save();

  UniswapV2PairTemplate.create(event.params.pair);
}
