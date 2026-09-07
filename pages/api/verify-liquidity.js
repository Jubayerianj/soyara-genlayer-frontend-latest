// pages/api/verify-liquidity.js
// API Endpoint to verify liquidity provision/removal counts for quest building using the Goldsky Subgraph.
import { ethers } from 'ethers';

const SUBGRAPH_URL =
  'https://api.goldsky.com/api/public/project_cmrgg88kjt8sw01wxhc9476jr/subgraphs/flipswap-v2/1.0.2/gn';

// Default token if none is specified
const DEFAULT_TOKEN_ADDRESS = '0xdf69970B2fE416339187aA41D39882e864984CE9';

// Wrapped zkLTC ERC-20 on LitVM (native zkLTC is the gas token; DEX pools use this wrapped version)
// Use this as `counterToken` when querying pairs against native zkLTC (e.g. AURA/zkLTC)
const WZKLTC_ADDRESS = '0x315374AA9b5536037Cc1Efeea2439CCC0913A77e';

export default async function handler(req, res) {
  // ── CORS ────────────────────────────────────────────────────────────────────
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
    // ── 1. Parse & Validate Parameters ────────────────────────────────────────
    const params = req.method === 'POST' ? req.body : req.query;

    /**
     * Parameters:
     *  address      - (required) user wallet address
     *  token        - (optional) one token of the pair (defaults to AURA token)
     *  counterToken - (optional) the other token of the pair
     *                 Use zero address "0x0000000000000000000000000000000000000000" for native zkLTC
     *  minActions   - (optional) minimum number of liquidity actions required (default: 1)
     *  actionType   - (optional) "add" | "remove" | "both" (default: "both")
     *  limit        - (optional) max events to return (default: 1000, max: 1000)
     */
    const { address, token, counterToken, minActions, actionType, limit } = params;

    const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/;

    if (!address) {
      return res.status(400).json({
        success: false,
        error: 'Required parameter "address" (user wallet) is missing.',
      });
    }
    if (!ethAddressRegex.test(address)) {
      return res.status(400).json({
        success: false,
        error:
          'Invalid "address" format. Must be a valid 40-character hexadecimal Ethereum address starting with 0x.',
      });
    }

    const userAddress = address.toLowerCase();
    const tokenAddress = (token || DEFAULT_TOKEN_ADDRESS).toLowerCase();

    if (!ethAddressRegex.test(tokenAddress)) {
      return res.status(400).json({
        success: false,
        error:
          'Invalid "token" address format. Must be a valid 40-character hexadecimal Ethereum address starting with 0x.',
      });
    }

    const counterTokenAddress = counterToken ? counterToken.toLowerCase() : null;
    if (counterTokenAddress && !ethAddressRegex.test(counterTokenAddress)) {
      return res.status(400).json({
        success: false,
        error:
          'Invalid "counterToken" address format. Must be a valid 40-character hexadecimal Ethereum address starting with 0x.',
      });
    }

    const minActionsCount = parseInt(minActions || '1', 10);
    if (isNaN(minActionsCount) || minActionsCount < 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid "minActions" parameter. Must be a positive integer.',
      });
    }

    const normalizedActionType = (actionType || 'both').toLowerCase();
    if (!['add', 'remove', 'both'].includes(normalizedActionType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid "actionType". Must be "add", "remove", or "both".',
      });
    }

    let limitCount = parseInt(limit || '1000', 10);
    if (isNaN(limitCount) || limitCount <= 0) limitCount = 1000;
    limitCount = Math.min(limitCount, 1000);

    console.log(
      `🔍 Verifying liquidity for user: ${userAddress} | token: ${tokenAddress}` +
        ` | actionType: ${normalizedActionType} | minActions: ${minActionsCount}` +
        (counterTokenAddress ? ` | counterToken: ${counterTokenAddress}` : '')
    );

    // ── 2. Build GraphQL query ─────────────────────────────────────────────────
    //
    // LiquidityProvision = add-liquidity (Mint events)
    // LiquidityRemoval   = remove-liquidity (Burn events)
    //
    // The pair is stored as (token0, token1) in the subgraph. We cannot know
    // which side is which without inspecting, so we query BOTH orientations
    // and deduplicate by id to avoid double-counting.
    //
    // Without counterToken  → match any event where the user touched the token
    //                          as either token0 or token1.
    // With counterToken     → match the exact pair in both orderings.

    let provisionWhereA, provisionWhereB;
    let removalWhereA, removalWhereB;

    if (counterTokenAddress) {
      provisionWhereA = `{ user: $user, token0: $token,        token1: $counterToken }`;
      provisionWhereB = `{ user: $user, token0: $counterToken, token1: $token        }`;
      removalWhereA   = `{ user: $user, token0: $token,        token1: $counterToken }`;
      removalWhereB   = `{ user: $user, token0: $counterToken, token1: $token        }`;
    } else {
      provisionWhereA = `{ user: $user, token0: $token }`;
      provisionWhereB = `{ user: $user, token1: $token }`;
      removalWhereA   = `{ user: $user, token0: $token }`;
      removalWhereB   = `{ user: $user, token1: $token }`;
    }

    const eventFields = `
      id
      txHash
      timestamp
      protocolVersion
      marketId
      token0 { id symbol }
      token1 { id symbol }
      amount0
      amount1
      amount0Decimal
      amount1Decimal
      blockNumber
    `;

    const query = `
      query VerifyLiquidity(
        $user: String!
        $token: String!
        $limit: Int!
        $counterToken: String
        $userTokenStatId: ID!
      ) {
        token(id: $token) {
          id symbol name decimals
        }
        ${counterTokenAddress ? `counterToken: token(id: $counterToken) { id symbol name decimals }` : ''}

        userTokenStat(id: $userTokenStatId) {
          id
          liquidityActions
        }

        addA: liquidityProvisions(
          where: ${provisionWhereA}
          orderBy: timestamp
          orderDirection: desc
          first: $limit
        ) { ${eventFields} }

        addB: liquidityProvisions(
          where: ${provisionWhereB}
          orderBy: timestamp
          orderDirection: desc
          first: $limit
        ) { ${eventFields} }

        removeA: liquidityRemovals(
          where: ${removalWhereA}
          orderBy: timestamp
          orderDirection: desc
          first: $limit
        ) { ${eventFields} }

        removeB: liquidityRemovals(
          where: ${removalWhereB}
          orderBy: timestamp
          orderDirection: desc
          first: $limit
        ) { ${eventFields} }
      }
    `;

    const userTokenStatId = `${userAddress}-${tokenAddress}`;
    const variables = { user: userAddress, token: tokenAddress, userTokenStatId, limit: limitCount };
    if (counterTokenAddress) variables.counterToken = counterTokenAddress;

    // ── 3. Fetch from Goldsky ──────────────────────────────────────────────────
    const response = await fetch(SUBGRAPH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
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
        details: result.errors,
      });
    }

    const data = result.data || {};

    const tokenInfo = data.token || {
      id: tokenAddress,
      symbol: 'UNKNOWN',
      name: 'Unknown Token',
      decimals: 18,
    };

    // ── 4. Merge & deduplicate both orientations ───────────────────────────────
    const dedup = (arr) => {
      const seen = new Set();
      return (arr || []).filter((e) => {
        if (seen.has(e.id)) return false;
        seen.add(e.id);
        return true;
      });
    };

    const allAdds    = dedup([...(data.addA || []),    ...(data.addB || [])]);
    const allRemoves = dedup([...(data.removeA || []), ...(data.removeB || [])]);

    // ── 5. Apply actionType filter ─────────────────────────────────────────────
    const includeAdds    = normalizedActionType === 'add'    || normalizedActionType === 'both';
    const includeRemoves = normalizedActionType === 'remove' || normalizedActionType === 'both';

    const addCount    = includeAdds    ? allAdds.length    : 0;
    const removeCount = includeRemoves ? allRemoves.length : 0;
    const totalLiquidityActions = addCount + removeCount;

    // ── 6. Live price from DIA Oracle ─────────────────────────────────────────
    let tokenPriceUSD = 0;
    try {
      const symbol = tokenInfo.symbol.toUpperCase();
      if (symbol.includes('USD')) {
        tokenPriceUSD = 1.0;
      } else {
        const rpcUrl = 'https://liteforge.rpc.caldera.xyz/infra-partner-http';
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const adapters = {
          LTC:    '0x45dDa5d881BD2C917976CCfde74fFd6f6412da29',
          ZKLTC:  '0x45dDa5d881BD2C917976CCfde74fFd6f6412da29',
          WZKLTC: '0x45dDa5d881BD2C917976CCfde74fFd6f6412da29',
          ETH:    '0xc760B46beF9eD3F9A3d2b825164324D6703F0185',
          WETH:   '0xc760B46beF9eD3F9A3d2b825164324D6703F0185',
          BTC:    '0x7d0445782E383223c7B4B660bb96b87213e9b605',
          WBTC:   '0x7d0445782E383223c7B4B660bb96b87213e9b605',
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

    // ── 7. Volume calculation ──────────────────────────────────────────────────
    // For each event, the "token" can be on either side of the pair.
    // We pick the side that matches the target tokenAddress.
    const volumeForEvent = (event) => {
      const isToken0 = event.token0?.id?.toLowerCase() === tokenAddress;
      return parseFloat(isToken0 ? event.amount0Decimal : event.amount1Decimal) || 0;
    };

    const totalVolumeToken =
      (includeAdds    ? allAdds.reduce((s, e) => s + volumeForEvent(e), 0)    : 0) +
      (includeRemoves ? allRemoves.reduce((s, e) => s + volumeForEvent(e), 0) : 0);

    const totalVolumeUSD = totalVolumeToken * tokenPriceUSD;

    // ── 8. Format proof events ─────────────────────────────────────────────────
    const formatEvents = (events, type) =>
      events.map((e) => ({
        id: e.id,
        txHash: e.txHash,
        type,
        protocolVersion: e.protocolVersion,
        marketId: e.marketId,
        pair: {
          token0: { address: e.token0?.id, symbol: e.token0?.symbol },
          token1: { address: e.token1?.id, symbol: e.token1?.symbol },
        },
        timestamp: parseInt(e.timestamp, 10),
        dateTime: new Date(parseInt(e.timestamp, 10) * 1000).toISOString(),
        blockNumber: parseInt(e.blockNumber, 10),
        amount0Decimal: parseFloat(e.amount0Decimal || '0'),
        amount1Decimal: parseFloat(e.amount1Decimal || '0'),
      }));

    const proofAdds    = includeAdds    ? formatEvents(allAdds,    'add')    : [];
    const proofRemoves = includeRemoves ? formatEvents(allRemoves, 'remove') : [];
    const allProofs    = [...proofAdds, ...proofRemoves].sort((a, b) => b.timestamp - a.timestamp);

    // ── 9. Eligibility check ───────────────────────────────────────────────────
    const isEligible = totalLiquidityActions >= minActionsCount;

    // ── 10. Response ───────────────────────────────────────────────────────────
    return res.status(200).json({
      success: true,
      address: userAddress,
      token: {
        address: tokenAddress,
        symbol: tokenInfo.symbol,
        name: tokenInfo.name,
        decimals: tokenInfo.decimals,
      },
      counterToken:
        counterTokenAddress && data.counterToken
          ? {
              address: counterTokenAddress,
              symbol: data.counterToken.symbol,
              name: data.counterToken.name,
              decimals: data.counterToken.decimals,
            }
          : null,
      filter: {
        actionType: normalizedActionType,
      },
      verification: {
        totalLiquidityActions,
        breakdown: {
          addLiquidity: addCount,
          removeLiquidity: removeCount,
        },
        totalVolumeToken,
        totalVolumeUSD,
        tokenPriceUSD,
        minActionsRequired: minActionsCount,
        isEligible,
        remainingActionsNeeded: Math.max(0, minActionsCount - totalLiquidityActions),
      },
      proofs: {
        eventCount: allProofs.length,
        events: allProofs,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('❌ ERROR in /api/verify-liquidity:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Internal server error.',
      message: error.message,
    });
  }
}
