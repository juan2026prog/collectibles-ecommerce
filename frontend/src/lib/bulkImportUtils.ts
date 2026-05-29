import * as XLSX from 'xlsx';

export interface ParsedProduct {
  title: string;
  base_price: number;
  compare_at_price?: number;
  sku: string;
  stock: number;
  category_name?: string;
  brand_name?: string;
  image_url?: string;
  description?: string;
  raw_row?: any;
}

/**
 * Downloads an empty template for the user.
 */
export function downloadTemplate() {
  const ws = XLSX.utils.json_to_sheet([
    {
      title: 'Ejemplo Producto: Figura Batman',
      base_price: 2500,
      compare_at_price: 3000,
      sku: 'BAT-001',
      stock: 12,
      category_name: 'Figuras',
      brand_name: 'DC Comics',
      image_url: 'https://ejemplo.com/batman.jpg',
      description: 'Figura coleccionable edición especial.'
    }
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Productos');
  XLSX.writeFile(wb, 'Plantilla_Productos.xlsx');
}

/**
 * Parses a File (CSV or XLSX) into an array of ParsedProduct
 */
export async function parseProductsFile(file: File): Promise<ParsedProduct[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) throw new Error("No se encontraron datos en el archivo");

        const workbook = XLSX.read(data, { type: 'array' });
        
        let worksheet = null;
        let rawRows: any[] = [];
        
        // Find the first sheet that actually has data
        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
          if (rows && rows.length > 0) {
            worksheet = sheet;
            rawRows = rows;
            break;
          }
        }

        console.log('[BulkImport] Archivo cargado:', file.name, 'Hojas:', workbook.SheetNames, 'Filas leídas:', rawRows.length);
        
        if (rawRows.length === 0) {
          resolve([]);
          return;
        }

        const parsedProducts: ParsedProduct[] = [];

        // Helper to search for values using synonyms
        const findValue = (processedRow: any, synonyms: string[]): any => {
          for (const syn of synonyms) {
            if (processedRow[syn] !== undefined && processedRow[syn] !== null && processedRow[syn] !== '') {
              return processedRow[syn];
            }
          }
          return undefined;
        };

        for (const row of rawRows) {
          const processedRow: any = {};
          // Normalize keys: lowercase and trim whitespace
          for (const key in row) {
            processedRow[key.toLowerCase().trim()] = row[key];
          }

          // Resolve title (essential field)
          const title = findValue(processedRow, ['title', 'título', 'titulo', 'nombre', 'producto', 'product', 'name', 'articulo', 'artículo']);
          if (!title) continue;

          // Resolve base price
          const basePriceVal = findValue(processedRow, ['base_price', 'precio', 'price', 'base price', 'venta', 'precio de venta', 'precio base', 'unit price', 'precio unitario']);
          const base_price = basePriceVal ? parseFloat(basePriceVal.toString().replace(/[^0-9.]/g, '')) || 0 : 0;

          // Resolve compare at price (optional)
          const comparePriceVal = findValue(processedRow, ['compare_at_price', 'precio_comparacion', 'precio anterior', 'precio original', 'compare price', 'regular_price', 'precio lista', 'precio_lista']);
          const compare_at_price = comparePriceVal ? parseFloat(comparePriceVal.toString().replace(/[^0-9.]/g, '')) || undefined : undefined;

          // Resolve SKU
          const sku = (findValue(processedRow, ['sku', 'referencia', 'código', 'codigo', 'cod', 'ref', 'código de barras', 'barcode']) || '').toString().trim();

          // Resolve Stock
          const stockVal = findValue(processedRow, ['stock', 'cantidad', 'inventario', 'inventory', 'qty', 'quantity', 'unidades']);
          const stock = stockVal !== undefined ? parseInt(stockVal.toString(), 10) || 0 : 0;

          // Resolve Category
          const category_name = (findValue(processedRow, ['category_name', 'category', 'categoría', 'categoria', 'rubro', 'grupo']) || '').toString().trim();

          // Resolve Brand
          const brand_name = (findValue(processedRow, ['brand_name', 'brand', 'marca']) || '').toString().trim();

          // Resolve Image URL
          const image_url = (findValue(processedRow, ['image_url', 'image', 'imagen', 'foto', 'url imagen', 'url_imagen', 'img']) || '').toString().trim();

          // Resolve Description
          const description = (findValue(processedRow, ['description', 'descripción', 'descripcion', 'detalle', 'observaciones']) || '').toString().trim();

          parsedProducts.push({
            title: title.toString(),
            base_price,
            compare_at_price,
            sku,
            stock,
            category_name,
            brand_name,
            image_url,
            description,
            raw_row: row
          });
        }

        console.log('[BulkImport] Productos parseados exitosamente:', parsedProducts.length);
        resolve(parsedProducts);
      } catch (error) {
        console.error('[BulkImport] Error parseando archivo:', error);
        reject(error);
      }
    };

    reader.onerror = (error) => reject(error);

    reader.readAsArrayBuffer(file);
  });
}
