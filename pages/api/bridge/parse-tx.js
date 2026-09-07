// pages/api/bridge/parse-tx.js
import { ethers } from 'ethers';
import { getRpcUrl } from '../../../lib/bridge.js';

const BRIDGE_ABI = [
  'event NFTBridged(address indexed user, uint256 indexed tokenId, uint256 indexed nonce, uint256 fromChainId, uint256 toChainId)'
];

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const { txHash } = req.query;
    if (!txHash || typeof txHash !== 'string') {
      return res.status(400).json({ ok: false, error: 'Transaction hash is required' });
    }

    const cleanTxHash = txHash.trim();
    if (!/^0x([A-Fa-f0-9]{64})$/.test(cleanTxHash)) {
      return res.status(400).json({ ok: false, error: 'Invalid transaction hash format' });
    }

    const bridgeInterface = new ethers.Interface(BRIDGE_ABI);

    // Try Arbitrum first, then LitVM
    const chainIds = [42161, 4441];

    for (const chainId of chainIds) {
      try {
        const rpcUrl = getRpcUrl(chainId);
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        
        const receipt = await provider.getTransactionReceipt(cleanTxHash);
        if (receipt) {
          for (const log of receipt.logs) {
            try {
              const parsed = bridgeInterface.parseLog({
                topics: [...log.topics],
                data: log.data
              });
              if (parsed && parsed.name === 'NFTBridged') {
                return res.status(200).json({
                  ok: true,
                  chainId,
                  transfer: {
                    user: parsed.args.user,
                    tokenId: Number(parsed.args.tokenId),
                    nonce: Number(parsed.args.nonce),
                    sourceChainId: Number(parsed.args.fromChainId),
                    targetChainId: Number(parsed.args.toChainId),
                    txHash: cleanTxHash,
                    claimed: false
                  }
                });
              }
            } catch (e) {
              // skip
            }
          }
        }
      } catch (err) {
        console.warn(`Failed scanning chain ${chainId} for tx receipt:`, err.message);
      }
    }

    return res.status(404).json({ ok: false, error: 'Bridge event not found for this transaction hash on either Arbitrum or LitVM' });
  } catch (error) {
    console.error('Error in parse-tx API:', error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}
