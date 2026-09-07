// utils/web3.js

import { ethers } from 'ethers';
import { CONTRACT_ADDRESSES } from '../../constants/addresses';

// LitVM Network configuration
const LitVM_CONFIG = {
  chainId: 4441,
  name: 'Ethereum',
  rpcUrl: 'https://liteforge.rpc.caldera.xyz/infra-partner-http',
  nativesymbol: 'ETH',
  explorerUrl: 'https://explorer.LitVM.network'
};

// Check if address is valid
export const isValidAddress = (address) => {
  try {
    return ethers.utils.isAddress(address);
  } catch {
    return false;
  }
};

// Format address for display
export const formatAddress = (address, start = 6, end = 4) => {
  if (!address || !isValidAddress(address)) return '';
  return `${address.substring(0, start)}...${address.substring(address.length - end)}`;
};

// Get provider based on network
export const getProvider = (network = 'LitVM') => {
  if (typeof window !== 'undefined' && window.ethereum) {
    return new ethers.providers.Web3Provider(window.ethereum);
  }
  
  // Fallback to public RPC
  const rpcUrls = {
    LitVM: LitVM_CONFIG.rpcUrl,
    mainnet: 'https://eth.llamarpc.com',
    sepolia: 'https://rpc.sepolia.org',
  };
  
  const rpcUrl = rpcUrls[network] || rpcUrls.LitVM;
  return new ethers.providers.JsonRpcProvider(rpcUrl);
};

// Get signer from provider
export const getSigner = () => {
  const provider = getProvider();
  if (provider && provider.getSigner) {
    return provider.getSigner();
  }
  return null;
};

// Calculate transaction deadline
export const getDeadline = (minutes = 20) => {
  return Math.floor(Date.now() / 1000) + (minutes * 60);
};

// Calculate minimum amount out with slippage
export const calculateMinAmountOut = (amountOut, slippagePercent = 0.5) => {
  if (!amountOut || amountOut.isZero()) return ethers.constants.Zero;
  
  const slippage = amountOut.mul(slippagePercent * 10).div(1000); // 0.5% = 5 basis points
  return amountOut.sub(slippage);
};

// Calculate price impact
export const calculatePriceImpact = (amountIn, reserveIn, reserveOut) => {
  if (reserveIn.isZero() || reserveOut.isZero()) return 100;
  
  const amountOut = amountIn.mul(reserveOut).div(reserveIn.add(amountIn));
  const priceImpact = amountOut.mul(10000).div(reserveOut).toNumber() / 100;
  
  return Math.max(0, 100 - priceImpact);
};

// Get contract instance
export const getContract = (address, abi, signerOrProvider = null) => {
  const provider = signerOrProvider || getProvider();
  return new ethers.Contract(address, abi, provider);
};

// Get DEX contracts
export const getDexContracts = (signerOrProvider = null) => {
  const provider = signerOrProvider || getProvider();
  
  // Get addresses for current chain
  const getContractAddresses = () => {
    // Try to get addresses by chain ID
    if (typeof window !== 'undefined' && window.ethereum) {
      const chainId = parseInt(window.ethereum.chainId, 16);
      return CONTRACT_ADDRESSES[chainId] || CONTRACT_ADDRESSES.LitVM || CONTRACT_ADDRESSES.sepolia;
    }
    return CONTRACT_ADDRESSES.LitVM || CONTRACT_ADDRESSES.sepolia;
  };
  
  const addresses = getContractAddresses();
  
  return {
    factory: getContract(addresses.factory, [
      "function getPair(address tokenA, address tokenB) external view returns (address pair)",
      "function allPairs(uint256) external view returns (address pair)",
      "function allPairsLength() external view returns (uint256)",
    ], provider),
    
    router: getContract(addresses.router, [
      "function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)",
      "function getAmountsIn(uint amountOut, address[] memory path) public view returns (uint[] memory amounts)",
      "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)",
      "function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
      "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
    ], provider),
  };
};

// Estimate gas for transaction
export const estimateGas = async (txData) => {
  try {
    const provider = getProvider();
    return await provider.estimateGas(txData);
  } catch (err) {
    console.error('Error estimating gas:', err);
    return ethers.constants.Zero;
  }
};

// Get transaction receipt
export const getTransactionReceipt = async (txHash) => {
  try {
    const provider = getProvider();
    return await provider.getTransactionReceipt(txHash);
  } catch (err) {
    console.error('Error getting transaction receipt:', err);
    return null;
  }
};

// Check if network is supported
export const isNetworkSupported = (chainId) => {
  const supportedNetworks = [4441, 1, 11155111]; // LitVM, Mainnet, Sepolia
  return supportedNetworks.includes(chainId);
};

// Get network name from chain ID
export const getNetworkName = (chainId) => {
  const networks = {
    1: 'Ethereum Mainnet',
    11155111: 'Sepolia Testnet',
    4441: 'LitVM Network',
  };
  return networks[chainId] || `Chain ${chainId}`;
};

// Wait for transaction confirmation
export const waitForTransaction = async (txHash, confirmations = 1) => {
  const provider = getProvider();
  return await provider.waitForTransaction(txHash, confirmations);
};

// Generate random salt for transactions
export const generateSalt = () => {
  return ethers.utils.hexlify(ethers.utils.randomBytes(32));
};

// Wagmi configuration for LitVM
import { createConfig, http } from 'wagmi';
import { injected, walletConnect } from 'wagmi/connectors';

// LitVM Network definition for Wagmi
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
  },
  blockExplorers: {
    default: {
      name: 'ETH Explorer',
      url: 'https://liteforge.explorer.caldera.xyz/',
    },
  },
  testnet: true,
};

export const config = createConfig({
  chains: [LitVM],
  transports: {
    [LitVM.id]: http(process.env.NEXT_PUBLIC_LitVM_RPC_URL || 'https://liteforge.rpc.caldera.xyz/infra-partner-http'),
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