// components/memefolio/MemeHoldingsTable.jsx
// Displays all Doppler meme tokens held in the connected user's wallet in native zkLTC & USD

import React from 'react';
import Link from 'next/link';
import { ExternalLink, Zap, ArrowUpRight } from 'lucide-react';
import styles from './MemeHoldingsTable.module.css';

const shortAddr = (addr) => (addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '-');

export default function MemeHoldingsTable({ holdings }) {
  if (!holdings || holdings.length === 0) {
    return (
      <div className={styles.emptyCard}>
        <div className={styles.emptyIcon}>🪙</div>
        <h3>No Meme Holdings Found</h3>
        <p>You don't hold any meme tokens in your wallet yet.</p>
        <div className={styles.emptyActions}>
          <Link href="/explore" className={styles.exploreBtn}>
            Explore Trending Memes ↗
          </Link>
          <Link href="/launch" className={styles.launchBtn}>
            Launch Your Token 🚀
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.tableCard}>
      <div className={styles.tableHeader}>
        <div>
          <h3 className={styles.tableTitle}>Meme Token Holdings</h3>
          <p className={styles.tableSubtitle}>
            All tokens present in your connected wallet on LitVM
          </p>
        </div>
        <span className={styles.badgeCount}>{holdings.length} Token{holdings.length !== 1 ? 's' : ''}</span>
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Asset</th>
              <th>Balance</th>
              <th>Price</th>
              <th>Value (USD)</th>
              <th>Bonding Curve</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((token) => {
              const balNum = Number(token.userBalanceFormatted.replace(/,/g, '')) || 0;
              const valueUsd = balNum * token.priceInUsd;

              return (
                <tr key={token.address}>
                  <td>
                    <div className={styles.tokenCol}>
                      <div className={styles.tokenAvatar}>
                        <img
                          src={token.logoURI || token.imageUrl || '/tlogo.png'}
                          alt={token.symbol}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          onError={(e) => {
                            e.currentTarget.src = '/tlogo.png';
                          }}
                        />
                      </div>
                      <div className={styles.tokenMeta}>
                        <strong className={styles.tokenName}>{token.name}</strong>
                        <div className={styles.tokenSymbolRow}>
                          <span className={styles.tokenSymbol}>${token.symbol}</span>
                          <a
                            href={`https://liteforge.explorer.caldera.xyz/address/${token.address}`}
                            target="_blank"
                            rel="noreferrer"
                            className={styles.explorerLink}
                            title="View on Explorer"
                          >
                            <ExternalLink size={11} />
                          </a>
                        </div>
                      </div>
                    </div>
                  </td>

                  <td>
                    <div className={styles.balanceCol}>
                      <strong>{token.userBalanceFormatted}</strong>
                      <span className={styles.sharePct}>{token.creatorSharePct}% of supply</span>
                    </div>
                  </td>

                  <td>
                    <div className={styles.priceCol}>
                      <span>{token.priceInZkLTC < 0.0000001 ? token.priceInZkLTC.toExponential(2) : token.priceInZkLTC.toFixed(8)} zkLTC</span>
                      <small>≈ ${token.priceInUsd < 0.001 ? token.priceInUsd.toFixed(6) : token.priceInUsd.toFixed(4)}</small>
                    </div>
                  </td>

                  <td>
                    <strong className={styles.valueUsd}>
                      ${valueUsd >= 1000 ? valueUsd.toLocaleString('en-US', { maximumFractionDigits: 2 }) : valueUsd.toFixed(2)}
                    </strong>
                  </td>

                  <td>
                    <div className={styles.progressCol}>
                      <span>{token.isGraduated ? 'Graduated (100%)' : `${token.bondingCurveProgress}%`}</span>
                      <div className={styles.miniBarBg}>
                        <div
                          className={`${styles.miniBarFill} ${token.isGraduated ? styles.graduatedFill : ''}`}
                          style={{ width: `${token.bondingCurveProgress}%` }}
                        />
                      </div>
                    </div>
                  </td>

                  <td>
                    <div className={styles.actionCol}>
                      <Link href={`/trade/${token.address}`} className={styles.tradeBtn}>
                        <Zap size={12} /> Trade
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
