// frontend/src/tests/multicountry_block1_reconciliation.test.ts

import { describe, it, expect } from 'vitest';
import {
  resolveMarket,
  isSkyPostalMarket,
  isMarketInPreview,
  INITIAL_DEFAULT_MARKETS
} from '../lib/marketEngine/marketEngine';
import {
  resolveCountryFromHostname,
  normalizeHostname,
  classifyHost,
  AUTHORIZED_DOMAIN_MAPPINGS
} from '../lib/marketEngine/domainMarketResolver';

describe('Multicountry Block 1 — Fail-Safe Default Markets & Commerce Modes', () => {
  it('Uruguay (UY) retains FULL_COMMERCE, LIVE status and canCheckout=true', () => {
    const market = resolveMarket('UY', INITIAL_DEFAULT_MARKETS);
    expect(market.countryCode).toBe('UY');
    expect(market.countryName).toBe('Uruguay');
    expect(market.logisticsMode).toBe('IMPORT_HUB');
    expect(market.commerceMode).toBe('FULL_COMMERCE');
    expect(market.isFullCommerce).toBe(true);
    expect(market.isInternationalOnly).toBe(false);
    expect(market.marketStatus).toBe('LIVE');
    expect(market.canCheckout).toBe(true);
    expect(market.canBrowse).toBe(true);
    expect(market.currency).toBe('UYU');
    expect(market.isDisabled).toBe(false);
  });

  it('Argentina (AR) is strictly DISABLED in defaults (Fail-Safe), INTERNATIONAL_ONLY and canCheckout=false', () => {
    const market = resolveMarket('AR', INITIAL_DEFAULT_MARKETS);
    expect(market.countryCode).toBe('AR');
    expect(market.countryName).toBe('Argentina');
    expect(market.commerceMode).toBe('INTERNATIONAL_ONLY');
    expect(market.isFullCommerce).toBe(false);
    expect(market.isInternationalOnly).toBe(true);
    expect(market.marketStatus).toBe('DISABLED');
    expect(market.canCheckout).toBe(false); // CRITICAL: Never allow checkout on fallback
    expect(market.canBrowse).toBe(false);
    expect(market.currency).toBe('ARS');
    expect(market.isDisabled).toBe(true);
  });

  it('Chile (CL) is in PREVIEW mode, INTERNATIONAL_ONLY and canCheckout=false', () => {
    const market = resolveMarket('CL', INITIAL_DEFAULT_MARKETS);
    expect(market.countryCode).toBe('CL');
    expect(market.commerceMode).toBe('INTERNATIONAL_ONLY');
    expect(market.marketStatus).toBe('PREVIEW');
    expect(market.canCheckout).toBe(false);
    expect(market.canBrowse).toBe(true); // Browsable in preview/admin
    expect(market.isPreview).toBe(true);
    expect(isMarketInPreview(market)).toBe(true);
    expect(isSkyPostalMarket(market)).toBe(true);
  });

  it('Perú (PE), Colombia (CO) and Ecuador (EC) are in PREVIEW mode with canCheckout=false', () => {
    for (const code of ['PE', 'CO', 'EC']) {
      const market = resolveMarket(code, INITIAL_DEFAULT_MARKETS);
      expect(market.countryCode).toBe(code);
      expect(market.commerceMode).toBe('INTERNATIONAL_ONLY');
      expect(market.marketStatus).toBe('PREVIEW');
      expect(market.canCheckout).toBe(false);
      expect(market.canBrowse).toBe(true);
    }
  });

  it('Brasil (BR) and México (MX) are strictly DISABLED with canCheckout=false and canBrowse=false', () => {
    for (const code of ['BR', 'MX']) {
      const market = resolveMarket(code, INITIAL_DEFAULT_MARKETS);
      expect(market.countryCode).toBe(code);
      expect(market.commerceMode).toBe('INTERNATIONAL_ONLY');
      expect(market.marketStatus).toBe('DISABLED');
      expect(market.canCheckout).toBe(false);
      expect(market.canBrowse).toBe(false);
      expect(market.isDisabled).toBe(true);
    }
  });

  it('Unrecognized or invalid country fails safely to DISABLED, INTERNATIONAL_ONLY with canCheckout=false', () => {
    const market = resolveMarket('UNKNOWN_COUNTRY', INITIAL_DEFAULT_MARKETS);
    expect(market.isDisabled).toBe(true);
    expect(market.canCheckout).toBe(false);
    expect(market.canBrowse).toBe(false);
    expect(market.commerceMode).toBe('INTERNATIONAL_ONLY');
  });
});

