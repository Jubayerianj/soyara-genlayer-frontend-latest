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
import { useTheme } from '../components/contexts/ThemeContext';
import styles from '../styles/Dev.module.css';

const CODE_EXAMPLES = {
  typescript: `// TypeScript / Node.js Agent Integration
import { createClient } from 'genlayer-js';
import { createWalletClient, http, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

// 1. Initialize GenLayer Intelligent Contract Client
const genClient = createClient({
  endpoint: 'https://rpc-bradbury.genlayer.com',
});

// 2. Initialize EVM Settlement Client
const account = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as \`0x\${string}\`);
const evmClient = createWalletClient({
  account,
  transport: http('https://rpc-bradbury.genlayer.com'),
});

const AGENT_VALIDATOR = '${INTELLIGENT_CONTRACTS.agentValidator}';
const AGG_ENTRYPOINT = '${CONTRACT_ADDRESSES[4221].aggregatorEntrypoint}';

export async function executeAgentTrade() {
  const proposal = {
    action: 'SWAP',
    tokenIn: '0x58B6CD7891cd0A682226E25607b958a6479195A6', // USDC
    tokenOut: '0x315374AA9b5536037Cc1Efeea2439CCC0913A77e', // WGEN
    amountInRaw: parseEther('100').toString(),
    minAmountOutRaw: parseEther('198').toString(),
    slippageBps: 30, // 0.30%
    router: AGG_ENTRYPOINT,
    deadline: Math.floor(Date.now() / 1000) + 1800,
    extraData: JSON.stringify({ agent: 'alpha_arbitrage_v1' })
  };

  // Step 1: Consensus Validation on GenVM
  console.log('Validating proposal on GenLayer GenVM...');
  const result = await genClient.readContract({
    address: AGENT_VALIDATOR,
    functionName: 'validate_swap',
    args: [
      proposal.action,
      proposal.tokenIn,
      proposal.tokenOut,
      proposal.amountInRaw,
      proposal.minAmountOutRaw,
      proposal.slippageBps,
      proposal.router,
      proposal.deadline,
      proposal.extraData
    ]
  });

  if (!result?.approved) {
    throw new Error(\`GenLayer Validator Consensus Rejected: \${result?.reason}\`);
  }

  console.log('✅ Approved on GenVM! Proposal ID:', result.proposal_id);
  // Step 2: Execute transaction on EVM settlement contract
  return result;
}`,

  python: `# Python 3.11 Autonomous Agent Integration
import requests
import json
import time

GENLAYER_RPC = "https://rpc-bradbury.genlayer.com"
AGENT_VALIDATOR = "${INTELLIGENT_CONTRACTS.agentValidator}"
AGG_ENTRYPOINT = "${CONTRACT_ADDRESSES[4221].aggregatorEntrypoint}"

class SoyaraDeFiAgent:
    def __init__(self, rpc_url=GENLAYER_RPC):
        self.rpc_url = rpc_url

    def validate_swap_intent(self, token_in, token_out, amount_in_raw, min_out_raw, slippage_bps=30):
        deadline = int(time.time()) + 1800
        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "gen_call",
            "params": {
                "to": AGENT_VALIDATOR,
                "function": "validate_proposal",
                "args": [
                    "SWAP",
                    token_in,
                    token_out,
                    str(amount_in_raw),
                    str(min_out_raw),
                    slippage_bps,
                    AGG_ENTRYPOINT,
                    deadline,
                    json.dumps({"agent_type": "python_autonomous_bot"})
                ]
            }
        }
        res = requests.post(self.rpc_url, json=payload).json()
        return res.get("result")

# Run Agent
agent = SoyaraDeFiAgent()
validation = agent.validate_swap_intent(
    token_in="0x58B6CD7891cd0A682226E25607b958a6479195A6",
    token_out="0x315374AA9b5536037Cc1Efeea2439CCC0913A77e",
    amount_in_raw="100000000000000000000",
    min_out_raw="198000000000000000000"
)
print("GenLayer Validation Response:", json.dumps(validation, indent=2))`,

  solidity: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IAGGFlowEntrypoint {
    function executeSwap(
        bytes calldata commands,
        bytes[] calldata inputs,
        uint256 deadline
    ) external payable returns (uint256 amountOut);
}

interface IAgentValidator {
    function validate_proposal(
        string calldata action,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 slippageBps,
        address router,
        uint256 deadline,
        string calldata extraData
    ) external view returns (bool approved, string memory reason, string memory proposalId);
}

contract AutonomousAgentRelayer {
    IAGGFlowEntrypoint public immutable entrypoint;
    IAgentValidator public immutable validator;

    constructor(address _entrypoint, address _validator) {
        entrypoint = IAGGFlowEntrypoint(_entrypoint);
        validator = IAgentValidator(_validator);
    }

    function executeValidatedTrade(
        bytes calldata commands,
        bytes[] calldata inputs,
        uint256 deadline
    ) external returns (uint256) {
        // Atomic on-chain settlement
        return entrypoint.executeSwap(commands, inputs, deadline);
    }
}`,

  curl: `# Raw JSON-RPC Call to GenLayer Bradbury Testnet
curl -X POST https://rpc-bradbury.genlayer.com \\
  -H "Content-Type: application/json" \\
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "gen_call",
    "params": {
      "to": "${INTELLIGENT_CONTRACTS.agentValidator}",
      "function": "validate_proposal",
      "args": [
        "SWAP",
        "0x58B6CD7891cd0A682226E25607b958a6479195A6",
        "0x315374AA9b5536037Cc1Efeea2439CCC0913A77e",
        "100000000000000000000",
        "198000000000000000000",
        30,
        "${CONTRACT_ADDRESSES[4221].aggregatorEntrypoint}",
        1787680000,
        "{\\"source\\": \\"curl_agent\\"}"
      ]
    }
  }'`
};

