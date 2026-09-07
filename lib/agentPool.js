// lib/agentPool.js
//
// AGENT ACCOUNT POOL
// ==================
// GenLayer's ConsensusMain keeps a PER-SENDER pending queue that is processed
// in strict order. Concretely that means:
//
//   * one sender can have only ONE GenVM round in flight at a time;
//   * while that round is pending, every further addTransaction from the same
//     sender reverts with `TransactionNotAtPendingQueueHead()`;
//   * because activation on Bradbury can take minutes (or stall entirely), a
//     single slow round blocks that sender for a long time.
//
// The app previously signed every validation with one shared AGENT_PRIVATE_KEY,
// so the whole product was serialised behind a single queue lane - and one stuck
// round made every subsequent swap fail. Those reverts surfaced in the UI as
// "Rejected by Validator: transaction reverted", which looked like the validator
// refusing the trade when it was really a queue collision.
//
// This module hands out one account per in-flight round so rounds run in
// parallel and a stuck round only parks its own lane.
//
// CONFIG (.env.local):
//   AGENT_PRIVATE_KEYS=0xkey1,0xkey2,0xkey3,...   ← preferred, one lane per key
//   AGENT_PRIVATE_KEY=0xkey                        ← legacy single-lane fallback
//
// Every key must be funded with GEN on Bradbury and must be authorised on
// AgentExecutor if it is also used for settlement. Validation-only lanes just
// need gas.

import { privateKeyToAccount } from 'viem/accounts';

// A lane that submitted a round is considered occupied until the round resolves.
// If it never resolves (validators never vote) we still free it after this TTL
// so the pool cannot leak lanes permanently.
const LANE_TTL_MS = 10 * 60 * 1000; // 10 minutes

let lanes = null;

function initPool() {
  const raw = process.env.AGENT_PRIVATE_KEYS || process.env.AGENT_PRIVATE_KEY || '';
  const keys = raw
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean)
    .map((k) => (k.startsWith('0x') ? k : `0x${k}`));

  lanes = [];
  for (const key of keys) {
    try {
      lanes.push({ account: privateKeyToAccount(key), busySince: 0, inFlightTx: null });
    } catch {
      console.warn('[agentPool] skipping malformed agent private key');
    }
  }

  if (lanes.length === 0) {
    console.warn('[agentPool] no agent keys configured - consensus writes will be unavailable');
  } else if (lanes.length === 1) {
    console.warn(
      '[agentPool] only ONE agent key configured. GenLayer serialises rounds per sender, ' +
      'so concurrent validations will collide and revert. Set AGENT_PRIVATE_KEYS with several funded keys.'
    );
  }
}

function ensurePool() {
  if (lanes === null) initPool();
  return lanes;
}

function isFree(lane, now) {
  return lane.busySince === 0 || now - lane.busySince > LANE_TTL_MS;
}

/**
 * Reserve a sender for one consensus round.
 *
 * @returns {{account: object, release: Function, markSubmitted: Function}|null}
 *          null when every lane is currently mid-round - the caller should
 *          report that as "busy / try again", never as a rejection.
 */
export function leaseAgent() {
  const pool = ensurePool();
  if (pool.length === 0) return null;

  const now = Date.now();

  // Start scanning from a rotating offset rather than always at index 0.
  //
  // On a long-running server the busy flags make `find` spread naturally, but
  // under serverless (Vercel) every invocation gets a FRESH module instance, so
  // `busySince` is always 0 and every request picks lane 0. The whole pool then
  // funnels through one sender and the RPC node throttles it per sender -
  // surfacing as "Request exceeds defined limit" even with five idle lanes.
  // A random start spreads isolated invocations across the pool.
  const offset = Math.floor(Math.random() * pool.length);
  let lane = null;
  for (let i = 0; i < pool.length; i += 1) {
    const candidate = pool[(offset + i) % pool.length];
    if (isFree(candidate, now)) { lane = candidate; break; }
  }
  if (!lane) return null;

  lane.busySince = now;
  lane.inFlightTx = null;

  let released = false;
  return {
    account: lane.account,
    laneCount: pool.length,
    markSubmitted(txHash) {
      lane.inFlightTx = txHash;
    },
    release() {
      if (released) return;
      released = true;
      lane.busySince = 0;
      lane.inFlightTx = null;
    },
  };
}

/** How many lanes exist, and how many are mid-round right now. */
export function poolStatus() {
  const pool = ensurePool();
  const now = Date.now();
  return {
    total: pool.length,
    free: pool.filter((l) => isFree(l, now)).length,
    addresses: pool.map((l) => l.account.address),
  };
}

/**
 * The account used for public keeper calls (finalising idle transactions).
 * Any funded key works, so just use the first lane.
 */
export function getKeeperAccount() {
  const pool = ensurePool();
  return pool.length > 0 ? pool[0].account : null;
}
