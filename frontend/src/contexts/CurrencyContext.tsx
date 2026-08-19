import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';

export type Currency = 'UYU' | 'USD' | 'ARS' | 'BRL';

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

const FALLBACK_RATES: Record<Currency, number> = {
  UYU: 1,
  USD: 1 / 40,   // 1 USD = 40 UYU
  ARS: 28.5,     // 1 UYU = 28.5 ARS (Implies ~1140 ARS per USD)
  BRL: 1 / 7,
};

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [selectedCurrency, setSelectedCurrencyState] = useState<Currency>(() => {
    return (localStorage.getItem('collectibles_currency') as Currency) || 'UYU';
  });

  const [exchangeRates, setExchangeRates] = useState<Record<Currency, number>>(FALLBACK_RATES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const CACHE_KEY = 'collectibles_exchange_rates';
    const CACHE_TS_KEY = 'collectibles_exchange_rates_updated_at';
    const CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours

    const cached = localStorage.getItem(CACHE_KEY);
    const cachedTs = localStorage.getItem(CACHE_TS_KEY);

    if (cached && cachedTs) {
      try {
        const ts = parseInt(cachedTs, 10);
        if (Date.now() - ts < CACHE_TTL) {
          setExchangeRates(JSON.parse(cached));
          setLoading(false);
          return;
        }
      } catch (e) {
        console.warn('Failed to parse cached exchange rates', e);
      }
    }

    const timer = setTimeout(() => {
      fetch('https://open.er-api.com/v6/latest/UYU')
        .then(res => res.json())
        .then(data => {
          if (data && data.rates) {
            const liveRates: Record<Currency, number> = {
              UYU: 1,
              USD: data.rates.USD || FALLBACK_RATES.USD,
              ARS: data.rates.ARS || FALLBACK_RATES.ARS,
              BRL: data.rates.BRL || FALLBACK_RATES.BRL,
            };
            setExchangeRates(liveRates);
            localStorage.setItem(CACHE_KEY, JSON.stringify(liveRates));
            localStorage.setItem(CACHE_TS_KEY, Date.now().toString());
          }
        })
        .catch((err) => {
          if (import.meta.env.DEV) {
            console.error('Exchange rate API unavailable, using fallback rates', err);
          }
        })
        .finally(() => {
          setLoading(false);
        });
    }, 2000);

    return () => clearTimeout(timer);
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
