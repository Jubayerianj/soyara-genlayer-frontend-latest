import { decodeAbiParameters, zeroAddress } from 'viem';
import { Pair } from '@uniswap/v2-sdk';
import { CurrencyAmount } from '@uniswap/sdk-core';
import { toUniswapToken } from './currency';

const FACTORY_ABI = [
  {
    inputs: [
      { name: 'tokenA', type: 'address' },
      { name: 'tokenB', type: 'address' },
    ],
    name: 'getPair',
    outputs: [{ name: 'pair', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
];

const PAIR_ABI = [
  {
    inputs: [],
    name: 'token0',
    outputs: [{ name: '', type: 'address' }],
    type: 'function',
  },
];

const ERC20_ABI = [
  {
    constant: true,
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
];

const GET_RESERVES_SELECTOR = '0x0902f1ac';
const isDevelopment = process.env.NODE_ENV === 'development';

// Global caches for performance
const pairAddressCache = {};
const decimalsCache = {};
const token0Cache = {};
const pairCodeCache = {};

/**
 * Fetch a Litvmswap v3 pair and return both the SDK Pair object and the contract address.
 * @returns { pair: Pair, address: string } | null
 */
export async function fetchV2Pair(publicClient, factoryAddress, tokenA, tokenB, chainId) {
  if (!factoryAddress) return null;

  try {
    // Determine deterministic sorting key for pair address cache
    const [token0AddrSorted, token1AddrSorted] =
      tokenA.address.toLowerCase() < tokenB.address.toLowerCase()
        ? [tokenA.address.toLowerCase(), tokenB.address.toLowerCase()]
        : [tokenB.address.toLowerCase(), tokenA.address.toLowerCase()];
    
    const pairCacheKey = `${factoryAddress.toLowerCase()}:${token0AddrSorted}:${token1AddrSorted}`;
    
    let pairAddress = pairAddressCache[pairCacheKey];
    if (!pairAddress) {
      pairAddress = await publicClient.readContract({
        address: factoryAddress,
        abi: FACTORY_ABI,
        functionName: 'getPair',
        args: [tokenA.address, tokenB.address],
      });
      if (pairAddress && pairAddress !== zeroAddress && pairAddress !== '0x') {
        pairAddressCache[pairCacheKey] = pairAddress;
      }
    }

    if (!pairAddress || pairAddress === zeroAddress || pairAddress === '0x') return null;

    // Check code cache
    let code = pairCodeCache[pairAddress];
    if (!code) {
      code = await publicClient.getCode({ address: pairAddress });
      if (code && code !== '0x') {
        pairCodeCache[pairAddress] = code;
      }
    }
    if (!code || code === '0x') return null;

    // Fetch reserves (dynamic, cannot be cached long-term, but we do it in a single RPC call)
    const rawReserves = await publicClient.call({
      to: pairAddress,
      data: GET_RESERVES_SELECTOR,
    });
    const decoded = decodeAbiParameters(
      [{ type: 'uint112' }, { type: 'uint112' }, { type: 'uint32' }],
      rawReserves.data ?? rawReserves
    );

    const reserve0Raw = decoded[0];
    const reserve1Raw = decoded[1];

    // Fetch token0 with cache
    let token0Address = token0Cache[pairAddress];
    if (!token0Address) {
      token0Address = await publicClient.readContract({
        address: pairAddress,
        abi: PAIR_ABI,
        functionName: 'token0',
      });
      token0Cache[pairAddress] = token0Address;
    }
    
    const token1Address =
      token0Address.toLowerCase() === tokenA.address.toLowerCase()
        ? tokenB.address
        : tokenA.address;

    // Fetch decimals with cache
    let token0Decimals = decimalsCache[token0Address.toLowerCase()];
    if (token0Decimals === undefined) {
      token0Decimals = await publicClient
        .readContract({ address: token0Address, abi: ERC20_ABI, functionName: 'decimals' })
        .catch(() => 18);
      decimalsCache[token0Address.toLowerCase()] = token0Decimals;
    }

    let token1Decimals = decimalsCache[token1Address.toLowerCase()];
    if (token1Decimals === undefined) {
      token1Decimals = await publicClient
        .readContract({ address: token1Address, abi: ERC20_ABI, functionName: 'decimals' })
        .catch(() => 18);
      decimalsCache[token1Address.toLowerCase()] = token1Decimals;
    }

    const token0 = toUniswapToken(
      { address: token0Address, decimals: token0Decimals, symbol: '', name: '' },
      chainId
    );
    const token1 = toUniswapToken(
      { address: token1Address, decimals: token1Decimals, symbol: '', name: '' },
      chainId
    );

    const pair = new Pair(
      CurrencyAmount.fromRawAmount(token0, reserve0Raw.toString()),
      CurrencyAmount.fromRawAmount(token1, reserve1Raw.toString())
    );

    if (isDevelopment) {
      console.log(
        `✅ V2 pair ${pairAddress} | reserves: ${reserve0Raw}/${reserve1Raw} | decimals: ${token0Decimals}/${token1Decimals}`
      );
    }

    return { pair, address: pairAddress };
  } catch (err) {
    if (isDevelopment) console.warn('fetchV2Pair failed:', err);
    return null;
  }
}

export function getV2Quote(pair, tokenIn, amountInWei, chainId) {
  try {
    const currencyIn = toUniswapToken(tokenIn, chainId);
    const amount = CurrencyAmount.fromRawAmount(currencyIn, amountInWei.toString());
    const [amountOut] = pair.getOutputAmount(amount);
    return amountOut;
  } catch (err) {
    if (isDevelopment) console.warn(`getV2Quote failed:`, err);
    return null;
  }
}