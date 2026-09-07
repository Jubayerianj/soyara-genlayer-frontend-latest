// components/doppler/LaunchForm.jsx
// Form UI for launching a new token via Doppler Airlock on LitVM
// Single-transaction fair launch, photo upload via /api/doppler/upload, and instant 1-click trade routing.

import { useState } from 'react';
import Link from 'next/link';
import { useDoppler } from '../../hooks/useDoppler';
import { Upload, Image as ImageIcon, Globe, Twitter, Send, Rocket, Zap, ExternalLink, Copy, Check, Flame, ShieldCheck } from 'lucide-react';
import styles from './LaunchForm.module.css';

const ZKLTC_USD_PRICE = 44.22;

const TICK_PRESETS = [
  {
    id: 'standard',
    label: 'Standard Fair Launch (Pump Style)',
    badge: 'Recommended',
    tagline: 'Balanced curve with realistic liquidity target',
    startTick: 126780,
    endTick: 159300,
    startMcapUSD: 5340,
    gradMcapUSD: 138000,
    startPriceUSD: 0.00000534,
    gradPriceUSD: 0.000138,
    requiredRaiseZkLTC: 40,
    requiredRaiseUSD: 1768,
  },
  {
    id: 'micro',
    label: 'Micro-Cap Fast Launch',
    badge: 'Ultra Fast',
    tagline: 'Lowest starting market cap, fills and graduates instantly',
    startTick: 167520,
    endTick: 200040,
    startMcapUSD: 90.87,
    gradMcapUSD: 2348,
    startPriceUSD: 0.00000009087,
    gradPriceUSD: 0.000002348,
    requiredRaiseZkLTC: 0.68,
    requiredRaiseUSD: 30,
  },
  {
    id: 'mid',
    label: 'Mid-Cap Community Launch',
    badge: 'Mid Target',
    tagline: 'Higher starting valuation for established communities',
    startTick: 120000,
    endTick: 152520,
    startMcapUSD: 10500,
    gradMcapUSD: 271000,
    startPriceUSD: 0.0000105,
    gradPriceUSD: 0.000271,
    requiredRaiseZkLTC: 78,
    requiredRaiseUSD: 3450,
  },
  {
    id: 'high',
    label: 'High-Cap Major Launch',
    badge: 'High Liquidity',
    tagline: 'For deep-liquidity projects with high capital distribution',
    startTick: 110040,
    endTick: 142560,
    startMcapUSD: 28500,
    gradMcapUSD: 738000,
    startPriceUSD: 0.0000285,
    gradPriceUSD: 0.000738,
    requiredRaiseZkLTC: 210,
    requiredRaiseUSD: 9280,
  },
];

