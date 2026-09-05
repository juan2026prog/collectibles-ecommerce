import type { CustomsRule, CustomsEvaluationResult, CustomsRegimeType } from '../types';

export const DEFAULT_UY_CUSTOMS_RULE: CustomsRule = {
  country_code: 'UY',
  country_name: 'Uruguay',
  year: 2026,
  annual_quota_usd: 800.00,
  max_shipments_per_year: 3,
  max_weight_kg: 20.00,
  simplified_tax_rate: 0.60, // 60%
  min_simplified_tax_usd: 20.00,
  official_source_url: 'https://www.aduanas.gub.uy',
  status: 'ACTIVE',
  effective_from: '2026-01-01',
  notes: 'Ley UY 2026: 3 envíos anuales exentos de tributos hasta USD 800. Sin cálculo de peso volumétrico.'
};

export const DEFAULT_URUGUAY_2026_RULE = DEFAULT_UY_CUSTOMS_RULE;

export class CustomsEngine {
  private rule: CustomsRule;

  constructor(rule: CustomsRule = DEFAULT_UY_CUSTOMS_RULE) {
    this.rule = rule;
  }

  public evaluate({
    productPriceUsd,
    physicalWeightKg,
    usedShipments = 0,
    usedAmountUsd = 0,
    forceSimplified = false
  }: {
    productPriceUsd: number;
    physicalWeightKg: number;
    usedShipments?: number;
    usedAmountUsd?: number;
    forceSimplified?: boolean;
  }): CustomsEvaluationResult {
    // 1. Strict Physical Weight Evaluation
    if (physicalWeightKg > this.rule.max_weight_kg) {
      return {
        regime: 'GENERAL',
        taxUsd: 0,
        taxRate: 0,
        reason: `El peso físico (${physicalWeightKg} kg) excede el máximo de ${this.rule.max_weight_kg} kg para el régimen simplificado/franquicias. Requiere despacho aduanero general.`,
        remainingShipmentsAfter: Math.max(0, this.rule.max_shipments_per_year - usedShipments),
        remainingQuotaAfterUsd: Math.max(0, this.rule.annual_quota_usd - usedAmountUsd),
        isEligible: false,
        alternativeRegimes: [
          {
            regime: 'GENERAL',
            label: 'Régimen General con Despachante',
            description: 'Envío comercial o de gran porte. Requiere intervención de despachante de aduana.',
            estimatedTaxUsd: Number((productPriceUsd * 0.35).toFixed(2))
          }
        ]
      };
    }

    const shipmentsLeft = Math.max(0, this.rule.max_shipments_per_year - usedShipments);
    const quotaLeft = Math.max(0, this.rule.annual_quota_usd - usedAmountUsd);

    // 2. Can use Franchise?
    const fitsInFranchise = !forceSimplified && shipmentsLeft > 0 && productPriceUsd <= quotaLeft;

    if (fitsInFranchise) {
      return {
        regime: 'FRANQUICIA',
        taxUsd: 0,
        taxRate: 0,
        reason: `Aplica Franquicia Aduanera 2026 (0% tributos). Te quedan ${shipmentsLeft - 1} envíos y USD ${(quotaLeft - productPriceUsd).toFixed(2)} disponibles.`,
        remainingShipmentsAfter: shipmentsLeft - 1,
        remainingQuotaAfterUsd: Number((quotaLeft - productPriceUsd).toFixed(2)),
        isEligible: true,
        alternativeRegimes: [
          {
            regime: 'SIMPLIFICADO',
            label: 'Régimen Simplificado (60%)',
            description: 'Reserva tus franquicias para compras más caras pagando 60% de impuestos (mín. USD 20).',
            estimatedTaxUsd: Math.max(this.rule.min_simplified_tax_usd, Number((productPriceUsd * this.rule.simplified_tax_rate).toFixed(2)))
          }
        ]
      };
    }

    // 3. Alternative: Simplified Regime (60%, min USD 20) - NEVER BLOCKS USER
    const calculatedTax = Math.max(this.rule.min_simplified_tax_usd, productPriceUsd * this.rule.simplified_tax_rate);
    const roundedTax = Number(calculatedTax.toFixed(2));

    let reason = 'Régimen Simplificado de importación: 60% de aranceles (mínimo USD 20).';
    if (forceSimplified) {
      reason = 'Se aplicó Régimen Simplificado a solicitud del usuario.';
    } else if (shipmentsLeft <= 0) {
      reason = 'Agotaste los 3 cupos anuales de franquicia. Podés importar sin límite mediante Régimen Simplificado (60%).';
    } else if (productPriceUsd > quotaLeft) {
      reason = `El valor de USD ${productPriceUsd.toFixed(2)} excede tu cupo disponible de franquicia (USD ${quotaLeft.toFixed(2)}). Podés traerlo con Régimen Simplificado (60%).`;
    }

    return {
      regime: 'SIMPLIFICADO',
      taxUsd: roundedTax,
      taxRate: this.rule.simplified_tax_rate,
      reason,
      remainingShipmentsAfter: shipmentsLeft,
      remainingQuotaAfterUsd: quotaLeft,
      isEligible: true,
      alternativeRegimes: [
        {
          regime: 'PERMISO_ESPECIAL',
          label: 'Evaluación Especial / URSEC / DINACEA',
          description: 'Si el artículo contiene radiofrecuencia o componentes regulados, puede requerir trámite web previo.',
          estimatedTaxUsd: roundedTax
        }
      ]
    };
  }

  public getSummary({ usedShipments = 0, usedAmountUsd = 0 }: { usedShipments?: number; usedAmountUsd?: number }) {
    const remainingShipments = Math.max(0, this.rule.max_shipments_per_year - usedShipments);
    const remainingQuotaUsd = Math.max(0, this.rule.annual_quota_usd - usedAmountUsd);

    return {
      year: this.rule.year,
      maxShipments: this.rule.max_shipments_per_year,
      usedShipments,
      remainingShipments,
      annualQuotaUsd: this.rule.annual_quota_usd,
      usedAmountUsd,
      remainingQuotaUsd: Number(remainingQuotaUsd.toFixed(2)),
      hasAvailableFranchise: remainingShipments > 0 && remainingQuotaUsd > 0
    };
  }
}
