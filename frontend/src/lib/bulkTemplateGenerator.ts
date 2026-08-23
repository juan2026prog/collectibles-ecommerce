import * as XLSX from 'xlsx';
import { getMasterFields } from './productFieldRegistry';
import { supabase } from '../lib/supabase';

export interface CatalogMetadata {
  brands: { id: string; name: string }[];
  categories: { id: string; name: string; parent_id: string | null }[];
  licenses: { id: string; name: string }[];
  vendors: { id: string; store_name: string }[];
}

/**
 * Fetches current active catalog metadata from Supabase.
 */
export async function fetchCatalogMetadataForTemplate(): Promise<CatalogMetadata> {
  const [{ data: brands }, { data: categories }, { data: licenses }, { data: vendors }] = await Promise.all([
    supabase.from('brands').select('id, name').order('name'),
    supabase.from('categories').select('id, name, parent_id').order('name'),
    supabase.from('licenses').select('id, name').eq('is_active', true).order('name'),
    supabase.from('vendors').select('id, store_name').order('store_name')
  ]);

  return {
    brands: brands || [],
    categories: categories || [],
    licenses: licenses || [],
    vendors: vendors || []
  };
}

/**
 * Generates and downloads a dynamic .XLSX import template with Excel dropdowns,
 * an automated guide sheet, and live reference lists from Collectibles.uy.
 */
export async function generateXlsxImportTemplate(
  userRole: 'admin' | 'vendor' = 'admin',
  existingMetadata?: CatalogMetadata
): Promise<Blob> {
  const metadata = existingMetadata || (await fetchCatalogMetadataForTemplate());
  const masterFields = getMasterFields(userRole);
  const importableFields = masterFields.filter(f => f.key !== 'id');

  const headers = importableFields.map(f => f.label);
  const sampleRow1 = importableFields.map(f => {
    if (f.key === 'mbe_packaging_type') return 'MBE PAK';
    if (f.key === 'argentina_shipping_status') return 'Envío automático';
    return f.example || '';
  });
  const sampleRow2 = importableFields.map(f => {
    if (f.key === 'title') return 'Ejemplo Producto 2';
    if (f.key === 'mbe_packaging_type') return 'MBE Caja';
    if (f.key === 'argentina_shipping_status') return 'Requiere cotización';
    return f.example || '';
  });

  const mainSheet = XLSX.utils.aoa_to_sheet([headers, sampleRow1, sampleRow2]);

  // Build Listas reference sheet
  const mbeTypes = ['MBE PAK', 'MBE Caja', 'Sin definir'];
  const arStatuses = ['Envío automático', 'Requiere cotización'];
  const brandNames = metadata.brands.map(b => b.name);
  const catNames = metadata.categories.map(c => c.name);
  const licenseNames = metadata.licenses.map(l => l.name);
  const vendorNames = metadata.vendors.map(v => v.store_name);

  const maxListRows = Math.max(
    mbeTypes.length,
    arStatuses.length,
    brandNames.length,
    catNames.length,
    licenseNames.length,
    vendorNames.length,
    1
  );

  const listsHeaders = ['TIPO_MBE', 'ESTADO_AR', 'MARCAS', 'CATEGORIAS', 'LICENCIAS', 'VENDEDORES'];
  const listsRows: string[][] = [];

  for (let r = 0; r < maxListRows; r++) {
    listsRows.push([
      mbeTypes[r] || '',
      arStatuses[r] || '',
      brandNames[r] || '',
      catNames[r] || '',
      licenseNames[r] || '',
      vendorNames[r] || ''
    ]);
  }

  const listsSheet = XLSX.utils.aoa_to_sheet([listsHeaders, ...listsRows]);

  // Guide Sheet
  const guideHeaders = [
    'Campo (Columna)',
    'Descripción',
    'Obligatorio (Publicar)',
    'Tipo de Dato',
    'Valores Permitidos / Fuente',
    'Ejemplo de Uso'
  ];
  const guideRows = importableFields.map(field => {
    let allowedDesc = 'Texto libre';
    if (field.key === 'mbe_packaging_type') {
      allowedDesc = 'Desplegable: MBE PAK, MBE Caja, Sin definir';
    } else if (field.key === 'argentina_shipping_status') {
      allowedDesc = 'Desplegable: Envío automático, Requiere cotización';
    } else if (field.type === 'enum' && field.allowedValues) {
      allowedDesc = field.allowedValues.map(v => v.label || v.value).join(', ');
    } else if (field.type === 'relation') {
      allowedDesc = `Desplegable con ${field.label} vigentes en la plataforma`;
    } else if (field.type === 'decimal' || field.type === 'number') {
      allowedDesc = 'Número positivo';
    } else if (field.type === 'url') {
      allowedDesc = 'URL HTTP/HTTPS de imagen';
    } else if (field.type === 'array') {
      allowedDesc = 'Valores separados por comas o barra |';
    }

    return [
      field.label,
      field.description,
      field.requiredForPublish ? 'SÍ' : 'No',
      field.type.toUpperCase(),
      allowedDesc,
      field.example
    ];
  });

  const guideSheet = XLSX.utils.aoa_to_sheet([guideHeaders, ...guideRows]);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, mainSheet, 'Plantilla de Importacion');
  XLSX.utils.book_append_sheet(workbook, guideSheet, 'Guia de Importacion');
  XLSX.utils.book_append_sheet(workbook, listsSheet, 'Listas');

  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  return new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
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
