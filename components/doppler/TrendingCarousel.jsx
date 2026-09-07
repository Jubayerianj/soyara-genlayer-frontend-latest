// components/doppler/TrendingCarousel.jsx
// Continuous right-to-left scrolling carousel for the Top 10 Trending Tokens
// Infinite marquee loop with pause-on-hover, accurate individual token pricing, and 1-click trade routing.

import React, { useMemo } from 'react';
import Link from 'next/link';
import { Flame } from 'lucide-react';
import { extractTokenLogo } from './TokenCard';
import styles from './TrendingCarousel.module.css';

const formatCarouselPrice = (priceUSD) => {
  const num = Number(priceUSD || 0);
  if (num === 0) return '$0.00';
  if (num >= 1000) return `$${num.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  if (num >= 1) return `$${num.toFixed(2)}`;
  if (num >= 0.001) return `$${num.toFixed(4)}`;
  if (num < 0.000001) return `$${num.toFixed(10)}`;
  return `$${num.toFixed(7)}`;
};

export default function TrendingCarousel({ tokens = [] }) {
  // Extract top 10 trending tokens
  const top10Trending = useMemo(() => {
    if (!tokens || tokens.length === 0) return [];
    
    // Sort by momentum: bonding curve progress + volume + swap activity
    const sorted = [...tokens].sort((a, b) => {
      const scoreA = (a.bondingCurveProgress || 0) * 1.5 + (a.totalVolumeUSD || 0) * 0.05 + (a.swapCount || 0) * 5;
      const scoreB = (b.bondingCurveProgress || 0) * 1.5 + (b.totalVolumeUSD || 0) * 0.05 + (b.swapCount || 0) * 5;
      return scoreB - scoreA;
    });

    return sorted.slice(0, 10);
  }, [tokens]);

  if (top10Trending.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.badgeLabel}>
          <Flame size={14} className={styles.flameIcon} />
          <span>TOP 10 TRENDING</span>
        </div>
        <div className={styles.marqueeWindow}>
          <div className={styles.marqueeTrack}>
            {[1, 2, 3, 4, 5, 6].map((idx) => (
              <div key={`skel-marquee-${idx}`} className={styles.tokenCard} style={{ pointerEvents: 'none', opacity: 0.65 }}>
                <div className={styles.cardRank}>#{idx}</div>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  <div style={{ width: '55px', height: '12px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px' }} />
                  <div style={{ width: '42px', height: '10px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Duplicate for seamless infinite CSS loop
  const marqueeItems = [...top10Trending, ...top10Trending];

  return (
    <div className={styles.container}>
      <div className={styles.badgeLabel}>
        <Flame size={14} className={styles.flameIcon} />
        <span>TOP 10 TRENDING</span>
      </div>

      <div className={styles.marqueeWindow}>
        <div className={styles.marqueeTrack}>
          {marqueeItems.map((token, index) => {
            const logoSrc = extractTokenLogo(token) || token.logoURI || token.imageUrl || '/tlogo.png';
            const progress = token.isGraduated ? 100 : (token.bondingCurveProgress || 0);

            return (
              <Link
                key={`${token.address}-${index}`}
                href={`/trade/${token.address}`}
                className={styles.tokenCard}
              >
                <div className={styles.cardRank}>#{(index % 10) + 1}</div>

                <div className={styles.tokenAvatar}>
                  <img
                    src={logoSrc}
                    alt={token.symbol}
                    className={styles.tokenImg}
                    onError={(e) => {
                      e.currentTarget.src = '/tlogo.png';
                    }}
                  />
                </div>

                <div className={styles.tokenMeta}>
                  <div className={styles.topRow}>
                    <span className={styles.tokenSymbol}>${token.symbol}</span>
                    <span className={styles.tokenName}>{token.name}</span>
                  </div>

                  <div className={styles.bottomRow}>
                    <span className={styles.price}>
                      {formatCarouselPrice(token.priceUSD)}
                    </span>
                    <span className={`${styles.progressBadge} ${token.isGraduated ? styles.graduatedBadge : ''}`}>
                      {token.isGraduated ? 'Graduated' : `${progress}%`}
                    </span>
                  </div>
                </div>

                <div className={styles.miniProgressBarBg}>
                  <div
                    className={`${styles.miniProgressBarFill} ${token.isGraduated ? styles.graduatedFill : ''}`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
