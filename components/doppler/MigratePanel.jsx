// components/doppler/MigratePanel.jsx
// Panel for manually triggering a Doppler token graduation / V2 migration

import { useState, useEffect } from 'react';
import { useDoppler } from '../../hooks/useDoppler';
import styles from './MigratePanel.module.css';

export default function MigratePanel({ prefilledAsset = '' }) {
  const { migrateToken, getAssetData, isLoading, txHash, error, deployed } = useDoppler();
  const [asset, setAsset] = useState(prefilledAsset);
  const [assetData, setAssetData] = useState(null);
  const [checking, setChecking] = useState(false);
  const [localError, setLocalError] = useState('');

  useEffect(() => { setAsset(prefilledAsset); }, [prefilledAsset]);

  const checkAsset = async () => {
    if (!asset.match(/^0x[0-9a-fA-F]{40}$/)) {
      return setLocalError('Enter a valid contract address (0x…)');
    }
    setLocalError('');
    setChecking(true);
    setAssetData(null);
    const data = await getAssetData(asset);
    setChecking(false);
    if (!data) return setLocalError('Asset not found in Liquidity Engine - it may not have been launched via LitVMSWAP.');
    setAssetData(data);
  };

  const handleMigrate = async () => {
    setLocalError('');
    try {
      await migrateToken(asset);
    } catch (err) {
      setLocalError(err.message);
    }
  };

  const shortAddr = (a) => a && a !== '0x0000000000000000000000000000000000000000' ? `${a.slice(0,8)}…${a.slice(-6)}` : '-';

  return (
    <div className={styles.panel}>
      <p className={styles.description}>
        After a bonding curve fills completely, anyone can trigger the graduation.
        This calls <code>Airlock.migrate(asset)</code> which moves liquidity to the configured migrator
        (SoyaraDex V2 on LitvmSwap).
      </p>

      {/* Address input */}
      <div className={styles.inputRow}>
        <input
          className={styles.input}
          placeholder="Token address (0x…)"
          value={asset}
          onChange={(e) => { setAsset(e.target.value); setAssetData(null); }}
        />
        <button className={styles.checkBtn} onClick={checkAsset} disabled={checking || !deployed}>
          {checking ? '…' : 'Check'}
        </button>
      </div>

      {/* Asset Info */}
      {assetData && (
        <div className={styles.infoBox}>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Numeraire</span>
            <span className={styles.infoValue}>{shortAddr(assetData.numeraire)}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Initializer</span>
            <span className={styles.infoValue}>{shortAddr(assetData.initializer)}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Migrator</span>
            <span className={styles.infoValue}>{shortAddr(assetData.migrator)}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Status</span>
            <span className={assetData.liquidityMigrated ? styles.green : styles.blue}>
              {assetData.liquidityMigrated ? '✓ Already migrated' : '⏳ Bonding curve active'}
            </span>
          </div>
        </div>
      )}

      {/* Errors */}
      {(localError || error) && (
        <div className={styles.error}>⚠ {localError || error}</div>
      )}

      {/* Success */}
      {txHash && (
        <div className={styles.success}>
          ✅ Migration triggered!{' '}
          <a
            href={`https://liteforge.explorer.caldera.xyz/tx/${txHash}`}
            target="_blank"
            rel="noreferrer"
          >
            View tx ↗
          </a>
        </div>
      )}

      {/* Migrate button */}
      <button
        className={styles.migrateBtn}
        onClick={handleMigrate}
        disabled={!assetData || assetData.liquidityMigrated || isLoading || !deployed}
      >
        {isLoading
          ? 'Migrating…'
          : assetData?.liquidityMigrated
          ? 'Already Migrated'
          : 'Graduate → Migrate Liquidity'}
      </button>

      {!assetData?.liquidityMigrated && assetData && (
        <p className={styles.warning}>
          ⚠ Migration can only succeed after the bonding curve is fully filled. If the curve is still active, this transaction will revert.
        </p>
      )}
    </div>
  );
}
