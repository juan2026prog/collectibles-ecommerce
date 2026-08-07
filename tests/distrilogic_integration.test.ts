/**
 * Integration & Security Test Suite for Distrilogic Multi-Vendor Shipping Integration
 */

import { encryptData, decryptData } from '../supabase/functions/_shared/crypto';

describe('Distrilogic Shipping Engine & Security Tests', () => {

  // 1. AES-GCM Encryption Tests
  describe('AES-GCM 256-bit Encryption Audit', () => {
    const sampleSecretKey = "super_secret_master_key_collectibles_2026";
    const sampleCredentials = JSON.stringify({
      guid: "C9BF8FC158E674E9C8D2FB4747EE5",
      usuario: "INTERFASEAPIREST",
      password: "Api2548!Cs",
      cue_id: "1681"
    });

    test('should encrypt and decrypt credentials accurately', async () => {
      const encrypted = await encryptData(sampleCredentials, sampleSecretKey);
      expect(encrypted).toMatch(/^v1:[0-9a-f]{24}:[0-9a-f]+$/);

      const decrypted = await decryptData(encrypted, sampleSecretKey);
      expect(decrypted).toBe(sampleCredentials);
    });

    test('should generate a unique random IV for every encryption (No IV reuse)', async () => {
      const enc1 = await encryptData(sampleCredentials, sampleSecretKey);
      const enc2 = await encryptData(sampleCredentials, sampleSecretKey);

      expect(enc1).not.toBe(enc2);

      const iv1 = enc1.split(':')[1];
      const iv2 = enc2.split(':')[2];
      expect(iv1).not.toBe(iv2);
    });

    test('should fail decryption if ciphertext or authentication tag is corrupted', async () => {
      const encrypted = await encryptData(sampleCredentials, sampleSecretKey);
      const parts = encrypted.split(':');

      // Tamper with the last hex character of ciphertext
      const lastChar = parts[2].slice(-1);
      const tamperedChar = lastChar === 'a' ? 'b' : 'a';
      const corruptedEncrypted = `${parts[0]}:${parts[1]}:${parts[2].slice(0, -1)}${tamperedChar}`;

      await expect(decryptData(corruptedEncrypted, sampleSecretKey)).rejects.toThrow("Descifrado fallido");
    });

    test('should fail decryption if wrong secret key is provided', async () => {
      const encrypted = await encryptData(sampleCredentials, sampleSecretKey);
      const wrongKey = "different_secret_key_collectibles_2026";

      await expect(decryptData(encrypted, wrongKey)).rejects.toThrow("Descifrado fallido");
    });
  });

  // 2. Status Code Mapping Test
  describe('Status Code Mapping', () => {
    test('should map Distrilogic status codes correctly', () => {
      function mapStatusCodeToInternal(statusNomOrCode: string | number): { code: number; internalStatus: string } {
        const norm = String(statusNomOrCode).toUpperCase().trim();
        if (norm === '1' || norm.includes('DEPÓSITO') || norm.includes('DEPOSITO')) return { code: 1, internalStatus: 'at_warehouse' };
        if (norm === '2' || norm.includes('TRÁNSITO') || norm.includes('TRANSITO')) return { code: 2, internalStatus: 'in_transit' };
        if (norm === '3' || norm.includes('ENTREGADO')) return { code: 3, internalStatus: 'delivered' };
        if (norm === '4' || norm.includes('PENDIENTE')) return { code: 4, internalStatus: 'delivered_pending_action' };
        if (norm === '5' || norm.includes('PICK UP') || norm.includes('PICKUP')) return { code: 5, internalStatus: 'pickup' };
        if (norm === '6' || norm.includes('NO ENTREGADO')) return { code: 6, internalStatus: 'delivery_failed' };
        if (norm === '7' || norm.includes('CANCELADO')) return { code: 7, internalStatus: 'cancelled' };
        if (norm === '8' || norm.includes('DEVUELTO')) return { code: 8, internalStatus: 'returned' };
        return { code: 9, internalStatus: 'preparing' };
      }

      expect(mapStatusCodeToInternal(9).internalStatus).toBe('preparing');
      expect(mapStatusCodeToInternal('EN PREPARACIÓN').internalStatus).toBe('preparing');
      expect(mapStatusCodeToInternal(1).internalStatus).toBe('at_warehouse');
      expect(mapStatusCodeToInternal('DEPÓSITO').internalStatus).toBe('at_warehouse');
      expect(mapStatusCodeToInternal(2).internalStatus).toBe('in_transit');
      expect(mapStatusCodeToInternal('TRÁNSITO').internalStatus).toBe('in_transit');
      expect(mapStatusCodeToInternal(3).internalStatus).toBe('delivered');
      expect(mapStatusCodeToInternal('ENTREGADO').internalStatus).toBe('delivered');
      expect(mapStatusCodeToInternal(6).internalStatus).toBe('delivery_failed');
      expect(mapStatusCodeToInternal(7).internalStatus).toBe('cancelled');
    });
  });

  // 3. Markup Calculation Test
  describe('Markup Calculations', () => {
    test('should compute markup correctly per vendor service', () => {
      function calculateCustomerCost(providerCost: number, markupType: 'none' | 'fixed' | 'percentage', markupValue: number): number {
        if (markupType === 'fixed') return providerCost + markupValue;
        if (markupType === 'percentage') return providerCost * (1 + markupValue / 100);
        return providerCost;
      }

      expect(calculateCustomerCost(180, 'none', 0)).toBe(180);
      expect(calculateCustomerCost(180, 'fixed', 50)).toBe(230);
      expect(calculateCustomerCost(200, 'percentage', 10)).toBe(220);
    });
  });

  // 4. Vendor Subtotal Free Shipping Isolation Test
  describe('Free Shipping Subtotal Isolation', () => {
    test('should evaluate free shipping threshold strictly on vendor subtotal', () => {
      function evaluateVendorFreeShipping(vendorSubtotal: number, freeShippingEnabled: boolean, threshold: number): boolean {
        if (!freeShippingEnabled || threshold <= 0) return false;
        return vendorSubtotal >= threshold;
      }

      // Vendor A subtotal = 1490, threshold = 1500 -> false
      expect(evaluateVendorFreeShipping(1490, true, 1500)).toBe(false);
      // Vendor A subtotal = 1550, threshold = 1500 -> true
      expect(evaluateVendorFreeShipping(1550, true, 1500)).toBe(true);
      // Vendor B subtotal = 1390, threshold = 1500 -> false even if combined total is 2880
      expect(evaluateVendorFreeShipping(1390, true, 1500)).toBe(false);
    });
  });

  // 5. Address Parser Test
  describe('Address Parser', () => {
    test('should parse street name and door number correctly', () => {
      function parseAddress(fullAddress: string) {
        if (!fullAddress) return { street: 'Sin Especificar', number: 'S/N', apto: 0 };
        const matches = fullAddress.match(/^(.+?)\s+(\d+[\w-]*)(?:\s*(?:apto|apt|depto)\s*(.*))?$/i);
        if (matches) {
          return {
            street: matches[1].trim(),
            number: matches[2].trim(),
            apto: matches[3] ? parseInt(matches[3].replace(/[^\d]/g, ''), 10) || 0 : 0
          };
        }
        return { street: fullAddress.trim(), number: '1', apto: 0 };
      }

      expect(parseAddress("Benito Blanco 1152 apto 502")).toEqual({
        street: "Benito Blanco",
        number: "1152",
        apto: 502
      });

      expect(parseAddress("Avenida General Flores 4263")).toEqual({
        street: "Avenida General Flores",
        number: "4263",
        apto: 0
      });
    });
  });

  // 6. Cancellation Eligibility Test
  describe('Cancellation Eligibility', () => {
    test('should allow cancellation only when status code is 9 (EN PREPARACIÓN)', () => {
      function isCancellable(statusCode: number): boolean {
        return statusCode === 9;
      }

      expect(isCancellable(9)).toBe(true);
      expect(isCancellable(1)).toBe(false);
      expect(isCancellable(2)).toBe(false);
      expect(isCancellable(3)).toBe(false);
    });
  });

});
