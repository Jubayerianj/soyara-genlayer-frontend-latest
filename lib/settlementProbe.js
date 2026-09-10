// lib/settlementProbe.js
//
// Ask the DEPLOYED settlement contract what it would do, without spending gas
// or opening a consensus round.
//
// WHY THIS EXISTS
// ---------------
// The /a2a developer page used to carry a "verification suite" whose checks
// hashed parameters in JavaScript, deleted a key from an object to "prove"
// replay protection, and reported PASSED whatever happened. It described a
// design the executor no longer has (an agent-written approval that reverted
// with TradeNotApproved), and one of its checks opened a real consensus round
// every time someone clicked it.
//
// Everything here is an `eth_call` against the executor on Bradbury, from the
// address that would really send the transaction. The contract answers, and
// the answer is reported as it comes back - a revert name and its arguments,
// or the fact that the call would have gone through.
//
// The ABI is passed in rather than imported, so the same probes run in the
// browser (where the app bundles abi/AgentExecutor.json) and in plain Node
// scripts (which read it from disk).

import { createPublicClient, http, keccak256, BaseError, ContractFunctionRevertedError } from 'viem';

export const RPC_URL = 'https://rpc-bradbury.genlayer.com';

const CHAIN = {
  id: 4221,
  name: 'GenLayer Bradbury',
  nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] }, public: { http: [RPC_URL] } },
};

let _client = null;
export function probeClient() {
  if (!_client) _client = createPublicClient({ chain: CHAIN, transport: http(RPC_URL) });
  return _client;
}

/** A 49-byte single-hop program shape, used only so a probe order has route bytes to hash. */
export const SAMPLE_PROGRAM = '0x02' + '58b6cd7891cd0a682226e25607b958a6479195a6' + '01ffff00'
  + '55a5ff46cfb55dcf05d236a0fdde5a0c866b64be' + '00000bb8';

/**
 * A well-formed SwapOrder that passes every parameter check in `executeSwap`,
 * so a probe reaches the verdict check instead of stopping at an earlier guard.
 * Nothing has approved it; that is the point.
 */
export function sampleOrder({ addresses, user = '0x3333333333333333333333333333333333333333', overrides = {} }) {
  const quoted = 1_000_000_000_000_000_000n;
  const slippage = 30n;
  return {
    user,
    tokenIn: '0x58B6CD7891cd0A682226E25607b958a6479195A6',  // USDC
    tokenOut: '0x4B54235778c26Ee8ac27744A53d4c5BC4c9D46fc', // USDT
    amountIn: 1_000_000_000_000_000_000n,
    minAmountOut: (quoted * (10_000n - slippage)) / 10_000n,
    quotedAmountOut: quoted,
    slippageBps: slippage,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
    router: addresses.aggregatorEntrypoint,
    feeBps: 5n,
    feeCollector: addresses.dexFeeVault,
    routeHash: keccak256(SAMPLE_PROGRAM),
    nonce: 1n,
    ...overrides,
  };
}

/** Pull a custom error's name and arguments out of a viem call failure. */
export function revertOf(err) {
  if (err instanceof BaseError) {
    const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (reverted) {
      return {
        name: reverted.data?.errorName || reverted.reason || 'reverted',
        args: reverted.data?.args || [],
      };
    }
  }
  const text = `${err?.shortMessage || ''} ${err?.message || ''}`;
  const named = text.match(/(?:reverted with the following (?:signature|reason):\s*)?([A-Z][A-Za-z0-9]+)\(/);
  return { name: named ? named[1] : (err?.shortMessage || 'call failed'), args: [] };
}

/**
 * Simulate one executor call from `from`.
 *
 * @returns `{ wouldSucceed: true }` or `{ wouldSucceed: false, error, args }`
 */
export async function probe({ client = probeClient(), abi, executor, from, functionName, args, value }) {
  try {
    await client.simulateContract({ account: from, address: executor, abi, functionName, args, value });
    return { wouldSucceed: true, error: null, args: [] };
  } catch (err) {
    const r = revertOf(err);
    return { wouldSucceed: false, error: r.name, args: r.args };
  }
}

/** The executor's own view of an order: the commitment it would demand a verdict for. */
export async function deriveCommitment({ client = probeClient(), abi, executor, order }) {
  return client.readContract({ address: executor, abi, functionName: 'getSwapCommitment', args: [order] });
}

/** Who may relay settlements, and which contract may write verdicts. */
export async function readRoles({ client = probeClient(), abi, executor }) {
  const [agent, validator, maxSlippageBps, paused] = await Promise.all([
    client.readContract({ address: executor, abi, functionName: 'authorisedAgent' }),
    client.readContract({ address: executor, abi, functionName: 'genLayerValidator' }),
    client.readContract({ address: executor, abi, functionName: 'maxSlippageBps' }),
    client.readContract({ address: executor, abi, functionName: 'paused' }),
  ]);
  return { agent, validator, maxSlippageBps, paused };
}
