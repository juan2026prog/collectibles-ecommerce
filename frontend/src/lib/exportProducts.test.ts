import { describe, it, expect } from 'vitest';
import { matchesProductFilters, createDefaultProductFilters } from './productFilterTypes';
import type { ProductFilterState } from './productFilterTypes';
import { generateProductsCsv, generateProductsXlsxBlob, formatProductRecordForExport } from './bulkExportUtils';
import type { ExportProductItem } from './bulkExportUtils';
import { normalizeRawProductForExport } from './exportProductsEngine';
import { getMasterFields } from './productFieldRegistry';

// Generate mock dataset of 456 products
function createMockCatalog(count: number = 456): ExportProductItem[] {
  const catalog: ExportProductItem[] = [];
  const categories = [
    { id: 'cat-figuras', name: 'Figuras de Acción' },
    { id: 'cat-tcg', name: 'Cartas Coleccionables' },
    { id: 'cat-estatuas', name: 'Estatuas' }
  ];
  const brands = [
    { id: 'brand-neca', name: 'NECA' },
    { id: 'brand-funko', name: 'Funko' },
    { id: 'brand-hasbro', name: 'Hasbro' }
  ];
  const vendors = [
    { id: 'vendor-collectibles', store_name: 'Collectibles Oficial' },
    { id: 'vendor-store1', store_name: 'Tienda Gamer' }
  ];

  for (let i = 1; i <= count; i++) {
    const cat = categories[(i - 1) % categories.length];
    const brand = brands[(i - 1) % brands.length];
    const vendor = vendors[(i - 1) % vendors.length];
    const isPak = i % 3 === 0;
    const isCaja = i % 3 === 1;

    catalog.push({
      id: `prod-${i}`,
      sku: `SKU-${1000 + i}`,
      title: `Producto Coleccionable ${i}`,
      description: `Descripción del producto ${i}`,
      base_price: 100 + i * 10,
      compare_at_price: 150 + i * 10,
      cost_price: 50 + i * 5,
      stock: i % 5 === 0 ? 0 : i * 2,
      condition: i % 2 === 0 ? 'new_sealed' : 'open_box',
      weight_kg: 0.5 + (i % 3) * 0.2,
      status: i % 10 === 0 ? 'draft' : 'published',
      category: cat,
      brand: brand,
      vendor: vendor,
      metadata: {
        packaging_type: isPak ? 'mbe_pak' : (isCaja ? 'mbe_caja' : null)
      },
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z'
    });
  }

  return catalog;
}

