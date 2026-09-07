import React, { useState, useMemo, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { 
  BookOpen, 
  Cpu, 
  ShieldCheck, 
  Layers, 
  ArrowRightLeft, 
  Zap, 
  Terminal, 
  Code2,
  Package,
  CheckCircle2, 
  ExternalLink, 
  Search, 
  Menu, 
  X, 
  ChevronRight, 
  Sparkles,
  Lock,
  Boxes,
  Activity,
  Copy,
  Check,
  PanelLeftClose,
  PanelLeft,
  ArrowLeft,
  ArrowRight,
  Scale,
  Bot,
  Users,
  Key,
  Network,
  FileCode2,
  Sliders,
  Play,
  GitBranch,
  RefreshCw,
  AlertCircle,
  Database,
  Shield,
  Workflow,
  Compass,
  Gauge
} from 'lucide-react';
import { CONTRACT_ADDRESSES, INTELLIGENT_CONTRACTS } from '../constants/addresses';
import { useTheme } from '../components/contexts/ThemeContext';
import styles from '../styles/Docs.module.css';

const DOC_TOPICS = [
  {
    category: 'GETTING STARTED',
    items: [
      { id: 'overview', title: '1. Overview & Architecture', icon: <Boxes size={16} /> },
      { id: 'user-guide', title: '2. User & Agent Quickstart', icon: <Zap size={16} /> },
    ]
  },
  {
    category: 'WHY AI & GENLAYER CONSENSUS',
    items: [
      { id: 'why-ai', title: '3. The Agentic DeFi Revolution', icon: <Sparkles size={16} /> },
      { id: 'genlayer-genvm', title: '4. GenLayer & GenVM Deep Dive', icon: <Cpu size={16} /> },
      { id: 'comparison', title: '5. Comparison: AMMs vs. IMMs', icon: <Activity size={16} /> },
    ]
  },
  {
    category: 'AGENT-TO-AGENT (A2A) & EXECUTION',
    items: [
      { id: 'agent-protocols', title: '6. Agent-to-Agent (A2A) Protocols', icon: <Network size={16} /> },
      { id: 'agent-execution-guide', title: '7. Autonomous Agent Execution Tutorial', icon: <Bot size={16} /> },
      { id: 'agent-session-keys', title: '8. Delegated Execution & Session Keys', icon: <Key size={16} /> },
    ]
  },
  {
    category: 'OUR INTELLIGENT CONTRACTS',
    items: [
      { id: 'agent-validator', title: '9. AgentValidator.py (Specification)', icon: <ShieldCheck size={16} /> },
      { id: 'liquidity-validator', title: '10. LiquidityValidator.py (Specification)', icon: <ShieldCheck size={16} /> },
      { id: 'agent-executor', title: '11. AgentExecutor.sol & Settlement', icon: <Lock size={16} /> },
    ]
  },
  {
    category: 'DEX & AGGREGATION ENGINE',
    items: [
      { id: 'core-dex', title: '12. AGGFlow DEX Aggregator & Bytecode VM', icon: <ArrowRightLeft size={16} /> },
      { id: 'wrap-unwrap', title: '13. Native GEN & WGEN 1:1 Wrap Mechanics', icon: <Layers size={16} /> },
      { id: 'tokenomics', title: '14. Supported Assets & Price Oracles', icon: <Scale size={16} /> },
    ]
  },
  {
    category: 'DEVELOPER SDKS & INTEGRATION',
    items: [
      { id: 'build-with-sdk', title: '15. Build With @soyaradex/sdk', icon: <Package size={16} /> },
      { id: 'developer-sdk', title: '16. JavaScript SDK (genlayer-js & Viem)', icon: <Code2 size={16} /> },
      { id: 'python-sdk', title: '17. Python SDK & Agent Integration', icon: <FileCode2 size={16} /> },
      { id: 'contracts', title: '18. Verified Contract Directory & ABIs', icon: <Terminal size={16} /> },
    ]
  },
  {
    category: 'SECURITY & FUTURE OF AGENTIC FINANCE',
    items: [
      { id: 'security-roadmap', title: '19. Security Threat Model & Defense Matrix', icon: <Shield size={16} /> },
      { id: 'future-vision', title: '20. Future: Autonomous Intelligent Finance', icon: <Compass size={16} /> },
    ]
  }
];

// Flat list for Next / Previous pagination
const FLAT_TOPICS = DOC_TOPICS.flatMap(cat => cat.items);

function CodeSnippet({ code, language = 'python' }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={styles.codeContainer}>
      <div className={styles.codeHeader}>
        <span className={styles.codeLanguage}>{language}</span>
        <button type="button" onClick={handleCopy} className={styles.copyBtn}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className={styles.pre}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

export default function DocsPage() {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme !== 'light';

  // Active topic ID synced with router.query.topic or default to 'overview'
  const [activeTopic, setActiveTopic] = useState('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Sync with URL query on mount / change
  useEffect(() => {
    if (router.query.topic && typeof router.query.topic === 'string') {
      const exists = FLAT_TOPICS.some(t => t.id === router.query.topic);
      if (exists) {
        setActiveTopic(router.query.topic);
      }
    }
  }, [router.query.topic]);

  const selectTopic = (topicId) => {
    setActiveTopic(topicId);
    setIsMobileOpen(false);
    router.replace({ pathname: '/docs', query: { topic: topicId } }, undefined, { shallow: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  // Find currentIndex for pagination
  const currentIndex = FLAT_TOPICS.findIndex(t => t.id === activeTopic);
  const prevTopic = currentIndex > 0 ? FLAT_TOPICS[currentIndex - 1] : null;
  const nextTopic = currentIndex < FLAT_TOPICS.length - 1 ? FLAT_TOPICS[currentIndex + 1] : null;

  // Filter topics for search
  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return DOC_TOPICS;
    const q = searchQuery.toLowerCase();
    return DOC_TOPICS.map(cat => ({
      ...cat,
      items: cat.items.filter(item => item.title.toLowerCase().includes(q))
    })).filter(cat => cat.items.length > 0);
  }, [searchQuery]);

  return (
    <>
      <Head>
        <title>Soyara DEX Documentation - Intelligent Contracts & Autonomous Agents</title>
        <meta name="description" content="Comprehensive developer guide for Soyara DEX, GenLayer Intelligent Contracts, GenVM consensus, Agent-to-Agent (A2A) execution, and AI-validated DeFi trading." />
      </Head>

      <div className={`${styles.container} ${isDark ? styles.themeDark : styles.themeLight}`}>
        {/* Mobile Sticky Bar */}
        <div className={styles.mobileBar}>
          <button 
            type="button" 
            onClick={() => setIsMobileOpen(!isMobileOpen)} 
            className={styles.mobileMenuBtn}
          >
            {isMobileOpen ? <X size={18} /> : <Menu size={18} />}
            <span>Table of Contents</span>
          </button>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--doc-text-h1)' }}>
            Soyara DEX Developer Docs
          </span>
        </div>

        {/* Mobile Backdrop Overlay */}
        {isMobileOpen && (
          <div 
            className={styles.sidebarMobileOverlay}
            onClick={() => setIsMobileOpen(false)}
          />
        )}

        {/* Floating expand button for desktop if sidebar is hidden */}
        {isSidebarCollapsed && (
          <button
            type="button"
            onClick={() => setIsSidebarCollapsed(false)}
            className={styles.expandSidebarFloatingBtn}
            title="Open Table of Contents"
          >
            <PanelLeft size={16} />
            <span>Show Menu</span>
          </button>
        )}

        {/* GitBook Left Sidebar */}
        <aside className={`${styles.sidebar} ${isSidebarCollapsed ? styles.sidebarCollapsed : ''} ${isMobileOpen ? styles.sidebarMobileOpen : ''}`}>
          <div className={styles.sidebarHeader}>
            <div className={styles.sidebarBrand}>
              <div className={styles.sidebarTitleGroup}>
                <div className={styles.sidebarLogo}>
                  <BookOpen size={18} />
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--doc-text-h1)' }}>
                    Soyara DEX Docs
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--doc-nav-text)' }}>
                    GenLayer Bradbury (4221)
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsSidebarCollapsed(true)}
                className={styles.collapseToggleBtn}
                title="Collapse sidebar"
              >
                <PanelLeftClose size={16} />
              </button>
            </div>

            <div className={styles.searchBox}>
              <Search size={14} style={{ color: 'var(--doc-nav-text)' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search topics..."
                className={styles.searchInput}
              />
            </div>
          </div>

          <nav className={styles.navList}>
            {filteredCategories.map((cat, idx) => (
              <div key={cat.category || idx}>
                <div className={styles.categoryTitle}>{cat.category}</div>
                {cat.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectTopic(item.id)}
                    className={`${styles.navItem} ${activeTopic === item.id ? styles.navItemActive : ''}`}
                  >
                    {item.icon && <span className={styles.navIcon}>{item.icon}</span>}
                    <span className={styles.navText}>{item.title}</span>
                  </button>
                ))}
              </div>
            ))}
          </nav>
        </aside>

        {/* Main Content Reading Pane */}
        <main className={styles.main}>
          <div className={styles.contentWrapper}>
            {/* Breadcrumbs */}
            <div className={styles.breadcrumb}>
              <span>Docs</span>
              <ChevronRight size={14} />
              <span>Soyara DEX Ecosystem</span>
              <ChevronRight size={14} />
              <span style={{ color: 'var(--doc-nav-active-text)', fontWeight: 600 }}>
                {FLAT_TOPICS.find(t => t.id === activeTopic)?.title || 'Documentation'}
              </span>
            </div>

            {/* ========================================================== */}
            {/* TOPIC 1: OVERVIEW & ARCHITECTURE */}
            {/* ========================================================== */}
            {activeTopic === 'overview' && (
              <article className={styles.article}>
                <h1 className={styles.h1}>1. Overview & Architecture</h1>
                <p className={styles.lead}>
                  <strong>Soyara DEX</strong> is the flagship AI-native Decentralized Exchange Aggregator and Automated Market Maker built natively for the <strong>GenLayer Bradbury Testnet (Chain ID 4221)</strong>. By combining high-speed EVM AMM liquidity with <strong>GenLayer Intelligent Contracts (ICs)</strong> executing in the Python-powered <strong>GenVM</strong> sandbox, Soyara DEX creates an un-hackable, intent-driven execution environment for both human traders and autonomous AI agents.
                </p>

                <div className={styles.callout}>
                  <div className={styles.calloutIcon}>
                    <ShieldCheck size={22} />
                  </div>
                  <div>
                    <div className={styles.calloutTitle}>The Paradigm Shift: From Blind AMMs to Cognitive Market Makers</div>
                    <div className={styles.calloutBody}>
                      Traditional smart contracts are blind: they execute raw bytecode without evaluating economic rationale, contextual risk, or malicious MEV slippage. Soyara DEX introduces <strong>Decentralized Intelligent Contracts</strong> that evaluate trade proposals across independent validator nodes using <strong>Optimistic Democracy consensus</strong> before committing state on-chain.
                    </div>
                  </div>
                </div>

                <div className={styles.subSection}>
                  <h2 className={styles.h2}>The 3-Tiered Hybrid Architecture</h2>
                  <p className={styles.p}>
                    Soyara DEX divides decentralized finance into three modular layers: Intent Formulation, Consensus-Enforced Validation, and Atomic Settlement.
                  </p>

                  <div className={styles.grid3}>
                    <div className={styles.card}>
                      <div className={styles.cardBadge}>Tier 1: Intent & AI Agents</div>
                      <h3 className={styles.cardTitle}>Agent Interaction Layer</h3>
                      <p className={styles.cardDesc}>
                        Conversational LLMs and external autonomous bots convert user intents or algorithmic signals into structured, normalized Execution Proposals with zero raw calldata ambiguity.
                      </p>
                    </div>
                    <div className={styles.card}>
                      <div className={styles.cardBadge}>Tier 2: GenVM Consensus</div>
                      <h3 className={styles.cardTitle}>Intelligent Contracts (ICs)</h3>
                      <p className={styles.cardDesc}>
                        <code className={styles.inlineCode}>AgentValidator.py</code> & <code className={styles.inlineCode}>LiquidityValidator.py</code> validate proposals on GenLayer validator nodes via deterministic rules and LLM consensus (<code className={styles.inlineCode}>gl.eq_principle_strict_eq</code>).
                      </p>
                    </div>
                    <div className={styles.card}>
                      <div className={styles.cardBadge}>Tier 3: EVM Settlement</div>
                      <h3 className={styles.cardTitle}>AGGFlow Bytecode Router</h3>
                      <p className={styles.cardDesc}>
                        High-efficiency EVM contracts execute compiled swap bytecode across SoyaraDex V2 pools, SoyaraDex V3 concentrated liquidity, and 1:1 WGEN wrapper contracts with atomic rollback safety.
                      </p>
                    </div>
                  </div>
                </div>

                <div className={styles.subSection}>
                  <h2 className={styles.h2}>Complete High-Level Flow Diagram</h2>
                  <CodeSnippet
                    language="text"
                    code={`[ Autonomous AI Agent / User ]
                │
                ▼ (1. Generate Intent / Proposal)
   Structured Execution Proposal (JSON)
                │
                ▼ (2. Read / Validate on GenLayer)
   ┌───────────────────────────────────────────────────────────┐
   │ GenLayer GenVM: AgentValidator.py / LiquidityValidator.py │
   │  ├─ Phase 1: Deterministic Token & Router Whitelist Check │
   │  ├─ Phase 1: Hard Slippage Cap Enforcement (Max 300 bps)  │
   │  └─ Phase 2: gl.exec_prompt (LLM Consensus on GenVM)      │
   └───────────────────────────────────────────────────────────┘
                │
                ▼ (3. Consensus Approved Proof & Proposal ID)
   ┌───────────────────────────────────────────────────────────┐
   │ EVM Settlement: AgentExecutor.sol → AGGFlowEntrypoint.sol │
   │  ├─ Multi-Hop Path Decomposition                          │
   │  ├─ SoyaraDex V2 Classic Pools (0.30% fee)                  │
   │  ├─ SoyaraDex V3 Concentrated Liquidity (0.05% - 1.00%)     │
   │  └─ Native GEN ↔ WGEN 1:1 Zero-Fee Atomic Wrap            │
   └───────────────────────────────────────────────────────────┘
                │
                ▼ (4. Verified On-Chain State Change)`}
                  />
                </div>
              </article>
            )}

            {/* ========================================================== */}
            {/* TOPIC 2: USER & AGENT QUICKSTART */}
            {/* ========================================================== */}
            {activeTopic === 'user-guide' && (
              <article className={styles.article}>
                <h1 className={styles.h1}>2. User & Agent Quickstart Guide</h1>
                <p className={styles.lead}>
                  Whether you are a human trader using our AI assistant or a software developer deploying an autonomous bot, follow this step-by-step pipeline to execute validated trades on GenLayer.
                </p>

                <div className={styles.stepCard}>
                  <div className={styles.stepNum}>1</div>
                  <div>
                    <h3 className={styles.stepTitle}>Network Configuration (GenLayer Bradbury Testnet)</h3>
                    <p className={styles.stepDesc}>
                      Connect your wallet or agent client to the GenLayer Bradbury Testnet RPC:
                    </p>
                    <ul className={styles.ul}>
                      <li><strong>Network Name:</strong> GenLayer Bradbury Testnet</li>
                      <li><strong>Chain ID:</strong> <code className={styles.inlineCode}>4221</code></li>
                      <li><strong>RPC URL:</strong> <code className={styles.inlineCode}>https://rpc-bradbury.genlayer.com</code></li>
                      <li><strong>Currency Symbol:</strong> <code className={styles.inlineCode}>GEN</code></li>
                      <li><strong>Block Explorer:</strong> <code className={styles.inlineCode}>https://explorer-bradbury.genlayer.com</code></li>
                    </ul>
                  </div>
                </div>

                <div className={styles.stepCard}>
                  <div className={styles.stepNum}>2</div>
                  <div>
                    <h3 className={styles.stepTitle}>Constructing Trade Intent</h3>
                    <p className={styles.stepDesc}>
                      Traders can type natural language instructions in the AI Trading page (e.g., <em>"Swap 100 USDC to GEN with minimum price impact"</em>). External bots can construct the structured JSON proposal directly via our API or SDK.
                    </p>
                  </div>
                </div>

                <div className={styles.stepCard}>
                  <div className={styles.stepNum}>3</div>
                  <div>
                    <h3 className={styles.stepTitle}>Calling the GenLayer Intelligent Contract</h3>
                    <p className={styles.stepDesc}>
                      The proposal is submitted to <code className={styles.inlineCode}>AgentValidator.py</code> (<code className={styles.code}>{INTELLIGENT_CONTRACTS.agentValidator}</code>). GenLayer validator nodes independently verify the proposal parameters through GenVM sandbox consensus.
                    </p>
                  </div>
                </div>

                <div className={styles.stepCard}>
                  <div className={styles.stepNum}>4</div>
                  <div>
                    <h3 className={styles.stepTitle}>Token Approval & On-Chain Settlement</h3>
                    <p className={styles.stepDesc}>
                      Once approved by the Intelligent Contract, execute the transaction via <code className={styles.inlineCode}>AGGFlowEntrypoint</code> (<code className={styles.code}>{CONTRACT_ADDRESSES[4221].aggregatorEntrypoint}</code>). The transaction executes atomically across liquidity pools.
                    </p>
                  </div>
                </div>
              </article>
            )}

            {/* ========================================================== */}
            {/* TOPIC 3: THE AGENTIC DEFI REVOLUTION */}
            {/* ========================================================== */}
            {activeTopic === 'why-ai' && (
              <article className={styles.article}>
                <h1 className={styles.h1}>3. The Agentic DeFi Revolution</h1>
                <p className={styles.lead}>
                  Why the transition from human-driven Web3 to autonomous multi-agent economies requires an on-chain cognitive validation layer like GenLayer.
                </p>

                <div className={styles.subSection}>
                  <h2 className={styles.h2}>The Autonomous Agent Bottleneck</h2>
                  <p className={styles.p}>
                    As autonomous AI agents (trading bots, arbitrageurs, treasury managers, DAO delegates) begin controlling billions in crypto assets, standard smart contracts expose critical failure points:
                  </p>
                  <ul className={styles.ul}>
                    <li className={styles.li}><strong>Hallucination Risk:</strong> An off-chain LLM may hallucinate token addresses, incorrect decimal math, or slippage limits, leading to catastrophic capital loss.</li>
                    <li className={styles.li}><strong>Prompt Injection Vulnerability:</strong> Malicious actors can feed adversarial context into trading bots to trigger unapproved asset transfers.</li>
                    <li className={styles.li}><strong>Lack of Consensus:</strong> Centralized Web2 bots rely on a single server. If the server fails or is compromised, user automation collapses.</li>
                  </ul>
                </div>

                <div className={styles.subSection}>
                  <h2 className={styles.h2}>How Intelligent Contracts Protect Autonomous Agents</h2>
                  <p className={styles.p}>
                    Soyara DEX solves this by placing GenLayer Intelligent Contracts as an un-bypassable on-chain guardrail. Even if an off-chain AI agent encounters an adversarial prompt or internal malfunction, the GenLayer consensus layer strictly rejects any illegal transaction before it touches liquidity pools.
                  </p>
                </div>
              </article>
            )}

            {/* ========================================================== */}
            {/* TOPIC 4: GENLAYER & GENVM DEEP DIVE */}
            {/* ========================================================== */}
            {activeTopic === 'genlayer-genvm' && (
              <article className={styles.article}>
                <h1 className={styles.h1}>4. GenLayer & GenVM Deep Dive</h1>
                <p className={styles.lead}>
                  A comprehensive breakdown of GenLayer's architecture, the GenVM Python runtime, Optimistic Democracy, and the Equivalence Principle.
                </p>

                <div className={styles.subSection}>
                  <h2 className={styles.h2}>GenVM (General Virtual Machine)</h2>
                  <p className={styles.p}>
                    GenVM is a secure, sandboxed execution environment built to run Python 3.11. Unlike standard deterministic virtual machines (EVM/Wasm), GenVM introduces non-deterministic primitives allowing contracts to perform web requests, data parsing, and native LLM inference (<code className={styles.inlineCode}>gl.nondet.exec_prompt</code>) directly during consensus.
                  </p>
                </div>

                <div className={styles.subSection}>
                  <h2 className={styles.h2}>Optimistic Democracy Consensus</h2>
                  <p className={styles.p}>
                    GenLayer achieves consensus across non-deterministic LLM operations using Optimistic Democracy:
                  </p>
                  <ol className={styles.ul} style={{ listStyleType: 'decimal' }}>
                    <li className={styles.li}><strong>Leader Node:</strong> A randomly selected validator executes the contract and proposes a result.</li>
                    <li className={styles.li}><strong>Validator Committee:</strong> A decentralized committee of independent nodes re-runs the logic inside their local GenVM.</li>
                    <li className={styles.li}><strong>Equivalence Principle (<code className={styles.inlineCode}>gl.eq_principle_strict_eq</code>):</strong> The committee evaluates whether the leader's output satisfies strict equivalence rules.</li>
                    <li className={styles.li}><strong>Finality:</strong> Majority agreement commits the transaction state irreversibly to the ledger.</li>
                  </ol>
                </div>

                <div className={styles.subSection}>
                  <h2 className={styles.h2}>Equivalence Principle Implementation Example</h2>
                  <CodeSnippet
                    language="python"
                    code={`# GenLayer Python Intelligent Contract Execution
import genlayer.gl as gl
import json

def validate_proposal(self, action: str, token_in: str, token_out: str, amount_in: str, min_out: str, slippage_bps: int) -> dict:
    # Phase 1: Deterministic Math & Whitelist Guardrails
    if slippage_bps > 300:
        return {"approved": False, "reason": "Slippage exceeds 3.00% ceiling"}
    
    # Phase 2: LLM Numeric Coherence on GenVM
    def run_ai_review():
        prompt = f"""
        Analyze trade proposal:
        Action: {action}
        TokenIn: {token_in} -> TokenOut: {token_out}
        AmountIn: {amount_in} -> MinOut: {min_out}
        SlippageBps: {slippage_bps}
        
        Is the numeric output coherent with current market liquidity?
        Output strictly JSON: {{"coherent": true}} or {{"coherent": false, "reason": "..."}}
        """
        return gl.nondet.exec_prompt(prompt)

    # Multi-validator strict equivalence consensus
    result_str = gl.eq_principle.strict_eq(run_ai_review)
    return json.loads(result_str)`}
                  />
                </div>
              </article>
            )}

            {/* ========================================================== */}
            {/* TOPIC 5: COMPARISON MATRIX */}
            {/* ========================================================== */}
            {activeTopic === 'comparison' && (
              <article className={styles.article}>
                <h1 className={styles.h1}>5. Comparison: Passive AMMs vs. Agentic IMMs</h1>
                <p className={styles.lead}>
                  Detailed technical comparison showing why Soyara DEX on GenLayer outperforms traditional DEXes and Web2 AI bots across every operational dimension:
                </p>

                <div className={styles.tableWrapper}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Feature</th>
                        <th>Traditional DEX (Uniswap)</th>
                        <th>Web2 AI Telegram Bots</th>
                        <th>Soyara DEX on GenLayer</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td><strong>Consensus Layer</strong></td>
                        <td>Passive EVM Math</td>
                        <td>None (Centralized Server)</td>
                        <td><strong>Optimistic Democracy on GenVM</strong></td>
                      </tr>
                      <tr>
                        <td><strong>Smart Contract Language</strong></td>
                        <td>Solidity Bytecode</td>
                        <td>Off-chain Node.js/Python</td>
                        <td><strong>Python 3.11 Intelligent Contracts</strong></td>
                      </tr>
                      <tr>
                        <td><strong>Private Key Custody</strong></td>
                        <td>Non-Custodial</td>
                        <td>Custodial (High Risk)</td>
                        <td><strong>100% Non-Custodial / Session Keys</strong></td>
                      </tr>
                      <tr>
                        <td><strong>Slippage & MEV Defense</strong></td>
                        <td>Manual User Guess</td>
                        <td>Heuristic Heuristics</td>
                        <td><strong>Hard 3% Cap + Consensus Verification</strong></td>
                      </tr>
                      <tr>
                        <td><strong>Prompt Injection Defense</strong></td>
                        <td>N/A</td>
                        <td>Vulnerable</td>
                        <td><strong>Multi-Node Equivalence Principle</strong></td>
                      </tr>
                      <tr>
                        <td><strong>Agent Execution Ready</strong></td>
                        <td>Requires Custom Relayers</td>
                        <td>Fragile API Keys</td>
                        <td><strong>Native Agent-to-Agent (A2A) Protocols</strong></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </article>
            )}

            {/* ========================================================== */}
            {/* TOPIC 6: AGENT-TO-AGENT (A2A) PROTOCOLS */}
            {/* ========================================================== */}
            {activeTopic === 'agent-protocols' && (
              <article className={styles.article}>
                <h1 className={styles.h1}>6. Agent-to-Agent (A2A) Protocols</h1>
                <p className={styles.lead}>
                  How autonomous AI agents, automated trading algorithms, and multi-agent DAOs communicate and coordinate on Soyara DEX.
                </p>

                <div className={styles.subSection}>
                  <h2 className={styles.h2}>The Standardized Agent Proposal Schema</h2>
                  <p className={styles.p}>
                    When an autonomous agent decides to execute a trade or manage liquidity, it formats its intent into a normalized JSON payload. This payload contains <strong>zero natural language ambiguity</strong> to eliminate prompt injection risks:
                  </p>
                  <CodeSnippet
                    language="json"
                    code={`{
  "protocol": "A2A_FLIPSWAP_V1",
  "action": "SWAP",
  "token_in": "0x58B6CD7891cd0A682226E25607b958a6479195A6",
  "token_out": "0x315374AA9b5536037Cc1Efeea2439CCC0913A77e",
  "amount_in": "50000000000000000000",
  "min_amount_out": "99200000000000000000",
  "slippage_bps": 30,
  "router": "0x95feE6Cb918Ed9C621E36082EE8D998873031EaA",
  "deadline": 1787685000,
  "agent_id": "0x23D542DCEFb00b1f4268E67a0EC1EF4de0A58fe2",
  "extra_data": {
    "strategy": "ARBITRAGE_REBALANCE_V3",
    "target_pool_fee": 3000
  }
}`}
                  />
                </div>

                <div className={styles.subSection}>
                  <h2 className={styles.h2}>Agent-to-Agent Coordinated Arbitrage & Rebalancing</h2>
                  <p className={styles.p}>
                    Multiple autonomous agents can coordinate across pools:
                  </p>
                  <ul className={styles.ul}>
                    <li className={styles.li}><strong>Market Making Agents:</strong> Monitor V3 concentrated liquidity tick ranges and invoke <code className={styles.inlineCode}>LiquidityValidator.py</code> to rebalance out-of-range capital.</li>
                    <li className={styles.li}><strong>Cross-Pool Arbitrage Agents:</strong> Identify price discrepancies between V2 classic pools and V3 concentrated pools, executing multi-hop atomic swaps.</li>
                    <li className={styles.li}><strong>Treasury Rebalancing Agents:</strong> Periodically audit portfolio asset ratios and execute risk-controlled DCA orders.</li>
                  </ul>
                </div>
              </article>
            )}

            {/* ========================================================== */}
            {/* TOPIC 7: AUTONOMOUS AGENT EXECUTION TUTORIAL */}
            {/* ========================================================== */}
            {activeTopic === 'agent-execution-guide' && (
              <article className={styles.article}>
                <h1 className={styles.h1}>7. Autonomous Agent Execution Tutorial</h1>
                <p className={styles.lead}>
                  Complete end-to-end implementation tutorials showing how to build an autonomous trading agent in Node.js / TypeScript and Python that validates and executes trades on GenLayer.
                </p>

                <div className={styles.subSection}>
                  <h2 className={styles.h2}>1. Autonomous Node.js / TypeScript Agent</h2>
                  <CodeSnippet
                    language="javascript"
                    code={`import { createClient } from 'genlayer-js';
import { createWalletClient, http, parseEther, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

// 1. Initialize GenLayer Client
const genClient = createClient({
  endpoint: 'https://rpc-bradbury.genlayer.com',
});

// 2. Initialize EVM Execution Client
const account = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY);
const evmClient = createWalletClient({
  account,
  transport: http('https://rpc-bradbury.genlayer.com'),
});

const AGENT_VALIDATOR = '${INTELLIGENT_CONTRACTS.agentValidator}';
const AGG_ENTRYPOINT = '${CONTRACT_ADDRESSES[4221].aggregatorEntrypoint}';

async function runAutonomousAgent() {
  console.log('🤖 Agent running on address:', account.address);

  // Define proposal
  const proposal = {
    action: 'SWAP',
    tokenIn: '0x58B6CD7891cd0A682226E25607b958a6479195A6', // USDC
    tokenOut: '0x315374AA9b5536037Cc1Efeea2439CCC0913A77e', // WGEN
    amountIn: '10.0',
    amountInRaw: '10000000000000000000',
    minAmountOutRaw: '19800000000000000000',
    slippageBps: 30,
    router: AGG_ENTRYPOINT,
    deadline: Math.floor(Date.now() / 1000) + 1800,
    extraData: JSON.stringify({ strategy: 'AUTO_DCA' })
  };

  // Step 1: Validate proposal via GenLayer Intelligent Contract
  console.log('⏳ Requesting GenLayer GenVM consensus validation...');
  const validationResult = await genClient.readContract({
    address: AGENT_VALIDATOR,
    functionName: 'validate_proposal',
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

  console.log('✅ GenLayer Consensus Result:', validationResult);
  if (!validationResult.approved) {
    console.error('❌ Validation rejected by GenVM validators:', validationResult.reason);
    return;
  }

  // Step 2: Execute trade on EVM Settlement Contract
  console.log('🚀 Executing trade on-chain...');
  // (Broadcast EVM transaction via AGGFlowEntrypoint)
  console.log('🎉 Trade executed successfully with proposal ID:', validationResult.proposal_id);
}

runAutonomousAgent().catch(console.error);`}
                  />
                </div>

                <div className={styles.subSection}>
                  <h2 className={styles.h2}>2. Autonomous Python Trading Agent</h2>
                  <CodeSnippet
                    language="python"
                    code={`import requests
import json
import time

RPC_URL = "https://rpc-bradbury.genlayer.com"
AGENT_VALIDATOR = "${INTELLIGENT_CONTRACTS.agentValidator}"

def call_genlayer_contract(method, args):
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "gen_call",
        "params": {
            "to": AGENT_VALIDATOR,
            "function": method,
            "args": args
        }
    }
    res = requests.post(RPC_URL, json=payload).json()
    return res.get("result")

def run_agent_loop():
    print("🤖 Python Agent starting...")
    proposal_args = [
        "SWAP",
        "0x58B6CD7891cd0A682226E25607b958a6479195A6", # USDC
        "0x315374AA9b5536037Cc1Efeea2439CCC0913A77e", # WGEN
        "10000000000000000000",
        "19800000000000000000",
        30, # 0.30% slippage
        "${CONTRACT_ADDRESSES[4221].aggregatorEntrypoint}",
        int(time.time()) + 1200,
        json.dumps({"agent": "python_bot_v1"})
    ]

    result = call_genlayer_contract("validate_proposal", proposal_args)
    print("GenLayer Validation Response:", result)

if __name__ == "__main__":
    run_agent_loop()`}
                  />
                </div>
              </article>
            )}

            {/* ========================================================== */}
            {/* TOPIC 8: DELEGATED EXECUTION & SESSION KEYS */}
            {/* ========================================================== */}
            {activeTopic === 'agent-session-keys' && (
              <article className={styles.article}>
                <h1 className={styles.h1}>8. Delegated Execution & Session Keys</h1>
                <p className={styles.lead}>
                  How users and DAOs grant granular, scoped trading permissions to autonomous agents without risking master private keys.
                </p>

                <div className={styles.subSection}>
                  <h2 className={styles.h2}>Session Key Architecture</h2>
                  <p className={styles.p}>
                    Soyara DEX supports delegated session keys enforced at both the EVM account abstraction layer and the GenLayer Intelligent Contract level:
                  </p>
                  <ul className={styles.ul}>
                    <li className={styles.li}><strong>Spending Limit Ceiling:</strong> Maximum daily or per-transaction spending limit per agent.</li>
                    <li className={styles.li}><strong>Allowed Asset Pairs:</strong> Agents are restricted to pre-approved token lists (e.g., only WGEN, USDC, USDT).</li>
                    <li className={styles.li}><strong>Expiration Timelock:</strong> Session keys automatically expire after a predefined duration (e.g., 24 hours).</li>
                    <li className={styles.li}><strong>Consensus Validation:</strong> <code className={styles.inlineCode}>AgentValidator.py</code> verifies that the executing agent ID matches authorized delegates.</li>
                  </ul>
                </div>
              </article>
            )}

            {/* ========================================================== */}
            {/* TOPIC 9: AGENT VALIDATOR SPECIFICATION */}
            {/* ========================================================== */}
            {activeTopic === 'agent-validator' && (
              <article className={styles.article}>
                <div className={styles.contractBadge}>Intelligent Contract 1</div>
                <h1 className={styles.h1}>9. AgentValidator.py (Deep Dive & Specification)</h1>
                <p className={styles.lead}>
                  Complete technical specification of <code className={styles.inlineCode}>AgentValidator.py</code> deployed on GenLayer Bradbury Testnet at <code className={styles.code}>{INTELLIGENT_CONTRACTS.agentValidator}</code>.
                </p>

                <div className={styles.metaBox}>
                  <div><strong>Contract Address:</strong> <code className={styles.code}>{INTELLIGENT_CONTRACTS.agentValidator}</code></div>
                  <div><strong>Network:</strong> GenLayer Bradbury Testnet (Chain ID 4221)</div>
                  <div><strong>Language:</strong> Python 3.11 (GenVM Sandboxed Runtime)</div>
                  <div><strong>Consensus Principle:</strong> <code className={styles.inlineCode}>gl.eq_principle_strict_eq</code></div>
                  <div><strong>Transaction Hash:</strong> <code className={styles.code}>0x80788d9ee015f11468f4e372ead51f0dd522fb70e62343e241bd23c7b3384dbf</code></div>
                </div>

                <div className={styles.subSection}>
                  <h2 className={styles.h2}>Public Interface & Method Signatures</h2>
                  <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Function</th>
                          <th>Parameters</th>
                          <th>Return Type</th>
                          <th>Access</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td><code className={styles.inlineCode}>validate_proposal</code></td>
                          <td><code className={styles.inlineCode}>action, token_in, token_out, amount_in, min_out, slippage_bps, router, deadline, extra_data</code></td>
                          <td><code className={styles.inlineCode}>dict {"{ approved, reason, proposal_id }"}</code></td>
                          <td>Public</td>
                        </tr>
                        <tr>
                          <td><code className={styles.inlineCode}>get_stats</code></td>
                          <td><code className={styles.inlineCode}>None</code></td>
                          <td><code className={styles.inlineCode}>dict {"{ total_validations, total_approved, total_rejected }"}</code></td>
                          <td>Public Read</td>
                        </tr>
                        <tr>
                          <td><code className={styles.inlineCode}>get_config</code></td>
                          <td><code className={styles.inlineCode}>None</code></td>
                          <td><code className={styles.inlineCode}>dict {"{ max_slippage_bps, is_paused, approved_tokens }"}</code></td>
                          <td>Public Read</td>
                        </tr>
                        <tr>
                          <td><code className={styles.inlineCode}>set_max_slippage</code></td>
                          <td><code className={styles.inlineCode}>new_max_bps: int</code></td>
                          <td><code className={styles.inlineCode}>void</code></td>
                          <td>Owner Only</td>
                        </tr>
                        <tr>
                          <td><code className={styles.inlineCode}>set_paused</code></td>
                          <td><code className={styles.inlineCode}>paused: bool</code></td>
                          <td><code className={styles.inlineCode}>void</code></td>
                          <td>Owner Only</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </article>
            )}

            {/* ========================================================== */}
            {/* TOPIC 10: LIQUIDITY VALIDATOR SPECIFICATION */}
            {/* ========================================================== */}
            {activeTopic === 'liquidity-validator' && (
              <article className={styles.article}>
                <div className={styles.contractBadge}>Intelligent Contract 2</div>
                <h1 className={styles.h1}>10. LiquidityValidator.py (Specification)</h1>
                <p className={styles.lead}>
                  Complete technical specification of <code className={styles.inlineCode}>LiquidityValidator.py</code> deployed on GenLayer Bradbury Testnet at <code className={styles.code}>{INTELLIGENT_CONTRACTS.liquidityValidator}</code>.
                </p>

                <div className={styles.metaBox}>
                  <div><strong>Contract Address:</strong> <code className={styles.code}>{INTELLIGENT_CONTRACTS.liquidityValidator}</code></div>
                  <div><strong>Network:</strong> GenLayer Bradbury Testnet (Chain ID 4221)</div>
                  <div><strong>Transaction Hash:</strong> <code className={styles.code}>0x6029755fe523a1fcb2c87f20a3c9cc3fcc12f04f57b6db203a40b8c718fcdf23</code></div>
                </div>

                <div className={styles.subSection}>
                  <h2 className={styles.h2}>V2 & V3 Liquidity Operations</h2>
                  <ul className={styles.ul}>
                    <li className={styles.li}>
                      <strong><code className={styles.inlineCode}>validate_add_liquidity_v2</code>:</strong> Checks paired token reserves, deposit ratio bounds, and min LP mint thresholds.
                    </li>
                    <li className={styles.li}>
                      <strong><code className={styles.inlineCode}>validate_remove_liquidity_v2</code>:</strong> Ensures safe LP burn and verifies minimum token A/B returns.
                    </li>
                    <li className={styles.li}>
                      <strong><code className={styles.inlineCode}>validate_add_liquidity_v3</code>:</strong> Validates tick ranges (<code className={styles.inlineCode}>tickLower, tickUpper</code>), concentrated price range width, and verified fee tiers (<code className={styles.inlineCode}>500, 3000, 10000</code>).
                    </li>
                    <li className={styles.li}>
                      <strong><code className={styles.inlineCode}>validate_remove_liquidity_v3</code>:</strong> Validates position NFT ID ownership and minimum withdrawal bounds.
                    </li>
                  </ul>
                </div>
              </article>
            )}

            {/* ========================================================== */}
            {/* TOPIC 11: AGENT EXECUTOR & SETTLEMENT */}
            {/* ========================================================== */}
            {activeTopic === 'agent-executor' && (
              <article className={styles.article}>
                <div className={styles.contractBadge}>EVM Settlement</div>
                <h1 className={styles.h1}>11. AgentExecutor.sol & Settlement Pipeline</h1>
                <p className={styles.lead}>
                  How validated execution proposals transition from GenLayer GenVM Intelligent Contracts into atomic EVM settlement via the AGGFlow Entrypoint.
                </p>

                <div className={styles.subSection}>
                  <h2 className={styles.h2}>Atomic Execution & Rollback Protection</h2>
                  <p className={styles.p}>
                    When an execution proposal passes consensus on <code className={styles.inlineCode}>AgentValidator.py</code>, the user or agent executes against <code className={styles.inlineCode}>AGGFlowEntrypoint</code> (<code className={styles.inlineCode}>{CONTRACT_ADDRESSES[4221].aggregatorEntrypoint}</code>). The transaction executes the compiled bytecode program across SoyaraDex V2, V3, and WGEN contracts in a single atomic transaction. If realized slippage or final output falls below the guaranteed minimum, the transaction reverts completely, protecting user funds.
                  </p>
                </div>
              </article>
            )}

            {/* ========================================================== */}
            {/* TOPIC 12: CORE DEX & AGGFLOW ROUTER */}
            {/* ========================================================== */}
            {activeTopic === 'core-dex' && (
              <article className={styles.article}>
                <h1 className={styles.h1}>12. AGGFlow DEX Aggregator & Bytecode VM</h1>
                <p className={styles.lead}>
                  Technical specification of Soyara DEX's multi-pool aggregator engine and compact bytecode virtual machine.
                </p>

                <div className={styles.subSection}>
                  <h2 className={styles.h2}>Bytecode VM Instruction Set</h2>
                  <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Opcode</th>
                          <th>Mnemonic</th>
                          <th>Bytecode Format</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td><code className={styles.inlineCode}>0x00</code></td>
                          <td><code className={styles.inlineCode}>PT_UNIV2</code></td>
                          <td><code className={styles.inlineCode}>0x00 + pool(20B) + dir(1B) + fee(3B)</code></td>
                          <td>Executes SoyaraDex V2 constant-product swap (<code className={styles.inlineCode}>x * y = k</code>).</td>
                        </tr>
                        <tr>
                          <td><code className={styles.inlineCode}>0x01</code></td>
                          <td><code className={styles.inlineCode}>PT_UNIV3</code></td>
                          <td><code className={styles.inlineCode}>0x01 + pool(20B) + dir(1B)</code></td>
                          <td>Executes SoyaraDex V3 concentrated liquidity swap.</td>
                        </tr>
                        <tr>
                          <td><code className={styles.inlineCode}>0x02</code></td>
                          <td><code className={styles.inlineCode}>PT_WRAP</code></td>
                          <td><code className={styles.inlineCode}>0x02 + flag(1B)</code></td>
                          <td>Wraps native GEN to WGEN (flag=1) or unwraps WGEN to GEN (flag=0).</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </article>
            )}

            {/* ========================================================== */}
            {/* TOPIC 13: WRAP / UNWRAP */}
            {/* ========================================================== */}
            {activeTopic === 'wrap-unwrap' && (
              <article className={styles.article}>
                <h1 className={styles.h1}>13. Native GEN & WGEN 1:1 Wrap Mechanics</h1>
                <p className={styles.lead}>
                  Architectural separation between native GEN gas tokens and standard ERC20 wrapped WGEN tokens:
                </p>

                <div className={styles.subSection}>
                  <h2 className={styles.h2}>Direct Deposit & Withdraw Execution</h2>
                  <p className={styles.p}>
                    Converting between GEN and WGEN is executed directly on the WGEN contract (<code className={styles.inlineCode}>{CONTRACT_ADDRESSES[4221].wgen}</code>), completely bypassing AMM liquidity pools:
                  </p>
                  <ul className={styles.ul}>
                    <li className={styles.li}>
                      <strong>Wrap (<code className={styles.inlineCode}>GEN</code> &rarr; <code className={styles.inlineCode}>WGEN</code>):</strong> Calls <code className={styles.inlineCode}>wgen.deposit()</code> with <code className={styles.inlineCode}>value: amount</code>. Exactly 1.0 GEN yields 1.0 WGEN.
                    </li>
                    <li className={styles.li}>
                      <strong>Unwrap (<code className={styles.inlineCode}>WGEN</code> &rarr; <code className={styles.inlineCode}>GEN</code>):</strong> Calls <code className={styles.inlineCode}>wgen.withdraw(amount)</code>. Exactly 1.0 WGEN is burned to release 1.0 native GEN.
                    </li>
                  </ul>
                  <div className={styles.calloutSuccess}>
                    <div className={styles.calloutIcon}><CheckCircle2 size={20} /></div>
                    <div>
                      <div className={styles.calloutTitle}>Zero Slippage & Zero Protocol Fees</div>
                      <div className={styles.calloutBody}>
                        Because Wrap/Unwrap is handled directly by the canonical WGEN contract, there is zero price impact, zero slippage, and zero protocol fees.
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            )}

            {/* ========================================================== */}
            {/* TOPIC 14: TOKENOMICS & RESERVES */}
            {/* ========================================================== */}
            {activeTopic === 'tokenomics' && (
              <article className={styles.article}>
                <h1 className={styles.h1}>14. Supported Assets & Price Oracles</h1>
                <p className={styles.lead}>
                  Verified tokens, reference pricing, and active liquidity pools on GenLayer Bradbury Testnet:
                </p>

                <div className={styles.tableWrapper}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Asset</th>
                        <th>Symbol</th>
                        <th>Contract Address</th>
                        <th>Decimals</th>
                        <th>Reference USD</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td><strong>Native GenLayer</strong></td>
                        <td><code className={styles.inlineCode}>GEN</code></td>
                        <td>Native (<code className={styles.inlineCode}>0x000...000</code>)</td>
                        <td>18</td>
                        <td>$0.50</td>
                      </tr>
                      <tr>
                        <td><strong>Wrapped GEN</strong></td>
                        <td><code className={styles.inlineCode}>WGEN</code></td>
                        <td><code className={styles.inlineCode}>{CONTRACT_ADDRESSES[4221].wgen}</code></td>
                        <td>18</td>
                        <td>$0.50</td>
                      </tr>
                      <tr>
                        <td><strong>USD Coin</strong></td>
                        <td><code className={styles.inlineCode}>USDC</code></td>
                        <td><code className={styles.inlineCode}>0x58B6CD7891cd0A682226E25607b958a6479195A6</code></td>
                        <td>18</td>
                        <td>$1.00</td>
                      </tr>
                      <tr>
                        <td><strong>Tether USD</strong></td>
                        <td><code className={styles.inlineCode}>USDT</code></td>
                        <td><code className={styles.inlineCode}>0x4B54235778c26Ee8ac27744A53d4c5BC4c9D46fc</code></td>
                        <td>18</td>
                        <td>$1.00</td>
                      </tr>
                      <tr>
                        <td><strong>Wrapped Bitcoin</strong></td>
                        <td><code className={styles.inlineCode}>WBTC</code></td>
                        <td><code className={styles.inlineCode}>0x723534bc6C2B536fF5D0455111513A9431c44e25</code></td>
                        <td>18</td>
                        <td>$68,500.00</td>
                      </tr>
                      <tr>
                        <td><strong>Ethereum</strong></td>
                        <td><code className={styles.inlineCode}>ETH</code></td>
                        <td><code className={styles.inlineCode}>0x0F56b4E7f4e2cf346a94aB9263Ed3F3644db7c0C</code></td>
                        <td>18</td>
                        <td>$2,650.00</td>
                      </tr>
                      <tr>
                        <td><strong>Soyara DEX Token</strong></td>
                        <td><code className={styles.inlineCode}>FSWP</code></td>
                        <td><code className={styles.inlineCode}>0xA2eC9aAf2235C66491767e69eBBD885469697B3E</code></td>
                        <td>18</td>
                        <td>$0.15</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </article>
            )}

            {/* ========================================================== */}
            {/* TOPIC 15: BUILD WITH THE SDK */}
            {/* ========================================================== */}
            {activeTopic === 'build-with-sdk' && (
              <article className={styles.article}>
                <h1 className={styles.h1}>15. Build With @soyaradex/sdk</h1>
                <p className={styles.lead}>
                  Everything an agent needs to think - understand a request, find the best route across
                  every venue, judge whether the price is sound, and <strong>prove the authorisation
                  really covers the trade</strong> - runs from a public RPC with no API key and no
                  server. One npm install.
                </p>

                <CodeSnippet language="bash" code={`npm install @soyaradex/sdk viem`} />

                <div className={styles.callout}>
                  <div className={styles.calloutIcon}>
                    <ShieldCheck size={22} />
                  </div>
                  <div>
                    <div className={styles.calloutTitle}>The part no other DEX SDK gives you</div>
                    <div className={styles.calloutBody}>
                      On most venues an agent has to trust that whatever relays its trade will relay the
                      trade it asked for. Here it does not have to. Every trade is authorised by a
                      commitment the settlement contract derives from the whole order, and{' '}
                      <code className={styles.inlineCode}>verifyBindings()</code> asks that contract to
                      re-derive it and show you the result. Change the route, the fee, the recipient or
                      the quote and the hashes diverge, so the trade cannot settle. Your agent can check
                      this itself, before it spends anything.
                    </div>
                  </div>
                </div>

                <div className={styles.subSection}>
                  <h2 className={styles.h2}>What you can build</h2>
                  <div className={styles.grid3}>
                    <div className={styles.card}>
                      <div className={styles.cardBadge}>No key needed</div>
                      <h3 className={styles.cardTitle}>Trading agents</h3>
                      <p className={styles.cardDesc}>
                        Turn plain language into a routed, priced order. The parser asks a question
                        rather than guessing a token, because a wrong guess spends real funds.
                      </p>
                    </div>
                    <div className={styles.card}>
                      <div className={styles.cardBadge}>No key needed</div>
                      <h3 className={styles.cardTitle}>Risk guards</h3>
                      <p className={styles.cardDesc}>
                        Read the reserves behind a quote. Refuse anything where your order is a large
                        share of the pool, or where two venues disagree about the price.
                      </p>
                    </div>
                    <div className={styles.card}>
                      <div className={styles.cardBadge}>No key needed</div>
                      <h3 className={styles.cardTitle}>Verification services</h3>
                      <p className={styles.cardDesc}>
                        Independently audit any Soyara trade: re-derive its commitment on-chain and show
                        exactly which parameters the verdict binds.
                      </p>
                    </div>
                    <div className={styles.card}>
                      <div className={styles.cardBadge}>No key needed</div>
                      <h3 className={styles.cardTitle}>Route monitors</h3>
                      <p className={styles.cardDesc}>
                        Watch V2, V3 and multi-hop paths for dislocation and arbitrage. Live pool state,
                        in token units, with no oracle in the loop.
                      </p>
                    </div>
                    <div className={styles.card}>
                      <div className={styles.cardBadge}>Your endpoint</div>
                      <h3 className={styles.cardTitle}>Treasury automation</h3>
                      <p className={styles.cardDesc}>
                        Rebalance on a schedule under policy limits. Every move passes a real consensus
                        round, so an off-chain bug cannot move funds the network did not approve.
                      </p>
                    </div>
                    <div className={styles.card}>
                      <div className={styles.cardBadge}>Your endpoint</div>
                      <h3 className={styles.cardTitle}>Multi-agent swarms</h3>
                      <p className={styles.cardDesc}>
                        Give each agent one job - routing, depth, settlement timing, audit - and let them
                        argue. The pieces the Soyara swarm itself is built from.
                      </p>
                    </div>
                  </div>
                </div>

                <div className={styles.subSection}>
                  <h2 className={styles.h2}>Where each call runs</h2>
                  <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                      <thead>
                        <tr><th>Call</th><th>Key?</th><th>Server?</th></tr>
                      </thead>
                      <tbody>
                        <tr><td><code className={styles.inlineCode}>parseIntent</code> / <code className={styles.inlineCode}>understand</code></td><td>no</td><td><strong>no</strong></td></tr>
                        <tr><td><code className={styles.inlineCode}>quoteBestRouteMultiHop</code></td><td>no</td><td><strong>no</strong></td></tr>
                        <tr><td><code className={styles.inlineCode}>analyseMarket</code></td><td>no</td><td><strong>no</strong></td></tr>
                        <tr><td><code className={styles.inlineCode}>buildMultiHopProgram</code></td><td>no</td><td><strong>no</strong></td></tr>
                        <tr><td><code className={styles.inlineCode}>readSettlementPlan</code></td><td>no</td><td><strong>no</strong></td></tr>
                        <tr><td><code className={styles.inlineCode}>verifyBindings</code></td><td>no</td><td><strong>no</strong></td></tr>
                        <tr><td><code className={styles.inlineCode}>SoyaraClient.validate</code></td><td>funded GenLayer account</td><td>yes</td></tr>
                        <tr><td><code className={styles.inlineCode}>SoyaraClient.settleSwap</code></td><td>authorised agent</td><td>yes</td></tr>
                      </tbody>
                    </table>
                  </div>
                  <p className={styles.p}>
                    Only the two calls that sign transactions need a backend, because those keys must
                    never reach client-side JavaScript.
                  </p>
                </div>

                <div className={styles.subSection}>
                  <h2 className={styles.h2}>An agent, end to end</h2>
                  <CodeSnippet
                    language="javascript"
                    code={`import {
  understand, verifyBindings, readSettlementPlan, SoyaraClient,
} from '@soyaradex/sdk';

// 1. Understand, route and judge the market. No key, no server.
const { intent, quote, analysis, redirect } = await understand(
  'swap 100 USDC to WGEN'
);

if (redirect) return reply(redirect.message);   // liquidity lives on the pools app
if (!intent.confident) return ask(intent.needs); // never guess a token

// A quote can be perfect arithmetic on a mispriced pool.
if (!analysis.safeToTrade) {
  for (const c of analysis.concerns) console.warn(c.severity, c.message);
}

// 2. Run a real consensus round.
const soyara = new SoyaraClient({ baseUrl: process.env.SOYARA_API });
const verdict = await soyara.validate(proposal);

// 3. Prove the verdict covers THIS order before spending anything.
const { bound, checks } = await verifyBindings({
  order: verdict.order,
  program: verdict.program,
  commitment: verdict.commitment,
  user: myAddress,
});
if (!bound) throw new Error('verdict does not bind this order');

// 4. Know what you are waiting for: seconds, or the appeal window.
const plan = await readSettlementPlan({ commitment: verdict.commitment });
console.log(plan.rail, \`~\${plan.etaSeconds}s\`);

if (verdict.approved) await soyara.settleSwap(trade);`}
                  />
                </div>

                <div className={styles.subSection}>
                  <h2 className={styles.h2}>Read the pools, not a price feed</h2>
                  <p className={styles.p}>
                    There is no oracle in this stack, so the SDK never reports a dollar value. It reports
                    reserves, your order as a share of them, and whether venues agree. That is what
                    actually decides whether a fill is real.
                  </p>
                  <CodeSnippet
                    language="javascript"
                    code={`const { analysis } = await understand('swap 100 USDT to USDC');

analysis.depth            // 'deep' | 'comfortable' | 'thin' | 'dominant'
analysis.sizeVsDepthPct   // 16.64
analysis.venueSpreadPct   // how far V2 and V3 disagree
analysis.verdict          // 'clear' | 'cautioned' | 'contested'
analysis.safeToTrade      // false when anything is high severity

for (const c of analysis.concerns) console.log(c.severity, c.message);
// high  This order is 16.6% of the USDT side of the USDT/WGEN pool
//       (600.96 USDT in reserve). A trade that size moves the price
//       it trades against.`}
                  />
                </div>

                <div className={styles.subSection}>
                  <h2 className={styles.h2}>Proven against the live contracts</h2>
                  <p className={styles.p}>
                    The package ships a suite that runs against deployed Bradbury contracts rather than
                    mocks, because these functions make claims about what a contract will do. It asserts
                    the security property directly: mutate any one of the eleven mutable order fields and
                    the commitment changes.
                  </p>
                  <CodeSnippet
                    language="bash"
                    code={`npm test

  ok  user changes the commitment
  ok  amountIn changes the commitment
  ok  quotedAmountOut changes the commitment
  ok  router changes the commitment
  ok  feeBps changes the commitment
  ok  feeCollector changes the commitment
  ok  routeHash changes the commitment
  ...
  ok  a tampered order fails the binding
  ok  a substituted route program fails
  ok  a redirected recipient fails

SDK matches the deployed architecture.  (72 passed)`}
                  />
                </div>

                <div className={styles.subSection}>
                  <h2 className={styles.h2}>Scope</h2>
                  <p className={styles.p}>
                    The aggregator routes and settles swaps. Liquidity positions are managed on the pools
                    app, and <code className={styles.inlineCode}>understand()</code> returns a redirect
                    rather than a quote for a deposit, so a liquidity request can never be priced as a
                    trade. If you route by action name, use{' '}
                    <code className={styles.inlineCode}>normaliseAction()</code>: an unrecognised value
                    resolves to <code className={styles.inlineCode}>UNKNOWN</code> and goes nowhere,
                    never to <code className={styles.inlineCode}>SWAP</code>.
                  </p>
                </div>
              </article>
            )}

            {/* ========================================================== */}
            {/* TOPIC 16: JAVASCRIPT SDK */}
            {/* ========================================================== */}
            {activeTopic === 'developer-sdk' && (
              <article className={styles.article}>
                <h1 className={styles.h1}>16. JavaScript SDK (genlayer-js & Viem)</h1>
                <p className={styles.lead}>
                  Integration guide for JavaScript and TypeScript developers using <code className={styles.inlineCode}>genlayer-js</code> and <code className={styles.inlineCode}>viem</code>.
                </p>

                <div className={styles.subSection}>
                  <h2 className={styles.h2}>Installation</h2>
                  <CodeSnippet
                    language="bash"
                    code={`npm install genlayer-js viem`}
                  />
                </div>

                <div className={styles.subSection}>
                  <h2 className={styles.h2}>Validating Trade Proposals via genlayer-js</h2>
                  <CodeSnippet
                    language="javascript"
                    code={`import { createClient } from 'genlayer-js';

const client = createClient({
  endpoint: 'https://rpc-bradbury.genlayer.com',
});

const AGENT_VALIDATOR = '${INTELLIGENT_CONTRACTS.agentValidator}';

async function validateTrade() {
  const result = await client.readContract({
    address: AGENT_VALIDATOR,
    functionName: 'validate_proposal',
    args: [
      'SWAP',
      '0x58B6CD7891cd0A682226E25607b958a6479195A6', // USDC
      '0x315374AA9b5536037Cc1Efeea2439CCC0913A77e', // WGEN
      '100000000000000000000', // 100 USDC
      '198000000000000000000', // Min received
      30, // 0.30% slippage
      '${CONTRACT_ADDRESSES[4221].aggregatorEntrypoint}',
      Math.floor(Date.now() / 1000) + 1200,
      JSON.stringify({ model: 'v3' })
    ]
  });

  console.log('Validation Approved:', result.approved);
  console.log('Proposal ID:', result.proposal_id);
}

validateTrade();`}
                  />
                </div>

                <div className={styles.callout}>
                  <div className={styles.calloutIcon}>
                    <Terminal size={22} />
                  </div>
                  <div>
                    <div className={styles.calloutTitle}>Live Interactive Simulation Workbench</div>
                    <div className={styles.calloutBody}>
                      Want to simulate live proposals and test consensus directly in the browser? Visit the <Link href="/dev" className={styles.link}>Developer Portal & Workbench &rarr;</Link>
                    </div>
                  </div>
                </div>
              </article>
            )}

            {/* ========================================================== */}
            {/* TOPIC 17: PYTHON SDK */}
            {/* ========================================================== */}
            {activeTopic === 'python-sdk' && (
              <article className={styles.article}>
                <h1 className={styles.h1}>17. Python SDK &amp; Agent Integration</h1>
                <p className={styles.lead}>
                  Guide for Python developers building autonomous AI agents, algorithmic market makers, and backend trading bots.
                </p>

                <div className={styles.subSection}>
                  <h2 className={styles.h2}>Python RPC Client Example</h2>
                  <CodeSnippet
                    language="python"
                    code={`import requests
import json
import time

class SoyaraAgent:
    def __init__(self, rpc_url="https://rpc-bradbury.genlayer.com"):
        self.rpc_url = rpc_url
        self.validator_address = "${INTELLIGENT_CONTRACTS.agentValidator}"
        self.entrypoint_address = "${CONTRACT_ADDRESSES[4221].aggregatorEntrypoint}"

    def validate_swap(self, token_in, token_out, amount_in_raw, min_out_raw, slippage_bps=30):
        deadline = int(time.time()) + 1800
        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "gen_call",
            "params": {
                "to": self.validator_address,
                "function": "validate_proposal",
                "args": [
                    "SWAP",
                    token_in,
                    token_out,
                    str(amount_in_raw),
                    str(min_out_raw),
                    slippage_bps,
                    self.entrypoint_address,
                    deadline,
                    json.dumps({"agent": "python_agent_v1"})
                ]
            }
        }
        response = requests.post(self.rpc_url, json=payload).json()
        return response.get("result")

# Usage:
agent = SoyaraAgent()
res = agent.validate_swap(
    token_in="0x58B6CD7891cd0A682226E25607b958a6479195A6",
    token_out="0x315374AA9b5536037Cc1Efeea2439CCC0913A77e",
    amount_in_raw=10000000000000000000,
    min_out_raw=19800000000000000000
)
print("Validation Result:", res)`}
                  />
                </div>
              </article>
            )}

            {/* ========================================================== */}
            {/* TOPIC 18: VERIFIED CONTRACT DIRECTORY */}
            {/* ========================================================== */}
            {activeTopic === 'contracts' && (
              <article className={styles.article}>
                <h1 className={styles.h1}>18. Verified Contract Directory & ABIs</h1>
                <p className={styles.lead}>
                  Complete directory of all deployed, verified protocol contracts on GenLayer Bradbury Testnet (Chain ID 4221):
                </p>

                <div className={styles.metaBox} style={{ marginBottom: '16px' }}>
                  <div><strong>Network Name:</strong> GenLayer Bradbury Testnet</div>
                  <div><strong>Chain ID:</strong> 4221</div>
                  <div><strong>RPC Endpoint:</strong> <code className={styles.code}>https://rpc-bradbury.genlayer.com</code></div>
                  <div><strong>Block Explorer:</strong> <a href="https://explorer-bradbury.genlayer.com" target="_blank" rel="noopener noreferrer" className={styles.link}>https://explorer-bradbury.genlayer.com <ExternalLink size={12} /></a></div>
                </div>

                <div className={styles.tableWrapper}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Contract Name</th>
                        <th>Address</th>
                        <th>Type</th>
                        <th>Explorer Link</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td><strong>AgentValidator (IC)</strong></td>
                        <td><code className={styles.inlineCode}>{INTELLIGENT_CONTRACTS.agentValidator}</code></td>
                        <td>GenLayer IC (Python)</td>
                        <td><a href={`https://explorer-bradbury.genlayer.com/address/${INTELLIGENT_CONTRACTS.agentValidator}`} target="_blank" rel="noopener noreferrer" className={styles.link}>Explorer <ExternalLink size={12} /></a></td>
                      </tr>
                      <tr>
                        <td><strong>LiquidityValidator (IC)</strong></td>
                        <td><code className={styles.inlineCode}>{INTELLIGENT_CONTRACTS.liquidityValidator}</code></td>
                        <td>GenLayer IC (Python)</td>
                        <td><a href={`https://explorer-bradbury.genlayer.com/address/${INTELLIGENT_CONTRACTS.liquidityValidator}`} target="_blank" rel="noopener noreferrer" className={styles.link}>Explorer <ExternalLink size={12} /></a></td>
                      </tr>
                      <tr>
                        <td><strong>AGGFlow Entrypoint</strong></td>
                        <td><code className={styles.inlineCode}>{CONTRACT_ADDRESSES[4221].aggregatorEntrypoint}</code></td>
                        <td>EVM Aggregator</td>
                        <td><a href={`https://explorer-bradbury.genlayer.com/address/${CONTRACT_ADDRESSES[4221].aggregatorEntrypoint}`} target="_blank" rel="noopener noreferrer" className={styles.link}>Explorer <ExternalLink size={12} /></a></td>
                      </tr>
                      <tr>
                        <td><strong>AGGFlow Router</strong></td>
                        <td><code className={styles.inlineCode}>{CONTRACT_ADDRESSES[4221].aggregatorRouter}</code></td>
                        <td>EVM Bytecode Router</td>
                        <td><a href={`https://explorer-bradbury.genlayer.com/address/${CONTRACT_ADDRESSES[4221].aggregatorRouter}`} target="_blank" rel="noopener noreferrer" className={styles.link}>Explorer <ExternalLink size={12} /></a></td>
                      </tr>
                      <tr>
                        <td><strong>SoyaraDex V3 Factory</strong></td>
                        <td><code className={styles.inlineCode}>{CONTRACT_ADDRESSES[4221].v3Factory}</code></td>
                        <td>EVM V3 Factory</td>
                        <td><a href={`https://explorer-bradbury.genlayer.com/address/${CONTRACT_ADDRESSES[4221].v3Factory}`} target="_blank" rel="noopener noreferrer" className={styles.link}>Explorer <ExternalLink size={12} /></a></td>
                      </tr>
                      <tr>
                        <td><strong>SoyaraDex V3 Router</strong></td>
                        <td><code className={styles.inlineCode}>{CONTRACT_ADDRESSES[4221].v3Router}</code></td>
                        <td>EVM V3 SwapRouter</td>
                        <td><a href={`https://explorer-bradbury.genlayer.com/address/${CONTRACT_ADDRESSES[4221].v3Router}`} target="_blank" rel="noopener noreferrer" className={styles.link}>Explorer <ExternalLink size={12} /></a></td>
                      </tr>
                      <tr>
                        <td><strong>SoyaraDex V3 Position Mgr</strong></td>
                        <td><code className={styles.inlineCode}>{CONTRACT_ADDRESSES[4221].v3PositionManager}</code></td>
                        <td>EVM V3 NFT Manager</td>
                        <td><a href={`https://explorer-bradbury.genlayer.com/address/${CONTRACT_ADDRESSES[4221].v3PositionManager}`} target="_blank" rel="noopener noreferrer" className={styles.link}>Explorer <ExternalLink size={12} /></a></td>
                      </tr>
                      <tr>
                        <td><strong>SoyaraDex V2 Factory</strong></td>
                        <td><code className={styles.inlineCode}>{CONTRACT_ADDRESSES[4221].factory}</code></td>
                        <td>EVM V2 Factory</td>
                        <td><a href={`https://explorer-bradbury.genlayer.com/address/${CONTRACT_ADDRESSES[4221].factory}`} target="_blank" rel="noopener noreferrer" className={styles.link}>Explorer <ExternalLink size={12} /></a></td>
                      </tr>
                      <tr>
                        <td><strong>SoyaraDex V2 Router</strong></td>
                        <td><code className={styles.inlineCode}>{CONTRACT_ADDRESSES[4221].router}</code></td>
                        <td>EVM V2 Router</td>
                        <td><a href={`https://explorer-bradbury.genlayer.com/address/${CONTRACT_ADDRESSES[4221].router}`} target="_blank" rel="noopener noreferrer" className={styles.link}>Explorer <ExternalLink size={12} /></a></td>
                      </tr>
                      <tr>
                        <td><strong>Wrapped GEN (WGEN)</strong></td>
                        <td><code className={styles.inlineCode}>{CONTRACT_ADDRESSES[4221].wgen}</code></td>
                        <td>EVM Canonical WGEN</td>
                        <td><a href={`https://explorer-bradbury.genlayer.com/address/${CONTRACT_ADDRESSES[4221].wgen}`} target="_blank" rel="noopener noreferrer" className={styles.link}>Explorer <ExternalLink size={12} /></a></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </article>
            )}

            {/* ========================================================== */}
            {/* TOPIC 19: SECURITY THREAT MODEL */}
            {/* ========================================================== */}
            {activeTopic === 'security-roadmap' && (
              <article className={styles.article}>
                <h1 className={styles.h1}>19. Security Threat Model & Defense Matrix</h1>
                <p className={styles.lead}>
                  Comprehensive technical analysis of DeFi threat vectors and Soyara DEX's multi-layered defense architecture:
                </p>

                <div className={styles.grid2}>
                  <div className={styles.card}>
                    <h3 className={styles.cardTitle}>Threat: Toxic MEV & Sandwich Attacks</h3>
                    <p className={styles.cardDesc}>
                      <strong>Defense:</strong> Hard 3.00% (300 bps) slippage ceiling enforced in GenVM consensus by <code className={styles.inlineCode}>AgentValidator.py</code> before EVM broadcast.
                    </p>
                  </div>

                  <div className={styles.card}>
                    <h3 className={styles.cardTitle}>Threat: Prompt Injection & Agent Exploits</h3>
                    <p className={styles.cardDesc}>
                      <strong>Defense:</strong> Proposal schemas accept only structured numeric fields and approved token/router addresses. User free-text is never evaluated inside consensus prompts.
                    </p>
                  </div>

                  <div className={styles.card}>
                    <h3 className={styles.cardTitle}>Threat: Reentrancy & Unapproved Delegates</h3>
                    <p className={styles.cardDesc}>
                      <strong>Defense:</strong> AGGFlow Entrypoint uses strict non-reentrant guards and disallows arbitrary delegatecalls.
                    </p>
                  </div>

                  <div className={styles.card}>
                    <h3 className={styles.cardTitle}>Threat: Node Sybil & Hallucination Collusion</h3>
                    <p className={styles.cardDesc}>
                      <strong>Defense:</strong> GenLayer Optimistic Democracy achieves consensus across decentralized validator committees via the Equivalence Principle (<code className={styles.inlineCode}>gl.eq_principle_strict_eq</code>).
                    </p>
                  </div>
                </div>
              </article>
            )}

            {/* ========================================================== */}
            {/* TOPIC 20: THE FUTURE OF AUTONOMOUS FINANCE */}
            {/* ========================================================== */}
            {activeTopic === 'future-vision' && (
              <article className={styles.article}>
                <h1 className={styles.h1}>20. The Future of Autonomous Intelligent Finance</h1>
                <p className={styles.lead}>
                  Looking ahead: how GenLayer Intelligent Contracts and Soyara DEX will power the next era of fully autonomous on-chain financial coordination.
                </p>

                <div className={styles.subSection}>
                  <h2 className={styles.h2}>Key Innovations on the Horizon</h2>
                  <ul className={styles.ul}>
                    <li className={styles.li}>
                      <strong>Autonomous Intent-Based On-Chain Orderbooks:</strong> Smart contracts that maintain conditional limit orders and risk assessments directly inside block validation without centralized off-chain keepers.
                    </li>
                    <li className={styles.li}>
                      <strong>Self-Balancing Concentrated Liquidity Pools:</strong> Intelligent Contracts that automatically adjust V3 tick widths based on real-time volatility calculations.
                    </li>
                    <li className={styles.li}>
                      <strong>Cross-Chain AI Intent Relaying:</strong> Extending GenLayer Intelligent Contract consensus to safely settle trades on Ethereum, Base, and Arbitrum.
                    </li>
                    <li className={styles.li}>
                      <strong>Multi-Agent DAO Treasuries:</strong> Autonomous AI agents collaboratively managing liquidity, yield farming, and debt ratios with immutable on-chain risk parameters.
                    </li>
                  </ul>
                </div>
              </article>
            )}

            {/* ============================================================ */}
            {/* PURE GITBOOK BOTTOM PAGINATION NAVIGATION */}
            {/* ============================================================ */}
            <div className={styles.paginationWrapper}>
              {prevTopic ? (
                <button
                  type="button"
                  onClick={() => selectTopic(prevTopic.id)}
                  className={styles.pageNavButton}
                >
                  <span className={styles.pageNavLabel}>
                    <ArrowLeft size={14} />
                    Previous Page
                  </span>
                  <span className={styles.pageNavTitle}>{prevTopic.title}</span>
                </button>
              ) : (
                <div />
              )}

              {nextTopic ? (
                <button
                  type="button"
                  onClick={() => selectTopic(nextTopic.id)}
                  className={`${styles.pageNavButton} ${styles.pageNavButtonRight}`}
                >
                  <span className={styles.pageNavLabel}>
                    Next Page
                    <ArrowRight size={14} />
                  </span>
                  <span className={styles.pageNavTitle}>{nextTopic.title}</span>
                </button>
              ) : (
                <div />
              )}
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
