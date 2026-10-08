import { supabase } from '../../lib/supabase';
import { 
  interpretUserQuery, 
  generateDirectEditorialAnswer, 
  generateContextualQuestions,
  type AISearchQueryInterpretation 
} from '../../lib/search/aiQueryInterpreter';
import { FALLBACK_USD_TO_UYU_RATE, getStoredExchangeRate } from '../currencyService';
import { executeAI } from '../ai/aiGateway';

export interface SearchProductResult {
  id: string;
  title: string;
  slug: string;
  base_price: number;
  price: number;
  compare_at_price?: number;
  currency: 'UYU' | 'USD';
  price_in_usd: number;
  price_in_uyu: number;
  images: Array<{ id: string; url: string; is_primary?: boolean }>;
  image_url?: string;
  badge?: string;
  is_featured?: boolean;
  is_active: boolean;
  status?: string;
  brand?: { name: string; slug: string; logo_url?: string };
  category?: { name: string; slug: string };
  vendor?: { id: string; store_name: string; slug: string; logo_url?: string };
  vendor_store?: { id: string; store_name: string; slug: string; logo_url?: string; is_official?: boolean };
  variants?: Array<{ id: string; sku: string; price_adjustment: number; inventory_count: number }>;
  is_international: boolean;
  source_provider?: string;
  condition?: string;
  created_at?: string;
}

export interface RadarSearchResult {
  id: string;
  slug: string;
  title: string;
  brand: string;
  line: string;
  radar_signal: string;
  date_label: string;
  official_image_url: string;
}

export interface UnifiedSearchOptions {
  query: string;
  limitLocal?: number;
  limitInternational?: number;
  limitRadar?: number;
  filterTab?: 'all' | 'in_stock' | 'preorder' | 'international';
  enableAIEditorial?: boolean;
  userLocale?: string;
}

export interface UnifiedSearchResult {
  query: string;
  interpretation: AISearchQueryInterpretation;
  products: SearchProductResult[];
  relaxedProducts: SearchProductResult[];
  radarDrops: RadarSearchResult[];
  editorialAnswer: {
    headline: string;
    summary: string;
    breakdown: string[];
    nextHighlight?: string;
  } | null;
  relatedQuestions: string[];
  totalResults: number;
  counts: {
    local: number;
    international: number;
    preorder: number;
  };
}

/**
 * Universal Search Service for Collectibles 2026.
 * Reusable by both /ai-search and Collectibles AI Assistant.
 */
export class CollectiblesSearchService {
  /**
   * Resolves the current USD -> UYU exchange rate safely
   */
  public static getExchangeRate(): number {
    try {
      const stored = getStoredExchangeRate('UYU');
      if (stored && stored.rate && stored.rate > 0) {
        return stored.rate;
      }
    } catch (_) {}
    return FALLBACK_USD_TO_UYU_RATE;
  }

