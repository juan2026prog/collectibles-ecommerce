import { describe, it, expect } from 'vitest';
import { resolvePayPalChargeFromRate, type ExchangeRateRow } from '../../../supabase/functions/_shared/paypal-fx';
import { resolveMarketForCountry } from '../../../supabase/functions/_shared/market-engine/index';
import { resolveMarket, INITIAL_DEFAULT_MARKETS } from '../lib/marketEngine/marketEngine';
import {
  resolveCheckoutUsdEquivalent,
  isMarketCheckoutAuthorized,
  shouldGeoIpSwitchCountry,
} from '../lib/checkoutCurrencyGuard';
import {
  calculateConfigurableArgentinaQuote,
  type DeblexTariffSnapshot,
} from '../lib/argentina/configurableTaxAndTariff';

describe('P0/P1 Hardening — PayPal Authoritative FX Conversion', () => {
  const verifiedUyuRate: ExchangeRateRow = {
    base_currency: 'USD',
    quote_currency: 'UYU',
    rate: 42.5,
    status: 'MANUAL_OVERRIDE',
    is_active: true,
    is_manual_override: true,
    provider: 'MANUAL_IMPORT_BROU',
    source_name: 'brou_manual',
    effective_at: '2026-11-18T00:00:00Z',
    expires_at: '2026-07-17T00:00:00Z',
    override_expires_at: null,
  };

  it('converts UYU to USD using authoritative DB rate (never hardcoded /42)', () => {
    const res = resolvePayPalChargeFromRate(4250, 'UYU', verifiedUyuRate);
    expect(res.originalCurrency).toBe('UYU');
    expect(res.paypalCurrency).toBe('USD');
    expect(res.paypalAmount).toBe('100.00');
    expect(res.fxRate).toBe(42.5);
    expect(res.fxRateSource).toBe('MANUAL_IMPORT_BROU:brou_manual');
  });

  it('handles decimal UYU amounts accurately', () => {
    const res = resolvePayPalChargeFromRate(1477.5, 'UYU', {
      ...verifiedUyuRate,
      rate: 40.0835,
      status: 'VERIFIED',
      is_manual_override: false,
      expires_at: '2099-01-01T00:00:00Z',
    });
    expect(res.paypalAmount).toBe('36.86');
  });

  it('passes USD through without reconversion (fxRate = 1)', () => {
    const res = resolvePayPalChargeFromRate(89.95, 'USD', null);
    expect(res.paypalCurrency).toBe('USD');
    expect(res.paypalAmount).toBe('89.95');
    expect(res.fxRate).toBe(1);
    expect(res.fxRateSource).toBe('NATIVE_USD');
  });

  it('fails closed when USD/UYU rate is missing, inactive, unverified, or expired', () => {
    expect(() => resolvePayPalChargeFromRate(1000, 'UYU', null)).toThrow(/PAYPAL_FX_MISSING/);
    expect(() => resolvePayPalChargeFromRate(1000, 'UYU', { ...verifiedUyuRate, is_active: false })).toThrow(/PAYPAL_FX_INACTIVE/);
    expect(() => resolvePayPalChargeFromRate(1000, 'UYU', { ...verifiedUyuRate, status: 'STALE' })).toThrow(/PAYPAL_FX_UNVERIFIED/);
    expect(() =>
      resolvePayPalChargeFromRate(
        1000,
        'UYU',
        {
          ...verifiedUyuRate,
          status: 'VERIFIED',
          is_manual_override: false,
          expires_at: '2025-01-01T00:00:00Z',
        },
        Date.parse('2026-11-19T00:00:00Z')
      )
    ).toThrow(/PAYPAL_FX_EXPIRED/);
  });

  it('rejects zero or negative amounts', () => {
    expect(() => resolvePayPalChargeFromRate(0, 'UYU', verifiedUyuRate)).toThrow(/PAYPAL_INVALID_AMOUNT/);
    expect(() => resolvePayPalChargeFromRate(-50, 'USD', null)).toThrow(/PAYPAL_INVALID_AMOUNT/);
  });
});

describe('P0/P1 Hardening — Checkout Currency & GeoIP Guards', () => {
  const rates = { USD: 1, UYU: 42.5, ARS: 1552.2627 };

  it('converts UYU total to USD using UYU rate (47.06), NEVER ARS rate (1.29)', () => {
    const usd = resolveCheckoutUsdEquivalent(2000, 'UYU', rates);
    expect(usd).toBe(47.06);
  });

  it('keeps USD total unchanged when sourceCurrency is USD', () => {
    expect(resolveCheckoutUsdEquivalent(60, 'USD', rates)).toBe(60);
  });

  it('blocks GeoIP auto-switch to Argentina while AR market is DISABLED', () => {
    const arMarket = resolveMarket('AR', INITIAL_DEFAULT_MARKETS);
    expect(isMarketCheckoutAuthorized(arMarket)).toBe(false);
    expect(shouldGeoIpSwitchCountry('AR', false, arMarket)).toBe(false);
  });

  it('preserves Uruguay LIVE checkout authorization', () => {
    const uyMarket = resolveMarket('UY', INITIAL_DEFAULT_MARKETS);
    expect(isMarketCheckoutAuthorized(uyMarket)).toBe(true);
  });
});

