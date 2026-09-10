/**
 * SOURCING INTELLIGENCE — FASE 3 — PERSONALIZATION ENGINE
 * 
 * Deterministic engine for User Interest Profiles, Personal Relevance Scoring,
 * Final Ranking, Frequency Capping, Diversity Control, and Dynamic Merchandising.
 * 
 * NO dependence on OpenAI for ranking calculations.
 */

import { supabase } from '../../lib/supabase';

// Signal Event Types & Default Weights
export type SignalEventType =
  | 'VIEW'
  | 'CATEGORY_OPEN'
  | 'BRAND_OPEN'
  | 'LICENSE_OPEN'
  | 'RADAR_OPEN'
  | 'PRODUCT_CLICK'
  | 'PRODUCT_DETAIL_ENGAGE'
  | 'SEARCH_INTENT'
  | 'FILTER_APPLY'
  | 'RADAR_PRODUCT_VIEW'
  | 'COMPARE'
  | 'WISHLIST'
  | 'VAULT_OWNED'
  | 'VAULT_WISHLIST'
  | 'ADD_TO_CART'
  | 'PRODUCT_ALERT'
  | 'SHARE'
  | 'PURCHASE'
  | 'REPEATED_PURCHASE'
  | 'REMOVE_WISHLIST'
  | 'REMOVE_CART'
  | 'HIDE_RECOMMENDATION'
  | 'IMPRESSION_NO_CLICK';

export const DEFAULT_SIGNAL_WEIGHTS: Record<SignalEventType, number> = {
  VIEW: 1.0,
  CATEGORY_OPEN: 1.5,
  BRAND_OPEN: 1.5,
  LICENSE_OPEN: 1.5,
  RADAR_OPEN: 2.0,
  PRODUCT_CLICK: 2.0,
  PRODUCT_DETAIL_ENGAGE: 3.0,
  SEARCH_INTENT: 3.0,
  FILTER_APPLY: 3.0,
  RADAR_PRODUCT_VIEW: 3.5,
  COMPARE: 4.0,
  WISHLIST: 6.0,
  VAULT_OWNED: 8.0,
  VAULT_WISHLIST: 6.0,
  ADD_TO_CART: 8.0,
  PRODUCT_ALERT: 8.0,
  SHARE: 6.0,
  PURCHASE: 12.0,
  REPEATED_PURCHASE: 15.0,
  REMOVE_WISHLIST: -4.0,
  REMOVE_CART: -5.0,
  HIDE_RECOMMENDATION: -6.0,
  IMPRESSION_NO_CLICK: -0.2
};

export type InterestDimension =
  | 'category'
  | 'brand'
  | 'license'
  | 'line'
  | 'character'
  | 'scale'
  | 'manufacturer'
  | 'price_range';

export interface EntityMap {
  category?: string;
  brand?: string;
  license?: string;
  line?: string;
  character?: string;
  scale?: string;
  manufacturer?: string;
  price_range?: string;
}

export interface SignalPayload {
  userId?: string | null;
  sessionId?: string | null;
  eventType: SignalEventType;
  productId?: string | null;
  entities?: EntityMap;
  metadata?: Record<string, any>;
  source?: string;
}

export interface UserInterestProfile {
  userId?: string | null;
  sessionId?: string | null;
  dimensions: Record<InterestDimension, Record<string, { score: number; signalCount: number; lastSignalAt: string }>>;
  totalSignals: number;
  lastUpdated: string;
}

export interface ReasonCode {
  code:
    | 'VAULT_LICENSE_MATCH'
    | 'VAULT_LINE_MATCH'
    | 'SEARCH_CHARACTER_MATCH'
    | 'RECENT_BRAND_INTEREST'
    | 'RADAR_LICENSE_MATCH'
    | 'WISHLIST_RELATED'
    | 'PURCHASE_LINE_MATCH'
    | 'TRENDING_IN_INTEREST'
    | 'CATEGORY_AFFINITY';
  label: string;
}

export interface ScoreBreakdown {
  opportunityScore: number;
  personalRelevance: number;
  freshnessScore: number;
  trendScore: number;
  availabilityScore: number;
  frequencyPenalty: number;
  diversityAdjustment: number;
  merchandisingBoost: number;
  finalRank: number;
  reasons: ReasonCode[];
}

