const { ethers } = require('ethers');

const RPC_URL = 'https://liteforge.rpc.caldera.xyz/infra-partner-http';
const ADDRESS = '0xF69E64804000d28aA695eB5c594B996100fb3B49';

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const latestBlock = await provider.getBlockNumber();
  
  console.log(`Searching deployment block for ${ADDRESS} on LitVM LiteForge (latest block: ${latestBlock})...`);
  
  let low = 0;
  let high = latestBlock;
  let deploymentBlock = -1;
  
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    try {
      const code = await provider.getCode(ADDRESS, mid);
      if (code !== '0x') {
        deploymentBlock = mid;
        high = mid - 1; // Try to find an earlier block
      } else {
        low = mid + 1; // Contract wasn't deployed yet
      }
    } catch (e) {
      // In case the block is too old or RPC fails
      high = mid - 1;
    }
  }
  
  console.log(`\n🎉 Found contract deployment block: ${deploymentBlock}`);
}

main();
