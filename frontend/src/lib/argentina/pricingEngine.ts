// frontend/src/lib/argentina/pricingEngine.ts
/**
 * Pricing & Logistics Calculation Engine for Collectibles Argentina + Deblex
 * 
 * Rules:
 * 1. International Freight = facturable_weight_kg * USD 19 (exact, not rounded up).
 * 2. Logistic Pack = Fixed by destination zone (CABA: USD 20, AMBA: USD 34, Interior: USD 43).
 *    Charged ONCE per shipment or consolidation, NEVER multiplied by item quantity or package count.
 * 3. Total logistics = freight_usd + single_logistic_pack_usd.
 * 
 * Verified tests:
 * - 0.5 kg CABA -> USD 29.50 (0.5 * 19 + 20)
 * - 1.0 kg AMBA -> USD 53.00 (1.0 * 19 + 34)
 * - 2.0 kg Interior -> USD 81.00 (2.0 * 19 + 43)
 * - 1.75 kg AMBA -> USD 67.25 (1.75 * 19 + 34)
 * - 5 packages consolidated -> SINGLE Logistic Pack.
 */

import { ArgentinaShipmentZone, DeblexTariffConfig, ConsolidatedQuoteResult } from './types';

export const DEFAULT_DEBLEX_TARIFFS: DeblexTariffConfig = {
  international_freight_usd_per_kg: 19.0,
  logistic_pack_caba_usd: 20.0,
  logistic_pack_amba_usd: 34.0,
  logistic_pack_interior_usd: 43.0,
  max_fob_modalidad_a: 400.0,
  max_weight_modalidad_a_kg: 50.0,
  max_units_per_species_modalidad_a: 3,
  max_operations_per_year_modalidad_a: 5,
};

export const AMBA_PARTIDOS = [
  'almirante brown', 'avellaneda', 'berazategui', 'esteban echeverria',
  'ezeiza', 'florencio varela', 'general san martin', 'hurlingham',
  'ituzaingo', 'jose c paz', 'la matanza', 'lanus', 'lomas de zamora',
  'malvinas argentinas', 'merlo', 'moreno', 'moron', 'quilmes',
  'san fernando', 'san isidro', 'san miguel', 'tigre', 'tres de febrero',
  'vicente lopez', 'escobar', 'general rodriguez', 'marcos paz',
  'pilar', 'san vicente', 'ensenada', 'la plata', 'berisso'
];

/**
 * Resolves Argentina logistics zone based on postal code, province, and city.
 */
export function resolveArgentinaZone(
  province: string = '',
  city: string = '',
  postalCode: string = ''
): ArgentinaShipmentZone {
  const normProv = (province || '').toLowerCase().trim();
  const normCity = (city || '').toLowerCase().trim();
  const cleanZip = (postalCode || '').replace(/\D/g, '');

  // Check CABA (CP 1000 - 1499 or province CABA)
  if (
    normProv.includes('ciudad aut') ||
    normProv === 'caba' ||
    normProv === 'capital federal' ||
    normCity.includes('caba') ||
    normCity.includes('capital federal') ||
    (cleanZip.length === 4 && parseInt(cleanZip, 10) >= 1000 && parseInt(cleanZip, 10) <= 1499)
  ) {
    return 'CABA';
  }

  // Check AMBA (Buenos Aires suburbs)
  const isBuenosAires = normProv.includes('buenos aires') || normProv === 'bsas' || normProv === 'gba';
  const isAmbaCity = AMBA_PARTIDOS.some(partido => normCity.includes(partido));
  const isAmbaZip = cleanZip.length === 4 && parseInt(cleanZip, 10) >= 1600 && parseInt(cleanZip, 10) <= 1900;

  if (isBuenosAires && (isAmbaCity || isAmbaZip)) {
    return 'AMBA';
  }

  // All other destinations default safely to Interior
  return 'INTERIOR';
}

/**
 * Calculates Deblex shipping cost for a given weight and zone.
 */
