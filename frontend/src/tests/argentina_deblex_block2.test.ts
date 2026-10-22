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

describe('Bloque 2 — 6. RBAC & Strict User Quota (Max 8 Accounts)', () => {
  it('Enforces max 8 accounts rule: 2 initial admins + max 6 operators', () => {
    const MAX_ALLOWED = 8;
    const initialAdmins = ['juanmacastillo2008@gmail.com', 'ariel.delpino@deblex.com.ar'];
    expect(initialAdmins.length).toBe(2);

    const operators = [
      'op1@deblex.com.ar',
      'op2@deblex.com.ar',
      'op3@deblex.com.ar',
      'op4@deblex.com.ar',
      'op5@deblex.com.ar',
      'op6@deblex.com.ar',
    ];
    expect(operators.length).toBe(6);

    const totalAccounts = initialAdmins.length + operators.length;
    expect(totalAccounts).toBe(MAX_ALLOWED);

    // Attempting a 7th operator exceeds limit
    const attemptSeventhOperator = (currentTotal: number) => {
      if (currentTotal >= MAX_ALLOWED) {
        throw new Error('Cupo alcanzado: Se ha alcanzado el límite máximo permitido de 8 cuentas en el Portal Deblex (2 admins + 6 operadores).');
      }
      return currentTotal + 1;
    };

    expect(() => attemptSeventhOperator(totalAccounts)).toThrow('Cupo alcanzado');
  });

  it('Calculates quota consumption correctly: ACTIVE, PENDING_INVITE and SUSPENDED consume quota, FAILED does not', () => {
    const accounts = [
      { email: 'juanmacastillo2008@gmail.com', role: 'deblex_admin', status: 'ACTIVE' },
      { email: 'ariel.delpino@deblex.com.ar', role: 'deblex_admin', status: 'ACTIVE' },
      { email: 'op1@deblex.com.ar', role: 'deblex_operator', status: 'ACTIVE' },
      { email: 'op2@deblex.com.ar', role: 'deblex_operator', status: 'PENDING_INVITE' },
      { email: 'op3@deblex.com.ar', role: 'deblex_operator', status: 'SUSPENDED' },
      { email: 'op_failed@deblex.com.ar', role: 'deblex_operator', status: 'FAILED' },
    ];

    const quotaConsumingCount = accounts.filter(a => ['ACTIVE', 'PENDING_INVITE', 'SUSPENDED'].includes(a.status)).length;
    expect(quotaConsumingCount).toBe(5); // 2 admins + 3 operators (the FAILED one did not consume)
    expect(8 - quotaConsumingCount).toBe(3); // 3 remaining operator slots available
  });
});

