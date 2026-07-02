export const MANUFACTURERS_DICT = [
  { id: 'takaratomy', name: 'Takara Tomy', synonyms: ['takara tomy', 'takaratomy', 'takara-tomy', 'takara', 'tomy'] },
  { id: 'banpresto', name: 'Banpresto', synonyms: ['banpresto', 'bp', 'bandai banpresto'] },
  { id: 'funko', name: 'Funko', synonyms: ['funko', 'pop', 'funko pop', 'funko llc'] },
  { id: 'good smile', name: 'Good Smile', synonyms: ['good smile', 'gsc', 'goodsmile', 'good smile company'] },
  { id: 'kotobukiya', name: 'Kotobukiya', synonyms: ['kotobukiya', 'koto', 'artfx'] },
  { id: 'super7', name: 'Super7', synonyms: ['super7', 'reaction', 'ultimates'] },
  { id: 'bandai', name: 'Bandai', synonyms: ['bandai', 'tamashii', 'tamashii nations', 'sh figuarts', 's.h. figuarts'] },
  { id: 'hasbro', name: 'Hasbro', synonyms: ['hasbro', 'kenner'] },
  { id: 'mattel', name: 'Mattel', synonyms: ['mattel', 'hot wheels', 'barbie'] },
  { id: 'mcfarlane', name: 'McFarlane', synonyms: ['mcfarlane', 'mcfarlane toys'] },
  { id: 'neca', name: 'NECA', synonyms: ['neca'] },
  { id: 'iron studios', name: 'Iron Studios', synonyms: ['iron studios'] },
  { id: 'hot toys', name: 'Hot Toys', synonyms: ['hot toys'] },
  { id: 'mezco', name: 'Mezco', synonyms: ['mezco', 'mezco toyz'] },
  { id: 'loungefly', name: 'Loungefly', synonyms: ['loungefly'] },
  { id: 'funrise', name: 'Funrise', synonyms: ['funrise'] }
];

export const BRAND_ALIASES: Record<string, string[]> = {
  'takaratomy': ['takara tomy', 'takaratomy', 'takara-tomy', 'takara', 'tomy'],
  'takara tomy': ['takara tomy', 'takaratomy', 'takara-tomy', 'takara', 'tomy'],
  'bandai': ['bandai', 'bandai spirits', 'tamashii nations', 'tamashii', 'banpresto'],
  'bandai spirits': ['bandai', 'bandai spirits', 'tamashii nations', 'tamashii', 'banpresto'],
  'banpresto': ['banpresto', 'bandai', 'bandai spirits', 'tamashii nations', 'tamashii'],
  'hasbro': ['hasbro', 'kenner', 'marvel legends', 'star wars black series'],
  'funko': ['funko', 'funko pop', 'pop!', 'pop']
};

export function matchesSynonym(text: string, synonym: string): boolean {
  const textLower = text.toLowerCase();
  const synLower = synonym.toLowerCase();
  const index = textLower.indexOf(synLower);
  if (index === -1) return false;
  
  // Check start boundary
  if (index > 0) {
    const charBefore = textLower.charAt(index - 1);
    if (/[a-z0-9]/i.test(charBefore)) return false;
  }
  
  // Check end boundary
  const indexAfter = index + synLower.length;
  if (indexAfter < textLower.length) {
    const charAfter = textLower.charAt(indexAfter);
    if (/[a-z0-9]/i.test(charAfter)) return false;
  }
  
  return true;
}

