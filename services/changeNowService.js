// services/changeNowService.js
// ChangeNOW Exchange API v1 integration for Litecoin L1 cross-chain swaps

const CHANGENOW_API = 'https://api.changenow.io/v1';
const API_KEY = process.env.NEXT_PUBLIC_CHANGENOW_API_KEY;

/**
 * ChangeNOW API service for cross-chain swaps
 * Docs: https://changenow.io/api/docs
 */
class ChangeNowService {
  constructor(apiKey) {
    this.apiKey = apiKey || API_KEY;
  }

  async _fetch(url, options = {}) {
    try {
      const res = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || errBody.message || `API error: ${res.status}`);
      }
      return res.json();
    } catch (err) {
      console.error('[ChangeNOW]', err);
      throw err;
    }
  }

  // ─── Currency Discovery ──────────────────────────────────────────────

  /**
   * Get all available currencies
   * @param {boolean} active - Only return active currencies
   * @param {boolean} fixedRate - Only return currencies available for fixed-rate swaps
   */
  async getCurrencies({ active = true, fixedRate = false } = {}) {
    const params = new URLSearchParams();
    if (active) params.set('active', 'true');
    if (fixedRate) params.set('fixedRate', 'true');
    return this._fetch(`${CHANGENOW_API}/currencies?${params}`);
  }

  /**
   * Get available currencies filtered to a specific ticker
   */
  async getCurrency(ticker) {
    const all = await this.getCurrencies();
    return all.filter(c => c.ticker.toLowerCase() === ticker.toLowerCase());
  }

  /**
   * Get list of available pairs for a currency
   */
  async getAvailablePairs(ticker) {
    return this._fetch(`${CHANGENOW_API}/currencies-to/${ticker}`);
  }

  // ─── Estimates & Minimums ────────────────────────────────────────────

  /**
   * Get minimum exchange amount for a pair
   */
  async getMinAmount(from, to) {
    return this._fetch(
      `${CHANGENOW_API}/min-amount/${from}_${to}?api_key=${this.apiKey}`
    );
  }

  /**
   * Get estimated exchange amount (floating rate)
   */
  async getEstimate(amount, from, to) {
    return this._fetch(
      `${CHANGENOW_API}/exchange-amount/${amount}/${from}_${to}?api_key=${this.apiKey}`
    );
  }

  /**
   * Get fixed-rate estimated exchange amount
   * Returns { estimatedAmount, rateId, validUntil }
   */
  async getFixedRateEstimate(amount, from, to) {
    return this._fetch(
      `${CHANGENOW_API}/exchange-amount/fixed-rate/${amount}/${from}_${to}?api_key=${this.apiKey}`
    );
  }

  // ─── Transaction Management ──────────────────────────────────────────

  /**
   * Create a standard (floating-rate) exchange transaction
   * @returns {{ id, payinAddress, payoutAddress, payinExtraId, ... }}
   */
  async createExchange({ from, to, amount, address, refundAddress, extraId }) {
    return this._fetch(`${CHANGENOW_API}/transactions/${this.apiKey}`, {
      method: 'POST',
      body: JSON.stringify({
        from,
        to,
        amount,
        address,
        refundAddress: refundAddress || undefined,
        extraId: extraId || undefined,
      }),
    });
  }

  /**
   * Create a fixed-rate exchange transaction
   * @param {string} rateId - From getFixedRateEstimate response
   */
  async createFixedRateExchange({ from, to, amount, address, refundAddress, rateId, extraId }) {
    return this._fetch(`${CHANGENOW_API}/transactions/fixed-rate/${this.apiKey}`, {
      method: 'POST',
      body: JSON.stringify({
        from,
        to,
        amount,
        address,
        refundAddress: refundAddress || undefined,
        rateId,
        extraId: extraId || undefined,
      }),
    });
  }

  /**
   * Get transaction status by ID
   * Statuses: new, waiting, confirming, exchanging, sending, finished, failed, refunded, verifying
   */
  async getStatus(transactionId) {
    return this._fetch(
      `${CHANGENOW_API}/transactions/${transactionId}/${this.apiKey}`
    );
  }

  // ─── Helpers ─────────────────────────────────────────────────────────

  /**
   * Get popular L1 currencies for quick-select UI with real logo URLs
   */
  getPopularCurrencies() {
    return [
      { ticker: 'ltc', name: 'Litecoin', network: 'ltc', image: 'https://assets.coingecko.com/coins/images/2/small/litecoin.png', icon: '⚡' },
      { ticker: 'btc', name: 'Bitcoin', network: 'btc', image: 'https://assets.coingecko.com/coins/images/1/small/bitcoin.png', icon: '₿' },
      { ticker: 'eth', name: 'Ethereum', network: 'eth', image: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png', icon: 'Ξ' },
      { ticker: 'usdt', name: 'Tether', network: 'eth', image: 'https://assets.coingecko.com/coins/images/325/small/Tether.png', icon: '💵' },
      { ticker: 'usdc', name: 'USD Coin', network: 'eth', image: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png', icon: '💲' },
      { ticker: 'sol', name: 'Solana', network: 'sol', image: 'https://assets.coingecko.com/coins/images/4128/small/solana.png', icon: '◎' },
      { ticker: 'xmr', name: 'Monero', network: 'xmr', image: 'https://assets.coingecko.com/coins/images/69/small/monero_logo.png', icon: '🔒' },
      { ticker: 'doge', name: 'Dogecoin', network: 'doge', image: 'https://assets.coingecko.com/coins/images/5/small/dogecoin.png', icon: '🐕' },
      { ticker: 'trx', name: 'TRON', network: 'trx', image: 'https://assets.coingecko.com/coins/images/1094/small/tron-logo.png', icon: '🔺' },
      { ticker: 'bnb', name: 'BNB', network: 'bsc', image: 'https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png', icon: '🔶' },
      { ticker: 'xrp', name: 'XRP', network: 'xrp', image: 'https://assets.coingecko.com/coins/images/44/small/xrp-symbol-white-128.png', icon: '💧' },
      { ticker: 'ada', name: 'Cardano', network: 'ada', image: 'https://assets.coingecko.com/coins/images/975/small/cardano.png', icon: '🔵' },
    ];
  }

  /**
   * Format status string for UI display
   */
  formatStatus(status) {
    const map = {
      new: { label: 'Created', color: '#94a3b8', pulsing: false },
      waiting: { label: 'Awaiting Deposit', color: '#f59e0b', pulsing: true },
      confirming: { label: 'Confirming', color: '#3b82f6', pulsing: true },
      exchanging: { label: 'Exchanging', color: '#8b5cf6', pulsing: true },
      sending: { label: 'Sending', color: '#06b6d4', pulsing: true },
      finished: { label: 'Completed', color: '#22c55e', pulsing: false },
      failed: { label: 'Failed', color: '#ef4444', pulsing: false },
      refunded: { label: 'Refunded', color: '#f97316', pulsing: false },
      verifying: { label: 'Verifying', color: '#eab308', pulsing: true },
    };
    return map[status] || { label: status, color: '#94a3b8', pulsing: false };
  }
  /**
   * Get recommended non-EVM & EVM wallets with real logo images for a specific chain ticker
   */
  getRecommendedWallets(ticker = '') {
    const t = ticker.toLowerCase();
    const wallets = {
      ltc: [
        { name: 'Cake Wallet', image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABwAAAAcCAMAAABF0y+mAAAAflBMVEVHcEwPDDsxKTgwKDgxKTgxKTgoIjsxKTgxKTgxKTgxKTj/0QQuJzgxKTj/xQn/xBSZGSP/xBP/xBT/xBRgxv9OyP9hxf9hxf//xhNfxv8xKThhxf//YAlcyP//Ywz/Yw8xKTj/Yw7/Yw8wKDj/xAD/Yw//Ywv/YxD/Yw//YhB5rYM8AAAAKnRSTlMAJFl8vtIHOpjv/xZu+l7/ELD17a47/+1tifTYSmmS/6Db6YpX9rISnwpbHjKUAAAA4UlEQVR4AW3MBRKDABAEwY3grjHc+f8Hc/ghg9NVi+tu98dTEHFMustPRaUEaFgTJV1+GurSA6YFyqbfAv1mGTc4lgtJUM89oXmW5cC4MJ0mLcsERz5peRp8wvOkO0wG4euEOt7j5Cc84XeZ/IXhDxz5ZBj6iDjyyTBGknLMtkmyPC04lpgnKbITVviM5iM94TRJVxAR1nsMiD4YygmjPZIFSPKmqWm0xQF/sIt0rAOlcPwgSqciDIkCQzQT5S3myg3nyQRb0orb5JYoMMx7HCpXTHBOmjHCZQLhYZL1eODQHzXzIr0ZxiTcAAAAAElFTkSuQmCC', icon: '🍰', url: 'https://cakewallet.com', tag: 'Recommended (MWEB & L1)' },
        { name: 'Litewallet', image: 'https://litewallet.org/img/logo.png', icon: '⚡', url: 'https://litewallet.org', tag: 'Official Mobile' },
        { name: 'Electrum-LTC', image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAABnRSTlMAAAAAAABupgeRAAABw0lEQVR4AXWSA5QeQRCEJ7Zt28lDbNt+iG3bfoht27ZtnW2bu3/X1Zz5rdGo6lHpmRw8/bnMfSmzX8jUZ8JHlRUtThhrPwjSEmWCkV0vmiodFfYaHuEgC19LtePItgadrsIpBAn88EXNQ2aa3PzbLxI5dqHUIYy8L7cc8NJNWHDyU2lwBgFR+OotzXaFqQQSOmHfdoEg274igWzLUGQ/H3UAGXEfiSqRxA1b1DsNh2CQx85iFQhiEez5iQeOCIpCgfUhauYLAbSybNuRbSMqHE0JHnIXA27rl/y04RNIn1tQ7ATQpVe/kRgzpR+mr3MKrS7h+N8U69pdSQxIdHDlu5RvPW4gxgLyLwAUyTqkzWUojgnAxCdCK8schnOwfrxmozXwP77h+xIHseMrSLfr0KIp66KNnPwnl21SKriFaaP9ohJ/JV7hqLQ9SBEOC8A3H0rUhqz7qHugyk2fceA3xj+WXT9A+FUl0P6caRMIrwg0O4cdn+ETAUITV7/XLTU6C8OCO/bocyxEJVNlv0Fbkg0td4RTo0W6VQD3HNDqtKHS0eeyMfahUE9qQqIx6A56HAlRWTIjmMuObvBMZ3OvSb+84wAaM/JGxw7rJQAAAABJRU5ErkJggg==', icon: '🔒', url: 'https://electrum-ltc.org', tag: 'Desktop Light' },
        { name: 'Trust Wallet', image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABkAAAAcCAYAAACUJBTQAAAB40lEQVR4AZ3WQ4AcQRiG4WotLrFt27btc2z7lFtszeQ6uYS3zSXOMbZt28t/9+vdf1lT1V2Hdzz1tLvE4MUjAuVUp06uoBV1l9w+Nihr1+oB6dHW7d8f9IL8V/lloqBKGNhz6IIn6LsriGrOf0QDUvdlooEZe68yGArhJcbAGLR4QHp+388VgOmR24MyIpsA9v8XSyyOSJc4XpWmvKXO745Su2cpeEZyMD0S5TUUnqDpksGUSLPbZzlgShBrZ4TUv3CR04LdPh3cGRqxRhBVPfHQr+a5W0gJGiOlj3zwq5DyHElBRlvePWmGJMV+cVqwxql7BkhfIjuSWTglaIyIdXlt9VOCZkhHIrGG04NuNG2rGbKicGrQCLGbEompuVnzKQupQB9xa9DYsIgzKZMhPbiAZvnXLU/Qy8BIbRzGyMe4uCAuuP4FEhfGUEhfBEgNWjPpptuakvIv70ERpyJ2PgKkBrGp+FKvXhsVguKAYgR9wlowEmptgNhNiyYDcUBJ74yeoO1aKBn7BQGQg3YDOqO8/Wo3WzLWBjFWFAWAzaRE8ANAWqRoDD1zy1P94mPGnaXoII5R/J4BHWKwj+SbKDCCcJRoZjArDCZ38s2HtWIMzznF8LnBDFIdtjmu2jinwvwvG/zMNXRmtZuGAAAAAElFTkSuQmCC', icon: '🛡', url: 'https://trustwallet.com', tag: 'Multi-chain Mobile' },
      ],
      btc: [
        { name: 'Cake Wallet', image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABwAAAAcCAMAAABF0y+mAAAAflBMVEVHcEwPDDsxKTgwKDgxKTgxKTgoIjsxKTgxKTgxKTgxKTj/0QQuJzgxKTj/xQn/xBSZGSP/xBP/xBT/xBRgxv9OyP9hxf9hxf//xhNfxv8xKThhxf//YAlcyP//Ywz/Yw8xKTj/Yw7/Yw8wKDj/xAD/Yw//Ywv/YxD/Yw//YhB5rYM8AAAAKnRSTlMAJFl8vtIHOpjv/xZu+l7/ELD17a47/+1tifTYSmmS/6Db6YpX9rISnwpbHjKUAAAA4UlEQVR4AW3MBRKDABAEwY3grjHc+f8Hc/ghg9NVi+tu98dTEHFMustPRaUEaFgTJV1+GurSA6YFyqbfAv1mGTc4lgtJUM89oXmW5cC4MJ0mLcsERz5peRp8wvOkO0wG4euEOt7j5Cc84XeZ/IXhDxz5ZBj6iDjyyTBGknLMtkmyPC04lpgnKbITVviM5iM94TRJVxAR1nsMiD4YygmjPZIFSPKmqWm0xQF/sIt0rAOlcPwgSqciDIkCQzQT5S3myg3nyQRb0orb5JYoMMx7HCpXTHBOmjHCZQLhYZL1eODQHzXzIr0ZxiTcAAAAAElFTkSuQmCC', icon: '🍰', url: 'https://cakewallet.com', tag: 'Recommended' },
        { name: 'Sparrow Wallet', image: 'https://sparrowwallet.com/image/sparrow-logo.png', icon: '🦅', url: 'https://sparrowwallet.com', tag: 'Advanced Desktop' },
        { name: 'Muun Wallet', image: 'https://muun.com/favicon.png', icon: '⚡', url: 'https://muun.com', tag: 'Lightning & L1' },
        { name: 'Trust Wallet', image: 'https://trustwallet.com/assets/images/media/assets/trust_platform.png', icon: '🛡', url: 'https://trustwallet.com', tag: 'Multi-chain' },
      ],
      xmr: [
        { name: 'Cake Wallet', image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABwAAAAcCAMAAABF0y+mAAAAflBMVEVHcEwPDDsxKTgwKDgxKTgxKTgoIjsxKTgxKTgxKTgxKTj/0QQuJzgxKTj/xQn/xBSZGSP/xBP/xBT/xBRgxv9OyP9hxf9hxf//xhNfxv8xKThhxf//YAlcyP//Ywz/Yw8xKTj/Yw7/Yw8wKDj/xAD/Yw//Ywv/YxD/Yw//YhB5rYM8AAAAKnRSTlMAJFl8vtIHOpjv/xZu+l7/ELD17a47/+1tifTYSmmS/6Db6YpX9rISnwpbHjKUAAAA4UlEQVR4AW3MBRKDABAEwY3grjHc+f8Hc/ghg9NVi+tu98dTEHFMustPRaUEaFgTJV1+GurSA6YFyqbfAv1mGTc4lgtJUM89oXmW5cC4MJ0mLcsERz5peRp8wvOkO0wG4euEOt7j5Cc84XeZ/IXhDxz5ZBj6iDjyyTBGknLMtkmyPC04lpgnKbITVviM5iM94TRJVxAR1nsMiD4YygmjPZIFSPKmqWm0xQF/sIt0rAOlcPwgSqciDIkCQzQT5S3myg3nyQRb0orb5JYoMMx7HCpXTHBOmjHCZQLhYZL1eODQHzXzIr0ZxiTcAAAAAElFTkSuQmCC', icon: '🍰', url: 'https://cakewallet.com', tag: 'Recommended' },
        { name: 'Monero GUI / CLI', image: 'https://assets.coingecko.com/coins/images/69/small/monero_logo.png', icon: '🔒', url: 'https://getmonero.org', tag: 'Official Node' },
        { name: 'Feather Wallet', image: 'https://featherwallet.org/img/logo.svg', icon: '🪶', url: 'https://featherwallet.org', tag: 'Desktop' },
      ],
      sol: [
        { name: 'Phantom', image: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png', icon: '👻', url: 'https://phantom.app', tag: 'Recommended Solana' },
        { name: 'Solflare', image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABwAAAAcCAMAAABF0y+mAAAARVBMVEVHcEz/70b/70b77EX/70b/70b/8Ub/9Uf/+Ejs3UFtZyGOhinYyzwAAAUTFA1LRxkwLhKelC3Dtzf//Uq3qzOEfCauozGwV9hfAAAABnRSTlMAXMX8/9vsLUf1AAABCUlEQVR4AX3TUY6DMAxFUcBubEJegzGw/6VOIC0Ko4r7VfXIIIjpSv1A/C8a+u7sxT97PdipPV8FkdBq3w3Xbx3jlPR04aOho8smlN6Hy3T+S91lOc5A9TzXkS+KYfHRqmfhG+ob0UW0eLUGgx8DC6uOiMo3DJQjjuKKzcMdGdlTRvUy36LsBUVpnatvFBpcgZjUE7a1Xn4MzWXPkQhzVTYAkzQYbP7cUEQXIGqDLG6ovqrP90nWHbuPlosmz/d7qmFzEfEFsBG78IWHlY4D8Ygpb948p06ozUYGWPsSxEC0Z3xKxWrnYRMFrgcCZJKvUbMmQTRtq/LV0CxYSUTaBXtazeelfvwc/gA9nRXPJI2QJwAAAABJRU5ErkJggg==', icon: '🚀', url: 'https://solflare.com', tag: 'Solana Web/Mobile' },
      ],
      doge: [
        { name: 'Cake Wallet', image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABwAAAAcCAMAAABF0y+mAAAAflBMVEVHcEwPDDsxKTgwKDgxKTgxKTgoIjsxKTgxKTgxKTgxKTj/0QQuJzgxKTj/xQn/xBSZGSP/xBP/xBT/xBRgxv9OyP9hxf9hxf//xhNfxv8xKThhxf//YAlcyP//Ywz/Yw8xKTj/Yw7/Yw8wKDj/xAD/Yw//Ywv/YxD/Yw//YhB5rYM8AAAAKnRSTlMAJFl8vtIHOpjv/xZu+l7/ELD17a47/+1tifTYSmmS/6Db6YpX9rISnwpbHjKUAAAA4UlEQVR4AW3MBRKDABAEwY3grjHc+f8Hc/ghg9NVi+tu98dTEHFMustPRaUEaFgTJV1+GurSA6YFyqbfAv1mGTc4lgtJUM89oXmW5cC4MJ0mLcsERz5peRp8wvOkO0wG4euEOt7j5Cc84XeZ/IXhDxz5ZBj6iDjyyTBGknLMtkmyPC04lpgnKbITVviM5iM94TRJVxAR1nsMiD4YygmjPZIFSPKmqWm0xQF/sIt0rAOlcPwgSqciDIkCQzQT5S3myg3nyQRb0orb5JYoMMx7HCpXTHBOmjHCZQLhYZL1eODQHzXzIr0ZxiTcAAAAAElFTkSuQmCC', icon: '🍰', url: 'https://cakewallet.com', tag: 'Recommended' },
        { name: 'MyDoge', image: 'https://mydoge.com/favicon.png', icon: '🐕', url: 'https://mydoge.com', tag: 'Doge Native' },
      ],
      eth: [
        { name: 'MetaMask', image: 'https://raw.githubusercontent.com/MetaMask/brand-resources/master/SVG/metamask-fox.svg', icon: '🦊', url: 'https://metamask.io', tag: 'EVM Wallet' },
        { name: 'Rainbow', image: 'https://rainbow.me/icon.png', icon: '🌈', url: 'https://rainbow.me', tag: 'EVM Mobile' },
        { name: 'Trust Wallet', image: 'https://trustwallet.com/assets/images/media/assets/trust_platform.png', icon: '🛡', url: 'https://trustwallet.com', tag: 'EVM Mobile' },
      ]
    };
    return wallets[t] || [
      { name: 'Cake Wallet', image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABwAAAAcCAMAAABF0y+mAAAAflBMVEVHcEwPDDsxKTgwKDgxKTgxKTgoIjsxKTgxKTgxKTgxKTj/0QQuJzgxKTj/xQn/xBSZGSP/xBP/xBT/xBRgxv9OyP9hxf9hxf//xhNfxv8xKThhxf//YAlcyP//Ywz/Yw8xKTj/Yw7/Yw8wKDj/xAD/Yw//Ywv/YxD/Yw//YhB5rYM8AAAAKnRSTlMAJFl8vtIHOpjv/xZu+l7/ELD17a47/+1tifTYSmmS/6Db6YpX9rISnwpbHjKUAAAA4UlEQVR4AW3MBRKDABAEwY3grjHc+f8Hc/ghg9NVi+tu98dTEHFMustPRaUEaFgTJV1+GurSA6YFyqbfAv1mGTc4lgtJUM89oXmW5cC4MJ0mLcsERz5peRp8wvOkO0wG4euEOt7j5Cc84XeZ/IXhDxz5ZBj6iDjyyTBGknLMtkmyPC04lpgnKbITVviM5iM94TRJVxAR1nsMiD4YygmjPZIFSPKmqWm0xQF/sIt0rAOlcPwgSqciDIkCQzQT5S3myg3nyQRb0orb5JYoMMx7HCpXTHBOmjHCZQLhYZL1eODQHzXzIr0ZxiTcAAAAAElFTkSuQmCC', icon: '🍰', url: 'https://cakewallet.com', tag: 'Multi-coin Non-EVM' },
      { name: 'Trust Wallet', image: 'https://trustwallet.com/assets/images/media/assets/trust_platform.png', icon: '🛡', url: 'https://trustwallet.com', tag: 'Multi-chain Mobile' },
      { name: 'Exodus', image: 'https://www.exodus.com/brand/img/logo.png', icon: '📱', url: 'https://exodus.com', tag: 'Multi-asset Desktop' }
    ];
  }

  /**
   * Get block explorer link for any L1 asset transaction or address
   */
  getExplorerUrl(ticker = '', hash = '', type = 'tx') {
    if (!hash) return '#';
    const t = ticker.toLowerCase();
    if (t === 'ltc') return `https://blockchair.com/litecoin/${type}/${hash}`;
    if (t === 'btc') return `https://mempool.space/${type}/${hash}`;
    if (t === 'eth') return `https://etherscan.io/${type}/${hash}`;
    if (t === 'sol') return `https://solscan.io/${type}/${hash}`;
    if (t === 'xmr') return `https://xmrchain.net/search?value=${hash}`;
    if (t === 'doge') return `https://dogechain.info/${type}/${hash}`;
    if (t === 'trx') return `https://tronscan.org/#/${type}/${hash}`;
    if (t === 'bsc' || t === 'bnb') return `https://bscscan.com/${type}/${hash}`;
    return `https://blockchair.com/search?q=${hash}`;
  }

  /**
   * Get USD prices for tokens
   */
  async getUsdPrices(tickers = []) {
    try {
      const cgMap = {
        ltc: 'litecoin',
        btc: 'bitcoin',
        eth: 'ethereum',
        usdt: 'tether',
        usdc: 'usd-coin',
        sol: 'solana',
        xmr: 'monero',
        doge: 'dogecoin',
        trx: 'tron',
        bnb: 'binancecoin',
        xrp: 'ripple',
        ada: 'cardano',
        matic: 'matic-network',
        polygon: 'matic-network',
        arb: 'arbitrum',
        avax: 'avalanche-2',
        op: 'optimism',
        base: 'ethereum',
      };
      
      const ids = Array.from(new Set(tickers.map(t => cgMap[t.toLowerCase()]).filter(Boolean))).join(',');
      if (!ids) return { usdt: 1.0, usdc: 1.0 };

      const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`);
      const data = await res.json();

      const result = {};
      for (const t of tickers) {
        const low = t.toLowerCase();
        const cgId = cgMap[low];
        if (cgId && data[cgId]?.usd) {
          result[low] = data[cgId].usd;
        } else if (low === 'usdt' || low === 'usdc') {
          result[low] = 1.0;
        }
      }
      return result;
    } catch (err) {
      console.error('Failed to fetch USD prices:', err);
      return { usdt: 1.0, usdc: 1.0 };
    }
  }
}

// Singleton instance
export const changeNowService = new ChangeNowService();
export default ChangeNowService;

