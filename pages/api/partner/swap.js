import { parseUnits, zeroAddress, encodeFunctionData, isAddress, getAddress } from 'viem';
import { getBestRouteServer } from '../../../services/quoteService';
import { findTokenByAddress } from '../../../constants/tokens';
import { buildProgram } from '../../../utils/programBuilder';
import { DEX_CONFIG } from '../../../constants/dex';
import { CONTRACT_ADDRESSES } from '../../../constants/addresses';
import AGGFLOW_ENTRYPOINT_ABI from '../../../abi/AGGFlowEntrypoint.json';

const PLATFORM_FEE_COLLECTOR = CONTRACT_ADDRESSES[4441]?.dexFeeVault || '0xF2DF37067a8Af0e9ae617c96C887B2FdA8eA3f10';
const PLATFORM_FEE_BPS = 5n; // 0.05% for platform

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { 
    fromToken: fromTokenAddr, 
    toToken: toTokenAddr, 
    amount, 
    userAddress, 
    referrerAddress,
    partnerFeeBps: partnerFeeBpsInput = 10, // Default 0.1%
    slippage = 0.5,
    chainId = '4441' 
  } = req.body;

  if (!fromTokenAddr || !toTokenAddr || !amount || !userAddress) {
    return res.status(400).json({ error: 'Missing required parameters: fromToken, toToken, amount, userAddress' });
  }

  const partnerFeeBps = BigInt(partnerFeeBpsInput);
  if (partnerFeeBps < 0n || partnerFeeBps > 500n) {
    return res.status(400).json({ error: 'Invalid partnerFeeBps: must be between 0 and 500 (5%)' });
  }

  if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  if (!isAddress(userAddress)) {
    return res.status(400).json({ error: 'Invalid userAddress' });
  }

  if (referrerAddress && !isAddress(referrerAddress)) {
    return res.status(400).json({ error: 'Invalid referrerAddress' });
  }

  try {
    const fromToken = findTokenByAddress(fromTokenAddr, parseInt(chainId));
    const toToken = findTokenByAddress(toTokenAddr, parseInt(chainId));

    if (!fromToken || !toToken) {
      return res.status(404).json({ error: 'Token not found' });
    }

    const entrypointAddress = CONTRACT_ADDRESSES[chainId]?.aggregatorEntrypoint;
    const wethAddress = DEX_CONFIG[chainId]?.weth;

    if (!entrypointAddress) {
      return res.status(500).json({ error: 'Aggregator not configured for this chain' });
    }

    // Handle Wrap/Unwrap
    const isWrap = fromToken.isNative && toToken.address === wethAddress;
    const isUnwrap = fromToken.address === wethAddress && toToken.isNative;

    if (isWrap || isUnwrap) {
      const amountWei = parseUnits(amount, 18);
      let data;
      let to;
      
      if (isWrap) {
        to = wethAddress;
        data = encodeFunctionData({
          abi: [{ name: 'deposit', type: 'function', inputs: [], outputs: [], stateMutability: 'payable' }],
          functionName: 'deposit',
        });
      } else {
        to = wethAddress;
        data = encodeFunctionData({
          abi: [{ name: 'withdraw', type: 'function', inputs: [{ name: 'wad', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' }],
          functionName: 'withdraw',
          args: [amountWei]
        });
      }

      return res.status(200).json({
        transaction: {
          to,
          data,
          value: isWrap ? amountWei.toString() : '0',
          chainId: parseInt(chainId)
        },
        spender: isWrap ? wethAddress : '0x0000000000000000000000000000000000000000'
      });
    }

    // Get best route for aggregator
    const route = await getBestRouteServer(parseInt(chainId), fromToken, toToken, amount);

    if (!route) {
      return res.status(404).json({ error: 'No route found' });
    }

    const amountInWei = parseUnits(amount, fromToken.decimals);
    const rawOutputWei = BigInt(route.amountOut.quotient.toString());
    
    // Calculate net amount after platform + partner fee
    const totalFeeBps = PLATFORM_FEE_BPS + partnerFeeBps;
    const netOutputWei = (rawOutputWei * (10000n - totalFeeBps)) / 10000n;
    
    // Apply slippage
    const slipFactor = BigInt(Math.floor((1 - parseFloat(slippage) / 100) * 10000));
    const minAmountOut = (netOutputWei * slipFactor) / 10000n;

    let program;
    try {
      program = buildProgram(fromToken, toToken, route, wethAddress);
    } catch (e) {
      return res.status(500).json({ error: 'Failed to build swap program', message: e.message });
    }

    const swapIntent = [
      toToken.isNative ? zeroAddress : getAddress(toToken.address),
      minAmountOut,
      fromToken.isNative ? zeroAddress : getAddress(fromToken.address),
      amountInWei,
    ];

    const feeCollection = [
      getAddress(PLATFORM_FEE_COLLECTOR),
      PLATFORM_FEE_BPS,
      referrerAddress ? getAddress(referrerAddress) : zeroAddress,
      referrerAddress ? partnerFeeBps : 0n,
      false, // Take fee from output token
    ];

    const data = encodeFunctionData({
      abi: AGGFLOW_ENTRYPOINT_ABI,
      functionName: 'executeSwap',
      args: [swapIntent, feeCollection, program],
    });

    return res.status(200).json({
      transaction: {
        to: entrypointAddress,
        data,
        value: fromToken.isNative ? amountInWei.toString() : '0',
        chainId: parseInt(chainId)
      },
      estimate: {
        fromAmount: amount,
        toAmount: (Number(netOutputWei) / 10 ** toToken.decimals).toString(),
        minAmountOut: (Number(minAmountOut) / 10 ** toToken.decimals).toString(),
        totalFee: (Number(rawOutputWei - netOutputWei) / 10 ** toToken.decimals).toString(),
        platformFeeBps: Number(PLATFORM_FEE_BPS),
        partnerFeeBps: Number(partnerFeeBps)
      },
      spender: entrypointAddress
    });

  } catch (err) {
    console.error('Partner swap error:', err);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
}
