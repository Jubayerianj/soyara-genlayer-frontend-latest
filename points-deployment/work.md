# How it Works: AGGFlow Points Wrapper & NFT Staking

This guide explains the end-to-end flow of the **Upgradeable Points & NFT Staking system** deployed on the LitVM Network. It covers contract interactions, points rules, and integration instructions for the frontend.

---

## 1. Core Mechanics Summary

The system is designed to reward users with **Lit Diamonds (FSWP)** for swapping tokens and staking their bridged **Athes Super Contributor NFTs**.

| Action | Reward Rate | Requirement |
| :--- | :--- | :--- |
| **Standard Swap** | `1 Lit Diamond` per swap | Swap through the wrapper proxy address. |
| **Boosted Swap** | `20 Lit Diamonds` per swap | Swap through the wrapper proxy while having **at least 1 NFT staked**. |
| **NFT Staking** | `200 Lit Diamonds` per day (per NFT) | Stake bridged Athes Super Contributor NFT (accrues per second). |

---

## 2. Deployed Contracts (LitVM Chain ID: 4441)

All frontend interactions should target these deployed addresses:

* **AGGFlowPointsWrapperProxy** (Proxy Address): `0xF664B56933f3cF0d7d69982b5A8eC9101b80059D`
  * *This is the main contract address users interact with for swapping, staking, and claiming.*
* **AGGFlowPointsWrapper** (Implementation Logic): `0xF6BFe92BF381a761570f3581D7f5F83920beB89E`
* **FlipSwapPointsToken** (FSWP ERC20 Token): `0x0Bd54a8fDB753Fb86Cf906f1Dc2AB7ECBD2FDD5C`
  * *The ERC20 token minted to users upon claiming their points.*
* **Athes Super Contributor NFT** (LitVM Proxy Address): `0xFAF7266C09450F22098cA304bcAC70Dfdc75992C`

---

## 3. How the End-to-End User Flow Works

[ Arbitrum NFT ] 
       │  (1. Bridge NFT to LitVM)
       ▼
[ LitVM NFT ] ──► (2. Stake NFT in Wrapper Proxy) ──► [ Unlocks 20x Multiplier & 200 Diamonds/Day ]
       │
       ▼  (3. Swap via Wrapper Proxy)
[ Accumulate Points On-Chain ] ──► (4. Claim Points) ──► [ Receive FSWP ERC20 Tokens ]
```

### Step 1: Bridging the NFT (Arbitrum ──► LitVM)
1. The user owns an **Athes Super Contributor NFT** on Arbitrum.
2. They call `bridgeNFT(tokenId, 4441)` on the Arbitrum Bridge contract, which locks their Arbitrum NFT.
3. The relayer generates a claim signature.
4. The user calls `claimNFT(...)` on the LitVM Bridge contract, which mints the bridged NFT to their wallet on LitVM (`0xFAF7266...`).

### Step 2: Staking the NFT
1. The user approves the wrapper proxy contract (`0xF664B56...`) to manage their NFT.
2. The user calls `stakeNFT(tokenId)` on the wrapper proxy.
3. The wrapper proxy pulls the NFT into its custody.
4. The wrapper updates the user's staked count and resets their last claim timestamp.

### Step 3: Swapping & Earning
1. When swapping tokens, the user executes the transaction via the wrapper proxy's `executeSwap(...)` instead of the original aggregator entrypoint directly.
2. The wrapper proxy:
   * Pulls the input tokens from the user.
   * Approves the aggregator entrypoint and forwards the swap.
   * Directs the output tokens straight to the user.
   * Checks the user's staked balance. If they have staked NFTs, they get **20 Lit Diamonds** instead of **1**.
   * Records the points in the `unclaimedPoints` mapping.
3. In addition to swap points, the user's staked NFTs generate **200 Lit Diamonds per day** passively.

### Step 4: Claiming Points
1. The user can call `claimPoints()` on the wrapper proxy whenever they want.
2. The wrapper calculates and adds any pending daily staking rewards since the last claim.
3. It resets the user's `unclaimedPoints` to `0`, increases `claimedPoints`, and mints the equivalent amount of FSWP ERC20 tokens directly to the user's wallet.

---

## 4. Why This Works Without an Indexer (Instant Records)

Traditional reward dashboards require an indexer (like a Subgraph or MongoDB backend) to watch event logs and count user swaps off-chain. This setup is entirely **indexer-free** because:

1. **On-Chain Mappings**: Pending points are written directly to the contract storage (`unclaimedPoints[user]`).
2. **Lazy Harvesting Math**: Passive daily staking rewards are computed on-the-fly when users interact with the contract (stake, unstake, or claim), avoiding heavy gas-consuming loops.
3. **Instant Queries**: The frontend queries a user's up-to-the-second points by performing a read-only RPC call (`eth_call`) to `getUnclaimedPoints(userAddress)`. This is instant and incurs no database delay.

---

## 5. Web3 Integration Code Examples

### A. Approve and Stake NFT
Before staking, the user must approve the Wrapper Proxy to transfer their NFT:
```javascript
const nftContract = new ethers.Contract(nftAddress, erc721Abi, signer);
const approveTx = await nftContract.approve(wrapperProxyAddress, tokenId);
await approveTx.wait();

const wrapperContract = new ethers.Contract(wrapperProxyAddress, wrapperAbi, signer);
const stakeTx = await wrapperContract.stakeNFT(tokenId);
await stakeTx.wait();
```

### B. Approve and Execute Swap
To swap ERC20 tokens through the wrapper (so that the swap is recorded for points):
```javascript
// 1. Approve Wrapper Proxy to spend the input token
const tokenInContract = new ethers.Contract(tokenInAddress, erc20Abi, signer);
const approveTokenTx = await tokenInContract.approve(wrapperProxyAddress, amountUserSells);
await approveTokenTx.wait();

// 2. Execute Swap via Wrapper Proxy
const executeSwapTx = await wrapperContract.executeSwap(
  {
    tokenUserBuys: tokenOutAddress,
    minAmountUserBuys: minAmountUserBuys,
    tokenUserSells: tokenInAddress,
    amountUserSells: amountUserSells
  },
  feeCollection, // Fee structures
  programBytes,  // Router program paths
  { value: isNativeIn ? amountUserSells : 0 }
);
await executeSwapTx.wait();
```

### C. Query Unclaimed Points (Read-Only)
Query the real-time accumulated points (active swap rewards + accrued passive staking rewards):
```javascript
const unclaimedRaw = await wrapperContract.getUnclaimedPoints(userAddress);
const unclaimedDiamonds = ethers.formatEther(unclaimedRaw);
console.log(`Unclaimed Lit Diamonds: ${unclaimedDiamonds}`);
```

### D. Claim Points
Mint the accumulated points to the wallet as FSWP ERC20 tokens:
```javascript
const claimTx = await wrapperContract.claimPoints();
await claimTx.wait();
console.log("Lit Diamonds claimed successfully!");
```
