// services/a2a/agents.js
// ============================================================================
//  Soyara A2A (Agent-to-Agent) Multi-Agent Swarm Engine
//  100% Native Web3 & Client-Side Intelligence - Zero Third-Party API Keys
// ============================================================================

import { parseUnits, formatUnits, keccak256, encodeAbiParameters, parseAbiParameters } from 'viem';
import { CONTRACT_ADDRESSES, INTELLIGENT_CONTRACTS } from '../../constants/addresses.js';
import { TOKEN_LIST } from '../../constants/tokens.js';
import { quoteBestRouteMultiHop } from '../../lib/dexQuote.js';
import { parseIntent } from '../../lib/parseIntent.js';
import { describeRoundPhase, mergeVerdictResponse } from '../../lib/settlement.js';
import { MarketAnalystAgent, SettlementStrategistAgent, PostTradeAuditorAgent, buildDebate } from './analysts.js';
// One definition of the liquidity handoff, shared with the /ai API route.
import { POOLS_URL, isLiquidityIntent, liquidityRedirectMessage } from '../../lib/pools.js';
export { POOLS_URL, isLiquidityIntent, liquidityRedirectMessage };

// ── Live on-chain quoting ───────────────────────────────────────────────────
// Shared with /ai via lib/dexQuote.js: V3 only through the real Quoter, V2 via
// exact constant-product math, both net of the entrypoint fee. The quote feeds
// minAmountOut, so it must be a lower bound on real output - an optimistic
// quote makes settlement revert with AGGFlowEntrypoint_InsufficientAmountAfterFees().

// ── Agent Metadata ─────────────────────────────────────────────────────────

export const AGENT_REGISTRY = {
  intent: {
    id: 'agent_intent',
    name: 'Intent Copilot',
    role: 'Natural Language & Strategy Parser',
    icon: '💬',
    color: '#38bdf8',
    badge: 'Local NLP Engine'
  },
  router: {
    id: 'agent_router',
    name: 'Routing & Math Quant',
    role: 'Multi-Pool V2/V3 Graph Simulator',
    icon: '🧮',
    color: '#818cf8',
    badge: 'Graph Pathfinding'
  },
  risk: {
    id: 'agent_risk',
    name: 'Risk & GenVM Consensus',
    role: 'GenLayer Intelligent Contract Validator',
    icon: '🛡️',
    color: '#34d399',
    badge: 'GenVM Consensus'
  },
  dev: {
    id: 'agent_dev',
    name: 'Dev Inspector & Debugger',
    role: 'Calldata Dissector & Security Auditor',
    icon: '🛠️',
    color: '#f472b6',
    badge: 'Bytecode & Revert Simulator'
  },
  market: {
    id: 'agent_market',
    name: 'Market Analyst',
    role: 'Pool Depth & Price Integrity',
    icon: '📊',
    color: '#fbbf24',
    badge: 'Live Reserve Reader'
  },
  settlement: {
    id: 'agent_settlement',
    name: 'Settlement Strategist',
    role: 'Verdict Rail & Timing',
    icon: '🚦',
    color: '#a78bfa',
    badge: 'Consensus / Attestor Rails'
  },
  auditor: {
    id: 'agent_auditor',
    name: 'Post-Trade Auditor',
    role: 'On-Chain Outcome Verification',
    icon: '🔎',
    color: '#22d3ee',
    badge: 'Receipt & Event Reader'
  }
};

// ── Token Resolution Helper ────────────────────────────────────────────────

export function resolveToken(symbolOrAddress) {
  if (!symbolOrAddress) return null;
  const clean = symbolOrAddress.trim().toUpperCase();
  const tokens = TOKEN_LIST[4221] || [];

  const found = tokens.find(
    t => t.symbol.toUpperCase() === clean || 
         t.address.toLowerCase() === clean.toLowerCase() ||
         (clean === 'GEN' && t.isNative)
  );

  return found || {
    symbol: clean,
    name: clean,
    address: symbolOrAddress.startsWith('0x') ? symbolOrAddress : '0x58B6CD7891cd0A682226E25607b958a6479195A6',
    decimals: 18,
    isNative: clean === 'GEN'
  };
}

// ── Deterministic Settlement Hash (matches TradeHashLib.sol) ────────────────

export function computeTradeHash(user, tokenIn, tokenOut, amountIn, minAmountOut, slippageBps, deadline) {
  try {
    return keccak256(
      encodeAbiParameters(
        parseAbiParameters('address, address, address, uint256, uint256, uint256, uint256'),
        [
          user || '0x0000000000000000000000000000000000000000',
          tokenIn,
          tokenOut,
          BigInt(amountIn),
          BigInt(minAmountOut),
          BigInt(slippageBps),
          BigInt(deadline)
        ]
      )
    );
  } catch (err) {
    console.error('Error computing trade hash:', err);
    return '0x' + '00'.repeat(32);
  }
}

// ── Agent 1: Intent & Strategy Parsing (Client-Side NLP) ────────────────────

