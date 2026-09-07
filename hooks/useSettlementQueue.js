// hooks/useSettlementQueue.js
//
// Pending settlements, tracked in the background and settled automatically.
//
// WHY A QUEUE AND NOT A SPINNER
// -----------------------------
// A trade cannot settle until its consensus round's appeal window closes, which
// on Bradbury runs to roughly 40 minutes. Holding a component in a loading state
// for that long is not a UX decision, it is a mistake: it pins the user to a
// page for something that does not need them, and it loses the whole trade if
// they navigate away or reload.
//
// So a validated trade becomes a queue entry instead. The entry outlives the
// page, the browser watches the executor for its verdict, and the moment the
// verdict lands the trade settles on its own. The user is free the second the
// consensus round is submitted.
//
// WHY IT POLLS THE CHAIN AND NOT THE SERVER
// -----------------------------------------
// The authority on whether a trade can settle is the executor's verdict
// registry, and that is a public read. Asking the chain directly means the
// tracker keeps working when the app server is busy or restarting, and it is
// the same question the settlement route would ask anyway.
//
// Nothing here can authorise anything. The queue holds an order and a
// commitment, which are a receipt, not a permission: a tampered entry hashes to
// an identifier no verdict backs, and the executor refuses it.

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPublicClient, http } from 'viem';
import AGENT_EXECUTOR_ABI from '../abi/AgentExecutor.json';
import { CONTRACT_ADDRESSES } from '../constants/addresses';
import { isTerminal } from '../lib/settlement';

const STORAGE_KEY = 'soyara.settlementQueue.v1';
const POLL_MS = 20000;

const chain = {
  id: 4221,
  name: 'GenLayer Bradbury Testnet',
  nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc-bradbury.genlayer.com'] },
    public: { http: ['https://rpc-bradbury.genlayer.com'] },
  },
};

let client = null;
function publicClient() {
  if (!client) client = createPublicClient({ chain, transport: http('https://rpc-bradbury.genlayer.com') });
  return client;
}

function load() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save(entries) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage full or blocked. The queue still works for this session; it just
    // will not survive a reload, which is worth degrading to rather than
    // throwing away the in-flight trade.
  }
}

