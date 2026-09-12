// components/AIAgent/ProposalPanel.jsx
import React, { useState } from 'react';
import ConsensusProgress from '../ConsensusProgress';
import SettlementBinding from './SettlementBinding';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, Cpu, ExternalLink, ArrowRight, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { INTELLIGENT_CONTRACTS, CONTRACT_ADDRESSES } from '../../constants/addresses';
import { useTheme } from '../contexts/ThemeContext';
import { TONE } from '../../lib/tone';

const ProposalPanel = ({
  proposal,
  validationResult,
  onValidate,
  onExecute,
  onApprove,
  needsApproval,
  isApproving,
  isCheckingAllowance,
  validationStartedAt,
  hasInsufficientBalance,
  isNotExecutable,
  notExecutableReason,
  isValidating,
  isExecuting,
  txHash,
  executionError,
}) => {
  const { theme } = useTheme();
  const isDark = theme !== 'light';
  // The panel showed every fact at once: the rate breakdown, the contract, the
  // proposal id and the settlement bindings, stacked above the button. What a
  // trader decides on is the trade, one status line and one action; the proof
  // is one tap away.
  const [showDetails, setShowDetails] = useState(false);

  const textMain = isDark ? '#f8fafc' : '#0f172a';
  const textSub = isDark ? '#cbd5e1' : '#334155';
  const textMuted = isDark ? '#94a3b8' : '#64748b';
  const boxBg = isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc';
  const boxBorder = isDark ? 'rgba(255, 255, 255, 0.07)' : '#e2e8f0';

  if (!proposal) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        minHeight: '320px',
        color: textMuted,
        textAlign: 'center',
        padding: '24px',
      }}>
        <div style={{
          width: '52px',
          height: '52px',
          borderRadius: '14px',
          background: isDark ? 'rgba(56, 189, 248, 0.08)' : 'rgba(2, 132, 199, 0.08)',
          border: isDark ? '1px solid rgba(56, 189, 248, 0.15)' : '1px solid rgba(2, 132, 199, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '14px',
          color: '#0284c7',
        }}>
          <Cpu size={24} />
        </div>
        <h3 style={{ margin: 0, fontSize: '0.95rem', color: textMain, fontWeight: 700 }}>
          No Active Proposal
        </h3>
      </div>
    );
  }

  const action = (proposal.action || 'SWAP').toUpperCase();
  const isSwap = action === 'SWAP';
  // AgentValidator for everything that settles.
  //
  // This used to point at LiquidityValidator for deposits, which is the wrong
  // contract to name: AgentExecutor accepts verdicts only from AgentValidator,
  // so LiquidityValidator authorises nothing. Showing it beside "this proposal
  // must reach consensus validation" told the user the wrong thing was securing
  // their funds.
  const icAddress = INTELLIGENT_CONTRACTS.agentValidator;

  const getActionColor = () => {
    switch (action) {
      case 'SWAP': return '#0284c7';
      case 'ADD_LIQUIDITY': return '#10b981';
      case 'REMOVE_LIQUIDITY': return '#f59e0b';
      default: return '#0284c7';
    }
  };

  const actionColor = getActionColor();

  // Where this trade is in the settlement lifecycle.
  //
  // `finalising` is deliberately distinct from `validating`. Consensus can have
  // approved a trade while the executor still refuses it, because an
  // Intelligent Contract delivers its verdict as an external message and those
  // arrive only once the appeal window has closed. Showing one spinner for both
  // would make a correct, expected wait read as a stall.
  //
  // `validationResult.pending` means the round was SUBMITTED and we are waiting
  // for it to finalize - which is the appeal window, not validation. Rendering
  // it as `validating` is what made a normal 30-minute wait look like a
  // stuck spinner, because the label never changed and no ETA was ever shown.
  //
  // A mandate-covered trade has no appeal window of its own: its authority is
  // already on the executor, so it is enforceable the moment it is quoted.
  const settlementStage = txHash
    ? 'settled'
    : validationResult?.rail === 'mandate' && validationResult?.approved
    ? 'enforceable'
    : isExecuting || validationResult?.pending
    ? 'finalising'
    : validationResult?.approved
    ? 'enforceable'
    : isValidating
    ? 'validating'
    : 'quoted';


  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={proposal.proposalId || `${proposal.action}-${proposal.tokenIn}-${proposal.tokenOut}`}
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -15 }}
        transition={{ duration: 0.25 }}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {/* What the trade is */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: `${actionColor}18`,
            color: actionColor,
            padding: '4px 12px',
            borderRadius: '20px',
            fontSize: '0.75rem',
            fontWeight: 700,
            letterSpacing: '0.5px',
            border: `1px solid ${actionColor}33`,
          }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: actionColor }} />
            {action}
          </div>
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              color: textMuted, fontSize: '0.75rem', fontWeight: 600,
            }}
          >
            {showDetails ? 'Hide details' : 'Details'}
          </button>
        </div>

        <div style={{
          background: boxBg,
          border: `1px solid ${boxBorder}`,
          borderRadius: '14px',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}>
          {isSwap ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: textMuted }}>Pay</span>
                <div style={{ fontSize: '1.25rem', fontWeight: 750, color: textMain }}>
                  {proposal.amountIn} <span style={{ color: '#0284c7' }}>{proposal.tokenIn}</span>
                </div>
              </div>
              <div style={{ color: textMuted, padding: '0 8px' }}>
                <ArrowRight size={20} />
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.75rem', color: textMuted }}>Receive (Est.)</span>
                <div style={{ fontSize: '1.25rem', fontWeight: 750, color: '#10b981' }}>
                  {proposal.expectedOutput || `${proposal.minAmountOut} ${proposal.tokenOut}`}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: textMuted, fontSize: '0.85rem' }}>Asset A</span>
                <span style={{ color: textMain, fontWeight: 650, fontSize: '0.85rem' }}>{proposal.amountA} {proposal.tokenA}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: textMuted, fontSize: '0.85rem' }}>Asset B</span>
                <span style={{ color: textMain, fontWeight: 650, fontSize: '0.85rem' }}>{proposal.amountB} {proposal.tokenB}</span>
              </div>
            </div>
          )}

          {isSwap && (
            <div style={{ fontSize: '0.75rem', color: textMuted }}>
              At least {proposal.minAmountOut} {proposal.tokenOut} · impact {proposal.priceImpact || '<0.01%'} · via {proposal.route || 'AGGFlow'}
            </div>
          )}
        </div>

        {/* Where it stands, in one line */}
        {!validationResult ? (
          <button
            type="button"
            onClick={onValidate}
            disabled={isValidating}
            style={{
              background: 'linear-gradient(135deg, #0284c7, #0369a1)',
              border: 'none',
              borderRadius: '10px',
              padding: '12px',
              color: '#ffffff',
              fontWeight: 650,
              fontSize: '0.9rem',
              cursor: isValidating ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 4px 14px rgba(2, 132, 199, 0.25)',
            }}
          >
            {isValidating ? (
              <>
                <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                Asking GenLayer consensus
              </>
            ) : (
              <>
                <ShieldCheck size={16} />
                Ask GenLayer consensus
              </>
            )}
          </button>
        ) : validationResult.pending ? (
          <ConsensusProgress
            statusName={validationResult.statusName}
            txHash={validationResult.tx_hash || validationResult.txHash}
            startedAt={validationStartedAt}
            isDark={isDark}
          />
        ) : (
          <div style={{
            borderRadius: '12px',
            padding: '12px 14px',
            background: validationResult.approved ? 'rgba(16, 185, 129, 0.08)' : TONE.attention.bg,
            border: `1px solid ${validationResult.approved ? 'rgba(16, 185, 129, 0.25)' : TONE.attention.border}`,
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: validationResult.approved ? '#10b981' : TONE.attention.color,
              fontWeight: 700,
              fontSize: '0.85rem',
            }}>
              {validationResult.approved ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
              {validationResult.approved
                ? (validationResult.rail === 'mandate'
                  ? 'Approved · fast lane, settles in about 5 seconds'
                  : 'Approved · settles by itself in about 30 minutes')
                : validationResult.retryable
                  ? 'No verdict this round · not a rejection'
                  : 'Not approved by consensus'}
            </div>
            <div style={{ fontSize: '0.8rem', color: textSub, lineHeight: 1.45 }}>
              {validationResult.retryable && !validationResult.reason
                ? 'The validator set did not reach a majority. Running it again usually settles it.'
                : validationResult.reason}
            </div>
            {!validationResult.approved && validationResult.retryable && (
              <button
                type="button"
                onClick={onValidate}
                disabled={isValidating}
                style={{
                  marginTop: '4px',
                  background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '10px',
                  color: '#ffffff',
                  fontWeight: 650,
                  fontSize: '0.85rem',
                  cursor: isValidating ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                {isValidating ? (
                  <>
                    <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
                    Running another round
                  </>
                ) : (
                  <>
                    <ShieldCheck size={15} />
                    Run another round
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {/* Execution Section */}
        {validationResult && validationResult.approved && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {needsApproval ? (
              <button
                type="button"
                onClick={onApprove}
                // Also refuses when the balance is short. Approving costs real
                // gas, and an approval for a token you hold none of buys
                // nothing - the user would pay, wait, and then find the execute
                // button greyed out anyway.
                disabled={isApproving || hasInsufficientBalance || isNotExecutable}
                style={{
                  background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '14px',
                  color: '#ffffff',
                  fontWeight: 650,
                  fontSize: '0.95rem',
                  cursor: isApproving ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 14px rgba(245, 158, 11, 0.25)',
                }}
              >
                {isApproving ? (
                  <>
                    <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                    Approving {proposal.tokenIn}...
                  </>
                ) : hasInsufficientBalance ? (
                  `Don't have enough ${proposal.tokenIn}`
                ) : isNotExecutable ? (
                  'No Liquidity Pool for This Pair'
                ) : (
                  `1. Approve ${proposal.tokenIn} (one time)`
                )}
              </button>
            ) : null}

            <button
              type="button"
              onClick={onExecute}
              disabled={needsApproval || isExecuting || isCheckingAllowance || hasInsufficientBalance || isNotExecutable}
              style={{
                background: (needsApproval || isCheckingAllowance || hasInsufficientBalance || isNotExecutable)
                  ? isDark ? 'rgba(255, 255, 255, 0.05)' : '#e2e8f0'
                  : 'linear-gradient(135deg, #10b981, #059669)',
                border: 'none',
                borderRadius: '10px',
                padding: '14px',
                color: (needsApproval || isCheckingAllowance || hasInsufficientBalance || isNotExecutable) ? textMuted : '#ffffff',
                fontWeight: 650,
                fontSize: '0.95rem',
                cursor: (needsApproval || isExecuting || isCheckingAllowance || hasInsufficientBalance || isNotExecutable) ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: (needsApproval || isCheckingAllowance || hasInsufficientBalance || isNotExecutable) ? 'none' : '0 4px 16px rgba(16, 185, 129, 0.3)',
              }}
            >
              {isExecuting ? (
                <>
                  <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                  Settling on Soyara DEX...
                </>
              ) : isNotExecutable ? (
                'No Liquidity Pool for This Pair'
              ) : hasInsufficientBalance ? (
                // Checked BEFORE the allowance spinner. It used to come after,
                // so someone with an empty wallet watched "Checking token
                // allowance..." instead of being told the actual problem - and
                // if that check was slow they never saw the reason at all.
                // Having no funds outranks every other state: nothing else
                // matters until it is fixed.
                `Don't have enough ${proposal.tokenIn}`
              ) : isCheckingAllowance ? (
                <>
                  <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                  Checking token allowance...
                </>
              ) : (
                needsApproval ? '2. Execute Trade (Approve First)' : 'Confirm & Execute on GenLayer'
              )}
            </button>

            {proposal.action === 'SWAP' && proposal.route && (
              <div style={{
                fontSize: '0.72rem', color: textMuted, lineHeight: 1.45,
                padding: '7px 9px', borderRadius: 8,
                background: isDark ? 'rgba(56,189,248,0.06)' : 'rgba(2,132,199,0.05)',
              }}>
                Routed by the <strong>AGGFlow aggregator</strong> - it compared every venue and chose{' '}
                <strong>{proposal.route}</strong>. Swaps always take the best available route; V2 vs V3
                is an outcome, not a setting.
              </div>
            )}

            {proposal.highImpact && !isNotExecutable && (
              <div style={{
                fontSize: '0.78rem',
                color: TONE.attention.color,
                background: TONE.attention.bg,
                border: `1px solid ${TONE.attention.border}`,
                borderRadius: '8px',
                padding: '10px',
                lineHeight: 1.45,
                display: 'flex',
                gap: '8px',
                alignItems: 'flex-start'
              }}>
                <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong>High price impact: {proposal.priceImpact}.</strong> This trade is large
                  relative to the pool, so you receive materially less than the market rate - and the
                  quote can go stale before consensus finishes, which shows up as a
                  &ldquo;price moved&rdquo; refusal. Consider splitting it into smaller trades.
                </div>
              </div>
            )}

            {/* A route paying far more than the direct pool is not a better
                route. It is a price disagreement between the pools it crosses,
                and a minimum built from it is a floor nothing has promised. This
                is a separate warning from high impact: impact can be small while
                the price is still nonsense. */}
            {proposal.priceWarning && (
              <div style={{
                fontSize: '0.78rem',
                color: TONE.attention.color,
                background: TONE.attention.bg,
                border: `1px solid ${TONE.attention.border}`,
                borderRadius: '8px',
                padding: '10px',
                lineHeight: 1.5,
                display: 'flex',
                gap: '8px',
                alignItems: 'flex-start'
              }}>
                <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong>This price is not trustworthy.</strong> The route pays about{' '}
                  <strong>{Number(proposal.dislocationFactor || 0).toFixed(1)}x</strong> what the direct
                  pool pays
                  {proposal.directAmountOut ? <> (direct: <strong>{proposal.directAmountOut} {proposal.tokenOut}</strong>)</> : null}.
                  That means the pools on this path disagree about what {proposal.tokenIn} is worth,
                  not that the route found you a better deal. Expect it to be arbitraged before it
                  settles, and treat the minimum received as unreliable.
                </div>
              </div>
            )}

            {(isNotExecutable || hasInsufficientBalance) && (
              <div style={{
                fontSize: '0.78rem',
                color: '#f59e0b',
                background: 'rgba(245, 158, 11, 0.08)',
                border: '1px solid rgba(245, 158, 11, 0.25)',
                borderRadius: '8px',
                padding: '10px',
                lineHeight: 1.45,
              }}>
                {isNotExecutable
                  ? (notExecutableReason
                     || 'No pool for this pair on Soyara, so this rate cannot be executed.')
                  : `Not enough ${proposal.tokenIn} for this trade. Try a smaller amount.`}
              </div>
            )}

            {/* An ERC-20 trade that is already approved settles from the agent
                wallet through AgentExecutor, so no wallet popup appears at this
                step. Saying so prevents "nothing happened" confusion. */}
            {!needsApproval && !isCheckingAllowance && !hasInsufficientBalance && !isNotExecutable && (
              <div style={{
                fontSize: '0.75rem',
                color: textMuted,
                lineHeight: 1.45,
                textAlign: 'center',
                padding: '0 4px',
              }}>
                Settlement runs from the agent wallet via <strong>AgentExecutor</strong> - your
                wallet won&apos;t prompt for this step. Tokens arrive directly at your address.
              </div>
            )}

            {executionError && (
              <div style={{
                fontSize: '0.8rem',
                color: TONE.attention.color,
                background: TONE.attention.bg,
                border: `1px solid ${TONE.attention.border}`,
                borderRadius: '8px',
                padding: '10px',
                lineHeight: 1.4,
              }}>
                <strong>Could not settle:</strong> {executionError}
              </div>
            )}
          </div>
        )}

        {showDetails && (
          <div style={{
            background: boxBg,
            border: `1px solid ${boxBorder}`,
            borderRadius: '14px',
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            fontSize: '0.8rem',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: textMuted }}>Route</span>
              <span style={{ color: textMain, fontWeight: 600 }}>{proposal.route || 'AGGFlow Entrypoint'}</span>
            </div>
            {isSwap && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: textMuted }}>Minimum received</span>
                <span style={{ color: textMain, fontWeight: 600 }}>{proposal.minAmountOut} {proposal.tokenOut}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: textMuted }}>Price impact</span>
              <span style={{ color: textMain, fontWeight: 600 }}>{proposal.priceImpact || '<0.01%'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: textMuted }}>Max slippage</span>
              <span style={{ color: textMain, fontWeight: 600 }}>
                {(() => {
                  // Both halves from one number: the panel once showed
                  // "0.50% (30 bps)" with neither half trustworthy.
                  const bps = Number(proposal.slippageBps ?? 30);
                  return `${(bps / 100).toFixed(2)}% (${bps} bps)`;
                })()}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: textMuted }}>Judged by</span>
              <a
                href={`https://explorer-bradbury.genlayer.com/address/${icAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#0284c7', fontFamily: 'monospace', textDecoration: 'none', fontWeight: 600 }}
              >
                {icAddress.substring(0, 6)}...{icAddress.substring(38)}
                <ExternalLink size={12} />
              </a>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: textMuted }}>Chain</span>
              <span style={{ color: textMain, fontWeight: 600 }}>GenLayer Bradbury (4221)</span>
            </div>
            {validationResult?.tx_hash && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: textMuted }}>Round</span>
                <a
                  href={`https://explorer-bradbury.genlayer.com/tx/${validationResult.tx_hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#0284c7', fontFamily: 'monospace', textDecoration: 'none', fontWeight: 600 }}
                >
                  {validationResult.tx_hash.slice(0, 10)}...{validationResult.tx_hash.slice(-6)}
                </a>
              </div>
            )}

            {/* What consensus approved, and what the agent can no longer change. */}
            {isSwap && (validationResult?.commitment || validationResult?.pendingOrder) && (
              <SettlementBinding
                commitment={validationResult.commitment}
                order={validationResult.pendingOrder}
                rail={validationResult.rail}
                mandate={validationResult.mandate}
                stage={settlementStage}
                validatorAddress={icAddress}
                executorAddress={CONTRACT_ADDRESSES[4221]?.agentExecutor}
                txHash={validationResult.tx_hash}
              />
            )}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
};

export default ProposalPanel;
