// lib/attest.js
//
// Turning a recorded consensus verdict into signatures the executor accepts.
//
// See pages/api/attest.js for the reasoning. In short: a consensus round decides
// in about twenty seconds, but its verdict only reaches the executor once the
// appeal window closes, roughly forty minutes later. The verdict is readable
// from the Intelligent Contract immediately, so attestors read it there and sign
// the same commitment; the executor verifies the quorum on chain.
//
// This module is the single place the attestor keys are used, so the settlement
// route and the signing endpoint cannot drift apart on the gate that matters:
// nothing is signed unless the IC has recorded an approval for that exact
// commitment.

import { createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import AGENT_EXECUTOR_ABI from '../abi/AgentExecutor.json';
import { CONTRACT_ADDRESSES } from '../constants/addresses.js';
import { readVerdict } from './genlayer.js';

const chain = {
  id: 4221,
  name: 'GenLayer Bradbury Testnet',
  nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc-bradbury.genlayer.com'] },
    public: { http: ['https://rpc-bradbury.genlayer.com'] },
  },
};

export function attestorAccounts() {
  return (process.env.ATTESTOR_PRIVATE_KEYS || '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean)
    .map((k) => privateKeyToAccount(k.startsWith('0x') ? k : `0x${k}`));
}

/**
 * Signatures for `commitment`, or a reason there are none.
 *
 * @returns `{ ok: true, attestations, attestors, threshold }`
 *          or `{ ok: false, pending, status, error }`
 */
export async function gatherAttestations(commitment) {
  if (!commitment || !/^0x[0-9a-fA-F]{64}$/.test(commitment)) {
    return { ok: false, status: 400, error: 'A 32-byte commitment is required' };
  }

  const executor = CONTRACT_ADDRESSES[4221]?.agentExecutor;
  if (!executor) return { ok: false, status: 503, error: 'AgentExecutor not configured' };

  const accounts = attestorAccounts();
  if (accounts.length === 0) {
    return {
      ok: false,
      status: 503,
      error: 'No attestor keys configured; settlement must wait for the consensus verdict to finalise.',
    };
  }

  const publicClient = createPublicClient({ chain, transport: http('https://rpc-bradbury.genlayer.com') });

  const threshold = await publicClient.readContract({
    address: executor, abi: AGENT_EXECUTOR_ABI, functionName: 'attestorThreshold', args: [],
  });
  if (Number(threshold) === 0) {
    return { ok: false, status: 409, error: 'The attestation rail is switched off on the executor.' };
  }
  if (accounts.length < Number(threshold)) {
    return {
      ok: false,
      status: 503,
      error: `Only ${accounts.length} attestor key(s) configured but the executor requires ${threshold}.`,
    };
  }

  // THE GATE: never sign what the validators have not approved.
  const verdict = await readVerdict(commitment);
  if (!verdict) {
    return {
      ok: false,
      pending: true,
      status: 409,
      error: 'No verdict recorded for this commitment yet; the consensus round has not decided.',
    };
  }
  if (!verdict.approved) {
    return { ok: false, status: 403, error: `GenLayer consensus refused this trade: ${verdict.reason}` };
  }

  const domain = { name: 'SoyaraAgentExecutor', version: '2', chainId: 4221, verifyingContract: executor };
  const types = { SettlementVerdict: [{ name: 'commitment', type: 'bytes32' }] };

  const signed = [];
  for (const account of accounts) {
    signed.push({
      address: account.address,
      signature: await account.signTypedData({ domain, types, primaryType: 'SettlementVerdict', message: { commitment } }),
    });
  }

  // Strictly increasing signer addresses: how the executor rejects one attestor
  // signing twice to manufacture a quorum, in a single pass.
  signed.sort((a, b) => (a.address.toLowerCase() < b.address.toLowerCase() ? -1 : 1));

  return {
    ok: true,
    threshold: Number(threshold),
    attestors: signed.map((s) => s.address),
    attestations: signed.map((s) => s.signature),
    verdictReason: verdict.reason,
  };
}
