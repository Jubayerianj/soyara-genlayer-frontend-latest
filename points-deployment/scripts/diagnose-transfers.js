// scripts/diagnose-transfers.js
const { ethers } = require("ethers");

const ARBITRUM_RPC = "https://arb1.arbitrum.io/rpc";
const LITVM_RPC = "https://liteforge.rpc.caldera.xyz/infra-partner-http";

const ARBITRUM_BRIDGE = "0xbC30b0F3b3D8E06ea7fB3D55622C6d96e67BecFD";
const LITVM_BRIDGE = "0x38047685192D41e0f1d98DE6598A852d24368CEC";

const BRIDGE_ABI = [
  "event NFTBridged(address indexed user, uint256 indexed tokenId, uint256 indexed nonce, uint256 fromChainId, uint256 toChainId)",
  "event NFTClaimed(address indexed user, uint256 indexed tokenId, uint256 indexed nonce, uint256 fromChainId, uint256 toChainId)",
  "function processedClaims(bytes32 claimHash) external view returns (bool)",
  "function getClaimHash(address user, uint256 tokenId, uint256 nonce, uint256 fromChainId, uint256 toChainId) external pure returns (bytes32)"
];

async function diagnoseChain(sourceRpc, destRpc, sourceBridgeAddr, destBridgeAddr, name, searchBlocks = 500000) {
  console.log(`\n======================================================`);
  console.log(`🔍 Diagnosing transfers from ${name}`);
  console.log(`======================================================`);
  
  const srcProvider = new ethers.JsonRpcProvider(sourceRpc);
  const destProvider = new ethers.JsonRpcProvider(destRpc);
  
  const srcContract = new ethers.Contract(sourceBridgeAddr, BRIDGE_ABI, srcProvider);
  const destContract = new ethers.Contract(destBridgeAddr, BRIDGE_ABI, destProvider);

  const latestBlock = await srcProvider.getBlockNumber();
  const startBlock = Math.max(0, latestBlock - searchBlocks);
  console.log(`Scanning ${name} logs from block ${startBlock} to ${latestBlock}...`);

  // Query NFTBridged events
  const filter = srcContract.filters.NFTBridged();
  const events = await srcContract.queryFilter(filter, startBlock, latestBlock).catch(err => {
    console.error(`Failed to query events on ${name}:`, err.message);
    return [];
  });

  console.log(`Found ${events.length} bridge events in the last ${searchBlocks} blocks.`);

  for (const event of events) {
    const { user, tokenId, nonce, fromChainId, toChainId } = event.args;
    console.log(`\n🌉 Event: Bridge Token #${tokenId} (Nonce: ${nonce})`);
    console.log(`   User      : ${user}`);
    console.log(`   Tx Hash   : ${event.transactionHash}`);

    // Precompute claim hash
    const claimHash = await destContract.getClaimHash(user, tokenId, nonce, fromChainId, toChainId);
    console.log(`   Claim Hash: ${claimHash}`);

    // Check if claimed on destination chain
    const isClaimed = await destContract.processedClaims(claimHash);
    console.log(`   Status    : ${isClaimed ? "✅ CLAIMED (Succeeded)" : "❌ UNCLAIMED (Pending / Failed)"}`);
  }
}

async function diagnoseLitVMToArb(searchBlocks = 10000) {
  // For LitVM, since eth_getLogs times out, we'll try scanning the most recent block logs or checking recent transaction receipts
  console.log(`\n======================================================`);
  console.log(`🔍 Diagnosing LitVM -> Arbitrum transfers (Block receipts)`);
  console.log(`======================================================`);
  
  const litvmProvider = new ethers.JsonRpcProvider(LITVM_RPC);
  const arbProvider = new ethers.JsonRpcProvider(ARBITRUM_RPC);
  
  const arbContract = new ethers.Contract(ARBITRUM_BRIDGE, BRIDGE_ABI, arbProvider);

  const latestBlock = await litvmProvider.getBlockNumber();
  // Scan last 100 blocks block-by-block
  const startBlock = latestBlock - 100;
  console.log(`Scanning LitVM block receipts from block ${startBlock} to ${latestBlock}...`);

  for (let blockNum = startBlock; blockNum <= latestBlock; blockNum++) {
    const block = await litvmProvider.getBlock(blockNum, true).catch(() => null);
    if (!block || !block.prefetchedTransactions) continue;

    for (const tx of block.prefetchedTransactions) {
      if (tx.to && tx.to.toLowerCase() === LITVM_BRIDGE.toLowerCase()) {
        const receipt = await litvmProvider.getTransactionReceipt(tx.hash);
        if (!receipt || receipt.status !== 1) continue;

        // Parse logs
        const bridgeInterface = new ethers.Interface(BRIDGE_ABI);
        for (const log of receipt.logs) {
          try {
            const parsed = bridgeInterface.parseLog(log);
            if (parsed && parsed.name === "NFTBridged") {
              const { user, tokenId, nonce, fromChainId, toChainId } = parsed.args;
              console.log(`\n🌉 Event on LitVM: Bridge Token #${tokenId} (Nonce: ${nonce})`);
              console.log(`   User      : ${user}`);
              console.log(`   Tx Hash   : ${tx.hash}`);

              const claimHash = await arbContract.getClaimHash(user, tokenId, nonce, fromChainId, toChainId);
              const isClaimed = await arbContract.processedClaims(claimHash);
              console.log(`   Status on Arbitrum: ${isClaimed ? "✅ CLAIMED" : "❌ UNCLAIMED"}`);
            }
          } catch (e) {
            // Log not for our contract or parse failed
          }
        }
      }
    }
  }
}

async function main() {
  // 1. Diagnoses Arb -> LitVM (Querying logs works on Arbitrum)
  await diagnoseChain(ARBITRUM_RPC, LITVM_RPC, ARBITRUM_BRIDGE, LITVM_BRIDGE, "Arbitrum -> LitVM", 100000);
  
  // 2. Diagnoses LitVM -> Arb (Using block receipt scanning because eth_getLogs times out)
  await diagnoseLitVMToArb();
}

main().catch(console.error);
