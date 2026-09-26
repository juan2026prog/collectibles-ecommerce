// frontend/src/tests/market_engine.test.ts

import { describe, it, expect } from 'vitest';
import { resolveMarket, isSkyPostalMarket, isMarketInPreview, INITIAL_DEFAULT_MARKETS } from '../lib/marketEngine/marketEngine';

describe('Market Engine — Phase 1 Destination Resolution', () => {
  it('resolves Uruguay (UY) to IMPORT_HUB in LIVE state', () => {
    const market = resolveMarket('UY', INITIAL_DEFAULT_MARKETS);
    expect(market.countryCode).toBe('UY');
    expect(market.countryName).toBe('Uruguay');
    expect(market.logisticsMode).toBe('IMPORT_HUB');
    expect(market.marketStatus).toBe('LIVE');
    expect(market.canCheckout).toBe(true);
    expect(market.canBrowse).toBe(true);
    expect(market.isPreview).toBe(false);
    expect(market.currency).toBe('UYU');
    expect(isSkyPostalMarket(market)).toBe(false);
  });

  it('resolves Argentina (AR) to IMPORT_HUB in LIVE state', () => {
    const market = resolveMarket('AR', INITIAL_DEFAULT_MARKETS);
    expect(market.countryCode).toBe('AR');
    expect(market.countryName).toBe('Argentina');
    expect(market.logisticsMode).toBe('IMPORT_HUB');
    expect(market.marketStatus).toBe('LIVE');
    expect(market.canCheckout).toBe(true);
    expect(market.canBrowse).toBe(true);
    expect(market.currency).toBe('ARS');
    expect(isSkyPostalMarket(market)).toBe(false);
  });

  it('resolves Chile (CL) to SKYPOSTAL in PREVIEW state', () => {
    const market = resolveMarket('CL', INITIAL_DEFAULT_MARKETS);
    expect(market.countryCode).toBe('CL');
    expect(market.countryName).toBe('Chile');
    expect(market.logisticsMode).toBe('SKYPOSTAL');
    expect(market.marketStatus).toBe('PREVIEW');
    expect(market.canCheckout).toBe(false); // No real purchases allowed in PREVIEW
    expect(market.canBrowse).toBe(true); // Super Admin and preview navigation allowed
    expect(market.isPreview).toBe(true);
    expect(isMarketInPreview(market)).toBe(true);
    expect(isSkyPostalMarket(market)).toBe(true);
    expect(market.currency).toBe('CLP');
  });

  it('resolves Perú (PE) to SKYPOSTAL in PREVIEW state', () => {
    const market = resolveMarket('PE', INITIAL_DEFAULT_MARKETS);
    expect(market.countryCode).toBe('PE');
    expect(market.logisticsMode).toBe('SKYPOSTAL');
    expect(market.marketStatus).toBe('PREVIEW');
    expect(market.canCheckout).toBe(false);
    expect(market.isPreview).toBe(true);
    expect(market.currency).toBe('PEN');
  });

  it('resolves Brasil (BR) to SKYPOSTAL in PREVIEW state', () => {
    const market = resolveMarket('BR', INITIAL_DEFAULT_MARKETS);
    expect(market.countryCode).toBe('BR');
    expect(market.logisticsMode).toBe('SKYPOSTAL');
    expect(market.marketStatus).toBe('PREVIEW');
    expect(market.canCheckout).toBe(false);
    expect(market.isPreview).toBe(true);
    expect(market.currency).toBe('BRL');
  });

  it('resolves Colombia (CO) to SKYPOSTAL in PREVIEW state', () => {
    const market = resolveMarket('CO', INITIAL_DEFAULT_MARKETS);
    expect(market.countryCode).toBe('CO');
    expect(market.logisticsMode).toBe('SKYPOSTAL');
    expect(market.marketStatus).toBe('PREVIEW');
    expect(market.canCheckout).toBe(false);
    expect(market.isPreview).toBe(true);
    expect(market.currency).toBe('COP');
  });

  it('resolves Ecuador (EC) to SKYPOSTAL in PREVIEW state', () => {
    const market = resolveMarket('EC', INITIAL_DEFAULT_MARKETS);
    expect(market.countryCode).toBe('EC');
    expect(market.logisticsMode).toBe('SKYPOSTAL');
    expect(market.marketStatus).toBe('PREVIEW');
    expect(market.canCheckout).toBe(false);
    expect(market.isPreview).toBe(true);
    expect(market.currency).toBe('USD');
  });

  it('resolves México (MX) to SKYPOSTAL in DISABLED state', () => {
    const market = resolveMarket('MX', INITIAL_DEFAULT_MARKETS);
    expect(market.countryCode).toBe('MX');
    expect(market.logisticsMode).toBe('SKYPOSTAL');
    expect(market.marketStatus).toBe('DISABLED');
    expect(market.canCheckout).toBe(false);
    expect(market.canBrowse).toBe(false);
    expect(market.isDisabled).toBe(true);
    expect(market.isPreview).toBe(false);
    expect(market.currency).toBe('MXN');
  });

  it('handles lowercase or unknown countries with safe fallback', () => {
    const marketUpper = resolveMarket('cl', INITIAL_DEFAULT_MARKETS);
    expect(marketUpper.countryCode).toBe('CL');
    expect(marketUpper.logisticsMode).toBe('SKYPOSTAL');

    const marketUnknown = resolveMarket('ZZ', INITIAL_DEFAULT_MARKETS);
    expect(marketUnknown.countryCode).toBe('ZZ');
    expect(marketUnknown.isDisabled).toBe(true);
    expect(marketUnknown.canCheckout).toBe(false);
  });
});
