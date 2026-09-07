import { ethers } from 'ethers';
import { getProvider } from '../../lib/providers';
import { CONTRACT_ADDRESSES, NATIVE_TOKEN_ADDRESS } from '../../constants/addresses';
import { findTokenByAddress, getTokensForChain } from '../../constants/tokens';

// AGGFlowSwap Event ABI
const AGGFlowSwapEventAbi = {
  "type": "event",
  "name": "AGGFlowSwap",
  "inputs": [
    { "name": "user", "type": "address", "indexed": true },
    { "name": "referrer", "type": "address", "indexed": true },
    { "name": "tokenIn", "type": "address", "indexed": false },
    { "name": "tokenOut", "type": "address", "indexed": false },
    { "name": "isFeeInInput", "type": "bool", "indexed": false },
    { "name": "amountIn", "type": "uint256", "indexed": false },
    { "name": "amountOut", "type": "uint256", "indexed": false },
    { "name": "referrerFeeBps", "type": "uint256", "indexed": false },
    { "name": "totalFeeBps", "type": "uint256", "indexed": false }
  ],
  "anonymous": false
};

// Default contract deployment block to prevent full-scan RPC timeouts
const START_BLOCKS = {
  4441: 290904,
  11155111: 0
};

// Default token if none is specified: ZKUSDC (0xdf69970B2fE416339187aA41D39882e864984CE9)
const DEFAULT_TOKEN_ADDRESS = '0xdf69970B2fE416339187aA41D39882e864984CE9';

// In-Memory cache for token metadata to avoid RPC spam
const tokenMetadataCache = {};

// Check if address is native token placeholder
function isNativeAddress(address) {
  if (!address) return false;
  const lower = address.toLowerCase();
  return lower === '0x0000000000000000000000000000000000000000' || lower === NATIVE_TOKEN_ADDRESS.toLowerCase();
}

// Fetch token metadata (from local config or query on-chain)
async function getTokenMetadata(tokenAddress, chainId, provider) {
  const normalizedAddr = tokenAddress.toLowerCase();
  const cacheKey = `${chainId}_${normalizedAddr}`;
  if (tokenMetadataCache[cacheKey]) {
    return tokenMetadataCache[cacheKey];
  }

  let metadata;
  if (isNativeAddress(tokenAddress)) {
    metadata = {
      address: NATIVE_TOKEN_ADDRESS,
      symbol: 'zkLTC',
      name: 'zkLTC',
      decimals: 18
    };
  } else {
    // Try to find in local token config list
    const configToken = findTokenByAddress(normalizedAddr, chainId);
    if (configToken) {
      metadata = {
        address: configToken.address,
        symbol: configToken.symbol,
        name: configToken.name,
        decimals: configToken.decimals
      };
    } else {
      // Fallback: Query ERC20 details on-chain
      try {
        const erc20Interface = new ethers.Interface([
          'function symbol() view returns (string)',
          'function name() view returns (string)',
          'function decimals() view returns (uint8)'
        ]);
        const contract = new ethers.Contract(tokenAddress, erc20Interface, provider);
        const [symbol, name, decimals] = await Promise.all([
          contract.symbol().catch(() => 'UNKNOWN'),
          contract.name().catch(() => 'Unknown Token'),
          contract.decimals().catch(() => 18)
        ]);

        metadata = {
          address: tokenAddress,
          symbol,
          name,
          decimals: Number(decimals)
        };
      } catch (error) {
        console.warn(`Failed to query ERC-20 metadata for ${tokenAddress}:`, error.message);
        metadata = {
          address: tokenAddress,
          symbol: 'UNKNOWN',
          name: 'Unknown Token',
          decimals: 18
        };
      }
    }
  }

  tokenMetadataCache[cacheKey] = metadata;
  return metadata;
}