export default function LaunchForm({ onSuccess }) {
  const { launchToken, isLoading, txHash, createdTokenAddress, error, deployed } = useDoppler();

  const [form, setForm] = useState({
    name:           '',
    symbol:         '',
    description:    '',
    imageUrl:       '',
    website:        'https://',
    twitter:        'https://x.com/',
    telegram:       'https://t.me/',
    initialSupply:  '1000000000',
    tickPreset:     0,
    fee:            3000,
    useNoOpMigrator: false,
  });

  const [imagePreview, setImagePreview] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [localError, setLocalError] = useState('');
  const [copied, setCopied] = useState(false);

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleImageFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setLocalError('Image file size must be under 5MB');
      return;
    }

    setIsUploadingImage(true);
    setLocalError('');

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result;
        setImagePreview(base64);
        setForm((f) => ({ ...f, imageUrl: base64 }));

        try {
          const res = await fetch('/api/upload-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileData: base64, fileName: file.name }),
          });
          const json = await res.json();
          if (json?.url) {
            setImagePreview(json.url);
            setForm((f) => ({ ...f, imageUrl: json.url }));
          }
        } catch (uploadErr) {
          console.warn('Server upload warning, using local preview:', uploadErr);
        } finally {
          setIsUploadingImage(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setLocalError('Failed to read image file: ' + err.message);
      setIsUploadingImage(false);
    }
  };

  const handleImageUrlChange = (e) => {
    const url = e.target.value;
    setForm((f) => ({ ...f, imageUrl: url }));
    setImagePreview(url);
  };

  const handleCopyAddr = () => {
    if (!createdTokenAddress) return;
    navigator.clipboard.writeText(createdTokenAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');

    if (!form.name.trim())   return setLocalError('Token name is required');
    if (!form.symbol.trim()) return setLocalError('Token symbol is required');
    if (form.symbol.length > 10) return setLocalError('Symbol must be ≤ 10 characters');

    // Clean social URLs if left as pure prefixes
    const cleanTwitter = form.twitter && form.twitter.trim() !== 'https://x.com/' && form.twitter.trim() !== 'https://x.com' ? form.twitter.trim() : '';
    const cleanTelegram = form.telegram && form.telegram.trim() !== 'https://t.me/' && form.telegram.trim() !== 'https://t.me' ? form.telegram.trim() : '';
    const cleanWebsite = form.website && form.website.trim() !== 'https://' && form.website.trim() !== 'https:///' ? form.website.trim() : '';

    // Build lightweight metadata URI
    let tokenURI = form.imageUrl.trim();
    if (form.description.trim() || cleanTwitter || cleanTelegram || cleanWebsite) {
      const metadataObj = {
        name: form.name.trim(),
        symbol: form.symbol.trim().toUpperCase(),
        description: form.description.trim(),
        image: form.imageUrl.trim() || '',
        website: cleanWebsite,
        twitter: cleanTwitter,
        telegram: cleanTelegram,
      };
      tokenURI = 'data:application/json;base64,' + (typeof window !== 'undefined' ? btoa(JSON.stringify(metadataObj)) : '');
    }

    const preset = TICK_PRESETS[form.tickPreset];
    try {
      const hash = await launchToken({
        name:            form.name.trim(),
        symbol:          form.symbol.trim().toUpperCase(),
        initialSupply:   form.initialSupply,
        startTick:       preset.startTick,
        endTick:         preset.endTick,
        numPositions:    10,
        fee:             Number(form.fee),
        tokenURI,
        useNoOpMigrator: form.useNoOpMigrator === 'true' || form.useNoOpMigrator === true,
      });
      onSuccess?.(hash);
    } catch (err) {
      setLocalError(err.message);
    }
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      {/* Token Identity */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>1. Token Identity & Branding</h3>
        
        {/* Logo preview & Upload */}
        <div className={styles.brandingRow}>
          <div className={styles.avatarPreview}>
            {imagePreview ? (
              <img src={imagePreview} alt="Token Logo" className={styles.previewImg} />
            ) : (
              <span className={styles.avatarFallback}>
                {form.symbol?.[0] || <ImageIcon size={28} />}
              </span>
            )}
            <label className={styles.avatarUploadOverlay} title="Upload logo file">
              <Upload size={16} />
              <input type="file" accept="image/*" onChange={handleImageFile} style={{ display: 'none' }} disabled={isUploadingImage} />
            </label>
          </div>
          
          <div className={styles.imageInputs}>
            <div className={styles.logoLabelRow}>
              <span className={styles.label}>
                Token Logo / Image {isUploadingImage && <span className={styles.uploadingBadge}>(Uploading…)</span>}
              </span>
              <span className={styles.logoFormatHint}>PNG, JPG, SVG, WebP (Max 5MB)</span>
            </div>

            <div className={styles.fileUploadGroup}>
              <input
                type="text"
                className={styles.input}
                placeholder="Paste Image URL (https://... or ipfs://...)"
                value={form.imageUrl}
                onChange={handleImageUrlChange}
              />
              <label className={styles.uploadBtn}>
                <Upload size={14} /> <span>{isUploadingImage ? 'Uploading…' : 'Choose File'}</span>
                <input type="file" accept="image/*" onChange={handleImageFile} style={{ display: 'none' }} disabled={isUploadingImage} />
              </label>
            </div>
          </div>
        </div>

        <div className={styles.row}>
          <label className={styles.field}>
            <span className={styles.label}>Token Name</span>
            <input
              className={styles.input}
              placeholder="e.g. LitVM Pepe"
              value={form.name}
              onChange={update('name')}
              maxLength={40}
              required
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Token Symbol ($)</span>
            <input
              className={styles.input}
              placeholder="e.g. LPEPE"
              value={form.symbol}
              onChange={update('symbol')}
              maxLength={10}
              required
            />
          </label>
        </div>

        <label className={styles.field}>
          <span className={styles.label}>Description</span>
          <textarea
            className={`${styles.input} ${styles.textarea}`}
            placeholder="Tell the story behind your meme token..."
            value={form.description}
            onChange={update('description')}
            rows={3}
          />
        </label>

        {/* Socials */}
        <div className={styles.socialsGrid}>
          <label className={styles.field}>
            <span className={styles.label}><Twitter size={12} /> Twitter / X</span>
            <input
              className={styles.input}
              placeholder="e.g. https://x.com/yourmeme"
              value={form.twitter}
              onChange={update('twitter')}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}><Send size={12} /> Telegram</span>
            <input
              className={styles.input}
              placeholder="e.g. https://t.me/yourmeme"
              value={form.telegram}
              onChange={update('telegram')}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}><Globe size={12} /> Website</span>
            <input
              className={styles.input}
              placeholder="e.g. https://yourmeme.xyz"
              value={form.website}
              onChange={update('website')}
            />
          </label>
        </div>

        <label className={styles.field}>
          <span className={styles.label}>Initial Total Supply</span>
          <input
            className={styles.input}
            type="number"
            min="1"
            value={form.initialSupply}
            onChange={update('initialSupply')}
          />
          <span className={styles.hint}>Total tokens minted at fair launch (Default: 1,000,000,000 with 18 decimals)</span>
        </label>
      </section>

      {/* Bonding Curve Pricing & Market Cap Targets */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>2. Bonding Curve & Target Market Cap</h3>
        <p className={styles.sectionDesc}>
          Select your target starting market cap and graduation threshold on the SoyaraDex V3 bonding curve.
        </p>

        <div className={styles.presetsGrid}>
          {TICK_PRESETS.map((p, i) => {
            const isSelected = Number(form.tickPreset) === i;
            return (
              <div
                key={p.id}
                className={`${styles.presetCard} ${isSelected ? styles.presetCardActive : ''}`}
                onClick={() => setForm((f) => ({ ...f, tickPreset: i }))}
              >
                <div className={styles.presetCardHeader}>
                  <strong className={styles.presetCardTitle}>{p.label}</strong>
                  {p.badge && <span className={styles.presetBadge}>{p.badge}</span>}
                </div>
                <p className={styles.presetTagline}>{p.tagline}</p>
                <div className={styles.presetMetrics}>
                  <div className={styles.presetMetricItem}>
                    <span className={styles.presetMetricLabel}>Start MCAP:</span>
                    <strong className={styles.presetMetricVal}>
                      ${p.startMcapUSD >= 1000 ? `${(p.startMcapUSD / 1000).toFixed(1)}K` : p.startMcapUSD.toFixed(0)}
                    </strong>
                  </div>
                  <div className={styles.presetMetricItem}>
                    <span className={styles.presetMetricLabel}>Graduation MCAP:</span>
                    <strong className={styles.presetMetricValGrad}>
                      ${p.gradMcapUSD >= 1000 ? `${(p.gradMcapUSD / 1000).toFixed(0)}K` : p.gradMcapUSD.toFixed(0)}
                    </strong>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Selected Curve Live Preview Box */}
        {(() => {
          const selected = TICK_PRESETS[form.tickPreset] || TICK_PRESETS[0];
          return (
            <div className={styles.curvePreviewBox}>
              <div className={styles.curvePreviewHeader}>
                <Flame size={16} className={styles.curveFlameIcon} />
                <strong>Selected Valuation & Curve Parameters</strong>
              </div>

              <div className={styles.curveStatsGrid}>
                <div className={styles.curveStatCard}>
                  <span className={styles.curveStatLabel}>🚀 Starting Market Cap</span>
                  <strong className={styles.curveStatVal}>${selected.startMcapUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                  <span className={styles.curveStatSub}>{(selected.startMcapUSD / ZKLTC_USD_PRICE).toFixed(2)} zkLTC</span>
                </div>

                <div className={styles.curveStatCard}>
                  <span className={styles.curveStatLabel}>🎓 Graduation Market Cap</span>
                  <strong className={styles.curveStatValGrad}>${selected.gradMcapUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                  <span className={styles.curveStatSub}>{(selected.gradMcapUSD / ZKLTC_USD_PRICE).toFixed(1)} zkLTC</span>
                </div>

                <div className={styles.curveStatCard}>
                  <span className={styles.curveStatLabel}>💰 Total zkLTC to Graduate</span>
                  <strong className={styles.curveStatVal}>~{selected.requiredRaiseZkLTC} zkLTC</strong>
                  <span className={styles.curveStatSub}>~${selected.requiredRaiseUSD.toLocaleString()} USD</span>
                </div>

                <div className={styles.curveStatCard}>
                  <span className={styles.curveStatLabel}>🏷️ Starting Token Price</span>
                  <strong className={styles.curveStatVal}>
                    {selected.startPriceUSD < 0.000001
                      ? `$${selected.startPriceUSD.toFixed(8)}`
                      : `$${selected.startPriceUSD.toFixed(6)}`}
                  </strong>
                  <span className={styles.curveStatSub}>Initial buy rate</span>
                </div>
              </div>
            </div>
          );
        })()}
      </section>

      {/* Graduation Strategy (V2 vs V3) */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>3. Graduation & Migration Strategy</h3>
        <div className={styles.radioGroup}>
          <label className={styles.radio}>
            <input
              type="radio"
              name="migrator"
              value="false"
              checked={form.useNoOpMigrator !== true && form.useNoOpMigrator !== 'true'}
              onChange={() => setForm((f) => ({ ...f, useNoOpMigrator: false }))}
            />
            <div>
              <strong>🎓 Migrate to SoyaraDex V2 (Standard & Recommended)</strong>
              <p>
                When the bonding curve hits 100%, accumulated liquidity is automatically extracted from V3 and seeded into a SoyaraDex V2 pair with LP locked permanently on LitvmSwap.
              </p>
            </div>
          </label>
          <label className={styles.radio}>
            <input
              type="radio"
              name="migrator"
              value="true"
              checked={form.useNoOpMigrator === true || form.useNoOpMigrator === 'true'}
              onChange={() => setForm((f) => ({ ...f, useNoOpMigrator: true }))}
            />
            <div>
              <strong>🔒 Keep in SoyaraDex V3 (No V2 Migration)</strong>
              <p>
                Liquidity remains permanently locked inside the SoyaraDex V3 concentrated position after graduation.
              </p>
            </div>
          </label>
        </div>
      </section>

      {/* Errors */}
      {(localError || error) && (
        <div className={styles.error}>⚠ {localError || error}</div>
      )}

      {/* Success Banner with Instant Trade / Buy Button */}
      {txHash && (
        <div className={styles.success}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <strong>🎉 Token Launched Successfully!</strong>
              <a
                href={`https://liteforge.explorer.caldera.xyz/tx/${txHash}`}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: '0.8rem' }}
              >
                View Explorer ↗
              </a>
            </div>
            
            {createdTokenAddress && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(0,0,0,0.2)', padding: '0.5rem 0.75rem', borderRadius: '8px' }}>
                <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Contract:</span>
                <code style={{ fontSize: '0.8rem' }}>{createdTokenAddress}</code>
                <button type="button" onClick={handleCopyAddr} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}>
                  {copied ? <Check size={13} color="#34d399" /> : <Copy size={13} />}
                </button>
              </div>
            )}

            {createdTokenAddress && (
              <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.75rem' }}>
                <Link
                  href={`/trade/${createdTokenAddress}`}
                  style={{
                    background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                    color: '#ffffff',
                    padding: '0.6rem 1.25rem',
                    borderRadius: '10px',
                    fontWeight: '700',
                    fontSize: '0.9rem',
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                  }}
                >
                  <Zap size={15} /> Buy / Trade ${form.symbol || 'Token'} Now ↗
                </Link>
                <Link
                  href="/memefolio"
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    color: '#ffffff',
                    padding: '0.6rem 1.25rem',
                    borderRadius: '10px',
                    fontWeight: '600',
                    fontSize: '0.9rem',
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                  }}
                >
                  View in Memefolio ↗
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      <button
        type="submit"
        className={styles.submit}
        disabled={isLoading || isUploadingImage || !deployed}
      >
        {isLoading ? (
          <span>Launching Token on LitVM…</span>
        ) : (
          <span>Launch & Make A History</span>

        )}
      </button>
    </form>
  );
}
