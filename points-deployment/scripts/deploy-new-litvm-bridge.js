// scripts/deploy-new-litvm-bridge.js
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const RPC_URL = "https://liteforge.rpc.caldera.xyz/infra-partner-http";
const NFT_PROXY = "0xFAF7266C09450F22098cA304bcAC70Dfdc75992C";
const NEW_IMPLEMENTATION = "0xcA6dE6EcAc3F6b0813f78aA561d55D3a04C819C9"; // Fixed v2 implementation on LitVM
const TRUSTED_SIGNER = "0x5729311FbD8aD44C9E5aac2A42e460c826F54fa5";
const BRIDGE_FEE = ethers.parseEther("0.001"); // 0.001 zkLTC/LTC

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function withRetry(fn, label, maxAttempts = 15, delayMs = 6000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try { return await fn(); } catch (e) {
      console.log(`   ⚠️  ${label} attempt ${attempt}/${maxAttempts}: ${e.shortMessage || e.message}`);
      if (attempt === maxAttempts) throw e;
      await sleep(delayMs);
    }
  }
}

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) throw new Error("PRIVATE_KEY not found in .env");

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`, provider);

  console.log("🚀 Deploying New LitVM Bridge Proxy");
  console.log("Deployer    :", wallet.address);
  console.log("NFT Proxy   :", NFT_PROXY);
  console.log("Impl Logic  :", NEW_IMPLEMENTATION);
  console.log("Signer      :", TRUSTED_SIGNER);

  const balance = await withRetry(() => provider.getBalance(wallet.address), "getBalance");
  console.log("Balance     :", ethers.formatEther(balance), "zkLTC\n");

  // 1. Load artifacts
  const implArtifact = require("../artifacts/contracts/super-contributor/LitSuperContributorBridge.sol/LitSuperContributorBridge.json");
  const proxyArtifact = require("../artifacts/contracts/super-contributor/LitSuperContributorProxy.sol/LitSuperContributorProxy.json");

  // 2. Encode initialization parameters
  console.log("1️⃣ Encoding initialization data...");
  const bridgeInterface = new ethers.Interface(implArtifact.abi);
  const initData = bridgeInterface.encodeFunctionData("initialize", [
    NFT_PROXY,
    false, // isHomeChain = false (LitVM)
    TRUSTED_SIGNER
  ]);
  console.log("   Encoded init data length:", initData.length, "bytes");

  // 3. Deploy proxy
  console.log("\n2️⃣ Deploying LitSuperContributorProxy...");
  const nonce = await withRetry(() => provider.getTransactionCount(wallet.address, "pending"), "getPendingNonce");
  const precomputedProxyAddress = ethers.getCreateAddress({ from: wallet.address, nonce });
  console.log(`   Pre-computed Proxy address: ${precomputedProxyAddress}  (nonce: ${nonce})`);

  const feeData = await withRetry(() => provider.getFeeData(), "getFeeData");
  const gasPrice = feeData.gasPrice ? (feeData.gasPrice * 15n) / 10n : ethers.parseUnits("0.025", "gwei");

  const proxyFactory = new ethers.ContractFactory(proxyArtifact.abi, proxyArtifact.bytecode, wallet);
  
  let txHash = null;
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      console.log(`   📤 Broadcasting proxy deploy (attempt ${attempt}/10)...`);
      const deployTx = await proxyFactory.deploy(NEW_IMPLEMENTATION, initData, { nonce, gasPrice });
      txHash = deployTx.deploymentTransaction()?.hash;
      console.log(`   ✅ Broadcast accepted! Tx: ${txHash}`);
      break;
    } catch (e) {
      if (e.message?.includes("504") || e.message?.includes("Gateway Timeout")) {
        console.log(`   ⚠️  504 - retrying in 10s...`);
        await sleep(10000);
        continue;
      }
      throw e;
    }
  }

  if (!txHash) throw new Error("Failed to deploy proxy");

  console.log("   Waiting for confirmation...");
  let receipt = null;
  while (!receipt) {
    try { receipt = await provider.getTransactionReceipt(txHash); } catch (_) {}
    if (!receipt) await sleep(5000);
  }
  console.log(`✅ Proxy deployed to: ${precomputedProxyAddress} (block ${receipt.blockNumber})`);

  // 4. Verify new proxy state
  console.log("\n3️⃣ Verifying state & owner on new proxy...");
  const newBridge = new ethers.Contract(precomputedProxyAddress, implArtifact.abi, wallet);
  const onChainOwner = await withRetry(() => newBridge.owner(), "owner");
  const onChainNft = await withRetry(() => newBridge.nft(), "nft");
  const onChainIsHome = await withRetry(() => newBridge.isHomeChain(), "isHomeChain");
  
  console.log("   Owner       :", onChainOwner);
  console.log("   NFT Contract:", onChainNft);
  console.log("   isHomeChain :", onChainIsHome);

  if (onChainOwner.toLowerCase() !== wallet.address.toLowerCase()) {
    throw new Error("❌ Error: Owner is not set correctly on the proxy.");
  }
  console.log("✅ Owner verified successfully! (OpenZeppelin ERC7201 slot works on new proxy)");

  // 5. Set bridge fee
  console.log("\n4️⃣ Setting bridge fee on new proxy...");
  const setFeeTx = await newBridge.setBridgeFee(BRIDGE_FEE, { gasPrice });
  console.log("   Tx hash:", setFeeTx.hash);
  await setFeeTx.wait();
  console.log(`✅ Bridge fee set to ${ethers.formatEther(BRIDGE_FEE)} zkLTC`);

  // 6. Link NFT proxy to new bridge
  console.log("\n5️⃣ Linking NFT proxy to the new bridge...");
  const nftContract = new ethers.Contract(NFT_PROXY, [
    "function setBridgeAddress(address newBridge) external",
    "function bridgeAddress() external view returns (address)"
  ], wallet);

  const setBridgeTx = await nftContract.setBridgeAddress(precomputedProxyAddress, { gasPrice });
  console.log("   Tx hash:", setBridgeTx.hash);
  await setBridgeTx.wait();
  console.log("✅ NFT proxy linked successfully!");

  const updatedNftBridge = await nftContract.bridgeAddress();
  console.log("   NFT's bridgeAddress is now:", updatedNftBridge);

  console.log("\n🎉 ALL DONE!");
  console.log("New Bridge Proxy Address:", precomputedProxyAddress);
}

main().catch(console.error);
