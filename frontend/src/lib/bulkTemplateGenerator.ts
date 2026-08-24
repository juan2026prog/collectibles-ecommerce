import * as XLSX from 'xlsx';
import { getMasterFields } from './productFieldRegistry';
import { supabase } from '../lib/supabase';
import { CONDITION_OPTIONS } from '../config/conditionConfig';

export interface CatalogMetadata {
  brands: { id: string; name: string }[];
  categories: { id: string; name: string; parent_id: string | null }[];
  licenses: { id: string; name: string }[];
  vendors: { id: string; store_name: string }[];
  tags: { id: string; name: string }[];
  badges: string[];
}

export const OFFICIAL_SYSTEM_BADGES = [
  'NEW',
  'PRE-ORDER',
  'SALE',
  'EXCLUSIVE COLLECTIBLES',
  'NOVEDAD',
  'RESERVA'
];

/**
 * Sanitizes a category name into a 100% valid, collision-free Excel Defined Name.
 * Handles spaces, diacritics (tildes, ñ), slashes, ampersands, and numeric prefixes.
 * Guarantees mathematical uniqueness via stable ID suffix and collision tracking set.
 */
export function sanitizeExcelDefinedName(
  rawName: string,
  idSuffix?: string,
  existingSet?: Set<string>
): string {
  if (!rawName) return 'CAT_UNKNOWN';
  
  const ascii = rawName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  let baseName = `CAT_${ascii}`.toUpperCase();

  // Attach clean ID suffix if provided
  if (idSuffix) {
    const cleanSuffix = idSuffix.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase();
    if (cleanSuffix) {
      baseName = `${baseName}_${cleanSuffix}`;
    }
  }

  // Deduplicate against existing Defined Names set
  if (existingSet) {
    let candidate = baseName;
    let counter = 1;
    while (existingSet.has(candidate)) {
      candidate = `${baseName}_${counter}`;
      counter++;
    }
    existingSet.add(candidate);
    return candidate;
  }

  return baseName;
}

/**
 * Fetches current active catalog metadata dynamically from Supabase.
 */
export async function fetchCatalogMetadataForTemplate(): Promise<CatalogMetadata> {
  const [{ data: brands }, { data: categories }, { data: licenses }, { data: vendors }, { data: tags }, { data: badgesData }] = await Promise.all([
    supabase.from('brands').select('id, name').order('name'),
    supabase.from('categories').select('id, name, parent_id').order('name'),
    supabase.from('licenses').select('id, name').eq('is_active', true).order('name'),
    supabase.from('vendors').select('id, store_name').order('store_name'),
    supabase.from('tags').select('id, name').order('name'),
    supabase.from('badges').select('label').eq('is_active', true).order('sort_order')
  ]);

  const fetchedBadges = (badgesData || []).map(b => b.label).filter(Boolean);

  return {
    brands: brands || [],
    categories: categories || [],
    licenses: licenses || [],
    vendors: vendors || [],
    tags: tags || [],
    badges: fetchedBadges.length > 0 ? fetchedBadges : OFFICIAL_SYSTEM_BADGES
  };
}

import { buildDynamicXlsxWorkbook } from './excelValidationEngine';

/**
 * Generates dynamic .XLSX import template with dependent Excel dropdowns,
 * Defined Names for Category -> Subcategory hierarchy, automated guide sheet, and live reference lists.
 */
export async function generateXlsxImportTemplate(
  userRole: 'admin' | 'vendor' = 'admin',
  existingMetadata?: CatalogMetadata
): Promise<Blob> {
  const metadata = existingMetadata || (await fetchCatalogMetadataForTemplate());
  return buildDynamicXlsxWorkbook({
    userRole,
    mode: 'template',
    metadata
  });
}

/**
 * Downloads the XLSX import template directly in the browser.
 */
export async function downloadXlsxImportTemplate(userRole: 'admin' | 'vendor' = 'admin') {
  const blob = await generateXlsxImportTemplate(userRole);
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Plantilla_Importacion_Collectibles_${new Date().toISOString().split('T')[0]}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}
