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
        if (!data) throw new Error("No data found in file");

        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert to JSON
        const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
        
        if (!rawRows || rawRows.length === 0) {
          resolve([]);
          return;
        }

        // Determine format based on keys (MercadoLibre vs Plantilla Propia)
        const sampleKeys = Object.keys(rawRows[0]).map(k => k.toLowerCase().trim());
        const isMercadoLibre = sampleKeys.some(k => k.includes('título') || k.includes('sku') || k.includes('precio') || k.includes('stock'));

        const parsedProducts: ParsedProduct[] = [];

        for (const row of rawRows) {
          const processedRow: any = {};
          // Normalize keys: lowercased and trimmed
          for (const key in row) {
             processedRow[key.toLowerCase().trim()] = row[key];
          }

          if (isMercadoLibre) {
            // Mapping Mercado Libre template
            // Columns usually look like: 'título', 'precio', 'sku', 'stock', 'condición', etc.
            const title = processedRow['título'] || processedRow['titulo'] || '';
            const priceStr = processedRow['precio'] || '0';
            const sku = processedRow['sku'] || '';
            const stockStr = processedRow['stock'] || processedRow['cantidad'] || '0';

            if (!title) continue;

            parsedProducts.push({
              title: title.toString(),
              base_price: parseFloat(priceStr.toString().replace(/,/g, '')) || 0,
              sku: sku.toString(),
              stock: parseInt(stockStr.toString(), 10) || 0,
              raw_row: row
            });
          } else {
            // Mapping Standard Template
            const title = processedRow['title'] || '';
            if (!title) continue;

            parsedProducts.push({
              title: title.toString(),
              base_price: parseFloat(processedRow['base_price']) || 0,
              compare_at_price: parseFloat(processedRow['compare_at_price']) || undefined,
              sku: (processedRow['sku'] || '').toString(),
              stock: parseInt(processedRow['stock'], 10) || 0,
              category_name: (processedRow['category_name'] || '').toString(),
              brand_name: (processedRow['brand_name'] || '').toString(),
              image_url: (processedRow['image_url'] || '').toString(),
              description: (processedRow['description'] || '').toString(),
              raw_row: row
            });
          }
        }

        resolve(parsedProducts);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = (error) => reject(error);

    // Use readAsBinaryString for xlsx support with FileReader
    reader.readAsBinaryString(file);
  });
}
