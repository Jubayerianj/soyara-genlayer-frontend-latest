require('dotenv').config();
const fetch = require('node-fetch');

async function diagnose() {
  console.log('🔍 Running diagnostics...\n');
  
  // 1. Check environment
  console.log('1️⃣ Environment check:');
  console.log('  MONGODB_URI:', process.env.MONGODB_URI ? '✅ Set' : '❌ Not set');
  
  // 2. Test MongoDB connection
  console.log('\n2️⃣ MongoDB connection test:');
  try {
    const { MongoClient } = require('mongodb');
    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    const db = client.db('dex_tracker');
    await db.command({ ping: 1 });
    console.log('  ✅ MongoDB connection successful');
    
    // Check collections
    const collections = await db.listCollections().toArray();
    console.log('  📂 Collections:', collections.map(c => c.name));
    
    // Count documents
    const txCount = await db.collection('transactions').countDocuments();
    const userCount = await db.collection('user_stats').countDocuments();
    console.log(`  📊 Documents: ${txCount} transactions, ${userCount} users`);
    
    await client.close();
  } catch (error) {
    console.log('  ❌ MongoDB error:', error.message);
  }
  
  // 3. Try multiple ports for Netlify functions
  console.log('\n3️⃣ Testing Netlify functions:');
  const ports = [8888, 3000, 3001, 3002];
  
  for (const port of ports) {
    console.log(`  Trying port ${port}...`);
    try {
      const testData = {
        address: '0x1234567890123456789012345678901234567890',
        transactionHash: '0xtest' + Date.now(),
        fromChain: 10,
        toChain: 1,
        amount: '1.5',
        usdValue: 4500
      };
      
      const response = await fetch(`http://localhost:${port}/.netlify/functions/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testData)
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log(`  ✅ Port ${port} works!`);
        console.log('  Result:', result);
        break;
      }
    } catch (error) {
      console.log(`  ❌ Port ${port} failed:`, error.message);
    }
  }
}

diagnose();