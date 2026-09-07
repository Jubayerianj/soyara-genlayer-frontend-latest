const { ethers } = require('ethers');

const RPC_URL = 'https://liteforge.rpc.caldera.xyz/infra-partner-http';
const V2_FACTORY = '0x4680BCe1632824d30D2F53656dD610736c3e312e';
const V3_FACTORY = '0xde6763a041f8fc94ca2ee5933736f78f6d1a11c5';

const TOKEN_A = '0x0B779FF5855bc4E6937EbFa64aBE7AB8207f09c3';

const BASE_TOKENS = {
  'wzkLTC': '0x315374AA9b5536037Cc1Efeea2439CCC0913A77e',
  'ZKUSDC': '0xdf69970B2fE416339187aA41D39882e864984CE9',
  'ZKUSDT': '0xa338b743Ec494ebB8345f4B6F27ffC902b7EF5Aa'
};

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  
  for (const [name, address] of Object.entries(BASE_TOKENS)) {
    console.log(`\n---------------------------------------`);
    console.log(`Checking pairs/pools for ${TOKEN_A} against ${name} (${address})...`);

    // 1. Query V2 Factory
    try {
      const v2FactoryContract = new ethers.Contract(
        V2_FACTORY,
        ['function getPair(address tokenA, address tokenB) view returns (address)'],
        provider
      );
      const v2Pair = await v2FactoryContract.getPair(TOKEN_A, address);
      if (v2Pair !== ethers.ZeroAddress) {
        console.log(`V2 Pair Address: ${v2Pair}`);
      } else {
        console.log(`V2 Pair Address: None`);
      }
    } catch (err) {
      console.error('Error querying V2 Pair:', err.message);
    }

    // 2. Query V3 Factory (for common fee tiers)
    const feeTiers = [100, 500, 3000, 10000];
    try {
      const v3FactoryContract = new ethers.Contract(
        V3_FACTORY,
        ['function getPool(address tokenA, address tokenB, uint24 fee) view returns (address)'],
        provider
      );
      for (const fee of feeTiers) {
        const v3Pool = await v3FactoryContract.getPool(TOKEN_A, address, fee);
        if (v3Pool !== ethers.ZeroAddress) {
          console.log(`V3 Pool Address (fee tier ${fee}): ${v3Pool}`);
        }
      }
    } catch (err) {
      console.error('Error querying V3 Pool:', err.message);
    }
  }
}

main();
