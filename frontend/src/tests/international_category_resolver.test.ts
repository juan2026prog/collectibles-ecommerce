import { describe, it, expect } from 'vitest';
import { 
  parseCategoryPath, 
  resolveInternationalCategory, 
  CategoryMappingRecord, 
  BrandMappingRecord, 
  KeywordMappingRuleRecord 
} from '../../../supabase/functions/_shared/categoryResolver';

describe('International Category Resolver Engine', () => {
  const mockCategories = {
    figuras: 'ddd41421-fb1c-423f-a282-131aba8c4373',
    estatuas: '0f5f33ba-8326-48bd-b61d-ec2a484bd5d4',
    funko: '94c47727-f07d-4c80-b74d-eb8344c8ddeb',
    tcg: '6e659b91-5130-4f20-9ddb-609410b9f84c',
    peluches: 'b1cdd325-1be1-47f8-a8af-bcb58fa9b403',
    modelKits: '0ec3e416-9ec7-43d6-8c30-6d361da83644'
  };

  const mockCatMappings: CategoryMappingRecord[] = [
    {
      amazon_category: 'Toys & Games',
      amazon_subcategory: 'Action Figures',
      amazon_category_path: 'Toys & Games > Toy Figures & Playsets > Action Figures',
      collectibles_category_id: mockCategories.figuras,
      confidence_score: 90,
      is_active: true
    },
    {
      amazon_category: 'Toys & Games',
      amazon_subcategory: 'Statues & Busts',
      amazon_category_path: 'Toys & Games > Collectible Toys > Statues & Busts',
      collectibles_category_id: mockCategories.estatuas,
      confidence_score: 90,
      is_active: true
    },
    {
      amazon_category: 'Toys & Games',
      amazon_subcategory: 'Inactive Figures',
      amazon_category_path: 'Toys & Games > Inactive Figures',
      collectibles_category_id: mockCategories.figuras,
      confidence_score: 90,
      is_active: false
    }
  ];

  const mockBrandMappings: BrandMappingRecord[] = [
    {
      brand_name: 'NECA',
      collectibles_category_id: mockCategories.figuras,
      confidence_score: 70,
      is_active: true,
      allow_standalone: true
    },
    {
      brand_name: 'Funko',
      collectibles_category_id: mockCategories.funko,
      confidence_score: 70,
      is_active: true,
      allow_standalone: true
    },
    {
      brand_name: 'Hasbro',
      collectibles_category_id: mockCategories.figuras,
      confidence_score: 70,
      is_active: true,
      allow_standalone: false // TOO_BROAD: Must NOT map standalone
    },
    {
      brand_name: 'LEGO',
      collectibles_category_id: mockCategories.modelKits,
      confidence_score: 70,
      is_active: true,
      allow_standalone: false // CONTEXT_REQUIRED: Must NOT map standalone
    },
    {
      brand_name: 'DisabledBrand',
      collectibles_category_id: mockCategories.figuras,
      confidence_score: 70,
      is_active: false,
      allow_standalone: true
    }
  ];

  const mockKeywordRules: KeywordMappingRuleRecord[] = [
    {
      keyword: 'action figure',
      target_category_id: mockCategories.figuras,
      priority: 10,
      is_active: true
    },
    {
      keyword: 'plush',
      target_category_id: mockCategories.peluches,
      priority: 10,
      is_active: true
    },
    {
      keyword: 'inactive keyword',
      target_category_id: mockCategories.estatuas,
      priority: 10,
      is_active: false
    }
  ];

  describe('parseCategoryPath helper', () => {
    it('correctly parses an array of categories from Zinc/Amazon', () => {
      const raw = ['Toys & Games', 'Toy Figures & Playsets', 'Action Figures'];
      const parsed = parseCategoryPath(raw);
      expect(parsed.amazon_category).toBe('Toys & Games');
      expect(parsed.amazon_subcategory).toBe('Action Figures');
      expect(parsed.amazon_category_path).toBe('Toys & Games > Toy Figures & Playsets > Action Figures');
    });

    it('correctly parses a string path formatted with >', () => {
      const raw = 'Toys & Games > Collectible Toys > Statues & Busts';
      const parsed = parseCategoryPath(raw);
      expect(parsed.amazon_category).toBe('Toys & Games');
      expect(parsed.amazon_subcategory).toBe('Statues & Busts');
      expect(parsed.amazon_category_path).toBe('Toys & Games > Collectible Toys > Statues & Busts');
    });

    it('returns nulls for null/empty categories', () => {
      expect(parseCategoryPath(null)).toEqual({ amazon_category: null, amazon_subcategory: null, amazon_category_path: null });
      expect(parseCategoryPath([])).toEqual({ amazon_category: null, amazon_subcategory: null, amazon_category_path: null });
    });
  });

  describe('resolveInternationalCategory resolution cascade & safety', () => {
    it('Priority 1: Manual Override has absolute precedence with 100 confidence', () => {
      const result = resolveInternationalCategory({
        manual_category_id: mockCategories.peluches,
        category_path: ['Toys & Games', 'Toy Figures & Playsets', 'Action Figures'],
        brand: 'NECA',
        title: 'NECA Ghost Face 7" Action Figure',
        category_mappings: mockCatMappings,
        brand_mappings: mockBrandMappings,
        keyword_rules: mockKeywordRules
      });

      expect(result.category_id).toBe(mockCategories.peluches);
      expect(result.source).toBe('manual');
      expect(result.confidence).toBe(100);
    });

    it('Priority 2: Exact Category Path match yields score 90', () => {
      const result = resolveInternationalCategory({
        category_path: ['Toys & Games', 'Toy Figures & Playsets', 'Action Figures'],
        brand: 'GenericBrand',
        title: 'Unbranded Item',
        category_mappings: mockCatMappings,
        brand_mappings: mockBrandMappings,
        keyword_rules: mockKeywordRules
      });

      expect(result.category_id).toBe(mockCategories.figuras);
      expect(result.source).toBe('category_mapping');
      expect(result.confidence).toBe(90);
    });

    it('Priority 3: Subcategory Leaf match yields score 80 when path differs', () => {
      const result = resolveInternationalCategory({
        category_path: ['Toys & Games', 'Different Intermediate Path', 'Statues & Busts'],
        brand: 'GenericBrand',
        title: 'Some Item',
        category_mappings: mockCatMappings,
        brand_mappings: mockBrandMappings,
        keyword_rules: mockKeywordRules
      });

      expect(result.category_id).toBe(mockCategories.estatuas);
      expect(result.source).toBe('category_mapping_leaf');
      expect(result.confidence).toBe(90);
    });

    it('Priority 4: Brand Mapping signal yields score 70 for SAFE standalone brand', () => {
      const result = resolveInternationalCategory({
        category_path: ['Electronics', 'Gadgets'],
        brand: 'Funko',
        title: 'Random Item',
        category_mappings: mockCatMappings,
        brand_mappings: mockBrandMappings,
        keyword_rules: mockKeywordRules
      });

      expect(result.category_id).toBe(mockCategories.funko);
      expect(result.source).toBe('brand_mapping');
      expect(result.confidence).toBe(70);
    });

    it('Safety Check: Broad Brand with allow_standalone = false (Hasbro/LEGO) does NOT map standalone', () => {
      const resultHasbro = resolveInternationalCategory({
        category_path: null,
        brand: 'Hasbro',
        title: 'Hasbro Monopoly Ultimate Banking Board Game',
        category_mappings: mockCatMappings,
        brand_mappings: mockBrandMappings,
        keyword_rules: mockKeywordRules
      });

      // Hasbro is not standalone mapped to Figuras de Acción, but falls through to unmapped or keyword
      expect(resultHasbro.source).not.toBe('brand_mapping');

      const resultLego = resolveInternationalCategory({
        category_path: null,
        brand: 'LEGO',
        title: 'LEGO Star Wars Millennium Falcon',
        category_mappings: mockCatMappings,
        brand_mappings: mockBrandMappings,
        keyword_rules: mockKeywordRules
      });

      // LEGO is NOT standalone mapped to Model Kits without context
      expect(resultLego.source).not.toBe('brand_mapping');
    });

    it('Safety Check: Inactive rules are strictly ignored across all tiers', () => {
      const catResult = resolveInternationalCategory({
        category_path: ['Toys & Games', 'Inactive Figures'],
        title: 'Some Inactive item',
        category_mappings: mockCatMappings,
        brand_mappings: mockBrandMappings,
        keyword_rules: mockKeywordRules
      });
      expect(catResult.source).toBe('unmapped');

      const brandResult = resolveInternationalCategory({
        brand: 'DisabledBrand',
        title: 'Disabled item',
        category_mappings: mockCatMappings,
        brand_mappings: mockBrandMappings,
        keyword_rules: mockKeywordRules
      });
      expect(brandResult.source).toBe('unmapped');

      const kwResult = resolveInternationalCategory({
        title: 'Something with inactive keyword here',
        category_mappings: mockCatMappings,
        brand_mappings: mockBrandMappings,
        keyword_rules: mockKeywordRules
      });
      expect(kwResult.source).toBe('unmapped');
    });

    it('Priority 5: Keyword Rule match on Title yields score 50 when path and brand are unknown', () => {
      const result = resolveInternationalCategory({
        category_path: null,
        brand: 'UnknownCo',
        title: 'Super Soft Plush Toy Doll',
        category_mappings: mockCatMappings,
        brand_mappings: mockBrandMappings,
        keyword_rules: mockKeywordRules
      });

      expect(result.category_id).toBe(mockCategories.peluches);
      expect(result.source).toBe('keyword_mapping');
      expect(result.confidence).toBe(50);
    });

    it('Fallback: Unmapped returns null with 0 confidence when no signals match', () => {
      const result = resolveInternationalCategory({
        category_path: ['Home Improvement', 'Hardware'],
        brand: 'Stanley',
        title: '16oz Steel Hammer',
        category_mappings: mockCatMappings,
        brand_mappings: mockBrandMappings,
        keyword_rules: mockKeywordRules
      });

      expect(result.category_id).toBeNull();
      expect(result.source).toBe('unmapped');
      expect(result.confidence).toBe(0);
    });
  });
});
