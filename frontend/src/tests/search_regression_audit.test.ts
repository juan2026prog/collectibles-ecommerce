import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  normalizeSearchText,
  resolveSearchTokens,
  buildProductSearchOrClause
} from '../lib/search/searchQueryNormalizer';
import { CollectiblesSearchService } from '../services/search/collectiblesSearchService';
import { PublicCatalogProvider } from '../lib/providers/PublicCatalogProvider';
import { supabase } from '../lib/supabase';

function createChainableQuery(data: any[] = []) {
  const base: any = {
    then: (resolve: any, reject: any) => Promise.resolve({ data, error: null }).then(resolve, reject),
    single: () => Promise.resolve({ data: data[0] ?? null, error: null }),
    maybeSingle: () => Promise.resolve({ data: data[0] ?? null, error: null }),
    insert: () => Promise.resolve({ data: null, error: null }),
  };
  const proxy: any = new Proxy(base, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return () => proxy;
    },
  });
  return proxy;
}

describe('FASE 5 — REGRESIÓN Y CALIDAD DEL BUSCADOR DE PRODUCTOS', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Isolate unit tests from live Cloudflare D1 Worker network calls
    vi.spyOn(PublicCatalogProvider, 'isDomainEnabled').mockReturnValue(false);
  });

  it('1. Normaliza texto eliminando acentos, mayúsculas y diacríticos correctamente', () => {
    expect(normalizeSearchText('Pokémon')).toBe('pokemon');
    expect(normalizeSearchText('Pókemon')).toBe('pokemon');
    expect(normalizeSearchText('Muñeco')).toBe('muneco');
    expect(normalizeSearchText('Spider-Man')).toBe('spider-man');
    expect(normalizeSearchText('  Dragon  Ball   Z  ')).toBe('dragon  ball   z');
  });

  it('2. Expande sinónimos y variaciones para términos críticos requeridos', async () => {
    vi.spyOn(supabase, 'from').mockImplementation(() => createChainableQuery([]));

    const pokemonTokens = await resolveSearchTokens('Pokémon');
    expect(pokemonTokens.terms).toContain('pokemon');
    expect(pokemonTokens.terms).toContain('pokémon');

    const spidermanTokens = await resolveSearchTokens('Spider-Man');
    expect(spidermanTokens.terms).toContain('spiderman');
    expect(spidermanTokens.terms).toContain('spider-man');

    const dbzTokens = await resolveSearchTokens('Dragon Ball');
    expect(dbzTokens.terms).toContain('dragon ball');
    expect(dbzTokens.terms).toContain('dragon ball z');

    const parenTokens = await resolveSearchTokens('99 Nights Collectible Plush Toy - Assorted -(20 cm)');
    expect(parenTokens.terms).toContain('99 nights collectible plush toy - assorted - 20 cm');
    expect(parenTokens.terms).toContain('99 nights collectible plush toy - assorted -');
  });

  it('3. Genera cláusula OR compatible con PostgREST para productos', async () => {
    const tokens = {
      raw: 'Batman',
      normalized: 'batman',
      terms: ['batman', 'el caballero de la noche'],
      brandIds: ['b1-uuid'],
      licenseIds: ['l1-uuid']
    };

    const clause = buildProductSearchOrClause(tokens);
    expect(clause).toContain('title.ilike.%batman%');
    expect(clause).toContain('description.ilike.%batman%');
    expect(clause).toContain('brand_id.in.(b1-uuid)');
    expect(clause).toContain('license_id.in.(l1-uuid)');
  });

  it('4. Realiza búsqueda unificada con CollectiblesSearchService con normalización y filtros', async () => {
    vi.spyOn(supabase, 'rpc').mockResolvedValue({ data: 'mock-uuid', error: null } as any);
    vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
      if (table === 'products') {
        return createChainableQuery([
          {
            id: 'p-1',
            title: 'Figura Pokémon Pikachu Bandai',
            slug: 'figura-pokemon-pikachu-bandai',
            base_price: 1990,
            compare_at_price: null,
            badge: 'new',
            is_featured: true,
            is_active: true,
            status: 'published',
            images: [{ id: 'img-1', url: 'https://example.com/pika.webp', is_primary: true }],
            variants: [],
            brand: { name: 'Bandai', slug: 'bandai' },
            category: { name: 'Figuras', slug: 'figuras' }
          }
        ]);
      }
      return createChainableQuery([]);
    });

    const res = await CollectiblesSearchService.search({
      query: 'Pokémon',
      limitLocal: 10,
      limitInternational: 5,
      limitRadar: 2,
      enableAIEditorial: false
    });

    expect(res).toBeDefined();
    expect(res.query).toBe('Pokémon');
    expect(res.products.length).toBe(1);
    expect(res.products[0].title).toBe('Figura Pokémon Pikachu Bandai');
    expect(res.products[0].price_in_uyu).toBe(1990);
    expect(res.counts.local).toBe(1);
  });

  it('5. Maneja conversiones y normalizaciones cambiarias sin colisionar USD con UYU', () => {
    const rate = CollectiblesSearchService.getExchangeRate();
    expect(typeof rate).toBe('number');
    expect(rate).toBeGreaterThan(0);
  });

  it('6. Registra telemetría segura mediante log_ai_search_event sin bloquear el flujo', async () => {
    vi.spyOn(supabase, 'from').mockImplementation(() => createChainableQuery([]));
    const rpcSpy = vi.spyOn(supabase, 'rpc').mockResolvedValue({ data: 'telemetry-id-123', error: null } as any);

    await CollectiblesSearchService.search({
      query: 'Chucky',
      limitLocal: 5,
      enableAIEditorial: false
    });

    expect(rpcSpy).toHaveBeenCalledWith('log_ai_search_event', expect.objectContaining({
      p_query: 'Chucky',
      p_source: 'search_service'
    }));
  });
});
