// pages/api/finalize-round.js
//
// The keeper that makes settlement actually complete.
//
// WHY THIS EXISTS
// ---------------
// On GenLayer a decided transaction sits in `Accepted` until somebody calls
// finalize. Nothing in the protocol does it. And an Intelligent Contract's
// verdict travels to the EVM as an external message that is delivered ONLY on
// finalization - so a round nobody finalizes produces a verdict that never
// reaches AgentExecutor, and the trade waits forever on an approval that
// consensus already granted.
//
// The nudge used to live inside the settle request's poll loop. That stopped
// working when two changes met: the settle request was shortened to 25 seconds
// (it had been blocking for three minutes, which was its own problem), while
// the nudge itself was gated to rounds at least ten minutes old, because
// firing it every four seconds was flooding the node and rate-limiting the
// user's own wallet. Both changes were right on their own. Together they made
// the nudge unreachable: no request lives long enough to see a round become
// ten minutes old.
//
// So finalization has to be driven by something that outlives a single
// request. The settlement queue already polls every 20 seconds for exactly
// these rounds, and it survives the page being closed - it is the natural
// keeper. This route is what it calls.
//
// finalizeRound applies its own gating (nothing before the appeal window could
// have closed, and at most one attempt a minute per round), so calling this on
// every poll tick is cheap and safe.

import { privateKeyToAccount } from 'viem/accounts';
import { finalizeRound } from '../../lib/genlayer.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { txHash, submittedAt } = req.body || {};
  if (!txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    return res.status(400).json({ error: 'A validation transaction hash is required.' });
  }

  const key = process.env.AGENT_PRIVATE_KEY;
  if (!key) {
    return res.status(500).json({ error: 'No agent key configured to finalize with.' });
  }

  try {
    const account = privateKeyToAccount(key.startsWith('0x') ? key : `0x${key}`);
    // Returns false when the round is too young, when one was attempted within
    // the last minute, or when the appeal window is still open. None of those
    // are errors - they are the gate doing its job.
    const finalized = await finalizeRound(txHash, account, submittedAt);
    return res.status(200).json({ finalized, txHash });
  } catch (err) {
    // A finalize that fails is never fatal to the trade: the verdict simply has
    // not arrived yet, and the queue will try again on its next tick.
    console.warn('[finalize-round] attempt failed:', err?.shortMessage || err?.message);
    return res.status(200).json({ finalized: false, txHash, note: err?.shortMessage || err?.message });
  }
}
