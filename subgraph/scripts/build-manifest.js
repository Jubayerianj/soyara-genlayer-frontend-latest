const fs = require('fs');
const path = require('path');
const { CONTRACT_ADDRESSES } = require('../../constants/addresses.js');
const CHAIN_CONFIG = require('../config/chains.js');

const chainId = Number(process.argv[2] || 4441);
const addresses = CONTRACT_ADDRESSES[chainId];
const chain = CHAIN_CONFIG[chainId];

if (!chain) {
  throw new Error(`Unsupported chainId ${chainId}. Add it to subgraph/config/chains.js first.`);
}

if (!addresses) {
  throw new Error(`No addresses found for chainId ${chainId} in constants/addresses.js.`);
}

const startBlock = (key) => {
  const value = chain.contracts[key];
  return Number.isFinite(value) ? value : chain.startBlock;
};

const existingV2Pairs = Array.isArray(chain.existingV2Pairs) ? chain.existingV2Pairs : [];
const existingV3Pools = Array.isArray(chain.existingV3Pools) ? chain.existingV3Pools : [];

const dataSources = [];
const templates = [];

if (addresses.aggregatorEntrypoint) {
  dataSources.push(`
  - kind: ethereum
    name: AggregatorEntrypoint
    network: ${chain.network}
    source:
      address: "${addresses.aggregatorEntrypoint}"
      abi: AGGFlowEntrypoint
      startBlock: ${startBlock('aggregatorEntrypointStartBlock')}
    mapping:
      kind: ethereum/events
      apiVersion: 0.0.9
      language: wasm/assemblyscript
      entities:
        - Protocol
        - ProtocolDayData
        - Token
        - TokenDayData
        - User
        - UserDayData
        - UserTokenStat
        - Referral
        - AggregatorSwap
        - FeeCollectionEvent
        - AggregatorRouterUpdate
        - LiquidityProvision
      abis:
        - name: AGGFlowEntrypoint
          file: ../abi/AGGFlowEntrypoint.json
        - name: ERC20
          file: ./abis/ERC20.json
      eventHandlers:
        - event: AGGFlowSwap(indexed address,indexed address,address,address,bool,uint256,uint256,uint256,uint256)
          handler: handleAGGFlowSwap
        - event: FeeCollected(address,uint256,address,uint256,address,address)
          handler: handleFeeCollected
        - event: RouterUpdated(indexed address,indexed address)
          handler: handleRouterUpdated
      file: ./src/mappings/aggregator.ts`);
}

if (addresses.factory) {
  dataSources.push(`
  - kind: ethereum
    name: UniswapV2Factory
    network: ${chain.network}
    source:
      address: "${addresses.factory}"
      abi: UniswapV2Factory
      startBlock: ${startBlock('v2FactoryStartBlock')}
    mapping:
      kind: ethereum/events
      apiVersion: 0.0.9
      language: wasm/assemblyscript
      entities:
        - Protocol
        - Token
        - V2Pair
        - LiquidityProvision
      abis:
        - name: UniswapV2Factory
          file: ./abis/UniswapV2Factory.json
        - name: UniswapV2Pair
          file: ./abis/UniswapV2Pair.json
        - name: ERC20
          file: ./abis/ERC20.json
      eventHandlers:
        - event: PairCreated(indexed address,indexed address,address,uint256)
          handler: handlePairCreated
      file: ./src/mappings/v2Factory.ts`);

  templates.push(`
  - kind: ethereum
    name: UniswapV2PairTemplate
    network: ${chain.network}
    source:
      abi: UniswapV2Pair
    mapping:
      kind: ethereum/events
      apiVersion: 0.0.9
      language: wasm/assemblyscript
      entities:
        - Protocol
        - ProtocolDayData
        - Token
        - TokenDayData
        - User
        - UserDayData
        - UserTokenStat
        - V2Pair
        - V2Swap
        - V2Mint
        - V2Burn
        - LiquidityProvision
      abis:
        - name: UniswapV2Pair
          file: ./abis/UniswapV2Pair.json
        - name: ERC20
          file: ./abis/ERC20.json
      eventHandlers:
        - event: Mint(indexed address,uint256,uint256)
          handler: handleMint
        - event: Burn(indexed address,uint256,uint256,indexed address)
          handler: handleBurn
        - event: Swap(indexed address,uint256,uint256,uint256,uint256,indexed address)
          handler: handleSwap
        - event: Sync(uint112,uint112)
          handler: handleSync
      file: ./src/mappings/v2Pair.ts`);
}

