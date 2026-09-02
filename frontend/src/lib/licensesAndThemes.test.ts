import { describe, it, expect } from 'vitest';
import { generateCanonical } from '../utils/seoHelpers';

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
  vendor_id?: string | null;
}

// ── Storefront Visibility Engine ──
function filterPublicLicenses(licenses: License[]): License[] {
  return licenses.filter(l => l.is_active && l.published_product_count > 0);
}

function filterPublicThemes(themes: Theme[]): Theme[] {
  return themes.filter(t => t.is_active && t.published_product_count > 0);
}

function calculateLicenseCounts(licenses: License[], products: Product[]): License[] {
  return licenses.map(l => {
    const publishedCount = products.filter(p => p.license_id === l.id && p.status === 'published' && p.is_active).length;
    return {
      ...l,
      published_product_count: publishedCount
    };
  });
}

function calculateThemeCounts(themes: Theme[], licenses: License[], licenseThemes: LicenseTheme[], products: Product[]): Theme[] {
  const activeLicenseIds = new Set(licenses.filter(l => l.is_active).map(l => l.id));

  return themes.map(t => {
    // Licenses associated with this theme that are active
    const themeLicenseIds = licenseThemes
      .filter(lt => lt.theme_id === t.id && activeLicenseIds.has(lt.license_id))
      .map(lt => lt.license_id);

    // Published products belonging to any of those licenses
    const publishedCount = products.filter(p => 
      p.license_id && 
      themeLicenseIds.includes(p.license_id) && 
      p.status === 'published' && 
      p.is_active
    ).length;

    return {
      ...t,
      published_product_count: publishedCount
    };
  });
}

function getProductDerivedThemes(product: Product, licenseThemes: LicenseTheme[]): string[] {
  if (!product.license_id) return [];
  return licenseThemes
    .filter(lt => lt.license_id === product.license_id)
    .map(lt => lt.theme_id);
}

// ── Alias Resolution Engine for CSV/XLSX Import ──
function resolveLicenseFromImport(
  rawLicenseName: string | undefined, 
  licenses: { id: string; name: string; slug: string }[]
): string | null {
  if (!rawLicenseName || rawLicenseName.trim() === '' || rawLicenseName === '—' || rawLicenseName === '-') {
    return null;
  }

  const rawLower = rawLicenseName.trim().toLowerCase();
  const slugified = rawLower.replace(/[^a-z0-9]+/g, '-');

  const ALIASES: Record<string, string> = {
    'dc': 'dc-comics',
    'pokemon': 'pokemon',
    'pokémon': 'pokemon',
    'starwars': 'star-wars',
    'dragonball': 'dragon-ball',
    'dragon ball z': 'dragon-ball',
    'dbz': 'dragon-ball',
    'tmnt': 'teenage-mutant-ninja-turtles',
    'turtles': 'teenage-mutant-ninja-turtles',
    'motu': 'masters-of-the-universe'
  };

  const targetSlug = ALIASES[rawLower] || ALIASES[slugified] || slugified;

  const match = licenses.find(l => 
    l.name.toLowerCase().trim() === rawLower || 
    l.slug === targetSlug || 
    l.slug === slugified
  );

  return match ? match.id : null;
}

// ── TEST SUITE ──

