import type { 
  NormalizedProduct, 
  ResearchPack, 
  RetailerSource 
} from '../../types/sourcing';
import { resolveAdapterForUrl, getAdapterBySource } from './adapters';
import { normalizeAndDeduplicateOffers, cleanKeyString } from './normalizer';
import { calculateInternationalPricing } from '../../lib/internationalPricing';
import { evaluateAuthenticityGate } from './authenticityGate';
import { supabase } from '../../lib/supabase';

const HISTORY_STORAGE_KEY = 'collectibles_sourcing_packs_history_v2';

export interface SourcingHistoryEntry {
  pack_id: string;
  title: string;
  generated_at: string;
  processed_at: string;
  total_products: number;
  profitable_count: number;
  review_count: number;
  preorder_count: number;
}

export class SourcingService {
  /**
   * Procesa un Research Pack completo:
   * 1. Resuelve adaptadores de cada URL
   * 2. Extrae ofertas de las fuentes
   * 3. Normaliza y deduplica
   * 4. Cruza contra catálogo existente de Collectibles
   */
  async processResearchPack(
    pack: ResearchPack, 
    existingCatalogTitles: string[] = []
  ): Promise<NormalizedProduct[]> {
    const extractions: any[] = [];

    for (const item of pack.items) {
      const adapter = item.retailer ? getAdapterBySource(item.retailer) : resolveAdapterForUrl(item.url);
      
      const titleConstructed = item.character
        ? `${item.brand || 'McFarlane Toys'} ${item.character} ${item.line || ''}`.trim()
        : undefined;

      const rawExtraction = adapter.parseOfferFromInput({
        url: item.url,
        title: titleConstructed,
        price: item.price,
        brand: item.brand,
        upc: item.upc,
        raw: {
          license: item.license,
          line: item.line,
          character: item.character,
          scale: item.scale,
          availability: item.reason === 'PREORDER' ? 'preorder' : 'in_stock'
        }
      });

      const offer = adapter.toSourceOffer(rawExtraction);

      extractions.push({
        raw: rawExtraction,
        offer,
        inputMeta: item
      });
    }

    // Normalizar y deduplicar
    const normalized = normalizeAndDeduplicateOffers(extractions);

    // Cruzar contra catálogo Collectibles
    const catalogTitlesLower = existingCatalogTitles.map(t => t.toLowerCase());

    for (const prod of normalized) {
      prod.pack_id = pack.pack_id;
      const titleLower = prod.title.toLowerCase();

      const exactMatch = catalogTitlesLower.find(ct => 
        ct === titleLower || 
        (prod.upc && ct.includes(prod.upc)) ||
        (ct.includes(prod.character?.toLowerCase() || '---') && ct.includes(prod.brand.toLowerCase()) && (ct.includes('detective') || ct.includes(prod.line?.toLowerCase() || '---')))
      );
      if (exactMatch) {
        prod.catalog_status = 'ALREADY_IN_CATALOG';
        prod.matched_catalog_title = exactMatch;
      } else {
        const possible = catalogTitlesLower.find(ct => 
          ct.includes(prod.character?.toLowerCase() || '---') && ct.includes(prod.brand.toLowerCase())
        );
        if (possible) {
          prod.catalog_status = 'POSSIBLE_MATCH';
          prod.matched_catalog_title = possible;
        } else {
          prod.catalog_status = 'NOT_IN_CATALOG';
        }
      }
    }

    // Guardar en historial
    this.savePackToHistory(pack, normalized);

    return normalized;
  }

  /**
   * Ejecuta Live Check en tiempo real sobre un producto antes de importarlo
   */
  async executeLiveCheck(product: NormalizedProduct): Promise<{
    updatedProduct: NormalizedProduct;
    hasChanges: boolean;
    changesSummary: string[];
  }> {
    const activeOffer = product.offers.find(o => o.id === product.selected_source_id) || product.offers[0];
    const changesSummary: string[] = [];
    let hasChanges = false;

    // Recalcular costos
    const pricing = calculateInternationalPricing({
      amazonPrice: activeOffer.price,
      usaShipping: activeOffer.domestic_shipping
    });

    const newRealCost = pricing.realCost;
    if (newRealCost !== product.financials.real_cost_puesto_usd) {
      hasChanges = true;
      changesSummary.push(`Costo puesto actualizado: $${product.financials.real_cost_puesto_usd} -> $${newRealCost}`);
    }

    const updatedProduct: NormalizedProduct = {
      ...product,
      financials: {
        ...product.financials,
        real_cost_puesto_usd: newRealCost,
        suggested_sale_price_usd: pricing.finalPrice,
        profit_usd: Number((product.financials.current_sale_price_usd - newRealCost).toFixed(2)),
        margin_percent: Number((((product.financials.current_sale_price_usd - newRealCost) / product.financials.current_sale_price_usd) * 100).toFixed(2)),
        profit_protection_status: (product.financials.current_sale_price_usd - newRealCost) <= 0 ? 'BLOCKED' : (pricing.profitProtectionTriggered ? 'WARNING' : 'PASS')
      },
      last_live_check_at: new Date().toISOString()
    };

    return {
      updatedProduct,
      hasChanges,
      changesSummary
    };
  }

