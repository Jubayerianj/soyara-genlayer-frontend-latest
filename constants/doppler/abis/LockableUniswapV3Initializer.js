// constants/doppler/abis/LockableUniswapV3Initializer.js
// ABI for src/initializers/LockableUniswapV3Initializer.sol
// Used on LitVM because V4 PoolManager is not deployed - this provides V3-based price discovery.

const LOCKABLE_UNISWAP_V3_INITIALIZER_ABI = [
  // ── Events ──────────────────────────────────────────────────────────────────
  {
    type: 'event',
    name: 'Initialize',
    inputs: [
      { name: 'asset',    type: 'address', indexed: true  },
      { name: 'numeraire',type: 'address', indexed: true  },
      { name: 'pool',     type: 'address', indexed: false },
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
    name: 'getLiquidity',
    stateMutability: 'view',
    inputs: [{ name: 'asset', type: 'address' }],
    outputs: [{ name: 'liquidity', type: 'uint128' }],
  },
  {
    type: 'function',
    name: 'getPool',
    stateMutability: 'view',
    inputs: [{ name: 'asset', type: 'address' }],
    outputs: [{ name: 'pool', type: 'address' }],
  },
  // ── Write ────────────────────────────────────────────────────────────────────
  {
    type: 'function',
    name: 'initialize',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'asset',    type: 'address' },
      { name: 'numeraire',type: 'address' },
      { name: 'data',     type: 'bytes'   },
    ],
    outputs: [{ name: 'pool', type: 'address' }],
  },
  {
    type: 'function',
    name: 'migrate',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'recipient', type: 'address' },
      { name: 'asset',     type: 'address' },
      { name: 'numeraire', type: 'address' },
      { name: 'data',      type: 'bytes'   },
    ],
    outputs: [{ name: 'liquidity', type: 'uint128' }],
  },
];

export default LOCKABLE_UNISWAP_V3_INITIALIZER_ABI;
