// pages/api/bridge/status.js
import { ethers } from 'ethers';
import { getBridgeDeployments, getRpcUrl } from '../../../lib/bridge.js';

const ERC721_ABI = [
  'function balanceOf(address) external view returns (uint256)',
  'function ownerOf(uint256) external view returns (address)',
  'function totalMinted() external view returns (uint256)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
];

const BRIDGE_ABI = [
  'function userBridgedCount(address) external view returns (uint256)',
];

async function getOwnersMulticall(nftAddress, totalMinted, provider) {
  const multicallAddress = '0xcA11bde05977b3631167028862bE2a173976CA11';
  
  const multicallContract = new ethers.Contract(multicallAddress, [
    'function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) external view returns (tuple(bool success, bytes returnData)[] returnData)'
  ], provider);

  const nftInterface = new ethers.Interface([
    'function ownerOf(uint256) external view returns (address)'
  ]);

  const calls = [];
  for (let tokenId = 1; tokenId <= totalMinted; tokenId++) {
    calls.push({
      target: nftAddress,
      allowFailure: true,
      callData: nftInterface.encodeFunctionData('ownerOf', [tokenId])
    });
  }

  if (calls.length === 0) return [];

  const returnData = await multicallContract.aggregate3(calls);
  return returnData.map((res) => {
    if (!res.success) return ethers.ZeroAddress;
    try {
      return nftInterface.decodeFunctionResult('ownerOf', res.returnData)[0];
    } catch {
      return ethers.ZeroAddress;
    }
  });
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { address } = req.query;
  if (!address || typeof address !== 'string') {
    return res.status(400).json({ ok: false, error: 'Address is required' });
  }

  try {
    const deployments = getBridgeDeployments();
    const userAddr = ethers.getAddress(address);

    const arbRpc = getRpcUrl(42161);
    const litvmRpc = getRpcUrl(4441);

    const arbProvider = new ethers.JsonRpcProvider(arbRpc);
    const litvmProvider = new ethers.JsonRpcProvider(litvmRpc);

    const arbNftContract = new ethers.Contract(deployments.arbitrum.nftProxy, ERC721_ABI, arbProvider);
    
    let litvmNftContract = null;
    let litvmBridgeContract = null;
    let litvmNftBalance = 0;
    
    if (deployments.litvm && deployments.litvm.nftProxy !== ethers.ZeroAddress) {
      litvmNftContract = new ethers.Contract(deployments.litvm.nftProxy, ERC721_ABI, litvmProvider);
    }
    if (deployments.litvm && deployments.litvm.bridge !== ethers.ZeroAddress) {
      litvmBridgeContract = new ethers.Contract(deployments.litvm.bridge, BRIDGE_ABI, litvmProvider);
    }

    const arbBridgeContract = new ethers.Contract(deployments.arbitrum.bridge, BRIDGE_ABI, arbProvider);

    const [arbBalance, arbTotalMinted] = await Promise.all([
      arbNftContract.balanceOf(userAddr).then(n => Number(n)).catch(() => 0),
      arbNftContract.totalMinted().then(n => Number(n)).catch(() => 0),
    ]);

    if (litvmNftContract) {
      litvmNftBalance = await litvmNftContract.balanceOf(userAddr).then(n => Number(n)).catch(() => 0);
    }

    const [arbBridgedCount, litvmBridgedCount] = await Promise.all([
      arbBridgeContract.userBridgedCount(userAddr).then(n => Number(n)).catch(() => 0),
      litvmBridgeContract ? litvmBridgeContract.userBridgedCount(userAddr).then(n => Number(n)).catch(() => 0) : 0,
    ]);

    const arbOwnedTokens = [];
    const arbLockedInBridge = [];
    const litvmOwnedTokens = [];

    if (arbTotalMinted > 0) {
      try {
        const owners = await getOwnersMulticall(deployments.arbitrum.nftProxy, arbTotalMinted, arbProvider);
        for (let i = 0; i < owners.length; i++) {
          const tokenId = i + 1;
          const owner = owners[i].toLowerCase();
          if (owner === userAddr.toLowerCase()) {
            arbOwnedTokens.push(tokenId);
          } else if (owner === deployments.arbitrum.bridge.toLowerCase()) {
            arbLockedInBridge.push(tokenId);
          }
        }
      } catch (err) {
        console.error('Arbitrum multicall failed, falling back to loop:', err);
        const arbPromises = [];
        for (let tokenId = 1; tokenId <= arbTotalMinted; tokenId++) {
          arbPromises.push(
            arbNftContract.ownerOf(tokenId)
              .then((owner) => {
                const normalizedOwner = owner.toLowerCase();
                if (normalizedOwner === userAddr.toLowerCase()) {
                  arbOwnedTokens.push(tokenId);
                } else if (normalizedOwner === deployments.arbitrum.bridge.toLowerCase()) {
                  arbLockedInBridge.push(tokenId);
                }
              })
              .catch(() => {})
          );
        }
        await Promise.all(arbPromises);
      }
    }

    if (litvmNftContract && arbTotalMinted > 0) {
      try {
        const owners = await getOwnersMulticall(deployments.litvm.nftProxy, arbTotalMinted, litvmProvider);
        for (let i = 0; i < owners.length; i++) {
          const tokenId = i + 1;
          const owner = owners[i].toLowerCase();
          if (owner === userAddr.toLowerCase()) {
            litvmOwnedTokens.push(tokenId);
          }
        }
      } catch (err) {
        console.error('LitVM multicall failed, falling back to loop:', err);
        const litvmPromises = [];
        for (let tokenId = 1; tokenId <= arbTotalMinted; tokenId++) {
          litvmPromises.push(
            litvmNftContract.ownerOf(tokenId)
              .then((owner) => {
                if (owner.toLowerCase() === userAddr.toLowerCase()) {
                  litvmOwnedTokens.push(tokenId);
                }
              })
              .catch(() => {})
          );
        }
        await Promise.all(litvmPromises);
      }
    }

    // 3. Scan staked tokens inside wrapper contract
    const wrapperAddress = "0xF664B56933f3cF0d7d69982b5A8eC9101b80059D";
    const wrapperContract = new ethers.Contract(wrapperAddress, [
      'function tokenStakers(uint256) external view returns (address)'
    ], litvmProvider);

    const litvmStakedTokens = [];
    const stakerPromises = arbLockedInBridge.map(async (tokenId) => {
      try {
        const staker = await wrapperContract.tokenStakers(tokenId);
        if (staker.toLowerCase() === userAddr.toLowerCase()) {
          litvmStakedTokens.push(tokenId);
        }
      } catch (err) {
        // ignore
      }
    });
    await Promise.all(stakerPromises);

    res.status(200).json({
      ok: true,
      deployments,
      balances: {
        arbitrum: arbBalance,
        litvm: litvmNftBalance
      },
      counts: {
        arbitrumBridged: arbBridgedCount,
        litvmBridged: litvmBridgedCount
      },
      tokens: {
        arbitrumOwned: arbOwnedTokens.sort((a,b)=>a-b),
        arbitrumLockedInBridge: arbLockedInBridge.sort((a,b)=>a-b),
        litvmOwned: litvmOwnedTokens.sort((a,b)=>a-b),
        litvmStaked: litvmStakedTokens.sort((a,b)=>a-b)
      }
    });

  } catch (error) {
    console.error('Bridge status API error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
}
