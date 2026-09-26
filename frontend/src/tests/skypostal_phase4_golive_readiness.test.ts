import { describe, it, expect } from 'vitest';
import { resolveMarket, isSkyPostalMarket, INITIAL_DEFAULT_MARKETS } from '../lib/marketEngine/marketEngine';

describe('SkyPostal Phase 4 - Chile Go-Live Readiness Gate', () => {
  it('verifies Chile is in READY_FOR_LIVE state and routed to SkyPostal in sandbox mode', () => {
    const chile = INITIAL_DEFAULT_MARKETS.find(m => m.country_code === 'CL');
    expect(chile).toBeDefined();
    expect(chile?.market_status).toBe('READY_FOR_LIVE');
    expect(chile?.logistics_mode).toBe('SKYPOSTAL');
    expect(chile?.provider_environment).toBe('test');
    expect(chile?.checkout_enabled).toBe(false);
  });

  it('verifies that READY_FOR_LIVE is recognized as an active SkyPostal market in Sandbox/Staff mode', () => {
    const resolved = resolveMarket('CL', INITIAL_DEFAULT_MARKETS);
    // It is NOT live for public checkout without explicit transition
    expect(resolved.canCheckout).toBe(false);
    expect(resolved.isReadyForLive).toBe(true);
    expect(resolved.canBrowse).toBe(true);

    // But it routes correctly to SKYPOSTAL provider
    expect(resolved.logisticsMode).toBe('SKYPOSTAL');
    expect(isSkyPostalMarket(resolved)).toBe(true);
  });

  it('verifies that Import Hub countries remain isolated and unaffected', () => {
    const uruguay = resolveMarket('UY', INITIAL_DEFAULT_MARKETS);
    expect(uruguay.logisticsMode).toBe('IMPORT_HUB');
    expect(uruguay.marketStatus).toBe('LIVE');
    expect(uruguay.canCheckout).toBe(true);

    const argentina = resolveMarket('AR', INITIAL_DEFAULT_MARKETS);
    expect(argentina.logisticsMode).toBe('IMPORT_HUB');
    expect(argentina.marketStatus).toBe('LIVE');
    expect(argentina.canCheckout).toBe(true);
  });

  it('validates 10-point checklist in Chile market metadata', () => {
    const chile = INITIAL_DEFAULT_MARKETS.find(m => m.country_code === 'CL');
    const metadata = chile?.metadata as { readiness_checklist?: Record<string, boolean> };
    expect(metadata).toBeDefined();
    expect(metadata.readiness_checklist).toBeDefined();

    const expectedChecks = [
      'compliance_ready',
      'rates_ready',
      'fuel_ready',
      'pricing_ready',
      'checkout_ready',
      'api_ready',
      'tracking_ready',
      'security_ready',
      'financial_ready',
      'e2e_certified',
      'kill_switch_available'
    ];

    expectedChecks.forEach(checkKey => {
      expect(metadata.readiness_checklist?.[checkKey]).toBe(true);
    });
  });
});
