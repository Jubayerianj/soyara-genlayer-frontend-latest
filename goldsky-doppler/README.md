# Doppler Goldsky Subgraph for LitVM (Chain ID 4441)

This is a production-ready Goldsky Subgraph for the **Doppler Protocol** on **LitVM**, tracking:
- Every token deployment from `Airlock`
- Real-time SoyaraDex V3 bonding curve swaps, liquidity, and sqrtPrice

- Post-graduation SoyaraDex V2 pair swaps and reserves
- Rolling OHLCV candlestick data (`TokenDayData` & `TokenHourData`)
- Creator portfolios & claimable integrator fees (`MemefolioCreator`)

---

## 📁 Directory Structure
```
goldsky-doppler/
├── abis/
│   ├── Airlock.json
│   ├── ERC20.json
│   ├── UniswapV3Pool.json
│   └── UniswapV2Pair.json
├── src/
│   ├── mappings/
│   │   ├── airlock.ts    # Creation, migration, fee claims
│   │   ├── v3pool.ts     # V3 bonding curve swaps & OHLCV candles
│   │   └── v2pair.ts     # V2 graduated pair swaps & syncs
│   └── utils/
│       ├── constants.ts
│       └── pricing.ts
├── package.json
├── schema.graphql
├── subgraph.yaml
├── tsconfig.json
└── README.md
```

---

## 🚀 How to Deploy on Goldsky

### 1. Install Goldsky CLI & Dependencies
```bash
npm install -g @goldskycom/cli
cd goldsky-doppler
npm install
```

### 2. Run Code Generation & Build
```bash
npm run codegen
npm run build
```

### 3. Login & Deploy to Goldsky
```bash
goldsky login
goldsky subgraph deploy doppler-litvm/v1.0.0 --path .
```

---

## 🔍 Ready-To-Use GraphQL Queries

### 1. Top Traded Tokens (First 50)
```graphql
query GetTopTradedTokens {
  tokens(first: 50, orderBy: tradeVolumeUSD, orderDirection: desc) {
    id
    name
    symbol
    priceUSD
    marketCapUSD
    tradeVolumeUSD
    totalSwaps
    bondingCurveProgress
    isGraduated
  }
}
```

### 2. Top Trending Tokens (First 50)
```graphql
query GetTopTrendingTokens {
  tokens(first: 50, orderBy: bondingCurveProgress, orderDirection: desc) {
    id
    name
    symbol
    priceUSD
    marketCapUSD
    tradeVolumeUSD
    bondingCurveProgress
    isGraduated
  }
}
```

### 3. Recent Launched Tokens (with Pagination)
```graphql
query GetRecentTokens($first: Int = 50, $skip: Int = 0) {
  tokens(first: $first, skip: $skip, orderBy: createdAtBlockNumber, orderDirection: desc) {
    id
    name
    symbol
    creator
    createdAtTimestamp
    bondingCurveProgress
    isGraduated
  }
}
```

### 4. Memefolio (Tokens Created by Connected User)
```graphql
query GetMemefolio($creator: Bytes!) {
  memefolioCreator(id: $creator) {
    tokensCreatedCount
    totalVolumeGeneratedUSD
    createdTokens {
      id
      name
      symbol
      priceUSD
      marketCapUSD
      tradeVolumeUSD
      totalSwaps
      bondingCurveProgress
      isGraduated
    }
  }
}
```

### 5. OHLCV Candlestick History for Trading Chart
```graphql
query GetTokenCandles($tokenId: ID!) {
  tokenHourDatas(
    first: 168
    orderBy: hourStartUnix
    orderDirection: desc
    where: { token: $tokenId }
  ) {
    hourStartUnix
    open
    high
    low
    close
    volumeUSD
    txCount
  }
}
```
