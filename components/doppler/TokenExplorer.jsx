// components/doppler/TokenExplorer.jsx
// Uniswap-style Launches Explorer (inspired by app.uniswap.org/launches)
// Supports Table View & Card Grid View, real token images, metrics ribbon,
// category filters (Trending, New, Graduating Soon, Top Traded, All), and 50/page pagination.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { usePublicClient, useChainId } from 'wagmi';
import { formatUnits } from 'viem';
import { getDopplerAddresses } from '../../constants/doppler/addresses';
import { TOKEN_LIST } from '../../constants/tokens';
import AIRLOCK_ABI from '../../constants/doppler/abis/Airlock';
import { DIA_ORACLE_CONFIG } from '../../constants/oracleConfig.js';
import TokenCard, { extractTokenLogo } from './TokenCard';
import TrendingCarousel from './TrendingCarousel';
import {
  Flame,
  TrendingUp,
  Sparkles,
  LayoutGrid,
  List,
  ChevronLeft,
  ChevronRight,
  Search,
  RotateCw,
  ExternalLink,
  Zap,
  Award,
  DollarSign,
  Rocket,
  ShieldCheck
} from 'lucide-react';
import styles from './TokenExplorer.module.css';

const AIRLOCK_DEPLOYMENT_BLOCK = 40120000n;
const ITEMS_PER_PAGE = 50;

const shortAddr = (addr) => (addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '-');