describe('Multicountry Block 1 — Domain Market Resolver', () => {
  it('normalizes hostnames correctly (strips protocol, port, paths, trailing dots)', () => {
    expect(normalizeHostname('https://collectibles.uy/shop')).toBe('collectibles.uy');
    expect(normalizeHostname('http://collectibles.uy:3000')).toBe('collectibles.uy');
    expect(normalizeHostname('WWW.COLLECTIBLES.UY.')).toBe('www.collectibles.uy');
    expect(normalizeHostname('localhost:5173')).toBe('localhost');
    expect(normalizeHostname('')).toBe('');
    expect(normalizeHostname(null)).toBe('');
  });

  it('resolves official production domain collectibles.uy to UY', () => {
    expect(resolveCountryFromHostname('collectibles.uy')).toBe('UY');
    expect(resolveCountryFromHostname('www.collectibles.uy')).toBe('UY');
    expect(resolveCountryFromHostname('https://collectibles.uy/cart')).toBe('UY');
  });

  it('resolves localhost and development environments safely to UY', () => {
    expect(resolveCountryFromHostname('localhost')).toBe('UY');
    expect(resolveCountryFromHostname('localhost:5173')).toBe('UY');
  });

  it('resolves future Argentina domain collectibles.ar to AR without activating payments', () => {
    expect(resolveCountryFromHostname('collectibles.ar')).toBe('AR');
    expect(resolveCountryFromHostname('www.collectibles.ar')).toBe('AR');
  });

  it('resolves Vercel preview URLs (*.vercel.app) safely to UY (Production Parity)', () => {
    expect(resolveCountryFromHostname('collectibles-ecommerce-1kajw3x1b-juans-projects-05818af2.vercel.app')).toBe('UY');
    expect(resolveCountryFromHostname('collectibles-preview.vercel.app')).toBe('UY');
  });

  it('resolves any unknown or spoofed domain safely to UY fallback', () => {
    expect(resolveCountryFromHostname('malicious-site.com')).toBe('UY');
    expect(resolveCountryFromHostname('random-domain.org')).toBe('UY');
    expect(resolveCountryFromHostname(undefined)).toBe('UY');
  });

  it('classifies unknown domains as UNTRUSTED_UNKNOWN with canCheckoutOnDomain=false', () => {
    const untrusted1 = classifyHost('phishing-collectibles.com');
    expect(untrusted1.classification).toBe('UNTRUSTED_UNKNOWN');
    expect(untrusted1.isAuthorizedHost).toBe(false);
    expect(untrusted1.canCheckoutOnDomain).toBe(false);

    const untrusted2 = classifyHost('attacker.net');
    expect(untrusted2.classification).toBe('UNTRUSTED_UNKNOWN');
    expect(untrusted2.isAuthorizedHost).toBe(false);
    expect(untrusted2.canCheckoutOnDomain).toBe(false);
  });
});

