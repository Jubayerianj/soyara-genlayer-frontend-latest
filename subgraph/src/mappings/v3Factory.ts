import { PoolCreated } from '../../generated/UniswapV3Factory/UniswapV3Factory';
import { UniswapV3PoolTemplate } from '../../generated/templates';
import { V3Pool } from '../../generated/schema';
import { ONE_BI, ZERO_BD, ZERO_BI, loadOrCreateProtocol, loadOrCreateToken } from './common';

export function handlePoolCreated(event: PoolCreated): void {
  let protocol = loadOrCreateProtocol(event);
  let token0 = loadOrCreateToken(event.params.token0, event);
  let token1 = loadOrCreateToken(event.params.token1, event);

  let pool = new V3Pool(event.params.pool.toHexString());
  pool.factory = event.address;
  pool.token0 = token0.id;
  pool.token1 = token1.id;
  pool.fee = event.params.fee;
  pool.tickSpacing = event.params.tickSpacing;
  pool.sqrtPriceX96 = ZERO_BI;
  pool.tick = 0;
  pool.liquidity = ZERO_BI;
  pool.txCount = ZERO_BI;
  pool.swapCount = ZERO_BI;
  pool.mintCount = ZERO_BI;
  pool.burnCount = ZERO_BI;
  pool.volumeToken0 = ZERO_BD;
  pool.volumeToken1 = ZERO_BD;
  pool.createdAtTimestamp = event.block.timestamp;
  pool.createdAtBlock = event.block.number;
  pool.save();

  protocol.totalV3Pools = protocol.totalV3Pools.plus(ONE_BI);
  protocol.save();

  UniswapV3PoolTemplate.create(event.params.pool);
}
