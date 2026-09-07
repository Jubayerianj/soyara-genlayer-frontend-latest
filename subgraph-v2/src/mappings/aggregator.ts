import { Address } from '@graphprotocol/graph-ts';
import {
  AGGFlowSwap as AGGFlowSwapEvent,
  FeeCollected as FeeCollectedEvent,
  RouterUpdated as RouterUpdatedEvent
} from '../../generated/AggregatorEntrypoint/AGGFlowEntrypoint';
import {
  SwapExecuted as WrapperSwapExecutedEvent
} from '../../generated/WrapperAggregator/WrapperAggregator';
import {
  AggregatorRouterUpdate,
  AggregatorSwap,
  FeeCollectionEvent
} from '../../generated/schema';
import {
  NATIVE_ADDRESS,
  ONE_BI,
  ZERO_BI,
  ZERO_ADDRESS,
  convertTokenToDecimal,
  eventId,
  loadOrCreateProtocol,
  loadOrCreateReferral,
  loadOrCreateToken,
  loadOrCreateUser,
  loadOrCreateUserTokenStat,
  touchUserActivity,
  trackAggregatorIn,
  trackAggregatorOut,
  trackFeeToken,
  updateTokenTx
} from './common';

function normalizedAddress(address: Address): Address {
  return address.toHexString() == NATIVE_ADDRESS
    ? Address.fromString(ZERO_ADDRESS)
    : address;
}

export function handleAGGFlowSwap(event: AGGFlowSwapEvent): void {
  let protocol = loadOrCreateProtocol(event);
  let user = loadOrCreateUser(event.params.user, event);
  let tokenIn = loadOrCreateToken(normalizedAddress(event.params.tokenIn), event);
  let tokenOut = loadOrCreateToken(normalizedAddress(event.params.tokenOut), event);

  protocol.totalAggregatorSwaps = protocol.totalAggregatorSwaps.plus(ONE_BI);
  protocol.save();

  touchUserActivity(user, protocol, event.block.timestamp, event.block.number, 'aggregator');
  updateTokenTx(tokenIn, event.block.timestamp);
  updateTokenTx(tokenOut, event.block.timestamp);

  let amountInDecimal = trackAggregatorIn(tokenIn, event.params.amountIn, event.block.timestamp);
  let amountOutDecimal = trackAggregatorOut(tokenOut, event.params.amountOut, event.block.timestamp);

  let inputStat = loadOrCreateUserTokenStat(user, tokenIn, event);
  inputStat.aggregatorSwapInCount = inputStat.aggregatorSwapInCount.plus(ONE_BI);
  inputStat.aggregatorVolumeIn = inputStat.aggregatorVolumeIn.plus(amountInDecimal);
  inputStat.save();

  let outputStat = loadOrCreateUserTokenStat(user, tokenOut, event);
  outputStat.aggregatorSwapOutCount = outputStat.aggregatorSwapOutCount.plus(ONE_BI);
  outputStat.aggregatorVolumeOut = outputStat.aggregatorVolumeOut.plus(amountOutDecimal);
  outputStat.save();

  let swap = new AggregatorSwap(eventId(event));
  swap.protocol = protocol.id;
  swap.user = user.id;
  swap.tokenIn = tokenIn.id;
  swap.tokenOut = tokenOut.id;
  swap.isFeeInInput = event.params.isFeeInInput;
  swap.amountIn = event.params.amountIn;
  swap.amountInDecimal = amountInDecimal;
  swap.amountOut = event.params.amountOut;
  swap.amountOutDecimal = amountOutDecimal;
  swap.referrerFeeBps = event.params.referrerFeeBps;
  swap.totalFeeBps = event.params.totalFeeBps;
  swap.timestamp = event.block.timestamp;
  swap.blockNumber = event.block.number;
  swap.txHash = event.transaction.hash;

  if (event.params.referrer.toHexString() != ZERO_ADDRESS) {
    let referrer = loadOrCreateUser(event.params.referrer, event);
    let referral = loadOrCreateReferral(referrer, user, event);
    referrer.referralSwapCount = referrer.referralSwapCount.plus(ONE_BI);
    referrer.save();
    referral.swapCount = referral.swapCount.plus(ONE_BI);
    referral.lastSeenTimestamp = event.block.timestamp;
    referral.save();
    swap.referrer = referrer.id;
  }

  swap.save();
}

