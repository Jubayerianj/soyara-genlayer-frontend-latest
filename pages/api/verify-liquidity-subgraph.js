// pages/api/verify-liquidity-subgraph.js
// Verifies how much liquidity a specific user has added on V2 and/or V3
// using the FlipSwap v1.0.2 Goldsky subgraph.
// All amounts are returned in real human-readable token units (decimals applied).

const SUBGRAPH_URL =
  'https://api.goldsky.com/api/public/project_cmrgg88kjt8sw01wxhc9476jr/subgraphs/flipswap-v2/1.0.2/gn';

// wzkLTC is the wrapped version of native zkLTC used in all DEX pools
const WZKLTC_ADDRESS = '0x315374aa9b5536037cc1efeea2439ccc0913a77e';

// ─── Decimal Conversion ─────────────────────────────────────────────────────
// Safely converts a raw on-chain BigInt string to a human-readable decimal string.
// Works correctly for 6-decimal (USDC), 8-decimal (WBTC), and 18-decimal tokens.
function rawToHuman(rawAmount, decimals) {
  if (!rawAmount || rawAmount === '0') return '0';
  const dec = parseInt(decimals, 10) || 18;
  const str = rawAmount.toString();

  if (dec === 0) return str;

  const padded = str.padStart(dec + 1, '0');
  const intPart = padded.slice(0, padded.length - dec) || '0';
  const fracRaw = padded.slice(padded.length - dec);
  const fracTrimmed = fracRaw.replace(/0+$/, '');

  return fracTrimmed ? `${intPart}.${fracTrimmed}` : intPart;
}

// Parses a human-readable decimal string to a float safely
function toFloat(str) {
  const n = parseFloat(str);
  return isNaN(n) ? 0 : n;
}

