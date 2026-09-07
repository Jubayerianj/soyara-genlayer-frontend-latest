// scripts/create-indexes.js
import { config } from 'dotenv';
import { MongoClient } from 'mongodb';

config();

async function createIndexes() {
  const uri = process.env.MONGODB_URI;
  
  if (!uri) {
    console.error('❌ MONGODB_URI is not set. Please add it to your .env file.');
    process.exit(1);
  }

  console.log('🔗 Connecting to MongoDB...');
  
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    const db = client.db('dex_tracker');
    
    console.log('📊 Checking and creating indexes...\n');
    
    // 1. First, let's see what indexes already exist
    const existingTxIndexes = await db.collection('transactions').indexes();
    const existingUserStatsIndexes = await db.collection('user_stats').indexes();
    
    console.log('📋 Existing indexes in transactions collection:');
    existingTxIndexes.forEach(idx => {
      console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
    });
    
    console.log('\n📋 Existing indexes in user_stats collection:');
    existingUserStatsIndexes.forEach(idx => {
      console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
    });
    
    console.log('\n🎯 Creating missing indexes...\n');
    
    // Define all indexes we need
    const indexesToCreate = [
      {
        collection: 'transactions',
        spec: { transactionHash: 1 },
        options: { unique: true, name: 'transactionHash_unique' }
      },
      {
        collection: 'transactions',
        spec: { userAddress: 1 },
        options: { name: 'userAddress_idx' }
      },
      {
        collection: 'transactions',
        spec: { timestamp: -1 },
        options: { name: 'timestamp_desc_idx' }
      },
      {
        collection: 'transactions',
        spec: { fromChain: 1, toChain: 1 },
        options: { name: 'chains_idx' }
      },
      {
        collection: 'transactions',
        spec: { status: 1, userAddress: 1 },
        options: { name: 'status_user_idx' }
      },
      {
        collection: 'user_stats',
        spec: { userAddress: 1 },
        options: { unique: true, name: 'userAddress_unique' }
      },
      {
        collection: 'user_stats',
        spec: { optimismTransactions: -1 },
        options: { name: 'optimismTx_desc_idx' }
      },
      {
        collection: 'user_stats',
        spec: { lastTransaction: -1 },
        options: { name: 'lastTx_desc_idx' }
      },
      {
        collection: 'user_stats',
        spec: { totalVolumeUSD: -1 },
        options: { name: 'volume_desc_idx' }
      }
    ];
    
    // Function to check if index already exists
    function indexExists(existingIndexes, spec) {
      return existingIndexes.some(idx => {
        return JSON.stringify(idx.key) === JSON.stringify(spec);
      });
    }
    
    // Create indexes that don't exist
    let createdCount = 0;
    let skippedCount = 0;
    
    for (const indexDef of indexesToCreate) {
      const existingIndexes = indexDef.collection === 'transactions' 
        ? existingTxIndexes 
        : existingUserStatsIndexes;
      
      if (indexExists(existingIndexes, indexDef.spec)) {
        console.log(`⏭️  Skipping ${indexDef.collection}.${indexDef.options.name} - already exists`);
        skippedCount++;
      } else {
        try {
          await db.collection(indexDef.collection).createIndex(
            indexDef.spec, 
            indexDef.options
          );
          console.log(`✅ Created ${indexDef.collection}.${indexDef.options.name}`);
          createdCount++;
        } catch (error) {
          console.log(`⚠️  Failed to create ${indexDef.collection}.${indexDef.options.name}: ${error.message}`);
          skippedCount++;
        }
      }
    }
    
    console.log(`\n📊 Summary:`);
    console.log(`✅ Created: ${createdCount} new indexes`);
    console.log(`⏭️  Skipped: ${skippedCount} existing indexes`);
    console.log(`📈 Total indexes ready: ${createdCount + skippedCount}/${indexesToCreate.length}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.close();
    console.log('\n🔒 Connection closed.');
  }
}

createIndexes();