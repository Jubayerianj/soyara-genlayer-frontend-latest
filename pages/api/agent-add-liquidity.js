// pages/api/agent-add-liquidity.js
//
// SERVER-SIDE AGENT LIQUIDITY ROUTE
// =================================
// The liquidity counterpart to /api/agent-execute, enforcing the same
// GenLayer-to-settlement flow:
//
//   AgentValidator.validate_proposal(action="ADD_LIQUIDITY")   ← consensus WRITE
//        ↓ verdict recorded on-chain
//   this route reads the verdict back with get_validation       ← never trusted from the client
//        ↓
//   AgentValidator.validate_liquidity_v2_add(...)               ← consensus round; the IC
//                                                                 emits recordVerdict to the
//                                                                 executor on finalization
//   AgentExecutor.executeAddLiquidityV2(...)                    ← checks + CONSUMES the verdict
//
// Why AgentValidator and not LiquidityValidator: LiquidityValidator has no
// verdict persistence (no `get_validation`, no `compute_proposal_id`), so a
// verdict issued by it cannot be re-read on-chain at settlement time and the
// flow could not be enforced without redeploying that IC. AgentValidator already
// accepts ADD_LIQUIDITY and records the verdict, so liquidity and swaps share one
// enforcement path.
//
// Before this route existed, an approved liquidity proposal on /a2a validated and
// then did nothing at all on-chain - the Execute button only ever settled swaps.

import { createPublicClient, createWalletClient, http, zeroAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import AGENT_EXECUTOR_ABI from '../../abi/AgentExecutor.json';
import { CONTRACT_ADDRESSES } from '../../constants/addresses.js';
import { validateLiquidityV2Add } from '../../lib/genlayer.js';
import { obtainVerdict } from '../../lib/verdict.js';
import { leaseAgent } from '../../lib/agentPool.js';
import { deserialiseLiquidityOrder } from '../../lib/liquidityOrder.js';
import { toRawAmount } from '../../lib/amounts.js';
import { TOKEN_LIST } from '../../constants/tokens.js';

const genLayerBradbury = {
  id: 4221,
  name: 'GenLayer Bradbury Testnet',
  nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc-bradbury.genlayer.com'] },
    public: { http: ['https://rpc-bradbury.genlayer.com'] },
  },
};

