// utils/bridge-utils.js
import { Contract, JsonRpcProvider, BrowserProvider, getAddress } from 'ethers';

export const BRIDGE_ABI = [
  {
    "inputs": [
      { "internalType": "uint256", "name": "tokenId", "type": "uint256" },
      { "internalType": "uint256", "name": "targetChainId", "type": "uint256" }
    ],
    "name": "bridgeNFT",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "bridgeFee",
    "outputs": [
      { "internalType": "uint256", "name": "", "type": "uint256" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "user", "type": "address" },
      { "internalType": "uint256", "name": "tokenId", "type": "uint256" },
      { "internalType": "uint256", "name": "sourceChainId", "type": "uint256" },
      { "internalType": "uint256", "name": "nonce", "type": "uint256" },
      { "internalType": "bytes", "name": "signature", "type": "bytes" }
    ],
    "name": "claimNFT",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "bytes32", "name": "", "type": "bytes32" }
    ],
    "name": "processedClaims",
    "outputs": [
      { "internalType": "bool", "name": "", "type": "bool" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "", "type": "address" }
    ],
    "name": "userBridgedCount",
    "outputs": [
      { "internalType": "uint256", "name": "", "type": "uint256" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "user", "type": "address" },
      { "indexed": true, "internalType": "uint256", "name": "tokenId", "type": "uint256" },
      { "indexed": true, "internalType": "uint256", "name": "nonce", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "fromChainId", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "toChainId", "type": "uint256" }
    ],
    "name": "NFTBridged",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "user", "type": "address" },
      { "indexed": true, "internalType": "uint256", "name": "tokenId", "type": "uint256" },
      { "indexed": true, "internalType": "uint256", "name": "nonce", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "fromChainId", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "toChainId", "type": "uint256" }
    ],
    "name": "NFTClaimed",
    "type": "event"
  }
];

export const NFT_ABI = [
  'function approve(address to, uint256 tokenId) external',
  'function getApproved(uint256 tokenId) external view returns (address)',
  'function isApprovedForAll(address owner, address operator) external view returns (bool)',
  'function setApprovalForAll(address operator, bool approved) external',
  'function ownerOf(uint256 tokenId) external view returns (address)',
  'function balanceOf(address owner) external view returns (uint256)',
  'function transfersEnabled() external view returns (bool)',
  'function bridgeAddress() external view returns (address)',
];

export function getBridgeConfig() {
  return {
    litvm: {
      nftProxy: getAddress("0xFAF7266C09450F22098cA304bcAC70Dfdc75992C".toLowerCase()),
      bridge: getAddress("0x38047685192D41e0f1d98DE6598A852d24368CEC".toLowerCase()) // Correct LitVM bridge from bridge-deployed.json
    },
    arbitrum: {
      nftProxy: getAddress("0xA2eC9aAf2235C66491767e69eBBD885469697B3E".toLowerCase()),
      bridge: getAddress("0xbC30b0F3b3D8E06ea7fB3D55622C6d96e67BecFD".toLowerCase())
    }
  };
}
