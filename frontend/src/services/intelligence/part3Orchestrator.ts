import { supabase } from '../../lib/supabase';
import type { AICountryCode, AIEngineKey } from '../ai/types';
import {
  productDiscoveryIntelligence, trendAnalysisIntelligence, productCurationIntelligence,
  countryIntelligence, radarIntelligence, releaseIntelligence,
  type IntelligenceEvidence, type IntelligenceResult
} from './collectiblesIntelligence';

export interface Part3RunResult {
  engine: AIEngineKey;
  country: AICountryCode;
  evidence: IntelligenceEvidence;
  intelligence: IntelligenceResult;
  generatedAt: string;
}

async function safeRows(table: string, selectCols = '*', limit = 50, order = 'created_at'): Promise<any[]> {
  try {
    const { data, error } = await supabase.from(table).select(selectCols).order(order, { ascending: false }).limit(limit);
    if (error) {
      console.warn('[Part3Evidence] source unavailable', { table, code: error.code, message: error.message });
      return [];
    }
    return data || [];
  } catch (error) {
    console.warn('[Part3Evidence] source read failed', { table, error });
    return [];
  }
}

async function buildEvidence(engine: AIEngineKey, country: AICountryCode, seed: IntelligenceEvidence = {}): Promise<IntelligenceEvidence> {
  // Query only verified production sources with strict PII minimization
  const [searches, wishlists, candidates, releases] = await Promise.all([
    safeRows('international_import_searches', 'id, query, retailer, min_price, max_price, created_at', 40),
    safeRows('wishlists', 'product_id, created_at', 40),
    safeRows('international_import_candidates', 'id, title, brand, category, retailer, price_usd, currency, rating, review_count, availability, created_at', 40),
    safeRows('release_events', 'id, title, brand_id, character, product_line, manufacturer, status, msrp, currency, announcement_date, preorder_date, release_date_start, release_precision, date_display_text, radar_signal, radar_why, radar_context, franchise, category, is_verified, created_at', 40, 'updated_at')
  ]);

  // Transform searches & wishlists into demand signals (PII stripped)
  const searchSignals = (searches || []).map((s: any) => ({
    type: 'SEARCH',
    id: s.id,
    query: s.query,
    retailer: s.retailer,
    created_at: s.created_at
  }));

  const wishlistSignals = (wishlists || []).map((w: any) => ({
    type: 'WISHLIST',
    product_id: w.product_id,
    created_at: w.created_at
  }));

  const demandSignals = [...searchSignals, ...wishlistSignals];

  // Candidates represent products / opportunities
  const products = (candidates || []).map((c: any) => ({
    id: c.id,
    title: c.title,
    brand: c.brand,
    category: c.category,
    retailer: c.retailer,
    price_usd: c.price_usd,
    currency: c.currency,
    rating: c.rating,
    review_count: c.review_count,
    availability: c.availability
  }));

  // Catalog gaps intentionally empty until deterministic detector is built
  const catalogGaps: unknown[] = [];

  const base: IntelligenceEvidence = {
    ...seed,
    demandSignals: seed.demandSignals || demandSignals,
    catalogGaps: seed.catalogGaps || catalogGaps,
    products: seed.products || products,
    releases: seed.releases || releases,
    radar: seed.radar || releases.filter((r: any) => r.radar_signal),
    market: { ...(seed.market || {}), country }
  };

  // Minimize evidence sent to each engine; do not send unrelated customer/profile data.
  switch (engine) {
    case 'PRODUCT_DISCOVERY':
      return { products: base.products, offers: base.offers, demandSignals: base.demandSignals, catalogGaps: base.catalogGaps, radar: base.radar, releases: base.releases, market: base.market, importRules: base.importRules, competition: base.competition };
    case 'TREND_ANALYSIS':
      return { demandSignals: base.demandSignals, catalogGaps: base.catalogGaps, radar: base.radar, releases: base.releases, market: base.market };
    case 'PRODUCT_CURATION':
      return { products: base.products, offers: base.offers, market: base.market };
    case 'COUNTRY_INTELLIGENCE':
      return { products: base.products, offers: base.offers, demandSignals: base.demandSignals, market: base.market, importRules: base.importRules, competition: base.competition };
    case 'RADAR_INTELLIGENCE':
      return { radar: base.radar, releases: base.releases, demandSignals: base.demandSignals, catalogGaps: base.catalogGaps, market: base.market };
    case 'RELEASE_INTELLIGENCE':
      return { releases: base.releases, radar: base.radar, demandSignals: base.demandSignals, market: base.market };
    default:
      return base;
  }
}

const runners = {
  PRODUCT_DISCOVERY: productDiscoveryIntelligence,
  TREND_ANALYSIS: trendAnalysisIntelligence,
  PRODUCT_CURATION: productCurationIntelligence,
  COUNTRY_INTELLIGENCE: countryIntelligence,
  RADAR_INTELLIGENCE: radarIntelligence,
  RELEASE_INTELLIGENCE: releaseIntelligence
} as const;

export async function runPart3Engine(
  engine: keyof typeof runners,
  country: AICountryCode = 'UY',
  seed: IntelligenceEvidence = {},
  objective?: string
): Promise<Part3RunResult> {
  const evidence = await buildEvidence(engine, country, seed);
  const intelligence = await runners[engine](country, evidence, objective);
  return { engine, country, evidence, intelligence, generatedAt: new Date().toISOString() };
}

export async function runPart3Portfolio(country: AICountryCode = 'UY', seed: IntelligenceEvidence = {}) {
  // Sequential by design: protects budgets and avoids a burst of six paid calls.
  const engines: Array<keyof typeof runners> = [
    'PRODUCT_DISCOVERY','TREND_ANALYSIS','PRODUCT_CURATION',
    'COUNTRY_INTELLIGENCE','RADAR_INTELLIGENCE','RELEASE_INTELLIGENCE'
  ];
  const results: Part3RunResult[] = [];
  for (const engine of engines) results.push(await runPart3Engine(engine, country, seed));
  return results;
}
