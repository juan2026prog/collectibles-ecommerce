import ExcelJS from 'exceljs';
import { getMasterFields } from './productFieldRegistry';
import type { ProductFieldDefinition } from './productFieldRegistry';
import { fetchCatalogMetadataForTemplate, sanitizeExcelDefinedName, OFFICIAL_SYSTEM_BADGES } from './bulkTemplateGenerator';
import type { CatalogMetadata } from './bulkTemplateGenerator';
import { CONDITION_OPTIONS, getConditionLabel } from '../config/conditionConfig';
import { formatProductRecordForExport, normalizeExcelCellValue } from './bulkExportUtils';
import type { ExportProductItem } from './bulkExportUtils';

export interface BuildExcelOptions {
  userRole?: 'admin' | 'vendor';
  mode: 'template' | 'export';
  products?: ExportProductItem[];
  selectedKeys?: string[];
  metadata?: CatalogMetadata;
  sheetName?: string;
}

/**
 * Converts 1-indexed column index to Excel column letter (1 -> 'A', 27 -> 'AA').
 */
export function getColumnLetter(colIndex: number): string {
  let temp = colIndex;
  let letter = '';
  while (temp > 0) {
    const mod = (temp - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    temp = Math.floor((temp - mod) / 26);
  }
  return letter;
}

/**
 * Core engine that generates full OpenXML .XLSX workbooks with native Excel Data Validation dropdowns,
 * Defined Names for Category -> Subcategory dependent dropdowns, reference Listas sheet, and optional Guide sheet.
 */
export async function buildDynamicXlsxWorkbook(options: BuildExcelOptions): Promise<Blob> {
  const {
    userRole = 'admin',
    mode,
    products = [],
    selectedKeys = [],
    metadata: providedMetadata,
    sheetName: customSheetName
  } = options;

  const metadata = providedMetadata || (await fetchCatalogMetadataForTemplate());
  const masterFields = getMasterFields(userRole);

  const activeFields: ProductFieldDefinition[] = mode === 'template'
    ? masterFields.filter(f => f.importable && f.key !== 'id')
    : masterFields.filter(f => selectedKeys.includes(f.key));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Collectibles Uruguay';
  workbook.created = new Date();

  const mainSheetName = customSheetName || (mode === 'template' ? 'Plantilla de Importacion' : 'Productos');
  const mainSheet = workbook.addWorksheet(mainSheetName);

  // 1. Write Header Row (Row 1)
  const headers = activeFields.map(f => f.label);
  mainSheet.addRow(headers);

  // Format Header Row styling
  const headerRow = mainSheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1F2937' } // Dark gray slate
  };
  headerRow.height = 24;

  // 2. Write Data Rows or Sample Rows
  if (mode === 'template') {
    const sampleRow1 = activeFields.map(f => {
      if (f.key === 'mbe_packaging_type') return 'MBE PAK';
      if (f.key === 'argentina_shipping_status') return 'Envío automático';
      return f.example || '';
    });
    const sampleRow2 = activeFields.map(f => {
      if (f.key === 'title') return 'Ejemplo Producto 2';
      if (f.key === 'mbe_packaging_type') return 'MBE Caja';
      if (f.key === 'argentina_shipping_status') return 'Requiere cotización';
      return f.example || '';
    });
    mainSheet.addRow(sampleRow1);
    mainSheet.addRow(sampleRow2);
  } else {
    products.forEach(prod => {
      const formatted = formatProductRecordForExport(prod, activeFields.map(f => f.key), userRole);
      const rowValues = activeFields.map(f => {
        const val = formatted[f.key];
        return normalizeExcelCellValue(val);
      });
      mainSheet.addRow(rowValues);
    });
  }

  // 3. Create Listas Reference Sheet (Hidden)
  const listsSheet = workbook.addWorksheet('Listas');
  listsSheet.state = 'hidden';

  const mbeTypes = ['MBE PAK', 'MBE Caja', 'Sin definir'];
  const arStatuses = ['Envío automático', 'Requiere cotización'];
  const brandNames = metadata.brands.map(b => b.name).filter(Boolean);
  const mainCategories = metadata.categories.filter(c => !c.parent_id && c.name);
  const mainCatNames = mainCategories.map(c => c.name);
  const allSubcatNames = metadata.categories.filter(c => c.parent_id && c.name).map(c => c.name);
  const licenseNames = metadata.licenses.map(l => l.name).filter(Boolean);
  
  // Deduplicate Vendors and include "Collectibles Oficial"
  const rawVendorNames = metadata.vendors.map(v => v.store_name).filter(Boolean);
  const vendorNames = Array.from(new Set(['Collectibles Oficial', ...rawVendorNames]));
  
  const conditions = CONDITION_OPTIONS.map(c => getConditionLabel(c.value));
  const statuses = ['published', 'draft', 'archived'];
  const badges = metadata.badges && metadata.badges.length > 0 ? metadata.badges : OFFICIAL_SYSTEM_BADGES;
  const destacadoOptions = ['Sí', 'No'];
  const tagNames = metadata.tags ? metadata.tags.map(t => t.name).filter(Boolean) : [];

  const baseListCols = [
    { title: 'TIPO_MBE', data: mbeTypes },         // Col 1 (A)
    { title: 'ESTADO_AR', data: arStatuses },       // Col 2 (B)
    { title: 'MARCAS', data: brandNames },          // Col 3 (C)
    { title: 'CATEGORIAS', data: mainCatNames },    // Col 4 (D)
    { title: 'SUBCATEGORIAS', data: allSubcatNames },// Col 5 (E)
    { title: 'LICENCIAS', data: licenseNames },      // Col 6 (F)
    { title: 'VENDEDORES', data: vendorNames },      // Col 7 (G)
    { title: 'CONDICIONES', data: conditions },      // Col 8 (H)
    { title: 'ESTADOS', data: statuses },          // Col 9 (I)
    { title: 'COCARDAS', data: badges },            // Col 10 (J)
    { title: 'DESTACADO', data: destacadoOptions },  // Col 11 (K)
    { title: 'ETIQUETAS', data: tagNames },          // Col 12 (L)
    { title: 'EMPTY_REF', data: [''] }              // Col 13 (M) - Dummy empty reference for 0-children categories
  ];

  // Write base list headers (Row 1)
  const baseHeaders = baseListCols.map(c => c.title);
  listsSheet.addRow(baseHeaders);

  const maxBaseRows = Math.max(...baseListCols.map(c => c.data.length), 1);
  for (let r = 0; r < maxBaseRows; r++) {
    const rowValues = baseListCols.map(c => {
      const item = c.data[r];
      return item !== undefined && item !== null ? String(item) : '';
    });
    listsSheet.addRow(rowValues);
  }

  // 4. Subcategory Defined Names & Parent Category Range Mapping
  const definedNameTracker = new Set<string>();
  let nextSubcatColIdx = 14; // Start at Col N (14)

  mainCategories.forEach(parent => {
    const children = metadata.categories.filter(c => c.parent_id === parent.id).map(c => c.name).filter(Boolean);
    const definedName = sanitizeExcelDefinedName(parent.name, parent.id, definedNameTracker);
    
    if (children.length > 0) {
      const colLetter = getColumnLetter(nextSubcatColIdx);
      listsSheet.getCell(`${colLetter}1`).value = `SUBCATS_${definedName}`;
      
      children.forEach((childName, idx) => {
        listsSheet.getCell(`${colLetter}${idx + 2}`).value = childName;
      });

      // Add Defined Name for Excel
      workbook.definedNames.add(`Listas!$${colLetter}$2:$${colLetter}$${children.length + 1}`, definedName);
      nextSubcatColIdx++;
    } else {
      // Point to empty cell M2 so INDIRECT evaluates to empty list without error
      workbook.definedNames.add('Listas!$M$2:$M$2', definedName);
    }
  });

  // 5. Apply Native Data Validations on Main Sheet (Rows 2:5000)
  const categoryColIdx = activeFields.findIndex(f => f.key === 'category_name') + 1;
  const categoryColLetter = categoryColIdx > 0 ? getColumnLetter(categoryColIdx) : 'F';

  activeFields.forEach((field, idx) => {
    const colIdx = idx + 1;
    const colLetter = getColumnLetter(colIdx);
    const range = `${colLetter}2:${colLetter}5000`;

    if (!field.controlledValidation) return;

    const source = field.controlledValidation.source;

    if (source === 'brands' && brandNames.length > 0) {
      mainSheet.dataValidations.add(range, {
        type: 'list',
        allowBlank: true,
        formulae: [`Listas!$C$2:$C$${brandNames.length + 1}`]
      });
    } else if (source === 'categories' && mainCatNames.length > 0) {
      mainSheet.dataValidations.add(range, {
        type: 'list',
        allowBlank: true,
        formulae: [`Listas!$D$2:$D$${mainCatNames.length + 1}`]
      });
    } else if (source === 'subcategories') {
      // Dependent list formula referencing Category cell (categoryColLetter)
      // Substitutes spaces, ampersands, exclamation marks, hyphens, and diacritics into Excel Defined Name format
      const formula = `=INDIRECT("CAT_" & UPPER(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(${categoryColLetter}2, "á", "A"), "é", "E"), "í", "I"), "ó", "O"), "ú", "U"), " ", "_"), "&", "_"), "!", "_"), "-", "_")))`;
      mainSheet.dataValidations.add(range, {
        type: 'list',
        allowBlank: true,
        formulae: [formula]
      });
    } else if (source === 'licenses' && licenseNames.length > 0) {
      mainSheet.dataValidations.add(range, {
        type: 'list',
        allowBlank: true,
        formulae: [`Listas!$F$2:$F$${licenseNames.length + 1}`]
      });
    } else if (source === 'vendors' && vendorNames.length > 0) {
      mainSheet.dataValidations.add(range, {
        type: 'list',
        allowBlank: true,
        formulae: [`Listas!$G$2:$G$${vendorNames.length + 1}`]
      });
    } else if (source === 'conditions' && conditions.length > 0) {
      mainSheet.dataValidations.add(range, {
        type: 'list',
        allowBlank: true,
        formulae: [`Listas!$H$2:$H$${conditions.length + 1}`]
      });
    } else if (source === 'status' && statuses.length > 0) {
      mainSheet.dataValidations.add(range, {
        type: 'list',
        allowBlank: true,
        formulae: [`Listas!$I$2:$I$${statuses.length + 1}`]
      });
    } else if (source === 'badges' && badges.length > 0) {
      mainSheet.dataValidations.add(range, {
        type: 'list',
        allowBlank: true,
        formulae: [`Listas!$J$2:$J$${badges.length + 1}`]
      });
    } else if (source === 'destacado' && destacadoOptions.length > 0) {
      mainSheet.dataValidations.add(range, {
        type: 'list',
        allowBlank: true,
        formulae: [`Listas!$K$2:$K$${destacadoOptions.length + 1}`]
      });
    } else if (source === 'mbe_packaging' && mbeTypes.length > 0) {
      mainSheet.dataValidations.add(range, {
        type: 'list',
        allowBlank: true,
        formulae: [`Listas!$A$2:$A$${mbeTypes.length + 1}`]
      });
    }
  });

  // 6. Build Guia de Importacion Worksheet (if mode === 'template')
  if (mode === 'template') {
    const guideSheet = workbook.addWorksheet('Guia de Importacion');
    const guideHeaders = [
      'Campo (Columna)',
      'Descripción',
      'Obligatorio (Publicar)',
      'Tipo de Dato',
      'Valores Permitidos / Fuente',
      'Ejemplo de Uso'
    ];
    guideSheet.addRow(guideHeaders);

    const guideHeaderRow = guideSheet.getRow(1);
    guideHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    guideHeaderRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F2937' }
    };

    activeFields.forEach(field => {
      let allowedDesc = 'Texto libre';
      if (field.key === 'mbe_packaging_type') {
        allowedDesc = 'Desplegable: MBE PAK, MBE Caja, Sin definir';
      } else if (field.key === 'argentina_shipping_status') {
        allowedDesc = 'Solo Lectura / Calculado automáticamente (No editable)';
      } else if (field.controlledValidation) {
        allowedDesc = `Desplegable con ${field.label} vigentes en la plataforma`;
      } else if (field.type === 'enum' && field.allowedValues) {
        allowedDesc = field.allowedValues.map(v => v.label || v.value).join(', ');
      } else if (field.type === 'decimal' || field.type === 'number') {
        allowedDesc = 'Número positivo';
      } else if (field.type === 'url') {
        allowedDesc = 'URL HTTP/HTTPS';
      } else if (field.type === 'array') {
        allowedDesc = 'Valores separados por comas o barra |';
      }

      guideSheet.addRow([
        field.label,
        field.description,
        field.requiredForPublish ? 'SÍ' : 'No',
        field.type.toUpperCase(),
        allowedDesc,
        field.example
      ]);
    });

    guideSheet.columns.forEach((col, idx) => {
      col.width = [25, 45, 20, 15, 35, 30][idx] || 20;
    });
  }

  // 7. Auto Widths for Main Sheet Columns
  mainSheet.columns.forEach((col, i) => {
    const f = activeFields[i];
    const labelLen = f ? f.label.length : 15;
    col.width = Math.min(Math.max(labelLen + 4, 14), 50);
  });

  // Write Excel file to buffer and Blob
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
}
