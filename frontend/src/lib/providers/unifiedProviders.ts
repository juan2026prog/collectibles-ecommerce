/**
 * Collectibles 2026 — Arquitectura Canónica de Proveedores de Datos
 *
 * Principio Fundamental:
 * - D1 + Workers es la capa de LECTURA PÚBLICA DE ALTO RENDIMIENTO (catálogo, búsquedas, contenido, SEO).
 * - Supabase Postgres es la AUTORIDAD AUTORITATIVA TRANSACCIONAL (usuarios, pedidos, pagos, stock real, RLS).
 *
 * Interfaces comunes expuestas:
 * 1. PublicCatalogProvider — Productos, fichas, variantes, taxonomías.
 * 2. PublicSearchProvider  — Búsqueda rápida, autocomplete, facetas.
 * 3. PublicContentProvider — Banners, promociones vigentes, Radar y lanzamientos, settings públicos.
 * 4. InventoryAuthorityProvider — Verificación autoritativa de stock en tiempo real (Supabase ACID).
 * 5. TransactionProvider — Checkout, órdenes, pagos y reservas (Supabase ACID).
 */

import { PublicCatalogProvider } from './PublicCatalogProvider';
import { CommerceOperationsProvider } from './CommerceOperationsProvider';
import { supabase } from '../supabase';

// ── 1. PUBLIC SEARCH PROVIDER ────────────────────────────────────────────────
export const PublicSearchProvider = {
  /**
   * Búsqueda en catálogo unificado vía Cloudflare D1
   */
  async search(query: string, limit = 8) {
    return PublicCatalogProvider.searchCatalog(query, limit);
  },

  /**
   * Búsqueda ligera de autocomplete para barra de navegación
   */
  async autocomplete(query: string, limit = 5) {
    return PublicCatalogProvider.getProducts({ q: query, limit });
  },

  /**
   * Facetas de filtrado agregadas
   */
  async getFacets(brandId?: string) {
    const res = await PublicCatalogProvider.getTaxonomies(brandId);
    return res.data?.facets;
  },
};

// ── 2. PUBLIC CONTENT PROVIDER ───────────────────────────────────────────────
export const PublicContentProvider = {
  /**
   * Banners promocionales de portada
   */
  async getBanners() {
    return PublicCatalogProvider.getBanners();
  },

  /**
   * Promociones y descuentos comerciales vigentes
   */
  async getActivePromotions() {
    return PublicCatalogProvider.getPromotions();
  },

  /**
   * Lanzamientos globales del Radar de coleccionistas
   */
  async getRadarReleases(limit = 50) {
    return PublicCatalogProvider.getRadarReleases(limit);
  },

  /**
   * Ficha en detalle de lanzamiento por slug
   */
  async getRadarReleaseBySlug(slug: string) {
    return PublicCatalogProvider.getRadarReleaseBySlug(slug);
  },

  /**
   * Bundle de configuraciones públicas del sitio y feature toggles
   */
  async getPublicSiteSettings() {
    return PublicCatalogProvider.getPublicSettingsBundle();
  },
};

// ── 3. INVENTORY AUTHORITY PROVIDER ──────────────────────────────────────────
export const InventoryAuthorityProvider = {
  /**
   * Validación estricta y autoritativa antes de iniciar checkout o pago.
   * Consulta directamente Supabase PostgreSQL mediante transacciones ACID seguras.
   */
  async validateCartBeforeCheckout(items: any[]) {
    return CommerceOperationsProvider.validateCartBeforeCheckout(items);
  },

  /**
   * Consulta de stock autoritativo en tiempo real para una variante específica
   */
  async getAuthoritativeStock(productId: string, variantId?: string | null): Promise<{
    availableStock: number;
    stockStatus: 'in_stock' | 'low_stock' | 'out_of_stock';
    isPublished: boolean;
  }> {
    const { data: prod, error } = await supabase
      .from('products')
      .select('stock, status, is_active')
      .eq('id', productId)
      .maybeSingle();

    if (error || !prod || !prod.is_active || prod.status !== 'published') {
      return { availableStock: 0, stockStatus: 'out_of_stock', isPublished: false };
    }

    if (variantId) {
      const { data: v } = await supabase
        .from('product_variants')
        .select('inventory_count')
        .eq('id', variantId)
        .maybeSingle();
      const count = Number(v?.inventory_count ?? prod.stock ?? 0);
      return {
        availableStock: count,
        stockStatus: count <= 0 ? 'out_of_stock' : count <= 3 ? 'low_stock' : 'in_stock',
        isPublished: true,
      };
    }

    const count = Number(prod.stock ?? 0);
    return {
      availableStock: count,
      stockStatus: count <= 0 ? 'out_of_stock' : count <= 3 ? 'low_stock' : 'in_stock',
      isPublished: true,
    };
  },
};

// ── 4. TRANSACTION PROVIDER ──────────────────────────────────────────────────
export const TransactionProvider = {
  /**
   * Verificación de stock transaccional delegada a Supabase
   */
  async validateCart(items: any[]) {
    return CommerceOperationsProvider.validateCartBeforeCheckout(items);
  },

  /**
   * Creación de órdenes en Supabase con RLS y consistencia ACID
   */
  async createOrder(orderPayload: any) {
    return supabase.from('orders').insert(orderPayload).select().single();
  },
};

// Re-exportar el proveedor base de catálogo público
export { PublicCatalogProvider };