export function handleFeeCollected(event: FeeCollectedEvent): void {
  let protocol = loadOrCreateProtocol(event);
  let user = loadOrCreateUser(event.params.user, event);
  let feeCollector = loadOrCreateUser(event.params.feeCollector, event);
  let token = loadOrCreateToken(normalizedAddress(event.params.token), event);

  protocol.totalFeeEvents = protocol.totalFeeEvents.plus(ONE_BI);
  protocol.save();

  touchUserActivity(user, protocol, event.block.timestamp, event.block.number, 'fee');
  updateTokenTx(token, event.block.timestamp);
  trackFeeToken(token, event.block.timestamp);

  let amountDecimal = convertTokenToDecimal(event.params.amount, token.decimals);
  let referrerAmountDecimal = convertTokenToDecimal(event.params.referrerAmount, token.decimals);

  let collectorStat = loadOrCreateUserTokenStat(feeCollector, token, event);
  collectorStat.feeEvents = collectorStat.feeEvents.plus(ONE_BI);
  collectorStat.collectorFeesReceived = collectorStat.collectorFeesReceived.plus(amountDecimal);
  collectorStat.save();

  let feeEvent = new FeeCollectionEvent(eventId(event));
  feeEvent.protocol = protocol.id;
  feeEvent.user = user.id;
  feeEvent.feeCollector = feeCollector.id;
  feeEvent.token = token.id;
  feeEvent.amount = event.params.amount;
  feeEvent.amountDecimal = amountDecimal;
  feeEvent.referrerAmount = event.params.referrerAmount;
  feeEvent.referrerAmountDecimal = referrerAmountDecimal;
  feeEvent.timestamp = event.block.timestamp;
  feeEvent.blockNumber = event.block.number;
  feeEvent.txHash = event.transaction.hash;

  if (event.params.referrer.toHexString() != ZERO_ADDRESS) {
    let referrer = loadOrCreateUser(event.params.referrer, event);
    let referral = loadOrCreateReferral(referrer, user, event);
    let referrerStat = loadOrCreateUserTokenStat(referrer, token, event);
    referrerStat.feeEvents = referrerStat.feeEvents.plus(ONE_BI);
    referrerStat.referrerFeesReceived = referrerStat.referrerFeesReceived.plus(referrerAmountDecimal);
    referrerStat.save();
    referral.feeEventCount = referral.feeEventCount.plus(ONE_BI);
    referral.lastSeenTimestamp = event.block.timestamp;
    referral.save();
    feeEvent.referrer = referrer.id;
  }

  feeEvent.save();
}

export function handleRouterUpdated(event: RouterUpdatedEvent): void {
  let update = new AggregatorRouterUpdate(eventId(event));
  update.oldRouter = event.params.oldRouter;
  update.newRouter = event.params.newRouter;
  update.timestamp = event.block.timestamp;
  update.blockNumber = event.block.number;
  update.txHash = event.transaction.hash;
  update.save();
}

// Handler for the Wrapper/Point Strategy Aggregator contract.
// The wrapper emits: SwapExecuted(indexed address user, indexed address recipient,
//   address referrer, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 points)
//
// IMPORTANT: `event.params.user` is the REAL user wallet (indexed in topic1).
// The core AGGFlowSwap event attributes the swap to the wrapper contract address,
// so we rely on this wrapper event to correctly associate swaps with users.
// tokenIn is always native zkLTC (address(0)) since the wrapper accepts only native.
export function handleWrapperSwapExecuted(event: WrapperSwapExecutedEvent): void {
  // tokenIn is always native zkLTC - the wrapper only accepts native token as input
  let nativeAddress = Address.fromString(ZERO_ADDRESS);
  let tokenIn = loadOrCreateToken(nativeAddress, event);
  let tokenOut = loadOrCreateToken(normalizedAddress(event.params.tokenOut), event);

  let protocol = loadOrCreateProtocol(event);
  // Use the REAL user address from the wrapper event (not the wrapper contract address)
  let user = loadOrCreateUser(event.params.user, event);

  protocol.totalAggregatorSwaps = protocol.totalAggregatorSwaps.plus(ONE_BI);
  protocol.save();

  touchUserActivity(user, protocol, event.block.timestamp, event.block.number, 'aggregator');
  updateTokenTx(tokenIn, event.block.timestamp);
  updateTokenTx(tokenOut, event.block.timestamp);

  // amountIn = how much native zkLTC user spent
  // amountOut = how much tokenOut user received
  let amountInDecimal = trackAggregatorIn(tokenIn, event.params.amountIn, event.block.timestamp);
  let amountOutDecimal = trackAggregatorOut(tokenOut, event.params.amountOut, event.block.timestamp);

  // Track per-user token stats
  let inputStat = loadOrCreateUserTokenStat(user, tokenIn, event);
  inputStat.aggregatorSwapInCount = inputStat.aggregatorSwapInCount.plus(ONE_BI);
  inputStat.aggregatorVolumeIn = inputStat.aggregatorVolumeIn.plus(amountInDecimal);
  inputStat.save();

  let outputStat = loadOrCreateUserTokenStat(user, tokenOut, event);
  outputStat.aggregatorSwapOutCount = outputStat.aggregatorSwapOutCount.plus(ONE_BI);
  outputStat.aggregatorVolumeOut = outputStat.aggregatorVolumeOut.plus(amountOutDecimal);
  outputStat.save();

  // Record the swap entity using event id for deduplication
  // Note: this swap will also exist in the core indexer under the wrapper address.
  // We create a separate record here for the real user.
  let swap = new AggregatorSwap(eventId(event));
  swap.protocol = protocol.id;
  swap.user = user.id;
  swap.tokenIn = tokenIn.id;
  swap.tokenOut = tokenOut.id;
  swap.isFeeInInput = false; // wrapper always uses output-side fee model
  swap.amountIn = event.params.amountIn;
  swap.amountInDecimal = amountInDecimal;
  swap.amountOut = event.params.amountOut;
  swap.amountOutDecimal = amountOutDecimal;
  swap.referrerFeeBps = ZERO_BI;
  swap.totalFeeBps = ZERO_BI;
  swap.timestamp = event.block.timestamp;
  swap.blockNumber = event.block.number;
  swap.txHash = event.transaction.hash;

  // Track referrer if set
  if (event.params.referrer.toHexString() != ZERO_ADDRESS) {
    let referrer = loadOrCreateUser(event.params.referrer, event);
    let referral = loadOrCreateReferral(referrer, user, event);
    referrer.referralSwapCount = referrer.referralSwapCount.plus(ONE_BI);
    referrer.save();
    referral.swapCount = referral.swapCount.plus(ONE_BI);
    referral.lastSeenTimestamp = event.block.timestamp;
    referral.save();
    swap.referrer = referrer.id;
  }

  swap.save();
}