export function calculateDeblexShipping(
  weightKg: number,
  zone: ArgentinaShipmentZone,
  tariffs: DeblexTariffConfig = DEFAULT_DEBLEX_TARIFFS
): {
  freight_usd: number;
  logistic_pack_usd: number;
  total_logistics_usd: number;
  weight_kg: number;
  zone: ArgentinaShipmentZone;
} {
  const safeWeight = Math.max(0, Number(weightKg) || 0);
  const freight_usd = Number((safeWeight * tariffs.international_freight_usd_per_kg).toFixed(2));

  let logistic_pack_usd = tariffs.logistic_pack_interior_usd;
  if (zone === 'CABA') {
    logistic_pack_usd = tariffs.logistic_pack_caba_usd;
  } else if (zone === 'AMBA') {
    logistic_pack_usd = tariffs.logistic_pack_amba_usd;
  }

  const total_logistics_usd = Number((freight_usd + logistic_pack_usd).toFixed(2));

  return {
    freight_usd,
    logistic_pack_usd,
    total_logistics_usd,
    weight_kg: safeWeight,
    zone,
  };
}

/**
 * Evaluates consolidation rules and calculates net financial difference.
 * Rule: Single Logistic Pack applies. Previous logistics paid are subtracted
 * from the combined calculated logistics.
 */
export function evaluateConsolidation(
  packages: Array<{
    id: string;
    fob_usd: number;
    weight_kg: number;
    species_category?: string;
    units?: number;
    logistics_paid_usd?: number;
  }>,
  zone: ArgentinaShipmentZone,
  tariffs: DeblexTariffConfig = DEFAULT_DEBLEX_TARIFFS
): ConsolidatedQuoteResult {
  const errors: string[] = [];

  const fob_total_usd = packages.reduce((sum, p) => sum + (Number(p.fob_usd) || 0), 0);
  const total_weight_kg = packages.reduce((sum, p) => sum + (Number(p.weight_kg) || 0), 0);
  const previous_logistics_paid_usd = packages.reduce((sum, p) => sum + (Number(p.logistics_paid_usd) || 0), 0);

  // Modalidad A Checks:
  if (fob_total_usd > tariffs.max_fob_modalidad_a) {
    errors.push(
      `El valor FOB consolidado (USD ${fob_total_usd.toFixed(2)}) supera el límite de USD ${tariffs.max_fob_modalidad_a} de la Modalidad A.`
    );
  }

  if (total_weight_kg > tariffs.max_weight_modalidad_a_kg) {
    errors.push(
      `El peso consolidado (${total_weight_kg.toFixed(2)} kg) supera el límite operativo de ${tariffs.max_weight_modalidad_a_kg} kg.`
    );
  }

  // Species check: max 3 units of the same species
  const speciesCounts: Record<string, number> = {};
  for (const pkg of packages) {
    const key = (pkg.species_category || 'general').toLowerCase().trim();
    speciesCounts[key] = (speciesCounts[key] || 0) + (pkg.units || 1);
  }

  for (const [species, count] of Object.entries(speciesCounts)) {
    if (count > tariffs.max_units_per_species_modalidad_a) {
      errors.push(
        `Se superan las ${tariffs.max_units_per_species_modalidad_a} unidades de la misma especie (${species}: ${count} unidades).`
      );
    }
  }

  const shippingCalc = calculateDeblexShipping(total_weight_kg, zone, tariffs);
  const total_logistics_calculated_usd = shippingCalc.total_logistics_usd;
  const net_logistics_difference_usd = Number(
    (total_logistics_calculated_usd - previous_logistics_paid_usd).toFixed(2)
  );

  let status: ConsolidatedQuoteResult['status'] = 'ELIGIBLE';
  if (fob_total_usd > tariffs.max_fob_modalidad_a) {
    status = 'BLOCKED_FOB';
  } else if (errors.some(e => e.includes('especie'))) {
    status = 'BLOCKED_SPECIES';
  } else if (errors.length > 0) {
    status = 'REQUIRES_VALIDATION';
  }

  return {
    total_weight_kg: Number(total_weight_kg.toFixed(2)),
    fob_total_usd: Number(fob_total_usd.toFixed(2)),
    freight_usd: shippingCalc.freight_usd,
    zone,
    single_logistic_pack_usd: shippingCalc.logistic_pack_usd,
    total_logistics_calculated_usd,
    previous_logistics_paid_usd: Number(previous_logistics_paid_usd.toFixed(2)),
    net_logistics_difference_usd,
    status,
    errors,
  };
}