export default async function handler(req, res) {
  // Enable CORS
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
    const { address, token, minSwaps, limit, counterToken, chainId: chainIdQuery, fromBlock: fromBlockQuery, toBlock: toBlockQuery } = params;

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
    // Limit in-memory results array length to prevent massive payloads
    limitCount = Math.min(limitCount, 1000);

    const chainId = chainIdQuery ? Number(chainIdQuery) : 4441;

    // Initialize RPC Provider
    let provider;
    try {
      provider = await getProvider(chainId);
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: `Could not connect to RPC provider for chain ${chainId}`,
        details: err.message
      });
    }

    // Get aggregator entrypoint address for this chain
    const entrypointAddress = CONTRACT_ADDRESSES[chainId]?.aggregatorEntrypoint;
    if (!entrypointAddress) {
      return res.status(400).json({
        success: false,
        error: `Aggregator entrypoint contract address not configured for chain ID ${chainId}.`
      });
    }

    const defaultStartBlock = START_BLOCKS[chainId] || 0;
    const fromBlock = fromBlockQuery ? Number(fromBlockQuery) : defaultStartBlock;
    const toBlock = toBlockQuery ? (toBlockQuery === 'latest' ? 'latest' : Number(toBlockQuery)) : 'latest';

    console.log(`🔍 RPC-Verify swaps: user: ${userAddress}, token: ${tokenAddress}, fromBlock: ${fromBlock}, toBlock: ${toBlock}`);

    // Query AGGFlowSwap logs directly from RPC node
    const filter = {
      address: entrypointAddress,
      topics: [
        ethers.id("AGGFlowSwap(address,address,address,address,bool,uint256,uint256,uint256,uint256)")
      ],
      fromBlock,
      toBlock
    };

    let logs = [];
    try {
      logs = await provider.getLogs(filter);
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: `Failed to retrieve event logs from blockchain RPC node. Query range [${fromBlock} to ${toBlock}] may be too large. Try specifying a closer fromBlock.`,
        details: err.message
      });
    }

    const iface = new ethers.Interface([AGGFlowSwapEventAbi]);
    const matchedSwaps = [];

    // Parse and filter logs in-memory
    for (const log of logs) {
      try {
        const parsed = iface.parseLog({
          topics: [...log.topics],
          data: log.data
        });

        if (parsed && parsed.name === 'AGGFlowSwap') {
          const { user, referrer, tokenIn, tokenOut, isFeeInInput, amountIn, amountOut, totalFeeBps, referrerFeeBps } = parsed.args;

          const lowerUser = user.toLowerCase();
          const lowerIn = tokenIn.toLowerCase();
          const lowerOut = tokenOut.toLowerCase();

          // 1. Filter by userAddress
          if (lowerUser !== userAddress) continue;

          // 2. Filter by main token address (either tokenIn or tokenOut)
          const isTokenIn = lowerIn === tokenAddress;
          const isTokenOut = lowerOut === tokenAddress;
          if (!isTokenIn && !isTokenOut) continue;

          // 3. Filter by counterToken if provided
          if (counterTokenAddress) {
            const isCounterIn = lowerIn === counterTokenAddress;
            const isCounterOut = lowerOut === counterTokenAddress;
            if (!isCounterIn && !isCounterOut) continue;
          }

          matchedSwaps.push({
            txHash: log.transactionHash,
            blockNumber: Number(log.blockNumber),
            user,
            referrer: referrer === ethers.ZeroAddress ? null : referrer,
            tokenIn,
            tokenOut,
            isFeeInInput,
            amountIn,
            amountOut,
            totalFeeBps: Number(totalFeeBps),
            referrerFeeBps: Number(referrerFeeBps),
            type: isTokenIn ? 'sell' : 'buy' // If ZKUSDC went in, user sold it. If ZKUSDC came out, user bought it.
          });
        }
      } catch (e) {
        // parse error, skip
      }
    }

    // Sort by blockNumber descending (newest first)
    matchedSwaps.sort((a, b) => b.blockNumber - a.blockNumber);

    // Slice to the requested limit
    const slicedSwaps = matchedSwaps.slice(0, limitCount);

    // Fetch token metadata for target token and counter token
    const tokenInfo = await getTokenMetadata(tokenAddress, chainId, provider);
    const counterTokenInfo = counterTokenAddress ? await getTokenMetadata(counterTokenAddress, chainId, provider) : null;

    // Fetch block timestamps for the sliced logs to provide accurate time info without overloading the RPC node
    const uniqueBlocks = Array.from(new Set(slicedSwaps.map(s => s.blockNumber)));
    const blockTimestampMap = {};

    // Limit block queries to a reasonable amount (e.g. top 25 unique blocks) to prevent rate limits
    const blocksToQuery = uniqueBlocks.slice(0, 25);
    await Promise.all(
      blocksToQuery.map(async (blockNum) => {
        try {
          const block = await provider.getBlock(blockNum);
          if (block) {
            blockTimestampMap[blockNum] = Number(block.timestamp);
          }
        } catch (err) {
          console.warn(`Failed to fetch timestamp for block ${blockNum}:`, err.message);
        }
      })
    );

    // Format individual swaps
    let aggregatorSwapIn = 0;
    let aggregatorSwapOut = 0;
    let totalVolumeToken = 0;

    const formattedSwaps = slicedSwaps.map(s => {
      const decimals = tokenInfo.decimals || 18;
      const amountInDec = Number(s.amountIn) / 10 ** decimals;
      const amountOutDec = Number(s.amountOut) / 10 ** decimals;

      const isSell = s.type === 'sell';
      if (isSell) {
        aggregatorSwapIn++; // ZKUSDC sold (tokenIn)
        totalVolumeToken += amountInDec;
      } else {
        aggregatorSwapOut++; // ZKUSDC bought (tokenOut)
        totalVolumeToken += amountOutDec;
      }

      const timestamp = blockTimestampMap[s.blockNumber] || null;

      return {
        id: `${s.txHash}-${s.blockNumber}`,
        txHash: s.txHash,
        type: s.type, // 'buy' or 'sell'
        timestamp: timestamp,
        dateTime: timestamp ? new Date(timestamp * 1000).toISOString() : null,
        amountIn: s.amountIn.toString(),
        amountInDecimal: amountInDec,
        amountOut: s.amountOut.toString(),
        amountOutDecimal: amountOutDec
      };
    });

    // Oracle pricing check for major assets
    let tokenPriceUSD = 0;
    try {
      const symbol = tokenInfo.symbol.toUpperCase();
      if (symbol.includes('USD')) {
        tokenPriceUSD = 1.0;
      } else {
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
      console.warn('⚠️ RPC Price adapter check failed:', priceErr.message);
    }

    const totalSwaps = matchedSwaps.length;
    const isEligible = totalSwaps >= minSwapsCount;
    const totalVolumeUSD = totalVolumeToken * tokenPriceUSD;

    return res.status(200).json({
      success: true,
      address: userAddress,
      token: {
        address: tokenAddress,
        symbol: tokenInfo.symbol,
        name: tokenInfo.name,
        decimals: tokenInfo.decimals
      },
      counterToken: counterTokenAddress && counterTokenInfo ? {
        address: counterTokenAddress,
        symbol: counterTokenInfo.symbol,
        name: counterTokenInfo.name,
        decimals: counterTokenInfo.decimals
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
    console.error('❌ ERROR in /api/rpc-verify-swaps:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error.',
      message: error.message
    });
  }
}
