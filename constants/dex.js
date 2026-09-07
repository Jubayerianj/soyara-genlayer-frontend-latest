// constants/dex.js - GENLAYER ONLY

export const SUPPORTED_CHAINS = {
  GENLAYER: 4221,
};

export const DEX_CONFIG = {
  [SUPPORTED_CHAINS.GENLAYER]: {
    weth: '0x315374AA9b5536037Cc1Efeea2439CCC0913A77e',

    OurV2: {
      factory: '0x4680BCe1632824d30D2F53656dD610736c3e312e',
      fee: 3000,
    },

    UniswapV3: {
      factory: '0xBd959038300aF0C8dd1873E497d6D0a565b4E246',
    },
  },
};