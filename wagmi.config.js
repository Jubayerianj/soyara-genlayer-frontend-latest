// wagmi.config.js

import { createConfig, http } from 'wagmi'
import { QueryClient } from '@tanstack/react-query'
import { defineChain } from 'viem'

// GenLayer Testnet definition (ONLY supported network)
export const GenLayer = defineChain({
  id: 4221,
  name: 'GenLayer Testnet',
  network: 'genlayer-testnet',
  nativeCurrency: {
    name: 'GEN',
    symbol: 'GEN',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.testnet-chain.genlayer.com'],
    },
    public: {
      http: ['https://rpc.testnet-chain.genlayer.com'],
    },
  },
  blockExplorers: {
    default: {
      name: 'GenLayer Explorer',
      url: 'https://explorer.genlayer.com',
    },
  },
  contracts: {
    multicall3: {
      address: '0x6d1503E294b122Eb6B37ECe9c74d24D83f8B478b',
    },
  },
  testnet: true,
})

// Aliases for compatibility
export const LitVM = GenLayer;
export const sepolia = GenLayer;

// Create a query client
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24,
      staleTime: 1000 * 60,
      retry: 1,
    },
  },
})

// wagmi config - GenLayer exclusively
export const config = createConfig({
  chains: [GenLayer],
  transports: {
    [GenLayer.id]: http(),
  },
})