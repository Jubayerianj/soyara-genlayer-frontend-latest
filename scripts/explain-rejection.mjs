import { createClient, chains } from 'genlayer-js';
import fs from 'node:fs';
const st = JSON.parse(fs.readFileSync(new URL('../e2e-state.json', import.meta.url), 'utf8'));
const o = st.order;
const client = createClient({ chain: chains.testnetBradbury });
const args = [
  String(o.user), String(o.tokenIn), String(o.tokenOut),
  String(o.amountIn), String(o.minAmountOut), String(o.quotedAmountOut),
  parseInt(o.slippageBps, 10), parseInt(o.deadline, 10),
  String(o.router), parseInt(o.feeBps, 10), String(o.feeCollector),
  String(st.aggProgram), parseInt(o.nonce, 10),
];
console.log('simulating validate_swap with the exact order that was rejected...');
try {
  const r = await client.readContract({
    address: '0x001E00a816fa93bC2cA07587d929Aa98C31051DD',
    functionName: 'validate_swap',
    args,
  });
  console.log(JSON.stringify(r, null, 2));
} catch (e) {
  console.log('simulation error:', (e.shortMessage || e.message || '').slice(0, 500));
}
