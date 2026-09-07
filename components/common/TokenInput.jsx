// components/common/TokenInput.jsx
import React, { useState, useEffect } from 'react';

const getShortSymbol = (token) => {
  if (!token) return '';

  const name = token.name || '';
  const symbol = token.symbol || '';

  if (name && symbol && name.length < symbol.length && name.length <= 6) {
    return name;
  }
  if (symbol && symbol.length <= 6) return symbol;
  if (name && name.length <= 6) return name;

  const fullName = (name || symbol).toLowerCase();
  const map = {
    ethereum: 'ETH',
    bitcoin: 'BTC',
    'usd coin': 'USDC',
    tether: 'USDT',
    litecoin: 'LTC',
    xrp: 'XRP',
    bnb: 'BNB',
    solana: 'SOL',
    matic: 'MATIC',
    polygon: 'MATIC',
    'wrapped ether': 'WETH',
    'wrapped btc': 'WBTC',
  };

  for (const [full, short] of Object.entries(map)) {
    if (fullName.includes(full)) return short;
  }

  const words = fullName.split(/\s+/).filter((word) => word.length > 0);
  if (words.length >= 2) {
    return words.map((word) => word[0].toUpperCase()).join('').substring(0, 6);
  }

  return (symbol || name || '?').substring(0, 6);
};

const formatBalance = (balance) => {
  const numericBalance = typeof balance === 'string' ? parseFloat(balance) : Number(balance || 0);

  if (!Number.isFinite(numericBalance) || numericBalance <= 0) return '0.0000';
  if (numericBalance >= 1000000) return `${(numericBalance / 1000000).toFixed(2)}M`;
  if (numericBalance >= 1000) return `${(numericBalance / 1000).toFixed(2)}K`;
  if (numericBalance >= 1) return numericBalance.toFixed(4);
  if (numericBalance >= 0.0001) return numericBalance.toFixed(6);
  return numericBalance.toExponential(2);
};

