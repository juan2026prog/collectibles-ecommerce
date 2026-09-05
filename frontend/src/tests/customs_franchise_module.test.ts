import { describe, it, expect } from 'vitest';
import { CustomsRuleEngine, DEFAULT_UY_2026_RULES } from '../lib/customs/CustomsRuleEngine';
import { CourierPricingEngine } from '../lib/customs/CourierPricingEngine';
import { ImportCostEngine } from '../lib/customs/ImportCostEngine';

describe('Módulo 06: Mi Franquicia Uruguay 2026 Engine Tests', () => {
  const engine = new CustomsRuleEngine(DEFAULT_UY_2026_RULES);

  describe('CustomsRuleEngine', () => {
    it('applies 0% customs tax when under franchise quota and shipments remain', () => {
      const evaluation = engine.evaluateShipment({
        productPriceUsd: 120,
        actualWeightKg: 0.8,
        usage: { usedShipments: 1, usedAmountUsd: 200 }
      });

      expect(evaluation.status).toBe('FRANCHISE_APPLIED');
      expect(evaluation.taxUsd).toBe(0);
      if (evaluation.status === 'FRANCHISE_APPLIED') {
        expect(evaluation.remainingShipmentsAfter).toBe(1);
        expect(evaluation.remainingQuotaAfter).toBe(480); // 800 - 200 - 120
      }
    });

    it('applies simplified regime 60% with USD 20 minimum when shipments are exhausted', () => {
      const evaluation = engine.evaluateShipment({
        productPriceUsd: 25,
        actualWeightKg: 0.5,
        usage: { usedShipments: 3, usedAmountUsd: 300 }
      });

      expect(evaluation.status).toBe('SIMPLIFIED_REGIME');
      // 25 * 0.6 = 15 -> minimum is 20
      expect(evaluation.taxUsd).toBe(20);
    });

    it('applies 60% calculated tax when it exceeds the USD 20 minimum', () => {
      const evaluation = engine.evaluateShipment({
        productPriceUsd: 100,
        actualWeightKg: 1.2,
        usage: { usedShipments: 3, usedAmountUsd: 500 }
      });

      expect(evaluation.status).toBe('SIMPLIFIED_REGIME');
      // 100 * 0.60 = 60
      expect(evaluation.taxUsd).toBe(60);
    });

    it('strictly disqualifies packages exceeding 20 kg physical weight', () => {
      const evaluation = engine.evaluateShipment({
        productPriceUsd: 150,
        actualWeightKg: 21.5,
        usage: { usedShipments: 0, usedAmountUsd: 0 }
      });

      expect(evaluation.status).toBe('DISQUALIFIED_WEIGHT');
      expect(evaluation.taxUsd).toBeNull();
      expect(evaluation.reason).toContain('supera el límite máximo permitido de 20 kg');
    });

    it('switches to simplified regime if product price exceeds remaining quota', () => {
      const evaluation = engine.evaluateShipment({
        productPriceUsd: 400,
        actualWeightKg: 2.0,
        usage: { usedShipments: 1, usedAmountUsd: 600 } // Quota left: 200
      });

      expect(evaluation.status).toBe('SIMPLIFIED_REGIME');
      expect(evaluation.taxUsd).toBe(240); // 400 * 0.60
    });
  });

  describe('CourierPricingEngine', () => {
    it('calculates PuntoMio tiers correctly without handling fees', () => {
      const light = CourierPricingEngine.calculatePuntoMio(0.4);
      expect(light.totalCourierUsd).toBe(11.50);

      const oneKg = CourierPricingEngine.calculatePuntoMio(0.9);
      expect(oneKg.totalCourierUsd).toBe(16.50);

      const medium = CourierPricingEngine.calculatePuntoMio(3.0);
      expect(medium.totalCourierUsd).toBe(36.00); // 3 * 12
    });

    it('calculates Urubox tiers with handling and 10% URSEC', () => {
      const estimate = CourierPricingEngine.calculateUrubox(0.4);
      // Urubox: 200g - 500g is USD 15.90 base + USD 5 handling + 10% of 15.90 (1.59) = 22.49
      expect(estimate.baseFreightUsd).toBe(15.90);
      expect(estimate.handlingUsd).toBe(5.00);
      expect(estimate.ursecUsd).toBe(1.59);
      expect(estimate.totalCourierUsd).toBe(22.49);
    });

    it('flags packages over 20 kg as overweight', () => {
      const overweight = CourierPricingEngine.calculatePuntoMio(25.0);
      expect(overweight.isOverweight).toBe(true);
      expect(overweight.totalCourierUsd).toBe(0);
    });
  });

  describe('ImportCostEngine', () => {
    it('calculates complete landed cost under franchise in USD and UYU', () => {
      const landed = ImportCostEngine.calculateLandedCost({
        productPriceUsd: 50,
        weightKg: 0.4,
        courierCode: 'puntomio',
        usage: { usedShipments: 0, usedAmountUsd: 0 },
        exchangeRateUsdToUyu: 42.50
      });

      expect(landed.isEligibleForImport).toBe(true);
      expect(landed.customsEvaluation.taxUsd).toBe(0);
      expect(landed.courier.totalCourierUsd).toBe(11.50);
      // Total USD = 50 + 11.50 = 61.50
      expect(landed.totalCostUsd).toBe(61.50);
      // Total UYU = 61.50 * 42.50 = 2613.75 -> 2614
      expect(landed.totalCostUyu).toBe(2614);
    });

    it('calculates complete landed cost with simplified regime', () => {
      const landed = ImportCostEngine.calculateLandedCost({
        productPriceUsd: 100,
        weightKg: 0.5,
        courierCode: 'puntomio',
        usage: { usedShipments: 3, usedAmountUsd: 800 },
        exchangeRateUsdToUyu: 42.50
      });

      expect(landed.isEligibleForImport).toBe(true);
      // Tax: 100 * 0.60 = 60
      expect(landed.customsEvaluation.taxUsd).toBe(60);
      // Courier: 11.50
      expect(landed.courier.totalCourierUsd).toBe(11.50);
      // Total: 100 + 11.50 + 60 = 171.50
      expect(landed.totalCostUsd).toBe(171.50);
    });

    it('rejects overweight shipments immediately', () => {
      const landed = ImportCostEngine.calculateLandedCost({
        productPriceUsd: 500,
        weightKg: 25,
        courierCode: 'puntomio'
      });

      expect(landed.isEligibleForImport).toBe(false);
      expect(landed.totalCostUsd).toBe(0);
      expect(landed.ineligibilityReason).toContain('excede el límite máximo de 20 kg');
    });
  });
});
