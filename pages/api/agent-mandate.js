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
// for anything sooner, and on Bradbury that is about 30 minutes in front of every
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
import AGENT_EXECUTOR_ABI from '../../abi/AgentExecutor.json';
import { CONTRACT_ADDRESSES } from '../../constants/addresses.js';
import { issueTradingMandate, finalizeRound } from '../../lib/genlayer.js';
import { leaseAgent, getKeeperAccount } from '../../lib/agentPool.js';
import { decodeMandate, isMandateId } from '../../lib/mandateCoverage.js';

const ZERO = '0x0000000000000000000000000000000000000000';

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
    if (!isMandateId(lookupMandateId)) {
      return res.status(400).json({ mandateId: lookupMandateId, live: false, error: 'Not a mandate id.' });
    }
    // Every poll also DRIVES finalization, and that is not incidental.
    //
    // A GenLayer round sits in Accepted until somebody calls finalize, and the
    // mandate's recordMandate message is delivered only at that point. This
    // route used to nudge exactly once, immediately after issuing - when the
    // round was zero seconds old and the gate correctly refused it as far too
    // early - and then nothing ever called again. The round was approved by
    // consensus and simply never delivered, so a perfectly good mandate stayed
    // invisible forever.
    //
    // finalizeRound gates itself (nothing before the appeal window could have
    // closed, at most once a minute per round), so calling it on every poll is
    // cheap and is what eventually lands the mandate.
    if (req.body?.roundTxHash) {
      const keeper = getKeeperAccount();
      if (keeper) finalizeRound(req.body.roundTxHash, keeper, req.body.roundSubmittedAt).catch(() => {});
    }

    try {
      const [live, raw] = await Promise.all([
        publicClient.readContract({ address: executor, abi: AGENT_EXECUTOR_ABI, functionName: 'isMandateLive', args: [lookupMandateId] }),
        publicClient.readContract({ address: executor, abi: AGENT_EXECUTOR_ABI, functionName: 'mandates', args: [lookupMandateId] }),
      ]);
      // Decoded by field name. Reading the tuple by index is how this route
      // came to report the route hash (index 10) as the expiry (index 12).
      const m = decodeMandate(raw);
      return res.status(200).json({
        mandateId: lookupMandateId,
        live: Boolean(live),
        recorded: m.user !== ZERO,
        remainingBudget: (m.totalBudgetIn - m.spentIn).toString(),
        maxAmountIn: m.maxAmountIn.toString(),
        expiry: m.expiry,
        tokenIn: m.tokenIn,
        tokenOut: m.tokenOut,
      });
    } catch (err) {
      return res.status(200).json({ mandateId: lookupMandateId, live: false, note: err?.shortMessage || err?.message });
    }
  }

  if (checkOnly) return res.status(400).json({ error: 'checkOnly requires a mandateId.' });

  if (!user || !tokenIn || !tokenOut || !maxAmountIn || !totalBudgetIn) {
    return res.status(400).json({ error: 'user, tokenIn, tokenOut, maxAmountIn and totalBudgetIn are required.' });
  }

  // A mandate pins one single-hop V2 route that pulls an ERC-20 from the user,
  // so native GEN on either side can never be covered. The IC refuses such a
  // request anyway; refusing here saves a consensus round that cannot pass.
  if (String(tokenIn).toLowerCase() === ZERO || String(tokenOut).toLowerCase() === ZERO) {
    return res.status(400).json({ error: 'Mandates cover ERC-20 pairs only. Trades with native GEN settle against their own consensus verdict.' });
  }

  // A sender lane, like every other consensus write. GenLayer queues rounds
  // per sender, and signing with a key that is also a validation lane made a
  // mandate round collide with a swap's (TransactionNotAtPendingQueueHead).
  const lease = leaseAgent();
  if (!lease) return res.status(503).json({ error: 'Every validation lane is mid-round. Try again shortly.' });
  const account = lease.account;

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

    // Hold the lane only while its round is in flight.
    if (result?.pending && result?.txHash) lease.markSubmitted(result.txHash);
    else lease.release();

    // No round, no mandate. A submission that never reached ConsensusMain
    // (a throttle, a queue collision) used to come back as a 200 carrying a
    // mandate id, and the browser then waited most of an hour for a mandate
    // nobody had asked consensus for. Say it failed, and why.
    if (!result?.txHash && !result?.approved) {
      return res.status(result?.rateLimited ? 429 : 502).json({
        error: result?.reason || 'The mandate round could not be submitted.',
        retryable: Boolean(result?.retryable || result?.rateLimited),
        mandateId: null,
      });
    }
    if (result?.approved === false && !result?.pending && !result?.retryable) {
      return res.status(422).json({ error: `Consensus refused the mandate: ${result.reason}`, mandateId: null, roundTxHash: result.txHash || null });
    }

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
      // Poll with these so each check also nudges the round toward
      // finalization; without that nothing ever delivers the mandate.
      roundTxHash: result?.txHash || null,
      roundSubmittedAt: Date.now(),
      // What was asked for, so the UI can say it plainly. Consensus enforces
      // its own ceilings on top of these.
      requested: {
        maxAmountIn: String(maxAmountIn),
        totalBudgetIn: String(totalBudgetIn),
        maxSlippageBps: Number(maxSlippageBps),
        ttlSeconds: Number(ttlSeconds),
      },
      note: 'A mandate becomes usable once its round finalizes. Poll this route with mandateId and roundTxHash.',
    });
  } catch (err) {
    lease.release();
    console.error('[agent-mandate] failed:', err?.shortMessage || err?.message);
    return res.status(500).json({ error: err?.shortMessage || err?.message || 'Mandate round failed.' });
  }
}
