// components/memefolio/CreatedTokenCard.jsx
// Detailed card for an individual meme token deployed by the connected creator on LitVM

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ExternalLink,
  Copy,
  Check,
  TrendingUp,
  Share2,
  Zap,
  Flame,
  ArrowRight,
  ShieldCheck,
  Coins
} from 'lucide-react';
import { extractTokenLogo } from '../doppler/TokenCard';
import styles from './CreatedTokenCard.module.css';

const shortAddr = (addr) => (addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '-');

export default function CreatedTokenCard({ token, onClaimTokenFee, isClaiming }) {
  const [copied, setCopied] = useState(false);
  const [imgError, setImgError] = useState(false);
  const logoSrc = !imgError ? extractTokenLogo(token) : null;

  const handleCopy = (e) => {
    e.stopPropagation();
    if (!token?.address) return;
    navigator.clipboard.writeText(token.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = (e) => {
    e.stopPropagation();
    if (!token) return;
    const text = encodeURIComponent(
      `🚀 Check out my token $${token.symbol} (${token.name}) launched on LitVM via @LitVMSwap Liquidity Engine!\n\nContract: ${token.address}\n\nTrade now: ${typeof window !== 'undefined' ? window.location.origin : ''}/trade/${token.address}`
    );
    window.open(`https://x.com/intent/tweet?text=${text}`, '_blank');
  };

  if (!token) return null;

  return (
    <div className={`${styles.card} ${token.isGraduated ? styles.cardGraduated : ''}`}>
      {/* Top Header */}
      <div className={styles.topRow}>
        <div className={styles.identity}>
          <div className={styles.avatar}>
            <img
              src={token.logoURI || token.imageUrl || '/tlogo.png'}
              alt={token.symbol}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={(e) => {
                e.currentTarget.src = '/tlogo.png';
              }}
            />
          </div>
          <div className={styles.meta}>
            <div className={styles.nameRow}>
              <h3 className={styles.name}>{token.name}</h3>
              <span className={styles.symbol}>${token.symbol}</span>
            </div>
            <div className={styles.addressRow}>
              <span className={styles.address}>{shortAddr(token.address)}</span>
              <button
                className={styles.iconBtn}
                onClick={handleCopy}
                title="Copy contract address"
              >
                {copied ? <Check size={12} className={styles.copiedIcon} /> : <Copy size={12} />}
              </button>
              <a
                href={`https://liteforge.explorer.caldera.xyz/address/${token.address}`}
                target="_blank"
                rel="noreferrer"
                className={styles.iconBtn}
                title="View on Caldera Explorer"
              >
                <ExternalLink size={12} />
              </a>
            </div>
          </div>
        </div>

        {/* Status Badge */}
        <div className={styles.statusBadgeWrap}>
          {token.isGraduated ? (
            <span className={`${styles.badge} ${styles.badgeGraduated}`}>
              🎓 Graduated to V2
            </span>
          ) : (
            <span className={`${styles.badge} ${styles.badgeActive}`}>
              <span className={styles.pulsingDot} /> Live on V3
            </span>
          )}
        </div>
      </div>

      {/* Bonding Curve Progress */}
      <div className={styles.progressSection}>
        <div className={styles.progressHeader}>
          <span className={styles.progressTitle}>Bonding Curve Progress</span>
          <span className={styles.progressValue}>{token.bondingCurveProgress || 0}%</span>
        </div>
        <div className={styles.progressBarBg}>
          <div
            className={`${styles.progressBarFill} ${token.isGraduated ? styles.graduatedFill : ''}`}
            style={{ width: `${Math.min(100, Math.max(0, token.bondingCurveProgress || 0))}%` }}
          />
        </div>
      </div>

      {/* Financial & Valuation Metrics */}
      <div className={styles.metricsGrid}>
        <div className={styles.metricItem}>
          <span className={styles.metricLabel}>Price (zkLTC)</span>
          <span className={styles.metricVal}>
            {token.priceInZkLTC < 0.0000001 ? Number(token.priceInZkLTC || 0).toExponential(2) : Number(token.priceInZkLTC || 0).toFixed(8)}
          </span>
        </div>

        <div className={styles.metricItem}>
          <span className={styles.metricLabel}>Price (USD)</span>
          <span className={styles.metricVal}>
            ${token.priceInUsd < 0.001 ? Number(token.priceInUsd || 0.0000023).toFixed(6) : Number(token.priceInUsd || 0).toFixed(4)}
          </span>
        </div>

        <div className={styles.metricItem}>
          <span className={styles.metricLabel}>Market Cap</span>
          <span className={styles.metricVal}>
            ${token.marketCapUsd >= 1000 ? `${(token.marketCapUsd / 1000).toFixed(1)}K` : Number(token.marketCapUsd || 2348).toFixed(0)}
          </span>
        </div>

        <div className={styles.metricItem}>
          <span className={styles.metricLabel}>Your Balance</span>
          <span className={styles.metricVal}>
            {token.userBalanceFormatted || '0'}
          </span>
        </div>
      </div>

      {/* Card Action Buttons */}
      <div className={styles.actionsRow}>
        <Link
          href={`/trade/${token.address}`}
          className={styles.tradeBtn}
        >
          <Zap size={14} /> Trade ${token.symbol}
        </Link>

        <button
          className={styles.shareBtn}
          onClick={handleShare}
          title="Share on Twitter / X"
        >
          <Share2 size={14} /> Share
        </button>
      </div>
    </div>
  );
}
