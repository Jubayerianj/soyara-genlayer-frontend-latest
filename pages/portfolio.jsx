import { useMemo, useState } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import { motion } from 'framer-motion';
import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import {
  ArrowUpRight,
  Loader2,
  RefreshCw,
  WalletCards,
  Copy,
  Check,
  Zap,
  Droplets,
  TrendingUp,
  Coins
} from 'lucide-react';
import { formatUnits } from 'viem';
import { useTokens } from '../hooks/common/useTokens';
import { GenLayer } from '../wagmi.config';
import styles from './PortfolioDashboard.module.css';

const formatBalance = (balance, decimals = 18, maxDecimals = 6) => {
  if (!balance || balance === 0n) return '0';
  try {
    const formatted = formatUnits(balance, decimals);
    const num = parseFloat(formatted);
    if (!Number.isFinite(num) || num <= 0) return '0';
    if (num < 0.000001) return num.toExponential(4);
    return num.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: maxDecimals,
      useGrouping: true,
    });
  } catch {
    return '0';
  }
};

const compactNumber = (value, digits = 2) => {
  const numeric = typeof value === 'string' ? parseFloat(value) : Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return '0';
  if (numeric >= 1000000000) return `${(numeric / 1000000000).toFixed(2)}B`;
  if (numeric >= 1000000) return `${(numeric / 1000000).toFixed(2)}M`;
  if (numeric >= 1000) return `${(numeric / 1000).toFixed(2)}K`;
  if (numeric >= 1) return numeric.toFixed(digits);
  if (numeric >= 0.0001) return numeric.toFixed(6);
  return numeric.toExponential(2);
};

const getTokenInitial = (token) => token?.symbol?.charAt(0) || 'T';

