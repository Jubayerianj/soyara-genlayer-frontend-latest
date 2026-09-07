/**
 * scripts/test-indexer-run.mjs
 * 
 * One-off test script with robust chunked fetching to prevent RPC timeouts.
 */

import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';
import { createPublicClient, http, parseAbi, formatUnits } from 'viem';

dotenv.config();
dotenv.config({ path: '.env.local' });

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = 'dex_tracker';
const ENTRYPOINT_ADDRESS = '0xF69E64804000d28aA695eB5c594B996100fb3B49';
const LitVM_CHAIN_ID = 4441;
const TARGET_USER = '0x23D542DCEFb00b1f4268E67a0EC1EF4de0A58fe2'.toLowerCase();

const LitVM = {
  id: LitVM_CHAIN_ID,
  name: 'LitVM LiteForge',
  network: 'LitVM-LiteForge',
  nativeCurrency: { name: 'zkLTC', symbol: 'zkLTC', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://liteforge.rpc.caldera.xyz/infra-partner-http'] }
  }
};

const AGGFlowSwapAbi = parseAbi([
  'event AGGFlowSwap(address indexed user, address indexed referrer, address tokenIn, address tokenOut, bool isFeeInInput, uint256 amountIn, uint256 amountOut, uint256 referrerFeeBps, uint256 totalFeeBps)'
]);

const tokenCache = {
  '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee': {
    address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    symbol: 'zkLTC',
    name: 'zkLTC',
    decimals: 18
  },
  '0x0000000000000000000000000000000000000000': {
    address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    symbol: 'zkLTC',
    name: 'zkLTC',
    decimals: 18
  }
};

async function getOrFetchToken(address, publicClient) {
  const normAddr = address.toLowerCase();
  if (tokenCache[normAddr]) return tokenCache[normAddr];

  try {
    const symbol = await publicClient.readContract({
      address: normAddr,
      abi: parseAbi(['function symbol() view returns (string)']),
      functionName: 'symbol'
    }).catch(() => 'UNKNOWN');

    const decimals = await publicClient.readContract({
      address: normAddr,
      abi: parseAbi(['function decimals() view returns (uint8)']),
      functionName: 'decimals'
    }).catch(() => 18);

    tokenCache[normAddr] = { address: normAddr, symbol, decimals: Number(decimals) };
    return tokenCache[normAddr];
  } catch (error) {
    return { address: normAddr, symbol: 'UNKNOWN', decimals: 18 };
  }
}

async function fetchTokenPriceUSD(symbol, publicClient) {
  try {
    if (symbol.toUpperCase().includes('USD')) return 1.0;
    const adapters = {
      'LTC': '0x45dDa5d881BD2C917976CCfde74fFd6f6412da29',
      'ZKLTC': '0x45dDa5d881BD2C917976CCfde74fFd6f6412da29',
      'WZKLTC': '0x45dDa5d881BD2C917976CCfde74fFd6f6412da29',
      'ETH': '0xc760B46beF9eD3F9A3d2b825164324D6703F0185',
      'WETH': '0xc760B46beF9eD3F9A3d2b825164324D6703F0185'
    };
    const adapterAddress = adapters[symbol.toUpperCase()];
    if (!adapterAddress) return 0;

    const roundData = await publicClient.readContract({
      address: adapterAddress,
      abi: parseAbi(['function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)']),
      functionName: 'latestRoundData'
    });
    return Number(formatUnits(roundData[1], 18));
  } catch (e) {
    return 0;
  }
}

