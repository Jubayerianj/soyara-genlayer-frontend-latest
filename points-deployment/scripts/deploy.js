const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("🚀 Starting AGGFlow Upgradeable Points Wrapper Deployment");
  console.log("Deployer Wallet:", deployer.address);
  
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Deployer ETH Balance:", hre.ethers.formatEther(balance));

  // LitVM Configuration
  const AGGFlowEntrypointAddress = "0xF69E64804000d28aA695eB5c594B996100fb3B49"; // Aggregator Entrypoint on LitVM
  const nftAddress = "0xFAF7266C09450F22098cA304bcAC70Dfdc75992C"; // Deployed LitVM NFT Proxy address

  console.log("\n1️⃣ Deploying FlipSwapPointsToken (FSWP)...");
  const FlipSwapPointsToken = await hre.ethers.getContractFactory("FlipSwapPointsToken");
  
  // Deploy the token with the deployer as initial owner
  const token = await FlipSwapPointsToken.deploy(deployer.address);
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log(`✅ FlipSwapPointsToken deployed to: ${tokenAddress}`);

  console.log("\n2️⃣ Deploying AGGFlowPointsWrapper (Implementation logic)...");
  const AGGFlowPointsWrapper = await hre.ethers.getContractFactory("AGGFlowPointsWrapper");
  const implementation = await AGGFlowPointsWrapper.deploy();
  await implementation.waitForDeployment();
  const implementationAddress = await implementation.getAddress();
  console.log(`✅ AGGFlowPointsWrapper Implementation deployed to: ${implementationAddress}`);

  console.log("\n3️⃣ Deploying AGGFlowPointsWrapperProxy (ERC1967 UUPS Proxy)...");
  // Encode initialize parameters
  const initData = implementation.interface.encodeFunctionData("initialize", [
    deployer.address,             // Owner
    AGGFlowEntrypointAddress,     // Aggregator Entrypoint
    nftAddress,                   // Super Contributor NFT Proxy
    tokenAddress,                 // FSWP Token Address
    true                          // isRewardTokenMintable
  ]);

  const AGGFlowPointsWrapperProxy = await hre.ethers.getContractFactory("AGGFlowPointsWrapperProxy");
  const proxy = await AGGFlowPointsWrapperProxy.deploy(implementationAddress, initData);
  await proxy.waitForDeployment();
  const proxyAddress = await proxy.getAddress();
  console.log(`✅ AGGFlowPointsWrapperProxy deployed to: ${proxyAddress}`);

  console.log("\n4️⃣ Transferring FlipSwapPointsToken ownership to Proxy...");
  // Transfer FSWP token ownership to the proxy contract address so it has minting permissions
  const transferTx = await token.transferOwnership(proxyAddress);
  await transferTx.wait();
  console.log("✅ Ownership transferred! AGGFlowPointsWrapperProxy is now the owner of FlipSwapPointsToken.");

  console.log("\n📋 DEPLOYMENT COMPLETE SUMMARY:");
  const summary = {
    network: hre.network.name,
    chainId: hre.network.config.chainId || 4441,
    implementation: implementationAddress,
    proxy: proxyAddress,
    nft: nftAddress,
    token: tokenAddress,
    deployer: deployer.address,
    timestamp: new Date().toISOString()
  };
  console.log(JSON.stringify(summary, null, 2));

  // Write deployment data to local json file
  const filePath = path.join(__dirname, "../deployed-points.json");
  fs.writeFileSync(filePath, JSON.stringify(summary, null, 2));
  console.log(`\n📄 Deployment metadata successfully saved to: ${filePath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
