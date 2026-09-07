require("dotenv").config();
require("@nomicfoundation/hardhat-ethers");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
      evmVersion: "cancun"
    }
  },
  paths: {
    sources: "./contracts",
    // Exclude sub-directories with incompatible OZ v4 imports
    tests:    "./test",
    cache:    "./cache",
    artifacts: "./artifacts"
  },
  networks: {
    litvm: {
      url: "https://liteforge.rpc.caldera.xyz/http",
      chainId: 4441,
      accounts: [process.env.PRIVATE_KEY]
    },
    arbitrum: {
      url: process.env.ARBITRUM_RPC_URL || "https://arb1.arbitrum.io/rpc",
      chainId: 42161,
      accounts: [process.env.PRIVATE_KEY]
    }
  },
  etherscan: {
    apiKey: {
      arbitrumOne: process.env.ARBISCAN_API_KEY
    }
  }
};
