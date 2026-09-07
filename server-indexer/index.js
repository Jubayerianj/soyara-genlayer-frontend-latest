/**
 * server-indexer/index.js
 * 
 * Standalone Event Indexer Daemon for LitVM Dex Swaps.
 * Designed for deployment on Railway.com.
 * 
 * Subscribes to AGGFlowSwap events via WebSockets (with HTTP polling fallback)
 * and records transactions & user stats to MongoDB in real-time.
 */

import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';
import { createPublicClient, http, webSocket, parseAbi, formatUnits } from 'viem';

// Load local environment variables (if in development)
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = 'dex_tracker';
const ENTRYPOINT_ADDRESS = '0xF69E64804000d28aA695eB5c594B996100fb3B49';
const LitVM_CHAIN_ID = 4441;
const START_BLOCK = 17948281; // Block where the contract was deployed

// LitVM Chain Configuration
const LitVM = {
  id: LitVM_CHAIN_ID,
  name: 'LitVM LiteForge',
  network: 'LitVM-LiteForge',
  nativeCurrency: {
    name: 'zkLTC',
    symbol: 'zkLTC',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://liteforge.rpc.caldera.xyz/infra-partner-http'],
      webSocket: ['wss://liteforge.rpc.caldera.xyz/infra-partner-ws'],
    },
  },
};

// AGGFlowSwap Event ABI
const AGGFlowSwapAbi = parseAbi([
  'event AGGFlowSwap(address indexed user, address indexed referrer, address tokenIn, address tokenOut, bool isFeeInInput, uint256 amountIn, uint256 amountOut, uint256 referrerFeeBps, uint256 totalFeeBps)'
]);

// In-memory token cache to prevent RPC spam
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

// Dynamic helper to fetch token metadata from the blockchain
async function getOrFetchToken(address, publicClient) {
  const normAddr = address.toLowerCase();
  if (tokenCache[normAddr]) {
    return tokenCache[normAddr];
  }

  try {
    const symbol = await publicClient.readContract({
      address: normAddr,
      abi: parseAbi(['function symbol() view returns (string)']),
      functionName: 'symbol'
    }).catch(() => 'UNKNOWN');

    const name = await publicClient.readContract({
      address: normAddr,
      abi: parseAbi(['function name() view returns (string)']),
      functionName: 'name'
    }).catch(() => 'Unknown Token');

    const decimals = await publicClient.readContract({
      address: normAddr,
      abi: parseAbi(['function decimals() view returns (uint8)']),
      functionName: 'decimals'
    }).catch(() => 18);

    tokenCache[normAddr] = {
      address: normAddr,
      symbol,
      name,
      decimals: Number(decimals)
    };

    console.log(`🏷️  Cached token metadata: ${symbol} (${normAddr})`);
    return tokenCache[normAddr];
  } catch (error) {
    console.warn(`⚠️  Failed to query ERC20 metadata for ${address}:`, error.message);
    return {
      address: normAddr,
      symbol: 'UNKNOWN',
      name: 'Unknown Token',
      decimals: 18
    };
  }
}

// Update user_stats collection
async function updateUserStats(db, address, transaction) {
  try {
    const volume = transaction.usdValue || 0;
    const chainKey = `chain_${transaction.fromChain}`;

    const update = {
      $inc: {
        totalTransactions: 1,
        totalVolumeUSD: volume
      },
      $set: {
        lastTransaction: transaction.timestamp,
        updatedAt: new Date()
      }
    };

    update.$inc.LitVMTransactions = 1;
    update.$inc[`chainStats.${chainKey}.count`] = 1;
    update.$inc[`chainStats.${chainKey}.volumeUSD`] = volume;
    update.$set[`chainStats.${chainKey}.lastTx`] = transaction.timestamp;

    await db.collection('user_stats').updateOne(
      { userAddress: address.toLowerCase() },
      update,
      { upsert: true }
    );
    
    console.log(`📈 Updated user stats for: ${address}`);
  } catch (error) {
    console.error('❌ Failed to update user stats:', error.message);
  }
}

