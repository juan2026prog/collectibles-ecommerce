/**
 * Unified Brand & License Governance Audit Engine
 * Evaluates vendor products for manufacturer compliance and license classifications.
 */

export type BrandClassification = 
  | 'VALID_BRAND'
  | 'MISSING_BRAND'
  | 'GENERIC_BRAND'
  | 'LICENSE_AS_BRAND'
  | 'UNKNOWN_BRAND'
  | 'INVALID_BRAND'
  | 'AMBIGUOUS_BRAND';

export type RecommendedAction =
  | 'KEEP'
  | 'AUTO_ASSIGN_BRAND'
  | 'AUTO_ASSIGN_LICENSE'
  | 'AUTO_ASSIGN_BRAND_AND_LICENSE'
  | 'REQUIRES_VENDOR_ATTENTION'
  | 'MANUAL_REVIEW'
  | 'ADMIN_EXCEPTION';

export interface BrandAuditResult {
  classification: BrandClassification;
  reason: string;
  suggestedBrandId: string | null;
  suggestedBrandName: string | null;
  confidenceScore: number; // 0.0 to 1.0
  isAutoFixable: boolean;
  needsReview: boolean;
  // Extended unified fields
  suggestedLicenseId?: string | null;
  suggestedLicenseName?: string | null;
  licenseConfidenceScore?: number;
  detectedLicenseId?: string | null;
  detectedLicenseName?: string | null;
  evidence?: string[];
  recommendedAction?: RecommendedAction;
}

export interface UnifiedAuditResult {
  classification: BrandClassification;
  reason: string;
  suggestedBrandId: string | null;
  suggestedBrandName: string | null;
  brandConfidenceScore: number;
  suggestedLicenseId: string | null;
  suggestedLicenseName: string | null;
  licenseConfidenceScore: number;
  detectedLicenseId: string | null;
  detectedLicenseName: string | null;
  evidence: string[];
  recommendedAction: RecommendedAction;
  isAutoFixEligible: boolean;
  needsReview: boolean;
}

export const GENERIC_BRAND_NAMES = [
  'genérica', 'generica', 'generic', 'sin marca', 'no brand', 'n/a', 'na', 'desconocido', 'ninguna', '—', '-', 'desconocida', 'marca blanca', 'unbranded'
];

export const KNOWN_LICENSES_LIST = [
  'marvel', 'disney', 'star wars', 'dc', 'dc comics', 'pokémon', 'pokemon',
  'sonic', 'minecraft', 'roblox', 'harry potter', 'dragon ball', 'naruto',
  'one piece', 'zelda', 'plantas vs zombies', 'batman', 'spiderman', 'x-men',
  'bob esponja', 'stranger things', 'saint seiya', 'ghostbusters', 'transformers',
  'teenage mutant ninja turtles', 'tmnt', 'godzilla', 'mortal kombat', 'street fighter'
];

export const KNOWN_MANUFACTURERS_MAP: Record<string, string[]> = {
  'Hasbro': ['hasbro', 'kenner', 'marvel legends', 'star wars black series'],
  'Funko': ['funko', 'funko pop', 'pop!'],
  'Bandai': ['bandai', 'tamashii', 'tamashii nations', 'banpresto', 'sh figuarts', 's.h. figuarts', 'bandai spirits'],
  'Mattel': ['mattel', 'hot wheels', 'barbie'],
  'Takara Tomy': ['takara tomy', 'takaratomy', 'takara', 'tomy'],
  'Good Smile Company': ['good smile', 'gsc', 'goodsmile', 'nendoroid', 'good smile company'],
  'Kotobukiya': ['kotobukiya', 'koto', 'artfx'],
  'McFarlane Toys': ['mcfarlane', 'mcfarlane toys'],
  'NECA': ['neca'],
  'Super7': ['super7', 'ultimates', 'reaction'],
  'Iron Studios': ['iron studios'],
  'Hot Toys': ['hot toys'],
  'Mezco': ['mezco', 'mezco toyz'],
  'Jakks Pacific': ['jakks', 'jakks pacific'],
  'Jada Toys': ['jada', 'jada toys'],
  'PhatMojo': ['phatmojo'],
  'Spin Master': ['spin master'],
  'LEGO': ['lego']
};

/**
 * Checks word boundary match for keyword in text
 */
function containsKeyword(text: string, keyword: string): boolean {
  if (!text || !keyword) return false;
  const tLower = text.toLowerCase();
  const kLower = keyword.toLowerCase();
  const index = tLower.indexOf(kLower);
  if (index === -1) return false;

  // Check boundary before
  if (index > 0) {
    const charBefore = tLower.charAt(index - 1);
    if (/[a-z0-9]/i.test(charBefore)) return false;
  }

  // Check boundary after
  const indexAfter = index + kLower.length;
  if (indexAfter < tLower.length) {
    const charAfter = tLower.charAt(indexAfter);
    if (/[a-z0-9]/i.test(charAfter)) return false;
  }

  return true;
}

