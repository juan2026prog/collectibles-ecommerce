// frontend/src/tests/importhub_regression.test.ts

import { describe, it, expect } from 'vitest';
import { resolveMarketRouting } from '../lib/marketEngine/marketEngine';

describe('SkyPostal & Import Hub Isolation — Zero Regression Test', () => {
  it('should route Uruguay (UY) and Argentina (AR) exclusively to Import Hub', () => {
    const uyRouting = resolveMarketRouting('UY');
    expect(uyRouting.isConfigured).toBe(true);
    expect(uyRouting.logisticsMode).toBe('IMPORT_HUB');
    expect(uyRouting.provider).toBe('import_hub');
    expect(uyRouting.status).toBe('LIVE');

    const arRouting = resolveMarketRouting('AR');
    expect(arRouting.isConfigured).toBe(true);
    expect(arRouting.logisticsMode).toBe('IMPORT_HUB');
    expect(arRouting.provider).toBe('import_hub');
    expect(arRouting.status).toBe('LIVE');
  });

  it('should route Chile (CL) and new international markets to SkyPostal without impacting Import Hub', () => {
    const clRouting = resolveMarketRouting('CL');
    expect(clRouting.isConfigured).toBe(true);
    expect(clRouting.logisticsMode).toBe('SKYPOSTAL');
    expect(clRouting.provider).toBe('skypostal');

    const peRouting = resolveMarketRouting('PE');
    expect(peRouting.isConfigured).toBe(true);
    expect(peRouting.logisticsMode).toBe('SKYPOSTAL');

    const ecRouting = resolveMarketRouting('EC');
    expect(ecRouting.isConfigured).toBe(true);
    expect(ecRouting.logisticsMode).toBe('SKYPOSTAL');
  });
});
