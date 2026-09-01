import { describe, it, expect } from 'vitest';
import { 
  parseCategoryPath, 
  resolveInternationalCategory, 
  CategoryMappingRecord, 
  BrandMappingRecord, 
  KeywordMappingRuleRecord 
} from '../../../supabase/functions/_shared/categoryResolver';

describe('International Category Resolver Engine & Negative Rules', () => {
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
      brand_name: 'Super7',
      collectibles_category_id: mockCategories.figuras,
      confidence_score: 70,
      is_active: true,
      allow_standalone: true
    },
    {
      brand_name: 'Good Smile Company',
      collectibles_category_id: mockCategories.figuras,
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
      brand_name: 'Bandai',
      collectibles_category_id: mockCategories.figuras,
      confidence_score: 70,
      is_active: true,
      allow_standalone: false // CONTEXT_REQUIRED
    },
    {
      brand_name: 'LEGO',
      collectibles_category_id: mockCategories.modelKits,
      confidence_score: 70,
      is_active: true,
      allow_standalone: false // CONTEXT_REQUIRED
    }
  ];

  const mockKeywordRules: KeywordMappingRuleRecord[] = [
    // Negative exclusion rules
    {
      keyword: 'display stand',
      rule_type: 'exclude',
      blocks: 'brand_mapping',
      priority: 100,
      is_active: true
    },
    {
      keyword: 'figure stand',
      rule_type: 'exclude',
      blocks: 'brand_mapping',
      priority: 100,
      is_active: true
    },
    {
      keyword: 'protective case',
      rule_type: 'exclude',
      blocks: 'brand_mapping',
      priority: 100,
      is_active: true
    },
    // Positive include rules
    {
      keyword: 's.h.figuarts',
      target_category_id: mockCategories.figuras,
      rule_type: 'include',
      priority: 12,
      is_active: true
    },
    {
      keyword: 'gunpla',
      target_category_id: mockCategories.modelKits,
      rule_type: 'include',
      priority: 12,
      is_active: true
    },
    {
      keyword: 'marvel legends',
      target_category_id: mockCategories.figuras,
      rule_type: 'include',
      priority: 12,
      is_active: true
    },
    {
      keyword: 'action figure',
      target_category_id: mockCategories.figuras,
      rule_type: 'include',
      priority: 10,
      is_active: true
    },
    {
      keyword: 'battle figure',
      target_category_id: mockCategories.figuras,
      rule_type: 'include',
      priority: 10,
      is_active: true
    },
    {
      keyword: 'articulated figure',
      target_category_id: mockCategories.figuras,
      rule_type: 'include',
      priority: 10,
      is_active: true
    },
    {
      keyword: 'plush',
      target_category_id: mockCategories.peluches,
      rule_type: 'include',
      priority: 10,
      is_active: true
    },
    // Inactive rules
    {
      keyword: 'building kit',
      target_category_id: mockCategories.modelKits,
      rule_type: 'include',
      priority: 5,
      is_active: false // Deactivated: Building Sets != Model Kits
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
  });

  describe('Resolution Cascade & Negative Exclusions', () => {
    it('TEST 1: NECA Display Stand -> unmapped (negative rule blocks brand mapping)', () => {
      const result = resolveInternationalCategory({
        title: 'NECA Black Figure Display Stand - Set of 10',
        brand: 'NECA',
        category_path: null,
        category_mappings: mockCatMappings,
        brand_mappings: mockBrandMappings,
        keyword_rules: mockKeywordRules
      });

      expect(result.source).toBe('unmapped');
      expect(result.category_id).toBeNull();
      expect(result.confidence).toBe(0);
      expect(result.reason).toContain('bloqueado');
    });

    it('TEST 2: NECA Figure -> Figuras de Acción (70%) (unaffected by negative rule)', () => {
      const result = resolveInternationalCategory({
        title: 'NECA Ultimate Michael Myers 7" Scale Action Figure',
        brand: 'NECA',
        category_path: null,
        category_mappings: mockCatMappings,
        brand_mappings: mockBrandMappings,
        keyword_rules: mockKeywordRules
      });

      expect(result.source).toBe('brand_mapping');
      expect(result.category_id).toBe(mockCategories.figuras);
      expect(result.confidence).toBe(70);
    });

    it('TEST 3: LEGO Building Set -> unmapped (0%) (Tax Gap: not forced to Model Kits)', () => {
      const result = resolveInternationalCategory({
        title: 'LEGO Ideas Home Alone Building Kit',
        brand: 'LEGO',
        category_path: null,
        category_mappings: mockCatMappings,
        brand_mappings: mockBrandMappings,
        keyword_rules: mockKeywordRules
      });

      expect(result.source).toBe('unmapped');
      expect(result.category_id).toBeNull();
      expect(result.confidence).toBe(0);
    });

    it('TEST 4: Hasbro Marvel Legends -> Figuras de Acción (50%) (via contextual keyword)', () => {
      const result = resolveInternationalCategory({
        title: 'Hasbro Marvel Legends Wolverine 6-Inch Action Figure',
        brand: 'Hasbro',
        category_path: null,
        category_mappings: mockCatMappings,
        brand_mappings: mockBrandMappings,
        keyword_rules: mockKeywordRules
      });

      expect(result.source).toBe('keyword_mapping');
      expect(result.category_id).toBe(mockCategories.figuras);
      expect(result.confidence).toBe(50);
    });

    it('TEST 5: Hasbro Monopoly -> unmapped (0%) (Hasbro standalone disabled)', () => {
      const result = resolveInternationalCategory({
        title: 'Hasbro Monopoly Ultimate Banking Board Game',
        brand: 'Hasbro',
        category_path: null,
        category_mappings: mockCatMappings,
        brand_mappings: mockBrandMappings,
        keyword_rules: mockKeywordRules
      });

      expect(result.source).toBe('unmapped');
      expect(result.category_id).toBeNull();
      expect(result.confidence).toBe(0);
    });

    it('TEST 6: Bandai S.H.Figuarts -> Figuras de Acción (50%)', () => {
      const result = resolveInternationalCategory({
        title: 'Bandai Spirits S.H.Figuarts Super Saiyan Son Goku',
        brand: 'Bandai',
        category_path: null,
        category_mappings: mockCatMappings,
        brand_mappings: mockBrandMappings,
        keyword_rules: mockKeywordRules
      });

      expect(result.source).toBe('keyword_mapping');
      expect(result.category_id).toBe(mockCategories.figuras);
      expect(result.confidence).toBe(50);
    });

    it('TEST 7: Bandai Gunpla -> Model Kits (50%)', () => {
      const result = resolveInternationalCategory({
        title: 'Bandai Hobby Gunpla Mobile Suit Gundam RX-78-2 High Grade',
        brand: 'Bandai',
        category_path: null,
        category_mappings: mockCatMappings,
        brand_mappings: mockBrandMappings,
        keyword_rules: mockKeywordRules
      });

      expect(result.source).toBe('keyword_mapping');
      expect(result.category_id).toBe(mockCategories.modelKits);
      expect(result.confidence).toBe(50);
    });

    it('TEST 8: Pokemon Battle Figure -> Figuras de Acción (50%)', () => {
      const result = resolveInternationalCategory({
        title: 'Pokémon Battle Figure 6 Pack (Pikachu, Squirtle...)',
        brand: 'Pokémon',
        category_path: null,
        category_mappings: mockCatMappings,
        brand_mappings: mockBrandMappings,
        keyword_rules: mockKeywordRules
      });

      expect(result.source).toBe('keyword_mapping');
      expect(result.category_id).toBe(mockCategories.figuras);
      expect(result.confidence).toBe(50);
    });

    it('TEST 9: Comic Book (Batman: Year One) -> unmapped (0%) (Taxonomy Gap: Comics)', () => {
      const result = resolveInternationalCategory({
        title: 'Batman: Year One',
        brand: null,
        category_path: null,
        category_mappings: mockCatMappings,
        brand_mappings: mockBrandMappings,
        keyword_rules: mockKeywordRules
      });

      expect(result.source).toBe('unmapped');
      expect(result.category_id).toBeNull();
      expect(result.confidence).toBe(0);
    });

    it('TEST 10: Unknown item -> unmapped (0%) with resolution trace', () => {
      const result = resolveInternationalCategory({
        title: 'Stanley 16oz Steel Hammer with Fiberglass Handle',
        brand: 'Stanley',
        category_path: ['Tools & Home Improvement', 'Hand Tools', 'Hammers'],
        category_mappings: mockCatMappings,
        brand_mappings: mockBrandMappings,
        keyword_rules: mockKeywordRules
      });

      expect(result.source).toBe('unmapped');
      expect(result.category_id).toBeNull();
      expect(result.confidence).toBe(0);
      expect(result.trace).toBeDefined();
      expect(result.trace?.length).toBeGreaterThan(3);
    });
  });
});
