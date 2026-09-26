// supabase/functions/_shared/skypostal/skypostal-compliance-engine.ts

export type ComplianceStatus = 'ALLOWED' | 'RESTRICTED' | 'REGULATED' | 'PROHIBITED' | 'MANUAL_REVIEW';

export interface ProductComplianceInput {
  productId?: string;
  title: string;
  category?: string;
  logisticsClassification?: string;
  hsCode?: string;
  fobValueUsd: number;
  quantity: number;
  weightKg: number;
  hasBattery?: boolean;
  hasLiquid?: boolean;
  hasMagnet?: boolean;
  isUsed?: boolean;
  isFood?: boolean;
  isCosmetic?: boolean;
  isSupplement?: boolean;
  isFineJewelry?: boolean;
  isWeaponOrReplica?: boolean;
  isCounterfeitOrReplicaBrand?: boolean;
}

export interface ComplianceEvaluationResult {
  status: ComplianceStatus;
  countryCode: string;
  reason: string;
  matchedRule?: string;
  warnings: string[];
  requiredDocuments: string[];
  serviceCode: number;
  customsClassification: string;
  sourceReference: string;
  ruleVersion: string;
  specialTariffCategory?: 'CATEGORY_B' | 'CATEGORY_C' | 'STANDARD' | 'REGULATED';
}

/**
 * Authoritative SkyPostal Compliance Evaluation Engine
 */
