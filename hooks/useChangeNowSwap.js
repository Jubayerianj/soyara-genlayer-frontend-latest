// hooks/useChangeNowSwap.js
// React hook for ChangeNOW cross-chain swap operations

import { useState, useCallback, useEffect, useRef } from 'react';
import { changeNowService } from '../services/changeNowService';

/**
 * Hook for managing ChangeNOW cross-chain swap lifecycle
 */
export function useChangeNowSwap() {
  // Currency data
  const [currencies, setCurrencies] = useState([]);
  const [currenciesLoading, setCurrenciesLoading] = useState(false);

  // Selected pair (defaults to LTC -> BTC)
  const [fromCurrency, setFromCurrency] = useState('ltc');
  const [toCurrency, setToCurrency] = useState('btc');

  // Helper to extract ticker string safely
  const getTicker = useCallback((c) => {
    if (!c) return '';
    if (typeof c === 'string') return c.toLowerCase();
    if (typeof c === 'object' && c.ticker) return c.ticker.toLowerCase();
    return '';
  }, []);
  const [amount, setAmount] = useState('');

  // Quote data
  const [estimate, setEstimate] = useState(null);
  const [minAmount, setMinAmount] = useState(null);
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [estimateError, setEstimateError] = useState(null);

  // Transaction data
  const [transaction, setTransaction] = useState(null);
  const [txStatus, setTxStatus] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [txError, setTxError] = useState(null);

  // Rate mode
  const [rateMode, setRateMode] = useState('standard'); // 'standard' | 'fixed'

  // Status polling
  const pollingRef = useRef(null);

  // ─── Load currencies on mount ────────────────────────────────────────

  const loadCurrencies = useCallback(async () => {
    setCurrenciesLoading(true);
    try {
      const data = await changeNowService.getCurrencies({ active: true });
      setCurrencies(data || []);
    } catch (err) {
      console.error('Failed to load currencies:', err);
    } finally {
      setCurrenciesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCurrencies();
  }, [loadCurrencies]);

  // ─── Get estimate when pair/amount changes ───────────────────────────

  const getEstimate = useCallback(async () => {
    const fromStr = getTicker(fromCurrency);
    const toStr = getTicker(toCurrency);
    if (!fromStr || !toStr || !amount || parseFloat(amount) <= 0) {
      setEstimate(null);
      setEstimateError(null);
      return;
    }

    setEstimateLoading(true);
    setEstimateError(null);

    try {
      // Get min amount
      const min = await changeNowService.getMinAmount(fromStr, toStr);
      setMinAmount(min?.minAmount || 0);

      if (parseFloat(amount) < (min?.minAmount || 0)) {
        setEstimateError(`Minimum amount is ${min.minAmount} ${fromStr.toUpperCase()}`);
        setEstimate(null);
        setEstimateLoading(false);
        return;
      }

      // Get estimate based on rate mode
      let data;
      if (rateMode === 'fixed') {
        data = await changeNowService.getFixedRateEstimate(amount, fromStr, toStr);
      } else {
        data = await changeNowService.getEstimate(amount, fromStr, toStr);
      }

      setEstimate(data);
    } catch (err) {
      setEstimateError(err.message || 'Failed to get estimate');
      setEstimate(null);
    } finally {
      setEstimateLoading(false);
    }
  }, [fromCurrency, toCurrency, amount, rateMode, getTicker]);

  // Debounced estimate fetching
  useEffect(() => {
    const timer = setTimeout(() => {
      getEstimate();
    }, 500);
    return () => clearTimeout(timer);
  }, [getEstimate]);

  // ─── Create exchange transaction ─────────────────────────────────────

  const createExchange = useCallback(async (destinationAddress, refundAddress) => {
    const fromStr = getTicker(fromCurrency);
    const toStr = getTicker(toCurrency);
    if (!fromStr || !toStr || !amount || !destinationAddress) {
      setTxError('Missing required fields');
      return null;
    }

    setIsCreating(true);
    setTxError(null);

    try {
      let data;
      if (rateMode === 'fixed' && estimate?.rateId) {
        data = await changeNowService.createFixedRateExchange({
          from: fromStr,
          to: toStr,
          amount: parseFloat(amount),
          address: destinationAddress,
          refundAddress,
          rateId: estimate.rateId,
        });
      } else {
        data = await changeNowService.createExchange({
          from: fromStr,
          to: toStr,
          amount: parseFloat(amount),
          address: destinationAddress,
          refundAddress,
        });
      }

      const enrichedTx = {
        ...data,
        sendAmount: amount, // Explicitly preserve the user's typed input send amount (e.g. 1 LTC)
        receiveAmount: estimate?.estimatedAmount || data.amount, // Target receive amount (e.g. 0.0236726 ETH)
      };

      setTransaction(enrichedTx);

      // Save to localStorage for recovery
      if (typeof window !== 'undefined') {
        const history = JSON.parse(localStorage.getItem('litvm_l1_tx_history') || '[]');
        history.unshift({
          id: data.id,
          from: fromStr,
          to: toStr,
          amount: amount,
          address: destinationAddress,
          payinAddress: data.payinAddress,
          createdAt: Date.now(),
        });
        localStorage.setItem('litvm_l1_tx_history', JSON.stringify(history.slice(0, 50)));
      }

      // Start polling status
      startPolling(data.id);

      return enrichedTx;
    } catch (err) {
      setTxError(err.message || 'Failed to create exchange');
      return null;
    } finally {
      setIsCreating(false);
    }
  }, [fromCurrency, toCurrency, amount, rateMode, estimate]);

  // ─── Status polling ──────────────────────────────────────────────────

  const checkStatus = useCallback(async (txId) => {
    try {
      const data = await changeNowService.getStatus(txId);
      setTxStatus(data);
      return data;
    } catch (err) {
      console.error('Status check failed:', err);
      return null;
    }
  }, []);

  const startPolling = useCallback((txId) => {
    // Clear existing polling
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }

    // Initial check
    checkStatus(txId);

    // Poll every 5 seconds for fast real-time status updates
    pollingRef.current = setInterval(async () => {
      const status = await checkStatus(txId);
      if (status && ['finished', 'failed', 'refunded'].includes(status.status)) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    }, 5000);
  }, [checkStatus]);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  // ─── Swap tokens ─────────────────────────────────────────────────────

  const switchCurrencies = useCallback(() => {
    const tempFrom = fromCurrency;
    setFromCurrency(toCurrency);
    setToCurrency(tempFrom);
    setEstimate(null);
  }, [fromCurrency, toCurrency]);

  // ─── Reset ───────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    setTransaction(null);
    setTxStatus(null);
    setTxError(null);
    setEstimate(null);
    setAmount('');
    stopPolling();
  }, [stopPolling]);

  // ─── Transaction history from localStorage ──────────────────────────

  const getTransactionHistory = useCallback(() => {
    try {
      return JSON.parse(localStorage.getItem('litvm_l1_tx_history') || '[]');
    } catch {
      return [];
    }
  }, []);

  return {
    // Currency data
    currencies,
    currenciesLoading,
    popularCurrencies: changeNowService.getPopularCurrencies(),

    // Selected pair
    fromCurrency,
    toCurrency,
    amount,
    setFromCurrency,
    setToCurrency,
    setAmount,
    switchCurrencies,

    // Estimates
    estimate,
    minAmount,
    estimateLoading,
    estimateError,
    refreshEstimate: getEstimate,

    // Rate mode
    rateMode,
    setRateMode,

    // Transaction
    transaction,
    txStatus,
    isCreating,
    txError,
    createExchange,
    checkStatus,
    startPolling,
    stopPolling,

    // Helpers
    reset,
    getTransactionHistory,
    formatStatus: changeNowService.formatStatus,
  };
}
