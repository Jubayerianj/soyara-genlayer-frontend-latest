// utils/pool.js

import { getCreate2Address, keccak256, encodePacked } from 'viem';


export function computeV3PoolAddress(factory, tokenA, tokenB, fee, initCodeHash) {
  const [token0, token1] = tokenA.toLowerCase() < tokenB.toLowerCase()
    ? [tokenA, tokenB]
    : [tokenB, tokenA];
  const salt = keccak256(
    encodePacked(['address', 'address', 'uint24'], [token0, token1, BigInt(fee)])
  );
  return getCreate2Address({ from: factory, salt, bytecodeHash: initCodeHash });
}