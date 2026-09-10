import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { 
  Terminal, 
  Code2, 
  Bot, 
  Play, 
  Copy, 
  Check, 
  ExternalLink, 
  ShieldCheck, 
  ArrowRightLeft, 
  Sparkles, 
  Layers, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Key, 
  FileCode2, 
  Sliders, 
  Database, 
  Cpu, 
  Network 
} from 'lucide-react';
import { CONTRACT_ADDRESSES, INTELLIGENT_CONTRACTS } from '../constants/addresses';
import { useAccount } from 'wagmi';
import { useTheme } from '../components/contexts/ThemeContext';
import styles from '../styles/Dev.module.css';

// Every snippet below uses the settlement path as it is deployed: consensus
// authorises the exact order (or a mandate an earlier round issued covers it),
// and AgentExecutor settles it. None of them sends a trade to AGGFlowEntrypoint
// directly, and none reads a write method as though a simulation were a
// verdict - both are things this page used to show.
const CODE_EXAMPLES = {
  typescript: `// TypeScript / Node.js agent against the app's settlement API.
// Validation is a GenLayer consensus WRITE and settlement is an onlyAgent call
// on AgentExecutor, so both run server-side, where those keys live.
const BASE = 'https://app.soyara.com';   // or your deployment of these routes
const USER = '0xYourWallet';               // receives the output; approved AgentExecutor once

const post = (path: string, body: object) =>
  fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then((r) => r.json());

export async function executeAgentTrade() {
  // 1. AgentValidator ${INTELLIGENT_CONTRACTS.agentValidator} authorises the exact order,
  //    or a mandate you already hold covers it. The response names the rail.
  let v = await post('/api/genlayer-validate', {
    action: 'SWAP', user: USER, tokenIn: 'USDC', tokenOut: 'WGEN', amountIn: '100', slippageBps: 30,
  });
  while (v.pending) {
    await new Promise((r) => setTimeout(r, 4000));
    v = { ...v, ...(await post('/api/genlayer-validate', { checkTxHash: v.tx_hash, proposalId: v.proposal_id })) };
  }
  if (!v.approved) throw new Error(\`Consensus did not approve: \${v.reason}\`);

  // 2. AgentExecutor ${CONTRACT_ADDRESSES[4221].agentExecutor} settles it on that rail.
  //    consensus rail: 202 { pending } until the verdict lands (appeal window) - retry.
  return post('/api/agent-execute', {
    rail: v.rail, mandateId: v.mandate_id,
    pendingOrder: v.pendingOrder, pendingProgram: v.pendingProgram,
    validationSubmitted: v.validationSubmitted, validationTxHash: v.tx_hash,
  });
}`,

  python: `# Python agent against the app's settlement API.
import time, requests

BASE = "https://app.soyara.com"
USER = "0xYourWallet"

def post(path, body):
    return requests.post(BASE + path, json=body, timeout=60).json()

def validate(token_in, token_out, amount_in, slippage_bps=30):
    v = post("/api/genlayer-validate", {"action": "SWAP", "user": USER, "tokenIn": token_in,
                                        "tokenOut": token_out, "amountIn": str(amount_in),
                                        "slippageBps": slippage_bps})
    while v.get("pending"):
        time.sleep(4)
        v = {**v, **post("/api/genlayer-validate", {"checkTxHash": v["tx_hash"], "proposalId": v.get("proposal_id")})}
    return v

def settle(v):
    # AgentExecutor refuses anything consensus did not authorise.
    return post("/api/agent-execute", {"rail": v["rail"], "mandateId": v.get("mandate_id"),
                                       "pendingOrder": v["pendingOrder"], "pendingProgram": v["pendingProgram"],
                                       "validationSubmitted": v.get("validationSubmitted"),
                                       "validationTxHash": v.get("tx_hash")})

v = validate("USDC", "WGEN", 100)
print(v["rail"], v["approved"], v.get("reason"))`,

  solidity: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// The settlement contract an agent integrates with. Only an address the owner
// registered as an agent may call the execute functions, and only the
// AgentValidator Intelligent Contract can record the verdicts and mandates
// they consume - the agent relays a trade, it cannot approve one.
struct SwapOrder {
    address user;            // recipient; bound into the commitment
    address tokenIn;
    address tokenOut;
    uint256 amountIn;
    uint256 minAmountOut;
    uint256 quotedAmountOut; // the quote consensus checked against live reserves
    uint256 slippageBps;
    uint256 deadline;
    address router;          // must be the AGGFlow entrypoint
    uint256 feeBps;
    address feeCollector;
    bytes32 routeHash;       // keccak256(aggProgram)
    uint256 nonce;
}

interface IAgentExecutor {
    // consensus rail: consumes the single-use verdict for this order's commitment
    function executeSwap(SwapOrder calldata order, bytes calldata aggProgram)
        external payable returns (uint256 amountOut);

    // mandate rail: checked and priced on chain against a consensus-issued mandate
    function executeSwapUnderMandate(bytes32 id, uint256 amountIn, uint256 minAmountOut,
        uint256 feeBps, bytes calldata aggProgram) external payable returns (uint256 amountOut);

    function getSwapCommitment(SwapOrder calldata order) external view returns (bytes32);
    function isVerdictLive(bytes32 commitment) external view returns (bool);
    function isMandateLive(bytes32 id) external view returns (bool);
}

// AgentExecutor: ${CONTRACT_ADDRESSES[4221].agentExecutor}
// Reverts: NoConsensusVerdict, CommitmentAlreadyUsed, RouteMismatch,
//          QuoteInconsistent, SlippageExceeded, NoMandate, MandateBudgetExceeded`,

  curl: `# 1. Consensus authorises the exact order (no keys needed on your side)
curl -s -X POST https://app.soyara.com/api/genlayer-validate \\
  -H "Content-Type: application/json" \\
  -d '{"action":"SWAP","user":"0xYourWallet","tokenIn":"USDC","tokenOut":"WGEN","amountIn":"100","slippageBps":30}'

# 2. Preview without opening a round: the exact order and commitment
curl -s -X POST https://app.soyara.com/api/genlayer-validate \\
  -H "Content-Type: application/json" \\
  -d '{"action":"SWAP","user":"0xYourWallet","tokenIn":"USDC","tokenOut":"WGEN","amountIn":"100","slippageBps":30,"dryRun":true}'

# 3. Read a recorded verdict straight from the executor (${CONTRACT_ADDRESSES[4221].agentExecutor})
cast call ${CONTRACT_ADDRESSES[4221].agentExecutor} 'isVerdictLive(bytes32)(bool)' <commitment> \\
  --rpc-url https://rpc-bradbury.genlayer.com`
};

