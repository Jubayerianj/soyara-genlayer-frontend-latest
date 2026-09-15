// constants/studioNext.js
//
// Soyara on GenLayer Studio Next (Consensus v0.6, chain 61997).
//
// Studio Next has no EVM layer, so the Bradbury design (AgentValidator decides,
// the Solidity AgentExecutor settles) cannot run there. One Intelligent
// Contract, SoyaraAgentDex, judges and settles instead: it holds the test
// balances and pools, and validators check every consensus trade and every
// mandate against the live Bradbury V2 pool for the same tokens.
//
// Source, deploy record and tests: soyara-genlayer-contracts/studio-next.

export const STUDIO_NEXT = {
  chainId: 61997,
  name: 'GenLayer Studio Next',
  // The canonical RPC. studio-next.genlayer.com is a browser alias of the same
  // deployment, and the docs ask SDKs and wallets to use this one.
  rpc: 'https://studio-dev.genlayer.com/api',
  explorer: 'https://explorer-studio-dev.genlayer.com',
  dex: process.env.NEXT_PUBLIC_STUDIO_NEXT_DEX || '0x3b6Cf2C48297afCf50Bc3e843a9F335B8407f8D6',
  tokens: ['USDC', 'USDT', 'ETH', 'WGEN'],
  pairs: ['USDC/USDT', 'ETH/USDC', 'ETH/USDT', 'WGEN/USDC'],
  defaultSlippageBps: 100,
  maxSlippageBps: 300,
  defaultMandateMinutes: 60,
  maxMandateMinutes: 24 * 60,
};

// Allocations measured against the deployed contract by
// studio-next/profile.mjs, with extra time units on the methods that read the
// market or ask an LLM. Transaction Kit uses them only on chain 61997; prices
// and caps are always read live.
export const STUDIO_NEXT_FEE_PROFILE = {
  version: 1,
  chainId: 61997,
  network: 'studio-next',
  measuredAt: '2026-09-15T10:31:00.060Z',
  methods: {
    claim_test_tokens: { leaderTimeunitsAllocation: '100', validatorTimeunitsAllocation: '200', executionBudgetPerRound: '230191200000000', totalMessageFees: '0', rotationsPerRound: '3' },
    anchor_pool: { leaderTimeunitsAllocation: '200', validatorTimeunitsAllocation: '400', executionBudgetPerRound: '231103800000000', totalMessageFees: '0', rotationsPerRound: '3' },
    swap: { leaderTimeunitsAllocation: '200', validatorTimeunitsAllocation: '400', executionBudgetPerRound: '231120000000000', totalMessageFees: '0', rotationsPerRound: '3' },
    issue_mandate: { leaderTimeunitsAllocation: '200', validatorTimeunitsAllocation: '400', executionBudgetPerRound: '231802200000000', totalMessageFees: '0', rotationsPerRound: '3' },
    swap_under_mandate: { leaderTimeunitsAllocation: '100', validatorTimeunitsAllocation: '200', executionBudgetPerRound: '230199750000000', totalMessageFees: '0', rotationsPerRound: '3' },
    revoke_mandate: { leaderTimeunitsAllocation: '100', validatorTimeunitsAllocation: '200', executionBudgetPerRound: '230180850000000', totalMessageFees: '0', rotationsPerRound: '3' },
  },
};