export interface RankedProduct<T = any> {
  product: T;
  finalRank: number;
  personalRelevance: number;
  opportunityScore: number;
  reasons: ReasonCode[];
  breakdown: ScoreBreakdown;
  isExplorationItem?: boolean;
}

export interface RankOptions {
  surface?: 'HOME' | 'SHOP' | 'RADAR' | 'PRODUCT_DETAIL' | 'COMPARE' | 'SEARCH';
  explorationRatio?: number; // Default 0.25 (25%)
  applyFrequencyCap?: boolean;
  applyDiversity?: boolean;
  manualBoostProductIds?: Record<string, number>;
}

export interface DynamicShelfConfig {
  id: string;
  title: string;
  subtitle?: string;
  badge?: string;
  contextTag: string;
  reasonText?: string;
  products: RankedProduct[];
}

// Session ID persistence helper
const SESSION_STORAGE_KEY = 'collectibles_sourcing_session_id';

export function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return 'server_session';
  let sid = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!sid) {
    sid = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    localStorage.setItem(SESSION_STORAGE_KEY, sid);
  }
  return sid;
}

// In-Memory Interest Profile Cache per User/Session for zero-latency UI sorting
const memoryProfileCache = new Map<string, UserInterestProfile>();

/**
 * Record a behavioral signal into local memory and Supabase.
 */
export async function recordSignal(payload: SignalPayload): Promise<void> {
  try {
    const userId = payload.userId || null;
    const sessionId = payload.sessionId || getOrCreateSessionId();
    const eventType = payload.eventType;
    const weight = DEFAULT_SIGNAL_WEIGHTS[eventType] || 1.0;
    const cacheKey = userId || sessionId;

    // 1. Update In-Memory Cache immediately
    let profile = memoryProfileCache.get(cacheKey);
    if (!profile) {
      profile = {
        userId,
        sessionId,
        dimensions: {
          category: {},
          brand: {},
          license: {},
          line: {},
          character: {},
          scale: {},
          manufacturer: {},
          price_range: {}
        },
        totalSignals: 0,
        lastUpdated: new Date().toISOString()
      };
      memoryProfileCache.set(cacheKey, profile);
    }

    const nowIso = new Date().toISOString();
    if (payload.entities) {
      for (const [dim, rawValue] of Object.entries(payload.entities)) {
        if (!rawValue) continue;
        const val = String(rawValue).toUpperCase().trim();
        const dimensionKey = dim as InterestDimension;
        if (!profile.dimensions[dimensionKey]) {
          profile.dimensions[dimensionKey] = {};
        }

        const current = profile.dimensions[dimensionKey][val] || { score: 0, signalCount: 0, lastSignalAt: nowIso };
        const newSignalCount = current.signalCount + 1;
        // Incremental bounded score update (0.0 to 1.0 limit)
        const delta = weight > 0 ? (weight / 20.0) : (weight / 20.0);
        const newScore = Math.max(0, Math.min(1.0, current.score + delta));

        profile.dimensions[dimensionKey][val] = {
          score: newScore,
          signalCount: newSignalCount,
          lastSignalAt: nowIso
        };
      }
    }
    profile.totalSignals += 1;
    profile.lastUpdated = nowIso;

    // 2. Async non-blocking push to Supabase (catch any errors quietly)
    if (typeof window !== 'undefined') {
      supabase.from('sourcing_user_signals').insert({
        user_id: userId,
        session_id: sessionId,
        event_type: eventType,
        product_id: payload.productId || null,
        entity_type: payload.entities ? Object.keys(payload.entities)[0] : null,
        entity_name: payload.entities ? String(Object.values(payload.entities)[0] || '') : null,
        weight,
        source: payload.source || 'storefront',
        metadata: payload.metadata || {}
      }).then();
    }
  } catch (err) {
    if (import.meta.env?.DEV) {
      console.warn('[PersonalizationEngine] Signal record error:', err);
    }
  }
}

/**
 * Get current User Interest Profile with time decay applied.
 */
