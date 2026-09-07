// components/liquidityComponents/ManageLiquidity.jsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  useAccount, 
  usePublicClient, 
  useWriteContract, 
  useReadContracts, 
  useChainId 
} from 'wagmi';
import { formatUnits, zeroAddress } from 'viem';
import { motion, AnimatePresence } from 'framer-motion';
import { ExternalLink, Loader2, X, AlertCircle, CheckCircle } from 'lucide-react';
import { getContractAddresses } from '../../constants/addresses';
import { FACTORY_ABI, PAIR_ABI, ERC20_ABI, ROUTER_ABI } from '../../constants/abis';
import { ETHERS_CONSTANTS } from '../../constants/ethers';
import { GasUtils } from '../../constants/gas';
import styles from './ManageLiquidity.module.css';

// Formatting helper
const formatBalance = (balance, decimals = 18, maxDecimals = 6) => {
  if (!balance || balance === 0n) return '0';
  try {
    const formatted = formatUnits(balance, decimals);
    const num = parseFloat(formatted);
    if (num < 0.000001 && num > 0) return num.toExponential(4);
    return num.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: maxDecimals,
      useGrouping: false,
    });
  } catch (error) {
    return '0';
  }
};

const ManageLiquidity = () => {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const ADDRESSES = useMemo(() => getContractAddresses(chainId), [chainId]);
  const gasConfig = useMemo(() => GasUtils.getConfig(chainId), [chainId]);

  const [positions, setPositions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedPosition, setSelectedPosition] = useState(null);
  const [withdrawPercentage, setWithdrawPercentage] = useState(100);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [txHash, setTxHash] = useState(null);
  const [txSuccess, setTxSuccess] = useState(false);
  const [slippage] = useState(0.5);

  // Approval state
  const [approving, setApproving] = useState(false);
  const [needsApproval, setNeedsApproval] = useState(false);
  const [lpAllowance, setLpAllowance] = useState(0n);
  const [checkingAllowance, setCheckingAllowance] = useState(false);

  // Fetch total pairs length
  const { data: allPairsLength } = useReadContracts({
    contracts: [{
      address: ADDRESSES?.factory,
      abi: FACTORY_ABI,
      functionName: 'allPairsLength',
    }],
    query: { enabled: !!ADDRESSES?.factory },
  });

  const totalPairs = allPairsLength?.[0]?.result ? Number(allPairsLength[0].result) : 0;

  // Fetch all pair addresses
  const { data: pairAddresses, refetch: refetchPairs } = useReadContracts({
    contracts: Array.from({ length: totalPairs }, (_, i) => ({
      address: ADDRESSES?.factory,
      abi: FACTORY_ABI,
      functionName: 'allPairs',
      args: [i],
    })),
    query: { enabled: totalPairs > 0 && !!ADDRESSES?.factory },
  });

  const pairList = useMemo(() => {
    if (!pairAddresses) return [];
    return pairAddresses.map(call => call.result).filter(addr => addr && addr !== zeroAddress);
  }, [pairAddresses]);

  // Fetch user positions
  const fetchPositions = useCallback(async () => {
    if (!address || !publicClient || !ADDRESSES?.router || pairList.length === 0) {
      setPositions([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const positionsData = [];

      for (const pairAddress of pairList) {
        const pairContract = { address: pairAddress, abi: PAIR_ABI };

        try {
          const [token0, token1, reserves, totalSupply, userBalance] = await Promise.all([
            publicClient.readContract({ ...pairContract, functionName: 'token0' }),
            publicClient.readContract({ ...pairContract, functionName: 'token1' }),
            publicClient.readContract({ ...pairContract, functionName: 'getReserves' }),
            publicClient.readContract({ ...pairContract, functionName: 'totalSupply' }),
            publicClient.readContract({ ...pairContract, functionName: 'balanceOf', args: [address] }),
          ]);

          if (userBalance === 0n) continue;

          const [token0Symbol, token0Decimals, token1Symbol, token1Decimals] = await Promise.all([
            publicClient.readContract({ address: token0, abi: ERC20_ABI, functionName: 'symbol' }).catch(() => 'UNKNOWN'),
            publicClient.readContract({ address: token0, abi: ERC20_ABI, functionName: 'decimals' }).catch(() => 18),
            publicClient.readContract({ address: token1, abi: ERC20_ABI, functionName: 'symbol' }).catch(() => 'UNKNOWN'),
            publicClient.readContract({ address: token1, abi: ERC20_ABI, functionName: 'decimals' }).catch(() => 18),
          ]);

          const share = (userBalance * 10000n) / totalSupply;
          const sharePercent = (Number(share) / 100).toFixed(2);

          const reserve0 = reserves[0];
          const reserve1 = reserves[1];

          const userReserve0 = (userBalance * reserve0) / totalSupply;
          const userReserve1 = (userBalance * reserve1) / totalSupply;

          positionsData.push({
            pairAddress,
            token0: { address: token0, symbol: token0Symbol, decimals: token0Decimals },
            token1: { address: token1, symbol: token1Symbol, decimals: token1Decimals },
            userBalance,
            totalSupply,
            sharePercent,
            reserve0,
            reserve1,
            userReserve0,
            userReserve1,
          });
        } catch (pairErr) {
          console.error(`Error fetching pair ${pairAddress}:`, pairErr);
        }
      }

      setPositions(positionsData);
    } catch (err) {
      console.error('Error fetching positions:', err);
      setError('Failed to load your liquidity positions');
    } finally {
      setIsLoading(false);
    }
  }, [address, publicClient, ADDRESSES, pairList]);

  useEffect(() => {
    fetchPositions();
  }, [fetchPositions]);

  // Check allowance when position or percentage changes
  useEffect(() => {
    const checkAllowance = async () => {
      if (!selectedPosition || !address || !ADDRESSES?.router) {
        setNeedsApproval(false);
        return;
      }

      setCheckingAllowance(true);
      try {
        const allowance = await publicClient.readContract({
          address: selectedPosition.pairAddress,
          abi: ERC20_ABI,
          functionName: 'allowance',
          args: [address, ADDRESSES.router],
        });
        setLpAllowance(allowance);
        
        const liquidity = (selectedPosition.userBalance * BigInt(withdrawPercentage)) / 100n;
        setNeedsApproval(allowance < liquidity);
      } catch (err) {
        console.error('Error checking allowance:', err);
        setNeedsApproval(true);
      } finally {
        setCheckingAllowance(false);
      }
    };

    if (selectedPosition) {
      checkAllowance();
    }
  }, [selectedPosition, withdrawPercentage, address, ADDRESSES, publicClient]);

  // Approve LP token
  const handleApprove = useCallback(async () => {
    if (!selectedPosition || !ADDRESSES?.router) return;

    setApproving(true);
    setError('');

    try {
      let gasLimit;
      try {
        gasLimit = await publicClient.estimateContractGas({
          address: selectedPosition.pairAddress,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [ADDRESSES.router, ETHERS_CONSTANTS.MaxUint256],
          account: address,
        });
      } catch {
        gasLimit = 50000n;
      }

      const gasToUse = GasUtils.calculateGas(gasLimit, chainId, 'approve');

      const hash = await writeContractAsync({
        address: selectedPosition.pairAddress,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [ADDRESSES.router, ETHERS_CONSTANTS.MaxUint256],
        gas: gasToUse,
      });
      
      setTxHash(hash);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      
      if (receipt.status === 'success') {
        setLpAllowance(ETHERS_CONSTANTS.MaxUint256);
        setNeedsApproval(false);
        setTxSuccess(true);
        setTimeout(() => {
          setTxSuccess(false);
          setTxHash(null);
        }, 2000);
      } else {
        throw new Error('Approval failed');
      }
    } catch (err) {
      console.error('Approval error:', err);
      setError(err.message || 'Failed to approve LP token');
    } finally {
      setApproving(false);
    }
  }, [selectedPosition, ADDRESSES, writeContractAsync, publicClient, address, chainId]);

  // Withdraw liquidity
  const handleWithdraw = useCallback(async () => {
    if (!selectedPosition || !address || !ADDRESSES?.router) return;

    const { token0, token1, userBalance, totalSupply, reserve0, reserve1 } = selectedPosition;

    // Sort tokens
    const tokenA = token0.address.toLowerCase() < token1.address.toLowerCase() ? token0 : token1;
    const tokenB = token0.address.toLowerCase() < token1.address.toLowerCase() ? token1 : token0;
    
    const isToken0A = token0.address === tokenA.address;
    const reserveA = isToken0A ? reserve0 : reserve1;
    const reserveB = isToken0A ? reserve1 : reserve0;

    const liquidity = (userBalance * BigInt(withdrawPercentage)) / 100n;

    if (liquidity === 0n) {
      setError('Cannot withdraw 0%');
      return;
    }

    const amountA = (liquidity * reserveA) / totalSupply;
    const amountB = (liquidity * reserveB) / totalSupply;

    const slippageBps = BigInt(Math.floor(slippage * 100));
    const amountAMin = (amountA * (10000n - slippageBps)) / 10000n;
    const amountBMin = (amountB * (10000n - slippageBps)) / 10000n;

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

    setIsWithdrawing(true);
    setError('');
    setTxSuccess(false);
    setTxHash(null);

    try {
      let gasLimit;
      try {
        gasLimit = await publicClient.estimateContractGas({
          address: ADDRESSES.router,
          abi: ROUTER_ABI,
          functionName: 'removeLiquidity',
          args: [
            tokenA.address,
            tokenB.address,
            liquidity,
            amountAMin,
            amountBMin,
            address,
            deadline,
          ],
          account: address,
        });
      } catch {
        gasLimit = 300000n;
      }

      const gasToUse = GasUtils.calculateGas(gasLimit, chainId, 'removeLiquidity');

      const hash = await writeContractAsync({
        address: ADDRESSES.router,
        abi: ROUTER_ABI,
        functionName: 'removeLiquidity',
        args: [
          tokenA.address,
          tokenB.address,
          liquidity,
          amountAMin,
          amountBMin,
          address,
          deadline,
        ],
        gas: gasToUse,
      });

      setTxHash(hash);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      
      if (receipt.status === 'success') {
        setTxSuccess(true);
        setTimeout(() => {
          setShowWithdrawModal(false);
          setSelectedPosition(null);
          setTxSuccess(false);
          fetchPositions();
          refetchPairs();
        }, 2000);
      } else {
        throw new Error('Transaction failed');
      }
    } catch (err) {
      console.error('Withdraw error:', err);
      let errorMsg = err.message || 'Failed to withdraw liquidity';
      if (errorMsg.includes('ds-math-sub-underflow')) {
        errorMsg = 'Slippage too high or pool ratio changed. Try increasing slippage tolerance.';
      } else if (errorMsg.includes('INSUFFICIENT_LIQUIDITY_BURNED')) {
        errorMsg = 'Insufficient liquidity burned. Try a smaller percentage.';
      } else if (errorMsg.includes('TRANSFER_FAILED')) {
        errorMsg = 'Token transfer failed. Check token approvals.';
      }
      setError(errorMsg);
    } finally {
      setIsWithdrawing(false);
    }
  }, [selectedPosition, withdrawPercentage, address, ADDRESSES, publicClient, writeContractAsync, chainId, slippage, fetchPositions, refetchPairs]);

  const openWithdrawModal = (position) => {
    setSelectedPosition(position);
    setWithdrawPercentage(100);
    setError('');
    setTxSuccess(false);
    setTxHash(null);
    setShowWithdrawModal(true);
  };

  const closeModal = () => {
    setShowWithdrawModal(false);
    setSelectedPosition(null);
    setTxHash(null);
    setTxSuccess(false);
    setError('');
  };

  if (!isConnected) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyIcon}>🔒</div>
        <h3>Connect Wallet</h3>
        <p>Connect your wallet to view your liquidity positions</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={styles.loadingState}>
        <Loader2 className={styles.spinner} />
        <p>Loading your positions...</p>
      </div>
    );
  }

  if (error && positions.length === 0) {
    return (
      <div className={styles.errorState}>
        <AlertCircle />
        <p>{error}</p>
        <button className={styles.retryButton} onClick={fetchPositions}>Retry</button>
      </div>
    );
  }

  if (positions.length === 0) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyIcon}>💧</div>
        <h3>No Liquidity Positions</h3>
        <p>You haven't provided liquidity to any pools yet.</p>
        <button className={styles.addButton} onClick={() => window.location.href = '/liquidity'}>
          Add Liquidity
        </button>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Your Liquidity Positions</h2>
        <p>Manage your LP tokens and withdraw liquidity</p>
      </div>

      <div className={styles.positionsList}>
        {positions.map((position, idx) => (
          <motion.div
            key={position.pairAddress}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
            className={styles.positionCard}
          >
            <div className={styles.positionHeader}>
              <div className={styles.tokenPair}>
                <div className={styles.tokenIcons}>
                  <span>{position.token0.symbol}</span>
                  <span className={styles.separator}>/</span>
                  <span>{position.token1.symbol}</span>
                </div>
                <span className={styles.shareBadge}>
                  Pool Share: {position.sharePercent}%
                </span>
              </div>
              <button
                className={styles.withdrawButton}
                onClick={() => openWithdrawModal(position)}
              >
                Withdraw
              </button>
            </div>

            <div className={styles.positionDetails}>
              <div className={styles.detailRow}>
                <span>Pooled {position.token0.symbol}:</span>
                <span>{formatBalance(position.userReserve0, position.token0.decimals)}</span>
              </div>
              <div className={styles.detailRow}>
                <span>Pooled {position.token1.symbol}:</span>
                <span>{formatBalance(position.userReserve1, position.token1.decimals)}</span>
              </div>
              <div className={styles.detailRow}>
                <span>Your LP Tokens:</span>
                <span>{formatBalance(position.userBalance, 18)}</span>
              </div>
            </div>

            <div className={styles.positionFooter}>
              <a
                href={`https://liteforge.explorer.caldera.xyz/address/${position.pairAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.explorerLink}
              >
                View Pair <ExternalLink size={14} />
              </a>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Withdraw Modal */}
      <AnimatePresence>
        {showWithdrawModal && selectedPosition && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={styles.modalOverlay}
            onClick={closeModal}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className={styles.modalContent}
              onClick={(e) => e.stopPropagation()}
            >
              <button className={styles.closeButton} onClick={closeModal}>
                <X size={20} />
              </button>

              <h3>Withdraw Liquidity</h3>
              <div className={styles.modalTokenPair}>
                {selectedPosition.token0.symbol} / {selectedPosition.token1.symbol}
              </div>

              {txSuccess ? (
                <div className={styles.successState}>
                  <CheckCircle size={48} className={styles.successIcon} />
                  <h4>Withdrawal Successful!</h4>
                  <p>Your liquidity has been withdrawn.</p>
                  {txHash && (
                    <a
                      href={`https://liteforge.explorer.caldera.xyz/tx/${txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.txLink}
                    >
                      View Transaction <ExternalLink size={14} />
                    </a>
                  )}
                </div>
              ) : (
                <>
                  <div className={styles.withdrawSlider}>
                    <label>Amount to withdraw</label>
                    <div className={styles.sliderContainer}>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        value={withdrawPercentage}
                        onChange={(e) => setWithdrawPercentage(Number(e.target.value))}
                        className={styles.slider}
                        disabled={isWithdrawing || approving}
                      />
                      <div className={styles.percentageButtons}>
                        {[25, 50, 75, 100].map(pct => (
                          <button
                            key={pct}
                            onClick={() => setWithdrawPercentage(pct)}
                            className={withdrawPercentage === pct ? styles.active : ''}
                            disabled={isWithdrawing || approving}
                          >
                            {pct}%
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className={styles.percentageValue}>{withdrawPercentage}%</div>
                  </div>

                  <div className={styles.receiveAmounts}>
                    <div className={styles.receiveRow}>
                      <span>You will receive (approx):</span>
                    </div>
                    <div className={styles.receiveRow}>
                      <span>{selectedPosition.token0.symbol}</span>
                      <span>
                        {formatBalance(
                          (selectedPosition.userReserve0 * BigInt(withdrawPercentage)) / 100n,
                          selectedPosition.token0.decimals
                        )}
                      </span>
                    </div>
                    <div className={styles.receiveRow}>
                      <span>{selectedPosition.token1.symbol}</span>
                      <span>
                        {formatBalance(
                          (selectedPosition.userReserve1 * BigInt(withdrawPercentage)) / 100n,
                          selectedPosition.token1.decimals
                        )}
                      </span>
                    </div>
                    <div className={styles.slippageNote}>
                      Slippage tolerance: {slippage}%
                    </div>
                  </div>

                  {error && <div className={styles.modalError}>{error}</div>}

                  <div className={styles.modalActions}>
                    <button
                      className={styles.cancelButton}
                      onClick={closeModal}
                      disabled={isWithdrawing || approving}
                    >
                      Cancel
                    </button>
                    {needsApproval ? (
                      <button
                        className={styles.confirmButton}
                        onClick={handleApprove}
                        disabled={approving || checkingAllowance}
                      >
                        {approving ? (
                          <>
                            <Loader2 className={styles.buttonSpinner} />
                            Approving...
                          </>
                        ) : (
                          'Approve LP Token'
                        )}
                      </button>
                    ) : (
                      <button
                        className={styles.confirmButton}
                        onClick={handleWithdraw}
                        disabled={isWithdrawing || withdrawPercentage === 0}
                      >
                        {isWithdrawing ? (
                          <>
                            <Loader2 className={styles.buttonSpinner} />
                            Withdrawing...
                          </>
                        ) : (
                          'Confirm Withdraw'
                        )}
                      </button>
                    )}
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ManageLiquidity;