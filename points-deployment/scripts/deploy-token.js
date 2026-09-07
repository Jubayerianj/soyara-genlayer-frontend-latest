const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const RPC_URL = "https://liteforge.rpc.caldera.xyz/infra-partner-http";

// Existing proxy - stays the same forever
const EXISTING_PROXY = "0xF664B56933f3cF0d7d69982b5A8eC9101b80059D";

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

async function deployContract(wallet, artifact, label, constructorArgs = []) {
  const provider = wallet.provider;
  const nonce = await withRetry(
    () => provider.getTransactionCount(wallet.address, "pending"), "getPendingNonce"
  );
  const deployedAddress = ethers.getCreateAddress({ from: wallet.address, nonce });
  console.log(`   Pre-computed address: ${deployedAddress}  (nonce: ${nonce})`);

  const existingCode = await withRetry(() => provider.getCode(deployedAddress), "getCode");
  if (existingCode && existingCode !== "0x") {
    console.log(`   ✅ Already deployed - skipping.`);
    return deployedAddress;
  }

  const feeData  = await withRetry(() => provider.getFeeData(), "getFeeData");
  const gasPrice = feeData.gasPrice ? (feeData.gasPrice * 15n) / 10n : ethers.parseUnits("2", "gwei");
  const factory  = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);

  let txHash = null;
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      console.log(`   📤 Broadcasting (attempt ${attempt}/10)...`);
      const deployTx = await factory.deploy(...constructorArgs, { nonce, gasPrice });
      txHash = deployTx.deploymentTransaction()?.hash;
      console.log(`   ✅ Broadcast accepted! Tx: ${txHash}`);
      break;
    } catch (e) {
      const is504 = e.message?.includes("504") || e.message?.includes("Gateway Timeout");
      const isDone = e.message?.includes("nonce too low") || e.message?.includes("already been used");
      if (isDone) {
        console.log(`   ℹ️  Nonce already used - checking pre-computed address for code...`);
        const code = await withRetry(() => provider.getCode(deployedAddress), "getCode");
        if (code && code !== "0x") { console.log(`✅ ${label} at: ${deployedAddress}`); return deployedAddress; }
        throw new Error(`Nonce used but no code at pre-computed address.`);
      }
      if (is504) { console.log(`   ⚠️  504 - retrying in 10s...`); await sleep(10000); continue; }
      throw e;
    }
  }
  if (!txHash) throw new Error(`Failed to broadcast ${label}.`);

  let receipt = null;
  while (!receipt) {
    try { receipt = await provider.getTransactionReceipt(txHash); } catch (_) {}
    if (!receipt) await sleep(6000);
  }
  console.log(`✅ ${label} deployed to: ${deployedAddress}  (block ${receipt.blockNumber})`);
  return deployedAddress;
}