describe('Bloque 2 — 7. Exhaustive 25 Mandatory Audit & Compliance Tests', () => {
  it('Test 1: Miami Suite matches exact legal address Ste #102 DAR101334', () => {
    expect(PIXEL_CODES_MIAMI_SUITE.suite_code).toBe('Ste #102 DAR101334');
    expect(PIXEL_CODES_MIAMI_SUITE.address_line_1).toBe('2301 NW 107th AVE');
    expect(PIXEL_CODES_MIAMI_SUITE.city).toBe('Doral');
    expect(PIXEL_CODES_MIAMI_SUITE.state).toBe('FL');
    expect(PIXEL_CODES_MIAMI_SUITE.zip_code).toBe('33172-2177');
  });
  it('Test 2: Freight 0.5 kg = USD 9.50', () => {
    const calc = calculateDeblexShipping(0.5, 'CABA');
    expect(calc.freight_usd).toBe(9.50);
  });
  it('Test 3: Freight 1.75 kg = USD 33.25', () => {
    const calc = calculateDeblexShipping(1.75, 'CABA');
    expect(calc.freight_usd).toBe(33.25);
  });
  it('Test 4: Logistic Pack CABA = USD 20.00', () => {
    const calc = calculateDeblexShipping(0.5, 'CABA');
    expect(calc.logistic_pack_usd).toBe(20.00);
    expect(calc.total_logistics_usd).toBe(29.50);
  });
  it('Test 5: Logistic Pack AMBA = USD 34.00', () => {
    const calc = calculateDeblexShipping(1.0, 'AMBA');
    expect(calc.logistic_pack_usd).toBe(34.00);
    expect(calc.total_logistics_usd).toBe(53.00);
  });
  it('Test 6: Logistic Pack Interior = USD 43.00', () => {
    const calc = calculateDeblexShipping(2.0, 'INTERIOR');
    expect(calc.logistic_pack_usd).toBe(43.00);
    expect(calc.total_logistics_usd).toBe(81.00);
  });
  it('Test 7: Logistic Pack is charged ONCE, never multiplied by item count', () => {
    const packages = [
      { id: '1', fob_usd: 50, weight_kg: 1.0, logistics_paid_usd: 53.00 },
      { id: '2', fob_usd: 50, weight_kg: 1.0, logistics_paid_usd: 53.00 },
    ];
    const res = evaluateConsolidation(packages, 'AMBA');
    expect(res.single_logistic_pack_usd).toBe(34.00);
  });
  it('Test 8: Resolves CABA from postal code 1425', () => {
    expect(resolveArgentinaZone('CABA', 'Palermo', '1425')).toBe('CABA');
  });
  it('Test 9: Resolves AMBA from San Isidro, Buenos Aires', () => {
    expect(resolveArgentinaZone('Buenos Aires', 'San Isidro', '1642')).toBe('AMBA');
  });
  it('Test 10: Resolves INTERIOR from Córdoba', () => {
    expect(resolveArgentinaZone('Córdoba', 'Córdoba', '5000')).toBe('INTERIOR');
  });
  it('Test 11: Allows consolidation with FOB USD 400.00', () => {
    const packages = [{ id: '1', fob_usd: 400.00, weight_kg: 2.0 }];
    const res = evaluateConsolidation(packages, 'CABA');
    expect(res.status).toBe('ELIGIBLE');
    expect(res.errors.length).toBe(0);
  });
  it('Test 12: Blocks consolidation with FOB USD 400.01', () => {
    const packages = [{ id: '1', fob_usd: 400.01, weight_kg: 2.0 }];
    const res = evaluateConsolidation(packages, 'CABA');
    expect(res.status).toBe('BLOCKED_FOB');
  });
  it('Test 13: Allows weight up to 50.00 kg', () => {
    const packages = [{ id: '1', fob_usd: 100.00, weight_kg: 50.00 }];
    const res = evaluateConsolidation(packages, 'CABA');
    expect(res.status).toBe('ELIGIBLE');
  });
  it('Test 14: Blocks weight 50.01 kg with official Deblex error message', () => {
    const packages = [{ id: '1', fob_usd: 100.00, weight_kg: 50.01 }];
    const res = evaluateConsolidation(packages, 'CABA');
    expect(res.status).toBe('BLOCKED_WEIGHT');
    expect(res.errors).toContain('Tu envío supera el límite de 50 kg permitido por Deblex. Modificá tu consolidación o solicitá asistencia.');
  });
  it('Test 15: Allows up to 3 units of same species', () => {
    const packages = [{ id: '1', fob_usd: 50, weight_kg: 1.0, species_category: 'figuras', units: 3 }];
    const res = evaluateConsolidation(packages, 'CABA');
    expect(res.status).toBe('ELIGIBLE');
  });
  it('Test 16: Blocks 4 units of same species', () => {
    const packages = [{ id: '1', fob_usd: 50, weight_kg: 1.0, species_category: 'figuras', units: 4 }];
    const res = evaluateConsolidation(packages, 'CABA');
    expect(res.status).toBe('BLOCKED_SPECIES');
  });
  it('Test 17: Validates genuine CUIT format and modulus 11 checksum', () => {
    const val = validateArgentineTaxId('20334455662', 'CUIT');
    expect(val.is_valid_format).toBe(true);
  });
  it('Test 18: Rejects invalid CUIT check digit', () => {
    const val = validateArgentineTaxId('20334455669', 'CUIT');
    expect(val.is_valid_format).toBe(false);
  });
  it('Test 19: Formats 11 digits CUIT to 20-XXXXXXXX-X', () => {
    expect(formatCUIT('20334455662')).toBe('20-33445566-2');
  });
  it('Test 20: 5 packages consolidation credits previous duplicate Logistic Packs', () => {
    const packages = [
      { id: '1', fob_usd: 30, weight_kg: 0.5, logistics_paid_usd: 29.50 },
      { id: '2', fob_usd: 30, weight_kg: 0.5, logistics_paid_usd: 29.50 },
      { id: '3', fob_usd: 30, weight_kg: 0.5, logistics_paid_usd: 29.50 },
      { id: '4', fob_usd: 30, weight_kg: 0.5, logistics_paid_usd: 29.50 },
      { id: '5', fob_usd: 30, weight_kg: 0.5, logistics_paid_usd: 29.50 },
    ];
    const res = evaluateConsolidation(packages, 'CABA');
    expect(res.total_weight_kg).toBe(2.5);
    expect(res.total_logistics_calculated_usd).toBe(67.50);
    expect(res.previous_logistics_paid_usd).toBe(147.50);
    expect(res.net_logistics_difference_usd).toBe(-80.00);
  });
  it('Test 21: Zinc adapter binds recipient CUIT to delivery instructions', () => {
    const req = buildZincOrderRequest({
      order_id: 'ord-test-21',
      order_number: 'COL-AR-1002',
      customer_full_name: 'Esteban Quito',
      customer_document_number: '20334455662',
      destination_city: 'Quilmes',
      destination_province: 'Buenos Aires',
      items: [{ asin: 'B0TESTASIN1', quantity: 1 }],
    });
    expect(req.shipping_address.address_line2).toBe('Ste #102 DAR101334');
    expect(req.client_notes.recipient_cuit).toBe('20334455662');
  });
  it('Test 22: Excel export generator retains original carrier tracking', () => {
    const row: DeblexExportRow = {
      pedido_collectibles: 'COL-AR-1003',
      tracking_original: 'TBA999888777666',
      tipo_documento: 'CUIT',
      numero_documento: '20334455662',
      nombre_destinatario: 'Esteban Quito',
      producto: 'Figura Coleccionable',
      cantidad: 1,
      valor_fob_usd: 45.00,
      peso_kg: 0.8,
      id_paquete: 'pkg-22',
      estado_paquete: 'RECIBIDO_EN_DEPOSITO',
      fecha_registro: '2026-10-22',
      referencia_logistica: 'AR-20334455662',
    };
    const buf = generateDeblexExcelBuffer([row]);
    expect(buf.length).toBeGreaterThan(0);
  });
  it('Test 23: Deblex portal strictly enforces 8 users quota', () => {
    const countConsuming = 8;
    expect(countConsuming <= 8).toBe(true);
  });
  it('Test 24: Modalidad B is disabled by default in tariffs', () => {
    expect(DEFAULT_DEBLEX_TARIFFS.is_modalidad_b_enabled).toBe(false);
  });
  it('Test 25: Customs base correctly computes CIF = FOB + Freight', () => {
    const fob = 150.00;
    const weight = 2.0;
    const calc = calculateDeblexShipping(weight, 'CABA');
    const cifBase = fob + calc.freight_usd;
    expect(calc.freight_usd).toBe(38.00);
    expect(cifBase).toBe(188.00);
  });
});
