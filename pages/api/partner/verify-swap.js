import { ethers } from 'ethers';
import { getProvider } from '../../../lib/providers';
import { CONTRACT_ADDRESSES, NATIVE_TOKEN_ADDRESS } from '../../../constants/addresses';
import { findTokenByAddress, getTokensForChain } from '../../../constants/tokens';

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
  
  // Check in-memory cache first
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

  // Save to cache
  tokenMetadataCache[cacheKey] = metadata;
  return metadata;
}

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { txHash, tokenAddress, tokenSymbol, userAddress, chainId: chainIdQuery, fromBlock: fromBlockQuery, toBlock: toBlockQuery } = req.query;
    const chainId = chainIdQuery ? Number(chainIdQuery) : 4441; // Default to LitVM

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

    // Case 1: Specific Transaction Verification (RPC On-Chain lookup)
    if (txHash) {
      // Validate txHash format
      if (!/^0x([A-Fa-f0-9]{64})$/.test(txHash)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid transaction hash format. Must be a valid 32-byte hex string starting with 0x.'
        });
      }

      console.log(`🔍 Verifying tx ${txHash} on chain ${chainId}`);

      let receipt = null;
      try {
        receipt = await provider.getTransactionReceipt(txHash);
      } catch (err) {
        return res.status(500).json({
          success: false,
          error: `Error querying transaction receipt for hash: ${txHash}`,
          details: err.message
        });
      }

      // If transaction not found on-chain
      if (!receipt) {
        return res.status(404).json({
          success: false,
          swapped: false,
          error: 'Transaction receipt not found on-chain.'
        });
      }

      // If transaction failed/reverted on-chain
      if (receipt.status !== 1) {
        return res.status(200).json({
          success: true,
          swapped: false,
          source: 'blockchain',
          status: 'failed',
          message: 'Transaction was reverted on-chain.'
        });
      }

      // Search receipt logs for the AGGFlowSwap event
      const iface = new ethers.Interface([AGGFlowSwapEventAbi]);
      let swapLogParsed = null;
      let logAddress = '';

      for (const log of receipt.logs) {
        if (log.address.toLowerCase() === entrypointAddress.toLowerCase()) {
          try {
            const parsed = iface.parseLog({
              topics: [...log.topics],
              data: log.data
            });
            if (parsed && parsed.name === 'AGGFlowSwap') {
              swapLogParsed = parsed;
              logAddress = log.address;
              break;
            }
          } catch (e) {
            // Not our event or parse error, skip
          }
        }
      }

      if (!swapLogParsed) {
        return res.status(200).json({
          success: true,
          swapped: false,
          source: 'blockchain',
          status: 'completed',
          message: 'Transaction succeeded but is not a LitvmSwap aggregator swap transaction.'

        });
      }

      // Fetch block for timestamp
      let block = null;
      try {
        block = await provider.getBlock(receipt.blockNumber);
      } catch (err) {
        console.warn(`Failed to fetch block for number ${receipt.blockNumber}:`, err.message);
      }
      const timestamp = block ? Number(block.timestamp) : Math.floor(Date.now() / 1000);

      // Extract values from log
      const { user, referrer, tokenIn, tokenOut, isFeeInInput, amountIn, amountOut, referrerFeeBps, totalFeeBps } = swapLogParsed.args;

      // Get metadata & format amounts
      const [tokenInMeta, tokenOutMeta] = await Promise.all([
        getTokenMetadata(tokenIn, chainId, provider),
        getTokenMetadata(tokenOut, chainId, provider)
      ]);

      const formattedAmountIn = (Number(amountIn) / 10 ** tokenInMeta.decimals).toFixed(tokenInMeta.decimals > 8 ? 6 : tokenInMeta.decimals);
      const formattedAmountOut = (Number(amountOut) / 10 ** tokenOutMeta.decimals).toFixed(tokenOutMeta.decimals > 8 ? 6 : tokenOutMeta.decimals);

      return res.status(200).json({
        success: true,
        swapped: true,
        source: 'blockchain',
        verification: {
          txHash: receipt.hash,
          status: 'success',
          blockNumber: Number(receipt.blockNumber),
          timestamp,
          time: new Date(timestamp * 1000).toISOString(),
          aggregatorAddress: logAddress,
          swap: {
            user,
            referrer: referrer === ethers.ZeroAddress ? null : referrer,
            tokenIn: {
              address: tokenInMeta.address,
              symbol: tokenInMeta.symbol,
              name: tokenInMeta.name,
              decimals: tokenInMeta.decimals,
              amount: formattedAmountIn,
              rawAmount: amountIn.toString()
            },
            tokenOut: {
              address: tokenOutMeta.address,
              symbol: tokenOutMeta.symbol,
              name: tokenOutMeta.name,
              decimals: tokenOutMeta.decimals,
              amount: formattedAmountOut,
              rawAmount: amountOut.toString()
            },
            isFeeInInput,
            totalFeeBps: Number(totalFeeBps),
            referrerFeeBps: Number(referrerFeeBps)
          }
        }
      });
    }

    // Case 2: Query Swap History & Aggregate Stats via On-Chain Logs (Database-Free)
    if (tokenAddress || tokenSymbol || userAddress) {
      console.log(`📂 Database-free log query. filters: tokenAddress=${tokenAddress}, tokenSymbol=${tokenSymbol}, userAddress=${userAddress}`);

      // Resolve targets
      let targetAddresses = [];
      let queryTokenSymbol = tokenSymbol || null;

      if (tokenAddress) {
        targetAddresses.push(tokenAddress.toLowerCase());
      } else if (tokenSymbol) {
        // Resolve known symbols
        const tokens = getTokensForChain(chainId);
        const match = tokens.filter(t => t.symbol.toLowerCase() === tokenSymbol.toLowerCase());
        if (match.length > 0) {
          targetAddresses = match.map(m => m.address.toLowerCase());
        }
      }

      const defaultStartBlock = START_BLOCKS[chainId] || 0;
      const fromBlock = fromBlockQuery ? Number(fromBlockQuery) : defaultStartBlock;
      const toBlock = toBlockQuery ? (toBlockQuery === 'latest' ? 'latest' : Number(toBlockQuery)) : 'latest';

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
          error: 'Failed to retrieve event logs from blockchain RPC node',
          details: err.message
        });
      }

      const iface = new ethers.Interface([AGGFlowSwapEventAbi]);
      const swaps = [];

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

            // Filter by token (symbol or address) if requested
            if (targetAddresses.length > 0) {
              const matchesToken = targetAddresses.includes(lowerIn) || targetAddresses.includes(lowerOut);
              if (!matchesToken) continue;
            } else if (queryTokenSymbol) {
              // If not found in our list, we query metadata on-chain to match by symbol
              const [inMeta, outMeta] = await Promise.all([
                getTokenMetadata(tokenIn, chainId, provider),
                getTokenMetadata(tokenOut, chainId, provider)
              ]);
              const matchesSymbol = inMeta.symbol.toLowerCase() === queryTokenSymbol.toLowerCase() || 
                                    outMeta.symbol.toLowerCase() === queryTokenSymbol.toLowerCase();
              if (!matchesSymbol) continue;
            }

            // Filter by userAddress if requested
            if (userAddress && lowerUser !== userAddress.toLowerCase()) {
              continue;
            }

            swaps.push({
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
              referrerFeeBps: Number(referrerFeeBps)
            });
          }
        } catch (e) {
          // parse log error, skip
        }
      }

      // Sort by blockNumber descending (newest first)
      swaps.sort((a, b) => b.blockNumber - a.blockNumber);

      // Take the top 50 most recent swaps for details
      const recentSwaps = swaps.slice(0, 50);

      // Load token metadata for unique tokens to format amounts
      const uniqueTokenAddresses = Array.from(new Set(
        recentSwaps.flatMap(s => [s.tokenIn, s.tokenOut])
      ));
      
      const tokenMetadata = {};
      await Promise.all(
        uniqueTokenAddresses.map(async (addr) => {
          tokenMetadata[addr.toLowerCase()] = await getTokenMetadata(addr, chainId, provider);
        })
      );

      // Format individual swaps
      const formattedSwaps = recentSwaps.map(s => {
        const inMeta = tokenMetadata[s.tokenIn.toLowerCase()] || { symbol: 'UNKNOWN', decimals: 18 };
        const outMeta = tokenMetadata[s.tokenOut.toLowerCase()] || { symbol: 'UNKNOWN', decimals: 18 };

        return {
          txHash: s.txHash,
          blockNumber: s.blockNumber,
          userAddress: s.user,
          fromToken: {
            address: s.tokenIn,
            symbol: inMeta.symbol,
            decimals: inMeta.decimals
          },
          toToken: {
            address: s.tokenOut,
            symbol: outMeta.symbol,
            decimals: outMeta.decimals
          },
          amount: (Number(s.amountIn) / 10 ** inMeta.decimals).toFixed(inMeta.decimals > 8 ? 6 : inMeta.decimals),
          amountOut: (Number(s.amountOut) / 10 ** outMeta.decimals).toFixed(outMeta.decimals > 8 ? 6 : outMeta.decimals),
          timestamp: null, // block timestamps must be loaded individually, omitted for batch speed unless queried singly
          status: 'completed'
        };
      });

      // 1. Calculate Aggregate Summaries in Token Units (since we don't have a DB for USD prices)
      const uniqueUsers = new Set(swaps.map(s => s.user.toLowerCase()));
      
      // Compute total volume per token swapped
      const volumes = {};
      for (const s of swaps) {
        // Resolve Token In
        const inKey = s.tokenIn.toLowerCase();
        if (!volumes[inKey]) volumes[inKey] = { symbol: '', totalSold: 0n, totalBought: 0n, decimals: 18 };
        volumes[inKey].totalSold += BigInt(s.amountIn.toString());

        // Resolve Token Out
        const outKey = s.tokenOut.toLowerCase();
        if (!volumes[outKey]) volumes[outKey] = { symbol: '', totalSold: 0n, totalBought: 0n, decimals: 18 };
        volumes[outKey].totalBought += BigInt(s.amountOut.toString());
      }

      // Populate symbols/decimals for volume breakdown
      await Promise.all(
        Object.keys(volumes).map(async (addr) => {
          const meta = await getTokenMetadata(addr, chainId, provider);
          volumes[addr].symbol = meta.symbol;
          volumes[addr].decimals = meta.decimals;
        })
      );

      const formattedVolumes = {};
      Object.entries(volumes).forEach(([addr, v]) => {
        formattedVolumes[v.symbol || addr] = {
          address: addr,
          totalAmountSold: (Number(v.totalSold) / 10 ** v.decimals).toFixed(4),
          totalAmountBought: (Number(v.totalBought) / 10 ** v.decimals).toFixed(4)
        };
      });

      // 2. Fetch Leaderboard (User Breakdown by swap count)
      const userSwaps = {};
      for (const s of swaps) {
        const u = s.user.toLowerCase();
        if (!userSwaps[u]) userSwaps[u] = 0;
        userSwaps[u]++;
      }

      const participants = Object.entries(userSwaps)
        .map(([userAddress, swapsCount]) => ({
          userAddress,
          swapsCount
        }))
        .sort((a, b) => b.swapsCount - a.swapsCount)
        .slice(0, 20);

      return res.status(200).json({
        success: true,
        source: 'blockchain_rpc',
        filter: {
          tokenAddress: tokenAddress || null,
          tokenSymbol: tokenSymbol || null,
          userAddress: userAddress || null,
          chainId,
          fromBlock,
          toBlock
        },
        summary: {
          totalSwapsCount: swaps.length,
          uniqueParticipantsCount: uniqueUsers.size,
          volumeBreakdown: formattedVolumes
        },
        participants,
        swaps: formattedSwaps
      });
    }

    // Default: Invalid request parameters
    return res.status(400).json({
      success: false,
      error: 'Please provide either a "txHash" to verify a specific swap on-chain, or "tokenAddress"/"tokenSymbol"/"userAddress" to query swap history and volume stats.'
    });

  } catch (error) {
    console.error('❌ ERROR in database-free verify-swap API:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
}
