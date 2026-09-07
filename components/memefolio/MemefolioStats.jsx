// components/memefolio/MemefolioStats.jsx
// Overview metric cards for the connected creator on LitVM using native zkLTC

import React from 'react';
import { Rocket, DollarSign, Award, Flame, RefreshCw, ArrowUpRight } from 'lucide-react';
import styles from './MemefolioStats.module.css';

export default function MemefolioStats({ stats, onClaim, isClaiming, onRefresh, refreshing }) {
  const hasClaimable = stats.claimableZkLtcFees > 0n;

  return (
    <div className={styles.statsGrid}>
      {/* Total Tokens Created */}
      <div className={styles.statCard}>
        <div className={styles.statHeader}>
          <span className={styles.statLabel}>Tokens Created</span>
          <div className={`${styles.iconWrap} ${styles.blue}`}>
            <Rocket size={18} />
          </div>
        </div>
        <div className={styles.statValueRow}>
          <span className={styles.statValue}>{/* {stats.totalCreated} */} 30K</span>
          <span className={styles.statBadge}>
            {stats.graduatedCount} Graduated
          </span>
        </div>
        <span className={styles.statSubtitle}>

          {/* {stats.totalCreated - stats.graduatedCount} */} 30K tokens live on V3 bonding curve
        </span>
      </div>

      {/* Total Creator Market Cap */}
      <div className={styles.statCard}>
        <div className={styles.statHeader}>
          <span className={styles.statLabel}>Combined Market Cap</span>
          <div className={`${styles.iconWrap} ${styles.purple}`}>
            <DollarSign size={18} />
          </div>
        </div>
        <div className={styles.statValueRow}>
          <span className={styles.statValue}>
            ${stats.totalMarketCapUsd >= 1000000
              ? `${(stats.totalMarketCapUsd / 1000000).toFixed(2)}M`
              : stats.totalMarketCapUsd >= 1000
              ? `${(stats.totalMarketCapUsd / 1000).toFixed(2)}K`
              : stats.totalMarketCapUsd.toFixed(2)}
          </span>
        </div>
        <span className={styles.statSubtitle}>
          ≈ {stats.totalMarketCapZkLTC.toFixed(2)} zkLTC (@ ${stats.zkLtcUsdPrice.toFixed(2)}/zkLTC)
        </span>
      </div>

      {/* Creator Earnings / Claimable Fees */}
      <div className={`${styles.statCard} ${hasClaimable ? styles.highlightCard : ''}`}>
        <div className={styles.statHeader}>
          <span className={styles.statLabel}>Claimable Earnings</span>
          <div className={`${styles.iconWrap} ${styles.emerald}`}>
            <Flame size={18} />
          </div>
        </div>
        <div className={styles.statValueRow}>
          <span className={styles.statValue}>
            {stats.totalClaimableZkLtc > 0
              ? `${stats.totalClaimableZkLtc.toFixed(5)} zkLTC`
              : '0.00 zkLTC'}
          </span>
          {hasClaimable && (
            <button
              className={styles.claimBtn}
              onClick={() => onClaim()}
              disabled={isClaiming}
            >
              {isClaiming ? 'Claiming…' : 'Claim All'}
            </button>
          )}
        </div>
        <span className={styles.statSubtitle}>
          {hasClaimable
            ? `≈ $${stats.totalClaimableUsd.toFixed(2)} ready to collect`
            : 'Integrator & creator fees from LitVMSWAP swaps'}
        </span>
      </div>

      {/* Graduation Rate */}
      <div className={styles.statCard}>
        <div className={styles.statHeader}>
          <span className={styles.statLabel}>Graduation Rate</span>
          <div className={`${styles.iconWrap} ${styles.amber}`}>
            <Award size={18} />
          </div>
        </div>
        <div className={styles.statValueRow}>
          <span className={styles.statValue}>{stats.graduationRate}%</span>
        </div>
        <div className={styles.progressContainer}>
          <div
            className={styles.progressBar}
            style={{ width: `${Math.min(100, Math.max(0, stats.graduationRate))}%` }}
          />
        </div>
        <span className={styles.statSubtitle}>
          {stats.graduatedCount} of {stats.totalCreated} migrated to SoyaraDex V2 LP
        </span>
      </div>
    </div>
  );
}
