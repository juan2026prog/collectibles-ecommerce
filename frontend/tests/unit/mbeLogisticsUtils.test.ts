import { describe, it, expect } from 'vitest';
import {
  sanitizeMbePackagingType,
  isValidMbePackagingType,
  getMbePackagingLabel,
  mergeMbePackagingType,
  calculateArgentinaShippingStatus
} from './mbeLogisticsUtils';

describe('mbeLogisticsUtils', () => {
  describe('sanitizeMbePackagingType', () => {
    it('normalizes mbe_pak and variants', () => {
      expect(sanitizeMbePackagingType('mbe_pak')).toBe('mbe_pak');
      expect(sanitizeMbePackagingType('PAK')).toBe('mbe_pak');
      expect(sanitizeMbePackagingType(' pak ')).toBe('mbe_pak');
    });

    it('normalizes mbe_caja and variants', () => {
      expect(sanitizeMbePackagingType('mbe_caja')).toBe('mbe_caja');
      expect(sanitizeMbePackagingType('Caja')).toBe('mbe_caja');
      expect(sanitizeMbePackagingType('box')).toBe('mbe_caja');
    });

    it('returns null for undefined, empty, or unclassified values', () => {
      expect(sanitizeMbePackagingType(null)).toBe(null);
      expect(sanitizeMbePackagingType(undefined)).toBe(null);
      expect(sanitizeMbePackagingType('')).toBe(null);
      expect(sanitizeMbePackagingType('sin_definir')).toBe(null);
    });

    it('returns null for invalid/arbitrary string values', () => {
      expect(sanitizeMbePackagingType('gratis')).toBe(null);
      expect(sanitizeMbePackagingType('express')).toBe(null);
      expect(sanitizeMbePackagingType(123)).toBe(null);
    });
  });

  describe('isValidMbePackagingType', () => {
    it('validates allowed values', () => {
      expect(isValidMbePackagingType('mbe_pak')).toBe(true);
      expect(isValidMbePackagingType('mbe_caja')).toBe(true);
      expect(isValidMbePackagingType(null)).toBe(true);
      expect(isValidMbePackagingType('')).toBe(true);
    });

    it('returns false for invalid values', () => {
      expect(isValidMbePackagingType('arbitrary_value')).toBe(false);
      expect(isValidMbePackagingType(123)).toBe(false);
    });
  });

  describe('getMbePackagingLabel', () => {
    it('returns human readable labels', () => {
      expect(getMbePackagingLabel('mbe_pak')).toBe('MBE PAK');
      expect(getMbePackagingLabel('mbe_caja')).toBe('MBE Caja');
      expect(getMbePackagingLabel(null)).toBe('Sin definir');
      expect(getMbePackagingLabel('')).toBe('Sin definir');
    });
  });

  describe('mergeMbePackagingType', () => {
    it('merges packaging_type into existing metadata without losing other keys', () => {
      const initial = {
        mercadolibre_id: 'MLU12345',
        logistics: { weight_source: 'ESTIMATED' },
        attributes: [{ id: 'COLOR', value_name: 'Azul' }]
      };

      const merged = mergeMbePackagingType(initial, 'mbe_pak');

      expect(merged.packaging_type).toBe('mbe_pak');
      expect(merged.mercadolibre_id).toBe('MLU12345');
      expect(merged.logistics).toEqual({ weight_source: 'ESTIMATED' });
      expect(merged.attributes).toHaveLength(1);
    });

    it('removes packaging_type when value is set to null or sin_definir while preserving other metadata', () => {
      const initial = {
        mercadolibre_id: 'MLU12345',
        packaging_type: 'mbe_pak',
        mbe_service_type: 'mbe_pak',
        logistics: { weight_source: 'ESTIMATED' }
      };

      const merged = mergeMbePackagingType(initial, null);

      expect(merged.packaging_type).toBeUndefined();
      expect(merged.mbe_service_type).toBeUndefined();
      expect(merged.mercadolibre_id).toBe('MLU12345');
      expect(merged.logistics).toEqual({ weight_source: 'ESTIMATED' });
    });
  });

  describe('calculateArgentinaShippingStatus & Vendor Status Rules', () => {
    it('Collectibles products ALWAYS evaluate as enabled & active (Override)', () => {
      const res = calculateArgentinaShippingStatus({
        vendor_id: null, // Collectibles product
        vendor: { status: 'suspended', ships_to_argentina: false },
        weight_kg: 0.45,
        dimensions: { length: 10, width: 10, height: 5 },
        metadata: { packaging_type: 'mbe_pak' }
      });
      expect(res.isEligible).toBe(true);
      expect(res.badgeColor).toBe('green');
      expect(res.reasonCode).toBe('ELIGIBLE');
    });

    it('Inactive/Suspended vendor returns VENDOR_DISABLED with Priority 1 over ships_to_argentina', () => {
      const res = calculateArgentinaShippingStatus({
        vendor_id: 'vendor-123',
        vendor: { id: 'vendor-123', status: 'suspended', ships_to_argentina: true },
        weight_kg: 0.45,
        dimensions: { length: 10, width: 10, height: 5 },
        metadata: { packaging_type: 'mbe_pak' }
      });
      expect(res.isEligible).toBe(false);
      expect(res.badgeColor).toBe('gray');
      expect(res.reasonCode).toBe('VENDOR_DISABLED');
      expect(res.statusText).toBe('Vendedor temporalmente inactivo / suspendido');
    });

    it('External active vendor with ships_to_argentina = false blocks with VENDOR_ARGENTINA_DISABLED', () => {
      const res = calculateArgentinaShippingStatus({
        vendor_id: 'vendor-123',
        vendor: { id: 'vendor-123', status: 'active', ships_to_argentina: false },
        weight_kg: 0.45,
        dimensions: { length: 10, width: 10, height: 5 },
        metadata: { packaging_type: 'mbe_pak' }
      });
      expect(res.isEligible).toBe(false);
      expect(res.badgeColor).toBe('gray');
      expect(res.reasonCode).toBe('VENDOR_ARGENTINA_DISABLED');
      expect(res.statusText).toBe('Este vendedor no realiza envíos a Argentina');
    });

    it('External active vendor with ships_to_argentina = true and valid product evaluates to ELIGIBLE', () => {
      const res = calculateArgentinaShippingStatus({
        vendor_id: 'vendor-123',
        vendor: { id: 'vendor-123', status: 'active', ships_to_argentina: true },
        weight_kg: 0.45,
        dimensions: { length: 10, width: 10, height: 5 },
        metadata: { packaging_type: 'mbe_pak' }
      });
      expect(res.isEligible).toBe(true);
      expect(res.badgeColor).toBe('green');
      expect(res.reasonCode).toBe('ELIGIBLE');
    });
  });
});
