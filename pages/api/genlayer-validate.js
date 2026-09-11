// pages/api/genlayer-validate.js
//
// Validation route - opens the BINDING consensus round for a swap.
//
// This used to run `validate_proposal`, an advisory round that populated the UI
// panel and authorised nothing, after which /api/agent-execute ran a SECOND
// round - the binding one - at settlement. On Bradbury that meant paying the
// multi-minute round latency twice for a single trade, and it meant the panel
// showed a verdict on something other than what would actually settle.
//
// For swaps this route now builds the exact order that will be settled and runs
// `validate_swap` over it. It returns that order, so /api/agent-execute can wait
// for the verdict and settle without starting anything new. One round per trade,
// and the thing the user was shown is the thing that settles.
//
// validate_swap is @gl.public.write, so it MUST go through writeContract +
// waitForTransactionReceipt to trigger Optimistic Democracy across validators.
// A sender lane from the agent pool signs it; with no lanes configured nothing
// can be validated, and the route says so rather than simulating.
//
// THE RAIL IS DECIDED HERE, BEFORE ANY ROUND IS OPENED
// ----------------------------------------------------
// A swap settles under exactly one consensus authority (lib/actions.js):
//
//   mandate    when the caller remembers a mandate that an earlier consensus
//              round issued, and it covers this exact order on its best route,
//              no new round is opened. The response says `rail: 'mandate'`,
//              and settlement is one `executeSwapUnderMandate` call.
//   consensus  otherwise, this order's own `validate_swap` round is opened, and
//              settlement consumes that verdict with `executeSwap`.
//
// Deciding once, up front, is what keeps one intent from settling twice. The
// response also carries `mandate_eligible`, telling the client whether asking
// for a mandate would make the NEXT trade like this one settle in seconds.

import { validateSwapOrder, validateLiquidityV2Add, validateLiquidityProposal, checkSwapValidationStatus, finalizeStuckValidation, drainFinalizationQueue, GENLAYER_CONFIG } from '../../lib/genlayer.js';
import { leaseAgent, getKeeperAccount, poolStatus } from '../../lib/agentPool.js';
import { createPublicClient, http } from 'viem';
import AGENT_EXECUTOR_ABI from '../../abi/AgentExecutor.json';
import { CONTRACT_ADDRESSES } from '../../constants/addresses.js';
import { buildSwapOrder, serialiseOrder, normaliseSwapIntent } from '../../lib/swapOrder.js';
import { buildLiquidityV2AddOrder, serialiseLiquidityOrder } from '../../lib/liquidityOrder.js';
import { findCoveringMandate, isMandateEligibleRoute } from '../../lib/mandateCoverage.js';
import { POOLS_URL } from '../../lib/pools.js';
import { registerTrade } from '../../lib/settlementBackend.js';
import { ensureSettlementKeeper } from '../../lib/settlementKeeper.js';

// With no wallet connected the swarm runs for this placeholder, so the page can
// still show a whole run. A trade for it can never settle, so it is not kept.
const PLACEHOLDER_RECIPIENT = '0x3333333333333333333333333333333333333333';

/** A mandate as the UI shows it: decimal strings, nothing the wire cannot carry. */
function describeMandate(id, m) {
  return {
    id,
    user: m.user,
    tokenIn: m.tokenIn,
    tokenOut: m.tokenOut,
    maxAmountIn: m.maxAmountIn.toString(),
    remainingBudget: (m.totalBudgetIn - m.spentIn).toString(),
    totalBudgetIn: m.totalBudgetIn.toString(),
    maxSlippageBps: m.maxSlippageBps.toString(),
    maxFeeBps: m.maxFeeBps.toString(),
    feeCollector: m.feeCollector,
    router: m.router,
    routeHash: m.routeHash,
    pool: m.pool,
    expiry: m.expiry,
  };
}

