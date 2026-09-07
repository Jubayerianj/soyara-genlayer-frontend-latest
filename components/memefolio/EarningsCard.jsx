// components/memefolio/EarningsCard.jsx
// Detailed breakdown of creator/integrator fees with claim functionality in native zkLTC

import React from 'react';
import { Flame, ShieldCheck, CheckCircle2, ArrowUpRight, Coins, AlertCircle } from 'lucide-react';
import styles from './EarningsCard.module.css';

export default function EarningsCard({
  stats,
  createdTokens,
  onClaim,
  isClaiming,
  claimSuccessTx,
}) {
  const hasClaimable = stats.claimableZkLtcFees > 0n;

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.titleGroup}>
            <div className={styles.flameIcon}>
              <Flame size={24} />
            </div>
            <div>
              <h2 className={styles.title}>Creator Earnings & Integrator Protocol Fees</h2>
              <p className={styles.subtitle}>
                Earn revenue from swap volume generated across your launched meme tokens on LitVM
              </p>
            </div>
          </div>

          <div className={styles.claimActionGroup}>
            <div className={styles.claimValueBox}>
              <span className={styles.claimLabel}>Total Claimable</span>
              <span className={styles.claimValue}>
                {stats.totalClaimableZkLtc > 0
                  ? `${stats.totalClaimableZkLtc.toFixed(5)} zkLTC`
                  : '0.00 zkLTC'}
              </span>
              <span className={styles.claimSub}>
                ≈ ${stats.totalClaimableUsd.toFixed(2)} USD
              </span>
            </div>

            <button
              className={styles.claimPrimaryBtn}
              onClick={() => onClaim()}
              disabled={!hasClaimable || isClaiming}
            >
              {isClaiming ? 'Claiming…' : hasClaimable ? '⚡ Claim All Earnings' : 'No Fees to Claim'}
            </button>
          </div>
        </div>

        {/* Claim Success Notification */}
        {claimSuccessTx && (
          <div className={styles.successBanner}>
            <CheckCircle2 size={18} className={styles.successIcon} />
            <div>
              <strong>Earnings claimed successfully!</strong>
              <p>
                Transaction:{' '}
                <a
                  href={`https://liteforge.explorer.caldera.xyz/tx/${claimSuccessTx}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {claimSuccessTx.slice(0, 18)}…
                </a>
              </p>
            </div>
          </div>
        )}

        {/* How earnings work info grid */}
        <div className={styles.infoGrid}>
          <div className={styles.infoBox}>
            <div className={styles.infoIconWrap}>
              <Coins size={16} />
            </div>
            <h4>Trading Fee Cuts</h4>
            <p>
              When traders buy & sell your token along the SoyaraDex V3 bonding curve, protocol & integrator fees accumulate automatically in zkLTC inside the Airlock contract.
            </p>
          </div>

          <div className={styles.infoBox}>
            <div className={styles.infoIconWrap}>
              <ShieldCheck size={16} />
            </div>
            <h4>Non-Custodial & Verified</h4>
            <p>
              Fees are secured directly in the on-chain Airlock escrow and can only be withdrawn to the verified deployer/integrator wallet address.
            </p>
          </div>

          <div className={styles.infoBox}>
            <div className={styles.infoIconWrap}>
              <ArrowUpRight size={16} />
            </div>
            <h4>Post-Graduation Liquidity</h4>
            <p>
              After reaching graduation target, liquidity transitions into the SoyaraDex V2 pair with LP locked, generating ongoing liquidity stability.
            </p>
          </div>
        </div>

        {/* Per-token breakdown */}
        <div className={styles.breakdownSection}>
          <h3 className={styles.breakdownTitle}>Earnings Breakdown by Token</h3>
          {createdTokens.length === 0 ? (
            <div className={styles.emptyBreakdown}>
              No created tokens yet. Launch your first token to start earning trading fees!
            </div>
          ) : (
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Token</th>
                    <th>Status</th>
                    <th>Bonding Curve Progress</th>
                    <th>Token Balance</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {createdTokens.map((t) => (
                    <tr key={t.address}>
                      <td>
                        <div className={styles.tableToken}>
                          <strong>{t.name}</strong>
                          <span>${t.symbol}</span>
                        </div>
                      </td>
                      <td>
                        <span className={`${styles.tableBadge} ${t.isGraduated ? styles.greenBadge : styles.blueBadge}`}>
                          {t.isGraduated ? 'Graduated to V2' : 'Active on V3'}
                        </span>
                      </td>
                      <td>
                        <div className={styles.tableProgress}>
                          <span>{t.bondingCurveProgress}%</span>
                          <div className={styles.tableProgressBar}>
                            <div
                              className={styles.tableProgressFill}
                              style={{ width: `${t.bondingCurveProgress}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td>
                        <strong>{t.userBalanceFormatted}</strong>
                      </td>
                      <td>
                        <a href={`/trade/${t.address}`} className={styles.tableTradeBtn}>
                          Trade
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
