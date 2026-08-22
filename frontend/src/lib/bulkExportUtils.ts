import ExcelJS from 'exceljs';
import { getMasterFields } from './productFieldRegistry';
import type { ProductFieldDefinition } from './productFieldRegistry';
import { getConditionLabel } from '../config/conditionConfig';

export interface ExportProductItem {
  id?: string;
  sku?: string | null;
  title: string;
  description?: string | null;
  short_description?: string | null;
  base_price: number;
  compare_at_price?: number | null;
  cost_price?: number | null;
  stock?: number;
  condition?: string | null;
  condition_notes?: string | null;
  ean_upc?: string | null;
  weight_kg?: number | null;
  dimensions_length?: number | null;
  dimensions_width?: number | null;
  dimensions_height?: number | null;
  status?: string;
  badge?: string | null;
  image_url?: string | null;
  created_at?: string;
  updated_at?: string;
  
  // Relations
  brand?: { id?: string; name?: string } | null;
  category?: { id?: string; name?: string; parent_id?: string | null } | null;
  subcategory?: { id?: string; name?: string } | null;
  license?: { id?: string; name?: string } | null;
  vendor?: { id?: string; store_name?: string; company_name?: string } | null;
  tags?: { id?: string; name?: string }[] | string[] | null;
  gallery?: { url: string }[] | string[] | null;
  
  // Generic metadata fallback
  metadata?: any;
  variants?: any[];
}

/**
 * Normalizes a product record into a flat key-value dictionary using master keys.
 * Replaces UUIDs with human-readable names for all relations.
 */
export function formatProductRecordForExport(
  item: ExportProductItem,
  selectedKeys: string[]
): Record<string, string> {
  const record: Record<string, string> = {};

  // Resolve subcategory if present in item or metadata
  const subcatName = item.subcategory?.name || item.metadata?.subcategory_name || '';
  // Resolve license if present
  const licenseName = item.license?.name || item.metadata?.license_name || '';
  // Resolve SKU from variants if necessary
  const skuVal = item.sku || (item.variants && item.variants[0]?.sku) || '';
  // Resolve stock from variants if necessary
  const stockVal = item.stock !== undefined ? item.stock : (item.variants && item.variants[0]?.inventory_count !== undefined ? item.variants[0].inventory_count : 0);

  // Format tags
  let tagsStr = '';
  if (Array.isArray(item.tags)) {
    tagsStr = item.tags.map(t => typeof t === 'string' ? t : t.name).filter(Boolean).join(', ');
  } else if (item.metadata?.tags) {
    tagsStr = Array.isArray(item.metadata.tags) ? item.metadata.tags.join(', ') : String(item.metadata.tags);
  }

  // Format gallery images
  let galleryStr = '';
  if (Array.isArray(item.gallery)) {
    galleryStr = item.gallery.map(g => typeof g === 'string' ? g : g.url).filter(Boolean).join(' | ');
  } else if (item.metadata?.gallery) {
    galleryStr = Array.isArray(item.metadata.gallery) ? item.metadata.gallery.join(' | ') : String(item.metadata.gallery);
  }

  // Extract dimensions
  const dimLen = item.dimensions_length ?? item.metadata?.dimensions?.length ?? item.metadata?.dimensions?.l ?? '';
  const dimWid = item.dimensions_width ?? item.metadata?.dimensions?.width ?? item.metadata?.dimensions?.w ?? '';
  const dimHei = item.dimensions_height ?? item.metadata?.dimensions?.height ?? item.metadata?.dimensions?.h ?? '';

  selectedKeys.forEach(key => {
    switch (key) {
      case 'sku':
        record[key] = String(skuVal || '');
        break;
      case 'title':
        record[key] = item.title || '';
        break;
      case 'description':
        record[key] = item.description || '';
        break;
      case 'short_description':
        record[key] = item.short_description || '';
        break;
      case 'brand_name':
        record[key] = item.brand?.name || item.metadata?.brand_name || '';
        break;
      case 'category_name':
        record[key] = item.category?.name || item.metadata?.category_name || '';
        break;
      case 'subcategory_name':
        record[key] = subcatName;
        break;
      case 'license_name':
        record[key] = licenseName;
        break;
      case 'base_price':
        record[key] = item.base_price !== undefined && item.base_price !== null ? item.base_price.toFixed(2) : '0.00';
        break;
      case 'compare_at_price':
        record[key] = item.compare_at_price !== undefined && item.compare_at_price !== null ? item.compare_at_price.toFixed(2) : '';
        break;
      case 'cost_price':
        record[key] = item.cost_price !== undefined && item.cost_price !== null ? item.cost_price.toFixed(2) : '';
        break;
      case 'stock':
        record[key] = String(stockVal ?? 0);
        break;
      case 'condition':
        record[key] = item.condition || '';
        break;
      case 'condition_notes':
        record[key] = item.condition_notes || item.metadata?.condition_notes || '';
        break;
      case 'ean_upc':
        record[key] = item.ean_upc || item.metadata?.ean_upc || item.metadata?.gtin || '';
        break;
      case 'weight_kg':
        record[key] = item.weight_kg !== undefined && item.weight_kg !== null ? String(item.weight_kg) : '';
        break;
      case 'dimensions_length':
        record[key] = String(dimLen);
        break;
      case 'dimensions_width':
        record[key] = String(dimWid);
        break;
      case 'dimensions_height':
        record[key] = String(dimHei);
        break;
      case 'vendor_store_name':
        record[key] = item.vendor?.store_name || item.vendor?.company_name || item.metadata?.vendor_name || 'Collectibles Oficial';
        break;
      case 'tags':
        record[key] = tagsStr;
        break;
      case 'badge':
        record[key] = item.badge || item.metadata?.badge || '';
        break;
      case 'status':
        record[key] = item.status || 'draft';
        break;
      case 'image_url':
        record[key] = item.image_url || item.metadata?.image_url || '';
        break;
      case 'additional_images':
        record[key] = galleryStr;
        break;
      case 'created_at':
        record[key] = item.created_at ? new Date(item.created_at).toISOString().split('T')[0] : '';
        break;
      case 'updated_at':
        record[key] = item.updated_at ? new Date(item.updated_at).toISOString().split('T')[0] : '';
        break;
      default:
        record[key] = (item as any)[key] !== undefined ? String((item as any)[key]) : '';
        break;
    }
  });

  return record;
}

