// pages/api/settlements.js
//
// The server's record of a queued trade (lib/settlementStore.js).
//
//   GET  ?commitment=0x...   where it stands: waiting, settled (with the tx), ...
//   POST { cancel: '0x...' } the user dismissed it: never settle it on the server
//
// Neither call authorises anything. A cancelled entry only stops the server
// from relaying; nothing here can make the executor settle a trade.
//
// Cancelling asks for no proof of ownership, on purpose. The worst a stranger
// can do with it is switch server settlement off for one trade, which then
// settles the old way, from the user's own tab. Requiring a key instead would
// mean a dismiss that lost its key could not stop a trade the user let go.

import { getSettlement, cancelSettlement } from '../../lib/settlementStore.js';

const isCommitment = (v) => typeof v === 'string' && /^0x[0-9a-fA-F]{64}$/.test(v);

export default function handler(req, res) {
  if (req.method === 'GET') {
    const { commitment } = req.query || {};
    if (!isCommitment(commitment)) return res.status(400).json({ error: 'A commitment is required.' });
    const e = getSettlement(commitment);
    return res.status(200).json(e ? { stage: e.stage, execTxHash: e.execTxHash || null, settledBy: e.settledBy || null, error: e.error || null } : { stage: null });
  }
  if (req.method === 'POST') {
    const { cancel } = req.body || {};
    if (!isCommitment(cancel)) return res.status(400).json({ error: 'A commitment to cancel is required.' });
    const e = cancelSettlement(cancel);
    return res.status(200).json({ stage: e?.stage || null });
  }
  return res.status(405).json({ error: 'Method not allowed' });
}
