/**
 * SOURCING INTELLIGENCE — FASE 3 — PERSONALIZATION DETERMINISTIC TESTS
 * 
 * 10 Mandatory Deterministic Tests verifying:
 * 1. Strong affinity boost
 * 2. Cold start fallback
 * 3. Vault signals boost
 * 4. Search intent signal boost
 * 5. Negative signal / Frequency cap penalty
 * 6. Diversity engine enforcement
 * 7. Radar "Ver productos" matching & personalization
 * 8. Opportunity Score (global) vs Personal Relevance (user-specific) separation
 * 9. RLS isolation logic
 * 10. Engine failure graceful fallback
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordSignal,
  getUserInterestProfile,
  computePersonalRelevanceScore,
  computeFinalRank,
  rankProducts,
  type UserInterestProfile
} from '../services/sourcing/personalizationEngine';

// Sample mock products for deterministic testing
const sampleProducts = [
  {
    id: 'prod-chun-li',
    title: 'Street Fighter Chun-Li 1:12 Action Figure',
    brand: { name: 'Jada Toys' },
    license: { name: 'Street Fighter' },
    character: 'Chun-Li',
    scale: '1:12',
    line: 'Ultra Street Fighter II',
    opportunity_score: 91,
    freshness_status: 'LIVE',
    availability: 'in_stock'
  },
  {
    id: 'prod-ryu',
    title: 'Street Fighter Ryu 1:12 Action Figure',
    brand: { name: 'Jada Toys' },
    license: { name: 'Street Fighter' },
    character: 'Ryu',
    scale: '1:12',
    line: 'Ultra Street Fighter II',
    opportunity_score: 88,
    freshness_status: 'LIVE',
    availability: 'in_stock'
  },
  {
    id: 'prod-batman',
    title: 'Batman Animated Series 1:10 Statue',
    brand: { name: 'McFarlane Toys' },
    license: { name: 'DC Comics' },
    character: 'Batman',
    scale: '1:10',
    line: 'DC Multiverse',
    opportunity_score: 85,
    freshness_status: 'FRESH',
    availability: 'in_stock'
  },
  {
    id: 'prod-[#f00856]-goku',
    title: 'Dragon Ball Z Son Goku S.H.Figuarts',
    brand: { name: 'Bandai Spirits' },
    license: { name: 'Dragon Ball Z' },
    character: 'Goku',
    scale: '1:12',
    line: 'S.H.Figuarts',
    opportunity_score: 90,
    freshness_status: 'LIVE',
    availability: 'in_stock'
  }
];

describe('Sourcing Intelligence — FASE 3 — Personalization Tests', () => {

  it('TEST 1 — Afinidad fuerte: Usuario con señales Street Fighter ve incremento en ranking', async () => {
    const userId = 'user-sf-fan-' + Date.now();

    // Send 3 strong Street Fighter signals
    await recordSignal({
      userId,
      eventType: 'WISHLIST',
      entities: { license: 'Street Fighter', brand: 'Jada Toys', character: 'Chun-Li' }
    });
    await recordSignal({
      userId,
      eventType: 'PURCHASE',
      entities: { license: 'Street Fighter', brand: 'Jada Toys', character: 'Ryu' }
    });

    const profile = await getUserInterestProfile(userId);
    const ranked = await rankProducts(sampleProducts, {}, profile);

    // Chun-Li & Ryu should rank first and second above Batman
    expect(ranked[0].product.license.name).toBe('Street Fighter');
    expect(ranked[0].personalRelevance).toBeGreaterThan(50);
    expect(ranked[0].reasons.some(r => r.code === 'VAULT_LICENSE_MATCH' || r.code === 'RECENT_BRAND_INTEREST')).toBe(true);
  });

  it('TEST 2 — Sin historial: Usuario nuevo usa fallback global de Opportunity Score', async () => {
    const emptyProfile: UserInterestProfile = {
      userId: 'user-newbie',
      sessionId: 'sess-newbie',
      dimensions: {
        category: {}, brand: {}, license: {}, line: {}, character: {}, scale: {}, manufacturer: {}, price_range: {}
      },
      totalSignals: 0,
      lastUpdated: new Date().toISOString()
    };

    const ranked = await rankProducts(sampleProducts, {}, emptyProfile);

    // Should sort primarily by global Opportunity Score (Chun-Li 91, Goku 90, Ryu 88, Batman 85)
    expect(ranked[0].product.id).toBe('prod-chun-li');
    expect(ranked[1].product.id).toBe('prod-[#f00856]-goku');
    expect(ranked[0].personalRelevance).toBe(0);
  });

  it('TEST 3 — Vault: Usuario con Ryu/Chun-Li en Vault recibe boost en productos relacionados', async () => {
    const userId = 'user-vault-' + Date.now();

    await recordSignal({
      userId,
      eventType: 'VAULT_OWNED',
      entities: { license: 'Street Fighter', line: 'Ultra Street Fighter II', character: 'Ryu' }
    });

    const profile = await getUserInterestProfile(userId);
    const sfItem = sampleProducts.find(p => p.id === 'prod-chun-li')!;
    const { score, reasons } = computePersonalRelevanceScore(sfItem, profile);

    expect(score).toBeGreaterThan(0);
    expect(reasons.some(r => r.code === 'VAULT_LICENSE_MATCH' || r.code === 'VAULT_LINE_MATCH')).toBe(true);
  });

  it('TEST 4 — Search Intent: Búsqueda repetida de Jada Toys genera incremento gradual', async () => {
    const userId = 'user-search-' + Date.now();

    // 1 search
    await recordSignal({
      userId,
      eventType: 'SEARCH_INTENT',
      entities: { brand: 'Jada Toys' }
    });
    let profile = await getUserInterestProfile(userId);
    const score1 = profile.dimensions.brand['JADA TOYS']?.score || 0;

    // Second search
    await recordSignal({
      userId,
      eventType: 'SEARCH_INTENT',
      entities: { brand: 'Jada Toys' }
    });
    profile = await getUserInterestProfile(userId);
    const score2 = profile.dimensions.brand['JADA TOYS']?.score || 0;

    expect(score2).toBeGreaterThan(score1);
    expect(score2).toBeLessThanOrEqual(1.0); // Bounded increment
  });

  it('TEST 5 — Negative Signal: Frequency cap / Impresiones sin clic reducen ranking', () => {
    const productNoClicks = {
      ...sampleProducts[0],
      _impressionCount: 12
    };

    const emptyProfile: UserInterestProfile = {
      userId: 'user-cap',
      sessionId: 'sess-cap',
      dimensions: { category: {}, brand: {}, license: {}, line: {}, character: {}, scale: {}, manufacturer: {}, price_range: {} },
      totalSignals: 0,
      lastUpdated: new Date().toISOString()
    };

    const normalRank = computeFinalRank(sampleProducts[0], 0, [], { applyFrequencyCap: false });
    const penalizedRank = computeFinalRank(productNoClicks, 0, [], { applyFrequencyCap: true });

    expect(penalizedRank.finalRank).toBeLessThan(normalRank.finalRank);
    expect(penalizedRank.breakdown.frequencyPenalty).toBeGreaterThan(0);
  });

  it('TEST 6 — Diversity: Evita monopolización del feed cuando existen alternativas relevantes', async () => {
    const manyBatmans = Array.from({ length: 10 }, (_, i) => ({
      id: `batman-${i}`,
      title: `Batman Variant ${i}`,
      brand: { name: 'McFarlane Toys' },
      license: { name: 'DC Comics' },
      character: 'Batman',
      line: 'DC Multiverse',
      opportunity_score: 90 - i
    }));

    const candidates = [...manyBatmans, sampleProducts[0]]; // 10 Batmans + 1 Chun-Li
    const emptyProfile: UserInterestProfile = {
      userId: 'user-[#f00856]',
      sessionId: 'sess-[#f00856]',
      dimensions: { category: {}, brand: {}, license: {}, line: {}, character: {}, scale: {}, manufacturer: {}, price_range: {} },
      totalSignals: 0,
      lastUpdated: new Date().toISOString()
    };

    const ranked = await rankProducts(candidates, { applyDiversity: true }, emptyProfile);

    // After 2 consecutive Batmans, Chun-Li or another item should be interleaved
    const firstThreeChars = ranked.slice(0, 3).map(r => r.product.character);
    const allBatman = firstThreeChars.every(c => c === 'Batman');

    expect(allBatman).toBe(false); // Diversity engine interleaved non-Batman item
  });

  it('TEST 7 — Radar: Evento Street Fighter en Radar vincula productos reales y personalizados', async () => {
    const userId = 'user-radar-' + Date.now();
    await recordSignal({
      userId,
      eventType: 'RADAR_OPEN',
      entities: { license: 'Street Fighter' }
    });

    const profile = await getUserInterestProfile(userId);
    const sfProducts = sampleProducts.filter(p => p.license.name === 'Street Fighter');
    const ranked = await rankProducts(sfProducts, { surface: 'RADAR' }, profile);

    expect(ranked.length).toBe(2);
    expect(ranked[0].product.license.name).toBe('Street Fighter');
  });

  it('TEST 8 — Separación de Scores: Opportunity Score permanece global, Personal Relevance cambia por usuario', async () => {
    const userA = 'user-sf-' + Date.now();
    const userB = 'user-[#f00856]-' + Date.now();

    await recordSignal({ userId: userA, eventType: 'WISHLIST', entities: { license: 'Street Fighter' } });
    await recordSignal({ userId: userB, eventType: 'WISHLIST', entities: { license: 'Dragon Ball Z' } });

    const profA = await getUserInterestProfile(userA);
    const profB = await getUserInterestProfile(userB);

    const sfItem = sampleProducts[0]; // Street Fighter Chun-Li (Opp Score: 91)

    const scoreA = computePersonalRelevanceScore(sfItem, profA);
    const scoreB = computePersonalRelevanceScore(sfItem, profB);

    // Global Opportunity Score stays fixed at 91 for both
    expect(sfItem.opportunity_score).toBe(91);

    // Personal Relevance differs between User A (high) and User B (low)
    expect(scoreA.score).toBeGreaterThan(scoreB.score);
  });

  it('TEST 9 — RLS & Aislamiento: Usuario A no puede alterar el perfil de Usuario B', async () => {
    const userA = 'user-alpha-' + Date.now();
    const userB = 'user-beta-' + Date.now();

    await recordSignal({ userId: userA, eventType: 'PURCHASE', entities: { brand: 'Hot Toys' } });

    const profA = await getUserInterestProfile(userA);
    const profB = await getUserInterestProfile(userB);

    expect(profA.dimensions.brand['HOT TOYS']?.score).toBeGreaterThan(0);
    expect(profB.dimensions.brand['HOT TOYS']?.score || 0).toBe(0);
  });

  it('TEST 10 — Engine Failure: Falla simulada degrada elegantemente a ranking global', async () => {
    // If user profile is undefined or corrupt, fallback cleanly to Opportunity Score
    const ranked = await rankProducts(sampleProducts, {}, undefined);

    expect(ranked).toBeDefined();
    expect(ranked.length).toBe(sampleProducts.length);
    expect(ranked[0].product.opportunity_score).toBeGreaterThanOrEqual(ranked[ranked.length - 1].product.opportunity_score);
  });

});
