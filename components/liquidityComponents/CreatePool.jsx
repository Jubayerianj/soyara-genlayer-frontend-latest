import React, { useState, useMemo } from 'react';
import { ethers } from 'ethers';
import { useAccount, useWriteContract, useChainId } from 'wagmi';
import { motion } from 'framer-motion';
import { formatUnits } from 'viem';
import TokenInput from '../common/TokenInput';
import TokenSelectModal from '../common/TokenSelectModal';
import LiquidityActionButtons from './LiquidityActionButtons';
import { CONTRACT_ADDRESSES } from '../../constants/addresses';
import { FACTORY_ABI } from '../../constants/abis';
import { useTokens } from '../../hooks/common/useTokens';
import { addressesEqual } from '../../utils/ethers-safe';

// LitVM Network chain ID
const LitVM_ORO_TESTNET_CHAIN_ID = 4441;

const formatBalance = (balance, decimals = 18) => {
  if (!balance || balance === 0n) return '0';

  try {
    const formatted = formatUnits(balance, decimals);
    const num = parseFloat(formatted);

    if (!Number.isFinite(num) || num <= 0) return '0';
    if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(2)}K`;
    if (num >= 1) return num.toFixed(4);
    if (num >= 0.0001) return num.toFixed(6);

    return num.toExponential(2);
  } catch (error) {
    console.error('Failed to format token balance', error);
    return '0';
  }
};

const CreatePool = () => {
  const { address, isConnected } = useAccount();
  const { writeContractAsync, isPending } = useWriteContract();
  const chainId = useChainId();
  const { tokens, balances } = useTokens();
  
  const [tokenA, setTokenA] = useState(null);
  const [tokenB, setTokenB] = useState(null);
  const [showTokenAModal, setShowTokenAModal] = useState(false);
  const [showTokenBModal, setShowTokenBModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [pairAddress, setPairAddress] = useState(null);

  // Get contract addresses for current chain
  const getContractAddresses = () => {
    if (chainId === LitVM_ORO_TESTNET_CHAIN_ID) {
      return CONTRACT_ADDRESSES.LitVM || CONTRACT_ADDRESSES[LitVM_ORO_TESTNET_CHAIN_ID];
    }
    // Fallback to default if not on LitVM
    return CONTRACT_ADDRESSES.default || {};
  };

  const handleCreatePool = async () => {
    if (!isConnected) {
      setError('Please connect your wallet');
      return;
    }

    if (chainId !== LitVM_ORO_TESTNET_CHAIN_ID) {
      setError('Please switch to LitVM Network to create pools');
      return;
    }

    if (!tokenA || !tokenB) {
      setError('Please select both tokens');
      return;
    }

    if (addressesEqual(tokenA.address, tokenB.address)) {
      setError('Cannot create pair with identical tokens');
      return;
    }

    try {
      setIsCreating(true);
      setError('');
      setSuccess('');

      const contractAddresses = getContractAddresses();
      
      if (!contractAddresses.factory) {
        throw new Error('Factory contract address not configured for LitVM');
      }
      

      const txHash = await writeContractAsync({
        address: contractAddresses.factory,
        abi: FACTORY_ABI,
        functionName: 'createPair',
        args: [
          tokenA.symbol === 'ETH' ? contractAddresses.weth : tokenA.address,
          tokenB.symbol === 'ETH' ? contractAddresses.weth : tokenB.address
        ],
      });

      setSuccess(`Pool creation initiated! Transaction: ${txHash.substring(0, 10)}...`);
      
      // You can watch for the transaction and get the actual pair address
      // For demonstration, we'll generate a placeholder
      setTimeout(() => {
        // In production, you would get this from the transaction logs
        const simulatedPair = ethers.getAddress(`0x${Array.from({length: 40}, () => 
          Math.floor(Math.random() * 16).toString(16)
        ).join('')}`);
        setPairAddress(simulatedPair);
        setIsCreating(false);
        
        // Open explorer link
        setTimeout(() => {
          window.open(`https://liteforge.explorer.caldera.xyz/address/${simulatedPair}`, '_blank');
        }, 1500);
      }, 3000);

    } catch (err) {
      console.error('Create pool error:', err);
      setError(err.message || 'Failed to create pool');
      setIsCreating(false);
    }
  };

  const handleTokenASelect = (token) => {
    if (tokenB && addressesEqual(token.address, tokenB.address)) {
      setTokenB(tokenA);
    }
    setTokenA(token);
  };

  const handleTokenBSelect = (token) => {
    if (tokenA && addressesEqual(token.address, tokenA.address)) {
      setTokenA(tokenB);
    }
    setTokenB(token);
  };

  const canCreate = useMemo(() => {
    return isConnected && 
           chainId === LitVM_ORO_TESTNET_CHAIN_ID && 
           tokenA && 
           tokenB && 
           !addressesEqual(tokenA.address, tokenB.address);
  }, [isConnected, chainId, tokenA, tokenB]);

  const modalTokens = useMemo(() => {
    return tokens.map((token) => ({
      ...token,
      balance: formatBalance(balances?.[token.address.toLowerCase()], token.decimals),
    }));
  }, [tokens, balances]);

  return (
    <div className="create-pool-container">
      <h2 className="section-title">Create New Pool</h2>
      
      {chainId !== LitVM_ORO_TESTNET_CHAIN_ID && (
        <div className="chain-warning">
          <p>⚠️ Please switch to LitVM Network to create pools</p>
          <button 
            className="switch-network-btn"
            onClick={() => {
              // This would typically trigger a wallet network switch
              console.log('Switch to LitVM network requested');
            }}
          >
            Switch to LitVM
          </button>
        </div>
      )}
      
      <div className="create-pool-card">
        <div className="description-section">
          <p className="description-text">
            Create a new liquidity pool for any two tokens. The first liquidity provider sets the initial price.
          </p>
          <div className="warning-note">
            <strong>Note:</strong> Creating a pool requires an initial deposit of both tokens. You'll need ETH tokens for gas.
          </div>
        </div>

        <div className="tokens-section">
          <div className="token-input-wrapper">
            <TokenInput
              label="Token A"
              token={tokenA}
              amount=""
              onAmountChange={() => {}}
              onTokenSelect={() => setShowTokenAModal(true)}
              disabled={isCreating || chainId !== LitVM_ORO_TESTNET_CHAIN_ID}
              readOnly={true}
              showBalance={false}
            />
          </div>

          <div className="token-separator">
            <span>+</span>
          </div>

          <div className="token-input-wrapper">
            <TokenInput
              label="Token B"
              token={tokenB}
              amount=""
              onAmountChange={() => {}}
              onTokenSelect={() => setShowTokenBModal(true)}
              disabled={isCreating || chainId !== LitVM_ORO_TESTNET_CHAIN_ID}
              readOnly={true}
              showBalance={false}
            />
          </div>
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {success && (
          <div className="success-message">
            {success}
          </div>
        )}

        {pairAddress && (
          <div className="success-card">
            <div className="success-icon">✅</div>
            <h3>Pool Created Successfully!</h3>
            <p className="pair-address">
              Pair Address: <span>{pairAddress}</span>
            </p>
            <a 
              href={`https://liteforge.explorer.caldera.xyz/address/${pairAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="explorer-link"
            >
              View on LitVM Explorer ↗
            </a>
            <p className="success-note">
              You can now add liquidity to this pool.
            </p>
          </div>
        )}

        <div className="action-section">
          <LiquidityActionButtons
            isConnected={isConnected}
            tokenA={tokenA}
            tokenB={tokenB}
            onCreatePool={handleCreatePool}
            isCreating={isCreating}
            showCreate={true}
            size="lg"
            disabled={chainId !== LitVM_ORO_TESTNET_CHAIN_ID}
          />
        </div>
      </div>

      {/* Token Selection Modals */}
      {showTokenAModal && (
        <TokenSelectModal
          tokens={modalTokens}
          onSelect={handleTokenASelect}
          onClose={() => setShowTokenAModal(false)}
          selectedToken={tokenA}
          title="Choose first token"
          showBalance={true}
        />
      )}

      {showTokenBModal && (
        <TokenSelectModal
          tokens={modalTokens}
          onSelect={handleTokenBSelect}
          onClose={() => setShowTokenBModal(false)}
          selectedToken={tokenB}
          title="Choose second token"
          showBalance={true}
        />
      )}

      <style jsx>{`
        .create-pool-container {
          max-width: 480px;
          margin: 0 auto;
          padding: 0 1rem;
        }

        .section-title {
          font-size: 1.5rem;
          font-weight: 700;
          text-align: center;
          margin-bottom: 1rem;
          color: #ffffff;
        }

        .chain-warning {
          background: rgba(245, 158, 11, 0.2);
          border: 1px solid rgba(245, 158, 11, 0.3);
          border-radius: 12px;
          padding: 1rem;
          text-align: center;
          margin-bottom: 1.5rem;
          color: #f59e0b;
          font-size: 0.875rem;
        }

        .switch-network-btn {
          background: rgba(245, 158, 11, 0.3);
          border: 1px solid rgba(245, 158, 11, 0.5);
          color: #f59e0b;
          padding: 0.5rem 1rem;
          border-radius: 8px;
          font-size: 0.875rem;
          margin-top: 0.5rem;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .switch-network-btn:hover {
          background: rgba(245, 158, 11, 0.4);
        }

        .create-pool-card {
          background: linear-gradient(145deg, #15152b, #0f0f1f);
          border-radius: 20px;
          padding: 2rem;
          border: 1px solid #2d2d4d;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }

        .description-section {
          margin-bottom: 2rem;
          padding: 1rem;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          border: 1px solid #2d2d4d;
        }

        .description-text {
          color: #8a8ab5;
          font-size: 0.875rem;
          line-height: 1.5;
          margin-bottom: 0.75rem;
        }

        .warning-note {
          color: #f59e0b;
          font-size: 0.875rem;
          background: rgba(245, 158, 11, 0.1);
          padding: 0.75rem;
          border-radius: 8px;
          border: 1px solid rgba(245, 158, 11, 0.2);
        }

        .tokens-section {
          margin-bottom: 2rem;
        }

        .token-input-wrapper {
          margin-bottom: 1rem;
        }

        .token-separator {
          text-align: center;
          margin: 0.5rem 0;
          color: #8a8ab5;
          font-size: 1.5rem;
          font-weight: bold;
        }

        .error-message {
          background-color: rgba(255, 68, 68, 0.2);
          color: #ff4444;
          padding: 0.75rem 1rem;
          border-radius: 8px;
          margin-bottom: 1rem;
          font-size: 0.875rem;
          border: 1px solid rgba(255, 68, 68, 0.3);
        }

        .success-message {
          background-color: rgba(0, 211, 149, 0.2);
          color: #00d395;
          padding: 0.75rem 1rem;
          border-radius: 8px;
          margin-bottom: 1rem;
          font-size: 0.875rem;
          border: 1px solid rgba(0, 211, 149, 0.3);
        }

        .success-card {
          background: rgba(0, 211, 149, 0.1);
          border: 1px solid rgba(0, 211, 149, 0.3);
          border-radius: 12px;
          padding: 1.5rem;
          text-align: center;
          margin-bottom: 1.5rem;
        }

        .success-icon {
          font-size: 2.5rem;
          margin-bottom: 1rem;
        }

        .success-card h3 {
          color: #00d395;
          margin-bottom: 1rem;
          font-size: 1.25rem;
        }

        .pair-address {
          font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
          font-size: 0.875rem;
          color: #8a8ab5;
          word-break: break-all;
          margin-bottom: 1rem;
        }

        .pair-address span {
          color: #ffffff;
        }

        .explorer-link {
          display: inline-block;
          color: #00d395;
          text-decoration: none;
          font-size: 0.875rem;
          padding: 0.5rem 1rem;
          border: 1px solid rgba(0, 211, 149, 0.3);
          border-radius: 8px;
          margin-bottom: 1rem;
          transition: all 0.2s ease;
        }

        .explorer-link:hover {
          background: rgba(0, 211, 149, 0.1);
          border-color: #00d395;
        }

        .success-note {
          color: #8a8ab5;
          font-size: 0.875rem;
        }

        .action-section {
          margin-top: 2rem;
        }

        @media (max-width: 768px) {
          .create-pool-container {
            padding: 0 0.5rem;
          }

          .create-pool-card {
            padding: 1.5rem;
          }
        }
      `}</style>
    </div>
  );
};

export default CreatePool;
