import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { findFieldDefinition, getMasterFields } from './productFieldRegistry';
import type { ProductFieldDefinition } from './productFieldRegistry';
import { validateProductForPublication } from './productPublicationValidator';
import { normalizeCondition } from '../config/conditionConfig';
import { fetchCatalogMetadataForTemplate } from './bulkTemplateGenerator';
import type { CatalogMetadata } from './bulkTemplateGenerator';
import { mergeMbePackagingType, resolveMbePackagingTypeInput, resolveArgentinaShippingStatusInput } from './mbeLogisticsUtils';
import { slugify, isProhibitedSlug } from './slugUtils';

export interface ChangedFieldDetail {
  fieldKey: string;
  fieldLabel: string;
  oldValue: any;
  newValue: any;
}

export interface ParsedImportRow {
  rowIndex: number;
  rawRow: Record<string, any>;
  sku: string;
  title: string;
  operation: 'create' | 'update' | 'unchanged' | 'invalid';
  existingProductId?: string;
  matchStrategy?: '_product_id' | 'sku' | 'slug';
  
  // Normalized field values parsed from row
  parsedData: Record<string, any>;
  // Explicit DB column payloads resolved (IDs for FKs)
  dbPayload: Record<string, any>;
  changedFieldsDetail: ChangedFieldDetail[];
  
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
 * Helper to generate unique URL slug for new products.
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
 * Helper to split an array into smaller chunks to prevent Supabase query URL limits.
 */
function chunkArray<T>(items: T[], chunkSize = 100): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
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

  // Pre-fetch identifiers from raw rows: _product_id, sku, slug
  const productIdsInFile: string[] = [];
  const skusInFile: string[] = [];
  const slugsInFile: string[] = [];

  rawRows.forEach(r => {
    for (const rawColKey in r) {
      const fDef = headerToFieldMap.get(normalizeKey(rawColKey));
      const cellVal = String(r[rawColKey] || '').trim();
      if (!cellVal) continue;

      if (fDef?.key === '_product_id') {
        productIdsInFile.push(cellVal);
      } else if (fDef?.key === 'sku') {
        skusInFile.push(cellVal);
      } else if (fDef?.key === 'slug') {
        slugsInFile.push(cellVal);
      }
    }
  });

  // Pre-fetch existing products by _product_id, SKU, and slug
  const existingByIdMap = new Map<string, any>();
  const existingBySkuMap = new Map<string, any>();
  const existingBySlugMap = new Map<string, any>();

  const registerProductInMaps = (p: any) => {
    if (p.id) existingByIdMap.set(p.id, p);
    const sku = p.variants?.[0]?.sku || p.sku;
    if (sku) existingBySkuMap.set(sku, p);
    if (p.slug) existingBySlugMap.set(p.slug, p);
  };

