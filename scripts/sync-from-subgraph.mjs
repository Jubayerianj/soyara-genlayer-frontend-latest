/**
 * scripts/sync-from-subgraph.mjs
 * 
 * Corrected helper script to:
 * 1. Wipe incorrect local MongoDB records for TARGET_USER.
 * 2. Fetch swaps from Goldsky and write them using the correct { address, symbol, decimals } schema.
 * 3. Correctly distinguish buys and sells.
 */

import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';
import fetch from 'node-fetch';
import { formatUnits } from 'viem';

dotenv.config();
dotenv.config({ path: '.env.local' });

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = 'dex_tracker';
const SUBGRAPH_URL = 'https://api.goldsky.com/api/public/project_cmrgg88kjt8sw01wxhc9476jr/subgraphs/flipswap-v2/1.0.3/gn';
const TARGET_USER = '0x23D542DCEFb00b1f4268E67a0EC1EF4de0A58fe2'.toLowerCase();
const TARGET_TOKEN = '0xdf69970B2fE416339187aA41D39882e864984CE9'.toLowerCase();

async function main() {
  console.log('🚀 Connecting to MongoDB...');
  const mongoClient = new MongoClient(MONGODB_URI);
  await mongoClient.connect();
  const db = mongoClient.db(MONGODB_DB);
  console.log('✅ Connected to MongoDB.');

  // Clean previous test data
  console.log('🧹 Clearing previous database test data for user...');
  await db.collection('transactions').deleteMany({ userAddress: TARGET_USER });
  await db.collection('user_stats').deleteMany({ userAddress: TARGET_USER });

  console.log(`📡 Querying Goldsky Subgraph for user: ${TARGET_USER}...`);

  const query = `
    query UserQuestVerification($user: String!, $token: String!, $limit: Int!) {
      token(id: $token) {
        id
        symbol
        name
        decimals
      }
      swapsIn: aggregatorSwaps(
        where: { user: $user, tokenIn: $token }
        orderBy: timestamp
        orderDirection: desc
        first: $limit
      ) {
        id
        txHash
        timestamp
        amountIn
        amountInDecimal
        amountOut
        amountOutDecimal
        tokenOut
      }
      swapsOut: aggregatorSwaps(
        where: { user: $user, tokenOut: $token }
        orderBy: timestamp
        orderDirection: desc
        first: $limit
      ) {
        id
        txHash
        timestamp
        amountIn
        amountInDecimal
        amountOut
        amountOutDecimal
        tokenIn
      }
    }
  `;

  const variables = {
    user: TARGET_USER,
    token: TARGET_TOKEN,
    limit: 10
  };

  try {
    const response = await fetch(SUBGRAPH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables })
    });

    if (!response.ok) {
      throw new Error(`Goldsky Subgraph returned status ${response.status}`);
    }

    const result = await response.json();
    if (result.errors) {
      console.error('❌ Subgraph errors:', result.errors);
      await mongoClient.close();
      return;
    }

    const data = result.data || {};
    
    // Correctly map id to address
    const tokenInfo = {
      address: TARGET_TOKEN,
      symbol: data.token?.symbol || 'ZKUSDC',
      name: data.token?.name || 'ZKUSDC',
      decimals: data.token ? Number(data.token.decimals) : 18
    };

    const swapsIn = data.swapsIn || [];
    const swapsOut = data.swapsOut || [];

    console.log(`🔍 Subgraph returned ${swapsIn.length} Sell(s) and ${swapsOut.length} Buy(s).`);

    const processItem = async (s, isSell) => {
      // For swapsIn: fromToken is TARGET_TOKEN (isSell)
      // For swapsOut: toToken is TARGET_TOKEN (isBuy)
      const tIn = isSell ? tokenInfo : { address: (s.tokenIn || '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee').toLowerCase(), symbol: 'zkLTC', decimals: 18, name: 'zkLTC' };
      const tOut = isSell ? { address: (s.tokenOut || '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee').toLowerCase(), symbol: 'zkLTC', decimals: 18, name: 'zkLTC' } : tokenInfo;

      const formattedIn = s.amountInDecimal || formatUnits(BigInt(s.amountIn || 0), tIn.decimals);
      const formattedOut = s.amountOutDecimal || formatUnits(BigInt(s.amountOut || 0), tOut.decimals);

      const txDoc = {
        userAddress: TARGET_USER,
        transactionHash: s.txHash.toLowerCase(),
        fromChain: 4441,
        toChain: 4441,
        fromToken: tIn,
        toToken: tOut,
        amount: formattedIn.toString(),
        amountOutDecimal: parseFloat(formattedOut),
        usdValue: isSell ? parseFloat(formattedIn) : parseFloat(formattedOut), // Since target token is ZKUSDC, price is $1
        status: 'completed',
        isLitVMTransaction: true,
        timestamp: new Date(Number(s.timestamp) * 1000),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const res = await db.collection('transactions').updateOne(
        { transactionHash: s.txHash.toLowerCase() },
        { $setOnInsert: txDoc },
        { upsert: true }
      );

      if (res.upsertedCount > 0) {
        console.log(`✅ Indexed swap: ${s.txHash}`);
        // Update user stats
        const volume = txDoc.usdValue || 0;
        const chainKey = 'chain_4441';
        await db.collection('user_stats').updateOne(
          { userAddress: TARGET_USER },
          {
            $inc: { totalTransactions: 1, totalVolumeUSD: volume, LitVMTransactions: 1 },
            $set: { lastTransaction: txDoc.timestamp, updatedAt: new Date() },
            $inc: {
              [`chainStats.${chainKey}.count`]: 1,
              [`chainStats.${chainKey}.volumeUSD`]: volume
            },
            $set: { [`chainStats.${chainKey}.lastTx`]: txDoc.timestamp }
          },
          { upsert: true }
        );
      }
    };

    // Process all sells (swapsIn)
    for (const s of swapsIn) {
      await processItem(s, true);
    }

    // Process all buys (swapsOut)
    for (const s of swapsOut) {
      await processItem(s, false);
    }

    console.log('\n🎉 MongoDB successfully updated.');

    // Query using the exact same logic as db-verify-swaps.js to test it
    const localSwaps = await db.collection('transactions')
      .find({
        userAddress: TARGET_USER,
        $or: [
          { "fromToken.address": TARGET_TOKEN },
          { "toToken.address": TARGET_TOKEN }
        ]
      })
      .toArray();

    console.log(`📊 Verified local database queries: Found ${localSwaps.length} swaps.`);
    localSwaps.forEach((s, idx) => {
      console.log(`[Swap #${idx + 1}]`);
      console.log(`   Tx Hash: ${s.transactionHash}`);
      console.log(`   From: ${s.amount} ${s.fromToken.symbol} (${s.fromToken.address})`);
      console.log(`   To: ${s.amountOutDecimal} ${s.toToken.symbol} (${s.toToken.address})`);
      console.log(`   Estimated USD Value: $${s.usdValue.toFixed(2)}`);
    });

  } catch (error) {
    console.error('❌ Error during test run:', error.stack);
  } finally {
    await mongoClient.close();
    console.log('🔌 Connection closed.');
  }
}

main().catch(console.error);
