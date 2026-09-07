// components/portfolio/WithdrawLiquidityModal.jsx
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWriteContract, useWaitForTransactionReceipt, useAccount, useChainId, useReadContract, useReadContracts } from 'wagmi';

import { X, AlertTriangle, Download, Info, ChevronDown, Coins, PieChart, CheckCircle } from 'lucide-react';

import { formatUnits, parseUnits, zeroAddress, maxUint256 } from 'viem';

import WithdrawTransactionModal from './WithdrawTransactionModal';
import { getContractAddresses } from '../../constants/addresses';
import { ROUTER_ABI, PAIR_ABI, ERC20_ABI } from '../../constants/abis';
import { formatNumber } from '../utils/price';

// Import CSS Module
import styles from './WithdrawLiquidityModal.module.css';

const WithdrawLiquidityModal = ({ position, onClose, onSuccess }) => {
  const { address } = useAccount();
  const chainId = useChainId();
  const { writeContractAsync } = useWriteContract();
  
  // Get contract addresses for current chain
  const contractAddresses = getContractAddresses(chainId);
  
  const [withdrawPercentage, setWithdrawPercentage] = useState(10);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [slippage, setSlippage] = useState(1.0);
  const [deadlineMinutes, setDeadlineMinutes] = useState(30);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  
  // Transaction state for the modal
  const [transactionModal, setTransactionModal] = useState({
    show: false,
    type: 'approve', // 'approve' or 'withdraw'
    hash: null,
    error: '',
    token0Amount: null,
    token1Amount: null,
    lpAmount: null,
  });

  const { token0, token1, lpTokenBalance, totalLP, pairAddress, reserves } = position;

  // FIXED: Convert string balances back to BigInt for calculations
  const maxLPBalance = useMemo(() => {
    if (!lpTokenBalance) return 0n;
    try {
      // lpTokenBalance is stored as a string (from formatUnits)
      return parseUnits(lpTokenBalance, 18);
    } catch {
      return 0n;
    }
  }, [lpTokenBalance]);

  // FIXED: Convert string totalLP back to BigInt
  const parsedTotalLP = useMemo(() => {
    if (!totalLP) return 0n;
    try {
      // totalLP is stored as a string (from formatUnits)
      return parseUnits(totalLP, 18);
    } catch {
      return 0n;
    }
  }, [totalLP]);

  // FIXED: Convert string reserves back to BigInt
  const parsedReserves = useMemo(() => {
    if (!reserves) return [0n, 0n];
    try {
      // reserves are stored as strings (from formatUnits)
      const reserve0 = parseUnits(reserves.token0, token0.decimals || 18);
      const reserve1 = parseUnits(reserves.token1, token1.decimals || 18);
      return [reserve0, reserve1];
    } catch {
      return [0n, 0n];
    }
  }, [reserves, token0.decimals, token1.decimals]);

  // Calculate withdraw amount based on percentage - FIXED BigInt operations
  const calculatedWithdrawAmount = useMemo(() => {
    if (!maxLPBalance || maxLPBalance === 0n) return 0n;
    const percentage = withdrawPercentage;
    // Convert percentage to basis points (100% = 10000 bps)
    const bps = BigInt(Math.floor(percentage * 100)); // 10% = 1000 bps
    // Multiply then divide by 10000 (10000 bps = 100%)
    const amount = (maxLPBalance * bps) / 10000n;
    return amount;
  }, [maxLPBalance, withdrawPercentage]);

  // Get actual token amounts from router
  const { data: amountsOut } = useReadContract({
    address: contractAddresses.router,
    abi: ROUTER_ABI,
    functionName: 'quoteRemoveLiquidity',
    args: [
      token0.address,
      token1.address,
      token0.isNative,
      calculatedWithdrawAmount || 0n,
      parsedTotalLP || 1n
    ],
    query: {
      enabled: !!calculatedWithdrawAmount && calculatedWithdrawAmount > 0n && !!parsedTotalLP && parsedTotalLP > 0n && !!contractAddresses.router,
    },
  });

  // Get actual amounts for ETH pairs
  const { data: amountsOutETH } = useReadContract({
    address: contractAddresses.router,
    abi: ROUTER_ABI,
    functionName: 'quoteRemoveLiquidityETH',
    args: [
      token0.isNative ? token1.address : token0.address,
      token0.isNative,
      calculatedWithdrawAmount || 0n,
      parsedTotalLP || 1n
    ],
    query: {
      enabled: (token0.isNative || token1.isNative) && !!calculatedWithdrawAmount && calculatedWithdrawAmount > 0n && !!parsedTotalLP && parsedTotalLP > 0n && !!contractAddresses.router,
    },
  });

  // Get the actual token balances from the pair contract
  const { data: pairData } = useReadContracts({
    contracts: [
      {
        address: pairAddress,
        abi: PAIR_ABI,
        functionName: 'token0',
      },
      {
        address: pairAddress,
        abi: PAIR_ABI,
        functionName: 'token1',
      },
      {
        address: pairAddress,
        abi: PAIR_ABI,
        functionName: 'getReserves',
      },
      {
        address: pairAddress,
        abi: ERC20_ABI,
        functionName: 'totalSupply',
      },
    ],
    query: {
      enabled: !!pairAddress,
    },
  });

  const [contractToken0, contractToken1, contractReserves, contractTotalSupply] = pairData || [];

  // Get the actual token0 and token1 from the contract
  const actualToken0Address = contractToken0?.result;
  const actualToken1Address = contractToken1?.result;
  const actualReserves = contractReserves?.result;
  const actualTotalSupply = contractTotalSupply?.result;

  // Calculate actual amounts - FIXED: Use BigInt operations properly
  const calculateActualAmounts = useCallback(() => {
    if (!calculatedWithdrawAmount || !actualTotalSupply || actualTotalSupply === 0n || calculatedWithdrawAmount === 0n) {
      return { token0: 0n, token1: 0n };
    }

    if (!actualReserves || actualReserves.length < 2) {
      // Use parsed reserves as fallback
      if (parsedReserves && parsedReserves[0] && parsedReserves[1] && parsedTotalLP && parsedTotalLP > 0n) {
        const token0Amount = (calculatedWithdrawAmount * parsedReserves[0]) / parsedTotalLP;
        const token1Amount = (calculatedWithdrawAmount * parsedReserves[1]) / parsedTotalLP;
        return { token0: token0Amount, token1: token1Amount };
      }
      return { token0: 0n, token1: 0n };
    }

    const reserve0 = actualReserves[0];
    const reserve1 = actualReserves[1];

    const token0Amount = (calculatedWithdrawAmount * reserve0) / actualTotalSupply;
    const token1Amount = (calculatedWithdrawAmount * reserve1) / actualTotalSupply;

    return { token0: token0Amount, token1: token1Amount };
  }, [calculatedWithdrawAmount, actualTotalSupply, actualReserves, parsedReserves, parsedTotalLP]);

  // Calculate actual amounts
  const actualAmounts = useMemo(() => calculateActualAmounts(), [calculateActualAmounts]);

  // Check which token is which
  const isToken0ETH = token0.isNative;
  const isToken1ETH = token1.isNative;
  const isETHInvolved = isToken0ETH || isToken1ETH;

  // Get ETH amount (ETH amount on LitVM)
  const ethAmount = useMemo(() => {
    if (!isETHInvolved) return 0n;
    return isToken0ETH ? actualAmounts.token0 : actualAmounts.token1;
  }, [isETHInvolved, isToken0ETH, actualAmounts]);

  // Get ERC20 amount
  const erc20Amount = useMemo(() => {
    if (!isETHInvolved) return 0n;
    return isToken0ETH ? actualAmounts.token1 : actualAmounts.token0;
  }, [isETHInvolved, isToken0ETH, actualAmounts]);

  // Apply slippage to get minimum amounts - FIXED: Use BigInt operations
  const calculateMinAmount = (amount) => {
    if (!amount || amount === 0n) return 0n;
    
    const slippageBps = BigInt(Math.floor(slippage * 100)); // Convert to basis points
    const min = (amount * (10000n - slippageBps)) / 10000n;
    
    return min > 0n ? min : 1n;
  };

  const ethMin = useMemo(() => calculateMinAmount(ethAmount), [ethAmount, slippage]);
  const erc20Min = useMemo(() => calculateMinAmount(erc20Amount), [erc20Amount, slippage]);
  const token0Min = useMemo(() => calculateMinAmount(actualAmounts.token0), [actualAmounts.token0, slippage]);
  const token1Min = useMemo(() => calculateMinAmount(actualAmounts.token1), [actualAmounts.token1, slippage]);

  // Get ERC20 token address
  const getERC20Token = () => {
    if (!isETHInvolved) return null;
    return isToken0ETH ? token1 : token0;
  };

  const erc20Token = getERC20Token();

  // Check allowance for LP tokens
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: pairAddress,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [address, contractAddresses.router],
    query: {
      enabled: !!address && !!pairAddress && !!contractAddresses.router,
    },
  });

  // Initialize withdraw amount on mount
  useEffect(() => {
    if (maxLPBalance && maxLPBalance > 0n) {
      const initialPercentage = 10;
      // FIXED: Use proper BigInt calculation
      const bps = BigInt(Math.floor(initialPercentage * 100));
      const amount = (maxLPBalance * bps) / 10000n;
      setWithdrawAmount(formatUnits(amount, 18));
    }
  }, [maxLPBalance]);

  // Check if approval is needed
  const [isApproved, setIsApproved] = useState(false);
  useEffect(() => {
    if (allowance !== undefined && calculatedWithdrawAmount > 0n) {
      const hasSufficientAllowance = allowance >= calculatedWithdrawAmount;
      setIsApproved(hasSufficientAllowance);
    }
  }, [allowance, calculatedWithdrawAmount]);

  // Handle percentage change - FIXED: Use proper BigInt operations
  const handlePercentageChange = useCallback((percentage) => {
    setWithdrawPercentage(percentage);
    if (maxLPBalance && maxLPBalance > 0n) {
      const bps = BigInt(Math.floor(percentage * 100));
      const amount = (maxLPBalance * bps) / 10000n;
      setWithdrawAmount(formatUnits(amount, 18));
    }
  }, [maxLPBalance]);

  // Handle amount change - FIXED: Use proper number conversions
  const handleAmountChange = useCallback((value) => {
    const cleanedValue = value.replace(/[^0-9.]/g, '');
    
    const parts = cleanedValue.split('.');
    if (parts.length > 2) {
      value = parts[0] + '.' + parts.slice(1).join('');
    } else {
      value = cleanedValue;
    }
    
    setWithdrawAmount(value);
    
    if (maxLPBalance && maxLPBalance > 0n && value && value !== '.' && parseFloat(value) > 0) {
      try {
        const amount = parseUnits(value, 18);
        // FIXED: Convert to Number for percentage calculation
        const percentage = (Number(amount) / Number(maxLPBalance)) * 100;
        setWithdrawPercentage(Math.min(100, Math.max(0, percentage)));
      } catch (error) {
        console.error('Error parsing amount:', error);
        setWithdrawPercentage(0);
      }
    } else {
      setWithdrawPercentage(0);
    }
  }, [maxLPBalance]);

  // Handle max click
  const handleMaxClick = useCallback(() => {
    handlePercentageChange(100);
  }, [handlePercentageChange]);

  // Validate input amount
  const validateWithdrawAmount = useCallback(() => {
    if (!withdrawAmount || withdrawAmount.trim() === '') {
      return { isValid: false, error: 'Please enter withdraw amount' };
    }
    
    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      return { isValid: false, error: 'Please enter a valid amount' };
    }
    
    if (maxLPBalance && maxLPBalance > 0n) {
      try {
        const parsedAmount = parseUnits(withdrawAmount, 18);
        if (parsedAmount > maxLPBalance) {
          return { isValid: false, error: 'Amount exceeds balance' };
        }
        if (parsedAmount <= 0n) {
          return { isValid: false, error: 'Amount must be greater than 0' };
        }
      } catch (error) {
        return { isValid: false, error: 'Invalid amount format' };
      }
    }
    
    return { isValid: true, error: '' };
  }, [withdrawAmount, maxLPBalance]);

  // Format deadline for contract
  const getDeadline = useCallback(() => {
    return Math.floor(Date.now() / 1000) + deadlineMinutes * 60;
  }, [deadlineMinutes]);

  // Handle transaction modal close
  const handleTransactionModalClose = () => {
    setTransactionModal({
      show: false,
      type: 'approve',
      hash: null,
      error: '',
      token0Amount: null,
      token1Amount: null,
      lpAmount: null,
    });
    
    // If approval was successful, refetch allowance
    if (transactionModal.type === 'approve') {
      refetchAllowance();
    }
  };

  // Handle transaction success
  const handleTransactionSuccess = () => {
    if (transactionModal.type === 'withdraw') {
      onSuccess?.();
    }
  };

  // Handle approval
  const handleApprove = async () => {
    if (!address) {
      setError('Please connect your wallet');
      return;
    }

    if (!calculatedWithdrawAmount || calculatedWithdrawAmount <= 0n) {
      setError('Invalid amount to approve');
      return;
    }

    if (!contractAddresses.router) {
      setError('Router address not found for current network');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const hash = await writeContractAsync({
        address: pairAddress,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [contractAddresses.router, maxUint256]
      });

      // Show transaction modal for approval
      setTransactionModal({
        show: true,
        type: 'approve',
        hash: hash,
        error: '',
        token0Amount: null,
        token1Amount: null,
        lpAmount: null,
      });

    } catch (err) {
      console.error('Approval error:', err);
      setError(err.message || 'Failed to approve LP tokens');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle withdrawal
  const handleWithdraw = async () => {
    if (!address) {
      setError('Please connect your wallet');
      return;
    }

    if (!contractAddresses.router) {
      setError('Router address not found for current network');
      return;
    }

    const validation = validateWithdrawAmount();
    if (!validation.isValid) {
      setError(validation.error);
      return;
    }

    if (!calculatedWithdrawAmount || calculatedWithdrawAmount <= 0n) {
      setError('Invalid withdraw amount');
      return;
    }

    if (!isApproved) {
      setError('Please approve LP tokens first');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const deadline = getDeadline();
      const lpAmount = calculatedWithdrawAmount;

      let hash;

      if (isETHInvolved) {
        if (!erc20Token || !erc20Token.address || erc20Token.address === zeroAddress) {
          throw new Error('Invalid ERC20 token address');
        }

        hash = await writeContractAsync({
          address: contractAddresses.router,
          abi: ROUTER_ABI,
          functionName: 'removeLiquidityETH',
          args: [
            erc20Token.address,
            lpAmount,
            erc20Min,
            ethMin,
            address,
            deadline
          ]
        });
      } else {
        if (!token0.address || token0.address === zeroAddress || 
            !token1.address || token1.address === zeroAddress) {
          throw new Error('Invalid token addresses');
        }

        hash = await writeContractAsync({
          address: contractAddresses.router,
          abi: ROUTER_ABI,
          functionName: 'removeLiquidity',
          args: [
            token0.address,
            token1.address,
            lpAmount,
            token0Min,
            token1Min,
            address,
            deadline
          ]
        });
      }

      // Show transaction modal for withdrawal with amounts
      setTransactionModal({
        show: true,
        type: 'withdraw',
        hash: hash,
        error: '',
        token0Amount: actualAmounts.token0,
        token1Amount: actualAmounts.token1,
        lpAmount: lpAmount,
      });

    } catch (err) {
      console.error('Withdrawal error:', err);
      setError(err.message || 'Failed to withdraw liquidity');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Format amounts for display
  const formatTokenAmount = (amount, token) => {
    if (!amount || amount === 0n || !token) return '0';
    try {
      return formatNumber(parseFloat(formatUnits(amount, token.decimals || 18)));
    } catch (error) {
      console.error('Error formatting amount:', error);
      return '0';
    }
  };

  // Get withdrawal details
  const getWithdrawalDetails = () => {
    const lpAmountFormatted = formatNumber(parseFloat(withdrawAmount || '0'));
    
    if (isETHInvolved) {
      return {
        lpAmount: lpAmountFormatted,
        ethAmount: formatTokenAmount(ethAmount, { symbol: chainId === 4441 ? 'ETH' : 'ETH', decimals: 18 }),
        erc20Amount: formatTokenAmount(erc20Amount, erc20Token),
        ethMin: formatTokenAmount(ethMin, { symbol: chainId === 4441 ? 'ETH' : 'ETH', decimals: 18 }),
        erc20Min: formatTokenAmount(erc20Min, erc20Token),
      };
    } else {
      return {
        lpAmount: lpAmountFormatted,
        token0Amount: formatTokenAmount(actualAmounts.token0, token0),
        token1Amount: formatTokenAmount(actualAmounts.token1, token1),
        token0Min: formatTokenAmount(token0Min, token0),
        token1Min: formatTokenAmount(token1Min, token1),
      };
    }
  };

  const withdrawalDetails = getWithdrawalDetails();

  // Check if approve button should be disabled
  const isApproveDisabled = isSubmitting || !calculatedWithdrawAmount || calculatedWithdrawAmount <= 0n || isApproved || !contractAddresses.router;

  // Check if withdraw button should be disabled
  const isWithdrawDisabled = isSubmitting || !withdrawAmount || parseFloat(withdrawAmount) <= 0 || !calculatedWithdrawAmount || !isApproved || !contractAddresses.router;

  // Reset error when amount changes
  useEffect(() => {
    if (error) {
      setError('');
    }
  }, [withdrawAmount, withdrawPercentage]);

  return (
    <>
      {/* Withdraw Transaction Modal */}
      <AnimatePresence>
        {transactionModal.show && (
          <WithdrawTransactionModal
            transactionHash={transactionModal.hash}
            onClose={handleTransactionModalClose}
            onSuccess={handleTransactionSuccess}
            type={transactionModal.type}
            token0={token0}
            token1={token1}
            token0Amount={transactionModal.token0Amount}
            token1Amount={transactionModal.token1Amount}
            lpAmount={transactionModal.lpAmount}
            errorMessage={transactionModal.error}
            autoCloseDelay={transactionModal.type === 'withdraw' ? 5000 : 3000}
          />
        )}
      </AnimatePresence>

      {/* Existing Withdraw Form Modal */}
      <div className={styles['modal-overlay']} onClick={onClose}>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className={styles['withdraw-modal']}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className={styles['modal-header']}>
            <div className={styles['header-content']}>
              <Download className={styles['header-icon']} />
              <div>
                <h3>Withdraw Liquidity</h3>
                <p className={styles['header-subtitle']}>
                  {token0.symbol}/{token1.symbol} Pool
                </p>
              </div>
            </div>
            <button onClick={onClose} className={styles['close-button']} disabled={isSubmitting}>
              <X className={styles['close-icon']} />
            </button>
          </div>

          {/* Scrollable Content */}
          <div className={styles['modal-content']}>
            {/* Pool Info */}
            <div className={styles['pool-info']}>
              <div className={styles['pool-tokens']}>
                <div className={styles['token-icons']}>
                  <img 
                    src={token0.logoURI} 
                    alt={token0.symbol}
                    className={styles['token-icon']}
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = 'https://assets.coingecko.com/coins/images/279/standard/ethereum.png';
                    }}
                  />
                  <img 
                    src={token1.logoURI} 
                    alt={token1.symbol}
                    className={styles['token-icon']}
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = 'https://assets.coingecko.com/coins/images/279/standard/ethereum.png';
                    }}
                  />
                </div>
                <span className={styles['pool-name']}>{token0.symbol}/{token1.symbol}</span>
              </div>
              <div className={styles['pool-share']}>
                <span className={styles['share-label']}>Your Share</span>
                <span className={styles['share-value']}>{formatNumber(position.poolShare)}%</span>
              </div>
            </div>

            {/* LP Token Input */}
            <div className={styles['withdraw-input-section']}>
              <div className={styles['input-header']}>
                <label>Amount to Withdraw</label>
                <div className={styles['input-balance']}>
                  <span>Balance: {formatNumber(parseFloat(lpTokenBalance))} LP</span>
                  <button 
                    onClick={handleMaxClick}
                    className={styles['max-button']}
                    disabled={isSubmitting}
                    type="button"
                  >
                    MAX
                  </button>
                </div>
              </div>
              
              <div className={styles['lp-token-input']}>
                <div className={styles['lp-token-display']}>
                  <div className={styles['lp-token-icon']}>
                    <PieChart />
                  </div>
                  <div className={styles['lp-token-symbol']}>LP</div>
                </div>
                <input
                  type="text"
                  value={withdrawAmount}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  placeholder="0.0"
                  disabled={isSubmitting}
                  className={styles['amount-input']}
                  inputMode="decimal"
                  pattern="[0-9]*[.]?[0-9]*"
                />
              </div>

              {/* Percentage Slider */}
              <div className={styles['percentage-slider']}>
                <div className={styles['slider-header']}>
                  <span>Withdraw Percentage</span>
                  <span className={styles['percentage-value']}>{withdrawPercentage.toFixed(2)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={withdrawPercentage}
                  onChange={(e) => handlePercentageChange(parseFloat(e.target.value))}
                  disabled={isSubmitting}
                  className={styles['slider']}
                />
                <div className={styles['percentage-buttons']}>
                  {[10, 25, 50, 100].map((percent) => (
                    <button
                      key={percent}
                      onClick={() => handlePercentageChange(percent)}
                      className={`${styles['percentage-button']} ${withdrawPercentage === percent ? styles['active'] : ''}`}
                      disabled={isSubmitting}
                      type="button"
                    >
                      {percent}%
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Receiving Amounts */}
            <div className={styles['receiving-amounts']}>
              <h4>You Will Receive</h4>
              <div className={styles['token-amounts']}>
                {isETHInvolved ? (
                  <>
                    {/* ETH/ETH Amount */}
                    <div className={styles['token-amount']}>
                      <div className={styles['token-info']}>
                        <div className={styles['token-icon']} style={{ 
                          background: chainId === 4441 ? '#FF6B00' : '#627EEA', 
                          color: 'white', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center' 
                        }}>
                          {chainId === 4441 ? 'K' : 'Ξ'}
                        </div>
                        <span className={styles['token-symbol']}>{chainId === 4441 ? 'ETH' : 'ETH'}</span>
                      </div>
                      <div className={styles['amount-info']}>
                        <span className={styles['amount-value']}>
                          {withdrawalDetails.ethAmount}
                        </span>
                        <span className={styles['amount-min']}>
                          Min: {withdrawalDetails.ethMin} {chainId === 4441 ? 'ETH' : 'ETH'}
                        </span>
                      </div>
                    </div>
                    
                    {/* ERC20 Token Amount */}
                    <div className={styles['token-amount']}>
                      <div className={styles['token-info']}>
                        <img 
                          src={erc20Token?.logoURI} 
                          alt={erc20Token?.symbol}
                          className={styles['token-icon']}
                          onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = 'https://assets.coingecko.com/coins/images/279/standard/ethereum.png';
                          }}
                        />
                        <span className={styles['token-symbol']}>{erc20Token?.symbol}</span>
                      </div>
                      <div className={styles['amount-info']}>
                        <span className={styles['amount-value']}>
                          {withdrawalDetails.erc20Amount}
                        </span>
                        <span className={styles['amount-min']}>
                          Min: {withdrawalDetails.erc20Min} {erc20Token?.symbol}
                        </span>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Token0 Amount */}
                    <div className={styles['token-amount']}>
                      <div className={styles['token-info']}>
                        <img 
                          src={token0.logoURI} 
                          alt={token0.symbol}
                          className={styles['token-icon']}
                          onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = 'https://assets.coingecko.com/coins/images/279/standard/ethereum.png';
                          }}
                        />
                        <span className={styles['token-symbol']}>{token0.symbol}</span>
                      </div>
                      <div className={styles['amount-info']}>
                        <span className={styles['amount-value']}>
                          {withdrawalDetails.token0Amount}
                        </span>
                        <span className={styles['amount-min']}>
                          Min: {withdrawalDetails.token0Min} {token0.symbol}
                        </span>
                      </div>
                    </div>
                    {/* Token1 Amount */}
                    <div className={styles['token-amount']}>
                      <div className={styles['token-info']}>
                        <img 
                          src={token1.logoURI} 
                          alt={token1.symbol}
                          className={styles['token-icon']}
                          onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = 'https://assets.coingecko.com/coins/images/279/standard/ethereum.png';
                          }}
                        />
                        <span className={styles['token-symbol']}>{token1.symbol}</span>
                      </div>
                      <div className={styles['amount-info']}>
                        <span className={styles['amount-value']}>
                          {withdrawalDetails.token1Amount}
                        </span>
                        <span className={styles['amount-min']}>
                          Min: {withdrawalDetails.token1Min} {token1.symbol}
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Settings */}
            <div className={styles['withdraw-settings']}>
              <div className={styles['setting-row']}>
                <label className={styles['setting-label']}>
                  Slippage Tolerance
                  <Info className={styles['info-icon']} />
                </label>
                <div className={styles['slippage-input']}>
                  <input
                    type="text"
                    value={slippage}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value);
                      if (!isNaN(value) && value >= 0.1 && value <= 50) {
                        setSlippage(value);
                      }
                    }}
                    disabled={isSubmitting}
                    inputMode="decimal"
                  />
                  <span>%</span>
                </div>
              </div>
              <div className={styles['setting-row']}>
                <label className={styles['setting-label']}>
                  Transaction Deadline
                  <Info className={styles['info-icon']} />
                </label>
                <div className={styles['deadline-input']}>
                  <input
                    type="text"
                    value={deadlineMinutes}
                    onChange={(e) => {
                      const value = parseInt(e.target.value);
                      if (!isNaN(value) && value >= 1 && value <= 120) {
                        setDeadlineMinutes(value);
                      }
                    }}
                    disabled={isSubmitting}
                    inputMode="numeric"
                  />
                  <span>minutes</span>
                </div>
              </div>
            </div>

            {/* Approval Status */}
            <div className={styles['approval-status']}>
              {!isApproved && (
                <div className={styles['approval-step']}>
                  <div className={styles['step-header']}>
                    <div className={styles['step-number']}>1</div>
                    <h4>Approve LP Tokens</h4>
                  </div>
                  <div className={styles['step-content']}>
                    <p className={styles['step-description']}>
                      Before withdrawing, you need to approve the router to spend your LP tokens.
                      This is a one-time approval per token.
                    </p>
                    {allowance !== undefined && (
                      <div className={styles['allowance-info']}>
                        <span>Current Allowance: {formatNumber(parseFloat(formatUnits(allowance, 18)))} LP</span>
                        <span>Required: {formatNumber(parseFloat(withdrawAmount))} LP</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {isApproved && (
                <div className={`${styles['approval-step']} ${styles['approved']}`}>
                  <div className={styles['step-header']}>
                    <CheckCircle className={styles['check-icon']} />
                    <h4>Approval Complete</h4>
                  </div>
                  <div className={styles['step-content']}>
                    <p className={styles['step-description']}>
                      LP tokens are approved. You can now withdraw liquidity.
                    </p>
                  </div>
                </div>
              )}

              <div className={styles['withdraw-step']}>
                <div className={styles['step-header']}>
                  <div className={styles['step-number']}>2</div>
                  <h4>Withdraw Liquidity</h4>
                </div>
              </div>
            </div>

            {/* REAL INFO FROM CONTRACT */}
            <div className={styles['important-note']}>
              <AlertTriangle className={styles['note-icon']} />
              <div className={styles['note-content']}>
                <strong>Real Balances from Contract:</strong>
                <div style={{ fontSize: '12px', marginTop: '5px' }}>
                  <div>Contract Token0: {actualToken0Address ? `${actualToken0Address.slice(0, 6)}...${actualToken0Address.slice(-4)}` : 'Loading...'}</div>
                  <div>Contract Token1: {actualToken1Address ? `${actualToken1Address.slice(0, 6)}...${actualToken1Address.slice(-4)}` : 'Loading...'}</div>
                  <div>Reserves: {actualReserves ? `${formatUnits(actualReserves[0] || 0n, 18)} / ${formatUnits(actualReserves[1] || 0n, 18)}` : 'Loading...'}</div>
                  <div>Total Supply: {actualTotalSupply ? formatUnits(actualTotalSupply, 18) : 'Loading...'}</div>
                  <div>Router Address: {contractAddresses.router ? `${contractAddresses.router.slice(0, 6)}...${contractAddresses.router.slice(-4)}` : 'Not found'}</div>
                </div>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className={styles['error-message']}>
                <AlertTriangle className={styles['error-icon']} />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className={styles['action-buttons']}>
            <button
              onClick={onClose}
              className={styles['cancel-button']}
              disabled={isSubmitting}
              type="button"
            >
              Cancel
            </button>
            
            {!isApproved ? (
              <button
                onClick={handleApprove}
                disabled={isApproveDisabled}
                className={styles['approve-action-button']}
                type="button"
              >
                {isSubmitting ? 'Approving...' : 'Approve LP Tokens'}
              </button>
            ) : (
              <button
                onClick={handleWithdraw}
                disabled={isWithdrawDisabled}
                className={styles['withdraw-action-button']}
                type="button"
              >
                {isSubmitting ? 'Processing...' : 'Withdraw Liquidity'}
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </>
  );
};

export default WithdrawLiquidityModal;


// ok