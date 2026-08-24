import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { findFieldDefinition, getMasterFields } from './productFieldRegistry';
import type { ProductFieldDefinition } from './productFieldRegistry';
import { validateProductForPublication } from './productPublicationValidator';
import type { PublicationValidationError } from './productPublicationValidator';
import { normalizeCondition } from '../config/conditionConfig';
import { fetchCatalogMetadataForTemplate } from './bulkTemplateGenerator';
import type { CatalogMetadata } from './bulkTemplateGenerator';
import { sanitizeMbePackagingType, mergeMbePackagingType, resolveMbePackagingTypeInput, resolveArgentinaShippingStatusInput } from './mbeLogisticsUtils';
import { slugify, isProhibitedSlug } from './slugUtils';

export interface ParsedImportRow {
  rowIndex: number;
  rawRow: Record<string, any>;
  sku: string;
  title: string;
  operation: 'create' | 'update' | 'unchanged' | 'invalid';
  existingProductId?: string;
  
  // Normalized field values parsed from row
  parsedData: Record<string, any>;
  // Explicit DB column payloads resolved (IDs for FKs)
  dbPayload: Record<string, any>;
  
  // Specific relation resolution
  resolvedBrandId?: string | null;
  resolvedCategoryId?: string | null;
  resolvedSubcategoryId?: string | null;
  resolvedLicenseId?: string | null;
  resolvedVendorId?: string | null;
  
  errors: string[];
  warnings: string[];
}

export interface ImportPreviewResult {
  summary: {
    totalRows: number;
    newCount: number;
    updateCount: number;
    unchangedCount: number;
    errorCount: number;
    warningCount: number;
  };
  rows: ParsedImportRow[];
  headersFound: string[];
  includedFieldKeys: string[];
}

export interface ImportExecutionResult {
  successCount: number;
  createdCount: number;
  updatedCount: number;
  rejectedCount: number;
  errors: { rowIndex: number; sku: string; error: string }[];
}

/**
 * Normalizes string keys for row matching.
 */
function normalizeKey(str: string): string {
  return str.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Reads a File (CSV or XLSX) into raw JSON objects.
 */
export async function readRawFileRows(file: File): Promise<{ rawRows: Record<string, any>[]; headersFound: string[] }> {
  let arrayBuffer: ArrayBuffer;
  if (typeof file.arrayBuffer === 'function') {
    arrayBuffer = await file.arrayBuffer();
  } else {
    arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as ArrayBuffer);
      reader.onerror = (err) => reject(err);
      reader.readAsArrayBuffer(file);
    });
  }

  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  let firstSheetName = workbook.SheetNames.find(s => s === 'Productos' || s === 'Plantilla de Importacion') || workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  if (!sheet) {
    return { rawRows: [], headersFound: [] };
  }

  const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  
  const headersFound: string[] = [];
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
  for (let C = range.s.c; C <= range.e.c; ++C) {
    const cell = sheet[XLSX.utils.encode_cell({ r: range.s.r, c: C })];
    if (cell && cell.v !== undefined && cell.v !== null) {
      headersFound.push(String(cell.v).trim());
    }
  }

  return { rawRows, headersFound };
}

/**
 * Helper to generate unique URL slug.
 */