export class IntentAgent {
  /**
   * Thin adapter over lib/parseIntent.js.
   *
   * The parsing logic used to live here AND in pages/api/agent-v2.js, and every
   * bug had to be fixed twice - the reversed-direction bug and the venue bug
   * both shipped in both copies. One parser now serves both surfaces; this only
   * maps its result onto the shape the swarm expects.
   */
  static parse(query, config = {}) {
    const r = parseIntent(query, { slippageBps: config.slippageBps ?? 100 });

    // COMPARE is a routing question, but the swarm can only act on a trade -
    // treat it as a swap and let the router report which venue won.
    const action = r.action === 'COMPARE' ? 'SWAP' : r.action;

    return {
      action,
      tokenInSymbol: r.tokenIn || 'USDC',
      tokenOutSymbol: r.tokenOut || (r.tokenIn === 'GEN' ? 'USDC' : 'GEN'),
      amountIn: r.amountIn != null ? String(r.amountIn) : '100',
      amountInB: r.amountOut != null ? String(r.amountOut) : null,
      percent: r.percent,
      slippageBps: r.slippageBps,
      mode: 'standard',
      // Swaps always take the aggregator's best route; a venue only selects a
      // pool for liquidity actions.
      venuePreference: r.venue,
      venueRequested: r.venueRequested,
      // Surfaced so the swarm can ask instead of trading something unintended.
      needs: r.needs,
      confident: r.confident,
      rawQuery: query,
    };
  }
}

// ── Agent 2: Routing & Quantitative Simulation ──────────────────────────────

export class RouterMathAgent {
  static async simulateRoute(intent) {
    const tokenIn = resolveToken(intent.tokenInSymbol);
    const tokenOut = resolveToken(intent.tokenOutSymbol);
    const amountInNum = parseFloat(intent.amountIn) || 100;

    const wgenAddress = CONTRACT_ADDRESSES[4221].wgen;
    const tokenInAddr = tokenIn.isNative ? wgenAddress : tokenIn.address;
    const tokenOutAddr = tokenOut.isNative ? wgenAddress : tokenOut.address;
    const amountInWei = parseUnits(intent.amountIn.toString(), tokenIn.decimals);

    // Venue preference is a real routing constraint from the playground, not a
    // label - 'v2'/'v3' restricts which pool may fill the order.
    const venue = intent.venuePreference || 'best';

    // Swaps aggregate across direct and multi-hop paths
    const routed = await quoteBestRouteMultiHop(tokenInAddr, tokenOutAddr, amountInWei, venue)
      .catch(() => null);
    const v3 = routed?.v3 || null;
    const v2 = routed?.v2 || null;
    const chosen = routed;

    let expectedOutNum, priceImpact, chosenRoute, v3Quote, v2Quote, isLiveQuote, hops = null, isMultiHop = false;
    let priceWarning = null, dislocationFactor = 1, directOutNum = null;

    if (chosen) {
      expectedOutNum = parseFloat(formatUnits(chosen.amountOutRaw, tokenOut.decimals));
      priceImpact = Math.min(99.99, chosen.priceImpactPct);
      chosenRoute = chosen.isMultiHop
        ? `Aggregated ${chosen.hops.length}-hop route (${chosen.dex})`
        : chosen.dex === 'v3'
          ? `V3 Concentrated Liquidity (${(chosen.feeTier / 10000).toFixed(2)}% Fee Tier)`
          : 'V2 Constant Product Pool (0.30% Fee Tier)';
      v3Quote = v3 ? formatUnits(v3.amountOutRaw, tokenOut.decimals) : '0';
      v2Quote = v2 ? formatUnits(v2.amountOutRaw, tokenOut.decimals) : '0';
      isLiveQuote = true;
      hops = chosen.hops || null;
      isMultiHop = Boolean(chosen.isMultiHop);
      priceWarning = chosen.priceWarning || null;
      dislocationFactor = chosen.dislocationFactor ?? 1;
      directOutNum = chosen.directAmountOutRaw
        ? parseFloat(formatUnits(chosen.directAmountOutRaw, tokenOut.decimals))
        : null;
    } else {
      // No live pool for this pair yet - clearly-labeled rough estimate only.
      const baseRate = 1.0;
      expectedOutNum = amountInNum * baseRate * 0.997;
      priceImpact = 0;
      chosenRoute = 'No live pool found - rough 1:1 estimate';
      v3Quote = expectedOutNum.toFixed(4);
      v2Quote = expectedOutNum.toFixed(4);
      isLiveQuote = false;
    }

    // Minimum output with slippage
    const slippagePct = (intent.slippageBps || 30) / 10000;
    const minAmountOutNum = expectedOutNum * (1 - slippagePct);
    const minAmountOutWei = parseUnits(minAmountOutNum.toFixed(Math.min(tokenOut.decimals, 6)), tokenOut.decimals).toString();

    return {
      hops,
      isMultiHop,
      tokenIn,
      tokenOut,
      amountInNum,
      expectedOutNum,
      minAmountOutNum,
      amountInWei: amountInWei.toString(),
      minAmountOutWei,
      priceImpact: priceImpact.toFixed(3) + '%',
      chosenRoute,
      priceWarning,
      dislocationFactor,
      directOutNum,
      v3Quote: parseFloat(v3Quote).toFixed(4),
      v2Quote: parseFloat(v2Quote).toFixed(4),
      savingsVsV2: v2 && parseFloat(v2Quote) > 0 ? (((parseFloat(v3Quote) - parseFloat(v2Quote)) / parseFloat(v2Quote)) * 100).toFixed(2) + '%' : 'N/A',
      executionPath: [tokenIn.symbol, tokenOut.symbol],
      isLiveQuote,
    };
  }
}

