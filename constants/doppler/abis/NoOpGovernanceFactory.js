// constants/doppler/abis/NoOpGovernanceFactory.js
// ABI for src/governance/NoOpGovernanceFactory.sol
// Creates a "no-op" governance setup - no on-chain governance, just placeholder addresses.

const NO_OP_GOVERNANCE_FACTORY_ABI = [
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
    name: 'create',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'data',  type: 'bytes'   },
    ],
    outputs: [
      { name: 'governanceToken', type: 'address' },
      { name: 'timelock',        type: 'address' },
    ],
  },
];

export default NO_OP_GOVERNANCE_FACTORY_ABI;
