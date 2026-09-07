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

const yaml = `specVersion: 1.3.0
schema:
  file: ./schema.graphql
dataSources:${dataSources.join('')}
`;

const outFile = path.join(__dirname, '..', 'subgraph.yaml');
fs.writeFileSync(outFile, yaml);

console.log(`Wrote ${outFile} for chainId ${chainId} (${chain.name}, network=${chain.network}).`);