describe('P0/P1 Hardening — Market Engine Fail-Closed & Kill Switch', () => {
  it('frontend resolveMarket disables checkout when kill_switch is true even on LIVE market', () => {
    const markets = INITIAL_DEFAULT_MARKETS.map(m =>
      m.country_code === 'CL'
        ? { ...m, market_status: 'LIVE' as const, checkout_enabled: true, metadata: { ...m.metadata, kill_switch: true } }
        : m
    );
    const cl = resolveMarket('CL', markets);
    expect(cl.isLive).toBe(true);
    expect(cl.canCheckout).toBe(false);
  });

  it('backend resolveMarketForCountry NEVER defaults AR to LIVE when DB is unavailable', async () => {
    const arFallback = await resolveMarketForCountry(null, 'AR');
    expect(arFallback.marketStatus).toBe('DISABLED');
    expect(arFallback.canCheckout).toBe(false);
    expect(arFallback.isDisabled).toBe(true);
  });

  it('backend resolveMarketForCountry fails closed on DB query error for non-UY markets', async () => {
    const failingSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: { message: 'connection timeout' } }),
          }),
        }),
      }),
    };
    const cl = await resolveMarketForCountry(failingSupabase, 'CL');
    expect(cl.canCheckout).toBe(false);
    expect(cl.marketStatus).toBe('DISABLED');
  });

  it('backend resolveMarketForCountry enforces kill_switch even if DB says LIVE', async () => {
    const killSwitchedSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                country_code: 'AR',
                country_name: 'Argentina',
                currency: 'ARS',
                logistics_mode: 'IMPORT_HUB',
                market_status: 'LIVE',
                public_enabled: true,
                checkout_enabled: true,
                provider: 'import_hub',
                metadata: { kill_switch: true },
              },
              error: null,
            }),
          }),
        }),
      }),
    };
    const ar = await resolveMarketForCountry(killSwitchedSupabase, 'AR');
    expect(ar.canCheckout).toBe(false);
    expect(ar.isDisabled).toBe(true);
  });
});

describe('P1 Preparation — Configurable Argentina Deblex Tariff & Tax Engine', () => {
  const stagingTariff: DeblexTariffSnapshot = {
    versionLabel: 'v1.0_20261015',
    internationalFreightUsdPerKg: 19,
    logisticPackCabaUsd: 20,
    logisticPackAmbaUsd: 34,
    logisticPackInteriorUsd: 43,
    maxFobModalidadA: 400,
    maxWeightModalidadAKg: 50,
    maxUnitsPerSpeciesModalidadA: 3,
    maxOperationsPerYearModalidadA: 5,
  };

  it('fails closed in LIVE_CHECKOUT when fiscal regime is not certified', () => {
    expect(() =>
      calculateConfigurableArgentinaQuote({
        fobUsd: 100,
        weightKg: 1,
        unitsInSpecies: 1,
        zone: 'CABA',
        tariff: stagingTariff,
        taxPolicy: {
          taxRegimeCertified: false,
          taxCollector: 'UNASSIGNED',
          vatRatePercent: null,
          dutyRatePercent: null,
        },
        mode: 'LIVE_CHECKOUT',
      })
    ).toThrow(/AR_TAX_REGIME_UNCERTIFIED/);
  });

  it('calculates Deblex tariffs from DB config without arbitrary hardcoded tax rates', () => {
    const quote = calculateConfigurableArgentinaQuote({
      fobUsd: 100,
      weightKg: 1.5,
      unitsInSpecies: 2,
      zone: 'AMBA',
      tariff: stagingTariff,
      taxPolicy: {
        taxRegimeCertified: false,
        taxCollector: 'COURIER_DEBLEX',
        vatRatePercent: null,
        dutyRatePercent: null,
      },
      mode: 'ESTIMATE_PREVIEW',
    });
    expect(quote.eligibleModalidadA).toBe(true);
    expect(quote.freightUsd).toBe(28.5);
    expect(quote.logisticPackUsd).toBe(34);
    expect(quote.estimatedTaxCollectedAtCheckoutUsd).toBe(0);
    expect(quote.estimatedTotalCheckoutUsd).toBe(162.5);
  });

  it('flags Modalidad A violations (>400 FOB, >3 units)', () => {
    const quote = calculateConfigurableArgentinaQuote({
      fobUsd: 450,
      weightKg: 2,
      unitsInSpecies: 4,
      zone: 'INTERIOR',
      tariff: stagingTariff,
      taxPolicy: {
        taxRegimeCertified: false,
        taxCollector: 'COURIER_DEBLEX',
        vatRatePercent: null,
        dutyRatePercent: null,
      },
      mode: 'ESTIMATE_PREVIEW',
    });
    expect(quote.eligibleModalidadA).toBe(false);
    expect(quote.violations.length).toBe(2);
  });
});