export default function Portfolio() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { tokens, balances, loading, error, refreshBalances } = useTokens();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);

  const isCorrectNetwork = !chainId || chainId === GenLayer.id;

  const hydratedTokens = useMemo(() => {
    return tokens
      .map((token) => {
        const rawBalance = balances[token.address.toLowerCase()] || 0n;
        const balanceFormatted = formatBalance(rawBalance, token.decimals);
        const numericBalance = parseFloat(formatUnits(rawBalance || 0n, token.decimals || 18)) || 0;

        return {
          ...token,
          rawBalance,
          numericBalance,
          balanceFormatted,
        };
      })
      .filter((token) => token.rawBalance && token.rawBalance !== 0n)
      .sort((a, b) => b.numericBalance - a.numericBalance);
  }, [tokens, balances]);

  const totalAssetsCount = hydratedTokens.length;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshBalances?.();
    setIsRefreshing(false);
  };

  const handleCopy = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className={styles.page}>
      <Head>
        <title>Portfolio | Soyara DEX</title>
        <meta name="description" content="View and manage your Soyara DEX token assets and liquidity balances." />
      </Head>

      <div className={styles.ambientA} />
      <div className={styles.ambientB} />

      {!isCorrectNetwork && chainId && (
        <div className={styles.networkWarning}>
          <span>Unsupported Network. Please switch to GenLayer Testnet.</span>
          <div className={styles.networkActions}>
            <button type="button" onClick={() => switchChain({ chainId: GenLayer.id })}>
              Switch to GenLayer
            </button>
          </div>
        </div>
      )}

      <main className={styles.main}>
        {/* Header Overview */}
        <section className={styles.dashboardHeader}>
          <div>
            <span className={styles.welcomeKicker}>GenLayer Testnet</span>
            <h1 className={styles.pageTitle}>Portfolio</h1>
          </div>
          
          <div className={styles.headerRight}>
            <button
              type="button"
              className={styles.classyButton}
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              {isRefreshing ? <Loader2 size={15} className={styles.spin} /> : <RefreshCw size={15} />}
              <span>Sync</span>
            </button>
            <Link href="/swap" className={styles.accentLinkButton}>
              <span>Swap</span>
              <ArrowUpRight size={14} />
            </Link>
          </div>
        </section>

        {/* Overview Cards Grid */}
        <section className={styles.glassCardsGrid}>
          {/* Card 1: Total Assets */}
          <article className={styles.glassCard}>
            <span className={styles.cardLabel}>Active Tokens</span>
            <h2 className={styles.cardBigNumber}>
              {isConnected ? `${totalAssetsCount} Assets` : '--'}
            </h2>
            <div className={styles.cardFooter}>
              <span>Tokens held with positive balance</span>
            </div>
          </article>

          {/* Card 2: Quick Swap Link */}
          <Link href="/swap" className={`${styles.glassCard} ${styles.interactiveCard}`}>
            <div className={styles.interactiveCardHeader}>
              <span className={styles.cardLabel} style={{ color: '#38bdf8' }}>Instant Trade</span>
              <ArrowUpRight size={16} className={styles.cardArrow} />
            </div>
            <h2 className={styles.cardBigNumber} style={{ color: '#38bdf8' }}>
              Swap Tokens
            </h2>
            <div className={styles.cardFooter}>
              <span>Fast execution with smart routing →</span>
            </div>
          </Link>

          {/* Card 3: Pools Link */}
          <Link href="/pools" className={`${styles.glassCard} ${styles.interactiveCard}`}>
            <div className={styles.interactiveCardHeader}>
              <span className={styles.cardLabel} style={{ color: '#60a5fa' }}>Liquidity Provision</span>
              <ArrowUpRight size={16} className={styles.cardArrow} />
            </div>
            <h2 className={styles.cardBigNumber} style={{ color: '#60a5fa' }}>
              Pools & Positions
            </h2>
            <div className={styles.cardFooter}>
              <span>Provide liquidity to earn trading fees →</span>
            </div>
          </Link>
        </section>

        {/* Token Inventory Table */}
        <section className={styles.tableSection}>
          <div className={styles.sectionHeader}>
            <h2>Token Holdings</h2>
            <div className={styles.heroMetadataRow} style={{ margin: 0 }}>
              {address && (
                <div className={styles.metaBadge} onClick={handleCopy} title="Copy wallet address">
                  <WalletCards size={13} />
                  <span>{address.slice(0, 6)}...{address.slice(-4)}</span>
                  {copied ? <Check size={11} className={styles.greenText} /> : <Copy size={11} />}
                </div>
              )}
            </div>
          </div>

          {!isConnected ? (
            <div className={styles.emptyContainer}>
              <div className={styles.emptyIndicator}>🔌</div>
              <h3>Wallet disconnected</h3>
              <p>Connect your Web3 wallet to inspect your GenLayer balances and positions.</p>
            </div>
          ) : loading ? (
            <div className={styles.loadingContainer}>
              <Loader2 className={styles.spinLarge} size={28} />
              <p>Fetching wallet inventory...</p>
            </div>
          ) : error ? (
            <div className={styles.errorContainer}>
              <p>{error}</p>
              <button type="button" onClick={handleRefresh} className={styles.classyButton}>Retry</button>
            </div>
          ) : hydratedTokens.length === 0 ? (
            <div className={styles.emptyContainer}>
              <div className={styles.emptyIndicator}>🪙</div>
              <h3>No tokens found</h3>
              <p>You don't hold any supported assets in this wallet yet.</p>
              <Link href="/swap" className={styles.actionBtnFilled}>Go Swap</Link>
            </div>
          ) : (
            <div className={styles.tableContainer}>
              <table className={styles.portfolioTable}>
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th>Balance</th>
                    <th className={styles.textRight}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {hydratedTokens.map((token) => (
                    <tr key={token.address} className={styles.tableRow}>
                      <td>
                        <div className={styles.assetCell}>
                          {token.logoURI ? (
                            <img src={token.logoURI} alt={token.symbol} className={styles.assetLogo} />
                          ) : (
                            <div className={styles.assetLogoFallback}>{getTokenInitial(token)}</div>
                          )}
                          <div className={styles.assetNameMeta}>
                            <span className={styles.assetSymbol}>{token.symbol}</span>
                            <span className={styles.assetFullName}>{token.name}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={styles.assetBalance}>{token.balanceFormatted}</span>
                      </td>
                      <td className={styles.textRight}>
                        <Link href="/swap" className={styles.accentLinkButton} style={{ display: 'inline-flex', padding: '0.4rem 0.8rem', fontSize: '0.78rem' }}>
                          <span>Trade</span>
                          <ArrowUpRight size={12} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