// Shared by the templates: validate the exact order, then settle it on the
// rail consensus chose. Defined once in the snippets above.
const TEMPLATE_HELPERS = `// validate(intent) and settle(v) are the two calls from the TypeScript
// snippet above: /api/genlayer-validate, then /api/agent-execute.`;

const BOT_TEMPLATES = [
  {
    id: 'arbitrage',
    name: 'AI Cross-Pool Arbitrage Bot',
    badge: 'High Frequency',
    desc: 'Watches SoyaraDex V2 and V3 pools for price spreads and trades them, each trade authorised by GenLayer consensus and settled by AgentExecutor on the best route.',
    code: `${TEMPLATE_HELPERS}
async function runArbitrageScanner() {
  const spreadBps = await readVenueSpreadBps('USDC', 'WGEN'); // from live pool reserves
  if (spreadBps < 45) return;                                  // not worth the fees

  const v = await validate({ tokenIn: 'USDC', tokenOut: 'WGEN', amountIn: '500', slippageBps: 20 });
  if (!v.approved) return console.log('consensus refused:', v.reason);

  // The aggregator already picked the best route; the order binds it.
  const s = await settle(v);
  console.log('settled via', s.rail, s.execTxHash || '(verdict still finalizing)');
}`
  },
  {
    id: 'dca',
    name: 'Intent-Driven DCA Accumulator',
    badge: 'Automated Investing',
    desc: 'Buys a target token on a schedule. After the first trade the app asks consensus for a mandate in that direction, so later buys settle in seconds instead of waiting out the appeal window.',
    code: `${TEMPLATE_HELPERS}
async function executeDCACycle(tokenTarget, budgetUSDC) {
  const v = await validate({ tokenIn: 'USDC', tokenOut: tokenTarget, amountIn: budgetUSDC, slippageBps: 30 });
  if (!v.approved) return console.log('skipped:', v.reason);

  // rail 'mandate': one executeSwapUnderMandate call, seconds.
  // rail 'consensus': this order's own verdict, after the appeal window.
  console.log('settling on the', v.rail, 'rail');
  return settle(v);
}`
  },
  {
    id: 'rebalance',
    name: 'Portfolio Rebalancer',
    badge: 'Treasury Management',
    desc: 'Keeps a wallet at target weights by swapping the overweight asset into the underweight one. Liquidity positions are managed on the pools app; this agent only swaps.',
    code: `${TEMPLATE_HELPERS}
async function rebalance(targets /* e.g. { USDC: 0.5, WGEN: 0.5 } */) {
  const drift = await measureDrift(targets);                   // balances vs targets
  if (Math.abs(drift.pct) < 2) return;                         // inside the band

  const v = await validate({
    tokenIn: drift.overweight, tokenOut: drift.underweight,
    amountIn: drift.amountToMove, slippageBps: 50,
  });
  if (v.approved) await settle(v);
}`
  }
];

