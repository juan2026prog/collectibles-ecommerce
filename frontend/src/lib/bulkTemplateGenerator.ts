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

/**
 * Generates dynamic .XLSX import template with dependent Excel dropdowns,
 * Defined Names for Category -> Subcategory hierarchy, automated guide sheet, and live reference lists.
 */
export async function generateXlsxImportTemplate(
  userRole: 'admin' | 'vendor' = 'admin',
  existingMetadata?: CatalogMetadata
): Promise<Blob> {
  const metadata = existingMetadata || (await fetchCatalogMetadataForTemplate());
  const masterFields = getMasterFields(userRole);
  const importableFields = masterFields.filter(f => f.importable && f.key !== 'id');

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

  // Build Listas reference sheet with parent-child category ranges
  const mbeTypes = ['MBE PAK', 'MBE Caja', 'Sin definir'];
  const arStatuses = ['Envío automático', 'Requiere cotización'];
  const brandNames = metadata.brands.map(b => b.name);
  const mainCategories = metadata.categories.filter(c => !c.parent_id);
  const mainCatNames = mainCategories.map(c => c.name);
  const licenseNames = metadata.licenses.map(l => l.name);
  const vendorNames = metadata.vendors.map(v => v.store_name);
  const conditions = CONDITION_OPTIONS.map(c => c.value);
  const statuses = ['published', 'draft', 'archived'];
  const badges = metadata.badges && metadata.badges.length > 0 ? metadata.badges : OFFICIAL_SYSTEM_BADGES;
  const tagNames = metadata.tags ? metadata.tags.map(t => t.name) : [];

  // Group subcategories by parent category
  const subcatByParent: Record<string, string[]> = {};
  mainCategories.forEach(parent => {
    const children = metadata.categories.filter(c => c.parent_id === parent.id).map(c => c.name);
    subcatByParent[parent.name] = children;
  });

  const allSubcatNames = metadata.categories.filter(c => c.parent_id).map(c => c.name);

  const maxListRows = Math.max(
    mbeTypes.length,
    arStatuses.length,
    brandNames.length,
    mainCatNames.length,
    allSubcatNames.length,
    licenseNames.length,
    vendorNames.length,
    conditions.length,
    statuses.length,
    badges.length,
    tagNames.length,
    1
  );

  const listsHeaders = [
    'TIPO_MBE',
    'ESTADO_AR',
    'MARCAS',
    'CATEGORIAS',
    'SUBCATEGORIAS',
    'LICENCIAS',
    'VENDEDORES',
    'CONDICIONES',
    'ESTADOS',
    'COCARDAS',
    'ETIQUETAS'
  ];
  const listsRows: string[][] = [];

  for (let r = 0; r < maxListRows; r++) {
    listsRows.push([
      mbeTypes[r] || '',
      arStatuses[r] || '',
      brandNames[r] || '',
      mainCatNames[r] || '',
      allSubcatNames[r] || '',
      licenseNames[r] || '',
      vendorNames[r] || '',
      conditions[r] || '',
      statuses[r] || '',
      badges[r] || '',
      tagNames[r] || ''
    ]);
  }

  const listsSheet = XLSX.utils.aoa_to_sheet([listsHeaders, ...listsRows]);

  // Data Validation Rules on Main Sheet
  (mainSheet as any)['!dataValidation'] = [
    {
      sqref: 'E2:E1000', // Marca
      type: 'list',
      operator: 'equal',
      formula1: 'Listas!$C$2:$C$' + (brandNames.length + 1)
    },
    {
      sqref: 'F2:F1000', // Categoría
      type: 'list',
      operator: 'equal',
      formula1: 'Listas!$D$2:$D$' + (mainCatNames.length + 1)
    },
    {
      sqref: 'G2:G1000', // Subcategoría dependiente de Categoría (Columna F)
      type: 'list',
      operator: 'equal',
      formula1: '=INDIRECT(SUBSTITUTE(F2," ","_"))'
    },
    {
      sqref: 'H2:H1000', // Licencia
      type: 'list',
      operator: 'equal',
      formula1: 'Listas!$F$2:$F$' + (licenseNames.length + 1)
    },
    {
      sqref: 'M2:M1000', // Condición
      type: 'list',
      operator: 'equal',
      formula1: 'Listas!$H$2:$H$' + (conditions.length + 1)
    },
    {
      sqref: 'T2:T1000', // Tipo MBE
      type: 'list',
      operator: 'equal',
      formula1: 'Listas!$A$2:$A$' + (mbeTypes.length + 1)
    },
    {
      sqref: 'U2:U1000', // Estado AR
      type: 'list',
      operator: 'equal',
      formula1: 'Listas!$B$2:$B$' + (arStatuses.length + 1)
    },
    {
      sqref: 'Y2:Y1000', // Estado
      type: 'list',
      operator: 'equal',
      formula1: 'Listas!$I$2:$I$' + (statuses.length + 1)
    }
  ];

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

  // Excel Defined Names for Category -> Subcategory Indirect Dependency
  const definedNames: { Name: string; Ref: string }[] = [
    { Name: 'CATEGORIAS', Ref: 'Listas!$D$2:$D$' + (mainCatNames.length + 1) }
  ];

  // Add Defined Name for each parent category
  mainCategories.forEach(parent => {
    const children = subcatByParent[parent.name] || [];
    if (children.length > 0) {
      const safeName = parent.name.replace(/[^a-zA-Z0-9_]/g, '_');
      definedNames.push({
        Name: safeName,
        Ref: 'Listas!$E$2:$E$' + (allSubcatNames.length + 1)
      });
    }
  });

  (workbook as any).Workbook = (workbook as any).Workbook || {};
  (workbook as any).Workbook.Names = definedNames;

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
