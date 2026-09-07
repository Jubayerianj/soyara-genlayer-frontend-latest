// scripts/verify-signer.js
// Verifies that the LITVM_CLAIM_SIGNER_PRIVATE_KEY in your .env
// matches the trustedSigner stored in both bridge contracts.
// Run this before deploying to catch the "Invalid signature" revert.
//
// Usage:
//   cd points-deployment
//   node scripts/verify-signer.js

const { ethers } = require("ethers");
require("dotenv").config();

const LITVM_RPC      = "https://liteforge.rpc.caldera.xyz/infra-partner-http";
const ARBITRUM_RPC   = "https://arb1.arbitrum.io/rpc";
const LITVM_BRIDGE   = "0x38047685192D41e0f1d98DE6598A852d24368CEC";
const ARBITRUM_BRIDGE = "0xbC30b0F3b3D8E06ea7fB3D55622C6d96e67BecFD";

const BRIDGE_ABI = [
  "function trustedSigner() external view returns (address)",
  "function isPaused() external view returns (bool)",
];

async function main() {
  // Read signer key
  const signerKey = process.env.LITVM_CLAIM_SIGNER_PRIVATE_KEY;
  if (!signerKey) {
    console.error("❌ LITVM_CLAIM_SIGNER_PRIVATE_KEY is not set in .env");
    process.exit(1);
  }

  const signerWallet = new ethers.Wallet(
    signerKey.startsWith("0x") ? signerKey : `0x${signerKey}`
  );
  console.log("🔑 Your LITVM_CLAIM_SIGNER_PRIVATE_KEY address:", signerWallet.address);

  // Check LitVM bridge
  const litvmProvider = new ethers.JsonRpcProvider(LITVM_RPC);
  const litvmBridge   = new ethers.Contract(LITVM_BRIDGE, BRIDGE_ABI, litvmProvider);
  const litvmSigner   = await litvmBridge.trustedSigner();
  const litvmPaused   = await litvmBridge.isPaused();

  console.log("\n--- LitVM Bridge ---");
  console.log("Address       :", LITVM_BRIDGE);
  console.log("trustedSigner :", litvmSigner);
  console.log("isPaused      :", litvmPaused);
  if (litvmSigner.toLowerCase() === signerWallet.address.toLowerCase()) {
    console.log("✅ MATCH - LitVM bridge will accept signatures from your key.");
  } else {
    console.error("❌ MISMATCH - LitVM bridge trustedSigner does not match your key!");
    console.error("   Fix: call bridge.setTrustedSigner(\"" + signerWallet.address + "\") as owner on LitVM.");
  }
  if (litvmPaused) {
    console.error("⚠️  LitVM bridge is PAUSED - claimNFT() will revert until unpaused.");
  }

  // Check Arbitrum bridge
  const arbProvider = new ethers.JsonRpcProvider(ARBITRUM_RPC);
  const arbBridge   = new ethers.Contract(ARBITRUM_BRIDGE, BRIDGE_ABI, arbProvider);
  const arbSigner   = await arbBridge.trustedSigner();
  const arbPaused   = await arbBridge.isPaused();

  console.log("\n--- Arbitrum Bridge ---");
  console.log("Address       :", ARBITRUM_BRIDGE);
  console.log("trustedSigner :", arbSigner);
  console.log("isPaused      :", arbPaused);
  if (arbSigner.toLowerCase() === signerWallet.address.toLowerCase()) {
    console.log("✅ MATCH - Arbitrum bridge will accept signatures from your key.");
  } else {
    console.error("❌ MISMATCH - Arbitrum bridge trustedSigner does not match your key!");
    console.error("   Fix: call bridge.setTrustedSigner(\"" + signerWallet.address + "\") as owner on Arbitrum.");
  }
  if (arbPaused) {
    console.error("⚠️  Arbitrum bridge is PAUSED - claimNFT() will revert until unpaused.");
  }
}

main().catch(e => { console.error(e); process.exit(1); });