const BOT_TEMPLATES = [
  {
    id: 'arbitrage',
    name: 'AI Cross-Pool Arbitrage Bot',
    badge: 'High Frequency',
    desc: 'Scans SoyaraDex V2 classic and V3 concentrated pools for price spreads, requests GenVM validation proof, and executes atomic multi-hop arbitrage.',
    code: `// Template: AI Cross-Pool Arbitrage Bot
async function runArbitrageScanner() {
  const v2Price = await getV2Price('USDC', 'WGEN');
  const v3Price = await getV3Price('USDC', 'WGEN');
  const spreadBps = Math.abs(v2Price - v3Price) / v2Price * 10000;

  if (spreadBps > 45) { // 0.45% profit spread
    console.log('Arbitrage opportunity detected! Spread:', spreadBps, 'bps');
    const validated = await validateSwapProposal({
      action: 'SWAP',
      tokenIn: USDC_ADDR,
      tokenOut: WGEN_ADDR,
      amountIn: '500',
      slippageBps: 20
    });
    if (validated.approved) {
      await executeOnChain(validated);
    }
  }
}`
  },
  {
    id: 'dca',
    name: 'Intent-Driven DCA Accumulator',
    badge: 'Automated Investing',
    desc: 'Periodically accumulates target tokens with strict on-chain slippage ceilings and price impact safeguards verified by GenLayer validators.',
    code: `// Template: Intent-Driven DCA Accumulator
async function executeDCACycle(tokenTarget, budgetUSDC) {
  const proposal = {
    action: 'SWAP',
    tokenIn: USDC_ADDR,
    tokenOut: tokenTarget,
    amountIn: budgetUSDC,
    slippageBps: 30,
    deadline: Math.floor(Date.now() / 1000) + 900
  };

  const proof = await validateSwapProposal(proposal);
  if (proof.approved) {
    console.log('DCA Order validated with ID:', proof.proposal_id);
    await executeOnChain(proof);
  }
}`
  },
  {
    id: 'rebalance',
    name: 'V3 Concentrated Liquidity Rebalancer',
    badge: 'Liquidity Management',
    desc: 'Monitors out-of-range SoyaraDex V3 LP positions and calls LiquidityValidator.py to re-center concentrated tick boundaries with zero loss.',
    code: `// Template: V3 Concentrated Liquidity Rebalancer
async function rebalanceV3Position(positionId) {
  const currentTick = await getPoolTick(WGEN_ADDR, USDC_ADDR);
  const position = await getPositionData(positionId);

  if (currentTick < position.tickLower || currentTick > position.tickUpper) {
    console.log('Position out of range! Re-centering ticks...');
    const newLower = Math.floor(currentTick / 60) * 60 - 1200;
    const newUpper = Math.floor(currentTick / 60) * 60 + 1200;

    const validation = await validateLiquidityProposal({
      action: 'ADD_LIQUIDITY',
      model: 'v3',
      tickLower: newLower,
      tickUpper: newUpper,
      amount0Desired: position.amount0,
      amount1Desired: position.amount1
    });

    if (validation.approved) {
      await broadcastRebalance(validation);
    }
  }
}`
  }
];

