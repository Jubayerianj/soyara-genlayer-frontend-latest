// components/AIAgent/SwarmInsight.jsx
// ============================================================================
//  The working agents' findings, on the /ai surface.
//
//  /ai and /a2a were drifting apart: the swarm page read the pools, chose a
//  settlement rail and verified the bindings on-chain, while the chat page
//  showed a quote and a validate button. Both settle through the same executor
//  and the same commitment, so both should show the same evidence - and the
//  panels are shared rather than reimplemented, because a second copy of this
//  is a second thing that goes stale.
// ============================================================================

import React, { useEffect, useState } from 'react';
import {
  MarketAnalystAgent,
  SettlementStrategistAgent,
  PostTradeAuditorAgent,
} from '../../services/a2a/analysts';
import { MarketReadPanel, SettlementRailPanel, BindingsPanel } from '../A2A/SwarmPanels';
import { TOKEN_LIST } from '../../constants/tokens.js';

function tokenObj(symbolOrAddr) {
  const clean = String(symbolOrAddr || '').trim().toUpperCase();
  const list = TOKEN_LIST[4221] || [];
  return list.find(
    (t) => t.symbol.toUpperCase() === clean
      || t.address?.toLowerCase() === String(symbolOrAddr).toLowerCase()
      || (clean === 'GEN' && t.isNative),
  ) || { symbol: clean, address: symbolOrAddr, decimals: 18, isNative: clean === 'GEN' };
}

/**
 * Shape a chat proposal like the swarm's route object so one implementation of
 * the market read serves both pages.
 */
function routeFromProposal(p) {
  const tokenIn = tokenObj(p.tokenInAddress || p.tokenIn);
  const tokenOut = tokenObj(p.tokenOutAddress || p.tokenOut);
  return {
    tokenIn,
    tokenOut,
    amountInNum: Number(p.amountIn) || 0,
    isMultiHop: Boolean(p.isMultiHop),
    hops: p.hops || null,
    priceImpact: p.priceImpactPct ?? p.priceImpact,
    priceWarning: p.priceWarning || null,
    dislocationFactor: p.dislocationFactor ?? 1,
    // The chat path keeps a single best-route figure rather than one per venue,
    // so there is no cross-venue number to compare here. Leaving these unset is
    // correct: the analyst skips the venue-spread check instead of comparing a
    // value against itself and reporting a reassuring 0%.
    v2Quote: null,
    v3Quote: null,
    minAmountOutWei: p.minAmountOutRaw,
    chosenRoute: p.route,
  };
}

export default function SwarmInsight({ proposal, validationResult, userAddress }) {
  const [analysis, setAnalysis] = useState(null);
  const [strategy, setStrategy] = useState(null);
  const [audit, setAudit] = useState(null);

  // Market read runs as soon as there is a proposal: whether the pool behind a
  // quote is deep enough is worth knowing before paying for a consensus round,
  // not after.
  useEffect(() => {
    let live = true;
    setAnalysis(null);
    if (!proposal || proposal.action !== 'SWAP') return undefined;
    const route = routeFromProposal(proposal);
    MarketAnalystAgent.analyse({ slippageBps: proposal.slippageBps || 100 }, route)
      .then((a) => { if (live) setAnalysis({ ...a, _route: route }); })
      .catch(() => { /* the panel simply does not render */ });
    return () => { live = false; };
  }, [proposal]);

  // Rail and bindings need a commitment, which only exists once consensus has
  // approved something.
  useEffect(() => {
    let live = true;
    setStrategy(null);
    setAudit(null);
    const commitment = validationResult?.commitment;
    if (!commitment || !validationResult?.approved) return undefined;

    SettlementStrategistAgent.plan({
      commitment,
      order: validationResult.pendingOrder,
      deadline: proposal?.deadline,
    }).then((s) => { if (live) setStrategy(s); }).catch(() => {});

    if (validationResult.pendingOrder && userAddress) {
      PostTradeAuditorAgent.preflight({
        order: validationResult.pendingOrder,
        program: validationResult.pendingProgram,
        commitment,
        user: userAddress,
      }).then((a) => { if (live) setAudit(a); }).catch(() => {});
    }
    return () => { live = false; };
  }, [validationResult, proposal, userAddress]);

  if (!analysis && !strategy && !audit) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '0.9rem' }}>
      {analysis && <MarketReadPanel analysis={analysis} route={analysis._route} />}
      {audit && <BindingsPanel audit={audit} />}
      {strategy && <SettlementRailPanel strategy={strategy} />}
    </div>
  );
}
