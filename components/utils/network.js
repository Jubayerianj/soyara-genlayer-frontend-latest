
// /utils/network.js


// Network configuration helper for LitVM
import { LitVM } from '../wagmi.config';

export const ETH_CHAIN_CONFIG = {
  ...LitVM,
  // Additional LitVM specific info
  faucetUrl: 'https://faucet.LitVM.network', // Check if available
  docsUrl: 'https://docs.ETHglobal.io',
  websiteUrl: 'https://LitVM.network',
  twitterUrl: 'https://twitter.com/LitVM',
  discordUrl: 'https://discord.gg/LitVM', // Check if available
};

export const isLitVM = (chainId) => {
  return chainId === 4441;
};

export const getNetworkConfig = (chainId) => {
  if (isLitVM(chainId)) {
    return ETH_CHAIN_CONFIG;
  }
  
  // Return default config for other chains
  return {
    name: `Chain ${chainId}`,
    chainId,
    nativeCurrency: {
      name: 'ETH',
      symbol: 'ETH',
      decimals: 18,
    },
    blockExplorers: {
      default: {
        name: 'Unknown',
        url: '#',
      },
    },
  };
};

export const formatChainName = (chainId) => {
  switch (chainId) {
    case 4441:
      return 'LitVM Network';
    case 1:
      return 'Ethereum Mainnet';
    case 11155111:
      return 'Sepolia Testnet';
    default:
      return `Chain ${chainId}`;
  }
};

export const getExplorerBaseUrl = (chainId) => {
  if (isLitVM(chainId)) {
    return 'https://explorer.LitVM.network';
  }
  if (chainId === 11155111) {
    return 'https://sepolia.etherscan.io';
  }
  if (chainId === 1) {
    return 'https://etherscan.io';
  }
  return '';
};

export const getTransactionUrl = (chainId, txHash) => {
  const baseUrl = getExplorerBaseUrl(chainId);
  return `${baseUrl}/tx/${txHash}`;
};

export const getAddressUrl = (chainId, address) => {
  const baseUrl = getExplorerBaseUrl(chainId);
  return `${baseUrl}/address/${address}`;
};

export const getTokenUrl = (chainId, address) => {
  const baseUrl = getExplorerBaseUrl(chainId);
  return `${baseUrl}/token/${address}`;
};