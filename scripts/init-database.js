
//scripts/init-database.js
require('dotenv').config();

const { MongoClient } = require('mongodb');

async function initDatabase() {
  console.log('🚀 Initializing MongoDB Database for DEX Tracker');
  console.log('='.repeat(60));
  
  const uri = process.env.MONGODB_URI;
  
  if (!uri) {
    console.error('❌ ERROR: MONGODB_URI is not set');
    console.log('\n💡 Create a .env file with:');
    console.log('   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/dex_tracker?retryWrites=true&w=majority');
    console.log('\n💡 Or set it as environment variable:');
    console.log('   export MONGODB_URI="your_connection_string"');
    process.exit(1);
  }

  console.log('🔗 Using connection string:', uri.replace(/\/\/.*@/, '//***@'));
  
  const client = new MongoClient(uri);

  try {
    console.log('\n1️⃣ Connecting to MongoDB...');
    await client.connect();
    console.log('✅ Connected successfully!');
    
    const db = client.db('dex_tracker');
    
    console.log('\n2️⃣ Creating collections...');
    
    // Create transactions collection
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(col => col.name);
    
    if (!collectionNames.includes('transactions')) {
      await db.createCollection('transactions');
      console.log('✅ Created "transactions" collection');
    } else {
      console.log('✅ "transactions" collection already exists');
    }
    
    // Create user_stats collection
    if (!collectionNames.includes('user_stats')) {
      await db.createCollection('user_stats');
      console.log('✅ Created "user_stats" collection');
    } else {
      console.log('✅ "user_stats" collection already exists');
    }
    
    console.log('\n3️⃣ Creating indexes...');
    
    // Indexes for transactions - UPDATED TO MATCH create-indexes.js
    try {
      await db.collection('transactions').createIndexes([
        { key: { transactionHash: 1 }, unique: true, name: 'transactionHash_unique' },
        { key: { userAddress: 1 }, name: 'userAddress_idx' },
        { key: { timestamp: -1 }, name: 'timestamp_desc_idx' },
        { key: { fromChain: 1, toChain: 1 }, name: 'chains_idx' },
        { key: { status: 1, userAddress: 1 }, name: 'status_user_idx' },
      ]);
      console.log('✅ Created indexes for "transactions"');
    } catch (indexError) {
      console.log('ℹ️  Indexes might already exist for "transactions"');
    }
    
    // Indexes for user_stats - UPDATED TO MATCH create-indexes.js
    try {
      await db.collection('user_stats').createIndexes([
        { key: { userAddress: 1 }, unique: true, name: 'userAddress_unique' },
        { key: { optimismTransactions: -1 }, name: 'optimismTx_desc_idx' },
        { key: { totalVolumeUSD: -1 }, name: 'volume_desc_idx' },
        { key: { lastTransaction: -1 }, name: 'lastTx_desc_idx' },
      ]);
      console.log('✅ Created indexes for "user_stats"');
    } catch (indexError) {
      console.log('ℹ️  Indexes might already exist for "user_stats"');
    }
    
    console.log('\n4️⃣ Testing collections...');
    
    // Test insert
    const testTransaction = {
      userAddress: '0x0000000000000000000000000000000000000000',
      transactionHash: '0xtest1234567890123456789012345678901234567890',
      fromChain: 10,
      toChain: 1,
      fromToken: { address: '0x420...', symbol: 'ETH', decimals: 18 },
      toToken: { address: '0xa0b...', symbol: 'USDC', decimals: 6 },
      amount: '1.5',
      usdValue: 4500,
      timestamp: new Date(),
      status: 'completed',
      network: 'optimism',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    await db.collection('transactions').insertOne(testTransaction);
    console.log('✅ Test transaction inserted');
    
    // Test read
    const count = await db.collection('transactions').countDocuments();
    console.log(`✅ "transactions" collection has ${count} document(s)`);
    
    // Cleanup test
    await db.collection('transactions').deleteMany({ 
      userAddress: '0x0000000000000000000000000000000000000000' 
    });
    console.log('✅ Test data cleaned up');
    
    console.log('\n🎉 DATABASE INITIALIZATION COMPLETE!');
    console.log('\n📊 Your database is ready with:');
    console.log('   - "transactions" collection (with indexes)');
    console.log('   - "user_stats" collection (with indexes)');
    console.log('\n🔗 API Endpoints:');
    console.log('   POST /.netlify/functions/track');
    console.log('   GET  /.netlify/functions/stats?address=0x...');
    console.log('   GET  /.netlify/functions/check-eligibility?address=0x...');
    console.log('\n🚀 Next: Deploy to Netlify and start tracking swaps!');
    
  } catch (error) {
    console.error('\n❌ INITIALIZATION FAILED:', error.message);
    console.log('\n🔧 Common issues:');
    console.log('   - Wrong connection string');
    console.log('   - IP not whitelisted in MongoDB Atlas');
    console.log('   - Database user has no permissions');
    console.log('   - Cluster is paused');
    console.log('\n🔍 Full error:', error.stack);
  } finally {
    await client.close();
    console.log('\n🔌 Connection closed.');
  }
}

initDatabase();