  if (providedExistingProducts && providedExistingProducts.length > 0) {
    providedExistingProducts.forEach(registerProductInMaps);
  } else {
    const fetchedProductIds = new Set<string>();

    // 1. Fetch by _product_id
    if (productIdsInFile.length > 0) {
      for (const chunk of chunkArray(productIdsInFile, 100)) {
        const { data: dbProducts } = await supabase
          .from('products')
          .select(`
            id, title, slug, description, short_description, base_price, compare_at_price, cost_price, status, vendor_id, weight_kg, dimensions, metadata, brand_id, category_id, badge, condition, condition_notes, is_featured, seo_title, seo_description, meta_title, meta_description,
            brand:brands(id, name),
            category:categories(id, name),
            license:licenses(id, name),
            variants:product_variants(id, sku, inventory_count)
          `)
          .in('id', chunk);

        if (dbProducts) {
          dbProducts.forEach(p => {
            fetchedProductIds.add(p.id);
            registerProductInMaps(p);
          });
        }
      }
    }

    // 2. Fetch by SKU
    const missingSkus = skusInFile.filter(sku => !existingBySkuMap.has(sku));
    if (missingSkus.length > 0) {
      for (const chunk of chunkArray(missingSkus, 100)) {
        const { data: varData } = await supabase
          .from('product_variants')
          .select('product_id, sku')
          .in('sku', chunk);

        if (varData && varData.length > 0) {
          const idsToFetch = varData.map(v => v.product_id).filter(id => !fetchedProductIds.has(id));
          if (idsToFetch.length > 0) {
            const { data: dbProducts } = await supabase
              .from('products')
              .select(`
                id, title, slug, description, short_description, base_price, compare_at_price, cost_price, status, vendor_id, weight_kg, dimensions, metadata, brand_id, category_id, badge, condition, condition_notes, is_featured, seo_title, seo_description, meta_title, meta_description,
                brand:brands(id, name),
                category:categories(id, name),
                license:licenses(id, name),
                variants:product_variants(id, sku, inventory_count)
              `)
              .in('id', idsToFetch);

            if (dbProducts) {
              dbProducts.forEach(p => {
                fetchedProductIds.add(p.id);
                registerProductInMaps(p);
              });
            }
          }
        }
      }
    }

    // 3. Fetch by slug
    const missingSlugs = slugsInFile.filter(slug => !existingBySlugMap.has(slug));
    if (missingSlugs.length > 0) {
      for (const chunk of chunkArray(missingSlugs, 100)) {
        const { data: dbProducts } = await supabase
          .from('products')
          .select(`
            id, title, slug, description, short_description, base_price, compare_at_price, cost_price, status, vendor_id, weight_kg, dimensions, metadata, brand_id, category_id, badge, condition, condition_notes, is_featured, seo_title, seo_description, meta_title, meta_description,
            brand:brands(id, name),
            category:categories(id, name),
            license:licenses(id, name),
            variants:product_variants(id, sku, inventory_count)
          `)
          .in('slug', chunk);

        if (dbProducts) {
          dbProducts.forEach(p => {
            if (!fetchedProductIds.has(p.id)) {
              fetchedProductIds.add(p.id);
              registerProductInMaps(p);
            }
          });
        }
      }
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
        if (cellVal !== undefined && cellVal !== null && String(cellVal).trim() !== '') {
          rowValuesByKey[fDef.key] = cellVal;
        }
      }
    }

    const rawProductId = (rowValuesByKey._product_id || '').toString().trim();
    const sku = (rowValuesByKey.sku || '').toString().trim();
    const slug = (rowValuesByKey.slug || '').toString().trim();
    const title = (rowValuesByKey.title || '').toString().trim();

    // Multi-Strategy Matching Priority: 1. _product_id -> 2. SKU -> 3. slug
    let existingProduct: any = null;
    let matchStrategy: '_product_id' | 'sku' | 'slug' | undefined;

    if (rawProductId) {
      if (existingByIdMap.has(rawProductId)) {
        existingProduct = existingByIdMap.get(rawProductId);
        matchStrategy = '_product_id';

        // Identity Conflict Checks
        if (sku && existingBySkuMap.has(sku)) {
          const skuProd = existingBySkuMap.get(sku);
          if (skuProd.id !== existingProduct.id) {
            rowErrors.push(`Conflicto de identidad: _product_id "${rawProductId}" y SKU "${sku}" corresponden a productos diferentes en la base de datos.`);
          }
        }
        if (slug && existingBySlugMap.has(slug)) {
          const slugProd = existingBySlugMap.get(slug);
          if (slugProd.id !== existingProduct.id) {
            rowErrors.push(`Conflicto de identidad: _product_id "${rawProductId}" y slug "${slug}" corresponden a productos diferentes en la base de datos.`);
          }
        }
      } else {
        rowErrors.push(`El _product_id "${rawProductId}" no existe en la base de datos.`);
      }
    } else if (sku) {
      if (existingBySkuMap.has(sku)) {
        existingProduct = existingBySkuMap.get(sku);
        matchStrategy = 'sku';

        if (slug && existingBySlugMap.has(slug)) {
          const slugProd = existingBySlugMap.get(slug);
          if (slugProd.id !== existingProduct.id) {
            rowErrors.push(`Conflicto de identidad: SKU "${sku}" y slug "${slug}" corresponden a productos diferentes en la base de datos.`);
          }
        }
      }
    } else if (slug) {
      if (existingBySlugMap.has(slug)) {
        existingProduct = existingBySlugMap.get(slug);
        matchStrategy = 'slug';
      }
    }

