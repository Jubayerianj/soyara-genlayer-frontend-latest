import { zeroAddress } from 'viem';

/**
 * Safe JSON stringify that converts BigInt to string
 */
function safeStringify(obj) {
  return JSON.stringify(obj, (_, value) =>
    typeof value === 'bigint' ? value.toString() : value
  );
}

/**
 * Builds the bytecode program for AGGFlowRouter.executeRoute
 * Works for:
 * - Native ↔ ERC20 (wrap/unwrap)
 * - ERC20 ↔ ERC20
 * - V2 pools, V3/Algebra pools, Curve pools
 */
export function buildProgram(fromToken, toToken, route, wethAddress) {
  if (!route?.poolAddress) {
    console.error('Invalid route - no poolAddress. Route object:', safeStringify(route));
    throw new Error('Invalid route: poolAddress is required');
  }

  const isNativeIn = !!fromToken?.isNative;
  const isNativeOut = !!toToken?.isNative;

  // Actual ERC20 tokens used in the swap (after wrapping)
  const tokenInSwap = isNativeIn ? wethAddress : fromToken.address;
  const tokenOutSwap = isNativeOut ? wethAddress : toToken.address;

  const bytes = [];

  // ---------- Step 1: Input opcode ----------
  if (isNativeIn) {
    bytes.push(0x03);
    bytes.push(0x01);          // number of legs = 1
    bytes.push(0xff, 0xff);    // share = 100%
    bytes.push(0x02);          // PT_WRAP
    bytes.push(0x01);          // wrap flag (1 = wrap)
  } else {
    bytes.push(0x02);
    bytes.push(...hexToBytes(fromToken.address));
    bytes.push(0x01);
    bytes.push(0xff, 0xff);
    addSwap(bytes, route, tokenInSwap, tokenOutSwap);
  }

  // ---------- Step 2: Swap (only if we wrapped) ----------
  if (isNativeIn) {
    bytes.push(0x01);
    bytes.push(...hexToBytes(wethAddress));
    bytes.push(0x01);
    bytes.push(0xff, 0xff);
    addSwap(bytes, route, tokenInSwap, tokenOutSwap);
  }

  // ---------- Step 3: Unwrap (if native output) ----------
  if (isNativeOut) {
    bytes.push(0x01);
    bytes.push(...hexToBytes(wethAddress));
    bytes.push(0x01);
    bytes.push(0xff, 0xff);
    bytes.push(0x02);
    bytes.push(0x00);
  }

  const programHex = '0x' + bytes.map(b => b.toString(16).padStart(2, '0')).join('');
  console.log('✅ PROGRAM BUILT (length:', bytes.length, 'bytes)');
  console.log('hex:', programHex);
  console.log('NativeIn:', isNativeIn, 'NativeOut:', isNativeOut, 'PoolType:', route.poolType);
  return programHex;
}

// ------------------------------------------------------------------
// Helper: append swap opcode and its parameters based on pool type
// ------------------------------------------------------------------
function addSwap(bytes, route, tokenIn, tokenOut) {
  const isV2 = route.poolType === 'v2' || (route.dexName || '').toLowerCase().includes('v2');
  const isCurve = route.poolType === 'curve';
  const zeroForOne = tokenIn.toLowerCase() < tokenOut.toLowerCase();

  if (isV2) {
    bytes.push(0x00);                       // PT_UNIV2
    bytes.push(...hexToBytes(route.poolAddress));
    bytes.push(zeroForOne ? 0 : 1);
    const fee = Number(route.fee || 3000);
    bytes.push((fee >> 16) & 0xff, (fee >> 8) & 0xff, fee & 0xff);
  } else if (isCurve) {
    addCurveSwap(bytes, route);
  } else {
    // PT_UNIV3 (also used for Algebra V4, Velodrome Slipstream)
    bytes.push(0x01);
    bytes.push(...hexToBytes(route.poolAddress));
    bytes.push(zeroForOne ? 1 : 0);
  }
}

