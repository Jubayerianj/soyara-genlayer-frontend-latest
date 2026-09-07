import {
  Address,
  BigDecimal,
  BigInt,
  dataSource,
  ethereum
} from '@graphprotocol/graph-ts';
import { ERC20 } from '../../generated/AggregatorEntrypoint/ERC20';
import {
  Protocol,
  ProtocolDayData,
  Referral,
  Token,
  TokenDayData,
  User,
  UserDayData,
  UserTokenStat
} from '../../generated/schema';

export const ZERO_BI = BigInt.zero();
export const ONE_BI = BigInt.fromI32(1);
export const ZERO_BD = BigDecimal.fromString('0');
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
export const NATIVE_ADDRESS = ZERO_ADDRESS;

function exponentToBigDecimal(decimals: i32): BigDecimal {
  let bd = BigDecimal.fromString('1');
  for (let i = 0; i < decimals; i++) {
    bd = bd.times(BigDecimal.fromString('10'));
  }
  return bd;
}

export function convertTokenToDecimal(amount: BigInt, decimals: i32): BigDecimal {
  if (decimals == 0) {
    return amount.toBigDecimal();
  }
  return amount.toBigDecimal().div(exponentToBigDecimal(decimals));
}

export function absBigInt(value: BigInt): BigInt {
  return value.lt(ZERO_BI) ? ZERO_BI.minus(value) : value;
}

export function eventId(event: ethereum.Event): string {
  return event.transaction.hash.toHexString() + '-' + event.logIndex.toString();
}

export function dayIdFromTimestamp(timestamp: BigInt): i32 {
  return timestamp.toI32() / 86400;
}

export function loadOrCreateProtocol(event: ethereum.Event): Protocol {
  let id = dataSource.network();
  let protocol = Protocol.load(id);
  if (protocol == null) {
    protocol = new Protocol(id);
    protocol.network = dataSource.network();
    protocol.totalUsers = ZERO_BI;
    protocol.totalAggregatorSwaps = ZERO_BI;
    protocol.totalV2Pairs = ZERO_BI;
    protocol.totalV2Swaps = ZERO_BI;
    protocol.totalV2Mints = ZERO_BI;
    protocol.totalV2Burns = ZERO_BI;
    protocol.totalV3Pools = ZERO_BI;
    protocol.totalV3Swaps = ZERO_BI;
    protocol.totalV3Mints = ZERO_BI;
    protocol.totalV3Burns = ZERO_BI;
    protocol.totalFeeEvents = ZERO_BI;
  }
  protocol.updatedAtTimestamp = event.block.timestamp;
  protocol.updatedAtBlock = event.block.number;
  protocol.save();
  return protocol;
}

export function loadOrCreateProtocolDay(protocol: Protocol, timestamp: BigInt): ProtocolDayData {
  let day = dayIdFromTimestamp(timestamp);
  let id = protocol.id + '-' + day.toString();
  let daily = ProtocolDayData.load(id);
  if (daily == null) {
    daily = new ProtocolDayData(id);
    daily.protocol = protocol.id;
    daily.date = day;
    daily.dayStartTimestamp = BigInt.fromI32(day * 86400);
    daily.activeUsers = ZERO_BI;
    daily.aggregatorSwaps = ZERO_BI;
    daily.v2Swaps = ZERO_BI;
    daily.v2LiquidityEvents = ZERO_BI;
    daily.v3Swaps = ZERO_BI;
    daily.v3LiquidityEvents = ZERO_BI;
    daily.feeEvents = ZERO_BI;
  }
  daily.lastUpdatedTimestamp = timestamp;
  daily.save();
  return daily;
}

export function loadOrCreateToken(address: Address, event: ethereum.Event): Token {
  let id = address.toHexString();
  let token = Token.load(id);
  if (token != null) {
    token.lastSeenTimestamp = event.block.timestamp;
    token.save();
    return token;
  }

  token = new Token(id);
  token.isNative = id == NATIVE_ADDRESS;
  token.txCount = ZERO_BI;
  token.uniqueUsers = ZERO_BI;
  token.aggregatorInCount = ZERO_BI;
  token.aggregatorOutCount = ZERO_BI;
  token.v2SwapCount = ZERO_BI;
  token.v3SwapCount = ZERO_BI;
  token.v2SwapCountAgainstNative = ZERO_BI;
  token.v3SwapCountAgainstNative = ZERO_BI;
  token.feeEventCount = ZERO_BI;
  token.totalAggregatorVolumeIn = ZERO_BD;
  token.totalAggregatorVolumeOut = ZERO_BD;
  token.totalV2Volume = ZERO_BD;
  token.totalV3Volume = ZERO_BD;
  token.totalV2VolumeAgainstNative = ZERO_BD;
  token.totalV3VolumeAgainstNative = ZERO_BD;
  token.createdAtTimestamp = event.block.timestamp;
  token.lastSeenTimestamp = event.block.timestamp;

  if (token.isNative) {
    token.name = 'Native';
    token.symbol = 'NATIVE';
    token.decimals = 18;
  } else {
    let contract = ERC20.bind(address);
    let nameCall = contract.try_name();
    let symbolCall = contract.try_symbol();
    let decimalsCall = contract.try_decimals();

    token.name = nameCall.reverted ? 'Unknown Token' : nameCall.value;
    token.symbol = symbolCall.reverted ? 'UNKNOWN' : symbolCall.value;
    token.decimals = decimalsCall.reverted ? 18 : decimalsCall.value;
  }

  token.save();
  return token;
}

