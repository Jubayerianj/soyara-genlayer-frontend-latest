// /hooks/common/useWeb3.js
import { useState, useEffect } from 'react';
import { useAccount, useChainId, useSwitchChain, useDisconnect } from 'wagmi';
import { LitVM } from '../../wagmi.config';
import { ADDRESSES } from '../../constants/addresses';

// Helper function to get contract addresses (simplified)
export const getContractAddresses = (chainId) => {
  if (chainId === 4441) {
    return ADDRESSES;
  }
  return ADDRESSES; // Default to LitVM addresses
};

export const useWeb3 = () => {
  const { address, isConnected, connector } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { disconnect } = useDisconnect();

  const [isConnecting, setIsConnecting] = useState(false);
  const [isSwitchingNetwork, setIsSwitchingNetwork] = useState(false);
  const [error, setError] = useState('');

  const isCorrectNetwork = chainId === LitVM.id;

  const formatAddress = (addr) => {
    if (!addr) return '';
    return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
  };

  const switchToLitVM = async () => {
    if (!switchChainAsync) {
      setError('Cannot switch network - please switch manually in your wallet');
      return;
    }

    setIsSwitchingNetwork(true);
    setError('');

    try {
      await switchChainAsync({ chainId: LitVM.id });
    } catch (err) {
      console.error('Error switching network:', err);
      setError(err.message || 'Failed to switch network');
    } finally {
      setIsSwitchingNetwork(false);
    }
  };

  const connectWallet = async () => {
    setIsConnecting(true);
    setError('');

    try {
      // RainbowKit handles the connection
      console.log('Connecting wallet...');
    } catch (err) {
      console.error('Error connecting wallet:', err);
      setError(err.message || 'Failed to connect wallet');
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnectWallet = () => {
    disconnect();
  };

  const getExplorerUrl = (type = 'address', value = address) => {
    if (!value) return '#';
    const baseUrl = `https://explorer.LitVM.network`;
    
    switch (type) {
      case 'address':
        return `${baseUrl}/address/${value}`;
      case 'tx':
        return `${baseUrl}/tx/${value}`;
      case 'token':
        return `${baseUrl}/token/${value}`;
      case 'block':
        return `${baseUrl}/block/${value}`;
      default:
        return baseUrl;
    }
  };

  const getContractAddress = (contractType) => {
    const addresses = getContractAddresses(chainId);
    return addresses[contractType] || '';
  };

  const getNetworkName = () => {
    if (!chainId) return 'Disconnected';
    
    switch (chainId) {
      case 1:
        return 'Ethereum Mainnet';
      case 11155111:
        return 'Sepolia Testnet';
      case 4441:
        return 'LitVM Network';
      case 5:
        return 'Goerli Testnet';
      case 137:
        return 'Polygon Mainnet';
      case 80001:
        return 'Mumbai Testnet';
      case 42161:
        return 'Arbitrum One';
      case 10:
        return 'Optimism';
      case 56:
        return 'BNB Smart Chain';
      default:
        return `Chain ${chainId}`;
    }
  };

  const isOnLitVM = () => {
    return chainId === LitVM.id;
  };

  const addLitVMToWallet = async () => {
    if (!window.ethereum) {
      setError('Wallet not detected');
      return false;
    }

    try {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: '0x538', // 4441 in hex
          chainname: 'Ethereum',
          nativeCurrency: {
            name: 'ETH',
            symbol: 'ETH',
            decimals: 18
          },
          rpcUrls: ['https://liteforge.rpc.caldera.xyz/infra-partner-http'],
          blockExplorerUrls: ['https://liteforge.explorer.caldera.xyz/']
        }]
      });
      return true;
    } catch (err) {
      console.error('Failed to add LitVM to wallet:', err);
      setError(err.message || 'Failed to add network to wallet');
      return false;
    }
  };

  useEffect(() => {
    if (isConnected && isCorrectNetwork) {
      setError('');
    }
  }, [isConnected, isCorrectNetwork]);

  // Show warning if not on LitVM but connected
  useEffect(() => {
    if (isConnected && !isCorrectNetwork) {
      console.warn(`Connected to ${getNetworkName()} but need LitVM (4441)`);
    }
  }, [isConnected, isCorrectNetwork]);

  return {
    // Account
    address,
    formattedAddress: formatAddress(address),
    isConnected,
    connector,
    
    // Network
    chainId,
    isCorrectNetwork,
    isOnLitVM,
    networkName: getNetworkName(),
    
    // Status
    isConnecting,
    isSwitchingNetwork,
    error,
    
    // Actions
    connectWallet,
    disconnectWallet,
    switchToLitVM,
    addLitVMToWallet,
    
    // Utilities
    getExplorerUrl,
    getContractAddress,
    
    // Setters
    setError,
  };
};

// Helper hook specifically for LitVM
export const useLitVMWeb3 = () => {
  const web3 = useWeb3();
  
  return {
    ...web3,
    // LitVM specific properties
    isReady: web3.isConnected && web3.isOnLitVM(),
    LitVMInfo: {
      chainId: 4441,
      name: 'Ethereum',
      symbol: 'ETH',
      decimals: 18,
      rpcUrl: 'https://liteforge.rpc.caldera.xyz/infra-partner-http',
      explorer: 'https://explorer.LitVM.network',
      testnet: true,
    },
    // Ensure we're on LitVM for operations
    ensureLitVM: async () => {
      if (web3.isOnLitVM()) return true;
      
      if (web3.isConnected) {
        await web3.switchToLitVM();
        return web3.isOnLitVM();
      }
      return false;
    }
  };
};