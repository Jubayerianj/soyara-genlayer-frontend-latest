const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("🚀 AGGFlow Upgradeable Points Wrapper Deployment");
  console.log("Deployer:", deployer.address);

  // Address configurations (LitVM chain ID: 4441)
  const AGGFlowEntrypointAddress = "0xF69E64804000d28aA695eB5c594B996100fb3B49"; // From constants/addresses.js
  
  // Bridged Athes Super Contributor NFT on LitVM
  // Set this to the actual LitVM NFT contract address once deployed/bridged
  const nftAddress = "0xFAF7266C09450F22098cA304bcAC70Dfdc75992C"; 

  console.log("1️⃣ Deploying FlipSwapPointsToken (FSWP)...");
  const FlipSwapPointsToken = await hre.ethers.getContractFactory("FlipSwapPointsToken");
  
  // Deploy the token contract with the deployer as the initial owner (so we can configure it)
  const token = await FlipSwapPointsToken.deploy(deployer.address);
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log(`✅ FlipSwapPointsToken deployed to: ${tokenAddress}`);

  console.log("2️⃣ Deploying AGGFlowPointsWrapper (Implementation)...");
  const AGGFlowPointsWrapper = await hre.ethers.getContractFactory("AGGFlowPointsWrapper");
  const implementation = await AGGFlowPointsWrapper.deploy();
  await implementation.waitForDeployment();
  const implementationAddress = await implementation.getAddress();
  console.log(`✅ AGGFlowPointsWrapper Implementation deployed to: ${implementationAddress}`);

  console.log("3️⃣ Deploying AGGFlowPointsWrapperProxy (ERC1967 Proxy)...");
  // Encode initializer data
  const initData = implementation.interface.encodeFunctionData("initialize", [
    deployer.address,             // Owner
    AGGFlowEntrypointAddress,     // Entrypoint
    nftAddress,                   // NFT Address
    tokenAddress,                 // Reward Token (FSWP)
    true                          // isRewardTokenMintable (true, since we want the wrapper to mint)
  ]);

  const AGGFlowPointsWrapperProxy = await hre.ethers.getContractFactory("AGGFlowPointsWrapperProxy");
  const proxy = await AGGFlowPointsWrapperProxy.deploy(implementationAddress, initData);
  await proxy.waitForDeployment();
  const proxyAddress = await proxy.getAddress();
  console.log(`✅ AGGFlowPointsWrapperProxy deployed to: ${proxyAddress}`);

  console.log("4️⃣ Transferring FlipSwapPointsToken ownership to AGGFlowPointsWrapperProxy...");
  // Transfer token ownership to the proxy address so it has minting permissions
  const transferTx = await token.transferOwnership(proxyAddress);
  await transferTx.wait();
  console.log("✅ Ownership transferred! AGGFlowPointsWrapperProxy can now mint FSWP on claim.");

  console.log("\n📋 DEPLOYMENT SUMMARY:");
  const summary = {
    network: hre.network.name,
    implementation: implementationAddress,
    proxy: proxyAddress,
    nft: nftAddress,
    token: tokenAddress
  };
  console.log(JSON.stringify(summary, null, 2));

  // Write deployment data to JSON file
  const filePath = path.join(__dirname, "../src/points/deployed-wrapper.json");
  fs.writeFileSync(filePath, JSON.stringify({
    ...summary,
    timestamp: new Date().toISOString()
  }, null, 2));
  console.log(`\n📄 Deployment saved to ${filePath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
