import { createPublicClient, http, parseUnits, formatUnits, zeroAddress, decodeAbiParameters } from 'viem';
import { DEX_CONFIG, SUPPORTED_CHAINS } from '../constants/dex';
import { fetchV2Pair, getV2Quote } from '../utils/v2';
import { getBestV3Quote } from '../utils/v3';
import { CurrencyAmount } from '@uniswap/sdk-core';

// THIS QUOTED THE WRONG CHAIN, AND THAT IS WHY NO SWAP WORKED.
//
// This client was built for LitVM (chain 4441) against
// liteforge.rpc.caldera.xyz, while every swap on this product executes on
// GenLayer Bradbury (chain 4221). So the quoter read pool reserves from one
// chain and the transaction settled on another. DEX_CONFIG does not even have
// a 4441 entry any more - the whole path was left over from before the move to
// GenLayer.
//
// The reserves it returned had nothing to do with the pools being traded, so
// amountOut was nonsense and minAmountOut with it. A measured example: the
// USDC/WGEN pool holds 3.529 WGEN against 3,103.87 USDC, so 1 USDC is worth
// about 0.001133 WGEN - and this quoter answered 42.67 WGEN, roughly 37,000x
// too high. AGGFlowEntrypoint then reverted every single swap with
// AGGFlowEntrypoint_InsufficientAmountAfterFees (0x499c1728), because the
// output could never reach a minimum built from a fabricated price.
//
// Quote the chain you are going to settle on.
const GENLAYER_RPC = process.env.NEXT_PUBLIC_GENLAYER_RPC_URL || 'https://rpc-bradbury.genlayer.com';

const _clients = new Map();

/** A read client for the chain the swap will actually execute on. */
export function clientForChain(chainId) {
  const id = Number(chainId) || SUPPORTED_CHAINS.GENLAYER;
  if (!_clients.has(id)) {
    _clients.set(id, createPublicClient({
      chain: {
        id,
        name: 'GenLayer Testnet',
        nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
        rpcUrls: { default: { http: [GENLAYER_RPC] }, public: { http: [GENLAYER_RPC] } },
      },
      transport: http(GENLAYER_RPC),
    }));
  }
  return _clients.get(id);
}

/** Default client, kept as an export because other modules import it. */
export const publicClient = clientForChain(SUPPORTED_CHAINS.GENLAYER);

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
    // Read the chain we are quoting FOR, not a module-level default.
    const client = clientForChain(chainId);

    // ====================== V2 DEXes ======================
    const v2Config = DEX_CONFIG[chainId]?.OurV2;
    if (v2Config?.factory) {
      const result = await fetchV2Pair(
        client,
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
        client,
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
