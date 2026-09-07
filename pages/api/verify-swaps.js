// pages/api/verify-swaps.js
// API Endpoint to verify token swap counts for quest building using the Goldsky Subgraph.
import { ethers } from 'ethers';

const SUBGRAPH_URL = 'https://api.goldsky.com/api/public/project_cmrgg88kjt8sw01wxhc9476jr/subgraphs/flipswap-v2/1.0.3/gn';

// Default token if none is specified: 0xdf69970B2fE416339187aA41D39882e864984CE9
const DEFAULT_TOKEN_ADDRESS = '0xdf69970B2fE416339187aA41D39882e864984CE9';

// Wrapped zkLTC ERC-20 on LitVM (native zkLTC is the gas token; DEX pools use this wrapped version)
// Use this as `counterToken` when querying pairs against native zkLTC (e.g. AURA/zkLTC)
const WZKLTC_ADDRESS = '0x315374AA9b5536037Cc1Efeea2439CCC0913A77e';

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
    // Extract parameters from either query (GET) or body (POST)
    const params = req.method === 'POST' ? req.body : req.query;
    const { address, token, minSwaps, limit, counterToken } = params;

    // 1. Validation
    if (!address) {
      return res.status(400).json({
        success: false,
        error: 'Required parameter "address" (user wallet) is missing.'
      });
    }

    // Verify EVM address format
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

    // Optional limit parameter (defaults to 1000, max allowed in standard Graph query is 1000)
    let limitCount = parseInt(limit || '1000', 10);
    if (isNaN(limitCount) || limitCount <= 0) {
      limitCount = 1000;
    }
    // Hard cap at 1000 due to Graph node max-first restrictions
    limitCount = Math.min(limitCount, 1000);

    console.log(`🔍 Verifying swaps for user: ${userAddress} on token: ${tokenAddress} (minSwaps: ${minSwapsCount}, limit: ${limitCount}${counterTokenAddress ? `, counterToken: ${counterTokenAddress}` : ''})`);

    // 2. Query Goldsky Subgraph
    // If counterTokenAddress is provided, we filter the aggregatorSwaps in the subgraph query itself
    let swapsInWhere = '{ user: $user, tokenIn: $token }';
    let swapsOutWhere = '{ user: $user, tokenOut: $token }';
    
    if (counterTokenAddress) {
      swapsInWhere = '{ user: $user, tokenIn: $token, tokenOut: $counterToken }';
      swapsOutWhere = '{ user: $user, tokenOut: $token, tokenIn: $counterToken }';
    }

    const query = `
      query UserQuestVerification($user: String!, $token: String!, $userTokenStatId: ID!, $limit: Int!, $counterToken: String) {
        token(id: $token) {
          id
          symbol
          name
          decimals
        }
        ${counterTokenAddress ? `counterToken: token(id: $counterToken) { id symbol name decimals }` : ''}
        userTokenStat(id: $userTokenStatId) {
          id
          aggregatorSwapInCount
          aggregatorSwapOutCount
          v2SwapCount
          v3SwapCount
          aggregatorVolumeIn
          aggregatorVolumeOut
          v2Volume
          v3Volume
        }
        swapsIn: aggregatorSwaps(
          where: ${swapsInWhere}
          orderBy: timestamp
          orderDirection: desc
          first: $limit
        ) {
          id
          txHash
          timestamp
          amountIn
          amountInDecimal
          amountOut
          amountOutDecimal
        }
        swapsOut: aggregatorSwaps(
          where: ${swapsOutWhere}
          orderBy: timestamp
          orderDirection: desc
          first: $limit
        ) {
          id
          txHash
          timestamp
          amountIn
          amountInDecimal
          amountOut
          amountOutDecimal
        }
      }
    `;

    const userTokenStatId = `${userAddress}-${tokenAddress}`;

    const variables = {
      user: userAddress,
      token: tokenAddress,
      userTokenStatId,
      limit: limitCount
    };

    if (counterTokenAddress) {
      variables.counterToken = counterTokenAddress;
    }

    const response = await fetch(SUBGRAPH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables
      }),
    });

    if (!response.ok) {
      throw new Error(`Goldsky Subgraph returned HTTP status ${response.status}`);
    }

    const result = await response.json();

    if (result.errors) {
      console.error('🔴 Subgraph Query Errors:', result.errors);
      return res.status(500).json({
        success: false,
        error: 'Error querying indexer subgraph.',
        details: result.errors
      });
    }

    const data = result.data || {};
    const tokenInfo = data.token || {
      id: tokenAddress,
      symbol: 'UNKNOWN',
      name: 'Unknown Token',
      decimals: 18
    };

    const stat = data.userTokenStat;

    // 3. Count Swaps and Volume
    let aggregatorSwapIn;
    let aggregatorSwapOut;
    let v2SwapCount;
    let v3SwapCount;
    let totalAggregatorSwaps;
    let totalDirectPoolSwaps;
    let totalSwaps;
    let totalVolumeToken;

    if (counterTokenAddress) {
      // Filtered to only this pair!
      // In swapsIn: target token is tokenIn. So amountInDecimal is the target token volume sold.
      // In swapsOut: target token is tokenOut. So amountOutDecimal is the target token volume bought.
      const swapsInList = data.swapsIn || [];
      const swapsOutList = data.swapsOut || [];

      aggregatorSwapIn = swapsOutList.length; // bought target token
      aggregatorSwapOut = swapsInList.length; // sold target token
      totalAggregatorSwaps = aggregatorSwapIn + aggregatorSwapOut;
      totalDirectPoolSwaps = 0; // cannot filter pool swaps in current userTokenStat structure
      v2SwapCount = 0;
      v3SwapCount = 0;
      totalSwaps = totalAggregatorSwaps;

      const volumeSold = swapsInList.reduce((acc, s) => acc + parseFloat(s.amountInDecimal || '0'), 0);
      const volumeBought = swapsOutList.reduce((acc, s) => acc + parseFloat(s.amountOutDecimal || '0'), 0);
      totalVolumeToken = volumeSold + volumeBought;
    } else {
      // Global stats across all pairs
      aggregatorSwapIn = stat ? parseInt(stat.aggregatorSwapInCount || '0', 10) : 0;
      aggregatorSwapOut = stat ? parseInt(stat.aggregatorSwapOutCount || '0', 10) : 0;
      v2SwapCount = stat ? parseInt(stat.v2SwapCount || '0', 10) : 0;
      v3SwapCount = stat ? parseInt(stat.v3SwapCount || '0', 10) : 0;

      totalAggregatorSwaps = aggregatorSwapIn + aggregatorSwapOut;
      totalDirectPoolSwaps = v2SwapCount + v3SwapCount;
      totalSwaps = totalAggregatorSwaps + totalDirectPoolSwaps;

      const aggregatorVolumeIn = stat ? parseFloat(stat.aggregatorVolumeIn || '0') : 0;
      const aggregatorVolumeOut = stat ? parseFloat(stat.aggregatorVolumeOut || '0') : 0;
      const v2Volume = stat ? parseFloat(stat.v2Volume || '0') : 0;
      const v3Volume = stat ? parseFloat(stat.v3Volume || '0') : 0;
      totalVolumeToken = aggregatorVolumeIn + aggregatorVolumeOut + v2Volume + v3Volume;
    }

    // Fetch live price from DIA Oracle on-chain using RPC provider
    let tokenPriceUSD = 0;
    
    try {
      const symbol = tokenInfo.symbol.toUpperCase();
      
      // 1. Stablecoins pegged to $1
      if (symbol.includes('USD')) {
        tokenPriceUSD = 1.0;
      } else {
        // 2. Fetch from DIA Oracle adapters on-chain
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

    const totalVolumeUSD = totalVolumeToken * tokenPriceUSD;

    // Check Eligibility
    const isEligible = totalSwaps >= minSwapsCount;

    // Format individual swap transactions (proof logs)
    const formatSwaps = (swaps, type) => {
      return (swaps || []).map(s => ({
        id: s.id,
        txHash: s.txHash,
        type: type, // 'buy' or 'sell'
        timestamp: parseInt(s.timestamp, 10),
        dateTime: new Date(parseInt(s.timestamp, 10) * 1000).toISOString(),
        amountIn: s.amountIn,
        amountInDecimal: parseFloat(s.amountInDecimal || '0'),
        amountOut: s.amountOut,
        amountOutDecimal: parseFloat(s.amountOutDecimal || '0')
      }));
    };

    const swapsInFormatted = formatSwaps(data.swapsIn, 'buy'); // Swapping some other token IN to get this token
    const swapsOutFormatted = formatSwaps(data.swapsOut, 'sell'); // Swapping this token OUT to get some other token
    
    // Combine and sort swaps by timestamp (newest first)
    const allSwaps = [...swapsInFormatted, ...swapsOutFormatted].sort((a, b) => b.timestamp - a.timestamp);

    // 4. Return API Response
    return res.status(200).json({
      success: true,
      address: userAddress,
      token: {
        address: tokenAddress,
        symbol: tokenInfo.symbol,
        name: tokenInfo.name,
        decimals: tokenInfo.decimals
      },
      counterToken: counterTokenAddress && data.counterToken ? {
        address: counterTokenAddress,
        symbol: data.counterToken.symbol,
        name: data.counterToken.name,
        decimals: data.counterToken.decimals
      } : null,
      verification: {
        totalSwaps,
        aggregatorSwaps: {
          total: totalAggregatorSwaps,
          swappedIn: aggregatorSwapIn,
          swappedOut: aggregatorSwapOut
        },
        directPoolSwaps: {
          total: totalDirectPoolSwaps,
          v2: v2SwapCount,
          v3: v3SwapCount
        },
        totalVolumeToken,
        totalVolumeUSD,
        tokenPriceUSD,
        minSwapsRequired: minSwapsCount,
        isEligible,
        remainingSwapsNeeded: Math.max(0, minSwapsCount - totalSwaps)
      },
      proofs: {
        swapCount: allSwaps.length,
        swaps: allSwaps
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ ERROR in /api/verify-swaps:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Internal server error.',
      message: error.message
    });
  }
}
