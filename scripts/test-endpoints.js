// scripts/test-endpoints.js
require('dotenv').config();

async function testEndpoints() {
  console.log('🧪 Testing Netlify Functions...');
  
  const testData = {
    address: '0x1234567890123456789012345678901234567890',
    transactionHash: '0x' + Math.random().toString(36).substring(2, 42),
    fromChain: 10,
    toChain: 1,
    fromToken: { address: '0x420...', symbol: 'ETH', decimals: 18 },
    toToken: { address: '0xa0b...', symbol: 'USDC', decimals: 6 },
    amount: '1.5',
    usdValue: 4500,
    status: 'completed',
    network: 'optimism',
    timestamp: new Date().toISOString()
  };

  try {
    // Test debug endpoint
    console.log('\n1️⃣ Testing debug endpoint...');
    const debugRes = await fetch('http://localhost:8888/.netlify/functions/debug-track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testData)
    });
    console.log('Debug response:', await debugRes.json());

    // Test track endpoint
    console.log('\n2️⃣ Testing track endpoint...');
    const trackRes = await fetch('http://localhost:8888/.netlify/functions/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testData)
    });
    console.log('Track response:', await trackRes.json());

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testEndpoints();