export default function DevPage() {
  const { theme } = useTheme();
  const isDark = theme !== 'light';
  const { address } = useAccount();

  // Active code snippet tab
  const [activeCodeTab, setActiveCodeTab] = useState('typescript');
  const [copiedKey, setCopiedKey] = useState('');

  // Active starter template
  const [activeTemplate, setActiveTemplate] = useState('arbitrage');

  // Simulator State
  const [simTokenIn, setSimTokenIn] = useState('USDC');
  const [simTokenOut, setSimTokenOut] = useState('WGEN');
  const [simAmountIn, setSimAmountIn] = useState('100');
  const [simSlippageBps, setSimSlippageBps] = useState('30');
  const [simLoading, setSimLoading] = useState(false);
  const [simResponse, setSimResponse] = useState(null);

  const copyToClipboard = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(''), 2000);
  };

  // A dry run of the real validate route: it builds the exact order, program
  // and commitment a consensus round would be opened against, and reports the
  // rail the trade would take - without opening a round. It used to post a
  // loosely typed proposal with no recipient, which the route could only
  // refuse, and read "simulate" as though it were consensus.
  const runSimulation = async () => {
    setSimLoading(true);
    setSimResponse(null);

    const proposal = {
      action: 'SWAP',
      dryRun: true,
      // The recipient is inside the commitment; with no wallet connected a
      // placeholder shows the shape of the order.
      user: address || '0x3333333333333333333333333333333333333333',
      tokenIn: simTokenIn,
      tokenOut: simTokenOut,
      amountIn: simAmountIn,
      slippageBps: parseInt(simSlippageBps, 10),
    };

    try {
      const res = await fetch('/api/genlayer-validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(proposal)
      });
      const data = await res.json();
      setSimResponse(data);
    } catch (err) {
      setSimResponse({
        approved: false,
        error: err.message,
        timestamp: new Date().toISOString()
      });
    } finally {
      setSimLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Developer Portal & Agent Workbench - Soyara DEX on GenLayer</title>
        <meta name="description" content="Interactive developer portal, SDK references, simulation console, and autonomous agent integration templates for Soyara DEX on GenLayer." />
      </Head>

      <div className={`${styles.container} ${isDark ? styles.themeDark : styles.themeLight}`}>
        <div className={styles.contentWrapper}>
          
          {/* Header Section */}
          <div className={styles.headerSection}>
            <div className={styles.badgeRow}>
              <span className={styles.badge}><Terminal size={12} /> Developer Portal</span>
              <span className={styles.badge}><Bot size={12} /> Agent-to-Agent (A2A)</span>
              <span className={styles.badge}><Cpu size={12} /> GenLayer Bradbury (4221)</span>
            </div>
            <h1 className={styles.h1}>Soyara DEX Developer & Agent Workbench</h1>
            <p className={styles.lead}>
              Build, test, and integrate autonomous AI agents, algorithmic bots, and smart contract callers with Soyara DEX’s GenVM Intelligent Contracts and AGGFlow Aggregator.
            </p>
          </div>

          {/* SECTION 1: INTERACTIVE GENVM SIMULATION CONSOLE */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitleGroup}>
                <div className={styles.sectionIconWrap}>
                  <Play size={18} />
                </div>
                <div>
                  <h2 className={styles.h2}>Settlement Dry Run</h2>
                  <p className={styles.desc}>
                    Build the exact order the app would ask AgentValidator (<code className={styles.code}>{INTELLIGENT_CONTRACTS.agentValidator.slice(0, 10)}...</code>) to approve: live best-route quote, route program, and the commitment AgentExecutor would require. No round is opened; the response also says whether a mandate you hold already covers it.
                  </p>
                </div>
              </div>
            </div>

            <div className={styles.simulatorGrid}>
              {/* Input Form */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className={styles.inputGroup}>
                  <label className={styles.inputLabel}>Action</label>
                  <div className={styles.selectField} style={{ display: 'flex', alignItems: 'center' }}>
                    SWAP (the agent surfaces settle swaps; liquidity is on the pools app)
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className={styles.inputGroup}>
                    <label className={styles.inputLabel}>Token In</label>
                    <select 
                      value={simTokenIn} 
                      onChange={(e) => setSimTokenIn(e.target.value)} 
                      className={styles.selectField}
                    >
                      <option value="USDC">USDC</option>
                      <option value="USDT">USDT</option>
                      <option value="WGEN">WGEN</option>
                      <option value="GEN">GEN (Native)</option>
                      <option value="WBTC">WBTC</option>
                      <option value="ETH">ETH</option>
                    </select>
                  </div>

                  <div className={styles.inputGroup}>
                    <label className={styles.inputLabel}>Token Out</label>
                    <select 
                      value={simTokenOut} 
                      onChange={(e) => setSimTokenOut(e.target.value)} 
                      className={styles.selectField}
                    >
                      <option value="WGEN">WGEN</option>
                      <option value="USDC">USDC</option>
                      <option value="USDT">USDT</option>
                      <option value="GEN">GEN (Native)</option>
                      <option value="WBTC">WBTC</option>
                      <option value="ETH">ETH</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className={styles.inputGroup}>
                    <label className={styles.inputLabel}>Amount In</label>
                    <input 
                      type="number" 
                      value={simAmountIn} 
                      onChange={(e) => setSimAmountIn(e.target.value)} 
                      className={styles.inputField} 
                      placeholder="100"
                    />
                  </div>

                  <div className={styles.inputGroup}>
                    <label className={styles.inputLabel}>Slippage (BPS)</label>
                    <input 
                      type="number" 
                      value={simSlippageBps} 
                      onChange={(e) => setSimSlippageBps(e.target.value)} 
                      className={styles.inputField} 
                      placeholder="30"
                    />
                  </div>
                </div>

                <button 
                  type="button" 
                  onClick={runSimulation} 
                  disabled={simLoading}
                  className={styles.runBtn}
                >
                  {simLoading ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" />
                      <span>Building the order...</span>
                    </>
                  ) : (
                    <>
                      <Play size={16} />
                      <span>Dry Run (no round opened)</span>
                    </>
                  )}
                </button>
              </div>

              {/* Output Panel */}
              <div className={styles.responsePanel}>
                <div className={styles.responseHeader}>
                  <span>Order, Commitment and Rail</span>
                  {simResponse && (
                    <span style={{ color: 'inherit', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 700 }}>
                      {simResponse.approved ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                      {simResponse.approved
                        ? 'COVERED BY MANDATE'
                        : simResponse.dryRun ? 'DRY RUN (NOT APPROVED)' : 'REFUSED'}
                    </span>
                  )}
                </div>
                <pre className={styles.responsePre}>
                  {simResponse 
                    ? JSON.stringify(simResponse, null, 2)
                    : '// Dry Run builds the exact order a consensus round would be opened against. It opens nothing and approves nothing.'}
                </pre>
              </div>
            </div>
          </div>

          {/* SECTION 2: MULTI-LANGUAGE INTEGRATION CODE */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitleGroup}>
                <div className={styles.sectionIconWrap}>
                  <Code2 size={18} />
                </div>
                <div>
                  <h2 className={styles.h2}>Multi-Language Integration Snippets</h2>
                  <p className={styles.desc}>
                    Ready-to-use boilerplate code for TypeScript, Python, Solidity smart contracts, and raw JSON-RPC.
                  </p>
                </div>
              </div>

              <div className={styles.tabRow}>
                <button 
                  type="button" 
                  onClick={() => setActiveCodeTab('typescript')}
                  className={`${styles.tabBtn} ${activeCodeTab === 'typescript' ? styles.tabBtnActive : ''}`}
                >
                  TypeScript (Viem)
                </button>
                <button 
                  type="button" 
                  onClick={() => setActiveCodeTab('python')}
                  className={`${styles.tabBtn} ${activeCodeTab === 'python' ? styles.tabBtnActive : ''}`}
                >
                  Python 3.11
                </button>
                <button 
                  type="button" 
                  onClick={() => setActiveCodeTab('solidity')}
                  className={`${styles.tabBtn} ${activeCodeTab === 'solidity' ? styles.tabBtnActive : ''}`}
                >
                  Solidity Interface
                </button>
                <button 
                  type="button" 
                  onClick={() => setActiveCodeTab('curl')}
                  className={`${styles.tabBtn} ${activeCodeTab === 'curl' ? styles.tabBtnActive : ''}`}
                >
                  cURL / JSON-RPC
                </button>
              </div>
            </div>

            <div className={styles.codeContainer}>
              <div className={styles.codeHeader}>
                <span className={styles.codeLang}>{activeCodeTab}</span>
                <button 
                  type="button" 
                  onClick={() => copyToClipboard(CODE_EXAMPLES[activeCodeTab], activeCodeTab)} 
                  className={styles.copyBtn}
                >
                  {copiedKey === activeCodeTab ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copiedKey === activeCodeTab ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <pre className={styles.pre}>
                <code>{CODE_EXAMPLES[activeCodeTab]}</code>
              </pre>
            </div>
          </div>

          {/* SECTION 3: AUTONOMOUS BOT STARTER KITS */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitleGroup}>
                <div className={styles.sectionIconWrap}>
                  <Bot size={18} />
                </div>
                <div>
                  <h2 className={styles.h2}>Autonomous AI Agent Starter Templates</h2>
                  <p className={styles.desc}>
                    Pre-engineered agent patterns designed to run 24/7 with on-chain Intelligent Contract guardrails.
                  </p>
                </div>
              </div>

              <div className={styles.tabRow}>
                {BOT_TEMPLATES.map((tmpl) => (
                  <button 
                    key={tmpl.id}
                    type="button" 
                    onClick={() => setActiveTemplate(tmpl.id)}
                    className={`${styles.tabBtn} ${activeTemplate === tmpl.id ? styles.tabBtnActive : ''}`}
                  >
                    {tmpl.name}
                  </button>
                ))}
              </div>
            </div>

            {BOT_TEMPLATES.filter(t => t.id === activeTemplate).map((tmpl) => (
              <div key={tmpl.id} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <p className={styles.desc}><strong>{tmpl.badge}:</strong> {tmpl.desc}</p>
                <div className={styles.codeContainer}>
                  <div className={styles.codeHeader}>
                    <span className={styles.codeLang}>JavaScript Template</span>
                    <button 
                      type="button" 
                      onClick={() => copyToClipboard(tmpl.code, tmpl.id)} 
                      className={styles.copyBtn}
                    >
                      {copiedKey === tmpl.id ? <Check size={14} /> : <Copy size={14} />}
                      <span>{copiedKey === tmpl.id ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <pre className={styles.pre}>
                    <code>{tmpl.code}</code>
                  </pre>
                </div>
              </div>
            ))}
          </div>

          {/* SECTION 4: PROTOCOL DIRECTORY & QUICK LINKS */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitleGroup}>
                <div className={styles.sectionIconWrap}>
                  <Database size={18} />
                </div>
                <div>
                  <h2 className={styles.h2}>Protocol Contracts & Verification Directory</h2>
                  <p className={styles.desc}>
                    Direct references and explorer links for all deployed core smart contracts on Bradbury Testnet (4221).
                  </p>
                </div>
              </div>
            </div>

            <div className={styles.grid2}>
              <div className={styles.infoCard}>
                <div className={styles.infoTitle}>AgentValidator (GenLayer IC)</div>
                <div className={styles.infoValue}>{INTELLIGENT_CONTRACTS.agentValidator}</div>
                <a 
                  href={`https://explorer-bradbury.genlayer.com/address/${INTELLIGENT_CONTRACTS.agentValidator}`} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className={styles.link}
                >
                  View on Bradbury Explorer <ExternalLink size={12} />
                </a>
              </div>

              <div className={styles.infoCard}>
                <div className={styles.infoTitle}>AgentExecutor (Settlement Gate)</div>
                <div className={styles.infoValue}>{CONTRACT_ADDRESSES[4221].agentExecutor}</div>
                <a 
                  href={`https://explorer-bradbury.genlayer.com/address/${CONTRACT_ADDRESSES[4221].agentExecutor}`} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className={styles.link}
                >
                  View on Bradbury Explorer <ExternalLink size={12} />
                </a>
              </div>

              <div className={styles.infoCard}>
                <div className={styles.infoTitle}>AGGFlow Entrypoint (EVM Aggregator)</div>
                <div className={styles.infoValue}>{CONTRACT_ADDRESSES[4221].aggregatorEntrypoint}</div>
                <a 
                  href={`https://explorer-bradbury.genlayer.com/address/${CONTRACT_ADDRESSES[4221].aggregatorEntrypoint}`} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className={styles.link}
                >
                  View on Bradbury Explorer <ExternalLink size={12} />
                </a>
              </div>

              <div className={styles.infoCard}>
                <div className={styles.infoTitle}>Canonical Wrapped GEN (WGEN)</div>
                <div className={styles.infoValue}>{CONTRACT_ADDRESSES[4221].wgen}</div>
                <a 
                  href={`https://explorer-bradbury.genlayer.com/address/${CONTRACT_ADDRESSES[4221].wgen}`} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className={styles.link}
                >
                  View on Bradbury Explorer <ExternalLink size={12} />
                </a>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
              <Link href="/docs" className={styles.link} style={{ fontSize: '0.95rem' }}>
                &larr; Read Full 19-Chapter Documentation
              </Link>
              <Link href="/ai" className={styles.link} style={{ fontSize: '0.95rem' }}>
                Try Conversational AI Trading &rarr;
              </Link>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
