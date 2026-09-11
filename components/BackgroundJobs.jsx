// components/BackgroundJobs.jsx
//
// Work that has to keep going whichever page is open. Renders nothing.
//
// Today that is the fast-lane watcher: a mandate is requested in the
// background after a trade, and becomes usable when its consensus round
// finalizes, about 30 minutes later. Nothing used to watch for that, so the
// user was never told their next trades would be fast. Each check also nudges
// the round toward finalization (the route does that on every call).
//
// And the finalization keeper. GenLayer finalizes a contract's rounds in order
// and nothing finalizes an idle queue, so one round nobody was waiting for (an
// undecided run, a preview) used to hold every trade behind it. A ping every
// minute drains the AgentValidator queue from its oldest round; the server
// gates it and only sends finalizes the chain says will succeed.
//
// The settlement queue runs app-wide too; it lives in SettlementQueueProvider.

import { useEffect } from 'react';
import { listUnconfirmedMandates, markMandateLive, pairLabel } from '../lib/mandate';
import { notices } from '../lib/notify';

const CHECK_MS = 60 * 1000;

export default function BackgroundJobs() {
  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      fetch('/api/finalize-round', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ drain: true }),
      }).catch(() => { /* the next tick drains again */ });
      for (const m of listUnconfirmedMandates()) {
        if (stopped) return;
        try {
          const res = await fetch('/api/agent-mandate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mandateId: m.mandateId, checkOnly: true, roundTxHash: m.roundTxHash, roundSubmittedAt: m.at,
            }),
          });
          const d = await res.json().catch(() => ({}));
          if (d?.live && markMandateLive(m.user, m.tokenIn, m.tokenOut)) {
            notices.fastLaneReady(m.mandateId, pairLabel(m.tokenIn, m.tokenOut));
          }
        } catch {
          // Offline or the server is restarting. The next tick tries again.
        }
      }
    };
    tick();
    const id = setInterval(tick, CHECK_MS);
    return () => { stopped = true; clearInterval(id); };
  }, []);
  return null;
}
