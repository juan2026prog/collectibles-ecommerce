import { describe, it, expect, vi } from 'vitest';
import { getMasterFields, findFieldDefinition, PRODUCT_MASTER_FIELDS } from '../../frontend/src/lib/productFieldRegistry';
import { generateProductsCsv, formatProductRecordForExport } from '../../frontend/src/lib/bulkExportUtils';
import { parseAndPreviewImportFile } from '../../frontend/src/lib/bulkImportEngine';

// Mock Supabase client
vi.mock('../../frontend/src/lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        order: () => Promise.resolve({ data: [] }),
        eq: () => ({
          order: () => Promise.resolve({ data: [] }),
          single: () => Promise.resolve({ data: null, error: null }),
          maybeSingle: () => Promise.resolve({ data: null, error: null })
        }),
        in: () => Promise.resolve({ data: [] })
      })
    })
  }
}));

describe('Bulk Product Import / Export Master Architecture', () => {

  describe('1. Master Field Registry (Single Source of Truth)', () => {

    it('should have unique keys and valid strictly positive order for all fields', () => {
      const keys = new Set<string>();
      PRODUCT_MASTER_FIELDS.forEach(field => {
        expect(field.key).toBeTruthy();
        expect(field.label).toBeTruthy();
        expect(field.order).toBeGreaterThan(0);
        expect(keys.has(field.key)).toBe(false);
        keys.add(field.key);
      });
    });

    it('should correctly filter adminOnly fields when requesting vendor role', () => {
      const adminFields = getMasterFields('admin');
      const vendorFields = getMasterFields('vendor');

      const adminOnlyInMaster = PRODUCT_MASTER_FIELDS.filter(f => f.adminOnly);
      expect(adminOnlyInMaster.length).toBeGreaterThan(0);

      adminOnlyInMaster.forEach(af => {
        expect(adminFields.some(f => f.key === af.key)).toBe(true);
        expect(vendorFields.some(f => f.key === af.key)).toBe(false);
      });
    });

    it('should resolve headers by label or synonyms', () => {
      expect(findFieldDefinition('SKU')?.key).toBe('sku');
      expect(findFieldDefinition('Título')?.key).toBe('title');
      expect(findFieldDefinition('Marca')?.key).toBe('brand_name');
      expect(findFieldDefinition('Categoría')?.key).toBe('category_name');
      expect(findFieldDefinition('Peso')?.key).toBe('weight_kg');
    });

  });

  describe('2. Export Engine (CSV & Human-Readable Relations)', () => {

    const sampleProduct = {
      id: 'prod-123',
      sku: 'HAS-999',
      title: 'Figura Star Wars',
      base_price: 2990,
      compare_at_price: 3500,
      cost_price: 1500,
      stock: 10,
      condition: 'new_sealed',
      weight_kg: 0.5,
      status: 'published',
      brand: { id: 'uuid-brand-1', name: 'Hasbro' },
      category: { id: 'uuid-cat-1', name: 'Figuras' },
      subcategory: { id: 'uuid-subcat-1', name: '6 Pulgadas' },
      vendor: { id: 'uuid-vendor-1', store_name: 'Tienda Geek' }
    };

    it('should export relation human readable names instead of internal UUIDs', () => {
      const selectedKeys = ['sku', 'title', 'brand_name', 'category_name', 'subcategory_name', 'vendor_store_name'];
      const record = formatProductRecordForExport(sampleProduct, selectedKeys);

      expect(record.brand_name).toBe('Hasbro');
      expect(record.category_name).toBe('Figuras');
      expect(record.subcategory_name).toBe('6 Pulgadas');
      expect(record.vendor_store_name).toBe('Tienda Geek');
      expect(record.brand_name).not.toContain('uuid');
    });

    it('should generate valid UTF-8 CSV with BOM and official column headers', () => {
      const selectedKeys = ['sku', 'title', 'base_price', 'stock'];
      const csv = generateProductsCsv([sampleProduct], selectedKeys, 'admin');

      expect(csv.startsWith('\uFEFF')).toBe(true);
      expect(csv).toContain('SKU,Título,Precio,Stock');
      expect(csv).toContain('HAS-999,Figura Star Wars,2990.00,10');
    });

    it('should respect selected column filtering and omit unselected keys', () => {
      const selectedKeys = ['sku', 'title'];
      const csv = generateProductsCsv([sampleProduct], selectedKeys, 'admin');

      expect(csv).toContain('SKU,Título');
      expect(csv).not.toContain('Precio');
      expect(csv).not.toContain('Stock');
    });

  });

  describe('3. Import Engine & Partial Updates', () => {

    it('should reject non-existent brand with a clear row validation error', async () => {
      const mockFile = new File(['SKU,Título,Marca\nHAS-01,Test,MARCA INVENTADA XYZ'], 'test.csv', { type: 'text/csv' });
      const metadata = {
        brands: [{ id: 'b1', name: 'Hasbro' }],
        categories: [{ id: 'c1', name: 'Figuras', parent_id: null }],
        licenses: [],
        vendors: []
      };

      const result = await parseAndPreviewImportFile(mockFile, 'admin', null, metadata);
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].operation).toBe('invalid');
      expect(result.rows[0].errors[0]).toContain('MARCA INVENTADA XYZ');
    });

    it('should generate dbPayload containing ONLY included columns for partial updates', async () => {
      const mockFile = new File(['SKU,Peso\nHAS-999,0.750'], 'test.csv', { type: 'text/csv' });
      const metadata = { brands: [], categories: [], licenses: [], vendors: [] };

      const result = await parseAndPreviewImportFile(mockFile, 'admin', null, metadata);
      expect(result.rows.length).toBe(1);
      
      const payload = result.rows[0].dbPayload;
      expect(payload.weight_kg).toBe(0.750);
      expect(payload.title).toBeUndefined();
      expect(payload.base_price).toBeUndefined();
      expect(payload.description).toBeUndefined();
    });

    it('should block vendor role from modifying restricted administrative fields', async () => {
      const mockFile = new File(['SKU,Título,Costo\nHAS-999,Test,1200'], 'test.csv', { type: 'text/csv' });
      const metadata = { brands: [], categories: [], licenses: [], vendors: [] };

      const result = await parseAndPreviewImportFile(mockFile, 'vendor', 'v1', metadata);
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].operation).toBe('invalid');
      expect(result.rows[0].errors.some(e => e.includes('Costo'))).toBe(true);
    });

  });

});
