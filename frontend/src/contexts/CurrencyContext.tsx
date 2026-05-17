import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';

export type Currency = 'UYU' | 'USD' | 'ARS' | 'BRL';

interface CurrencyContextProps {
  selectedCurrency: Currency;
  setSelectedCurrency: (currency: Currency) => void;
  exchangeRates: Record<Currency, number>;
  loading: boolean;
  formatCurrencyPrice: (amountUYU: number) => string;
  convertFromUYU: (amountUYU: number, currency: Currency) => number;
}

const CurrencyContext = createContext<CurrencyContextProps | undefined>(undefined);

const FALLBACK_RATES: Record<Currency, number> = {
  UYU: 1,
  USD: 1 / 39, // Manual fallback based on approximate recent rate
  ARS: 25,     // Manual fallback based on approximate recent rate
  BRL: 1 / 7,  // Manual fallback based on approximate recent rate
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

    // Fetch from free API
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
        // Silently use fallback (which is already set in state)
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const setSelectedCurrency = useCallback((currency: Currency) => {
    setSelectedCurrencyState(currency);
    localStorage.setItem('collectibles_currency', currency);
  }, []);

  const convertFromUYU = useCallback((amountUYU: number, currency: Currency) => {
    return amountUYU * exchangeRates[currency];
  }, [exchangeRates]);

  const formatCurrencyPrice = useCallback((amountUYU: number) => {
    const converted = convertFromUYU(amountUYU, selectedCurrency);
    
    // Formatting specifics:
    // UYU: $ 1.990
    // USD: USD 49
    // ARS: ARS 59.900
    // BRL: BRL 279
    
    // We want to avoid long decimals and show the correct prefix.
    const formatter = new Intl.NumberFormat('es-UY', {
      style: 'decimal',
      maximumFractionDigits: 0,
      minimumFractionDigits: 0
    });
    
    const formattedNumber = formatter.format(converted);
    
    switch (selectedCurrency) {
      case 'UYU':
        return `$ ${formattedNumber}`;
      case 'USD':
        return `USD ${formattedNumber}`;
      case 'ARS':
        return `ARS ${formattedNumber}`;
      case 'BRL':
        return `BRL ${formattedNumber}`;
      default:
        return `$ ${formattedNumber}`;
    }
  }, [convertFromUYU, selectedCurrency]);

  const value = useMemo(() => ({
    selectedCurrency,
    setSelectedCurrency,
    exchangeRates,
    loading,
    formatCurrencyPrice,
    convertFromUYU
  }), [selectedCurrency, setSelectedCurrency, exchangeRates, loading, formatCurrencyPrice, convertFromUYU]);

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
