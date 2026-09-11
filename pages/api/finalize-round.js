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
// GenLayer finalizes a contract's rounds in order, so this does not finalize
// one round: it drains the AgentValidator's queue from the oldest round (see
// drainFinalizationQueue). It gates itself and only broadcasts a finalize the
// chain has just said will succeed, so calling it on every tick is cheap.
//
//   { txHash }       drain, and report whether that round was finalized
//   { drain: true }  just drain; the background job pings this every minute so
//                    the queue keeps moving whichever page a user has open

import { privateKeyToAccount } from 'viem/accounts';
import { finalizeRound, drainFinalizationQueue } from '../../lib/genlayer.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { txHash, submittedAt, drain } = req.body || {};
  if (!drain && (!txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash))) {
    return res.status(400).json({ error: 'A validation transaction hash is required.' });
  }

  const key = process.env.AGENT_PRIVATE_KEY;
  if (!key) {
    return res.status(500).json({ error: 'No agent key configured to finalize with.' });
  }

  try {
    const account = privateKeyToAccount(key.startsWith('0x') ? key : `0x${key}`);
    if (drain) {
      const r = await drainFinalizationQueue({ account });
      return res.status(200).json({ finalized: r.finalized.length, waitingOn: r.stoppedAt, reason: r.reason });
    }
    // False while an older round or this one's own appeal window is still in
    // the way. Not an error: the next tick drains again.
    const finalized = await finalizeRound(txHash, account, submittedAt);
    return res.status(200).json({ finalized, txHash });
  } catch (err) {
    // A finalize that fails is never fatal to the trade: the verdict simply has
    // not arrived yet, and the queue will try again on its next tick.
    console.warn('[finalize-round] attempt failed:', err?.shortMessage || err?.message);
    return res.status(200).json({ finalized: false, txHash, note: err?.shortMessage || err?.message });
  }
}
