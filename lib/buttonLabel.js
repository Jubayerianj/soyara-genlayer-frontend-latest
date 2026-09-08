// lib/buttonLabel.js
//
// What an execution button should say, and in what ORDER it decides.
//
// WHY THE ORDER IS THE WHOLE POINT
// --------------------------------
// Every execution surface disables its button for several different reasons at
// once, and each renders a chain of ternaries to pick a label. The chain's
// order decides which reason the person actually reads, and getting it wrong is
// invisible in review: the button is correctly disabled, the code looks fine,
// and the user is simply told the wrong thing.
//
// That happened on /ai. `isCheckingAllowance` was tested before
// `hasInsufficientBalance`, so somebody with an empty wallet watched "Checking
// token allowance..." spin instead of being told they had no funds - and if
// that check was slow, they never saw the real reason at all. They reported the
// app as a disabled button with no explanation, which is exactly what it was.
//
// The rule this encodes: say the thing the person must fix FIRST. A missing
// balance outranks an allowance, because no allowance will help until it is
// solved. Transient states (already executing) come before blockers, because
// they are true right now and will resolve on their own.
//
// Precedence, highest first:
//   1. executing        something is already happening; do not talk over it
//   2. noPool           the trade cannot exist at all
//   3. insufficient     the user must fund the wallet; nothing else matters
//   4. checkingAllowance/approving  transient, and only reachable once funded
//   5. needsApproval    a real next step the user can take
//   6. ready            the button does what it says

/**
 * @param {object} s   state flags, all optional
 * @param {string} s.tokenSymbol   the token being sold, named in the message
 * @returns {{ key: string, text: string }}
 */
export function executionButtonLabel(s = {}) {
  const sym = s.tokenSymbol || 'balance';

  if (s.executing)      return { key: 'executing',    text: s.executingText || 'Settling...' };
  if (s.noPool)         return { key: 'noPool',       text: 'No Liquidity Pool for This Pair' };

  // Ahead of every allowance and approval state, deliberately.
  if (s.insufficient)   return { key: 'insufficient', text: `Don't have enough ${sym}` };

  if (s.balanceUnknown) return { key: 'balanceUnknown', text: 'Checking balance...' };
  if (s.checkingAllowance) return { key: 'checkingAllowance', text: 'Checking token allowance...' };
  if (s.approving)      return { key: 'approving',    text: `Approving ${sym}...` };
  if (s.needsApproval)  return { key: 'needsApproval', text: `Approve ${sym} & Execute` };

  return { key: 'ready', text: s.readyText || 'Execute' };
}

/** True when the button must not be clickable, for any of the blocking reasons. */
export function isExecutionBlocked(s = {}) {
  return Boolean(
    s.executing || s.noPool || s.insufficient || s.balanceUnknown ||
    s.checkingAllowance || s.approving || s.needsApproval
  );
}
