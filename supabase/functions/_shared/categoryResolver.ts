// Centralized International Category Resolver for Collectibles.uy
// Defines explicit priorities, confidence scoring, and mapping resolution.

export interface CategoryResolutionResult {
  category_id: string | null;
  subcategory_id: string | null;
  source: 'manual' | 'category_mapping' | 'category_mapping_leaf' | 'brand_mapping' | 'keyword_mapping' | 'unmapped';
  confidence: number;
}

export interface CategoryMappingRecord {
  id?: string;
  amazon_category?: string | null;
  amazon_subcategory?: string | null;
  amazon_category_path?: string | null;
  collectibles_category_id: string;
  collectibles_subcategory_id?: string | null;
  confidence_score?: number;
}

export interface BrandMappingRecord {
  id?: string;
  brand_name: string;
  collectibles_category_id: string;
  collectibles_subcategory_id?: string | null;
  confidence_score?: number;
}

export interface KeywordMappingRuleRecord {
  id?: string;
  keyword: string;
  target_category_id: string;
  target_subcategory_id?: string | null;
  priority?: number;
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
  // 1. Priority 1 (Score 100): Existing Manual Override
  if (params.manual_category_id) {
    return {
      category_id: params.manual_category_id,
      subcategory_id: params.manual_subcategory_id || null,
      source: 'manual',
      confidence: 100
    };
  }

  const { amazon_subcategory, amazon_category_path } = parseCategoryPath(params.category_path);

  // 2. Priority 2 (Score 90): Exact Path in amazon_category_mapping
  if (amazon_category_path && params.category_mappings && params.category_mappings.length > 0) {
    const normalizedPath = amazon_category_path.toLowerCase().trim();
    const match = params.category_mappings.find(m => 
      m.amazon_category_path && m.amazon_category_path.toLowerCase().trim() === normalizedPath
    );

    if (match && match.collectibles_category_id) {
      return {
        category_id: match.collectibles_category_id,
        subcategory_id: match.collectibles_subcategory_id || null,
        source: 'category_mapping',
        confidence: match.confidence_score || 90
      };
    }
  }

  // 3. Priority 3 (Score 80): Leaf Category in amazon_category_mapping
  if (amazon_subcategory && params.category_mappings && params.category_mappings.length > 0) {
    const normalizedLeaf = amazon_subcategory.toLowerCase().trim();
    const match = params.category_mappings.find(m => 
      m.amazon_subcategory && m.amazon_subcategory.toLowerCase().trim() === normalizedLeaf
    );

    if (match && match.collectibles_category_id) {
      return {
        category_id: match.collectibles_category_id,
        subcategory_id: match.collectibles_subcategory_id || null,
        source: 'category_mapping_leaf',
        confidence: match.confidence_score || 80
      };
    }
  }

  // 4. Priority 4 (Score 70): Brand Mapping
  if (params.brand && params.brand_mappings && params.brand_mappings.length > 0) {
    const normalizedBrand = params.brand.toLowerCase().trim();
    const match = params.brand_mappings.find(b => 
      b.brand_name && b.brand_name.toLowerCase().trim() === normalizedBrand
    );

    if (match && match.collectibles_category_id) {
      return {
        category_id: match.collectibles_category_id,
        subcategory_id: match.collectibles_subcategory_id || null,
        source: 'brand_mapping',
        confidence: match.confidence_score || 70
      };
    }
  }

  // 5. Priority 5 (Score 50): Keyword Rules on Title
  if (params.title && params.keyword_rules && params.keyword_rules.length > 0) {
    const normalizedTitle = params.title.toLowerCase();
    
    // Sort rules by priority descending, then keyword length descending
    const sortedRules = [...params.keyword_rules].sort((a, b) => {
      const pA = a.priority ?? 1;
      const pB = b.priority ?? 1;
      if (pB !== pA) return pB - pA;
      return (b.keyword?.length ?? 0) - (a.keyword?.length ?? 0);
    });

    for (const rule of sortedRules) {
      if (rule.keyword && normalizedTitle.includes(rule.keyword.toLowerCase().trim())) {
        if (rule.target_category_id) {
          return {
            category_id: rule.target_category_id,
            subcategory_id: rule.target_subcategory_id || null,
            source: 'keyword_mapping',
            confidence: 50
          };
        }
      }
    }
  }

  // 6. Fallback / Unmapped (Score 0)
  return {
    category_id: null,
    subcategory_id: null,
    source: 'unmapped',
    confidence: 0
  };
}
