import React from 'react';
import styles from '../../pages/PoolPage.module.css';
import { compactNumber, formatBigIntBalance } from './PoolUtils';
import { formatUnits } from 'viem';

const V3PositionItem = ({
  pos,
  selectedPair,
  pairState,
  v3Fee,
  addresses,
  pendingAction,
  handleDecreaseV3Liquidity,
  handleCollectV3Fees
}) => {
  const principalA = pos.amountA || 0n;
  const principalB = pos.amountB || 0n;

  const feesA = pos.collectableA ?? (pos.isA0 ? pos.tokensOwed0 : pos.tokensOwed1);
  const feesB = pos.collectableB ?? (pos.isA0 ? pos.tokensOwed1 : pos.tokensOwed0);
  const hasCollectable = feesA > 0n || feesB > 0n;
  const inRange = pairState.v3CurrentTick >= Number(pos.tickLower) && pairState.v3CurrentTick < Number(pos.tickUpper);

  return (
    <div key={pos.tokenId.toString()} className={styles.v3PositionItem}>
      <div className={styles.v3PositionHeader}>
        <span className={styles.v3PositionId}>NFT #{pos.tokenId.toString()}</span>
        <span className={styles.v3PositionRange}>{inRange ? 'In range' : 'Out of range'}</span>
      </div>
      
      <div className={styles.positionValues}>
        <div className={styles.valueGroup}>
          <label>Principal Tokens (Current Value)</label>
          <div className={styles.valueRow}>
            <span>{selectedPair.tokenA.symbol}: {formatBigIntBalance(principalA, selectedPair.tokenA.decimals, 4)}</span>
            <span>{selectedPair.tokenB.symbol}: {formatBigIntBalance(principalB, selectedPair.tokenB.decimals, 4)}</span>
          </div>
        </div>
        
        <div className={styles.valueGroup}>
          <label>Uncollected Fees & Tokens</label>
          <div className={styles.valueRow}>
            <span className={styles.earnedText}>{selectedPair.tokenA.symbol}: {formatBigIntBalance(feesA, selectedPair.tokenA.decimals, 6)}</span>
            <span className={styles.earnedText}>{selectedPair.tokenB.symbol}: {formatBigIntBalance(feesB, selectedPair.tokenB.decimals, 6)}</span>
          </div>
        </div>
      </div>

      <div className={styles.v3PositionStats}>
        <div className={styles.v3Stat}>
          <label>Liquidity</label>
          <strong>{compactNumber(formatUnits(pos.liquidity, 18))}</strong>
        </div>
        <div className={styles.v3Stat}>
          <label>Fee Tier</label>
          <strong>{(v3Fee / 10000).toFixed(2)}%</strong>
        </div>
      </div>
      <div className={styles.actionStack}>
        {pos.liquidity > 0n && (
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => handleDecreaseV3Liquidity(pos)}
            disabled={!!pendingAction}
          >
            Remove Liquidity
          </button>
        )}
        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => handleCollectV3Fees(pos)}
          disabled={!!pendingAction || !hasCollectable}
        >
          Collect Fees & Tokens
        </button>
        <button
          type="button"
          className={styles.textButton}
          onClick={() => {
            window.open(`https://liteforge.explorer.caldera.xyz/address/${addresses.v3PositionManager}`, '_blank');
          }}
        >
          View on Explorer
        </button>
      </div>
    </div>
  );
};

export default V3PositionItem;