export async function getUserInterestProfile(userId?: string | null, sessionId?: string | null): Promise<UserInterestProfile> {
  const sid = sessionId || getOrCreateSessionId();
  const cacheKey = userId || sid;

  const cached = memoryProfileCache.get(cacheKey);
  if (cached && cached.totalSignals > 0) {
    return applyTimeDecayToProfile(cached);
  }

  // Fallback: Build empty profile if no signals recorded yet
  const emptyProfile: UserInterestProfile = {
    userId: userId || null,
    sessionId: sid,
    dimensions: {
      category: {},
      brand: {},
      license: {},
      line: {},
      character: {},
      scale: {},
      manufacturer: {},
      price_range: {}
    },
    totalSignals: 0,
    lastUpdated: new Date().toISOString()
  };

  memoryProfileCache.set(cacheKey, emptyProfile);
  return emptyProfile;
}

/**
 * Apply time decay to profile scores deterministically.
 */
function applyTimeDecayToProfile(profile: UserInterestProfile): UserInterestProfile {
  const halfLifeDays = 14;
  const lambda = Math.LN2 / halfLifeDays;
  const nowMs = Date.now();

  const decayed: UserInterestProfile = {
    ...profile,
    dimensions: {
      category: {},
      brand: {},
      license: {},
      line: {},
      character: {},
      scale: {},
      manufacturer: {},
      price_range: {}
    }
  };

  for (const [dimKey, entityMap] of Object.entries(profile.dimensions)) {
    const dim = dimKey as InterestDimension;
    decayed.dimensions[dim] = {};

    for (const [entityName, data] of Object.entries(entityMap)) {
      const lastMs = new Date(data.lastSignalAt).getTime();
      const ageDays = Math.max(0, (nowMs - lastMs) / (1000 * 60 * 60 * 24));
      const decayMultiplier = Math.exp(-lambda * ageDays);
      const decayedScore = Math.max(0.01, Number((data.score * decayMultiplier).toFixed(4)));

      decayed.dimensions[dim][entityName] = {
        ...data,
        score: decayedScore
      };
    }
  }

  return decayed;
}

/**
 * Compute Personal Relevance Score (0 to 100) and Reason Codes for a product.
 */
export function computePersonalRelevanceScore(
  product: any,
  profile: UserInterestProfile
): { score: number; reasons: ReasonCode[] } {
  if (!profile || profile.totalSignals === 0) {
    return { score: 0, reasons: [] };
  }

  const reasons: ReasonCode[] = [];

  // Extract normalized entity names from product
  const prodCategory = String(product.category?.name || product.category_name || product.category || '').toUpperCase().trim();
  const prodBrand = String(product.brand?.name || product.brand_name || product.brand || '').toUpperCase().trim();
  const prodLicense = String(product.license?.name || product.license_name || product.license || '').toUpperCase().trim();
  const prodLine = String(product.line || product.product_line || '').toUpperCase().trim();
  const prodCharacter = String(product.character || '').toUpperCase().trim();
  const prodScale = String(product.scale || '').toUpperCase().trim();
  const prodManufacturer = String(product.manufacturer || '').toUpperCase().trim();

  // Dimension weights (sum to 1.0)
  const W_BRAND = 0.20;
  const W_LICENSE = 0.25;
  const W_CHARACTER = 0.20;
  const W_LINE = 0.15;
  const W_CATEGORY = 0.10;
  const W_SCALE = 0.10;

  const bScore = profile.dimensions.brand[prodBrand]?.score || 0;
  const lScore = profile.dimensions.license[prodLicense]?.score || 0;
  const cScore = profile.dimensions.character[prodCharacter]?.score || 0;
  const lineScore = profile.dimensions.line[prodLine]?.score || 0;
  const catScore = profile.dimensions.category[prodCategory]?.score || 0;
  const scaleScore = profile.dimensions.scale[prodScale]?.score || 0;

  const rawRelevance =
    (bScore * W_BRAND) +
    (lScore * W_LICENSE) +
    (cScore * W_CHARACTER) +
    (lineScore * W_LINE) +
    (catScore * W_CATEGORY) +
    (scaleScore * W_SCALE);

  const scaledScore = Math.min(100, Math.round(rawRelevance * 100 * 2.2)); // Scale factor for dynamic range

  // Reason codes attribution
  if (lScore >= 0.3) {
    reasons.push({ code: 'VAULT_LICENSE_MATCH', label: `Porque coleccionás ${prodLicense || 'esta franquicia'}` });
  }
  if (bScore >= 0.3) {
    reasons.push({ code: 'RECENT_BRAND_INTEREST', label: `Interés reciente en ${prodBrand || 'esta marca'}` });
  }
  if (cScore >= 0.3) {
    reasons.push({ code: 'SEARCH_CHARACTER_MATCH', label: `Basado en tu búsqueda de ${prodCharacter}` });
  }
  if (lineScore >= 0.3) {
    reasons.push({ code: 'VAULT_LINE_MATCH', label: `Podría completar tu línea ${prodLine}` });
  }
  if (reasons.length === 0 && scaledScore > 15) {
    reasons.push({ code: 'CATEGORY_AFFINITY', label: 'Recomendado para vos' });
  }

  return { score: Math.max(0, scaledScore), reasons };
}

