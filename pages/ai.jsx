import React, { useState, useRef, useEffect, useCallback } from 'react';
import Head from 'next/head';
import { motion, AnimatePresence } from 'framer-motion';
import { useAccount, usePublicClient, useBalance } from 'wagmi';
import {
  Sparkles,
  Send,
  Bot,
  RotateCcw,
  Cpu,
  ShieldCheck,
  ExternalLink,
  Layers,
  ArrowRightLeft,
  Coins,
  CheckCircle2,
  AlertCircle,
  Loader2,
  HelpCircle,
  TrendingUp,
  Sliders,
  Flame
} from 'lucide-react';

import ChatMessage from '../components/AIAgent/ChatMessage';
import ProposalPanel from '../components/AIAgent/ProposalPanel';
import SwarmInsight from '../components/AIAgent/SwarmInsight';
import { PoolsHandoffPanel } from '../components/A2A/SwarmPanels';
import SettlementQueue from '../components/SettlementQueue';
import { useSettlementQueue } from '../hooks/useSettlementQueue';
import { mergeVerdictResponse } from '../lib/settlement';
import { INTELLIGENT_CONTRACTS } from '../constants/addresses';
import { useAgentSwapExecution } from '../hooks/useAgentSwapExecution';
import ActivityPanel from '../components/ActivityPanel';
import BalanceStrip from '../components/BalanceStrip';
import { recordActivity } from '../lib/txStore';
import { useTheme } from '../components/contexts/ThemeContext';
import aiStyles from '../styles/AIPage.module.css';

const STARTER_PROMPTS = [
  'Swap 100 USDC to GEN with the best route',
  'How is the verdict bound to my route and fee?',
  'Compare V2 and V3 for 50 WGEN to USDT',
  'Which tokens are supported?',
  'What happens if a pool is mispriced?',
  'Explain the slippage cap',
];

const TOPIC_CHIPS = [
  { label: 'Trade', prompt: 'Swap 100 USDC to GEN on the best route' },
  { label: 'Consensus', prompt: 'How does GenLayer Optimistic Democracy and the AgentValidator IC work?' },
  { label: 'Fees', prompt: 'What is the fee difference between V2 classic and V3 concentrated pools?' },
  { label: 'Tokens', prompt: 'List all supported tokens on GenLayer Testnet' },
  { label: 'Slippage', prompt: 'Explain the 3% slippage cap and MEV safety rules' },
];

