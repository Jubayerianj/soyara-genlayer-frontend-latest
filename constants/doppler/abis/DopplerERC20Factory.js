// constants/doppler/abis/DopplerERC20Factory.js
// ABI for src/tokens/DopplerERC20V1Factory.sol

const DOPPLER_ERC20_FACTORY_ABI = [
  // ── Events ──────────────────────────────────────────────────────────────────
  {
    type: 'event',
    name: 'Create',
    inputs: [
      { name: 'token',  type: 'address', indexed: true  },
      { name: 'name',   type: 'string',  indexed: false },
      { name: 'symbol', type: 'string',  indexed: false },
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
    name: 'implementation',
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
      { name: 'initialSupply', type: 'uint256' },
      { name: 'recipient',     type: 'address' },
      { name: 'data',          type: 'bytes'   },
    ],
    outputs: [{ name: 'token', type: 'address' }],
  },
];

export default DOPPLER_ERC20_FACTORY_ABI;
