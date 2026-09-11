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
import { CONTRACT_ADDRESSES, INTELLIGENT_CONTRACTS, RETIRED_CONTRACTS } from '../constants/addresses';
import { useTheme } from '../components/contexts/ThemeContext';
import styles from '../styles/Docs.module.css';

const DOC_TOPICS = [
  {
    category: 'GETTING STARTED',
    items: [
      { id: 'overview', title: '1. Overview & Architecture', icon: <Boxes size={16} /> },
      { id: 'user-guide', title: '2. User & Agent Quickstart', icon: <Zap size={16} /> },
      { id: 'swarm', title: '3. Swarm', icon: <Users size={16} /> },
    ]
  },
  {
    category: 'WHY AI & GENLAYER CONSENSUS',
    items: [
      { id: 'why-ai', title: '4. The Agentic DeFi Revolution', icon: <Sparkles size={16} /> },
      { id: 'genlayer-genvm', title: '5. GenLayer & GenVM Deep Dive', icon: <Cpu size={16} /> },
      { id: 'comparison', title: '6. Comparison: AMMs vs. IMMs', icon: <Activity size={16} /> },
    ]
  },
  {
    category: 'AGENT-TO-AGENT (A2A) & EXECUTION',
    items: [
      { id: 'agent-protocols', title: '7. Agent-to-Agent (A2A) Protocols', icon: <Network size={16} /> },
      { id: 'agent-execution-guide', title: '8. Autonomous Agent Execution Tutorial', icon: <Bot size={16} /> },
      { id: 'agent-session-keys', title: '9. Delegated Execution: Mandates', icon: <Key size={16} /> },
    ]
  },
  {
    category: 'OUR INTELLIGENT CONTRACTS',
    items: [
      { id: 'agent-validator', title: '10. AgentValidator.py (Specification)', icon: <ShieldCheck size={16} /> },
      { id: 'liquidity-validator', title: '11. Liquidity: V2 Validation, V3 on Pools', icon: <ShieldCheck size={16} /> },
      { id: 'agent-executor', title: '12. AgentExecutor.sol & Settlement', icon: <Lock size={16} /> },
    ]
  },
  {
    category: 'DEX & AGGREGATION ENGINE',
    items: [
      { id: 'core-dex', title: '13. AGGFlow DEX Aggregator & Bytecode VM', icon: <ArrowRightLeft size={16} /> },
      { id: 'wrap-unwrap', title: '14. Native GEN & WGEN 1:1 Wrap Mechanics', icon: <Layers size={16} /> },
      { id: 'tokenomics', title: '15. Supported Assets & Price Oracles', icon: <Scale size={16} /> },
    ]
  },
  {
    category: 'DEVELOPER SDKS & INTEGRATION',
    items: [
      { id: 'build-with-sdk', title: '16. Build With @soyaradex/sdk', icon: <Package size={16} /> },
      { id: 'developer-sdk', title: '17. JavaScript SDK (genlayer-js & Viem)', icon: <Code2 size={16} /> },
      { id: 'python-sdk', title: '18. Python SDK & Agent Integration', icon: <FileCode2 size={16} /> },
      { id: 'contracts', title: '19. Verified Contract Directory & ABIs', icon: <Terminal size={16} /> },
    ]
  },
  {
    category: 'SECURITY & FUTURE OF AGENTIC FINANCE',
    items: [
      { id: 'security-roadmap', title: '20. Security Threat Model & Defense Matrix', icon: <Shield size={16} /> },
      { id: 'future-vision', title: '21. Future: Autonomous Intelligent Finance', icon: <Compass size={16} /> },
    ]
  }
];

// Flat list for Next / Previous pagination
const FLAT_TOPICS = DOC_TOPICS.flatMap(cat => cat.items);