/**
 * Audit a single product with full Unified Brand + License Governance Rules
 */
export function auditProductUnified(
  product: {
    id?: string;
    title?: string;
    brand_id?: string | null;
    brand?: { id?: string; name?: string; brand_type?: string } | null;
    brand_name?: string | null;
    product_licenses?: Array<{ license_id?: string; license?: { id?: string; name?: string; slug?: string } }>;
    ml_attributes?: any;
    metadata?: any;
    manufacturer?: string | null;
    ml_brand?: string | null;
    is_brand_exception?: boolean;
  },
  dbBrands: Array<{ id: string; name: string; slug?: string; brand_type?: string; is_vendor_selectable?: boolean }> = [],
  dbLicenses: Array<{ id: string; name: string; slug?: string }> = [],
  brandAliases: Array<{ alias: string; canonical_brand_id: string }> = [],
  licenseAliases: Array<{ alias: string; canonical_license_id: string }> = []
): UnifiedAuditResult {
  const evidence: string[] = [];

  // Excepción manual explícita
  if (product.is_brand_exception) {
    evidence.push('ADMIN_EXCEPTION_FLAG');
    return {
      classification: 'VALID_BRAND',
      reason: 'Excepción de marca aprobada manualmente por Administrador.',
      suggestedBrandId: product.brand_id || null,
      suggestedBrandName: product.brand?.name || product.brand_name || null,
      brandConfidenceScore: 1.0,
      suggestedLicenseId: null,
      suggestedLicenseName: null,
      licenseConfidenceScore: 0,
      detectedLicenseId: null,
      detectedLicenseName: null,
      evidence,
      recommendedAction: 'ADMIN_EXCEPTION',
      isAutoFixEligible: false,
      needsReview: false
    };
  }

  const title = product.title || '';
  const currentBrandId = product.brand_id || product.brand?.id || null;
  const currentBrandName = product.brand?.name || product.brand_name || '';
  const currentBrandLower = currentBrandName.toLowerCase().trim();

  // Maps for efficient lookups
  const brandIdMap = new Map(dbBrands.map(b => [b.id, b]));
  const brandNameMap = new Map(dbBrands.map(b => [b.name.toLowerCase().trim(), b]));
  const licenseIdMap = new Map(dbLicenses.map(l => [l.id, l]));
  const licenseNameMap = new Map(dbLicenses.map(l => [l.name.toLowerCase().trim(), l]));
  const brandAliasMap = new Map(brandAliases.map(a => [a.alias.toLowerCase().trim(), a.canonical_brand_id]));
  const licenseAliasMap = new Map(licenseAliases.map(a => [a.alias.toLowerCase().trim(), a.canonical_license_id]));

  // Current associated license if any
  const currentLicenseObj = product.product_licenses?.[0]?.license;
  const currentLicenseId = currentLicenseObj?.id || null;
  const currentLicenseName = currentLicenseObj?.name || null;

  // ML metadata signals
  const mlBrand = (product.ml_brand || product.metadata?.ml_brand || '').trim();
  const mlMfr = (product.manufacturer || product.metadata?.manufacturer || product.metadata?.brand || '').trim();

  // Initial State
  let classification: BrandClassification = 'VALID_BRAND';
  let reason = 'Marca/Fabricante válida y aprobada.';
  let suggestedBrandId: string | null = null;
  let suggestedBrandName: string | null = null;
  let brandConfidenceScore = 0.95;

  let detectedLicenseId: string | null = currentLicenseId;
  let detectedLicenseName: string | null = currentLicenseName;
  let suggestedLicenseId: string | null = null;
  let suggestedLicenseName: string | null = null;
  let licenseConfidenceScore = 0;

  let recommendedAction: RecommendedAction = 'KEEP';

  // ── Step 1: Detect License Signal ──
  // Check if current brand IS a license (e.g. Marvel, Disney, Star Wars)
  let brandIsLicense = false;
  let matchedLicense = licenseNameMap.get(currentBrandLower);

  if (!matchedLicense && licenseAliasMap.has(currentBrandLower)) {
    const canonicalLicId = licenseAliasMap.get(currentBrandLower);
    matchedLicense = licenseIdMap.get(canonicalLicId!);
    if (matchedLicense) evidence.push('LICENSE_ALIAS_MATCH');
  }

  if (!matchedLicense && KNOWN_LICENSES_LIST.includes(currentBrandLower)) {
    matchedLicense = dbLicenses.find(l => l.name.toLowerCase().trim() === currentBrandLower);
  }

  if (matchedLicense) {
    brandIsLicense = true;
    detectedLicenseId = matchedLicense.id;
    detectedLicenseName = matchedLicense.name;
    suggestedLicenseId = matchedLicense.id;
    suggestedLicenseName = matchedLicense.name;
    licenseConfidenceScore = 0.95;
    evidence.push(`CURRENT_BRAND_IS_LICENSE:${matchedLicense.name}`);
  } else {
    // Search title or ML metadata for known license if not currently attached
    for (const lic of dbLicenses) {
      if (containsKeyword(title, lic.name) || (mlBrand && containsKeyword(mlBrand, lic.name))) {
        suggestedLicenseId = lic.id;
        suggestedLicenseName = lic.name;
        licenseConfidenceScore = 0.90;
        evidence.push(`TITLE_LICENSE_MATCH:${lic.name}`);
        break;
      }
    }
  }

  // ── Step 2: Classify Current Brand ──
  if (!currentBrandId || !currentBrandName) {
    classification = 'MISSING_BRAND';
    reason = 'El producto no posee marca asignada (brand_id es NULL).';
    brandConfidenceScore = 0.0;
  } else if (GENERIC_BRAND_NAMES.includes(currentBrandLower)) {
    classification = 'GENERIC_BRAND';
    reason = `El producto utiliza una marca genérica no permitida a vendedores ("${currentBrandName}").`;
    brandConfidenceScore = 0.0;
    evidence.push('GENERIC_BRAND_DETECTED');
  } else if (brandIsLicense) {
    classification = 'LICENSE_AS_BRAND';
    reason = `La marca actual ("${currentBrandName}") es una Licencia/Franquicia y no el Fabricante del producto.`;
    brandConfidenceScore = 0.40;
  }

  // ── Step 3: Search for Canonical Manufacturer / Real Brand ──
  let detectedMfrBrand: { id: string; name: string } | null = null;
  let structuredSignalsCount = 0;

  // Signal A: Exact Brand Alias in DB
  if (currentBrandName && brandAliasMap.has(currentBrandLower)) {
    const canonicalId = brandAliasMap.get(currentBrandLower);
    const b = brandIdMap.get(canonicalId!);
    if (b) {
      detectedMfrBrand = b;
      structuredSignalsCount += 2; // Strong alias signal
      evidence.push(`BRAND_ALIAS_EXACT_MATCH:${b.name}`);
    }
  }

  // Signal B: ML Manufacturer / Attributes
  if (!detectedMfrBrand && mlMfr) {
    const mlMfrLower = mlMfr.toLowerCase().trim();
    if (brandAliasMap.has(mlMfrLower)) {
      const b = brandIdMap.get(brandAliasMap.get(mlMfrLower)!);
      if (b) {
        detectedMfrBrand = b;
        structuredSignalsCount += 2;
        evidence.push(`ML_MANUFACTURER_ALIAS_MATCH:${b.name}`);
      }
    } else if (brandNameMap.has(mlMfrLower)) {
      detectedMfrBrand = brandNameMap.get(mlMfrLower)!;
      structuredSignalsCount += 2;
      evidence.push(`ML_MANUFACTURER_STRUCTURAL_MATCH:${detectedMfrBrand.name}`);
    }
  }

  // Signal C: Title Keyword Match against Manufacturer Map
  if (!detectedMfrBrand) {
    for (const [mfrName, synonyms] of Object.entries(KNOWN_MANUFACTURERS_MAP)) {
      const matchedInTitle = synonyms.some(syn => containsKeyword(title, syn));
      const matchedInMl = (mlBrand && synonyms.some(syn => containsKeyword(mlBrand, syn))) ||
                          (mlMfr && synonyms.some(syn => containsKeyword(mlMfr, syn)));

      if (matchedInTitle || matchedInMl) {
        const dbMatch = brandNameMap.get(mfrName.toLowerCase()) ||
                        dbBrands.find(b => synonyms.some(syn => b.name.toLowerCase().includes(syn)));
        if (dbMatch) {
          detectedMfrBrand = dbMatch;
          if (matchedInTitle) {
            structuredSignalsCount += 1;
            evidence.push(`TITLE_MANUFACTURER_MATCH:${dbMatch.name}`);
          }
          if (matchedInMl) {
            structuredSignalsCount += 1;
            evidence.push(`ML_MANUFACTURER_KEYWORD_MATCH:${dbMatch.name}`);
          }
          break;
        }
      }
    }
  }

  // ── Step 4: Evaluate Suggestions & Actions ──
  if (detectedMfrBrand) {
    if (classification === 'MISSING_BRAND' || classification === 'GENERIC_BRAND' || classification === 'LICENSE_AS_BRAND') {
      suggestedBrandId = detectedMfrBrand.id;
      suggestedBrandName = detectedMfrBrand.name;

      if (structuredSignalsCount >= 2) {
        brandConfidenceScore = 0.95;
      } else {
        brandConfidenceScore = 0.88;
      }

      reason += ` | Fabricante sugerido: "${detectedMfrBrand.name}".`;
    } else if (currentBrandLower !== detectedMfrBrand.name.toLowerCase().trim()) {
      // Check if current is alias of detected
      const synonyms = KNOWN_MANUFACTURERS_MAP[detectedMfrBrand.name] || [];
      const isSynonym = synonyms.some(s => s.toLowerCase() === currentBrandLower);

      if (!isSynonym) {
        classification = 'AMBIGUOUS_BRAND';
        reason = `Inconsistencia: La marca asignada es "${currentBrandName}", pero el título/metadata sugiere "${detectedMfrBrand.name}".`;
        suggestedBrandId = detectedMfrBrand.id;
        suggestedBrandName = detectedMfrBrand.name;
        brandConfidenceScore = 0.75;
        evidence.push('TITLE_BRAND_CONTRADICTION');
      }
    }
  }

  // Check Unknown Brand ID
  if (currentBrandId && !brandIdMap.has(currentBrandId) && classification === 'VALID_BRAND') {
    classification = 'UNKNOWN_BRAND';
    reason = `El ID de marca asignado (${currentBrandId}) no existe en la base de marcas oficiales.`;
    brandConfidenceScore = 0.10;
  }

  // ── Step 5: Determine Final Recommended Action ──
  const brandNeedsFix = classification !== 'VALID_BRAND' && suggestedBrandId !== null;
  const licenseNeedsFix = suggestedLicenseId !== null && suggestedLicenseId !== currentLicenseId;

  // Strict Rule for Auto-Fix:
  // Must have brandConfidenceScore >= 0.95, structuredSignalsCount >= 2, and classification NOT ambiguous/unknown
  const isAutoFixEligible = brandConfidenceScore >= 0.95 &&
    structuredSignalsCount >= 2 &&
    classification !== 'AMBIGUOUS_BRAND' &&
    classification !== 'UNKNOWN_BRAND' &&
    classification !== 'VALID_BRAND';

  if (classification === 'VALID_BRAND') {
    if (licenseNeedsFix) {
      recommendedAction = 'AUTO_ASSIGN_LICENSE';
    } else {
      recommendedAction = 'KEEP';
    }
  } else if (brandNeedsFix && licenseNeedsFix) {
    recommendedAction = isAutoFixEligible ? 'AUTO_ASSIGN_BRAND_AND_LICENSE' : 'MANUAL_REVIEW';
  } else if (brandNeedsFix) {
    recommendedAction = isAutoFixEligible ? 'AUTO_ASSIGN_BRAND' : 'MANUAL_REVIEW';
  } else if (classification === 'LICENSE_AS_BRAND' && !suggestedBrandId) {
    // License detected, but NO manufacturer found -> MANUAL_REVIEW, NEVER invent manufacturer
    recommendedAction = 'MANUAL_REVIEW';
    reason += ' | No se detectó evidencia confiable del fabricante real. Se requiere revisión manual.';
  } else if (classification === 'GENERIC_BRAND' || classification === 'MISSING_BRAND') {
    recommendedAction = 'REQUIRES_VENDOR_ATTENTION';
  } else {
    recommendedAction = 'MANUAL_REVIEW';
  }

  const needsReview = classification !== 'VALID_BRAND' || licenseNeedsFix;

  return {
    classification,
    reason,
    suggestedBrandId,
    suggestedBrandName,
    brandConfidenceScore,
    suggestedLicenseId,
    suggestedLicenseName,
    licenseConfidenceScore,
    detectedLicenseId,
    detectedLicenseName,
    evidence,
    recommendedAction,
    isAutoFixEligible,
    needsReview
  };
}

/**
 * Backwards compatibility wrapper for auditProductBrand
 */
export function auditProductBrand(
  product: any,
  dbBrands: Array<{ id: string; name: string; slug?: string }> = []
): BrandAuditResult {
  const result = auditProductUnified(product, dbBrands);
  return {
    classification: result.classification,
    reason: result.reason,
    suggestedBrandId: result.suggestedBrandId,
    suggestedBrandName: result.suggestedBrandName,
    confidenceScore: result.brandConfidenceScore,
    isAutoFixable: result.isAutoFixEligible,
    needsReview: result.needsReview,
    suggestedLicenseId: result.suggestedLicenseId,
    suggestedLicenseName: result.suggestedLicenseName,
    licenseConfidenceScore: result.licenseConfidenceScore,
    detectedLicenseId: result.detectedLicenseId,
    detectedLicenseName: result.detectedLicenseName,
    evidence: result.evidence,
    recommendedAction: result.recommendedAction
  };
}
