// pages/api/db-verify-swaps.js
// API Endpoint to verify token swap counts for quest building using the local MongoDB database.

import { getDb } from '../../lib/mongodb.js';
import { ethers } from 'ethers';

// Default token if none is specified: ZKUSDC
const DEFAULT_TOKEN_ADDRESS = '0xdf69970B2fE416339187aA41D39882e864984CE9';

export default async function handler(req, res) {
  // CORS Headers Configuration
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const params = req.method === 'POST' ? req.body : req.query;
    const { address, token, minSwaps, limit, counterToken } = params;

    // 1. Validation
    if (!address) {
      return res.status(400).json({
        success: false,
        error: 'Required parameter "address" (user wallet) is missing.'
      });
    }

    const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/;
    if (!ethAddressRegex.test(address)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid "address" format. Must be a valid 40-character hexadecimal Ethereum address starting with 0x.'
      });
    }

    const userAddress = address.toLowerCase();
    const tokenAddress = (token || DEFAULT_TOKEN_ADDRESS).toLowerCase();

    if (!ethAddressRegex.test(tokenAddress)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid "token" address format. Must be a valid 40-character hexadecimal Ethereum address starting with 0x.'
      });
    }

    const counterTokenAddress = counterToken ? counterToken.toLowerCase() : null;
    if (counterTokenAddress && !ethAddressRegex.test(counterTokenAddress)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid "counterToken" address format. Must be a valid 40-character hexadecimal Ethereum address starting with 0x.'
      });
    }

    const minSwapsCount = parseInt(minSwaps || '1', 10);
    if (isNaN(minSwapsCount) || minSwapsCount < 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid "minSwaps" parameter. Must be a positive integer.'
      });
    }

    let limitCount = parseInt(limit || '1000', 10);
    if (isNaN(limitCount) || limitCount <= 0) {
      limitCount = 1000;
    }
    limitCount = Math.min(limitCount, 1000);

    console.log(`🔍 DB-Verify Swaps: user: ${userAddress}, token: ${tokenAddress}, counter: ${counterTokenAddress}`);

    // 2. Connect to Database
    const db = await getDb();

    // 3. Build MongoDB Query
    // Query finds transactions where userAddress matches AND the token address is either fromToken or toToken
    const query = {
      userAddress: userAddress,
    };

    if (counterTokenAddress) {
      // Find swaps specifically between tokenAddress and counterTokenAddress
      query.$and = [
        {
          $or: [
            { "fromToken.address": tokenAddress },
            { "toToken.address": tokenAddress }
          ]
        },
        {
          $or: [
            { "fromToken.address": counterTokenAddress },
            { "toToken.address": counterTokenAddress }
          ]
        }
      ];
    } else {
      // Find swaps involving tokenAddress
      query.$or = [
        { "fromToken.address": tokenAddress },
        { "toToken.address": tokenAddress }
      ];
    }

    // Query transactions from MongoDB (sorted by timestamp descending)
    const swaps = await db.collection('transactions')
      .find(query)
      .sort({ timestamp: -1 })
      .limit(limitCount)
      .toArray();

    // 4. Calculate stats and formats
    let aggregatorSwapIn = 0;
    let aggregatorSwapOut = 0;
    let totalVolumeToken = 0;
    let totalVolumeUSD = 0;

    let targetTokenMeta = null;
    let counterTokenMeta = null;

    const formattedSwaps = swaps.map(s => {
      const isSell = s.fromToken?.address?.toLowerCase() === tokenAddress;
      
      // Extract target token details from logs
      if (!targetTokenMeta) {
        targetTokenMeta = isSell ? s.fromToken : s.toToken;
      }
      if (counterTokenAddress && !counterTokenMeta) {
        counterTokenMeta = isSell ? s.toToken : s.fromToken;
      }

      // Sum quantities and counts
      if (isSell) {
        aggregatorSwapIn++; // Sold target token
        totalVolumeToken += parseFloat(s.amount || '0');
      } else {
        aggregatorSwapOut++; // Bought target token
        // If they bought target token, we can get amount out from target token decimals
        // However, s.amount typically represents the input amount. If we need tokenOut amount,
        // we can fetch it, or fallback.
        // Let's assume s.amount is input amount.
        const estAmountOut = s.toToken?.address?.toLowerCase() === tokenAddress 
          ? (s.amountOutDecimal || parseFloat(s.amount || '0')) // fallback to amount if not recorded
          : parseFloat(s.amount || '0');
        totalVolumeToken += estAmountOut;
      }

      totalVolumeUSD += s.usdValue || 0;

      return {
        id: s._id.toString(),
        txHash: s.transactionHash,
        type: isSell ? 'sell' : 'buy',
        timestamp: s.timestamp ? Math.floor(new Date(s.timestamp).getTime() / 1000) : null,
        dateTime: s.timestamp ? new Date(s.timestamp).toISOString() : null,
        amountIn: s.amount?.toString() || "0",
        amountInDecimal: s.fromToken?.address?.toLowerCase() === tokenAddress ? parseFloat(s.amount || '0') : 0,
        amountOut: s.amountOutDecimal?.toString() || s.amount?.toString() || "0",
        amountOutDecimal: s.toToken?.address?.toLowerCase() === tokenAddress ? parseFloat(s.amount || '0') : 0
      };
    });

    // Fallback metadata if no swaps were found
    if (!targetTokenMeta) {
      targetTokenMeta = {
        address: tokenAddress,
        symbol: 'UNKNOWN',
        name: 'Unknown Token',
        decimals: 18
      };
    }

    // 5. Query live price from Dia Oracle on-chain
    let tokenPriceUSD = 0;
    try {
      const symbol = (targetTokenMeta.symbol || '').toUpperCase();
      if (symbol.includes('USD')) {
        tokenPriceUSD = 1.0;
      } else {
        const rpcUrl = 'https://liteforge.rpc.caldera.xyz/infra-partner-http';
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const adapters = {
          'LTC': '0x45dDa5d881BD2C917976CCfde74fFd6f6412da29',
          'ZKLTC': '0x45dDa5d881BD2C917976CCfde74fFd6f6412da29',
          'WZKLTC': '0x45dDa5d881BD2C917976CCfde74fFd6f6412da29',
          'ETH': '0xc760B46beF9eD3F9A3d2b825164324D6703F0185',
          'WETH': '0xc760B46beF9eD3F9A3d2b825164324D6703F0185',
          'BTC': '0x7d0445782E383223c7B4B660bb96b87213e9b605',
          'WBTC': '0x7d0445782E383223c7B4B660bb96b87213e9b605'
        };
        const adapterAddress = adapters[symbol];
        if (adapterAddress) {
          const adapterContract = new ethers.Contract(
            adapterAddress,
            ['function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)'],
            provider
          );
          const [, answer] = await adapterContract.latestRoundData();
          tokenPriceUSD = Number(ethers.formatUnits(answer, 18));
        }
      }
    } catch (priceErr) {
      console.warn('⚠️ Oracle price fetch failed, defaulting to 0:', priceErr.message);
    }

    const totalSwaps = formattedSwaps.length;
    const isEligible = totalSwaps >= minSwapsCount;

    return res.status(200).json({
      success: true,
      address: userAddress,
      token: {
        address: tokenAddress,
        symbol: targetTokenMeta.symbol,
        name: targetTokenMeta.name,
        decimals: targetTokenMeta.decimals
      },
      counterToken: counterTokenAddress ? {
        address: counterTokenAddress,
        symbol: counterTokenMeta?.symbol || 'UNKNOWN',
        name: counterTokenMeta?.name || 'Unknown Token',
        decimals: counterTokenMeta?.decimals || 18
      } : null,
      verification: {
        totalSwaps,
        aggregatorSwaps: {
          total: totalSwaps,
          swappedIn: aggregatorSwapIn,
          swappedOut: aggregatorSwapOut
        },
        directPoolSwaps: {
          total: 0,
          v2: 0,
          v3: 0
        },
        totalVolumeToken,
        totalVolumeUSD,
        tokenPriceUSD,
        minSwapsRequired: minSwapsCount,
        isEligible,
        remainingSwapsNeeded: Math.max(0, minSwapsCount - totalSwaps)
      },
      proofs: {
        swapCount: formattedSwaps.length,
        swaps: formattedSwaps
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ ERROR in /api/db-verify-swaps:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Internal server error.',
      message: error.message
    });
  }
}
