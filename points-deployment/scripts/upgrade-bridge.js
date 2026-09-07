// scripts/upgrade-bridge.js
const hre     = require("hardhat");
const fs      = require("fs");
const path    = require("path");

const UUPS_ABI = [
  "function upgradeToAndCall(address newImplementation, bytes calldata data) external payable",
  "function owner() external view returns (address)"
];

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const networkName = hre.network.name;
  
  console.log(`🚀 Upgrading Bridge Implementation on ${networkName.toUpperCase()}`);
  console.log("Deployer:", deployer.address);

  // Load deployment configs
  const bridgeDeployedPath = path.join(__dirname, "../contracts/super-contributor/bridge-deployed.json");
  const deployedData = JSON.parse(fs.readFileSync(bridgeDeployedPath, "utf8"));
  
  const networkConfig = deployedData[networkName];
  if (!networkConfig || !networkConfig.bridge) {
    throw new Error(`No bridge proxy found in bridge-deployed.json for network ${networkName}`);
  }
  
  const bridgeProxyAddress = networkConfig.bridge;
  console.log("Proxy   :", bridgeProxyAddress);

  // 1. Compile + deploy new bridge implementation
  console.log("\n1️⃣  Deploying new LitSuperContributorBridge implementation...");
  const BridgeFactory = await hre.ethers.getContractFactory("LitSuperContributorBridge");
  const newImpl = await BridgeFactory.deploy();
  await newImpl.waitForDeployment();
  const newImplAddress = await newImpl.getAddress();
  console.log("   ✅ New implementation:", newImplAddress);

  // 2. Call upgradeToAndCall on the proxy
  console.log("\n2️⃣  Upgrading proxy to new implementation...");
  const proxy = new hre.ethers.Contract(bridgeProxyAddress, UUPS_ABI, deployer);

  // Verify caller is owner
  const owner = await proxy.owner();
  if (deployer.address.toLowerCase() !== owner.toLowerCase()) {
    throw new Error(`❌ Deployer (${deployer.address}) is NOT the owner of the bridge proxy (${owner}).`);
  }

  const tx = await proxy.upgradeToAndCall(newImplAddress, "0x");
  console.log("   Tx hash:", tx.hash);
  await tx.wait();
  console.log("   ✅ Upgrade confirmed!");

  // 3. Persist new implementation address
  networkConfig.bridgeImplementation = newImplAddress;
  networkConfig.bridgeUpgradedAt = new Date().toISOString();
  fs.writeFileSync(bridgeDeployedPath, JSON.stringify(deployedData, null, 2));
  console.log("\n📄 bridge-deployed.json updated with new bridge implementation.");

  console.log("\n🎉 Upgrade complete!");
}

main().catch(e => { console.error(e); process.exit(1); });
