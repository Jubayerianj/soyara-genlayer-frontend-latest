// hooks/swap/useSwap.js
// Production-tested Swap execution hook for LitVM with exact curve math, safe slippage, and AGGFlow router execution.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useWriteContract, useWaitForTransactionReceipt, useReadContract, usePublicClient } from 'wagmi';
import { parseUnits, zeroAddress } from 'viem';
import { CONTRACT_ADDRESSES } from '../../constants/addresses';
import { DEX_CONFIG } from '../../constants/dex';
import { buildProgram } from '../../utils/programBuilder';
import AGGFLOW_ENTRYPOINT_ABI from '../../abi/AGGFlowEntrypoint.json';
import { ERC20_ABI } from '../../constants/abis';
import { withNodeRetry, describeTxError, describeSimulationFailure, paced, WALLET_ONE_RETRY } from '../../lib/nodeRetry';

const FEE_COLLECTOR = CONTRACT_ADDRESSES[4221]?.dexFeeVault || '0x48234eD645676b794a4CbC7483513e58cB04e22E';
const FEE_BPS = 5n; // 0.05%

const WETH_ABI = [
  {
    type: 'function',
    name: 'deposit',
    inputs: [],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'withdraw',
    inputs: [{ name: 'wad', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
];

export function useSwap({
  fromToken,
  toToken,
  fromAmount,
  toAmount,
  slippage,
  chainId,
  route,
  userAddress,
  refetchBalances,
  referrerAddress = zeroAddress,
  referrerFeeBps = 0n,
  receiver = undefined,
}) {
  const publicClient = usePublicClient();
  const currentChainId = chainId || 4221;
  const entrypointAddress = CONTRACT_ADDRESSES[currentChainId]?.aggregatorEntrypoint;
  const wethAddress = DEX_CONFIG[currentChainId]?.weth || '0x315374AA9b5536037Cc1Efeea2439CCC0913A77e';

  // Spender for ERC20 approvals is always the entrypoint contract
  const activeSpender = entrypointAddress;

  const [transactionStatus, setTransactionStatus] = useState({
    show: false,
    status: '',
    txHash: null,
    message: '',
    type: '',
  });

  const [activeTxHash, setActiveTxHash] = useState(null);

  // ---------- Allowance Check ----------
  const { data: allowance, refetch: refetchAllowance, isFetching: isCheckingAllowance } = useReadContract({
    address: fromToken?.isNative ? undefined : fromToken?.address,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: !fromToken?.isNative && userAddress && activeSpender
      ? [userAddress, activeSpender]
      : undefined,
    query: {
      enabled: !!fromToken && !fromToken.isNative && !!userAddress && !!activeSpender,
    },
  });

  const needsApproval = useMemo(() => {
    if (!fromToken || fromToken.isNative || !userAddress || !activeSpender) return false;
    if (allowance === undefined || isCheckingAllowance) return true;
    const amountInWei = parseUnits(fromAmount || '0', fromToken.decimals || 18);
    return allowance < amountInWei;
  }, [fromToken, fromAmount, allowance, userAddress, activeSpender, isCheckingAllowance]);

  // ---------- Write Hooks ----------
  const { writeContractAsync: approveWriteAsync, isPending: isApproving } = useWriteContract();
  const { writeContractAsync: swapWriteAsync, isPending: isSwapping } = useWriteContract();
  const { writeContractAsync: wrapWriteAsync, isPending: isWrapping } = useWriteContract();
  const { writeContractAsync: unwrapWriteAsync, isPending: isUnwrapping } = useWriteContract();

  const {
    isLoading: isTxConfirming,
    isSuccess: isTxSuccess,
    isError: isTxError,
    error: txReceiptError,
  } = useWaitForTransactionReceipt({
    hash: activeTxHash,
  });

  // Track confirmation updates
  useEffect(() => {
    if (!activeTxHash) return;

    if (isTxSuccess) {
      setTransactionStatus((prev) => ({
        ...prev,
        show: true,
        status: 'success',
        txHash: activeTxHash,
        message: 'Transaction confirmed successfully!',
      }));
      if (refetchBalances) refetchBalances();
      if (refetchAllowance) refetchAllowance();
    } else if (isTxError || txReceiptError) {
      setTransactionStatus((prev) => ({
        ...prev,
        show: true,
        status: 'error',
        txHash: activeTxHash,
        message: describeTxError(txReceiptError, 'Transaction'),
      }));
    }
  }, [activeTxHash, isTxSuccess, isTxError, txReceiptError, refetchBalances, refetchAllowance]);

  // ---------- Gas Fee Helper ----------
  // Gas we ask for is not free to ask for.
  //
  // Bradbury rate-limits by GAS THROUGHPUT ("transaction gas rate limit
  // exceeded: node is at capacity"), so an oversized limit consumes an
  // oversized share of that budget and gets refused even when the node would
  // happily take the real transaction. A single-hop AGGFlow swap costs roughly
  // 200-300k and a multi-hop one 400-500k; this fallback was 3,500,000, more
  // than ten times what any of these calls use, and it was reached silently
  // whenever gas estimation failed.
  const getTxGasParams = useCallback(async (fallbackGasLimit = 700000n) => {
    let params = {
      gas: fallbackGasLimit,
    };
    if (!publicClient) return params;

    try {
      const fees = await publicClient.estimateFeesPerGas().catch(() => null);
      if (fees?.maxFeePerGas && fees?.maxPriorityFeePerGas) {
        params.maxFeePerGas = (fees.maxFeePerGas * 150n) / 100n;
        params.maxPriorityFeePerGas = fees.maxPriorityFeePerGas > 0n ? fees.maxPriorityFeePerGas : 1000000000n;
        return params;
      }
    } catch {}

    try {
      const block = await publicClient.getBlock({ blockTag: 'latest' }).catch(() => null);
      const baseFee = block?.baseFeePerGas ?? 1000000000n;
      params.maxFeePerGas = (baseFee * 180n) / 100n + 1000000000n;
      params.maxPriorityFeePerGas = 1000000000n;
    } catch {
      params.maxFeePerGas = 8000000000n;
      params.maxPriorityFeePerGas = 1000000000n;
    }
    return params;
  }, [publicClient]);

  // ---------- Token Approval Function ----------
  const approveToken = useCallback(async () => {
    if (!fromToken || fromToken.isNative || !activeSpender || !userAddress) return;

    const amountInWei = parseUnits(fromAmount || '0', fromToken.decimals || 18);
    if (amountInWei <= 0n) {
      console.warn('Cannot approve zero amount');
      return;
    }

    setTransactionStatus({
      show: true,
      status: 'pending',
      txHash: null,
      message: `Approving ${fromAmount} ${fromToken.symbol}...`,
      type: 'approval',
    });

    try {
      const gasParams = await getTxGasParams(400000n);
      const hash = await withNodeRetry(() => paced(() => approveWriteAsync({
        address: fromToken.address,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [activeSpender, amountInWei],
        ...gasParams,
      })), { label: 'approve', ...WALLET_ONE_RETRY,
        onRetry: ({ waitMs }) => setTransactionStatus({
          show: true, status: 'pending', txHash: null, type: 'approve',
          message: `Node was busy. Retrying in ${Math.round(waitMs / 100) / 10}s - your wallet will ask once more.`,
        }),
      });

      setActiveTxHash(hash);
      setTransactionStatus({
        show: true,
        status: 'pending',
        txHash: hash,
        message: `Approval of ${fromAmount} ${fromToken.symbol} submitted. Waiting for confirmation...`,
        type: 'approval',
      });
      return hash;
    } catch (err) {
      console.error('Approval failed:', err);
      setTransactionStatus({
        show: true,
        status: 'error',
        txHash: null,
        message: describeTxError(err, 'Approval'),
        type: 'approval',
      });
    }
  }, [fromToken, activeSpender, userAddress, fromAmount, approveWriteAsync, getTxGasParams]);

  // ---------- Execute Swap Function ----------
  const executeSwap = useCallback(async () => {
    if (!fromToken || !toToken || !fromAmount || !userAddress || !entrypointAddress) {
      console.error('Missing swap arguments');
      return;
    }

    const amountInWei = parseUnits(fromAmount, fromToken.decimals || 18);
    const targetReceiver = receiver || userAddress;

    // Calculate safe minAmountOut with slippage buffer
    let minAmountOut = 1n;
    if (toAmount && toToken) {
      try {
        const rawToNum = parseFloat(toAmount);
        if (rawToNum > 0) {
          // On bonding curve tokens with multiple tick positions, allow a 10% slippage buffer
          const effectiveSlippage = Math.min(50, Math.max(parseFloat(slippage || 1), 10.0));
          const minNum = rawToNum * (1 - effectiveSlippage / 100);
          const cleanMinStr = minNum > 0
            ? (minNum >= 1 ? minNum.toFixed(2) : minNum.toFixed(toToken.decimals > 8 ? 8 : toToken.decimals))
            : '0.000001';
          minAmountOut = parseUnits(cleanMinStr, toToken.decimals || 18);
        }
      } catch {
        minAmountOut = 1n;
      }
    }

    setTransactionStatus({
      show: true,
      status: 'pending',
      txHash: null,
      message: 'Confirm transaction in your wallet...',
      type: 'swap',
    });

    try {
      const gasParams = await getTxGasParams(700000n);
      const program = buildProgram(fromToken, toToken, route, wethAddress);
      const swapIntent = [
        toToken.isNative ? zeroAddress : toToken.address,
        minAmountOut,
        fromToken.isNative ? zeroAddress : fromToken.address,
        amountInWei,
      ];
      const feeCollection = [
        FEE_COLLECTOR,
        FEE_BPS,
        referrerAddress,
        BigInt(referrerFeeBps),
        false,
      ];

      const isCustomReceiver = targetReceiver && targetReceiver.toLowerCase() !== userAddress.toLowerCase();

      // Estimate, and treat a FAILED estimate as information rather than as
      // nothing.
      //
      // This used to be `.catch(() => null)` followed by a silent fall back to
      // a 3.5M gas limit. But estimation failing almost always means the
      // transaction would revert - most often the entrypoint is not approved
      // for this token, or the route went stale. Swallowing that sent a
      // doomed transaction with an enormous gas limit, which the node's gas
      // rate limiter refused, and the user was told the node was busy when
      // their actual problem was an allowance.
      let estimateError = null;
      if (publicClient && userAddress) {
        try {
          const simGas = await publicClient.estimateContractGas({
            address: entrypointAddress,
            abi: AGGFLOW_ENTRYPOINT_ABI,
            functionName: isCustomReceiver ? 'executeSwapWithReceiver' : 'executeSwap',
            args: isCustomReceiver
              ? [swapIntent, feeCollection, program, targetReceiver]
              : [swapIntent, feeCollection, program],
            value: fromToken.isNative ? amountInWei : 0n,
            account: userAddress,
          });
          if (simGas && simGas > 0n) {
            // Headroom for the route moving between estimate and inclusion,
            // capped so a strange estimate cannot reintroduce a huge request.
            const withHeadroom = (simGas * 130n) / 100n;
            gasParams.gas = withHeadroom > 1200000n ? 1200000n : withHeadroom;
          }
        } catch (e) {
          estimateError = e;
        }
      }

      if (estimateError) {
        console.warn('[swap] gas estimation failed - the swap would likely revert:', estimateError?.shortMessage || estimateError?.message);
        setTransactionStatus({
          show: true,
          status: 'error',
          txHash: null,
          message: describeSimulationFailure(estimateError, fromToken?.symbol),
          type: 'swap',
        });
        return;
      }

      const hash = await withNodeRetry(() => paced(() => swapWriteAsync({
        address: entrypointAddress,
        abi: AGGFLOW_ENTRYPOINT_ABI,
        functionName: isCustomReceiver ? 'executeSwapWithReceiver' : 'executeSwap',
        args: isCustomReceiver
          ? [swapIntent, feeCollection, program, targetReceiver]
          : [swapIntent, feeCollection, program],
        value: fromToken.isNative ? amountInWei : 0n,
        ...gasParams,
      })), { label: 'swap', ...WALLET_ONE_RETRY,
        onRetry: ({ waitMs }) => setTransactionStatus({
          show: true, status: 'pending', txHash: null, type: 'swap',
          message: `Node was busy. Retrying in ${Math.round(waitMs / 100) / 10}s - your wallet will ask once more.`,
        }),
      });

      setActiveTxHash(hash);
      setTransactionStatus({
        show: true,
        status: 'pending',
        txHash: hash,
        message: 'Swap submitted. Waiting for on-chain confirmation...',
        type: 'swap',
      });
      return hash;
    } catch (err) {
      console.error('Swap execution failed:', err);
      setTransactionStatus({
        show: true,
        status: 'error',
        txHash: null,
        message: describeTxError(err, 'Swap'),
        type: 'swap',
      });
    }
  }, [
    fromToken,
    toToken,
    fromAmount,
    toAmount,
    slippage,
    route,
    userAddress,
    receiver,
    wethAddress,
    entrypointAddress,
    referrerAddress,
    referrerFeeBps,
    publicClient,
    swapWriteAsync,
    getTxGasParams,
  ]);

  // ---------- Native Wrap (GEN -> WGEN) ----------
  const wrapETH = useCallback(async () => {
    if (!fromToken?.isNative || !fromAmount || parseFloat(fromAmount) <= 0) return;
    const amountInWei = parseUnits(fromAmount, 18);

    setTransactionStatus({
      show: true,
      status: 'pending',
      txHash: null,
      message: 'Wrapping GEN to WGEN...',
      type: 'wrap',
    });

    try {
      const gasParams = await getTxGasParams(200000n);
      const hash = await withNodeRetry(() => paced(() => wrapWriteAsync({
        address: wethAddress,
        abi: WETH_ABI,
        functionName: 'deposit',
        value: amountInWei,
        ...gasParams,
      })), { label: 'wrap', ...WALLET_ONE_RETRY,
        onRetry: ({ waitMs }) => setTransactionStatus({
          show: true, status: 'pending', txHash: null, type: 'wrap',
          message: `Node was busy. Retrying in ${Math.round(waitMs / 100) / 10}s - your wallet will ask once more.`,
        }),
      });

      setActiveTxHash(hash);
      setTransactionStatus({
        show: true,
        status: 'pending',
        txHash: hash,
        message: 'Wrap submitted. Waiting for confirmation...',
        type: 'wrap',
      });
      return hash;
    } catch (err) {
      setTransactionStatus({
        show: true,
        status: 'error',
        txHash: null,
        message: describeTxError(err, 'Wrap'),
        type: 'wrap',
      });
    }
  }, [fromToken, fromAmount, wethAddress, wrapWriteAsync, getTxGasParams]);

  // ---------- Native Unwrap (WGEN -> GEN) ----------
  const unwrapWETH = useCallback(async () => {
    if (fromToken?.isNative || !fromAmount || parseFloat(fromAmount) <= 0) return;
    const amountInWei = parseUnits(fromAmount, 18);

    setTransactionStatus({
      show: true,
      status: 'pending',
      txHash: null,
      message: 'Unwrapping WGEN to GEN...',
      type: 'unwrap',
    });

    try {
      const gasParams = await getTxGasParams(200000n);
      const hash = await withNodeRetry(() => paced(() => unwrapWriteAsync({
        address: wethAddress,
        abi: WETH_ABI,
        functionName: 'withdraw',
        args: [amountInWei],
        ...gasParams,
      })), { label: 'unwrap', ...WALLET_ONE_RETRY,
        onRetry: ({ waitMs }) => setTransactionStatus({
          show: true, status: 'pending', txHash: null, type: 'unwrap',
          message: `Node was busy. Retrying in ${Math.round(waitMs / 100) / 10}s - your wallet will ask once more.`,
        }),
      });

      setActiveTxHash(hash);
      setTransactionStatus({
        show: true,
        status: 'pending',
        txHash: hash,
        message: 'Unwrap submitted. Waiting for confirmation...',
        type: 'unwrap',
      });
      return hash;
    } catch (err) {
      setTransactionStatus({
        show: true,
        status: 'error',
        txHash: null,
        message: describeTxError(err, 'Unwrap'),
        type: 'unwrap',
      });
    }
  }, [fromToken, fromAmount, wethAddress, unwrapWriteAsync, getTxGasParams]);

  const resetTransactionStatus = useCallback(() => {
    setTransactionStatus({
      show: false,
      status: '',
      txHash: null,
      message: '',
      type: '',
    });
    setActiveTxHash(null);
  }, []);

  return {
    executeSwap,
    approveToken,
    needsApproval,
    isApproving,
    isSwapping: isSwapping || isTxConfirming,
    transactionStatus,
    resetTransactionStatus,
    wrapETH,
    unwrapWETH,
    refetchAllowance,
    isCheckingAllowance,
  };
}

export default useSwap;