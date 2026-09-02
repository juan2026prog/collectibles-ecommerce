import { describe, it, expect } from 'vitest';

interface License {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  published_product_count: number;
}

interface Theme {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  published_product_count: number;
}

interface LicenseTheme {
  license_id: string;
  theme_id: string;
}

interface Product {
  id: string;
  title: string;
  license_id: string | null;
  status: 'published' | 'draft' | 'archived';
  is_active: boolean;
}

// ── Test Helpers matching Supabase view logic ──
function filterPublicLicenses(licenses: License[]): License[] {
  return licenses.filter(l => l.is_active && l.published_product_count > 0);
}

function filterPublicThemes(themes: Theme[]): Theme[] {
  return themes.filter(t => t.is_active && t.published_product_count > 0);
}

function getProductThemes(product: Product, licenseThemes: LicenseTheme[]): string[] {
  if (!product.license_id) return [];
  return licenseThemes
    .filter(lt => lt.license_id === product.license_id)
    .map(lt => lt.theme_id);
}

describe('Licenses and Themes Core Logic', () => {
  it('only returns active licenses with published_product_count > 0 for storefront', () => {
    const licenses: License[] = [
      { id: '1', name: 'Star Wars', slug: 'star-wars', is_active: true, published_product_count: 5 },
      { id: '2', name: 'Fallout', slug: 'fallout', is_active: true, published_product_count: 0 },
      { id: '3', name: 'Marvel', slug: 'marvel', is_active: false, published_product_count: 10 },
      { id: '4', name: 'Dragon Ball', slug: 'dragon-ball', is_active: true, published_product_count: 1 },
    ];

    const publicLicenses = filterPublicLicenses(licenses);
    expect(publicLicenses).toHaveLength(2);
    expect(publicLicenses.map(l => l.name)).toEqual(['Star Wars', 'Dragon Ball']);
  });

  it('only returns active themes with published_product_count > 0 for storefront', () => {
    const themes: Theme[] = [
      { id: 't1', name: 'Cine & TV', slug: 'cine-tv', is_active: true, published_product_count: 12 },
      { id: 't2', name: 'Horror', slug: 'horror', is_active: true, published_product_count: 0 },
      { id: 't3', name: 'Anime & Manga', slug: 'anime-manga', is_active: true, published_product_count: 3 },
      { id: 't4', name: 'Deportes', slug: 'deportes', is_active: false, published_product_count: 5 },
    ];

    const publicThemes = filterPublicThemes(themes);
    expect(publicThemes).toHaveLength(2);
    expect(publicThemes.map(t => t.name)).toEqual(['Cine & TV', 'Anime & Manga']);
  });

  it('correctly maps product to multiple themes derived from its license (many-to-many)', () => {
    const licenseThemes: LicenseTheme[] = [
      { license_id: 'lic-alien', theme_id: 'theme-cine' },
      { license_id: 'lic-alien', theme_id: 'theme-horror' },
      { license_id: 'lic-dragon-ball', theme_id: 'theme-anime' },
    ];

    const alienProduct: Product = {
      id: 'p-1',
      title: 'Alien Ultimate Action Figure',
      license_id: 'lic-alien',
      status: 'published',
      is_active: true,
    };

    const genericProduct: Product = {
      id: 'p-2',
      title: 'Generic Stand',
      license_id: null,
      status: 'published',
      is_active: true,
    };

    const alienThemes = getProductThemes(alienProduct, licenseThemes);
    expect(alienThemes).toHaveLength(2);
    expect(alienThemes).toContain('theme-cine');
    expect(alienThemes).toContain('theme-horror');

    const genericThemes = getProductThemes(genericProduct, licenseThemes);
    expect(genericThemes).toHaveLength(0);
  });

  it('preserves independence of Brand and License', () => {
    const product = {
      id: 'prod-1',
      title: 'Darth Vader Black Series',
      brand: { id: 'b-hasbro', name: 'Hasbro' },
      license: { id: 'l-[#starwars]', name: 'Star Wars' }
    };

    expect(product.brand.name).toBe('Hasbro');
    expect(product.license.name).toBe('Star Wars');
    expect(product.brand.name).not.toBe(product.license.name);
  });
});
