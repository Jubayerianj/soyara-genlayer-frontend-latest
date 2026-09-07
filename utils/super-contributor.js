// utils/super-contributor.js
import { Contract, JsonRpcProvider, formatEther } from "ethers";
import { arbitrum } from "wagmi/chains";

export const ARBITRUM_CHAIN = arbitrum;
export const ARBITRUM_CHAIN_ID = arbitrum.id;

export const ARBITRUM_RPC_URL = process.env.NEXT_PUBLIC_ARBITRUM_RPC_URL || "https://arb1.arbitrum.io/rpc";
export const ARBITRUM_EXPLORER_URL = process.env.NEXT_PUBLIC_ARBITRUM_EXPLORER_URL || "https://arbiscan.io";

export const ASC_NFT_ADDRESS = "0xA2eC9aAf2235C66491767e69eBBD885469697B3E";

export const SUPER_CONTRIBUTOR_ABI = [
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "quantity",
        "type": "uint256"
      }
    ],
    "name": "claimBatch",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "claim",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "claimPrice",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "maxSupply",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalMinted",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "owner",
        "type": "address"
      }
    ],
    "name": "balanceOf",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "owner",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "newPrice",
        "type": "uint256"
      }
    ],
    "name": "setClaimPrice",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "newBaseURI",
        "type": "string"
      }
    ],
    "name": "setBaseURI",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "newMaxSupply",
        "type": "uint256"
      }
    ],
    "name": "setMaxSupply",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "withdraw",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "transfersEnabled",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "paymentReceiver",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "royaltyFeeNumerator",
    "outputs": [
      {
        "internalType": "uint96",
        "name": "",
        "type": "uint96"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bool",
        "name": "enabled",
        "type": "bool"
      }
    ],
    "name": "setTransfersEnabled",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "newReceiver",
        "type": "address"
      }
    ],
    "name": "setPaymentReceiver",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint96",
        "name": "newNumerator",
        "type": "uint96"
      }
    ],
    "name": "setRoyaltyFeeNumerator",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

export async function readAscSnapshot(address, rpcUrl) {
  if (!address || address === "0x0000000000000000000000000000000000000000") return null;

  try {
    const provider = new JsonRpcProvider(rpcUrl);
    const contract = new Contract(address, SUPER_CONTRIBUTOR_ABI, provider);

    const [totalMinted, maxSupply, claimPrice] = await Promise.all([
      contract.totalMinted(),
      contract.maxSupply(),
      contract.claimPrice(),
    ]);

    return {
      totalMinted: Number(totalMinted),
      maxSupply: Number(maxSupply),
      claimPriceEth: formatEther(claimPrice),
    };
  } catch (error) {
    console.error("Failed to read AscSnapshot:", error);
    return null;
  }
}

export function shortAddress(value) {
  if (!value) return "Not connected";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function formatExplorerUrl(baseUrl, txHash) {
  return `${baseUrl.replace(/\/$/, "")}/tx/${txHash}`;
}
