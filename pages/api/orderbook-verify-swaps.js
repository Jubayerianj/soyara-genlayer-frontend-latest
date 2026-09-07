const SUBGRAPH_URL = 'https://api.goldsky.com/api/public/project_cmoiptmxtlv6w01t767m81i1p/subgraphs/poap-subgraph/1.0.0/gn';

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
    const { address, token, minSwaps, counterToken } = params;

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
    const tokenAddress = token ? token.toLowerCase() : null;
    const counterTokenAddress = counterToken ? counterToken.toLowerCase() : null;

    if (tokenAddress && !ethAddressRegex.test(tokenAddress)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid "token" address format.'
      });
    }

    if (counterTokenAddress && !ethAddressRegex.test(counterTokenAddress)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid "counterToken" address format.'
      });
    }

    const minSwapsCount = parseInt(minSwaps || '1', 10);

    console.log(`🔍 Verifying orderbook swaps for user: ${userAddress} on token: ${tokenAddress}`);

    // 2. Query Goldsky Orderbook Subgraph for all orders owned by this user
    const query = `
      query UserOrders($owner: String!) {
        orders(
          where: { owner: $owner }
          orderBy: createdAtTimestamp
          orderDirection: desc
          first: 1000
        ) {
          id
          status
          priceTick
          openUnits
          claimableUnits
          createdAtTimestamp
          market {
            id
            baseToken
            quoteToken
          }
        }
      }
    `;

    const response = await fetch(SUBGRAPH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: { owner: userAddress }
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

    const rawOrders = result.data?.orders || [];
    const matchedOrders = [];
    let swapCount = 0;
    
    // Total unclaimed volume in raw units (only available for FILLED_UNCLAIMED/PARTIALLY_FILLED)
    let totalUnclaimedUnits = 0n;

    for (const order of rawOrders) {
      const base = order.market.baseToken.toLowerCase();
      const quote = order.market.quoteToken.toLowerCase();

      // Filter by target token if specified
      if (tokenAddress) {
        const hasToken = base === tokenAddress || quote === tokenAddress;
        if (!hasToken) continue;
      }

      // Filter by counterToken if specified
      if (counterTokenAddress) {
        const hasCounter = base === counterTokenAddress || quote === counterTokenAddress;
        if (!hasCounter) continue;
      }

      // Check if order represents a swap (i.e. has matching activity)
      const isSwapped = ["FILLED_UNCLAIMED", "SETTLED", "PARTIALLY_FILLED"].includes(order.status);
      if (isSwapped) {
        swapCount++;
        totalUnclaimedUnits += BigInt(order.claimableUnits || '0');
      }

      matchedOrders.push({
        id: order.id,
        status: order.status,
        priceTick: Number(order.priceTick),
        openUnits: order.openUnits,
        claimableUnits: order.claimableUnits,
        createdAtTimestamp: parseInt(order.createdAtTimestamp, 10),
        dateTime: new Date(parseInt(order.createdAtTimestamp, 10) * 1000).toISOString(),
        market: {
          id: order.market.id,
          baseToken: order.market.baseToken,
          quoteToken: order.market.quoteToken
        }
      });
    }

    const isEligible = swapCount >= minSwapsCount;

    return res.status(200).json({
      success: true,
      address: userAddress,
      token: tokenAddress,
      counterToken: counterTokenAddress,
      verification: {
        totalSwaps: swapCount,
        minSwapsRequired: minSwapsCount,
        isEligible,
        remainingSwapsNeeded: Math.max(0, minSwapsCount - swapCount),
        unclaimedVolumeUnits: totalUnclaimedUnits.toString(),
        note: "Note: Volume calculations for SETTLED orders are reset to 0 in this subgraph. Use status checks (FILLED_UNCLAIMED/SETTLED/PARTIALLY_FILLED) to verify swaps."
      },
      proofs: {
        orderCount: matchedOrders.length,
        orders: matchedOrders
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ ERROR in /api/orderbook-verify-swaps:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Internal server error.',
      message: error.message
    });
  }
}
