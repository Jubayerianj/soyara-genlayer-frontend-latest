/**
 * scripts/find-user-swap-by-block.mjs
 * 
 * Highly-optimized search using a filtered getLogs request (by indexed user address)
 * over the last 300 blocks, indexing the match in MongoDB.
 */

import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';
import { createPublicClient, http, parseAbi, formatUnits, decodeEventLog } from 'viem';

dotenv.config();
dotenv.config({ path: '.env.local' });

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = 'dex_tracker';
const ENTRYPOINT_ADDRESS = '0xF69E64804000d28aA695eB5c594B996100fb3B49';
const TARGET_USER = '0x23D542DCEFb00b1f4268E67a0EC1EF4de0A58fe2';
const LitVM_CHAIN_ID = 4441;

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

async function main() {
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
  // Scan the last 300 blocks (plenty of blocks for recent transactions)
  const fromBlock = latestBlock - 300;
  console.log(`🧱 Latest block on chain: ${latestBlock}`);
  console.log(`⏳ Querying highly-filtered logs from block ${fromBlock} to ${latestBlock}...`);

  let logs = [];
  try {
    logs = await publicClient.getContractEvents({
      address: ENTRYPOINT_ADDRESS,
      abi: AGGFlowSwapAbi,
      eventName: 'AGGFlowSwap',
      args: {
        user: TARGET_USER
      },
      fromBlock: BigInt(fromBlock),
      toBlock: BigInt(latestBlock)
    });
  } catch (err) {
    console.error('❌ Failed to fetch logs from RPC:', err.message);
    await mongoClient.close();
    return;
  }

  console.log(`🔍 Found ${logs.length} swap event(s) matching user in this block range.`);

  for (const log of logs) {
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
      // Update user stats
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

  console.log('\n🔎 Searching MongoDB for verified swaps...');
  const userSwaps = await db.collection('transactions').find({ userAddress: TARGET_USER.toLowerCase() }).toArray();
  console.log(`🎉 Found ${userSwaps.length} swap(s) in the database for address ${TARGET_USER}:`);
  userSwaps.forEach((s, idx) => {
    console.log(`[Swap #${idx + 1}]`);
    console.log(`   Tx Hash: ${s.transactionHash}`);
    console.log(`   From: ${s.amount} ${s.fromToken.symbol}`);
    console.log(`   To: ${s.toToken.symbol}`);
    console.log(`   Estimated USD Value: $${s.usdValue.toFixed(2)}`);
    console.log(`   Timestamp: ${s.timestamp}`);
  });

  await mongoClient.close();
  console.log('🔌 Connection closed.');
}

main().catch(console.error);