export function loadOrCreateTokenDay(token: Token, timestamp: BigInt): TokenDayData {
  let day = dayIdFromTimestamp(timestamp);
  let id = token.id + '-' + day.toString();
  let daily = TokenDayData.load(id);
  if (daily == null) {
    daily = new TokenDayData(id);
    daily.token = token.id;
    daily.date = day;
    daily.txCount = ZERO_BI;
    daily.aggregatorInCount = ZERO_BI;
    daily.aggregatorOutCount = ZERO_BI;
    daily.v2SwapCount = ZERO_BI;
    daily.v3SwapCount = ZERO_BI;
    daily.v2SwapCountAgainstNative = ZERO_BI;
    daily.v3SwapCountAgainstNative = ZERO_BI;
    daily.feeEventCount = ZERO_BI;
    daily.totalAggregatorVolumeIn = ZERO_BD;
    daily.totalAggregatorVolumeOut = ZERO_BD;
    daily.totalV2Volume = ZERO_BD;
    daily.totalV3Volume = ZERO_BD;
    daily.totalV2VolumeAgainstNative = ZERO_BD;
    daily.totalV3VolumeAgainstNative = ZERO_BD;
  }
  daily.lastUpdatedTimestamp = timestamp;
  daily.save();
  return daily;
}

export function loadOrCreateUser(address: Address, event: ethereum.Event): User {
  let id = address.toHexString();
  let user = User.load(id);
  if (user == null) {
    let protocol = loadOrCreateProtocol(event);
    user = new User(id);
    user.firstSeenTimestamp = event.block.timestamp;
    user.lastSeenTimestamp = event.block.timestamp;
    user.totalActions = ZERO_BI;
    user.aggregatorSwapCount = ZERO_BI;
    user.v2SwapCount = ZERO_BI;
    user.v3SwapCount = ZERO_BI;
    user.v2LiquidityActions = ZERO_BI;
    user.v3LiquidityActions = ZERO_BI;
    user.feeEvents = ZERO_BI;
    user.referralSwapCount = ZERO_BI;
    user.uniqueReferredUsers = ZERO_BI;
    user.createdAtBlock = event.block.number;
    user.lastUpdatedBlock = event.block.number;
    protocol.totalUsers = protocol.totalUsers.plus(ONE_BI);
    protocol.save();
  }

  user.lastSeenTimestamp = event.block.timestamp;
  user.lastUpdatedBlock = event.block.number;
  user.save();
  return user;
}

export function loadOrCreateUserDay(user: User, timestamp: BigInt): UserDayData {
  let day = dayIdFromTimestamp(timestamp);
  let id = user.id + '-' + day.toString();
  let daily = UserDayData.load(id);
  if (daily == null) {
    daily = new UserDayData(id);
    daily.user = user.id;
    daily.date = day;
    daily.totalActions = ZERO_BI;
    daily.aggregatorSwapCount = ZERO_BI;
    daily.v2SwapCount = ZERO_BI;
    daily.v3SwapCount = ZERO_BI;
    daily.v2LiquidityActions = ZERO_BI;
    daily.v3LiquidityActions = ZERO_BI;
    daily.feeEvents = ZERO_BI;
  }
  daily.lastUpdatedTimestamp = timestamp;
  daily.save();
  return daily;
}

