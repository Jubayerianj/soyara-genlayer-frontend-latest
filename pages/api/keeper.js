// pages/api/keeper.js
//
// One settlement-keeper pass on demand: drain the finalization queue, then
// settle every stored trade whose verdict has landed (lib/settlementKeeper.js).
// The server also runs this on its own every 30 seconds; open Soyara tabs ping
// it once a minute, and a serverless deployment would call it on a schedule.

import { runKeeperOnce, ensureSettlementKeeper } from '../../lib/settlementKeeper.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  ensureSettlementKeeper();
  try {
    const summary = await runKeeperOnce();
    return res.status(200).json(summary);
  } catch (err) {
    return res.status(200).json({ error: err?.message || 'keeper pass failed' });
  }
}
