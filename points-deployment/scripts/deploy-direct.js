const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const RPC_URL = "https://liteforge.rpc.caldera.xyz/infra-partner-http";

// ── Existing deployed addresses (from first successful deployment) ──
const EXISTING_PROXY = "0xF664B56933f3cF0d7d69982b5A8eC9101b80059D";
const EXISTING_TOKEN = "0x0Bd54a8fDB753Fb86Cf906f1Dc2AB7ECBD2FDD5C";
const NFT_ADDRESS    = "0xFAF7266C09450F22098cA304bcAC70Dfdc75992C";
const ENTRYPOINT     = "0xF69E64804000d28aA695eB5c594B996100fb3B49";

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

/**
 * Deploy a contract with aggressive retry on both broadcast AND receipt polling.
 * - Pre-computes deterministic address so the address is ALWAYS known.
 * - On 504 during broadcast, RETRIES the broadcast (with same nonce) because
 *   a 504 from the Caldera gateway means the tx was NOT forwarded to the node.
 * - On success, polls getCode at pre-computed address for final confirmation.
 */
async function deployImplementation(wallet, artifact, label) {
  const provider = wallet.provider;

  const nonce = await withRetry(
    () => provider.getTransactionCount(wallet.address, "pending"),
    "getPendingNonce"
  );

  const deployedAddress = ethers.getCreateAddress({ from: wallet.address, nonce });
  console.log(`   Pre-computed address : ${deployedAddress}  (nonce: ${nonce})`);

  // If already deployed (idempotent), skip
  const existingCode = await withRetry(() => provider.getCode(deployedAddress), "getCode");
  if (existingCode && existingCode !== "0x") {
    console.log(`   ✅ Already has code - skipping broadcast.`);
    return deployedAddress;
  }

  const feeData  = await withRetry(() => provider.getFeeData(), "getFeeData");
  const gasPrice = feeData.gasPrice ? (feeData.gasPrice * 15n) / 10n : ethers.parseUnits("2", "gwei");
  console.log(`   gasPrice: ${ethers.formatUnits(gasPrice, "gwei")} gwei`);

  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);

  // Broadcast with retry - use SAME nonce on every attempt
  let txHash = null;
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      console.log(`   📤 Broadcasting (attempt ${attempt}/10)...`);
      const deployTx = await factory.deploy({ nonce, gasPrice });
      txHash = deployTx.deploymentTransaction()?.hash;
      console.log(`   ✅ Broadcast accepted! Tx: ${txHash}`);
      break;
    } catch (e) {
      const is504    = e.message?.includes("504") || e.message?.includes("Gateway Timeout");
      const isNonceUsed = e.message?.includes("nonce too low") || e.message?.includes("already been used");

      if (isNonceUsed) {
        // Tx with this nonce was already mined - find deployed address and return
        console.log(`   ℹ️  Nonce ${nonce} already used - contract may already be deployed.`);
        const code = await withRetry(() => provider.getCode(deployedAddress), "getCode");
        if (code && code !== "0x") {
          console.log(`✅ ${label} already at: ${deployedAddress}`);
          return deployedAddress;
        }
        throw new Error(`Nonce used but no code at pre-computed address. Manual intervention needed.`);
      }

      if (is504) {
        console.log(`   ⚠️  504 Gateway Timeout - retrying broadcast in 10s...`);
        await sleep(10000);
        continue;
      }

      throw e; // non-recoverable error
    }
  }

  if (!txHash) {
    throw new Error(`Failed to broadcast ${label} after 10 attempts.`);
  }

  // Poll for receipt
  console.log(`   Waiting for receipt...`);
  let receipt = null;
  while (!receipt) {
    try { receipt = await provider.getTransactionReceipt(txHash); } catch (_) {}
    if (!receipt) await sleep(6000);
  }
  console.log(`✅ ${label} deployed to: ${deployedAddress}  (block ${receipt.blockNumber})`);
  return deployedAddress;
}

/**
 * Send a contract call tx with broadcast retry (same nonce on each attempt).
 */
async function sendTxWithRetry(wallet, contract, method, args, label) {
  const provider = wallet.provider;

  const nonce    = await withRetry(
    () => provider.getTransactionCount(wallet.address, "pending"),
    "getPendingNonce"
  );
  const feeData  = await withRetry(() => provider.getFeeData(), "getFeeData");
  const gasPrice = feeData.gasPrice ? (feeData.gasPrice * 15n) / 10n : ethers.parseUnits("2", "gwei");

  let txHash = null;
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      console.log(`   📤 Broadcasting ${label} (attempt ${attempt}/10)...`);
      const tx = await contract[method](...args, { nonce, gasPrice });
      txHash = tx.hash;
      console.log(`   ✅ Broadcast accepted! Tx: ${txHash}`);
      break;
    } catch (e) {
      const is504 = e.message?.includes("504") || e.message?.includes("Gateway Timeout");
      const isNonceUsed = e.message?.includes("nonce too low") || e.message?.includes("already been used");
      if (isNonceUsed) {
        console.log(`   ℹ️  Tx with nonce ${nonce} already mined - treating as success.`);
        return;
      }
      if (is504) {
        console.log(`   ⚠️  504 - retrying in 10s...`);
        await sleep(10000);
        continue;
      }
      throw e;
    }
  }

  if (!txHash) throw new Error(`Failed to broadcast ${label} after 10 attempts.`);

  let receipt = null;
  while (!receipt) {
    try { receipt = await provider.getTransactionReceipt(txHash); } catch (_) {}
    if (!receipt) await sleep(6000);
  }
  console.log(`✅ ${label} confirmed  (block ${receipt.blockNumber})`);
}

