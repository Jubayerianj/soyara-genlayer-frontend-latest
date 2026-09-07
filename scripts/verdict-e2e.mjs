// End-to-end proof: does a GenLayer consensus round actually place a verdict
// on AgentExecutor? This is the one thing that cannot be tested locally.
import { createPublicClient, http } from 'viem';
import { createAccount, chains } from 'genlayer-js';
import fs from 'node:fs';
import ABI from '../abi/AgentExecutor.json' with { type: 'json' };
import { buildSwapOrder } from '../lib/swapOrder.js';
import { validateSwapOrder } from '../lib/genlayer.js';

const EXECUTOR = '0x0F1E98571BADd0fF59a34140Fe1e820DaDF907E1';
const chain = {
  id: 4221, name: 'GenLayer Bradbury Testnet',
  nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc-bradbury.genlayer.com'] }, public: { http: ['https://rpc-bradbury.genlayer.com'] } },
};
const publicClient = createPublicClient({ chain, transport: http('https://rpc-bradbury.genlayer.com') });

const env = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const pk = env.match(/^AGENT_PRIVATE_KEY=(.*)$/m)[1].trim().replace(/["']/g, '');
const account = createAccount(pk.startsWith('0x') ? pk : `0x${pk}`);

const USDC = '0x58B6CD7891cd0A682226E25607b958a6479195A6';
const WGEN = '0x315374AA9b5536037Cc1Efeea2439CCC0913A77e';

console.log('1. Building the order from live pool state...');
const built = await buildSwapOrder({
  publicClient, executor: EXECUTOR, abi: ABI,
  user: account.address,
  tokenIn: WGEN, tokenOut: USDC,
  amountIn: 1000000000000000n,          // 0.001 WGEN
  slippageBps: 100,
  deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
});
if (!built.ok) { console.log('   FAILED:', JSON.stringify(built.body)); process.exit(1); }
const { order, aggProgram, commitment } = built;
console.log('   route     :', aggProgram);
console.log('   quoted    :', order.quotedAmountOut.toString());
console.log('   minOut    :', order.minAmountOut.toString());
console.log('   commitment:', commitment);

const live0 = await publicClient.readContract({ address: EXECUTOR, abi: ABI, functionName: 'isVerdictLive', args: [commitment] });
console.log('2. isVerdictLive BEFORE the round:', live0, '(must be false)');

console.log('3. Running validate_swap consensus round...');
const v = await validateSwapOrder({ ...order, aggProgram }, { account });
console.log('   txHash  :', v.txHash);
console.log('   approved:', v.approved, '| pending:', v.pending, '| reason:', (v.reason || '').slice(0, 160));
fs.writeFileSync(new URL('../e2e-state.json', import.meta.url), JSON.stringify({
  commitment, txHash: v.txHash,
  order: Object.fromEntries(Object.entries(order).map(([k, x]) => [k, typeof x === 'bigint' ? x.toString() : x])),
  aggProgram,
}, null, 2));
console.log('   state written to e2e-state.json');
