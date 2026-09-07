import { Address } from '@graphprotocol/graph-ts';
import {
  Burn,
  Initialize,
  Mint,
  Swap
} from '../../generated/templates/UniswapV3PoolTemplate/UniswapV3Pool';
import { LiquidityProvision, LiquidityRemoval, V3Burn, V3Mint, V3Pool, V3Swap } from '../../generated/schema';
import {
  ONE_BI,
  absBigInt,
  convertTokenToDecimal,
  eventId,
  loadOrCreateProtocol,
  loadOrCreateToken,
  loadOrCreateUser,
  loadOrCreateUserTokenStat,
  touchUserActivity,
  trackV3Volume,
  trackV3VolumeAgainstNative,
  WRAPPED_NATIVE_ADDRESS
} from './common';

function loadPool(id: string): V3Pool | null {
  return V3Pool.load(id);
}

export function handleInitialize(event: Initialize): void {
  let pool = loadPool(event.address.toHexString());
  if (pool == null) {
    return;
  }
  pool.sqrtPriceX96 = event.params.sqrtPriceX96;
  pool.tick = event.params.tick;
  pool.save();
}

export function handleSwap(event: Swap): void {
  let protocol = loadOrCreateProtocol(event);
  let pool = loadPool(event.address.toHexString());
  if (pool == null) {
    return;
  }
  let sender = loadOrCreateUser(event.params.sender, event);
  let recipient = loadOrCreateUser(event.params.recipient, event);
  let token0 = loadOrCreateToken(Address.fromString(pool.token0), event);
  let token1 = loadOrCreateToken(Address.fromString(pool.token1), event);
  let amount0Abs = absBigInt(event.params.amount0);
  let amount1Abs = absBigInt(event.params.amount1);
  touchUserActivity(sender, protocol, event.block.timestamp, event.block.number, 'v3Swap');

  let volume0 = trackV3Volume(token0, amount0Abs, event.block.timestamp);
  let volume1 = trackV3Volume(token1, amount1Abs, event.block.timestamp);

  let isAgainstNative = (pool.token0.toLowerCase() == WRAPPED_NATIVE_ADDRESS) || (pool.token1.toLowerCase() == WRAPPED_NATIVE_ADDRESS);
  if (isAgainstNative) {
    if (pool.token0.toLowerCase() != WRAPPED_NATIVE_ADDRESS) {
      trackV3VolumeAgainstNative(token0, amount0Abs, event.block.timestamp);
    }
    if (pool.token1.toLowerCase() != WRAPPED_NATIVE_ADDRESS) {
      trackV3VolumeAgainstNative(token1, amount1Abs, event.block.timestamp);
    }
  }

  let stat0 = loadOrCreateUserTokenStat(sender, token0, event);
  stat0.v3SwapCount = stat0.v3SwapCount.plus(ONE_BI);
  stat0.v3Volume = stat0.v3Volume.plus(volume0);
  stat0.save();

  let stat1 = loadOrCreateUserTokenStat(sender, token1, event);
  stat1.v3SwapCount = stat1.v3SwapCount.plus(ONE_BI);
  stat1.v3Volume = stat1.v3Volume.plus(volume1);
  stat1.save();

  pool.txCount = pool.txCount.plus(ONE_BI);
  pool.swapCount = pool.swapCount.plus(ONE_BI);
  pool.sqrtPriceX96 = event.params.sqrtPriceX96;
  pool.liquidity = event.params.liquidity;
  pool.tick = event.params.tick;
  pool.volumeToken0 = pool.volumeToken0.plus(volume0);
  pool.volumeToken1 = pool.volumeToken1.plus(volume1);
  pool.save();

  protocol.totalV3Swaps = protocol.totalV3Swaps.plus(ONE_BI);
  protocol.save();

  let swap = new V3Swap(eventId(event));
  swap.pool = pool.id;
  swap.sender = sender.id;
  swap.recipient = recipient.id;
  swap.amount0 = event.params.amount0;
  swap.amount1 = event.params.amount1;
  swap.amount0Decimal = convertTokenToDecimal(amount0Abs, token0.decimals);
  swap.amount1Decimal = convertTokenToDecimal(amount1Abs, token1.decimals);
  swap.sqrtPriceX96 = event.params.sqrtPriceX96;
  swap.liquidity = event.params.liquidity;
  swap.tick = event.params.tick;
  swap.timestamp = event.block.timestamp;
  swap.blockNumber = event.block.number;
  swap.txHash = event.transaction.hash;
  swap.save();
}

