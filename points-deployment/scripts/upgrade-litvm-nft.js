// scripts/upgrade-litvm-nft.js
// Upgrades the LitVM NFT proxy to the new implementation that fixes:
//   1. Multiple authorized bridge addresses (authorizedBridges mapping)
//   2. mintFromBridge increments totalMinted
//   3. burnFromBridge decrements totalMinted
//
// UUPS upgrade: calls upgradeToAndCall(newImpl, "0x") on the proxy.
//
// Usage:
//   cd points-deployment
//   npx hardhat run scripts/upgrade-litvm-nft.js --network litvm

const hre     = require("hardhat");
const fs      = require("fs");
const path    = require("path");

const NFT_PROXY = "0xFAF7266C09450F22098cA304bcAC70Dfdc75992C";

const UUPS_ABI = [
  "function upgradeToAndCall(address newImplementation, bytes calldata data) external payable",
  "function owner() external view returns (address)",
  "function proxiableUUID() external view returns (bytes32)",
];

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("🚀 Upgrading LitVM NFT Implementation");
  console.log("Deployer:", deployer.address);
  console.log("Proxy   :", NFT_PROXY);

  // 1. Compile + deploy new implementation
  console.log("\n1️⃣  Deploying new LitSuperContributorNFT implementation...");
  const NFTFactory = await hre.ethers.getContractFactory("LitSuperContributorNFT");
  const newImpl    = await NFTFactory.deploy();
  await newImpl.waitForDeployment();
  const newImplAddress = await newImpl.getAddress();
  console.log("   ✅ New implementation:", newImplAddress);

  // 2. Call upgradeToAndCall on the proxy
  console.log("\n2️⃣  Upgrading proxy to new implementation...");
  const proxy = new hre.ethers.Contract(NFT_PROXY, UUPS_ABI, deployer);

  // Verify caller is owner
  const owner = await proxy.owner();
  if (deployer.address.toLowerCase() !== owner.toLowerCase()) {
    throw new Error(`❌ Deployer (${deployer.address}) is NOT the owner (${owner}).`);
  }

  const tx = await proxy.upgradeToAndCall(newImplAddress, "0x");
  console.log("   Tx hash:", tx.hash);
  await tx.wait();
  console.log("   ✅ Upgrade confirmed!");

  // 3. Persist new implementation address
  const bridgeDeployedPath = path.join(__dirname, "../contracts/super-contributor/bridge-deployed.json");
  const deployedData = JSON.parse(fs.readFileSync(bridgeDeployedPath, "utf8"));
  deployedData.litvm.nftImplementation     = newImplAddress;
  deployedData.litvm.nftUpgradedAt         = new Date().toISOString();
  fs.writeFileSync(bridgeDeployedPath, JSON.stringify(deployedData, null, 2));
  console.log("\n📄 bridge-deployed.json updated with new NFT implementation.");

  console.log("\n🎉 Upgrade complete!");
  console.log("   Next step: run  node scripts/authorize-staking-wrapper.js");
  console.log("   to authorize bridge + staking wrapper on the upgraded NFT contract.");
}

main().catch(e => { console.error(e); process.exit(1); });
