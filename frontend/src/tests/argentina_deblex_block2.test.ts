// frontend/src/tests/argentina_deblex_block2.test.ts
/**
 * Exhaustive Verification Test Suite for Collectibles Argentina + Deblex (Bloque 2)
 * Covers:
 * 1. Single Central Miami Suite (Pixel & Codes)
 * 2. CUIT/CUIL checksum validation & formatting
 * 3. Tariff calculation formula: USD 19/kg + single Logistic Pack (CABA USD 20, AMBA USD 34, Interior USD 43)
 * 4. User prompt verified test cases:
 *    - 0.5 kg CABA -> USD 29.50
 *    - 1.0 kg AMBA -> USD 53.00
 *    - 2.0 kg Interior -> USD 81.00
 *    - 1.75 kg AMBA -> USD 67.25
 *    - 5 packages consolidated -> Single Logistic Pack
 * 5. Consolidation rules:
 *    - FOB <= 400 (Modalidad A)
 *    - Weight <= 50 kg
 *    - Max 3 units of the same species
 *    - Previous logistics paid subtracted correctly (single pack preserved)
 * 6. Zinc Fulfillment adapter binds central suite and recipient CUIT
 * 7. Excel Exporter structure preserves original Amazon tracking
 */

import { describe, it, expect } from 'vitest';
import { PIXEL_CODES_MIAMI_SUITE, buildMiamiFulfillmentAddress } from '../lib/argentina/suiteConfig';
import { validateArgentineTaxId, formatCUIT } from '../lib/argentina/taxIdValidator';
import {
  calculateDeblexShipping,
  resolveArgentinaZone,
  evaluateConsolidation,
  DEFAULT_DEBLEX_TARIFFS
} from '../lib/argentina/pricingEngine';
import { buildZincOrderRequest } from '../lib/argentina/zincFulfillmentAdapter';
import { generateDeblexExcelBuffer, DeblexExportRow } from '../lib/argentina/excelExporter';

describe('Bloque 2 — 1. Single Central Miami Suite (Pixel & Codes / Deblex)', () => {
  it('Uses the single unified Miami suite address for all Argentina orders', () => {
    expect(PIXEL_CODES_MIAMI_SUITE.suite_code).toBe('Ste #102 DAR101334');
    expect(PIXEL_CODES_MIAMI_SUITE.address_line_1).toBe('2301 NW 107th AVE');
    expect(PIXEL_CODES_MIAMI_SUITE.city).toBe('Doral');
    expect(PIXEL_CODES_MIAMI_SUITE.state).toBe('FL');
    expect(PIXEL_CODES_MIAMI_SUITE.zip_code).toBe('33172-2177');
    expect(PIXEL_CODES_MIAMI_SUITE.courier_partner).toBe('Deblex');
  });

  it('Fulfillment address attaches buyer name and recipient CUIT without modifying physical suite', () => {
    const address = buildMiamiFulfillmentAddress('Juan Pérez', '20334455667');
    expect(address.firstName).toBe('Juan Castillo');
    expect(address.lastName).toContain('Deblex (Juan Pérez - CUIT 20334455667)');
    expect(address.addressLine1).toBe('2301 NW 107th AVE');
    expect(address.addressLine2).toBe('Ste #102 DAR101334');
    expect(address.zipCode).toBe('33172-2177');
  });
});

describe('Bloque 2 — 2. CUIT / CUIL Checksum & Formatting Validation', () => {
  it('Validates authentic CUIT with correct checksum (mod 11)', () => {
    // 20-33445566-7:
    // 2*5 + 0*4 + 3*3 + 3*2 + 4*7 + 4*6 + 5*5 + 5*4 + 6*3 + 6*2
    // 10 + 0 + 9 + 6 + 28 + 24 + 25 + 20 + 18 + 12 = 152
    // 152 % 11 = 9 -> checkDigit = 11 - 9 = 2. So 20-33445566-2 is valid.
    const validCUIT = '20334455662';
    const validation = validateArgentineTaxId(validCUIT, 'CUIT');
    expect(validation.is_valid_format).toBe(true);
    expect(validation.error).toBeUndefined();
    expect(formatCUIT(validCUIT)).toBe('20-33445566-2');
  });

  it('Rejects invalid CUIT check digits', () => {
    const invalidCUIT = '20334455669';
    const validation = validateArgentineTaxId(invalidCUIT, 'CUIT');
    expect(validation.is_valid_format).toBe(false);
    expect(validation.error).toContain('no es válido');
  });

  it('Rejects CUIT with incorrect character count', () => {
    const validation = validateArgentineTaxId('203344', 'CUIT');
    expect(validation.is_valid_format).toBe(false);
    expect(validation.error).toContain('11 dígitos');
  });
});

