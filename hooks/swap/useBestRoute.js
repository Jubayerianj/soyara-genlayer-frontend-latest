import { useEffect, useState } from 'react';
import { usePublicClient } from 'wagmi';
import { parseUnits, getCreate2Address, keccak256, encodePacked } from 'viem';
import { CurrencyAmount } from '@uniswap/sdk-core';
import { DEX_CONFIG } from '../../constants/dex';
import { fetchV2Pair, getV2Quote } from '../../utils/v2';
import {
  getBestV3Quote,
  getV3Quote as getV3QuoteFromSdk,
} from '../../utils/v3';
import { fetchVelodromePoolFromFactory } from '../../utils/velodrome';
import { toUniswapToken } from '../../utils/currency';
import { fetchCurvePoolAndQuote } from '../../utils/curve';

const isDevelopment = process.env.NODE_ENV === 'development';

// Litvmswap v3 standard init code hash
const UNISWAP_V2_INIT_CODE_HASH = '0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f';

/**
 * Compute Litvmswap v3 pair address deterministically
 */
function computeV2PairAddress(factory, tokenA, tokenB, initCodeHash = UNISWAP_V2_INIT_CODE_HASH) {
  const [token0, token1] = tokenA.toLowerCase() < tokenB.toLowerCase()
    ? [tokenA, tokenB]
    : [tokenB, tokenA];
  const salt = keccak256(
    encodePacked(['address', 'address'], [token0, token1])
  );
  return getCreate2Address({
    from: factory,
    salt,
    bytecodeHash: initCodeHash,
  });
}

export function useBestRoute(chainId, tokenIn, tokenOut, amountIn) {
  const publicClient = usePublicClient();
  const [route, setRoute] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (
      !chainId ||
      !tokenIn ||
      !tokenOut ||
      !amountIn ||
      parseFloat(amountIn) <= 0 ||
      !publicClient
    ) {
      setRoute(null);
      setLoading(false);
      return;
    }

    // Set up debouncing (300ms throttle) to prevent RPC flooding while typing
    const timer = setTimeout(() => {
      const fetchBest = async () => {
        setLoading(true);
        setError(null);
        try {
          const amountInWei = parseUnits(amountIn, tokenIn.decimals);

          const tokenInAddr = (tokenIn.isNative || tokenIn.symbol === 'GEN')
            ? (DEX_CONFIG[chainId]?.weth || '0x315374AA9b5536037Cc1Efeea2439CCC0913A77e')
            : tokenIn.address;
          const tokenOutAddr = (tokenOut.isNative || tokenOut.symbol === 'GEN')
            ? (DEX_CONFIG[chainId]?.weth || '0x315374AA9b5536037Cc1Efeea2439CCC0913A77e')
            : tokenOut.address;

          // If wrapping/unwrapping (e.g. GEN <-> WGEN), no DEX pool exists or is needed
          if (!tokenInAddr || !tokenOutAddr || tokenInAddr.toLowerCase() === tokenOutAddr.toLowerCase()) {
            setRoute(null);
            setLoading(false);
            return;
          }

          const tokenInSdk = {
            ...tokenIn,
            address: tokenInAddr,
            isNative: false,
            decimals: tokenIn.decimals ?? (tokenIn.isNative ? 18 : undefined),
          };
          const tokenOutSdk = {
            ...tokenOut,
            address: tokenOutAddr,
            isNative: false,
            decimals: tokenOut.decimals ?? (tokenOut.isNative ? 18 : undefined),
          };

          // Define parallel resolvers for V2 and V3 DEX candidates
          const fetchV2Candidate = async () => {
            const v2Config = DEX_CONFIG[chainId]?.OurV2;
            if (!v2Config?.factory) return null;
            if (isDevelopment) console.log(`🔍 Fetching OurV2...`);
            
            try {
              const result = await fetchV2Pair(
                publicClient,
                v2Config.factory,
                tokenInSdk,
                tokenOutSdk,
                chainId
              );
              if (result) {
                const { pair, address: pairAddress } = result;
                const quote = getV2Quote(pair, tokenInSdk, amountInWei, chainId);
                if (quote) {
                  return {
                    dexName: 'OurV2',
                    poolType: 'v2',
                    poolAddress: pairAddress,
                    amountOut: quote,
                    tokenIn: tokenInSdk,
                    tokenOut: tokenOutSdk,
                    fee: v2Config.fee,
                  };
                }
              }
            } catch (err) {
              if (isDevelopment) console.warn('V2 fetch failed:', err);
            }
            return null;
          };

          const fetchV3Candidate = async () => {
            const uniswapV3Config = DEX_CONFIG[chainId]?.['UniswapV3'];
            if (!uniswapV3Config?.factory) return null;
            if (isDevelopment) console.log('🔍 Fetching UniswapV3...');
            
            try {
              const v3Quote = await getBestV3Quote(
                publicClient,
                uniswapV3Config.factory,
                tokenInSdk,
                tokenOutSdk,
                chainId,
                amountInWei
              );
              if (v3Quote) {
                const { amountOut: rawAmountOut, currencyOut, pool, fee } = v3Quote;
                const amountOut = CurrencyAmount.fromRawAmount(currencyOut, rawAmountOut.toString());
                return {
                  dexName: 'UniswapV3',
                  poolType: 'v3',
                  poolAddress: pool.address,
                  amountOut,
                  tokenIn: tokenInSdk,
                  tokenOut: tokenOutSdk,
                  fee: fee,
                };
              }
            } catch (err) {
              if (isDevelopment) console.warn('V3 fetch failed:', err);
            }
            return null;
          };

          // Execute V2 and V3 searches in parallel
          const results = await Promise.all([
            fetchV2Candidate(),
            fetchV3Candidate()
          ]);

          const candidates = results.filter(Boolean);

          // ====================== Determine Best ======================
          if (!candidates.length) {
            if (isDevelopment) {
              console.warn('❌ No valid quotes found for', tokenIn.symbol, tokenOut.symbol);
            }
            setRoute(null);
            setError('No liquidity or quote failed for this pair.');
          } else {
            const best =
              candidates.length === 1
                ? candidates[0]
                : candidates.reduce((a, b) =>
                    a.amountOut.greaterThan(b.amountOut) ? a : b
                  );
            if (isDevelopment) {
              console.log('🏆 Best route:', best.dexName, best.amountOut.toExact());
              console.log('   poolAddress:', best.poolAddress);
            }
            setRoute(best);
            setError(null);
          }
        } catch (err) {
          console.error('useBestRoute error:', err);
          setError('Failed to fetch quotes');
        } finally {
          setLoading(false);
        }
      };

      fetchBest();
    }, 300);

    return () => clearTimeout(timer);
  }, [chainId, tokenIn, tokenOut, amountIn, publicClient]);

  return { route, loading, error };
}