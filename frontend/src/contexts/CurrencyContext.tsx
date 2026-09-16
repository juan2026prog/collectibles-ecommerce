import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Currency, 
  FALLBACK_RATES, 
  getExchangeRatesSync, 
  fetchUnifiedExchangeRates, 
  subscribeToExchangeRates 
} from '../services/exchangeRates';

export type { Currency };

interface CurrencyContextProps {
  selectedCurrency: Currency;
  setSelectedCurrency: (currency: Currency) => void;
  exchangeRates: Record<Currency, number>;
  loading: boolean;
  formatCurrencyPrice: (amountUYU: number, overrideCurrency?: Currency) => string;
  convertFromUYU: (amountUYU: number, currency: Currency) => number;
  convertUSDToARS: (amountUSD: number) => number;
  convertARSToUSD: (amountARS: number) => number;
  getFxRateUsdToArs: () => number;
}

const CurrencyContext = createContext<CurrencyContextProps | undefined>(undefined);

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [selectedCurrency, setSelectedCurrencyState] = useState<Currency>(() => {
    return (localStorage.getItem('collectibles_currency') as Currency) || 'UYU';
  });

  const [exchangeRates, setExchangeRates] = useState<Record<Currency, number>>(() => getExchangeRatesSync());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToExchangeRates((rates) => {
      setExchangeRates(rates);
      setLoading(false);
    });

    // Defer non-critical exchange rate refresh until after initial render
    const timer = setTimeout(() => {
      fetchUnifiedExchangeRates().then(rates => {
        setExchangeRates(rates);
        setLoading(false);
      });
    }, 2000);

    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  const setSelectedCurrency = useCallback((currency: Currency) => {
    setSelectedCurrencyState(currency);
    localStorage.setItem('collectibles_currency', currency);
  }, []);

  const convertFromUYU = useCallback((amountUYU: number, currency: Currency) => {
    return amountUYU * (exchangeRates[currency] || FALLBACK_RATES[currency]);
  }, [exchangeRates]);

  const getFxRateUsdToArs = useCallback(() => {
    const usdRate = exchangeRates.USD || FALLBACK_RATES.USD;
    const arsRate = exchangeRates.ARS || FALLBACK_RATES.ARS;
    if (!usdRate || usdRate === 0) return 1140;
    return Math.round(arsRate / usdRate);
  }, [exchangeRates]);

  const convertUSDToARS = useCallback((amountUSD: number) => {
    return amountUSD * getFxRateUsdToArs();
  }, [getFxRateUsdToArs]);

  const convertARSToUSD = useCallback((amountARS: number) => {
    const fxRate = getFxRateUsdToArs();
    if (!fxRate || fxRate === 0) return 0;
    return Number((amountARS / fxRate).toFixed(2));
  }, [getFxRateUsdToArs]);

  const formatCurrencyPrice = useCallback((amountUYU: number, overrideCurrency?: Currency) => {
    const targetCurrency = overrideCurrency || selectedCurrency;
    const converted = convertFromUYU(amountUYU, targetCurrency);
    
    const formatter = new Intl.NumberFormat('es-UY', {
      style: 'decimal',
      maximumFractionDigits: targetCurrency === 'USD' ? 2 : 0,
      minimumFractionDigits: targetCurrency === 'USD' ? 2 : 0
    });
    
    const formattedNumber = formatter.format(converted);
    
    switch (targetCurrency) {
      case 'UYU':
        return `$${'\u00A0'}${formattedNumber}`;
      case 'USD':
        return `USD${'\u00A0'}${formattedNumber}`;
      case 'ARS':
        return `ARS${'\u00A0'}${formattedNumber}`;
      case 'BRL':
        return `BRL${'\u00A0'}${formattedNumber}`;
      default:
        return `$${'\u00A0'}${formattedNumber}`;
    }
  }, [convertFromUYU, selectedCurrency]);

  const value = useMemo(() => ({
    selectedCurrency,
    setSelectedCurrency,
    exchangeRates,
    loading,
    formatCurrencyPrice,
    convertFromUYU,
    convertUSDToARS,
    convertARSToUSD,
    getFxRateUsdToArs
  }), [selectedCurrency, setSelectedCurrency, exchangeRates, loading, formatCurrencyPrice, convertFromUYU, convertUSDToARS, convertARSToUSD, getFxRateUsdToArs]);

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
