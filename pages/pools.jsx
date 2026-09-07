import { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import { useAccount, useBalance, useChainId, usePublicClient, useWriteContract } from 'wagmi';
import { formatUnits, zeroAddress, encodeFunctionData } from 'viem';
import Container from '../components/layout/Container';
import { FACTORY_ABI, PAIR_ABI, ROUTER_ABI, ERC20_ABI } from '../constants/abis';
import V3_FACTORY_ABI from '../constants/abis/v3/factory.json';
import V3_POSITION_MANAGER_ABI from '../constants/abis/v3/positionManager.json';
import V3_POOL_ABI from '../constants/abis/v3/pool.json';
import { ETHERS_CONSTANTS } from '../constants/ethers';
import { GasUtils } from '../constants/gas';
import { getContractAddresses } from '../constants/addresses';
import { getTokensForChain } from '../constants/tokens';
import { useTokenContext } from '../components/contexts/TokenContext';
import TokenSelectModal from '../components/common/TokenSelectModal';
import styles from './PoolPage.module.css';

// Sub-components
import Sidebar from '../components/pool/Sidebar';
import AddCustomPairModal from '../components/pool/AddCustomPairModal';
import SecurityDashboard from '../components/pool/SecurityDashboard';
import AddLiquidityPanel from '../components/pool/AddLiquidityPanel';
import ManageLiquidityPanel from '../components/pool/ManageLiquidityPanel';
import { 
  DEFAULT_CHAIN, 
  DEADLINE_MINUTES, 
  SLIPPAGE_PERCENT, 
  PRICE_RATIO_GUARD_PERCENT,
  V3_FEE_OPTIONS, 
  compactNumber, 
  formatBigIntBalance, 
  safeParseAmount, 
  resolveTokenAddress, 
  buildPairs, 
  getLogo,
  formatSharePercent,
  makePairKey,
  getV3TickSpacing,
  calculateV3PositionTokenAmounts,
  calculateV3UncollectedFees,
  applySlippage,
  encodeSqrtRatioX96
} from '../components/pool/PoolUtils';

import { 
  validateLiquidityAddition 
} from '../components/utils/validation';

const normalizeAddress = (value) => (value || '').toLowerCase();

const matchesV3Position = (position, tokenAAddress, tokenBAddress, fee) => {
  const tokenA = normalizeAddress(tokenAAddress);
  const tokenB = normalizeAddress(tokenBAddress);
  const token0 = normalizeAddress(position.token0);
  const token1 = normalizeAddress(position.token1);

  return (
    Number(position.fee) === Number(fee) &&
    ((token0 === tokenA && token1 === tokenB) || (token0 === tokenB && token1 === tokenA))
  );
};

const tokenLogo = (symbol) => (
  `https://ui-avatars.com/api/?name=${encodeURIComponent(symbol || 'T')}&background=0f172a&color=fff&size=128`
);

/**
 * Format the auto-filled counterpart amount for an add-liquidity deposit.
 *
 * `.toFixed(6)` was wrong in two ways: it ROUNDS, so the paired amount could come
 * out slightly above what the pool ratio implies (and above the user's balance),
 * and on a pair with a large price difference a small deposit rounded all the way
 * to "0.000000" - a zero-amount deposit that just reverts. This keeps up to 8
 * decimal places and always truncates, so the filled amount is never more than
 * the ratio actually calls for.
 */
function formatPairedAmount(value, decimals) {
  if (!Number.isFinite(value) || value <= 0) return '';
  const places = Math.min(decimals || 18, 8);
  const [intPart, fracPart = ''] = value.toFixed(places + 2).split('.');
  let out = `${intPart}.${fracPart.slice(0, places)}`;
  out = out.replace(/0+$/, '').replace(/\.$/, '');
  return out || '0';
}

export default function PoolPage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId() || DEFAULT_CHAIN;
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const addresses = useMemo(() => getContractAddresses(chainId), [chainId]);
  
  const { 
    customTokens, 
    customPairs, 
    addCustomToken, 
    addCustomPair, 
    removeCustomPair 
  } = useTokenContext();

  const [discoveredTokens, setDiscoveredTokens] = useState([]);
  const [discoveredPairs, setDiscoveredPairs] = useState([]);

  const baseTokens = useMemo(() => {
    const baseTokens = getTokensForChain(chainId);
    const combined = [...baseTokens];
    customTokens.forEach(ct => {
      if (!combined.some(t => t.address.toLowerCase() === ct.address.toLowerCase())) {
        combined.push(ct);
      }
    });
    return combined;
  }, [chainId, customTokens]);

  const tokens = useMemo(() => {
    const combined = [...baseTokens];
    discoveredTokens.forEach((token) => {
      if (!combined.some((item) => item.address.toLowerCase() === token.address.toLowerCase())) {
        combined.push(token);
      }
    });
    return combined;
  }, [baseTokens, discoveredTokens]);

  const pairOptions = useMemo(() => {
    const standardTokens = tokens.filter(t => !t.isCustom && !t.isDiscovered);
    const built = buildPairs(standardTokens, addresses);
    const combined = [...built];
    [...customPairs, ...discoveredPairs].forEach(cp => {
      if (!combined.some(p => p.key === cp.key)) {
        combined.push(cp);
      }
    });
    return combined;
  }, [tokens, addresses, customPairs, discoveredPairs]);

  const { data: nativeBalanceData } = useBalance({
    address,
    query: { enabled: !!address },
  });

  const [catalog, setCatalog] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState('');
  const [activeTab, setActiveTab] = useState('add');
  const [version, setVersion] = useState('v2');
  const [v3Fee, setV3Fee] = useState(3000);
  const [amountA, setAmountA] = useState('');
  const [amountB, setAmountB] = useState('');
  const [withdrawPercent, setWithdrawPercent] = useState(100);

  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);
  const [modalConfig, setModalConfig] = useState({ type: 'tokenA', title: 'Select Token' });
  const [isAddPairModalOpen, setIsAddPairModalOpen] = useState(false);

  const handleTokenSelect = useCallback((token) => {
    setIsTokenModalOpen(false);
  }, []);

  const handleImportToken = useCallback(async (address) => {
    try {
      const token = await addCustomToken(address);
      return token;
    } catch (err) {
      console.error('Import failed:', err);
      throw err;
    }
  }, [addCustomToken]);

  const [pairState, setPairState] = useState({
    loading: false,
    poolExists: false,
    pairAddress: zeroAddress,
    reserveA: 0n,
    reserveB: 0n,
    totalSupply: 0n,
    lpBalance: 0n,
    lpAllowance: 0n,
    balanceA: 0n,
    balanceB: 0n,
    allowanceA: 0n,
    allowanceB: 0n,
    v3Positions: [],
    v3SqrtPriceX96: 0n,
    v3CurrentTick: 0,
  });
  const [pendingAction, setPendingAction] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const getKnownToken = useCallback((tokenAddress) => {
    const normalized = normalizeAddress(tokenAddress);
    return baseTokens.find((token) => (
      normalizeAddress(resolveTokenAddress(token, addresses)) === normalized ||
      normalizeAddress(token.address) === normalized
    )) ||
      customTokens.find((token) => (
        normalizeAddress(resolveTokenAddress(token, addresses)) === normalized ||
        normalizeAddress(token.address) === normalized
      )) ||
      null;
  }, [baseTokens, customTokens, addresses]);

  const fetchTokenMetadata = useCallback(async (tokenAddress) => {
    const known = getKnownToken(tokenAddress);
    if (known) return known;

    const [name, symbol, decimals] = await Promise.all([
      publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'name',
      }).catch(() => 'Unknown Token'),
      publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'symbol',
      }).catch(() => 'UNKNOWN'),
      publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'decimals',
      }).catch(() => 18),
    ]);

    return {
      address: tokenAddress.toLowerCase(),
      name: String(name || 'Unknown Token'),
      symbol: String(symbol || 'UNKNOWN'),
      decimals: Number(decimals) || 18,
      logoURI: tokenLogo(symbol),
      chainId,
      isCustom: false,
      isDiscovered: true,
      isVerified: false,
    };
  }, [chainId, getKnownToken, publicClient]);

  const selectedPair = useMemo(
    () => pairOptions.find((pair) => pair.key === selectedKey) || pairOptions[0] || null,
    [pairOptions, selectedKey]
  );

  useEffect(() => {
    if (!selectedKey && pairOptions.length > 0) {
      setSelectedKey(pairOptions[0].key);
    }
  }, [pairOptions, selectedKey]);

  useEffect(() => {
    let cancelled = false;

    const discoverV3Positions = async () => {
      if (!address || !publicClient || !addresses.v3PositionManager) {
        setDiscoveredTokens([]);
        setDiscoveredPairs([]);
        return;
      }

      try {
        const balance = await publicClient.readContract({
          address: addresses.v3PositionManager,
          abi: V3_POSITION_MANAGER_ABI,
          functionName: 'balanceOf',
          args: [address],
        });

        const tokenIds = await Promise.all(
          Array.from({ length: Number(balance) }, (_, index) => (
            publicClient.readContract({
              address: addresses.v3PositionManager,
              abi: V3_POSITION_MANAGER_ABI,
              functionName: 'tokenOfOwnerByIndex',
              args: [address, BigInt(index)],
            })
          ))
        );

        const rawPositions = await Promise.all(
          tokenIds.map((tokenId) => (
            publicClient.readContract({
              address: addresses.v3PositionManager,
              abi: V3_POSITION_MANAGER_ABI,
              functionName: 'positions',
              args: [tokenId],
            }).catch(() => null)
          ))
        );

        const tokenAddresses = [...new Set(rawPositions
          .filter(Boolean)
          .flatMap((position) => [position[2], position[3]])
          .map((tokenAddress) => tokenAddress.toLowerCase()))];

        const metadata = await Promise.all(tokenAddresses.map((tokenAddress) => fetchTokenMetadata(tokenAddress)));
        const tokenMap = new Map(metadata.map((token) => [
          resolveTokenAddress(token, addresses).toLowerCase(),
          token
        ]));
        const pairs = [];

        rawPositions.filter(Boolean).forEach((position) => {
          const tokenA = tokenMap.get(position[2].toLowerCase());
          const tokenB = tokenMap.get(position[3].toLowerCase());
          if (!tokenA || !tokenB) return;

          const key = makePairKey(tokenA, tokenB);
          if (!pairs.some((pair) => pair.key === key)) {
            pairs.push({
              key,
              tokenA,
              tokenB,
              isDiscovered: true,
            });
          }
        });

        if (!cancelled) {
          setDiscoveredTokens(metadata.filter((token) => !getKnownToken(token.address)));
          setDiscoveredPairs(pairs);
        }
      } catch (err) {
        console.warn('Failed to discover V3 positions:', err);
      }
    };

    discoverV3Positions();

    return () => {
      cancelled = true;
    };
  }, [address, publicClient, addresses.v3PositionManager, fetchTokenMetadata, getKnownToken]);

  const refreshCatalog = useCallback(async () => {
    if (!publicClient || pairOptions.length === 0) return;

    setCatalogLoading(true);
    try {
      let ownedV3Positions = [];

      if (version === 'v3' && address && addresses.v3PositionManager) {
        try {
          const v3Balance = await publicClient.readContract({
            address: addresses.v3PositionManager,
            abi: V3_POSITION_MANAGER_ABI,
            functionName: 'balanceOf',
            args: [address],
          });

          const tokenIds = await Promise.all(
            Array.from({ length: Number(v3Balance) }, (_, index) => (
              publicClient.readContract({
                address: addresses.v3PositionManager,
                abi: V3_POSITION_MANAGER_ABI,
                functionName: 'tokenOfOwnerByIndex',
                args: [address, BigInt(index)],
              })
            ))
          );

          const positions = await Promise.all(
            tokenIds.map((tokenId) => (
              publicClient.readContract({
                address: addresses.v3PositionManager,
                abi: V3_POSITION_MANAGER_ABI,
                functionName: 'positions',
                args: [tokenId],
              }).catch(() => null)
            ))
          );

          ownedV3Positions = positions.filter(Boolean).map((position) => ({
            token0: position[2],
            token1: position[3],
            fee: position[4],
          }));
        } catch (positionErr) {
          console.warn('Catalog V3 position check failed:', positionErr);
        }
      }

      const nextCatalog = await Promise.all(
        pairOptions.map(async (pair) => {
          const tokenAAddress = resolveTokenAddress(pair.tokenA, addresses);
          const tokenBAddress = resolveTokenAddress(pair.tokenB, addresses);

          try {
            let pairAddress = zeroAddress;
            let hasPool = false;
            let hasPosition = false;

            if (version === 'v3') {
              if (addresses.v3Factory) {
                try {
                  pairAddress = await publicClient.readContract({
                    address: addresses.v3Factory,
                    abi: V3_FACTORY_ABI,
                    functionName: 'getPool',
                    args: [tokenAAddress, tokenBAddress, v3Fee],
                  });
                  hasPool = !!pairAddress && pairAddress !== zeroAddress;
                  hasPosition = ownedV3Positions.some((position) => (
                    matchesV3Position(position, tokenAAddress, tokenBAddress, v3Fee)
                  ));
                } catch (catV3Err) {
                  console.warn('Catalog V3 check failed:', catV3Err);
                }
              }
            } else {
              if (addresses.factory) {
                pairAddress = await publicClient.readContract({
                  address: addresses.factory,
                  abi: FACTORY_ABI,
                  functionName: 'getPair',
                  args: [tokenAAddress, tokenBAddress],
                });
                hasPool = !!pairAddress && pairAddress !== zeroAddress;

                if (hasPool && address) {
                  const lpBalance = await publicClient.readContract({
                    address: pairAddress,
                    abi: PAIR_ABI,
                    functionName: 'balanceOf',
                    args: [address],
                  }).catch(() => 0n);
                  hasPosition = lpBalance > 0n;
                }
              }
            }

            return {
              ...pair,
              pairAddress,
              hasPool,
              hasPosition,
            };
          } catch {
            return {
              ...pair,
              pairAddress: zeroAddress,
              hasPool: false,
              hasPosition: false,
            };
          }
        })
      );

      setCatalog(nextCatalog);
    } finally {
      setCatalogLoading(false);
    }
  }, [publicClient, addresses, pairOptions, address, version, v3Fee]);

  const refreshSelectedPair = useCallback(async () => {
    if (!publicClient || !selectedPair || !addresses?.factory) return;

    setPairState((prev) => ({ ...prev, loading: true }));
    try {
      const tokenAAddress = resolveTokenAddress(selectedPair.tokenA, addresses);
      const tokenBAddress = resolveTokenAddress(selectedPair.tokenB, addresses);

      let poolExists = false;
      let pairAddress = zeroAddress;
      let v3SqrtPriceX96 = 0n;
      let v3CurrentTick = 0;
      let v3FeeGrowthGlobal0X128 = 0n;
      let v3FeeGrowthGlobal1X128 = 0n;

      if (version === 'v3') {
        if (addresses.v3Factory) {
          try {
            pairAddress = await publicClient.readContract({
              address: addresses.v3Factory,
              abi: V3_FACTORY_ABI,
              functionName: 'getPool',
              args: [tokenAAddress, tokenBAddress, v3Fee],
            });
            poolExists = !!pairAddress && pairAddress !== zeroAddress;

            if (poolExists) {
              const slot0 = await publicClient.readContract({
                address: pairAddress,
                abi: V3_POOL_ABI,
                functionName: 'slot0',
              }).catch(() => null);
              
              if (slot0) {
                v3SqrtPriceX96 = slot0[0];
                v3CurrentTick = Number(slot0[1]);
              }

              const [feeGrowthGlobal0, feeGrowthGlobal1] = await Promise.all([
                publicClient.readContract({
                  address: pairAddress,
                  abi: V3_POOL_ABI,
                  functionName: 'feeGrowthGlobal0X128',
                }).catch(() => 0n),
                publicClient.readContract({
                  address: pairAddress,
                  abi: V3_POOL_ABI,
                  functionName: 'feeGrowthGlobal1X128',
                }).catch(() => 0n),
              ]);

              v3FeeGrowthGlobal0X128 = feeGrowthGlobal0;
              v3FeeGrowthGlobal1X128 = feeGrowthGlobal1;
            }
          } catch (v3PoolErr) {
            console.warn('V3 Pool lookup failed:', v3PoolErr);
            poolExists = false;
            pairAddress = zeroAddress;
          }
        }
      } else {
        pairAddress = await publicClient.readContract({
          address: addresses.factory,
          abi: FACTORY_ABI,
          functionName: 'getPair',
          args: [tokenAAddress, tokenBAddress],
        });
        poolExists = !!pairAddress && pairAddress !== zeroAddress;
      }

      const balanceAPromise = !address
        ? Promise.resolve(0n)
        : selectedPair.tokenA.isNative
        ? Promise.resolve(nativeBalanceData?.value || 0n)
        : publicClient.readContract({
            address: selectedPair.tokenA.address,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [address],
          }).catch(() => 0n);

      const balanceBPromise = !address
        ? Promise.resolve(0n)
        : selectedPair.tokenB.isNative
        ? Promise.resolve(nativeBalanceData?.value || 0n)
        : publicClient.readContract({
            address: selectedPair.tokenB.address,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [address],
          }).catch(() => 0n);

      const spender = version === 'v3' ? addresses.v3PositionManager : addresses.router;

      const allowanceAPromise = selectedPair.tokenA.isNative || !address || !spender
        ? Promise.resolve(ETHERS_CONSTANTS.MaxUint256)
        : publicClient.readContract({
            address: selectedPair.tokenA.address,
            abi: ERC20_ABI,
            functionName: 'allowance',
            args: [address, spender],
          }).catch(() => 0n);

      const allowanceBPromise = selectedPair.tokenB.isNative || !address || !spender
        ? Promise.resolve(ETHERS_CONSTANTS.MaxUint256)
        : publicClient.readContract({
            address: selectedPair.tokenB.address,
            abi: ERC20_ABI,
            functionName: 'allowance',
            args: [address, spender],
          }).catch(() => 0n);

      let reserveA = 0n;
      let reserveB = 0n;
      let totalSupply = 0n;
      let lpBalance = 0n;
      let lpAllowance = 0n;

      if (poolExists) {
        if (version === 'v3') {
          if (v3SqrtPriceX96 > 0n) {
            const Q96 = 2n ** 96n;
            const priceX96 = (v3SqrtPriceX96 * v3SqrtPriceX96 * (10n ** 18n)) / (Q96 * Q96);
            
            const token0 = await publicClient.readContract({
              address: pairAddress,
              abi: V3_POOL_ABI,
              functionName: 'token0',
            });

            const isA0 = token0.toLowerCase() === tokenAAddress.toLowerCase();
            if (isA0) {
              reserveA = 10n ** 18n;
              reserveB = priceX96;
            } else {
              reserveB = 10n ** 18n;
              reserveA = priceX96;
            }
          }
        } else {
          const [token0, reserves, supply, userLpBalance] = await Promise.all([
            publicClient.readContract({
              address: pairAddress,
              abi: PAIR_ABI,
              functionName: 'token0',
            }),
            publicClient.readContract({
              address: pairAddress,
              abi: PAIR_ABI,
              functionName: 'getReserves',
            }),
            publicClient.readContract({
              address: pairAddress,
              abi: PAIR_ABI,
              functionName: 'totalSupply',
            }),
            address
              ? publicClient.readContract({
                  address: pairAddress,
                  abi: PAIR_ABI,
                  functionName: 'balanceOf',
                  args: [address],
                }).catch(() => 0n)
              : Promise.resolve(0n),
          ]);

          const resolvedA = tokenAAddress.toLowerCase();
          const token0Lower = token0.toLowerCase();
          const reserve0 = reserves[0];
          const reserve1 = reserves[1];

          reserveA = token0Lower === resolvedA ? reserve0 : reserve1;
          reserveB = token0Lower === resolvedA ? reserve1 : reserve0;
          totalSupply = supply;
          lpBalance = userLpBalance;

          if (address && addresses.router) {
            lpAllowance = await publicClient.readContract({
              address: pairAddress,
              abi: ERC20_ABI,
              functionName: 'allowance',
              args: [address, addresses.router],
            }).catch(() => 0n);
          }
        }
      }

      let v3Positions = [];
      if (address && addresses.v3PositionManager) {
        try {
          const v3Balance = await publicClient.readContract({
            address: addresses.v3PositionManager,
            abi: V3_POSITION_MANAGER_ABI,
            functionName: 'balanceOf',
            args: [address],
          });

          const numPositions = Number(v3Balance);
          const positionPromises = [];

          for (let i = 0; i < numPositions; i++) {
            positionPromises.push(
              (async () => {
                const tokenId = await publicClient.readContract({
                  address: addresses.v3PositionManager,
                  abi: V3_POSITION_MANAGER_ABI,
                  functionName: 'tokenOfOwnerByIndex',
                  args: [address, BigInt(i)],
                });

                const position = await publicClient.readContract({
                  address: addresses.v3PositionManager,
                  abi: V3_POSITION_MANAGER_ABI,
                  functionName: 'positions',
                  args: [tokenId],
                });

                const pToken0 = position[2].toLowerCase();
                const pToken1 = position[3].toLowerCase();
                const pFee = position[4];
                
                const t0 = tokenAAddress.toLowerCase();
                const t1 = tokenBAddress.toLowerCase();

                if (
                  ((pToken0 === t0 && pToken1 === t1) || (pToken0 === t1 && pToken1 === t0)) &&
                  Number(pFee) === Number(v3Fee)
                ) {
                  const amounts = calculateV3PositionTokenAmounts({
                    sqrtPriceX96: v3SqrtPriceX96,
                    currentTick: v3CurrentTick,
                    tickLower: position[5],
                    tickUpper: position[6],
                    liquidity: position[7],
                  });
                  const [lowerTick, upperTick] = poolExists && pairAddress !== zeroAddress
                    ? await Promise.all([
                        publicClient.readContract({
                          address: pairAddress,
                          abi: V3_POOL_ABI,
                          functionName: 'ticks',
                          args: [position[5]],
                        }).catch(() => null),
                        publicClient.readContract({
                          address: pairAddress,
                          abi: V3_POOL_ABI,
                          functionName: 'ticks',
                          args: [position[6]],
                        }).catch(() => null),
                      ])
                    : [null, null];
                  const fees = lowerTick && upperTick
                    ? calculateV3UncollectedFees({
                        currentTick: v3CurrentTick,
                        tickLower: position[5],
                        tickUpper: position[6],
                        liquidity: position[7],
                        feeGrowthInside0LastX128: position[8],
                        feeGrowthInside1LastX128: position[9],
                        feeGrowthGlobal0X128: v3FeeGrowthGlobal0X128,
                        feeGrowthGlobal1X128: v3FeeGrowthGlobal1X128,
                        lowerFeeGrowthOutside0X128: lowerTick[2],
                        lowerFeeGrowthOutside1X128: lowerTick[3],
                        upperFeeGrowthOutside0X128: upperTick[2],
                        upperFeeGrowthOutside1X128: upperTick[3],
                        tokensOwed0: position[10],
                        tokensOwed1: position[11],
                      })
                    : {
                        fees0: position[10],
                        fees1: position[11],
                      };
                  const isA0 = pToken0 === t0;

                  return {
                    tokenId,
                    token0: position[2],
                    token1: position[3],
                    fee: Number(pFee),
                    tickLower: position[5],
                    tickUpper: position[6],
                    liquidity: position[7],
                    tokensOwed0: position[10],
                    tokensOwed1: position[11],
                    collectable0: fees.fees0,
                    collectable1: fees.fees1,
                    collectableA: isA0 ? fees.fees0 : fees.fees1,
                    collectableB: isA0 ? fees.fees1 : fees.fees0,
                    amount0: amounts.amount0,
                    amount1: amounts.amount1,
                    amountA: isA0 ? amounts.amount0 : amounts.amount1,
                    amountB: isA0 ? amounts.amount1 : amounts.amount0,
                    isA0,
                  };
                }
                return null;
              })()
            );
          }

          const resolvedPositions = await Promise.all(positionPromises);
          v3Positions = resolvedPositions.filter(p => p !== null);
        } catch (v3Err) {
          console.warn('Failed to fetch V3 positions:', v3Err);
        }
      }

      const [balanceA, balanceB, allowanceA, allowanceB] = await Promise.all([
        balanceAPromise,
        balanceBPromise,
        allowanceAPromise,
        allowanceBPromise,
      ]);

      setPairState({
        loading: false,
        poolExists,
        pairAddress,
        reserveA,
        reserveB,
        totalSupply,
        lpBalance,
        lpAllowance,
        balanceA,
        balanceB,
        allowanceA,
        allowanceB,
        v3Positions,
        v3SqrtPriceX96,
        v3CurrentTick,
      });
    } catch (err) {
      setPairState((prev) => ({ ...prev, loading: false }));
      setError(err.message || 'Failed to load selected pair');
    }
  }, [publicClient, selectedPair, addresses, address, nativeBalanceData, version, v3Fee]);

  useEffect(() => {
    refreshCatalog();
  }, [refreshCatalog]);

  useEffect(() => {
    refreshSelectedPair();
  }, [refreshSelectedPair]);

  const reserveRatio = useMemo(() => {
    if (!pairState.poolExists || pairState.reserveA === 0n || pairState.reserveB === 0n) return null;
    const a = parseFloat(formatUnits(pairState.reserveA, selectedPair?.tokenA.decimals || 18));
    const b = parseFloat(formatUnits(pairState.reserveB, selectedPair?.tokenB.decimals || 18));
    if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return null;
    return { a, b };
  }, [pairState, selectedPair]);

  const parsedAmountA = useMemo(
    () => safeParseAmount(amountA, selectedPair?.tokenA.decimals || 18),
    [amountA, selectedPair]
  );
  const parsedAmountB = useMemo(
    () => safeParseAmount(amountB, selectedPair?.tokenB.decimals || 18),
    [amountB, selectedPair]
  );

  const allowanceEnoughA = useMemo(
    () => selectedPair?.tokenA?.isNative || pairState.allowanceA >= parsedAmountA,
    [selectedPair, pairState.allowanceA, parsedAmountA]
  );
  const allowanceEnoughB = useMemo(
    () => selectedPair?.tokenB?.isNative || pairState.allowanceB >= parsedAmountB,
    [selectedPair, pairState.allowanceB, parsedAmountB]
  );

  const liquidityToBurn = useMemo(() => {
    if (!pairState.lpBalance) return 0n;
    return (pairState.lpBalance * BigInt(withdrawPercent)) / 100n;
  }, [pairState.lpBalance, withdrawPercent]);

  const canRemove = pairState.poolExists && pairState.lpBalance > 0n && liquidityToBurn > 0n;
  const lpAllowanceEnough = pairState.lpAllowance >= liquidityToBurn;

  const selectedCatalogItem = useMemo(
    () => catalog.find((item) => item.key === selectedKey) || null,
    [catalog, selectedKey]
  );

  const syncFromA = useCallback(() => {
    if (!reserveRatio || !amountA) return;
    const numericA = parseFloat(amountA);
    if (!Number.isFinite(numericA) || numericA <= 0) return;
    setAmountB(formatPairedAmount((numericA * reserveRatio.b) / reserveRatio.a, selectedPair?.tokenB.decimals));
  }, [amountA, reserveRatio]);

  const syncFromB = useCallback(() => {
    if (!reserveRatio || !amountB) return;
    const numericB = parseFloat(amountB);
    if (!Number.isFinite(numericB) || numericB <= 0) return;
    setAmountA(formatPairedAmount((numericB * reserveRatio.a) / reserveRatio.b, selectedPair?.tokenA.decimals));
  }, [amountB, reserveRatio]);

  const handleAmountAChange = (val) => {
    setAmountA(val);
    if (reserveRatio) {
      const numericA = parseFloat(val);
      if (Number.isFinite(numericA) && numericA > 0) {
        setAmountB(formatPairedAmount((numericA * reserveRatio.b) / reserveRatio.a, selectedPair?.tokenB.decimals));
      } else if (val === '') {
        setAmountB('');
      }
    }
  };

  const handleAmountBChange = (val) => {
    setAmountB(val);
    if (reserveRatio) {
      const numericB = parseFloat(val);
      if (Number.isFinite(numericB) && numericB > 0) {
        setAmountA(formatPairedAmount((numericB * reserveRatio.a) / reserveRatio.b, selectedPair?.tokenA.decimals));
      } else if (val === '') {
        setAmountA('');
      }
    }
  };

  const runTransaction = useCallback(async (config, gasOperation, simulatedGas) => {
    let gas = 0n;
    if (simulatedGas) {
      gas = GasUtils.calculateGas(simulatedGas, chainId, gasOperation);
    } else {
      try {
        const gasEstimate = await publicClient.estimateContractGas(config);
        gas = GasUtils.calculateGas(gasEstimate, chainId, gasOperation);
      } catch (estErr) {
        console.warn('Gas estimation failed, letting wallet handle it:', estErr);
      }
    }

    const hash = await writeContractAsync({ 
      ...config, 
      ...(gas > 0n ? { gas } : {}) 
    });
    
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') throw new Error('Transaction failed');
    return hash;
  }, [publicClient, chainId, writeContractAsync]);

  const handleApprove = useCallback(async (tokenOrPairAddress, label, amount) => {
    if (!address) {
      setError('Connect your wallet first');
      return;
    }
    setError('');
    setSuccess('');
    setPendingAction(`Approving ${label}`);
    const spender = version === 'v3' ? addresses.v3PositionManager : addresses.router;
    if (!amount || amount <= 0n) {
      setError(`Invalid amount for ${label} approval`);
      setPendingAction('');
      return;
    }
    try {
      await runTransaction({
        address: tokenOrPairAddress,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [spender, amount],
        account: address,
      }, 'approve');
      setSuccess(`${label} approved`);
      await Promise.all([refreshSelectedPair(), refreshCatalog()]);
    } catch (err) {
      setError(err.message || `Failed to approve ${label}`);
    } finally {
      setPendingAction('');
    }
  }, [address, version, addresses, runTransaction, refreshSelectedPair, refreshCatalog]);

  const handleAddLiquidity = useCallback(async () => {
    if (!address || !selectedPair) {
      setError('Connect your wallet and choose a pair');
      return;
    }
    if (parsedAmountA <= 0n || parsedAmountB <= 0n) {
      setError('Enter both token amounts');
      return;
    }
    if (pairState.balanceA < parsedAmountA || pairState.balanceB < parsedAmountB) {
      setError('Insufficient wallet balance');
      return;
    }
    const validation = validateLiquidityAddition({
      amountA: parsedAmountA,
      amountB: parsedAmountB,
      reserveA: pairState.reserveA,
      reserveB: pairState.reserveB,
      slippage: SLIPPAGE_PERCENT,
      deadline: DEADLINE_MINUTES,
      poolExists: pairState.poolExists,
      isNewPool: !pairState.poolExists
    });
    if (!validation.isValid) {
      setError(validation.message);
      return;
    }
    if (validation.warning) setSuccess(validation.message);
    setError('');
    setPendingAction('Adding liquidity');
    try {
      const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_MINUTES * 60);
      const slippageBps = BigInt(Math.floor(SLIPPAGE_PERCENT * 100));
      const amountAMin = (parsedAmountA * (10000n - slippageBps)) / 10000n;
      const amountBMin = (parsedAmountB * (10000n - slippageBps)) / 10000n;
      if (version === 'v3') {
        const tokenAAddress = resolveTokenAddress(selectedPair.tokenA, addresses);
        const tokenBAddress = resolveTokenAddress(selectedPair.tokenB, addresses);
        const isToken0 = tokenAAddress.toLowerCase() < tokenBAddress.toLowerCase();
        const [token0, token1] = isToken0 ? [tokenAAddress, tokenBAddress] : [tokenBAddress, tokenAAddress];
        const [amount0, amount1] = isToken0 ? [parsedAmountA, parsedAmountB] : [parsedAmountB, parsedAmountA];
        const [amount0Min, amount1Min] = isToken0 ? [amountAMin, amountBMin] : [amountBMin, amountAMin];
        const spacing = getV3TickSpacing(v3Fee);
        const tickLower = Math.ceil(-887272 / spacing) * spacing;
        const tickUpper = Math.floor(887272 / spacing) * spacing;
        const value = (selectedPair.tokenA.isNative ? parsedAmountA : 0n) + (selectedPair.tokenB.isNative ? parsedAmountB : 0n);
        const calls = [];
        if (!pairState.poolExists) {
          const sqrtPriceX96 = encodeSqrtRatioX96(amount1, amount0);
          calls.push(encodeFunctionData({
            abi: V3_POSITION_MANAGER_ABI,
            functionName: 'createAndInitializePoolIfNecessary',
            args: [token0, token1, v3Fee, sqrtPriceX96],
          }));
        }
        calls.push(encodeFunctionData({
          abi: V3_POSITION_MANAGER_ABI,
          functionName: 'mint',
          args: [{
            token0,
            token1,
            fee: v3Fee,
            tickLower,
            tickUpper,
            amount0Desired: amount0,
            amount1Desired: amount1,
            amount0Min,
            amount1Min,
            recipient: address,
            deadline,
          }],
        }));
        if (value > 0n) calls.push(encodeFunctionData({ abi: V3_POSITION_MANAGER_ABI, functionName: 'refundETH' }));
        const txConfig = { address: addresses.v3PositionManager, abi: V3_POSITION_MANAGER_ABI, functionName: 'multicall', args: [calls], value, account: address };
        let simRes;
        try { simRes = await publicClient.simulateContract(txConfig); } catch (simErr) { throw new Error(`Simulation failed: ${simErr.message}. The transaction would likely fail.`); }
        await runTransaction(txConfig, 'addLiquidity', simRes.request.gas);
      } else {
        if (selectedPair.tokenA.isNative || selectedPair.tokenB.isNative) {
          const isTokenANative = selectedPair.tokenA.isNative;
          const nativeAmount = isTokenANative ? parsedAmountA : parsedAmountB;
          const tokenAmount = isTokenANative ? parsedAmountB : parsedAmountA;
          const tokenAmountMin = isTokenANative ? amountBMin : amountAMin;
          const nativeAmountMin = isTokenANative ? amountAMin : amountBMin;
          const erc20Token = isTokenANative ? selectedPair.tokenB : selectedPair.tokenA;
          try { await publicClient.simulateContract({ address: addresses.router, abi: ROUTER_ABI, functionName: 'addLiquidityETH', args: [erc20Token.address, tokenAmount, tokenAmountMin, nativeAmountMin, address, deadline], value: nativeAmount, account: address }); } catch (simErr) { throw new Error(`Simulation failed: ${simErr.message}. Check reserves or slippage.`); }
          await runTransaction({ address: addresses.router, abi: ROUTER_ABI, functionName: 'addLiquidityETH', args: [erc20Token.address, tokenAmount, tokenAmountMin, nativeAmountMin, address, deadline], value: nativeAmount, account: address }, 'addLiquidityETH');
        } else {
          try { await publicClient.simulateContract({ address: addresses.router, abi: ROUTER_ABI, functionName: 'addLiquidity', args: [selectedPair.tokenA.address, selectedPair.tokenB.address, parsedAmountA, parsedAmountB, amountAMin, amountBMin, address, deadline], account: address }); } catch (simErr) { throw new Error(`Simulation failed: ${simErr.message}. Check reserves or slippage.`); }
          await runTransaction({ address: addresses.router, abi: ROUTER_ABI, functionName: 'addLiquidity', args: [selectedPair.tokenA.address, selectedPair.tokenB.address, parsedAmountA, parsedAmountB, amountAMin, amountBMin, address, deadline], account: address }, 'addLiquidity');
        }
      }
      setSuccess('Liquidity added successfully');
      setAmountA('');
      setAmountB('');
      await Promise.all([refreshSelectedPair(), refreshCatalog()]);
      setActiveTab('manage');
    } catch (err) {
      setError(err.message || 'Failed to add liquidity');
    } finally {
      setPendingAction('');
    }
  }, [address, version, v3Fee, selectedPair, parsedAmountA, parsedAmountB, pairState, addresses, runTransaction, refreshSelectedPair, refreshCatalog, publicClient]);

  const handleDecreaseV3Liquidity = useCallback(async (position) => {
    if (!address || !addresses.v3PositionManager || !selectedPair) return;
    setError('');
    setSuccess('');
    setPendingAction('Removing V3 liquidity');
    try {
      if (!position?.tokenId || !position?.liquidity || position.liquidity <= 0n) {
        throw new Error('No V3 liquidity available to remove');
      }

      const amount0Min = applySlippage(position.amount0 || 0n);
      const amount1Min = applySlippage(position.amount1 || 0n);

      if (amount0Min === 0n && amount1Min === 0n) {
        throw new Error('Unable to calculate safe minimum received for this V3 position');
      }

      const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_MINUTES * 60);
      const tokenAAddress = resolveTokenAddress(selectedPair.tokenA, addresses);
      const tokenBAddress = resolveTokenAddress(selectedPair.tokenB, addresses);
      const hasNative = selectedPair.tokenA.isNative || selectedPair.tokenB.isNative;
      const calls = [];
      calls.push(encodeFunctionData({
        abi: V3_POSITION_MANAGER_ABI,
        functionName: 'decreaseLiquidity',
        args: [{
          tokenId: position.tokenId,
          liquidity: position.liquidity,
          amount0Min,
          amount1Min,
          deadline,
        }]
      }));
      const recipient = hasNative ? ETHERS_CONSTANTS.ZeroAddress : address;
      calls.push(encodeFunctionData({ abi: V3_POSITION_MANAGER_ABI, functionName: 'collect', args: [{ tokenId: position.tokenId, recipient, amount0Max: ETHERS_CONSTANTS.MaxUint128, amount1Max: ETHERS_CONSTANTS.MaxUint128 }] }));
      if (hasNative) {
        calls.push(encodeFunctionData({ abi: V3_POSITION_MANAGER_ABI, functionName: 'unwrapWETH9', args: [0n, address] }));
        const otherTokenAddress = selectedPair.tokenA.isNative ? tokenBAddress : tokenAAddress;
        calls.push(encodeFunctionData({ abi: V3_POSITION_MANAGER_ABI, functionName: 'sweepToken', args: [otherTokenAddress, 0n, address] }));
      }
      const txConfig = { address: addresses.v3PositionManager, abi: V3_POSITION_MANAGER_ABI, functionName: 'multicall', args: [calls], account: address };
      try { await publicClient.simulateContract(txConfig); } catch (simErr) { throw new Error(`Simulation failed: ${simErr.message}`); }
      await runTransaction(txConfig, 'removeLiquidity');
      setSuccess('Liquidity removed and tokens collected');
      await Promise.all([refreshSelectedPair(), refreshCatalog()]);
    } catch (err) { setError(err.message || 'Failed to remove liquidity'); } finally { setPendingAction(''); }
  }, [address, addresses, selectedPair, publicClient, runTransaction, refreshSelectedPair, refreshCatalog]);

  const handleCollectV3Fees = useCallback(async (position) => {
    if (!address || !addresses.v3PositionManager || !selectedPair) return;
    setError('');
    setSuccess('');
    setPendingAction('Collecting tokens & fees');
    try {
      if (!position?.tokenId) {
        throw new Error('Invalid V3 position');
      }

      const collectable0 = position.collectable0 || 0n;
      const collectable1 = position.collectable1 || 0n;
      if (collectable0 === 0n && collectable1 === 0n) {
        throw new Error('No fees or tokens available to collect');
      }

      const owner = await publicClient.readContract({
        address: addresses.v3PositionManager,
        abi: V3_POSITION_MANAGER_ABI,
        functionName: 'ownerOf',
        args: [position.tokenId],
      });

      if (owner.toLowerCase() !== address.toLowerCase()) {
        throw new Error('Connected wallet does not own this V3 position');
      }

      const tokenAAddress = resolveTokenAddress(selectedPair.tokenA, addresses);
      const tokenBAddress = resolveTokenAddress(selectedPair.tokenB, addresses);
      const hasNative = selectedPair.tokenA.isNative || selectedPair.tokenB.isNative;
      const calls = [];
      const recipient = hasNative ? ETHERS_CONSTANTS.ZeroAddress : address;
      calls.push(encodeFunctionData({ abi: V3_POSITION_MANAGER_ABI, functionName: 'collect', args: [{ tokenId: position.tokenId, recipient, amount0Max: ETHERS_CONSTANTS.MaxUint128, amount1Max: ETHERS_CONSTANTS.MaxUint128 }] }));
      if (hasNative) {
        calls.push(encodeFunctionData({ abi: V3_POSITION_MANAGER_ABI, functionName: 'unwrapWETH9', args: [0n, address] }));
        const otherTokenAddress = selectedPair.tokenA.isNative ? tokenBAddress : tokenAAddress;
        calls.push(encodeFunctionData({ abi: V3_POSITION_MANAGER_ABI, functionName: 'sweepToken', args: [otherTokenAddress, 0n, address] }));
      }
      const txConfig = { address: addresses.v3PositionManager, abi: V3_POSITION_MANAGER_ABI, functionName: 'multicall', args: [calls], account: address };
      try { await publicClient.simulateContract(txConfig); } catch (simErr) { throw new Error(`Simulation failed: ${simErr.message}`); }
      await runTransaction(txConfig, 'collect');
      setSuccess('Tokens and fees collected successfully');
      await refreshSelectedPair();
    } catch (err) { setError(err.message || 'Failed to collect fees'); } finally { setPendingAction(''); }
  }, [address, addresses, selectedPair, publicClient, runTransaction, refreshSelectedPair]);

  const handleRemoveLiquidity = useCallback(async () => {
    if (!address || !selectedPair || !canRemove) { setError('No liquidity available to remove'); return; }
    setError('');
    setSuccess('');
    setPendingAction('Removing liquidity');
    try {
      const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_MINUTES * 60);
      const amountOutA = (liquidityToBurn * pairState.reserveA) / (pairState.totalSupply || 1n);
      const amountOutB = (liquidityToBurn * pairState.reserveB) / (pairState.totalSupply || 1n);
      const slippageBps = BigInt(Math.floor(SLIPPAGE_PERCENT * 100));
      const amountAMin = (amountOutA * (10000n - slippageBps)) / 10000n;
      const amountBMin = (amountOutB * (10000n - slippageBps)) / 10000n;
      if (selectedPair.tokenA.isNative || selectedPair.tokenB.isNative) {
        const isTokenANative = selectedPair.tokenA.isNative;
        const erc20Token = isTokenANative ? selectedPair.tokenB : selectedPair.tokenA;
        const tokenAmountMin = isTokenANative ? amountBMin : amountAMin;
        const nativeAmountMin = isTokenANative ? amountAMin : amountBMin;
        await runTransaction({ address: addresses.router, abi: ROUTER_ABI, functionName: 'removeLiquidityETH', args: [erc20Token.address, liquidityToBurn, tokenAmountMin, nativeAmountMin, address, deadline], account: address }, 'removeLiquidity');
      } else {
        const [tokenAAddress, tokenBAddress] = [selectedPair.tokenA.address, selectedPair.tokenB.address].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
        const amount0Min = tokenAAddress.toLowerCase() === selectedPair.tokenA.address.toLowerCase() ? amountAMin : amountBMin;
        const amount1Min = tokenAAddress.toLowerCase() === selectedPair.tokenA.address.toLowerCase() ? amountBMin : amountAMin;
        await runTransaction({ address: addresses.router, abi: ROUTER_ABI, functionName: 'removeLiquidity', args: [tokenAAddress, tokenBAddress, liquidityToBurn, amount0Min, amount1Min, address, deadline], account: address }, 'removeLiquidity');
      }
      setSuccess('Liquidity removed successfully');
      await Promise.all([refreshSelectedPair(), refreshCatalog()]);
    } catch (err) { setError(err.message || 'Failed to remove liquidity'); } finally { setPendingAction(''); }
  }, [address, selectedPair, canRemove, liquidityToBurn, pairState, addresses.router, runTransaction, refreshSelectedPair, refreshCatalog]);

  return (
    <div className={styles.page}>
      <Head>
        <title>Pools & Liquidity | Soyara DEX</title>
        <meta name="description" content="Provide liquidity, earn trading fees, and explore V2 and V3 AMM pools on Soyara DEX." />
      </Head>
      <Container>
        <div className={styles.shell}>
          {/* Classy compact header */}
          <div className={styles.pageHeader}>
            <div>
              <span className={styles.eyebrow}>Liquidity Hub</span>
              <h1 className={styles.pageTitle}>Pools Dashboard</h1>
            </div>
            <div className={styles.headerStatsRow}>
              <div className={styles.compactStatChip}>
                <span className={styles.chipLabel}>Markets:</span>
                <strong className={styles.chipValue}>{pairOptions.length}</strong>
              </div>
              <div className={styles.compactStatChip}>
                <span className={styles.chipLabel}>Active Pools:</span>
                <strong className={styles.chipValue}>{catalog.filter((item) => item.hasPool).length}</strong>
              </div>
            </div>
          </div>

          <div className={styles.layout}>
            <Sidebar
              catalog={catalog}
              catalogLoading={catalogLoading}
              pairOptions={pairOptions}
              selectedKey={selectedKey}
              setSelectedKey={setSelectedKey}
              setAmountA={setAmountA}
              setAmountB={setAmountB}
              setWithdrawPercent={setWithdrawPercent}
              setError={setError}
              setSuccess={setSuccess}
              setModalConfig={setModalConfig}
              setIsTokenModalOpen={setIsTokenModalOpen}
              setIsAddPairModalOpen={setIsAddPairModalOpen}
              removeCustomPair={removeCustomPair}
              getLogo={getLogo}
            />

            <main className={styles.workspace}>
              {selectedPair ? (
                <>
                  <div className={styles.workspaceHeader}>
                    <div className={styles.workspaceTitle}>
                      <div className={styles.pairIconsLarge}>
                        <img src={getLogo(selectedPair.tokenA)} alt={selectedPair.tokenA.symbol} />
                        <img src={getLogo(selectedPair.tokenB)} alt={selectedPair.tokenB.symbol} />
                      </div>
                      <div>
                        <h2>{selectedPair.tokenA.symbol} / {selectedPair.tokenB.symbol}</h2>
                        <p className={styles.workspaceSubtitle}>{selectedCatalogItem?.hasPool ? 'Pool is active and ready for management.' : 'Seed the pair with its first liquidity.'}</p>
                      </div>
                    </div>

                    <div className={styles.tabRow}>
                      <button type="button" className={activeTab === 'add' ? styles.tabActive : styles.tab} onClick={() => setActiveTab('add')}>Add</button>
                      <button type="button" className={activeTab === 'manage' ? styles.tabActive : styles.tab} onClick={() => setActiveTab('manage')}>Manage</button>
                    </div>
                  </div>

                  <SecurityDashboard 
                    priceGuardPercent={PRICE_RATIO_GUARD_PERCENT}
                    slippagePercent={SLIPPAGE_PERCENT}
                  />

                  <div className={styles.versionToggleRow}>
                    <button type="button" className={version === 'v2' ? styles.versionActive : styles.versionTab} onClick={() => setVersion('v2')}>V2 Constant</button>
                    <button type="button" className={version === 'v3' ? styles.versionActive : styles.versionTab} onClick={() => setVersion('v3')}>V3 CLAMM</button>
                  </div>

                  <div className={styles.statsRow}>
                    <div className={styles.statCard}>
                      <span>Status</span>
                      <strong>{pairState.poolExists ? 'Live Pool' : 'Uncreated'}</strong>
                    </div>
                    <div className={styles.statCard}>
                      <span>Pool Ratio</span>
                      <strong>{reserveRatio ? `1 ${selectedPair.tokenA.symbol} = ${compactNumber(reserveRatio.b / reserveRatio.a, 6)} ${selectedPair.tokenB.symbol}` : 'First LP Set'}</strong>
                    </div>
                    <div className={styles.statCard}>
                      <span>{version === 'v3' ? 'V3 Positions' : 'Your V2 LP'}</span>
                      <strong>{version === 'v3' ? `${pairState.v3Positions.length} Positions` : compactNumber(formatBigIntBalance(pairState.lpBalance, 18, 4))}</strong>
                    </div>
                  </div>

                  {version === 'v2' && reserveRatio && (
                    <div style={{
                      margin: '0.6rem 0 0.2rem',
                      padding: '0.7rem 0.85rem',
                      borderRadius: 10,
                      fontSize: '0.76rem',
                      lineHeight: 1.5,
                      background: 'rgba(56,189,248,0.07)',
                      border: '1px solid rgba(56,189,248,0.22)',
                    }}>
                      <div style={{ fontWeight: 700, marginBottom: 3 }}>
                        Pool holds {compactNumber(reserveRatio.a, 2)} {selectedPair.tokenA.symbol} ·{' '}
                        {compactNumber(reserveRatio.b, 2)} {selectedPair.tokenB.symbol}
                      </div>
                      <div style={{ opacity: 0.75 }}>
                        1 {selectedPair.tokenA.symbol} = {compactNumber(reserveRatio.b / reserveRatio.a, 6)} {selectedPair.tokenB.symbol}
                        {'  ·  '}
                        1 {selectedPair.tokenB.symbol} = {compactNumber(reserveRatio.a / reserveRatio.b, 6)} {selectedPair.tokenA.symbol}
                      </div>
                      <div style={{ opacity: 0.62, marginTop: 5 }}>
                        This is the pool&apos;s live composition, not a 1:1 market price - trading moves it
                        away from wherever it was seeded. A V2 deposit must match this ratio exactly, so the
                        second amount is filled in for you; anything above it would be refunded by the router.
                      </div>
                    </div>
                  )}

                  {version === 'v3' && (
                    <>
                      <span className={styles.feeLabel}>Fee Tier</span>
                      <div className={styles.feeSelector}>
                        {V3_FEE_OPTIONS.map((opt) => (
                          <button key={opt.value} type="button" className={v3Fee === opt.value ? styles.feeOptionActive : styles.feeOption} onClick={() => setV3Fee(opt.value)}>
                            <span>{opt.label}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}

                  {error && <div className={styles.error}>{error}</div>}
                  {success && <div className={styles.success}>{success}</div>}
                  {pendingAction && <div className={styles.pending}>{pendingAction}...</div>}

                  {activeTab === 'add' ? (
                    <AddLiquidityPanel
                      selectedPair={selectedPair}
                      pairState={pairState}
                      amountA={amountA}
                      amountB={amountB}
                      handleAmountAChange={handleAmountAChange}
                      handleAmountBChange={handleAmountBChange}
                      reserveRatio={reserveRatio}
                      syncFromA={syncFromA}
                      syncFromB={syncFromB}
                      allowanceEnoughA={allowanceEnoughA}
                      allowanceEnoughB={allowanceEnoughB}
                      parsedAmountA={parsedAmountA}
                      parsedAmountB={parsedAmountB}
                      pendingAction={pendingAction}
                      handleApprove={handleApprove}
                      handleAddLiquidity={handleAddLiquidity}
                      isConnected={isConnected}
                    />
                  ) : (
                    <ManageLiquidityPanel
                      version={version}
                      pairState={pairState}
                      selectedPair={selectedPair}
                      v3Fee={v3Fee}
                      addresses={addresses}
                      pendingAction={pendingAction}
                      handleDecreaseV3Liquidity={handleDecreaseV3Liquidity}
                      handleCollectV3Fees={handleCollectV3Fees}
                      withdrawPercent={withdrawPercent}
                      setWithdrawPercent={setWithdrawPercent}
                      liquidityToBurn={liquidityToBurn}
                      lpAllowanceEnough={lpAllowanceEnough}
                      canRemove={canRemove}
                      handleApprove={handleApprove}
                      handleRemoveLiquidity={handleRemoveLiquidity}
                      isConnected={isConnected}
                    />
                  )}
                </>
              ) : (
                <div className={styles.selectPairPlaceholder}>
                  <div className={styles.selectPairIcon}>📊</div>
                  <h3>Select a Liquidity Market</h3>
                  <p>Choose a token pair from the sidebar list to add liquidity or manage your existing positions.</p>
                </div>
              )}
            </main>
          </div>
        </div>
      </Container>
      
      {isTokenModalOpen && (
        <TokenSelectModal
          tokens={tokens}
          onSelect={handleTokenSelect}
          onClose={() => setIsTokenModalOpen(false)}
          title={modalConfig.title}
          onImportToken={handleImportToken}
          chainId={chainId}
        />
      )}

      <AddCustomPairModal
        isOpen={isAddPairModalOpen}
        onClose={() => setIsAddPairModalOpen(false)}
        tokens={tokens}
        onImportToken={handleImportToken}
        chainId={chainId}
        addCustomPair={addCustomPair}
        setSelectedKey={setSelectedKey}
        getLogo={getLogo}
      />
    </div>
  );
}