export function useSettlementQueue({ enabled = true } = {}) {
  const [entries, setEntries] = useState([]);
  const busy = useRef(new Set());

  useEffect(() => { setEntries(load()); }, []);

  const write = useCallback((next) => {
    setEntries(next);
    save(next);
  }, []);

  const update = useCallback((id, patch) => {
    setEntries((prev) => {
      const next = prev.map((e) => (e.id === id ? { ...e, ...patch, updatedAt: Date.now() } : e));
      save(next);
      return next;
    });
  }, []);

  const enqueue = useCallback((entry) => {
    setEntries((prev) => {
      // Keyed by commitment: re-validating the same intent must update the
      // existing entry rather than stacking duplicates that all settle the same
      // single-use verdict.
      const without = prev.filter((e) => e.commitment !== entry.commitment);
      const next = [{ ...entry, id: entry.commitment, createdAt: Date.now(), updatedAt: Date.now() }, ...without].slice(0, 12);
      save(next);
      return next;
    });
  }, []);

  const remove = useCallback((id) => {
    setEntries((prev) => {
      const next = prev.filter((e) => e.id !== id);
      save(next);
      return next;
    });
  }, []);

  const clearFinished = useCallback(() => {
    setEntries((prev) => {
      const next = prev.filter((e) => !isTerminal(e.stage));
      save(next);
      return next;
    });
  }, []);

  /** Settle one entry whose verdict is live. */
  const settle = useCallback(async (entry) => {
    if (busy.current.has(entry.id)) return;
    busy.current.add(entry.id);
    update(entry.id, { stage: 'settling' });
    try {
      // Never fire a second settlement for the same commitment.
      //
      // A verdict is single use, so a duplicate attempt reverts with
      // CommitmentAlreadyUsed. That is harmless on chain and confusing in the
      // UI: the entry ends up marked settled, because it was, while also
      // carrying the revert from the duplicate. Two things could reach this
      // point - the queue's own pass and the page's execute button - so the
      // check belongs here rather than in either caller.
      const executorAddr = CONTRACT_ADDRESSES[4221]?.agentExecutor;
      if (executorAddr) {
        const alreadyUsed = await publicClient().readContract({
          address: executorAddr, abi: AGENT_EXECUTOR_ABI,
          functionName: 'commitmentUsed', args: [entry.commitment],
        });
        if (alreadyUsed) {
          update(entry.id, { stage: 'settled', error: null, needsApproval: false });
          return;
        }
      }

      const res = await fetch('/api/agent-execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pendingOrder: entry.order,
          pendingProgram: entry.program,
          validationSubmitted: true,
          validationTxHash: entry.validationTxHash,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.success) {
        update(entry.id, { stage: 'settled', execTxHash: body.execTxHash, error: null });
      } else if (body.needsApproval) {
        // The one case that genuinely needs the user. Surfaced on the entry so
        // the tracker can show an Approve button instead of failing the trade.
        update(entry.id, { stage: 'finalising', needsApproval: true, spender: body.spender, error: body.error });
      } else if (res.status === 202 || body.pending) {
        update(entry.id, { stage: 'finalising', error: null });
      } else if (/already settled|CommitmentAlreadyUsed/i.test(body.error || '')) {
        // The verdict was spent, which is what settling means. Reporting this as
        // a failure would tell the user their trade did not happen when it did.
        update(entry.id, { stage: 'settled', error: null, needsApproval: false });
      } else {
        update(entry.id, { stage: 'finalising', error: body.error || `Settlement failed (HTTP ${res.status})` });
      }
    } catch (err) {
      update(entry.id, { stage: 'finalising', error: err?.message || 'Settlement request failed' });
    } finally {
      busy.current.delete(entry.id);
    }
  }, [update]);

  // Watch the executor for each waiting entry.
  useEffect(() => {
    if (!enabled) return undefined;
    const executor = CONTRACT_ADDRESSES[4221]?.agentExecutor;
    if (!executor) return undefined;

    let cancelled = false;
    const tick = async () => {
      const waiting = load().filter((e) => !isTerminal(e.stage) && e.commitment);
      for (const entry of waiting) {
        if (cancelled) return;
        try {
          const [live, expiry] = await Promise.all([
            publicClient().readContract({ address: executor, abi: AGENT_EXECUTOR_ABI, functionName: 'isVerdictLive', args: [entry.commitment] }),
            publicClient().readContract({ address: executor, abi: AGENT_EXECUTOR_ABI, functionName: 'verdictExpiry', args: [entry.commitment] }),
          ]);
          const used = await publicClient().readContract({
            address: executor, abi: AGENT_EXECUTOR_ABI, functionName: 'commitmentUsed', args: [entry.commitment],
          });

          if (used) {
            // Settled, by this tab or another. A commitment is single use, so
            // there is nothing left to do either way - and any error left by a
            // duplicate attempt is now meaningless, so it goes too. Leaving it
            // produced the contradiction of an entry reading "Settled" directly
            // above "executeSwap reverted".
            update(entry.id, { stage: 'settled', error: null, needsApproval: false });
            continue;
          }
          if (live) {
            update(entry.id, { stage: 'ready', verdictExpiry: Number(expiry) });
            if (!entry.needsApproval) await settle(entry);
            continue;
          }

          // Not live yet, but that does not mean waiting.
          //
          // The settlement route tries the attestation rail first: attestors
          // read the verdict the IC recorded (available seconds after the round
          // decides) and sign the same commitment, which the executor verifies
          // on chain. So a trade normally settles here, in seconds, and only
          // falls through to the appeal window if that rail is switched off.
          if (!entry.needsApproval && !entry.fastRailTried) {
            update(entry.id, { fastRailTried: true });
            await settle({ ...entry, fastRailTried: true });
            continue;
          }
          // A recorded but lapsed verdict is a distinct outcome from one that
          // never arrived, and only one of them is worth re-running.
          if (Number(expiry) > 0 && Number(expiry) * 1000 < Date.now()) {
            update(entry.id, { stage: 'expired', verdictExpiry: Number(expiry) });
          }
        } catch {
          // Transient RPC failure. Leave the entry alone and try next tick.
        }
      }
    };

    tick();
    const id = setInterval(tick, POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [enabled, settle, update]);

  const pending = entries.filter((e) => !isTerminal(e.stage));

  return { entries, pending, enqueue, remove, update, clearFinished, settle, write };
}