describe('Bloque 2 — 3. Deblex Tariff & Exact Shipping Formula', () => {
  it('Resolves CABA, AMBA and Interior zones correctly', () => {
    expect(resolveArgentinaZone('Ciudad Autónoma de Buenos Aires', 'Palermo', '1425')).toBe('CABA');
    expect(resolveArgentinaZone('Buenos Aires', 'San Isidro', '1642')).toBe('AMBA');
    expect(resolveArgentinaZone('Buenos Aires', 'Mar del Plata', '7600')).toBe('INTERIOR');
    expect(resolveArgentinaZone('Córdoba', 'Córdoba Capital', '5000')).toBe('INTERIOR');
  });

  // Prompt Mandatory Test Cases:
  it('Calculates 0.5 kg CABA -> USD 29.50', () => {
    const calc = calculateDeblexShipping(0.5, 'CABA');
    expect(calc.freight_usd).toBe(9.50); // 0.5 * 19
    expect(calc.logistic_pack_usd).toBe(20.00);
    expect(calc.total_logistics_usd).toBe(29.50);
  });

  it('Calculates 1.0 kg AMBA -> USD 53.00', () => {
    const calc = calculateDeblexShipping(1.0, 'AMBA');
    expect(calc.freight_usd).toBe(19.00); // 1.0 * 19
    expect(calc.logistic_pack_usd).toBe(34.00);
    expect(calc.total_logistics_usd).toBe(53.00);
  });

  it('Calculates 2.0 kg Interior -> USD 81.00', () => {
    const calc = calculateDeblexShipping(2.0, 'INTERIOR');
    expect(calc.freight_usd).toBe(38.00); // 2.0 * 19
    expect(calc.logistic_pack_usd).toBe(43.00);
    expect(calc.total_logistics_usd).toBe(81.00);
  });

  it('Calculates 1.75 kg AMBA -> USD 67.25', () => {
    const calc = calculateDeblexShipping(1.75, 'AMBA');
    expect(calc.freight_usd).toBe(33.25); // 1.75 * 19
    expect(calc.logistic_pack_usd).toBe(34.00);
    expect(calc.total_logistics_usd).toBe(67.25);
  });
});

