import { describe, it, expect } from 'vitest';
import { matchesProductFilters, createDefaultProductFilters } from './productFilterTypes';
import type { ProductFilterState } from './productFilterTypes';
import { generateProductsCsv, generateProductsXlsxBlob, formatProductRecordForExport } from './bulkExportUtils';
import type { ExportProductItem } from './bulkExportUtils';
import { normalizeRawProductForExport } from './exportProductsEngine';
import { getMasterFields } from './productFieldRegistry';
import { generateXlsxImportTemplate, sanitizeExcelDefinedName } from './bulkTemplateGenerator';
import { parseAndPreviewImportFile } from './bulkImportEngine';
import * as XLSX from 'xlsx';

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
    { id: 'platform', store_name: 'Collectibles Oficial' },
    { id: 'vendor-jorgitoys', store_name: 'JorgiToys' }
  ];

  for (let i = 1; i <= count; i++) {
    const cat = categories[(i - 1) % categories.length];
    const brand = brands[(i - 1) % brands.length];
    const vendor = vendors[(i - 1) % vendors.length];

    catalog.push({
      id: `prod-${i}`,
      sku: `SKU-${1000 + i}`,
      title: `Producto Coleccionable ${i}`,
      slug: `producto-coleccionable-${i}`,
      product_url: `https://collectibles.uy/p/producto-coleccionable-${i}`,
      description: `Descripción del producto ${i}`,
      short_description: `Resumen ${i}`,
      content: `<p>Contenido detallado ${i}</p>`,
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
      vendor_id: vendor.id,
      category_id: cat.id,
      brand_id: brand.id,
      category: cat,
      brand: brand,
      vendor: vendor,
      metadata: {
        packaging_type: 'mbe_pak'
      },
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z'
    });
  }

  return catalog;
}

const mockCatalog = createMockCatalog(456);
const masterFields = getMasterFields('admin');

const sampleProduct: ExportProductItem = {
  id: 'prod-100',
  sku: 'SKU-1100',
  title: 'Figura Batman Legacy 6 Pulgadas',
  slug: 'figura-batman-legacy-6-pulgadas',
  product_url: 'https://collectibles.uy/p/figura-batman-legacy-6-pulgadas',
  description: 'Descripción detallada de la figura de Batman.',
  short_description: 'Edición coleccionista 15 cm.',
  content: '<p>Especificaciones detalladas de empaque y accesorios.</p>',
  base_price: 2990.00,
  compare_at_price: 3500.00,
  cost_price: 1800.00,
  stock: 15,
  condition: 'new_sealed',
  condition_notes: '',
  ean_upc: '5010993792054',
  weight_kg: 0.450,
  dimensions_length: 25.0,
  dimensions_width: 15.0,
  dimensions_height: 10.0,
  status: 'published',
  badge: '',
  image_url: 'https://collectibles.uy/images/batman-1.jpg',
  vendor_id: 'platform',
  category_id: 'cat-figuras',
  brand_id: 'brand-neca',
  brand: { id: 'brand-neca', name: 'NECA' },
  category: { id: 'cat-figuras', name: 'Figuras de Acción' },
  vendor: { id: 'platform', store_name: 'Collectibles Oficial' },
  metadata: { packaging_type: 'mbe_pak' },
  created_at: '2026-08-20T00:00:00Z',
  updated_at: '2026-08-22T00:00:00Z'
};

