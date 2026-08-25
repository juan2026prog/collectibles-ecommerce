import { describe, it, expect } from 'vitest';
import { parseAndPreviewImportFile, executeBulkImport } from './bulkImportEngine';
import { generateProductsXlsxBlob } from './bulkExportUtils';
import { getMasterFields } from './productFieldRegistry';
import ExcelJS from 'exceljs';

describe('Bulk Import Engine & Round-Trip Architectural Tests', () => {
  const masterFields = getMasterFields('admin').filter(f => f.exportable);

  const mockDbProducts = [
    {
      id: '00055f0d-645e-43f3-b533-35681cd65c81',
      title: 'Harry Potter! Eraser Gomee (c/u) Varios Modelos',
      slug: 'harry-potter-eraser-gomee-c-u-varios-modelos',
      description: null,
      short_description: null,
      base_price: 150,
      compare_at_price: null,
      cost_price: null,
      status: 'published',
      vendor_id: null,
      weight_kg: null,
      dimensions: null,
      metadata: { category_name: 'Funko Pop! Marvel' }, // Legacy category in DB
      brand_id: null, // Untouched missing brand in DB
      category_id: 'cat-legacy-1',
      badge: null,
      condition: null,
      condition_notes: null,
      is_featured: false,
      seo_title: null,
      seo_description: null,
      meta_title: null,
      meta_description: null,
      brand: null,
      category: { id: 'cat-legacy-1', name: 'Funko Pop! Marvel' },
      license: null,
      stock: 9,
      variants: [{ id: 'var-1', sku: '', inventory_count: 9 }] // Product WITHOUT SKU
    },
    {
      id: 'b1111111-2222-3333-4444-555555555555',
      title: 'Batman Animated Series Figure 6 Inch',
      slug: 'batman-animated-series-figure-6-inch',
      description: 'Action figure 6 inch',
      short_description: 'Batman 6 inch',
      base_price: 2500,
      compare_at_price: 3000,
      cost_price: 1500,
      status: 'published',
      vendor_id: null,
      weight_kg: 0.500,
      dimensions: { length: 10, width: 5, height: 20 },
      metadata: {},
      brand_id: 'brand-neca',
      category_id: 'cat-figuras',
      badge: 'HOT',
      condition: 'new_sealed',
      condition_notes: null,
      is_featured: true,
      seo_title: 'Batman Animated Series',
      seo_description: 'Batman figure',
      meta_title: 'Batman Animated Series',
      meta_description: 'Batman figure',
      brand: { id: 'brand-neca', name: 'NECA' },
      category: { id: 'cat-figuras', name: 'Figuras' },
      license: { id: 'lic-dc', name: 'DC Comics' },
      stock: 15,
      variants: [{ id: 'var-2', sku: 'BAT-ANIM-01', inventory_count: 15 }]
    }
  ];

  const mockMetadata = {
    brands: [{ id: 'brand-neca', name: 'NECA' }],
    categories: [
      { id: 'cat-figuras', name: 'Figuras', parent_id: null },
      { id: 'cat-legacy-1', name: 'Funko Pop! Marvel', parent_id: null }
    ],
    licenses: [{ id: 'lic-dc', name: 'DC Comics' }],
    vendors: [],
    tags: [],
    badges: ['HOT']
  };

  it('1. Round-Trip Idempotency Test: Export -> Import without edits produces 0 CREATE, 0 UPDATE, ALL UNCHANGED, 0 ERROR', async () => {
    // Generate exported Blob
    const blob = await generateProductsXlsxBlob(
      mockDbProducts,
      masterFields.map(f => f.key),
      'admin',
      'Productos',
      mockMetadata
    );

    const file = new File([blob], 'Productos_Export_Intact.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    const preview = await parseAndPreviewImportFile(file, 'admin', null, mockMetadata, mockDbProducts);

    expect(preview.summary.totalRows).toBe(2);
    expect(preview.summary.newCount).toBe(0);
    expect(preview.summary.updateCount).toBe(0);
    expect(preview.summary.unchangedCount).toBe(2);
    expect(preview.summary.errorCount).toBe(0);
  });

  it('2. Partial Update Test: Editing only weight_kg on 1 item produces 0 CREATE, 1 UPDATE, 1 UNCHANGED, 0 ERROR and minimal payload', async () => {
    // Build XLSX with modified weight for product #1 (Harry Potter)
    const blob = await generateProductsXlsxBlob(
      mockDbProducts,
      masterFields.map(f => f.key),
      'admin',
      'Productos',
      mockMetadata
    );

    // Load workbook and edit weight of row 2 (Harry Potter) to 0.460
    const buffer = await blob.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const sheet = wb.getWorksheet('Productos')!;

    // Find column index for "Peso (kg)"
    const headerRow = sheet.getRow(1);
    let weightCol = 0;
    headerRow.eachCell((cell, colNum) => {
      if (cell.value === 'Peso (kg)') weightCol = colNum;
    });

    sheet.getRow(2).getCell(weightCol).value = 0.460;

    const modifiedBuffer = await wb.xlsx.writeBuffer();
    const file = new File([modifiedBuffer], 'Productos_Weight_Edited.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    const preview = await parseAndPreviewImportFile(file, 'admin', null, mockMetadata, mockDbProducts);

    expect(preview.summary.totalRows).toBe(2);
    expect(preview.summary.newCount).toBe(0);
    expect(preview.summary.updateCount).toBe(1);
    expect(preview.summary.unchangedCount).toBe(1);
    expect(preview.summary.errorCount).toBe(0);

    const updatedRow = preview.rows.find(r => r.operation === 'update');
    expect(updatedRow).toBeDefined();
    expect(updatedRow?.dbPayload).toEqual({ weight_kg: 0.460 });
    expect(updatedRow?.changedFieldsDetail).toHaveLength(1);
    expect(updatedRow?.changedFieldsDetail[0].fieldKey).toBe('weight_kg');
  });

  it('3. Existing Product Without SKU Matching via _product_id and slug Fallback', async () => {
    const noSkuProduct = mockDbProducts[0]; // sku is ""
    expect(noSkuProduct.variants[0].sku).toBe('');

    // Test matching via _product_id
    const blob = await generateProductsXlsxBlob(
      [noSkuProduct],
      masterFields.map(f => f.key),
      'admin',
      'Productos',
      mockMetadata
    );

    const file = new File([blob], 'No_Sku_Product.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    const preview = await parseAndPreviewImportFile(file, 'admin', null, mockMetadata, mockDbProducts);

    expect(preview.summary.totalRows).toBe(1);
    expect(preview.summary.newCount).toBe(0);
    expect(preview.summary.errorCount).toBe(0);
    expect(preview.rows[0].existingProductId).toBe(noSkuProduct.id);
  });

  it('4. Legacy Untouched Fields (missing brand, legacy category) do NOT produce validation errors on UPDATE', async () => {
    const legacyProd = mockDbProducts[0];
    expect(legacyProd.brand_id).toBeNull(); // Missing brand

    const blob = await generateProductsXlsxBlob(
      [legacyProd],
      masterFields.map(f => f.key),
      'admin',
      'Productos',
      mockMetadata
    );

    const file = new File([blob], 'Legacy_Product.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    const preview = await parseAndPreviewImportFile(file, 'admin', null, mockMetadata, mockDbProducts);

    expect(preview.summary.errorCount).toBe(0);
    expect(preview.rows[0].errors).toHaveLength(0);
  });

  it('5. Identity Conflict Detection: Reject row when _product_id and SKU correspond to different DB products', async () => {
    const blob = await generateProductsXlsxBlob(
      [mockDbProducts[0]],
      masterFields.map(f => f.key),
      'admin',
      'Productos',
      mockMetadata
    );

    const buffer = await blob.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const sheet = wb.getWorksheet('Productos')!;

    // Row 2 has _product_id of Harry Potter, but set SKU of Batman
    let skuCol = 0;
    sheet.getRow(1).eachCell((cell, colNum) => {
      if (cell.value === 'SKU') skuCol = colNum;
    });
    sheet.getRow(2).getCell(skuCol).value = 'BAT-ANIM-01'; // Belongs to product #2

    const conflictBuffer = await wb.xlsx.writeBuffer();
    const file = new File([conflictBuffer], 'Conflict.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    const preview = await parseAndPreviewImportFile(file, 'admin', null, mockMetadata, mockDbProducts);

    expect(preview.summary.errorCount).toBe(1);
    expect(preview.rows[0].operation).toBe('invalid');
    expect(preview.rows[0].errors[0]).toContain('Conflicto de identidad');
  });

  it('6. Condition Em-Dash Placeholder Normalization: "—" is normalized to null and untouched on UPDATE', async () => {
    const blob = await generateProductsXlsxBlob(
      [mockDbProducts[0]],
      masterFields.map(f => f.key),
      'admin',
      'Productos',
      mockMetadata
    );

    const buffer = await blob.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const sheet = wb.getWorksheet('Productos')!;

    let condCol = 0;
    sheet.getRow(1).eachCell((cell, colNum) => {
      if (cell.value === 'Condición') condCol = colNum;
    });
    sheet.getRow(2).getCell(condCol).value = '—';

    const dashBuffer = await wb.xlsx.writeBuffer();
    const file = new File([dashBuffer], 'EmDash.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    const preview = await parseAndPreviewImportFile(file, 'admin', null, mockMetadata, mockDbProducts);

    expect(preview.summary.errorCount).toBe(0);
    expect(preview.rows[0].operation).toBe('unchanged');
  });

  it('7. Accounting Invariant Test: READ === CREATE + UPDATE + UNCHANGED + ERROR is strictly preserved', async () => {
    const blob = await generateProductsXlsxBlob(
      mockDbProducts,
      masterFields.map(f => f.key),
      'admin',
      'Productos',
      mockMetadata
    );

    const file = new File([blob], 'Accounting.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    const preview = await parseAndPreviewImportFile(file, 'admin', null, mockMetadata, mockDbProducts);

    const sum = preview.summary.newCount + preview.summary.updateCount + preview.summary.unchangedCount + preview.summary.errorCount;
    expect(preview.summary.totalRows).toBe(sum);
  });
});