if (addresses.v3Factory) {
  dataSources.push(`
  - kind: ethereum
    name: UniswapV3Factory
    network: ${chain.network}
    source:
      address: "${addresses.v3Factory}"
      abi: UniswapV3Factory
      startBlock: ${startBlock('v3FactoryStartBlock')}
    mapping:
      kind: ethereum/events
      apiVersion: 0.0.9
      language: wasm/assemblyscript
      entities:
        - Protocol
        - Token
        - V3Pool
        - LiquidityProvision
      abis:
        - name: UniswapV3Factory
          file: ../constants/abis/v3/factory.json
        - name: UniswapV3Pool
          file: ../constants/abis/v3/pool.json
        - name: ERC20
          file: ./abis/ERC20.json
      eventHandlers:
        - event: PoolCreated(indexed address,indexed address,indexed uint24,int24,address)
          handler: handlePoolCreated
      file: ./src/mappings/v3Factory.ts`);

  templates.push(`
  - kind: ethereum
    name: UniswapV3PoolTemplate
    network: ${chain.network}
    source:
      abi: UniswapV3Pool
    mapping:
      kind: ethereum/events
      apiVersion: 0.0.9
      language: wasm/assemblyscript
      entities:
        - Protocol
        - ProtocolDayData
        - Token
        - TokenDayData
        - User
        - UserDayData
        - UserTokenStat
        - V3Pool
        - V3Swap
        - V3Mint
        - V3Burn
        - LiquidityProvision
      abis:
        - name: UniswapV3Pool
          file: ../constants/abis/v3/pool.json
        - name: ERC20
          file: ./abis/ERC20.json
      eventHandlers:
        - event: Initialize(uint160,int24)
          handler: handleInitialize
        - event: Mint(address,indexed address,indexed int24,indexed int24,uint128,uint256,uint256)
          handler: handleMint
        - event: Burn(indexed address,indexed int24,indexed int24,uint128,uint256,uint256)
          handler: handleBurn
        - event: Swap(indexed address,indexed address,int256,int256,uint160,uint128,int24)
          handler: handleSwap
      file: ./src/mappings/v3Pool.ts`);
}

if (addresses.v3PositionManager && addresses.v3Factory) {
  dataSources.push(`
  - kind: ethereum
    name: UniswapV3PositionManager
    network: ${chain.network}
    source:
      address: "${addresses.v3PositionManager}"
      abi: NonfungiblePositionManager
      startBlock: ${startBlock('v3PositionManagerStartBlock')}
    mapping:
      kind: ethereum/events
      apiVersion: 0.0.9
      language: wasm/assemblyscript
      entities:
        - User
        - V3Position
        - V3PositionEvent
      abis:
        - name: NonfungiblePositionManager
          file: ../constants/abis/v3/positionManager.json
        - name: UniswapV3Factory
          file: ../constants/abis/v3/factory.json
      eventHandlers:
        - event: Transfer(indexed address,indexed address,indexed uint256)
          handler: handleTransfer
        - event: IncreaseLiquidity(indexed uint256,uint128,uint256,uint256)
          handler: handleIncreaseLiquidity
        - event: DecreaseLiquidity(indexed uint256,uint128,uint256,uint256)
          handler: handleDecreaseLiquidity
        - event: Collect(indexed uint256,address,uint256,uint256)
          handler: handleCollect
      file: ./src/mappings/v3PositionManager.ts`);
}

for (let i = 0; i < existingV2Pairs.length; i++) {
  const pairAddress = existingV2Pairs[i];
  dataSources.push(`
  - kind: ethereum
    name: ExistingUniswapV2Pair${i}
    network: ${chain.network}
    source:
      address: "${pairAddress}"
      abi: UniswapV2Pair
      startBlock: ${startBlock('v2FactoryStartBlock')}
    mapping:
      kind: ethereum/events
      apiVersion: 0.0.9
      language: wasm/assemblyscript
      entities:
        - Protocol
        - ProtocolDayData
        - Token
        - TokenDayData
        - User
        - UserDayData
        - UserTokenStat
        - V2Pair
        - V2Swap
        - V2Mint
        - V2Burn
        - LiquidityProvision
      abis:
        - name: UniswapV2Pair
          file: ./abis/UniswapV2Pair.json
        - name: ERC20
          file: ./abis/ERC20.json
      eventHandlers:
        - event: Mint(indexed address,uint256,uint256)
          handler: handleMint
        - event: Burn(indexed address,uint256,uint256,indexed address)
          handler: handleBurn
        - event: Swap(indexed address,uint256,uint256,uint256,uint256,indexed address)
          handler: handleSwap
        - event: Sync(uint112,uint112)
          handler: handleSync
      file: ./src/mappings/v2Pair.ts`);
}

for (let i = 0; i < existingV3Pools.length; i++) {
  const poolAddress = existingV3Pools[i];
  dataSources.push(`
  - kind: ethereum
    name: ExistingUniswapV3Pool${i}
    network: ${chain.network}
    source:
      address: "${poolAddress}"
      abi: UniswapV3Pool
      startBlock: ${startBlock('v3FactoryStartBlock')}
    mapping:
      kind: ethereum/events
      apiVersion: 0.0.9
      language: wasm/assemblyscript
      entities:
        - Protocol
        - ProtocolDayData
        - Token
        - TokenDayData
        - User
        - UserDayData
        - UserTokenStat
        - V3Pool
        - V3Swap
        - V3Mint
        - V3Burn
        - LiquidityProvision
      abis:
        - name: UniswapV3Pool
          file: ../constants/abis/v3/pool.json
        - name: ERC20
          file: ./abis/ERC20.json
      eventHandlers:
        - event: Initialize(uint160,int24)
          handler: handleInitialize
        - event: Mint(address,indexed address,indexed int24,indexed int24,uint128,uint256,uint256)
          handler: handleMint
        - event: Burn(indexed address,indexed int24,indexed int24,uint128,uint256,uint256)
          handler: handleBurn
        - event: Swap(indexed address,indexed address,int256,int256,uint160,uint128,int24)
          handler: handleSwap
      file: ./src/mappings/v3Pool.ts`);
}

const yaml = `specVersion: 1.3.0
schema:
  file: ./schema.graphql
dataSources:${dataSources.join('')}
templates:${templates.length > 0 ? templates.join('') : ' []'}
`;

const outFile = path.join(__dirname, '..', 'subgraph.yaml');
fs.writeFileSync(outFile, yaml);

console.log(`Wrote ${outFile} for chainId ${chainId} (${chain.name}, network=${chain.network}).`);
