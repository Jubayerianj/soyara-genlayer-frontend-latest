import React from 'react';
import styles from '../../pages/PoolPage.module.css';
import { formatBigIntBalance, formatSharePercent } from './PoolUtils';
import V3PositionItem from './V3PositionItem';

const ManageLiquidityPanel = ({
  version,
  pairState,
  selectedPair,
  v3Fee,
  addresses,
  pendingAction,
  handleDecreaseV3Liquidity,
  handleCollectV3Fees,
  withdrawPercent,
  setWithdrawPercent,
  liquidityToBurn,
  lpAllowanceEnough,
  canRemove,
  handleApprove,
  handleRemoveLiquidity,
  isConnected
}) => {
  return (
    <section className={styles.panel}>
      {version === 'v3' ? (
        pairState.v3Positions.length === 0 ? (
          <div className={styles.emptyState}>
            <h3>No V3 Positions</h3>
            <p>You don't have any V3 liquidity NFTs for this pair and fee tier.</p>
          </div>
        ) : (
          <div className={styles.v3PositionsList}>
            {pairState.v3Positions.map((pos) => (
              <V3PositionItem
                key={pos.tokenId.toString()}
                pos={pos}
                selectedPair={selectedPair}
                pairState={pairState}
                v3Fee={v3Fee}
                addresses={addresses}
                pendingAction={pendingAction}
                handleDecreaseV3Liquidity={handleDecreaseV3Liquidity}
                handleCollectV3Fees={handleCollectV3Fees}
              />
            ))}
          </div>
        )
      ) : !pairState.poolExists ? (
        <div className={styles.emptyState}>
          <h3>No pool yet</h3>
          <p>Add the first liquidity for this pair to unlock management tools.</p>
        </div>
      ) : pairState.lpBalance === 0n ? (
        <div className={styles.emptyState}>
          <h3>No LP position found</h3>
          <p>Once you add liquidity for this pair, your position will appear here.</p>
        </div>
      ) : (
        <>
          <div className={styles.positionCard}>
            <div>
              <span>Your pooled {selectedPair.tokenA.symbol}</span>
              <strong>{formatBigIntBalance((pairState.reserveA * pairState.lpBalance) / (pairState.totalSupply || 1n), selectedPair.tokenA.decimals, 6)}</strong>
            </div>
            <div>
              <span>Your pooled {selectedPair.tokenB.symbol}</span>
              <strong>{formatBigIntBalance((pairState.reserveB * pairState.lpBalance) / (pairState.totalSupply || 1n), selectedPair.tokenB.decimals, 6)}</strong>
            </div>
            <div>
              <span>LP share</span>
              <strong>{formatSharePercent(pairState.lpBalance, pairState.totalSupply)}</strong>
            </div>
          </div>

          <div className={styles.withdrawSection}>
            <div className={styles.withdrawHeader}>
              <span>Remove liquidity</span>
              <strong>{withdrawPercent}%</strong>
            </div>
            
            <div className={styles.receivePreview}>
              <label>You will receive (estimated):</label>
              <div className={styles.previewRow}>
                <span>{formatBigIntBalance((pairState.reserveA * liquidityToBurn) / (pairState.totalSupply || 1n), selectedPair.tokenA.decimals, 6)} {selectedPair.tokenA.symbol}</span>
                <span>{formatBigIntBalance((pairState.reserveB * liquidityToBurn) / (pairState.totalSupply || 1n), selectedPair.tokenB.decimals, 6)} {selectedPair.tokenB.symbol}</span>
              </div>
            </div>

            <input
              type="range"
              min="1"
              max="100"
              value={withdrawPercent}
              onChange={(e) => setWithdrawPercent(Number(e.target.value))}
              className={styles.slider}
            />
            <div className={styles.chipRow}>
              {[25, 50, 75, 100].map((percent) => (
                <button
                  key={percent}
                  type="button"
                  className={withdrawPercent === percent ? styles.percentChipActive : styles.percentChip}
                  onClick={() => setWithdrawPercent(percent)}
                >
                  {percent}%
                </button>
              ))}
            </div>
          </div>

          {!lpAllowanceEnough && (
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => handleApprove(pairState.pairAddress, 'LP token', pairState.lpBalance)}
              disabled={!!pendingAction}
            >
              Approve LP token
            </button>
          )}

          <button
            type="button"
            className={styles.primaryButton}
            onClick={handleRemoveLiquidity}
            disabled={!isConnected || !!pendingAction || !lpAllowanceEnough || !canRemove}
          >
            Remove liquidity
          </button>
        </>
      )}
    </section>
  );
};

export default ManageLiquidityPanel;
