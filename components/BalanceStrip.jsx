// components/BalanceStrip.jsx
//
// Wallet balances for the two tokens in a trade, shown on /ai and /a2a.
//
// Two jobs. Before executing it answers "can I actually afford this, and what am
// I holding?" - previously only discoverable by opening a wallet. After settling
// it shows before → after with the delta, which is the only direct confirmation
// that a trade moved real funds: settlement runs from the agent wallet, so there
// is no wallet popup and no obvious moment where anything visibly happened.

import React, { useEffect, useState, useCallback } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { formatUnits, zeroAddress } from 'viem';
import { ArrowRight, Wallet } from 'lucide-react';

const ERC20_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
];

/** Trim to a readable number of places without rounding a tiny amount to zero. */
function fmt(raw, decimals = 18) {
  if (raw === null || raw === undefined) return '-';
  const n = Number(formatUnits(raw, decimals));
  if (!Number.isFinite(n)) return '-';
  if (n === 0) return '0';
  const places = n >= 1000 ? 2 : n >= 1 ? 4 : 8;
  return n.toFixed(places).replace(/\.?0+$/, '');
}

/**
 * @param tokens   [{symbol, address, isNative, decimals}] - usually tokenIn/tokenOut
 * @param snapshot balances captured before execution, keyed by symbol (bigint)
 * @param refreshKey change it to force a re-read (e.g. after a settlement)
 */
export default function BalanceStrip({ tokens = [], snapshot = null, refreshKey = 0, isDark = true, onLoaded }) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const [balances, setBalances] = useState({});

  const read = useCallback(async () => {
    if (!address || !publicClient || tokens.length === 0) return;
    const next = {};
    await Promise.all(
      tokens.filter(Boolean).map(async (t) => {
        try {
          const isNative = t.isNative || t.symbol === 'GEN' || !t.address || t.address === zeroAddress;
          next[t.symbol] = isNative
            ? await publicClient.getBalance({ address })
            : await publicClient.readContract({ address: t.address, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] });
        } catch {
          // A single unreadable token must not blank the whole strip.
        }
      })
    );
    setBalances(next);
    if (onLoaded) onLoaded(next);
  }, [address, publicClient, tokens, onLoaded]);

  useEffect(() => { read(); }, [read, refreshKey]);

  if (!address || tokens.length === 0) return null;

  const border = isDark ? 'rgba(255,255,255,0.10)' : '#e2e8f0';
  const muted = isDark ? 'rgba(255,255,255,0.55)' : '#64748b';

  return (
    <div style={{ border: `1px solid ${border}`, borderRadius: 10, padding: '0.6rem 0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <Wallet size={12} color={muted} />
        <span style={{ fontSize: '0.7rem', color: muted, fontWeight: 600, letterSpacing: '0.03em' }}>
          {snapshot ? 'YOUR BALANCE - BEFORE / AFTER' : 'YOUR BALANCE'}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {tokens.filter(Boolean).map((t) => {
          const now = balances[t.symbol];
          const before = snapshot ? snapshot[t.symbol] : undefined;
          const decimals = t.decimals || 18;
          const hasDelta = before !== undefined && now !== undefined && before !== now;
          const up = hasDelta && now > before;
          const delta = hasDelta ? (up ? now - before : before - now) : null;

          return (
            <div key={t.symbol} style={{ display: 'flex', alignItems: 'baseline', gap: 7, fontSize: '0.78rem' }}>
              <span style={{ color: muted, minWidth: 52 }}>{t.symbol}</span>
              {before !== undefined ? (
                <>
                  <span style={{ color: muted, fontVariantNumeric: 'tabular-nums' }}>{fmt(before, decimals)}</span>
                  <ArrowRight size={11} style={{ opacity: 0.4 }} />
                  <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(now, decimals)}</strong>
                  {hasDelta && (
                    <span style={{ color: up ? '#34d399' : '#f87171', fontSize: '0.72rem', fontWeight: 600 }}>
                      {up ? '+' : '−'}{fmt(delta, decimals)}
                    </span>
                  )}
                </>
              ) : (
                <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(now, decimals)}</strong>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
