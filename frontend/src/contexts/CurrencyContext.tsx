import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import {
  CurrencyService,
  type DisplayCurrency,
  type ExchangeRateDetail,
  type FormatMoneyOptions,
  getAllStoredExchangeRates,
  fetchLiveExchangeRates,
  subscribeToCurrencyRates,
  COUNTRY_CURRENCY_CONFIG,
  FALLBACK_RATES
} from '../services/currencyService';

export type Currency = DisplayCurrency;

interface CurrencyContextProps {
  selectedCurrency: Currency;
  setSelectedCurrency: (currency: Currency) => void;
  exchangeRates: Record<Currency, number>;
  exchangeRateDetails: Record<Currency, ExchangeRateDetail>;
  loading: boolean;
  formatCurrencyPrice: (amountUSD: number, overrideCurrency?: Currency) => string;
  convertUsdToDisplay: (amountUSD: number, currency?: Currency) => number | null;
  refreshRates: () => Promise<void>;
  // Backward compatibility methods
  convertFromUYU: (amountUYU: number, currency: Currency) => number;
  convertUSDToARS: (amountUSD: number) => number;
  convertARSToUSD: (amountARS: number) => number;
  getFxRateUsdToArs: () => number;
}

const CurrencyContext = createContext<CurrencyContextProps | undefined>(undefined);

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [selectedCurrency, setSelectedCurrencyState] = useState<Currency>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('collectibles_currency') as Currency;
      if (stored && ['USD', 'UYU', 'ARS', 'CLP', 'PEN', 'MXN'].includes(stored)) {
        return stored;
      }
    }
    return 'USD';
  });

  const [rateDetails, setRateDetails] = useState<Record<Currency, ExchangeRateDetail>>(() => getAllStoredExchangeRates());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToCurrencyRates((updatedMap) => {
      const rec = {} as Record<Currency, ExchangeRateDetail>;
      updatedMap.forEach((v, k) => { rec[k] = v; });
      setRateDetails(prev => ({ ...prev, ...rec }));
      setLoading(false);
    });

    // Defer network sync to avoid blocking initial render
    const timer = setTimeout(() => {
      fetchLiveExchangeRates().then(rates => {
        setRateDetails(rates);
        setLoading(false);
      });
    }, 1000);

    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  const setSelectedCurrency = useCallback((currency: Currency) => {
    setSelectedCurrencyState(currency);
    if (typeof window !== 'undefined') {
      localStorage.setItem('collectibles_currency', currency);
    }
  }, []);

  const exchangeRates = useMemo(() => {
    const result = {} as Record<Currency, number>;
    (Object.keys(rateDetails) as Currency[]).forEach(k => {
      result[k] = rateDetails[k]?.rate || FALLBACK_RATES[k] || 1.0;
    });
    return result;
  }, [rateDetails]);

  const convertUsdToDisplay = useCallback((amountUSD: number, targetCurr?: Currency) => {
    const curr = targetCurr || selectedCurrency;
    return CurrencyService.convertUsdToDisplay(amountUSD, curr, exchangeRates[curr]);
  }, [selectedCurrency, exchangeRates]);

  const formatCurrencyPrice = useCallback((amountUSD: number, overrideCurrency?: Currency) => {
    const target = overrideCurrency || selectedCurrency;
    return CurrencyService.formatMoney({
      amountUsd: amountUSD,
      displayCurrency: target,
      exchangeRate: exchangeRates[target]
    });
  }, [selectedCurrency, exchangeRates]);

  const refreshRates = useCallback(async () => {
    setLoading(true);
    const updated = await fetchLiveExchangeRates();
    setRateDetails(updated);
    setLoading(false);
  }, []);

  // Backward compatibility
  const convertFromUYU = useCallback((amountUYU: number, currency: Currency) => {
    const uyuRate = exchangeRates.UYU || 40.0835;
    const usdEquivalent = amountUYU / uyuRate;
    return (usdEquivalent * (exchangeRates[currency] || 1.0));
  }, [exchangeRates]);

  const getFxRateUsdToArs = useCallback(() => {
    return exchangeRates.ARS || FALLBACK_RATES.ARS;
  }, [exchangeRates]);

  const convertUSDToARS = useCallback((amountUSD: number) => {
    return amountUSD * getFxRateUsdToArs();
  }, [getFxRateUsdToArs]);

  const convertARSToUSD = useCallback((amountARS: number) => {
    const rate = getFxRateUsdToArs();
    if (!rate || rate === 0) return 0;
    return Number((amountARS / rate).toFixed(2));
  }, [getFxRateUsdToArs]);

  const value = useMemo(() => ({
    selectedCurrency,
    setSelectedCurrency,
    exchangeRates,
    exchangeRateDetails: rateDetails,
    loading,
    formatCurrencyPrice,
    convertUsdToDisplay,
    refreshRates,
    convertFromUYU,
    convertUSDToARS,
    convertARSToUSD,
    getFxRateUsdToArs
  }), [
    selectedCurrency,
    setSelectedCurrency,
    exchangeRates,
    rateDetails,
    loading,
    formatCurrencyPrice,
    convertUsdToDisplay,
    refreshRates,
    convertFromUYU,
    convertUSDToARS,
    convertARSToUSD,
    getFxRateUsdToArs
  ]);

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
}
