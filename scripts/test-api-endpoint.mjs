/**
 * scripts/test-api-endpoint.mjs
 * 
 * Direct unit test for the pages/api/db-verify-swaps.js handler.
 * Mocks Next.js req/res to test query filters and verify outputs directly from MongoDB.
 */

import dotenv from 'dotenv';

// Load env variables BEFORE importing any code that depends on process.env
dotenv.config();
dotenv.config({ path: '.env.local' });

// Dynamically import the handler after env variables are configured
const { default: handler } = await import('../pages/api/db-verify-swaps.js');

// Mock Next.js Request
const mockReq = {
  method: 'GET',
  query: {
    address: '0x23D542DCEFb00b1f4268E67a0EC1EF4de0A58fe2',
    token: '0xdf69970B2fE416339187aA41D39882e864984CE9', // ZKUSDC
    minSwaps: '3',
    limit: '5'
  }
};

// Mock Next.js Response
const mockRes = {
  headers: {},
  statusCode: 200,
  setHeader(name, value) {
    this.headers[name] = value;
  },
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(data) {
    console.log('\n=======================================');
    console.log('HTTP STATUS CODE:', this.statusCode);
    console.log('RESPONSE PAYLOAD:');
    console.log(JSON.stringify(data, null, 2));
    console.log('=======================================');
    process.exit(0);
  }
};

async function runTest() {
  console.log('🏁 Calling /api/db-verify-swaps handler mock...');
  try {
    await handler(mockReq, mockRes);
  } catch (err) {
    console.error('❌ API Handler crashed:', err);
    process.exit(1);
  }
}

runTest();
