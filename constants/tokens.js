import { DIA_ORACLE_CONFIG } from './oracleConfig.js';

export const NATIVE_TOKEN_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

// Helper to check if token has DIA Oracle support
export const hasDiaOracleSupport = (symbol) => {
  return symbol in DIA_ORACLE_CONFIG.TOKEN_SYMBOL_MAP || symbol in DIA_ORACLE_CONFIG.ADAPTERS;
};

// GenLayer Native Token
export const GEN_NATIVE_TOKEN = {
  address: NATIVE_TOKEN_ADDRESS,
  symbol: 'GEN',
  name: 'GEN',
  decimals: 18,
  isNative: true,
  isCustom: false,
  isVerified: true,
  isPopular: true,
  logoURI: 'https://docs.genlayer.com/assets/genlayer.png',
  chainId: 4221,
  isBaseToken: true,
  hasOraclePrice: false,
  priceSource: 'DEX',
  globalSupply: 1000000000
};

// Backward-compatibility alias
export const ETH_NATIVE_TOKEN = GEN_NATIVE_TOKEN;

// Real tokens deployed on GenLayer Testnet (chainId: 4221)
export const TOKEN_LIST = {
  4221: [
    GEN_NATIVE_TOKEN,
    {
      address: '0x315374AA9b5536037Cc1Efeea2439CCC0913A77e', // Wrapped GEN (WGEN)
      symbol: 'WGEN',
      name: 'Wrapped GEN',
      decimals: 18,
      isNative: false,
      isCustom: false,
      isVerified: true,
      isPopular: true,
      logoURI: 'https://docs.genlayer.com/assets/genlayer.png',
      chainId: 4221,
      isBaseToken: true,
      hasOraclePrice: false,
      priceSource: 'DEX',
      globalSupply: 1000000000
    },
    {
      address: '0x58B6CD7891cd0A682226E25607b958a6479195A6',
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 18,
      isNative: false,
      isCustom: false,
      isVerified: true,
      isPopular: true,
      logoURI: 'https://assets.coingecko.com/coins/images/53776/standard/usdc.jpg?1737340150',
      chainId: 4221,
      hasOraclePrice: false,
      priceSource: 'DEX',
      globalSupply: 10000000
    },
    {
      address: '0x4B54235778c26Ee8ac27744A53d4c5BC4c9D46fc',
      symbol: 'USDT',
      name: 'Tether USD',
      decimals: 18,
      isNative: false,
      isCustom: false,
      isVerified: true,
      isPopular: true,
      logoURI: 'https://assets.coingecko.com/coins/images/53705/standard/usdt0.jpg?1737086183',
      chainId: 4221,
      hasOraclePrice: false,
      priceSource: 'DEX',
      globalSupply: 10000000
    },
    {
      address: '0x723534bc6C2B536fF5D0455111513A9431c44e25',
      symbol: 'WBTC',
      name: 'Wrapped Bitcoin',
      decimals: 18,
      isNative: false,
      isCustom: false,
      isVerified: true,
      isPopular: true,
      logoURI: 'https://assets.coingecko.com/coins/images/1/standard/bitcoin.png?1696501400',
      chainId: 4221,
      hasOraclePrice: false,
      priceSource: 'DEX',
      globalSupply: 1000
    },
    {
      address: '0x0F56b4E7f4e2cf346a94aB9263Ed3F3644db7c0C',
      symbol: 'ETH',
      name: 'Ethereum',
      decimals: 18,
      isNative: false,
      isCustom: false,
      isVerified: true,
      isPopular: true,
      logoURI: 'https://assets.coingecko.com/coins/images/279/standard/ethereum.png',
      chainId: 4221,
      hasOraclePrice: false,
      priceSource: 'DEX',
      globalSupply: 10000
    },
    {
      address: '0xA2eC9aAf2235C66491767e69eBBD885469697B3E',
      symbol: 'FSWP',
      name: 'Soyara Token',
      decimals: 18,
      isNative: false,
      isCustom: false,
      isVerified: true,
      isPopular: true,
      logoURI: '/logo.png',
      chainId: 4221,
      hasOraclePrice: false,
      priceSource: 'DEX',
      globalSupply: 5000000
    }
  ]
};

// Get tokens for specific chain (defaults to 4221)
export const getTokensForChain = (chainId) => {
  return TOKEN_LIST[4221] || [];
};

// Get tokens with DIA Oracle support
export const getTokensWithDiaSupport = (chainId) => {
  const tokens = getTokensForChain(chainId);
  return tokens.filter(token => token.hasOraclePrice);
};

// Get tokens with TradingView support
export const getTokensWithTradingView = (chainId) => {
  const tokens = getTokensForChain(chainId);
  return tokens.filter(token => token.tradingViewSymbol);
};

// Popular tokens for quick selection (GenLayer only)
export const POPULAR_TOKENS = {
  4221: [
    'GEN',
    'WGEN',
    'USDC',
    'USDT',
    'WBTC',
    'ETH',
    'FSWP'
  ]
};

// Helper function to find token by address
export const findTokenByAddress = (address, chainId) => {
  if (!address) {
    return null;
  }
  
  const tokens = getTokensForChain(4221);
  const normalizedAddress = address.toLowerCase();
  
  const foundToken = tokens.find(token => 
    token.address.toLowerCase() === normalizedAddress ||
    (token.isNative && normalizedAddress === NATIVE_TOKEN_ADDRESS.toLowerCase())
  );
  
  if (foundToken) {
    console.log(`✅ Found token by address ${address}: ${foundToken.symbol}`);
  }
  
  return foundToken;
};

// Helper function to get native token for chain
export const getNativeToken = (chainId) => {
  return GEN_NATIVE_TOKEN;
};

// Validate if token is a real token
export const isRealToken = (token) => {
  if (!token) return false;
  return true;
};