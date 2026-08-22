export * from './productFieldRegistry';
export * from './bulkExportUtils';
export * from './bulkTemplateGenerator';
export * from './bulkImportEngine';

export interface ParsedProduct {
  title: string;
  base_price: number;
  compare_at_price?: number;
  sku: string;
  stock: number;
  category_name?: string;
  brand_name?: string;
  license_name?: string;
  condition?: string;
  condition_notes?: string;
  image_url?: string;
  description?: string;
  raw_row?: any;
}

/**
 * Legacy wrapper function for template download.
 * Calls new dynamic XLSX generator.
 */
export function downloadTemplate() {
  import('./bulkTemplateGenerator').then(m => m.downloadXlsxImportTemplate('admin'));
}
