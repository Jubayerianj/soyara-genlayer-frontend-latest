import { createPublicClient, http, parseUnits, formatUnits, zeroAddress, decodeAbiParameters } from 'viem';
import { LitVM } from '../lib/wagmi';
import { DEX_CONFIG } from '../constants/dex';
import { fetchV2Pair, getV2Quote } from '../utils/v2';
import { getBestV3Quote } from '../utils/v3';
import { CurrencyAmount } from '@uniswap/sdk-core';

const RPC_URL = process.env.NEXT_PUBLIC_LitVM_RPC_URL || 'https://liteforge.rpc.caldera.xyz/infra-partner-http';

export const publicClient = createPublicClient({
  chain: LitVM,
  transport: http(RPC_URL),
});

/**
 * Server-side version of useBestRoute
 */
export async function getBestRouteServer(chainId, tokenIn, tokenOut, amountIn) {
  if (!chainId || !tokenIn || !tokenOut || !amountIn || parseFloat(amountIn) <= 0) {
    return null;
  }

  try {
    const amountInWei = parseUnits(amountIn, tokenIn.decimals);

    const tokenInAddr = tokenIn.isNative
      ? DEX_CONFIG[chainId].weth
      : tokenIn.address;
    const tokenOutAddr = tokenOut.isNative
      ? DEX_CONFIG[chainId].weth
      : tokenOut.address;

    const tokenInSdk = {
      ...tokenIn,
      address: tokenInAddr,
      isNative: false,
      decimals: tokenIn.decimals,
    };
    const tokenOutSdk = {
      ...tokenOut,
      address: tokenOutAddr,
      isNative: false,
      decimals: tokenOut.decimals,
    };

    const candidates = [];

    // ====================== V2 DEXes ======================
    const v2Config = DEX_CONFIG[chainId]?.OurV2;
    if (v2Config?.factory) {
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
          candidates.push({
            dexName: 'OurV2',
            poolType: 'v2',
            poolAddress: pairAddress,
            amountOut: quote,
            tokenIn: tokenInSdk,
            tokenOut: tokenOutSdk,
            fee: v2Config.fee,
          });
        }
      }
    }

    // ====================== UniswapV3 ======================
    const uniswapV3Config = DEX_CONFIG[chainId]?.['UniswapV3'];
    if (uniswapV3Config?.factory) {
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
        candidates.push({
          dexName: 'UniswapV3',
          poolType: 'v3',
          poolAddress: pool.address,
          amountOut,
          tokenIn: tokenInSdk,
          tokenOut: tokenOutSdk,
          fee: fee,
        });
      }
    }

    if (!candidates.length) return null;

    const best = candidates.reduce((a, b) =>
      a.amountOut.greaterThan(b.amountOut) ? a : b
    );

    return best;
  } catch (err) {
    console.error('getBestRouteServer error:', err);
    return null;
  }
}
