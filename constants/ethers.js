// constants/ethers.js - GENLAYER ONLY

// GenLayer configuration
export const GENLAYER_CONFIG = {
  chainId: 4221,
  nativeSymbol: 'GEN',
  explorerUrl: 'https://explorer.genlayer.com',
  rpcUrl: 'https://rpc.testnet-chain.genlayer.com'
};

// Backward-compatibility alias
export const LitVM_CONFIG = GENLAYER_CONFIG;

export const ETHERS_CONSTANTS = {
  ZeroAddress: '0x0000000000000000000000000000000000000000',
  MaxUint256: '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
  MaxUint128: 340282366920938463463374607431768211455n,
  WeiPerEther: 1000000000000000000n,
  Zero: 0n,
  One: 1n,
  Two: 2n,
  Ten: 10n,
  Hundred: 100n,
  Thousand: 1000n,
  TenThousand: 10000n,
  MaxUint256BigInt: 115792089237316195423570985008687907853269984665640564039457584007913129639935n,
  MinInt256: -57896044618658097711785492504343953926634992332820282019728792003956564819968n,
  MaxInt256: 57896044618658097711785492504343953926634992332820282019728792003956564819967n
};

export const TRANSACTION_DEFAULTS = {
  maxFeePerGas: 15000000000n, // 15 gwei
  maxPriorityFeePerGas: 1500000000n, // 1.5 gwei
  gasLimit: 3000000n,
  chainId: GENLAYER_CONFIG.chainId,
  type: 2 // EIP-1559
};

export const UNISWAP_CONSTANTS = {
  MINIMUM_LIQUIDITY: 1000n,
  FEE_DENOMINATOR: 10000n,
  FEE_NUMERATOR: 3n, // 0.03% (3/10000)
  PROTOCOL_FEE_DENOMINATOR: 5n, // 20% of fees
  INITIAL_SUPPLY: 1000000000000000000000000n // 1M tokens for new pools
};

export const ROUTING_CONSTANTS = {
  MAX_SLIPPAGE: 5000n, // 50% in bps
  MIN_SLIPPAGE: 10n, // 0.1% in bps
  MAX_DEADLINE: 43200, // 30 days in minutes
  MIN_DEADLINE: 1, // 1 minute
  DEFAULT_SLIPPAGE: 50n, // 0.5% in bps
  DEFAULT_DEADLINE: 20 // 20 minutes
};

// Network-specific constants
export const NETWORK_CONSTANTS = {
  GENLAYER: {
    chainId: GENLAYER_CONFIG.chainId,
    name: 'GenLayer Testnet',
    nativeSymbol: 'GEN',
    wrappedSymbol: 'WGEN',
    explorer: GENLAYER_CONFIG.explorerUrl,
    rpc: GENLAYER_CONFIG.rpcUrl
  }
};

// Helper function to get network constants by chain ID
export const getNetworkConstants = (chainId) => {
  return NETWORK_CONSTANTS.GENLAYER;
};