/**
 * Compute Final Rank and full ScoreBreakdown.
 */
export function computeFinalRank(
  product: any,
  personalRelevance: number,
  reasons: ReasonCode[],
  options: RankOptions = {}
): RankedProduct {
  const oppScore = Number(product.opportunity_score ?? product.catalog_value_score ?? 60);

  // Additional component factors
  const freshnessScore = product.freshness_status === 'LIVE' ? 10 : product.freshness_status === 'FRESH' ? 7 : 4;
  const trendScore = product.is_featured || product.status === 'preorder' ? 8 : 5;
  const availabilityScore = product.availability === 'in_stock' || product.status === 'published' ? 10 : 6;
  const frequencyPenalty = options.applyFrequencyCap && product._impressionCount && product._impressionCount >= 10 ? 15 : 0;
  const diversityAdjustment = 0;
  const merchandisingBoost = options.manualBoostProductIds && product.id && options.manualBoostProductIds[product.id]
    ? options.manualBoostProductIds[product.id]
    : (product.is_featured ? 5 : 0);

  // Final Rank Formula
  const finalRank = Math.round(
    (0.45 * oppScore) +
    (0.40 * personalRelevance) +
    (0.05 * freshnessScore * 10) +
    (0.05 * trendScore * 10) +
    (0.05 * availabilityScore * 10) -
    frequencyPenalty +
    diversityAdjustment +
    merchandisingBoost
  );

  const breakdown: ScoreBreakdown = {
    opportunityScore: oppScore,
    personalRelevance,
    freshnessScore,
    trendScore,
    availabilityScore,
    frequencyPenalty,
    diversityAdjustment,
    merchandisingBoost,
    finalRank,
    reasons
  };

  return {
    product,
    finalRank,
    personalRelevance,
    opportunityScore: oppScore,
    reasons,
    breakdown
  };
}

/**
 * Rank a list of products using Personalization Engine & Diversity rules.
 */
export async function rankProducts<T = any>(
  products: T[],
  options: RankOptions = {},
  userProfile?: UserInterestProfile
): Promise<RankedProduct<T>[]> {
  if (!products || products.length === 0) return [];

  const profile = userProfile || await getUserInterestProfile();

  // 1. Calculate scores for all candidates
  const ranked: RankedProduct<T>[] = products.map(p => {
    const { score: relScore, reasons } = computePersonalRelevanceScore(p, profile);
    return computeFinalRank(p, relScore, reasons, options);
  });

  // 2. Sort by Final Rank descending
  ranked.sort((a, b) => b.finalRank - a.finalRank);

  // 3. Apply Diversity Engine if requested
  if (options.applyDiversity !== false && ranked.length > 4) {
    return applyDiversityEngine(ranked, options.explorationRatio || 0.25);
  }

  return ranked;
}

/**
 * Diversity Engine: Prevents feed monopolization and interleaves exploration items.
 */
