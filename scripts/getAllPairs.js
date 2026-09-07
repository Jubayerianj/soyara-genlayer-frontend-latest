// scripts/getAllPairs.js

import { createPublicClient, http } from 'viem';

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

// IMPORTANT: ESM requires explicit `.js`
import { FACTORY_ABI } from '../constants/abis.js';

const publicClient = createPublicClient({
  chain: LitVM,
  transport: http('https://liteforge.rpc.caldera.xyz/infra-partner-http')
});

// Your factory address on LitVM (update this with your actual factory address)
const factoryAddress = 'YOUR_FACTORY_ADDRESS_ON_LitVM'; // Replace with actual address

async function getAllPairs() {
  try {
    // 1. Read total number of pairs
    const allPairsLength = await publicClient.readContract({
      address: factoryAddress,
      abi: FACTORY_ABI,
      functionName: 'allPairsLength'
    });

    const totalPairs = Number(allPairsLength);
    console.log(`Total pairs in factory: ${totalPairs}`);

    // 2. Fetch all pairs in batches
    const batchSize = 100;
    const pairs = [];

    for (let i = 0; i < totalPairs; i += batchSize) {
      const end = Math.min(i + batchSize, totalPairs);

      const calls = [];
      for (let j = i; j < end; j++) {
        calls.push(
          publicClient.readContract({
            address: factoryAddress,
            abi: FACTORY_ABI,
            functionName: 'allPairs',
            args: [j]
          })
        );
      }

      const results = await Promise.allSettled(calls);

      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          pairs.push({
            index: i + index,
            address: result.value
          });
        } else {
          console.error(`Failed at index ${i + index}`, result.reason);
        }
      });

      console.log(`Fetched ${end}/${totalPairs} pairs`);
    }

    return pairs;
  } catch (error) {
    console.error('Error fetching pairs:', error);
    return [];
  }
}

// 3. Execute script
(async () => {
  const pairs = await getAllPairs();

  console.log('\nPairs found:', pairs.length);
  console.log('LitVM Network Factory:', factoryAddress);
  console.log('LitVM Explorer:', LitVM.blockExplorers.default.url);
  
  for (const pair of pairs) {
    console.log(`Pair ${pair.index}: ${pair.address}`);
    console.log(`  Explorer: ${LitVM.blockExplorers.default.url}/address/${pair.address}`);
  }
})();