// The swarm's seven agents, in the order they speak.
const SWARM_AGENTS = [
  { name: 'Intent Copilot', role: 'Understands you', desc: 'Reads your request. If a detail is missing it asks instead of guessing, because a wrong guess spends real money.' },
  { name: 'Routing & Math Quant', role: 'Best route', desc: 'Compares every pool, V2 and V3, direct and multi-hop, and takes the best fill. You never have to pick a venue.' },
  { name: 'Market Analyst', role: 'Real price', desc: 'Reads the live reserves behind the quote and objects when a pool is thin or the pools disagree on price.' },
  { name: 'Risk & GenVM Consensus', role: 'Independent vote', desc: 'Sends the trade to GenLayer, where validators re-check the route and the price on their own and vote.' },
  { name: 'Settlement Strategist', role: 'Fastest valid rail', desc: 'Picks how the trade settles: your fast lane in about 5 seconds, or its own verdict in about 30 minutes.' },
  { name: 'Post-Trade Auditor', role: 'On-chain proof', desc: 'Proves on chain that the approval covers exactly this order: route, fee, recipient, quote and deadline.' },
  { name: 'Dev Inspector & Debugger', role: 'Tamper check', desc: 'Checks the calldata. Change any field and settlement reverts on chain.' },
];

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
                        <code className={styles.inlineCode}>AgentValidator.py</code> checks every order on GenLayer validator nodes against live pool state, with deterministic rules and LLM consensus (<code className={styles.inlineCode}>gl.eq_principle.strict_eq</code>), and delivers its verdict to the settlement contract itself.
                      </p>
                    </div>
                    <div className={styles.card}>
                      <div className={styles.cardBadge}>Tier 3: EVM Settlement</div>
                      <h3 className={styles.cardTitle}>AgentExecutor → AGGFlow Router</h3>
                      <p className={styles.cardDesc}>
                        <code className={styles.inlineCode}>AgentExecutor</code> refuses any agent trade the validator did not authorise, then runs the route through the AGGFlow bytecode router across SoyaraDex V2 and V3 pools, atomically.
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
                ▼ (1. Intent → best-route quote → the exact order)
   SwapOrder: route program, fee, collector, recipient, quote, deadline
                │
                ▼ (2. Choose the authority, before any round is opened)
   ┌────────────────────────────────────────────────────────────┐
   │ Covered by a mandate an earlier round issued?              │
   │   yes → rail "mandate"   (no new round)                    │
   │   no  → rail "consensus": validate_swap on AgentValidator  │
   │         · decodes the route, verifies every pool on chain  │
   │         · re-derives the quote from live reserves          │
   │         · LLM coherence review under strict_eq             │
   │         · emits recordVerdict to AgentExecutor on finality │
   └────────────────────────────────────────────────────────────┘
                │
                ▼ (3. Settlement: AgentExecutor, and nothing else)
   ┌────────────────────────────────────────────────────────────┐
   │ consensus → executeSwap(order, program)                    │
   │             re-derives the commitment, consumes the        │
   │             single-use verdict, reverts if none            │
   │ mandate   → executeSwapUnderMandate(id, amount, ...)       │
   │             checks size, budget, fee, route against the    │
   │             mandate and prices the trade from the pool     │
   │ → AGGFlowEntrypoint → SoyaraDex V2 / V3 pools              │
   └────────────────────────────────────────────────────────────┘
                │
                ▼ (4. Output lands at the recipient in the order)`}
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
                    <h3 className={styles.stepTitle}>Consensus Authorises the Exact Order</h3>
                    <p className={styles.stepDesc}>
                      The app builds the exact order that will settle and submits it to <code className={styles.inlineCode}>validate_swap</code> on <code className={styles.inlineCode}>AgentValidator.py</code> (<code className={styles.code}>{INTELLIGENT_CONTRACTS.agentValidator}</code>). Validators re-check the route and the quote against live pools. If a mandate an earlier round issued already covers the trade, no new round is opened.
                    </p>
                  </div>
                </div>

                <div className={styles.stepCard}>
                  <div className={styles.stepNum}>4</div>
                  <div>
                    <h3 className={styles.stepTitle}>One-Time Token Approval & Settlement Through AgentExecutor</h3>
                    <p className={styles.stepDesc}>
                      Approve <code className={styles.inlineCode}>AgentExecutor</code> (<code className={styles.code}>{CONTRACT_ADDRESSES[4221].agentExecutor}</code>) once per token. The settlement agent then relays the trade to it, and it refuses anything the validator did not authorise: a trade with its own verdict settles when that verdict reaches the executor (after the appeal window), and a mandate-covered trade settles in one transaction. Agent trades never go to <code className={styles.inlineCode}>AGGFlowEntrypoint</code> directly; the <code className={styles.inlineCode}>/swap</code> page is where you sign a swap yourself.
                    </p>
                  </div>
                </div>
              </article>
            )}

            {/* ========================================================== */}
            {/* TOPIC 3: SWARM */}
            {/* ========================================================== */}
            {activeTopic === 'swarm' && (
              <article className={styles.article}>
                <h1 className={styles.h1}>3. Swarm</h1>
                <p className={styles.lead}>
                  Seven AI agents check every trade before any money moves. GenLayer consensus approves it, and AgentExecutor settles it. You get the best route, a price you can trust, and a trade nobody can change on the way.
                </p>

                <div className={styles.callout}>
                  <div className={styles.calloutIcon}>
                    <Users size={22} />
                  </div>
                  <div>
                    <div className={styles.calloutTitle}>In one line</div>
                    <div className={styles.calloutBody}>
                      The swarm is the safety check an agent needs before it trades for you. The fast lane makes repeat trades settle in about 5 seconds.
                    </div>
                  </div>
                </div>

                <div className={styles.subSection}>
                  <h2 className={styles.h2}>The seven agents</h2>
                  <div className={styles.grid3}>
                    {SWARM_AGENTS.map((a) => (
                      <div key={a.name} className={styles.card}>
                        <div className={styles.cardBadge}>{a.role}</div>
                        <h3 className={styles.cardTitle}>{a.name}</h3>
                        <p className={styles.cardDesc}>{a.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className={styles.subSection}>
                  <h2 className={styles.h2}>Why it makes trades safe</h2>
                  <ul className={styles.ul}>
                    <li className={styles.li}><strong>It never guesses.</strong> An unclear request gets a question, not a trade.</li>
                    <li className={styles.li}><strong>Best route, always.</strong> Every venue is compared and the best fill wins.</li>
                    <li className={styles.li}><strong>A price you can trust.</strong> When pools disagree, for example by 5.7x on one route, the Market Analyst objects on screen and the choice is yours.</li>
                    <li className={styles.li}><strong>Consensus, not one server.</strong> GenLayer validators re-check the trade independently before anything is approved.</li>
                    <li className={styles.li}><strong>Tamper-proof.</strong> The approval covers the whole order: route, fee, fee collector, recipient, quote, deadline. Change anything and settlement reverts. Each approval works once.</li>
                    <li className={styles.li}><strong>Your money stays yours.</strong> Funds stay in your wallet until settlement, and the output goes only to your address. The settlement agent cannot approve a trade, only relay one consensus approved.</li>
                    <li className={styles.li}><strong>Fails closed.</strong> A rejected trade stops the run and nothing moves. A round without a verdict is reported as exactly that, never as a rejection.</li>
                    <li className={styles.li}><strong>Your limits.</strong> In the <Link href="/a2a/dev" className={styles.link}>developer studio</Link> you set slippage and a price-impact ceiling. Above it, the swarm stops before anything is sent.</li>
                  </ul>
                </div>

                <div className={styles.subSection}>
                  <h2 className={styles.h2}>Why it is fast</h2>
                  <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Step</th>
                          <th>Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>The swarm checks the trade (route, pools, validator vote, proof)</td>
                          <td>About a minute</td>
                        </tr>
                        <tr>
                          <td>First trade on a pair: the verdict reaches the executor</td>
                          <td>About 30 minutes, once</td>
                        </tr>
                        <tr>
                          <td>Fast lane: later trades on that pair and direction</td>
                          <td><strong>About 5 seconds</strong></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <ul className={styles.ul}>
                    <li className={styles.li}><strong>The fast lane sets itself up.</strong> After your first trade on a pair, the swarm asks consensus for a mandate: up to 2x that trade each time and 20x in total, for 24 hours. Consensus can set tighter limits. Trades inside it open no new round.</li>
                    <li className={styles.li}><strong>No waiting around.</strong> The validator vote starts while the pools are read, and the last checks run in parallel.</li>
                    <li className={styles.li}><strong>It finishes on its own.</strong> An approved trade settles by itself, even with Soyara closed. Notifications tell you when it is done and when your fast lane is ready.</li>
                  </ul>
                </div>

                <div className={styles.subSection}>
                  <h2 className={styles.h2}>How a trade moves</h2>
                  <div className={styles.stepCard}>
                    <div className={styles.stepNum}>1</div>
                    <div>
                      <h3 className={styles.stepTitle}>Ask</h3>
                      <p className={styles.stepDesc}>Type a trade, like &ldquo;swap 50 USDC to USDT&rdquo;.</p>
                    </div>
                  </div>
                  <div className={styles.stepCard}>
                    <div className={styles.stepNum}>2</div>
                    <div>
                      <h3 className={styles.stepTitle}>Check</h3>
                      <p className={styles.stepDesc}>The agents route it, read the pools and debate anything that looks wrong, one line each.</p>
                    </div>
                  </div>
                  <div className={styles.stepCard}>
                    <div className={styles.stepNum}>3</div>
                    <div>
                      <h3 className={styles.stepTitle}>Approve</h3>
                      <p className={styles.stepDesc}>GenLayer validators vote. With a live fast lane, no new vote is needed.</p>
                    </div>
                  </div>
                  <div className={styles.stepCard}>
                    <div className={styles.stepNum}>4</div>
                    <div>
                      <h3 className={styles.stepTitle}>Settle</h3>
                      <p className={styles.stepDesc}>AgentExecutor checks the approval on chain and settles, in about 5 seconds on the fast lane.</p>
                    </div>
                  </div>
                </div>

                <div className={styles.subSection}>
                  <h2 className={styles.h2}>Honest limits</h2>
                  <ul className={styles.ul}>
                    <li className={styles.li}>The first trade on a pair and direction waits about 30 minutes. That is GenLayer&apos;s finality window, measured at 30 minutes after the vote, not the swarm.</li>
                    <li className={styles.li}>A fast lane covers one pair and direction, within its limits, on the one V2 pool it pins. When the best route is somewhere else, that trade gets its own round, because the best route always wins.</li>
                    <li className={styles.li}>Want an instant swap you sign yourself? Use <Link href="/swap" className={styles.link}>Swap</Link>: seconds, no consensus.</li>
                  </ul>
                </div>

                <div className={styles.subSection}>
                  <h2 className={styles.h2}>More good things</h2>
                  <ul className={styles.ul}>
                    <li className={styles.li}><strong>You see everything.</strong> Every agent&apos;s finding is on screen, and the full on-chain proof is one tap away under Details.</li>
                    <li className={styles.li}><strong>Smart notifications.</strong> One-line notices and a bell with history, saved in your browser.</li>
                    <li className={styles.li}><strong>Built for builders.</strong> The same flow is in <code className={styles.inlineCode}>@soyaradex/sdk</code> (<code className={styles.inlineCode}>validate</code>, <code className={styles.inlineCode}>requestMandate</code>, <code className={styles.inlineCode}>settleSwap</code>) and in the developer studio.</li>
                    <li className={styles.li}><strong>Proven on chain.</strong> Both rails settled for real on Bradbury: the trade&apos;s own verdict in <code className={styles.inlineCode}>0x939d5212…</code> and the fast lane in <code className={styles.inlineCode}>0x5049aad7…</code>. See the <a href="https://github.com/Jubayerianj/soyara-genlayer-contracts/blob/main/DEPLOYMENTS.md" target="_blank" rel="noopener noreferrer" className={styles.link}>deployment record <ExternalLink size={12} /></a>.</li>
                  </ul>
                </div>

                <div className={styles.subSection}>
                  <h2 className={styles.h2}>Which page to use</h2>
                  <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Page</th>
                          <th>Who signs</th>
                          <th>Speed</th>
                          <th>Checks</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td><Link href="/swap" className={styles.link}>Swap</Link></td>
                          <td>You</td>
                          <td>Seconds</td>
                          <td>Best route</td>
                        </tr>
                        <tr>
                          <td><Link href="/ai" className={styles.link}>AI Trading</Link></td>
                          <td>The agent, after your one-time approval</td>
                          <td>About 30 min first, then about 5s</td>
                          <td>Consensus and on-chain proof</td>
                        </tr>
                        <tr>
                          <td><Link href="/a2a/user" className={styles.link}>Swarm</Link></td>
                          <td>The agent, after your one-time approval</td>
                          <td>About 30 min first, then about 5s</td>
                          <td>Seven agents, consensus and on-chain proof</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p className={styles.p}>
                    <Link href="/a2a/user" className={styles.link}>Open the Swarm</Link> and run a trade.
                  </p>
                </div>
              </article>
            )}

            {/* ========================================================== */}
            {/* TOPIC 3: THE AGENTIC DEFI REVOLUTION */}
            {/* ========================================================== */}
            {activeTopic === 'why-ai' && (
              <article className={styles.article}>
                <h1 className={styles.h1}>4. The Agentic DeFi Revolution</h1>
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
                <h1 className={styles.h1}>5. GenLayer & GenVM Deep Dive</h1>
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
                    <li className={styles.li}><strong>Equivalence Principle (<code className={styles.inlineCode}>gl.eq_principle.strict_eq</code>):</strong> The committee evaluates whether the leader's output satisfies strict equivalence rules.</li>
                    <li className={styles.li}><strong>Finality:</strong> Majority agreement commits the transaction state irreversibly to the ledger.</li>
                  </ol>
                </div>

                <div className={styles.subSection}>
                  <h2 className={styles.h2}>Equivalence Principle Implementation Example</h2>
                  <CodeSnippet
                    language="python"
                    code={`# From AgentValidator.py - the pattern validate_swap uses.
