const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const NETWORK = process.argv[2];
if (!NETWORK || (NETWORK !== "litvm" && NETWORK !== "arbitrum")) {
  console.error("Usage: node scripts/upgrade-bridge-direct.js [litvm|arbitrum]");
  process.exit(1);
}

const CONFIGS = {
  litvm: {
    rpc: "https://liteforge.rpc.caldera.xyz/http",
    chainId: 4441
  },
  arbitrum: {
    rpc: "https://arb1.arbitrum.io/rpc",
    chainId: 42161
  }
};

const RPC_URL = CONFIGS[NETWORK].rpc;

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
  const wallet   = new ethers.Wallet(privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`, provider);

  const bridgeDeployedPath = path.join(__dirname, "../contracts/super-contributor/bridge-deployed.json");
  const deployedData = JSON.parse(fs.readFileSync(bridgeDeployedPath, "utf8"));
  
  const networkConfig = deployedData[NETWORK];
  if (!networkConfig || !networkConfig.bridge) {
    throw new Error(`No bridge proxy found in bridge-deployed.json for network ${NETWORK}`);
  }
  
  const bridgeProxyAddress = networkConfig.bridge;

  console.log(`🔧 LitSuperContributorBridge - UPGRADING on ${NETWORK.toUpperCase()}`);
  console.log("Deployer    :", wallet.address);
  console.log("Proxy       :", bridgeProxyAddress);

  const balance = await withRetry(() => provider.getBalance(wallet.address), "getBalance");
  console.log("Balance:", ethers.formatEther(balance), NETWORK === "litvm" ? "zkLTC" : "ETH");

  const bridgeArtifact = require("../artifacts/contracts/super-contributor/LitSuperContributorBridge.sol/LitSuperContributorBridge.json");

  // ── Step 1: Deploy new implementation ──────────────────────────────────────
  console.log("\n1️⃣  Deploying new implementation...");
  const nonce = await withRetry(
    () => provider.getTransactionCount(wallet.address, "pending"),
    "getPendingNonce"
  );

  const newImplAddress = ethers.getCreateAddress({ from: wallet.address, nonce });
  console.log(`   Pre-computed address : ${newImplAddress}  (nonce: ${nonce})`);

  // If already deployed, skip
  const existingCode = await withRetry(() => provider.getCode(newImplAddress), "getCode");
  if (existingCode && existingCode !== "0x") {
    console.log(`   ✅ Already has code - skipping broadcast.`);
  } else {
    const feeData  = await withRetry(() => provider.getFeeData(), "getFeeData");
    const gasPrice = feeData.gasPrice ? (feeData.gasPrice * 15n) / 10n : ethers.parseUnits("2", "gwei");
    console.log(`   gasPrice: ${ethers.formatUnits(gasPrice, "gwei")} gwei`);

    const factory = new ethers.ContractFactory(bridgeArtifact.abi, bridgeArtifact.bytecode, wallet);
    
    let txHash = null;
    for (let attempt = 1; attempt <= 10; attempt++) {
      try {
        console.log(`   📤 Broadcasting (attempt ${attempt}/10)...`);
        const deployTx = await factory.deploy({ nonce, gasPrice });
        txHash = deployTx.deploymentTransaction()?.hash;
        console.log(`   ✅ Broadcast accepted! Tx: ${txHash}`);
        break;
      } catch (e) {
        if (e.message?.includes("504") || e.message?.includes("Gateway Timeout")) {
          console.log(`   ⚠️  504 Gateway Timeout - retrying in 10s...`);
          await sleep(10000);
          continue;
        }
        throw e;
      }
    }

    if (!txHash) throw new Error("Failed to broadcast implementation.");

    console.log(`   Waiting for receipt...`);
    let receipt = null;
    while (!receipt) {
      try { receipt = await provider.getTransactionReceipt(txHash); } catch (_) {}
      if (!receipt) await sleep(6000);
    }
    console.log(`✅ Implementation deployed to: ${newImplAddress}`);
  }

  // ── Step 2: Upgrade proxy via UUPS upgradeTo ──────────────────────────────────
  console.log("\n2️⃣  Upgrading proxy via UUPS upgradeTo...");
  const upgradeAbi = [
    ...bridgeArtifact.abi,
    "function upgradeTo(address newImplementation) external"
  ];
  const proxy = new ethers.Contract(bridgeProxyAddress, upgradeAbi, wallet);
  
  // Verify owner
  const owner = await withRetry(() => proxy.owner(), "owner");
  if (wallet.address.toLowerCase() !== owner.toLowerCase()) {
    throw new Error(`❌ Wallet ${wallet.address} is NOT the owner of the bridge proxy (${owner}).`);
  }

  // Send upgrade transaction
  const upgradeNonce = await withRetry(
    () => provider.getTransactionCount(wallet.address, "pending"),
    "getPendingNonce"
  );
  const feeData = await withRetry(() => provider.getFeeData(), "getFeeData");
  const gasPrice = feeData.gasPrice ? (feeData.gasPrice * 15n) / 10n : ethers.parseUnits("2", "gwei");
  
  console.log(`   📤 Upgrading (nonce: ${upgradeNonce})...`);
  const tx = await proxy.upgradeTo(newImplAddress, { nonce: upgradeNonce, gasPrice });
  console.log(`   Tx submitted: ${tx.hash}`);
  
  let receipt = null;
  while (!receipt) {
    try { receipt = await provider.getTransactionReceipt(tx.hash); } catch (_) {}
    if (!receipt) await sleep(6000);
  }
  console.log(`✅ Upgrade transaction confirmed in block ${receipt.blockNumber}`);

  // ── Step 3: Verify implementation slot ───────────────────────────────────────
  console.log("\n3️⃣  Verifying upgrade...");
  const IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
  const slotValue = await withRetry(() => provider.getStorage(bridgeProxyAddress, IMPL_SLOT), "getStorage");
  const onChainImpl = "0x" + slotValue.slice(26);
  const match = onChainImpl.toLowerCase() === newImplAddress.toLowerCase();
  console.log(`   On-chain impl: ${onChainImpl}`);
  console.log(`   Expected     : ${newImplAddress}`);
  console.log(match ? "✅ Upgrade verified!" : "❌ Mismatch - check manually.");

  // ── Step 4: Save new implementation address ─────────────────────────────────
  networkConfig.bridgeImplementation = newImplAddress;
  networkConfig.bridgeUpgradedAt = new Date().toISOString();
  fs.writeFileSync(bridgeDeployedPath, JSON.stringify(deployedData, null, 2));
  console.log(`\n📄 Saved to ${bridgeDeployedPath}`);
  console.log("\n🎉 Upgrade complete!");
}

main().catch(e => { console.error(e); process.exit(1); });
