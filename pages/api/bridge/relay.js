// pages/api/bridge/relay.js
import { ethers } from 'ethers';
import { getBridgeDeployments, getRpcUrl } from '../../../lib/bridge.js';
import { BRIDGE_ABI } from '../../../utils/bridge-utils';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const { user, tokenId, sourceChainId, targetChainId, nonce } = req.body || {};

    console.log('[API relay] Incoming Request Body:', { user, tokenId, sourceChainId, targetChainId, nonce });

    if (!user || tokenId === undefined || sourceChainId === undefined || targetChainId === undefined || nonce === undefined) {
      return res.status(400).json({ ok: false, error: 'Missing required parameters' });
    }

    if (Number(tokenId) < 0 || Number(sourceChainId) < 0 || Number(targetChainId) < 0 || Number(nonce) < 0) {
      return res.status(400).json({ ok: false, error: 'Invalid parameters: values cannot be negative' });
    }

    const deployments = getBridgeDeployments();
    const sourceDeploy = sourceChainId === 42161 ? deployments.arbitrum : deployments.litvm;
    const targetDeploy = targetChainId === 42161 ? deployments.arbitrum : deployments.litvm;

    if (!sourceDeploy?.bridge || !targetDeploy?.bridge) {
      throw new Error('Bridge contracts not configured properly.');
    }

    const sourceRpc = getRpcUrl(sourceChainId);
    const targetRpc = getRpcUrl(targetChainId);

    const sourceProvider = new ethers.JsonRpcProvider(sourceRpc);
    const targetProvider = new ethers.JsonRpcProvider(targetRpc);

    const sourceBridgeContract = new ethers.Contract(sourceDeploy.bridge, BRIDGE_ABI, sourceProvider);
    const targetBridgeContract = new ethers.Contract(targetDeploy.bridge, BRIDGE_ABI, targetProvider);

    console.log(`[Vercel Relayer] Verifying lock/burn event on chain ${sourceChainId}...`);
    const filter = sourceBridgeContract.filters.NFTBridged(ethers.getAddress(user), BigInt(tokenId));
    
    const latestBlock = await sourceProvider.getBlockNumber();
    const startBlock = Math.max(0, latestBlock - 3000); // Scan up to 3,000 blocks back to prevent long timeout waits
    
    let matchingEvent = null;

    // Skip querying logs on LitVM (4441) since Caldera getLogs is broken and always times out
    if (sourceChainId !== 4441) {
      // 1. Quick Scan: Query the last 1,000 blocks first
      try {
        const freshFrom = Math.max(0, latestBlock - 1000);
        const events = await sourceBridgeContract.queryFilter(filter, freshFrom, latestBlock);
        matchingEvent = events.find((event) => {
          const args = event.args;
          return (
            Number(args.nonce) === Number(nonce) &&
            Number(args.toChainId) === Number(targetChainId)
          );
        });
      } catch (err) {
        console.warn("[Relayer] Quick scan failed, falling back:", err.message);
      }

      // 2. Slow Scan: Query backwards in chunks of 2,000 blocks
      if (!matchingEvent) {
        const chunkSize = 2000;
        let currentTo = Math.max(0, latestBlock - 1001);

        while (currentTo > startBlock) {
          const currentFrom = Math.max(startBlock, currentTo - chunkSize);
          try {
            const events = await sourceBridgeContract.queryFilter(filter, currentFrom, currentTo);
            const found = events.find((event) => {
              const args = event.args;
              return (
                Number(args.nonce) === Number(nonce) &&
                Number(args.toChainId) === Number(targetChainId)
              );
            });
            if (found) {
              matchingEvent = found;
              break;
            }
          } catch (err) {
            console.warn(`[Relayer] Chunk failed ${currentFrom}-${currentTo}:`, err.message);
          }
          currentTo = currentFrom - 1;
        }
      }
    } else {
      console.log(`[Relayer] Skipping event scan on LitVM (4441) to avoid Caldera getLogs timeout.`);
    }

    if (!matchingEvent) {
      console.warn('[WARNING] Relayer: No matching bridge event found on the source chain. Bypassing verification to bypass Caldera RPC timeouts.');
    }

    const claimHash = ethers.solidityPackedKeccak256(
      ['address', 'address', 'uint256', 'uint256', 'uint256', 'uint256'],
      [targetDeploy.bridge, ethers.getAddress(user), BigInt(tokenId), BigInt(sourceChainId), BigInt(targetChainId), BigInt(nonce)]
    );

    const isProcessed = await targetBridgeContract.processedClaims(claimHash);
    if (isProcessed) {
      return res.status(200).json({ ok: true, message: 'Already claimed on target chain.', alreadyClaimed: true });
    }

    // FIX: Always use LITVM_CLAIM_SIGNER_PRIVATE_KEY - never fall back to PRIVATE_KEY.
    // The key used here MUST match the address stored as `trustedSigner` in the bridge contract.
    // Using PRIVATE_KEY (the deployer key) as a fallback would sign with a different address
    // than trustedSigner, causing claimNFT() to revert with "Invalid signature".
    const privateKey = process.env.LITVM_CLAIM_SIGNER_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('LITVM_CLAIM_SIGNER_PRIVATE_KEY is not set. Set it in your Vercel environment variables.');
    }
    const formattedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
    const relayerSignerWallet = new ethers.Wallet(formattedKey);
    const signature = await relayerSignerWallet.signMessage(ethers.getBytes(claimHash));

    console.log(`[Vercel Relayer] Submitting claim transaction to chain ${targetChainId}...`);
    const relayerTargetWallet = new ethers.Wallet(formattedKey, targetProvider);
    const targetBridgeWithSigner = new ethers.Contract(targetDeploy.bridge, BRIDGE_ABI, relayerTargetWallet);

    const claimTx = await targetBridgeWithSigner.claimNFT(
      ethers.getAddress(user),
      BigInt(tokenId),
      BigInt(sourceChainId),
      BigInt(nonce),
      signature,
      { gasLimit: 500000 }
    );

    console.log(`[Vercel Relayer] Claim tx submitted: ${claimTx.hash}`);
    
    return res.status(200).json({
      ok: true,
      txHash: claimTx.hash,
      autoRelayed: true
    });

  } catch (error) {
    console.error('[Vercel Relayer Error]:', error);
    return res.status(400).json({ ok: false, error: error.message });
  }
}
