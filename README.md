# Soyara DEX: frontend and agent settlement routes

Next.js app for the Soyara DEX on GenLayer Bradbury: the swap aggregator, the
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

## Checks

```bash
npm run test:settlement   # the app against the deployed contracts: IC methods it calls,
                          # no direct settlement path, no retired contract, live executor probes
npm run test:regression   # every bug that reached a user
npm run test:swarm        # the /a2a agents against live pools and the executor
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
