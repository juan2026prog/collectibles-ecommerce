import { describe, it, expect } from 'vitest';
import {
  normalizeCondition,
  normalizeBoxCondition,
  normalizeStatus,
  getConditionColor,
  getBoxConditionColor,
  getStatusColor
} from '../plugins/collector-vault/core/conditionCatalog';
import {
  calculateVaultStats,
  calculateBrandBreakdown,
  calculateLicenseBreakdown,
  calculateConditionBreakdown
} from '../plugins/collector-vault/core/statsEngine';
import {
  sanitizeVaultItemForPublic,
  sanitizeUserProfileForPublic,
  sanitizeCollectionForPublic,
  assertFinancialPrivacy
} from '../plugins/collector-vault/core/privacyGuard';
import { calculateLineCompletion } from '../plugins/collector-vault/core/completionEngine';
import { validateVaultImage, buildVaultStoragePath, MAX_FILE_SIZE_BYTES } from '../plugins/collector-vault/adapters/storageAdapter';

describe('COLLECTIBLES MY VAULT — Modular Test Suite', () => {

  describe('1. Condition & Status Normalization Engine', () => {
    it('normalizes various piece condition casing and defaults unknown to GOOD', () => {
      expect(normalizeCondition('MINT')).toBe('MINT');
      expect(normalizeCondition('mint')).toBe('MINT');
      expect(normalizeCondition('near_mint')).toBe('NEAR_MINT');
      expect(normalizeCondition('damaged')).toBe('DAMAGED');
      expect(normalizeCondition('unknown_condition')).toBe('GOOD');
    });

    it('normalizes box condition and defaults unknown to NO_BOX', () => {
      expect(normalizeBoxCondition('SEALED')).toBe('SEALED');
      expect(normalizeBoxCondition('sealed')).toBe('SEALED');
      expect(normalizeBoxCondition('open_box')).toBe('OPEN_BOX');
      expect(normalizeBoxCondition('acrylic_case')).toBe('ACRYLIC_CASE');
      expect(normalizeBoxCondition('invalid')).toBe('NO_BOX');
    });

    it('normalizes inventory status and defaults unknown to OWNED', () => {
      expect(normalizeStatus('OWNED')).toBe('OWNED');
      expect(normalizeStatus('wishlist')).toBe('WISHLIST');
      expect(normalizeStatus('ordered')).toBe('ORDERED');
      expect(normalizeStatus('preordered')).toBe('PREORDERED');
      expect(normalizeStatus('wanted')).toBe('WANTED');
      expect(normalizeStatus('sold')).toBe('SOLD');
      expect(normalizeStatus('traded')).toBe('TRADED');
      expect(normalizeStatus('something_else')).toBe('OWNED');
    });

    it('provides badge styling classes for conditions and statuses', () => {
      expect(getConditionColor('MINT')).toContain('emerald');
      expect(getBoxConditionColor('SEALED')).toContain('emerald');
      expect(getStatusColor('OWNED')).toContain('emerald');
      expect(getStatusColor('WISHLIST')).toContain('rose');
    });
  });

  describe('2. Stats Engine & Aggregations', () => {
    const sampleItems = [
      {
        id: 'v1',
        status: 'OWNED' as const,
        condition: 'MINT' as const,
        purchase_price: 120,
        product: { brand: { name: 'Hot Toys' }, license: { name: 'Star Wars' } }
      },
      {
        id: 'v2',
        status: 'OWNED' as const,
        condition: 'NEAR_MINT' as const,
        purchase_price: 45.5,
        product: { brand: { name: 'NECA' }, license: { name: 'Alien' } }
      },
      {
        id: 'v3',
        status: 'WISHLIST' as const,
        condition: 'EXCELLENT' as const,
        purchase_price: null,
        product: { brand: { name: 'Hot Toys' }, license: { name: 'Star Wars' } }
      },
      {
        id: 'v4',
        status: 'PREORDERED' as const,
        condition: 'MINT' as const,
        purchase_price: 80,
        external_item: { brand_name: 'Iron Studios', license_name: 'Marvel' }
      }
    ];

    it('calculates total items, status counts and unique counts correctly', () => {
      const stats = calculateVaultStats(sampleItems as any, 2, true);

      expect(stats.total_items).toBe(4);
      expect(stats.owned_count).toBe(2);
      expect(stats.wishlist_count).toBe(1);
      expect(stats.preordered_count).toBe(1);
      expect(stats.collections_count).toBe(2);
      expect(stats.brands_count).toBe(3); // Hot Toys, NECA, Iron Studios
      expect(stats.licenses_count).toBe(3); // Star Wars, Alien, Marvel
    });

    it('includes amount_spent when viewer is the owner', () => {
      const stats = calculateVaultStats(sampleItems as any, 2, true);
      // 120 + 45.5 + 80 = 245.5
      expect(stats.amount_spent).toBe(245.5);
    });

    it('STRICTLY MASKS amount_spent when viewer is NOT owner (Public Showcase Privacy)', () => {
      const stats = calculateVaultStats(sampleItems as any, 2, false);
      expect(stats.amount_spent).toBeNull();
    });

    it('generates breakdowns by brand, license and condition', () => {
      const brandBreakdown = calculateBrandBreakdown(sampleItems as any);
      expect(brandBreakdown['Hot Toys']).toBe(2);
      expect(brandBreakdown['NECA']).toBe(1);
      expect(brandBreakdown['Iron Studios']).toBe(1);

      const conditionBreakdown = calculateConditionBreakdown(sampleItems as any);
      expect(conditionBreakdown['MINT']).toBe(2);
      expect(conditionBreakdown['NEAR_MINT']).toBe(1);
    });
  });

  describe('3. Privacy Guard & Data Sanitization', () => {
    const sensitiveItem = {
      id: 'v-priv-1',
      user_id: 'user-xyz-secret-123',
      product_id: 'prod-456',
      status: 'OWNED' as const,
      condition: 'MINT' as const,
      box_condition: 'SEALED' as const,
      purchase_price: 999.99,
      purchase_date: '2026-01-15',
      purchase_currency: 'USD',
      purchase_store: 'Secret Store',
      notes: 'Private note: bought with discount coupon ABC',
      edition_number: '042/500',
      custom_image_url: 'https://images.example.com/vault/user-xyz/pic.jpg',
      visibility: 'PUBLIC' as const,
      product: {
        id: 'prod-456',
        title: 'Boba Fett Mythos Statue',
        slug: 'boba-fett-mythos',
        brand: { name: 'Sideshow' },
        license: { name: 'Star Wars' }
      }
    };

    it('sanitizes public vault items by stripping ALL monetary and personal notes', () => {
      const sanitized = sanitizeVaultItemForPublic(sensitiveItem as any);

      expect(sanitized).not.toBeNull();
      expect(sanitized!.id).toBe('v-priv-1');
      expect(sanitized!.title).toBe('Boba Fett Mythos Statue');
      expect(sanitized!.brand_name).toBe('Sideshow');
      expect(sanitized!.license_name).toBe('Star Wars');
      expect(sanitized!.edition_number).toBe('042/500');
      expect(sanitized!.condition).toBe('MINT');
      expect(sanitized!.box_condition).toBe('SEALED');

      // CRITICAL PRIVACY CHECKS:
      expect((sanitized as any).purchase_price).toBeUndefined();
      expect((sanitized as any).purchase_date).toBeUndefined();
      expect((sanitized as any).purchase_currency).toBeUndefined();
      expect((sanitized as any).purchase_store).toBeUndefined();
      expect((sanitized as any).notes).toBeUndefined();
      expect((sanitized as any).user_id).toBeUndefined();
    });

    it('assertFinancialPrivacy verifies that no financial keys leak in an object', () => {
      const sanitized = sanitizeVaultItemForPublic(sensitiveItem as any);
      expect(assertFinancialPrivacy(sanitized)).toBe(true);

      // Raw item must fail assertion
      expect(assertFinancialPrivacy(sensitiveItem)).toBe(false);
    });

    it('sanitizes user profile and collection metadata for public showcase', () => {
      const profile = {
        user_id: 'usr-123',
        handle: 'vader_collector',
        display_name: 'Lord Vader',
        bio: 'Collecting dark side figures',
        avatar_url: 'https://avatar.jpg',
        is_public: true,
        show_stats: true,
        secret_admin_notes: 'VIP customer'
      };

      const sanitizedProfile = sanitizeUserProfileForPublic(profile as any);
      expect(sanitizedProfile.handle).toBe('vader_collector');
      expect(sanitizedProfile.display_name).toBe('Lord Vader');
      expect((sanitizedProfile as any).user_id).toBeUndefined();
      expect((sanitizedProfile as any).secret_admin_notes).toBeUndefined();

      const collection = {
        id: 'col-1',
        user_id: 'usr-123',
        name: 'Sith Lords',
        slug: 'sith-lords',
        description: 'All sith pieces',
        visibility: 'PUBLIC' as const
      };

      const sanitizedCol = sanitizeCollectionForPublic(collection as any, 5);
      expect(sanitizedCol.name).toBe('Sith Lords');
      expect(sanitizedCol.item_count).toBe(5);
      expect((sanitizedCol as any).user_id).toBeUndefined();
    });
  });

  describe('4. Line Completion Engine', () => {
    const targetLineItems = [
      { id: 't1', title: 'Luke Skywalker', character: 'Luke Skywalker' },
      { id: 't2', title: 'Darth Vader', character: 'Darth Vader' },
      { id: 't3', title: 'Han Solo', character: 'Han Solo' },
      { id: 't4', title: 'Princess Leia', character: 'Princess Leia' }
    ];

    const ownedVaultItems = [
      {
        id: 'v1',
        status: 'OWNED' as const,
        product: { title: 'Luke Skywalker (Bespin)' }
      },
      {
        id: 'v2',
        status: 'OWNED' as const,
        external_item: { name: 'Darth Vader Return of the Jedi' }
      }
    ];

    it('calculates completion percentage and identifies missing pieces', () => {
      const completion = calculateLineCompletion('Original Trilogy Line', targetLineItems, ownedVaultItems as any);

      expect(completion.line_name).toBe('Original Trilogy Line');
      expect(completion.total_pieces).toBe(4);
      expect(completion.owned_pieces).toBe(2);
      expect(completion.completion_percentage).toBe(50);
      expect(completion.missing_items.length).toBe(2);
      expect(completion.missing_items.map(m => m.id)).toEqual(['t3', 't4']);
    });

    it('handles 100% completion correctly', () => {
      const fullOwned = [
        ...ownedVaultItems,
        { id: 'v3', status: 'OWNED' as const, product: { title: 'Han Solo' } },
        { id: 'v4', status: 'OWNED' as const, product: { title: 'Princess Leia' } }
      ];

      const completion = calculateLineCompletion('Original Trilogy Line', targetLineItems, fullOwned as any);
      expect(completion.completion_percentage).toBe(100);
      expect(completion.missing_items.length).toBe(0);
    });

    it('handles empty line gracefully without division by zero', () => {
      const completion = calculateLineCompletion('Empty Line', [], ownedVaultItems as any);
      expect(completion.total_pieces).toBe(0);
      expect(completion.completion_percentage).toBe(0);
      expect(completion.missing_items.length).toBe(0);
    });
  });

  describe('5. Storage & Image Upload Validation', () => {
    it('accepts valid JPEG, PNG and WEBP files within 5MB limit', () => {
      const validJpg = { size: 1024 * 1024, type: 'image/jpeg' };
      const validPng = { size: 2 * 1024 * 1024, type: 'image/png' };
      const validWebp = { size: 500 * 1024, type: 'image/webp' };

      expect(validateVaultImage(validJpg).valid).toBe(true);
      expect(validateVaultImage(validPng).valid).toBe(true);
      expect(validateVaultImage(validWebp).valid).toBe(true);
    });

    it('rejects files exceeding 5MB', () => {
      const largeFile = { size: MAX_FILE_SIZE_BYTES + 1024, type: 'image/jpeg' };

      const result = validateVaultImage(largeFile);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('5 MB');
    });

    it('rejects unallowed MIME types like PDF, SVG or executable', () => {
      const invalidPdf = { size: 1024, type: 'application/pdf' };
      const invalidSvg = { size: 1024, type: 'image/svg+xml' };

      expect(validateVaultImage(invalidPdf).valid).toBe(false);
      expect(validateVaultImage(invalidPdf).error).toContain('JPG, PNG o WEBP');

      expect(validateVaultImage(invalidSvg).valid).toBe(false);
    });

    it('builds secure storage path with user_id folder prefix for RLS compliance', () => {
      const path = buildVaultStoragePath('user-abc-789', 'my-figure.png');
      expect(path).toMatch(/^user-abc-789\/\d+-[a-z0-9]+\.png$/);
    });
  });
});
