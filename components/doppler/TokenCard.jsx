import { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { ExternalLink, Copy, Check, Zap, Flame, ShieldCheck } from 'lucide-react';
import styles from './TokenCard.module.css';

const shortAddr = (addr) => (addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '-');

export function extractTokenLogo(token) {
  if (!token) return null;
  if (token.logoURI) return token.logoURI;
  if (token.imageUrl) return token.imageUrl;
  if (token.tokenURI) {
    const uri = token.tokenURI;
    if (uri.startsWith('data:application/json;base64,')) {
      try {
        const jsonStr = atob(uri.replace('data:application/json;base64,', ''));
        const parsed = JSON.parse(jsonStr);
        if (parsed.image) return parsed.image;
      } catch {}
    }
    if (uri.startsWith('http') || uri.startsWith('/')) return uri;
    if (uri.startsWith('ipfs://')) return `https://ipfs.io/ipfs/${uri.replace('ipfs://', '')}`;
  }
  return null;
}

export default function TokenCard({ token, onMigrate }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [imgError, setImgError] = useState(false);

  const graduated = token.isGraduated || false;
  const progress = token.bondingCurveProgress ?? (graduated ? 100 : 0);
  const logoSrc = !imgError ? extractTokenLogo(token) : null;

  const handleCopy = (e) => {
    e.stopPropagation();
    if (!token.address) return;
    navigator.clipboard.writeText(token.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={`${styles.card} ${graduated ? styles.graduated : ''}`}
      onClick={() => router.push(`/trade/${token.address}`)}
      style={{ cursor: 'pointer' }}
    >
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.avatar}>
          {logoSrc ? (
            <img
              src={logoSrc}
              alt={token.symbol}
              className={styles.tokenLogoImg}
              onError={() => setImgError(true)}
            />
          ) : (
            <span className={styles.avatarFallback} style={{ background: token.color || '#2563eb' }}>
              {token.symbol?.[0] ?? '?'}
            </span>
          )}
        </div>
        <div className={styles.identity}>
          <div className={styles.nameRow}>
            <span className={styles.name}>{token.name || '-'}</span>
            <span className={styles.symbol}>${token.symbol || '-'}</span>
          </div>
          <div className={styles.addrRow}>
            <span className={styles.address}>{shortAddr(token.address)}</span>
            <button className={styles.iconBtn} onClick={handleCopy} title="Copy Address">
              {copied ? <Check size={11} className={styles.copiedIcon} /> : <Copy size={11} />}
            </button>
            <a
              href={`https://liteforge.explorer.caldera.xyz/address/${token.address}`}
              target="_blank"
              rel="noreferrer"
              className={styles.iconBtn}
              title="View on Explorer"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink size={11} />
            </a>
          </div>
        </div>
        {token.isLiveToken ? (
          <span className={`${styles.badge} ${styles.badgeLive}`}>Live Token</span>
        ) : graduated ? (
          <span className={`${styles.badge} ${styles.badgeGraduated}`}>Graduated ✓</span>
        ) : (
          <span className={`${styles.badge} ${styles.badgeActive}`}>
            <span className={styles.dot} /> Live V3
          </span>
        )}
      </div>

      {/* Bonding Curve Progress or Live Token Banner */}
      {token.isLiveToken ? (
        <div className={styles.liveTokenBanner}>
          <Zap size={13} className={styles.liveZapIcon} />
          <span>Active DEX</span>
        </div>
      ) : (
        <div className={styles.progressWrap}>
          <div className={styles.progressHeader}>
            <span className={styles.progressLabel}>Bonding Curve</span>
            <span className={styles.progressVal}>{progress}%</span>
          </div>
          <div className={styles.barBg}>
            <div
              className={`${styles.barFill} ${graduated ? styles.graduatedFill : ''}`}
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        </div>
      )}

      {/* Info grid */}
      <div className={styles.grid}>
        <div className={styles.stat}>
          <span className={styles.label}>Price (USD)</span>
          <span className={styles.value}>
            {Number(token.priceUSD || 0) < 0.000001
              ? `$${Number(token.priceUSD || 0).toFixed(8)}`
              : Number(token.priceUSD || 0) < 0.01
              ? `$${Number(token.priceUSD || 0).toFixed(6)}`
              : Number(token.priceUSD || 0) < 1
              ? `$${Number(token.priceUSD || 0).toFixed(4)}`
              : `$${Number(token.priceUSD || 0).toFixed(2)}`}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.label}>Market Cap</span>
          <span className={styles.value}>
            {Number(token.marketCapUSD || 0) >= 1000000000
              ? `$${(Number(token.marketCapUSD || 0) / 1000000000).toFixed(2)}B`
              : Number(token.marketCapUSD || 0) >= 1000000
              ? `$${(Number(token.marketCapUSD || 0) / 1000000).toFixed(2)}M`
              : Number(token.marketCapUSD || 0) >= 10000
              ? `$${(Number(token.marketCapUSD || 0) / 1000).toFixed(1)}K`
              : `$${Number(token.marketCapUSD || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className={styles.actionsRow}>
        <Link
          href={`/trade/${token.address}`}
          className={styles.tradeBtn}
          onClick={(e) => e.stopPropagation()}
        >
          <Zap size={13} /> Trade ${token.symbol}
        </Link>
        {!graduated && (
          <button
            className={styles.migrateBtn}
            onClick={(e) => {
              e.stopPropagation();
              onMigrate?.(token.address);
            }}
            title="Graduate & Migrate Liquidity to SoyaraDex V2"
          >
            Graduate
          </button>
        )}
      </div>
    </div>
  );
}