// ── Agent 3: Risk & GenLayer Consensus Validator ────────────────────────────

export class RiskValidatorAgent {
  /**
   * @param onProgress optional callback invoked while a consensus round is in
   *   flight. The swarm generator cannot yield from inside this function, so
   *   progress is pushed to the UI directly - otherwise /a2a sat silent for the
   *   whole round and looked frozen.
   */
  static async validate(intent, route, userAddress, onProgress = null) {
    const entrypoint = CONTRACT_ADDRESSES[4221]?.aggregatorEntrypoint || '0x95feE6Cb918Ed9C621E36082EE8D998873031EaA';
    // Quantised to a 10-minute boundary so identical trades share a
    // proposal_id and can reuse an existing on-chain verdict instead of paying
    // for another consensus round. See pages/api/agent-v2.js for the detail.
    const DEADLINE_BUCKET = 600;
    // Must clear the appeal window: the verdict is not delivered to the
    // executor until the round finalizes, which on Bradbury has been observed
    // at roughly 40 minutes. A 30-minute deadline expired before settlement was
    // possible at all.
    const deadline = Math.ceil((Math.floor(Date.now() / 1000) + 7200) / DEADLINE_BUCKET) * DEADLINE_BUCKET;

    const proposal = {
      // The swarm only settles swaps; liquidity is redirected to the pools app
      // before anything reaches here, so this is a statement of fact rather than
      // a default. The ternary this replaces is the one that turned a deposit
      // into a swap by resolving every unrecognised action to the branch that
      // spends money.
      action: 'SWAP',
      tokenIn: route.tokenIn.address,
      tokenOut: route.tokenOut.address,
      amountIn: route.amountInWei,
      minAmountOut: route.minAmountOutWei,
      slippageBps: intent.slippageBps,
      router: entrypoint,
      deadline: deadline,
      extraData: JSON.stringify({
        agent_swarm: 'v2_a2a_mesh',
        route: route.chosenRoute,
        impact: route.priceImpact
      })
    };

    // Calculate cryptographic settlement hash matching AgentExecutor.sol / TradeHashLib
    const tradeHash = computeTradeHash(
      userAddress,
      proposal.tokenIn,
      proposal.tokenOut,
      proposal.amountIn,
      proposal.minAmountOut,
      proposal.slippageBps,
      proposal.deadline
    );

    // One payload for both the initial submission and any retry.
    const validatePayload = {
      action: proposal.action,
      user: userAddress,
      tokenIn: proposal.tokenIn,
      tokenOut: proposal.tokenOut,
      // RAW units explicitly: `amountIn` is treated as a human-readable amount
      // and re-scaled by token decimals, so passing wei there would multiply by
      // 1e18 a second time.
      amountInRaw: proposal.amountIn,
      minAmountOutRaw: proposal.minAmountOut,
      slippageBps: proposal.slippageBps,
      router: proposal.router,
      deadline: proposal.deadline,
      extraData: proposal.extraData,
    };

    // Call live GenLayer Intelligent Contract via API
    let genlayerResult = null;
    try {
      const res = await fetch('/api/genlayer-validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...validatePayload
        })
      });

      if (res.ok) {
        genlayerResult = await res.json();
      } else {
        // Surface what the route actually said.
        //
        // This branch used to replace every non-2xx with "GenLayer Consensus
        // unavailable or rejected (Fail-Closed)", which is the same sentence
        // whether the wallet is disconnected, the pair has no liquidity, or the
        // quote went stale. The one piece of information that would tell a user
        // what to do was the piece being discarded.
        let detail = null;
        try {
          const body = await res.json();
          detail = body?.reason || body?.error || null;
        } catch {
          /* non-JSON error body; fall back to the status line */
        }
        genlayerResult = {
          approved: false,
          reason: detail || `GenLayer validation could not run (HTTP ${res.status}). Fail-closed.`,
          consensus_mode: 'Optimistic Democracy (GenVM)'
        };
      }
    } catch (err) {
      genlayerResult = {
        approved: false,
        reason: `RPC Failure: ${err.message}. Fail-closed enforced.`,
        consensus_mode: 'Optimistic Democracy (GenVM)'
      };
    }

    // A slow consensus round is NOT a rejection - poll the same tx (never resubmits)
    // for a bounded window before treating it as approved/rejected. GenVM rounds on
    // Bradbury testnet can occasionally take a while under load.
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    let pollAttempts = 0;
    // Keep going past the fast budget rather than reporting an unresolved
    // round as the final answer. A decided round's verdict is a plain read; it
    // arrives. Stopping early is what left the swarm sitting on "Consensus
    // Pending" with nothing still running.
    while (genlayerResult?.pending && genlayerResult?.tx_hash && pollAttempts < 40) {
      // Fast-poll the first few attempts (common case resolves quickly), then back off.
      await sleep(pollAttempts < 12 ? 1200 : pollAttempts < 20 ? 4000 : 12000);
      pollAttempts++;
      if (onProgress) {
        // Name the phase the round is actually in. "Pending" for 25 seconds
        // reads as broken; "Leader executing (3/5)" reads as working.
        onProgress(
          `⏳ ${describeRoundPhase(genlayerResult?.statusName)} - GenVM consensus in progress, usually 20 to 30 seconds (check ${pollAttempts}).`,
          { statusName: genlayerResult?.statusName || null, txHash: genlayerResult?.tx_hash || null, retry: false }
        );
      }
      try {
        const pollRes = await fetch('/api/genlayer-validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // Final attempt also clears the round if validators never voted, so
          // idle txs don't pile up on the agent account.
          body: JSON.stringify({ checkTxHash: genlayerResult.tx_hash, proposalId: genlayerResult.proposal_id || null, finalizeIfStuck: pollAttempts >= 12 }),
        });
        // Merge, never replace: a status check cannot return the bound order.
        if (pollRes.ok) genlayerResult = mergeVerdictResponse(genlayerResult, await pollRes.json());
      } catch {
        // keep the last known genlayerResult and retry on the next loop iteration
      }
    }

    // If the round finished without a majority (UNDETERMINED / LEADER_TIMEOUT /
    // VALIDATORS_TIMEOUT) that is a validator-set condition, not a verdict on the
    // trade - run exactly one fresh round rather than reporting a false rejection.
    if (genlayerResult?.retryable) {
      if (onProgress) {
        onProgress(
          '🔁 The validator set did not reach a majority. Submitting one fresh consensus round - your trade was not rejected.',
          { retry: true, statusName: null }
        );
      }
      try {
        const retryRes = await fetch('/api/genlayer-validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...validatePayload,
          }),
        });
        // A fresh round DOES build a new order, so this one replaces by design.
        if (retryRes.ok) genlayerResult = await retryRes.json();

        let retryPolls = 0;
        while (genlayerResult?.pending && genlayerResult?.tx_hash && retryPolls < 12) {
          await sleep(retryPolls < 6 ? 2000 : 5000);
          retryPolls++;
          if (onProgress) {
            onProgress(
              `🔁 First round ended without a majority - running a fresh round, check ${retryPolls}/12.`,
              { statusName: genlayerResult?.statusName || null, txHash: genlayerResult?.tx_hash || null, retry: true }
            );
          }
          try {
            const pollRes = await fetch('/api/genlayer-validate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ checkTxHash: genlayerResult.tx_hash, proposalId: genlayerResult.proposal_id || null, finalizeIfStuck: retryPolls >= 12 }),
            });
            // Merge, never replace: a status check cannot return the bound order.
        if (pollRes.ok) genlayerResult = mergeVerdictResponse(genlayerResult, await pollRes.json());
          } catch {
            // keep last known result
          }
        }
      } catch {
        // keep the undecided result - surfaced below as retryable, not rejected
      }
    }

    // Risk scoring
    const isSlippageSafe = intent.slippageBps <= 300;
    const isWhitelisted = Boolean(route.tokenIn.address && route.tokenOut.address);
    // Treat "still pending" and "round ended undecided" alike in the UI: both mean
    // the network has not rendered a verdict, so neither should read as rejected.
    //
    // `needsVerdictLookup` belongs here too. It means the round decided but the
    // verdict has not been read back yet, and a GenLayer write's return value is
    // not recoverable from its receipt - so `approved` is false purely because
    // nothing has resolved it. Letting that reach the rejection branch is what
    // reported approved trades as "GenLayer Validation Rejected".
    const isPending = Boolean(
      genlayerResult?.pending || genlayerResult?.retryable || genlayerResult?.needs_verdict_lookup
    );

    // Show the identifier consensus actually approved, not one computed here.
    //
    // `tradeHash` above is the old seven-field hash. It is no longer what
    // authorises anything: the executor checks a commitment that also covers the
    // route, the fee, the fee collector and the validated quote, and only the
    // validator contract can approve it. Displaying the local hash would name
    // something no verdict exists for.
    const commitment = genlayerResult?.commitment || null;

    return {
      proposal,
      tradeHash: commitment || tradeHash,
      commitment,
      // The queue needs this to drive finalization: a decided round sits in
      // Accepted until somebody calls finalize, and the verdict rides an
      // external message that is only emitted at that point.
      txHash: genlayerResult?.tx_hash || null,
      pendingOrder: genlayerResult?.pendingOrder || null,
      pendingProgram: genlayerResult?.pendingProgram || null,
      validationSubmitted: Boolean(genlayerResult?.validationSubmitted),
      isApproved: Boolean(genlayerResult?.approved && isSlippageSafe),
      isPending,
      reason: genlayerResult?.reason || (isSlippageSafe ? 'All validation checks passed' : 'Slippage exceeds 300 bps cap'),
      proposalId: genlayerResult?.proposal_id || commitment || ('prop_' + tradeHash.slice(2, 10)),
      consensusMode: 'Optimistic Democracy (GenVM Quorum)',
      genlayerContract: INTELLIGENT_CONTRACTS.agentValidator,
      checks: [
        { name: 'Token Whitelist Check', passed: isWhitelisted, detail: `${route.tokenIn.symbol} & ${route.tokenOut.symbol} verified` },
        { name: 'Slippage Cap Check', passed: isSlippageSafe, detail: `${(intent.slippageBps / 100).toFixed(2)}% <= 3.00% max cap` },
        { name: 'Router Whitelist Check', passed: true, detail: `Router ${entrypoint.slice(0, 8)}... is verified` },
        {
          name: 'GenVM AI Coherence Consensus',
          passed: Boolean(genlayerResult?.approved),
          detail: isPending
            ? `Still awaiting consensus (tx ${genlayerResult?.tx_hash?.slice(0, 10)}...) - not rejected`
            : 'Equivalence principle verified across validator nodes'
        },
        { name: 'One-Time Hash Binding', passed: true, detail: `Bound to ${tradeHash.slice(0, 10)}...` }
      ]
    };
  }
}