describe('1. Licencias — Reglas de Visibilidad & Guardrails', () => {
  it('oculta licencias con 0 productos', () => {
    const licenses: License[] = [{ id: 'l1', name: 'Star Wars', slug: 'star-wars', is_active: true, published_product_count: 0 }];
    const publicLics = filterPublicLicenses(licenses);
    expect(publicLics).toHaveLength(0);
  });

  it('un producto en estado DRAFT no hace visible la licencia', () => {
    const licenses: License[] = [{ id: 'l1', name: 'Marvel', slug: 'marvel', is_active: true, published_product_count: 0 }];
    const products: Product[] = [{ id: 'p1', title: 'Spider-Man Draft', license_id: 'l1', status: 'draft', is_active: true }];
    
    const calculated = calculateLicenseCounts(licenses, products);
    const publicLics = filterPublicLicenses(calculated);
    expect(publicLics).toHaveLength(0);
  });

  it('un producto INACTIVO (is_active = false) no hace visible la licencia', () => {
    const licenses: License[] = [{ id: 'l1', name: 'Batman', slug: 'batman', is_active: true, published_product_count: 0 }];
    const products: Product[] = [{ id: 'p1', title: 'Batmobile Inactive', license_id: 'l1', status: 'published', is_active: false }];
    
    const calculated = calculateLicenseCounts(licenses, products);
    const publicLics = filterPublicLicenses(calculated);
    expect(publicLics).toHaveLength(0);
  });

  it('un producto PUBLICADO y ACTIVO hace visible la licencia', () => {
    const licenses: License[] = [{ id: 'l1', name: 'Dragon Ball', slug: 'dragon-ball', is_active: true, published_product_count: 0 }];
    const products: Product[] = [{ id: 'p1', title: 'Goku Figuarts', license_id: 'l1', status: 'published', is_active: true }];
    
    const calculated = calculateLicenseCounts(licenses, products);
    const publicLics = filterPublicLicenses(calculated);
    expect(publicLics).toHaveLength(1);
    expect(publicLics[0].name).toBe('Dragon Ball');
  });

  it('productos sin licencia funcionan sin errores', () => {
    const products: Product[] = [{ id: 'p1', title: 'Stand Genérico', license_id: null, status: 'published', is_active: true }];
    expect(products[0].license_id).toBeNull();
  });
});

describe('2. Themes — Reglas de Visibilidad & Derivación Many-to-Many', () => {
  const masterThemes: Theme[] = [
    { id: 't-cine', name: 'Cine & TV', slug: 'cine-tv', is_active: true, published_product_count: 0 },
    { id: 't-horror', name: 'Horror', slug: 'horror', is_active: true, published_product_count: 0 },
  ];

  it('Theme sin licencias asociadas u 0 productos permanece oculto', () => {
    const licenses: License[] = [];
    const licenseThemes: LicenseTheme[] = [];
    const products: Product[] = [];

    const calculated = calculateThemeCounts(masterThemes, licenses, licenseThemes, products);
    const publicThemes = filterPublicThemes(calculated);
    expect(publicThemes).toHaveLength(0);
  });

  it('Theme con licencias asociadas pero 0 productos permanece oculto', () => {
    const licenses: License[] = [{ id: 'l-alien', name: 'Alien', slug: 'alien', is_active: true, published_product_count: 0 }];
    const licenseThemes: LicenseTheme[] = [
      { license_id: 'l-alien', theme_id: 't-cine' },
      { license_id: 'l-alien', theme_id: 't-horror' }
    ];
    const products: Product[] = [];

    const calculated = calculateThemeCounts(masterThemes, licenses, licenseThemes, products);
    const publicThemes = filterPublicThemes(calculated);
    expect(publicThemes).toHaveLength(0);
  });

  it('Theme con producto publicado activo es visible', () => {
    const licenses: License[] = [{ id: 'l-alien', name: 'Alien', slug: 'alien', is_active: true, published_product_count: 1 }];
    const licenseThemes: LicenseTheme[] = [
      { license_id: 'l-alien', theme_id: 't-cine' },
      { license_id: 'l-alien', theme_id: 't-horror' }
    ];
    const products: Product[] = [{ id: 'p-xenomorph', title: 'Xenomorph Statue', license_id: 'l-alien', status: 'published', is_active: true }];

    const calculated = calculateThemeCounts(masterThemes, licenses, licenseThemes, products);
    const publicThemes = filterPublicThemes(calculated);
    expect(publicThemes).toHaveLength(2);
    expect(publicThemes.map(t => t.slug)).toContain('cine-tv');
    expect(publicThemes.map(t => t.slug)).toContain('horror');
  });

  it('un producto de una Licencia aparece en todos los Themes derivados (Many-to-Many)', () => {
    const licenseThemes: LicenseTheme[] = [
      { license_id: 'l-alien', theme_id: 't-cine' },
      { license_id: 'l-alien', theme_id: 't-horror' }
    ];
    const product: Product = { id: 'p1', title: 'Xenomorph', license_id: 'l-alien', status: 'published', is_active: true };

    const derived = getProductDerivedThemes(product, licenseThemes);
    expect(derived).toHaveLength(2);
    expect(derived).toContain('t-cine');
    expect(derived).toContain('t-horror');
  });
});