// ──────────────────────────────────────────────────────────────────────────────
async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) throw new Error("PRIVATE_KEY not found in .env");

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet   = new ethers.Wallet(privateKey, provider);

  console.log("🔧 AGGFlow Points Wrapper - UPGRADE to fixed implementation");
  console.log("Deployer    :", wallet.address);
  console.log("Proxy       :", EXISTING_PROXY);
  console.log("Token (FSWP):", EXISTING_TOKEN, "\n");

  const balance = await withRetry(() => provider.getBalance(wallet.address), "getBalance");
  console.log("Balance:", ethers.formatEther(balance), "zkLTC\n");

  const wrapperArtifact = require("../artifacts/contracts/AGGFlowPointsWrapper.sol/AGGFlowPointsWrapper.json");

  // ── Step 1: Deploy fixed implementation ──────────────────────────────────────
  console.log("1️⃣  Deploying FIXED AGGFlowPointsWrapper implementation...");
  const newImplAddress = await deployImplementation(wallet, wrapperArtifact, "AGGFlowPointsWrapper v2");

  // ── Step 2: Upgrade proxy ─────────────────────────────────────────────────────
  console.log("\n2️⃣  Upgrading proxy via UUPS upgradeToAndCall...");
  const proxy = new ethers.Contract(EXISTING_PROXY, wrapperArtifact.abi, wallet);
  await sendTxWithRetry(wallet, proxy, "upgradeToAndCall", [newImplAddress, "0x"], "upgradeToAndCall");

  // ── Step 3: Verify implementation slot ───────────────────────────────────────
  console.log("\n3️⃣  Verifying upgrade...");
  const IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
  const slotValue = await withRetry(() => provider.getStorage(EXISTING_PROXY, IMPL_SLOT), "getStorage");
  const onChainImpl = "0x" + slotValue.slice(26);
  const match = onChainImpl.toLowerCase() === newImplAddress.toLowerCase();
  console.log(`   On-chain impl: ${onChainImpl}`);
  console.log(`   Expected     : ${newImplAddress}`);
  console.log(match ? "✅ Upgrade verified!" : "❌ Mismatch - check manually.");

  // ── Step 4: Verify proxy state ────────────────────────────────────────────────
  console.log("\n4️⃣  Verifying proxy state...");
  const [ep, nft, rt, bp, mult, dr, owner] = await Promise.all([
    withRetry(() => proxy.entrypoint(),        "entrypoint"),
    withRetry(() => proxy.nftAddress(),        "nftAddress"),
    withRetry(() => proxy.rewardToken(),       "rewardToken"),
    withRetry(() => proxy.basePointsPerSwap(), "basePointsPerSwap"),
    withRetry(() => proxy.nftMultiplier(),     "nftMultiplier"),
    withRetry(() => proxy.dailyRewardRate(),   "dailyRewardRate"),
    withRetry(() => proxy.owner(),             "owner"),
  ]);
  console.log("   owner          :", owner);
  console.log("   entrypoint     :", ep);
  console.log("   nftAddress     :", nft);
  console.log("   rewardToken    :", rt);
  console.log("   basePoints/swap:", ethers.formatEther(bp), "Diamonds");
  console.log("   nftMultiplier  :", mult.toString() + "x");
  console.log("   dailyRewardRate:", ethers.formatEther(dr), "Diamonds/day");

  // ── Summary ───────────────────────────────────────────────────────────────────
  const summary = {
    network: "litvm", chainId: 4441,
    proxy: EXISTING_PROXY,
    implementation_old: "0xF6BFe92BF381a761570f3581D7f5F83920beB89E",
    implementation_new: newImplAddress,
    token: EXISTING_TOKEN,
    nft: NFT_ADDRESS,
    entrypoint: ENTRYPOINT,
    deployer: wallet.address,
    timestamp: new Date().toISOString()
  };
  console.log("\n📋 UPGRADE COMPLETE:");
  console.log(JSON.stringify(summary, null, 2));

  const outPath = path.join(__dirname, "../deployed-points.json");
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log(`\n📄 Saved to ${outPath}`);

  console.log("\n⚠️  ACTION REQUIRED - For bridged NFT staking to work:");
  console.log(`   NFT contract owner must call setBridgeAddress("${EXISTING_PROXY}")`);
  console.log(`   on NFT contract: ${NFT_ADDRESS}`);
}

main().catch(e => { console.error(e); process.exit(1); });
