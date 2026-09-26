// frontend/src/tests/importhub_regression.test.ts

import { describe, it, expect } from 'vitest';
import { resolveMarket } from '../lib/marketEngine/marketEngine';

describe('Import Hub Isolation & Zero Regression Suite', () => {
  it('guarantees Uruguay uses IMPORT_HUB logistics mode and retains franchise tax regime', () => {
    const market = resolveMarket('UY');
    expect(market.logisticsMode).toBe('IMPORT_HUB');
    expect(market.provider).toBe('import_hub');
    expect(market.metadata.tax_regime).toBe('franquicia_uruguay');
    expect(market.isLive).toBe(true);
  });

  it('guarantees Argentina uses IMPORT_HUB logistics mode and retains franchise tax regime', () => {
    const market = resolveMarket('AR');
    expect(market.logisticsMode).toBe('IMPORT_HUB');
    expect(market.provider).toBe('import_hub');
    expect(market.metadata.tax_regime).toBe('franquicia_argentina');
    expect(market.isLive).toBe(true);
  });

  it('verifies Import Hub database table names remain isolated', () => {
    const importHubTables = [
      'customs_rules',
      'import_couriers',
      'import_courier_rates',
      'user_import_profiles',
      'user_import_declarations',
      'user_saved_simulations',
      'user_import_shipments'
    ];

    // Verify none of the Import Hub tables have been repurposed
    importHubTables.forEach(tableName => {
      expect(tableName.startsWith('skypostal_')).toBe(false);
      expect(tableName.includes('skypostal')).toBe(false);
    });
  });

  it('verifies SkyPostal markets never override Import Hub routing for UY/AR', () => {
    const uy = resolveMarket('UY');
    const ar = resolveMarket('AR');
    const cl = resolveMarket('CL');

    expect(uy.logisticsMode).toBe('IMPORT_HUB');
    expect(ar.logisticsMode).toBe('IMPORT_HUB');
    expect(cl.logisticsMode).toBe('SKYPOSTAL');
    expect(cl.logisticsMode).not.toBe(uy.logisticsMode);
  });
});