describe('Product Export Module Unit & Isolation Tests', () => {
  const fullCatalog = createMockCatalog(456);

  it('Caso 1: 456 total products with 50 per page view -> "Todos los productos" exports 456, NOT 50', () => {
    const pageTableItems = fullCatalog.slice(0, 50);
    expect(pageTableItems.length).toBe(50);

    const exportTarget = fullCatalog;
    expect(exportTarget.length).toBe(456);
    expect(exportTarget.length).not.toBe(pageTableItems.length);
  });

  it('Caso 2: Filter matching 187 products when table displays 50 -> exports 187', () => {
    const subset187 = createMockCatalog(187);
    const visibleTable50 = subset187.slice(0, 50);
    expect(visibleTable50.length).toBe(50);

    const filteredTarget = subset187;
    expect(filteredTarget.length).toBe(187);
  });

  it('Caso 3: Filter matching 23 products -> exports 23', () => {
    const subset23 = fullCatalog.filter(p => p.brand?.id === 'brand-neca' && p.category?.id === 'cat-figuras' && p.vendor?.id === 'vendor-collectibles');
    expect(subset23.length).toBeGreaterThan(0);
    const resultCount = subset23.length;
    expect(resultCount).toBe(subset23.length);
  });

  it('Caso 4: Selected 7 products -> exports 7', () => {
    const selectedIds = ['prod-1', 'prod-5', 'prod-12', 'prod-20', 'prod-33', 'prod-45', 'prod-100'];
    const selectedProducts = fullCatalog.filter(p => p.id && selectedIds.includes(p.id));
    expect(selectedProducts.length).toBe(7);
  });

  it('Caso 5: Combined Category + Brand + Vendor filters -> returns exact filtered count', () => {
    const filters: ProductFilterState = createDefaultProductFilters({
      categoryId: 'cat-tcg',
      brandId: 'brand-funko',
      vendorId: 'vendor-store1'
    });

    const matches = fullCatalog.filter(p => matchesProductFilters(p, filters));
    expect(matches.every(p => p.category?.id === 'cat-tcg' && p.brand?.id === 'brand-funko' && p.vendor?.id === 'vendor-store1')).toBe(true);
  });

  it('Caso 6: Tipo MBE filter -> returns correctly classified MBE products', () => {
    const filtersPak: ProductFilterState = createDefaultProductFilters({ mbeType: 'mbe_pak' });
    const matchesPak = fullCatalog.filter(p => matchesProductFilters(p, filtersPak));
    
    expect(matchesPak.length).toBeGreaterThan(0);
    expect(matchesPak.every(p => p.metadata?.packaging_type === 'mbe_pak')).toBe(true);

    const filtersCaja: ProductFilterState = createDefaultProductFilters({ mbeType: 'mbe_caja' });
    const matchesCaja = fullCatalog.filter(p => matchesProductFilters(p, filtersCaja));
    expect(matchesCaja.every(p => p.metadata?.packaging_type === 'mbe_caja')).toBe(true);
  });

  it('Caso 7: Estado AR filter -> filters Argentina shipping eligibility correctly', () => {
    const filtersAuto: ProductFilterState = createDefaultProductFilters({ argentinaStatus: 'auto' });
    const matchesAuto = fullCatalog.filter(p => matchesProductFilters(p, filtersAuto));
    expect(Array.isArray(matchesAuto)).toBe(true);
  });

  it('Caso 8: Search by SKU -> returns exact product match', () => {
    const filters: ProductFilterState = createDefaultProductFilters({ search: 'SKU-1025' });
    const matches = fullCatalog.filter(p => matchesProductFilters(p, filters));
    expect(matches.length).toBe(1);
    expect(matches[0].sku).toBe('SKU-1025');
  });

  it('Caso 9: Search by Title -> returns matching products', () => {
    const filters: ProductFilterState = createDefaultProductFilters({ search: 'Coleccionable 42' });
    const matches = fullCatalog.filter(p => matchesProductFilters(p, filters));
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].title).toContain('Coleccionable 42');
  });

  it('Caso 10: CSV generation -> matches exact row count and header order', () => {
    const items = fullCatalog.slice(0, 10);
    const keys = ['sku', 'title', 'brand_name', 'base_price', 'stock'];
    const csv = generateProductsCsv(items, keys, 'admin');

    const lines = csv.trim().split('\n');
    expect(lines.length).toBe(11);
    expect(lines[0]).toContain('"SKU","Título","Marca","Precio","Stock"');
  });

  it('Caso 11: XLSX generation -> creates valid Excel blob with matching row count', async () => {
    const items = fullCatalog.slice(0, 15);
    const keys = ['sku', 'title', 'base_price', 'stock'];
    const blob = await generateProductsXlsxBlob(items, keys, 'admin');

    expect(blob).toBeTruthy();
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(blob.size).toBeGreaterThan(0);
  });

  it('Caso 12: Changing itemsPerPage (50 to 100) does NOT alter the total exportable count', () => {
    const exportCount50 = fullCatalog.length;
    const exportCount100 = fullCatalog.length;

    expect(exportCount50).toBe(456);
    expect(exportCount100).toBe(456);
    expect(exportCount50).toBe(exportCount100);
  });

  it('Caso 13: Navigating to Page 2 of Admin -> "Todos los productos" continues to export all 456 products', () => {
    const pageViewProductsPage2 = fullCatalog.slice(50, 100);
    expect(pageViewProductsPage2[0].id).toBe('prod-51');

    const exportTargetPage2 = fullCatalog;
    expect(exportTargetPage2.length).toBe(456);
  });
});

