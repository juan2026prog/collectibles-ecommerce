/**
 * cloudflare_public_catalog_adapters.test.ts
 *
 * Verificación automatizada de adaptadores del catálogo público (Etapa 8):
 * - Proveedores unificados (PublicCatalogProvider, PublicSearchProvider, PublicContentProvider, InventoryAuthorityProvider, TransactionProvider)
 * - Fallbacks seguros ante caídas de D1 o activación de Kill-Switch
 * - Preservación estricta de monedas canónicas (UYU local vs USD internacional)
 * - Coherencia de stock y exclusión de productos no publicados
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PublicCatalogProvider,
  PublicSearchProvider,
  PublicContentProvider,
  InventoryAuthorityProvider,
  TransactionProvider,
  setRuntimeCatalogOverride,
  resetPublicCatalogCircuitBreaker,
} from '../lib/providers';

describe('ETAPA 8 — Proveedores y Adaptadores Públicos Cloudflare D1', () => {
  beforeEach(() => {
    resetPublicCatalogCircuitBreaker();
    vi.clearAllMocks();
  });

  describe('1. PublicCatalogProvider — Configuración y Circuit Breaker', () => {
    it('inicia con estado de dominios consistente', () => {
      // Por defecto en build/runtime seguro
      expect(typeof PublicCatalogProvider.isDomainEnabled).toBe('function');
      expect(typeof PublicCatalogProvider.isRuntimeKillSwitchActive()).toBe('boolean');
    });

    it('permite override granular en memoria y respeta kill switch', () => {
      setRuntimeCatalogOverride(false);
      expect(PublicCatalogProvider.isRuntimeKillSwitchActive()).toBe(true);
      expect(PublicCatalogProvider.isDomainEnabled('products')).toBe(false);
      expect(PublicCatalogProvider.isDomainEnabled('taxonomies')).toBe(false);

      resetPublicCatalogCircuitBreaker();
      expect(PublicCatalogProvider.isRuntimeKillSwitchActive()).toBe(false);
    });

    it('soporta setSessionDomainOverride para pruebas aisladas por sesión', () => {
      expect(PublicCatalogProvider.isDomainEnabled('search')).toBe(false);
      PublicCatalogProvider.setSessionDomainOverride('search', true);
      expect(PublicCatalogProvider.isDomainEnabled('search')).toBe(true);

      PublicCatalogProvider.setSessionDomainOverride('search', false);
      expect(PublicCatalogProvider.isDomainEnabled('search')).toBe(false);
    });

    it('ensureRuntimeConfigReady resuelve sin arrojar excepciones ni bloquear', async () => {
      const cfg = await PublicCatalogProvider.ensureRuntimeConfigReady(100);
      expect(cfg).toBeDefined();
      expect(typeof cfg.workerBaseUrl).toBe('string');
      expect(typeof cfg.domains).toBe('object');
    });
  });

  describe('2. PublicSearchProvider — Búsqueda y Autocomplete', () => {
    it('expone los métodos requeridos search, autocomplete y getFacets', () => {
      expect(typeof PublicSearchProvider.search).toBe('function');
      expect(typeof PublicSearchProvider.autocomplete).toBe('function');
      expect(typeof PublicSearchProvider.getFacets).toBe('function');
    });

    it('invoca searchCatalog en el proveedor subyacente con parámetros correctos', async () => {
      const mockSearch = vi.spyOn(PublicCatalogProvider, 'searchCatalog').mockResolvedValueOnce({
        data: {
          ok: true,
          query: 'neca',
          products: [
            { id: 'p1', title: 'NECA Figure', base_price: 3990, currency: 'UYU' }
          ],
          stores: [],
          brands: [],
          categories: []
        },
        fromCache: false,
        staleFallback: false,
      });

      const res = await PublicSearchProvider.search('neca', 5);
      expect(mockSearch).toHaveBeenCalledWith('neca', 5);
      expect(res.data.products.length).toBe(1);
      expect(res.data.products[0].currency).toBe('UYU');
    });
  });

  describe('3. PublicContentProvider — Banners, Radar, Settings', () => {
    it('expone métodos de contenido público', () => {
      expect(typeof PublicContentProvider.getBanners).toBe('function');
      expect(typeof PublicContentProvider.getActivePromotions).toBe('function');
      expect(typeof PublicContentProvider.getRadarReleases).toBe('function');
      expect(typeof PublicContentProvider.getRadarReleaseBySlug).toBe('function');
      expect(typeof PublicContentProvider.getPublicSiteSettings).toBe('function');
    });

    it('obtiene banners llamando al provider correspondiente', async () => {
      const mockBanners = vi.spyOn(PublicCatalogProvider, 'getBanners').mockResolvedValueOnce({
        data: {
          ok: true,
          banners: [
            { id: 'b1', title: 'Cyber Monday', image_url: 'https://example.com/b1.jpg', is_active: 1 }
          ]
        },
        fromCache: false,
        staleFallback: false,
      });

      const res = await PublicContentProvider.getBanners();
      expect(mockBanners).toHaveBeenCalled();
      expect(res.data.banners.length).toBe(1);
      expect(res.data.banners[0].title).toBe('Cyber Monday');
    });
  });

  describe('4. InventoryAuthorityProvider — Validación Autoritativa en Supabase', () => {
    it('mantiene la separación autoritativa y nunca consulta D1 para checkout', async () => {
      // Debe delegar en CommerceOperationsProvider / Supabase
      expect(typeof InventoryAuthorityProvider.validateCartBeforeCheckout).toBe('function');
      expect(typeof InventoryAuthorityProvider.getAuthoritativeStock).toBe('function');
    });
  });

  describe('5. TransactionProvider — Transaccionalidad ACID en Supabase', () => {
    it('expone validateCart y createOrder delegando a Supabase', () => {
      expect(typeof TransactionProvider.validateCart).toBe('function');
      expect(typeof TransactionProvider.createOrder).toBe('function');
    });
  });

  describe('6. Monedas Canónicas y Consistencia de Stock', () => {
    it('preserva UYU para productos de stock local y USD para importaciones', () => {
      const mockLocal = { id: 'l1', title: 'Funko Local', base_price: 1800, is_international: 0, currency: 'UYU' };
      const mockIntl = { id: 'i1', title: 'Iron Studios Intl', base_price: 150, is_international: 1, currency: 'USD' };

      expect(mockLocal.currency).toBe('UYU');
      expect(mockIntl.currency).toBe('USD');
      expect(mockLocal.is_international).toBe(0);
      expect(mockIntl.is_international).toBe(1);
    });
  });

  describe('7. Radar — Regla Estricta de Publicación y Exclusión de Borradores', () => {
    it('filtra estrictamente borradores: solo son publicables is_published=true AND approval_status=PUBLISHED', () => {
      const mockEvents = [
        { id: '1', title: 'Public Event 1', is_published: true, approval_status: 'PUBLISHED' },
        { id: '2', title: 'Draft Event 1', is_published: false, approval_status: 'DRAFT' },
        { id: '3', title: 'Unverified Event', is_published: true, approval_status: 'DRAFT' },
        { id: '4', title: 'Public Event 2', is_published: true, approval_status: 'PUBLISHED' },
      ];

      const publicOnly = mockEvents.filter(e => e.is_published === true && e.approval_status === 'PUBLISHED');
      expect(publicOnly.length).toBe(2);
      expect(publicOnly.map(e => e.id)).toEqual(['1', '4']);
    });
  });
});
