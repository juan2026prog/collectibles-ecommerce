// Centralized International Category Resolver for Collectibles.uy
// Defines explicit priorities, confidence scoring, negative exclusion rules, and resolution trace.

export interface ResolutionStep {
  step: string;
  matched: boolean;
  rule_id?: string;
  detail?: string;
}

export interface CategoryResolutionResult {
  category_id: string | null;
  subcategory_id: string | null;
  source: 'manual' | 'category_mapping' | 'category_mapping_leaf' | 'brand_mapping' | 'keyword_mapping' | 'unmapped';
  confidence: number;
  reason?: string;
  trace?: ResolutionStep[];
}

export interface CategoryMappingRecord {
  id?: string;
  amazon_category?: string | null;
  amazon_subcategory?: string | null;
  amazon_category_path?: string | null;
  collectibles_category_id: string;
  collectibles_subcategory_id?: string | null;
  confidence_score?: number;
  is_active?: boolean;
}

export interface BrandMappingRecord {
  id?: string;
  brand_name: string;
  collectibles_category_id: string;
  collectibles_subcategory_id?: string | null;
  confidence_score?: number;
  is_active?: boolean;
  allow_standalone?: boolean;
}

export interface KeywordMappingRuleRecord {
  id?: string;
  keyword: string;
  target_category_id?: string | null;
  target_subcategory_id?: string | null;
  priority?: number;
  is_active?: boolean;
  rule_type?: 'include' | 'exclude';
  applies_to?: 'title' | 'external_path' | 'brand' | 'all';
  blocks?: 'brand_mapping' | 'all';
}

export function parseCategoryPath(categories: string[] | string | null | undefined): {
  amazon_category: string | null;
  amazon_subcategory: string | null;
  amazon_category_path: string | null;
} {
  if (!categories) {
    return { amazon_category: null, amazon_subcategory: null, amazon_category_path: null };
  }

  if (Array.isArray(categories)) {
    const cleaned = categories.map(c => String(c).trim()).filter(Boolean);
    if (cleaned.length === 0) {
      return { amazon_category: null, amazon_subcategory: null, amazon_category_path: null };
    }
    return {
      amazon_category: cleaned[0] || null,
      amazon_subcategory: cleaned[cleaned.length - 1] || null,
      amazon_category_path: cleaned.join(' > ')
    };
  }

  if (typeof categories === 'string') {
    const parts = categories.split('>').map(p => p.trim()).filter(Boolean);
    if (parts.length === 0) {
      return { amazon_category: null, amazon_subcategory: null, amazon_category_path: null };
    }
    return {
      amazon_category: parts[0] || null,
      amazon_subcategory: parts[parts.length - 1] || null,
      amazon_category_path: parts.join(' > ')
    };
  }

  return { amazon_category: null, amazon_subcategory: null, amazon_category_path: null };
}

