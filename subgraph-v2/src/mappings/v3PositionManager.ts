import { Address, BigInt } from '@graphprotocol/graph-ts';
import {
  Collect,
  DecreaseLiquidity,
  IncreaseLiquidity,
  NonfungiblePositionManager,
  Transfer
} from '../../generated/UniswapV3PositionManager/NonfungiblePositionManager';
import { UniswapV3Factory } from '../../generated/UniswapV3PositionManager/UniswapV3Factory';
import { V3Position, V3PositionEvent } from '../../generated/schema';
import { ZERO_ADDRESS, ZERO_BD, ZERO_BI, eventId, loadOrCreateUser } from './common';

function loadOrCreatePosition(tokenId: BigInt, timestamp: BigInt): V3Position {
  let id = tokenId.toString();
  let position = V3Position.load(id);

  if (position == null) {
    position = new V3Position(id);
    position.tokenId = tokenId;
    position.liquidity = ZERO_BI;
    position.collectedToken0 = ZERO_BD;
    position.collectedToken1 = ZERO_BD;
    position.createdAtTimestamp = timestamp;
  }

  position.lastUpdatedTimestamp = timestamp;
  position.save();
  return position;
}

function syncPositionMetadata(position: V3Position, tokenId: BigInt, managerAddress: Address, timestamp: BigInt): V3Position {
  let manager = NonfungiblePositionManager.bind(managerAddress);
  let positionCall = manager.try_positions(tokenId);

  if (!positionCall.reverted) {
    let data = positionCall.value;
    position.token0 = data.value2;
    position.token1 = data.value3;
    position.fee = data.value4;
    position.tickLower = data.value5;
    position.tickUpper = data.value6;
    position.liquidity = data.value7;

    let factoryCall = manager.try_factory();
    if (!factoryCall.reverted) {
      let factory = UniswapV3Factory.bind(factoryCall.value);
      let poolCall = factory.try_getPool(data.value2, data.value3, data.value4);
      if (!poolCall.reverted) {
        position.pool = poolCall.value;
      }
    }
  }

  position.lastUpdatedTimestamp = timestamp;
  position.save();
  return position;
}

function attachOptionalOwner(positionEvent: V3PositionEvent, ownerId: string | null): void {
  if (ownerId) {
    positionEvent.owner = ownerId;
  }
}

export function handleTransfer(event: Transfer): void {
  let position = loadOrCreatePosition(event.params.tokenId, event.block.timestamp);
  position.lastTransferTxHash = event.transaction.hash;

  if (event.params.to.toHexString() != ZERO_ADDRESS) {
    let owner = loadOrCreateUser(event.params.to, event);
    position.owner = owner.id;
  } else {
    position.owner = null;
  }

  position.save();
  position = syncPositionMetadata(position, event.params.tokenId, event.address, event.block.timestamp);

  let positionEvent = new V3PositionEvent(eventId(event));
  positionEvent.position = position.id;
  positionEvent.eventType = 'TRANSFER';

  if (event.params.from.toHexString() != ZERO_ADDRESS) {
    positionEvent.owner = loadOrCreateUser(event.params.from, event).id;
  }

  if (event.params.to.toHexString() != ZERO_ADDRESS) {
    positionEvent.recipient = loadOrCreateUser(event.params.to, event).id;
  }

  positionEvent.timestamp = event.block.timestamp;
  positionEvent.blockNumber = event.block.number;
  positionEvent.txHash = event.transaction.hash;
  positionEvent.save();
}

export function handleIncreaseLiquidity(event: IncreaseLiquidity): void {
  let position = loadOrCreatePosition(event.params.tokenId, event.block.timestamp);
  position = syncPositionMetadata(position, event.params.tokenId, event.address, event.block.timestamp);

  let ownerId = position.owner;
  let positionEvent = new V3PositionEvent(eventId(event));
  positionEvent.position = position.id;
  positionEvent.eventType = 'INCREASE_LIQUIDITY';
  attachOptionalOwner(positionEvent, ownerId);
  positionEvent.liquidityDelta = event.params.liquidity;
  positionEvent.amount0 = event.params.amount0;
  positionEvent.amount1 = event.params.amount1;
  positionEvent.timestamp = event.block.timestamp;
  positionEvent.blockNumber = event.block.number;
  positionEvent.txHash = event.transaction.hash;
  positionEvent.save();
}

export function handleDecreaseLiquidity(event: DecreaseLiquidity): void {
  let position = loadOrCreatePosition(event.params.tokenId, event.block.timestamp);
  position = syncPositionMetadata(position, event.params.tokenId, event.address, event.block.timestamp);

  let ownerId = position.owner;
  let positionEvent = new V3PositionEvent(eventId(event));
  positionEvent.position = position.id;
  positionEvent.eventType = 'DECREASE_LIQUIDITY';
  attachOptionalOwner(positionEvent, ownerId);
  positionEvent.liquidityDelta = ZERO_BI.minus(event.params.liquidity);
  positionEvent.amount0 = event.params.amount0;
  positionEvent.amount1 = event.params.amount1;
  positionEvent.timestamp = event.block.timestamp;
  positionEvent.blockNumber = event.block.number;
  positionEvent.txHash = event.transaction.hash;
  positionEvent.save();
}

export function handleCollect(event: Collect): void {
  let position = loadOrCreatePosition(event.params.tokenId, event.block.timestamp);
  position = syncPositionMetadata(position, event.params.tokenId, event.address, event.block.timestamp);

  let ownerId = position.owner;
  let positionEvent = new V3PositionEvent(eventId(event));
  positionEvent.position = position.id;
  positionEvent.eventType = 'COLLECT';
  attachOptionalOwner(positionEvent, ownerId);

  if (event.params.recipient.toHexString() != ZERO_ADDRESS) {
    positionEvent.recipient = loadOrCreateUser(event.params.recipient, event).id;
  }

  positionEvent.amount0 = event.params.amount0;
  positionEvent.amount1 = event.params.amount1;
  positionEvent.timestamp = event.block.timestamp;
  positionEvent.blockNumber = event.block.number;
  positionEvent.txHash = event.transaction.hash;
  positionEvent.save();
}
