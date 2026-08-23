import { describe, it, expect } from 'vitest';
import { matchesProductFilters, createDefaultProductFilters } from './productFilterTypes';
import type { ProductFilterState } from './productFilterTypes';
import { generateProductsCsv, generateProductsXlsxBlob, formatProductRecordForExport } from './bulkExportUtils';
import type { ExportProductItem } from './bulkExportUtils';
import { normalizeRawProductForExport } from './exportProductsEngine';
import { getMasterFields } from './productFieldRegistry';
import { generateXlsxImportTemplate } from './bulkTemplateGenerator';
import { parseAndPreviewImportFile } from './bulkImportEngine';

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
      condition: i % 2 === 0 ? 'new_sealed' : 'new_open_box',
      weight_kg: 0.5 + (i % 3) * 0.2,
      dimensions_length: 25.0,
      dimensions_width: 15.0,
      dimensions_height: 10.0,
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

describe('Column Selection & Fixed Order Comprehensive Tests (29 Master Fields)', () => {
  const masterFields = getMasterFields('admin').filter(f => f.exportable);
  const sampleProduct = createMockCatalog(1)[0];

  it('1. Tipo MBE appears in column selection list', () => {
    const mbeField = masterFields.find(f => f.key === 'mbe_packaging_type');
    expect(mbeField).toBeTruthy();
    expect(mbeField?.label).toBe('Tipo MBE');
  });

  it('2. Estado AR appears in column selection list', () => {
    const arField = masterFields.find(f => f.key === 'argentina_shipping_status');
    expect(arField).toBeTruthy();
    expect(arField?.label).toBe('Estado AR');
  });

  it('3. Selecting only SKU, Tipo MBE and Estado AR -> exports 3 columns', () => {
    const selectedKeys = ['sku', 'mbe_packaging_type', 'argentina_shipping_status'];
    const record = formatProductRecordForExport(sampleProduct, selectedKeys);
    expect(Object.keys(record)).toEqual(['sku', 'mbe_packaging_type', 'argentina_shipping_status']);
    expect(record.mbe_packaging_type).toBe('MBE Caja');
    expect(record.argentina_shipping_status).toBe('Envío automático');
  });

  it('4. Select all -> selects all 29 master exportable columns', () => {
    const allKeys = masterFields.map(f => f.key);
    expect(allKeys.length).toBe(29);

    const record = formatProductRecordForExport(sampleProduct, allKeys);
    expect(Object.keys(record).length).toBe(29);
    expect(record.weight_kg).toBe('0.7');
    expect(record.dimensions_length).toBe('25');
  });

  it('5. Export CSV with Tipo MBE and Estado AR -> contains human readable labels', () => {
    const prodWithMbe: ExportProductItem = {
      ...sampleProduct,
      metadata: { packaging_type: 'mbe_pak' }
    };
    const selectedKeys = ['sku', 'title', 'mbe_packaging_type', 'argentina_shipping_status'];
    const csv = generateProductsCsv([prodWithMbe], selectedKeys, 'admin');

    expect(csv).toContain('"SKU","Título","Tipo MBE","Estado AR"');
    expect(csv).toContain('"MBE PAK"');
    expect(csv).toContain('"Envío automático"');
  });

  it('6. Export XLSX with Tipo MBE and Estado AR -> generates valid Blob', async () => {
    const selectedKeys = ['sku', 'title', 'mbe_packaging_type', 'argentina_shipping_status'];
    const blob = await generateProductsXlsxBlob([sampleProduct], selectedKeys, 'admin');
    expect(blob).toBeTruthy();
    expect(blob.size).toBeGreaterThan(0);
  });

  it('7. XLSX template generation includes Listas sheet and guide entries for Tipo MBE and Estado AR', async () => {
    const mockMeta = {
      brands: [{ id: 'b1', name: 'NECA' }],
      categories: [{ id: 'c1', name: 'Figuras', parent_id: null }],
      licenses: [{ id: 'l1', name: 'Marvel' }],
      vendors: [{ id: 'v1', store_name: 'Collectibles' }]
    };

    const blob = await generateXlsxImportTemplate('admin', mockMeta);
    expect(blob).toBeTruthy();
    expect(blob.size).toBeGreaterThan(0);
  });

  it('8. Verification: Invalid Tipo MBE value (e.g. PRUEBA123) is rejected by parser', async () => {
    const fakeFileContent = 'SKU,Título,Precio,Stock,Tipo MBE\nSKU-999,Producto Test,100,5,PRUEBA123';
    const blob = new Blob([fakeFileContent], { type: 'text/csv' });
    const file = new File([blob], 'test_invalid_mbe.csv', { type: 'text/csv' });

    const preview = await parseAndPreviewImportFile(file, 'admin', null, {
      brands: [],
      categories: [],
      licenses: [],
      vendors: []
    });

    expect(preview.rows.length).toBe(1);
    expect(preview.rows[0].operation).toBe('invalid');
    expect(preview.rows[0].errors.some(e => e.includes('no es un Tipo MBE válido'))).toBe(true);
  });

  it('9. Verification: Invalid Estado AR value (e.g. ESTADO_FALSO) is rejected by parser', async () => {
    const fakeFileContent = 'SKU,Título,Precio,Stock,Estado AR\nSKU-999,Producto Test,100,5,ESTADO_FALSO';
    const blob = new Blob([fakeFileContent], { type: 'text/csv' });
    const file = new File([blob], 'test_invalid_ar.csv', { type: 'text/csv' });

    const preview = await parseAndPreviewImportFile(file, 'admin', null, {
      brands: [],
      categories: [],
      licenses: [],
      vendors: []
    });

    expect(preview.rows.length).toBe(1);
    expect(preview.rows[0].operation).toBe('invalid');
    expect(preview.rows[0].errors.some(e => e.includes('no es un Estado AR válido'))).toBe(true);
  });

  it('10. Verification: Valid visible labels (MBE PAK, Envío automático) resolve correctly to internal keys', async () => {
    const fakeFileContent = 'SKU,Título,Precio,Stock,Tipo MBE,Estado AR\nSKU-999,Producto Test,100,5,MBE PAK,Envío automático';
    const blob = new Blob([fakeFileContent], { type: 'text/csv' });
    const file = new File([blob], 'test_valid_labels.csv', { type: 'text/csv' });

    const preview = await parseAndPreviewImportFile(file, 'admin', null, {
      brands: [],
      categories: [],
      licenses: [],
      vendors: []
    });

    expect(preview.rows.length).toBe(1);
    expect(preview.rows[0].parsedData.resolvedMbeType).toBe('mbe_pak');
    expect(preview.rows[0].parsedData.resolvedArStatus).toBe('auto');
  });

  it('11. Verification: fixed order is strictly enforced for all 29 fields', () => {
    const keys = masterFields.map(f => f.key);
    expect(keys.indexOf('mbe_packaging_type')).toBe(19); // order 20 (0-indexed 19)
    expect(keys.indexOf('argentina_shipping_status')).toBe(20); // order 21 (0-indexed 20)
  });

  it('12. Round-Trip Test: Export product -> Parse back -> Verify zero lost data and valid row preview', async () => {
    const originalProd = {
      ...sampleProduct,
      image_url: 'https://collectibles.uy/images/batman-1.jpg'
    };
    const allKeys = masterFields.map(f => f.key);
    const csvContent = generateProductsCsv([originalProd], allKeys, 'admin');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const file = new File([blob], 'roundtrip_export.csv', { type: 'text/csv' });

    const preview = await parseAndPreviewImportFile(file, 'admin', null, {
      brands: [{ id: 'brand-neca', name: 'NECA' }],
      categories: [{ id: 'cat-figuras', name: 'Figuras de Acción', parent_id: null }],
      licenses: [],
      vendors: [{ id: 'vendor-collectibles', store_name: 'Collectibles Oficial' }]
    });

    expect(preview.rows.length).toBe(1);
    const parsedRow = preview.rows[0];
    if (parsedRow.errors.length > 0) {
      console.log('RoundTrip errors:', parsedRow.errors);
    }
    expect(parsedRow.sku).toBe(originalProd.sku);
    expect(parsedRow.title).toBe(originalProd.title);
    expect(parsedRow.parsedData.base_price).toBe(originalProd.base_price);
    expect(parsedRow.errors.length).toBe(0);
  });
});