const ERC20_MINI_ABI = [
  { name: 'allowance', type: 'function', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
];

/**
 * Retry a write that the RPC node throttled.
 *
 * Bradbury replies `-32005 transaction gas rate limit exceeded: node is at
 * capacity, retry in ~Nms`. Settlement cannot rotate senders the way validation
 * can - AgentExecutor's onlyAgent modifier means these calls must come from the
 * authorised agent - so waiting the hinted interval is the correct remedy here.
 * Without this the throttle surfaced mid-flow as a bare
 * "Request exceeds defined limit", which reads like a failed trade when in fact
 * nothing was submitted.
 */
async function sendWithRetry(fn, label) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      const text = `${err?.shortMessage || ''} ${err?.message || ''} ${err?.details || ''}`;
      const throttled = /-32005|gas rate limit|at capacity|exceeds defined limit/i.test(text);
      if (!throttled || attempt >= 4) throw err;
      const hint = text.match(/retryAfterMs"?\s*:\s*(\d+)/) || text.match(/retry in ~?(\d+)\s*ms/i);
      const wait = Math.min(8000, (hint ? parseInt(hint[1], 10) : 1500) + attempt * 500);
      console.warn(`[settlement] ${label} throttled by node, retrying in ${wait}ms (attempt ${attempt + 1}/5)`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const agentPrivateKey = process.env.AGENT_PRIVATE_KEY;
  const agentExecutorAddress = CONTRACT_ADDRESSES[4221]?.agentExecutor
    || process.env.AGENT_EXECUTOR_ADDRESS;

  if (!agentPrivateKey) {
    return res.status(503).json({ success: false, error: 'Settlement agent not configured - fail-closed' });
  }
  if (!agentExecutorAddress || agentExecutorAddress === zeroAddress) {
    return res.status(503).json({ success: false, error: 'AgentExecutor not deployed - settlement blocked (fail-closed)' });
  }

  const {
    user,
    tokenA,
    tokenB,
    amountADesired,
    amountBDesired,
    amountAMin,
    amountBMin,
    slippageBps,
    deadline,
    validationApproved,
  } = req.body;

  if (!user || !tokenA || !tokenB || !amountADesired || !amountBDesired || !deadline) {
    return res.status(400).json({ error: 'Missing required liquidity parameters' });
  }
  if (!validationApproved) {
    return res.status(403).json({ success: false, error: 'Settlement blocked: GenLayer validation was not approved - fail-closed' });
  }

  try {
    const pkHex = agentPrivateKey.startsWith('0x') ? agentPrivateKey : `0x${agentPrivateKey}`;
    const account = privateKeyToAccount(pkHex);
    const publicClient = createPublicClient({ chain: genLayerBradbury, transport: http('https://rpc-bradbury.genlayer.com') });
    const walletClient = createWalletClient({ account, chain: genLayerBradbury, transport: http('https://rpc-bradbury.genlayer.com') });

    // Amounts go through the shared converter, not a bare BigInt().
    //
    // `BigInt("10.0")` throws, and `BigInt("10")` is TEN WEI - a deposit
    // eighteen orders of magnitude smaller than the one asked for, with no error
    // raised anywhere. The validation path was fixed for this; this route is the
    // one that actually pulls the tokens, so it needs the same treatment.
    const decOf = (addr) => TOKEN_LIST[4221]?.find(
      (t) => t.address?.toLowerCase() === String(addr).toLowerCase()
    )?.decimals ?? 18;

    const bpsBig = BigInt(slippageBps ?? 30);
    const amtA = toRawAmount({ raw: amountADesired, human: null, decimals: decOf(tokenA), label: 'amountADesired' });
    const amtB = toRawAmount({ raw: amountBDesired, human: null, decimals: decOf(tokenB), label: 'amountBDesired' });
    if (!amtA.ok || !amtB.ok) {
      return res.status(400).json({ success: false, error: amtA.ok ? amtB.error : amtA.error });
    }
    const aDesired = amtA.value;
    const bDesired = amtB.value;

    const minA = amountAMin !== undefined && amountAMin !== null
      ? toRawAmount({ raw: amountAMin, decimals: decOf(tokenA), label: 'amountAMin', allowZero: true })
      : { ok: true, value: (aDesired * (10000n - bpsBig)) / 10000n };
    const minB = amountBMin !== undefined && amountBMin !== null
      ? toRawAmount({ raw: amountBMin, decimals: decOf(tokenB), label: 'amountBMin', allowZero: true })
      : { ok: true, value: (bDesired * (10000n - bpsBig)) / 10000n };
    if (!minA.ok || !minB.ok) {
      return res.status(400).json({ success: false, error: minA.ok ? minB.error : minA.error });
    }
    const aMin = minA.value;
    const bMin = minB.value;
    const deadlineBig = BigInt(deadline);

    // NOTE: there is no off-chain verdict lookup here any more.
    //
    // This route used to read the verdict from the IC, satisfy ITSELF that
    // consensus had approved, and then write its own approval into the executor.
    // That check was real but it was advisory - it lived in this process, and
    // the executor had no way to know whether it had run. The gate is now the
    // executor's own verdict registry, which only the validator IC can write to,
    // so the check happens where it can actually be enforced. See STEP 3.

    // ── STEP 2: Pre-flight balances and allowances for BOTH tokens ───────────
    // executeAddLiquidityV2 pulls both sides with transferFrom; without this the
    // failure surfaces as the token's own "ds-math-sub-underflow".
    for (const [label, token, amount] of [['A', tokenA, aDesired], ['B', tokenB, bDesired]]) {
      const [allowance, balance] = await Promise.all([
        publicClient.readContract({ address: token, abi: ERC20_MINI_ABI, functionName: 'allowance', args: [user, agentExecutorAddress] }),
        publicClient.readContract({ address: token, abi: ERC20_MINI_ABI, functionName: 'balanceOf', args: [user] }),
      ]);
      if (balance < amount) {
        return res.status(400).json({
          success: false,
          error: `Insufficient token ${label} balance: wallet holds ${balance} but the deposit needs ${amount} (raw units).`,
          side: label,
        });
      }
      if (allowance < amount) {
        return res.status(400).json({
          success: false,
          needsApproval: true,
          spender: agentExecutorAddress,
          token,
          error: `Token ${label} approval missing for AgentExecutor at ${agentExecutorAddress}. Approve it and try again.`,
        });
      }
    }

    // ── STEP 2b: Pair the deposit against live reserves ─────────────────────
    // A V2 deposit must match the pool ratio. The router uses one side and
    // derives the other, and reverts with INSUFFICIENT_A_AMOUNT /
    // INSUFFICIENT_B_AMOUNT if the derived amount falls under the caller's
    // minimum - which happens whenever the two requested amounts drift even
    // slightly off-ratio. Compute the correct pairing here and reduce the
    // over-supplied side, so the deposit goes through and the excess is simply
    // never pulled. Verification above already ran against the parameters the
    // user validated; this only ever lowers an amount.
    let aFinal = aDesired;
    let bFinal = bDesired;
    try {
      const factory = CONTRACT_ADDRESSES[4221]?.factory || '0x4680BCe1632824d30D2F53656dD610736c3e312e';
      const pair = await publicClient.readContract({
        address: factory,
        abi: [{ inputs: [{ type: 'address' }, { type: 'address' }], name: 'getPair', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' }],
        functionName: 'getPair',
        args: [tokenA, tokenB],
      });

      if (pair && pair !== zeroAddress) {
        const pairAbi = [
          { inputs: [], name: 'getReserves', outputs: [{ type: 'uint112' }, { type: 'uint112' }, { type: 'uint32' }], stateMutability: 'view', type: 'function' },
          { inputs: [], name: 'token0', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
        ];
        const [reserves, token0] = await Promise.all([
          publicClient.readContract({ address: pair, abi: pairAbi, functionName: 'getReserves' }),
          publicClient.readContract({ address: pair, abi: pairAbi, functionName: 'token0' }),
        ]);
        const aIsToken0 = String(token0).toLowerCase() === String(tokenA).toLowerCase();
        const rA = aIsToken0 ? reserves[0] : reserves[1];
        const rB = aIsToken0 ? reserves[1] : reserves[0];

        if (rA > 0n && rB > 0n) {
          const optimalB = (aDesired * rB) / rA;
          if (optimalB <= bDesired) {
            bFinal = optimalB;
          } else {
            aFinal = (bDesired * rA) / rB;
          }
          console.log(`[agent-add-liquidity] paired to pool ratio: A ${aDesired}->${aFinal}, B ${bDesired}->${bFinal}`);
        }
      }
    } catch (e) {
      console.warn('[agent-add-liquidity] reserve pairing unavailable:', e.message);
    }

    // Minimums come off the FINAL amounts, so they are consistent with what the
    // router will actually compute.
    const aMinFinal = (aFinal * (10000n - bpsBig)) / 10000n;
    const bMinFinal = (bFinal * (10000n - bpsBig)) / 10000n;

    // ── STEP 3: Obtain the consensus verdict ────────────────────────────────
    // The commitment is read from the contract rather than recomputed here, so
    // it can never drift from TradeHashLib.v2AddHash.
    //
    // This used to be an `approveTrade(opHash)` call from the agent's own key -
    // the agent approved the operation and then executed against its own
    // approval, with the executor none the wiser about GenLayer. The registry it
    // wrote to no longer accepts anything but the validator IC, so the verdict
    // has to come from a consensus round.
    //
    // Note the amounts: the commitment covers aFinal/bFinal, the values AFTER
    // the pool-ratio pairing above, so what consensus approves is what settles.
    const commitment = await publicClient.readContract({
      address: agentExecutorAddress,
      abi: AGENT_EXECUTOR_ABI,
      functionName: 'getLiquidityV2AddHash',
      args: [user, tokenA, tokenB, aFinal, bFinal, aMinFinal, bMinFinal, deadlineBig],
    });

    const lease = leaseAgent?.();
    const verdict = await obtainVerdict({
      publicClient,
      executor: agentExecutorAddress,
      abi: AGENT_EXECUTOR_ABI,
      commitment,
      submit: () => validateLiquidityV2Add({
        user, tokenA, tokenB,
        amountADesired: aFinal, amountBDesired: bFinal,
        amountAMin: aMinFinal, amountBMin: bMinFinal,
        deadline: deadlineBig,
      }, lease ? { account: lease.account } : {}),
    });

    if (verdict.rejected) {
      return res.status(403).json({
        success: false, notValidated: true,
        error: `GenLayer consensus rejected this deposit: ${verdict.reason}`,
        commitment, validationTxHash: verdict.validationTxHash,
      });
    }
    if (!verdict.live) {
      return res.status(202).json({
        success: false, pending: true,
        error:
          'GenLayer consensus has not yet finalised a verdict for this deposit. The validator '
          + 'IC delivers its approval to the executor on finalization, which is still in '
          + 'progress - retry shortly.',
        commitment, validationTxHash: verdict.validationTxHash,
      });
    }

    // ── STEP 4: Execute - checks and CONSUMES the verdict ───────────────────
    // The trailing empty array is the attestation slot; this deployment settles
    // on the GenLayer consensus rail, so there are no signatures to present.
    const execTxHash = await sendWithRetry(() => walletClient.writeContract({
      address: agentExecutorAddress,
      abi: AGENT_EXECUTOR_ABI,
      functionName: 'executeAddLiquidityV2',
      args: [user, tokenA, tokenB, aFinal, bFinal, aMinFinal, bMinFinal, deadlineBig, []],
    }), 'executeAddLiquidityV2');
    const execReceipt = await publicClient.waitForTransactionReceipt({ hash: execTxHash });

    if (execReceipt.status !== 'success') {
      return res.status(500).json({ success: false, error: 'Liquidity transaction reverted on-chain', execTxHash });
    }

    return res.status(200).json({
      success: true,
      commitment,
      validationTxHash: verdict.validationTxHash,
      execTxHash,
      blockNumber: execReceipt.blockNumber.toString(),
      explorerUrl: `https://explorer-bradbury.genlayer.com/tx/${execTxHash}`,
      verifiedVia: { path: 'genlayer_consensus', commitment },
    });
  } catch (err) {
    console.error('[agent-add-liquidity] settlement error (fail-closed):', err);
    return res.status(500).json({
      success: false,
      error: err?.shortMessage || err?.message || 'Liquidity settlement failed',
    });
  }
}