export function resolveInternationalCategory(params: {
  category_path?: string | string[] | null;
  brand?: string | null;
  title?: string | null;
  manual_category_id?: string | null;
  manual_subcategory_id?: string | null;
  category_mappings?: CategoryMappingRecord[] | null;
  brand_mappings?: BrandMappingRecord[] | null;
  keyword_rules?: KeywordMappingRuleRecord[] | null;
}): CategoryResolutionResult {
  const trace: ResolutionStep[] = [];

  // 1. Priority 1 (Score 100): Existing Manual Override
  if (params.manual_category_id) {
    trace.push({ step: '1. Manual Override', matched: true, detail: 'Categoría asignada manualmente por Admin' });
    return {
      category_id: params.manual_category_id,
      subcategory_id: params.manual_subcategory_id || null,
      source: 'manual',
      confidence: 100,
      reason: 'Override manual de administrador',
      trace
    };
  }
  trace.push({ step: '1. Manual Override', matched: false, detail: 'Sin override manual' });

  const { amazon_subcategory, amazon_category_path } = parseCategoryPath(params.category_path);

  // 2. Priority 2 (Score 90): Exact Path in amazon_category_mapping
  if (amazon_category_path && params.category_mappings && params.category_mappings.length > 0) {
    const normalizedPath = amazon_category_path.toLowerCase().trim();
    const match = params.category_mappings.find(m => 
      m.is_active !== false &&
      m.amazon_category_path && m.amazon_category_path.toLowerCase().trim() === normalizedPath
    );

    if (match && match.collectibles_category_id) {
      trace.push({ step: '2. Exact Category Path', matched: true, rule_id: match.id, detail: `Coincidencia exacta: ${match.amazon_category_path}` });
      return {
        category_id: match.collectibles_category_id,
        subcategory_id: match.collectibles_subcategory_id || null,
        source: 'category_mapping',
        confidence: match.confidence_score || 90,
        reason: `Mapeo exacto por path externo: "${amazon_category_path}"`,
        trace
      };
    }
  }
  trace.push({ step: '2. Exact Category Path', matched: false, detail: amazon_category_path ? `Sin mapeo exacto para: ${amazon_category_path}` : 'No tiene path externo' });

  // 3. Priority 3 (Score 80): Leaf Category in amazon_category_mapping
  if (amazon_subcategory && params.category_mappings && params.category_mappings.length > 0) {
    const normalizedLeaf = amazon_subcategory.toLowerCase().trim();
    const match = params.category_mappings.find(m => 
      m.is_active !== false &&
      m.amazon_subcategory && m.amazon_subcategory.toLowerCase().trim() === normalizedLeaf
    );

    if (match && match.collectibles_category_id) {
      trace.push({ step: '3. Leaf Subcategory', matched: true, rule_id: match.id, detail: `Coincidencia subcategoría hoja: ${match.amazon_subcategory}` });
      return {
        category_id: match.collectibles_category_id,
        subcategory_id: match.collectibles_subcategory_id || null,
        source: 'category_mapping_leaf',
        confidence: match.confidence_score || 80,
        reason: `Mapeo por subcategoría externa: "${amazon_subcategory}"`,
        trace
      };
    }
  }
  trace.push({ step: '3. Leaf Subcategory', matched: false, detail: amazon_subcategory ? `Sin mapeo para subcategoría: ${amazon_subcategory}` : 'No tiene subcategoría externa' });

  // 4. Evaluate Negative / Exclusion Rules (Priority >= 50, rule_type = 'exclude')
  let brandBlocked = false;
  let allBlocked = false;
  let exclusionReason = '';

  if (params.keyword_rules && params.keyword_rules.length > 0 && params.title) {
    const normalizedTitle = params.title.toLowerCase();
    const exclusionRules = params.keyword_rules
      .filter(r => r.is_active !== false && r.rule_type === 'exclude')
      .sort((a, b) => (b.priority ?? 100) - (a.priority ?? 100));

    for (const exRule of exclusionRules) {
      if (exRule.keyword && normalizedTitle.includes(exRule.keyword.toLowerCase().trim())) {
        if (exRule.blocks === 'all') {
          allBlocked = true;
          exclusionReason = `Regla de exclusión global: "${exRule.keyword}" (Bloquea toda asignación automática)`;
          trace.push({ step: '4. Negative Exclusions', matched: true, rule_id: exRule.id, detail: exclusionReason });
          break;
        } else {
          brandBlocked = true;
          exclusionReason = `Regla de exclusión de marca: "${exRule.keyword}" (Bloquea Brand Mapping)`;
          trace.push({ step: '4. Negative Exclusions', matched: true, rule_id: exRule.id, detail: exclusionReason });
        }
      }
    }
  }

  if (!brandBlocked && !allBlocked) {
    trace.push({ step: '4. Negative Exclusions', matched: false, detail: 'Ninguna regla de exclusión coincidió' });
  }

  if (allBlocked) {
    return {
      category_id: null,
      subcategory_id: null,
      source: 'unmapped',
      confidence: 0,
      reason: exclusionReason,
      trace
    };
  }

  // 5. Priority 4 (Score 70): Brand Mapping (Only if allow_standalone is true and NOT brandBlocked)
  if (!brandBlocked && params.brand && params.brand_mappings && params.brand_mappings.length > 0) {
    const normalizedBrand = params.brand.toLowerCase().trim();
    const match = params.brand_mappings.find(b => 
      b.is_active !== false &&
      b.allow_standalone !== false &&
      b.brand_name && b.brand_name.toLowerCase().trim() === normalizedBrand
    );

    if (match && match.collectibles_category_id) {
      trace.push({ step: '5. Brand Mapping', matched: true, rule_id: match.id, detail: `Marca segura (Standalone): ${match.brand_name}` });
      return {
        category_id: match.collectibles_category_id,
        subcategory_id: match.collectibles_subcategory_id || null,
        source: 'brand_mapping',
        confidence: match.confidence_score || 70,
        reason: `Mapeo por marca autónoma: "${params.brand}"`,
        trace
      };
    }
    trace.push({ step: '5. Brand Mapping', matched: false, detail: `Marca "${params.brand}" no encontrada o requiere contexto (allow_standalone = false)` });
  } else if (brandBlocked) {
    trace.push({ step: '5. Brand Mapping', matched: false, detail: `Brand Mapping bloqueado por exclusión: ${exclusionReason}` });
  } else {
    trace.push({ step: '5. Brand Mapping', matched: false, detail: 'Sin marca informada' });
  }

  // 6. Priority 5 (Score 50): Positive Keyword Rules on Title (rule_type !== 'exclude')
  if (params.title && params.keyword_rules && params.keyword_rules.length > 0) {
    const normalizedTitle = params.title.toLowerCase();
    
    // Sort rules by priority descending, then keyword length descending
    const sortedRules = [...params.keyword_rules]
      .filter(r => r.is_active !== false && r.rule_type !== 'exclude')
      .sort((a, b) => {
        const pA = a.priority ?? 1;
        const pB = b.priority ?? 1;
        if (pB !== pA) return pB - pA;
        return (b.keyword?.length ?? 0) - (a.keyword?.length ?? 0);
      });

    for (const rule of sortedRules) {
      if (rule.keyword && normalizedTitle.includes(rule.keyword.toLowerCase().trim())) {
        if (rule.target_category_id) {
          trace.push({ step: '6. Keyword Mapping', matched: true, rule_id: rule.id, detail: `Palabra clave detectada: "${rule.keyword}" (Prioridad: ${rule.priority ?? 10})` });
          return {
            category_id: rule.target_category_id,
            subcategory_id: rule.target_subcategory_id || null,
            source: 'keyword_mapping',
            confidence: 50,
            reason: `Mapeo por palabra clave en título: "${rule.keyword}"`,
            trace
          };
        }
      }
    }
  }
  trace.push({ step: '6. Keyword Mapping', matched: false, detail: 'Ninguna palabra clave coincidente en título' });

  // 7. Fallback (Score 0): Unmapped
  const finalReason = brandBlocked 
    ? `Brand mapping de "${params.brand || 'marca'}" bloqueado por regla negativa ("${exclusionReason}"). Sin categoría automática segura.` 
    : 'Sin señales suficientes (path, marca standalone o palabra clave). Requiere revisión humana.';

  return {
    category_id: null,
    subcategory_id: null,
    source: 'unmapped',
    confidence: 0,
    reason: finalReason,
    trace
  };
}
