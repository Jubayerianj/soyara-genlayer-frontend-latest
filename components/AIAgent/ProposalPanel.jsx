// components/AIAgent/ProposalPanel.jsx
import React from 'react';
import ConsensusProgress from '../ConsensusProgress';
import SettlementBinding from './SettlementBinding';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, ShieldAlert, Cpu, ExternalLink, ArrowRight, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { INTELLIGENT_CONTRACTS, CONTRACT_ADDRESSES } from '../../constants/addresses';
import { useTheme } from '../contexts/ThemeContext';

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

  const textMain = isDark ? '#f8fafc' : '#0f172a';
  const textSub = isDark ? '#cbd5e1' : '#334155';
  const textMuted = isDark ? '#94a3b8' : '#64748b';
  const boxBg = isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc';
  const boxBorder = isDark ? 'rgba(255, 255, 255, 0.07)' : '#e2e8f0';
  const divider = isDark ? 'rgba(255, 255, 255, 0.06)' : '#e2e8f0';

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
  const settlementStage = txHash
    ? 'settled'
    : isExecuting
    ? 'finalising'
    : validationResult?.approved
    ? 'enforceable'
    : isValidating || validationResult?.pending
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
        {/* Header Badge */}
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
            <span style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: actionColor,
            }} />
            {action} PROPOSAL
          </div>
          <span style={{ fontSize: '0.75rem', color: textMuted }}>
            Chain ID: 4221 (Bradbury)
          </span>
        </div>

        {/* Trade Summary Box */}
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

          <div style={{ height: '1px', background: divider }} />

          {/* Details breakdown */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.82rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: textMuted }}>Route</span>
              <span style={{ color: textMain, fontWeight: 600 }}>{proposal.route || 'AGGFlow Entrypoint'}</span>
            </div>
            {isSwap && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: textMuted }}>Min. Received</span>
                <span style={{ color: textMain, fontWeight: 600 }}>{proposal.minAmountOut} {proposal.tokenOut}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: textMuted }}>Price Impact</span>
              <span style={{ color: textMain, fontWeight: 600 }}>{proposal.priceImpact || '<0.01%'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: textMuted }}>Max Slippage</span>
              <span style={{ color: textMain, fontWeight: 600 }}>
                {(() => {
                  // Derive both halves from one number. The bps used to be the
                  // literal "(30 bps)" next to a variable percentage, so the
                  // panel showed "0.50% (30 bps)" and neither half could be
                  // trusted.
                  const bps = Number(proposal.slippageBps ?? 30);
                  return `${(bps / 100).toFixed(2)}% (${bps} bps)`;
                })()}
              </span>
            </div>
          </div>
        </div>

        {/* GenLayer Intelligent Contract Validation Card */}
        <div style={{
          background: boxBg,
          border: `1px solid ${boxBorder}`,
          borderRadius: '14px',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Cpu size={18} style={{ color: '#0284c7' }} />
              <span style={{ fontWeight: 700, fontSize: '0.9rem', color: textMain }}>
                GenLayer IC Consensus
              </span>
            </div>
            <a
              href={`https://explorer-bradbury.genlayer.com/address/${icAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                color: '#0284c7',
                fontSize: '0.75rem',
                textDecoration: 'none',
                fontFamily: 'monospace',
                background: 'rgba(2, 132, 199, 0.1)',
                padding: '3px 8px',
                borderRadius: '6px',
                fontWeight: 600,
              }}
            >
              {icAddress.substring(0, 6)}...{icAddress.substring(38)}
              <ExternalLink size={12} />
            </a>
          </div>

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
                  Validating with GenVM Consensus...
                </>
              ) : (
                <>
                  <ShieldCheck size={16} />
                  Validate with GenLayer IC
                </>
              )}
            </button>
          ) : validationResult.pending ? (
            // A live round: show the real GenVM phase and elapsed time rather
            // than a flat "please wait", which read as a hang.
            <ConsensusProgress
              statusName={validationResult.statusName}
              txHash={validationResult.tx_hash || validationResult.txHash}
              startedAt={validationStartedAt}
              isDark={isDark}
            />
          ) : validationResult.retryable ? (
            <div style={{
              borderRadius: '10px',
              padding: '12px',
              background: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.25)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                color: '#f59e0b',
                fontWeight: 700,
                fontSize: '0.85rem',
              }}>
                {validationResult.pending
                  ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                  : <ShieldAlert size={16} />}
                {validationResult.pending
                  ? 'Still Awaiting GenVM Consensus'
                  : 'Consensus Did Not Reach a Verdict'}
              </div>
              <div style={{ fontSize: '0.82rem', color: textSub }}>
                {validationResult.reason || 'Not rejected - the validator round is still in progress. Checking automatically.'}
              </div>
              {validationResult.tx_hash && (
                <a
                  href={`https://explorer-bradbury.genlayer.com/tx/${validationResult.tx_hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: '0.72rem', color: '#f59e0b', fontFamily: 'monospace', marginTop: '2px' }}
                >
                  Tx: {validationResult.tx_hash.slice(0, 10)}...{validationResult.tx_hash.slice(-6)}
                </a>
              )}
              {!validationResult.pending && validationResult.retryable && (
                <button
                  type="button"
                  onClick={onValidate}
                  disabled={isValidating}
                  style={{
                    marginTop: '6px',
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
                      Running another round...
                    </>
                  ) : (
                    <>
                      <ShieldCheck size={15} />
                      Run Another Consensus Round
                    </>
                  )}
                </button>
              )}
            </div>
          ) : (
            <div style={{
              borderRadius: '10px',
              padding: '12px',
              background: validationResult.approved ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
              border: `1px solid ${validationResult.approved ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`,
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                color: validationResult.approved ? '#10b981' : '#ef4444',
                fontWeight: 700,
                fontSize: '0.85rem',
              }}>
                {validationResult.approved ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
                {validationResult.approved ? 'Approved by GenLayer Consensus' : 'Rejected by Validator'}
              </div>
              <div style={{ fontSize: '0.82rem', color: textSub }}>
                {validationResult.reason}
              </div>
              {validationResult.proposal_id && !validationResult.commitment && (
                <div style={{ fontSize: '0.72rem', color: textMuted, fontFamily: 'monospace', marginTop: '2px' }}>
                  ID: {validationResult.proposal_id}
                </div>
              )}
            </div>
          )}
        </div>

        {/* What consensus approved, and what the agent can no longer change.
            Only rendered for swaps, which are the flow that carries a route and
            a fee: the parameters that used to be free. */}
        {isSwap && (validationResult?.commitment || validationResult?.pendingOrder) && (
          <SettlementBinding
            commitment={validationResult.commitment}
            order={validationResult.pendingOrder}
            stage={settlementStage}
            validatorAddress={icAddress}
            executorAddress={CONTRACT_ADDRESSES[4221]?.agentExecutor}
            txHash={validationResult.tx_hash}
          />
        )}

        {/* Execution Section */}
        {validationResult && validationResult.approved && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {needsApproval ? (
              <button
                type="button"
                onClick={onApprove}
                disabled={isApproving}
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
              ) : isCheckingAllowance ? (
                <>
                  <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                  Checking token allowance...
                </>
              ) : isNotExecutable ? (
                'No Liquidity Pool for This Pair'
              ) : hasInsufficientBalance ? (
                `Insufficient ${proposal.tokenIn} Balance`
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
                color: '#ef4444',
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.28)',
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
                color: '#ef4444',
                background: 'rgba(239, 68, 68, 0.10)',
                border: '1px solid rgba(239, 68, 68, 0.45)',
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
                     || 'This pair has no liquidity pool on Soyara DEX. The rate shown is a reference estimate and cannot be executed.')
                  : `Your wallet does not hold enough ${proposal.tokenIn} for this ${proposal.amountIn} ${proposal.tokenIn} trade. Ask for a smaller amount and a fresh quote.`}
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
                color: '#ef4444',
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: '8px',
                padding: '10px',
                lineHeight: 1.4,
              }}>
                <strong>Execution Error:</strong> {executionError}
              </div>
            )}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
};

export default ProposalPanel;
