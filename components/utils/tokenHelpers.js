
// components/utils/tokenHelpers.js

import { ERC20_ABI } from '../constants/abis';
import { readContract } from '@wagmi/core';
import { wagmiConfig } from '../config/wagmi';

// Fetch token details
export async function fetchTokenDetails(address) {
  try {
    const [symbol, name, decimals] = await Promise.all([
      readContract(wagmiConfig, {
        address,
        abi: ERC20_ABI,
        functionName: 'symbol',
      }),
      readContract(wagmiConfig, {
        address,
        abi: ERC20_ABI,
        functionName: 'name',
      }),
      readContract(wagmiConfig, {
        address,
        abi: ERC20_ABI,
        functionName: 'decimals',
      }),
    ]);

    return {
      address,
      symbol,
      name,
      decimals,
      isNative: false,
    };
  } catch (error) {
    console.error('Error fetching token details:', error);
    return null;
  }
}

// Validate token address
export function isValidTokenAddress(address) {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

// Get token icon URL
export function getTokenIcon(symbol) {
  const icons = {
    ETH: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
    WETH: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
    USDC: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png',
    DAI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x6B175474E89094C44Da98b954EedeAC495271d0F/logo.png',
    LINK: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x514910771AF9Ca656af840dff83E8264EcF986CA/logo.png',
    UNI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984/logo.png',
  };
  
  return icons[symbol] || '';
}