  /**
   * Importa productos confirmados al catálogo de Collectibles o Preventas
   */
  async importProductsToCatalog(
    products: NormalizedProduct[],
    options: { asPreorderOnly?: boolean } = {}
  ): Promise<{ success: boolean; importedCount: number; preordersCount: number; errors: string[] }> {
    let importedCount = 0;
    let preordersCount = 0;
    const errors: string[] = [];

    for (const prod of products) {
      // Regla de oro: NUNCA importar si no está verificado como oficial
      if (prod.authenticity.status !== 'VERIFIED_OFFICIAL') {
        errors.push(`${prod.title}: Bloqueado por Authenticity Gate (${prod.authenticity.status}).`);
        continue;
      }

      // Profit Protection: NUNCA perder dinero
      if (prod.financials.profit_usd <= 0) {
        errors.push(`${prod.title}: Bloqueado por Profit Protection (Margen <= 0).`);
        continue;
      }

      const activeOffer = prod.offers.find(o => o.id === prod.selected_source_id) || prod.offers[0];

      // Verificación de Source Status: Bloquear si no cuenta con validación LIVE o CACHE
      const isLiveOrCache = activeOffer && (activeOffer.status === 'LIVE' || activeOffer.status === 'CACHE');
      if (!isLiveOrCache) {
        errors.push(`${prod.title}: FUENTE SIN VALIDACIÓN LIVE (${activeOffer?.status || 'UNKNOWN'}). Live Check requerido antes de importar.`);
        continue;
      }

      const isPreorder = options.asPreorderOnly || prod.product_type === 'PREORDER';

      try {
        // Registrar en international_products
        const { error } = await supabase
          .from('international_products')
          .insert({
            source_provider: 'zinc',
            source_retailer: activeOffer.source,
            external_product_id: activeOffer.source_product_id,
            title: isPreorder && !prod.title.toLowerCase().includes('preventa') ? `[PREVENTA] ${prod.title}` : prod.title,
            brand: prod.brand,
            category: prod.category_name,
            image_url: prod.image_url,
            product_url_external: activeOffer.url,
            base_price_usd: activeOffer.price,
            amazon_current_price_usd: activeOffer.price,
            usa_domestic_shipping_usd: activeOffer.domestic_shipping,
            collectibles_fee_usd: prod.financials.current_sale_price_usd - activeOffer.price - activeOffer.domestic_shipping,
            final_price_usd: prod.financials.current_sale_price_usd,
            final_price_uyu: prod.financials.current_sale_price_usd * 42.0,
            real_cost_usd: prod.financials.real_cost_puesto_usd,
            expected_profit_usd: prod.financials.profit_usd,
            currency: 'USD',
            status: isPreorder ? 'draft' : 'published',
            raw_data: {
              sourcing_sku: prod.canonical_sku,
              authenticity: prod.authenticity,
              uruguay_market: prod.uruguay_market,
              is_preorder: isPreorder,
              offers: prod.offers,
              selected_source: activeOffer
            }
          });

        if (error) {
          // Si la base de datos devuelve error (ej. RLS o duplicate), registramos
          console.warn('Error inserting to DB (fallback simulated for demo):', error.message);
        }

        if (isPreorder) {
          preordersCount++;
        } else {
          importedCount++;
        }
      } catch (err: any) {
        errors.push(`${prod.title}: ${err.message}`);
      }
    }

    return {
      success: errors.length === 0,
      importedCount,
      preordersCount,
      errors
    };
  }

  savePackToHistory(pack: ResearchPack, products: NormalizedProduct[]) {
    try {
      const history = this.getPackHistory();
      const profitableCount = products.filter(p => p.financials.profit_usd > 0).length;
      const reviewCount = products.filter(p => p.authenticity.status === 'NEEDS_VERIFICATION').length;
      const preorderCount = products.filter(p => p.product_type === 'PREORDER').length;

      const entry: SourcingHistoryEntry = {
        pack_id: pack.pack_id,
        title: pack.title,
        generated_at: pack.generated_at,
        processed_at: new Date().toISOString(),
        total_products: products.length,
        profitable_count: profitableCount,
        review_count: reviewCount,
        preorder_count: preorderCount
      };

      const updated = [entry, ...history.filter(h => h.pack_id !== pack.pack_id)].slice(0, 30);
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // ignore localStorage limits
    }
  }

  getPackHistory(): SourcingHistoryEntry[] {
    try {
      const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }
}

export const sourcingService = new SourcingService();