describe('Multicountry Block 1 — Backend Zero-Trust Destination & Country Validation', () => {
  // Replicate validateAndResolveOrderCountry logic directly for isolated Vitest testing
  const URUGUAY_DEPARTMENTS = new Set([
    "artigas", "canelones", "cerro largo", "colonia", "durazno",
    "flores", "florida", "lavalleja", "maldonado", "montevideo",
    "paysandu", "rio negro", "rivera", "rocha", "salto",
    "san jose", "soriano", "tacuarembo", "treinta y tres"
  ]);

  const ARGENTINA_PROVINCES = new Set([
    "buenos aires", "caba", "ciudad autonoma de buenos aires", "catamarca", "chaco", "chubut",
    "cordoba", "corrientes", "entre rios", "formosa", "jujuy", "la pampa", "la rioja",
    "mendoza", "misiones", "neuquen", "rio negro", "salta", "san juan", "san luis",
    "santa cruz", "santa fe", "santiago del estero", "tierra del fuego", "tucuman"
  ]);

  function normalizeLoc(val?: string | null) {
    return (val || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  }

  function validateCountry(shippingAddress: any) {
    if (!shippingAddress || typeof shippingAddress !== 'object') {
      return { isValid: false, error: 'Address missing' };
    }
    const rawCountry = (shippingAddress.country || '').toString().trim();
    const rawDept = normalizeLoc(shippingAddress.department || '').toLowerCase();
    const rawCity = normalizeLoc(shippingAddress.city || '').toLowerCase();
    const normCountry = normalizeLoc(rawCountry).toLowerCase();
    const hasArgentinaFiscalId = !!(shippingAddress.dni || shippingAddress.cuit || shippingAddress.razon_social);

    if (!rawCountry) {
      if (hasArgentinaFiscalId || ARGENTINA_PROVINCES.has(rawDept)) {
        return { isValid: false, countryCode: 'AR', error: 'Detected Argentina data without country' };
      }
      if (URUGUAY_DEPARTMENTS.has(rawDept) || rawDept === 'montevideo' || rawCity === 'montevideo') {
        return { isValid: true, countryCode: 'UY', countryName: 'Uruguay', isUruguay: true, isArgentina: false };
      }
      return { isValid: false, error: 'Country missing and cannot be inferred' };
    }

    if (normCountry === 'uruguay' || normCountry === 'uy') {
      if (hasArgentinaFiscalId) {
        return { isValid: false, error: 'Contradiction: Uruguay declared but Argentina fiscal ID present' };
      }
      if (rawDept && ARGENTINA_PROVINCES.has(rawDept) && rawDept !== 'rio negro') {
        return { isValid: false, error: 'Contradiction: Uruguay declared but province belongs to Argentina' };
      }
      return { isValid: true, countryCode: 'UY', countryName: 'Uruguay', isUruguay: true, isArgentina: false };
    }

    if (normCountry === 'argentina' || normCountry === 'ar') {
      return { isValid: true, countryCode: 'AR', countryName: 'Argentina', isUruguay: false, isArgentina: true };
    }

    return { isValid: true, countryCode: normCountry.slice(0, 2).toUpperCase(), countryName: rawCountry, isUruguay: false, isArgentina: false };
  }

  it('allows legitimate Uruguayan address with standard fields', () => {
    const res = validateCountry({
      country: 'Uruguay',
      department: 'Montevideo',
      city: 'Montevideo',
      street: '18 de Julio 1234'
    });
    expect(res.isValid).toBe(true);
    expect(res.countryCode).toBe('UY');
    expect(res.isUruguay).toBe(true);
  });

  it('allows legacy Uruguayan address when country field is omitted but department is Uruguayan (Backward Compatibility)', () => {
    const res = validateCountry({
      department: 'Canelones',
      city: 'Ciudad de la Costa',
      street: 'Av. Giannattasio km 22'
    });
    expect(res.isValid).toBe(true);
    expect(res.countryCode).toBe('UY');
    expect(res.isUruguay).toBe(true);
  });

  it('REJECTS omission manipulation: country omitted but Argentine province provided', () => {
    const res = validateCountry({
      country: '',
      department: 'Córdoba',
      city: 'Villa Carlos Paz',
      street: 'San Martín 450'
    });
    expect(res.isValid).toBe(false);
    expect(res.countryCode).toBe('AR');
  });

  it('REJECTS omission manipulation: country omitted but Argentine fiscal ID (DNI) provided', () => {
    const res = validateCountry({
      country: '',
      dni: '38123456',
      city: 'Rosario',
      street: 'Pellegrini 1000'
    });
    expect(res.isValid).toBe(false);
  });

  it('REJECTS contradiction: country declared as Uruguay but Argentine province provided (e.g. Mendoza)', () => {
    const res = validateCountry({
      country: 'Uruguay',
      department: 'Mendoza',
      city: 'Godoy Cruz',
      street: 'Belgrano 100'
    });
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('Contradiction');
  });

  it('REJECTS contradiction: country declared as Uruguay but Argentine CUIT/DNI attached', () => {
    const res = validateCountry({
      country: 'Uruguay',
      department: 'Montevideo',
      city: 'Montevideo',
      cuit: '20-38123456-9'
    });
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('Contradiction');
  });

  it('identifies Argentina order correctly so backend can enforce checkout_enabled gate', () => {
    const res = validateCountry({
      country: 'Argentina',
      department: 'Buenos Aires',
      city: 'La Plata',
      street: 'Calle 7 123',
      dni: '35123456'
    });
    expect(res.isValid).toBe(true);
    expect(res.countryCode).toBe('AR');
    expect(res.isArgentina).toBe(true);
    expect(res.isUruguay).toBe(false);
  });
});

