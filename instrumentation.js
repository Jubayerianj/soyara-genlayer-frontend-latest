// instrumentation.js
//
// Runs once when the app server starts. It starts the settlement keeper, so
// queued trades settle on the server even when no Soyara tab is open - and
// after a restart, without waiting for the first request to arrive.

export async function register() {
  // Next builds this file for the edge runtime too. The import has to sit
  // inside this exact check so that build drops it: the keeper needs Node's fs.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { ensureSettlementKeeper } = await import('./lib/settlementKeeper.js');
    ensureSettlementKeeper();
  }
}