// ------------------------------------------------------------------
// Curve-specific swap encoding (PT_CURVE = 5)
// ------------------------------------------------------------------
function addCurveSwap(bytes, route) {
  bytes.push(0x05);
  bytes.push(...hexToBytes(route.poolAddress));
  const poolType = route.curvePoolType ?? 0;
  bytes.push(poolType);
  const fromIdx = route.curveIndices.from;
  bytes.push(fromIdx);
  const toIdx = route.curveIndices.to;
  bytes.push(toIdx);
}

// ------------------------------------------------------------------
// Helper: convert hex address to byte array (now robust)
// ------------------------------------------------------------------
function hexToBytes(hex) {
  // If hex is an object with an address property (e.g., Token instance)
  if (typeof hex === 'object' && hex !== null) {
    if (typeof hex.address === 'string') {
      hex = hex.address;
    } else if (hex.liquidityToken && typeof hex.liquidityToken.address === 'string') {
      hex = hex.liquidityToken.address;
    } else {
      throw new Error(`hexToBytes received object without string address: ${safeStringify(hex)}`);
    }
  }
  if (typeof hex !== 'string') {
    throw new Error(`hexToBytes expected string, got ${typeof hex}: ${hex}`);
  }
  hex = hex.replace('0x', '').toLowerCase();
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.slice(i, i + 2), 16));
  }
  return bytes;
}

/**
 * Build a chained AGGFlow program for a multi-hop route.
 *
 * The format already supports this: opcode 0x02 consumes a token pulled from
 * the USER, and 0x01 consumes a token the ROUTER is already holding. So a hop
 * chain is simply "0x02 tokenIn → swap", then one "0x01 intermediate → swap"
 * per additional leg - the same mechanism the wrap/unwrap path has always used.
 *
 * @param fromToken {address,isNative}
 * @param toToken   {address,isNative}
 * @param hops      [{pool, poolType, fee, tokenIn, tokenOut}] in execution order
 */
export function buildMultiHopProgram(fromToken, toToken, hops, wethAddress) {
  if (!Array.isArray(hops) || hops.length === 0) {
    throw new Error('buildMultiHopProgram: at least one hop is required');
  }
  // A single hop is the ordinary case - reuse the proven builder rather than
  // maintaining two encoders.
  if (hops.length === 1) {
    const h = hops[0];
    return buildProgram(fromToken, toToken, {
      poolAddress: h.pool, poolType: h.poolType, fee: h.fee, dexName: h.poolType,
    }, wethAddress);
  }

  const isNativeIn = !!fromToken?.isNative;
  const isNativeOut = !!toToken?.isNative;
  const bytes = [];

  const leg = (opcode, token, hop) => {
    bytes.push(opcode);
    bytes.push(...hexToBytes(token));
    bytes.push(0x01);        // one leg
    bytes.push(0xff, 0xff);  // 100% of the balance
    addSwap(bytes, { poolAddress: hop.pool, poolType: hop.poolType, fee: hop.fee }, hop.tokenIn, hop.tokenOut);
  };

  if (isNativeIn) {
    // Wrap first, then the router holds WETH/WGEN for hop 1.
    bytes.push(0x03, 0x01, 0xff, 0xff, 0x02, 0x01);
    leg(0x01, wethAddress, hops[0]);
  } else {
    leg(0x02, fromToken.address, hops[0]);
  }

  // Every later hop consumes what the router now holds.
  for (let i = 1; i < hops.length; i += 1) {
    leg(0x01, hops[i].tokenIn, hops[i]);
  }

  if (isNativeOut) {
    bytes.push(0x01);
    bytes.push(...hexToBytes(wethAddress));
    bytes.push(0x01, 0xff, 0xff, 0x02, 0x00);
  }

  const programHex = '0x' + bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  console.log(`✅ MULTI-HOP PROGRAM (${hops.length} hops, ${bytes.length} bytes)`);
  console.log('   path:', hops.map((h) => `${h.tokenIn.slice(0, 8)}→${h.tokenOut.slice(0, 8)} (${h.poolType})`).join('  →  '));
  return programHex;
}
