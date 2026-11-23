// frontend/src/lib/argentina/excelExporter.ts
/**
 * Structured Excel Exporter for Deblex Operational Communication
 * 
 * Generates official manifest spreadsheets with:
 * - Order number
 * - Original Amazon/carrier tracking
 * - Recipient document type and clean number
 * - Buyer full name
 * - Product title & quantity
 * - FOB value & weight
 * - Internal package ID and consolidation code
 * - Logistics reference
 */

import * as XLSX from 'xlsx';

export interface DeblexExportRow {
  pedido_collectibles: string;
  tracking_original: string;
  tipo_documento: string;
  numero_documento: string;
  nombre_destinatario: string;
  producto: string;
  cantidad: number;
  valor_fob_usd: number;
  peso_kg: number;
  id_paquete: string;
  codigo_consolidacion: string;
  estado_paquete: string;
  fecha_registro: string;
  referencia_logistica: string;
}

export function generateDeblexExcelBuffer(rows: DeblexExportRow[]): Uint8Array {
  const worksheet = XLSX.utils.json_to_sheet(rows);

  // Set column headers and reasonable widths
  const colWidths = [
    { wch: 18 }, // pedido_collectibles
    { wch: 24 }, // tracking_original
    { wch: 14 }, // tipo_documento
    { wch: 16 }, // numero_documento
    { wch: 25 }, // nombre_destinatario
    { wch: 30 }, // producto
    { wch: 10 }, // cantidad
    { wch: 14 }, // valor_fob_usd
    { wch: 12 }, // peso_kg
    { wch: 36 }, // id_paquete
    { wch: 24 }, // codigo_consolidacion
    { wch: 20 }, // estado_paquete
    { wch: 18 }, // fecha_registro
    { wch: 25 }, // referencia_logistica
  ];
  worksheet['!cols'] = colWidths;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Manifiesto_Deblex');

  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  return new Uint8Array(excelBuffer);
}

export function downloadDeblexExcel(rows: DeblexExportRow[], filename?: string): void {
  const buffer = generateDeblexExcelBuffer(rows);
  const blob = new Blob([buffer.buffer as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `Manifiesto_Deblex_AR_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