export default function AIPage() {
  const { theme } = useTheme();
  const isDark = theme !== 'light';
  const { address: userAddress, isConnected } = useAccount();
  const publicClient = usePublicClient();

  const [mobileTab, setMobileTab] = useState('chat'); // 'chat' | 'proposal'
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "Welcome to **Soyara AI Trading** on **GenLayer Testnet**!\n\nI am your specialized DeFi trading assistant. Every execution proposal is verified by decentralized AI consensus on **GenVM** via the **AgentValidator** (`" + INTELLIGENT_CONTRACTS.agentValidator.slice(0, 8) + "...`) and **LiquidityValidator** Intelligent Contracts.\n\nAsk me for real-time swap quotes, route comparisons, fee analysis, or to prepare trade proposals!",
      toolsUsed: ['GenVM Consensus', 'AgentValidator IC', 'DeFi Analytics'],
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentProposal, setCurrentProposal] = useState(null);
  const [validationResult, setValidationResult] = useState(null);
  const [isValidating, setIsValidating] = useState(false);
  // When the current consensus round began, so the panel can show elapsed time.
  const [validationStartedAt, setValidationStartedAt] = useState(null);
  // Balances captured just before settlement, so the panel can show before/after.
  // Settlement runs from the agent wallet with no popup, so this delta is the
  // user's only direct confirmation that funds actually moved.
  const [balanceSnapshot, setBalanceSnapshot] = useState(null);
  const [liveBalances, setLiveBalances] = useState(null);
  const [balanceRefreshKey, setBalanceRefreshKey] = useState(0);

  const messagesEndRef = useRef(null);
  const handleValidateRef = useRef(null);
  // The order the binding consensus round was opened against, handed over by
  // /api/genlayer-validate. It has to live outside `validationResult` because
  // that state is overwritten by every status poll, and the poll response has no
  // reason to carry the order. Losing it would send settlement back to quoting
  // and open a SECOND consensus round for the same trade - the exact cost this
  // handoff exists to remove.
  const settlementHandoffRef = useRef(null);
  // Bounded auto-retry while a verdict finishes finalising. Bounded because the
  // appeal window is finite: if it has not landed after this many tries,
  // something other than the window is wrong and the user should be told.
  const settlementRetryRef = useRef(0);

  // Trades waiting on their consensus verdict.
  //
  // A validated trade goes in here rather than holding the page in a loading
  // state: the appeal window runs to roughly 40 minutes, the queue survives
  // navigation and reloads, and settlement happens on its own when the verdict
  // reaches the executor. The user is free as soon as the round is submitted.
  const settlementQueue = useSettlementQueue();
  // Lets the delayed finalisation retry call the current handler.
  const handleExecuteRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Native GEN balance
  const { data: nativeBalance, refetch: refetchNativeBalance } = useBalance({
    address: userAddress,
  });

  // Shared GenLayer-validated swap execution logic (also used by /a2a's SwarmWarRoom).
  const {
    fromTokenObj,
    toTokenObj,
    needsApproval,
    isApproving,
    isCheckingAllowance,
    hasInsufficientBalance,
    isNotExecutable,
    notExecutableReason,
    approve,
    execute,
    isExecuting,
    isTxWaiting,
    isTxSuccess,
    isTxFailed,
    activeTxHash,
    executionError,
    setExecutionError,
    refetchAllowance,
    reset: resetExecution,
  } = useAgentSwapExecution(currentProposal);

  useEffect(() => {
    if (isTxSuccess && activeTxHash) {
      refetchAllowance();
      refetchNativeBalance();
      setBalanceRefreshKey((k) => k + 1);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `**Settled.** Tx \`${activeTxHash}\``,
          toolsUsed: ['GenLayer Bradbury Explorer', 'AGGFlow Entrypoint'],
        }
      ]);
    } else if (isTxFailed && activeTxHash) {
      setExecutionError('Transaction reverted on GenLayer');
    }
  }, [isTxSuccess, isTxFailed, activeTxHash, refetchAllowance, refetchNativeBalance, setExecutionError]);

  // Send message to AI Agent
  const handleSend = async (textToSend) => {
    const text = typeof textToSend === 'string' ? textToSend : input;
    if (!text.trim() || isLoading) return;

    const userMsg = { role: 'user', content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);
    setExecutionError(null);

    try {
      const res = await fetch('/api/agent-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: messages.slice(-6).map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await res.json();

      // A liquidity request is handed to the pools app. Clear any proposal still
      // on screen from the previous turn: leaving a stale swap card next to
      // "liquidity happens elsewhere" is how a deposit request ended up with an
      // Execute button for a trade beside it.
      if (data.redirect) {
        setCurrentProposal(null);
        setValidationResult(null);
        settlementHandoffRef.current = null;
        resetExecution();
      }

      if (data.proposal) {
        setCurrentProposal(data.proposal);
        setValidationResult(null);
    settlementHandoffRef.current = null;
        resetExecution();
        setMobileTab('proposal');

        // ── Pre-validate immediately (do not wait for the user to click) ──────
        // GenVM consensus takes anywhere from seconds to minutes. Starting the
        // round here means it runs while the user is still reading the quote and
        // connecting their wallet, so by the time they hit Execute the approval
        // is usually already in hand. Same enforced flow and same one-time
        // approval hash - just moved off the user's critical path.
        handleValidateRef.current?.(0, data.proposal);
      }

      setMessages([
        ...newMessages,
        {
          role: 'assistant',
          content: data.reply || 'I have analyzed your request.',
          toolsUsed: data.toolsUsed || [],
          redirect: data.redirect || null,
        }
      ]);
    } catch (err) {
      console.error('Agent API call failed:', err);
      setMessages([
        ...newMessages,
        {
          role: 'assistant',
          content: 'Sorry, I encountered an issue reaching the AI network. Please try again.',
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // Poll a pending validate_proposal tx (does NOT resubmit - just re-checks status)
  // until it resolves or we give up. GenVM consensus rounds on Bradbury testnet can
  // occasionally take several minutes under load; treating a slow round as an
  // immediate hard rejection is misleading, so this keeps checking in the background.
  // `submitted` is the response from the round's SUBMISSION, and it is not
  // optional bookkeeping. A status check is given only a transaction hash, so it
  // cannot return the bound order, its aggregator program, or the commitment -
  // those were computed once at submission. Replacing the response with the poll
  // result therefore erased them, and the enqueue below is guarded on
  // `pendingOrder && pendingProgram`, so any round slow enough to need one poll
  // ended approved and unsettled with nothing on screen saying why.
  const pollValidationStatus = useCallback(async (txHash, attempt = 0, retryRound = 0, proposal = null, proposalId = null, submitted = null) => {
    const MAX_ATTEMPTS = 40; // fast common case, still degrades gracefully under load
    const MAX_RETRY_ROUNDS = 1; // one automatic fresh round if the first ends undecided
    try {
      const res = await fetch('/api/genlayer-validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // On the final attempt, ask the server to clear the round if validators
        // never voted - otherwise idle txs pile up on the agent account and
        // start making new submissions revert at ConsensusMain.
        body: JSON.stringify({ checkTxHash: txHash, proposalId, finalizeIfStuck: attempt >= MAX_ATTEMPTS }),
      });
      const data = mergeVerdictResponse(submitted, await res.json());

      // Never leave `pending` as a terminal state.
      //
      // The poll used to stop at MAX_ATTEMPTS and then render the last pending
      // response, which froze the UI on "Consensus Pending" with nothing left
      // running. A verdict that has not appeared yet WILL appear: the round is
      // decided and `get_validation` is a plain read. So past the fast budget
      // this keeps checking on a slow cadence rather than giving up, and only a
      // real verdict or a real error ends it.
      if (data.pending) {
        // Fast-poll the first few attempts (common case resolves quickly), then back off.
        // A verdict is usually readable within ~30-45s, so a flat 10s tail added
        // up to 10s of dead time after consensus had already finished. Poll
        // tighter for longer, then ease off.
        // A round decides in roughly 20 seconds and moves through five phases,
        // so poll tightly while that is happening, then ease off and keep going.
        const nextDelay = attempt < 12 ? 1200 : attempt < MAX_ATTEMPTS ? 4000 : 15000;
        setTimeout(() => pollValidationStatus(txHash, attempt + 1, retryRound, proposal, proposalId, submitted), nextDelay);
        return;
      }

      // The round finished without a verdict (UNDETERMINED / LEADER_TIMEOUT /
      // VALIDATORS_TIMEOUT). That is a network condition, not a rejection -
      // polling the same dead round forever is pointless, so run one fresh round.
      if (data.retryable && retryRound < MAX_RETRY_ROUNDS) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `🔄 **GenVM round ended without a majority** - this is a validator-set condition, not a rejection. Automatically submitting a fresh consensus round...`,
            toolsUsed: ['AgentValidator IC', 'GenVM Consensus'],
          }
        ]);
        handleValidateRef.current?.(retryRound + 1, proposal);
        return;
      }

      setValidationResult(data);
      setIsValidating(false);

      recordActivity({
        id: data.tx_hash || data.proposal_id || `val-${Date.now()}`,
        kind: 'swap',
        user: userAddress,
        pair: `${proposal.tokenIn} → ${proposal.tokenOut}`,
        label: `Swap ${proposal.amountIn} ${proposal.tokenIn} → ${proposal.tokenOut}`,
        txHash: data.tx_hash || null,
        proposalId: data.proposal_id || null,
        status: data.approved ? 'approved' : data.retryable ? 'undecided' : 'rejected',
        reason: data.reason,
      });

      if (data.approved) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `**Consensus approved.** The verdict is bound to a commitment covering your route, fee, recipient and quote. Execute when ready.\n\nValidator \`${data.genlayer_contract}\``,
            toolsUsed: ['AgentValidator IC', 'GenVM Consensus'],
          }
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: data.pending
              ? `⏳ **Still Awaiting GenVM Consensus**\n\nThe validator round is taking longer than usual. Tx: \`${txHash.slice(0, 10)}...\` - you can check the [explorer](https://explorer-bradbury.genlayer.com/tx/${txHash}) or try Validate again shortly.`
              : data.retryable
                ? `🔄 **GenVM Consensus Did Not Reach a Verdict**\n\n${data.reason}\n\nPress **Validate** again to run another round.`
                : `⚠️ **GenLayer IC Validation Rejected**\n\nReason: *${data.reason}*`,
            toolsUsed: ['AgentValidator IC'],
          }
        ]);
      }
    } catch (err) {
      console.error('Validation status-check error:', err);
      setIsValidating(false);
      setValidationResult({ approved: false, reason: 'Network error checking validation status' });
    }
  }, []);

  // Validate current proposal with GenLayer Intelligent Contract.
  // `retryRound` > 0 means this is an automatic re-run after a GenVM round that
  // ended without a majority (UNDETERMINED / LEADER_TIMEOUT / VALIDATORS_TIMEOUT).
  const handleValidate = async (retryRoundArg = 0, proposalOverride = null) => {
    // ProposalPanel wires this straight to onClick, so the first arg can be a
    // React SyntheticEvent - only trust it when it is actually a number.
    const retryRound = typeof retryRoundArg === 'number' ? retryRoundArg : 0;

    // When pre-validating we are called in the same tick the proposal arrives,
    // before `currentProposal` state has flushed - so accept it directly.
    const proposal = proposalOverride || currentProposal;

    if (!proposal) return;
    if (isValidating && retryRound === 0 && !proposalOverride) return;
    setIsValidating(true);
    // Only start the clock for a genuinely new round, so an automatic retry does
    // not make the elapsed time jump back to zero mid-wait.
    setValidationStartedAt((prev) => (retryRoundArg > 0 && prev ? prev : Date.now()));
    setExecutionError(null);

    try {
      const res = await fetch('/api/genlayer-validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // `user` is required because it is part of the settlement commitment -
        // a verdict is bound to the address that will actually receive the
        // output. (It used to be sent for the mandate fast path, which admitted
        // trades through a view and has been removed.)
        body: JSON.stringify({ ...proposal, user: userAddress }),
      });

      const data = await res.json();

      if (data.pendingOrder && data.pendingProgram) {
        settlementHandoffRef.current = {
          pendingOrder:        data.pendingOrder,
          pendingProgram:      data.pendingProgram,
          validationSubmitted: Boolean(data.validationSubmitted),
        };
      }

      // Consensus round still in flight - poll status instead of reporting rejection.
      if (data.pending && data.tx_hash) {
        // Persist immediately: a consensus round outlives the page, and without
        // this a user who closed the tab lost the tx hash and proposal id and
        // could never find out whether the trade was approved.
        recordActivity({
          id: data.tx_hash,
          kind: 'swap',
          user: userAddress,
          pair: `${proposal.tokenIn} → ${proposal.tokenOut}`,
          label: `Swap ${proposal.amountIn} ${proposal.tokenIn} → ${proposal.tokenOut}`,
          txHash: data.tx_hash,
          proposalId: data.proposal_id || null,
          statusName: data.statusName || null,
          status: 'pending',
        });
        setValidationResult(data);
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `⏳ **Validating with GenLayer IC...**\n\nConsensus tx submitted: \`${data.tx_hash.slice(0, 10)}...\`. This can take a bit longer during testnet congestion - I'll keep checking automatically.`,
            toolsUsed: ['AgentValidator IC', 'GenVM Consensus'],
          }
        ]);
        pollValidationStatus(data.tx_hash, 0, retryRound, proposal, data.proposal_id || null, data);
        return;
      }

      // Round returned immediately but without a verdict - run one fresh round.
      if (data.retryable && retryRound < 1) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `🔄 **GenVM round ended without a majority** - not a rejection. Submitting a fresh consensus round...`,
            toolsUsed: ['AgentValidator IC', 'GenVM Consensus'],
          }
        ]);
        handleValidate(retryRound + 1, proposal);
        return;
      }

      setValidationResult(data);
      setIsValidating(false);

      // Hand an approved trade to the queue immediately.
      //
      // And ask for the token approval NOW, while the appeal window is still
      // running, instead of at the end. The signature is the only thing that
      // needs the user, so it belongs at the point where they are still
      // watching, not 40 minutes later when they have moved on.
      if (data.approved && data.pendingOrder && data.pendingProgram) {
        settlementQueue.enqueue({
          commitment: data.commitment,
          order: data.pendingOrder,
          program: data.pendingProgram,
          validationTxHash: data.tx_hash,
          validatedAt: Date.now(),
          stage: 'finalising',
          label: `${proposal.amountIn} ${proposal.tokenIn} to ${proposal.tokenOut}`,
        });
        if (needsApproval) {
          handleApprove().catch(() => { /* surfaced on the queue entry */ });
        }
      }

      if (data.approved) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `**Consensus approved.** The verdict is bound to a commitment covering your route, fee, recipient and quote. Execute when ready.\n\nValidator \`${data.genlayer_contract}\``,
            toolsUsed: ['AgentValidator IC', 'GenVM Consensus'],
          }
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: data.retryable
              ? `🔄 **GenVM Consensus Did Not Reach a Verdict**\n\n${data.reason}\n\nPress **Validate** again to run another round.`
              : `⚠️ **GenLayer IC Validation Rejected**\n\nReason: *${data.reason}*`,
            toolsUsed: ['AgentValidator IC'],
          }
        ]);
      }
    } catch (err) {
      console.error('Validation error:', err);
      setIsValidating(false);
      setValidationResult({
        approved: false,
        reason: 'Network error communicating with GenLayer Intelligent Contract',
      });
    }
  };

  // Let pollValidationStatus trigger a fresh validation round without a circular dep.
  handleValidateRef.current = handleValidate;

  // Approve token - approves the correct settlement spender (AgentExecutor or AGGFlowEntrypoint)
  useEffect(() => { handleExecuteRef.current = handleExecute; });

  const handleApprove = async () => {
    try {
      const result = await approve();
      if (!result) return;
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `⏳ **One-time approval submitted for ${result.symbol}.** This is the only approval you'll sign for this token - every future agent-executed trade settles without a wallet prompt.\n\nWaiting for confirmation... (Tx: \`${result.hash.slice(0, 10)}...\`)`,
        }
      ]);
    } catch (err) {
      console.error('Approval failed:', err);
      setExecutionError(err?.shortMessage || err?.message || 'Token approval rejected by user');
    }
  };

  // Execute swap on-chain via the one-time approval gate (/api/agent-execute) -
  // see hooks/useAgentSwapExecution.js for the full flow (approve → resolve pool
  // route → build program → AgentExecutor one-time approval → settle).
  const handleExecute = async () => {
    try {
      setBalanceSnapshot(liveBalances);
      const result = await execute(validationResult, settlementHandoffRef.current);
      settlementRetryRef.current = 0;
      setBalanceRefreshKey((k) => k + 1);
      if (!result) return;

      if (result.kind === 'wrap') {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `🚀 **Wrap Submitted!**\n\nWrapping **${result.amountIn} GEN** to **WGEN** (1:1 direct wrap)...\n\nTx Hash: [${result.hash.slice(0, 10)}...${result.hash.slice(-8)}](https://explorer-bradbury.genlayer.com/tx/${result.hash})`,
            toolsUsed: ['WGEN Deposit', 'GenLayer Bradbury'],
          }
        ]);
      } else if (result.kind === 'unwrap') {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `🚀 **Unwrap Submitted!**\n\nUnwrapping **${result.amountIn} WGEN** to **GEN** (1:1 direct unwrap)...\n\nTx Hash: [${result.hash.slice(0, 10)}...${result.hash.slice(-8)}](https://explorer-bradbury.genlayer.com/tx/${result.hash})`,
            toolsUsed: ['WGEN Withdraw', 'GenLayer Bradbury'],
          }
        ]);
      } else if (result.kind === 'swap') {
        recordActivity({
          id: result.hash,
          kind: 'swap',
          user: userAddress,
          pair: `${currentProposal?.tokenIn} → ${currentProposal?.tokenOut}`,
          label: `Settled ${currentProposal?.amountIn} ${currentProposal?.tokenIn} → ${currentProposal?.tokenOut}`,
          settleTxHash: result.hash,
          status: 'settled',
        });
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `🚀 **Trade Executed via AgentExecutor!**\n\n✅ One-time approval bound and consumed on AgentExecutor.\n✅ Settlement routed through GenLayer-consensus-gated approval hash.\n\nTrade Hash: \`${result.tradeHash?.slice(0, 14)}...\`\nApprove Tx: \`${result.approveTxHash?.slice(0, 10)}...\`\n\nExecution Tx: [${result.hash?.slice(0, 10)}...${result.hash?.slice(-8)}](${result.explorerUrl})`,
            toolsUsed: ['AgentExecutor', 'AGGFlowEntrypoint', 'GenLayer Bradbury'],
          }
        ]);
      } else if (result.kind === 'remove_liquidity') {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `💸 **Liquidity Withdrawn via AgentExecutor!**\n\n✅ One-time approval bound and consumed.\n\nLP burned: \`${result.lpBurned}\`\nApprove Tx: \`${result.approveTxHash?.slice(0, 10)}...\`\n\nExecution Tx: [${result.hash?.slice(0, 10)}...${result.hash?.slice(-8)}](${result.explorerUrl})`,
            toolsUsed: ['AgentExecutor', 'UniswapV2Router', 'GenLayer Bradbury'],
          }
        ]);
      } else if (result.kind === 'add_liquidity') {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `**Liquidity added.** [View transaction](${result.explorerUrl})`,
            toolsUsed: ['AgentExecutor', 'UniswapV2Router', 'GenLayer Bradbury'],
          }
        ]);
      } else if (result.kind === 'swap_fallback') {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `🚀 **Trade Submitted!**\n\nExecution is broadcasting on GenLayer Bradbury Testnet...\n\n⚠️ *Note: Running in fallback mode - AgentExecutor not yet deployed.*\n\nTx Hash: [${result.hash.slice(0, 10)}...${result.hash.slice(-8)}](https://explorer-bradbury.genlayer.com/tx/${result.hash})`,
            toolsUsed: ['AGGFlowEntrypoint', 'GenLayer Bradbury'],
          }
        ]);
      }
    } catch (err) {
      console.error('Execution failed:', err);

      // Not a failure at all: consensus has approved the trade and the verdict
      // is still crossing to the executor.
      //
      // An Intelligent Contract delivers its verdict as an external message,
      // and those are delivered only once the round can no longer be appealed.
      // So there is a real window where the trade is approved and the executor
      // still will not honour it. Reporting that as an error would tell the
      // user their trade failed when it is simply still settling.
      //
      // The retry MUST carry the order back, or it would re-quote, rebuild the
      // route, and end up waiting on a different identifier from the one
      // consensus is finalising.
      if (err?.pending) {
        if (err.pendingOrder && err.pendingProgram) {
          settlementHandoffRef.current = {
            pendingOrder: err.pendingOrder,
            pendingProgram: err.pendingProgram,
            validationSubmitted: true,
          };
        }
        // Hand it to the settlement queue and stop occupying the foreground.
        //
        // The queue already polls isVerdictLive every 20s and settles the
        // moment the verdict lands, surviving a page close. Retrying
        // handleExecute in the foreground duplicated that badly: each attempt
        // re-opened a request that itself blocked for the verdict wait, so
        // eight attempts spanned far longer than the appeal window while the
        // panel showed one unchanging "Validating" spinner.
        if (err.pendingOrder && err.pendingProgram && err.commitment) {
          settlementQueue.enqueue({
            commitment: err.commitment,
            order: err.pendingOrder,
            program: err.pendingProgram,
            validationTxHash: err.validationTxHash || null,
            validatedAt: Date.now(),
            stage: 'finalising',
            needsApproval: Boolean(needsApproval),
            label: `${currentProposal?.amountIn ?? ''} ${currentProposal?.tokenIn ?? ''} to ${currentProposal?.tokenOut ?? ''}`.trim(),
          });
        }

        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `⏳ **Consensus approved this trade. The verdict is on its way to the executor.**\n\n`
              + `GenLayer delivers a verdict to the settlement contract only once the round can no longer `
              + `be appealed, which takes roughly **15 to 25 minutes** on Bradbury. That wait belongs to the `
              + `network, not to this page.\n\n`
              + `It is now on your settlement queue below and will execute by itself the moment the verdict `
              + `lands - you can close this page.`,
            toolsUsed: ['AgentValidator IC', 'Appeal window', 'Settlement queue'],
          },
        ]);
        return;
      }

      // A stale quote is not a failure the user should have to fix by retyping
      // their request. These pools are small enough that a real trade moves the
      // price between quote and settlement, and enforced per-trade consensus
      // widens that window - so re-quote automatically and re-validate.
      if (err?.stale) {
        const p = currentProposal;
        if (!p) return;
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `⚠️ **The pool moved past your ${(p.slippageBps || 30) / 100}% slippage tolerance while this quote was validating.**\n\nFetching a fresh quote and re-validating automatically - no need to retype your request.`,
            toolsUsed: ['Live pool re-quote'],
          },
        ]);
        try {
          const res = await fetch('/api/agent-v2', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: `Swap ${p.amountIn} ${p.tokenIn} to ${p.tokenOut}`,
              history: [],
            }),
          });
          const data = await res.json();
          if (data?.proposal) {
            setCurrentProposal(data.proposal);
            setValidationResult(null);
    settlementHandoffRef.current = null;
            resetExecution();
            setMessages((prev) => [
              ...prev,
              {
                role: 'assistant',
                content: `🔄 **Fresh quote:** ${data.proposal.amountIn} ${data.proposal.tokenIn} → **${data.proposal.expectedOutput}** (min ${data.proposal.minAmountOut}, impact ${data.proposal.priceImpact}).\n\nRe-validating through GenLayer consensus now - press Execute once it turns green.`,
                toolsUsed: ['AgentValidator IC'],
              },
            ]);
            handleValidateRef.current?.(0, data.proposal);
          }
        } catch (requoteErr) {
          console.error('Auto re-quote failed:', requoteErr);
        }
      }
    }
  };

  const handleReset = () => {
    setMessages([
      {
        role: 'assistant',
        content: "Cleared active session! What trade or DeFi question would you like to explore next?",
      }
    ]);
    setCurrentProposal(null);
    setValidationResult(null);
    settlementHandoffRef.current = null;
    resetExecution();
  };

  return (
    <>
      <Head>
        <title>Soyara AI Trading - GenLayer Intelligent Contracts</title>
        <meta name="description" content="Soyara DEX - AI-Validated DeFi Execution on GenLayer Bradbury Testnet" />
      </Head>

      <div className={`${aiStyles.container} ${isDark ? aiStyles.themeDark : aiStyles.themeLight}`}>
        {/* Top Intelligence Bar */}
        <div className={aiStyles.banner}>
          <div className={aiStyles.bannerInner}>
            <div className={aiStyles.bannerLeft}>
              <div className={aiStyles.bannerIcon}>
                <Cpu size={18} />
              </div>
              <div className={aiStyles.bannerTitle}>AI Trading</div>
              <code className={aiStyles.code}>
                {INTELLIGENT_CONTRACTS.agentValidator.slice(0, 8)}...{INTELLIGENT_CONTRACTS.agentValidator.slice(-6)}
              </code>
            </div>

            <div className={aiStyles.bannerRight}>
              <div className={aiStyles.statusPill}>
                <span className={aiStyles.statusDot} />
                Bradbury Testnet (4221)
              </div>
            </div>
          </div>
        </div>

        {/* Quick Topic Chips */}
        <div className={aiStyles.topicChipsContainer}>
          <div className={aiStyles.topicChipsTitle}>
            <span>Topics</span>
          </div>
          <div className={aiStyles.topicChipsScroll}>
            {TOPIC_CHIPS.map((chip, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  handleSend(chip.prompt);
                  setMobileTab('chat');
                }}
                className={aiStyles.topicChipBtn}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        {/* Mobile Tab Switcher */}
        <div className={aiStyles.mobileTabSwitcher}>
          <button
            type="button"
            onClick={() => setMobileTab('chat')}
            className={`${aiStyles.mobileTabBtn} ${mobileTab === 'chat' ? aiStyles.mobileTabBtnActive : ''}`}
          >
            <Bot size={16} />
            <span>AI Assistant</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileTab('proposal')}
            className={`${aiStyles.mobileTabBtn} ${mobileTab === 'proposal' ? aiStyles.mobileTabBtnActive : ''}`}
          >
            <ShieldCheck size={16} />
            <span>Proposal {currentProposal ? '•' : ''}</span>
          </button>
        </div>

        {/* Main Grid */}
        <div className={aiStyles.mainGrid}>
          {/* Left Column: Chat Assistant */}
          <div className={`${aiStyles.chatCard} ${mobileTab !== 'chat' ? aiStyles.hideOnMobileChat : ''}`}>
            <div className={aiStyles.chatHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Assistant</span>
              </div>
              <button 
                type="button"
                onClick={handleReset}
                className={aiStyles.resetBtn}
                title="Reset Conversation"
              >
                <RotateCcw size={14} />
                <span>Reset</span>
              </button>
            </div>

            {/* Messages Scroll Area */}
            <div className={aiStyles.messagesContainer}>
              {messages.map((msg, idx) => (
                <React.Fragment key={idx}>
                  <ChatMessage
                    role={msg.role}
                    content={msg.content}
                    toolsUsed={msg.toolsUsed}
                  />
                  {/* A real link, not just a URL inside prose. The whole point of
                      the handoff is that the user can act on it in one click. */}
                  {msg.redirect?.url && (
                    <div style={{ margin: '0 0 0.9rem' }}>
                      <PoolsHandoffPanel url={msg.redirect.url} />
                    </div>
                  )}
                </React.Fragment>
              ))}

              {isLoading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', color: isDark ? '#94a3b8' : '#64748b', fontSize: '0.85rem' }}
                >
                  <Loader2 size={16} style={{ animation: 'spin 1s linear infinite', color: '#0284c7' }} />
                  <span>Working...</span>
                </motion.div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Starter Prompts */}
            <div className={aiStyles.startersWrapper}>
              <div className={aiStyles.startersScroll}>
                {STARTER_PROMPTS.map((promptText, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      handleSend(promptText.replace(/^[^\w]+/, ''));
                      setMobileTab('chat');
                    }}
                    className={aiStyles.starterChip}
                  >
                    {promptText}
                  </button>
                ))}
              </div>
            </div>

            {/* Input Box */}
            <div className={aiStyles.inputWrapper}>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Ask me to quote, swap, compare routes, or discuss DeFi on GenLayer..."
                className={aiStyles.textInput}
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => handleSend()}
                disabled={!input.trim() || isLoading}
                className={`${aiStyles.sendButton} ${(!input.trim() || isLoading) ? aiStyles.sendButtonDisabled : ''}`}
              >
                <Send size={16} />
              </button>
            </div>
          </div>

          {/* Right Column: Execution & Validation Panel */}
          <div className={`${aiStyles.proposalCard} ${mobileTab !== 'proposal' ? aiStyles.hideOnMobileProposal : ''}`}>
            <div className={aiStyles.proposalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldCheck size={18} style={{ color: '#0284c7' }} />
                <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>AI Execution Proposal</span>
              </div>
              {currentProposal && (
                <span style={{ fontSize: '0.75rem', color: isDark ? '#94a3b8' : '#64748b' }}>
                  {currentProposal.route || 'V2'}
                </span>
              )}
            </div>

            <div className={aiStyles.proposalBody}>
              {settlementQueue.entries.length > 0 && (
                <div style={{ marginBottom: '14px' }}>
                  <SettlementQueue queue={settlementQueue} onApprove={() => handleApprove()} />
                </div>
              )}

              <ProposalPanel
                proposal={currentProposal}
                validationResult={validationResult}
                onValidate={handleValidate}
                onExecute={handleExecute}
                onApprove={handleApprove}
                needsApproval={needsApproval}
                isApproving={isApproving}
                isCheckingAllowance={isCheckingAllowance}
                validationStartedAt={validationStartedAt}
                hasInsufficientBalance={hasInsufficientBalance}
                isNotExecutable={isNotExecutable}
                notExecutableReason={notExecutableReason}
                isValidating={isValidating}
                isExecuting={isExecuting || isTxWaiting}
                txHash={activeTxHash}
                executionError={executionError}
              />

              {/* The same evidence /a2a shows: what the pools behind this quote
                  hold, which rail can carry the verdict, and the on-chain proof
                  that the commitment binds this exact route, fee and recipient. */}
              <SwarmInsight
                proposal={currentProposal}
                validationResult={validationResult}
                userAddress={userAddress}
              />

              {currentProposal && (
                <div style={{ marginTop: '0.9rem' }}>
                  <BalanceStrip
                    tokens={[fromTokenObj, toTokenObj]}
                    snapshot={balanceSnapshot}
                    refreshKey={balanceRefreshKey}
                    isDark={isDark}
                    onLoaded={setLiveBalances}
                  />
                </div>
              )}

              {/* Survives closing the page: pending rounds are re-checked on return. */}
              <div style={{ marginTop: '0.9rem' }}>
                <ActivityPanel isDark={isDark} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