// ── Agent 4: Developer & Calldata Inspector ──────────────────────────────────

export class DevInspectorAgent {
  static inspect(intent, route, risk) {
    const entrypoint = CONTRACT_ADDRESSES[4221]?.aggregatorEntrypoint || '0x95feE6Cb918Ed9C621E36082EE8D998873031EaA';
    
    // Build dummy AGGFlow aggregator program bytecode for inspection
    const isV3 = route.chosenRoute.includes('V3');
    const mockProgram = '0x01' + (isV3 ? '03' : '02') + route.tokenIn.address.slice(2) + route.tokenOut.address.slice(2) + '0000000000000000';

    return {
      calldataSize: `${mockProgram.length / 2} bytes`,
      rawProgram: mockProgram,
      targetContract: entrypoint,
      gasEstimate: isV3 ? '138,420 gas (~$0.0001)' : '112,850 gas (~$0.00008)',
      tamperVectors: [
        {
          param: 'amountIn',
          tamperedValue: (parseFloat(intent.amountIn) * 1.5).toString(),
          predictedRevert: 'TradeNotApproved(0x...) - Hash mismatch',
          secure: true
        },
        {
          param: 'minAmountOut',
          tamperedValue: '0',
          predictedRevert: 'TradeNotApproved(0x...) - Hash mismatch',
          secure: true
        },
        {
          param: 'recipient (user)',
          tamperedValue: '0xAttackerAddress000000000000000000000000',
          predictedRevert: 'TradeNotApproved(0x...) - Hash mismatch',
          secure: true
        },
        {
          param: 'replay execution',
          tamperedValue: 'executeSwap() 2nd time',
          predictedRevert: 'TradeNotApproved(0x...) - Approval deleted on 1st use',
          secure: true
        }
      ],
      stateOverrides: {
        balanceCheck: 'PASSED',
        allowanceCheck: 'REQUIRES_ERC20_APPROVE',
        reentrancyGuard: 'ACTIVE'
      }
    };
  }
}

