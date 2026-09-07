// constants/doppler/abis/Airlock.js
// ABI for src/Airlock.sol – the central escrow and registry of the Doppler protocol

const AIRLOCK_ABI = [
  // ── Events ──────────────────────────────────────────────────────────────────
  {
    type: 'event',
    name: 'Create',
    inputs: [
      { name: 'asset',       type: 'address', indexed: false },
      { name: 'numeraire',   type: 'address', indexed: true  },
      { name: 'initializer', type: 'address', indexed: false },
      { name: 'poolOrHook',  type: 'address', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Migrate',
    inputs: [
      { name: 'asset', type: 'address', indexed: true  },
      { name: 'pool',  type: 'address', indexed: true  },
    ],
  },
  {
    type: 'event',
    name: 'SetModuleState',
    inputs: [
      { name: 'module', type: 'address', indexed: true  },
      { name: 'state',  type: 'uint8',   indexed: true  },
    ],
  },
  {
    type: 'event',
    name: 'Collect',
    inputs: [
      { name: 'to',     type: 'address', indexed: true  },
      { name: 'token',  type: 'address', indexed: true  },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  // ── View Functions ──────────────────────────────────────────────────────────
  {
    type: 'function',
    name: 'owner',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'getAssetData',
    stateMutability: 'view',
    inputs: [{ name: 'asset', type: 'address' }],
    outputs: [
      {
        type: 'tuple',
        name: 'data',
        components: [
          { name: 'numeraire',         type: 'address' },
          { name: 'timelock',          type: 'address' },
          { name: 'governance',        type: 'address' },
          { name: 'liquidityMigrator', type: 'address' },
          { name: 'poolInitializer',   type: 'address' },
          { name: 'pool',              type: 'address' },
          { name: 'migrationPool',     type: 'address' },
          { name: 'numTokensToSell',   type: 'uint256' },
          { name: 'totalSupply',       type: 'uint256' },
          { name: 'integrator',        type: 'address' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'getModuleState',
    stateMutability: 'view',
    inputs: [{ name: 'module', type: 'address' }],
    outputs: [{ type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'getProtocolFees',
    stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getIntegratorFees',
    stateMutability: 'view',
    inputs: [
      { name: 'integrator', type: 'address' },
      { name: 'token',      type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  // ── Write Functions ─────────────────────────────────────────────────────────
  {
    type: 'function',
    name: 'create',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'createData',
        type: 'tuple',
        components: [
          { name: 'initialSupply',         type: 'uint256' },
          { name: 'numTokensToSell',       type: 'uint256' },
          { name: 'numeraire',             type: 'address' },
          { name: 'tokenFactory',          type: 'address' },
          { name: 'tokenFactoryData',      type: 'bytes'   },
          { name: 'governanceFactory',     type: 'address' },
          { name: 'governanceFactoryData', type: 'bytes'   },
          { name: 'poolInitializer',       type: 'address' },
          { name: 'poolInitializerData',   type: 'bytes'   },
          { name: 'liquidityMigrator',     type: 'address' },
          { name: 'liquidityMigratorData', type: 'bytes'   },
          { name: 'integrator',            type: 'address' },
          { name: 'salt',                  type: 'bytes32' },
        ],
      },
    ],
    outputs: [
      { name: 'asset',         type: 'address' },
      { name: 'pool',          type: 'address' },
      { name: 'governance',    type: 'address' },
      { name: 'timelock',      type: 'address' },
      { name: 'migrationPool', type: 'address' },
    ],
  },
  {
    type: 'function',
    name: 'migrate',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'asset', type: 'address' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setModuleState',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'modules', type: 'address[]' },
      { name: 'states',  type: 'uint8[]'   },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'collectIntegratorFees',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to',     type: 'address' },
      { name: 'token',  type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'collectProtocolFees',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to',     type: 'address' },
      { name: 'token',  type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
];

export default AIRLOCK_ABI;
