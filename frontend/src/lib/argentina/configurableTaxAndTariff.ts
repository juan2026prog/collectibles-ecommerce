// frontend/src/lib/argentina/configurableTaxAndTariff.ts
// Architecture preparation for the real Argentina (Deblex) international checkout.
// ZERO hardcoded fiscal percentages: all tariffs and tax rates must come from
// certified configuration (deblex_tariff_config + certified fiscal policy).

export type ArgentinaDeliveryZone = 'CABA' | 'AMBA' | 'INTERIOR';

export interface DeblexTariffSnapshot {
  versionLabel: string;
  internationalFreightUsdPerKg: number;
  logisticPackCabaUsd: number;
  logisticPackAmbaUsd: number;
  logisticPackInteriorUsd: number;
  maxFobModalidadA: number;
  maxWeightModalidadAKg: number;
  maxUnitsPerSpeciesModalidadA: number;
  maxOperationsPerYearModalidadA: number;
}

export interface ConfigurableArgentinaTaxPolicy {
  /** Must be explicitly true only after legal/accounting certification with ARCA & Deblex */
  taxRegimeCertified: boolean;
  /** Who collects/remits import VAT/duties: platform at checkout, courier upon clearance, or buyer directly */
  taxCollector: 'UNASSIGNED' | 'PLATFORM_CHECKOUT' | 'COURIER_DEBLEX' | 'BUYER_ARCA';
  /** Configurable VAT rate percent (e.g. from DB config; never hardcoded in code) */
  vatRatePercent: number | null;
  /** Configurable import duty rate percent */
  dutyRatePercent: number | null;
  /** Legal/commercial reference for audit trail */
  regulatoryReference?: string;
}

export interface ArgentinaQuoteInput {
  fobUsd: number;
  weightKg: number;
  unitsInSpecies: number;
  zone: ArgentinaDeliveryZone;
  tariff: DeblexTariffSnapshot;
  taxPolicy: ConfigurableArgentinaTaxPolicy;
  mode: 'ESTIMATE_PREVIEW' | 'LIVE_CHECKOUT';
}

export interface ArgentinaQuoteResult {
  eligibleModalidadA: boolean;
  violations: string[];
  fobUsd: number;
  freightUsd: number;
  logisticPackUsd: number;
  estimatedTaxCollectedAtCheckoutUsd: number;
  estimatedTotalCheckoutUsd: number;
  taxCollector: ConfigurableArgentinaTaxPolicy['taxCollector'];
  taxRegimeCertified: boolean;
  tariffVersion: string;
}

export function calculateConfigurableArgentinaQuote(input: ArgentinaQuoteInput): ArgentinaQuoteResult {
  const { fobUsd, weightKg, unitsInSpecies, zone, tariff, taxPolicy, mode } = input;

  if (!Number.isFinite(fobUsd) || fobUsd <= 0) {
    throw new Error('AR_QUOTE_INVALID_FOB: El valor FOB debe ser mayor a cero.');
  }
  if (!Number.isFinite(weightKg) || weightKg <= 0) {
    throw new Error('AR_QUOTE_INVALID_WEIGHT: El peso debe ser mayor a cero.');
  }

  if (mode === 'LIVE_CHECKOUT') {
    if (!taxPolicy.taxRegimeCertified) {
      throw new Error('AR_TAX_REGIME_UNCERTIFIED: No se permite checkout productivo en Argentina sin certificación fiscal y aduanera aprobada.');
    }
    if (taxPolicy.taxCollector === 'UNASSIGNED') {
      throw new Error('AR_TAX_COLLECTOR_UNASSIGNED: Debe definirse el responsable de recaudación ante ARCA antes de operar.');
    }
    if (taxPolicy.taxCollector === 'PLATFORM_CHECKOUT' && (taxPolicy.vatRatePercent === null || !Number.isFinite(taxPolicy.vatRatePercent) || taxPolicy.vatRatePercent < 0)) {
      throw new Error('AR_VAT_RATE_MISSING: Falta configurar la alícuota fiscal aprobada para recaudación en checkout.');
    }
  }

  const violations: string[] = [];
  if (fobUsd > tariff.maxFobModalidadA) {
    violations.push(`FOB USD ${fobUsd.toFixed(2)} supera el límite configurado de USD ${tariff.maxFobModalidadA.toFixed(2)}.`);
  }
  if (weightKg > tariff.maxWeightModalidadAKg) {
    violations.push(`Peso ${weightKg}kg supera el límite configurado de ${tariff.maxWeightModalidadAKg}kg.`);
  }
  if (unitsInSpecies > tariff.maxUnitsPerSpeciesModalidadA) {
    violations.push(`${unitsInSpecies} unidades superan el máximo de ${tariff.maxUnitsPerSpeciesModalidadA} unidades por especie.`);
  }

  const freightUsd = Number((weightKg * tariff.internationalFreightUsdPerKg).toFixed(2));
  const logisticPackUsd = zone === 'CABA'
    ? tariff.logisticPackCabaUsd
    : zone === 'AMBA'
      ? tariff.logisticPackAmbaUsd
      : tariff.logisticPackInteriorUsd;

  let estimatedTaxCollectedAtCheckoutUsd = 0;
  if (taxPolicy.taxRegimeCertified && taxPolicy.taxCollector === 'PLATFORM_CHECKOUT') {
    const vatPct = Math.max(0, Number(taxPolicy.vatRatePercent || 0));
    const dutyPct = Math.max(0, Number(taxPolicy.dutyRatePercent || 0));
    const cifBase = fobUsd + freightUsd;
    estimatedTaxCollectedAtCheckoutUsd = Number(((cifBase * (vatPct + dutyPct)) / 100).toFixed(2));
  }

  const estimatedTotalCheckoutUsd = Number(
    (fobUsd + freightUsd + logisticPackUsd + estimatedTaxCollectedAtCheckoutUsd).toFixed(2)
  );

  return {
    eligibleModalidadA: violations.length === 0,
    violations,
    fobUsd: Number(fobUsd.toFixed(2)),
    freightUsd,
    logisticPackUsd: Number(logisticPackUsd.toFixed(2)),
    estimatedTaxCollectedAtCheckoutUsd,
    estimatedTotalCheckoutUsd,
    taxCollector: taxPolicy.taxCollector,
    taxRegimeCertified: taxPolicy.taxRegimeCertified,
    tariffVersion: tariff.versionLabel,
  };
}