// ─── GraphQL Fetcher ─────────────────────────────────────────────────────────
async function querySubgraph(query, variables = {}) {
  const res = await fetch(SUBGRAPH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Subgraph HTTP error: ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(json.errors.map((e) => e.message).join(', '));
  return json.data;
}

// ─── Handler ─────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });

  try {
    // ── 1. Parse Parameters ─────────────────────────────────────────────────
    const params = req.method === 'POST' ? req.body : req.query;

    /**
     * Parameters:
     *  address   (required)  – user wallet address
     *  token0    (optional)  – first token contract address of the pair
     *  token1    (optional)  – second token contract address of the pair
     *                          Use "0x0000000000000000000000000000000000000000"
     *                          for native zkLTC (auto-mapped to wzkLTC in pools)
     *  protocol  (optional)  – "v2" | "v3" | "both"  (default: "both")
     *  minAmount (optional)  – minimum total token0 amount deposited to be eligible
     *                          (as a human-readable number, e.g. "1.5")
     */
    const { address, token0, token1, protocol, minAmount } = params;

    const ethRe = /^0x[a-fA-F0-9]{40}$/;

    if (!address)
      return res.status(400).json({ success: false, error: 'Missing required parameter: address' });

    if (!ethRe.test(address))
      return res.status(400).json({
        success: false,
        error: 'Invalid address format. Must be a 0x-prefixed 40-hex-char address.',
      });

    const userAddr = address.toLowerCase();

    // Normalise token addresses – map native zero-address to wzkLTC
    const normaliseToken = (t) => {
      if (!t) return null;
      const lower = t.toLowerCase();
      return lower === '0x0000000000000000000000000000000000000000' ? WZKLTC_ADDRESS : lower;
    };

    const t0Addr = normaliseToken(token0);
    const t1Addr = normaliseToken(token1);

    if (t0Addr && !ethRe.test(t0Addr))
      return res.status(400).json({ success: false, error: 'Invalid token0 address format.' });
    if (t1Addr && !ethRe.test(t1Addr))
      return res.status(400).json({ success: false, error: 'Invalid token1 address format.' });

    const normalizedProtocol = (protocol || 'both').toLowerCase();
    if (!['v2', 'v3', 'both'].includes(normalizedProtocol))
      return res.status(400).json({
        success: false,
        error: 'Invalid protocol. Use "v2", "v3", or "both".',
      });

    const minAmountRequired = parseFloat(minAmount || '0');

    const includeV2 = normalizedProtocol === 'v2' || normalizedProtocol === 'both';
    const includeV3 = normalizedProtocol === 'v3' || normalizedProtocol === 'both';

    console.log(
      `🔍 Liquidity verify | user: ${userAddr} | token0: ${t0Addr || 'any'} | token1: ${t1Addr || 'any'} | protocol: ${normalizedProtocol}`
    );

    // ── 2. Query Subgraph ───────────────────────────────────────────────────
    // We run V2 and V3 queries in parallel for speed.

    const [v2Data, v3Data] = await Promise.all([
      includeV2 ? fetchV2Liquidity(userAddr, t0Addr, t1Addr) : { v2Mints: [], v2Burns: [] },
      includeV3 ? fetchV3Liquidity(userAddr, t0Addr, t1Addr) : { positions: [], tokenMap: {} },
    ]);

    // ── 3. Fetch Token Metadata (decimals, symbol, name) ───────────────────
    // Collect all unique token addresses found across events
    const tokenAddresses = new Set();
    v2Data.v2Mints.forEach((m) => {
      if (m.pair?.token0?.id) tokenAddresses.add(m.pair.token0.id);
      if (m.pair?.token1?.id) tokenAddresses.add(m.pair.token1.id);
    });
    Object.keys(v3Data.tokenMap).forEach((a) => tokenAddresses.add(a));

    const tokenMetaMap = await fetchTokenMeta([...tokenAddresses]);

    // ── 4. Build V2 Result ──────────────────────────────────────────────────
    const v2AddEvents = v2Data.v2Mints.map((m) => {
      const tk0 = tokenMetaMap[m.pair?.token0?.id] || { symbol: m.pair?.token0?.symbol || '?', decimals: 18 };
      const tk1 = tokenMetaMap[m.pair?.token1?.id] || { symbol: m.pair?.token1?.symbol || '?', decimals: 18 };
      return {
        type: 'ADD',
        protocol: 'V2',
        pair: m.pair?.id || null,
        token0: {
          address: m.pair?.token0?.id,
          symbol: tk0.symbol,
          decimals: tk0.decimals,
          amount: m.amount0Decimal, // already decimal-converted by subgraph
          amountRaw: m.amount0,
        },
        token1: {
          address: m.pair?.token1?.id,
          symbol: tk1.symbol,
          decimals: tk1.decimals,
          amount: m.amount1Decimal,
          amountRaw: m.amount1,
        },
        timestamp: parseInt(m.timestamp, 10),
        dateTime: new Date(parseInt(m.timestamp, 10) * 1000).toISOString(),
        blockNumber: parseInt(m.blockNumber, 10),
        txHash: m.txHash,
      };
    });

    const v2RemoveEvents = v2Data.v2Burns.map((b) => {
      const tk0 = tokenMetaMap[b.pair?.token0?.id] || { symbol: b.pair?.token0?.symbol || '?', decimals: 18 };
      const tk1 = tokenMetaMap[b.pair?.token1?.id] || { symbol: b.pair?.token1?.symbol || '?', decimals: 18 };
      return {
        type: 'REMOVE',
        protocol: 'V2',
        pair: b.pair?.id || null,
        token0: {
          address: b.pair?.token0?.id,
          symbol: tk0.symbol,
          decimals: tk0.decimals,
          amount: b.amount0Decimal,
          amountRaw: b.amount0,
        },
        token1: {
          address: b.pair?.token1?.id,
          symbol: tk1.symbol,
          decimals: tk1.decimals,
          amount: b.amount1Decimal,
          amountRaw: b.amount1,
        },
        timestamp: parseInt(b.timestamp, 10),
        dateTime: new Date(parseInt(b.timestamp, 10) * 1000).toISOString(),
        blockNumber: parseInt(b.blockNumber, 10),
        txHash: b.txHash,
      };
    });

    // ── 5. Build V3 Result ──────────────────────────────────────────────────
    const v3Positions = v3Data.positions.map((pos) => {
      const tk0 = tokenMetaMap[pos.token0] || v3Data.tokenMap[pos.token0] || { symbol: '?', decimals: 18 };
      const tk1 = tokenMetaMap[pos.token1] || v3Data.tokenMap[pos.token1] || { symbol: '?', decimals: 18 };

      // Aggregate amounts from events
      let totalAdded0 = BigInt(0), totalAdded1 = BigInt(0);
      let totalRemoved0 = BigInt(0), totalRemoved1 = BigInt(0);

      const events = (pos.events || []).map((ev) => {
        const isAdd = ev.eventType === 'INCREASE_LIQUIDITY';
        const isRemove = ev.eventType === 'DECREASE_LIQUIDITY';

        const raw0 = ev.amount0 ? BigInt(ev.amount0) : BigInt(0);
        const raw1 = ev.amount1 ? BigInt(ev.amount1) : BigInt(0);

        if (isAdd) { totalAdded0 += raw0; totalAdded1 += raw1; }
        if (isRemove) { totalRemoved0 += raw0; totalRemoved1 += raw1; }

        return {
          type: isAdd ? 'ADD' : isRemove ? 'REMOVE' : ev.eventType,
          liquidityDelta: ev.liquidityDelta || '0',
          token0Amount: rawToHuman(ev.amount0, tk0.decimals),
          token1Amount: rawToHuman(ev.amount1, tk1.decimals),
          token0AmountRaw: ev.amount0 || '0',
          token1AmountRaw: ev.amount1 || '0',
          timestamp: parseInt(ev.timestamp, 10),
          dateTime: new Date(parseInt(ev.timestamp, 10) * 1000).toISOString(),
          blockNumber: parseInt(ev.blockNumber, 10),
          txHash: ev.txHash,
        };
      });

      return {
        protocol: 'V3',
        positionId: pos.tokenId,
        pool: pos.pool,
        fee: pos.fee,
        feePct: pos.fee ? `${(pos.fee / 10000).toFixed(2)}%` : null,
        tickLower: pos.tickLower,
        tickUpper: pos.tickUpper,
        isFullRange: pos.tickLower === -887220 && pos.tickUpper === 887220,
        currentLiquidityRaw: pos.liquidity,
        isActive: BigInt(pos.liquidity || 0) > BigInt(0),
        token0: {
          address: pos.token0,
          symbol: tk0.symbol,
          decimals: tk0.decimals,
          totalAdded: rawToHuman(totalAdded0.toString(), tk0.decimals),
          totalRemoved: rawToHuman(totalRemoved0.toString(), tk0.decimals),
          netDeposited: rawToHuman(
            (totalAdded0 - totalRemoved0 > BigInt(0) ? totalAdded0 - totalRemoved0 : BigInt(0)).toString(),
            tk0.decimals
          ),
          feesCollected: pos.collectedToken0,
        },
        token1: {
          address: pos.token1,
          symbol: tk1.symbol,
          decimals: tk1.decimals,
          totalAdded: rawToHuman(totalAdded1.toString(), tk1.decimals),
          totalRemoved: rawToHuman(totalRemoved1.toString(), tk1.decimals),
          netDeposited: rawToHuman(
            (totalAdded1 - totalRemoved1 > BigInt(0) ? totalAdded1 - totalRemoved1 : BigInt(0)).toString(),
            tk1.decimals
          ),
          feesCollected: pos.collectedToken1,
        },
        createdAt: new Date(parseInt(pos.createdAtTimestamp, 10) * 1000).toISOString(),
        lastUpdatedAt: new Date(parseInt(pos.lastUpdatedTimestamp, 10) * 1000).toISOString(),
        createdTxHash: pos.lastTransferTxHash,
        events,
      };
    });

    // ── 6. Summary Totals ───────────────────────────────────────────────────
    // Sum total token0 added across all events (V2 + V3) for eligibility check
    let totalToken0Added = 0;
    let totalToken1Added = 0;

    v2AddEvents.forEach((e) => { totalToken0Added += toFloat(e.token0.amount); totalToken1Added += toFloat(e.token1.amount); });
    v3Positions.forEach((p) => { totalToken0Added += toFloat(p.token0.totalAdded); totalToken1Added += toFloat(p.token1.totalAdded); });

    const totalV2AddActions = v2AddEvents.length;
    const totalV2RemoveActions = v2RemoveEvents.length;
    const totalV3Positions = v3Positions.length;
    const totalV3AddActions = v3Positions.reduce((s, p) => s + p.events.filter((e) => e.type === 'ADD').length, 0);
    const totalLiquidityActions = totalV2AddActions + totalV2RemoveActions + totalV3AddActions;

    const isEligible = minAmountRequired > 0
      ? totalToken0Added >= minAmountRequired
      : totalLiquidityActions > 0;

    // ── 7. Response ─────────────────────────────────────────────────────────
    return res.status(200).json({
      success: true,
      address: userAddr,
      filter: {
        token0: t0Addr,
        token1: t1Addr,
        protocol: normalizedProtocol,
        minAmountRequired: minAmountRequired || null,
      },
      verification: {
        isEligible,
        totalLiquidityActions,
        summary: {
          v2AddCount: totalV2AddActions,
          v2RemoveCount: totalV2RemoveActions,
          v3PositionCount: totalV3Positions,
          v3AddEventCount: totalV3AddActions,
          totalToken0Added: totalToken0Added.toFixed(8),
          totalToken1Added: totalToken1Added.toFixed(8),
        },
      },
      v2: includeV2
        ? {
            addEvents: v2AddEvents,
            removeEvents: v2RemoveEvents,
          }
        : null,
      v3: includeV3
        ? {
            positions: v3Positions,
          }
        : null,
      meta: {
        subgraphVersion: '1.0.2',
        queriedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('❌ verify-liquidity-subgraph error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Internal server error.',
      message: err.message,
    });
  }
}

// ─── V2 Fetch ─────────────────────────────────────────────────────────────────
async function fetchV2Liquidity(userAddr, t0Addr, t1Addr) {
  // Build where clauses for both token orderings (token0/token1 can be in either order)
  const buildWhere = (type) => {
    if (t0Addr && t1Addr) {
      return `[
        { ${type}: "${userAddr}", pair_: { token0: "${t0Addr}", token1: "${t1Addr}" } }
        { ${type}: "${userAddr}", pair_: { token0: "${t1Addr}", token1: "${t0Addr}" } }
      ]`;
    }
    if (t0Addr) {
      return `[
        { ${type}: "${userAddr}", pair_: { token0: "${t0Addr}" } }
        { ${type}: "${userAddr}", pair_: { token1: "${t0Addr}" } }
      ]`;
    }
    return `[{ ${type}: "${userAddr}" }]`;
  };

  const mintFields = `
    id txHash timestamp blockNumber amount0 amount1 amount0Decimal amount1Decimal
    pair { id token0 { id symbol } token1 { id symbol } }
  `;

  const query = `{
    mintsA: v2Mints(where: { or: ${buildWhere('sender')} }, first: 1000, orderBy: timestamp, orderDirection: desc) { ${mintFields} }
    burnsA: v2Burns(where: { or: ${buildWhere('sender')} }, first: 1000, orderBy: timestamp, orderDirection: desc) { ${mintFields} }
  }`;

  const data = await querySubgraph(query);

  // Deduplicate by id
  const dedup = (arr) => {
    const seen = new Set();
    return (arr || []).filter((e) => { if (seen.has(e.id)) return false; seen.add(e.id); return true; });
  };

  return {
    v2Mints: dedup([...(data.mintsA || [])]),
    v2Burns: dedup([...(data.burnsA || [])]),
  };
}

// ─── V3 Fetch ─────────────────────────────────────────────────────────────────
async function fetchV3Liquidity(userAddr, t0Addr, t1Addr) {
  // Build V3 positions filter
  let posWhere = `owner: "${userAddr}"`;
  if (t0Addr && t1Addr) {
    posWhere += `, or: [
      { token0: "${t0Addr}", token1: "${t1Addr}" }
      { token0: "${t1Addr}", token1: "${t0Addr}" }
    ]`;
  } else if (t0Addr) {
    posWhere += `, or: [{ token0: "${t0Addr}" }, { token1: "${t0Addr}" }]`;
  }

  const posQuery = `{
    v3Positions(where: { ${posWhere} }, first: 100) {
      id tokenId owner { id }
      token0 token1 fee pool
      tickLower tickUpper
      liquidity
      collectedToken0 collectedToken1
      createdAtTimestamp lastUpdatedTimestamp lastTransferTxHash
    }
  }`;

  const posData = await querySubgraph(posQuery);
  const positions = posData.v3Positions || [];
  if (positions.length === 0) return { positions: [], tokenMap: {} };

  // Fetch all events for these positions in one query
  const posIds = positions.map((p) => `"${p.tokenId}"`).join(',');
  const eventsQuery = `{
    v3PositionEvents(
      where: { position_in: [${posIds}] }
      first: 1000
      orderBy: timestamp
      orderDirection: desc
    ) {
      id position { tokenId }
      eventType liquidityDelta
      amount0 amount1
      timestamp blockNumber txHash
    }
  }`;

  const evData = await querySubgraph(eventsQuery);
  const allEvents = evData.v3PositionEvents || [];

  // Group events by position tokenId
  const eventsByPos = {};
  allEvents.forEach((ev) => {
    const pid = ev.position?.tokenId;
    if (!eventsByPos[pid]) eventsByPos[pid] = [];
    eventsByPos[pid].push(ev);
  });

  // Build tokenMap for unique token addresses (to fetch decimals)
  const tokenAddrs = new Set();
  positions.forEach((p) => { if (p.token0) tokenAddrs.add(p.token0); if (p.token1) tokenAddrs.add(p.token1); });

  const tokenMap = {};
  if (tokenAddrs.size > 0) {
    const addrsStr = [...tokenAddrs].map((a) => `"${a}"`).join(',');
    const tokQuery = `{ tokens(where: { id_in: [${addrsStr}] }) { id symbol name decimals } }`;
    const tokData = await querySubgraph(tokQuery);
    (tokData.tokens || []).forEach((t) => {
      tokenMap[t.id] = { symbol: t.symbol, name: t.name, decimals: t.decimals };
    });
  }

  // Attach events to positions
  const enriched = positions.map((p) => ({
    ...p,
    events: eventsByPos[p.tokenId] || [],
  }));

  return { positions: enriched, tokenMap };
}

// ─── Token Metadata Fetch ─────────────────────────────────────────────────────
async function fetchTokenMeta(addresses) {
  if (!addresses || addresses.length === 0) return {};
  const addrsStr = addresses.map((a) => `"${a}"`).join(',');
  const query = `{ tokens(where: { id_in: [${addrsStr}] }) { id symbol name decimals } }`;
  try {
    const data = await querySubgraph(query);
    const map = {};
    (data.tokens || []).forEach((t) => { map[t.id] = { symbol: t.symbol, name: t.name, decimals: t.decimals }; });
    return map;
  } catch {
    return {};
  }
}
