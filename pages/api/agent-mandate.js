// pages/api/agent-mandate.js
//
// Issue or look up a TRADING MANDATE - the thing that makes agentic settlement
// take seconds instead of the appeal window.
//
// WHY A MANDATE
// -------------
// A per-order verdict cannot be fast. It reaches AgentExecutor as an EVM-bound
// external message, and those are delivered only when the round finalizes:
// GenVM's `EthSend` emission carries address, calldata, value and fees and no
// delivery-timing field, while `PostMessage` and `DeployContract` both take
// `on` ("accepted" | "finalized"). An Intelligent Contract therefore cannot ask
// for anything sooner, and on Bradbury that is 15-25 minutes in front of every
// single trade.
//
// A mandate pays that once. The consensus round verifies the pool against the
// V2 factory, reads its live reserves, refuses an illiquid pool or a cap large
// enough to move the price, builds the route program itself, and hands the
// executor a bounded authority. Afterwards each trade is one EVM transaction.
//
// WHAT IS STILL BOUND, WHICH IS THE REVIEW'S ACTUAL REQUEST
// ---------------------------------------------------------
//   route  keccak256(aggProgram) must equal the mandate's routeHash, and that
//          hash was derived by the validators from the verified pool
//   fee    capped, and the collector is fixed in the mandate
//   user   output can only reach the mandate's user
//   quote  NOT bound as a number - the executor reads the pinned pool's live
//          reserves at settlement and derives the expected output itself, so
//          there is nothing to go stale and no supplied figure to trust
//
// Call this EARLY - at wallet connect, or as soon as a user shows intent - so
// the one wait is behind them before they ask to trade.

import { createPublicClient, http, keccak256, encodeAbiParameters, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import AGENT_EXECUTOR_ABI from '../../abi/AgentExecutor.json';
import { CONTRACT_ADDRESSES } from '../../constants/addresses.js';
import { issueTradingMandate, finalizeRound } from '../../lib/genlayer.js';

const RPC = 'https://rpc-bradbury.genlayer.com';
const CHAIN = {
  id: 4221,
  name: 'GenLayer Testnet',
  nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
  rpcUrls: { default: { http: [RPC] }, public: { http: [RPC] } },
};

// A mandate is a bounded authority, so its defaults are deliberately modest.
// They are ceilings the consensus round enforces, not suggestions.
const DEFAULT_TTL_SECONDS   = 24 * 60 * 60; // a day
const DEFAULT_MAX_SLIPPAGE  = 100;          // 1%
const DEFAULT_FEE_BPS       = 5;            // the platform fee

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    user, tokenIn, tokenOut,
    maxAmountIn, totalBudgetIn,
    maxSlippageBps = DEFAULT_MAX_SLIPPAGE,
    ttlSeconds = DEFAULT_TTL_SECONDS,
    nonce = Math.floor(Date.now() / 1000),
    checkOnly = false,
    mandateId: lookupMandateId = null,
  } = req.body || {};

  const addresses = CONTRACT_ADDRESSES[4221] || {};
  const executor = addresses.agentExecutor;
  if (!executor) return res.status(500).json({ error: 'No executor configured for chain 4221.' });

  const publicClient = createPublicClient({ chain: CHAIN, transport: http(RPC) });

  // ── A live mandate is the whole point: check before spending a round ──────
  if (lookupMandateId) {
    try {
      const [live, m] = await Promise.all([
        publicClient.readContract({ address: executor, abi: AGENT_EXECUTOR_ABI, functionName: 'isMandateLive', args: [lookupMandateId] }),
        publicClient.readContract({ address: executor, abi: AGENT_EXECUTOR_ABI, functionName: 'mandates', args: [lookupMandateId] }),
      ]);
      // mandates() returns the struct in declaration order; spentIn is 6th and
      // totalBudgetIn 5th, so remaining budget is what decides usability.
      const totalBudget = BigInt(m[4] ?? 0);
      const spent       = BigInt(m[5] ?? 0);
      return res.status(200).json({
        mandateId: lookupMandateId,
        live: Boolean(live),
        remainingBudget: (totalBudget - spent).toString(),
        maxAmountIn: String(m[3] ?? '0'),
        expiry: Number(m[10] ?? 0),
      });
    } catch (err) {
      return res.status(200).json({ mandateId: lookupMandateId, live: false, note: err?.shortMessage || err?.message });
    }
  }

  if (checkOnly) return res.status(400).json({ error: 'checkOnly requires a mandateId.' });

  if (!user || !tokenIn || !tokenOut || !maxAmountIn || !totalBudgetIn) {
    return res.status(400).json({ error: 'user, tokenIn, tokenOut, maxAmountIn and totalBudgetIn are required.' });
  }

  const key = process.env.AGENT_PRIVATE_KEY;
  if (!key) return res.status(500).json({ error: 'No agent key configured.' });
  const account = privateKeyToAccount(key.startsWith('0x') ? key : `0x${key}`);

  // Compute the id the IC will derive, BEFORE running the round.
  //
  // A GenLayer write's return value is not recoverable from its receipt, so the
  // only way to learn a round's outcome is to read it back under an identifier
  // known in advance. This mirrors AgentValidator's derivation exactly; if the
  // two ever drift, a mandate is created on chain that nothing can find.
  // encodeAbiParameters, NOT encodePacked. The IC builds each field with
  // _word_uint / _word_addr, which pad everything to 32 bytes; encodePacked
  // would emit a 20-byte address and produce a different hash - a mandate
  // created on chain that nothing could ever look up.
  const mandateId = keccak256(
    encodeAbiParameters(
      [
        { type: 'bytes32' }, { type: 'uint256' }, { type: 'address' },
        { type: 'address' }, { type: 'address' }, { type: 'address' }, { type: 'uint256' },
      ],
      [
        keccak256(toHex('SOYARA_MANDATE_V1')),
        4221n,
        executor,
        user,
        tokenIn,
        tokenOut,
        BigInt(nonce),
      ],
    ),
  );

  try {
    const result = await issueTradingMandate({
      user,
      tokenIn,
      tokenOut,
      maxAmountIn,
      totalBudgetIn,
      maxSlippageBps,
      maxFeeBps: DEFAULT_FEE_BPS,
      feeCollector: addresses.dexFeeVault,
      router: addresses.aggregatorEntrypoint,
      ttlSeconds,
      nonce,
    }, { account, commitment: mandateId });

    // The round decides in ~20s but its message reaches the executor on
    // finalization, so nudge it. This is a keeper the settlement queue also
    // drives; finalizeRound gates itself, so calling here is cheap.
    if (result?.txHash) {
      finalizeRound(result.txHash, account).catch(() => {});
    }

    return res.status(200).json({
      ...result,
      // The caller polls with this until `live` turns true, then trades with it.
      mandateId,
      note: 'A mandate becomes usable once its round finalizes. Poll this route with mandateId.',
    });
  } catch (err) {
    console.error('[agent-mandate] failed:', err?.shortMessage || err?.message);
    return res.status(500).json({ error: err?.shortMessage || err?.message || 'Mandate round failed.' });
  }
}
