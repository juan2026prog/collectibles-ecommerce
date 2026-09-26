import { describe, it, expect } from 'vitest';
import { resolveMarket, isSkyPostalMarket, INITIAL_DEFAULT_MARKETS } from '../lib/marketEngine/marketEngine';

describe('SkyPostal Multi-Country Admin Control Matrix', () => {
  const skypostalCountries = ['CL', 'PE', 'BR', 'CO', 'EC', 'MX'];

  it('validates that all 6 SkyPostal countries exist in INITIAL_DEFAULT_MARKETS', () => {
    skypostalCountries.forEach(code => {
      const market = INITIAL_DEFAULT_MARKETS.find(m => m.country_code === code);
      expect(market).toBeDefined();
      expect(market?.logistics_mode).toBe('SKYPOSTAL');
      expect(market?.provider).toBe('skypostal');
    });
  });

  it('validates that México (MX) is modeled with complete compliance and disabled by default', () => {
    const mexico = INITIAL_DEFAULT_MARKETS.find(m => m.country_code === 'MX');
    expect(mexico).toBeDefined();
    expect(mexico?.market_status).toBe('DISABLED');
    expect(mexico?.public_enabled).toBe(false);
    expect(mexico?.checkout_enabled).toBe(false);
    expect(mexico?.preview_enabled).toBe(false);

    const resolved = resolveMarket('MX', INITIAL_DEFAULT_MARKETS);
    expect(resolved.isDisabled).toBe(true);
    expect(resolved.canCheckout).toBe(false);
    expect(resolved.canBrowse).toBe(false);
  });

  it('validates that Peru, Brazil, Colombia, and Ecuador are in PREVIEW mode by default', () => {
    ['PE', 'BR', 'CO', 'EC'].forEach(code => {
      const market = INITIAL_DEFAULT_MARKETS.find(m => m.country_code === code);
      expect(market?.market_status).toBe('PREVIEW');
      expect(market?.preview_enabled).toBe(true);
      expect(market?.public_enabled).toBe(false);
      expect(market?.checkout_enabled).toBe(false);

      const resolved = resolveMarket(code, INITIAL_DEFAULT_MARKETS);
      expect(resolved.isPreview).toBe(true);
      expect(resolved.canBrowse).toBe(true);
      expect(resolved.canCheckout).toBe(false);
    });
  });

  it('validates that Chile (CL) is in audited PREVIEW state by default', () => {
    const chile = INITIAL_DEFAULT_MARKETS.find(m => m.country_code === 'CL');
    expect(chile?.market_status).toBe('PREVIEW');
    expect(chile?.preview_enabled).toBe(true);
    expect(chile?.checkout_enabled).toBe(false);
  });

  it('validates that Import Hub countries (UY, AR) remain 100% LIVE and isolated', () => {
    ['UY', 'AR'].forEach(code => {
      const market = INITIAL_DEFAULT_MARKETS.find(m => m.country_code === code);
      expect(market?.logistics_mode).toBe('IMPORT_HUB');
      expect(market?.market_status).toBe('LIVE');
      expect(market?.public_enabled).toBe(true);
      expect(market?.checkout_enabled).toBe(true);

      const resolved = resolveMarket(code, INITIAL_DEFAULT_MARKETS);
      expect(resolved.isLive).toBe(true);
      expect(resolved.canCheckout).toBe(true);
      expect(isSkyPostalMarket(resolved)).toBe(false);
    });
  });
});
