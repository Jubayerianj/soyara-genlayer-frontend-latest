import { BigInt, BigDecimal, Address } from '@graphprotocol/graph-ts';
import { Create, Migrate, CollectIntegratorFees, Airlock } from '../../generated/Airlock/Airlock';
import { ERC20 } from '../../generated/Airlock/ERC20';
import { Token, Pool, Factory, MemefolioCreator } from '../../generated/schema';
import { UniswapV3Pool as V3PoolTemplate, UniswapV2Pair as V2PairTemplate } from '../../generated/templates';
import { ZERO_BI, ONE_BI, ZERO_BD, FACTORY_ADDRESS, toDecimal } from '../utils/constants';
import { getOrCreateBundle } from '../utils/pricing';

export function getOrCreateFactory(): Factory {
  let factory = Factory.load(FACTORY_ADDRESS);
  if (factory === null) {
    factory = new Factory(FACTORY_ADDRESS);
    factory.totalTokens = ZERO_BI;
    factory.totalVolumeUSD = ZERO_BD;
    factory.totalSwaps = ZERO_BI;
    factory.totalMigrated = ZERO_BI;
    factory.save();
  }
  return factory as Factory;
}

export function handleCreate(event: Create): void {
  let factory = getOrCreateFactory();
  factory.totalTokens = factory.totalTokens.plus(ONE_BI);
  factory.save();

  let tokenAddress = event.params.asset;
  let token = new Token(tokenAddress.toHexString().toLowerCase());

  let erc20 = ERC20.bind(tokenAddress);
  let nameResult = erc20.try_name();
  let symbolResult = erc20.try_symbol();
  let decimalsResult = erc20.try_decimals();
  let supplyResult = erc20.try_totalSupply();

  token.name = nameResult.reverted ? 'Doppler Token' : nameResult.value;
  token.symbol = symbolResult.reverted ? 'MEME' : symbolResult.value;
  token.decimals = decimalsResult.reverted ? BigInt.fromI32(18) : BigInt.fromI32(decimalsResult.value);
  token.totalSupply = supplyResult.reverted ? BigInt.fromI32(1000000000) : supplyResult.value;

  token.creator = event.transaction.from;
  token.numeraire = event.params.numeraire;
  token.v3Pool = event.params.poolOrHook;
  token.v2Pair = null;
  token.isGraduated = false;

  // Real initial bonding curve price in zkLTC and USD
  token.priceETH = BigDecimal.fromString('0.000000053096');
  token.priceUSD = BigDecimal.fromString('0.000002348');
  token.marketCapUSD = token.priceUSD.times(toDecimal(token.totalSupply, token.decimals));
  token.bondingCurveProgress = ZERO_BD; // Exactly 0% at creation

  token.tradeVolumeUSD = ZERO_BD;
  token.totalSwaps = ZERO_BI;
  token.txCount = ZERO_BI;

  token.createdAtTimestamp = event.block.timestamp;
  token.createdAtBlockNumber = event.block.number;
  token.save();

  // Create Pool entity & instantiate UniswapV3Pool template
  let poolAddress = event.params.poolOrHook;
  if (poolAddress) {
    let pool = new Pool(poolAddress.toHexString().toLowerCase());
    pool.token = token.id;
    pool.numeraire = event.params.numeraire;
    pool.isV3 = true;
    pool.isV2 = false;
    pool.volumeUSD = ZERO_BD;
    pool.totalSwaps = ZERO_BI;
    pool.createdAtTimestamp = event.block.timestamp;
    pool.save();

    V3PoolTemplate.create(poolAddress);
  }

  // Update MemefolioCreator entity
  let creatorId = event.transaction.from.toHexString().toLowerCase();
  let creator = MemefolioCreator.load(creatorId);
  if (creator === null) {
    creator = new MemefolioCreator(creatorId);
    creator.tokensCreatedCount = ZERO_BI;
    creator.totalVolumeGeneratedUSD = ZERO_BD;
    creator.totalClaimableFeesWETH = ZERO_BI;
    creator.createdTokens = [];
  }
  creator.tokensCreatedCount = creator.tokensCreatedCount.plus(ONE_BI);
  let createdList = creator.createdTokens;
  createdList.push(token.id);
  creator.createdTokens = createdList;
  creator.save();
}

export function handleMigrate(event: Migrate): void {
  let factory = getOrCreateFactory();
  factory.totalMigrated = factory.totalMigrated.plus(ONE_BI);
  factory.save();

  let token = Token.load(event.params.asset.toHexString().toLowerCase());
  if (token !== null) {
    token.isGraduated = true;
    token.v2Pair = event.params.migrationPool;
    token.bondingCurveProgress = BigDecimal.fromString('100');
    token.save();

    // Create Pool entity for V2 Pair & instantiate template
    let v2PairAddress = event.params.migrationPool;
    if (v2PairAddress) {
      let pool = new Pool(v2PairAddress.toHexString().toLowerCase());
      pool.token = token.id;
      pool.numeraire = event.params.numeraire;
      pool.isV3 = false;
      pool.isV2 = true;
      pool.volumeUSD = ZERO_BD;
      pool.totalSwaps = ZERO_BI;
      pool.createdAtTimestamp = event.block.timestamp;
      pool.save();

      V2PairTemplate.create(v2PairAddress);
    }
  }
}

export function handleCollectIntegratorFees(event: CollectIntegratorFees): void {
  let creatorId = event.params.integrator.toHexString().toLowerCase();
  let creator = MemefolioCreator.load(creatorId);
  if (creator !== null) {
    creator.totalClaimableFeesWETH = ZERO_BI;
    creator.save();
  }
}