export function checkBrandConsistency(
  assignedBrandName: string,
  detectedBrand: string,
  title: string,
  mlBrand: string,
  manufacturer: string
): { isConsistent: boolean; detectedBrandName: string } {
  const assLower = assignedBrandName.toLowerCase().trim();
  const titleLower = title.toLowerCase();

  // Strip spaces, hyphens, and other punctuation for loose comparison
  const cleanStr = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const assClean = cleanStr(assignedBrandName);

  // If a brand is explicitly detected from the title, it takes precedence.
  let detectedFromTitle = '';
  for (const mfr of MANUFACTURERS_DICT) {
    const matchedSynonym = mfr.synonyms.find(syn => matchesSynonym(title, syn));
    if (matchedSynonym) {
      detectedFromTitle = mfr.name;
      break;
    }
  }

  if (detectedFromTitle) {
    const detClean = cleanStr(detectedFromTitle);
    if (assClean !== detClean) {
      // Check if they are aliases
      let assAliases = BRAND_ALIASES[assLower] || BRAND_ALIASES[assClean] || [assLower];
      const isAliasMatch = assAliases.some(alias => cleanStr(alias) === detClean);
      if (!isAliasMatch) {
        return { isConsistent: false, detectedBrandName: detectedFromTitle };
      }
    }
  }

  // 1. Direct loose comparison
  if (
    (detectedBrand && assClean === cleanStr(detectedBrand)) ||
    (mlBrand && assClean === cleanStr(mlBrand)) ||
    (manufacturer && assClean === cleanStr(manufacturer))
  ) {
    return { isConsistent: true, detectedBrandName: detectedBrand || mlBrand || manufacturer };
  }

  // 2. Resolve aliases
  let aliases = BRAND_ALIASES[assLower] || BRAND_ALIASES[assClean];
  if (!aliases) {
    for (const [key, val] of Object.entries(BRAND_ALIASES)) {
      if (assLower.includes(key) || key.includes(assLower)) {
        aliases = val;
        break;
      }
    }
  }

  if (!aliases) {
    aliases = [assLower];
  }

  for (const alias of aliases) {
    // Special condition for Star Wars Black Series
    if (alias === 'star wars black series') {
      if (titleLower.includes('star wars black series') && titleLower.includes('hasbro')) {
        return { isConsistent: true, detectedBrandName: 'Hasbro' };
      }
      continue;
    }

    if (matchesSynonym(title, alias)) {
      return { isConsistent: true, detectedBrandName: assignedBrandName };
    }
    if (mlBrand && matchesSynonym(mlBrand, alias)) {
      return { isConsistent: true, detectedBrandName: assignedBrandName };
    }
    if (manufacturer && matchesSynonym(manufacturer, alias)) {
      return { isConsistent: true, detectedBrandName: assignedBrandName };
    }
  }

  return { isConsistent: false, detectedBrandName: detectedBrand || 'desconocida' };
}


export const LICENSES_LIST = [
  'saint seiya', 'batman', 'dc comics', 'marvel', 'iron fist', 'star wars', 'dragon ball', 'naruto', 'one piece', 'pokemon', 'lego', 'stranger things', 'zombies', 'zelda', 'ghostbusters', 'sonic', 'bob esponja'
];

export const COLLECTIONS_LIST = [
  'cosmo memoir', 'marvel legends', 'funko pop', 'figma', 'cloth myth', 'black series', 'retro collection'
];

export function detectBrandLicenceCollection(title: string = '', mlBrand: string = '', manufacturer: string = '') {
  const titleLower = title.toLowerCase();
  const mlBrandLower = (mlBrand || '').toLowerCase();
  const mfrLower = (manufacturer || '').toLowerCase();

  let detectedBrand = '';
  let detectedLicense = '';
  let detectedCollection = '';

  // 1. Detect Brand/Manufacturer
  for (const mfr of MANUFACTURERS_DICT) {
    const matchedSynonym = mfr.synonyms.find(syn => 
      matchesSynonym(title, syn) || 
      matchesSynonym(mlBrand || '', syn) || 
      matchesSynonym(manufacturer || '', syn)
    );
    if (matchedSynonym) {
      detectedBrand = mfr.name;
      break;
    }
  }

  if (!detectedBrand && mlBrand && mlBrand !== '—') {
    detectedBrand = mlBrand;
  }
  if (!detectedBrand && manufacturer && manufacturer !== '—') {
    detectedBrand = manufacturer;
  }

  // 2. Detect License
  for (const lic of LICENSES_LIST) {
    if (titleLower.includes(lic)) {
      detectedLicense = lic.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      break;
    }
  }

  // 3. Detect Collection
  for (const col of COLLECTIONS_LIST) {
    if (titleLower.includes(col)) {
      detectedCollection = col.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      break;
    }
  }

  return { detectedBrand, detectedLicense, detectedCollection };
}

export interface ValidatorResult {
  name: string;
  score: number;
  max: number;
  result: string;
  error: string;
}

export interface QualityEngineReport {
  qualityScore: number;
  catalogQualityScore: number;
  importQualityScore: number;
  result: 'Excelente' | 'Alta' | 'Media' | 'Baja' | 'Crítica';
  isBlocked: boolean;
  isPublicable: boolean;
  executionTimeMs: number;
  engineVersion: string;
  motives?: string[];
  capApplied?: '49%' | '69%' | '40%' | null;
  validators: {
    brand: ValidatorResult;
    category: ValidatorResult;
    rules: ValidatorResult;
    dictionary: ValidatorResult;
    consistency: ValidatorResult;
    similar: ValidatorResult;
    duplicate: ValidatorResult;
    // Import validators
    mlCategory: ValidatorResult;
    mlBrand: ValidatorResult;
    iaConfidence: ValidatorResult;
    metadata: ValidatorResult;
    vendor: ValidatorResult;
  };
}

