import { describe, it, expect } from 'vitest';
import {
  normalizeScale,
  normalizeHeight,
  normalizeWeight,
  formatOrFallback
} from '../plugins/collector-compare/core/normalizationEngine';
import {
  DEFAULT_ATTRIBUTES,
  resolveProductAttribute,
  hydrateProductAttributes
} from '../plugins/collector-compare/core/attributeRegistry';
import {
  extractDeterministicFacts,
  generateCollectorVerdict
} from '../plugins/collector-compare/core/verdictEngine';
import {
  evaluateCollectorCompatibility
} from '../plugins/collector-compare/core/compatibilityEngine';

describe('COLLECTIBLES COLLECTOR COMPARE — Modular Test Suite', () => {

  describe('1. Normalization Engine (Scales, Dimensions, Weights, Fallbacks)', () => {
    it('normalizes scales across formats: 1:12, 1/12, 1-12, sixth scale, quarter scale', () => {
      expect(normalizeScale('1:12')).toBe('1:12');
      expect(normalizeScale('1/12')).toBe('1:12');
      expect(normalizeScale('1-12')).toBe('1:12');
      expect(normalizeScale('1:6')).toBe('1:6');
      expect(normalizeScale('1/6th scale')).toBe('1:6');
      expect(normalizeScale('Sixth Scale Figure')).toBe('1:6');
      expect(normalizeScale('Quarter Scale Statue')).toBe('1:4');
      expect(normalizeScale('One Twelfth scale')).toBe('1:12');
      expect(normalizeScale('Random text without scale')).toBeNull();
      expect(normalizeScale(null)).toBeNull();
    });

    it('normalizes height from inches, cm and mm into standardized cm and inches display', () => {
      const fromInches = normalizeHeight('7 inch');
      expect(fromInches).not.toBeNull();
      expect(fromInches!.cm).toBe(17.8);
      expect(fromInches!.inches).toBe(7);
      expect(fromInches!.display).toContain('17.8 cm');

      const fromCm = normalizeHeight('18 cm');
      expect(fromCm).not.toBeNull();
      expect(fromCm!.cm).toBe(18);
      expect(fromCm!.inches).toBe(7.1);

      const fromMm = normalizeHeight('150 mm');
      expect(fromMm).not.toBeNull();
      expect(fromMm!.cm).toBe(15);

      expect(normalizeHeight(null)).toBeNull();
      expect(normalizeHeight('unknown')).toBeNull();
    });

    it('normalizes weight from grams, lbs, and kg', () => {
      const fromGrams = normalizeWeight('500 g');
      expect(fromGrams).not.toBeNull();
      expect(fromGrams!.kg).toBe(0.5);

      const fromLbs = normalizeWeight('2.2 lbs');
      expect(fromLbs).not.toBeNull();
      expect(fromLbs!.kg).toBe(1);

      const fromKg = normalizeWeight('1.5 kg');
      expect(fromKg).not.toBeNull();
      expect(fromKg!.kg).toBe(1.5);

      expect(normalizeWeight(null)).toBeNull();
    });

    it('returns "No informado" on missing, empty or whitespace values without inventing numbers', () => {
      expect(formatOrFallback(null)).toBe('No informado');
      expect(formatOrFallback(undefined)).toBe('No informado');
      expect(formatOrFallback('')).toBe('No informado');
      expect(formatOrFallback('   ')).toBe('No informado');
      expect(formatOrFallback('PVC')).toBe('PVC');
    });
  });

  describe('2. Attribute Registry & Hydration', () => {
    const sampleProduct = {
      id: 'prod-1',
      title: 'Batman The Dark Knight 1:12 Figure',
      slug: 'batman-dark-knight-1-12',
      base_price: 3800,
      status: 'active',
      condition: 'nuevo',
      brand_name: 'MAFEX',
      license_name: 'DC Comics',
      metadata: {
        scale: '1:12',
        height_cm: 16,
        articulation_points: 30,
        material: 'PVC / ABS',
        accessories: '3 cabezas, 6 manos, batarangs'
      }
    };

    it('resolves attributes accurately from product metadata and columns', () => {
      const priceAttr = resolveProductAttribute(sampleProduct as any, 'price');
      expect(priceAttr.numeric_value).toBe(3800);
      expect(priceAttr.display).toBe('$ 3800');

      const scaleAttr = resolveProductAttribute(sampleProduct as any, 'scale');
      expect(scaleAttr.display).toBe('Escala 1:12');

      const heightAttr = resolveProductAttribute(sampleProduct as any, 'height');
      expect(heightAttr.numeric_value).toBe(16);
      expect(heightAttr.display).toContain('16 cm');

      const artsAttr = resolveProductAttribute(sampleProduct as any, 'articulation_points');
      expect(artsAttr.numeric_value).toBe(30);
      expect(artsAttr.display).toBe('30 puntos');
    });

    it('hydrates a list of products with the normalized_attributes map', () => {
      const hydrated = hydrateProductAttributes([sampleProduct as any], DEFAULT_ATTRIBUTES);
      expect(hydrated[0].normalized_attributes).toBeDefined();
      expect(hydrated[0].normalized_attributes!['price'].numeric_value).toBe(3800);
      expect(hydrated[0].normalized_attributes!['brand'].display).toBe('MAFEX');
    });
  });

  describe('3. Deterministic Facts & AI Verdict Engine', () => {
    const p1 = {
      id: 'p1',
      title: 'Batman Hush MAFEX',
      base_price: 4500,
      is_international: false,
      status: 'active',
      normalized_attributes: {
        price: { numeric_value: 4500, display: '$ 4500' },
        height: { numeric_value: 16, display: '16 cm' },
        articulation_points: { numeric_value: 32, display: '32 puntos' },
        scale: { display: 'Escala 1:12' }
      }
    };

    const p2 = {
      id: 'p2',
      title: 'Batman DC Multiverse McFarlane',
      base_price: 1800,
      is_international: false,
      status: 'active',
      normalized_attributes: {
        price: { numeric_value: 1800, display: '$ 1800' },
        height: { numeric_value: 18, display: '18 cm (~7.1")' },
        articulation_points: { numeric_value: 22, display: '22 puntos' },
        scale: { display: 'Escala 1:10' }
      }
    };

    it('extracts deterministic facts without bias or hallucination', () => {
      const facts = extractDeterministicFacts([p1 as any, p2 as any]);

      // p2 is 1800 vs 4500 -> lowest price
      expect(facts.lowest_price_product_id).toBe('p2');
      expect(facts.highest_price_product_id).toBe('p1');

      // p2 is 18 cm vs 16 cm -> largest height
      expect(facts.largest_height_product_id).toBe('p2');
      expect(facts.smallest_height_product_id).toBe('p1');

      // p1 has 32 articulations vs 22 -> most articulated
      expect(facts.most_articulated_product_id).toBe('p1');
    });

    it('generates factual verdict with badges and forbids subjective opinions', () => {
      const verdict = generateCollectorVerdict([p1 as any, p2 as any]);

      expect(verdict.badges_by_product['p2']).toContain('Mejor Precio');
      expect(verdict.badges_by_product['p2']).toContain('Mayor Tamaño');
      expect(verdict.badges_by_product['p1']).toContain('Más Articulado');

      // Check that forbidden subjective words do NOT appear
      const fullText = (verdict.summary + ' ' + verdict.key_findings.join(' ')).toLowerCase();
      expect(fullText).not.toContain('es mejor');
      expect(fullText).not.toContain('mayor calidad');
      expect(fullText).not.toContain('mejor inversión');
    });
  });

  describe('4. Collector Compatibility Engine', () => {
    const f12_a = {
      id: 'fa',
      title: 'Goku S.H.Figuarts 1:12',
      normalized_attributes: {
        scale: { raw: '1:12', display: 'Escala 1:12' },
        height: { numeric_value: 15 }
      }
    };

    const f12_b = {
      id: 'fb',
      title: 'Vegeta S.H.Figuarts 1:12',
      normalized_attributes: {
        scale: { raw: '1:12', display: 'Escala 1:12' },
        height: { numeric_value: 14 }
      }
    };

    const f6_c = {
      id: 'fc',
      title: 'Hot Toys Darth Vader 1:6 Sixth Scale',
      normalized_attributes: {
        scale: { raw: '1:6', display: 'Escala 1:6' },
        height: { numeric_value: 32 }
      }
    };

    it('identifies identical scales as COMPATIBLE', () => {
      const res = evaluateCollectorCompatibility([f12_a as any, f12_b as any]);
      expect(res.status).toBe('COMPATIBLE');
      expect(res.reason).toContain('escala 1:12');
    });

    it('identifies mismatched scales (1:12 vs 1:6) as NOT_RECOMMENDED', () => {
      const res = evaluateCollectorCompatibility([f12_a as any, f6_c as any]);
      expect(res.status).toBe('NOT_RECOMMENDED');
      expect(res.label).toContain('Incompatibles');
    });

    it('handles unknown scales gracefully when no scales are provided', () => {
      const unknownA = { id: 'u1', title: 'Mystery Figure A', normalized_attributes: {} };
      const unknownB = { id: 'u2', title: 'Mystery Figure B', normalized_attributes: {} };
      const res = evaluateCollectorCompatibility([unknownA as any, unknownB as any]);
      expect(res.status).toBe('UNKNOWN');
    });
  });
});