/**
 * Escapes a single cell value for CSV output.
 */
function escapeCsvCell(value: string): string {
  if (value === null || value === undefined) return '""';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
  };

  selectedKeys.forEach(k => {
    row[k] = getVal(k);
  });

  return row;
}

/**
 * Generates RFC-4180 CSV string for specified products and keys.
 */
export function generateProductsCsv(
  products: ExportProductItem[],
  selectedKeys: string[],
  userRole: 'admin' | 'vendor' = 'admin'
): string {
  const masterFields = getMasterFields(userRole);
  const activeFields = masterFields.filter(f => selectedKeys.includes(f.key));

  const escapeCsv = (val: string): string => {
    if (val === null || val === undefined) return '""';
    const str = String(val);
    const escaped = str.replace(/"/g, '""');
    return `"${escaped}"`;
  };

  const headerRow = activeFields.map(f => escapeCsv(f.label)).join(',');
  const dataRows = products.map(prod => {
    const formatted = formatProductRecordForExport(prod, activeFields.map(f => f.key));
    return activeFields.map(f => escapeCsv(formatted[f.key] || '')).join(',');
  });

  return '\uFEFF' + [headerRow, ...dataRows].join('\n');
}

/**
 * Generates formatted XLSX blob using XLSX.
 */
export async function generateProductsXlsxBlob(
  products: ExportProductItem[],
  selectedKeys: string[],
  userRole: 'admin' | 'vendor' = 'admin'
): Promise<Blob> {
  const masterFields = getMasterFields(userRole);
  const activeFields = masterFields.filter(f => selectedKeys.includes(f.key));

  const headers = activeFields.map(f => f.label);
  const dataRows = products.map(prod => {
    const formatted = formatProductRecordForExport(prod, activeFields.map(f => f.key));
    return activeFields.map(f => formatted[f.key] || '');
  });

  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Productos');

  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  return new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/**
 * Downloads exported file directly in browser.
 */
export async function triggerProductsDownload(
  products: ExportProductItem[],
  selectedKeys: string[],
  format: 'csv' | 'xlsx',
  userRole: 'admin' | 'vendor' = 'admin',
  filenamePrefix: string = 'Productos_Collectibles'
) {
  const dateStr = new Date().toISOString().split('T')[0];

  if (format === 'csv') {
    const csvContent = generateProductsCsv(products, selectedKeys, userRole);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filenamePrefix}_${dateStr}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  } else {
    const blob = await generateProductsXlsxBlob(products, selectedKeys, userRole);
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filenamePrefix}_${dateStr}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }
}