// Fetch live price of a token from the Dia Oracle on-chain using Viem
async function fetchTokenPriceUSD(symbol, publicClient) {
  try {
    const upperSymbol = symbol.toUpperCase();
    if (upperSymbol.includes('USD')) {
      return 1.0;
    }

    const adapters = {
      'LTC': '0x45dDa5d881BD2C917976CCfde74fFd6f6412da29',
      'ZKLTC': '0x45dDa5d881BD2C917976CCfde74fFd6f6412da29',
      'WZKLTC': '0x45dDa5d881BD2C917976CCfde74fFd6f6412da29',
      'ETH': '0xc760B46beF9eD3F9A3d2b825164324D6703F0185',
      'WETH': '0xc760B46beF9eD3F9A3d2b825164324D6703F0185',
      'BTC': '0x7d0445782E383223c7B4B660bb96b87213e9b605',
      'WBTC': '0x7d0445782E383223c7B4B660bb96b87213e9b605'
    };

    const adapterAddress = adapters[upperSymbol];
    if (!adapterAddress) return 0;

    const roundData = await publicClient.readContract({
      address: adapterAddress,
      abi: parseAbi(['function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)']),
      functionName: 'latestRoundData'
    });

    return Number(formatUnits(roundData[1], 18));
  } catch (error) {
    console.warn(`⚠️  Price oracle query failed for ${symbol}:`, error.message);
    return 0;
  }
}