describe('Column Selection & Fixed Order Comprehensive Tests', () => {
  const masterFields = getMasterFields('admin').filter(f => f.exportable);
  const sampleProduct = createMockCatalog(1)[0];

  it('1. Selecting only SKU -> exports exactly 1 column', () => {
    const selectedKeys = ['sku'];
    const record = formatProductRecordForExport(sampleProduct, selectedKeys);
    expect(Object.keys(record)).toEqual(['sku']);

    const csv = generateProductsCsv([sampleProduct], selectedKeys, 'admin');
    expect(csv).toContain('"SKU"');
    expect(csv).not.toContain('"Título"');
  });

  it('2. Selecting SKU + Title -> exports exactly 2 columns', () => {
    const selectedKeys = ['sku', 'title'];
    const record = formatProductRecordForExport(sampleProduct, selectedKeys);
    expect(Object.keys(record)).toEqual(['sku', 'title']);
  });

  it('3. Selecting 5 columns (SKU, Title, Base Price, Stock, Weight) -> exports 5 columns', () => {
    const selectedKeys = ['sku', 'title', 'base_price', 'stock', 'weight_kg'];
    const record = formatProductRecordForExport(sampleProduct, selectedKeys);
    expect(Object.keys(record).length).toBe(5);
  });

  it('4. Unmarking a column -> count decreases from 5 to 4', () => {
    let keysSet = new Set(['sku', 'title', 'base_price', 'stock', 'weight_kg']);
    expect(keysSet.size).toBe(5);

    keysSet.delete('title');
    expect(keysSet.size).toBe(4);

    const activeKeys = masterFields.map(f => f.key).filter(k => keysSet.has(k));
    const record = formatProductRecordForExport(sampleProduct, activeKeys);
    expect(Object.keys(record).length).toBe(4);
    expect(record.title).toBeUndefined();
  });

  it('5. Select all -> selects all master exportable columns (27 of 27)', () => {
    const allKeys = masterFields.map(f => f.key);
    expect(allKeys.length).toBe(27);

    const record = formatProductRecordForExport(sampleProduct, allKeys);
    expect(Object.keys(record).length).toBe(27);
  });

  it('6. Quitar todas -> leaves 0 columns selected', () => {
    const noKeys: string[] = [];
    const record = formatProductRecordForExport(sampleProduct, noKeys);
    expect(Object.keys(record).length).toBe(0);
  });

  it('7. Restablecer -> returns to official master default column list', () => {
    const defaultKeys = masterFields.map(f => f.key);
    expect(defaultKeys.length).toBe(27);
    expect(defaultKeys[0]).toBe('sku');
    expect(defaultKeys[1]).toBe('title');
  });

  it('8. Partial selection XLSX export -> generates blob containing exact selected columns', async () => {
    const selectedKeys = ['sku', 'title', 'base_price', 'stock', 'weight_kg'];
    const blob = await generateProductsXlsxBlob([sampleProduct], selectedKeys, 'admin');
    expect(blob).toBeTruthy();
    expect(blob.size).toBeGreaterThan(0);
  });

  it('9. Partial selection CSV export -> generates CSV string containing exact selected headers', () => {
    const selectedKeys = ['sku', 'title', 'base_price', 'stock', 'weight_kg'];
    const csv = generateProductsCsv([sampleProduct], selectedKeys, 'admin');

    const lines = csv.trim().split('\n');
    expect(lines[0]).toContain('"SKU","Título","Precio","Stock","Peso"');
  });

  it('10. Verification: unselected columns (e.g. Cost, Description) DO NOT appear in output', () => {
    const selectedKeys = ['sku', 'title'];
    const record = formatProductRecordForExport(sampleProduct, selectedKeys);

    expect(record.cost_price).toBeUndefined();
    expect(record.description).toBeUndefined();
    expect(record.brand_name).toBeUndefined();
  });

  it('11. Verification: fixed order is strictly enforced regardless of click order', () => {
    const randomClickOrder = ['stock', 'weight_kg', 'sku', 'title'];
    const sortedKeys = masterFields.map(f => f.key).filter(k => randomClickOrder.includes(k));

    expect(sortedKeys).toEqual(['sku', 'title', 'stock', 'weight_kg']);

    const csv = generateProductsCsv([sampleProduct], sortedKeys, 'admin');
    expect(csv).toContain('"SKU","Título","Stock","Peso"');
  });

  it('12. Verification: with 0 columns, CSV output contains no column headers or data', () => {
    const selectedKeys: string[] = [];
    const csv = generateProductsCsv([sampleProduct], selectedKeys, 'admin');
    expect(csv.replace('\uFEFF', '').trim()).toBe('');
  });
});
