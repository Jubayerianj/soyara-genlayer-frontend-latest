// lib/nativeInput.js
//
// Why an agent trade never starts from native GEN.
//
// AgentExecutor takes a trade's input from the user's wallet with transferFrom,
// which only exists for ERC-20 tokens. For native GEN it forwards the value of
// the settling transaction instead, and on the agent rails that transaction is
// sent by the relayer. So a GEN-in trade would be paid for by the relayer: the
// user would receive the output and keep their GEN. Every relayer path refuses
// such an order, and every surface that proposes trades says why.
//
// The user wraps GEN to WGEN first, in their own wallet (one transaction; the
// agents offer it as "wrap N GEN"), then trades WGEN like any other token.
// Swapping INTO GEN is fine: the user's ERC-20 is pulled, and GEN is paid out.

import { zeroAddress } from 'viem';

/** A token symbol, address or token object that means native GEN. */
export function isNativeGen(token) {
  if (!token) return false;
  if (typeof token === 'object') return Boolean(token.isNative) || isNativeGen(token.address) || isNativeGen(token.symbol);
  const s = String(token).trim();
  return s.toUpperCase() === 'GEN' || s.toLowerCase() === zeroAddress;
}

/** One line: what to do instead. */
export function nativeInputReason(amountIn = null, tokenOut = null) {
  const wrap = amountIn ? `"wrap ${amountIn} GEN"` : 'wrap it to WGEN';
  const then = tokenOut ? `swap WGEN to ${tokenOut}` : 'swap WGEN';
  return `GEN is native, so it can't be taken from your wallet. First ${wrap}, then ${then}.`;
}