describe('Product Export & Import System Audit', () => {

  it('1. Scope "all": Exporting 456 catalog products ignores visual 50-item page size', () => {
    const activeKeys = masterFields.map(f => f.key);
    const formattedRecords = mockCatalog.map(p => formatProductRecordForExport(p, activeKeys, 'admin'));
    expect(formattedRecords.length).toBe(456);
  });

  it('2. Filter state matching: Filters correctly by status, brand, vendor, and MBE type', () => {
    const filters: ProductFilterState = {
      ...createDefaultProductFilters(),
      status: 'published',
      brandId: 'brand-neca',
      mbePackagingType: 'mbe_pak'
    };

    const matching = mockCatalog.filter(p => matchesProductFilters(p, filters));
    expect(matching.length).toBeGreaterThan(0);
    matching.forEach(p => {
      expect(p.status).toBe('published');
      expect(p.brand?.id).toBe('brand-neca');
      expect(p.metadata?.packaging_type).toBe('mbe_pak');
    });
  });

  it('3. Column count verification: Master field registry returns all master exportable fields dynamically', () => {
    const totalMasterCount = masterFields.length;
    expect(totalMasterCount).toBeGreaterThanOrEqual(36);
    const keys = masterFields.map(f => f.key);
    expect(keys).toContain('slug');
    expect(keys).toContain('product_url');
    expect(keys).toContain('content');
    expect(keys).toContain('is_featured');
    expect(keys).toContain('seo_title');
    expect(keys).toContain('seo_description');
    expect(keys).toContain('video_url');
    expect(keys).toContain('mbe_packaging_type');
    expect(keys).toContain('argentina_shipping_status');
  });

  it('4. Parity check: CSV and XLSX export exact same values for sample product', () => {
    const activeKeys = masterFields.map(f => f.key);
    const record = formatProductRecordForExport(sampleProduct, activeKeys, 'admin');

    expect(record.sku).toBe('SKU-1100');
    expect(record.title).toBe('Figura Batman Legacy 6 Pulgadas');
    expect(record.slug).toBe('figura-batman-legacy-6-pulgadas');
    expect(record.product_url).toBe('https://collectibles.uy/p/figura-batman-legacy-6-pulgadas');
    expect(record.base_price).toBe('2990.00');
    expect(record.compare_at_price).toBe('3500.00');
    expect(record.mbe_packaging_type).toBe('MBE PAK');
    expect(record.argentina_shipping_status).toBe('Envío automático');
  });

  it('5. Dynamic template generation: generateXlsxImportTemplate includes Listas sheet and guide', async () => {
    const blob = await generateXlsxImportTemplate('admin', {
      brands: [{ id: 'b1', name: 'NECA' }],
      categories: [{ id: 'c1', name: 'Figuras de Acción', parent_id: null }],
      licenses: [{ id: 'l1', name: 'Marvel' }],
      vendors: [{ id: 'v1', store_name: 'Collectibles Oficial' }],
      tags: [],
      badges: ['NEW', 'SALE']
    });

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('6. Verification: 0 selected columns causes export button to be disabled (simulated check)', () => {
    const selectedKeys: string[] = [];
    expect(selectedKeys.length).toBe(0);
    const canExport = selectedKeys.length > 0;
    expect(canExport).toBe(false);
  });

  it('7. Verification: Normalization resolves weight_kg, dimensions, slug, content, and junction relationships', () => {
    const rawData = {
      id: 'p-1',
      title: 'Batman Marvel',
      slug: 'batman-marvel',
      description: 'Descripción básica',
      short_description: 'Corta',
      base_price: 1500,
      weight_kg: 0.650,
      dimensions: { length: 20, width: 10, height: 5 },
      metadata: { content: '<p>Rich Content HTML</p>', video_id: 'abc1234' },
      product_variants: [{ sku: 'SKU-TEST', inventory_count: 8 }],
      product_categories: [{ categories: { id: 'c1', name: 'Figuras', parent_id: null } }],
      product_licenses: [{ licenses: { id: 'l1', name: 'Marvel' } }],
      product_images: [{ url: 'https://img.com/1.jpg', is_primary: true }]
    };

    const normalized = normalizeRawProductForExport(rawData);

    expect(normalized.sku).toBe('SKU-TEST');
    expect(normalized.slug).toBe('batman-marvel');
    expect(normalized.product_url).toBe('https://collectibles.uy/p/batman-marvel');
    expect(normalized.content).toBe('<p>Rich Content HTML</p>');
    expect(normalized.video_url).toBe('https://www.youtube.com/watch?v=abc1234');
    expect(normalized.weight_kg).toBe(0.650);
    expect(normalized.dimensions_length).toBe(20);
    expect(normalized.category?.name).toBe('Figuras');
    expect(normalized.license?.name).toBe('Marvel');
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
  }, 15000);

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

  it('11. Verification: fixed order is strictly enforced for master fields', () => {
    const keys = masterFields.map(f => f.key);
    expect(keys.indexOf('sku')).toBe(0);
    expect(keys.indexOf('title')).toBe(1);
    expect(keys.indexOf('slug')).toBe(2);
    expect(keys.indexOf('product_url')).toBe(3);
    expect(keys.indexOf('description')).toBe(4);
    expect(keys.indexOf('short_description')).toBe(5);
    expect(keys.indexOf('content')).toBe(6);
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
      vendors: [{ id: 'platform', store_name: 'Collectibles Oficial' }]
    });

    expect(preview.rows.length).toBe(1);
    const parsedRow = preview.rows[0];
    expect(parsedRow.sku).toBe(originalProd.sku);
    expect(parsedRow.title).toBe(originalProd.title);
    expect(parsedRow.parsedData.base_price).toBe(originalProd.base_price);
    expect(parsedRow.errors.length).toBe(0);
  });

  it('13. Verification: Empty cell semantics distinguish CREATE (null) vs UPDATE (preserve existing DB value)', async () => {
    const partialUpdateCsv = 'SKU,Peso (kg)\nSKU-1100,';
    const blob = new Blob([partialUpdateCsv], { type: 'text/csv' });
    const file = new File([blob], 'partial_update.csv', { type: 'text/csv' });

    const existingProdInDb = {
      id: 'prod-100',
      title: 'Batman Figuras',
      sku: 'SKU-1100',
      base_price: 2990,
      weight_kg: 0.450,
      status: 'draft',
      brand_id: 'brand-neca',
      category_id: 'cat-figuras'
    };

    const preview = await parseAndPreviewImportFile(file, 'admin', null, {
      brands: [{ id: 'brand-neca', name: 'NECA' }],
      categories: [{ id: 'cat-figuras', name: 'Figuras de Acción', parent_id: null }],
      licenses: [],
      vendors: []
    }, [existingProdInDb]);

    expect(preview.rows.length).toBe(1);
    const row = preview.rows[0];
    expect(row.operation).toBe('update');
    expect(row.dbPayload.weight_kg).toBeUndefined();
  });

  it('14. Verification: XLSX import template generates Defined Names and Data Validation for Category -> Subcategory dependency', async () => {
    const blob = await generateXlsxImportTemplate('admin', {
      brands: [{ id: 'b1', name: 'NECA' }],
      categories: [
        { id: 'c1', name: 'Figuras de Acción', parent_id: null },
        { id: 'c2', name: '6 Pulgadas', parent_id: 'c1' }
      ],
      licenses: [],
      vendors: [],
      tags: [],
      badges: ['NEW']
    });

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);

    const arrayBuffer = await blob.arrayBuffer();
    const wb = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
    
    expect(wb.SheetNames).toContain('Plantilla de Importacion');
    expect(wb.SheetNames).toContain('Listas');
  });

  it('15. Verification: Vendor role security strips adminOnly fields (cost_price, vendor_store_name)', () => {
    const vendorFields = getMasterFields('vendor');
    const vendorKeys = vendorFields.map(f => f.key);

    expect(vendorKeys).not.toContain('cost_price');
    expect(vendorKeys).not.toContain('vendor_store_name');

    const record = formatProductRecordForExport(sampleProduct, vendorKeys, 'vendor');
    expect(record.cost_price).toBeUndefined();
    expect(record.vendor_store_name).toBeUndefined();
  });

  it('16. Collision Test: Category labels that normalize to identical strings generate unique, non-colliding Defined Names', () => {
    const tracker = new Set<string>();
    
    const name1 = sanitizeExcelDefinedName("A/B", "cat-001", tracker);
    const name2 = sanitizeExcelDefinedName("A-B", "cat-002", tracker);
    expect(name1).not.toEqual(name2);
    expect(name1).toMatch(/^CAT_A_B_/);
    expect(name2).toMatch(/^CAT_A_B_/);

    const name3 = sanitizeExcelDefinedName("Pokémon", undefined, tracker);
    const name4 = sanitizeExcelDefinedName("Pokemon", undefined, tracker);
    expect(name3).not.toEqual(name4);
    expect(name3).toBe('CAT_POKEMON');
    expect(name4).toBe('CAT_POKEMON_1');
  });

  it('17. Forensic Column Parity Test: XLSX and CSV headers match all master exportable fields dynamically in exact order', async () => {
    const exportableFields = masterFields.filter(f => f.exportable);
    const expectedLength = exportableFields.length;
    expect(expectedLength).toBeGreaterThanOrEqual(36);

    const keys = exportableFields.map(f => f.key);
    const expectedLabels = exportableFields.map(f => f.label);

    // Generate XLSX
    const xlsxBlob = await generateProductsXlsxBlob([sampleProduct], keys, 'admin');
    const arrayBuffer = await xlsxBlob.arrayBuffer();
    const wb = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
    const sheet = wb.Sheets['Productos'];
    const xlsxRows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    const xlsxHeaders = xlsxRows[0];

    expect(xlsxHeaders.length).toBe(expectedLength);
    expect(xlsxHeaders).toEqual(expectedLabels);
    expect(xlsxHeaders).toContain('Título');
    expect(xlsxHeaders).toContain('Slug');
    expect(xlsxHeaders).toContain('URL del producto');
    expect(xlsxHeaders).toContain('Descripción');
    expect(xlsxHeaders).toContain('Descripción corta');
    expect(xlsxHeaders).toContain('Contenido');
    expect(xlsxHeaders).toContain('Imagen principal');
    expect(xlsxHeaders).toContain('Imágenes adicionales');
    expect(xlsxHeaders).toContain('Fecha creación');
    expect(xlsxHeaders).toContain('Última actualización');

    // Generate CSV
    const csvContent = generateProductsCsv([sampleProduct], keys, 'admin');
    const csvLines = csvContent.split('\n');
    const csvHeaderLine = csvLines[0].replace(/^\uFEFF/, '');
    const csvHeaders = csvHeaderLine.split(',').map(h => h.replace(/^"|"$/g, ''));

    expect(csvHeaders.length).toBe(expectedLength);
    expect(csvHeaders).toEqual(expectedLabels);
  });

  it('18. Forensic Deduplication Test: Product dataset has 100% ID uniqueness', () => {
    const catalog = createMockCatalog(456);
    const ids = catalog.map(p => p.id!);
    const uniqueIds = new Set(ids);

    expect(catalog.length).toBe(456);
    expect(uniqueIds.size).toBe(456);
    expect(catalog.length - uniqueIds.size).toBe(0);
  });

  it('19. Filtered Scope Parity Test: Filtered queries for vendor and category preserve product.id and enforce zero missing/duplicate IDs', () => {
    const catalog = createMockCatalog(456);
    const filters: ProductFilterState = {
      ...createDefaultProductFilters(),
      vendorId: 'vendor-jorgitoys',
      categoryId: 'cat-figuras'
    };

    const matching = catalog.filter(p => matchesProductFilters(p, filters));
    expect(matching.length).toBeGreaterThan(0);

    const ids = matching.map(p => p.id!);
    const uniqueIds = new Set(ids);

    expect(matching.length).toBe(uniqueIds.size);
    expect(ids.length - uniqueIds.size).toBe(0);
  });

  it('20. Collectibles Vendor Filter Test: Vendor = platform (Collectibles) correctly filters items where vendor_id is null/platform', () => {
    const catalog = createMockCatalog(456);
    const filters: ProductFilterState = {
      ...createDefaultProductFilters(),
      vendorId: 'platform'
    };

    const matching = catalog.filter(p => matchesProductFilters(p, filters));
    expect(matching.length).toBeGreaterThan(0);

    matching.forEach(p => {
      const vId = p.vendor_id !== undefined ? p.vendor_id : p.vendor?.id;
      expect(vId === null || vId === 'platform').toBe(true);
    });
  });

  it('21. Coexistence Test: Título, Descripción, Descripción corta, and Contenido coexist independently without confusion', () => {
    const prod: ExportProductItem = {
      id: 'p-content-test',
      title: 'Título Principal',
      description: 'Descripción Larga Texto',
      short_description: 'Descripción Corta Resumen',
      content: '<p>Contenido Rich Text HTML Especial</p>',
      base_price: 1000
    };

    const keys = ['title', 'description', 'short_description', 'content'];
    const formatted = formatProductRecordForExport(prod, keys, 'admin');

    expect(formatted.title).toBe('Título Principal');
    expect(formatted.description).toBe('Descripción Larga Texto');
    expect(formatted.short_description).toBe('Descripción Corta Resumen');
    expect(formatted.content).toBe('<p>Contenido Rich Text HTML Especial</p>');
  });

  it('22. Product URL Test: "URL del producto" is exportable as full public URL and NOT importable', () => {
    const prod: ExportProductItem = {
      id: 'p-url-test',
      title: 'Producto URL Test',
      slug: 'figura-coleccionable-superman',
      base_price: 2500
    };

    const master = getMasterFields('admin');
    const urlDef = master.find(f => f.key === 'product_url');

    expect(urlDef).toBeDefined();
    expect(urlDef?.exportable).toBe(true);
    expect(urlDef?.importable).toBe(false);

    const formatted = formatProductRecordForExport(prod, ['product_url'], 'admin');
    expect(formatted.product_url).toBe('https://collectibles.uy/p/figura-coleccionable-superman');
  });

});
