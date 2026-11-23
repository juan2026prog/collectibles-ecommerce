import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { inspectCartCurrencies } from '../lib/priceResolver';
import { resolveMarket, isSkyPostalMarket, INITIAL_DEFAULT_MARKETS } from '../lib/marketEngine/marketEngine';
import { calculateDeblexShipping, DEFAULT_DEBLEX_TARIFFS } from '../lib/argentina/pricingEngine';

const REPO_ROOT = path.resolve(__dirname, '../../..');

describe('FASE D — Certificación Circuito Uruguay Miami y Carrito Mixto', () => {
  it('detects mixed local (UYU) + vendor (UYU) + international (USD) cart and enforces currency separation', () => {
    const mixedCart = [
      { price: 2500, quantity: 1, currency: 'UYU', is_international: false }, // Collectibles Oficial
      { price: 1890, quantity: 1, currency: 'UYU', is_international: false }, // Vendor local
      { price: 89.99, quantity: 1, currency: 'USD', is_international: true }, // Internacional
    ];
    const inspection = inspectCartCurrencies(mixedCart);
    expect(inspection.isMixed).toBe(true);
    expect(inspection.canonicalCurrency).toBeNull();
  });

  it('preserves native UYU for local-only cart (Oficial + Vendor) and USD for international-only cart', () => {
    const localCart = inspectCartCurrencies([
      { price: 2500, quantity: 1, currency: 'UYU', is_international: false },
      { price: 1890, quantity: 2, currency: 'UYU', is_international: false },
    ]);
    expect(localCart.isMixed).toBe(false);
    expect(localCart.canonicalCurrency).toBe('UYU');

    const intlCart = inspectCartCurrencies([
      { price: 120, quantity: 1, currency: 'USD', is_international: true },
    ]);
    expect(intlCart.isMixed).toBe(false);
    expect(intlCart.canonicalCurrency).toBe('USD');
  });

  it('preserves Uruguay Miami courier circuit (international_courier_direct) and mixed-cart guard in Checkout.tsx', () => {
    const checkoutSrc = fs.readFileSync(path.join(REPO_ROOT, 'frontend/src/pages/Checkout.tsx'), 'utf8');
    expect(checkoutSrc).toContain("id: 'international_courier_direct'");
    expect(checkoutSrc).toContain("name: 'Entrega en tu courier de Miami'");
    expect(checkoutSrc).toContain(".from('international_couriers')");
    expect(checkoutSrc).toContain('if (cartCurrencyInfo.isMixed)');
    expect(checkoutSrc).toContain('Los productos locales e internacionales deben comprarse por separado.');
  });
});

describe('FASE E — Certificación Argentina Deblex (Tarifario, Seguridad y Modo Simulación)', () => {
  it('validates historical Deblex tariff v1.0_20261015 calculations for CABA, AMBA, and INTERIOR', () => {
    expect(DEFAULT_DEBLEX_TARIFFS.international_freight_usd_per_kg).toBe(19);
    expect(DEFAULT_DEBLEX_TARIFFS.logistic_pack_caba_usd).toBe(20);
    expect(DEFAULT_DEBLEX_TARIFFS.logistic_pack_amba_usd).toBe(34);
    expect(DEFAULT_DEBLEX_TARIFFS.logistic_pack_interior_usd).toBe(43);
    expect(DEFAULT_DEBLEX_TARIFFS.max_fob_modalidad_a).toBe(400);
    expect(DEFAULT_DEBLEX_TARIFFS.max_weight_modalidad_a_kg).toBe(50);

    const caba = calculateDeblexShipping(2, 'CABA', DEFAULT_DEBLEX_TARIFFS);
    expect(caba.total_logistics_usd).toBe(58); // 2 * 19 + 20

    const amba = calculateDeblexShipping(2, 'AMBA', DEFAULT_DEBLEX_TARIFFS);
    expect(amba.total_logistics_usd).toBe(72); // 2 * 19 + 34

    const interior = calculateDeblexShipping(2, 'INTERIOR', DEFAULT_DEBLEX_TARIFFS);
    expect(interior.total_logistics_usd).toBe(81); // 2 * 19 + 43
  });

  it('protects /checkout/ar and /checkout/argentina with requireSuperAdmin and keeps simulation notice active', () => {
    const appSrc = fs.readFileSync(path.join(REPO_ROOT, 'frontend/src/App.tsx'), 'utf8');
    const arFlowSrc = fs.readFileSync(path.join(REPO_ROOT, 'frontend/src/components/argentina/ArgentinaCheckoutFlow.tsx'), 'utf8');

    expect(appSrc).toContain('<Route path="/checkout/ar" element={<ProtectedRoute requireSuperAdmin><ArgentinaCheckoutPage /></ProtectedRoute>} />');
    expect(appSrc).toContain('<Route path="/checkout/argentina" element={<ProtectedRoute requireSuperAdmin><ArgentinaCheckoutPage /></ProtectedRoute>} />');
    expect(arFlowSrc).toContain('Modo Simulación / Certificación');
  });
});

describe('FASE F — Certificación Enrutamiento Logístico Definitivo y Catálogo Global', () => {
  it('routes UY and AR outside SkyPostal, and routes CL/PE/CO/EC/BR/MX to SkyPostal without enabling live checkout', () => {
    const uy = resolveMarket('UY', INITIAL_DEFAULT_MARKETS);
    const ar = resolveMarket('AR', INITIAL_DEFAULT_MARKETS);
    expect(isSkyPostalMarket(uy)).toBe(false);
    expect(isSkyPostalMarket(ar)).toBe(false);
    expect(uy.marketStatus).toBe('LIVE');
    expect(ar.marketStatus).toBe('DISABLED');
    expect(ar.canCheckout).toBe(false);

    for (const code of ['CL', 'PE', 'CO', 'EC', 'BR', 'MX']) {
      const m = resolveMarket(code, INITIAL_DEFAULT_MARKETS);
      expect(isSkyPostalMarket(m)).toBe(true);
      expect(m.canCheckout).toBe(false);
      expect(m.isLive).toBe(false);
    }
  });

  it('keeps global international catalog free of arbitrary brand exclusions', () => {
    const tplSrc = fs.readFileSync(
      path.join(REPO_ROOT, 'frontend/src/pages/international/InternationalMarketTemplate.tsx'),
      'utf8'
    );
    expect(tplSrc).not.toMatch(/excludeBrands|blockedBrands|mattel|hasbro|funko/i);
  });
});