function applyDiversityEngine<T = any>(ranked: RankedProduct<T>[], explorationRatio: number): RankedProduct<T>[] {
  const result: RankedProduct<T>[] = [];
  const pool = [...ranked];
  const charCounts: Record<string, number> = {};
  const lineCounts: Record<string, number> = {};

  while (pool.length > 0) {
    let candidateIndex = 0;

    // Check diversity limits for top item
    const topItem = pool[0];
    const char = String((topItem.product as any).character || '').toUpperCase();
    const line = String((topItem.product as any).line || '').toUpperCase();

    if (char && charCounts[char] >= 2) {
      // Find next item with different character
      const altIdx = pool.findIndex(item => String((item.product as any).character || '').toUpperCase() !== char);
      if (altIdx > 0) candidateIndex = altIdx;
    } else if (line && lineCounts[line] >= 3) {
      // Find next item with different line
      const altIdx = pool.findIndex(item => String((item.product as any).line || '').toUpperCase() !== line);
      if (altIdx > 0) candidateIndex = altIdx;
    }

    const selected = pool.splice(candidateIndex, 1)[0];
    if (char) charCounts[char] = (charCounts[char] || 0) + 1;
    if (line) lineCounts[line] = (lineCounts[line] || 0) + 1;

    result.push(selected);
  }

  return result;
}

/**
 * Generate Dynamic Merchandising Shelves for Home or storefront pages.
 */
export async function getPersonalizedShelves(
  allProducts: any[],
  userId?: string | null,
  sessionId?: string | null
): Promise<DynamicShelfConfig[]> {
  const profile = await getUserInterestProfile(userId, sessionId);
  const shelves: DynamicShelfConfig[] = [];

  if (!allProducts || allProducts.length === 0) return shelves;

  const rankedAll = await rankProducts(allProducts, { applyDiversity: true }, profile);

  // 1. Recommended for You Shelf (if any relevance exists, else fallback to top Opportunity products)
  const topRecommended = rankedAll.slice(0, 10);
  if (topRecommended.length > 0) {
    shelves.push({
      id: 'shelf-recommended',
      title: 'RECOMENDADO PARA VOS',
      subtitle: profile.totalSignals > 0 ? 'Seleccionado según tus intereses y búsquedas' : 'Nuestra selección de mejores oportunidades',
      contextTag: 'RECOMMENDED_FOR_YOU',
      products: topRecommended
    });
  }

  // 2. License Affinity Shelf (e.g., "Porque coleccionás Street Fighter")
  const topLicenses = Object.entries(profile.dimensions.license)
    .sort((a, b) => b[1].score - a[1].score);

  if (topLicenses.length > 0 && topLicenses[0][1].score > 0.15) {
    const targetLicense = topLicenses[0][0];
    const licenseProducts = rankedAll.filter(r =>
      String((r.product as any).license?.name || (r.product as any).license || '').toUpperCase() === targetLicense
    );

    if (licenseProducts.length >= 2) {
      shelves.push({
        id: `shelf-license-${targetLicense}`,
        title: `PORQUE COLECCIONÁS ${targetLicense}`,
        subtitle: `Piezas destacadas de ${targetLicense}`,
        contextTag: 'BECAUSE_YOU_COLLECT',
        reasonText: `Basado en tu interés por ${targetLicense}`,
        products: licenseProducts.slice(0, 8)
      });
    }
  }

  // 3. Brand New Releases Shelf (e.g., "Nuevos lanzamientos de Jada Toys")
  const topBrands = Object.entries(profile.dimensions.brand)
    .sort((a, b) => b[1].score - a[1].score);

  if (topBrands.length > 0 && topBrands[0][1].score > 0.15) {
    const targetBrand = topBrands[0][0];
    const brandProducts = rankedAll.filter(r =>
      String((r.product as any).brand?.name || (r.product as any).brand || '').toUpperCase() === targetBrand
    );

    if (brandProducts.length >= 2) {
      shelves.push({
        id: `shelf-brand-${targetBrand}`,
        title: `NUEVOS LANZAMIENTOS DE ${targetBrand}`,
        subtitle: `Coleccionables de la marca ${targetBrand}`,
        contextTag: 'BRAND_FOCUS',
        reasonText: `Basado en tu interés por ${targetBrand}`,
        products: brandProducts.slice(0, 8)
      });
    }
  }

  return shelves;
}