export function handleMint(event: Mint): void {
  let protocol = loadOrCreateProtocol(event);
  let pool = loadPool(event.address.toHexString());
  if (pool == null) {
    return;
  }
  let owner = loadOrCreateUser(event.params.owner, event);
  let token0 = loadOrCreateToken(Address.fromString(pool.token0), event);
  let token1 = loadOrCreateToken(Address.fromString(pool.token1), event);
  touchUserActivity(owner, protocol, event.block.timestamp, event.block.number, 'v3Liquidity');

  let stat0 = loadOrCreateUserTokenStat(owner, token0, event);
  stat0.liquidityActions = stat0.liquidityActions.plus(ONE_BI);
  stat0.save();

  let stat1 = loadOrCreateUserTokenStat(owner, token1, event);
  stat1.liquidityActions = stat1.liquidityActions.plus(ONE_BI);
  stat1.save();

  pool.txCount = pool.txCount.plus(ONE_BI);
  pool.mintCount = pool.mintCount.plus(ONE_BI);
  pool.save();

  protocol.totalV3Mints = protocol.totalV3Mints.plus(ONE_BI);
  protocol.save();

  let mint = new V3Mint(eventId(event));
  mint.pool = pool.id;
  mint.owner = owner.id;
  mint.tickLower = event.params.tickLower;
  mint.tickUpper = event.params.tickUpper;
  mint.amount = event.params.amount;
  mint.amount0 = event.params.amount0;
  mint.amount1 = event.params.amount1;
  mint.amount0Decimal = convertTokenToDecimal(event.params.amount0, token0.decimals);
  mint.amount1Decimal = convertTokenToDecimal(event.params.amount1, token1.decimals);
  mint.timestamp = event.block.timestamp;
  mint.blockNumber = event.block.number;
  mint.txHash = event.transaction.hash;
  mint.save();

  let liquidityProvision = new LiquidityProvision(eventId(event));
  liquidityProvision.protocolVersion = 'V3';
  liquidityProvision.user = owner.id;
  liquidityProvision.marketId = pool.id;
  liquidityProvision.token0 = token0.id;
  liquidityProvision.token1 = token1.id;
  liquidityProvision.amount0 = event.params.amount0;
  liquidityProvision.amount1 = event.params.amount1;
  liquidityProvision.amount0Decimal = mint.amount0Decimal;
  liquidityProvision.amount1Decimal = mint.amount1Decimal;
  liquidityProvision.timestamp = event.block.timestamp;
  liquidityProvision.blockNumber = event.block.number;
  liquidityProvision.txHash = event.transaction.hash;
  liquidityProvision.save();
}

export function handleBurn(event: Burn): void {
  let protocol = loadOrCreateProtocol(event);
  let pool = loadPool(event.address.toHexString());
  if (pool == null) {
    return;
  }
  let owner = loadOrCreateUser(event.params.owner, event);
  let token0 = loadOrCreateToken(Address.fromString(pool.token0), event);
  let token1 = loadOrCreateToken(Address.fromString(pool.token1), event);
  touchUserActivity(owner, protocol, event.block.timestamp, event.block.number, 'v3Liquidity');

  let stat0 = loadOrCreateUserTokenStat(owner, token0, event);
  stat0.liquidityActions = stat0.liquidityActions.plus(ONE_BI);
  stat0.save();

  let stat1 = loadOrCreateUserTokenStat(owner, token1, event);
  stat1.liquidityActions = stat1.liquidityActions.plus(ONE_BI);
  stat1.save();

  pool.txCount = pool.txCount.plus(ONE_BI);
  pool.burnCount = pool.burnCount.plus(ONE_BI);
  pool.save();

  protocol.totalV3Burns = protocol.totalV3Burns.plus(ONE_BI);
  protocol.save();

  let burn = new V3Burn(eventId(event));
  burn.pool = pool.id;
  burn.owner = owner.id;
  burn.tickLower = event.params.tickLower;
  burn.tickUpper = event.params.tickUpper;
  burn.amount = event.params.amount;
  burn.amount0 = event.params.amount0;
  burn.amount1 = event.params.amount1;
  burn.amount0Decimal = convertTokenToDecimal(event.params.amount0, token0.decimals);
  burn.amount1Decimal = convertTokenToDecimal(event.params.amount1, token1.decimals);
  burn.timestamp = event.block.timestamp;
  burn.blockNumber = event.block.number;
  burn.txHash = event.transaction.hash;
  burn.save();

  let liquidityRemoval = new LiquidityRemoval(eventId(event));
  liquidityRemoval.protocolVersion = 'V3';
  liquidityRemoval.user = owner.id;
  liquidityRemoval.marketId = pool.id;
  liquidityRemoval.token0 = token0.id;
  liquidityRemoval.token1 = token1.id;
  liquidityRemoval.amount0 = event.params.amount0;
  liquidityRemoval.amount1 = event.params.amount1;
  liquidityRemoval.amount0Decimal = burn.amount0Decimal;
  liquidityRemoval.amount1Decimal = burn.amount1Decimal;
  liquidityRemoval.timestamp = event.block.timestamp;
  liquidityRemoval.blockNumber = event.block.number;
  liquidityRemoval.txHash = event.transaction.hash;
  liquidityRemoval.save();
}