const genLayerBradbury = {
  id: 4221,
  name: 'GenLayer Bradbury Testnet',
  nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc-bradbury.genlayer.com'] },
    public:  { http: ['https://rpc-bradbury.genlayer.com'] },
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const proposal = req.body;

  if (!proposal) {
    return res.status(400).json({ error: 'Proposal payload is required' });
  }

  // Keeper account for public calls (finalising idle transactions).
  const agentAccount = getKeeperAccount();

  // ── Polling path: check status of an already-submitted consensus round ──
  // Used when a prior call returned pending:true. This does NOT resubmit a
  // transaction - it just re-checks the existing one, so polling repeatedly
  // never adds more load to the network.
  if (proposal.checkTxHash) {
    try {
      // proposalId lets the status check read the recorded verdict - a write's
      // return value is not recoverable from its receipt.
      let statusResult = await checkSwapValidationStatus(proposal.checkTxHash, proposal.proposalId || null);

      // Caller exhausted its poll budget and the round never got votes. Left
      // alone these idle txs pile up against the agent account and eventually
      // make new addTransaction calls revert at ConsensusMain (surfacing as a
      // bogus "Rejected by Validator"). Clear it, then report it as retryable.
      if (proposal.finalizeIfStuck && statusResult.pending && agentAccount) {
        const finalizeResult = await finalizeStuckValidation(proposal.checkTxHash, agentAccount);
        if (finalizeResult.finalized) {
          statusResult = {
            ...statusResult,
            pending: false,
            retryable: true,
            reason: 'GenVM validators never voted on this round, so it was cleared automatically. This is a network condition, not a rejection - run another round to continue.',
          };
        }
      }

      return res.status(200).json({
        approved:         Boolean(statusResult.approved),
        pending:          Boolean(statusResult.pending),
        retryable:        Boolean(statusResult.retryable),
        reason:           statusResult.reason,
        // Echo back the id the caller supplied when the status check itself
        // could not resolve one. Otherwise a poller that follows this response
        // loses the proposal id after the first poll and can never look the
        // verdict up - the round then reports "Consensus reached - reading the
        // recorded verdict" forever.
        proposal_id:      statusResult.proposalId || proposal.proposalId || '',
        genlayer_contract: statusResult.contractAddress,
        contract_name:    statusResult.contractName,
        network:          statusResult.network,
        chainId:          statusResult.chainId,
        timestamp:        statusResult.timestamp,
        tx_hash:          statusResult.txHash || proposal.checkTxHash,
        // Real GenVM lifecycle phase, so the UI can show what the round is
        // actually doing instead of an unexplained spinner.
        statusName:       statusResult.statusName || null,
        // Only a per-order round is ever polled: a mandate-covered trade has
        // no round to poll.
        rail:             'consensus',
        consensus_mode:   'Optimistic Democracy (GenVM write tx)',
        is_write_flow:    true,
        live_execution:   Boolean(statusResult.success),
      });
    } catch (error) {
      console.error('API /genlayer-validate status-check error (failing closed):', error);
      return res.status(503).json({ approved: false, pending: true, reason: 'Status check unavailable - try again shortly' });
    }
  }

  const action = (proposal.action || 'SWAP').toUpperCase();
  const isV2Liquidity = action === 'ADD_LIQUIDITY' && proposal.model !== 'v3' && !proposal.isV3;

  if (!['SWAP', 'ADD_LIQUIDITY', 'REMOVE_LIQUIDITY'].includes(action)) {
    return res.status(400).json({
      approved: false,
      reason: `Unsupported action '${action}'. Allowed: SWAP, ADD_LIQUIDITY, REMOVE_LIQUIDITY`,
    });
  }

  // V3 positions are not validated here, and cannot be settled through the
  // agent path at all. The AgentValidator IC has no V3 liquidity validator (it
  // was removed to fit GenVM's deploy size limit), so no verdict can exist for
  // a V3 mint or burn and AgentExecutor would refuse one. This used to fall
  // through to a read simulation against the separate LiquidityValidator
  // contract, which authorises nothing - an answer that looked like consensus
  // and could never settle. V3 positions are managed on the pools app.
  if ((action === 'ADD_LIQUIDITY' || action === 'REMOVE_LIQUIDITY') && (proposal.model === 'v3' || proposal.isV3)) {
    return res.status(400).json({
      approved: false,
      retryable: false,
      unsupported: 'v3_liquidity',
      redirect: POOLS_URL,
      reason: 'V3 liquidity is not validated or settled through the agent path: the AgentValidator contract has no V3 '
        + `liquidity validator, so the settlement contract could never honour one. Manage V3 positions at ${POOLS_URL}.`,
      proposal_id: '',
    });
  }

  // ── Reserve a sender lane ───────────────────────────────────────────────
  // GenLayer serialises consensus rounds per sender, so two rounds signed by
  // the same key collide and the second reverts. Each in-flight round gets its
  // own account from the pool.
  // A dry run opens nothing, so it needs no lane.
  let lease = proposal.dryRun ? null : leaseAgent();

  if (!lease && !proposal.dryRun) {
    const status = poolStatus();
    if (status.total === 0) {
      // No lane means no consensus write. There is no read-only stand-in: an
      // answer that did not go through a round is not a verdict.
      return res.status(503).json({
        approved: false,
        reason: 'No validation lanes are configured on this server, so no consensus round can be opened. Nothing was validated.',
        proposal_id: '',
        genlayer_contract: GENLAYER_CONFIG.agentValidator,
      });
    } else {
      // Every lane is mid-round. This is congestion, not a rejection.
      return res.status(200).json({
        approved: false,
        pending: true,
        reason: `All ${status.total} validation lanes are mid-round. This is queue congestion, not a rejection - retrying shortly will go through.`,
        proposal_id: '',
        genlayer_contract: GENLAYER_CONFIG.agentValidator,
        contract_name: 'AgentValidator (GenLayer IC)',
        network: GENLAYER_CONFIG.chainName,
        chainId: GENLAYER_CONFIG.chainId,
        timestamp: new Date().toISOString(),
        consensus_mode: 'Optimistic Democracy (GenVM write tx)',
        is_write_flow: true,
        live_execution: false,
      });
    }
  }

  // The leased account signs the consensus WRITE (writeContract +
  // waitForTransactionReceipt).
  const options = lease ? { account: lease.account } : {};

  try {
    let validationResult;

    // The RPC node throttles PER SENDER, so a lane that is at capacity stays at
    // capacity no matter how long we wait - while another funded lane submits
    // instantly. Waiting is the wrong remedy; rotating is. Try successive lanes
    // before reporting a throttle to the user.
    // For a swap, build the order the settlement will use and validate THAT.
    // Everything downstream - the commitment, the verdict, the executor's checks
    // - is derived from this object, so it has to be built once and carried
    // through rather than reconstructed later from the same inputs.
    let swapOrder = null;
    let swapProgram = null;
    let swapCommitment = null;
    // Whether a mandate could ever carry a trade like this (ERC-20 both sides,
    // best route a single V2 pool), and why a remembered one did not.
    let mandateEligible = false;
    let mandateNote = null;

    if (action === 'SWAP') {
      const executorAddress = CONTRACT_ADDRESSES[4221]?.agentExecutor;
      if (!executorAddress) {
        return res.status(503).json({
          approved: false,
          reason: 'AgentExecutor is not configured, so no commitment can be derived - failed closed.',
          proposal_id: '',
        });
      }

      const publicClient = createPublicClient({
        chain: genLayerBradbury,
        transport: http('https://rpc-bradbury.genlayer.com'),
      });

      // A proposal arrives loosely typed - tokens as symbols, amounts as
      // human-readable strings. Normalise strictly before anything reaches the
      // commitment: on this path a mis-parsed amount would not just misreport a
      // number, it would mint a consensus verdict for a trade the user never
      // asked for.
      const intent = normaliseSwapIntent(proposal);
      if (!intent.ok) {
        if (lease) lease.release();
        return res.status(400).json({ approved: false, reason: intent.error, proposal_id: '' });
      }

      const built = await buildSwapOrder({
        publicClient,
        executor: executorAddress,
        abi: AGENT_EXECUTOR_ABI,
        user:        intent.user,
        tokenIn:     intent.tokenIn,
        tokenOut:    intent.tokenOut,
        amountIn:    intent.amountIn,
        slippageBps: intent.slippageBps,
        deadline:    intent.deadline,
        expectedMinAmountOut: intent.expectedMinAmountOut,
      });

      if (!built.ok) {
        if (lease) lease.release();
        return res.status(built.status).json({
          approved: false,
          reason: built.body.error,
          proposal_id: '',
          ...built.body,
        });
      }

      swapOrder = built.order;
      swapProgram = built.aggProgram;
      swapCommitment = built.commitment;
      mandateEligible = isMandateEligibleRoute({ order: built.order, hops: built.quote?.hops });

      // ── Does a mandate an earlier round issued already cover this trade? ──
      //
      // Checked BEFORE a round is opened, and only for the route the
      // aggregator chose as best. When one covers it, this trade's authority
      // is that mandate and no round of its own is opened - so there is never
      // a second verdict for the same intent waiting to be settled later.
      const mandateIds = Array.isArray(proposal.mandateIds)
        ? proposal.mandateIds
        : (proposal.mandateId ? [proposal.mandateId] : []);
      if (mandateEligible && mandateIds.length) {
        const coverage = await findCoveringMandate({
          publicClient,
          executor: executorAddress,
          abi: AGENT_EXECUTOR_ABI,
          mandateIds,
          order: swapOrder,
          aggProgram: swapProgram,
        }).catch((e) => ({ covered: false, reasons: [e?.shortMessage || e?.message || 'mandate could not be read'] }));

        if (coverage.covered) {
          if (lease) lease.release();
          const mandate = describeMandate(coverage.mandateId, coverage.mandate);
          return res.status(200).json({
            approved: true,
            pending: false,
            retryable: false,
            rail: 'mandate',
            mandate_id: coverage.mandateId,
            mandate,
            reason:
              'Covered by a mandate GenLayer consensus issued for this pair and direction. AgentExecutor checks this '
              + 'trade against it and prices it from the pool at settlement, so it settles in one transaction '
              + 'with no new round.',
            proposal_id: coverage.mandateId,
            genlayer_contract: GENLAYER_CONFIG.agentValidator,
            contract_name: 'AgentValidator (GenLayer IC)',
            network: GENLAYER_CONFIG.chainName,
            chainId: GENLAYER_CONFIG.chainId,
            timestamp: new Date().toISOString(),
            tx_hash: null,
            statusName: null,
            consensus_mode: 'Mandate issued by an earlier GenVM consensus round, enforced per trade by AgentExecutor',
            is_write_flow: true,
            live_execution: true,
            // The per-order commitment belongs to the consensus rail; this
            // trade never gets a verdict of its own.
            commitment: null,
            pendingOrder: serialiseOrder(swapOrder),
            orderKind: 'swap',
            pendingProgram: swapProgram,
            validationSubmitted: false,
            quoted_amount_out: swapOrder.quotedAmountOut.toString(),
            min_amount_out: swapOrder.minAmountOut.toString(),
            mandate_eligible: true,
            // A dry run that finds a covering mandate reports it truthfully:
            // this trade WOULD settle under it, with no round.
            dryRun: Boolean(proposal.dryRun),
          });
        }
        mandateNote = coverage.reasons?.[0]?.replace(/^0x[0-9a-fA-F]{8}: /, '') || null;
      }

      // ── Dry run: show what consensus WOULD be asked, open nothing ─────────
      //
      // The developer console uses this. It returns the exact order, program
      // and commitment a round would be opened against, and the rail the trade
      // would take - without spending a round, a lane or a transaction. It is
      // labelled for what it is: nothing is approved by a dry run.
      if (proposal.dryRun) {
        if (lease) lease.release();
        return res.status(200).json({
          approved: false,
          dryRun: true,
          rail: 'consensus',
          would_submit: 'validate_swap',
          reason: 'Dry run: no round was opened. This is the exact order validate_swap would be asked to approve, '
            + 'and the commitment AgentExecutor would then require a verdict for.',
          commitment: swapCommitment,
          pendingOrder: serialiseOrder(swapOrder),
          pendingProgram: swapProgram,
          quoted_amount_out: swapOrder.quotedAmountOut.toString(),
          min_amount_out: swapOrder.minAmountOut.toString(),
          mandate_eligible: mandateEligible,
          mandate_note: mandateNote,
          genlayer_contract: GENLAYER_CONFIG.agentValidator,
        });
      }
    } else if (proposal.dryRun) {
      if (lease) lease.release();
      return res.status(400).json({ approved: false, dryRun: true, reason: 'Dry runs cover swaps, the only action the agent surfaces settle.' });
    }

    // A V2 deposit is built here for the same reason a swap is: the amounts that
    // settle are the typed amounts REDUCED TO THE POOL RATIO, not the typed
    // amounts. Validating one set and settling the other produces two different
    // commitments and a verdict that fits neither.
    //
    // It also has to go to `validate_liquidity_v2_add`. The old path called
    // `validate_proposal`, which no longer exists on the validator, so every
    // deposit came back as "consensus failed: ACCEPTED" - the round ran and the
    // contract raised on a missing method.
    let liquidityOrder = null;
    if (isV2Liquidity) {
      const executorAddress = CONTRACT_ADDRESSES[4221]?.agentExecutor;
      const publicClient = createPublicClient({
        chain: genLayerBradbury,
        transport: http('https://rpc-bradbury.genlayer.com'),
      });
      const built = await buildLiquidityV2AddOrder({
        publicClient,
        executor: executorAddress,
        abi: AGENT_EXECUTOR_ABI,
        user: proposal.user,
        // Prefer the explicit address fields. `tokenA` is often a SYMBOL.
        tokenA: proposal.tokenAAddress ?? proposal.tokenA ?? proposal.token0 ?? proposal.tokenIn,
        tokenB: proposal.tokenBAddress ?? proposal.tokenB ?? proposal.token1 ?? proposal.tokenOut,
        // Raw and human amounts are kept apart on purpose. Collapsing them with
        // ?? meant a human "10" was read as ten WEI, and "10.0" threw.
        rawA: proposal.amountARaw ?? proposal.amount0Desired ?? proposal.amountInRaw ?? null,
        rawB: proposal.amountBRaw ?? proposal.amount1Desired ?? proposal.minAmountOutRaw ?? null,
        amountADesired: proposal.amountA ?? null,
        amountBDesired: proposal.amountB ?? null,
        slippageBps: proposal.slippageBps ?? 30,
        deadline: proposal.deadline || (Math.floor(Date.now() / 1000) + 7200),
      });
      if (!built.ok) {
        if (lease) lease.release();
        return res.status(built.status).json({ approved: false, reason: built.body.error, proposal_id: '' });
      }
      liquidityOrder = built.order;
      swapCommitment = built.commitment;
    }

    const run = (opts) => {
      if (action === 'SWAP') {
        return validateSwapOrder({ ...swapOrder, aggProgram: swapProgram }, { ...opts, commitment: swapCommitment });
      }
      if (isV2Liquidity) {
        return validateLiquidityV2Add(liquidityOrder, { ...opts, commitment: swapCommitment });
      }
      return validateLiquidityProposal(proposal, opts);
    };

    let currentLease = lease;
    let opts = options;
    const triedLeases = [];

    for (let attempt = 0; ; attempt += 1) {
      validationResult = await run(opts);
      if (!validationResult.rateLimited || attempt >= 3) break;

      // This lane is throttled - hand it back and take a different one.
      if (currentLease) triedLeases.push(currentLease);
      const nextLease = leaseAgent();
      if (!nextLease || (currentLease && nextLease.account?.address === currentLease.account?.address)) {
        if (nextLease && nextLease !== currentLease) nextLease.release();
        break; // no distinct lane free - report the throttle honestly
      }
      console.warn(`[genlayer-validate] lane ${currentLease?.account?.address?.slice(0, 10)} throttled, rotating to ${nextLease.account.address.slice(0, 10)}`);
      currentLease = nextLease;
      opts = { account: nextLease.account };
    }

    // Release every lane we tried and did not keep.
    for (const l of triedLeases) { try { l.release(); } catch { /* already released */ } }
    lease = currentLease;

    // Keep the lane reserved only while its round is genuinely in flight;
    // a decided round frees it immediately for the next request.
    if (lease) {
      if (validationResult.pending && validationResult.txHash) lease.markSubmitted(validationResult.txHash);
      else lease.release();
    }

    // FAIL CLOSED: if consensus fails, approved must be false
    const approved = Boolean(validationResult.approved);

    // Keep the AgentValidator queue moving. Rounds finalize in order, so any
    // finished round still sitting at the head (an undecided run, one nobody
    // settled) would hold this one's verdict back 30 minutes from now.
    if (agentAccount) drainFinalizationQueue({ account: agentAccount }).catch(() => {});

    // The server keeps the order it just put to consensus, and settles the
    // trade itself when the verdict lands - with every browser tab closed.
    // That is this server's own keeper, or the separate settlement server when
    // SETTLEMENT_SERVER_URL is set (lib/settlementBackend.js). Awaited, because
    // a serverless host may freeze anything left running after the response.
    // The browser queue still settles it if nobody else does; the executor
    // consumes a verdict once, so there is never a second settlement.
    if (action === 'SWAP' && swapOrder && validationResult.txHash && (approved || validationResult.pending)
        && String(swapOrder.user).toLowerCase() !== PLACEHOLDER_RECIPIENT) {
      try {
        await registerTrade({
          commitment: swapCommitment,
          order: serialiseOrder(swapOrder),
          program: swapProgram,
          validationTxHash: validationResult.txHash,
          user: swapOrder.user,
          deadline: Number(swapOrder.deadline),
          label: `${proposal.amountIn} ${proposal.tokenIn} → ${proposal.tokenOut}`,
        });
        ensureSettlementKeeper();
      } catch (err) {
        console.warn('[genlayer-validate] could not record the trade for server settlement:', err?.message);
      }
    }

    return res.status(200).json({
      approved,
      pending:          Boolean(validationResult.pending),
      retryable:        Boolean(validationResult.retryable),
      reason:           validationResult.reason,
      proposal_id:      validationResult.proposalId || '',
      genlayer_contract: validationResult.contractAddress,
      contract_name:    validationResult.contractName,
      network:          validationResult.network,
      chainId:          validationResult.chainId,
      timestamp:        validationResult.timestamp,
      tx_hash:          validationResult.txHash || null,
      statusName:       validationResult.statusName || null,
      queue_full:       Boolean(validationResult.queueFull),
      rate_limited:     Boolean(validationResult.rateLimited),
      // The round decided but its verdict has not been read back yet. Callers
      // must treat this as pending: a GenLayer write's return value is not in
      // its receipt, so `approved` is false here only because nothing has
      // resolved it, never because the validators refused the trade.
      needs_verdict_lookup: Boolean(validationResult.needsVerdictLookup),
      // This trade's authority is its own verdict: the round above, consumed
      // once by executeSwap. (The mandate rail returned earlier.)
      rail:             'consensus',
      mandate_eligible: mandateEligible,
      mandate_note:     mandateNote,
      consensus_mode:   'Optimistic Democracy (GenVM write tx)',
      is_write_flow:    true,
      live_execution:   Boolean(validationResult.success),
      details:          validationResult.details || null,

      // The settlement handoff. /api/agent-execute takes these back verbatim and
      // waits for the verdict on this exact commitment instead of quoting again
      // and opening a second round. Passing them is safe because nothing in the
      // settlement route can authorise a trade: a tampered order hashes to a
      // commitment no verdict backs, and the executor refuses it.
      commitment:           swapCommitment,
      pendingOrder:         swapOrder ? serialiseOrder(swapOrder)
                            : liquidityOrder ? serialiseLiquidityOrder(liquidityOrder) : null,
      orderKind:            swapOrder ? 'swap' : liquidityOrder ? 'v2_add' : null,
      pendingProgram:       swapProgram,
      validationSubmitted:  action === 'SWAP' && Boolean(validationResult.txHash),
      quoted_amount_out:    swapOrder ? swapOrder.quotedAmountOut.toString() : null,
      min_amount_out:       swapOrder ? swapOrder.minAmountOut.toString() : null,
    });
  } catch (error) {
    console.error('API /genlayer-validate error (failing closed):', error);
    if (lease) lease.release();

    // FAIL CLOSED: Never return approved=true when consensus is unavailable
    return res.status(503).json({
      approved:         false,
      reason:           'Consensus unavailable - failed closed',
      proposal_id:      '',
      genlayer_contract: GENLAYER_CONFIG.agentValidator,
      contract_name:    'AgentValidator (GenLayer IC)',
      network:          GENLAYER_CONFIG.chainName,
      chainId:          GENLAYER_CONFIG.chainId,
      timestamp:        new Date().toISOString(),
      consensus_mode:   'Optimistic Democracy (GenVM)',
      is_write_flow:    false,
      live_execution:   false,
    });
  }
}
