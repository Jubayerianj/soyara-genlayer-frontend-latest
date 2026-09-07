// hooks/useDoppler.js
// Central hook for all Doppler Protocol interactions on LitVM
// Streamlined single-transaction fair launch with accurate gas estimation and post-launch trading.

import { useState, useCallback } from 'react';
import { useAccount, useChainId, usePublicClient, useWalletClient } from 'wagmi';
import {
  parseUnits,
  encodeAbiParameters,
  parseAbiParameters,
  keccak256,
  stringToBytes,
  zeroAddress,
} from 'viem';
import { getDopplerAddresses, isDopplerDeployed } from '../constants/doppler/addresses';
import AIRLOCK_ABI from '../constants/doppler/abis/Airlock';
import LOCKABLE_UNISWAP_V3_INITIALIZER_ABI from '../constants/doppler/abis/LockableUniswapV3Initializer';

// ─── Encoding Helpers ─────────────────────────────────────────────────────────

/**
 * Encode DopplerERC20V1Factory creation data
 */
export const encodeDopplerERC20Data = (name, symbol, tokenURI = '') => {
  return encodeAbiParameters(
    parseAbiParameters([
      'string name',
      'string symbol',
      '(uint64 cliff, uint64 duration)[] schedules',
      'address[] beneficiaries',
      'uint256[] scheduleIds',
      'uint256[] amounts',
      'string tokenURI',
      'uint256 maxBalanceLimit',
      'uint48 balanceLimitEnd',
      'address controller',
      'address[] excludedFromBalanceLimit',
    ]),
    [
      name,
      symbol,
      [],
      [],
      [],
      [],
      tokenURI || '',
      0n,
      0,
      zeroAddress,
      [],
    ]
  );
};

/**
 * Encode LockableUniswapV3Initializer data as a single InitData tuple
 */
export const encodeLockableV3InitData = (
  fee = 3000,
  tickLower = 167520,
  tickUpper = 200040,
  numPositions = 10,
  maxShareToBeSold = parseUnits('0.23', 18),
  beneficiaries = []
) => {
  return encodeAbiParameters(
    parseAbiParameters([
      '(uint24 fee, int24 tickLower, int24 tickUpper, uint16 numPositions, uint256 maxShareToBeSold, (address beneficiary, uint96 shares)[] beneficiaries) initData',
    ]),
    [
      {
        fee,
        tickLower,
        tickUpper,
        numPositions,
        maxShareToBeSold,
        beneficiaries,
      },
    ]
  );
};

/**
 * Encode UniswapV2MigratorSplit data
 */
export const encodeUniswapV2MigratorData = (recipient = zeroAddress, share = 0n) => {
  return encodeAbiParameters(
    parseAbiParameters(['address recipient', 'uint256 share']),
    [recipient, share]
  );
};

/**
 * Generate a salt that ensures tokenAddress > numeraire for V3 single-sided deposit
 */
export const findLaunchSalt = (userAddress = zeroAddress) => {
  const seed = `${Date.now()}-${Math.random()}`;
  for (let i = 0; i < 256; i++) {
    const salt = keccak256(stringToBytes(`${userAddress}-${seed}-${i}`));
    return salt;
  }
  return keccak256(stringToBytes(`${userAddress}-${seed}`));
};

// ─── Main Hook ───────────────────────────────────────────────────────────────

