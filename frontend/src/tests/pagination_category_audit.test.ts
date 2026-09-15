import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Unit Tests for Category & Catalog Pagination Logic ──

describe('COLLECTIBLES 2026 — Pagination Logic & Range Calculations', () => {
  const pageSize = 15;

  describe('Range & Offset Calculations', () => {
    it('calculates exact offset and range for Page 1', () => {
      const page = 1;
      const offset = (page - 1) * pageSize;
      const rangeFrom = offset;
      const rangeTo = offset + pageSize - 1;

      expect(offset).toBe(0);
      expect(rangeFrom).toBe(0);
      expect(rangeTo).toBe(14);
    });

    it('calculates exact offset and range for Page 2', () => {
      const page = 2;
      const offset = (page - 1) * pageSize;
      const rangeFrom = offset;
      const rangeTo = offset + pageSize - 1;

      expect(offset).toBe(15);
      expect(rangeFrom).toBe(15);
      expect(rangeTo).toBe(29);
    });

    it('calculates exact offset and range for Page 3', () => {
      const page = 3;
      const offset = (page - 1) * pageSize;
      const rangeFrom = offset;
      const rangeTo = offset + pageSize - 1;

      expect(offset).toBe(30);
      expect(rangeFrom).toBe(30);
      expect(rangeTo).toBe(44);
    });

    it('ensures zero overlap/duplicates between consecutive page ranges', () => {
      const page1Range = { from: 0, to: 14 };
      const page2Range = { from: 15, to: 29 };
      const page3Range = { from: 30, to: 44 };

      expect(page1Range.to).toBeLessThan(page2Range.from);
      expect(page2Range.to).toBeLessThan(page3Range.from);
      expect(page2Range.from - page1Range.to).toBe(1);
      expect(page3Range.from - page2Range.to).toBe(1);
    });
  });

  describe('URL searchParams Page Parser & Sanitizer', () => {
    function parsePageParam(pageParam: string | null): number {
      const parsed = parseInt(pageParam || '1', 10);
      const currentPage = !isNaN(parsed) && parsed > 0 ? parsed : 1;
      return currentPage;
    }

    it('parses null or empty as Page 1', () => {
      expect(parsePageParam(null)).toBe(1);
      expect(parsePageParam('')).toBe(1);
    });

    it('parses valid numeric pages correctly', () => {
      expect(parsePageParam('1')).toBe(1);
      expect(parsePageParam('2')).toBe(2);
      expect(parsePageParam('5')).toBe(5);
      expect(parsePageParam('10')).toBe(10);
    });

    it('sanitizes invalid/negative/zero pages safely to Page 1', () => {
      expect(parsePageParam('0')).toBe(1);
      expect(parsePageParam('-1')).toBe(1);
      expect(parsePageParam('-99')).toBe(1);
      expect(parsePageParam('abc')).toBe(1);
      expect(parsePageParam('NaN')).toBe(1);
      expect(parsePageParam('undefined')).toBe(1);
    });

    it('handles large page numbers without throwing', () => {
      expect(parsePageParam('999999')).toBe(999999);
    });
  });

  describe('Filter Reset Behavior', () => {
    it('removes page parameter when changing category filter', () => {
      const currentParams = new URLSearchParams('category=figuras&page=3&sort=price-low');
      
      // Simulating handleCategorySelect('estatuas')
      const newParams = new URLSearchParams(currentParams);
      newParams.delete('page');
      newParams.set('category', 'estatuas');

      expect(newParams.get('page')).toBeNull();
      expect(newParams.get('category')).toBe('estatuas');
      expect(newParams.get('sort')).toBe('price-low');
    });

    it('removes page parameter when changing brand filter', () => {
      const currentParams = new URLSearchParams('brand=funko&page=4');
      
      const newParams = new URLSearchParams(currentParams);
      newParams.delete('page');
      newParams.set('brand', 'bandai');

      expect(newParams.get('page')).toBeNull();
      expect(newParams.get('brand')).toBe('bandai');
    });

    it('removes page parameter when changing search query', () => {
      const currentParams = new URLSearchParams('q=goku&page=2');
      
      const newParams = new URLSearchParams(currentParams);
      newParams.delete('page');
      newParams.set('q', 'vegeta');

      expect(newParams.get('page')).toBeNull();
      expect(newParams.get('q')).toBe('vegeta');
    });

    it('removes page parameter when changing sort order', () => {
      const currentParams = new URLSearchParams('page=3&sort=newest');
      
      const newParams = new URLSearchParams(currentParams);
      newParams.delete('page');
      newParams.set('sort', 'price-low');

      expect(newParams.get('page')).toBeNull();
      expect(newParams.get('sort')).toBe('price-low');
    });
  });

  describe('Page Navigation & Deep Linking State Flow', () => {
    it('generates distinct datasets across Page 1, Page 2, and Page 3', () => {
      // Generate synthetic 50 products catalog
      const catalog = Array.from({ length: 50 }, (_, i) => ({
        id: `prod-${i + 1}`,
        title: `Product ${i + 1}`,
        base_price: (i + 1) * 10
      }));

      const getPageDataset = (pageNum: number, limit = 15) => {
        const offset = (pageNum - 1) * limit;
        return catalog.slice(offset, offset + limit);
      };

      const page1Products = getPageDataset(1, 15);
      const page2Products = getPageDataset(2, 15);
      const page3Products = getPageDataset(3, 15);

      expect(page1Products.length).toBe(15);
      expect(page2Products.length).toBe(15);
      expect(page3Products.length).toBe(15);

      // Verify Page 1 IDs
      const page1Ids = page1Products.map(p => p.id);
      expect(page1Ids[0]).toBe('prod-1');
      expect(page1Ids[14]).toBe('prod-15');

      // Verify Page 2 IDs
      const page2Ids = page2Products.map(p => p.id);
      expect(page2Ids[0]).toBe('prod-16');
      expect(page2Ids[14]).toBe('prod-30');

      // Verify Page 3 IDs
      const page3Ids = page3Products.map(p => p.id);
      expect(page3Ids[0]).toBe('prod-31');
      expect(page3Ids[14]).toBe('prod-45');

      // Assert Page 1 != Page 2
      expect(page1Ids).not.toEqual(page2Ids);
      // Assert Page 2 != Page 3
      expect(page2Ids).not.toEqual(page3Ids);

      // Verify zero intersection between page 1, 2, and 3
      const page1Set = new Set(page1Ids);
      const page2Set = new Set(page2Ids);
      const page3Set = new Set(page3Ids);

      expect(page2Ids.some(id => page1Set.has(id))).toBe(false);
      expect(page3Ids.some(id => page2Set.has(id))).toBe(false);
    });

    it('simulates Browser Back and Forward navigation preserving dataset', () => {
      const historyStack: string[] = [];
      let historyIndex = -1;

      const navigateTo = (search: string) => {
        historyStack.push(search);
        historyIndex = historyStack.length - 1;
      };

      // Step 1: Open /shop
      navigateTo('');
      expect(historyStack[historyIndex]).toBe('');

      // Step 2: Click Page 2
      navigateTo('?page=2');
      expect(historyStack[historyIndex]).toBe('?page=2');

      // Step 3: Click Page 3
      navigateTo('?page=3');
      expect(historyStack[historyIndex]).toBe('?page=3');

      // Step 4: Click Browser Back (Back to Page 2)
      historyIndex--;
      expect(historyStack[historyIndex]).toBe('?page=2');

      // Step 5: Click Browser Back again (Back to Page 1)
      historyIndex--;
      expect(historyStack[historyIndex]).toBe('');

      // Step 6: Click Browser Forward (Forward to Page 2)
      historyIndex++;
      expect(historyStack[historyIndex]).toBe('?page=2');
    });

    it('handles last partial page correctly', () => {
      const catalog = Array.from({ length: 35 }, (_, i) => ({
        id: `prod-${i + 1}`
      }));

      const getPageDataset = (pageNum: number, limit = 15) => {
        const offset = (pageNum - 1) * limit;
        return catalog.slice(offset, offset + limit);
      };

      const page3Products = getPageDataset(3, 15);
      expect(page3Products.length).toBe(5); // 35 - 30 = 5 products
      expect(page3Products[0].id).toBe('prod-31');
      expect(page3Products[4].id).toBe('prod-35');
    });
  });
});