async function test() {
  console.log('🚀 Connecting to MongoDB...');
  const mongoClient = new MongoClient(MONGODB_URI);
  await mongoClient.connect();
  const db = mongoClient.db(MONGODB_DB);
  console.log('✅ Connected to MongoDB.');

  const publicClient = createPublicClient({
    chain: LitVM,
    transport: http('https://liteforge.rpc.caldera.xyz/infra-partner-http')
  });

  const latestBlock = Number(await publicClient.getBlockNumber());
  console.log(`🧱 Latest block on chain: ${latestBlock}`);

  // Scan the last 1500 blocks (roughly past 45 minutes, very fast to sync in chunks)
  const seedBlock = latestBlock - 1500;
  console.log(`🌱 Seeding DB sync state block to: ${seedBlock}`);
  await db.collection('sync_state').updateOne(
    { key: 'last_processed_block' },
    { $set: { blockNumber: seedBlock } },
    { upsert: true }
  );

  console.log(`⏳ Fetching logs from block ${seedBlock + 1} to ${latestBlock} in chunks of 200 blocks...`);
  
  let blockCursor = seedBlock + 1;
  const CHUNK_SIZE = 200;
  let allLogs = [];

  while (blockCursor <= latestBlock) {
    const toBlock = Math.min(blockCursor + CHUNK_SIZE - 1, latestBlock);
    console.log(`📦 Range: ${blockCursor} -> ${toBlock}...`);
    try {
      const logs = await publicClient.getContractEvents({
        address: ENTRYPOINT_ADDRESS,
        abi: AGGFlowSwapAbi,
        eventName: 'AGGFlowSwap',
        fromBlock: BigInt(blockCursor),
        toBlock: BigInt(toBlock)
      });
      allLogs = allLogs.concat(logs);
      console.log(`   Found ${logs.length} event(s)`);
    } catch (err) {
      console.warn(`   ⚠️ Warning: failed to fetch range ${blockCursor} -> ${toBlock}: ${err.message}`);
    }
    blockCursor = toBlock + 1;
  }

  console.log(`🔍 Total swap event(s) found in all chunks: ${allLogs.length}`);

  for (const log of allLogs) {
    const { user, tokenIn, tokenOut, amountIn, amountOut } = log.args;
    const txHash = log.transactionHash.toLowerCase();
    
    // Check block timestamp
    let blockTimestamp = new Date();
    try {
      const block = await publicClient.getBlock({ blockNumber: log.blockNumber });
      blockTimestamp = new Date(Number(block.timestamp) * 1000);
    } catch (e) {}

    const tIn = await getOrFetchToken(tokenIn, publicClient);
    const tOut = await getOrFetchToken(tokenOut, publicClient);
    const formattedIn = formatUnits(amountIn, tIn.decimals);
    const formattedOut = formatUnits(amountOut, tOut.decimals);

    let usdValue = 0;
    try {
      const priceIn = await fetchTokenPriceUSD(tIn.symbol, publicClient);
      const priceOut = await fetchTokenPriceUSD(tOut.symbol, publicClient);
      if (priceIn > 0) usdValue = Number(formattedIn) * priceIn;
      else if (priceOut > 0) usdValue = Number(formattedOut) * priceOut;
    } catch (e) {}

    const txDoc = {
      userAddress: user.toLowerCase(),
      transactionHash: txHash,
      fromChain: LitVM_CHAIN_ID,
      toChain: LitVM_CHAIN_ID,
      fromToken: tIn,
      toToken: tOut,
      amount: formattedIn,
      usdValue: usdValue,
      status: 'completed',
      isLitVMTransaction: true,
      timestamp: blockTimestamp,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const res = await db.collection('transactions').updateOne(
      { transactionHash: txHash },
      { $setOnInsert: txDoc },
      { upsert: true }
    );

    if (res.upsertedCount > 0) {
      console.log(`🚀 Synced new transaction: ${txHash}`);
      // Update user_stats
      const volume = usdValue || 0;
      const chainKey = `chain_${LitVM_CHAIN_ID}`;
      await db.collection('user_stats').updateOne(
        { userAddress: user.toLowerCase() },
        {
          $inc: { totalTransactions: 1, totalVolumeUSD: volume, LitVMTransactions: 1 },
          $set: { lastTransaction: blockTimestamp, updatedAt: new Date() },
          $inc: {
            [`chainStats.${chainKey}.count`]: 1,
            [`chainStats.${chainKey}.volumeUSD`]: volume
          },
          $set: { [`chainStats.${chainKey}.lastTx`]: blockTimestamp }
        },
        { upsert: true }
      );
    }
  }

  // Update sync block state to latest
  await db.collection('sync_state').updateOne(
    { key: 'last_processed_block' },
    { $set: { blockNumber: latestBlock } },
    { upsert: true }
  );

  console.log('✅ Catch-up completed.');

  console.log(`🔎 Searching MongoDB for swaps matching user: ${TARGET_USER}`);
  const userSwaps = await db.collection('transactions').find({ userAddress: TARGET_USER }).toArray();
  console.log(`🎉 Found ${userSwaps.length} swap(s) for user in database:`);
  
  userSwaps.forEach((s, idx) => {
    console.log(`[Swap #${idx + 1}]`);
    console.log(`   Tx Hash: ${s.transactionHash}`);
    console.log(`   From: ${s.amount} ${s.fromToken.symbol} (${s.fromToken.address})`);
    console.log(`   To: ${s.toToken.symbol} (${s.toToken.address})`);
    console.log(`   Estimated USD Value: $${s.usdValue.toFixed(2)}`);
    console.log(`   Timestamp: ${s.timestamp}`);
  });

  await mongoClient.close();
  console.log('🔌 Connection closed.');
}

test().catch(console.error);
