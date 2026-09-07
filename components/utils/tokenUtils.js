// components/utils/tokenUtils.js

import { createPublicClient, http, parseAbi } from 'viem';
import { TOKEN_LIST } from '../../constants/tokens';

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
  },
  blockExplorers: {
    default: {
      name: 'ETH Explorer',
      url: 'https://liteforge.explorer.caldera.xyz/',
    },
  },
  testnet: true,
};

// ERC20 ABI minimal
export const ERC20_ABI = parseAbi([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
  'function totalSupply() view returns (uint256)'
]);

// Create public client for LitVM
const publicClient = createPublicClient({
  chain: LitVM,
  transport: http('https://liteforge.rpc.caldera.xyz/infra-partner-http')
});

// Validate address format
export const validateTokenAddress = (address) => {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
};

// Fetch token info from contract
export const getTokenInfo = async (address) => {
  try {
    // Check if already in predefined list
    const existingToken = TOKEN_LIST.LitVM?.find(
      token => token.address.toLowerCase() === address.toLowerCase()
    ) || TOKEN_LIST[4441]?.find(
      token => token.address.toLowerCase() === address.toLowerCase()
    );
    
    if (existingToken) {
      return { ...existingToken, isCustom: false };
    }

    // Fetch token info individually (no multicall)
    const [name, symbol, decimals, totalSupply] = await Promise.all([
      publicClient.readContract({
        address,
        abi: ERC20_ABI,
        functionName: 'name'
      }).catch(() => 'Unknown'),
      
      publicClient.readContract({
        address,
        abi: ERC20_ABI,
        functionName: 'symbol'
      }).catch(() => 'Unknown'),
      
      publicClient.readContract({
        address,
        abi: ERC20_ABI,
        functionName: 'decimals'
      }).catch(() => 18),
      
      publicClient.readContract({
        address,
        abi: ERC20_ABI,
        functionName: 'totalSupply'
      }).catch(() => 0n)
    ]);

    // Validate token exists (has non-zero total supply)
    if (totalSupply === 0n) {
      throw new Error('Token has zero total supply');
    }

    // Get logo from sources
    const logoURI = await getTokenLogo(symbol, address);

    return {
      address: address.toLowerCase(),
      name: name || 'Unknown Token',
      symbol: symbol || 'UNKNOWN',
      decimals: Number(decimals) || 18,
      logoURI,
      isCustom: true
    };
  } catch (error) {
    console.error('Error fetching token info:', error);
    throw new Error('Failed to fetch token information');
  }
};

// Get token logo from various sources
const getTokenLogo = async (symbol, address) => {
  const sources = [
    // Try LitVM explorer
    `https://liteforge.explorer.caldera.xyz/token/${address}`,
    // Try TrustWallet assets
    `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/${address}/logo.png`,
    // Try 1inch token list
    `https://tokens.1inch.io/${address}.png`,
    // Try CoinGecko
    `https://api.coingecko.com/api/v3/coins/ethereum/contract/${address}`,
  ];

  for (const source of sources) {
    try {
      const response = await fetch(source, { method: 'HEAD' });
      if (response.ok) {
        return source;
      }
    } catch (error) {
      continue;
    }
  }

  // Fallback to generated logo based on symbol
  return `https://ui-avatars.com/api/?name=${symbol}&background=random&color=fff&size=128`;
};

// Check if token is verified (in known lists)
export const isTokenVerified = (address) => {
  return TOKEN_LIST.LitVM?.some(
    token => token.address.toLowerCase() === address.toLowerCase()
  ) || TOKEN_LIST[4441]?.some(
    token => token.address.toLowerCase() === address.toLowerCase()
  );
};

// Get all tokens for a user (predefined + custom)
export const getAllTokens = (customTokens = []) => {
  const predefined = (TOKEN_LIST.LitVM || TOKEN_LIST[4441] || []).map(token => ({
    ...token,
    isCustom: false,
    isVerified: true
  }));
  
  const custom = customTokens.map(token => ({
    ...token,
    isCustom: true,
    isVerified: false
  }));
  
  return [...predefined, ...custom];
};