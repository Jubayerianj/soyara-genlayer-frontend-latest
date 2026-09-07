// utils/mirror-nft.js
import { arbitrum } from "wagmi/chains";

export const ARBITRUM_CHAIN = arbitrum;
export const ARBITRUM_CHAIN_ID = arbitrum.id;

export const ARBITRUM_RPC_URL = process.env.NEXT_PUBLIC_ARBITRUM_RPC_URL || "https://arb1.arbitrum.io/rpc";
export const ARBITRUM_EXPLORER_URL = process.env.NEXT_PUBLIC_ARBITRUM_EXPLORER_URL || "https://arbiscan.io";

export const LITVM_CHAIN_ID = 4441;
export const LITVM_RPC_URL = process.env.NEXT_PUBLIC_LITVM_RPC_URL || "https://liteforge.rpc.caldera.xyz/infra-partner-http";
export const LITVM_EXPLORER_URL = process.env.NEXT_PUBLIC_LITVM_EXPLORER_URL || "https://liteforge.explorer.caldera.xyz/";

export const LITVM_CHAIN = {
  id: LITVM_CHAIN_ID,
  name: "LitVM LiteForge",
  nativeCurrency: {
    decimals: 18,
    name: "zkLTC",
    symbol: "zkLTC",
  },
  rpcUrls: {
    public: { http: [LITVM_RPC_URL] },
    default: { http: [LITVM_RPC_URL] },
  },
  blockExplorers: {
    default: {
      name: "LitVM Explorer",
      url: LITVM_EXPLORER_URL,
    },
  },
  testnet: true,
};

export function shortAddress(value) {
  if (!value) return "Not connected";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function formatExplorerUrl(baseUrl, txHash) {
  return `${baseUrl.replace(/\/$/, "")}/tx/${txHash}`;
}
