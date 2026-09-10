import type { 
  CountryCode, 
  MultiCountryLandedCost, 
  MultiCountryLandedCostInput 
} from '../../types/sourcingLatam';
import { countryEngine } from './countryEngine';
import { currencyService } from './currencyService';

/**
 * Motor central de Landed Cost multi-país.
 * Para Uruguay (UY) preserva exactamente la lógica Urubox + Miami + franquicia ($200 / 4.4 lbs).
 * Para otros mercados LATAM parametriza impuestos aduaneros, courier e IVA según reglas vigentes.
 */
export function calculateMultiCountryLandedCost(input: MultiCountryLandedCostInput): MultiCountryLandedCost {
  const country = input.destinationCountry || 'UY';
  const rules = countryEngine.getImportRules(country);
  const config = countryEngine.getCountryConfig(country);

  const originPriceUsd = input.originPriceUsd || 0;
  const usaShippingUsd = input.usaShippingUsd ?? 0;
  const weightLbs = input.weightLbs ?? 1.5; // Default 1.5 lbs if unknown

  // 1. Domestic US Sales Tax (7% if shipped to Miami FL)
  const salesTaxUsd = Math.round(originPriceUsd * 0.07 * 100) / 100;

  // 2. Subtotal FOB Miami
  const subtotalFobUsd = originPriceUsd + usaShippingUsd + salesTaxUsd;

  // 3. Check Franchise Limits
  const isFranchiseEligible = subtotalFobUsd <= rules.max_franchise_value_usd && weightLbs <= rules.max_franchise_weight_lbs;
  const exceedsValueLimit = subtotalFobUsd > rules.max_franchise_value_usd;
  const exceedsWeightLimit = weightLbs > rules.max_franchise_weight_lbs;

  // 4. International Logistics & Courier Calculation
  let internationalShippingUsd = 0;
  let courierFeeUsd = rules.customs_handling_fee_usd;

  if (country === 'UY') {
    // Urubox rate: ~$16/kg -> ~$7.26/lb
    const baseRatePerLb = 7.26;
    internationalShippingUsd = Math.max(10.0, Math.round(weightLbs * baseRatePerLb * 100) / 100);
    courierFeeUsd = 12.00; // Base Urubox handling
  } else {
    // Standard LATAM express courier
    const baseRatePerLb = 8.50;
    internationalShippingUsd = Math.max(12.0, Math.round(weightLbs * baseRatePerLb * 100) / 100);
  }

  // 5. Customs Taxes & VAT
  let customsTaxUsd = 0;
  let vatTaxUsd = 0;
  const calculationNotes: string[] = [];

  if (isFranchiseEligible) {
    calculationNotes.push(`Bajo régimen de franquicia ${country} (Exento de aranceles de importación)`);
  } else {
    if (exceedsValueLimit) {
      calculationNotes.push(`Supera límite de franquicia (${rules.max_franchise_value_usd} USD)`);
    }
    if (exceedsWeightLimit) {
      calculationNotes.push(`Supera límite de peso (${rules.max_franchise_weight_lbs} lbs)`);
    }

    // Apply Standard Import Tariff & VAT
    customsTaxUsd = Math.round(subtotalFobUsd * (rules.standard_import_tax_percent / 100) * 100) / 100;
    vatTaxUsd = Math.round((subtotalFobUsd + customsTaxUsd) * (rules.vat_tax_percent / 100) * 100) / 100;
    calculationNotes.push(`Arancel de importación (${rules.standard_import_tax_percent}%): $${customsTaxUsd} USD`);
    if (rules.vat_tax_percent > 0) {
      calculationNotes.push(`IVA aduanero (${rules.vat_tax_percent}%): $${vatTaxUsd} USD`);
    }
  }

  // 6. Total Landed Cost in USD
  const totalLandedCostUsd = Math.round(
    (subtotalFobUsd + internationalShippingUsd + courierFeeUsd + customsTaxUsd + vatTaxUsd) * 100
  ) / 100;

  // 7. Local Currency Conversion
  const { amountLocal, status: fxStatus } = currencyService.convertUsdToLocal(totalLandedCostUsd, config.currency);

  // 8. Confidence Score (UY is 95% high confidence, others reflect data completeness)
  let calculationConfidence = 95;
  if (country !== 'UY') {
    calculationConfidence = config.enabled ? 75 : 50;
  }
  if (fxStatus !== 'ACTUALIZADO') {
    calculationConfidence -= 15;
  }

  return {
    destination_country: country,
    origin_price_usd: originPriceUsd,
    usa_shipping_usd: usaShippingUsd,
    sales_tax_usd: salesTaxUsd,
    international_shipping_usd: internationalShippingUsd,
    customs_tax_usd: customsTaxUsd,
    vat_tax_usd: vatTaxUsd,
    courier_fee_usd: courierFeeUsd,
    total_landed_cost_usd: totalLandedCostUsd,
    currency: config.currency,
    converted_landed_cost_local: amountLocal,
    calculation_confidence: Math.max(0, calculationConfidence),
    is_franchise_eligible: isFranchiseEligible,
    exceeds_weight_limit: exceedsWeightLimit,
    exceeds_value_limit: exceedsValueLimit,
    calculation_notes: calculationNotes,
  };
}
