# FlipSwap Subgraph

This folder contains a reusable Graph subgraph for:

- `AGGFlowEntrypoint` aggregator swaps and fee collection
- SoyaraDex V2 factory + dynamically created pairs
- SoyaraDex V3 factory + dynamically created pools
- SoyaraDex V3 position manager NFT activity
- user, token, referral, and daily campaign analytics

## What it indexes

- Aggregator:
  - `AGGFlowSwap`
  - `FeeCollected`
  - `RouterUpdated`
- SoyaraDex V2:
  - `PairCreated`
  - pair `Swap`, `Mint`, `Burn`, `Sync`
- SoyaraDex V3:
  - `PoolCreated`
  - pool `Initialize`, `Swap`, `Mint`, `Burn`
  - position manager `Transfer`, `IncreaseLiquidity`, `DecreaseLiquidity`, `Collect`

## Important design note

One subgraph deployment targets one chain/network at a time. To make this reusable "everywhere", the manifest is generated from:

- [`constants/addresses.js`](/Users/jubayer/Desktop/Dex%20For%20LitVM/frontends/s2/flipswap/constants/addresses.js)
- [`subgraph/config/chains.js`](/Users/jubayer/Desktop/Dex%20For%20LitVM/frontends/s2/flipswap/subgraph/config/chains.js)

If a contract address is missing for a chain, the generator simply skips that data source.

## Setup

1. Install deps inside [`subgraph/package.json`](/Users/jubayer/Desktop/Dex%20For%20LitVM/frontends/s2/flipswap/subgraph/package.json).
2. Set the correct Graph network alias in [`subgraph/config/chains.js`](/Users/jubayer/Desktop/Dex%20For%20LitVM/frontends/s2/flipswap/subgraph/config/chains.js).
3. Fill real `startBlock` values there for faster indexing.
4. For LitVM Liteforge on Goldsky, this repo is now preconfigured with:
   - network slug: `liteforge`
   - configured start block: `10396390`
5. Generate the manifest for your chain:

```bash
cd subgraph
npm install
npm run prepare:litvm
```

For Sepolia:

```bash
cd subgraph
npm run prepare:sepolia
```

Then:

```bash
npm run codegen
npm run build
```

## Main entities

- `Protocol`, `ProtocolDayData`
- `User`, `UserDayData`
- `Token`, `TokenDayData`
- `UserTokenStat`
- `Referral`
- `AggregatorSwap`, `FeeCollectionEvent`, `AggregatorRouterUpdate`
- `V2Pair`, `V2Swap`, `V2Mint`, `V2Burn`
- `V3Pool`, `V3Swap`, `V3Mint`, `V3Burn`
- `V3Position`, `V3PositionEvent`

## Campaign-friendly queries

Example: most active aggregator users

```graphql
{
  users(first: 20, orderBy: aggregatorSwapCount, orderDirection: desc) {
    id
    aggregatorSwapCount
    referralSwapCount
    totalActions
    lastSeenTimestamp
  }
}
```

Example: users who interacted with a token

```graphql
{
  userTokenStats(
    first: 20
    where: { token: "0x315374aa9b5536037cc1efeea2439ccc0913a77e" }
    orderBy: aggregatorVolumeIn
    orderDirection: desc
  ) {
    user { id }
    token { symbol }
    aggregatorSwapInCount
    aggregatorSwapOutCount
    v2SwapCount
    v3SwapCount
  }
}
```

Example: referrer leaderboard

```graphql
{
  users(first: 20, orderBy: uniqueReferredUsers, orderDirection: desc) {
    id
    uniqueReferredUsers
    referralSwapCount
  }
}
```

## Goldsky deploy

Goldsky’s source deploy command is:

```bash
goldsky subgraph deploy YOUR_SUBGRAPH_NAME/1.0.0 --path .
```

Example flow:

```bash
cd subgraph
npm install
npm run prepare:litvm
npm run codegen
npm run build
goldsky subgraph deploy flipswap/1.0.0 --path .
```

## Important note about block `10396390`

This repo currently uses `10396390` as the LitVM Liteforge `startBlock`.

That is correct only if your contracts should begin indexing from block `10396390`. If `10396390` is later than your actual deployment block, then earlier historical swaps, pools, pairs, users, and campaign activity before block `10396390` will be skipped.

## What you should still customize

- `network` names for your Graph node or Graph Studio chain mapping
- actual `startBlock` values
- optional USD pricing if you want cross-token volume comparisons
- any extra aggregator/router contracts you deploy later
