// check-env.js
const dotenv = require('dotenv');
const path = require('path');

// Try to load .env.local
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

console.log('🔍 Environment Check');
console.log('='.repeat(40));

console.log('\n1️⃣ Checking .env.local file...');
try {
  const fs = require('fs');
  const envPath = path.resolve(__dirname, '.env.local');
  
  if (fs.existsSync(envPath)) {
    console.log('✅ .env.local exists');
    const content = fs.readFileSync(envPath, 'utf8');
    const hasMongoURI = content.includes('MONGODB_URI');
    console.log('✅ Contains MONGODB_URI:', hasMongoURI);
    
    if (hasMongoURI) {
      // Extract just to show first part
      const match = content.match(/MONGODB_URI=(.*)/);
      if (match) {
        const uri = match[1];
        console.log('📋 URI starts with:', uri.substring(0, 30) + '...');
      }
    }
  } else {
    console.log('❌ .env.local does not exist');
  }
} catch (error) {
  console.log('❌ Error reading .env.local:', error.message);
}

console.log('\n2️⃣ Checking process.env...');
console.log('MONGODB_URI is set:', !!process.env.MONGODB_URI);
if (process.env.MONGODB_URI) {
  console.log('URI length:', process.env.MONGODB_URI.length);
  console.log('URI type:', typeof process.env.MONGODB_URI);
}

console.log('\n3️⃣ Next steps:');
console.log('1. Create .env.local file in project root');
console.log('2. Add: MONGODB_URI=your_mongodb_connection_string');
console.log('3. Restart terminal or run: source .env.local');
console.log('4. Run: node check-env.js again');