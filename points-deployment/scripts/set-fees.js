// scripts/set-fees.js
const { ethers } = require("ethers");
require("dotenv").config();

const ARBITRUM_RPC = "https://arb1.arbitrum.io/rpc";
const LITVM_RPC = "https://liteforge.rpc.caldera.xyz/infra-partner-http";

const ARBITRUM_BRIDGE = "0xbC30b0F3b3D8E06ea7fB3D55622C6d96e67BecFD";
const LITVM_BRIDGE = "0x38047685192D41e0f1d98DE6598A852d24368CEC";

// Bridge Fee defaults
const ARBITRUM_FEE = ethers.parseEther("0.0001"); // 0.0001 ETH
const LITVM_FEE = ethers.parseEther("0.001");     // 0.001 zkLTC/LTC

const BRIDGE_ABI = [
  "function setBridgeFee(uint256 _fee) external",
  "function bridgeFee() external view returns (uint256)",
  "function owner() external view returns (address)"
];

async function setFee(rpcUrl, bridgeAddress, feeAmount, name) {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) throw new Error("PRIVATE_KEY not found in .env");

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`, provider);
  const bridge = new ethers.Contract(bridgeAddress, BRIDGE_ABI, wallet);

  console.log(`\n🔧 Setting Bridge Fee on ${name}`);
  console.log("Bridge Address:", bridgeAddress);
  console.log("Owner Address :", wallet.address);

  const contractOwner = await bridge.owner();
  if (wallet.address.toLowerCase() !== contractOwner.toLowerCase()) {
    console.error(`❌ Error: Wallet ${wallet.address} is NOT the owner of the bridge proxy (${contractOwner}).`);
    return;
  }

  const currentFee = await bridge.bridgeFee();
  console.log(`Current Fee   : ${ethers.formatEther(currentFee)}`);
  console.log(`New Fee Value : ${ethers.formatEther(feeAmount)}`);

  if (currentFee.toString() === feeAmount.toString()) {
    console.log("✅ Fee is already set to the target value. Skipping.");
    return;
  }

  console.log("📤 Sending setBridgeFee transaction...");
  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice ? (feeData.gasPrice * 12n) / 10n : undefined;

  const tx = await bridge.setBridgeFee(feeAmount, { gasPrice });
  console.log("Tx Hash       :", tx.hash);
  console.log("Waiting for confirmation...");
  const receipt = await tx.wait();
  console.log(`✅ Confirmed in block ${receipt.blockNumber}!`);

  const updatedFee = await bridge.bridgeFee();
  console.log(`Updated Fee   : ${ethers.formatEther(updatedFee)}`);
}

async function main() {
  await setFee(ARBITRUM_RPC, ARBITRUM_BRIDGE, ARBITRUM_FEE, "Arbitrum");
  await setFee(LITVM_RPC, LITVM_BRIDGE, LITVM_FEE, "LitVM");
  console.log("\n🎉 All bridge fees set successfully!");
}

main().catch(console.error);