    let operation: 'create' | 'update' | 'unchanged' | 'invalid' = existingProduct ? 'update' : 'create';

    // Security Check: Non-admin Vendors can only update their OWN products
    if (userRole === 'vendor' && existingProduct) {
      if (currentVendorId && existingProduct.vendor_id !== currentVendorId) {
        rowErrors.push(`Seguridad: El producto pertenece a otro vendedor y no tienes permiso para modificarlo.`);
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
      } else if (operation === 'create' || rowValuesByKey.brand_name) {
        rowErrors.push(`La marca "${rowValuesByKey.brand_name}" no existe en Collectibles.uy.`);
      }
    } else if (existingProduct) {
      resolvedBrandId = existingProduct.brand_id || null;
    }

    // 2. Resolve Main Category
    let resolvedCategoryId: string | null = null;
    if (rowValuesByKey.category_name) {
      const cName = String(rowValuesByKey.category_name).trim().toLowerCase();
      const matchedCat = metadata.categories.find(c => !c.parent_id && c.name.toLowerCase().trim() === cName);
      if (matchedCat) {
        resolvedCategoryId = matchedCat.id;
      } else if (operation === 'create') {
        rowErrors.push(`La categoría "${rowValuesByKey.category_name}" no existe en Collectibles.uy.`);
      } else {
        // For UPDATE with historical/legacy category name: if unchanged or not strictly matched in new active list, preserve DB category
        resolvedCategoryId = existingProduct?.category_id || null;
      }
    } else if (existingProduct) {
      resolvedCategoryId = existingProduct.category_id || null;
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
      } else if (operation === 'create') {
        rowErrors.push(`La subcategoría "${rowValuesByKey.subcategory_name}" no existe o no pertenece a la categoría especificada.`);
      }
    } else if (existingProduct) {
      resolvedSubcategoryId = existingProduct.metadata?.subcategory_id || null;
    }

    // 4. Resolve License
    let resolvedLicenseId: string | null = null;
    if (rowValuesByKey.license_name) {
      const lName = String(rowValuesByKey.license_name).trim().toLowerCase();
      const matchedLicense = metadata.licenses.find(l => l.name.toLowerCase().trim() === lName);
      if (matchedLicense) {
        resolvedLicenseId = matchedLicense.id;
      } else if (operation === 'create') {
        rowErrors.push(`La licencia "${rowValuesByKey.license_name}" no existe en Collectibles.uy.`);
      }
    } else if (existingProduct) {
      resolvedLicenseId = existingProduct.metadata?.license_id || null;
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
    } else if (existingProduct) {
      resolvedVendorId = existingProduct.vendor_id || null;
    }

    // Validate Tipo MBE
    let parsedMbeType: string | null | undefined;
    if (rowValuesByKey.mbe_packaging_type !== undefined) {
      const rawMbe = String(rowValuesByKey.mbe_packaging_type).trim();
      const resolved = resolveMbePackagingTypeInput(rawMbe);
      if (resolved === undefined) {
        rowErrors.push(`"${rawMbe}" no es un Tipo MBE válido.`);
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
        rowErrors.push(`"${rawAr}" no es un Estado AR válido.`);
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

    // Condition normalization (em-dash '—' is treated as null placeholder)
    let parsedCondition: string | null = null;
    if (rowValuesByKey.condition !== undefined && rowValuesByKey.condition !== '—' && rowValuesByKey.condition !== '-') {
      const normCond = normalizeCondition(String(rowValuesByKey.condition));
      if (!normCond && String(rowValuesByKey.condition).trim() !== '') {
        if (operation === 'create') {
          rowErrors.push(`La condición "${rowValuesByKey.condition}" no es válida.`);
        }
      } else {
        parsedCondition = normCond;
      }
    } else if (existingProduct) {
      parsedCondition = existingProduct.condition || null;
    }

    // Status validation
    let parsedStatus = rowValuesByKey.status ? String(rowValuesByKey.status).trim().toLowerCase() : (existingProduct?.status || 'draft');
    if (rowValuesByKey.status && !['published', 'draft', 'archived'].includes(parsedStatus)) {
      rowErrors.push(`El estado "${rowValuesByKey.status}" no es válido (usar: published, draft, archived).`);
      parsedStatus = existingProduct?.status || 'draft';
    }

    // Validation for CREATE only
    if (operation === 'create') {
      if (!title) {
        rowErrors.push('El título del producto es obligatorio para crear un producto nuevo.');
      }
      const validationResult = validateProductForPublication({
        form: {
          title: title || '',
          base_price: parsedPrice !== undefined ? parsedPrice : 0,
          categories: resolvedCategoryId ? [resolvedCategoryId] : undefined,
          brands: resolvedBrandId ? [resolvedBrandId] : undefined,
          image_url: rowValuesByKey.image_url || undefined,
          stock: parsedStock !== undefined ? parsedStock : 0,
          condition: parsedCondition || undefined,
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
    }

    // Calculate exact diff and build minimized payload for existing products
    const dbPayload: Record<string, any> = {};
    const changedFieldsDetail: ChangedFieldDetail[] = [];

    if (existingProduct) {
      // Title
      if (title && title.trim() !== String(existingProduct.title || '').trim()) {
        changedFieldsDetail.push({ fieldKey: 'title', fieldLabel: 'Título', oldValue: existingProduct.title, newValue: title });
        dbPayload.title = title;
      }
      // Description
      if (rowValuesByKey.description !== undefined && String(rowValuesByKey.description || '').trim() !== String(existingProduct.description || '').trim()) {
        changedFieldsDetail.push({ fieldKey: 'description', fieldLabel: 'Descripción', oldValue: existingProduct.description, newValue: rowValuesByKey.description });
        dbPayload.description = rowValuesByKey.description;
      }
      // Short description
      if (rowValuesByKey.short_description !== undefined && String(rowValuesByKey.short_description || '').trim() !== String(existingProduct.short_description || '').trim()) {
        changedFieldsDetail.push({ fieldKey: 'short_description', fieldLabel: 'Descripción corta', oldValue: existingProduct.short_description, newValue: rowValuesByKey.short_description });
        dbPayload.short_description = rowValuesByKey.short_description;
      }
      // Base price
      if (parsedPrice !== undefined && Math.abs(parsedPrice - (existingProduct.base_price || 0)) > 0.001) {
        changedFieldsDetail.push({ fieldKey: 'base_price', fieldLabel: 'Precio', oldValue: existingProduct.base_price, newValue: parsedPrice });
        dbPayload.base_price = parsedPrice;
      }
      // Compare at price
      if (rowValuesByKey.compare_at_price !== undefined) {
        const fileCompare = parseFloat(rowValuesByKey.compare_at_price) || null;
        const dbCompare = existingProduct.compare_at_price !== null ? Number(existingProduct.compare_at_price) : null;
        if (fileCompare !== dbCompare) {
          changedFieldsDetail.push({ fieldKey: 'compare_at_price', fieldLabel: 'Precio anterior', oldValue: dbCompare, newValue: fileCompare });
          dbPayload.compare_at_price = fileCompare;
        }
      }
      // Cost price
      if (userRole === 'admin' && rowValuesByKey.cost_price !== undefined) {
        const fileCost = parseFloat(rowValuesByKey.cost_price) || null;
        const dbCost = existingProduct.cost_price !== null ? Number(existingProduct.cost_price) : null;
        if (fileCost !== dbCost) {
          changedFieldsDetail.push({ fieldKey: 'cost_price', fieldLabel: 'Costo', oldValue: dbCost, newValue: fileCost });
          dbPayload.cost_price = fileCost;
        }
      }
      // Weight (kg)
      if (parsedWeight !== undefined) {
        const dbWeight = existingProduct.weight_kg !== null && existingProduct.weight_kg !== undefined ? Number(existingProduct.weight_kg) : null;
        const weightChanged = (parsedWeight === null) !== (dbWeight === null) || (parsedWeight !== null && dbWeight !== null && Math.abs(parsedWeight - dbWeight) > 0.0001);
        if (weightChanged) {
          changedFieldsDetail.push({ fieldKey: 'weight_kg', fieldLabel: 'Peso (kg)', oldValue: dbWeight, newValue: parsedWeight });
          dbPayload.weight_kg = parsedWeight;
        }
      }
      // Stock
      if (parsedStock !== undefined) {
        const dbStock = existingProduct.variants?.[0]?.inventory_count ?? 0;
        if (parsedStock !== dbStock) {
          changedFieldsDetail.push({ fieldKey: 'stock', fieldLabel: 'Stock', oldValue: dbStock, newValue: parsedStock });
        }
      }
      // Brand
      const currentBrandName = existingProduct.brand?.name || existingProduct.metadata?.brand_name || null;
      const isBrandNameChanged = currentBrandName
        ? String(rowValuesByKey.brand_name).trim().toLowerCase() !== String(currentBrandName).trim().toLowerCase()
        : (resolvedBrandId !== null && resolvedBrandId !== (existingProduct.brand_id || null));

      if (rowValuesByKey.brand_name !== undefined && isBrandNameChanged) {
        changedFieldsDetail.push({ fieldKey: 'brand_name', fieldLabel: 'Marca', oldValue: currentBrandName, newValue: rowValuesByKey.brand_name });
        dbPayload.brand_id = resolvedBrandId;
      }
      // Main Category
      const currentCatName = existingProduct.category?.name || existingProduct.metadata?.category_name || null;
      const isCategoryNameChanged = currentCatName
        ? String(rowValuesByKey.category_name).trim().toLowerCase() !== String(currentCatName).trim().toLowerCase()
        : (resolvedCategoryId !== null && resolvedCategoryId !== (existingProduct.category_id || null));

      if (rowValuesByKey.category_name !== undefined && isCategoryNameChanged) {
        changedFieldsDetail.push({ fieldKey: 'category_name', fieldLabel: 'Categoría', oldValue: currentCatName, newValue: rowValuesByKey.category_name });
        dbPayload.category_id = resolvedCategoryId;
      }
      // Condition
      if (parsedCondition !== null && parsedCondition !== (existingProduct.condition || null)) {
        changedFieldsDetail.push({ fieldKey: 'condition', fieldLabel: 'Condición', oldValue: existingProduct.condition || null, newValue: parsedCondition });
        dbPayload.condition = parsedCondition;
      }
      // Status
      if (rowValuesByKey.status && parsedStatus !== existingProduct.status) {
        changedFieldsDetail.push({ fieldKey: 'status', fieldLabel: 'Estado', oldValue: existingProduct.status, newValue: parsedStatus });
        dbPayload.status = parsedStatus;
      }
      // Slug
      if (rowValuesByKey.slug !== undefined) {
        const rawSlug = String(rowValuesByKey.slug).trim();
        const formattedSlug = isProhibitedSlug(rawSlug) ? slugify(title || existingProduct.title) : slugify(rawSlug);
        const dbSlug = slugify(existingProduct.slug || '');
        if (formattedSlug !== dbSlug) {
          changedFieldsDetail.push({ fieldKey: 'slug', fieldLabel: 'Slug', oldValue: existingProduct.slug, newValue: formattedSlug });
          dbPayload.slug = formattedSlug;
        }
      }

      // Metadata diff
      if (rowValuesByKey.content !== undefined || rowValuesByKey.video_url !== undefined) {
        dbPayload.metadata = dbPayload.metadata || {};
        const currentMeta = existingProduct.metadata || {};
        if (rowValuesByKey.content !== undefined && rowValuesByKey.content !== currentMeta.content) {
          changedFieldsDetail.push({ fieldKey: 'content', fieldLabel: 'Contenido', oldValue: currentMeta.content || null, newValue: rowValuesByKey.content });
          dbPayload.metadata.content = rowValuesByKey.content;
        }
        if (rowValuesByKey.video_url !== undefined && rowValuesByKey.video_url !== currentMeta.video_url) {
          changedFieldsDetail.push({ fieldKey: 'video_url', fieldLabel: 'URL del Video', oldValue: currentMeta.video_url || null, newValue: rowValuesByKey.video_url });
          dbPayload.metadata.video_url = rowValuesByKey.video_url;
        }
      }

      // Re-classify operation based on actual diff
      if (rowErrors.length > 0) {
        operation = 'invalid';
        errorCount++;
      } else if (changedFieldsDetail.length === 0) {
        operation = 'unchanged';
        unchangedCount++;
      } else {
        operation = 'update';
        updateCount++;
      }
    } else {
      // CREATE payload
      if (rowErrors.length > 0) {
        operation = 'invalid';
        errorCount++;
      } else {
        operation = 'create';
        newCount++;

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
      }
    }

    if (rowWarnings.length > 0) warningCount++;

    parsedRows.push({
      rowIndex,
      rawRow: raw,
      sku: sku || `SKU-${rowIndex}`,
      title: title || (existingProduct?.title || `Fila ${rowIndex}`),
      operation,
      existingProductId: existingProduct?.id,
      matchStrategy,
      parsedData: {
        ...rowValuesByKey,
        resolvedMbeType: parsedMbeType,
        resolvedArStatus: parsedArStatus
      },
      dbPayload,
      changedFieldsDetail,
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
        // PARTIAL UPDATE: Send ONLY fields present in row.dbPayload or changed metadata
        const updatePayload: any = { ...row.dbPayload, updated_at: new Date().toISOString() };
        
        // Prevent altering product_id or vendor_id for non-admin
        delete updatePayload._product_id;
        delete updatePayload.id;
        if (userRole === 'vendor') {
          delete updatePayload.vendor_id;
          delete updatePayload.cost_price;
        }

        if (row.parsedData.resolvedMbeType !== undefined || row.parsedData.resolvedArStatus !== undefined || row.dbPayload.metadata !== undefined) {
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

        if (Object.keys(updatePayload).length > 1) { // More than just updated_at
          const { error: updateErr } = await supabase
            .from('products')
            .update(updatePayload)
            .eq('id', row.existingProductId);

          if (updateErr) {
            throw new Error(updateErr.message);
          }
        }

        // Update variant if stock or SKU changed
        const stockChanged = row.changedFieldsDetail.some(f => f.fieldKey === 'stock');
        const skuChanged = row.changedFieldsDetail.some(f => f.fieldKey === 'sku');
        if (stockChanged || skuChanged) {
          const varUpdate: any = {};
          if (stockChanged && row.parsedData.stock !== undefined) {
            varUpdate.inventory_count = parseInt(String(row.parsedData.stock), 10);
          }
          if (skuChanged && row.sku) {
            varUpdate.sku = row.sku;
          }
          if (Object.keys(varUpdate).length > 0) {
            await supabase
              .from('product_variants')
              .update(varUpdate)
              .eq('product_id', row.existingProductId);
          }
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
