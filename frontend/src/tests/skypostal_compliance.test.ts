// frontend/src/tests/skypostal_compliance.test.ts

import { describe, it, expect } from 'vitest';
import { evaluateProductCompliance } from '../lib/skypostal/skypostalPricing';

describe('SkyPostal Phase 2 — Authoritative Compliance Engine', () => {
  describe('Universal Prohibitions', () => {
    it('should block counterfeit / replica branded goods', () => {
      const res = evaluateProductCompliance({
        title: 'Fake Anime Figure',
        fobValueUsd: 25,
        quantity: 1,
        isCounterfeitOrReplicaBrand: true
      }, 'CL');

      expect(res.status).toBe('PROHIBITED');
      expect(res.matchedRule).toBe('UNIVERSAL_PROHIBITION_COUNTERFEIT');
    });

    it('should block weapons and tactical replicas', () => {
      const res = evaluateProductCompliance({
        title: 'Airsoft Replica Rifle',
        fobValueUsd: 150,
        quantity: 1,
        isWeaponOrReplica: true
      }, 'PE');

      expect(res.status).toBe('PROHIBITED');
      expect(res.matchedRule).toBe('UNIVERSAL_PROHIBITION_WEAPONS');
    });
  });

  describe('Chile (CL) Customs Rules', () => {
    it('should allow valid collectibles within courier limit', () => {
      const res = evaluateProductCompliance({
        title: 'Original Dragon Ball Figure',
        fobValueUsd: 85,
        quantity: 1
      }, 'CL');

      expect(res.status).toBe('ALLOWED');
      expect(res.countryCode).toBe('CL');
      expect(res.serviceCode).toBe(1);
      expect(res.requiredDocuments).toContain('RUT_BENEFICIARIO');
    });

    it('should restrict FOB values over US$ 1000 for standard courier in Chile', () => {
      const res = evaluateProductCompliance({
        title: 'Life Size Collectible Statue',
        fobValueUsd: 1500,
        quantity: 1
      }, 'CL');

      expect(res.status).toBe('RESTRICTED');
      expect(res.matchedRule).toBe('CL_MAX_VALUE_EXCEEDED');
      expect(res.warnings[0]).toContain('US$ 1000');
    });

    it('should prohibit cosmetics and supplements for courier into Chile', () => {
      const res = evaluateProductCompliance({
        title: 'Collector Perfume Edition',
        fobValueUsd: 60,
        quantity: 1,
        isCosmetic: true
      }, 'CL');

      expect(res.status).toBe('PROHIBITED');
      expect(res.matchedRule).toBe('CL_PROHIBITED_COSMETICS_MEDS');
    });
  });

  describe('Peru (PE) Customs Rules', () => {
    it('should allow collectibles and flag de minimis <= $200 USD', () => {
      const res = evaluateProductCompliance({
        title: 'Pokemon Card Booster Box',
        fobValueUsd: 120,
        quantity: 1
      }, 'PE');

      expect(res.status).toBe('ALLOWED');
      expect(res.requiredDocuments).toContain('DNI_OR_RUC');
      expect(res.warnings.some(w => w.includes('De minimis'))).toBe(true);
    });

    it('should restrict quantities > 10 units of toys to avoid commercial presumption', () => {
      const res = evaluateProductCompliance({
        title: 'Mini Figure Blind Box',
        fobValueUsd: 150,
        quantity: 15
      }, 'PE');

      expect(res.status).toBe('RESTRICTED');
      expect(res.matchedRule).toBe('PE_MAX_TOYS_PER_SHIPMENT');
    });

    it('should restrict shipments FOB > US$ 2000 requiring customs broker', () => {
      const res = evaluateProductCompliance({
        title: 'Rare Vintage Comic Graded 9.8',
        fobValueUsd: 2500,
        quantity: 1
      }, 'PE');

      expect(res.status).toBe('RESTRICTED');
      expect(res.matchedRule).toBe('PE_MAX_SIMPLIFIED_VALUE');
    });
  });

  describe('Ecuador (EC) Category B (4x4) vs Category C', () => {
    it('should classify as Category B when weight <= 4kg and FOB <= $400 USD', () => {
      const res = evaluateProductCompliance({
        title: 'Gundam Model Kit',
        fobValueUsd: 180,
        quantity: 1,
        weightKg: 1.5
      }, 'EC');

      expect(res.status).toBe('ALLOWED');
      expect(res.specialTariffCategory).toBe('CATEGORY_B');
      expect(res.serviceCode).toBe(4);
      expect(res.requiredDocuments).toContain('CEDULA_BENEFICIARIO');
    });

    it('should classify as Category C when FOB exceeds $400 USD or weight > 4kg', () => {
      const res = evaluateProductCompliance({
        title: 'Premium Masterpiece Statue',
        fobValueUsd: 550,
        quantity: 1,
        weightKg: 5.2
      }, 'EC');

      expect(res.status).toBe('ALLOWED');
      expect(res.specialTariffCategory).toBe('CATEGORY_C');
    });

    it('should prohibit fine jewelry in Ecuador', () => {
      const res = evaluateProductCompliance({
        title: 'Gold Ring Collectible',
        fobValueUsd: 300,
        quantity: 1,
        isFineJewelry: true
      }, 'EC');

      expect(res.status).toBe('PROHIBITED');
      expect(res.matchedRule).toBe('EC_PROHIBITED_FINE_JEWELRY');
    });
  });

  describe('Mexico (MX) Standard vs Regulated', () => {
    it('should evaluate standard collectibles with MX-340 (service code 1)', () => {
      const res = evaluateProductCompliance({
        title: 'Marvel Legends Figure',
        fobValueUsd: 40,
        quantity: 1
      }, 'MX');

      expect(res.status).toBe('ALLOWED');
      expect(res.serviceCode).toBe(1);
      expect(res.specialTariffCategory).toBe('STANDARD');
      expect(res.requiredDocuments).toContain('RFC_OR_CURP');
    });

    it('should evaluate regulated goods with MX-340-R (service code 502)', () => {
      const res = evaluateProductCompliance({
        title: 'Collector Serum & Cosmetic Kit',
        fobValueUsd: 80,
        quantity: 1,
        isCosmetic: true
      }, 'MX');

      expect(res.status).toBe('REGULATED');
      expect(res.serviceCode).toBe(502);
      expect(res.specialTariffCategory).toBe('REGULATED');
    });
  });

  describe('Fail-Closed Fallback', () => {
    it('should return MANUAL_REVIEW for unconfigured destination countries', () => {
      const res = evaluateProductCompliance({
        title: 'Collectible Item',
        fobValueUsd: 50,
        quantity: 1
      }, 'XX');

      expect(res.status).toBe('MANUAL_REVIEW');
      expect(res.matchedRule).toBe('UNCONFIGURED_COUNTRY');
    });
  });
});
