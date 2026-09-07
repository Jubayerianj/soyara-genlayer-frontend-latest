// scripts/set-bridge-address.js
const { ethers } = require("ethers");
require("dotenv").config();

const RPC_URL = "https://liteforge.rpc.caldera.xyz/infra-partner-http";
const NFT_PROXY = "0xFAF7266C09450F22098cA304bcAC70Dfdc75992C";
const CORRECT_BRIDGE = "0x38047685192D41e0f1d98DE6598A852d24368CEC";

const NFT_ABI = [
  "function bridgeAddress() external view returns (address)",
  "function setBridgeAddress(address newBridge) external",
  "function owner() external view returns (address)"
];

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) throw new Error("PRIVATE_KEY not found in .env");

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`, provider);

  console.log("🔧 Set Bridge Address on LitVM NFT");
  console.log("Caller      :", wallet.address);
  console.log("NFT Proxy   :", NFT_PROXY);
  console.log("New Bridge  :", CORRECT_BRIDGE);

  const nft = new ethers.Contract(NFT_PROXY, NFT_ABI, wallet);

  const owner = await nft.owner();
  const currentBridge = await nft.bridgeAddress();
  console.log("\nOn-chain owner         :", owner);
  console.log("Current bridgeAddress  :", currentBridge);

  if (wallet.address.toLowerCase() !== owner.toLowerCase()) {
    throw new Error(`❌ Caller (${wallet.address}) is NOT the owner (${owner}). Aborting.`);
  }

  if (currentBridge.toLowerCase() === CORRECT_BRIDGE.toLowerCase()) {
    console.log("\n✅ bridgeAddress is already set correctly. Nothing to do.");
    return;
  }

  console.log("\n📤 Sending setBridgeAddress transaction...");
  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice ? (feeData.gasPrice * 15n) / 10n : ethers.parseUnits("2", "gwei");

  const tx = await nft.setBridgeAddress(CORRECT_BRIDGE, { gasPrice, gasLimit: 100000 });
  console.log("   Tx hash:", tx.hash);

  console.log("   Waiting for confirmation...");
  const receipt = await tx.wait();
  console.log("✅ Confirmed in block", receipt.blockNumber);

  const updatedBridge = await nft.bridgeAddress();
  console.log("\nUpdated bridgeAddress  :", updatedBridge);
  if (updatedBridge.toLowerCase() === CORRECT_BRIDGE.toLowerCase()) {
    console.log("✅ Success! LitVM bridge is now authorized to burn NFTs.");
  } else {
    console.log("❌ Something went wrong - address not updated.");
  }
}

main().catch(e => { console.error(e); process.exit(1); });
