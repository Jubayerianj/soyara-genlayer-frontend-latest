// scripts/debugPair.js


import { createPublicClient, http, parseAbi } from 'viem';
import { sepolia } from 'viem/chains';

async function debugPair() {
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(),
  });

  const pairAddress = '0x99f0b102173c502687e63bf7F2394299896532F9';
  console.log('Debugging pair:', pairAddress);

  // Pair ABI
  const PAIR_ABI = parseAbi([
    'function token0() view returns (address)',
    'function token1() view returns (address)',
    'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
    'function totalSupply() view returns (uint256)',
  ]);

  // ERC20 ABI variants
  const ERC20_SYMBOL_STRING = parseAbi([
    'function symbol() view returns (string)',
  ]);
  const ERC20_SYMBOL_BYTES32 = parseAbi([
    'function symbol() view returns (bytes32)',
  ]);
  const ERC20_SYMBOL_UPPER_STRING = parseAbi([
    'function SYMBOL() view returns (string)',
  ]);
  const ERC20_SYMBOL_UPPER_BYTES32 = parseAbi([
    'function SYMBOL() view returns (bytes32)',
  ]);

  const SYMBOL_READERS = [
    { abi: ERC20_SYMBOL_STRING, fn: 'symbol', type: 'string' },
    { abi: ERC20_SYMBOL_BYTES32, fn: 'symbol', type: 'bytes32' },
    { abi: ERC20_SYMBOL_UPPER_STRING, fn: 'SYMBOL', type: 'string' },
    { abi: ERC20_SYMBOL_UPPER_BYTES32, fn: 'SYMBOL', type: 'bytes32' },
  ];

  try {
    // Get token addresses
    const [token0Address, token1Address] = await Promise.all([
      publicClient.readContract({
        address: pairAddress,
        abi: PAIR_ABI,
        functionName: 'token0',
      }),
      publicClient.readContract({
        address: pairAddress,
        abi: PAIR_ABI,
        functionName: 'token1',
      }),
    ]);

    console.log('\n=== Token Addresses ===');
    console.log('Token0:', token0Address);
    console.log('Token1:', token1Address);

    // Get token symbols
    console.log('\n=== Token Symbols ===');
    for (const [index, tokenAddress] of [token0Address, token1Address].entries()) {
      console.log(`\nToken${index} (${tokenAddress}):`);
      let found = false;

      for (const reader of SYMBOL_READERS) {
        try {
          const symbol = await publicClient.readContract({
            address: tokenAddress,
            abi: reader.abi,
            functionName: reader.fn,
          });

          if (reader.type === 'bytes32') {
            const hex = symbol.slice(2);
            let decoded = '';
            for (let i = 0; i < hex.length; i += 2) {
              const byte = parseInt(hex.substr(i, 2), 16);
              if (byte === 0) break;
              decoded += String.fromCharCode(byte);
            }
            console.log(`  ${reader.fn} (bytes32):`, decoded);
          } else {
            console.log(`  ${reader.fn}:`, symbol);
          }

          found = true;
          break;
        } catch (e) {
          // Try next variant
        }
      }

      if (!found) {
        console.log('  Could not read symbol');
      }
    }

    // Get reserves and total supply
    const reserves = await publicClient.readContract({
      address: pairAddress,
      abi: PAIR_ABI,
      functionName: 'getReserves',
    });

    const totalSupply = await publicClient.readContract({
      address: pairAddress,
      abi: PAIR_ABI,
      functionName: 'totalSupply',
    });

    console.log('\n=== Pair Info ===');
    console.log('Reserves:', reserves);
    console.log('Total Supply:', totalSupply.toString());

  } catch (error) {
    console.error('Error:', error);
  }
}

debugPair();
