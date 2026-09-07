import { Address } from '@graphprotocol/graph-ts';
import {
  Burn,
  Mint,
  Swap,
  Sync
} from '../../generated/templates/UniswapV2PairTemplate/UniswapV2Pair';
import { LiquidityProvision, V2Burn, V2Mint, V2Pair, V2Swap } from '../../generated/schema';
import {
  ONE_BI,
  convertTokenToDecimal,
  eventId,
  loadOrCreateProtocol,
  loadOrCreateToken,
  loadOrCreateUser,
  loadOrCreateUserTokenStat,
  touchUserActivity,
  trackV2Volume
} from './common';

function loadPair(address: string): V2Pair | null {
  return V2Pair.load(address);
}

export function handleSwap(event: Swap): void {
  let protocol = loadOrCreateProtocol(event);
  let pair = loadPair(event.address.toHexString());
  if (pair == null) {
    return;
  }
  let sender = loadOrCreateUser(event.params.sender, event);
  let to = loadOrCreateUser(event.params.to, event);
  touchUserActivity(sender, protocol, event.block.timestamp, event.block.number, 'v2Swap');

  let token0Entity = loadOrCreateToken(Address.fromString(pair.token0), event);
  let token1Entity = loadOrCreateToken(Address.fromString(pair.token1), event);
  let rawVolume0 = event.params.amount0In.gt(event.params.amount0Out) ? event.params.amount0In : event.params.amount0Out;
  let rawVolume1 = event.params.amount1In.gt(event.params.amount1Out) ? event.params.amount1In : event.params.amount1Out;
  let volume0 = trackV2Volume(token0Entity, rawVolume0, event.block.timestamp);
  let volume1 = trackV2Volume(token1Entity, rawVolume1, event.block.timestamp);

  let stat0 = loadOrCreateUserTokenStat(sender, token0Entity, event);
  stat0.v2SwapCount = stat0.v2SwapCount.plus(ONE_BI);
  stat0.v2Volume = stat0.v2Volume.plus(volume0);
  stat0.save();

  let stat1 = loadOrCreateUserTokenStat(sender, token1Entity, event);
  stat1.v2SwapCount = stat1.v2SwapCount.plus(ONE_BI);
  stat1.v2Volume = stat1.v2Volume.plus(volume1);
  stat1.save();

  pair.txCount = pair.txCount.plus(ONE_BI);
  pair.swapCount = pair.swapCount.plus(ONE_BI);
  pair.volumeToken0 = pair.volumeToken0.plus(volume0);
  pair.volumeToken1 = pair.volumeToken1.plus(volume1);
  pair.save();

  protocol.totalV2Swaps = protocol.totalV2Swaps.plus(ONE_BI);
  protocol.save();

  let swap = new V2Swap(eventId(event));
  swap.pair = pair.id;
  swap.sender = sender.id;
  swap.to = to.id;
  swap.amount0In = event.params.amount0In;
  swap.amount1In = event.params.amount1In;
  swap.amount0Out = event.params.amount0Out;
  swap.amount1Out = event.params.amount1Out;
  swap.volumeToken0 = volume0;
  swap.volumeToken1 = volume1;
  swap.timestamp = event.block.timestamp;
  swap.blockNumber = event.block.number;
  swap.txHash = event.transaction.hash;
  swap.save();
}

export function handleMint(event: Mint): void {
  let protocol = loadOrCreateProtocol(event);
  let pair = loadPair(event.address.toHexString());
  if (pair == null) {
    return;
  }
  let sender = loadOrCreateUser(event.transaction.from, event);
  let token0 = loadOrCreateToken(Address.fromString(pair.token0), event);
  let token1 = loadOrCreateToken(Address.fromString(pair.token1), event);
  touchUserActivity(sender, protocol, event.block.timestamp, event.block.number, 'v2Liquidity');

  let stat0 = loadOrCreateUserTokenStat(sender, token0, event);
  stat0.liquidityActions = stat0.liquidityActions.plus(ONE_BI);
  stat0.save();

  let stat1 = loadOrCreateUserTokenStat(sender, token1, event);
  stat1.liquidityActions = stat1.liquidityActions.plus(ONE_BI);
  stat1.save();

  pair.txCount = pair.txCount.plus(ONE_BI);
  pair.mintCount = pair.mintCount.plus(ONE_BI);
  pair.save();

  protocol.totalV2Mints = protocol.totalV2Mints.plus(ONE_BI);
  protocol.save();

  let mint = new V2Mint(eventId(event));
  mint.pair = pair.id;
  mint.sender = sender.id;
  mint.amount0 = event.params.amount0;
  mint.amount1 = event.params.amount1;
  mint.amount0Decimal = convertTokenToDecimal(event.params.amount0, token0.decimals);
  mint.amount1Decimal = convertTokenToDecimal(event.params.amount1, token1.decimals);
  mint.timestamp = event.block.timestamp;
  mint.blockNumber = event.block.number;
  mint.txHash = event.transaction.hash;
  mint.save();

  let liquidityProvision = new LiquidityProvision(eventId(event));
  liquidityProvision.protocolVersion = 'V2';
  liquidityProvision.user = sender.id;
  liquidityProvision.marketId = pair.id;
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
  let pair = loadPair(event.address.toHexString());
  if (pair == null) {
    return;
  }
  let sender = loadOrCreateUser(event.transaction.from, event);
  let to = loadOrCreateUser(event.params.to, event);
  let token0 = loadOrCreateToken(Address.fromString(pair.token0), event);
  let token1 = loadOrCreateToken(Address.fromString(pair.token1), event);
  touchUserActivity(sender, protocol, event.block.timestamp, event.block.number, 'v2Liquidity');

  let stat0 = loadOrCreateUserTokenStat(sender, token0, event);
  stat0.liquidityActions = stat0.liquidityActions.plus(ONE_BI);
  stat0.save();

  let stat1 = loadOrCreateUserTokenStat(sender, token1, event);
  stat1.liquidityActions = stat1.liquidityActions.plus(ONE_BI);
  stat1.save();

  pair.txCount = pair.txCount.plus(ONE_BI);
  pair.burnCount = pair.burnCount.plus(ONE_BI);
  pair.save();

  protocol.totalV2Burns = protocol.totalV2Burns.plus(ONE_BI);
  protocol.save();

  let burn = new V2Burn(eventId(event));
  burn.pair = pair.id;
  burn.sender = sender.id;
  burn.to = to.id;
  burn.amount0 = event.params.amount0;
  burn.amount1 = event.params.amount1;
  burn.amount0Decimal = convertTokenToDecimal(event.params.amount0, token0.decimals);
  burn.amount1Decimal = convertTokenToDecimal(event.params.amount1, token1.decimals);
  burn.timestamp = event.block.timestamp;
  burn.blockNumber = event.block.number;
  burn.txHash = event.transaction.hash;
  burn.save();
}

export function handleSync(event: Sync): void {
  let pair = loadPair(event.address.toHexString());
  if (pair == null) {
    return;
  }
  let token0 = loadOrCreateToken(Address.fromString(pair.token0), event);
  let token1 = loadOrCreateToken(Address.fromString(pair.token1), event);
  pair.reserve0 = event.params.reserve0;
  pair.reserve1 = event.params.reserve1;
  pair.reserve0Decimal = convertTokenToDecimal(event.params.reserve0, token0.decimals);
  pair.reserve1Decimal = convertTokenToDecimal(event.params.reserve1, token1.decimals);
  pair.save();
}
