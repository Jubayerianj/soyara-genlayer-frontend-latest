// lib/amounts.js
//
// Turning an amount from a UI proposal into raw token units, exactly.
//
// WHY THIS IS SHARED
// ------------------
// Proposals carry amounts loosely: sometimes already-raw integer strings,
// sometimes human decimals like "10.5", sometimes numbers. Converting them is
// two lines, which is exactly why it kept being written badly in a new place
// instead of imported.
//
// The swap path had a strict converter. The liquidity path did not, and called
// `BigInt(amount)` directly, which failed in both possible directions:
//
//   BigInt("10.0")  ->  throws, surfaced to the user as the validate route's
//                       catch-all "Consensus unavailable - failed closed"
//   BigInt("10")    ->  10 WEI. Silently a deposit 18 orders of magnitude
//                       smaller than the one requested, with no error anywhere.
//
// The second is the dangerous one: it does not fail, it just quietly asks for
// the wrong amount.

/**
 * Convert to raw units, strictly.
 *
 * Prefers an already-raw value; otherwise scales a decimal string by `decimals`.
 * Never guesses and never silently substitutes a default: an amount that cannot
 * be read is an error, because the alternative is committing the user to a
 * number they did not choose.
 *
 * @returns `{ ok: true, value: bigint }` or `{ ok: false, error: string }`
 */
export function toRawAmount({ raw, human, decimals = 18, label = 'amount', allowZero = false }) {
  if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
    const text = String(raw).trim();
    if (!/^\d+$/.test(text)) {
      return { ok: false, error: `${label} was given as a raw value but is not a whole number of units.` };
    }
    const value = BigInt(text);
    if (!allowZero && value <= 0n) return { ok: false, error: `${label} must be greater than zero.` };
    return { ok: true, value };
  }

  if (human === undefined || human === null || String(human).trim() === '') {
    return { ok: false, error: `${label} is required.` };
  }

  // Scale from the ORIGINAL decimal string, never through a float.
  //
  // `parseFloat(x) * 10 ** decimals` is wrong twice: 0.1 * 10**18 in IEEE-754 is
  // not 10**17, and large values become exponent notation that BigInt rejects.
  // Splitting the digits is exact at every magnitude.
  const text = String(human).trim();
  if (!/^\d+(\.\d+)?$/.test(text)) {
    return { ok: false, error: `${label} must be a plain decimal amount, got "${human}".` };
  }
  const [whole, frac = ''] = text.split('.');
  const padded = (frac + '0'.repeat(decimals)).slice(0, decimals);
  const value = BigInt(whole) * (10n ** BigInt(decimals)) + BigInt(padded || '0');
  if (!allowZero && value <= 0n) {
    return { ok: false, error: `${label} rounds to zero at ${decimals} decimals.` };
  }
  return { ok: true, value };
}
