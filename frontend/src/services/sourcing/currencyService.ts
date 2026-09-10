import type { CurrencyCode, ExchangeRate, RateFreshnessStatus } from '../../types/sourcingLatam';
import { supabase } from '../../lib/supabase';

const DEFAULT_RATES: Record<CurrencyCode, number> = {
  USD: 1.0,
  UYU: 40.50,
  ARS: 1250.0,
  CLP: 940.0,
  BRL: 5.60,
  PEN: 3.75,
  COP: 4100.0,
  MXN: 19.80,
  PYG: 7600.0,
};

export class CurrencyService {
  private static instance: CurrencyService;
  private ratesCache: Map<CurrencyCode, ExchangeRate> = new Map();

  private constructor() {
    // Populate defaults
    (Object.keys(DEFAULT_RATES) as CurrencyCode[]).forEach(currency => {
      this.ratesCache.set(currency, {
        base_currency: 'USD',
        target_currency: currency,
        rate: DEFAULT_RATES[currency],
        source: 'fallback_reference',
        status: 'ACTUALIZADO',
        updated_at: new Date().toISOString(),
      });
    });
  }

  public static getInstance(): CurrencyService {
    if (!CurrencyService.instance) {
      CurrencyService.instance = new CurrencyService();
    }
    return CurrencyService.instance;
  }

  public async syncRatesFromDb(): Promise<void> {
    try {
      const { data } = await supabase
        .from('sourcing_exchange_rates')
        .select('*');

      if (data && data.length > 0) {
        data.forEach((row: any) => {
          const target = row.target_currency as CurrencyCode;
          if (target in DEFAULT_RATES) {
            const updatedAt = new Date(row.updated_at);
            const hoursOld = (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60);

            let freshness: RateFreshnessStatus = 'ACTUALIZADO';
            if (hoursOld > 72) {
              freshness = 'NO_DISPONIBLE';
            } else if (hoursOld > 24) {
              freshness = 'DESACTUALIZADO';
            }

            this.ratesCache.set(target, {
              base_currency: 'USD',
              target_currency: target,
              rate: Number(row.rate),
              source: row.source || 'db',
              status: freshness,
              updated_at: row.updated_at,
            });
          }
        });
      }
    } catch {
      // Retain in-memory defaults
    }
  }

  public getRate(currency: CurrencyCode): ExchangeRate {
    return (
      this.ratesCache.get(currency) || {
        base_currency: 'USD',
        target_currency: currency,
        rate: DEFAULT_RATES[currency] || 1.0,
        source: 'fallback',
        status: 'NO_DISPONIBLE',
        updated_at: new Date().toISOString(),
      }
    );
  }

  public convertUsdToLocal(amountUsd: number, targetCurrency: CurrencyCode): { amountLocal: number; rate: number; status: RateFreshnessStatus } {
    const exchange = this.getRate(targetCurrency);
    const amountLocal = Math.round(amountUsd * exchange.rate * 100) / 100;
    return {
      amountLocal,
      rate: exchange.rate,
      status: exchange.status,
    };
  }

  public convertLocalToUsd(amountLocal: number, sourceCurrency: CurrencyCode): { amountUsd: number; rate: number; status: RateFreshnessStatus } {
    const exchange = this.getRate(sourceCurrency);
    if (exchange.rate === 0) return { amountUsd: 0, rate: 0, status: 'NO_DISPONIBLE' };
    const amountUsd = Math.round((amountLocal / exchange.rate) * 100) / 100;
    return {
      amountUsd,
      rate: exchange.rate,
      status: exchange.status,
    };
  }
}

export const currencyService = CurrencyService.getInstance();
