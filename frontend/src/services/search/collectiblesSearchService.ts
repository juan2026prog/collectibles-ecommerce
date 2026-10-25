import { supabase } from '../../lib/supabase';
import { relatedRecord } from '../../lib/relatedRecord';
import { PublicCatalogProvider } from '../../lib/providers/PublicCatalogProvider';
import { 
  interpretUserQuery, 
  generateDirectEditorialAnswer, 
  generateContextualQuestions,
  type AISearchQueryInterpretation 
} from '../../lib/search/aiQueryInterpreter';
import { FALLBACK_USD_TO_UYU_RATE, getStoredExchangeRate } from '../currencyService';
import { executeAI } from '../ai/aiGateway';
import { resolveSearchTokens, buildProductSearchOrClause } from '../../lib/search/searchQueryNormalizer';

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

// Helper to execute a Supabase query with real AbortController cancellation and circuit breaker
const SEARCH_CIRCUIT_STATE = {
  failureCount: 0,
  circuitOpenUntil: 0
};

async function executeCancellableQuery<T = any>(
  queryFactory: (signal: AbortSignal) => PromiseLike<{ data: T | null; error: any }>,
  timeoutMs = 3000
): Promise<{ data: T | null; error: any }> {
  const now = Date.now();
  if (now < SEARCH_CIRCUIT_STATE.circuitOpenUntil) {
    return { data: null, error: new Error('PostgreSQL search circuit breaker is open (saturation protection)') };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const res = await queryFactory(controller.signal);
    clearTimeout(timer);
    SEARCH_CIRCUIT_STATE.failureCount = 0;
    return res;
  } catch (err: any) {
    clearTimeout(timer);
    SEARCH_CIRCUIT_STATE.failureCount++;
    if (SEARCH_CIRCUIT_STATE.failureCount >= 2) {
      SEARCH_CIRCUIT_STATE.circuitOpenUntil = Date.now() + 60_000; // Open circuit for 60s
      console.warn('CollectiblesSearchService: PostgreSQL search circuit OPENED for 60s after repeated timeouts/aborts');
    }
    return { data: null, error: err };
  }
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

    // 1. Query Products (Cloudflare D1 Primary -> Supabase Fallback)
    const tokens = await resolveSearchTokens(searchTerm);
    let localResults: SearchProductResult[] = [];
    let intlResults: SearchProductResult[] = [];
    let d1Succeeded = false;

    try {
      if (PublicCatalogProvider.isDomainEnabled('products') || PublicCatalogProvider.isDomainEnabled('search')) {
        const d1Res = await PublicCatalogProvider.getProducts({
          q: searchTerm,
          limit: limitLocal + limitIntl,
          availability: options.filterTab === 'in_stock' ? 'local' : (options.filterTab === 'international' ? 'international' : 'all')
        });

        if (d1Res && d1Res.data && Array.isArray(d1Res.data.products)) {
          d1Succeeded = true;
          d1Res.data.products.forEach((p: any) => {
            const isIntl = Boolean(p.is_international);
            const price = Number(p.price || p.base_price || 0);
            const priceUsd = isIntl ? price : Number((price / fxRate).toFixed(2));
            const priceUyu = isIntl ? Math.round(price * fxRate) : price;

            // Budget filter check
            if (localPriceMin !== undefined && priceUyu < localPriceMin) return;
            if (localPriceMax !== undefined && priceUyu > localPriceMax) return;
            if (intlPriceMin !== undefined && priceUsd < intlPriceMin) return;
            if (intlPriceMax !== undefined && priceUsd > intlPriceMax) return;

            const mappedItem: SearchProductResult = {
              id: p.id,
              title: p.title,
              slug: p.slug,
              base_price: price,
              price: price,
              compare_at_price: p.compare_at_price ? Number(p.compare_at_price) : undefined,
              currency: isIntl ? 'USD' : 'UYU',
              price_in_usd: priceUsd,
              price_in_uyu: priceUyu,
              images: Array.isArray(p.images) ? p.images : (p.primary_image_url ? [{ id: p.id, url: p.primary_image_url, is_primary: true }] : []),
              image_url: p.primary_image_url || p.image_url || (Array.isArray(p.images) && p.images[0]?.url),
              badge: p.badge,
              is_featured: Boolean(p.is_featured),
              is_active: Boolean(p.is_active !== false),
              status: p.status || 'published',
              brand: p.brand ? { name: p.brand.name, slug: p.brand.slug, logo_url: p.brand.logo_url } : undefined,
              category: p.category ? { name: p.category.name, slug: p.category.slug } : undefined,
              vendor: p.vendor ? { id: p.vendor.id, store_name: p.vendor.store_name, slug: p.vendor.slug, logo_url: p.vendor.logo_url } : undefined,
              vendor_store: p.vendor_store ? { id: p.vendor_store.id, store_name: p.vendor_store.store_name, slug: p.vendor_store.slug, logo_url: p.vendor_store.logo_url, is_official: p.vendor_store.is_official } : undefined,
              variants: Array.isArray(p.variants) ? p.variants : [],
              is_international: isIntl,
              source_provider: p.source_provider || (isIntl ? 'zinc' : 'platform'),
              condition: p.condition || 'new_sealed',
              created_at: p.created_at
            };

            if (isIntl) {
              intlResults.push(mappedItem);
            } else {
              localResults.push(mappedItem);
            }
          });
        }
      }
    } catch (d1Err) {
      console.warn('CollectiblesSearchService: D1 search fallback to Supabase:', d1Err);
    }

    // Fallback to Supabase if D1 was disabled or returned no response structure
    if (!d1Succeeded) {
      try {
        const tokens = await resolveSearchTokens(searchTerm);
        const orClause = buildProductSearchOrClause(tokens);

        const { data: localData, error: localErr } = await executeCancellableQuery(signal => {
          let q = supabase
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
            .eq('status', 'published')
            .eq('is_active', true)
            .abortSignal(signal);

          if (orClause) {
            q = q.or(orClause);
          } else if (searchTerm) {
            q = q.ilike('title', `%${searchTerm}%`);
          }
          if (localPriceMax) {
            q = q.lte('base_price', Math.round(localPriceMax));
          }
          if (localPriceMin) {
            q = q.gte('base_price', Math.round(localPriceMin));
          }

          return q.limit(limitLocal);
        }, 3000);

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
              brand: relatedRecord(item.brand),
              category: relatedRecord(item.category),
              vendor: relatedRecord(item.vendor),
              vendor_store: relatedRecord(item.vendor_store),
              variants: item.variants,
              is_international: false,
              condition: item.condition,
              created_at: item.created_at
            };
          });
        }

        // 2. Query International Products with cancellable query
        const { data: intlData } = await executeCancellableQuery(signal => {
          let q = supabase
            .from('international_products')
            .select('id, title, slug, final_price_usd, amazon_list_price_usd, image_url, brand, category, status')
            .eq('status', 'published')
            .abortSignal(signal);

          if (searchTerm) {
            q = q.ilike('title', `%${searchTerm}%`);
          }
          if (intlPriceMax) {
            q = q.lte('final_price_usd', Math.round(intlPriceMax * 100) / 100);
          }
          if (intlPriceMin) {
            q = q.gte('final_price_usd', Math.round(intlPriceMin * 100) / 100);
          }

          return q.limit(limitIntl);
        }, 3000);

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
      } catch (sqlFallbackErr) {
        console.warn('CollectiblesSearchService: SQL fallback degraded gracefully:', sqlFallbackErr);
      }
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

    // 3. Query Radar / Release Events (D1 Primary -> Safe Fallback with Circuit Breaker)
    let radarDrops: RadarSearchResult[] = [];
    let radarD1Succeeded = false;

    try {
      if (PublicCatalogProvider.isDomainEnabled('radar')) {
        // Fetch up to 100 drops to evaluate against search query without missing matches
        const d1Radar = await PublicCatalogProvider.getRadarReleases(100);
        if (d1Radar && d1Radar.data && Array.isArray(d1Radar.data.releases)) {
          radarD1Succeeded = true;
          const searchLower = searchTerm.toLowerCase();
          const filtered = d1Radar.data.releases.filter((r: any) => {
            const title = String(r.title || '').toLowerCase();
            const brand = String(r.brand_name || r.brand || '').toLowerCase();
            const line = String(r.line || r.product_line || '').toLowerCase();
            return title.includes(searchLower) || brand.includes(searchLower) || line.includes(searchLower);
          }).slice(0, limitRadar);

          radarDrops = filtered.map((r: any) => ({
            id: r.id,
            slug: r.slug,
            title: r.title,
            brand: r.brand_name || r.brand?.name || r.brand || r.manufacturer || 'Oficial',
            line: r.line || r.product_line || 'Línea Regular',
            radar_signal: r.radar_signal || 'NUEVO_ANUNCIO',
            date_label: r.date_display_text || r.estimated_quarter || 'Próximamente',
            official_image_url: r.official_image_url || r.hero_image_url || '/images/radar/placeholder.jpg'
          }));
        }
      }
    } catch (radarD1Err) {
      console.warn('CollectiblesSearchService: radar D1 load fallback:', radarD1Err);
    }

    if (!radarD1Succeeded) {
      try {
        const { data: radarEvents } = await executeCancellableQuery(signal => {
          return supabase
            .from('release_events')
            .select('id, slug, title, manufacturer, product_line, radar_signal, date_display_text, official_image_url, brand:brands(name)')
            .eq('is_published', true)
            .or(`title.ilike.%${searchTerm}%,manufacturer.ilike.%${searchTerm}%,franchise.ilike.%${searchTerm}%`)
            .abortSignal(signal)
            .limit(limitRadar);
        }, 3000);

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
        console.warn('CollectiblesSearchService: radar load degraded gracefully:', radarErr);
      }
    }

    // 4. Relaxed Products fallback if 0 exact results (D1 Primary -> Supabase Fallback)
    let relaxedProducts: SearchProductResult[] = [];
    if (combined.length === 0) {
      let relaxedD1Done = false;
      try {
        if (PublicCatalogProvider.isDomainEnabled('products')) {
          const d1Relaxed = await PublicCatalogProvider.getProducts({ limit: 12 });
          if (d1Relaxed && d1Relaxed.data && Array.isArray(d1Relaxed.data.products)) {
            relaxedD1Done = true;
            relaxedProducts = d1Relaxed.data.products.map((p: any) => {
              const isIntl = Boolean(p.is_international);
              const price = Number(p.price || p.base_price || 0);
              const priceUsd = isIntl ? price : Number((price / fxRate).toFixed(2));
              const priceUyu = isIntl ? Math.round(price * fxRate) : price;
              return {
                id: p.id,
                title: p.title,
                slug: p.slug,
                base_price: price,
                price: price,
                compare_at_price: p.compare_at_price ? Number(p.compare_at_price) : undefined,
                currency: isIntl ? 'USD' : 'UYU',
                price_in_usd: priceUsd,
                price_in_uyu: priceUyu,
                images: Array.isArray(p.images) ? p.images : (p.primary_image_url ? [{ id: p.id, url: p.primary_image_url, is_primary: true }] : []),
                image_url: p.primary_image_url || p.image_url || (Array.isArray(p.images) && p.images[0]?.url),
                badge: p.badge,
                is_featured: Boolean(p.is_featured),
                is_active: Boolean(p.is_active !== false),
                status: p.status || 'published',
                brand: p.brand ? { name: p.brand.name, slug: p.brand.slug, logo_url: p.brand.logo_url } : undefined,
                category: p.category ? { name: p.category.name, slug: p.category.slug } : undefined,
                vendor: p.vendor ? { id: p.vendor.id, store_name: p.vendor.store_name, slug: p.vendor.slug, logo_url: p.vendor.logo_url } : undefined,
                vendor_store: p.vendor_store ? { id: p.vendor_store.id, store_name: p.vendor_store.store_name, slug: p.vendor_store.slug, logo_url: p.vendor_store.logo_url, is_official: p.vendor_store.is_official } : undefined,
                variants: Array.isArray(p.variants) ? p.variants : [],
                is_international: isIntl,
                condition: p.condition || 'new_sealed',
                created_at: p.created_at
              };
            });
          }
        }
      } catch (_) {}

      if (!relaxedD1Done) {
        try {
          const { data: fallbackLocal } = await executeCancellableQuery(signal => {
            return supabase
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
              .abortSignal(signal)
              .limit(12);
          }, 3000);

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
                brand: relatedRecord(item.brand),
                category: relatedRecord(item.category),
                vendor: relatedRecord(item.vendor),
                vendor_store: relatedRecord(item.vendor_store),
                variants: item.variants,
                is_international: false,
                condition: item.condition,
                created_at: item.created_at
              };
            });
          }
        } catch (_) {}
      }
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

    // Telemetry log via secure controlled RPC (non-blocking)
    try {
      supabase.rpc('log_ai_search_event', {
        p_query: rawQuery,
        p_normalized_query: tokens.normalized || rawQuery.toLowerCase().trim(),
        p_intent: interp.intent || 'product_search',
        p_filters: {
          brand: interp.detectedBrand,
          license: interp.detectedLicense,
          line: interp.detectedLine,
          scale: interp.detectedScale,
          priceCurrency: interp.priceCurrency,
          priceRange: [interp.priceMin, interp.priceMax]
        },
        p_results_count: combined.length,
        p_source: 'search_service'
      }).then(() => {}, () => {});
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