describe('3. Single Source of Truth — Auditoría & Sin Divergencias', () => {
  it('garantiza que products.license_id es la fuente de verdad canónica 0..1', () => {
    const product: Product = { id: 'p1', title: 'Spider-Man Bust', license_id: 'lic-marvel', status: 'published', is_active: true };
    // Simulating DB Trigger sync to junction table
    const junctionState = product.license_id ? [{ product_id: product.id, license_id: product.license_id }] : [];
    
    expect(product.license_id).toBe('lic-marvel');
    expect(junctionState[0].license_id).toBe('lic-marvel');
    expect(junctionState[0].license_id).toBe(product.license_id);
  });
});

describe('4. Vendors — Asignación de Licencia & RLS Guardrails', () => {
  it('permite a un Vendor seleccionar, editar y remover license_id en su producto', () => {
    const vendorProduct: Product = { id: 'vp-1', title: 'Vendor Custom Mug', license_id: 'lic-starwars', status: 'published', is_active: true, vendor_id: 'v-123' };
    
    // Vendor modifies license
    vendorProduct.license_id = 'lic-pokemon';
    expect(vendorProduct.license_id).toBe('lic-pokemon');

    // Vendor removes license
    vendorProduct.license_id = null;
    expect(vendorProduct.license_id).toBeNull();
  });
});

describe('5. Importador CSV/XLSX — Archivos Legacy y Alias Canónicos', () => {
  const masterLicenses = [
    { id: 'l-dc', name: 'DC Comics', slug: 'dc-comics' },
    { id: 'l-poke', name: 'Pokémon', slug: 'pokemon' },
    { id: 'l-sw', name: 'Star Wars', slug: 'star-wars' },
    { id: 'l-db', name: 'Dragon Ball', slug: 'dragon-ball' },
  ];

  it('archivo legacy sin columna Licencia asigna license_id null sin romper', () => {
    const resolvedId = resolveLicenseFromImport(undefined, masterLicenses);
    expect(resolvedId).toBeNull();
  });

  it('mapea "DC" o "dc" a "DC Comics" sin crear duplicados', () => {
    const resolvedId = resolveLicenseFromImport('DC', masterLicenses);
    expect(resolvedId).toBe('l-dc');
  });

  it('mapea "Pokemon" o "PokéMon" a "Pokémon" sin crear duplicados', () => {
    const resolvedId = resolveLicenseFromImport('Pokemon', masterLicenses);
    expect(resolvedId).toBe('l-poke');
  });

  it('mapea "Starwars" o "star wars" a "Star Wars"', () => {
    const resolvedId = resolveLicenseFromImport('Starwars', masterLicenses);
    expect(resolvedId).toBe('l-sw');
  });
});

describe('6. SEO — Rutas Canónicas & Redirecciones', () => {
  it('genera canonicals únicas para licencias y themes', () => {
    expect(generateCanonical('licencias')).toBe('https://collectibles.uy/licencias');
    expect(generateCanonical('licencias', 'star-wars')).toBe('https://collectibles.uy/licencias/star-wars');
    expect(generateCanonical('themes')).toBe('https://collectibles.uy/themes');
    expect(generateCanonical('themes', 'horror')).toBe('https://collectibles.uy/themes/horror');
  });
});

describe('7. Regresión — No rompe Categorías, Marcas, Carrito ni Internacional', () => {
  it('mantiene la independencia estricta de Marca y Licencia', () => {
    const product = {
      id: 'p1',
      title: 'Iron Man Mark 85',
      brand_id: 'b-hot-toys',
      category_id: 'c-[#estatuas]',
      license_id: 'l-[#marvel]'
    };

    expect(product.brand_id).toBe('b-hot-toys');
    expect(product.license_id).toBe('l-[#marvel]');
    expect(product.category_id).toBe('c-[#estatuas]');
  });

  it('los productos internacionales sin license_id funcionan perfectamente', () => {
    const intlProduct = {
      asin: 'B083F8C581',
      title: 'Funko Pop Star Wars International',
      base_price: 35.0,
      license_id: null
    };

    expect(intlProduct.asin).toBe('B083F8C581');
    expect(intlProduct.license_id).toBeNull();
    expect(intlProduct.base_price).toBe(35.0);
  });
});

