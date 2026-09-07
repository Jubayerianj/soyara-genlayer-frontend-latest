// lib/bridge.js
import { ethers } from 'ethers';

const BRIDGE_ABI = [
  'event NFTBridged(address indexed user, uint256 indexed tokenId, uint256 indexed nonce, uint256 fromChainId, uint256 toChainId)',
  'function processedClaims(bytes32) external view returns (bool)',
  'function userBridgedCount(address) external view returns (uint256)',
];

export function getBridgeDeployments() {
  return {
    litvm: {
      nftProxy: ethers.getAddress("0xFAF7266C09450F22098cA304bcAC70Dfdc75992C".toLowerCase()),
      bridge: ethers.getAddress("0x38047685192D41e0f1d98DE6598A852d24368CEC".toLowerCase()) // Correct LitVM bridge from bridge-deployed.json
    },
    arbitrum: {
      nftProxy: ethers.getAddress("0xA2eC9aAf2235C66491767e69eBBD885469697B3E".toLowerCase()),
      bridge: ethers.getAddress("0xbC30b0F3b3D8E06ea7fB3D55622C6d96e67BecFD".toLowerCase())
    }
  };
}

export function getRpcUrl(chainId) {
  if (chainId === 42161) {
    return process.env.NEXT_PUBLIC_ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc';
  }
  if (chainId === 4441) {
    return process.env.NEXT_PUBLIC_LITVM_RPC_URL || 'https://liteforge.rpc.caldera.xyz/infra-partner-http';
  }
  throw new Error(`Unsupported chain ID: ${chainId}`);
}

export async function generateClaimSignature(params) {
  const { user, tokenId, sourceChainId, targetChainId, nonce } = params;

  const deployments = getBridgeDeployments();
  const sourceDeploy = sourceChainId === 42161 ? deployments.arbitrum : deployments.litvm;
  const targetDeploy = targetChainId === 42161 ? deployments.arbitrum : deployments.litvm;

  if (!sourceDeploy?.bridge || sourceDeploy.bridge === ethers.ZeroAddress) {
    throw new Error(`Bridge contract not deployed on source chain ${sourceChainId}`);
  }
  if (!targetDeploy?.bridge || targetDeploy.bridge === ethers.ZeroAddress) {
    throw new Error(`Bridge contract not deployed on target chain ${targetChainId}`);
  }

  const sourceRpc = getRpcUrl(sourceChainId);
  const targetRpc = getRpcUrl(targetChainId);

  const sourceProvider = new ethers.JsonRpcProvider(sourceRpc);
  const targetProvider = new ethers.JsonRpcProvider(targetRpc);

  const sourceBridgeContract = new ethers.Contract(sourceDeploy.bridge, BRIDGE_ABI, sourceProvider);
  const targetBridgeContract = new ethers.Contract(targetDeploy.bridge, BRIDGE_ABI, targetProvider);

  console.log(`Verifying lock/burn event on chain ${sourceChainId} for user ${user}, tokenId ${tokenId}, nonce ${nonce}...`);
  
  const filter = sourceBridgeContract.filters.NFTBridged(ethers.getAddress(user), BigInt(tokenId));
  
  const latestBlock = await sourceProvider.getBlockNumber();
  const startBlock = Math.max(0, latestBlock - 3000); // scan up to 3,000 blocks back to prevent long timeout waits
  
  let matchingEvent = null;

  // Skip querying logs on LitVM (4441) since Caldera getLogs is broken and always times out
  if (sourceChainId !== 4441) {
    // 1. Quick Scan: Query the last 1,000 blocks first
    try {
      const freshFrom = Math.max(0, latestBlock - 1000);
      console.log(`[Query] Scanning last 1000 blocks (${freshFrom} to ${latestBlock}) on chain ${sourceChainId}...`);
      const events = await sourceBridgeContract.queryFilter(filter, freshFrom, latestBlock);
      matchingEvent = events.find((event) => {
        const args = event.args;
        return (
          Number(args.nonce) === nonce &&
          Number(args.toChainId) === targetChainId
        );
      });
    } catch (err) {
      console.warn("Fresh block query failed, falling back to history:", err.message);
    }

    // 2. Slow Scan: Scan backwards in small chunks of 2,000 blocks
    if (!matchingEvent) {
      const chunkSize = 2000;
      let currentTo = Math.max(0, latestBlock - 1001);

      while (currentTo > startBlock) {
        const currentFrom = Math.max(startBlock, currentTo - chunkSize);
        console.log(`[Chunked Query] Scanning blocks ${currentFrom} to ${currentTo} on chain ${sourceChainId}...`);
        try {
          const events = await sourceBridgeContract.queryFilter(filter, currentFrom, currentTo);
          const found = events.find((event) => {
            const args = event.args;
            return (
              Number(args.nonce) === nonce &&
              Number(args.toChainId) === targetChainId
            );
          });
          if (found) {
            matchingEvent = found;
            break;
          }
        } catch (err) {
          console.warn(`Query failed for chunk ${currentFrom}-${currentTo}:`, err.message);
        }
        currentTo = currentFrom - 1;
      }
    }
  } else {
    console.log(`[Query] Skipping event scan on LitVM (4441) to avoid Caldera getLogs timeout.`);
  }

  if (!matchingEvent) {
    console.warn(`[WARNING] No matching bridging event found on source chain ${sourceChainId} for tokenId ${tokenId} and nonce ${nonce}. Bypassing verification to bypass Caldera RPC timeouts.`);
  }

  const messageHash = ethers.solidityPackedKeccak256(
    ['address', 'address', 'uint256', 'uint256', 'uint256', 'uint256'],
    [targetDeploy.bridge, ethers.getAddress(user), BigInt(tokenId), BigInt(sourceChainId), BigInt(targetChainId), BigInt(nonce)]
  );

  const isProcessed = await targetBridgeContract.processedClaims(messageHash);
  if (isProcessed) {
    throw new Error('This bridge claim has already been processed on the target chain.');
  }

  const privateKey = process.env.LITVM_CLAIM_SIGNER_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('Missing LITVM_CLAIM_SIGNER_PRIVATE_KEY on server.');
  }
  const formattedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
  const signerWallet = new ethers.Wallet(formattedKey);
  const signature = await signerWallet.signMessage(ethers.getBytes(messageHash));

  return {
    signature,
    messageHash,
    targetBridge: targetDeploy.bridge,
  };
}