from genlayer import *
import json

def _consensus_review(self, action: str, slippage_bps: u256,
                      amount_in: str, min_amount_out: str, extra_data: str) -> bool:
    # A nested def passed BY NAME, not an inline lambda: genvm-lint treats the
    # scope around an inline nondet lambda as non-deterministic.
    def review() -> bool:
        return self._llm_review(action, slippage_bps, amount_in, min_amount_out, extra_data)

    # strict_eq compares the returned value across validators for EXACT
    # equality, so only a bare boolean may cross it. LLM prose differs per
    # node, and a round returning it can never reach agreement.
    return gl.eq_principle.strict_eq(review)

def _llm_review(self, action, slippage_bps, amount_in, min_amount_out, extra_data) -> bool:
    prompt = f"""Evaluate this proposal for numeric coherence only.
Action: {action}  Amount In: {amount_in}  Min Amount Out: {min_amount_out}
Slippage: {int(slippage_bps)} bps
Reply with ONLY: {{"approved": true|false, "reason": "..."}}"""
    try:
        parsed = json.loads(gl.nondet.exec_prompt(prompt).strip())
        return bool(parsed.get("approved", False))
    except Exception:
        return False   # an LLM or parsing failure fails CLOSED

# The deterministic checks (tokens, router, slippage cap, fee cap, the route
# decoded pool by pool against the factories, the quote re-derived from live
# reserves) all run BEFORE this, outside any non-deterministic block.`}
                  />
                </div>
              </article>
            )}

            {/* ========================================================== */}
            {/* TOPIC 5: COMPARISON MATRIX */}
            {/* ========================================================== */}
            {activeTopic === 'comparison' && (
              <article className={styles.article}>
                <h1 className={styles.h1}>6. Comparison: Passive AMMs vs. Agentic IMMs</h1>
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
                <h1 className={styles.h1}>7. Agent-to-Agent (A2A) Protocols</h1>
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
    "strategy": "REBALANCE"
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
                    <li className={styles.li}><strong>Liquidity is not an agent action here:</strong> the aggregator's agents route and settle swaps only. Positions, including V3 ranges, are managed on the pools app, and no Intelligent Contract on the settlement path validates V3 liquidity.</li>
                    <li className={styles.li}><strong>Cross-Pool Arbitrage Agents:</strong> Identify price discrepancies between V2 classic pools and V3 concentrated pools, executing multi-hop atomic swaps, each one authorised by consensus before AgentExecutor settles it.</li>
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
                <h1 className={styles.h1}>8. Autonomous Agent Execution Tutorial</h1>
                <p className={styles.lead}>
                  Complete end-to-end implementation tutorials showing how to build an autonomous trading agent in Node.js / TypeScript and Python that validates and executes trades on GenLayer.
                </p>

                <div className={styles.subSection}>
                  <h2 className={styles.h2}>1. Autonomous Node.js / TypeScript Agent</h2>
                  <CodeSnippet
                    language="javascript"
                    code={`// An agent that trades through Soyara's settlement path.
//
// Validation is a GenLayer consensus WRITE and settlement is an onlyAgent call
// on AgentExecutor, so both run on the server that holds those keys - the
// app's own API routes, or your deployment of them.
const BASE = 'https://app.soyara.xyz';
const USER = '0xYourWallet'; // receives the output; has approved AgentExecutor once
const post = (path, body) => fetch(BASE + path, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}).then((r) => r.json());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function trade() {
  // 1. Consensus authorises the EXACT order that will settle - route program,
  //    fee, collector, recipient and quote - or finds a mandate an earlier
  //    round issued that already covers it. Either way the response names the
  //    rail, and nothing settles without one.
  let v = await post('/api/genlayer-validate', {
    action: 'SWAP', user: USER, tokenIn: 'USDC', tokenOut: 'WGEN', amountIn: '10', slippageBps: 30,
  });
  while (v.pending) {                       // the round runs for ~20-30s
    await sleep(4000);
    v = { ...v, ...(await post('/api/genlayer-validate', { checkTxHash: v.tx_hash, proposalId: v.proposal_id })) };
  }
  if (!v.approved) throw new Error(v.reason);

  // 2. Settle through AgentExecutor, on that rail. The executor refuses
  //    anything the AgentValidator IC did not authorise.
  const body = {
    rail: v.rail,                           // 'mandate' | 'consensus'
    mandateId: v.mandate_id,                // mandate rail only
    pendingOrder: v.pendingOrder,           // the order consensus saw
    pendingProgram: v.pendingProgram,
    validationSubmitted: v.validationSubmitted,
    validationTxHash: v.tx_hash,
  };
  for (;;) {
    const s = await post('/api/agent-execute', body);
    if (s.success) return s;                // s.rail, s.execTxHash
    // consensus rail: the verdict reaches the executor when the round
    // finalizes (the appeal window). Same body, same commitment - retry.
    if (!s.pending) throw new Error(s.error);
    await sleep(60_000);
  }
}

trade().then((s) => console.log('settled via', s.rail, s.execTxHash)).catch(console.error);`}
                  />
                </div>

                <div className={styles.subSection}>
                  <h2 className={styles.h2}>2. Autonomous Python Trading Agent</h2>
                  <CodeSnippet
                    language="python"
                    code={`import time
import requests

BASE = "https://app.soyara.xyz"   # or your deployment of the app's API routes
USER = "0xYourWallet"             # receives the output; has approved AgentExecutor once

def post(path, body):
    return requests.post(BASE + path, json=body, timeout=60).json()

def trade():
    # 1. Consensus authorises the exact order (or a mandate already covers it).
    v = post("/api/genlayer-validate", {
        "action": "SWAP", "user": USER, "tokenIn": "USDC", "tokenOut": "WGEN",
        "amountIn": "10", "slippageBps": 30,
    })
    while v.get("pending"):
        time.sleep(4)
        v = {**v, **post("/api/genlayer-validate", {"checkTxHash": v["tx_hash"], "proposalId": v.get("proposal_id")})}
    if not v.get("approved"):
        raise RuntimeError(v.get("reason"))

    # 2. Settle through AgentExecutor on the rail consensus chose.
    body = {
        "rail": v["rail"],                 # "mandate" or "consensus"
        "mandateId": v.get("mandate_id"),
        "pendingOrder": v["pendingOrder"],
        "pendingProgram": v["pendingProgram"],
        "validationSubmitted": v.get("validationSubmitted"),
        "validationTxHash": v.get("tx_hash"),
    }
    while True:
        s = post("/api/agent-execute", body)
        if s.get("success"):
            return s
        if not s.get("pending"):           # pending = the verdict is still finalizing
            raise RuntimeError(s.get("error"))
        time.sleep(60)

if __name__ == "__main__":
    s = trade()
    print("settled via", s["rail"], s["execTxHash"])`}
                  />
                </div>
              </article>
            )}

            {/* ========================================================== */}
            {/* TOPIC 8: DELEGATED EXECUTION & SESSION KEYS */}
            {/* ========================================================== */}
            {activeTopic === 'agent-session-keys' && (
              <article className={styles.article}>
                <h1 className={styles.h1}>9. Delegated Execution: Consensus Mandates</h1>
                <p className={styles.lead}>
                  How an agent gets bounded authority to trade for a user without a consensus round per trade, and what it still cannot do.
                </p>

                <div className={styles.subSection}>
                  <h2 className={styles.h2}>Why mandates exist</h2>
                  <p className={styles.p}>
                    A per-order verdict reaches AgentExecutor as an EVM-bound external message, and GenLayer delivers those when the round finalizes. <code className={styles.inlineCode}>EthSend</code> carries no delivery-timing field, so every per-order trade waits out the appeal window (about 30 minutes on Bradbury). A mandate pays that wait once: one consensus round approves a bounded authority, and each trade inside it settles in one transaction.
                  </p>
                </div>

                <div className={styles.subSection}>
                  <h2 className={styles.h2}>What a mandate binds</h2>
                  <p className={styles.p}>
                    <code className={styles.inlineCode}>issue_trading_mandate</code> verifies the pool against the V2 factory, checks its live reserves, builds the route program itself, and emits <code className={styles.inlineCode}>recordMandate</code>, which only the IC can call. The executor then checks every trade against it:
                  </p>
                  <ul className={styles.ul}>
                    <li className={styles.li}><strong>User, pair and direction:</strong> only this user&apos;s tokens move, only this way round.</li>
                    <li className={styles.li}><strong>Per-trade ceiling and lifetime budget:</strong> consensus refuses a cap above 10% of the pool&apos;s reserve, and a spent budget cannot be refilled.</li>
                    <li className={styles.li}><strong>Route:</strong> <code className={styles.inlineCode}>keccak256(aggProgram)</code> must equal the route hash the validators built.</li>
                    <li className={styles.li}><strong>Fee and collector, router, expiry:</strong> fixed in the mandate.</li>
                    <li className={styles.li}><strong>Price:</strong> the executor reads the pinned pool&apos;s reserves at settlement and refuses a floor more than the mandate&apos;s slippage below its own figure.</li>
                  </ul>
                  <p className={styles.p}>
                    The agent chooses only the size of a trade, inside those limits. The owner or the validator can revoke a mandate at any time. A mandate is a broader authority than one exact order, which is why the app asks for one only for a pair and direction you are already trading, and tells you when it does.
                  </p>
                </div>
              </article>
            )}

            {/* ========================================================== */}
            {/* TOPIC 9: AGENT VALIDATOR SPECIFICATION */}
            {/* ========================================================== */}
            {activeTopic === 'agent-validator' && (
              <article className={styles.article}>
                <div className={styles.contractBadge}>Intelligent Contract 1</div>
                <h1 className={styles.h1}>10. AgentValidator.py (Deep Dive & Specification)</h1>
                <p className={styles.lead}>
                  Complete technical specification of <code className={styles.inlineCode}>AgentValidator.py</code> deployed on GenLayer Bradbury Testnet at <code className={styles.code}>{INTELLIGENT_CONTRACTS.agentValidator}</code>.
                </p>

                <div className={styles.metaBox}>
                  <div><strong>Contract Address:</strong> <code className={styles.code}>{INTELLIGENT_CONTRACTS.agentValidator}</code></div>
                  <div><strong>Network:</strong> GenLayer Bradbury Testnet (Chain ID 4221)</div>
                  <div><strong>Language:</strong> Python 3.11 (GenVM Sandboxed Runtime)</div>
                  <div><strong>Consensus Principle:</strong> <code className={styles.inlineCode}>gl.eq_principle.strict_eq</code> (a bare boolean crosses it)</div>
                  <div><strong>Deployed Code:</strong> byte-identical to <code className={styles.inlineCode}>build/AgentValidator.min.py</code> in the contracts repository (checked by its <code className={styles.inlineCode}>verify-deployment.sh</code>)</div>
                  <div><strong>Paired Executor:</strong> <code className={styles.code}>{CONTRACT_ADDRESSES[4221].agentExecutor}</code> (the only contract it delivers verdicts to)</div>
                </div>

                <div className={styles.subSection}>
                  <h2 className={styles.h2}>Public Interface (as deployed)</h2>
                  <p className={styles.p}>
                    These are the methods the deployed contract actually exposes; <code className={styles.inlineCode}>npm run test:settlement</code> reads its schema from the chain and fails if the app calls anything else.
                  </p>
                  <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Function</th>
                          <th>What it does</th>
                          <th>Access</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td><code className={styles.inlineCode}>validate_swap</code></td>
                          <td>Takes the full order (user, tokens, amount, floor, quote, slippage, deadline, router, fee, fee collector, route program, nonce). Decodes the route, confirms every pool against the V2/V3 factories, re-derives the output from live reserves, runs the LLM review, and on approval emits <code className={styles.inlineCode}>recordVerdict(commitment, expiry)</code> to AgentExecutor.</td>
                          <td>Write (consensus)</td>
                        </tr>
                        <tr>
                          <td><code className={styles.inlineCode}>issue_trading_mandate</code></td>
                          <td>Resolves the pool from the V2 factory, checks its live reserves, refuses a per-trade cap above 10% of the reserve, builds the route program itself, and emits <code className={styles.inlineCode}>recordMandate</code>: a bounded authority for one user, pair and direction.</td>
                          <td>Write (consensus)</td>
                        </tr>
                        <tr>
                          <td><code className={styles.inlineCode}>validate_liquidity_v2_add</code> / <code className={styles.inlineCode}>_remove</code></td>
                          <td>V2 deposits and withdrawals for the pools app. Confirms the pair (and LP token) is the canonical factory pair, then emits a verdict for that exact operation.</td>
                          <td>Write (consensus)</td>
                        </tr>
                        <tr>
                          <td><code className={styles.inlineCode}>get_validation</code></td>
                          <td>Reads back the verdict a round recorded (a write's return value is not recoverable from its receipt).</td>
                          <td>Read</td>
                        </tr>
                        <tr>
                          <td><code className={styles.inlineCode}>get_config</code> / <code className={styles.inlineCode}>get_stats</code> / <code className={styles.inlineCode}>is_token_approved</code> / <code className={styles.inlineCode}>is_router_approved</code></td>
                          <td>Owner, paired executor, slippage cap and pause state; counters; whitelist lookups.</td>
                          <td>Read</td>
                        </tr>
                        <tr>
                          <td><code className={styles.inlineCode}>set_max_slippage</code> / <code className={styles.inlineCode}>set_paused</code> / <code className={styles.inlineCode}>set_agent_executor</code></td>
                          <td>Administration.</td>
                          <td>Owner only</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p className={styles.p}>
                    There is no V3 liquidity method. It was removed when the deployable build hit GenVM&apos;s per-block pubdata limit; see section 11.
                  </p>
                </div>
              </article>
            )}

            {/* ========================================================== */}
            {/* TOPIC 10: LIQUIDITY VALIDATOR SPECIFICATION */}
            {/* ========================================================== */}
            {activeTopic === 'liquidity-validator' && (
              <article className={styles.article}>
                <div className={styles.contractBadge}>Liquidity</div>
                <h1 className={styles.h1}>11. Liquidity: V2 Validation, V3 on the Pools App</h1>
                <p className={styles.lead}>
                  What the settlement path does and does not do with liquidity, stated against the contracts as deployed.
                </p>

                <div className={styles.subSection}>
                  <h2 className={styles.h2}>The agent surfaces do not handle liquidity</h2>
                  <p className={styles.p}>
                    <code className={styles.inlineCode}>/ai</code> and <code className={styles.inlineCode}>/a2a</code> route and settle swaps only. A request to add or remove liquidity is handed to the pools app before anything is quoted, and no consensus round is opened for it.
                  </p>
                </div>

                <div className={styles.subSection}>
                  <h2 className={styles.h2}>V2: validated on AgentValidator</h2>
                  <p className={styles.p}>
                    V2 deposits and withdrawals are validated by <code className={styles.inlineCode}>validate_liquidity_v2_add</code> and <code className={styles.inlineCode}>validate_liquidity_v2_remove</code> on AgentValidator (<code className={styles.code}>{INTELLIGENT_CONTRACTS.agentValidator}</code>), which confirm the canonical factory pair and emit a verdict for the exact operation. AgentExecutor&apos;s <code className={styles.inlineCode}>executeAddLiquidityV2</code> / <code className={styles.inlineCode}>executeRemoveLiquidityV2</code> consume that verdict, single use.
                  </p>
                </div>

                <div className={styles.subSection}>
                  <h2 className={styles.h2}>V3: not on the settlement path</h2>
                  <ul className={styles.ul}>
                    <li className={styles.li}>AgentValidator has <strong>no V3 liquidity validator</strong>. The V3 methods were removed when the deployable build exceeded GenVM&apos;s per-block pubdata limit.</li>
                    <li className={styles.li}>AgentExecutor still has <code className={styles.inlineCode}>executeAddLiquidityV3</code> / <code className={styles.inlineCode}>executeRemoveLiquidityV3</code> in its deployed bytecode, but they need a verdict only AgentValidator could record, so every call reverts with <code className={styles.inlineCode}>NoConsensusVerdict</code>. They fail closed. Removing them would mean deploying a new executor and re-pointing AgentValidator to it; the IC itself would not change.</li>
                    <li className={styles.li}>The app makes no V3 liquidity call, and <code className={styles.inlineCode}>/api/genlayer-validate</code> refuses a V3 liquidity request before any round, pointing to the pools app.</li>
                    <li className={styles.li}>V3 positions are managed on the pools app, which works with the SoyaraDex V3 position manager (<code className={styles.code}>{CONTRACT_ADDRESSES[4221].v3PositionManager}</code>) directly from your wallet.</li>
                  </ul>
                </div>

                <div className={styles.subSection}>
                  <h2 className={styles.h2}>Retired: LiquidityValidator</h2>
                  <p className={styles.p}>
                    A separate <code className={styles.inlineCode}>LiquidityValidator</code> contract (<code className={styles.code}>{RETIRED_CONTRACTS.liquidityValidator}</code>) was deployed earlier with V2 and V3 checks. AgentExecutor never accepted its answers, so it authorised nothing; the app answered V3 requests with a read simulation against it, which looked like consensus and could never settle. That call is removed and the contract is retired.
                  </p>
                </div>
              </article>
            )}

            {/* ========================================================== */}
            {/* TOPIC 11: AGENT EXECUTOR & SETTLEMENT */}
            {/* ========================================================== */}
            {activeTopic === 'agent-executor' && (
              <article className={styles.article}>
                <div className={styles.contractBadge}>EVM Settlement</div>
                <h1 className={styles.h1}>12. AgentExecutor.sol & Settlement Pipeline</h1>
                <p className={styles.lead}>
                  <code className={styles.inlineCode}>AgentExecutor</code> (<code className={styles.code}>{CONTRACT_ADDRESSES[4221].agentExecutor}</code>) is the only way an agent trade moves funds, and it refuses anything the AgentValidator Intelligent Contract did not authorise.
                </p>

                <div className={styles.subSection}>
                  <h2 className={styles.h2}>Who can authorise, who can relay</h2>
                  <ul className={styles.ul}>
                    <li className={styles.li}><code className={styles.inlineCode}>recordVerdict</code> and <code className={styles.inlineCode}>recordMandate</code> are <code className={styles.inlineCode}>onlyValidator</code>: callable only by the AgentValidator IC, over its ghost contract. The settlement agent and the owner are both refused with <code className={styles.inlineCode}>NotValidator</code>.</li>
                    <li className={styles.li}>The <code className={styles.inlineCode}>execute*</code> functions are <code className={styles.inlineCode}>onlyAgent</code>. The agent relays a trade; it cannot approve one.</li>
                  </ul>
                </div>

                <div className={styles.subSection}>
                  <h2 className={styles.h2}>Two rails, one authority per trade</h2>
                  <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                      <thead>
                        <tr><th>Rail</th><th>Settlement call</th><th>What the executor enforces</th><th>Latency</th></tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td><strong>consensus</strong></td>
                          <td><code className={styles.inlineCode}>executeSwap(order, aggProgram)</code></td>
                          <td>Re-derives the commitment from the whole order (route hash, fee, fee collector, recipient, quote, deadline, nonce, chain, executor) and consumes the matching verdict. Single use; no verdict means <code className={styles.inlineCode}>NoConsensusVerdict</code>.</td>
                          <td>After the appeal window (about 30 min on Bradbury)</td>
                        </tr>
                        <tr>
                          <td><strong>mandate</strong></td>
                          <td><code className={styles.inlineCode}>executeSwapUnderMandate(id, amountIn, minAmountOut, feeBps, aggProgram)</code></td>
                          <td>Checks the trade against a mandate an earlier round issued: user, pair, direction, per-trade ceiling, lifetime budget, fee, collector, router, and the route by hash. Prices it itself from the pinned pool&apos;s live reserves.</td>
                          <td>One transaction, seconds</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p className={styles.p}>
                    The rail is chosen before any round is opened. A trade covered by a live mandate on its best route never gets a verdict of its own, and a trade with its own verdict never falls onto a mandate, so one intent cannot settle twice. The agent surfaces have no third rail: nothing on <code className={styles.inlineCode}>/ai</code> or <code className={styles.inlineCode}>/a2a</code> sends a trade to <code className={styles.inlineCode}>AGGFlowEntrypoint</code> directly.
                  </p>
                </div>

                <div className={styles.subSection}>
                  <h2 className={styles.h2}>Atomic Execution & Rollback Protection</h2>
                  <p className={styles.p}>
                    Once the executor is satisfied, it pulls the input from the user and calls <code className={styles.inlineCode}>AGGFlowEntrypoint.executeSwapWithReceiver</code> (<code className={styles.inlineCode}>{CONTRACT_ADDRESSES[4221].aggregatorEntrypoint}</code>), which runs the route across SoyaraDex V2 and V3 pools in one transaction and pays the output straight to the user. If the output falls below the committed minimum, the whole transaction reverts.
                  </p>
                </div>
              </article>
            )}

            {/* ========================================================== */}
            {/* TOPIC 12: CORE DEX & AGGFLOW ROUTER */}
            {/* ========================================================== */}
            {activeTopic === 'core-dex' && (
              <article className={styles.article}>
                <h1 className={styles.h1}>13. AGGFlow DEX Aggregator & Bytecode VM</h1>
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
                <h1 className={styles.h1}>14. Native GEN & WGEN 1:1 Wrap Mechanics</h1>
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
                <h1 className={styles.h1}>15. Supported Assets & Price Oracles</h1>
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
                <h1 className={styles.h1}>16. Build With @soyaradex/sdk</h1>
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
                <h1 className={styles.h1}>17. JavaScript SDK (genlayer-js & Viem)</h1>
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
                  <h2 className={styles.h2}>Opening a Binding Round with genlayer-js</h2>
                  <p className={styles.p}>
                    <code className={styles.inlineCode}>validate_swap</code> is a consensus <strong>write</strong>: a <code className={styles.inlineCode}>readContract</code> of it is a single-node simulation that authorises nothing. The round needs the full order, and the executor will only settle an order that hashes to the approved commitment - so build the order once and settle exactly that order.
                  </p>
                  <CodeSnippet
                    language="javascript"
                    code={`import { createClient, createAccount, chains } from 'genlayer-js';
import { createPublicClient, http } from 'viem';
import EXECUTOR_ABI from './AgentExecutor.abi.json';

const client = createClient({ chain: chains.testnetBradbury, account: createAccount(process.env.LANE_KEY) });
const AGENT_VALIDATOR = '${INTELLIGENT_CONTRACTS.agentValidator}';
const AGENT_EXECUTOR  = '${CONTRACT_ADDRESSES[4221].agentExecutor}';

// \`order\` and \`aggProgram\` come from the aggregator quote (see section 16:
// quoteBestRouteMultiHop + buildMultiHopProgram), with routeHash = keccak256(aggProgram).
async function openRound(order, aggProgram) {
  const txHash = await client.writeContract({
    address: AGENT_VALIDATOR,
    functionName: 'validate_swap',
    args: [
      order.user, order.tokenIn, order.tokenOut,
      String(order.amountIn), String(order.minAmountOut), String(order.quotedAmountOut),
      Number(order.slippageBps), Number(order.deadline),
      order.router, Number(order.feeBps), order.feeCollector,
      aggProgram, Number(order.nonce),
    ],
    value: 0n,
  });

  // The executor, not your code, derives the identifier it will enforce.
  const evm = createPublicClient({ chain: chains.testnetBradbury, transport: http() });
  const commitment = await evm.readContract({
    address: AGENT_EXECUTOR, abi: EXECUTOR_ABI, functionName: 'getSwapCommitment', args: [order],
  });

  // A write's return value is not in its receipt: read the verdict back.
  await client.waitForTransactionReceipt({ hash: txHash, status: 'ACCEPTED', fullTransaction: true });
  const verdict = await client.readContract({
    address: AGENT_VALIDATOR, functionName: 'get_validation', args: [commitment],
  });
  console.log('approved by consensus:', verdict.approved);

  // The executor honours it only once the round FINALIZES and the verdict
  // arrives: poll isVerdictLive(commitment), then relay executeSwap(order, aggProgram).
  return { txHash, commitment };
}`}
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
                <h1 className={styles.h1}>18. Python SDK &amp; Agent Integration</h1>
                <p className={styles.lead}>
                  Guide for Python developers building autonomous AI agents, algorithmic market makers, and backend trading bots.
                </p>

                <div className={styles.subSection}>
                  <h2 className={styles.h2}>Python Agent Against the App's API</h2>
                  <p className={styles.p}>
                    The Python path goes through the same two routes the app uses: one opens the binding round (or finds a mandate that covers the trade), the other settles through AgentExecutor on the rail consensus chose. Section 7 has the full loop, including waiting out the appeal window.
                  </p>
                  <CodeSnippet
                    language="python"
                    code={`import requests

class SoyaraAgent:
    def __init__(self, base="https://app.soyara.xyz", user="0xYourWallet"):
        self.base, self.user = base, user

    def _post(self, path, body):
        return requests.post(self.base + path, json=body, timeout=60).json()

    def validate(self, token_in, token_out, amount_in, slippage_bps=30):
        # Opens validate_swap on AgentValidator ${INTELLIGENT_CONTRACTS.agentValidator}
        # for the exact order, unless a mandate you already hold covers it.
        return self._post("/api/genlayer-validate", {
            "action": "SWAP", "user": self.user, "tokenIn": token_in,
            "tokenOut": token_out, "amountIn": str(amount_in), "slippageBps": slippage_bps,
        })

    def settle(self, v):
        # Relayed to AgentExecutor ${CONTRACT_ADDRESSES[4221].agentExecutor}; it refuses
        # anything consensus did not authorise. Never sent to the entrypoint directly.
        return self._post("/api/agent-execute", {
            "rail": v["rail"], "mandateId": v.get("mandate_id"),
            "pendingOrder": v["pendingOrder"], "pendingProgram": v["pendingProgram"],
            "validationSubmitted": v.get("validationSubmitted"), "validationTxHash": v.get("tx_hash"),
        })

agent = SoyaraAgent()
v = agent.validate("USDC", "WGEN", 10)
print(v["rail"], v.get("approved"), v.get("pending"), v.get("reason"))`}
                  />
                </div>
              </article>
            )}

            {/* ========================================================== */}
            {/* TOPIC 18: VERIFIED CONTRACT DIRECTORY */}
            {/* ========================================================== */}
            {activeTopic === 'contracts' && (
              <article className={styles.article}>
                <h1 className={styles.h1}>19. Verified Contract Directory & ABIs</h1>
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
                        <td><strong>AgentExecutor</strong></td>
                        <td><code className={styles.inlineCode}>{CONTRACT_ADDRESSES[4221].agentExecutor}</code></td>
                        <td>EVM Settlement Gate (verdicts and mandates from the IC only)</td>
                        <td><a href={`https://explorer-bradbury.genlayer.com/address/${CONTRACT_ADDRESSES[4221].agentExecutor}`} target="_blank" rel="noopener noreferrer" className={styles.link}>Explorer <ExternalLink size={12} /></a></td>
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
                <h1 className={styles.h1}>20. Security Threat Model & Defense Matrix</h1>
                <p className={styles.lead}>
                  Comprehensive technical analysis of DeFi threat vectors and Soyara DEX's multi-layered defense architecture:
                </p>

                <div className={styles.grid2}>
                  <div className={styles.card}>
                    <h3 className={styles.cardTitle}>Threat: Toxic MEV & Sandwich Attacks</h3>
                    <p className={styles.cardDesc}>
                      <strong>Defense:</strong> A 3.00% (300 bps) slippage ceiling enforced twice: by <code className={styles.inlineCode}>AgentValidator.py</code> in consensus, and again on chain by <code className={styles.inlineCode}>AgentExecutor</code> (<code className={styles.inlineCode}>SlippageExceeded</code>). The floor must sit within that band of the validated quote.
                    </p>
                  </div>

                  <div className={styles.card}>
                    <h3 className={styles.cardTitle}>Threat: A Relayer Settles an Unapproved or Altered Trade</h3>
                    <p className={styles.cardDesc}>
                      <strong>Defense:</strong> <code className={styles.inlineCode}>AgentExecutor</code> takes verdicts and mandates only from the AgentValidator IC (<code className={styles.inlineCode}>NotValidator</code> for anyone else, owner included) and re-derives the commitment from the order it settles, so any change lands on an identifier nothing approved (<code className={styles.inlineCode}>NoConsensusVerdict</code>). Verdicts are single use (<code className={styles.inlineCode}>CommitmentAlreadyUsed</code>).
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
                      <strong>Defense:</strong> GenLayer Optimistic Democracy achieves consensus across decentralized validator committees via the Equivalence Principle (<code className={styles.inlineCode}>gl.eq_principle.strict_eq</code>).
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
                <h1 className={styles.h1}>21. The Future of Autonomous Intelligent Finance</h1>
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
