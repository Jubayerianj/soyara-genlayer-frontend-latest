// constants/doppler/abis/NoOpMigrator.js
// ABI for src/migrators/NoOpMigrator.sol
// The no-op migrator keeps liquidity in place after the bonding curve ends (no migration to V2/V3).

const NO_OP_MIGRATOR_ABI = [
  // ── View ────────────────────────────────────────────────────────────────────
  {
    type: 'function',
    name: 'airlock',
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

export default NO_OP_MIGRATOR_ABI;