export default function DevPage() {
  const { theme } = useTheme();
  const isDark = theme !== 'light';

  // Active code snippet tab
  const [activeCodeTab, setActiveCodeTab] = useState('typescript');
  const [copiedKey, setCopiedKey] = useState('');

  // Active starter template
  const [activeTemplate, setActiveTemplate] = useState('arbitrage');

  // Simulator State
  const [simAction, setSimAction] = useState('SWAP');
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

  const runSimulation = async () => {
    setSimLoading(true);
    setSimResponse(null);

    const tokenMap = {
      USDC: '0x58B6CD7891cd0A682226E25607b958a6479195A6',
      USDT: '0x4B54235778c26Ee8ac27744A53d4c5BC4c9D46fc',
      WGEN: '0x315374AA9b5536037Cc1Efeea2439CCC0913A77e',
      GEN: '0x0000000000000000000000000000000000000000',
      WBTC: '0x723534bc6C2B536fF5D0455111513A9431c44e25',
      ETH: '0x0F56b4E7f4e2cf346a94aB9263Ed3F3644db7c0C',
    };

    const proposal = {
      action: simAction,
      tokenIn: tokenMap[simTokenIn] || simTokenIn,
      tokenOut: tokenMap[simTokenOut] || simTokenOut,
      amountIn: simAmountIn,
      amountInRaw: `${Math.floor(parseFloat(simAmountIn || '1') * 1e18)}`,
      minAmountOutRaw: `${Math.floor(parseFloat(simAmountIn || '1') * 1.95 * 1e18)}`,
      slippageBps: parseInt(simSlippageBps, 10),
      router: CONTRACT_ADDRESSES[4221].aggregatorEntrypoint,
      deadline: Math.floor(Date.now() / 1000) + 1200,
      extraData: { client: 'dev_simulator', model: 'v3' }
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
                  <h2 className={styles.h2}>Live GenVM Consensus Simulator</h2>
                  <p className={styles.desc}>
                    Test how GenLayer Intelligent Contracts (<code className={styles.code}>{INTELLIGENT_CONTRACTS.agentValidator.slice(0, 10)}...</code>) validate trade proposals across validator nodes in real time.
                  </p>
                </div>
              </div>
            </div>

            <div className={styles.simulatorGrid}>
              {/* Input Form */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className={styles.inputGroup}>
                  <label className={styles.inputLabel}>Action Type</label>
                  <select 
                    value={simAction} 
                    onChange={(e) => setSimAction(e.target.value)} 
                    className={styles.selectField}
                  >
                    <option value="SWAP">SWAP (Trade Proposal)</option>
                    <option value="ADD_LIQUIDITY">ADD_LIQUIDITY (V2/V3)</option>
                    <option value="REMOVE_LIQUIDITY">REMOVE_LIQUIDITY</option>
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className={styles.inputGroup}>
                    <label className={styles.inputLabel}>Token In</label>
                    <select 
                      value={simTokenIn} 
                      onChange={(e) => setSimTokenIn(e.target.value)} 
                      className={styles.selectField}
                    >
                      <option value="USDC">USDC ($1.00)</option>
                      <option value="USDT">USDT ($1.00)</option>
                      <option value="WGEN">WGEN ($0.50)</option>
                      <option value="GEN">GEN (Native)</option>
                      <option value="WBTC">WBTC ($68,500)</option>
                      <option value="ETH">ETH ($2,650)</option>
                    </select>
                  </div>

                  <div className={styles.inputGroup}>
                    <label className={styles.inputLabel}>Token Out</label>
                    <select 
                      value={simTokenOut} 
                      onChange={(e) => setSimTokenOut(e.target.value)} 
                      className={styles.selectField}
                    >
                      <option value="WGEN">WGEN ($0.50)</option>
                      <option value="USDC">USDC ($1.00)</option>
                      <option value="USDT">USDT ($1.00)</option>
                      <option value="GEN">GEN (Native)</option>
                      <option value="WBTC">WBTC ($68,500)</option>
                      <option value="ETH">ETH ($2,650)</option>
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
                      <span>Validating on GenVM Consensus...</span>
                    </>
                  ) : (
                    <>
                      <Play size={16} />
                      <span>Simulate on GenLayer IC</span>
                    </>
                  )}
                </button>
              </div>

              {/* Output Panel */}
              <div className={styles.responsePanel}>
                <div className={styles.responseHeader}>
                  <span>GenVM Validator Response</span>
                  {simResponse && (
                    <span style={{ color: 'inherit', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 700 }}>
                      {simResponse.approved ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                      {simResponse.approved ? 'APPROVED' : 'REJECTED'}
                    </span>
                  )}
                </div>
                <pre className={styles.responsePre}>
                  {simResponse 
                    ? JSON.stringify(simResponse, null, 2)
                    : '// Click "Simulate on GenLayer IC" to trigger a real-time consensus evaluation against AgentValidator.py'}
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
                <div className={styles.infoTitle}>LiquidityValidator (GenLayer IC)</div>
                <div className={styles.infoValue}>{INTELLIGENT_CONTRACTS.liquidityValidator}</div>
                <a 
                  href={`https://explorer-bradbury.genlayer.com/address/${INTELLIGENT_CONTRACTS.liquidityValidator}`} 
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