function generateSlug(title: string): string {
  const base = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${base}-${Math.floor(1000 + Math.random() * 9000)}`;
}

/**
 * Parses and validates an uploaded import file against Collectibles.uy database.
 */
export async function parseAndPreviewImportFile(
  file: File,
  userRole: 'admin' | 'vendor' = 'admin',
  currentVendorId: string | null = null,
  providedMetadata?: CatalogMetadata,
  providedExistingProducts?: any[]
): Promise<ImportPreviewResult> {
  const { rawRows, headersFound } = await readRawFileRows(file);
  const metadata = providedMetadata || (await fetchCatalogMetadataForTemplate());

  // Identify which master fields correspond to headers found in the file
  const headerToFieldMap = new Map<string, ProductFieldDefinition>();
  const includedFieldKeysSet = new Set<string>();

  headersFound.forEach(header => {
    const fieldDef = findFieldDefinition(header);
    if (fieldDef) {
      headerToFieldMap.set(normalizeKey(header), fieldDef);
      includedFieldKeysSet.add(fieldDef.key);
    }
  });

  const includedFieldKeys = Array.from(includedFieldKeysSet);

  if (rawRows.length === 0) {
    return {
      summary: { totalRows: 0, newCount: 0, updateCount: 0, unchangedCount: 0, errorCount: 0, warningCount: 0 },
      rows: [],
      headersFound,
      includedFieldKeys
    };
  }

  // Pre-fetch existing products by SKU to identify updates vs creates
  const skusInFile = rawRows
    .map(r => {
      for (const k in r) {
        const fDef = headerToFieldMap.get(normalizeKey(k));
        if (fDef?.key === 'sku') return String(r[k]).trim();
      }
      return '';
    })
    .filter(Boolean);

  const existingProductsMap = new Map<string, any>();

  if (providedExistingProducts && providedExistingProducts.length > 0) {
    providedExistingProducts.forEach(p => {
      const pSku = p.sku || p.variants?.[0]?.sku;
      if (pSku) existingProductsMap.set(pSku, p);
    });
  } else if (skusInFile.length > 0) {
    const { data: dbProducts } = await supabase
      .from('products')
      .select('id, title, base_price, status, vendor_id, weight_kg, dimensions, metadata, variants:product_variants(sku, inventory_count)')
      .in('id', (
        await supabase
          .from('product_variants')
          .select('product_id')
          .in('sku', skusInFile)
      ).data?.map(v => v.product_id) || []);

    if (dbProducts) {
      dbProducts.forEach(p => {
        const sku = p.variants?.[0]?.sku || p.sku;
        if (sku) {
          existingProductsMap.set(sku, p);
        }
      });
    }
  }

  const parsedRows: ParsedImportRow[] = [];
  let newCount = 0;
  let updateCount = 0;
  let unchangedCount = 0;
  let errorCount = 0;
  let warningCount = 0;

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];
    const rowIndex = i + 2; // Row 1 is headers
    const rowErrors: string[] = [];
    const rowWarnings: string[] = [];

    const rowValuesByKey: Record<string, any> = {};

    // Map raw row cells to master field keys
    for (const rawColKey in raw) {
      const fDef = headerToFieldMap.get(normalizeKey(rawColKey));
      if (fDef) {
        const cellVal = raw[rawColKey];
        if (cellVal !== undefined && cellVal !== null && cellVal !== '') {
          rowValuesByKey[fDef.key] = cellVal;
        }
      }
    }

    const sku = (rowValuesByKey.sku || '').toString().trim();
    const title = (rowValuesByKey.title || '').toString().trim();

    // Check existing product
    const existingProduct = sku ? existingProductsMap.get(sku) : null;
    let operation: 'create' | 'update' | 'unchanged' | 'invalid' = existingProduct ? 'update' : 'create';

    // Security Check: Non-admin Vendors can only update their OWN products
    if (userRole === 'vendor' && existingProduct) {
      if (currentVendorId && existingProduct.vendor_id !== currentVendorId) {
        rowErrors.push(`Seguridad: El producto con SKU "${sku}" pertenece a otro vendedor y no tienes permiso para modificarlo.`);
      }
    }

    // Security Check: Non-admin Vendors cannot modify admin-only fields
    if (userRole === 'vendor') {
      if (rowValuesByKey.cost_price !== undefined || rowValuesByKey.vendor_store_name !== undefined) {
        rowErrors.push('Seguridad: No tienes autorización para modificar campos administrativos restringidos (Costo / Vendedor).');
      }
    }

    // 1. Resolve Brand
    let resolvedBrandId: string | null = null;
    if (rowValuesByKey.brand_name) {
      const bName = String(rowValuesByKey.brand_name).trim().toLowerCase();
      const matchedBrand = metadata.brands.find(b => b.name.toLowerCase().trim() === bName);
      if (matchedBrand) {
        resolvedBrandId = matchedBrand.id;
      } else {
        rowErrors.push(`La marca "${rowValuesByKey.brand_name}" no existe en Collectibles.uy.`);
      }
    }

    // 2. Resolve Main Category
    let resolvedCategoryId: string | null = null;
    if (rowValuesByKey.category_name) {
      const cName = String(rowValuesByKey.category_name).trim().toLowerCase();
      const matchedCat = metadata.categories.find(c => !c.parent_id && c.name.toLowerCase().trim() === cName);
      if (matchedCat) {
        resolvedCategoryId = matchedCat.id;
      } else {
        rowErrors.push(`La categoría "${rowValuesByKey.category_name}" no existe en Collectibles.uy.`);
      }
    }

    // 3. Resolve Subcategory
    let resolvedSubcategoryId: string | null = null;
    if (rowValuesByKey.subcategory_name) {
      const sName = String(rowValuesByKey.subcategory_name).trim().toLowerCase();
      const matchedSubcat = metadata.categories.find(c => 
        c.parent_id !== null && 
        c.name.toLowerCase().trim() === sName &&
        (!resolvedCategoryId || c.parent_id === resolvedCategoryId)
      );
      if (matchedSubcat) {
        resolvedSubcategoryId = matchedSubcat.id;
      } else {
        rowErrors.push(`La subcategoría "${rowValuesByKey.subcategory_name}" no existe o no pertenece a la categoría especificada.`);
      }
    }

    // 4. Resolve License
    let resolvedLicenseId: string | null = null;
    if (rowValuesByKey.license_name) {
      const lName = String(rowValuesByKey.license_name).trim().toLowerCase();
      const matchedLicense = metadata.licenses.find(l => l.name.toLowerCase().trim() === lName);
      if (matchedLicense) {
        resolvedLicenseId = matchedLicense.id;
      } else {
        rowErrors.push(`La licencia "${rowValuesByKey.license_name}" no existe en Collectibles.uy.`);
      }
    }

    // 5. Resolve Vendor (Admin only)
    let resolvedVendorId: string | null = null;
    if (userRole === 'admin' && rowValuesByKey.vendor_store_name) {
      const vName = String(rowValuesByKey.vendor_store_name).trim().toLowerCase();
      if (vName === 'collectibles oficial' || vName === 'platform' || vName === 'plataforma') {
        resolvedVendorId = null;
      } else {
        const matchedVendor = metadata.vendors.find(v => v.store_name.toLowerCase().trim() === vName);
        if (matchedVendor) {
          resolvedVendorId = matchedVendor.id;
        } else {
          rowErrors.push(`El vendedor "${rowValuesByKey.vendor_store_name}" no existe en Collectibles.uy.`);
        }
      }
    } else if (userRole === 'vendor' && currentVendorId) {
      resolvedVendorId = currentVendorId;
    }

    // Validate Tipo MBE
    let parsedMbeType: string | null | undefined;
    if (rowValuesByKey.mbe_packaging_type !== undefined) {
      const rawMbe = String(rowValuesByKey.mbe_packaging_type).trim();
      const resolved = resolveMbePackagingTypeInput(rawMbe);
      if (resolved === undefined) {
        rowErrors.push(`Fila ${rowIndex}: "${rawMbe}" no es un Tipo MBE válido.`);
      } else {
        parsedMbeType = resolved;
      }
    }

    // Validate Estado AR
    let parsedArStatus: string | null | undefined;
    if (rowValuesByKey.argentina_shipping_status !== undefined) {
      const rawAr = String(rowValuesByKey.argentina_shipping_status).trim();
      const resolved = resolveArgentinaShippingStatusInput(rawAr);
      if (resolved === undefined) {
        rowErrors.push(`Fila ${rowIndex}: "${rawAr}" no es un Estado AR válido.`);
      } else {
        parsedArStatus = resolved;
      }
    }

    // Validate Numbers & Strings
    let parsedPrice: number | undefined;
    if (rowValuesByKey.base_price !== undefined && String(rowValuesByKey.base_price).trim() !== '') {
      parsedPrice = parseFloat(String(rowValuesByKey.base_price).replace(/[^0-9.]/g, ''));
      if (isNaN(parsedPrice) || parsedPrice < 0) {
        rowErrors.push('El precio debe ser un número positivo.');
      }
    }

    let parsedStock: number | undefined;
    if (rowValuesByKey.stock !== undefined && String(rowValuesByKey.stock).trim() !== '') {
      parsedStock = parseInt(String(rowValuesByKey.stock), 10);
      if (isNaN(parsedStock) || parsedStock < 0) {
        rowErrors.push('El stock no puede ser un número negativo.');
      }
    }

    let parsedWeight: number | undefined;
    if (rowValuesByKey.weight_kg !== undefined && String(rowValuesByKey.weight_kg).trim() !== '') {
      parsedWeight = parseFloat(String(rowValuesByKey.weight_kg).replace(/[^0-9.]/g, ''));
      if (isNaN(parsedWeight) || parsedWeight < 0) {
        rowErrors.push('El peso debe ser un número positivo (ej: 0.450).');
      }
    }

    let parsedLength: number | undefined;
    if (rowValuesByKey.dimensions_length !== undefined && String(rowValuesByKey.dimensions_length).trim() !== '') {
      parsedLength = parseFloat(String(rowValuesByKey.dimensions_length).replace(/[^0-9.]/g, ''));
    }

    let parsedWidth: number | undefined;
    if (rowValuesByKey.dimensions_width !== undefined && String(rowValuesByKey.dimensions_width).trim() !== '') {
      parsedWidth = parseFloat(String(rowValuesByKey.dimensions_width).replace(/[^0-9.]/g, ''));
    }

    let parsedHeight: number | undefined;
    if (rowValuesByKey.dimensions_height !== undefined && String(rowValuesByKey.dimensions_height).trim() !== '') {
      parsedHeight = parseFloat(String(rowValuesByKey.dimensions_height).replace(/[^0-9.]/g, ''));
    }

    // Condition normalization
    let parsedCondition: string | undefined;
    if (rowValuesByKey.condition !== undefined) {
      const normCond = normalizeCondition(String(rowValuesByKey.condition));
      if (!normCond) {
        rowErrors.push(`La condición "${rowValuesByKey.condition}" no es válida.`);
      } else {
        parsedCondition = normCond;
      }
    }

    // Status validation
    let parsedStatus = rowValuesByKey.status ? String(rowValuesByKey.status).trim().toLowerCase() : (existingProduct?.status || 'draft');
    if (!['published', 'draft', 'archived'].includes(parsedStatus)) {
      rowErrors.push(`El estado "${rowValuesByKey.status}" no es válido (usar: published, draft, archived).`);
      parsedStatus = 'draft';
    }

    // Run Central Publication Validator if publishing or creating new published item
    if (operation === 'create') {
      if (!title) {
        rowErrors.push('El título del producto es obligatorio para crear un producto nuevo.');
      }
    }

    const validationResult = validateProductForPublication({
      form: {
        title: title || existingProduct?.title || '',
        base_price: parsedPrice !== undefined ? parsedPrice : existingProduct?.base_price,
        categories: resolvedCategoryId ? [resolvedCategoryId] : undefined,
        brands: resolvedBrandId ? [resolvedBrandId] : undefined,
        image_url: rowValuesByKey.image_url || existingProduct?.image_url,
        stock: parsedStock !== undefined ? parsedStock : existingProduct?.variants?.[0]?.inventory_count,
        condition: parsedCondition || existingProduct?.condition,
        vendor_id: resolvedVendorId
      },
      userRole,
      storeType: 'standard',
      targetStatus: parsedStatus as 'published' | 'draft' | 'archived',
      brandsList: metadata.brands
    });

    if (!validationResult.isValid) {
      validationResult.errors.forEach(e => rowErrors.push(e.message));
    }
    if (validationResult.hasWarnings) {
      validationResult.warnings.forEach(w => rowWarnings.push(w.message));
    }

    if (rowErrors.length > 0) {
      operation = 'invalid';
      errorCount++;
    } else if (operation === 'create') {
      newCount++;
    } else {
      updateCount++;
    }

    if (rowWarnings.length > 0) warningCount++;

    // Build explicit DB column payload for upsert
    const dbPayload: Record<string, any> = {};
    if (title) dbPayload.title = title;
    if (rowValuesByKey.description !== undefined) dbPayload.description = rowValuesByKey.description;
    if (rowValuesByKey.short_description !== undefined) dbPayload.short_description = rowValuesByKey.short_description;
    if (parsedPrice !== undefined) dbPayload.base_price = parsedPrice;
    if (rowValuesByKey.compare_at_price !== undefined) dbPayload.compare_at_price = parseFloat(rowValuesByKey.compare_at_price) || null;
    if (userRole === 'admin' && rowValuesByKey.cost_price !== undefined) dbPayload.cost_price = parseFloat(rowValuesByKey.cost_price) || null;
    if (parsedStatus) dbPayload.status = parsedStatus;
    if (resolvedBrandId) dbPayload.brand_id = resolvedBrandId;
    if (resolvedCategoryId) dbPayload.category_id = resolvedCategoryId;
    if (resolvedVendorId !== undefined) dbPayload.vendor_id = resolvedVendorId;
    if (rowValuesByKey.badge !== undefined) dbPayload.badge = rowValuesByKey.badge;
    if (parsedCondition) dbPayload.condition = parsedCondition;
    if (rowValuesByKey.condition_notes !== undefined) dbPayload.condition_notes = rowValuesByKey.condition_notes;
    if (parsedWeight !== undefined) dbPayload.weight_kg = parsedWeight;

    if (rowValuesByKey.slug !== undefined) {
      const rawSlug = String(rowValuesByKey.slug).trim();
      if (isProhibitedSlug(rawSlug)) {
        warnings.push({
          fieldKey: 'slug',
          message: `Slug prohibido de Mercado Libre '${rawSlug}' detectado. Se regeneró automáticamente un slug limpio desde el título.`
        });
        dbPayload.slug = slugify(row.title);
      } else {
        dbPayload.slug = slugify(rawSlug);
      }
    }
    if (rowValuesByKey.is_featured !== undefined) {
      const featVal = String(rowValuesByKey.is_featured).trim().toLowerCase();
      dbPayload.is_featured = featVal === 'true' || featVal === 'sí' || featVal === 'si' || featVal === '1';
    }
    if (rowValuesByKey.seo_title !== undefined) {
      dbPayload.seo_title = rowValuesByKey.seo_title;
      dbPayload.meta_title = rowValuesByKey.seo_title;
    }
    if (rowValuesByKey.seo_description !== undefined) {
      dbPayload.seo_description = rowValuesByKey.seo_description;
      dbPayload.meta_description = rowValuesByKey.seo_description;
    }
    if (rowValuesByKey.content !== undefined || rowValuesByKey.video_url !== undefined) {
      dbPayload.metadata = dbPayload.metadata || {};
      if (rowValuesByKey.content !== undefined) dbPayload.metadata.content = rowValuesByKey.content;
      if (rowValuesByKey.video_url !== undefined) dbPayload.metadata.video_url = rowValuesByKey.video_url;
    }

    // Dimensions in metadata
    if (parsedLength !== undefined || parsedWidth !== undefined || parsedHeight !== undefined) {
      dbPayload.dimensions = {
        length: parsedLength ?? 0,
        width: parsedWidth ?? 0,
        height: parsedHeight ?? 0
      };
    }

    parsedRows.push({
      rowIndex,
      rawRow: raw,
      sku: sku || `SKU-${rowIndex}`,
      title: title || (existingProduct?.title || `Fila ${rowIndex}`),
      operation,
      existingProductId: existingProduct?.id,
      parsedData: {
        ...rowValuesByKey,
        resolvedMbeType: parsedMbeType,
        resolvedArStatus: parsedArStatus
      },
      dbPayload,
      resolvedBrandId,
      resolvedCategoryId,
      resolvedSubcategoryId,
      resolvedLicenseId,
      resolvedVendorId,
      errors: rowErrors,
      warnings: rowWarnings
    });
  }

  return {
    summary: {
      totalRows: rawRows.length,
      newCount,
      updateCount,
      unchangedCount,
      errorCount,
      warningCount
    },
    rows: parsedRows,
    headersFound,
    includedFieldKeys
  };
}

/**
 * Executes the bulk import of validated rows into Supabase database.
 */
export async function executeBulkImport(
  rows: ParsedImportRow[],
  userRole: 'admin' | 'vendor' = 'admin',
  currentVendorId: string | null = null
): Promise<ImportExecutionResult> {
  const validRows = rows.filter(r => r.operation === 'create' || r.operation === 'update');

  let successCount = 0;
  let createdCount = 0;
  let updatedCount = 0;
  let rejectedCount = 0;
  const errors: { rowIndex: number; sku: string; error: string }[] = [];

  for (const row of validRows) {
    try {
      if (row.operation === 'create') {
        const slug = generateSlug(row.title);
        
        // Build metadata
        let initialMeta: any = {
          condition: row.dbPayload.condition || null,
          condition_notes: row.dbPayload.condition_notes || null,
          dimensions: row.dbPayload.dimensions || null,
          image_url: row.parsedData.image_url || null,
          subcategory_id: row.resolvedSubcategoryId || null,
          ...(row.dbPayload.metadata || {})
        };

        if (row.parsedData.resolvedMbeType !== undefined) {
          initialMeta = mergeMbePackagingType(initialMeta, row.parsedData.resolvedMbeType);
        }
        if (row.parsedData.resolvedArStatus !== undefined && row.parsedData.resolvedArStatus) {
          initialMeta.argentina_status = row.parsedData.resolvedArStatus;
        }

        const productInsertPayload: any = {
          title: row.title,
          slug,
          description: row.dbPayload.description || null,
          short_description: row.dbPayload.short_description || null,
          base_price: row.dbPayload.base_price || 0,
          compare_at_price: row.dbPayload.compare_at_price || null,
          status: row.dbPayload.status || 'draft',
          brand_id: row.resolvedBrandId || null,
          category_id: row.resolvedCategoryId || null,
          vendor_id: userRole === 'vendor' ? currentVendorId : row.resolvedVendorId,
          badge: row.dbPayload.badge || null,
          weight_kg: row.dbPayload.weight_kg || null,
          metadata: initialMeta
        };

        const { data: newProd, error: createErr } = await supabase
          .from('products')
          .insert(productInsertPayload)
          .select()
          .single();

        if (createErr || !newProd) {
          throw new Error(createErr?.message || 'Error al crear producto.');
        }

        // Insert variant with SKU and stock
        const { error: varErr } = await supabase
          .from('product_variants')
          .insert({
            product_id: newProd.id,
            sku: row.sku,
            name: row.title,
            inventory_count: row.parsedData.stock !== undefined ? parseInt(String(row.parsedData.stock), 10) : 10,
            is_active: true
          });

        if (varErr) {
          console.warn('[BulkImportEngine] Error al crear variante SKU:', varErr);
        }

        // Insert junction records if subcategory or license
        if (row.resolvedSubcategoryId) {
          await supabase.from('product_categories').insert({
            product_id: newProd.id,
            category_id: row.resolvedSubcategoryId
          });
        }
        if (row.resolvedLicenseId) {
          await supabase.from('product_licenses').insert({
            product_id: newProd.id,
            license_id: row.resolvedLicenseId
          });
        }

        createdCount++;
        successCount++;
      } else if (row.operation === 'update' && row.existingProductId) {
        // PARTIAL UPDATE: Only update fields present in row.dbPayload or metadata
        const updatePayload: any = { ...row.dbPayload, updated_at: new Date().toISOString() };

        // Handle metadata fields partial update
        if (row.parsedData.resolvedMbeType !== undefined || row.parsedData.resolvedArStatus !== undefined || row.dbPayload.metadata !== undefined) {
          // Fetch existing metadata to merge safely
          const { data: currentProd } = await supabase
            .from('products')
            .select('metadata')
            .eq('id', row.existingProductId)
            .single();

          let mergedMeta = currentProd?.metadata && typeof currentProd.metadata === 'object' ? { ...currentProd.metadata } : {};

          if (row.dbPayload.metadata) {
            mergedMeta = { ...mergedMeta, ...row.dbPayload.metadata };
          }

          if (row.parsedData.resolvedMbeType !== undefined) {
            mergedMeta = mergeMbePackagingType(mergedMeta, row.parsedData.resolvedMbeType);
          }
          if (row.parsedData.resolvedArStatus !== undefined) {
            if (row.parsedData.resolvedArStatus) {
              mergedMeta.argentina_status = row.parsedData.resolvedArStatus;
            } else {
              delete mergedMeta.argentina_status;
            }
          }

          updatePayload.metadata = mergedMeta;
        }

        const { error: updateErr } = await supabase
          .from('products')
          .update(updatePayload)
          .eq('id', row.existingProductId);

        if (updateErr) {
          throw new Error(updateErr.message);
        }

        // If stock or SKU updated in row, update variant
        if (row.parsedData.stock !== undefined || row.sku) {
          const varUpdate: any = {};
          if (row.parsedData.stock !== undefined) {
            varUpdate.inventory_count = parseInt(String(row.parsedData.stock), 10);
          }
          if (row.sku) {
            varUpdate.sku = row.sku;
          }
          await supabase
            .from('product_variants')
            .update(varUpdate)
            .eq('product_id', row.existingProductId);
        }

        // Update subcategory junction if provided
        if (row.resolvedSubcategoryId) {
          await supabase.from('product_categories').delete().eq('product_id', row.existingProductId);
          await supabase.from('product_categories').insert({
            product_id: row.existingProductId,
            category_id: row.resolvedSubcategoryId
          });
        }

        // Update license junction if provided
        if (row.resolvedLicenseId) {
          await supabase.from('product_licenses').delete().eq('product_id', row.existingProductId);
          await supabase.from('product_licenses').insert({
            product_id: row.existingProductId,
            license_id: row.resolvedLicenseId
          });
        }

        updatedCount++;
        successCount++;
      }
    } catch (err: any) {
      rejectedCount++;
      errors.push({
        rowIndex: row.rowIndex,
        sku: row.sku,
        error: err.message || 'Error desconocido al procesar fila.'
      });
    }
  }

  return {
    successCount,
    createdCount,
    updatedCount,
    rejectedCount,
    errors
  };
}