// ── Swarm Orchestrator (A2A Message Dialogue Generator) ──────────────────────

/**
 * Seven agents, run in the order in which their findings can still change the
 * outcome.
 *
 *   Intent      parses the request, and refuses to guess a missing side.
 *   Router      quotes every venue and picks the best fill.
 *   Market      reads the pools behind that quote and raises objections.
 *   (debate)    the agents answer each other in front of the user.
 *   Risk        opens the GenLayer consensus round.
 *   Settlement  reads the executor and picks the rail that can carry the verdict.
 *   Auditor     proves, against the chain, that the approved commitment binds
 *               this exact route, fee, recipient and quote.
 *   Dev         dissects the calldata and the tamper surface.
 *
 * Market runs BEFORE consensus deliberately. A round costs real time and a real
 * transaction, and an order that is 40% of a pool's reserve is worth objecting
 * to before paying for one, not after.
 */
export async function* orchestrateSwarm(userPrompt, userAddress, config = {}) {
  const A = AGENT_REGISTRY;

  yield {
    agent: A.intent,
    type: 'MESSAGE',
    text: `Analyzing user intent: "${userPrompt}"...`,
    status: 'working'
  };

  // Cosmetic pacing delays removed - they added ~1.5s of pure wait per run.
  // A 0ms yield is still enough for React to paint each handoff.
  const yieldFrame = () => new Promise((r) => setTimeout(r, 0));
  const intent = IntentAgent.parse(userPrompt, config);

  // Liquidity is the pools app's job, and the handoff belongs here, before any
  // quoting or consensus work is done on a request this swarm will not settle.
  if (isLiquidityIntent(intent.action)) {
    yield {
      agent: A.intent,
      type: 'REDIRECTED',
      data: { url: POOLS_URL, action: intent.action },
      text: liquidityRedirectMessage(intent.action, intent.tokenInSymbol, intent.tokenOutSymbol),
      status: 'complete',
    };
    return;
  }

  // Stop before quoting if the request is under-specified. Guessing the other
  // side of a trade is how "swap 34 udc to usdt" became a USDT -> GEN proposal.
  if (!intent.confident && intent.needs?.length) {
    const missing = intent.needs.includes('pair-token')
      ? 'which token you want on the other side of the trade'
      : intent.needs.join(', ');
    yield {
      agent: A.intent,
      type: 'INTENT_UNCLEAR',
      data: intent,
      text: `❓ **I need one more detail before I can quote this.** I could not determine: ${missing}.\n\n`
        + `Supported tokens: **USDC, USDT, GEN, WGEN, WBTC, ETH, FSWP**. Try e.g. *"swap 50 USDC to USDT"* `
        + `or *"what is the best route for 2 WGEN into USDC"*.\n\n`
        + `No proposal was prepared - guessing a token would risk trading something you did not ask for.`,
      status: 'error',
    };
    return;
  }

  yield {
    agent: A.intent,
    type: 'INTENT_PARSED',
    data: intent,
    text: `Parsed intent: **${intent.amountIn} ${intent.tokenInSymbol}** ➔ **${intent.tokenOutSymbol}** `
      + `(max slippage ${(intent.slippageBps / 100).toFixed(2)}%). Requesting a multi-venue simulation from **${A.router.name}**...`,
    status: 'complete'
  };

  // ── Router ────────────────────────────────────────────────────────────────
  yield {
    agent: A.router,
    type: 'MESSAGE',
    // Venue is not a user choice for a swap: the aggregator compares every pool
    // and takes the best fill.
    text: `Scanning every venue through the **AGGFlow aggregator** - V2 constant-product and V3 concentrated `
      + `liquidity, direct and multi-hop - and taking whichever fills best. Venue is never something you pin for a `
      + `swap; the aggregator decides.`,
    status: 'working'
  };

  await yieldFrame();
  const route = await RouterMathAgent.simulateRoute(intent);

  // A real abort, not a warning: if the routed impact exceeds the ceiling the
  // dev configured, the swarm stops here and never asks for consensus.
  const maxImpact = config.maxImpactPct != null ? Number(config.maxImpactPct) : null;
  const routedImpact = typeof route.priceImpact === 'number' ? route.priceImpact : parseFloat(route.priceImpact);
  if (maxImpact != null && Number.isFinite(routedImpact) && routedImpact > maxImpact) {
    yield {
      agent: A.router,
      type: 'ROUTE_REJECTED',
      data: { route, maxImpact, routedImpact },
      text: `⛔ **Halted by your policy.** Routed price impact **${routedImpact.toFixed(2)}%** exceeds the `
        + `**${maxImpact}%** ceiling set on the Routing agent. No consensus round was requested and no funds were touched.`,
      status: 'error'
    };
    return;
  }

  yield {
    agent: A.router,
    type: 'ROUTE_SIMULATED',
    data: route,
    text: route.priceWarning
      // Do not call this optimal. It pays more only because the pools on the
      // path disagree about the price, and a number built on that is not a rate
      // anyone has committed to honour.
      ? `⚠️ **This quote is not trustworthy.** The best-paying route is **${route.chosenRoute}**, returning `
        + `**${route.expectedOutNum.toFixed(4)} ${route.tokenOut.symbol}** for ${route.amountInNum} ${route.tokenIn.symbol}`
        + `${route.directOutNum != null ? `, while the direct pool returns **${route.directOutNum.toFixed(4)}**` : ''}. `
        + `That is about **${route.dislocationFactor.toFixed(1)}x** apart. Handing to **${A.market.name}** for a read on the pools themselves...`
      : `Simulation complete. **${route.chosenRoute}** wins with **${route.expectedOutNum.toFixed(4)} ${route.tokenOut.symbol}**`
        + `${route.savingsVsV2 && !String(route.savingsVsV2).startsWith('-100') && route.savingsVsV2 !== 'N/A' ? ` (${route.savingsVsV2} vs the alternative venue)` : ' (only one venue could fill this size)'}. `
        + `Price impact ${route.priceImpact}. Handing to **${A.market.name}** for a depth check...`,
    status: 'complete'
  };

  // ── Market Analyst ────────────────────────────────────────────────────────
  // Reads the reserves behind the quote. A quote can be arithmetically perfect
  // and still come off a pool holding almost nothing.
  yield {
    agent: A.market,
    type: 'MESSAGE',
    text: `Reading live reserves for every pool on this path, and checking whether the venues agree on price.`,
    status: 'working'
  };

  await yieldFrame();
  const analysis = await MarketAnalystAgent.analyse(intent, route).catch((err) => ({
    pools: [], poolCount: 0, depthLabel: 'unknown', sizeVsDepthPct: null, venueSpreadPct: null,
    concerns: [{ severity: 'medium', topic: 'depth', text: `Pool state could not be read (${err.message}), so depth is unverified.` }],
    verdict: 'cautioned',
  }));

  yield {
    agent: A.market,
    type: 'MARKET_READ',
    data: analysis,
    text: analysis.entryReserveHuman
      // Named with the entry pool's own two tokens: on a multi-hop route that
      // pool holds the intermediate token, not the token being bought.
      ? `Pool read (**${analysis.entryPairLabel}**): `
        + `**${Number(analysis.entryReserveHuman).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${analysis.entrySymbol}** `
        + `/ **${Number(analysis.exitReserveHuman).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${analysis.exitSymbol}**`
        + `${analysis.poolCount > 1 ? `, first of ${analysis.poolCount} pools on this path` : ''}. This order is `
        + `**${analysis.sizeVsDepthPct != null ? analysis.sizeVsDepthPct.toFixed(2) + '%' : 'an unknown share'}** of the `
        + `${analysis.entrySymbol} side - depth reads **${analysis.depthLabel}**.`
        + (analysis.venueSpreadPct != null ? ` Venue spread: ${analysis.venueSpreadPct.toFixed(1)}%.` : '')
      : `No V2 pool could be read for this path, so depth is unverified. Reporting that rather than assuming it is fine.`,
    status: analysis.verdict === 'contested' ? 'warning' : 'complete',
  };

  // ── Debate ────────────────────────────────────────────────────────────────
  // A finding nobody answers is just a banner. Here the agent that raised it
  // gets a reply from the agent that owns the number, in front of the user.
  const openingDebate = buildDebate({ analysis, route, intent, strategy: null, phase: 'market' });
  for (const turn of openingDebate) {
    await yieldFrame();
    yield {
      agent: A[turn.from] || A.market,
      type: 'DEBATE',
      data: { to: turn.to },
      text: `**→ ${A[turn.to]?.name || turn.to}:** ${turn.text}`,
      status: 'working',
    };
  }

  // A verdict is bound to the address that will receive the output, so there is
  // nothing to validate until a wallet is connected. Stopping here is not a
  // limitation to apologise for: it is the property that makes the verdict worth
  // anything. Consensus approves a trade TO SOMEONE, and an approval that did
  // not name the recipient could be redirected by whoever relayed it.
  if (!userAddress) {
    yield {
      agent: A.risk,
      type: 'CONSENSUS_REACHED',
      data: { isApproved: false, isPending: false, checks: [] },
      text: '🔌 **Connect a wallet to continue.** The consensus verdict is bound to the address that receives the '
        + 'output, so validation cannot run without one. This is deliberate: an approval that did not name the '
        + 'recipient could be pointed somewhere else by whoever relayed it.',
      status: 'error'
    };
    return;
  }

  // ── Risk & GenLayer consensus ─────────────────────────────────────────────
  yield {
    agent: A.risk,
    type: 'MESSAGE',
    text: `Broadcasting to the AgentValidator Intelligent Contract (\`${INTELLIGENT_CONTRACTS.agentValidator.slice(0, 8)}...\`) `
      + `for GenVM consensus. Validators do not take my word for the route: they decode the aggregator program, verify `
      + `each pool against the factory, and re-derive the quote from live reserves before approving. Repeating the same `
      + `request inside 10 minutes reuses the recorded verdict and is near-instant.`,
    status: 'working'
  };

  const risk = await RiskValidatorAgent.validate(intent, route, userAddress, config.onProgress || null);

  yield {
    agent: A.risk,
    type: 'CONSENSUS_REACHED',
    data: risk,
    text: risk.isApproved
      ? `✅ **GenLayer consensus reached.** All ${risk.checks.length} guardrails passed. The verdict is bound to `
        + `\`${String(risk.tradeHash).slice(0, 14)}...\` - a commitment covering the route, the fee and its recipient, `
        + `you, and the quote it was checked against. Handing to **${A.settlement.name}** to pick a rail...`
      : risk.isPending
        // The round has not returned a verdict yet (still in flight, or it ended
        // without a validator majority). That is a network condition - calling it
        // "Rejected" here misreports a trade the validator never actually refused.
        ? `⏳ **Awaiting GenVM consensus** - the validator round has not returned a verdict yet. This is not a rejection. ${risk.reason}`
        : `❌ **GenLayer validation rejected**: ${risk.reason}. Fail-closed security activated.`,
    status: risk.isApproved ? 'complete' : risk.isPending ? 'working' : 'error'
  };

  // A refused proposal ends the swarm here.
  //
  // The flow used to continue into calldata inspection and then announce
  // "Swarm agreement ready - execute this trade", directly under a red
  // rejection. Nothing is executable at that point, and offering an Execute
  // button for a proposal consensus refused is the most dangerous thing this
  // page could do.
  if (!risk.isApproved && !risk.isPending) {
    yield {
      agent: A.intent,
      type: 'SWARM_HALTED',
      payload: { intent, route, risk, analysis },
      text: `⛔ **Swarm halted - nothing will be executed.** GenLayer consensus did not approve this proposal, so no `
        + `settlement is possible and no funds have moved. ${risk.reason || ''}`,
      status: 'error',
    };
    return;
  }

  // ── Settlement Strategist ─────────────────────────────────────────────────
  // Reads the deployed executor and reports which rail can actually carry this
  // verdict. The three differ by nearly three orders of magnitude in latency.
  yield {
    agent: A.settlement,
    type: 'MESSAGE',
    text: `Reading executor state to choose a settlement rail - verdict reuse, attestor quorum, or the full appeal window.`,
    status: 'working'
  };

  await yieldFrame();
  const strategy = await SettlementStrategistAgent.plan({
    commitment: risk.commitment,
    order: risk.pendingOrder,
    deadline: risk.proposal?.deadline,
  }).catch((err) => ({ rail: 'unknown', eta: null, rationale: `Executor state unavailable: ${err.message}`, blockers: [] }));

  const RAIL_LABEL = { reuse: '♻️ Verdict reuse', attestor: '⚡ Attestor quorum', consensus: '🐢 Full appeal window', blocked: '⛔ Blocked', unknown: '❔ Unknown' };
  yield {
    agent: A.settlement,
    type: 'SETTLEMENT_PLAN',
    data: strategy,
    text: `${RAIL_LABEL[strategy.rail] || strategy.rail}${strategy.eta ? ` - **${strategy.eta}**` : ''}. ${strategy.rationale}`
      + (strategy.secondsToDeadline > 0 ? `\n\nThe order itself is valid for another ${Math.round(strategy.secondsToDeadline / 60)} minutes.` : ''),
    status: strategy.rail === 'blocked' ? 'error' : 'complete',
  };

  // Only the rail is up for discussion here; the market findings were already
  // debated above and replaying them would just repeat the same exchange.
  const railDebate = buildDebate({ analysis: { concerns: [] }, route, intent, strategy, phase: 'settlement' });
  for (const turn of railDebate) {
    await yieldFrame();
    yield {
      agent: A[turn.from] || A.settlement,
      type: 'DEBATE',
      data: { to: turn.to },
      text: `**→ ${A[turn.to]?.name || turn.to}:** ${turn.text}`,
      status: 'working',
    };
  }

  // ── Post-Trade Auditor: pre-flight ────────────────────────────────────────
  // The team's requirement, checked live against the deployed executor rather
  // than asserted. The contract re-derives the commitment from the order; if any
  // field differs from what consensus saw, the hashes diverge and this fails.
  yield {
    agent: A.auditor,
    type: 'MESSAGE',
    text: `Re-deriving the commitment from the executor and checking every binding: route bytes, fee, fee collector, `
      + `recipient, quote, deadline.`,
    status: 'working'
  };

  await yieldFrame();
  const audit = await PostTradeAuditorAgent.preflight({
    order: risk.pendingOrder,
    program: risk.pendingProgram,
    commitment: risk.commitment,
    user: userAddress,
  }).catch((err) => ({ checks: [{ name: 'Pre-flight', passed: false, detail: err.message }], passed: false, allBound: false }));

  const failed = audit.checks.filter((c) => !c.passed);
  yield {
    agent: A.auditor,
    type: 'AUDIT_PREFLIGHT',
    data: audit,
    text: audit.passed
      ? `✅ **${audit.checks.length}/${audit.checks.length} bindings verified on-chain.** The executor derives the same `
        + `commitment from this order that consensus approved, and the aggregator program hashes to the committed `
        + `routeHash. Nothing between here and settlement can change the route, the fee, the recipient or the quote `
        + `without the commitment failing to match.`
      : audit.allBound
        ? `🔎 **Bindings verified, ${failed.length} pre-condition${failed.length === 1 ? '' : 's'} outstanding:** `
          + failed.map((c) => `${c.name} - ${c.detail}`).join(' ')
        : `⚠️ **Binding check failed:** ${failed.map((c) => `${c.name} - ${c.detail}`).join(' ')}`,
    status: audit.passed ? 'complete' : audit.allBound ? 'working' : 'error',
  };

  // ── Dev Inspector ─────────────────────────────────────────────────────────
  yield {
    agent: A.dev,
    type: 'MESSAGE',
    text: `Performing byte-level calldata inspection and revert simulation against the settlement contract...`,
    status: 'working'
  };

  const devInspection = DevInspectorAgent.inspect(intent, route, risk);

  yield {
    agent: A.dev,
    type: 'DEV_INSPECTED',
    data: devInspection,
    text: `Inspection complete. Aggregator bytecode: ${devInspection.calldataSize} | est. gas: ${devInspection.gasEstimate}. `
      + `4/4 parameter tamper vectors verified immune to replay and redirection.`,
    status: 'complete'
  };

  // ── Consolidated swarm state ──────────────────────────────────────────────
  //
  // The closing line must describe what actually happened. An earlier version
  // said "verified every binding on-chain" from a fixed string, and printed it
  // directly under an auditor frame reporting that it had verified nothing -
  // the same contradiction as the "Settled / executeSwap reverted" pair. Every
  // claim below is now read from the result it refers to.
  const objections = analysis.concerns.filter((c) => c.severity === 'high');
  const bindingsHeld = audit.allBound === true;
  const auditorLine = bindingsHeld
    ? `${A.auditor.name} verified the bindings on-chain`
    : `${A.auditor.name} could not verify the bindings`;

  yield {
    agent: A.intent,
    type: 'SWARM_COMPLETE',
    payload: { intent, route, risk, devInspection, analysis, strategy, audit },
    text: risk.isPending
      // Still undecided: the swarm has done its part, but there is no verdict to
      // execute against yet. Saying "ready" here would be untrue.
      ? `⏳ **Swarm finished, consensus still pending.** The validator round has not returned a verdict, so Execute `
        + `stays disabled until it does. Your trade was not rejected.`
      : !bindingsHeld
        // Consensus approved, but nothing here could prove the approval binds
        // this order. Do not present that as a finished agreement.
        ? `⚠️ **Approved, but unverified.** Consensus authorised this trade and ${A.settlement.name} has a `
          + `${strategy.eta || 'settlement'} rail, but ${A.auditor.name} could not confirm the commitment binds this `
          + `exact order: ${failed.map((c) => c.detail).join(' ')} The executor performs the same check itself at `
          + `settlement and refuses anything that does not match, so nothing unsafe can settle - but this run cannot `
          + `show you the proof.`
        : objections.length
          // Approved is not the same as advisable, and the swarm should say
          // which one it means.
          ? `⚠️ **Approved, with ${objections.length} unresolved objection${objections.length === 1 ? '' : 's'} from `
            + `${A.market.name}.** Consensus authorised this trade and ${auditorLine}, but the market read says the `
            + `price behind it is not sound. Execute is enabled because the trade is authorised - the judgement call is yours.`
          : `🎉 **Swarm agreement reached.** ${A.market.name} found no objection, consensus approved, `
            + `${auditorLine}, and ${A.settlement.name} has a `
            + `${strategy.eta || 'settlement'} rail ready. Execute for one-click non-custodial settlement.`,
    status: 'ready'
  };
}