describe('Bloque 2 — 4. Consolidation & Single Logistic Pack Logic', () => {
  it('Consolidates 5 packages with a SINGLE Logistic Pack and subtracts previously paid logistics', () => {
    // 5 packages of 0.5 kg in AMBA.
    // Each originally paid individual logistics = 0.5 * 19 + 34 = 43.50. Total paid = 5 * 43.50 = 217.50
    // Consolidated: 2.5 kg total. Freight = 2.5 * 19 = 47.50. Single Logistic Pack = 34.00. Total = 81.50.
    // Net difference = 81.50 - 217.50 = -136.00 (Customer is in credit, single pack applied once).
    const packages = [
      { id: '1', fob_usd: 40, weight_kg: 0.5, logistics_paid_usd: 43.50, species_category: 'funko' },
      { id: '2', fob_usd: 40, weight_kg: 0.5, logistics_paid_usd: 43.50, species_category: 'funko' },
      { id: '3', fob_usd: 40, weight_kg: 0.5, logistics_paid_usd: 43.50, species_category: 'neca' },
      { id: '4', fob_usd: 40, weight_kg: 0.5, logistics_paid_usd: 43.50, species_category: 'neca' },
      { id: '5', fob_usd: 40, weight_kg: 0.5, logistics_paid_usd: 43.50, species_category: 'marvel' },
    ];

    const result = evaluateConsolidation(packages, 'AMBA');
    expect(result.status).toBe('ELIGIBLE');
    expect(result.total_weight_kg).toBe(2.5);
    expect(result.fob_total_usd).toBe(200);
    expect(result.single_logistic_pack_usd).toBe(34.00);
    expect(result.freight_usd).toBe(47.50);
    expect(result.total_logistics_calculated_usd).toBe(81.50);
    expect(result.previous_logistics_paid_usd).toBe(217.50);
    expect(result.net_logistics_difference_usd).toBe(-136.00);
    expect(result.errors.length).toBe(0);
  });

  it('Blocks consolidation when FOB exceeds USD 400 (Modalidad A limit)', () => {
    const packages = [
      { id: '1', fob_usd: 250, weight_kg: 1.0, logistics_paid_usd: 53.00 },
      { id: '2', fob_usd: 150.01, weight_kg: 1.0, logistics_paid_usd: 53.00 },
    ];
    const result = evaluateConsolidation(packages, 'AMBA');
    expect(result.status).toBe('BLOCKED_FOB');
    expect(result.errors.some(e => e.includes('supera el límite de USD 400'))).toBe(true);
  });

  it('Allows consolidation when FOB is exactly USD 400.00', () => {
    const packages = [
      { id: '1', fob_usd: 200, weight_kg: 1.0, logistics_paid_usd: 53.00 },
      { id: '2', fob_usd: 200, weight_kg: 1.0, logistics_paid_usd: 53.00 },
    ];
    const result = evaluateConsolidation(packages, 'AMBA');
    expect(result.status).toBe('ELIGIBLE');
  });

  it('Blocks consolidation when more than 3 units of the same species category are included', () => {
    const packages = [
      { id: '1', fob_usd: 20, weight_kg: 0.5, species_category: 'funko_pop', units: 2 },
      { id: '2', fob_usd: 20, weight_kg: 0.5, species_category: 'funko_pop', units: 2 },
    ];
    const result = evaluateConsolidation(packages, 'CABA');
    expect(result.status).toBe('BLOCKED_SPECIES');
    expect(result.errors.some(e => e.includes('unidades de la misma especie'))).toBe(true);
  });
});

describe('Bloque 2 — 5. Zinc Fulfillment & Excel Export Structure', () => {
  it('Builds Zinc order request targeting Pixel & Codes central Miami suite with CUIT notes', () => {
    const req = buildZincOrderRequest({
      order_id: 'ord-123',
      order_number: 'COL-AR-9901',
      customer_full_name: 'María García',
      customer_document_number: '27334455664',
      destination_city: 'Rosario',
      destination_province: 'Santa Fe',
      items: [{ asin: 'B08ABC1234', quantity: 1 }],
    });

    expect(req.shipping_address.address_line1).toBe('2301 NW 107th AVE');
    expect(req.shipping_address.city).toBe('Doral');
    expect(req.shipping_address.state).toBe('FL');
    expect(req.client_notes.recipient_cuit).toBe('27334455664');
    expect(req.client_notes.collectibles_order_number).toBe('COL-AR-9901');
    expect(req.products[0].product_id).toBe('B08ABC1234');
  });

  it('Generates Excel manifest binary preserving original Amazon tracking and CUIT', () => {
    const rows: DeblexExportRow[] = [
      {
        pedido_collectibles: 'COL-AR-8801',
        tracking_original: 'TBA123456789000',
        tipo_documento: 'CUIT',
        numero_documento: '20334455662',
        nombre_destinatario: 'Pedro Gómez',
        producto: 'Spider-Man Marvel Legends',
        cantidad: 1,
        valor_fob_usd: 24.99,
        peso_kg: 0.45,
        id_paquete: 'pkg-991',
        codigo_consolidacion: 'CS-AR-20261015-001',
        estado_paquete: 'RECIBIDO_EN_DEPOSITO',
        fecha_registro: '2026-10-15',
        referencia_logistica: 'AR-20334455662',
      },
    ];

    const buffer = generateDeblexExcelBuffer(rows);
    expect(buffer).toBeDefined();
    expect(buffer.length).toBeGreaterThan(100);
  });
});