const formatPriceUSD = (val) => {
  const num = Number(val || 0);
  if (isNaN(num) || num <= 0) return '$0.00';
  if (num < 0.000001) return `$${num.toFixed(10)}`;
  if (num < 0.0001) return `$${num.toFixed(8)}`;
  if (num < 0.01) return `$${num.toFixed(6)}`;
  if (num < 1) return `$${num.toFixed(4)}`;
  if (num >= 1000) return `$${num.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  return `$${num.toFixed(2)}`;
};

const formatPriceETH = (val) => {
  const num = Number(val || 0);
  if (isNaN(num) || num <= 0) return '0 zkLTC';
  if (num < 0.00000001) return `${num.toFixed(11)} zkLTC`;
  if (num < 0.0001) return `${num.toFixed(9)} zkLTC`;
  if (num < 1) return `${num.toFixed(6)} zkLTC`;
  return `${num.toFixed(4)} zkLTC`;
};

const formatMarketCap = (val) => {
  const num = Number(val || 0);
  if (isNaN(num) || num <= 0) return '$0.00';
  if (num >= 1000000000000) return `$${(num / 1000000000000).toFixed(2)}T`;
  if (num >= 1000000000) return `$${(num / 1000000000).toFixed(2)}B`;
  if (num >= 1000000) return `$${(num / 1000000).toFixed(2)}M`;
  if (num >= 10000) return `$${(num / 1000).toFixed(1)}K`;
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const ERC20_ABI = [
  { type: 'function', name: 'name', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  { type: 'function', name: 'totalSupply', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'tokenURI', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
];

const POOL_ABI = [
  {
    name: 'slot0',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { type: 'uint160' },
      { type: 'int24' },
      { type: 'uint16' },
      { type: 'uint16' },
      { type: 'uint16' },
      { type: 'uint8' },
      { type: 'bool' }
    ]
  }
];

const getInitialVerifiedTokens = () => {
  const ZKLTC_USD = 44.22;
  const verified = (TOKEN_LIST[4441] || []).filter(t => !t.isNative).map(t => {
    let priceUSD = 1.0;
    let priceETH = 1.0 / ZKLTC_USD;
    if (t.symbol === 'wzkLTC' || t.symbol === 'zkLTC') {
      priceUSD = ZKLTC_USD;
      priceETH = 1.0;
    } else if (t.symbol === 'ZKBTC') {
      priceUSD = 63075.92;
      priceETH = 63075.92 / ZKLTC_USD;
    } else if (t.symbol === 'LETH') {
      priceUSD = 1882.63;
      priceETH = 1882.63 / ZKLTC_USD;
    } else if (t.symbol === 'ZKUSDC' || t.symbol === 'ZKUSDT') {
      priceUSD = 1.0;
      priceETH = 1.0 / ZKLTC_USD;
    } else if (t.symbol === 'brBNB') {
      priceUSD = 580.0;
      priceETH = 580.0 / ZKLTC_USD;
    } else if (t.symbol === 'LXRP') {
      priceUSD = 0.55;
      priceETH = 0.55 / ZKLTC_USD;
    } else if (t.symbol === 'LitVMSWAP') {
      priceUSD = 0.05;
      priceETH = 0.05 / ZKLTC_USD;
    }
    const supply = t.globalSupply || 1000000000;
    return {
      address: t.address,
      name: t.name,
      symbol: t.symbol,
      decimals: t.decimals || 18,
      tokenURI: '',
      logoURI: t.logoURI,
      numeraire: '0x315374AA9b5536037Cc1Efeea2439CCC0913A77e',
      pool: '0x4680BCe1632824d30D2F53656dD610736c3e312e',
      blockNumber: 40120000n,
      bondingCurveProgress: 100,
      isGraduated: true,
      isLiveToken: true,
      priceETH,
      priceUSD,
      marketCapUSD: priceUSD * supply,
      totalVolumeUSD: 10000,
      swapCount: 50,
    };
  });
  return verified;
};

// Module-level in-memory cache preloaded with verified tokens for instantaneous 0ms paint
let inMemoryExploreCache = {
  tokens: getInitialVerifiedTokens(),
  timestamp: 0,
};

const CACHE_TTL_MS = 60 * 1000; // 60s cache TTL

export default function TokenExplorer({ onMigrate }) {
  const router = useRouter();
  const chainId = useChainId() || 4441;
  const publicClient = usePublicClient();
  const addresses = getDopplerAddresses(chainId);

  const [tokens, setTokens] = useState(() => inMemoryExploreCache.tokens || []);
  const [loading, setLoading] = useState(() => !inMemoryExploreCache.tokens || inMemoryExploreCache.tokens.length === 0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('trending'); // 'trending' | 'new' | 'graduating' | 'traded' | 'all'
  const [viewMode, setViewMode] = useState('table'); // 'table' | 'grid'
  const [currentPage, setCurrentPage] = useState(1);

  // ── Fetch Real-Time Data from Goldsky Subgraph & Smart Contracts ────────────

  const fetchTokens = useCallback(async (forceRefresh = false) => {
    if (!publicClient) return;

    const now = Date.now();
    const hasCache = inMemoryExploreCache.tokens && inMemoryExploreCache.tokens.length > 0;
    const isFresh = hasCache && (now - inMemoryExploreCache.timestamp < CACHE_TTL_MS);

    // If cache is fresh and this isn't a forced manual refresh, use cache immediately
    if (isFresh && !forceRefresh) {
      setTokens(inMemoryExploreCache.tokens);
      setLoading(false);
      return;
    }

    if (forceRefresh || !hasCache) {
      setLoading(true);
    } else {
      setIsRefreshing(true);
    }
    setError('');

    try {
      // 1. Verified tokens from DEX & Oracle
      const V2_FACTORY = '0x4680BCe1632824d30D2F53656dD610736c3e312e';
      const WETH = '0x315374AA9b5536037Cc1Efeea2439CCC0913A77e';
      const ZKLTC_USD = 44.22;

      const rawVerifiedList = (TOKEN_LIST[4441] || []).filter(t => !t.isNative);
      const verifiedList = await Promise.all(
        rawVerifiedList.map(async (t) => {
          let supply = t.globalSupply || 1000000000;
          let decimals = t.decimals || 18;
          let priceUSD = 0;
          let priceETH = 0;
          let liquidityUSD = 0;

          if (!t.globalSupply) {
            try {
              const [s, d] = await Promise.all([
                publicClient.readContract({ address: t.address, abi: ERC20_ABI, functionName: 'totalSupply' }).catch(() => 1000000000n * 10n ** 18n),
                publicClient.readContract({ address: t.address, abi: ERC20_ABI, functionName: 'decimals' }).catch(() => t.decimals || 18),
              ]);
              decimals = Number(d || 18);
              supply = Number(formatUnits(s, decimals)) || 1000000000;
            } catch {}
          }

          if (t.hasOraclePrice) {
            try {
              const sym = t.symbol === 'wzkLTC' ? 'zkLTC' : t.symbol;
              const adapter = DIA_ORACLE_CONFIG.ADAPTERS[sym];
              if (adapter) {
                const roundData = await publicClient.readContract({
                  address: adapter,
                  abi: [
                    {
                      type: 'function',
                      name: 'latestRoundData',
                      stateMutability: 'view',
                      inputs: [],
                      outputs: [
                        { name: 'roundId', type: 'uint80' },
                        { name: 'answer', type: 'int256' },
                        { name: 'startedAt', type: 'uint256' },
                        { name: 'updatedAt', type: 'uint256' },
                        { name: 'answeredInRound', type: 'uint80' },
                      ],
                    },
                  ],
                  functionName: 'latestRoundData',
                }).catch(() => null);
                if (roundData && roundData[1] > 0n) {
                  priceUSD = Number(formatUnits(roundData[1], 18));
                }
              }
            } catch {}

            if (!priceUSD) {
              priceUSD = t.symbol === 'ZKUSDC' || t.symbol === 'ZKUSDT' ? 1.0 : t.symbol === 'ZKBTC' ? 63075.92 : t.symbol === 'LETH' ? 1882.63 : ZKLTC_USD;
            }
            priceETH = priceUSD / ZKLTC_USD;
          } else if (t.symbol === 'brBNB') {
            priceUSD = 650;
            priceETH = priceUSD / ZKLTC_USD;
          } else if (t.symbol === 'LXRP') {
            priceUSD = 2.50;
            priceETH = priceUSD / ZKLTC_USD;
          }

          // Check on-chain SoyaraDex V2 Pair for pool liquidity & DEX price
          try {
            const pair = await publicClient.readContract({
              address: V2_FACTORY,
              abi: [{ name: 'getPair', type: 'function', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'address' }] }],
              functionName: 'getPair',
              args: [WETH, t.address]
            }).catch(() => null);

            if (pair && pair !== '0x0000000000000000000000000000000000000000') {
              const [res, token0] = await Promise.all([
                publicClient.readContract({
                  address: pair,
                  abi: [{ name: 'getReserves', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint112' }, { type: 'uint112' }, { type: 'uint32' }] }],
                  functionName: 'getReserves'
                }),
                publicClient.readContract({
                  address: pair,
                  abi: [{ name: 'token0', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] }],
                  functionName: 'token0'
                })
              ]);

              const isToken0Weth = token0.toLowerCase() === WETH.toLowerCase();
              const reserveWeth = Number(formatUnits(isToken0Weth ? res[0] : res[1], 18));
              const reserveToken = Number(formatUnits(isToken0Weth ? res[1] : res[0], decimals));
              liquidityUSD = reserveWeth * 2 * ZKLTC_USD;

              if (!t.hasOraclePrice && !t.globalSupply && reserveToken > 0) {
                priceETH = reserveWeth / reserveToken;
                priceUSD = priceETH * ZKLTC_USD;
              }
            }
          } catch {}

          const marketCapUSD = priceUSD * supply;

          return {
            address: t.address,
            name: t.name,
            symbol: t.symbol,
            decimals,
            logoURI: t.logoURI,
            imageUrl: t.logoURI,
            numeraire: addresses?.weth,
            pool: null,
            blockNumber: 40000000n,
            bondingCurveProgress: 100,
            isGraduated: true,
            isLiveToken: true,
            priceETH,
            priceUSD,
            marketCapUSD,
            liquidityUSD,
            totalVolumeUSD: t.isPopular ? 25000 : 5000,
            swapCount: t.isPopular ? 120 : 35,
          };
        })
      );

      // 2. Query Goldsky Subgraph for Doppler fair launches
      let dopplerTokens = [];
      const subgraphUrl = addresses?.subgraphUrl;

      if (subgraphUrl) {
        try {
          const res = await fetch(subgraphUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: `{
                tokens(first: 250, orderBy: createdAtBlockNumber, orderDirection: desc) {
                  id
                  name
                  symbol
                  decimals
                  totalSupply
                  numeraire
                  v3Pool
                  v2Pair
                  isGraduated
                  priceUSD
                  priceETH
                  marketCapUSD
                  bondingCurveProgress
                  tradeVolumeUSD
                  totalSwaps
                  createdAtBlockNumber
                }
              }`,
            }),
          });
          const json = await res.json();
          if (json?.data?.tokens && json.data.tokens.length > 0) {
            dopplerTokens = await Promise.all(
              json.data.tokens.map(async (t) => {
                let tokenUri = '';
                try {
                  tokenUri = await publicClient.readContract({
                    address: t.id,
                    abi: ERC20_ABI,
                    functionName: 'tokenURI',
                  }).catch(() => '');
                } catch {}

                const supply = Number(t.totalSupply) / (10 ** (Number(t.decimals) || 18)) || 1000000000;
                const isGrad = !!t.isGraduated;
                const progress = isGrad ? 100 : Number(t.bondingCurveProgress || 0);

                let priceETH = 0.00000000205498;
                let priceUSD = 0.00000009087;
                let marketCapUSD = 90.87;

                // Read exact on-chain slot0 from SoyaraDex V3 Pool
                if (t.v3Pool && t.v3Pool !== '0x0000000000000000000000000000000000000000') {
                  try {
                    const slot0 = await publicClient.readContract({
                      address: t.v3Pool,
                      abi: POOL_ABI,
                      functionName: 'slot0'
                    }).catch(() => null);

                    if (slot0 && slot0[0] > 0n) {
                      const sqrt = Number(slot0[0]) / (2 ** 96);
                      const tokensPerWETH = sqrt * sqrt;
                      if (tokensPerWETH > 0) {
                        priceETH = 1 / tokensPerWETH;
                        priceUSD = priceETH * 44.22;
                        marketCapUSD = priceUSD * supply;
                      }
                    }
                  } catch (err) {
                    console.warn('Error reading explore pool slot0:', err);
                  }
                }

                // If not found in slot0, use curve fallback:
                if (!priceUSD || marketCapUSD === 90.87) {
                  const tick = isGrad ? 167520 : 200040 - (progress / 100) * (200040 - 167520);
                  const tokensPerETH = Math.pow(1.0001, tick);
                  if (tokensPerETH > 0) {
                    priceETH = 1 / tokensPerETH;
                    priceUSD = priceETH * 44.22;
                    marketCapUSD = priceUSD * supply;
                  }
                }

                const liquidityUSD = isGrad ? 2500 : 30.00;

                return {
                  address: t.id,
                  name: t.name,
                  symbol: t.symbol,
                  decimals: Number(t.decimals),
                  tokenURI: tokenUri,
                  numeraire: t.numeraire,
                  pool: t.v3Pool,
                  blockNumber: BigInt(t.createdAtBlockNumber || '0'),
                  bondingCurveProgress: Number(t.bondingCurveProgress || 0),
                  isGraduated: t.isGraduated,
                  priceETH,
                  priceUSD,
                  marketCapUSD,
                  liquidityUSD,
                  totalVolumeUSD: Number(t.tradeVolumeUSD || 0),
                  swapCount: Number(t.totalSwaps || 0),
                };
              })
            );
          }
        } catch (subgraphErr) {
          console.warn('Goldsky subgraph query error:', subgraphErr);
        }
      }

      // Merge verified ecosystem tokens and Doppler tokens into one list
      const combined = [...dopplerTokens, ...verifiedList];

      // Deduplicate by address
      const seen = new Set();
      const uniqueTokens = [];
      for (const t of combined) {
        const lower = t.address?.toLowerCase();
        if (lower && !seen.has(lower)) {
          seen.add(lower);
          uniqueTokens.push(t);
        }
      }

      inMemoryExploreCache = {
        tokens: uniqueTokens,
        timestamp: Date.now(),
      };
      setTokens(uniqueTokens);
    } catch (err) {
      console.warn('Failed to fetch tokens:', err);
      if (inMemoryExploreCache.tokens.length === 0) {
        setError('Failed to fetch tokens: ' + (err.message || err));
      }
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [addresses?.airlock, addresses?.weth, addresses?.subgraphUrl, publicClient]);

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

  // ── Tab Sorting & Search Filtering ──────────────────────────────────────────

  const filteredAndSorted = useMemo(() => {
    let list = tokens.filter((t) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        t.name?.toLowerCase().includes(q) ||
        t.symbol?.toLowerCase().includes(q) ||
        t.address?.toLowerCase().includes(q)
      );
    });

    switch (activeTab) {
      case 'trending':
        // High momentum & curve progression
        return list.sort((a, b) => {
          const scoreA = (a.bondingCurveProgress || 0) + (a.totalVolumeUSD || 0) * 0.01;
          const scoreB = (b.bondingCurveProgress || 0) + (b.totalVolumeUSD || 0) * 0.01;
          return scoreB - scoreA;
        });
      case 'new':
        // Newest created
        return list.sort((a, b) => Number((b.blockNumber || 0n) - (a.blockNumber || 0n)));
      case 'graduating':
        // Nearing graduation (highest bonding curve progress < 100)
        return list
          .filter((t) => !t.isGraduated)
          .sort((a, b) => (b.bondingCurveProgress || 0) - (a.bondingCurveProgress || 0));
      case 'traded':
        // Top 24h trading volume
        return list.sort((a, b) => (b.totalVolumeUSD || 0) - (a.totalVolumeUSD || 0));
      case 'all':
      default:
        return list.sort((a, b) => Number((b.blockNumber || 0n) - (a.blockNumber || 0n)));
    }
  }, [tokens, search, activeTab]);

  // ── Pagination Calculation ──────────────────────────────────────────────────

  const totalPages = Math.max(1, Math.ceil(filteredAndSorted.length / ITEMS_PER_PAGE));
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedTokens = filteredAndSorted.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, activeTab]);

  const handlePageChange = (p) => {
    if (p >= 1 && p <= totalPages) {
      setCurrentPage(p);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // ── Summary Stats ───────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const totalCount = tokens.length;
    const graduatedCount = tokens.filter((t) => t.isGraduated).length;
    const totalVolume = tokens.reduce((acc, t) => acc + (t.totalVolumeUSD || 0), 0);
    const gradRate = totalCount > 0 ? Math.round((graduatedCount / totalCount) * 100) : 0;
    return { totalCount, graduatedCount, totalVolume, gradRate };
  }, [tokens]);

  return (
    <div className={styles.wrapper}>
      {/* Top 10 Trending Marquee Carousel */}
      <TrendingCarousel tokens={tokens} />

      {/* Controls & Search Row */}
      <div className={styles.controlsRow}>
        <div className={styles.searchWrapper}>
          <Search size={16} className={styles.searchIcon} />
          <input
            className={styles.search}
            placeholder="Search tokens by name, symbol ($PEPE, $USDC) or 0x contract address…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className={styles.actionsGroup}>
          <div className={styles.viewSwitcher}>
            <button
              className={`${styles.viewBtn} ${viewMode === 'table' ? styles.viewBtnActive : ''}`}
              onClick={() => setViewMode('table')}
              title="Table View (Uniswap Launches)"
            >
              <List size={16} /> Table
            </button>
            <button
              className={`${styles.viewBtn} ${viewMode === 'grid' ? styles.viewBtnActive : ''}`}
              onClick={() => setViewMode('grid')}
              title="Grid Card View"
            >
              <LayoutGrid size={16} /> Cards
            </button>
          </div>

          <button className={styles.refreshBtn} onClick={() => fetchTokens(true)} disabled={loading || isRefreshing} title="Refresh Token List">
            <RotateCw size={14} className={loading || isRefreshing ? styles.spinning : ''} />
            <span>{isRefreshing ? 'Refreshing…' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Primary Category Tabs: Trending | New | Graduating Soon | Top Traded | All */}
      <div className={styles.tabsRow}>
        <div className={styles.tabsList}>
          <button
            className={`${styles.tabBtn} ${activeTab === 'trending' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('trending')}
          >
            <Flame size={15} /> Trending
          </button>
          <button
            className={`${styles.tabBtn} ${activeTab === 'new' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('new')}
          >
            <Sparkles size={15} /> New Launches
          </button>
          <button
            className={`${styles.tabBtn} ${activeTab === 'graduating' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('graduating')}
          >
            <Award size={15} /> Graduating Soon
          </button>
          <button
            className={`${styles.tabBtn} ${activeTab === 'traded' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('traded')}
          >
            <TrendingUp size={15} /> Top Traded
          </button>
{/*           <button
            className={`${styles.tabBtn} ${activeTab === 'all' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('all')}
          >
            <LayoutGrid size={15} /> All ({tokens.length})
          </button> */}
        </div>

        <div className={styles.tokenCounter}>
          {isRefreshing ? (
            <div className={styles.liveSyncBanner}>
              <span className={styles.liveSyncDot} />
              <span>Syncing live state…</span>
            </div>
          ) : (
            <span>
              Showing <strong>{filteredAndSorted.length > 0 ? startIndex + 1 : 0} - {Math.min(startIndex + ITEMS_PER_PAGE, filteredAndSorted.length)}</strong> of <strong>{filteredAndSorted.length}</strong> tokens
            </span>
          )}
        </div>
      </div>

      {/* Error state */}
      {error && <div className={styles.errorBanner}>{error}</div>}

      {/* Content Area */}
      {loading && tokens.length === 0 ? (
        viewMode === 'table' ? (
          /* ── Full Table Skeleton ────────────────────────────────────────── */
          <div className={styles.tableCard}>
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th style={{ width: '45px' }}>#</th>
                    <th>Token</th>
                    <th>Price</th>
                    <th>Market Cap</th>
                    <th>Bonding Curve</th>
                    <th>Pool Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((idx) => (
                    <tr key={`explore-skel-row-${idx}`}>
                      <td className={styles.rankCol}>
                        <div className={styles.skeletonBlock} style={{ width: '18px', height: '14px' }} />
                      </td>
                      <td>
                        <div className={styles.tokenInfoCell}>
                          <div className={styles.skeletonBlock} style={{ width: '40px', height: '40px', borderRadius: '12px', flexShrink: 0 }} />
                          <div className={styles.tokenNameWrap} style={{ gap: '0.4rem', minWidth: '140px' }}>
                            <div className={styles.skeletonBlock} style={{ width: '110px', height: '16px' }} />
                            <div className={styles.skeletonBlock} style={{ width: '80px', height: '12px' }} />
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className={styles.priceCell} style={{ gap: '0.35rem' }}>
                          <div className={styles.skeletonBlock} style={{ width: '80px', height: '16px' }} />
                          <div className={styles.skeletonBlock} style={{ width: '60px', height: '12px' }} />
                        </div>
                      </td>
                      <td>
                        <div className={styles.skeletonBlock} style={{ width: '90px', height: '18px' }} />
                      </td>
                      <td>
                        <div className={styles.progressCell} style={{ gap: '0.4rem', width: '140px' }}>
                          <div className={styles.skeletonBlock} style={{ width: '50px', height: '12px' }} />
                          <div className={styles.skeletonBlock} style={{ width: '100%', height: '6px', borderRadius: '999px' }} />
                        </div>
                      </td>
                      <td>
                        <div className={`${styles.skeletonBlock} ${styles.skeletonPill}`} style={{ width: '75px', height: '22px' }} />
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <div className={styles.skeletonBlock} style={{ width: '70px', height: '30px', borderRadius: '8px' }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* ── Full Grid Skeleton ─────────────────────────────────────────── */
          <div className={styles.grid}>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((idx) => (
              <div key={`explore-skel-card-${idx}`} className={styles.skeletonCard}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                  <div className={styles.skeletonBlock} style={{ width: '48px', height: '48px', borderRadius: '14px', flexShrink: 0 }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', flex: 1 }}>
                    <div className={styles.skeletonBlock} style={{ width: '110px', height: '16px' }} />
                    <div className={styles.skeletonBlock} style={{ width: '80px', height: '12px' }} />
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <div className={styles.skeletonBlock} style={{ width: '60px', height: '12px' }} />
                  <div className={styles.skeletonBlock} style={{ width: '100%', height: '8px', borderRadius: '999px' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <div className={styles.skeletonBlock} style={{ width: '45px', height: '10px' }} />
                    <div className={styles.skeletonBlock} style={{ width: '70px', height: '16px' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <div className={styles.skeletonBlock} style={{ width: '45px', height: '10px' }} />
                    <div className={styles.skeletonBlock} style={{ width: '70px', height: '16px' }} />
                  </div>
                </div>
                <div className={styles.skeletonBlock} style={{ width: '100%', height: '36px', borderRadius: '10px' }} />
              </div>
            ))}
          </div>
        )
      ) : paginatedTokens.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>🚀</div>
          <h3>No Tokens Found</h3>
          <p>
            {tokens.length === 0
              ? 'No tokens active on LitVM yet. Deploy the first fair-launch token!'
              : 'No tokens match your search criteria.'}
          </p>
        </div>
      ) : viewMode === 'table' ? (
        /* ── Uniswap Launches Table View ──────────────────────────────────────── */
        <div className={styles.tableCard}>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th style={{ width: '45px' }}>#</th>
                  <th>Token</th>
                  <th>Price</th>
                  <th>Market Cap</th>
                  <th>Bonding Curve</th>
                  <th>Pool Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedTokens.map((token, idx) => {
                  const logoSrc = extractTokenLogo(token);
                  const progress = token.isGraduated ? 100 : (token.bondingCurveProgress || 0);

                  return (
                    <tr
                      key={token.address}
                      className={styles.tableRowClickable}
                      onClick={() => router.push(`/trade/${token.address}`)}
                    >
                      <td className={styles.rankCol}>{startIndex + idx + 1}</td>
                      <td>
                        <div className={styles.tokenInfoCell}>
                          <div className={styles.tokenLogoWrap}>
                            {logoSrc ? (
                              <img src={logoSrc} alt={token.symbol} className={styles.tableLogoImg} />
                            ) : (
                              <span className={styles.tableLogoFallback}>
                                {token.symbol?.[0] || '?'}
                              </span>
                            )}
                          </div>
                          <div className={styles.tokenNameWrap}>
                            <div className={styles.nameRow}>
                              <strong className={styles.tableName}>{token.name}</strong>
                              <span className={styles.tableSymbol}>${token.symbol}</span>
                            </div>
                            <div className={styles.addrRow}>
                              <span className={styles.tableAddr}>{shortAddr(token.address)}</span>
                              <a
                                href={`https://liteforge.explorer.caldera.xyz/address/${token.address}`}
                                target="_blank"
                                rel="noreferrer"
                                className={styles.tableExplorerLink}
                                title="View on Caldera Explorer"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ExternalLink size={11} />
                              </a>
                            </div>
                          </div>
                        </div>
                      </td>

                      <td>
                        <div className={styles.priceCell}>
                          <span className={styles.priceUsd}>
                            {formatPriceUSD(token.priceUSD)}
                          </span>
                          <small className={styles.priceZkLtc}>
                            {formatPriceETH(token.priceETH)}
                          </small>
                        </div>
                      </td>

                      <td>
                        <strong className={styles.mcapVal}>
                          {formatMarketCap(token.marketCapUSD)}
                        </strong>
                      </td>

                      <td>
                        {token.isLiveToken ? (
                          <span className={styles.liveTokenCellTag}>Live Token</span>
                        ) : (
                          <div className={styles.progressCell}>
                            <div className={styles.progressTextRow}>
                              <span>{token.isGraduated ? 'Graduated (100%)' : `${progress}%`}</span>
                            </div>
                            <div className={styles.tableProgressBarBg}>
                              <div
                                className={`${styles.tableProgressBarFill} ${token.isGraduated ? styles.graduatedFill : ''}`}
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </td>

                      <td>
                        <span className={`${styles.statusBadge} ${token.isLiveToken ? styles.purpleBadge : token.isGraduated ? styles.greenBadge : styles.blueBadge}`}>
                          {token.isLiveToken ? 'Live DEX' : token.isGraduated ? 'Graduated' : 'Active V3'}
                        </span>
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        <div className={styles.actionsCell}>
                          <Link
                            href={`/trade/${token.address}`}
                            className={styles.tableTradeBtn}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Zap size={13} /> Trade
                          </Link>
                          {!token.isGraduated && (
                            <button
                              className={styles.tableGraduateBtn}
                              onClick={(e) => {
                                e.stopPropagation();
                                onMigrate?.(token.address);
                              }}
                              title="Graduate Liquidity to SoyaraDex V2"
                            >
                              Graduate
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ── Card Grid View ──────────────────────────────────────────────────── */
        <div className={styles.grid}>
          {paginatedTokens.map((token) => (
            <TokenCard key={token.address} token={token} onMigrate={onMigrate} />
          ))}
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className={styles.paginationRow}>
          <button
            className={styles.pageArrow}
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
          >
            <ChevronLeft size={16} /> Prev
          </button>

          <div className={styles.pageNumbers}>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => {
              if (
                pageNum === 1 ||
                pageNum === totalPages ||
                (pageNum >= currentPage - 2 && pageNum <= currentPage + 2)
              ) {
                return (
                  <button
                    key={pageNum}
                    className={`${styles.pageNumberBtn} ${currentPage === pageNum ? styles.pageActive : ''}`}
                    onClick={() => handlePageChange(pageNum)}
                  >
                    {pageNum}
                  </button>
                );
              }
              if (pageNum === currentPage - 3 || pageNum === currentPage + 3) {
                return <span key={pageNum} className={styles.pageEllipsis}>…</span>;
              }
              return null;
            })}
          </div>

          <button
            className={styles.pageArrow}
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            Next <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