export function evaluateProductCompliance(
  product: ProductComplianceInput,
  countryCode: string = 'CL'
): ComplianceEvaluationResult {
  const country = countryCode.toUpperCase().trim();
  const warnings: string[] = [];
  const requiredDocuments: string[] = [];
  const sourceRef = 'CR SkyPostal Restrictions by Country 2026';
  const ruleVer = '2026.1';

  // 1. Universal Prohibitions (Apply to all SkyPostal international destinations)
  if (product.isCounterfeitOrReplicaBrand) {
    return {
      status: 'PROHIBITED',
      countryCode: country,
      reason: 'Mercancía falsificada o réplicas de marcas prohibidas por aduanas internacionales.',
      matchedRule: 'UNIVERSAL_PROHIBITION_COUNTERFEIT',
      warnings: ['Shipment will be confiscated by customs'],
      requiredDocuments: [],
      serviceCode: 1,
      customsClassification: 'PROHIBITED_GOODS',
      sourceReference: sourceRef,
      ruleVersion: ruleVer
    };
  }

  if (product.isWeaponOrReplica) {
    return {
      status: 'PROHIBITED',
      countryCode: country,
      reason: 'Armas de fuego, municiones o réplicas bélicas prohibidas.',
      matchedRule: 'UNIVERSAL_PROHIBITION_WEAPONS',
      warnings: ['Prohibited by international air transport and customs regulations'],
      requiredDocuments: [],
      serviceCode: 1,
      customsClassification: 'PROHIBITED_GOODS',
      sourceReference: sourceRef,
      ruleVersion: ruleVer
    };
  }

  // 2. Country-Specific Rules

  // CHILE
  if (country === 'CL') {
    requiredDocuments.push('RUT_BENEFICIARIO');

    if (product.fobValueUsd > 3000) {
      return {
        status: 'PROHIBITED',
        countryCode: 'CL',
        reason: 'El valor FOB excede el límite máximo de importación por courier simplificado en Chile (US$ 3000).',
        matchedRule: 'CL_MAX_VALUE_EXCEEDED',
        warnings,
        requiredDocuments,
        serviceCode: 1,
        customsClassification: 'FORMAL_IMPORT_REQUIRED',
        sourceReference: sourceRef,
        ruleVersion: ruleVer
      };
    }

    if (product.isCosmetic || product.isSupplement) {
      return {
        status: 'PROHIBITED',
        countryCode: 'CL',
        reason: 'Medicamentos, cosméticos y suplementos dietéticos prohibidos por courier en Chile.',
        matchedRule: 'CL_PROHIBITED_COSMETICS_MEDS',
        warnings,
        requiredDocuments,
        serviceCode: 1,
        customsClassification: 'COSMETICS_MEDICINES',
        sourceReference: sourceRef,
        ruleVersion: ruleVer
      };
    }

    if (product.hasBattery) {
      warnings.push('Batería de litio: Debe cumplir con la normativa IATA PI967 (batería contenida en equipo).');
    }

    return {
      status: 'ALLOWED',
      countryCode: 'CL',
      reason: 'Producto coleccionable permitido bajo régimen Courier Standard Chile.',
      matchedRule: 'CL_COURIER_ALLOWED',
      warnings,
      requiredDocuments,
      serviceCode: 1,
      customsClassification: 'COLLECTIBLE_TOY',
      sourceReference: sourceRef,
      ruleVersion: ruleVer,
      specialTariffCategory: 'STANDARD'
    };
  }

  // PERU
  if (country === 'PE') {
    requiredDocuments.push('DNI_OR_RUC');

    if (product.fobValueUsd > 2000) {
      return {
        status: 'RESTRICTED',
        countryCode: 'PE',
        reason: 'Envíos FOB mayores a US$ 2000 requieren agente de aduanas en Perú.',
        matchedRule: 'PE_MAX_SIMPLIFIED_VALUE',
        warnings: ['Requiere despachador oficial de aduanas'],
        requiredDocuments,
        serviceCode: 1,
        customsClassification: 'FORMAL_DESPACHO',
        sourceReference: sourceRef,
        ruleVersion: ruleVer
      };
    }

    if (product.quantity > 10) {
      return {
        status: 'RESTRICTED',
        countryCode: 'PE',
        reason: 'Máximo 10 unidades de juguetes/figuras coleccionables por envío para personas naturales en Perú.',
        matchedRule: 'PE_MAX_TOYS_PER_SHIPMENT',
        warnings: ['Riesgo de presunción comercial por Aduana SUNAT'],
        requiredDocuments,
        serviceCode: 1,
        customsClassification: 'COMMERCIAL_QUANTITY_RISK',
        sourceReference: sourceRef,
        ruleVersion: ruleVer
      };
    }

    if (product.isSupplement) {
      return {
        status: 'PROHIBITED',
        countryCode: 'PE',
        reason: 'Suplementos nutricionales y vitaminas no permitidos para personas naturales por courier en Perú.',
        matchedRule: 'PE_PROHIBITED_SUPPLEMENTS',
        warnings,
        requiredDocuments,
        serviceCode: 1,
        customsClassification: 'SUPPLEMENTS_NOT_ALLOWED',
        sourceReference: sourceRef,
        ruleVersion: ruleVer
      };
    }

    const isDeMinimis = product.fobValueUsd <= 200;
    if (isDeMinimis) {
      warnings.push('Exento de impuestos y aranceles (De minimis <= US$ 200 FOB en Perú).');
    } else {
      warnings.push('Aplica Arancel 4% + IGV 16% + IPM 2% sobre base CIF.');
    }

    return {
      status: 'ALLOWED',
      countryCode: 'PE',
      reason: 'Producto permitido bajo régimen Courier Standard Perú.',
      matchedRule: 'PE_COURIER_ALLOWED',
      warnings,
      requiredDocuments,
      serviceCode: 1,
      customsClassification: 'COLLECTIBLE_TOY',
      sourceReference: sourceRef,
      ruleVersion: ruleVer,
      specialTariffCategory: 'STANDARD'
    };
  }

  // ECUADOR (Category B vs Category C)
  if (country === 'EC') {
    requiredDocuments.push('CEDULA_BENEFICIARIO');

    if (product.isFineJewelry) {
      return {
        status: 'PROHIBITED',
        countryCode: 'EC',
        reason: 'Joyería fina en metales preciosos prohibida en Ecuador por courier.',
        matchedRule: 'EC_PROHIBITED_FINE_JEWELRY',
        warnings,
        requiredDocuments,
        serviceCode: 4,
        customsClassification: 'FINE_JEWELRY',
        sourceReference: sourceRef,
        ruleVersion: ruleVer
      };
    }

    // Category B criteria: Weight <= 4.0 kg AND FOB <= $400 USD
    const isCatB = product.weightKg <= 4.0 && product.fobValueUsd <= 400.0;
    const tariffCat = isCatB ? 'CATEGORY_B' : 'CATEGORY_C';

    if (isCatB) {
      warnings.push('Califica como Categoría B (4x4): Peso <= 4kg y FOB <= $400 USD.');
    } else {
      warnings.push('Califica como Categoría C: Aplica arancel 30% CIF + FODINFA 0.5% + IVA 15% y tasa aduanera $5.00.');
    }

    return {
      status: 'ALLOWED',
      countryCode: 'EC',
      reason: `Producto permitido en Ecuador bajo ${isCatB ? 'Categoría B (Courier Simplificado 4x4)' : 'Categoría C'}.`,
      matchedRule: isCatB ? 'EC_CATEGORY_B_ALLOWED' : 'EC_CATEGORY_C_ALLOWED',
      warnings,
      requiredDocuments,
      serviceCode: 4,
      customsClassification: isCatB ? 'CATEGORY_B_4X4' : 'CATEGORY_C_GENERAL',
      sourceReference: sourceRef,
      ruleVersion: ruleVer,
      specialTariffCategory: tariffCat
    };
  }

  // MEXICO (Standard vs Regulated)
  if (country === 'MX') {
    requiredDocuments.push('RFC_OR_CURP', 'DESTINATARIO_EMAIL');

    const isRegulated = product.isCosmetic || product.isSupplement;
    const serviceCode = isRegulated ? 502 : 1;

    if (isRegulated) {
      warnings.push('Mercancía regulada: Requiere servicio MX-340-R (LRD) e impuesto 20% FOB.');
    } else {
      if (product.fobValueUsd <= 50) {
        warnings.push('De minimis <= $50 USD: Exento de aranceles e impuestos en México.');
      }
    }

    return {
      status: isRegulated ? 'REGULATED' : 'ALLOWED',
      countryCode: 'MX',
      reason: isRegulated
        ? 'Mercancía regulada (Cosméticos/Suplementos) en México.'
        : 'Coleccionable estándar permitido en México.',
      matchedRule: isRegulated ? 'MX_REGULATED_502' : 'MX_STANDARD_1',
      warnings,
      requiredDocuments,
      serviceCode,
      customsClassification: isRegulated ? 'REGULATED_COSMETIC_SUPPLEMENT' : 'STANDARD_COLLECTIBLE',
      sourceReference: sourceRef,
      ruleVersion: ruleVer,
      specialTariffCategory: isRegulated ? 'REGULATED' : 'STANDARD'
    };
  }

  // COLOMBIA & BRASIL
  if (country === 'BR') {
    requiredDocuments.push('CPF_OR_CNPJ');
    return {
      status: 'ALLOWED',
      countryCode: 'BR',
      reason: 'Coleccionable permitido en Brasil bajo régimen Courier Standard.',
      matchedRule: 'BR_COURIER_ALLOWED',
      warnings: ['Requiere CPF para despacho aduanero Receita Federal'],
      requiredDocuments,
      serviceCode: 1,
      customsClassification: 'COLLECTIBLE_TOY',
      sourceReference: sourceRef,
      ruleVersion: ruleVer,
      specialTariffCategory: 'STANDARD'
    };
  }

  if (country === 'CO') {
    requiredDocuments.push('CEDULA_CIUDADANIA');
    return {
      status: 'ALLOWED',
      countryCode: 'CO',
      reason: 'Coleccionable permitido en Colombia bajo régimen Courier Standard.',
      matchedRule: 'CO_COURIER_ALLOWED',
      warnings: product.fobValueUsd <= 200 ? ['Exento de aranceles (De minimis <= $200 USD)'] : [],
      requiredDocuments,
      serviceCode: 1,
      customsClassification: 'COLLECTIBLE_TOY',
      sourceReference: sourceRef,
      ruleVersion: ruleVer,
      specialTariffCategory: 'STANDARD'
    };
  }

  // Fallback: Fail closed to MANUAL_REVIEW for unconfigured destination
  return {
    status: 'MANUAL_REVIEW',
    countryCode: country,
    reason: `Mercado ${country} no cuenta con matriz de reglas aduaneras certificadas.`,
    matchedRule: 'UNCONFIGURED_COUNTRY',
    warnings: ['Requiere revisión manual antes de cotizar envío'],
    requiredDocuments: [],
    serviceCode: 1,
    customsClassification: 'UNKNOWN',
    sourceReference: sourceRef,
    ruleVersion: ruleVer
  };
}
