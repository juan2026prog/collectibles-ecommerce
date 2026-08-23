import * as XLSX from 'xlsx';
import { getMasterFields } from './productFieldRegistry';

export interface ExportProductItem {
  id?: string;
  sku?: string | null;
  title: string;
  slug?: string | null;
  product_url?: string | null;
  description?: string | null;
  short_description?: string | null;
  content?: string | null;
  base_price: number;
  compare_at_price?: number | null;
  cost_price?: number | null;
  stock?: number;
  is_featured?: boolean | null;
  condition?: string | null;
  condition_notes?: string | null;
  ean_upc?: string | null;
  weight_kg?: number | null;
  dimensions_length?: number | null;
  dimensions_width?: number | null;
  dimensions_height?: number | null;
  mbe_packaging_type?: string | null;
  argentina_shipping_status?: string | null;
  status?: string;
  badge?: string | null;
  image_url?: string | null;
  additional_images?: string | null;
  video_url?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  created_at?: string;
  updated_at?: string;
  
  // Relations & Internal IDs
  vendor_id?: string | null;
  category_id?: string | null;
  brand_id?: string | null;
  brand?: { id?: string; name?: string } | null;
  category?: { id?: string; name?: string; parent_id?: string | null } | null;
  subcategory?: { id?: string; name?: string } | null;
  license?: { id?: string; name?: string } | null;
  vendor?: { id?: string; store_name?: string; company_name?: string; status?: string | null; ships_to_argentina?: boolean | null } | null;
  tags?: { id?: string; name?: string }[] | string[] | null;
  gallery?: { url: string }[] | string[] | null;
  
  // Generic metadata fallback
  metadata?: any;
  variants?: any[];
}

/**
 * Normalizes a product record into a flat key-value dictionary using master keys.
 * Replaces UUIDs with human-readable names for all relations using central exportResolvers.
 */
export function formatProductRecordForExport(
  item: ExportProductItem,
  selectedKeys: string[],
  userRole: 'admin' | 'vendor' = 'admin'
): Record<string, string> {
  const record: Record<string, string> = {};
  const masterFields = getMasterFields(userRole);
  const fieldMap = new Map(masterFields.map(f => [f.key, f]));

  selectedKeys.forEach(key => {
    const fDef = fieldMap.get(key);
    if (fDef && fDef.exportResolver) {
      record[key] = fDef.exportResolver(item);
    } else {
      record[key] = (item as any)[key] !== undefined && (item as any)[key] !== null ? String((item as any)[key]) : '';
    }
  });

  return record;
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
    const formatted = formatProductRecordForExport(prod, activeFields.map(f => f.key), userRole);
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
  userRole: 'admin' | 'vendor' = 'admin',
  sheetName: string = 'Productos'
): Promise<Blob> {
  const masterFields = getMasterFields(userRole);
  const activeFields = masterFields.filter(f => selectedKeys.includes(f.key));

  const headers = activeFields.map(f => f.label);
  const rows = products.map(prod => {
    const formatted = formatProductRecordForExport(prod, activeFields.map(f => f.key), userRole);
    return activeFields.map(f => formatted[f.key] || '');
  });

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  // Apply column width auto-formatting
  const colWidths = headers.map((h, i) => {
    let maxLen = h.length;
    for (let r = 0; r < Math.min(rows.length, 50); r++) {
      const cellVal = String(rows[r][i] || '');
      if (cellVal.length > maxLen) maxLen = cellVal.length;
    }
    return { wch: Math.min(Math.max(maxLen + 3, 12), 60) };
  });

  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const arrayBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([arrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
}

/**
 * Helper to trigger browser download of CSV or XLSX product file.
 */
export async function triggerProductsDownload(
  products: ExportProductItem[],
  selectedKeys: string[],
  format: 'xlsx' | 'csv',
  userRole: 'admin' | 'vendor' = 'admin',
  filenamePrefix: string = 'Productos_Collectibles'
): Promise<void> {
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `${filenamePrefix}_${timestamp}.${format}`;

  if (format === 'csv') {
    const csvContent = generateProductsCsv(products, selectedKeys, userRole);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } else {
    const blob = await generateProductsXlsxBlob(products, selectedKeys, userRole);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