export function loadOrCreateUserTokenStat(user: User, token: Token, event: ethereum.Event): UserTokenStat {
  let id = user.id + '-' + token.id;
  let stat = UserTokenStat.load(id);
  if (stat == null) {
    stat = new UserTokenStat(id);
    stat.user = user.id;
    stat.token = token.id;
    stat.aggregatorSwapInCount = ZERO_BI;
    stat.aggregatorSwapOutCount = ZERO_BI;
    stat.v2SwapCount = ZERO_BI;
    stat.v3SwapCount = ZERO_BI;
    stat.liquidityActions = ZERO_BI;
    stat.feeEvents = ZERO_BI;
    stat.aggregatorVolumeIn = ZERO_BD;
    stat.aggregatorVolumeOut = ZERO_BD;
    stat.v2Volume = ZERO_BD;
    stat.v3Volume = ZERO_BD;
    stat.referrerFeesReceived = ZERO_BD;
    stat.collectorFeesReceived = ZERO_BD;
    token.uniqueUsers = token.uniqueUsers.plus(ONE_BI);
    token.save();
  }
  stat.lastSeenTimestamp = event.block.timestamp;
  stat.save();
  return stat;
}

export function loadOrCreateReferral(referrer: User, user: User, event: ethereum.Event): Referral {
  let id = referrer.id + '-' + user.id;
  let referral = Referral.load(id);
  if (referral == null) {
    referral = new Referral(id);
    referral.referrer = referrer.id;
    referral.user = user.id;
    referral.firstSeenTimestamp = event.block.timestamp;
    referral.swapCount = ZERO_BI;
    referral.feeEventCount = ZERO_BI;
    referrer.uniqueReferredUsers = referrer.uniqueReferredUsers.plus(ONE_BI);
    referrer.save();
  }
  referral.lastSeenTimestamp = event.block.timestamp;
  referral.save();
  return referral;
}

export function touchUserActivity(
  user: User,
  protocol: Protocol,
  timestamp: BigInt,
  blockNumber: BigInt,
  segment: string
): void {
  let protocolDay = loadOrCreateProtocolDay(protocol, timestamp);
  let userDay = loadOrCreateUserDay(user, timestamp);
  let currentDayId = protocol.id + '-' + dayIdFromTimestamp(timestamp).toString() + '-' + user.id;

  if (user.lastDayId == null || user.lastDayId != currentDayId) {
    protocolDay.activeUsers = protocolDay.activeUsers.plus(ONE_BI);
    user.lastDayId = currentDayId;
  }

  user.totalActions = user.totalActions.plus(ONE_BI);
  user.lastSeenTimestamp = timestamp;
  user.lastUpdatedBlock = blockNumber;
  userDay.totalActions = userDay.totalActions.plus(ONE_BI);

  if (segment == 'aggregator') {
    user.aggregatorSwapCount = user.aggregatorSwapCount.plus(ONE_BI);
    userDay.aggregatorSwapCount = userDay.aggregatorSwapCount.plus(ONE_BI);
    protocolDay.aggregatorSwaps = protocolDay.aggregatorSwaps.plus(ONE_BI);
  } else if (segment == 'v2Swap') {
    user.v2SwapCount = user.v2SwapCount.plus(ONE_BI);
    userDay.v2SwapCount = userDay.v2SwapCount.plus(ONE_BI);
    protocolDay.v2Swaps = protocolDay.v2Swaps.plus(ONE_BI);
  } else if (segment == 'v3Swap') {
    user.v3SwapCount = user.v3SwapCount.plus(ONE_BI);
    userDay.v3SwapCount = userDay.v3SwapCount.plus(ONE_BI);
    protocolDay.v3Swaps = protocolDay.v3Swaps.plus(ONE_BI);
  } else if (segment == 'v2Liquidity') {
    user.v2LiquidityActions = user.v2LiquidityActions.plus(ONE_BI);
    userDay.v2LiquidityActions = userDay.v2LiquidityActions.plus(ONE_BI);
    protocolDay.v2LiquidityEvents = protocolDay.v2LiquidityEvents.plus(ONE_BI);
  } else if (segment == 'v3Liquidity') {
    user.v3LiquidityActions = user.v3LiquidityActions.plus(ONE_BI);
    userDay.v3LiquidityActions = userDay.v3LiquidityActions.plus(ONE_BI);
    protocolDay.v3LiquidityEvents = protocolDay.v3LiquidityEvents.plus(ONE_BI);
  } else if (segment == 'fee') {
    user.feeEvents = user.feeEvents.plus(ONE_BI);
    userDay.feeEvents = userDay.feeEvents.plus(ONE_BI);
    protocolDay.feeEvents = protocolDay.feeEvents.plus(ONE_BI);
  }

  user.save();
  userDay.save();
  protocolDay.lastUpdatedTimestamp = timestamp;
  protocolDay.save();
}

export function updateTokenTx(token: Token, timestamp: BigInt): void {
  let day = loadOrCreateTokenDay(token, timestamp);
  token.txCount = token.txCount.plus(ONE_BI);
  day.txCount = day.txCount.plus(ONE_BI);
  token.lastSeenTimestamp = timestamp;
  token.save();
  day.save();
}

