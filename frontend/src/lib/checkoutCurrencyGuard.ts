// frontend/src/lib/checkoutCurrencyGuard.ts
// Pure currency and market-authorization guards for Checkout UI.
// Prevents cross-currency miscalculations (e.g., applying ARS/USD rate to UYU totals)
// and prevents GeoIP or manual selection from enabling checkout for non-LIVE markets.

import type { MarketResolution } from './marketEngine/marketTypes';

export type CanonicalCartCurrency = 'UYU' | 'USD';

/**
 * Converts a checkout total denominated in its canonical source currency ('UYU' | 'USD')
 * into its USD equivalent using the authoritative USD-based exchangeRates map.
 * Never applies the ARS rate to a UYU amount.
 */
export function resolveCheckoutUsdEquivalent(
  amount: number,
  sourceCurrency: CanonicalCartCurrency,
  exchangeRates: Record<string, number>
): number | null {
  if (!Number.isFinite(amount) || amount < 0) {
    return null;
  }
  if (sourceCurrency === 'USD') {
    return Number(amount.toFixed(2));
  }
  const uyuPerUsd = Number(exchangeRates?.UYU);
  if (!Number.isFinite(uyuPerUsd) || uyuPerUsd <= 0) {
    return null;
  }
  return Number((amount / uyuPerUsd).toFixed(2));
}

/**
 * Determines whether checkout is allowed for a resolved market.
 * Fail-closed: requires LIVE status, checkout_enabled === true, and kill_switch !== true.
 */
export function isMarketCheckoutAuthorized(market: MarketResolution | null | undefined): boolean {
  if (!market) return false;
  if (market.metadata?.kill_switch === true) return false;
  return market.isLive === true && market.canCheckout === true;
}

/**
 * Determines whether GeoIP auto-detection may switch the Checkout destination country.
 * Only switches if the detected market is explicitly authorized for live checkout.
 */
export function shouldGeoIpSwitchCountry(
  detectedCountryCode: string | null | undefined,
  hasManualSelection: boolean,
  resolvedMarket: MarketResolution | null | undefined
): boolean {
  if (hasManualSelection) return false;
  if (!detectedCountryCode) return false;
  return isMarketCheckoutAuthorized(resolvedMarket);
}