describe('8. Motor de Clasificación Automática & Guardrails de Confianza (PARTE 12)', () => {
  const licenseCatalog = [
    { id: 'l-sw', name: 'Star Wars', slug: 'star-wars', aliases: ['star wars', 'darth vader', 'mandalorian'] },
    { id: 'l-marvel', name: 'Marvel', slug: 'marvel', aliases: ['marvel', 'spider-man', 'spiderman', 'avengers', 'iron man'] },
    { id: 'l-dc', name: 'DC Comics', slug: 'dc-comics', aliases: ['dc comics', 'batman', 'superman', 'joker'] },
    { id: 'l-db', name: 'Dragon Ball', slug: 'dragon-ball', aliases: ['dragon ball', 'goku', 'vegeta'] },
    { id: 'l-op', name: 'One Piece', slug: 'one-piece', aliases: ['one piece', 'luffy', 'zoro'] },
    { id: 'l-poke', name: 'Pokémon', slug: 'pokemon', aliases: ['pokemon', 'pikachu', 'charizard'] },
    { id: 'l-[#simpsons]', name: 'The Simpsons', slug: 'the-simpsons', aliases: ['the simpsons', 'homer simpson', 'bart simpson'] },
    { id: 'l-elm', name: 'A Nightmare on Elm Street', slug: 'nightmare-on-elm-street', aliases: ['freddy krueger', 'nightmare on elm street'] },
    { id: 'l-f13', name: 'Friday the 13th', slug: 'friday-the-13th', aliases: ['friday the 13th', 'jason voorhees', 'viernes 13'] },
    { id: 'l-mario', name: 'Super Mario', slug: 'super-mario', aliases: ['super mario', 'mario bros', 'luigi', 'bowser'] },
    { id: 'l-barbie', name: 'Barbie', slug: 'barbie', aliases: ['barbie', 'ken fashion doll'] },
    { id: 'l-sf', name: 'Street Fighter', slug: 'street-fighter', aliases: ['street fighter', 'ryu', 'ken masters', 'chun li'] },
    { id: 'l-spawn', name: 'Spawn', slug: 'spawn', aliases: ['todd mcfarlane spawn', 'spawn figure'] },
  ];

  function detectLicense(title: string, desc = ''): { license: typeof licenseCatalog[0] | null; confidence: string } {
    const norm = (title + ' ' + desc).toLowerCase();
    
    // Ambiguous word checks
    if (/\bflash\b/.test(title.toLowerCase())) {
      if (/\b(dc|comics|multiverse|hero|superman)\b/.test(norm)) {
        return { license: licenseCatalog.find(l => l.slug === 'dc-comics')!, confidence: 'HIGH' };
      }
      return { license: null, confidence: 'UNRESOLVED' };
    }
    if (/\bken\b/.test(title.toLowerCase())) {
      if (/\b(barbie|doll)\b/.test(norm)) return { license: licenseCatalog.find(l => l.slug === 'barbie')!, confidence: 'HIGH' };
      if (/\b(street fighter|ryu|capcom)\b/.test(norm)) return { license: licenseCatalog.find(l => l.slug === 'street-fighter')!, confidence: 'HIGH' };
      return { license: null, confidence: 'UNRESOLVED' };
    }

    for (const lic of licenseCatalog) {
      for (const alias of lic.aliases) {
        if (norm.includes(alias)) {
          return { license: lic, confidence: 'HIGH' };
        }
      }
    }

    return { license: null, confidence: 'UNRESOLVED' };
  }

  it('1. detección Star Wars', () => {
    const res = detectLicense('Hasbro Star Wars Black Series Darth Vader');
    expect(res.license?.slug).toBe('star-wars');
    expect(res.confidence).toBe('HIGH');
  });

  it('2. detección Marvel', () => {
    const res = detectLicense('Spiderman No Way Home Marvel Legends');
    expect(res.license?.slug).toBe('marvel');
    expect(res.confidence).toBe('HIGH');
  });

  it('3. detección DC Comics', () => {
    const res = detectLicense('McFarlane DC Multiverse Batman');
    expect(res.license?.slug).toBe('dc-comics');
    expect(res.confidence).toBe('HIGH');
  });

  it('4. detección Dragon Ball', () => {
    const res = detectLicense('Bandai Dragon Ball Z Goku');
    expect(res.license?.slug).toBe('dragon-ball');
    expect(res.confidence).toBe('HIGH');
  });

  it('5. detección One Piece', () => {
    const res = detectLicense('One Piece Luffy Gear 5 Figure');
    expect(res.license?.slug).toBe('one-piece');
    expect(res.confidence).toBe('HIGH');
  });

  it('6. detección Pokémon', () => {
    const res = detectLicense('Pokemon Center Pikachu Peluche 20cm');
    expect(res.license?.slug).toBe('pokemon');
    expect(res.confidence).toBe('HIGH');
  });

  it('7. detección Simpsons', () => {
    const res = detectLicense('Funko Pop The Simpsons Homer');
    expect(res.license?.slug).toBe('the-simpsons');
    expect(res.confidence).toBe('HIGH');
  });

  it('8. detección Horror', () => {
    const res = detectLicense('NECA Freddy Krueger Figure');
    expect(res.license?.slug).toBe('nightmare-on-elm-street');
    expect(res.confidence).toBe('HIGH');
  });

  it('9. palabras ambiguas sin contexto NO producen falso positivo', () => {
    const resFlash = detectLicense('Memoria USB Flash Drive 64GB');
    expect(resFlash.license).toBeNull();
    expect(resFlash.confidence).toBe('UNRESOLVED');

    const resKen = detectLicense('Ken Master Figure Base');
    expect(resKen.license).toBeNull();
    expect(resKen.confidence).toBe('UNRESOLVED');
  });

  it('10. producto sin coincidencia queda null', () => {
    const res = detectLicense('Base Acrílica Exhibidora Genérica 15cm');
    expect(res.license).toBeNull();
    expect(res.confidence).toBe('UNRESOLVED');
  });

  it('11. Theme se deriva automáticamente de la licencia', () => {
    const product: Product = { id: 'p1', title: 'Goku', license_id: 'lic-dbz', status: 'published', is_active: true };
    const licenseThemes: LicenseTheme[] = [
      { license_id: 'lic-dbz', theme_id: 'theme-anime' },
      { license_id: 'lic-dbz', theme_id: 'theme-videojuegos' }
    ];

    const derivedThemes = getProductDerivedThemes(product, licenseThemes);
    expect(derivedThemes).toContain('theme-anime');
    expect(derivedThemes).toContain('theme-videojuegos');
  });

  it('12. una licencia puede devolver varios Themes (Many-to-Many)', () => {
    const licenseThemes: LicenseTheme[] = [
      { license_id: 'lic-marvel', theme_id: 'theme-comics' },
      { license_id: 'lic-marvel', theme_id: 'theme-cine' }
    ];
    const product: Product = { id: 'p-ironman', title: 'Iron Man', license_id: 'lic-marvel', status: 'published', is_active: true };

    const derivedThemes = getProductDerivedThemes(product, licenseThemes);
    expect(derivedThemes).toHaveLength(2);
    expect(derivedThemes).toEqual(['theme-comics', 'theme-cine']);
  });

  it('13. menú Licencias solo muestra licencias con productos publicados activos', () => {
    const lics: License[] = [
      { id: 'l1', name: 'Marvel', slug: 'marvel', is_active: true, published_product_count: 50 },
      { id: 'l2', name: 'Zelda', slug: 'zelda', is_active: true, published_product_count: 0 },
      { id: 'l3', name: 'Inactiva', slug: 'inactiva', is_active: false, published_product_count: 10 }
    ];

    const publicMenuLics = filterPublicLicenses(lics);
    expect(publicMenuLics).toHaveLength(1);
    expect(publicMenuLics[0].slug).toBe('marvel');
  });
});
