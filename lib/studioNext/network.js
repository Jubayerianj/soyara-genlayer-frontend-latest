// lib/studioNext/network.js
//
// The Bradbury / Studio Next choice, shared by every page that has both.
//
// /ai kept its own copy of this first; the swarm page needs the same choice, and
// two copies would disagree the first time one of them changed. One key, so a
// user who picked Studio Next on /ai lands on it in the swarm too, and
// ?net=studio-next still links straight to it.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAccount, useSwitchChain } from 'wagmi';
import { STUDIO_NEXT } from '../../constants/studioNext.js';

export const NETWORK_KEY = 'soyara.network';
const LEGACY_KEY = 'soyara.ai.network';
const BRADBURY_CHAIN_ID = 4221;

function savedChoice() {
  try {
    return window.localStorage.getItem(NETWORK_KEY) || window.localStorage.getItem(LEGACY_KEY);
  } catch {
    return null;
  }
}

export function useNetworkChoice() {
  const router = useRouter();
  const { chainId: walletChainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const [network, setNetwork] = useState('bradbury');

  useEffect(() => {
    if (!router.isReady) return;
    const fromUrl = router.query.net === 'studio-next' ? 'studio-next' : router.query.net === 'bradbury' ? 'bradbury' : null;
    setNetwork(fromUrl || (savedChoice() === 'studio-next' ? 'studio-next' : 'bradbury'));
  }, [router.isReady, router.query.net]);

  const choose = (next) => {
    setNetwork(next);
    try { window.localStorage.setItem(NETWORK_KEY, next); } catch { /* storage blocked */ }
    router.replace({ pathname: router.pathname, query: { ...router.query, net: next } }, undefined, { shallow: true });
    // Leaving Studio Next: put the wallet back where the Bradbury page reads.
    if (next === 'bradbury' && walletChainId === STUDIO_NEXT.chainId) switchChain?.({ chainId: BRADBURY_CHAIN_ID });
  };

  return { network, onStudio: network === 'studio-next', choose };
}
