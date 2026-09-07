// hooks/useMemefolio.js
// Custom React hook for fetching and managing a connected user's Doppler meme tokens,
// creator analytics, bonding curve progress, token logos, and claimable integrator fees on LitVM.
// Base/native currency: zkLTC.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAccount, useChainId, usePublicClient, useWalletClient } from 'wagmi';
import { formatUnits, zeroAddress } from 'viem';
import { getDopplerAddresses, isDopplerDeployed } from '../constants/doppler/addresses';
import { DIA_ORACLE_CONFIG } from '../constants/oracleConfig';
import { findTokenByAddress } from '../constants/tokens';
import AIRLOCK_ABI from '../constants/doppler/abis/Airlock';

const FALLBACK_LOGO = '/tlogo.png';

const ERC20_MINIMAL_ABI = [
  { type: 'function', name: 'name', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  { type: 'function', name: 'totalSupply', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'tokenURI', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
];

const DIA_ORACLE_ABI = [
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
];

const AIRLOCK_DEPLOYMENT_BLOCK = 40120000n;
const DEFAULT_ZKLTC_USD_PRICE = 44.22;

export function useMemefolio() {
  const { address: account, isConnected } = useAccount();
  const chainId = useChainId() || 4441;
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [createdTokens, setCreatedTokens] = useState([]);
  const [allNetworkTokens, setAllNetworkTokens] = useState([]);
  const [memeHoldings, setMemeHoldings] = useState([]);
  const [claimableZkLtcFees, setClaimableZkLtcFees] = useState(0n);
  const [zkLtcUsdPrice, setZkLtcUsdPrice] = useState(DEFAULT_ZKLTC_USD_PRICE);
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimSuccessTx, setClaimSuccessTx] = useState(null);

  const addresses = useMemo(() => getDopplerAddresses(chainId), [chainId]);
  const deployed = useMemo(() => isDopplerDeployed(chainId), [chainId]);

  // ── 1. Fetch Real-time zkLTC Oracle Price ──────────────────────────────────

  useEffect(() => {
    if (!publicClient) return;
    (async () => {
      try {
        const zkLtcAdapter = DIA_ORACLE_CONFIG.ADAPTERS['zkLTC'];
        if (zkLtcAdapter) {
          const roundData = await publicClient.readContract({
            address: zkLtcAdapter,
            abi: DIA_ORACLE_ABI,
            functionName: 'latestRoundData',
          });
          if (roundData && roundData[1] > 0n) {
            const oraclePrice = Number(formatUnits(roundData[1], 18));
            if (oraclePrice > 0) {
              setZkLtcUsdPrice(oraclePrice);
            }
          }
        }
      } catch (oracleErr) {
        console.warn('Could not read zkLTC DIA oracle price, using fallback:', oracleErr);
      }
    })();
  }, [publicClient]);

  // ── 2. Main Data Fetching (Goldsky Subgraph + Smart Contracts) ─────────────

  const fetchMemefolioData = useCallback(async () => {
    if (!deployed || !publicClient || !addresses?.airlock) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      setError(null);
      const userLower = account ? account.toLowerCase() : null;

      // a. Query claimable zkLTC fee for the connected user from Airlock
      let totalZkLtcClaimable = 0n;
      if (account) {
        try {
          const fee = await publicClient.readContract({
            address: addresses.airlock,
            abi: AIRLOCK_ABI,
            functionName: 'getIntegratorFees',
            args: [account, addresses.weth],
          });
          totalZkLtcClaimable = fee || 0n;
        } catch {
          totalZkLtcClaimable = 0n;
        }
      }

      // b. Query tokens from Goldsky Subgraph
      let rawTokens = [];
      const subgraphUrl = addresses?.subgraphUrl;

      if (subgraphUrl) {
        try {
          const res = await fetch(subgraphUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: `{
                tokens(first: 200, orderBy: createdAtBlockNumber, orderDirection: desc) {
                  id
                  name
                  symbol
                  decimals
                  totalSupply
                  creator
                  numeraire
                  v3Pool
                  v2Pair
                  isGraduated
                  priceETH
                  priceUSD
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
            rawTokens = json.data.tokens;
          }
        } catch (subErr) {
          console.warn('Subgraph memefolio fetch error:', subErr);
        }
      }

      // Fallback if subgraph returns empty
      if (rawTokens.length === 0) {
        let createLogs = [];
        try {
          createLogs = await publicClient.getLogs({
            address: addresses.airlock,
            event: AIRLOCK_ABI.find((x) => x.type === 'event' && x.name === 'Create'),
            fromBlock: AIRLOCK_DEPLOYMENT_BLOCK,
            toBlock: 'latest',
          });
        } catch {
          const current = await publicClient.getBlockNumber().catch(() => 40130000n);
          const from = current > 20000n ? current - 20000n : AIRLOCK_DEPLOYMENT_BLOCK;
          createLogs = await publicClient.getLogs({
            address: addresses.airlock,
            event: AIRLOCK_ABI.find((x) => x.type === 'event' && x.name === 'Create'),
            fromBlock: from,
            toBlock: 'latest',
          }).catch(() => []);
        }

        rawTokens = createLogs.map((log) => ({
          id: log.args.asset.toLowerCase(),
          name: 'Doppler Token',
          symbol: 'MEME',
          decimals: '18',
          totalSupply: '1000000000000000000000000000',
          creator: account,
          numeraire: log.args.numeraire || addresses.weth,
          v3Pool: log.args.poolOrHook,
          v2Pair: null,
          isGraduated: false,
          priceETH: '0.000000053096',
          priceUSD: '0.000002348',
          marketCapUSD: '2347.90',
          bondingCurveProgress: '0',
          createdAtBlockNumber: log.blockNumber ? log.blockNumber.toString() : '40120813',
        }));
      }

      // c. Enrich with user wallet balances, tokenURI, and logos
      const createdList = [];
      const allList = [];
      const holdingsList = [];

      await Promise.all(
        rawTokens.map(async (t) => {
          const assetAddr = t.id;
          if (!assetAddr || assetAddr === zeroAddress) return;

          try {
            const staticToken = findTokenByAddress(assetAddr.toLowerCase(), 4441);

            const [userBalRes, nameRes, symbolRes, decimalsRes, tokenUriRes] = await Promise.all([
              account
                ? publicClient.readContract({ address: assetAddr, abi: ERC20_MINIMAL_ABI, functionName: 'balanceOf', args: [account] }).catch(() => 0n)
                : Promise.resolve(0n),
              t.name ? t.name : publicClient.readContract({ address: assetAddr, abi: ERC20_MINIMAL_ABI, functionName: 'name' }).catch(() => 'Doppler Token'),
              t.symbol ? t.symbol : publicClient.readContract({ address: assetAddr, abi: ERC20_MINIMAL_ABI, functionName: 'symbol' }).catch(() => 'MEME'),
              t.decimals ? Number(t.decimals) : 18,
              publicClient.readContract({ address: assetAddr, abi: ERC20_MINIMAL_ABI, functionName: 'tokenURI' }).catch(() => ''),
            ]);

            const decimals = decimalsRes || 18;
            const totalSupplyStr = t.totalSupply || '1000000000000000000000000000';
            const initialSupplyNum = Number(formatUnits(BigInt(totalSupplyStr), decimals)) || 1000000000;
            const userBal = userBalRes || 0n;
            const userBalNum = Number(formatUnits(userBal, decimals));
            const creatorSharePct = initialSupplyNum > 0 ? (userBalNum / initialSupplyNum) * 100 : 0;

            // Parse tokenURI metadata
            let metadata = {
              imageUrl: '',
              description: '',
              twitter: '',
              telegram: '',
              website: '',
            };

            if (tokenUriRes) {
              if (tokenUriRes.startsWith('data:application/json;base64,')) {
                try {
                  const jsonStr = atob(tokenUriRes.replace('data:application/json;base64,', ''));
                  const parsed = JSON.parse(jsonStr);
                  if (parsed) {
                    metadata = {
                      imageUrl: parsed.image || '',
                      description: parsed.description || '',
                      twitter: parsed.twitter || '',
                      telegram: parsed.telegram || '',
                      website: parsed.website || '',
                    };
                  }
                } catch {}
              } else if (tokenUriRes.startsWith('http') || tokenUriRes.startsWith('/')) {
                metadata.imageUrl = tokenUriRes;
              } else if (tokenUriRes.startsWith('ipfs://')) {
                metadata.imageUrl = `https://ipfs.io/ipfs/${tokenUriRes.replace('ipfs://', '')}`;
              }
            }

            const resolvedLogo =
              metadata.imageUrl ||
              staticToken?.logoURI ||
              FALLBACK_LOGO;

            const isCreatedByUser = userLower && t.creator ? t.creator.toLowerCase() === userLower : false;
            let priceInZkLTC = Number(t.priceETH || '0.000000053096');
            let priceInUsd = Number(t.priceUSD || '0.000002348');

            if (t.v3Pool && t.v3Pool !== zeroAddress) {
              try {
                const slot0 = await publicClient.readContract({
                  address: t.v3Pool,
                  abi: [
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
                  ],
                  functionName: 'slot0'
                }).catch(() => null);

                if (slot0 && slot0[0] > 0n) {
                  const sqrt = Number(slot0[0]) / (2 ** 96);
                  const tokensPerWETH = sqrt * sqrt;
                  if (tokensPerWETH > 0) {
                    priceInZkLTC = 1 / tokensPerWETH;
                    priceInUsd = priceInZkLTC * zkLtcUsdPrice;
                  }
                }
              } catch {}
            }

            const marketCapZkLTC = priceInZkLTC * initialSupplyNum;
            const marketCapUsd = priceInUsd * initialSupplyNum;
            const progress = Number(t.bondingCurveProgress || '0');

            const tokenObj = {
              address: assetAddr,
              name: nameRes || t.name,
              symbol: symbolRes || t.symbol,
              decimals,
              totalSupply: BigInt(totalSupplyStr),
              totalSupplyFormatted: initialSupplyNum.toLocaleString('en-US'),
              creator: t.creator || account,
              userBalance: userBal,
              userBalanceFormatted: userBalNum.toLocaleString('en-US', { maximumFractionDigits: 4 }),
              creatorSharePct: creatorSharePct.toFixed(2),
              numeraire: t.numeraire || addresses.weth,
              pool: t.v3Pool,
              migrationPool: t.v2Pair || zeroAddress,
              priceInZkLTC,
              priceInUsd,
              marketCapZkLTC,
              marketCapUsd,
              bondingCurveProgress: t.isGraduated ? 100 : progress,
              tokensSold: Math.round(initialSupplyNum * (progress / 100)),
              tokensRemaining: Math.round(initialSupplyNum * (1 - progress / 100)),
              isGraduated: t.isGraduated,
              claimableTokenFee: 0n,
              claimableTokenFeeFormatted: '0.00',
              blockNumber: BigInt(t.createdAtBlockNumber || '0'),
              tokenURI: tokenUriRes,
              logoURI: resolvedLogo,
              imageUrl: resolvedLogo,
              ...metadata,
            };

            allList.push(tokenObj);

            if (isCreatedByUser) {
              createdList.push(tokenObj);
            }

            if (userBal > 0n) {
              holdingsList.push(tokenObj);
            }
          } catch (tokenErr) {
            console.warn(`Error processing token ${assetAddr}:`, tokenErr);
          }
        })
      );

      createdList.sort((a, b) => Number(b.blockNumber || 0n) - Number(a.blockNumber || 0n));
      allList.sort((a, b) => Number(b.blockNumber || 0n) - Number(a.blockNumber || 0n));
      holdingsList.sort((a, b) => (b.userBalance > a.userBalance ? 1 : -1));

      setCreatedTokens(createdList);
      setAllNetworkTokens(allList);
      setMemeHoldings(holdingsList);
      setClaimableZkLtcFees(totalZkLtcClaimable);
    } catch (err) {
      console.error('useMemefolio error:', err);
      setError(err.message || 'Failed to load Memefolio data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [deployed, publicClient, account, addresses, zkLtcUsdPrice]);

  useEffect(() => {
    fetchMemefolioData();
  }, [fetchMemefolioData]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    fetchMemefolioData();
  }, [fetchMemefolioData]);

  // ── Claim Integrator Fees ───────────────────────────────────────────────────

  const claimEarnings = useCallback(async (tokenAddress = addresses?.weth, amount = claimableZkLtcFees) => {
    if (!walletClient || !account || !addresses?.airlock) {
      throw new Error('Wallet not connected');
    }
    if (!amount || amount === 0n) {
      throw new Error('No claimable fees available');
    }

    setIsClaiming(true);
    setError(null);
    setClaimSuccessTx(null);

    try {
      let maxFeePerGas;
      let maxPriorityFeePerGas;
      try {
        const block = await publicClient.getBlock({ blockTag: 'latest' });
        const baseFee = block?.baseFeePerGas ?? 5000000000n;
        maxFeePerGas = (baseFee * 180n) / 100n + 1000000000n;
        maxPriorityFeePerGas = 1000000000n;
      } catch {
        maxFeePerGas = 12000000000n;
        maxPriorityFeePerGas = 1500000000n;
      }

      const hash = await walletClient.writeContract({
        address: addresses.airlock,
        abi: AIRLOCK_ABI,
        functionName: 'collectIntegratorFees',
        args: [account, tokenAddress, amount],
        account,
        maxFeePerGas,
        maxPriorityFeePerGas,
      });

      setClaimSuccessTx(hash);
      setTimeout(() => refresh(), 3000);
      return hash;
    } catch (err) {
      console.error('Claim earnings error:', err);
      const msg = err.shortMessage || err.message || 'Failed to claim fees';
      setError(msg);
      throw new Error(msg);
    } finally {
      setIsClaiming(false);
    }
  }, [walletClient, account, addresses, claimableZkLtcFees, publicClient, refresh]);

  // ── Aggregate Metrics ───────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const isPersonal = !!(account && createdTokens.length > 0);
    const listForStats = isPersonal ? createdTokens : allNetworkTokens;
    const totalCreated = listForStats.length;
    const totalMarketCapZkLTC = listForStats.reduce((acc, t) => acc + (t.marketCapZkLTC || 0), 0);
    const totalMarketCapUsd = listForStats.reduce((acc, t) => acc + (t.marketCapUsd || 0), 0);
    const graduatedCount = listForStats.filter((t) => t.isGraduated).length;
    const graduationRate = totalCreated > 0 ? Math.round((graduatedCount / totalCreated) * 100) : 0;
    const totalClaimableZkLtc = Number(formatUnits(claimableZkLtcFees, 18));
    const totalClaimableUsd = totalClaimableZkLtc * zkLtcUsdPrice;

    return {
      isPersonal,
      totalCreated,
      totalMarketCapZkLTC,
      totalMarketCapUsd,
      graduatedCount,
      graduationRate,
      totalClaimableZkLtc,
      totalClaimableUsd,
      claimableZkLtcFees,
      zkLtcUsdPrice,
    };
  }, [account, createdTokens, allNetworkTokens, claimableZkLtcFees, zkLtcUsdPrice]);

  return {
    loading,
    refreshing,
    error,
    account,
    isConnected,
    deployed,
    createdTokens,
    allNetworkTokens,
    memeHoldings,
    stats,
    isClaiming,
    claimSuccessTx,
    claimEarnings,
    refresh,
  };
}

export default useMemefolio;
