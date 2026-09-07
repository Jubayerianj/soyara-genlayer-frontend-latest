// constants/doppler/abis/UniswapV2MigratorSplit.js
// ABI for src/migrators/UniswapV2MigratorSplit.sol
// Migrates graduated Doppler liquidity into a SoyaraDex V2 pool on LitVM, splitting fees between protocol and LP.

const UNISWAP_V2_MIGRATOR_SPLIT_ABI = [
  // ── Events ──────────────────────────────────────────────────────────────────
  {
    type: 'event',
    name: 'Migrate',
    inputs: [
      { name: 'asset',    type: 'address', indexed: true  },
      { name: 'numeraire',type: 'address', indexed: true  },
      { name: 'pair',     type: 'address', indexed: false },
    ],
  },
  // ── View ────────────────────────────────────────────────────────────────────
  {
    type: 'function',
    name: 'airlock',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'factory',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'locker',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'TOP_UP_DISTRIBUTOR',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  // ── Write ────────────────────────────────────────────────────────────────────
  {
    type: 'function',
    name: 'migrate',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'liquidity', type: 'uint128' },
      { name: 'asset',     type: 'address' },
      { name: 'numeraire', type: 'address' },
      { name: 'data',      type: 'bytes'   },
    ],
    outputs: [],
  },
];

export default UNISWAP_V2_MIGRATOR_SPLIT_ABI;
