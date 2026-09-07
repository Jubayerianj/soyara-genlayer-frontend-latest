// pages/api/claim-game-pearls.js
import { ethers } from 'ethers';

const LITVM_RPC_URL = process.env.NEXT_PUBLIC_LITVM_RPC_URL || "https://liteforge.rpc.caldera.xyz/infra-partner-http";
const PROXY_ADDRESS = "0xF664B56933f3cF0d7d69982b5A8eC9101b80059D";
const NFT_ADDRESS = "0xFAF7266C09450F22098cA304bcAC70Dfdc75992C";

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { user, amount } = req.body || {};

    if (!user || !amount) {
      return res.status(400).json({ success: false, error: 'Missing user address or amount' });
    }

    const userAddress = ethers.getAddress(user);
    const amountVal = parseFloat(amount);
    
    if (isNaN(amountVal) || amountVal <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid amount' });
    }

    // Connect to blockchain
    const provider = new ethers.JsonRpcProvider(LITVM_RPC_URL);

    // ABIs for validation
    const nftAbi = ["function balanceOf(address owner) external view returns (uint256)"];
    const wrapperAbi = [
      "function userStakedBalance(address owner) external view returns (uint256)",
      "function gameClaimNonces(address owner) external view returns (uint256)"
    ];

    const nftContract = new ethers.Contract(NFT_ADDRESS, nftAbi, provider);
    const wrapperContract = new ethers.Contract(PROXY_ADDRESS, wrapperAbi, provider);

    // 1. Verify eligibility (User must hold ASC NFT unstaked or staked)
    const [unstakedBal, stakedBal] = await Promise.all([
      nftContract.balanceOf(userAddress).catch(() => 0n),
      wrapperContract.userStakedBalance(userAddress).catch(() => 0n)
    ]);

    const totalNfts = Number(unstakedBal) + Number(stakedBal);
    if (totalNfts === 0) {
      return res.status(403).json({
        success: false,
        error: 'P2E claims require holding at least 1 ASC NFT. Demo runs earn no rewards.'
      });
    }

    // Calculate 1.5x multiplier on extra NFTs (1st NFT is base 1x, each additional NFT adds 0.5x)
    const extraNfts = totalNfts - 1;
    const multiplier = 1.0 + (extraNfts * 0.5);
    const finalAmountVal = amountVal * multiplier;
    
    // Convert to Wei (formatted to 6 decimal places to prevent floating point issues)
    const amountWei = ethers.parseEther(finalAmountVal.toFixed(6));

    // 2. Fetch the user's current game claim nonce from the contract
    const nonce = await wrapperContract.gameClaimNonces(userAddress);

    // 3. Create the Solidity packed keccak256 hash
    // Must match: keccak256(abi.encodePacked(address(this), msg.sender, amount, nonce))
    const claimHash = ethers.solidityPackedKeccak256(
      ['address', 'address', 'uint256', 'uint256'],
      [PROXY_ADDRESS, userAddress, amountWei, nonce]
    );

    // 4. Sign the hash with the secure game signer key
    const privateKey = process.env.LITVM_CLAIM_SIGNER_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('LITVM_CLAIM_SIGNER_PRIVATE_KEY is not defined in environment variables.');
    }
    const formattedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
    const signerWallet = new ethers.Wallet(formattedKey);
    const signature = await signerWallet.signMessage(ethers.getBytes(claimHash));

    console.log(`✅ Signed game claim for user ${userAddress}: base ${amountVal}, final ${finalAmountVal} (multiplier ${multiplier}x), nonce ${nonce.toString()}`);

    return res.status(200).json({
      success: true,
      user: userAddress,
      baseAmount: amountVal.toString(),
      amount: finalAmountVal.toString(),
      multiplier: multiplier.toString(),
      amountWei: amountWei.toString(),
      nonce: nonce.toString(),
      signature
    });

  } catch (error) {
    console.error('❌ ERROR in /api/claim-game-pearls:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
