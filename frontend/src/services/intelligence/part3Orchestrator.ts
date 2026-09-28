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

async function safeRows(table: string, limit = 50, order = 'created_at'): Promise<any[]> {
  try {
    const { data, error } = await supabase.from(table).select('*').order(order, { ascending: false }).limit(limit);
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
  // Production evidence sources that actually exist today. We derive advisory
  // signals from searches/wishlists rather than pretending nonexistent aggregate tables exist.
  const [searches, wishlistRows, opportunities, releases] = await Promise.all([
    safeRows('international_import_searches', 60),
    safeRows('wishlists', 60),
    safeRows('international_import_candidates', 40, 'updated_at'),
    safeRows('release_events', 40, 'updated_at')
  ]);
  const signals = [
    ...searches.map((row:any) => ({ id: row.id, type: 'SEARCH', query: row.query, created_at: row.created_at })),
    ...wishlistRows.map((row:any) => ({ id: row.id, type: 'WISHLIST', product_id: row.product_id, created_at: row.created_at }))
  ];
  // A catalog gap is not inferred merely from a search. Until a deterministic gap detector
  // supplies evidence, keep this empty so AI cannot manufacture "missing catalog" claims.
  const gaps: any[] = [];

  const base: IntelligenceEvidence = {
    ...seed,
    demandSignals: seed.demandSignals || signals,
    catalogGaps: seed.catalogGaps || gaps,
    products: seed.products || opportunities,
    releases: seed.releases || releases,
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