const TokenInput = ({
  label,
  token,
  amount,
  onAmountChange,
  onTokenSelect,
  onMaxClick,
  balance,
  disabled = false,
  selectDisabled = false,
  showBalance = true,
  showMaxButton = true,
  readOnly = false,
}) => {
  const [inputValue, setInputValue] = useState(amount || '');

  useEffect(() => {
    setInputValue(amount || '');
  }, [amount]);

  const handleChange = (e) => {
    const value = e.target.value;
    if (value === '' || /^[0-9]*\.?[0-9]*$/.test(value)) {
      let processedValue = value;
      if (value === '.') processedValue = '0.';
      else if (value === '0.') processedValue = '0.';
      else if (value.startsWith('00') && !value.startsWith('0.')) processedValue = value.replace(/^0+/, '') || '0';
      else if (value.startsWith('0') && value.length > 1 && value[1] !== '.') processedValue = value.substring(1);
      setInputValue(processedValue);
      onAmountChange(processedValue);
    }
  };

  const handleBlur = () => {
    if (readOnly) return;

    if (inputValue === '' || inputValue === '.' || inputValue === '0.') {
      setInputValue('');
      onAmountChange('');
    } else if (inputValue.endsWith('.')) {
      const cleanedValue = inputValue.slice(0, -1);
      setInputValue(cleanedValue);
      onAmountChange(cleanedValue);
    } else if (inputValue.startsWith('.')) {
      const cleanedValue = `0${inputValue}`;
      setInputValue(cleanedValue);
      onAmountChange(cleanedValue);
    } else {
      const numValue = parseFloat(inputValue);
      if (!Number.isNaN(numValue)) {
        const cleanedValue = numValue.toString();
        if (cleanedValue !== inputValue) {
          setInputValue(cleanedValue);
          onAmountChange(cleanedValue);
        }
      }
    }
  };

  const shortSymbol = token ? getShortSymbol(token) : '';
  const hasPositiveBalance = Number.parseFloat(balance || '0') > 0;

  return (
    <div className="token-input-shell">
      <div className="token-input-topline">
        <span className="token-input-label">{label || 'Token'}</span>
        {showBalance && token && (
          <div className="balance-cluster">
            <span className="balance-pill">Balance {formatBalance(balance)}</span>
            {showMaxButton && !readOnly && (
              <button
                type="button"
                onClick={onMaxClick}
                className="max-button"
                disabled={disabled || !hasPositiveBalance}
              >
                Max
              </button>
            )}
          </div>
        )}
      </div>

      <div className="token-input-card">
        <button
          type="button"
          onClick={onTokenSelect}
          className="token-select-button"
          disabled={selectDisabled}
        >
          {token ? (
            <>
              <div className="token-visual">
                <img
                  src={token.logoURI || token.imageUrl || '/tlogo.png'}
                  alt={shortSymbol}
                  className="token-logo"
                  onError={(e) => {
                    e.currentTarget.src = '/tlogo.png';
                  }}
                />
                <div className="token-icon-fallback" style={{ display: 'none' }}>
                  {shortSymbol.charAt(0) || '?'}
                </div>
              </div>
              <div className="token-meta">
                <span className="token-kicker">Selected asset</span>
                <span className="token-symbol">{shortSymbol}</span>
              </div>
            </>
          ) : (
            <div className="token-meta token-meta-empty">
              <span className="token-kicker">Choose asset</span>
              <span className="select-token-text">Select token</span>
            </div>
          )}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        <div className="amount-panel">
          <input
            type="text"
            value={readOnly ? '' : inputValue}
            onChange={handleChange}
            onBlur={handleBlur}
            placeholder={readOnly ? 'Select tokens to continue' : '0.0'}
            disabled={disabled || readOnly}
            className={`amount-input ${readOnly ? 'amount-input-readonly' : ''}`}
            inputMode="decimal"
            autoComplete="off"
            autoCorrect="off"
            spellCheck="false"
          />
          <span className="amount-caption">
            {readOnly ? 'Token selection only' : token ? `${token.symbol} amount` : 'Enter amount'}
          </span>
        </div>
      </div>

      <style jsx>{`
        .token-input-shell {
          display: flex;
          flex-direction: column;
          gap: 0.7rem;
        }

        .token-input-topline {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          flex-wrap: wrap;
        }

        .token-input-label {
          color: #94a3b8;
          font-size: 0.78rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .balance-cluster {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .balance-pill {
          display: inline-flex;
          align-items: center;
          padding: 0.38rem 0.7rem;
          border-radius: 999px;
          background: rgba(148, 163, 184, 0.1);
          color: #cbd5e1;
          font-size: 0.76rem;
          font-variant-numeric: tabular-nums;
        }

        .max-button {
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.04);
          color: rgba(255, 255, 255, 0.8);
          font-size: 0.78rem;
          font-weight: 700;
          padding: 0.38rem 0.76rem;
          border-radius: 999px;
          cursor: pointer;
          transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease;
        }

        .max-button:hover:not(:disabled) {
          transform: translateY(-1px);
          border-color: rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.08);
          color: #ffffff;
        }

        .max-button:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        .token-input-card {
          display: grid;
          gap: 0.85rem;
          padding: 0.95rem;
          border-radius: 1.5rem;
          border: 1px solid rgba(255, 255, 255, 0.06);
          background:
            radial-gradient(circle at top right, rgba(255, 255, 255, 0.03), transparent 34%),
            linear-gradient(180deg, rgba(15, 23, 42, 0.4), rgba(9, 14, 27, 0.6));
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.01);
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }

        .token-input-card:focus-within {
          border-color: rgba(255, 255, 255, 0.15);
          box-shadow: 0 0 20px rgba(0, 0, 0, 0.4);
        }

        .token-select-button {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          width: 100%;
          padding: 0.8rem 0.9rem;
          border: 1px solid rgba(148, 163, 184, 0.12);
          border-radius: 1.2rem;
          background: rgba(15, 23, 42, 0.62);
          color: #f8fafc;
          cursor: pointer;
          transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease;
        }

        .token-select-button:hover:not(:disabled) {
          transform: translateY(-1px);
          border-color: rgba(56, 189, 248, 0.3);
          background: rgba(15, 23, 42, 0.9);
        }

        .token-select-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .token-visual {
          position: relative;
          width: 2.75rem;
          height: 2.75rem;
          flex-shrink: 0;
        }

        .token-logo,
        .token-icon-fallback {
          width: 100%;
          height: 100%;
          border-radius: 999px;
        }

        .token-logo {
          object-fit: cover;
          border: 1px solid rgba(148, 163, 184, 0.12);
        }

        .token-icon-fallback {
          display: none;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #3b82f6, #38bdf8);
          color: #04111d;
          font-size: 0.92rem;
          font-weight: 800;
        }

        .token-meta {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          flex: 1;
          min-width: 0;
        }

        .token-meta-empty {
          justify-content: center;
        }

        .token-kicker {
          font-size: 0.7rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #64748b;
        }

        .token-symbol,
        .select-token-text {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 100%;
          font-size: 1rem;
          font-weight: 700;
          color: #f8fafc;
        }

        .amount-panel {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          padding: 0 0.15rem 0.1rem;
        }

        .amount-input {
          width: 100%;
          min-width: 0;
          padding: 0;
          border: none;
          background: transparent;
          color: #ffffff;
          font-size: clamp(2rem, 8vw, 3rem);
          line-height: 1;
          font-weight: 700;
        }

        .amount-input:focus {
          outline: none;
        }

        .amount-input:disabled {
          opacity: 0.9;
          cursor: default;
        }

        .amount-input::placeholder {
          color: #475569;
        }

        .amount-input-readonly {
          font-size: 1rem;
          color: #64748b;
        }

        .amount-caption {
          font-size: 0.76rem;
          color: #64748b;
        }

        @media (min-width: 640px) {
          .token-input-card {
            grid-template-columns: minmax(0, 11rem) minmax(0, 1fr);
            align-items: center;
          }

          .token-select-button {
            height: 100%;
          }

          .amount-panel {
            padding: 0 0.15rem 0 0;
          }
        }
      `}</style>
    </div>
  );
};

export default TokenInput;
