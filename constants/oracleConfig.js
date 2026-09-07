// constants/oracleConfig.js
export const DIA_ORACLE_CONFIG = {
  // Mainnet DIA Oracle Address (verify from docs.LitVM.network)
  ADDRESS: '0xE7F65d4bAdcfABc4eA57B8F66bBa044363D89eec', // Updated to LitVM Testnet Oracle Address
  
  // Mainnet RPC endpoint for LitVM
  RPC_URL: 'https://liteforge.rpc.caldera.xyz/infra-partner-http', // Update with your RPC
  
  // Token to DIA Symbol mapping
  TOKEN_SYMBOL_MAP: {
    'ETH': 'ETH/USD',
    'WETH': 'ETH/USD',
    'LETH': 'ETH/USD',
    'USDC': 'USDC/USD',
    'ZKUSDC': 'USDC/USD',
    'USDC.E': 'USDC/USD',
    'USDT': 'USDT/USD',
    'ZKUSDT': 'USDT/USD',
    'BTC': 'BTC/USD',
    'WBTC': 'BTC/USD',
    'ZKBTC': 'BTC/USD',
    'LTC': 'LTC/USD',
    'zkLTC': 'LTC/USD',
    'wzkLTC': 'LTC/USD',
    'NIA': 'NIA/USD',
    'XAU': 'XAU/USD',
    'XAG': 'XAG/USD',
    'WTI': 'WTI/USD',
    'XBR': 'XBR/USD'
  },

  // Direct Adapter Addresses (AggregatorV3Interface)
  ADAPTERS: {
    'LTC': '0x45dDa5d881BD2C917976CCfde74fFd6f6412da29',
    'zkLTC': '0x45dDa5d881BD2C917976CCfde74fFd6f6412da29',
    'wzkLTC': '0x45dDa5d881BD2C917976CCfde74fFd6f6412da29',
    'USDC': '0x4f91a950ed73c8B6F28dFE460f9444ed8866894f',
    'ZKUSDC': '0x4f91a950ed73c8B6F28dFE460f9444ed8866894f',
    'USDC.E': '0x4f91a950ed73c8B6F28dFE460f9444ed8866894f',
    'USDT': '0xd7ff0A3DdE1FdC2137Ff4CaAde5396f009739645',
    'ZKUSDT': '0xd7ff0A3DdE1FdC2137Ff4CaAde5396f009739645',
    'ETH': '0xc760B46beF9eD3F9A3d2b825164324D6703F0185',
    'WETH': '0xc760B46beF9eD3F9A3d2b825164324D6703F0185',
    'LETH': '0xc760B46beF9eD3F9A3d2b825164324D6703F0185',
    'BTC': '0x7d0445782E383223c7B4B660bb96b87213e9b605',
    'WBTC': '0x7d0445782E383223c7B4B660bb96b87213e9b605',
    'ZKBTC': '0x7d0445782E383223c7B4B660bb96b87213e9b605',
    'XAU': '0x519A391D8999F0A18E1E9A5649FEA3D942A1bDdF',
    'XAG': '0xfb49F5C1eFF83Cc392357Cb979a9432C90eE0eb7',
    'WTI': '0x9cee709Fc9Da87d958a468859b8C02d591b7245A',
    'XBR': '0x41bb23dD937C5733BF8c0826b9d99d89790c0cAF'
  },
  
  // Update frequency in milliseconds (120 seconds as per DIA docs)
  UPDATE_INTERVAL: 120000,
  
  // Oracle response format
  PRICE_DECIMALS: 18 // Most DIA adapters use 18 decimals as per docs
};