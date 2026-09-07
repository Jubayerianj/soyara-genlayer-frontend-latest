import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const envConfig = dotenv.parse(fs.readFileSync(envPath));
  for (const k in envConfig) {
    process.env[k] = envConfig[k];
  }
}

import handler from '../pages/api/agent-v2.js';

const testPrompts = [
  {
    name: '1. Swap Quote Prompt',
    message: 'Swap 100 USDC to GEN with best route',
    history: []
  },
  {
    name: '2. Route Comparison Prompt',
    message: 'Compare V2 vs V3 for 50 WGEN to USDT',
    history: []
  },
  {
    name: '3. GenLayer Intelligent Contracts Inquiry',
    message: 'How do GenLayer Intelligent Contracts protect my trades?',
    history: []
  },
  {
    name: '4. Liquidity Provision Prompt',
    message: 'Add liquidity 10 GEN and 200 USDC',
    history: []
  },
  {
    name: '5. Token Prices / Registry Query',
    message: 'What tokens are supported on GenLayer?',
    history: []
  },
  {
    name: '6. Slippage / Security Policy',
    message: 'What is the slippage protection policy?',
    history: []
  },
  {
    name: '7. Multi-Turn Conversation (Follow-up)',
    message: 'Can you change that to 250 USDC and use V3 concentrated route?',
    history: [
      { role: 'user', content: 'Swap 100 USDC to GEN with best route' },
      { role: 'assistant', content: 'I have prepared a proposal to swap 100 USDC for 199.9 GEN.' }
    ]
  }
];

function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(key, value) {
      this.headers[key] = value;
      return this;
    },
    json(data) {
      this.jsonData = data;
      return this;
    }
  };
  return res;
}

async function runTests() {
  console.log('=====================================================');
  console.log('🚀 TESTING /AI CONVERSATION WITH GEMINI API KEY');
  console.log('=====================================================');
  console.log('GEMINI_API_KEY Present:', Boolean(process.env.GEMINI_API_KEY));
  console.log('GEMINI_API_KEY Prefix:', (process.env.GEMINI_API_KEY || '').slice(0, 10) + '...\n');

  let passed = 0;
  let failed = 0;

  for (const t of testPrompts) {
    console.log(`-----------------------------------------------------`);
    console.log(`🧪 Test: ${t.name}`);
    console.log(`💬 User: "${t.message}"`);
    if (t.history.length > 0) {
      console.log(`📜 History items: ${t.history.length}`);
    }

    const req = {
      method: 'POST',
      body: {
        message: t.message,
        history: t.history
      }
    };
    const res = createMockRes();

    try {
      const startTime = Date.now();
      await handler(req, res);
      const elapsed = Date.now() - startTime;

      console.log(`⏱️ Response time: ${elapsed}ms | HTTP Status: ${res.statusCode}`);
      const data = res.jsonData;

      if (!data) {
        console.error('❌ FAIL: No response data returned');
        failed++;
        continue;
      }

      console.log(`🤖 Reply snippet:`);
      const replyPreview = data.reply ? data.reply.split('\n').slice(0, 4).join('\n') : '(empty)';
      console.log(replyPreview);

      console.log(`🛠️ Tools Used:`, data.toolsUsed || []);
      if (data.proposal) {
        console.log(`📋 Proposal Generated:`, {
          action: data.proposal.action,
          tokenIn: data.proposal.tokenIn,
          tokenOut: data.proposal.tokenOut,
          amountIn: data.proposal.amountIn,
          expectedOutput: data.proposal.expectedOutput,
          route: data.proposal.route,
          genlayerContract: data.proposal.genlayerContract
        });
      } else {
        console.log(`📋 Proposal: None (Informational / Discussion response)`);
      }

      if (res.statusCode === 200 && data.reply) {
        console.log('✅ PASS');
        passed++;
      } else {
        console.log('❌ FAIL');
        failed++;
      }
    } catch (err) {
      console.error('❌ EXCEPTION:', err);
      failed++;
    }
  }

  console.log('\n=====================================================');
  console.log(`🏁 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED (Total: ${testPrompts.length})`);
  console.log('=====================================================');
}

runTests();
