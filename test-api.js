// test-api.js - UPDATED VERSION
const fetch = require('node-fetch');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

async function testAllAPIs() {
  console.log('🚀 Testing API Endpoints');
  console.log('='.repeat(50));
  
  const testAddress = '0x1234567890123456789012345678901234567890';
  const testHash = '0xtest' + Date.now().toString(16);
  
  // Test 1: Check if API server is running
  console.log('\n1️⃣ Testing API server...');
  try {
    const healthResponse = await fetch('http://localhost:3000/api/track', {
      method: 'OPTIONS'
    });
    console.log('✅ API server is running (OPTIONS request)');
  } catch (error) {
    console.error('❌ API server not responding:', error.message);
    console.log('💡 Make sure you run: npm run dev');
    process.exit(1);
  }
  
  // Test 2: Test track API
  console.log('\n2️⃣ Testing /api/track...');
  const testData = {
    address: testAddress,
    transactionHash: testHash,
    fromChain: 10,
    toChain: 1,
    amount: "1.5",
    usdValue: 4500,
    fromToken: {
      address: '0x315374AA9b5536037Cc1Efeea2439CCC0913A77e',
      symbol: 'ETH',
      decimals: 18
    },
    toToken: {
      address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      symbol: 'USDC',
      decimals: 6
    }
  };
  
  try {
    const trackResponse = await fetch('http://localhost:3000/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testData)
    });
    
    const trackResult = await trackResponse.json();
    console.log(`✅ /api/track response: ${trackResponse.status}`);
    console.log('Result:', trackResult);
    
    if (trackResult.success) {
      console.log('🎉 Transaction would be saved to MongoDB!');
    }
  } catch (error) {
    console.error('❌ /api/track failed:', error.message);
  }
  
  // Test 3: Test stats API
  console.log('\n3️⃣ Testing /api/stats...');
  try {
    const statsResponse = await fetch(`http://localhost:3000/api/stats?address=${testAddress}`);
    const statsResult = await statsResponse.json();
    console.log(`✅ /api/stats response: ${statsResponse.status}`);
    console.log('Stats:', statsResult);
  } catch (error) {
    console.error('❌ /api/stats failed:', error.message);
  }
  
  // Test 4: Test MongoDB connection directly
  console.log('\n4️⃣ Testing MongoDB connection...');
  try {
    const { MongoClient } = require('mongodb');
    
    // Get URI from environment
    const uri = process.env.MONGODB_URI;
    
    console.log('🔗 Checking MONGODB_URI...');
    console.log('URI present:', !!uri);
    if (uri) {
      console.log('URI starts with:', uri.substring(0, 20) + '...');
    }
    
    if (!uri) {
      console.error('❌ MONGODB_URI not set in environment');
      console.log('\n💡 Your .env.local file should contain:');
      console.log('MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/dex_tracker?retryWrites=true&w=majority');
      console.log('\n💡 Or set it temporarily:');
      console.log('export MONGODB_URI="your_connection_string"');
      console.log('Then run: node test-api.js');
      process.exit(1);
    }
    
    console.log('🔗 Connecting to MongoDB...');
    const client = new MongoClient(uri);
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db('dex_tracker');
    const collections = await db.listCollections().toArray();
    console.log('📊 Collections found:', collections.map(c => c.name));
    
    // Test if we can write
    const testCollection = db.collection('test_connection');
    await testCollection.insertOne({ 
      test: true, 
      timestamp: new Date(),
      message: 'Test connection from script'
    });
    console.log('✅ Write test successful');
    
    // Clean up
    await testCollection.deleteMany({ test: true });
    console.log('✅ Cleanup successful');
    
    await client.close();
    console.log('🔌 MongoDB connection closed');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Check your connection string format');
    console.log('2. Make sure your IP is whitelisted in MongoDB Atlas');
    console.log('3. Check if cluster is paused');
    console.log('4. Verify username/password');
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('📋 SUMMARY:');
  
  // Test environment
  console.log('\n🔍 Environment Check:');
  console.log('- MONGODB_URI set:', !!process.env.MONGODB_URI);
  console.log('- Next.js API running: Yes (tested)');
  
  console.log('\n🎯 Next steps:');
  console.log('1. Update /lib/mongodb.js with new syntax');
  console.log('2. Restart Next.js dev server: npm run dev');
  console.log('3. Run this test again');
}

// Run tests
testAllAPIs();