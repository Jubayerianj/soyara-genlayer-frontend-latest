// lib/verdict.js
//
// Obtaining a GenLayer consensus verdict for a settlement commitment.
//
// WHY THIS IS ITS OWN MODULE
// --------------------------
// Three routes settle through AgentExecutor - swaps, add-liquidity and
// remove-liquidity - and all three used to do the same insecure thing inline:
// call the executor's onlyAgent approval function with a hash they had computed
// themselves, then immediately execute against their own approval. The executor
// never learned that GenLayer had been consulted.
//
// The verdict now comes from the AgentValidator Intelligent Contract, which
// delivers it to AgentExecutor itself over its ghost contract. What each route
// has to do instead is: derive the commitment, ask the EXECUTOR whether a
// verdict for it is live, submit a consensus round if not, and wait. That
// sequence is identical in all three, and identical sequences that guard money
// are better written once.
//
// THE WAIT IS NOT A BUG, BUT IT DOES NEED A NUDGE
// -----------------------------------------------
// External messages from an Intelligent Contract are delivered on FINALIZATION,
// never on acceptance. So there is a genuine window in which the round has
// approved a trade and the executor still will not honour it. Callers get
// `pending: true` for that window rather than an error, because it is not one.
//
// Finalization is a CALL, not a timer. A decided round sits in `Accepted` until
// somebody finalizes it, and nothing in the protocol does that on its own. Since
// the external message is what carries the verdict to AgentExecutor, a trade
// whose round nobody finalizes never becomes settleable at all.
//
// So this module does not merely wait: it attempts the finalization itself
// between polls. The call is a no-op until the appeal window has elapsed, which
// makes it safe to retry on a loop, and it means settlement does not depend on
// some other party happening to run a keeper.

/** Poll interval and ceiling for the finalization wait. */
export const VERDICT_POLL_MS = 4_000;
// How long a settle request waits in the foreground before handing off.
//
// This used to be 180s, from when an attestor quorum could carry the verdict
// about thirty seconds after the round decided. That rail is gone: the verdict
// now rides an external message delivered only on FINALIZATION, 15-25 minutes
// out. Waiting three minutes for a twenty-five minute event achieves nothing
// except a three-minute hanging fetch per attempt, and the client retried it
// eight times - which is why a trade sat on "Validating" for half an hour.
//
// So wait only long enough to catch a verdict that is already live (a reused
// round, or one finalized while the user was reading), then return 202 and let
// the settlement queue poll in the background where the waiting belongs.
export const VERDICT_WAIT_MS = 25_000;

/**
 * Read whether the executor currently holds a live verdict for `commitment`.
 *
 * Deliberately asks the EXECUTOR, not the validator. The validator can only say
 * what it decided; the executor is what will enforce it, and between the two
 * sits the finalization delay that this whole function exists to absorb.
 */
export async function isVerdictLive({ publicClient, executor, abi, commitment }) {
  return publicClient.readContract({
    address: executor,
    abi,
    functionName: 'isVerdictLive',
    args: [commitment],
  });
}

/**
 * The verdict's state, which is THREE things, not two.
 *
 * `isVerdictLive` returns false both for a verdict that has not arrived yet and
 * for one that arrived and then aged out. Every caller collapsed that into
 * `pending: !live` and told the user the round was "still finalising".
 *
 * For an expired verdict that is permanently wrong. The round already ran,
 * consensus already approved it, and the approval already lapsed - waiting
 * cannot bring it back. Retrying the same order rebuilds the same commitment
 * (the fields are identical), finds the same expired entry, and reports
 * "still in progress" again. That is an infinite wait for something that
 * already came and went, and it is what a user sees as settlement being stuck.
 *
 * Verified on chain: commitment 0x582f7f9a... had verdictExpiry 1788867679
 * against a chain time of 1788868987 - recorded, then expired 21.8 minutes
 * earlier - while the app kept reporting it as not yet finalised.
 *
 * @returns {{ live: boolean, expired: boolean, everRecorded: boolean, expiry: number }}
 */
export async function readVerdictState({ publicClient, executor, abi, commitment }) {
  const [live, expiryRaw] = await Promise.all([
    publicClient.readContract({ address: executor, abi, functionName: 'isVerdictLive', args: [commitment] }),
    publicClient.readContract({ address: executor, abi, functionName: 'verdictExpiry', args: [commitment] }),
  ]);
  const expiry = Number(expiryRaw || 0);
  const now = Math.floor(Date.now() / 1000);
  return {
    live: Boolean(live),
    everRecorded: expiry > 0,
    // Recorded, and its window has closed. A FRESH round is required.
    expired: expiry > 0 && !live && expiry <= now,
    expiry,
  };
}

/**
 * Ensure a consensus verdict for `commitment` is live on the executor.
 *
 * @param {object}   opts.publicClient  viem client for the GenLayer chain
 * @param {string}   opts.executor      AgentExecutor address
 * @param {object}   opts.abi           AgentExecutor ABI
 * @param {string}   opts.commitment    the identifier, read from the executor
 * @param {Function} opts.submit        async () => validation result, runs a
 *                                      consensus round when none is on record
 * @param {Function} [opts.finalize]    async (txHash) => void, nudges the round
 *                                      towards finalization between polls
 * @param {number}   [opts.waitMs]      how long to wait for finalization
 *
 * @returns {{ live: boolean, pending: boolean, rejected: boolean,
 *             reason: string|null, validationTxHash: string|null }}
 */
export async function obtainVerdict({
  publicClient,
  executor,
  abi,
  commitment,
  submit,
  finalize = null,
  waitMs = VERDICT_WAIT_MS,
}) {
  let live = await isVerdictLive({ publicClient, executor, abi, commitment });
  if (live) {
    return { live: true, pending: false, rejected: false, reason: null, validationTxHash: null };
  }

  const validation = await submit();
  const validationTxHash = validation?.txHash || null;

  // A round that ended without a majority is a network condition, not a verdict
  // on the trade - treat only an actual rejection as one.
  if (validation && validation.approved === false && !validation.pending && !validation.retryable) {
    return {
      live: false,
      pending: false,
      rejected: true,
      reason: validation.reason || 'GenLayer consensus rejected this operation',
      validationTxHash,
    };
  }

  const deadline = Date.now() + waitMs;
  while (!live && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, VERDICT_POLL_MS));

    // Nudge the round towards finalization. A failure here is expected and
    // uninteresting - before the appeal window closes there is simply nothing
    // to finalize - so it must never abort the wait.
    if (finalize && validationTxHash) {
      try { await finalize(validationTxHash); } catch { /* window still open */ }
    }

    live = await isVerdictLive({ publicClient, executor, abi, commitment });
  }

  return {
    live,
    pending: !live,
    rejected: false,
    reason: live ? null : 'Consensus verdict has not finalised yet',
    validationTxHash,
  };
}
