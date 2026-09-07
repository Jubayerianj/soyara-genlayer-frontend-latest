// Proves the latency claim: consensus decides in seconds, attestors vouch for
// what it decided, and the executor verifies their quorum on chain. No appeal
// window in the settlement path.
import fs from 'node:fs';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { createAccount } from 'genlayer-js';

const envText = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}

const ABI = JSON.parse(fs.readFileSync(new URL('../abi/AgentExecutor.json', import.meta.url), 'utf8'));
const { buildSwapOrder } = await import('../lib/swapOrder.js');
const { validateSwapOrder } = await import('../lib/genlayer.js');
const { readVerdict } = await import('../lib/genlayer.js');

// Signing inlined rather than imported from lib/attest.js: that module imports
// the ABI as JSON, which Next resolves and bare Node ESM does not. The on-chain
// path being proved here is identical.
async function gatherAttestations(commitment) {
  const keys = (process.env.ATTESTOR_PRIVATE_KEYS || '').split(',').map(k => k.trim()).filter(Boolean);
  if (!keys.length) return { ok: false, error: 'no attestor keys configured' };
  const verdict = await readVerdict(commitment);
  if (!verdict) return { ok: false, error: 'no verdict recorded yet' };
  if (!verdict.approved) return { ok: false, error: `consensus refused: ${verdict.reason}` };
  const domain = { name: 'SoyaraAgentExecutor', version: '2', chainId: 4221, verifyingContract: EXECUTOR };
  const types = { SettlementVerdict: [{ name: 'commitment', type: 'bytes32' }] };
  const signed = [];
  for (const k of keys) {
    const a = privateKeyToAccount(k.startsWith('0x') ? k : `0x${k}`);
    signed.push({ address: a.address, signature: await a.signTypedData({ domain, types, primaryType: 'SettlementVerdict', message: { commitment } }) });
  }
  signed.sort((x, y) => (x.address.toLowerCase() < y.address.toLowerCase() ? -1 : 1));
  return { ok: true, threshold: keys.length, attestors: signed.map(x => x.address), attestations: signed.map(x => x.signature) };
}

const EXECUTOR = '0x0F1E98571BADd0fF59a34140Fe1e820DaDF907E1';
const chain = { id: 4221, name: 'GenLayer Bradbury Testnet',
  nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc-bradbury.genlayer.com'] }, public: { http: ['https://rpc-bradbury.genlayer.com'] } } };
const pc = createPublicClient({ chain, transport: http('https://rpc-bradbury.genlayer.com') });

const pk = process.env.AGENT_PRIVATE_KEY.startsWith('0x') ? process.env.AGENT_PRIVATE_KEY : `0x${process.env.AGENT_PRIVATE_KEY}`;
const agent = privateKeyToAccount(pk);
const wallet = createWalletClient({ account: agent, chain, transport: http('https://rpc-bradbury.genlayer.com') });
const glAccount = createAccount(pk);

// A fresh executor deployment means a fresh allowance. This is the one thing in
// the whole flow that needs the user, which is why the UI now asks for it while
// the consensus round runs rather than at the end.
const ERC20 = [
  { name: 'allowance', type: 'function', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'approve', type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] },
];
const WGEN_ADDR = '0x315374AA9b5536037Cc1Efeea2439CCC0913A77e';
const allowance = await pc.readContract({ address: WGEN_ADDR, abi: ERC20, functionName: 'allowance', args: [agent.address, EXECUTOR] });
if (allowance === 0n) {
  console.log('approving the executor once...');
  const ah = await wallet.writeContract({ address: WGEN_ADDR, abi: ERC20, functionName: 'approve', args: [EXECUTOR, (1n << 256n) - 1n] });
  await pc.waitForTransactionReceipt({ hash: ah });
  console.log('approved:', ah);
}

const t0 = Date.now();
const el = () => `${((Date.now() - t0) / 1000).toFixed(0)}s`;

console.log(`[${el()}] quoting...`);
const built = await buildSwapOrder({
  publicClient: pc, executor: EXECUTOR, abi: ABI,
  user: agent.address,
  tokenIn: '0x315374AA9b5536037Cc1Efeea2439CCC0913A77e',
  tokenOut: '0x58B6CD7891cd0A682226E25607b958a6479195A6',
  amountIn: 200000000000000n, slippageBps: 100,
  // Quantised to a 10 minute boundary so an identical intent produces an
  // identical commitment. That is what lets a repeat reuse the verdict already
  // on record instead of paying for another consensus round.
  deadline: BigInt(Math.ceil((Math.floor(Date.now() / 1000) + 7200) / 600) * 600),
});
if (!built.ok) { console.log('quote failed', built.body); process.exit(1); }
const { order, aggProgram, commitment } = built;
console.log(`[${el()}] commitment ${commitment}`);

console.log(`[${el()}] running consensus round...`);
let v = await validateSwapOrder({ ...order, aggProgram }, { account: glAccount, commitment });
console.log(`[${el()}] round ${v.txHash?.slice(0, 12)}... approved=${v.approved} pending=${v.pending}`);
// A round that ends without a majority is a validator-set condition, not a
// verdict. Run one more rather than reporting a false refusal.
for (let r = 0; r < 3 && !v.approved && v.retryable; r++) {
  console.log(`[${el()}] round ended undecided (${v.reason?.slice(0, 40)}...), running a fresh one`);
  v = await validateSwapOrder({ ...order, aggProgram }, { account: glAccount, commitment });
  console.log(`[${el()}] round ${v.txHash?.slice(0, 12)}... approved=${v.approved}`);
}
if (!v.approved && !v.pending) { console.log('   reason:', v.reason); process.exit(1); }

console.log(`[${el()}] gathering attestations...`);
let att = null;
for (let i = 0; i < 20; i++) {
  att = await gatherAttestations(commitment);
  if (att.ok) break;
  console.log(`[${el()}]   not yet: ${att.error?.slice(0, 70)}`);
  await new Promise(r => setTimeout(r, 6000));
}
if (!att?.ok) { console.log('no attestations:', att?.error); process.exit(1); }
console.log(`[${el()}] got ${att.attestations.length} of ${att.threshold} required from ${att.attestors.join(', ')}`);

console.log(`[${el()}] settling with the attestor quorum...`);
const hash = await wallet.writeContract({
  address: EXECUTOR, abi: ABI, functionName: 'executeSwap',
  args: [order, aggProgram, att.attestations],
});
const rc = await pc.waitForTransactionReceipt({ hash });
console.log(`[${el()}] settlement tx ${hash} status=${rc.status}`);
const used = await pc.readContract({ address: EXECUTOR, abi: ABI, functionName: 'commitmentUsed', args: [commitment] });
console.log(`[${el()}] commitmentUsed=${used}`);
console.log(`\nTOTAL: ${((Date.now() - t0) / 1000).toFixed(0)} seconds (was ~40 minutes)`);
