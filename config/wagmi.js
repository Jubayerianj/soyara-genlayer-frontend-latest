
// config/wagmi.js
import { createConfig, http } from 'wagmi';
import { mainnet } from 'wagmi/chains';
import { injected, walletConnect } from 'wagmi/connectors';

// LitVM Network definition
export const LitVM = {
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
      url: 'https://explorer.LitVM.network',
    },
  },
  testnet: true,
};

export const config = createConfig({
  chains: [LitVM, mainnet],
  transports: {
    [LitVM.id]: http(process.env.NEXT_PUBLIC_LitVM_RPC_URL || 'https://liteforge.rpc.caldera.xyz/infra-partner-http'),
    [mainnet.id]: http(process.env.NEXT_PUBLIC_MAINNET_RPC_URL || 'https://eth.llamarpc.com'),
  },
  connectors: [
    injected(),
    walletConnect({
      projectId: process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID,
    }),
  ],
});

export const WAGMI_CONFIG = {
  autoConnect: true,
  logger: {
    warn: console.warn,
  },
};