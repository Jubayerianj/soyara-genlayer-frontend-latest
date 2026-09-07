
// scripts/test-mongodb.js

require('dotenv').config(); // ADD THIS LINE

const { MongoClient } = require('mongodb');

async function testConnection() {
  console.log('🚀 MongoDB Connection Test');
  console.log('='.repeat(50));
  
  // Get connection string from environment
  const uri = process.env.MONGODB_URI;
  
  if (!uri) {
    console.log('❌ ERROR: MONGODB_URI is not set in .env file');
    console.log('\n💡 Create a .env file in project root with:');
    console.log('MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/dex_tracker?retryWrites=true&w=majority');
    console.log('\n💡 Or set it temporarily:');
    console.log('export MONGODB_URI="your_connection_string"');
    console.log('Then run: npm run test-mongodb');
    process.exit(1);
  }

  console.log('🔗 Connection String:', uri.replace(/\/\/.*@/, '//***@'));
  
  // REMOVED deprecated options
  const client = new MongoClient(uri);
  
  try {
    console.log('\n1️⃣ Connecting to MongoDB Atlas...');
    await client.connect();
    console.log('✅ Connected successfully!');
    
    console.log('\n2️⃣ Pinging database...');
    await client.db().admin().ping();
    console.log('✅ Ping successful!');
    
    console.log('\n3️⃣ Listing databases...');
    const adminDb = client.db().admin();
    const dbs = await adminDb.listDatabases();
    console.log(`✅ Found ${dbs.databases.length} databases`);
    
    dbs.databases.slice(0, 5).forEach(db => { // Show first 5 only
      console.log(`   - ${db.name} (${Math.round(db.sizeOnDisk / 1024 / 1024)} MB)`);
    });
    if (dbs.databases.length > 5) {
      console.log(`   ... and ${dbs.databases.length - 5} more`);
    }
    
    console.log('\n4️⃣ Testing "dex_tracker" database...');
    const db = client.db('dex_tracker');
    
    try {
      console.log('   Creating test collection...');
      await db.collection('test').insertOne({ 
        test: true, 
        timestamp: new Date(),
        message: 'MongoDB connection test'
      });
      console.log('✅ Write test successful!');
      
      const result = await db.collection('test').findOne({ test: true });
      console.log('✅ Read test successful!');
      console.log(`   Test document: ${JSON.stringify(result)}`);
      
      await db.collection('test').deleteOne({ test: true });
      console.log('✅ Cleanup successful!');
      
    } catch (dbError) {
      console.log('⚠️  Database error:', dbError.message);
      console.log('ℹ️  Database might not exist yet, run: npm run init-db');
    }
    
    console.log('\n🎉 CONNECTION TEST PASSED! MongoDB is working!');
    console.log('\n📊 Next steps:');
    console.log('   1. Run: npm run init-db');
    console.log('   2. Deploy to Netlify');
    console.log('   3. Add MONGODB_URI to Netlify environment variables');
    console.log('   4. Test with your swap application');
    
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.log('\n🔧 Troubleshooting:');
    console.log('   1. Check your connection string in .env file');
    console.log('   2. Whitelist your IP in MongoDB Atlas (or add 0.0.0.0/0 temporarily)');
    console.log('   3. Check database user permissions');
    console.log('   4. Ensure cluster is not paused');
    console.log('   5. Verify username/password in connection string');
    console.log('\n📋 Connection string format:');
    console.log('   mongodb+srv://USERNAME:PASSWORD@cluster.mongodb.net/DATABASE?retryWrites=true&w=majority');
  } finally {
    await client.close();
    console.log('\n🔌 Connection closed.');
  }
}

testConnection();