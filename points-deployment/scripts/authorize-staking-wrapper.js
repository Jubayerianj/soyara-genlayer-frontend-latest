// scripts/authorize-staking-wrapper.js
// Run this ONCE after deploying (or upgrading) the NFT contract.
// It authorizes the AGGFlowPointsWrapperProxy (staking contract) to transfer
// the otherwise soulbound LitVM NFTs, enabling stakeNFT() to work.
//
// Usage:
//   cd points-deployment
//   node scripts/authorize-staking-wrapper.js

const { ethers } = require("ethers");
require("dotenv").config();

const RPC_URL       = "https://liteforge.rpc.caldera.xyz/infra-partner-http";
const NFT_PROXY     = "0xFAF7266C09450F22098cA304bcAC70Dfdc75992C"; // LitVM NFT proxy
const BRIDGE        = "0x38047685192D41e0f1d98DE6598A852d24368CEC"; // LitVM bridge proxy
const STAKING_WRAPPER = "0xF664B56933f3cF0d7d69982b5A8eC9101b80059D"; // AGGFlowPointsWrapperProxy

const NFT_ABI = [
  "function owner() external view returns (address)",
  "function bridgeAddress() external view returns (address)",
  "function authorizedBridges(address) external view returns (bool)",
  "function setBridgeAddress(address newBridge) external",
  "function setAuthorizedBridge(address bridge, bool authorized) external",
];

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) throw new Error("PRIVATE_KEY not found in .env");

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet   = new ethers.Wallet(
    privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`,
    provider
  );

  console.log("🔧 Authorize Bridge + Staking Wrapper on LitVM NFT");
  console.log("Caller          :", wallet.address);
  console.log("NFT Proxy       :", NFT_PROXY);
  console.log("Bridge          :", BRIDGE);
  console.log("Staking Wrapper :", STAKING_WRAPPER);

  const nft = new ethers.Contract(NFT_PROXY, NFT_ABI, wallet);

  const owner = await nft.owner();
  console.log("\nOn-chain owner  :", owner);
  if (wallet.address.toLowerCase() !== owner.toLowerCase()) {
    throw new Error(`❌ Caller (${wallet.address}) is NOT the owner (${owner}). Aborting.`);
  }

  const currentBridge   = await nft.bridgeAddress();
  const bridgeAuthed    = await nft.authorizedBridges(BRIDGE);
  const wrapperAuthed   = await nft.authorizedBridges(STAKING_WRAPPER);

  console.log("\n--- Current state ---");
  console.log("bridgeAddress (legacy)              :", currentBridge);
  console.log("authorizedBridges[bridge]           :", bridgeAuthed);
  console.log("authorizedBridges[staking wrapper]  :", wrapperAuthed);

  const feeData  = await provider.getFeeData();
  const gasPrice = feeData.gasPrice
    ? (feeData.gasPrice * 15n) / 10n
    : ethers.parseUnits("2", "gwei");

  // Step 1: Set / update bridgeAddress (also populates authorizedBridges[bridge])
  if (currentBridge.toLowerCase() !== BRIDGE.toLowerCase() || !bridgeAuthed) {
    console.log("\n📤 [1/2] Calling setBridgeAddress to set the bridge and authorize it...");
    const tx = await nft.setBridgeAddress(BRIDGE, { gasPrice, gasLimit: 150000 });
    console.log("   Tx hash:", tx.hash);
    await tx.wait();
    console.log("   ✅ setBridgeAddress confirmed.");
  } else {
    console.log("\n✅ [1/2] Bridge already set and authorized - skipping.");
  }

  // Step 2: Authorize the staking wrapper proxy
  if (!wrapperAuthed) {
    console.log("\n📤 [2/2] Calling setAuthorizedBridge to authorize the staking wrapper...");
    const tx2 = await nft.setAuthorizedBridge(STAKING_WRAPPER, true, { gasPrice, gasLimit: 150000 });
    console.log("   Tx hash:", tx2.hash);
    await tx2.wait();
    console.log("   ✅ setAuthorizedBridge confirmed.");
  } else {
    console.log("\n✅ [2/2] Staking wrapper already authorized - skipping.");
  }

  // Final verification
  console.log("\n--- Final state ---");
  console.log("bridgeAddress (legacy)              :", await nft.bridgeAddress());
  console.log("authorizedBridges[bridge]           :", await nft.authorizedBridges(BRIDGE));
  console.log("authorizedBridges[staking wrapper]  :", await nft.authorizedBridges(STAKING_WRAPPER));
  console.log("\n🎉 Done! Both the bridge and staking wrapper are now authorized.");
  console.log("   Users can now bridge AND stake their NFTs without hitting 'Transfers are disabled'.");
}

main().catch(e => { console.error(e); process.exit(1); });
