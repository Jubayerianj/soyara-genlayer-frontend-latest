# Soyara DEX: frontend and agent settlement routes

Next.js app for the Soyara DEX on GenLayer Bradbury and Studio Next: the swap aggregator, the
pools UI, and the two agent surfaces (`/ai` and `/a2a`) together with the API
routes that validate and settle what they propose.

## How agent trades settle

Every trade an agent surface proposes settles through `AgentExecutor`, under
exactly one authority that only the `AgentValidator` Intelligent Contract can
write (`recordVerdict` and `recordMandate` are `onlyValidator`):

- **consensus**, the default: the trade's own `validate_swap` round. Its verdict
  binds the whole order (route, fee, fee collector, recipient, quote, deadline,
  nonce), reaches the executor when the round finalizes, and is consumed once
  by `executeSwap`.
- **mandate**: when a mandate an earlier `issue_trading_mandate` round issued
  already covers the exact order on its best route, `executeSwapUnderMandate`
  settles it in one transaction. The executor checks the trade against the
  mandate and prices it from the pinned pool.

`/api/genlayer-validate` picks the rail before any round is opened, so a trade
never has both. There is no direct path: the shared agent hook has no route to
`AGGFlowEntrypoint`, and a validation result that names no rail settles nowhere.

Liquidity requests on the agent surfaces are handed to the pools app. V3
liquidity is not on the agent path at all: the IC has no V3 liquidity validator,
and `/api/genlayer-validate` refuses a V3 request before any round.

Deployed addresses live in `constants/addresses.js`. The contracts, their
deployment record and `verify-deployment.sh` are in
[soyara-genlayer-contracts](https://github.com/Jubayerianj/soyara-genlayer-contracts).

## Studio Next

`/ai?net=studio-next` trades on GenLayer Studio Next (Consensus v0.6, chain
61997). Studio Next has no EVM layer, so there the app talks to one Intelligent
Contract that judges and settles, SoyaraAgentDex
(`constants/studioNext.js`), instead of AgentValidator and AgentExecutor:

- a **swap** is signed in the user's wallet and judged in one round: every
  validator reads the live Bradbury pool for the same tokens, and the trade
  settles only within the user's slippage of that price
- a **mandate** is signed once; validators check its caps against the live
  market and against the user's own words
- trades **under a mandate** are signed by an agent key kept in the browser,
  which the contract lets spend only inside that mandate, so they settle in
  seconds with no popup

`/a2a/user?net=studio-next` runs the swarm's seven agents against the same
contract (`services/a2a/studioSwarm.js`): the Market Analyst reads the Bradbury
pool validators will read and applies the contract's rules, so a trade they
would refuse stops before signing; the Settlement Strategist picks the agent
key or a consensus round; the Post-Trade Auditor checks the stored verdict
against the balance change. `/ai` and the swarm share one network choice.

Wallet writes go through `@genlayer/transaction-kit` with the measured fee
profile; the RC SDK is installed as `genlayer-js-next` so the Bradbury pages keep
`genlayer-js` 1.1.8. Code: `lib/studioNext/`, `components/StudioNext/StudioDesk.jsx`.

To verify it by hand: open `/ai?net=studio-next`, connect a wallet (the network
is added for you), **Get test funds**, send **Swap 25 USDC to USDT** and sign,
then **Let my agent swap up to 60 USDC into USDT, 20 per trade** and grant it.
**Swap 10 USDC to USDT** then settles with no popup. Every status line links its
transaction on the Studio explorer.

## Checks

```bash
npm run test:settlement   # the app against the deployed contracts: IC methods it calls,
                          # no direct settlement path, no retired contract, live executor probes
npm run test:regression   # every bug that reached a user
npm run test:swarm        # the /a2a agents against live pools and the executor
npm run test:studio       # the Studio Next desk: intents, amounts, the contract's methods and pools
node scripts/studio-next-e2e.mjs --live               # both Studio Next rails through the desk's and the swarm's own code
node scripts/swarm-e2e.mjs                           # the /a2a swarm end to end (opens rounds)
node scripts/rails-e2e.mjs --user 0x... --rail both  # both rails end to end (opens rounds, settles)
```

## Getting started

1. Create `.env.local` from the two templates: `.env.example` (app-wide
   settings) and `.env.local.example` (the keys the settlement routes need).
2. Install dependencies and run the development server:
   ```bash
   npm install
   npm run dev
   ```
3. Open `http://localhost:3000`.
