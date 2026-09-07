// End-to-end proof that an ADD_LIQUIDITY actually deposits.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { createAccount } from 'genlayer-js';

const base = fileURLToPath(new URL('../', import.meta.url));
for (const line of fs.readFileSync(base + '.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const ABI = JSON.parse(fs.readFileSync(base + 'abi/AgentExecutor.json', 'utf8'));
const { buildLiquidityV2AddOrder } = await import(base + 'lib/liquidityOrder.js');
const { validateLiquidityV2Add, readVerdict } = await import(base + 'lib/genlayer.js');

const EX = '0x0F1E98571BADd0fF59a34140Fe1e820DaDF907E1';
const USDC = '0x58B6CD7891cd0A682226E25607b958a6479195A6';
const USDT = '0x4B54235778c26Ee8ac27744A53d4c5BC4c9D46fc';
const chain = { id: 4221, name: 'Bradbury', nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc-bradbury.genlayer.com'] }, public: { http: ['https://rpc-bradbury.genlayer.com'] } } };
const pc = createPublicClient({ chain, transport: http('https://rpc-bradbury.genlayer.com') });
const pk = process.env.AGENT_PRIVATE_KEY.startsWith('0x') ? process.env.AGENT_PRIVATE_KEY : `0x${process.env.AGENT_PRIVATE_KEY}`;
const acct = privateKeyToAccount(pk);
const wallet = createWalletClient({ account: acct, chain, transport: http('https://rpc-bradbury.genlayer.com') });
const gl = createAccount(pk);
const ERC20 = [
  { name: 'allowance', type: 'function', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'approve', type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] },
];
const t0 = Date.now(); const el = () => `${((Date.now() - t0) / 1000).toFixed(0)}s`;

// BOTH sides need approving. Only approving side A is what broke this.
for (const [sym, addr] of [['USDC', USDC], ['USDT', USDT]]) {
  const a = await pc.readContract({ address: addr, abi: ERC20, functionName: 'allowance', args: [acct.address, EX] });
  if (a === 0n) {
    console.log(`[${el()}] approving ${sym}...`);
    const h = await wallet.writeContract({ address: addr, abi: ERC20, functionName: 'approve', args: [EX, (1n << 256n) - 1n] });
    await pc.waitForTransactionReceipt({ hash: h });
  }
  console.log(`[${el()}] ${sym} approved`);
}

const built = await buildLiquidityV2AddOrder({
  publicClient: pc, executor: EX, abi: ABI, user: acct.address,
  tokenA: 'USDC', tokenB: 'USDT',            // symbols, as the AI page sends
  amountADesired: '10', amountBDesired: '20', // human, as the AI page sends
  slippageBps: 50,
  deadline: Math.ceil((Math.floor(Date.now() / 1000) + 7200) / 600) * 600,
});
if (!built.ok) { console.log('build failed', built.body); process.exit(1); }
const o = built.order;
console.log(`[${el()}] paired ${o.amountADesired} A / ${o.amountBDesired} B`);
console.log(`[${el()}] commitment ${built.commitment}`);

let v = await validateLiquidityV2Add(o, { account: gl, commitment: built.commitment });
for (let i = 0; i < 4 && !v.approved && v.retryable; i++) v = await validateLiquidityV2Add(o, { account: gl, commitment: built.commitment });
console.log(`[${el()}] round approved=${v.approved} pending=${v.pending}`);

let verdict = v.approved ? { approved: true } : null;
for (let i = 0; i < 20 && !verdict; i++) { await new Promise(r => setTimeout(r, 5000)); verdict = await readVerdict(built.commitment); }
if (!verdict?.approved) { console.log('no approval:', JSON.stringify(verdict)); process.exit(1); }
console.log(`[${el()}] verdict approved`);

const domain = { name: 'SoyaraAgentExecutor', version: '2', chainId: 4221, verifyingContract: EX };
const types = { SettlementVerdict: [{ name: 'commitment', type: 'bytes32' }] };
const signed = [];
for (const k of (process.env.ATTESTOR_PRIVATE_KEYS || '').split(',').filter(Boolean)) {
  const a = privateKeyToAccount(k.trim().startsWith('0x') ? k.trim() : `0x${k.trim()}`);
  signed.push({ address: a.address, signature: await a.signTypedData({ domain, types, primaryType: 'SettlementVerdict', message: { commitment: built.commitment } }) });
}
signed.sort((x, y) => (x.address.toLowerCase() < y.address.toLowerCase() ? -1 : 1));

const hash = await wallet.writeContract({
  address: EX, abi: ABI, functionName: 'executeAddLiquidityV2',
  args: [o.user, o.tokenA, o.tokenB, o.amountADesired, o.amountBDesired, o.amountAMin, o.amountBMin, o.deadline, signed.map(x => x.signature)],
});
const rc = await pc.waitForTransactionReceipt({ hash });
console.log(`[${el()}] DEPOSIT tx ${hash} status=${rc.status}`);
console.log(`\nTOTAL ${((Date.now() - t0) / 1000).toFixed(0)}s`);
