import React from 'react';

const POPULAR_MAP = {
  ltc: { ticker: 'ltc', name: 'Litecoin', image: 'https://assets.coingecko.com/coins/images/2/small/litecoin.png', icon: '⚡' },
  btc: { ticker: 'btc', name: 'Bitcoin', image: 'https://assets.coingecko.com/coins/images/1/small/bitcoin.png', icon: '₿' },
  eth: { ticker: 'eth', name: 'Ethereum', image: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png', icon: 'Ξ' },
  usdt: { ticker: 'usdt', name: 'Tether', image: 'https://assets.coingecko.com/coins/images/325/small/Tether.png', icon: '💵' },
  usdc: { ticker: 'usdc', name: 'USD Coin', image: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png', icon: '💲' },
  sol: { ticker: 'sol', name: 'Solana', image: 'https://assets.coingecko.com/coins/images/4128/small/solana.png', icon: '◎' },
  xmr: { ticker: 'xmr', name: 'Monero', image: 'https://assets.coingecko.com/coins/images/69/small/monero_logo.png', icon: '🔒' },
  doge: { ticker: 'doge', name: 'Dogecoin', image: 'https://assets.coingecko.com/coins/images/5/small/dogecoin.png', icon: '🐕' },
  trx: { ticker: 'trx', name: 'TRON', image: 'https://assets.coingecko.com/coins/images/1094/small/tron-logo.png', icon: '🔺' },
  bnb: { ticker: 'bnb', name: 'BNB', image: 'https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png', icon: '🔶' },
  xrp: { ticker: 'xrp', name: 'XRP', image: 'https://assets.coingecko.com/coins/images/44/small/xrp-symbol-white-128.png', icon: '💧' },
  ada: { ticker: 'ada', name: 'Cardano', image: 'https://assets.coingecko.com/coins/images/975/small/cardano.png', icon: '🔵' },
};

export function TokenIcon({ currency, size = 24 }) {
  const ticker = (typeof currency === 'string' ? currency : currency?.ticker || '').toLowerCase();
  const matched = POPULAR_MAP[ticker];
  const imgSrc = matched?.image || currency?.image;

  if (imgSrc) {
    return (
      <img 
        src={imgSrc} 
        alt={ticker} 
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} 
        onError={(e) => { e.target.style.display = 'none'; }}
      />
    );
  }

  return (
    <span style={{ fontSize: size * 0.75, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      {matched?.icon || '🪙'}
    </span>
  );
}

export function WalletIcon({ wallet, size = 24 }) {
  if (wallet?.image) {
    return (
      <img 
        src={wallet.image} 
        alt={wallet?.name || 'wallet'} 
        style={{ width: size, height: size, borderRadius: size / 4, objectFit: 'contain' }}
        onError={(e) => { e.target.style.display = 'none'; }}
      />
    );
  }
  return <span style={{ fontSize: size * 0.75 }}>{wallet?.icon || '👛'}</span>;
}