export function runQualityEngineCheck(
  p: any,
  allProducts: any[] = [],
  mlMappings: any[] = [],
  localDuplicates: any[] = [],
  dictionaries: any[] = [],
  rules: any[] = []
): QualityEngineReport {
  const t0 = performance.now();

  const titleLower = (p.title || '').toLowerCase();
  const mlBrandLower = (p.ml_brand || '').toLowerCase();
  const mfrLower = (p.manufacturer || '').toLowerCase();
  const assignedBrandName = p.brand_name || '';
  const assignedBrandId = p.brand_id || '';
  const assignedCategoryId = p.category_id || '';

  // 1. Brand Validator (20 pts)
  let brandScore = 0;
  let brandResult = 'Incompleto';
  let brandError = '';
  
  const detection = detectBrandLicenceCollection(p.title || '', p.ml_brand || '', p.manufacturer || '');
  const detectedBrand = detection.detectedBrand;

  if (!assignedBrandId) {
    brandResult = 'Incompleto';
    brandError = 'Falta marca en Collectibles (No existen datos oficiales asignados)';
    brandScore = 0;
  } else {
    let brandInconsistent = false;
    const consistencyCheck = checkBrandConsistency(
      assignedBrandName,
      detectedBrand,
      p.title || '',
      p.ml_brand || '',
      p.manufacturer || ''
    );
    if (!consistencyCheck.isConsistent) {
      brandInconsistent = true;
    }
    if (LICENSES_LIST.includes(assignedBrandName.toLowerCase())) {
      brandInconsistent = true;
      brandError = `${assignedBrandName} es una Licencia, no un Fabricante`;
    }

    const assLower = assignedBrandName.toLowerCase().trim();
    if (brandInconsistent) {
      brandResult = 'Conflicto';
      brandScore = 0;
      if (assLower === 'hasbro' && (titleLower.includes('bandai') || titleLower.includes('banpresto'))) {
        brandError = 'El título contiene Bandai/Banpresto, pero la marca asignada es Hasbro.';
      } else if (!brandError) {
        brandError = `Conflicto: Marca asignada "${assignedBrandName}" difiere de marca detectada "${detectedBrand || 'desconocida'}"`;
      }
    } else {
      brandResult = 'Consistente';
      brandScore = 20;
    }
  }

  // 2. Category Validator (20 pts)
  let categoryScore = 0;
  let categoryResult = 'Incompleto';
  let categoryError = '';

  if (!assignedCategoryId) {
    categoryResult = 'Incompleto';
    categoryError = 'Falta categoría en Collectibles (No existen datos oficiales asignados)';
    categoryScore = 0;
  } else {
    categoryResult = 'Consistente';
    categoryScore = 20;
  }

  // 3. Rules Validator (15 pts)
  let rulesScore = 15;
  let rulesResult = 'Consistente';
  let rulesError = '';
  
  const conflictingRules = rules.filter(r => {
    const isScopeMatch = r.scope === 'global' || r.scope_target_id === p.vendor_id;
    if (!isScopeMatch) return false;
    
    let condMatch = false;
    const conds = Array.isArray(r.conditions) ? r.conditions : [{ field: r.condition_field, value: r.condition_value }];
    const firstCond = conds[0];
    if (!firstCond) return false;

    if (firstCond.field === 'title' && firstCond.value && titleLower.includes(firstCond.value.toLowerCase())) {
      condMatch = true;
    } else if (firstCond.field === 'ml_category_id' && p.ml_category === firstCond.value) {
      condMatch = true;
    }

    return condMatch && r.action_type === 'set_category' && assignedCategoryId && r.action_target_id !== assignedCategoryId;
  });

  if (conflictingRules.length > 0) {
    rulesResult = 'Conflicto';
    rulesScore = 0;
    rulesError = `Reglas contradictorias asignan otra categoría: ${conflictingRules.map(r => `Regla #${r.id}`).join(', ')}`;
  }

  // 4. Dictionary Validator (10 pts)
  let dictScore = 10;
  let dictResult = 'Consistente';
  let dictError = '';
  
  const matchingDicts = dictionaries.filter(dict => {
    const words = Array.isArray(dict.taxonomy_dictionary_words) ? dict.taxonomy_dictionary_words : [];
    return words.some((w: any) => titleLower.includes(w.word.toLowerCase()));
  });

  const mismatchedDicts = matchingDicts.filter(dict => dict.category_id && dict.category_id !== assignedCategoryId);
  if (mismatchedDicts.length > 0) {
    dictResult = 'Conflicto';
    dictScore = 0;
    dictError = `El título coincide con diccionario "${mismatchedDicts[0].name}" pero no tiene su categoría asociada`;
  }

  // 5. Consistencia Validator (15 pts)
  let consistencyScore = 15;
  let consistencyResult = 'Consistente';
  let consistencyError = '';

  const isFigCategory = titleLower.includes('figura') || titleLower.includes('figure') || titleLower.includes('sh figuarts') || titleLower.includes('statue') || titleLower.includes('estatua');
  const isPlushCategory = titleLower.includes('peluche') || titleLower.includes('plush') || titleLower.includes('stuffed');
  
  if (isFigCategory && isPlushCategory) {
    consistencyResult = 'Inconsistente';
    consistencyScore = 5;
    consistencyError = 'El título contiene tanto "figura" como "peluche", términos contradictorios';
  }

  // 6. Productos Similares Validator (10 pts)
  let similarScore = 10;
  let similarResult = 'Consistente';
  let similarError = '';

  const similarProducts = allProducts.filter(item => 
    item.id !== p.id &&
    item.status === 'published' &&
    item.brand_name === assignedBrandName &&
    (item.ml_category === p.ml_category || (item.title && p.title && item.title.split(' ')[0] === p.title.split(' ')[0]))
  );

  if (similarProducts.length > 0 && assignedCategoryId) {
    const sameCat = similarProducts.filter(item => item.category_id === assignedCategoryId);
    if (sameCat.length === 0) {
      similarResult = 'Inusual';
      similarScore = 5;
      similarError = `Productos similares de la misma marca tienen categorías distintas`;
    }
  }

  // 7. Duplicates Validator (10 pts)
  let duplicateScore = 10;
  let duplicateResult = 'Sin duplicados';
  let duplicateError = '';

  const activeDup = localDuplicates.find(d => 
    (d.product_id === p.id || d.related_product_id === p.id) && 
    d.status === 'confirmado'
  );

  if (activeDup) {
    duplicateResult = 'Duplicado';
    duplicateScore = 0;
    const relatedId = activeDup.product_id === p.id ? activeDup.related_product_id : activeDup.product_id;
    duplicateError = `Duplicado confirmado con producto relacionado: ${relatedId}`;
  } else {
    duplicateResult = 'Sin duplicados';
    duplicateScore = 10;
    duplicateError = '';
  }

  // A. Calculate Catalog Quality Score (0-100)
  const catalogQualityScore = brandScore + categoryScore + rulesScore + dictScore + consistencyScore + similarScore + duplicateScore;

  // Apply Caps to catalog score:
  let finalCatalogScore = catalogQualityScore;
  let capApplied: '49%' | '69%' | '40%' | null = null;
  if (!assignedBrandId && !assignedCategoryId) {
    finalCatalogScore = Math.min(finalCatalogScore, 40);
    capApplied = '40%';
  } else if (!assignedBrandId || !assignedCategoryId) {
    finalCatalogScore = Math.min(finalCatalogScore, 69);
    capApplied = '69%';
  } else if (brandResult === 'Conflicto' || rulesResult === 'Conflicto' || duplicateResult === 'Duplicado') {
    finalCatalogScore = Math.min(finalCatalogScore, 49);
    capApplied = '49%';
  }

  // Determine state based on catalog score
  let qualityResult: 'Excelente' | 'Alta' | 'Media' | 'Baja' | 'Crítica' = 'Crítica';
  if (finalCatalogScore >= 95) {
    qualityResult = 'Excelente';
  } else if (finalCatalogScore >= 85) {
    qualityResult = 'Alta';
  } else if (finalCatalogScore >= 70) {
    qualityResult = 'Media';
  } else if (finalCatalogScore >= 50) {
    qualityResult = 'Baja';
  } else {
    qualityResult = 'Crítica';
  }

  // Blocked state depends exclusively on catalog conflicts/duplication
  const isBlocked = finalCatalogScore < 50 || brandResult === 'Conflicto' || rulesResult === 'Conflicto' || duplicateResult === 'Duplicado';

  // B. Calculate Import Quality Score (0-100)
  const hasMlCategory = !!p.ml_category;
  const mlMap = mlMappings.find(m => m.ml_category_id === p.ml_category);
  let mlCategoryScore = hasMlCategory ? 20 : 0;
  let mlCategoryResult = hasMlCategory ? 'Detectada' : 'No detectada';
  let mlCategoryError = hasMlCategory ? '' : 'Falta categoría original de Mercado Libre';

  if (hasMlCategory && mlMap && mlMap.internal_category_id !== assignedCategoryId) {
    mlCategoryScore = 5;
    mlCategoryResult = 'Conflicto Mapeo';
    mlCategoryError = `Mapeo ML (${mlMap.ml_category_id}) no coincide con Categoría asignada`;
  }

  const hasMlBrand = !!(p.ml_brand && p.ml_brand !== '—');
  const mlBrandScore = hasMlBrand ? 20 : 0;
  
  const confidenceVal = typeof p.confidence === 'number' ? p.confidence : 40;
  const iaConfidenceScore = Math.round(confidenceVal * 0.25);
  
  const hasImportedMetadata = !!(p.metadata && typeof p.metadata === 'object' && Array.isArray(p.metadata.attributes) && p.metadata.attributes.length > 0);
  const metadataScore = hasImportedMetadata ? 20 : 0;
  
  const hasVendor = !!p.vendor_id;
  const vendorScore = hasVendor ? 15 : 0;
  
  const importQualityScore = mlCategoryScore + mlBrandScore + iaConfidenceScore + metadataScore + vendorScore;

  // Build motives list for audit / log
  const motives: string[] = [];
  if (!assignedBrandId) {
    motives.push('- Falta marca Collectibles');
  }
  if (!assignedCategoryId) {
    motives.push('- Falta categoría Collectibles');
  }
  if (!assignedBrandId || !assignedCategoryId) {
    if (detectedBrand) motives.push(`- Marca detectada ${detectedBrand}`);
    if (p.ml_brand && p.ml_brand !== '—') motives.push(`- Marca ML ${p.ml_brand}`);
    if (p.suggested_category_name) motives.push(`- Categoría sugerida ${p.suggested_category_name}`);
    motives.push('No existen datos oficiales asignados');
  } else {
    if (brandResult === 'Conflicto') motives.push(`- ${brandError}`);
    if (categoryResult === 'Conflicto') motives.push(`- ${categoryError}`);
    if (rulesResult === 'Conflicto') motives.push(`- ${rulesError}`);
    if (dictResult === 'Conflicto') motives.push(`- ${dictError}`);
    if (consistencyResult === 'Inconsistente') motives.push(`- ${consistencyError}`);
    if (similarResult === 'Inusual') motives.push(`- ${similarError}`);
    if (duplicateResult === 'Duplicado') motives.push(`- ${duplicateError}`);
  }

  const t1 = performance.now();
  const executionTimeMs = Math.round(t1 - t0);

  return {
    qualityScore: finalCatalogScore,
    catalogQualityScore: finalCatalogScore,
    importQualityScore,
    result: qualityResult,
    isBlocked,
    isPublicable: !!assignedBrandId && !!assignedCategoryId && finalCatalogScore >= 85 && !isBlocked,
    executionTimeMs,
    engineVersion: '2.0.0',
    motives,
    capApplied,
    validators: {
      brand: { name: 'Validador de Marca', score: brandScore, max: 20, result: brandResult, error: brandError },
      category: { name: 'Validador de Categoría', score: categoryScore, max: 20, result: categoryResult, error: categoryError },
      rules: { name: 'Validador de Reglas', score: rulesScore, max: 15, result: rulesResult, error: rulesError },
      dictionary: { name: 'Validador de Diccionario', score: dictScore, max: 10, result: dictResult, error: dictError },
      consistency: { name: 'Validador de Consistencia', score: consistencyScore, max: 15, result: consistencyResult, error: consistencyError },
      similar: { name: 'Validador de Productos Similares', score: similarScore, max: 10, result: similarResult, error: similarError },
      duplicate: { name: 'Validador de Duplicados', score: duplicateScore, max: 10, result: duplicateResult, error: duplicateError },
      // Import validators
      mlCategory: { name: 'Categoría ML', score: mlCategoryScore, max: 20, result: mlCategoryResult, error: mlCategoryError },
      mlBrand: { name: 'Marca ML', score: mlBrandScore, max: 20, result: hasMlBrand ? 'Detectada' : 'No detectada', error: hasMlBrand ? '' : 'Falta marca original de Mercado Libre' },
      iaConfidence: { name: 'Confianza IA', score: iaConfidenceScore, max: 25, result: `${confidenceVal}%`, error: confidenceVal < 70 ? 'Confianza menor al 70%' : '' },
      metadata: { name: 'Metadatos importados', score: metadataScore, max: 20, result: hasImportedMetadata ? 'Con atributos' : 'Sin atributos', error: hasImportedMetadata ? '' : 'No se importaron atributos técnicos' },
      vendor: { name: 'Proveedor asignado', score: vendorScore, max: 15, result: hasVendor ? 'Válido' : 'No asignado', error: hasVendor ? '' : 'Falta asociar proveedor de origen' }
    }
  };
}
