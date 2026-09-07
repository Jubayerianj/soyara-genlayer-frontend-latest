// lib/wagmi/config.js


import { http, createConfig } from 'wagmi';
import { mainnet } from 'wagmi/chains';
import { injected, walletConnect, coinbaseWallet } from 'wagmi/connectors';

// Define LitVM Network
const LitVM = {
  id: 4441,
  name: 'Ethereum',
  network: 'LitVM-oro-testnet',
  nativeCurrency: {
    name: 'ETH',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://liteforge.rpc.caldera.xyz/infra-partner-http'],
    },
    public: {
      http: ['https://liteforge.rpc.caldera.xyz/infra-partner-http'],
    },
  },
  blockExplorers: {
    default: {
      name: 'ETH Explorer',
      url: 'https://liteforge.explorer.caldera.xyz/',
    },
  },
  testnet: true,
};

// LitVM RPC URLs with fallbacks
const LitVMRpcUrls = [
  'https://liteforge.rpc.caldera.xyz/infra-partner-http',
  'https://json-rpc.dos.sentry.testnet.v3.ETHvalidator.com',
  'https://json-rpc.tres.sentry.testnet.v3.ETHvalidator.com',
];

const mainnetRpcUrls = [
  'https://eth.llamarpc.com',
  'https://eth-mainnet.g.alchemy.com/v2/demo',
  'https://rpc.ankr.com/eth',
];

export const config = createConfig({
  chains: [LitVM, mainnet],
  connectors: [
    injected(),
    walletConnect({
      projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'YOUR_PROJECT_ID',
    }),
    coinbaseWallet({
      appName: 'LitVMSwap DEX',
    }),
  ],
  transports: {
    [LitVM.id]: http(LitVMRpcUrls[0], {
      retryCount: 3,
      retryDelay: 1000,
      timeout: 10000,
    }),
    [mainnet.id]: http(mainnetRpcUrls[0], {
      retryCount: 3,
      retryDelay: 1000,
      timeout: 10000,
    }),
  },
  ssr: true,
  // Removed batch config since we don't have multicall
});

// Optional: Add a function to handle RPC errors
export const handleRpcError = (error) => {
  console.error('RPC Error:', error);
  
  // You can implement retry logic or switch RPC here
  if (error.message.includes('timeout') || error.message.includes('failed')) {
    console.log('Switching to fallback RPC...');
    // Implement RPC switching logic if needed
  }
  
  return null;
};

// Export the LitVM definition for use elsewhere
export { LitVM };