// Process a single log and save to MongoDB
async function processLog(db, log, publicClient) {
  const { user, referrer, tokenIn, tokenOut, isFeeInInput, amountIn, amountOut } = log.args;
  const txHash = log.transactionHash.toLowerCase();
  
  console.log(`⚡ Processing Swap: User ${user} | Tx ${txHash}`);

  let blockTimestamp = new Date();
  try {
    const block = await publicClient.getBlock({ blockNumber: log.blockNumber });
    blockTimestamp = new Date(Number(block.timestamp) * 1000);
  } catch (e) {
    console.warn(`⚠️  Failed to fetch timestamp for block ${log.blockNumber}, using current time.`);
  }

  const tIn = await getOrFetchToken(tokenIn, publicClient);
  const tOut = await getOrFetchToken(tokenOut, publicClient);
  const formattedIn = formatUnits(amountIn, tIn.decimals);
  const formattedOut = formatUnits(amountOut, tOut.decimals);

  let usdValue = 0;
  try {
    const priceIn = await fetchTokenPriceUSD(tIn.symbol, publicClient);
    const priceOut = await fetchTokenPriceUSD(tOut.symbol, publicClient);
    if (priceIn > 0) {
      usdValue = Number(formattedIn) * priceIn;
    } else if (priceOut > 0) {
      usdValue = Number(formattedOut) * priceOut;
    }
  } catch (priceErr) {
    console.warn('⚠️  Could not determine swap USD value');
  }

  const transactionDoc = {
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

  const txRes = await db.collection('transactions').updateOne(
    { transactionHash: txHash },
    { $setOnInsert: transactionDoc },
    { upsert: true }
  );

  if (txRes.upsertedCount > 0) {
    console.log(`✅ Logged new transaction: ${txHash}`);
    await updateUserStats(db, user, transactionDoc);
  } else {
    console.log(`ℹ️  Transaction already indexed: ${txHash}`);
  }

  await db.collection('sync_state').updateOne(
    { key: 'last_processed_block' },
    { $set: { blockNumber: Number(log.blockNumber) } },
    { upsert: true }
  );
}

// Catch up / backfill historical blocks in chunks
async function catchUpHistorical(db, publicClient, currentBlock) {
  const syncState = await db.collection('sync_state').findOne({ key: 'last_processed_block' });
  const lastProcessedBlock = syncState ? syncState.blockNumber : START_BLOCK;

  if (lastProcessedBlock >= currentBlock) {
    console.log(`✨ Already synchronized. Last synced block: ${lastProcessedBlock}`);
    return;
  }

  console.log(`⏳ Synchronizing historical blocks: ${lastProcessedBlock + 1} -> ${currentBlock}`);

  const CHUNK_SIZE = 1000; // Small chunks for safe RPC fetch sizes
  let blockCursor = lastProcessedBlock + 1;

  while (blockCursor <= currentBlock) {
    const toBlock = Math.min(blockCursor + CHUNK_SIZE - 1, currentBlock);
    console.log(`📦 Fetching events for blocks ${blockCursor} to ${toBlock}...`);

    try {
      const logs = await publicClient.getContractEvents({
        address: ENTRYPOINT_ADDRESS,
        abi: AGGFlowSwapAbi,
        eventName: 'AGGFlowSwap',
        fromBlock: BigInt(blockCursor),
        toBlock: BigInt(toBlock)
      });

      console.log(`🔍 Found ${logs.length} events in this batch.`);
      for (const log of logs) {
        await processLog(db, log, publicClient);
      }

      await db.collection('sync_state').updateOne(
        { key: 'last_processed_block' },
        { $set: { blockNumber: toBlock } },
        { upsert: true }
      );

      blockCursor = toBlock + 1;
    } catch (error) {
      console.error(`❌ Error fetching block range ${blockCursor} -> ${toBlock}:`, error.message);
      console.log('⏳ Retrying batch in 5 seconds...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  console.log(`✅ Historical catch-up completed at block ${currentBlock}!`);
}

// Main execution loop
async function runIndexer() {
  if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI is missing. Please set it in your environment variables.');
    process.exit(1);
  }

  console.log('🔗 Connecting to MongoDB...');
  const mongoClient = new MongoClient(MONGODB_URI);
  await mongoClient.connect();
  const db = mongoClient.db(MONGODB_DB);
  console.log('✅ Connected to MongoDB.');

  const wsRpcUrl = process.env.LITVM_WS_RPC_URL;
  const httpRpcUrl = process.env.NEXT_PUBLIC_LITVM_RPC_URL || 'https://liteforge.rpc.caldera.xyz/infra-partner-http';

  let transport;
  if (wsRpcUrl) {
    console.log(`🔌 Initializing client with WebSocket transport: ${wsRpcUrl}`);
    transport = webSocket(wsRpcUrl);
  } else {
    console.log(`🔌 WebSocket URL not specified. Using HTTP Polling transport: ${httpRpcUrl}`);
    transport = http(httpRpcUrl);
  }

  const publicClient = createPublicClient({
    chain: LitVM,
    transport
  });

  const latestBlockBigInt = await publicClient.getBlockNumber();
  const currentBlock = Number(latestBlockBigInt);
  console.log(`🧱 Latest block on chain: ${currentBlock}`);

  // Catch up first
  await catchUpHistorical(db, publicClient, currentBlock);

  // Watch for new events
  console.log(`📡 Listening for new events on ${ENTRYPOINT_ADDRESS}...`);
  
  const unwatch = publicClient.watchContractEvent({
    address: ENTRYPOINT_ADDRESS,
    abi: AGGFlowSwapAbi,
    eventName: 'AGGFlowSwap',
    onLogs: async (logs) => {
      console.log(`🔔 Received ${logs.length} new log(s)`);
      for (const log of logs) {
        try {
          await processLog(db, log, publicClient);
        } catch (err) {
          console.error('❌ Error processing real-time log:', err.message);
        }
      }
    },
    onError: (error) => {
      console.error('❌ Subscription Error:', error.message);
      console.log('🔄 Re-starting indexer in 10 seconds...');
      unwatch();
      mongoClient.close();
      setTimeout(runIndexer, 10000);
    }
  });

  process.on('SIGINT', () => {
    console.log('🔌 Shutting down indexer...');
    unwatch();
    mongoClient.close();
    process.exit(0);
  });
}

runIndexer().catch(err => {
  console.error('💥 Critical indexer failure:', err);
  process.exit(1);
});
