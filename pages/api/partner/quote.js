import { formatUnits, parseUnits, isAddress, getAddress } from 'viem';
import { getBestRouteServer } from '../../../services/quoteService';
import { findTokenByAddress } from '../../../constants/tokens';
import { DEX_CONFIG } from '../../../constants/dex';
import { CONTRACT_ADDRESSES } from '../../../constants/addresses';

const PLATFORM_FEE_BPS = 5; // 0.05% for platform

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { 
    fromToken: fromTokenAddr, 
    toToken: toTokenAddr, 
    amount, 
    chainId = '4441',
    partnerFeeBps: partnerFeeBpsQuery = '10' // Default 0.1%
  } = req.query;

  if (!fromTokenAddr || !toTokenAddr || !amount) {
    return res.status(400).json({ error: 'Missing required parameters: fromToken, toToken, amount' });
  }

  const partnerFeeBps = parseInt(partnerFeeBpsQuery);
  if (isNaN(partnerFeeBps) || partnerFeeBps < 0 || partnerFeeBps > 500) {
    return res.status(400).json({ error: 'Invalid partnerFeeBps: must be between 0 and 500 (5%)' });
  }

  const totalFeeBps = PLATFORM_FEE_BPS + partnerFeeBps;

  try {
    const fromToken = findTokenByAddress(fromTokenAddr, parseInt(chainId));
    const toToken = findTokenByAddress(toTokenAddr, parseInt(chainId));

    if (!fromToken || !toToken) {
      return res.status(404).json({ error: 'Token not found on specified chain' });
    }

    const entrypointAddress = CONTRACT_ADDRESSES[chainId]?.aggregatorEntrypoint;
    const wethAddress = DEX_CONFIG[chainId]?.weth;
    const isWrap = fromToken.isNative && toToken.address === wethAddress;
    const isUnwrap = fromToken.address === wethAddress && toToken.isNative;

    if (isWrap || isUnwrap) {
      return res.status(200).json({
        fromToken: {
          address: fromToken.address,
          symbol: fromToken.symbol,
          decimals: fromToken.decimals
        },
        toToken: {
          address: toToken.address,
          symbol: toToken.symbol,
          decimals: toToken.decimals
        },
        fromAmount: amount,
        toAmount: amount,
        exchangeRate: "1.0",
        totalFeeBps: 0,
        feeAmount: '0',
        route: 'Direct (Wrap/Unwrap)',
        priceImpact: 0,
        spender: isWrap ? wethAddress : '0x0000000000000000000000000000000000000000'
      });
    }

    const route = await getBestRouteServer(parseInt(chainId), fromToken, toToken, amount);

    if (!route) {
      return res.status(404).json({ error: 'No liquidity or route found for this pair' });
    }

    const rawOutputWei = BigInt(route.amountOut.quotient.toString());
    const totalFeeAmountWei = (rawOutputWei * BigInt(totalFeeBps)) / 10000n;
    const partnerFeeAmountWei = (rawOutputWei * BigInt(partnerFeeBps)) / 10000n;
    const platformFeeAmountWei = (rawOutputWei * BigInt(PLATFORM_FEE_BPS)) / 10000n;
    const netOutputWei = rawOutputWei - totalFeeAmountWei;

    const toAmount = formatUnits(netOutputWei, toToken.decimals);
    const feeAmount = formatUnits(totalFeeAmountWei, toToken.decimals);
    const partnerFeeAmount = formatUnits(partnerFeeAmountWei, toToken.decimals);
    const platformFeeAmount = formatUnits(platformFeeAmountWei, toToken.decimals);
    
    const exchangeRate = (parseFloat(toAmount) / parseFloat(amount)).toString();

    return res.status(200).json({
      fromToken: {
        address: fromToken.address,
        symbol: fromToken.symbol,
        decimals: fromToken.decimals
      },
      toToken: {
        address: toToken.address,
        symbol: toToken.symbol,
        decimals: toToken.decimals
      },
      fromAmount: amount,
      toAmount,
      exchangeRate,
      totalFeeBps,
      platformFeeBps: PLATFORM_FEE_BPS,
      partnerFeeBps,
      feeAmount,
      partnerFeeAmount,
      platformFeeAmount,
      priceImpact: 0, 
      route: {
        dexName: route.dexName,
        poolType: route.poolType,
        poolAddress: route.poolAddress
      },
      spender: entrypointAddress
    });
  } catch (err) {
    console.error('Partner quote error:', err);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
}
