// components/memefolio/EmptyMemefolio.jsx
// Interactive empty state for creators who haven't deployed tokens yet

import React from 'react';
import Link from 'next/link';
import { Rocket, Sparkles, ShieldCheck, Zap, ArrowRight, Flame } from 'lucide-react';
import styles from './EmptyMemefolio.module.css';

export default function EmptyMemefolio() {
  return (
    <div className={styles.emptyContainer}>
      <div className={styles.heroBox}>
        <div className={styles.iconCircle}>
          <Rocket size={32} />
        </div>
        <h2 className={styles.title}>No Created Tokens Yet</h2>
        <p className={styles.description}>
          You haven't launched any tokens on LitVM yet. Deploy your meme coin in under 60 seconds with LitVMSWAP Liquidity Engine.
        </p>

        <Link href="/launch" className={styles.launchCta}>
          <Rocket size={18} /> Launch Your Token Now
        </Link>
      </div>

      {/* Feature Highlights */}
      <div className={styles.featuresGrid}>
        <div className={styles.featureCard}>
          <div className={`${styles.featureIcon} ${styles.blue}`}>
            <Zap size={20} />
          </div>
          <h3>SoyaraDex V3 Fair Launch</h3>
          <p>
            Zero initial capital required to bootstrap liquidity. Single-sided token deposit on LitVM V3.
          </p>
        </div>

        <div className={styles.featureCard}>
          <div className={`${styles.featureIcon} ${styles.emerald}`}>
            <Flame size={20} />
          </div>
          <h3>Earn Swap Fees</h3>
          <p>
            Collect up to 0.25%+ integrator and creator fees directly from every swap along your bonding curve.
          </p>
        </div>

        <div className={styles.featureCard}>
          <div className={`${styles.featureIcon} ${styles.purple}`}>
            <ShieldCheck size={20} />
          </div>
          <h3>Automatic V2 Graduation</h3>
          <p>
            When the bonding curve fills, liquidity automatically migrates to a SoyaraDex V2 pair with LP locked.
          </p>
        </div>
      </div>
    </div>
  );
}