  /**
   * Performs unified multi-catalog search with currency normalization and intent parsing
   */
  public static async search(options: UnifiedSearchOptions): Promise<UnifiedSearchResult> {
    const rawQuery = (options.query || '').trim();
    const interp = interpretUserQuery(rawQuery);
    const fxRate = this.getExchangeRate();

    const limitLocal = options.limitLocal ?? 36;
    const limitIntl = options.limitInternational ?? 24;
    const limitRadar = options.limitRadar ?? 6;

    if (!rawQuery) {
      return {
        query: '',
        interpretation: interp,
        products: [],
        relaxedProducts: [],
        radarDrops: [],
        editorialAnswer: null,
        relatedQuestions: [],
        totalResults: 0,
        counts: { local: 0, international: 0, preorder: 0 }
      };
    }

    const searchTerm = interp.cleanedQuery || interp.detectedLicense || interp.detectedBrand || interp.detectedLine || rawQuery;

    // Convert budget filters to each catalog's native currency
    let localPriceMin: number | undefined;
    let localPriceMax: number | undefined;
    let intlPriceMin: number | undefined;
    let intlPriceMax: number | undefined;

    if (interp.priceCurrency === 'USD') {
      intlPriceMin = interp.priceMin;
      intlPriceMax = interp.priceMax;
      localPriceMin = interp.priceMin ? interp.priceMin * fxRate : undefined;
      localPriceMax = interp.priceMax ? interp.priceMax * fxRate : undefined;
    } else if (interp.priceCurrency === 'UYU') {
      localPriceMin = interp.priceMin;
      localPriceMax = interp.priceMax;
      intlPriceMin = interp.priceMin ? interp.priceMin / fxRate : undefined;
      intlPriceMax = interp.priceMax ? interp.priceMax / fxRate : undefined;
    } else {
      // Inferred or unspecified: if <= 300, it is almost certainly USD for figures
      const assumedUSD = (interp.priceMax && interp.priceMax <= 300) || (interp.priceMin && interp.priceMin <= 300);
      if (assumedUSD) {
        intlPriceMin = interp.priceMin;
        intlPriceMax = interp.priceMax;
        localPriceMin = interp.priceMin ? interp.priceMin * fxRate : undefined;
        localPriceMax = interp.priceMax ? interp.priceMax * fxRate : undefined;
      } else {
        localPriceMin = interp.priceMin;
        localPriceMax = interp.priceMax;
        intlPriceMin = interp.priceMin ? interp.priceMin / fxRate : undefined;
        intlPriceMax = interp.priceMax ? interp.priceMax / fxRate : undefined;
      }
    }

    // 1. Query Local Products
    let localQuery = supabase
      .from('products')
      .select(`
        id, title, slug, base_price, compare_at_price, badge, is_featured, is_active, status, vendor_id, vendor_store_id, brand_id, category_id, condition, created_at,
        category:categories(id, name, slug),
        brand:brands!products_brand_id_fkey(id, name, slug, logo_url),
        images:product_images(id, url, alt_text, is_primary),
        variants:product_variants(id, sku, price_adjustment, inventory_count),
        vendor:vendors(id, store_name, slug, logo_url),
        vendor_store:vendor_stores(id, store_name, slug, logo_url, is_official)
      `)
      .eq('is_active', true)
      .limit(limitLocal);

    if (searchTerm) {
      localQuery = localQuery.ilike('title', `%${searchTerm}%`);
    }
    if (localPriceMax) {
      localQuery = localQuery.lte('base_price', Math.round(localPriceMax));
    }
    if (localPriceMin) {
      localQuery = localQuery.gte('base_price', Math.round(localPriceMin));
    }

    const { data: localData, error: localErr } = await localQuery;
    let localResults: SearchProductResult[] = [];

    if (!localErr && Array.isArray(localData)) {
      localResults = localData.map(item => {
        const priceUyu = Number(item.base_price || 0);
        const priceUsd = Number((priceUyu / fxRate).toFixed(2));
        return {
          id: item.id,
          title: item.title,
          slug: item.slug,
          base_price: priceUyu,
          price: priceUyu,
          compare_at_price: item.compare_at_price ? Number(item.compare_at_price) : undefined,
          currency: 'UYU',
          price_in_usd: priceUsd,
          price_in_uyu: priceUyu,
          images: item.images || [],
          image_url: item.images?.find((img: any) => img.is_primary)?.url || item.images?.[0]?.url,
          badge: item.badge,
          is_featured: item.is_featured,
          is_active: item.is_active,
          status: item.status,
          brand: item.brand,
          category: item.category,
          vendor: item.vendor,
          vendor_store: item.vendor_store,
          variants: item.variants,
          is_international: false,
          condition: item.condition,
          created_at: item.created_at
        };
      });
    }

    // 2. Query International Products
    let intlQuery = supabase
      .from('international_products')
      .select('id, title, slug, final_price_usd, amazon_list_price_usd, image_url, brand, category, status')
      .eq('status', 'published')
      .limit(limitIntl);

    if (searchTerm) {
      intlQuery = intlQuery.ilike('title', `%${searchTerm}%`);
    }
    if (intlPriceMax) {
      intlQuery = intlQuery.lte('final_price_usd', Math.round(intlPriceMax * 100) / 100);
    }
    if (intlPriceMin) {
      intlQuery = intlQuery.gte('final_price_usd', Math.round(intlPriceMin * 100) / 100);
    }

    const { data: intlData } = await intlQuery;
    let intlResults: SearchProductResult[] = [];

    if (Array.isArray(intlData)) {
      intlResults = intlData.map(item => {
        const priceUsd = Number(item.final_price_usd || item.amazon_list_price_usd || 0);
        const priceUyu = Math.round(priceUsd * fxRate);
        return {
          id: item.id,
          title: item.title,
          slug: item.slug || `intl-${item.id}`,
          base_price: priceUsd,
          price: priceUsd,
          compare_at_price: Number(item.amazon_list_price_usd || item.final_price_usd || 0),
          currency: 'USD',
          price_in_usd: priceUsd,
          price_in_uyu: priceUyu,
          images: [{ id: item.id, url: item.image_url, is_primary: true }],
          image_url: item.image_url,
          brand: { name: item.brand || 'Importado', slug: item.brand ? item.brand.toLowerCase() : 'importado' },
          category: { name: item.category || 'Coleccionables', slug: 'coleccionables' },
          source_provider: 'zinc',
          is_international: true,
          is_active: true,
          status: item.status
        };
      });
    }

    // Filter exclusions (e.g. "que no sea Funko")
    if (interp.excludedBrand) {
      const excl = interp.excludedBrand.toUpperCase();
      localResults = localResults.filter(p => !p.brand?.name?.toUpperCase().includes(excl) && !p.title.toUpperCase().includes(excl));
      intlResults = intlResults.filter(p => !p.brand?.name?.toUpperCase().includes(excl) && !p.title.toUpperCase().includes(excl));
    }

    let combined = [...localResults, ...intlResults];

    // Filter tab if specified
    if (options.filterTab === 'in_stock') {
      combined = combined.filter(p => !p.is_international && p.status !== 'preorder');
    } else if (options.filterTab === 'preorder') {
      combined = combined.filter(p => p.status === 'preorder');
    } else if (options.filterTab === 'international') {
      combined = combined.filter(p => p.is_international);
    }

    // 3. Query Radar / Release Events
    let radarDrops: RadarSearchResult[] = [];
    try {
      const { data: radarEvents } = await supabase
        .from('release_events')
        .select('id, slug, title, manufacturer, product_line, radar_signal, date_display_text, official_image_url, brand:brands(name)')
        .eq('is_published', true)
        .or(`title.ilike.%${searchTerm}%,manufacturer.ilike.%${searchTerm}%,franchise.ilike.%${searchTerm}%`)
        .limit(limitRadar);

      if (Array.isArray(radarEvents)) {
        radarDrops = radarEvents.map((r: any) => ({
          id: r.id,
          slug: r.slug,
          title: r.title,
          brand: r.brand?.name || r.manufacturer || 'Oficial',
          line: r.product_line || 'Línea Regular',
          radar_signal: r.radar_signal || 'NUEVO_ANUNCIO',
          date_label: r.date_display_text || 'Próximamente',
          official_image_url: r.official_image_url || '/images/radar/placeholder.jpg'
        }));
      }
    } catch (radarErr) {
      console.warn('CollectiblesSearchService: radar load error:', radarErr);
    }

    // 4. Relaxed Products fallback if 0 exact results
    let relaxedProducts: SearchProductResult[] = [];
    if (combined.length === 0) {
      try {
        const { data: fallbackLocal } = await supabase
          .from('products')
          .select(`
            id, title, slug, base_price, compare_at_price, badge, is_featured, is_active, status, vendor_id, vendor_store_id, brand_id, category_id, condition, created_at,
            category:categories(id, name, slug),
            brand:brands!products_brand_id_fkey(id, name, slug, logo_url),
            images:product_images(id, url, alt_text, is_primary),
            variants:product_variants(id, sku, price_adjustment, inventory_count),
            vendor:vendors(id, store_name, slug, logo_url),
            vendor_store:vendor_stores(id, store_name, slug, logo_url, is_official)
          `)
          .eq('is_active', true)
          .limit(12);

        if (Array.isArray(fallbackLocal)) {
          relaxedProducts = fallbackLocal.map(item => {
            const priceUyu = Number(item.base_price || 0);
            const priceUsd = Number((priceUyu / fxRate).toFixed(2));
            return {
              id: item.id,
              title: item.title,
              slug: item.slug,
              base_price: priceUyu,
              price: priceUyu,
              compare_at_price: item.compare_at_price ? Number(item.compare_at_price) : undefined,
              currency: 'UYU',
              price_in_usd: priceUsd,
              price_in_uyu: priceUyu,
              images: item.images || [],
              image_url: item.images?.find((img: any) => img.is_primary)?.url || item.images?.[0]?.url,
              badge: item.badge,
              is_featured: item.is_featured,
              is_active: item.is_active,
              status: item.status,
              brand: item.brand,
              category: item.category,
              vendor: item.vendor,
              vendor_store: item.vendor_store,
              variants: item.variants,
              is_international: false,
              condition: item.condition,
              created_at: item.created_at
            };
          });
        }
      } catch (_) {}
    }

    // 5. Editorial AI Answer with deterministic fallback
    const fallbackAnswer = generateDirectEditorialAnswer(interp, combined, radarDrops);
    const fallbackQuestions = generateContextualQuestions(interp);
    let editorialAnswer = fallbackAnswer;
    let relatedQuestions = fallbackQuestions;

    if (options.enableAIEditorial !== false) {
      try {
        const aiResult = await executeAI<{
          headline: string;
          summary: string;
          breakdown: string[];
          nextHighlight?: string | null;
          relatedQuestions?: string[];
        }>({
          engine: 'AI_SEARCH',
          country: 'UY',
          operation: 'editorial_search_answer',
          payload: {
            query: rawQuery,
            interpretation: interp,
            products: combined.slice(0, 12).map((p) => ({
              id: p.id,
              title: p.title,
              price: p.price,
              currency: p.currency,
              price_usd: p.price_in_usd,
              brand: p.brand?.name || null,
              category: p.category?.name || null,
              status: p.status || null,
              international: p.is_international
            })),
            radar: radarDrops.slice(0, 6).map((r) => ({
              title: r.title,
              brand: r.brand,
              line: r.line,
              signal: r.radar_signal,
              date: r.date_label
            }))
          },
          context: { locale: options.userLocale || 'es-UY' },
          fallbackHandler: async () => ({
            ...fallbackAnswer,
            relatedQuestions: fallbackQuestions
          })
        });

        if (aiResult.success && aiResult.data?.headline && aiResult.data?.summary) {
          editorialAnswer = {
            headline: aiResult.data.headline,
            summary: aiResult.data.summary,
            breakdown: Array.isArray(aiResult.data.breakdown) ? aiResult.data.breakdown : fallbackAnswer.breakdown,
            nextHighlight: aiResult.data.nextHighlight || fallbackAnswer.nextHighlight
          };
          if (Array.isArray(aiResult.data.relatedQuestions) && aiResult.data.relatedQuestions.length > 0) {
            relatedQuestions = aiResult.data.relatedQuestions;
          }
        }
      } catch (err) {
        console.warn('CollectiblesSearchService: AI editorial execution fallback:', err);
      }
    }

    // Telemetry log to ai_search_logs (non-blocking)
    try {
      supabase.from('ai_search_logs').insert({
        query: rawQuery,
        results_count: combined.length,
        filters_detected: {
          brand: interp.detectedBrand,
          license: interp.detectedLicense,
          line: interp.detectedLine,
          scale: interp.detectedScale,
          priceCurrency: interp.priceCurrency,
          priceRange: [interp.priceMin, interp.priceMax]
        }
      }).then(() => {}).catch(() => {});
    } catch (_) {}

    return {
      query: rawQuery,
      interpretation: interp,
      products: combined,
      relaxedProducts,
      radarDrops,
      editorialAnswer,
      relatedQuestions,
      totalResults: combined.length,
      counts: {
        local: localResults.length,
        international: intlResults.length,
        preorder: combined.filter(p => p.status === 'preorder').length
      }
    };
  }
}
