import React from 'react';
import styles from '../../pages/PoolPage.module.css';
import { compactNumber, formatBigIntBalance } from './PoolUtils';

const AddLiquidityPanel = ({
  selectedPair,
  pairState,
  amountA,
  amountB,
  handleAmountAChange,
  handleAmountBChange,
  reserveRatio,
  syncFromA,
  syncFromB,
  allowanceEnoughA,
  allowanceEnoughB,
  parsedAmountA,
  parsedAmountB,
  pendingAction,
  handleApprove,
  handleAddLiquidity,
  isConnected
}) => {
  const needApproveA = !allowanceEnoughA && !selectedPair.tokenA.isNative && parsedAmountA > 0n;
  const needApproveB = !allowanceEnoughB && !selectedPair.tokenB.isNative && parsedAmountB > 0n;

  return (
    <section className={styles.panel}>
      <div className={styles.inputGrid}>
        {/* Token A Input */}
        <div className={styles.inputCard}>
          <div className={styles.inputTop}>
            <span>{selectedPair.tokenA.symbol}</span>
            <button
              type="button"
              onClick={() => handleAmountAChange(formatBigIntBalance(pairState.balanceA, selectedPair.tokenA.decimals, 6))}
            >
              Balance {compactNumber(formatBigIntBalance(pairState.balanceA, selectedPair.tokenA.decimals, 6))}
            </button>
          </div>
          <input
            value={amountA}
            onChange={(e) => handleAmountAChange(e.target.value)}
            placeholder="0.0"
            inputMode="decimal"
          />
        </div>

        {/* Dynamic Plus Divider */}
        <div className={styles.plusDivider}>
          <span>+</span>
        </div>

        {/* Token B Input */}
        <div className={styles.inputCard}>
          <div className={styles.inputTop}>
            <span>{selectedPair.tokenB.symbol}</span>
            <button
              type="button"
              onClick={() => handleAmountBChange(formatBigIntBalance(pairState.balanceB, selectedPair.tokenB.decimals, 6))}
            >
              Balance {compactNumber(formatBigIntBalance(pairState.balanceB, selectedPair.tokenB.decimals, 6))}
            </button>
          </div>
          <input
            value={amountB}
            onChange={(e) => handleAmountBChange(e.target.value)}
            placeholder="0.0"
            inputMode="decimal"
          />
        </div>
      </div>

      {reserveRatio && (
        <div className={styles.helperRow}>
          <button type="button" className={styles.helperButton} onClick={syncFromA}>
            Match {selectedPair.tokenB.symbol}
          </button>
          <button type="button" className={styles.helperButton} onClick={syncFromB}>
            Match {selectedPair.tokenA.symbol}
          </button>
        </div>
      )}

      <div className={styles.actionStack}>
        {!isConnected ? (
          <button
            type="button"
            className={styles.primaryButton}
            disabled
          >
            Connect Wallet
          </button>
        ) : needApproveA ? (
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => handleApprove(selectedPair.tokenA.address, selectedPair.tokenA.symbol, parsedAmountA)}
            disabled={!!pendingAction}
          >
            {pendingAction ? 'Approving...' : `Approve ${selectedPair.tokenA.symbol}`}
          </button>
        ) : needApproveB ? (
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => handleApprove(selectedPair.tokenB.address, selectedPair.tokenB.symbol, parsedAmountB)}
            disabled={!!pendingAction}
          >
            {pendingAction ? 'Approving...' : `Approve ${selectedPair.tokenB.symbol}`}
          </button>
        ) : (
          <button
            type="button"
            className={styles.primaryButton}
            onClick={handleAddLiquidity}
            disabled={!!pendingAction}
          >
            {pairState.poolExists ? 'Add Liquidity' : 'Create Pool & Add'}
          </button>
        )}
      </div>
    </section>
  );
};

export default AddLiquidityPanel;