async function sendTxWithRetry(wallet, contract, method, args, label) {
  const provider = wallet.provider;
  const nonce    = await withRetry(() => provider.getTransactionCount(wallet.address, "pending"), "getPendingNonce");
  const feeData  = await withRetry(() => provider.getFeeData(), "getFeeData");
  const gasPrice = feeData.gasPrice ? (feeData.gasPrice * 15n) / 10n : ethers.parseUnits("2", "gwei");

  let txHash = null;
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      console.log(`   📤 ${label} (attempt ${attempt}/10)...`);
      const tx = await contract[method](...args, { nonce, gasPrice });
      txHash = tx.hash;
      console.log(`   ✅ Broadcast accepted! Tx: ${txHash}`);
      break;
    } catch (e) {
      const is504 = e.message?.includes("504") || e.message?.includes("Gateway Timeout");
      const isDone = e.message?.includes("nonce too low") || e.message?.includes("already been used");
      if (isDone) { console.log(`   ℹ️  Already mined.`); return; }
      if (is504) { console.log(`   ⚠️  504 - retrying in 10s...`); await sleep(10000); continue; }
      throw e;
    }
  }
  if (!txHash) throw new Error(`Failed to broadcast ${label}.`);

  let receipt = null;
  while (!receipt) {
    try { receipt = await provider.getTransactionReceipt(txHash); } catch (_) {}
    if (!receipt) await sleep(6000);
  }
  console.log(`✅ ${label} confirmed  (block ${receipt.blockNumber})`);
}

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) throw new Error("PRIVATE_KEY not found in .env");

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet   = new ethers.Wallet(privateKey, provider);

  console.log("💎 Deploying LitPearlsToken (Lit Pearls / LitPearls)");
  console.log("Deployer:", wallet.address);
  const balance = await withRetry(() => provider.getBalance(wallet.address), "getBalance");
  console.log("Balance:", ethers.formatEther(balance), "zkLTC\n");

  // Load artifacts
  const tokenArtifact   = require("../artifacts/contracts/FlipSwapPointsToken.sol/LitPearlsToken.json");
  const wrapperArtifact = require("../artifacts/contracts/AGGFlowPointsWrapper.sol/AGGFlowPointsWrapper.json");

  // ── Step 1: Deploy new LitPearlsToken ────────────────────────────────────────
  console.log("1️⃣  Deploying LitPearlsToken...");
  // Initially owned by deployer - we transfer to proxy after
  const newTokenAddress = await deployContract(wallet, tokenArtifact, "LitPearlsToken", [wallet.address]);

  // ── Step 2: Transfer token ownership to Proxy ────────────────────────────────
  console.log("\n2️⃣  Transferring LitPearlsToken ownership to Proxy...");
  const tokenContract = new ethers.Contract(newTokenAddress, tokenArtifact.abi, wallet);
  await sendTxWithRetry(wallet, tokenContract, "transferOwnership", [EXISTING_PROXY], "transferOwnership");

  // ── Step 3: Update Proxy to use new token address ────────────────────────────
  console.log("\n3️⃣  Updating proxy rewardToken to new LitPearlsToken address...");
  const proxy = new ethers.Contract(EXISTING_PROXY, wrapperArtifact.abi, wallet);
  await sendTxWithRetry(wallet, proxy, "setRewardToken", [newTokenAddress, true], "setRewardToken");

  // ── Step 4: Verify ────────────────────────────────────────────────────────────
  console.log("\n4️⃣  Verifying...");
  const onChainToken = await withRetry(() => proxy.rewardToken(), "rewardToken");
  const tokenName    = await withRetry(() => tokenContract.name(), "name");
  const tokenSymbol  = await withRetry(() => tokenContract.symbol(), "symbol");
  const tokenOwner   = await withRetry(() => tokenContract.owner(), "owner");

  console.log(`   Token address   : ${onChainToken}`);
  console.log(`   Token name      : ${tokenName}`);
  console.log(`   Token symbol    : ${tokenSymbol}`);
  console.log(`   Token owner     : ${tokenOwner} (should be proxy)`);

  const ok = onChainToken.toLowerCase() === newTokenAddress.toLowerCase()
          && tokenOwner.toLowerCase()    === EXISTING_PROXY.toLowerCase();
  console.log(ok ? "\n✅ All verified!" : "\n❌ Mismatch - check manually.");

  // ── Summary ───────────────────────────────────────────────────────────────────
  const existing = JSON.parse(fs.readFileSync(path.join(__dirname, "../deployed-points.json"), "utf8"));
  const updated  = {
    ...existing,
    token: newTokenAddress,
    token_name: tokenName,
    token_symbol: tokenSymbol,
    old_token: existing.token,
    timestamp: new Date().toISOString()
  };
  const outPath = path.join(__dirname, "../deployed-points.json");
  fs.writeFileSync(outPath, JSON.stringify(updated, null, 2));

  console.log("\n📋 UPDATED SUMMARY:");
  console.log(JSON.stringify(updated, null, 2));
  console.log(`\n📄 Saved to ${outPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
