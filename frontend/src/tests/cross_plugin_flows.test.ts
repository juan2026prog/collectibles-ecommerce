import { describe, it, expect } from 'vitest';
import { interpretUserQuery } from '../lib/search/aiQueryInterpreter';
import { formatReleaseDatePrecision, getStatusBadgeConfig } from '../plugins/collector-radar/core/releaseEngine';
import { calculateVaultStats } from '../plugins/collector-vault/core/statsEngine';
import { sanitizeVaultItemForPublic, sanitizeUserProfileForPublic } from '../plugins/collector-vault/core/privacyGuard';
import { normalizeScale, normalizeHeight } from '../plugins/collector-compare/core/normalizationEngine';
import { extractDeterministicFacts } from '../plugins/collector-compare/core/verdictEngine';
import { evaluateCollectorCompatibility } from '../plugins/collector-compare/core/compatibilityEngine';
import { validatePublishAction } from '../plugins/collector-academy/core/draftGuard';
import { CustomsRuleEngine } from '../lib/customs/CustomsRuleEngine';
import { CourierPricingEngine } from '../lib/customs/CourierPricingEngine';
import { ImportCostEngine } from '../lib/customs/ImportCostEngine';

describe('COLLECTIBLES 2026 — Cross-Plugin Integration & Security Audit', () => {

  // FLOW 1: Radar -> Release Detail -> Product -> Compare -> Product Detail -> Cart
  it('FLOW 1: Validates Radar release precision and links into comparison normalization', () => {
    const precisionText = formatReleaseDatePrecision('QUARTER', '2027-01-15T00:00:00Z', 'Q1 2027');
    expect(precisionText).toBe('Q1 2027');

    const item1 = { id: 'prod-1', title: 'Batman 1:6', scale: normalizeScale('1/6'), heightCm: normalizeHeight('30 cm'), price: 350 };
    const item2 = { id: 'prod-2', title: 'Superman 1:6', scale: normalizeScale('1:6'), heightCm: normalizeHeight('31 cm'), price: 340 };

    const compat = evaluateCollectorCompatibility([
      { id: 'prod-1', title: 'Batman 1:6', price: 350, currency: 'USD', is_available: true, normalized_attributes: { scale: { raw: '1:6', normalized: '1:6', confidence: 100 } } },
      { id: 'prod-2', title: 'Superman 1:6', price: 340, currency: 'USD', is_available: true, normalized_attributes: { scale: { raw: '1:6', normalized: '1:6', confidence: 100 } } }
    ]);
    expect(compat.status).toBe('COMPATIBLE');

    const facts = extractDeterministicFacts([
      { id: '1', title: 'Batman', base_price: 350, currency: 'USD', is_available: true, is_international: true, intl_final_price_usd: 350, normalized_attributes: { articulation_points: { raw: '30', numeric_value: 30 } } } as any,
      { id: '2', title: 'Superman', base_price: 340, currency: 'USD', is_available: true, is_international: true, intl_final_price_usd: 340, normalized_attributes: { articulation_points: { raw: '32', numeric_value: 32 } } } as any
    ]);
    expect(facts.lowest_price_product_id).toBe('2');
    expect(facts.most_articulated_product_id).toBe('2');
  });

  // FLOW 2: Radar -> Release Alert -> Status Change
  it('FLOW 2: Validates release status change badge transitions', () => {
    const announced = getStatusBadgeConfig('ANNOUNCED');
    expect(announced.label).toBe('Anunciado');

    const preorder = getStatusBadgeConfig('PREORDER_OPEN');
    expect(preorder.label).toBe('Pre-order Abierta');

    const delayed = getStatusBadgeConfig('DELAYED');
    expect(delayed.label).toContain('Demorado');
  });

  // FLOW 3: AI Search -> Product -> Compare
  it('FLOW 3: Validates AI natural search query parsing feeding comparator filters', () => {
    const query = 'figura hot toys batman 1:6 menos de 400';
    const interpretation = interpretUserQuery(query);

    expect(interpretation.detectedBrand).toBe('HOT TOYS');
    expect(interpretation.detectedScale).toBe('1:6');
    expect(interpretation.priceMax).toBe(400);

    const normalizedScale = normalizeScale(interpretation.detectedScale!);
    expect(normalizedScale).toBe('1:6');
  });

  // FLOW 4: AI Search -> Academy Contract & AI Draft Guard
  it('FLOW 4: Validates Academy content draft security (AI_DRAFT cannot auto-publish)', () => {
    const aiDraftValidation = validatePublishAction('AI_DRAFT', 'PUBLISHED');
    expect(aiDraftValidation.allowed).toBe(false);
    expect(aiDraftValidation.error).toContain('Prohibida la auto-publicación');

    const humanReviewedValidation = validatePublishAction('REVIEW', 'PUBLISHED');
    expect(humanReviewedValidation.allowed).toBe(true);
  });

  // FLOW 5: Vault Privacy Guard & Financial Blindfold
  it('FLOW 5 & FLOW 6: Validates Vault private vs public boundary (zero leakage of purchase prices or email)', () => {
    const rawVaultItem = {
      id: 'v-item-1',
      user_id: 'usr-123',
      visibility: 'PUBLIC',
      external_item: {
        id: 'ext-1',
        user_id: 'usr-123',
        name: 'Hot Toys Joker',
        brand_name: 'Hot Toys',
        created_at: '2026-01-01',
        updated_at: '2026-01-01'
      },
      purchase_price: 450.00,
      purchase_date: '2026-03-15',
      notes: 'Comprado en convención privada',
      status: 'OWNED',
      condition: 'MINT',
      box_condition: 'SEALED'
    };

    const sanitized = sanitizeVaultItemForPublic(rawVaultItem as any);
    expect(sanitized?.title).toBe('Hot Toys Joker');
    expect((sanitized as any)?.purchase_price).toBeUndefined();
    expect((sanitized as any)?.purchase_date).toBeUndefined();
    expect((sanitized as any)?.notes).toBeUndefined();

    const rawProfile = {
      id: 'p-1',
      user_id: 'usr-123',
      display_name: 'CollectorUY',
      email: 'secret@private.com',
      bio: 'Fan de DC y Hot Toys'
    };

    const safeProfile = sanitizeUserProfileForPublic(rawProfile as any);
    expect(safeProfile.display_name).toBe('CollectorUY');
    expect((safeProfile as any).email).toBeUndefined();
  });

  // FLOW 8, 9 & 10: International Product -> Mi Franquicia -> Quota Depletion -> Simplified Regime
  it('FLOW 8, 9 & 10: Validates Uruguay 2026 customs rules and fallback to 60% simplified regime', () => {
    const engine = new CustomsRuleEngine();

    // 1. With active franchise quota
    const underFranchise = engine.evaluateShipment({
      productPriceUsd: 150,
      actualWeightKg: 1.2,
      usage: { usedShipments: 1, usedAmountUsd: 200 }
    });
    expect(underFranchise.status).toBe('FRANCHISE_APPLIED');
    expect(underFranchise.taxUsd).toBe(0);

    // 2. Depleted quota (3 shipments used) -> Simplified 60% with USD 20 minimum
    const quotaDepleted = engine.evaluateShipment({
      productPriceUsd: 20,
      actualWeightKg: 0.5,
      usage: { usedShipments: 3, usedAmountUsd: 400 }
    });
    expect(quotaDepleted.status).toBe('SIMPLIFIED_REGIME');
    expect(quotaDepleted.taxUsd).toBe(20); // 20 * 0.6 = 12 -> min 20

    // 3. High value over remaining quota -> Simplified 60%
    const highValue = engine.evaluateShipment({
      productPriceUsd: 700,
      actualWeightKg: 2.0,
      usage: { usedShipments: 1, usedAmountUsd: 300 } // only 500 left
    });
    expect(highValue.status).toBe('SIMPLIFIED_REGIME');
    expect(highValue.taxUsd).toBe(420); // 700 * 0.60 = 420

    // 4. Disqualification strictly on weight > 20 kg
    const overweight = engine.evaluateShipment({
      productPriceUsd: 100,
      actualWeightKg: 22.0,
      usage: { usedShipments: 0, usedAmountUsd: 0 }
    });
    expect(overweight.status).toBe('DISQUALIFIED_WEIGHT');
    expect(overweight.taxUsd).toBeNull();
  });

  // End-to-end Landed Cost calculation
  it('Validates Landed Cost engine with PuntoMio and zero volumetric weight', () => {
    const landed = ImportCostEngine.calculateLandedCost({
      productPriceUsd: 120,
      weightKg: 0.8,
      courierCode: 'puntomio',
      usage: { usedShipments: 0, usedAmountUsd: 0 },
      exchangeRateUsdToUyu: 42.50
    });

    expect(landed.isEligibleForImport).toBe(true);
    expect(landed.customsEvaluation.taxUsd).toBe(0);
    expect(landed.courier.totalCourierUsd).toBe(16.50); // 500g-1kg = 16.50
    expect(landed.totalCostUsd).toBe(136.50);
    expect(landed.totalCostUyu).toBe(Math.round(136.50 * 42.50));
  });
});
