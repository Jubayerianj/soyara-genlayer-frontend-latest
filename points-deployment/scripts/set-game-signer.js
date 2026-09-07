const { ethers } = require("ethers");
require("dotenv").config();

const RPC_URL = "https://liteforge.rpc.caldera.xyz/infra-partner-http";
const PROXY_ADDRESS = "0xF664B56933f3cF0d7d69982b5A8eC9101b80059D";
const GAME_SIGNER_ADDRESS = "0x5729311FbD8aD44C9E5aac2A42e460c826F54fa5";

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) throw new Error("PRIVATE_KEY not found in env");

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet   = new ethers.Wallet(privateKey, provider);

  console.log("Setting Game Signer address...");
  console.log("Proxy contract:", PROXY_ADDRESS);
  console.log("Target Signer :", GAME_SIGNER_ADDRESS);
  console.log("Owner Account :", wallet.address);

  const wrapperAbi = [
    "function setGameSigner(address _gameSigner) external",
    "function gameSigner() external view returns (address)"
  ];

  const proxy = new ethers.Contract(PROXY_ADDRESS, wrapperAbi, wallet);

  // Estimate gas price
  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice ? (feeData.gasPrice * 15n) / 10n : undefined;

  const tx = await proxy.setGameSigner(GAME_SIGNER_ADDRESS, { gasPrice });
  console.log("Transaction submitted:", tx.hash);

  const receipt = await tx.wait();
  console.log("Transaction confirmed in block:", receipt.blockNumber);

  const currentSigner = await proxy.gameSigner();
  console.log("Current on-chain game signer:", currentSigner);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
