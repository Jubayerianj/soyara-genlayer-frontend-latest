// constants/doppler/addresses.js
// Doppler Protocol contract addresses on LitVM (chainId: 4441)
// ─────────────────────────────────────────────────────────────
// Populate the empty strings after running the Foundry deploy script:
//   forge script script/deploy/DeployLitVM.s.sol:DeployLitVMScript \
//     --rpc-url litvm --broadcast --private-key $DEPLOYER_PRIVATE_KEY

export const DOPPLER_ADDRESSES = {
  4441: {
    // ── Core ────────────────────────────────────────────────────────────────
    airlock:                     '0x803CDD17e0be6652f407fe39e6779b93cfAb1c19',
    dopplerCreateXDeployer:      '0x03ba4f49a34d07d0772d5dec8110458c639a6d9f',
    createX:                     '0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed',

    // ── Token Factory ────────────────────────────────────────────────────────
    dopplerERC20V1Factory:        '0x2FACc7E98ec3181aef5381418840C2525777EbDd',
    dopplerERC20V1Implementation: '0x97550629019657b8D1A841547dd5604865E51Ec5',

    // ── Initializer (V3 – LitVM has no V4 PoolManager) ──────────────────────
    lockableUniswapV3Initializer: '0x026d005b37D8f7321C1642dC81F065457A1e3c16',

    // ── Migrators ────────────────────────────────────────────────────────────
    noOpMigrator:                 '0x290ce010c9b248B520C07cb5DF1242280B4845d9',
    uniswapV2MigratorSplit:       '0x5F133F8f1D4Ac24acAD7f04f913EA1c192B39760',
    uniswapV2Locker:              '0x75bce7ABf55a2c8F14127010F18628E9D4E9a68e',

    // ── Fee Management ───────────────────────────────────────────────────────
    streamableFeesLockerV2:       '0x204bf55f7BcDd8c6488FB4Da4ad68D4Af2cA7C74',
    topUpDistributor:             '0x9A3d3973Df7479383D7dcc84f3d04239777B2980',

    // ── Governance ────────────────────────────────────────────────────────────
    noOpGovernanceFactory:        '0xDC95a41583F95877586d94b68c783a0ce4Ce9b10',

    // ── DEX Infrastructure (already live on LitVM) ────────────────────────────
    uniswapV2Factory:    '0x4680BCe1632824d30D2F53656dD610736c3e312e',
    uniswapV2Router:     '0xF456737D17C2Bbb348fd4F7D1b000D62A46FB3b5',
    uniswapV3Factory:    '0xde6763a041f8fc94ca2ee5933736f78f6d1a11c5',
    uniswapV3Router:     '0x60F8A7642F0aeC06cE628224E743326B23Fe5208',
    uniswapV3NftManager: '0x1089f046B597f259BeFDC15Bf9C90E33616BA366',
    weth:                '0x315374AA9b5536037Cc1Efeea2439CCC0913A77e',
    subgraphUrl:         process.env.NEXT_PUBLIC_DOPPLER_SUBGRAPH_URL || 'https://api.goldsky.com/api/public/project_cmm4p25ts3q2201z13r92dofb/subgraphs/doppler-subgraph/1.0.0/gn',
  },
};

export const getLitVMDopplerAddresses = () => DOPPLER_ADDRESSES[4441];

export const getDopplerAddresses = (chainId) => DOPPLER_ADDRESSES[chainId] ?? null;

export const isDopplerDeployed = (chainId) => {
  const addrs = DOPPLER_ADDRESSES[chainId];
  return !!(addrs && addrs.airlock !== '');
};
