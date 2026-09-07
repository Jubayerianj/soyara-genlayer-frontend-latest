// pages/api/bridge/generate-claim.js
import { generateClaimSignature } from '../../../lib/bridge.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const { user, tokenId, sourceChainId, targetChainId, nonce } = req.body || {};

    console.log('[API generate-claim] Incoming Request Body:', { user, tokenId, sourceChainId, targetChainId, nonce });

    if (!user || tokenId === undefined || sourceChainId === undefined || targetChainId === undefined || nonce === undefined) {
      return res.status(400).json({ ok: false, error: 'Missing required parameters' });
    }

    if (Number(tokenId) < 0 || Number(sourceChainId) < 0 || Number(targetChainId) < 0 || Number(nonce) < 0) {
      return res.status(400).json({ ok: false, error: 'Invalid parameters: values cannot be negative' });
    }

    const result = await generateClaimSignature({
      user,
      tokenId: Number(tokenId),
      sourceChainId: Number(sourceChainId),
      targetChainId: Number(targetChainId),
      nonce: Number(nonce),
    });

    res.status(200).json({
      ok: true,
      ...result,
    });
  } catch (error) {
    console.error('Error generating bridge claim signature:', error);
    res.status(400).json({ ok: false, error: error.message });
  }
}