export function trackAggregatorIn(token: Token, amount: BigInt, timestamp: BigInt): BigDecimal {
  let amountDecimal = convertTokenToDecimal(amount, token.decimals);
  let day = loadOrCreateTokenDay(token, timestamp);
  token.aggregatorInCount = token.aggregatorInCount.plus(ONE_BI);
  token.totalAggregatorVolumeIn = token.totalAggregatorVolumeIn.plus(amountDecimal);
  day.aggregatorInCount = day.aggregatorInCount.plus(ONE_BI);
  day.totalAggregatorVolumeIn = day.totalAggregatorVolumeIn.plus(amountDecimal);
  token.save();
  day.save();
  return amountDecimal;
}

export function trackAggregatorOut(token: Token, amount: BigInt, timestamp: BigInt): BigDecimal {
  let amountDecimal = convertTokenToDecimal(amount, token.decimals);
  let day = loadOrCreateTokenDay(token, timestamp);
  token.aggregatorOutCount = token.aggregatorOutCount.plus(ONE_BI);
  token.totalAggregatorVolumeOut = token.totalAggregatorVolumeOut.plus(amountDecimal);
  day.aggregatorOutCount = day.aggregatorOutCount.plus(ONE_BI);
  day.totalAggregatorVolumeOut = day.totalAggregatorVolumeOut.plus(amountDecimal);
  token.save();
  day.save();
  return amountDecimal;
}

export function trackV2Volume(token: Token, amount: BigInt, timestamp: BigInt): BigDecimal {
  let amountDecimal = convertTokenToDecimal(amount, token.decimals);
  let day = loadOrCreateTokenDay(token, timestamp);
  token.v2SwapCount = token.v2SwapCount.plus(ONE_BI);
  token.totalV2Volume = token.totalV2Volume.plus(amountDecimal);
  day.v2SwapCount = day.v2SwapCount.plus(ONE_BI);
  day.totalV2Volume = day.totalV2Volume.plus(amountDecimal);
  token.save();
  day.save();
  return amountDecimal;
}

export function trackV3Volume(token: Token, amount: BigInt, timestamp: BigInt): BigDecimal {
  let amountDecimal = convertTokenToDecimal(amount, token.decimals);
  let day = loadOrCreateTokenDay(token, timestamp);
  token.v3SwapCount = token.v3SwapCount.plus(ONE_BI);
  token.totalV3Volume = token.totalV3Volume.plus(amountDecimal);
  day.v3SwapCount = day.v3SwapCount.plus(ONE_BI);
  day.totalV3Volume = day.totalV3Volume.plus(amountDecimal);
  token.save();
  day.save();
  return amountDecimal;
}

export function trackFeeToken(token: Token, timestamp: BigInt): void {
  let day = loadOrCreateTokenDay(token, timestamp);
  token.feeEventCount = token.feeEventCount.plus(ONE_BI);
  day.feeEventCount = day.feeEventCount.plus(ONE_BI);
  token.save();
  day.save();
}

export const WRAPPED_NATIVE_ADDRESS = '0x315374aa9b5536037cc1efeea2439ccc0913a77e';

export function trackV2VolumeAgainstNative(token: Token, amount: BigInt, timestamp: BigInt): BigDecimal {
  let amountDecimal = convertTokenToDecimal(amount, token.decimals);
  let day = loadOrCreateTokenDay(token, timestamp);
  token.v2SwapCountAgainstNative = token.v2SwapCountAgainstNative.plus(ONE_BI);
  token.totalV2VolumeAgainstNative = token.totalV2VolumeAgainstNative.plus(amountDecimal);
  day.v2SwapCountAgainstNative = day.v2SwapCountAgainstNative.plus(ONE_BI);
  day.totalV2VolumeAgainstNative = day.totalV2VolumeAgainstNative.plus(amountDecimal);
  token.save();
  day.save();
  return amountDecimal;
}

export function trackV3VolumeAgainstNative(token: Token, amount: BigInt, timestamp: BigInt): BigDecimal {
  let amountDecimal = convertTokenToDecimal(amount, token.decimals);
  let day = loadOrCreateTokenDay(token, timestamp);
  token.v3SwapCountAgainstNative = token.v3SwapCountAgainstNative.plus(ONE_BI);
  token.totalV3VolumeAgainstNative = token.totalV3VolumeAgainstNative.plus(amountDecimal);
  day.v3SwapCountAgainstNative = day.v3SwapCountAgainstNative.plus(ONE_BI);
  day.totalV3VolumeAgainstNative = day.totalV3VolumeAgainstNative.plus(amountDecimal);
  token.save();
  day.save();
  return amountDecimal;
}