export function useDoppler() {
  const { address: account } = useAccount();
  const chainId = useChainId() || 4441;
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [isLoading, setIsLoading] = useState(false);
  const [txHash, setTxHash] = useState(null);
  const [error, setError] = useState(null);
  const [createdTokenAddress, setCreatedTokenAddress] = useState(null);

  const addresses = getDopplerAddresses(chainId);
  const deployed = isDopplerDeployed(chainId);

  // ── Launch Token (Single-Transaction Fair Launch) ───────────────────────────

  const launchToken = useCallback(async ({
    name,
    symbol,
    initialSupply = '1000000000', // 1 billion default
    startTick = 167520,
    endTick = 200040,
    numPositions = 10,
    fee = 3000,
    tokenURI = '',
    useNoOpMigrator = false, // true = keep in V3; false = migrate to V2 after graduation
  }) => {
    if (!deployed) throw new Error('Doppler not deployed on this chain');
    if (!walletClient || !account) throw new Error('Wallet not connected');

    setIsLoading(true);
    setError(null);
    setTxHash(null);
    setCreatedTokenAddress(null);

    try {
      const supplyWei = parseUnits(initialSupply, 18);
      const salt = findLaunchSalt(account);

      // Align ticks to fee spacing (3000 -> 60, 500 -> 10, 10000 -> 200)
      const tickSpacing = fee === 500 ? 10 : fee === 3000 ? 60 : 200;
      const alignedLower = Math.floor(startTick / tickSpacing) * tickSpacing;
      const alignedUpper = Math.floor(endTick / tickSpacing) * tickSpacing;

      const tokenFactoryData = encodeDopplerERC20Data(name, symbol, tokenURI);
      const poolInitializerData = encodeLockableV3InitData(
        fee,
        alignedLower,
        alignedUpper,
        numPositions,
        parseUnits('0.23', 18),
        []
      );
      const governanceFactoryData = '0x';
      const liquidityMigratorData = useNoOpMigrator
        ? '0x'
        : encodeUniswapV2MigratorData(zeroAddress, 0n);

      const migrator = useNoOpMigrator
        ? addresses.noOpMigrator
        : addresses.uniswapV2MigratorSplit;

      const createParams = {
        initialSupply: supplyWei,
        numTokensToSell: supplyWei,
        numeraire: addresses.weth,
        tokenFactory: addresses.dopplerERC20V1Factory,
        tokenFactoryData,
        governanceFactory: addresses.noOpGovernanceFactory,
        governanceFactoryData,
        poolInitializer: addresses.lockableUniswapV3Initializer,
        poolInitializerData,
        liquidityMigrator: migrator,
        liquidityMigratorData,
        integrator: account, // Deployer receives creator/integrator fees directly!
        salt,
      };

      // Query latest block baseFee on LitVM
      let maxFeePerGas;
      let maxPriorityFeePerGas;
      let gas;
      try {
        const block = await publicClient.getBlock({ blockTag: 'latest' });
        const baseFee = block?.baseFeePerGas ?? 5000000000n;
        maxFeePerGas = (baseFee * 180n) / 100n + 1000000000n;
        maxPriorityFeePerGas = 1000000000n;

        const estimatedGas = await publicClient.estimateContractGas({
          address: addresses.airlock,
          abi: AIRLOCK_ABI,
          functionName: 'create',
          args: [createParams],
          account,
        }).catch(() => 15000000n);
        gas = (estimatedGas * 130n) / 100n;
      } catch (feeErr) {
        console.warn('Fee estimation fallback:', feeErr);
        maxFeePerGas = 12000000000n; // 12 gwei fallback
        maxPriorityFeePerGas = 1500000000n;
        gas = 16000000n;
      }

      // Submit Create transaction
      const hash = await walletClient.writeContract({
        address: addresses.airlock,
        abi: AIRLOCK_ABI,
        functionName: 'create',
        args: [createParams],
        account,
        maxFeePerGas,
        maxPriorityFeePerGas,
        gas,
      });

      setTxHash(hash);

      // Wait for confirmation to extract created token address
      try {
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt?.logs) {
          for (const log of receipt.logs) {
            if (log.topics && log.topics[0] === '0x68ff1cfcdcf76864161555fc0de1878d8f83ec6949bf351df74d8a4a1a2679ab') {
              // Airlock.Create log
              const assetHex = log.data.slice(0, 66);
              const deployedAddr = '0x' + assetHex.slice(26);
              setCreatedTokenAddress(deployedAddr);
              break;
            }
          }
        }
      } catch (receiptErr) {
        console.warn('Could not parse receipt immediately:', receiptErr);
      }

      return hash;
    } catch (err) {
      console.error('Doppler launch error:', err);
      const msg = err.shortMessage || err.message || 'Launch failed';
      setError(msg);
      throw new Error(msg);
    } finally {
      setIsLoading(false);
    }
  }, [deployed, walletClient, account, addresses, publicClient]);

  // ── Migrate (Graduate) a token ──────────────────────────────────────────────

  const migrateToken = useCallback(async (assetAddress) => {
    if (!deployed) throw new Error('Doppler not deployed on this chain');
    if (!walletClient || !account) throw new Error('Wallet not connected');

    setIsLoading(true);
    setError(null);
    setTxHash(null);

    try {
      let maxFeePerGas;
      let maxPriorityFeePerGas;
      try {
        const block = await publicClient.getBlock({ blockTag: 'latest' });
        const baseFee = block?.baseFeePerGas ?? 5000000000n;
        maxFeePerGas = (baseFee * 180n) / 100n + 1000000000n;
        maxPriorityFeePerGas = 1000000000n;
      } catch {
        maxFeePerGas = 12000000000n;
        maxPriorityFeePerGas = 1500000000n;
      }

      const hash = await walletClient.writeContract({
        address: addresses.airlock,
        abi: AIRLOCK_ABI,
        functionName: 'migrate',
        args: [assetAddress],
        account,
        maxFeePerGas,
        maxPriorityFeePerGas,
      });

      setTxHash(hash);
      return hash;
    } catch (err) {
      console.error('Doppler migrate error:', err);
      const msg = err.shortMessage || err.message || 'Migration failed';
      setError(msg);
      throw new Error(msg);
    } finally {
      setIsLoading(false);
    }
  }, [deployed, walletClient, account, addresses, publicClient]);

  return {
    launchToken,
    migrateToken,
    isLoading,
    txHash,
    createdTokenAddress,
    error,
    deployed,
    addresses,
  };
}

export default useDoppler;
