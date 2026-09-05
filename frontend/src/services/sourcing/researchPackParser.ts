import type { ResearchPack, ResearchPackItemInput, RetailerSource } from '../../types/sourcing';
import { resolveAdapterForUrl } from './adapters';

export interface ParseResult {
  valid: boolean;
  pack: ResearchPack;
  errors: string[];
  warnings: string[];
}

/**
 * Parsea un JSON o texto con formato versionado v1.0 de Research Pack de ChatGPT
 */
export function parseResearchPackJson(jsonString: string): ParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    const raw = JSON.parse(jsonString);

    if (!raw.items || !Array.isArray(raw.items)) {
      errors.push("El formato debe incluir un array de 'items'.");
      return {
        valid: false,
        pack: null as any,
        errors,
        warnings
      };
    }

    const items: ResearchPackItemInput[] = [];

    for (let i = 0; i < raw.items.length; i++) {
      const it = raw.items[i];
      if (!it.url || typeof it.url !== 'string') {
        warnings.push(`Item #${i + 1} omitido: no tiene URL válida.`);
        continue;
      }

      const adapter = resolveAdapterForUrl(it.url);
      const detectedRetailer: RetailerSource = it.retailer || adapter.source;

      items.push({
        url: it.url.trim(),
        retailer: detectedRetailer,
        brand: it.brand || undefined,
        license: it.license || undefined,
        line: it.line || undefined,
        character: it.character || undefined,
        scale: it.scale || undefined,
        upc: it.upc || undefined,
        mpn: it.mpn || undefined,
        reason: it.reason || 'catalog',
        tags: Array.isArray(it.tags) ? it.tags : ['evergreen'],
        price: it.price ? Number(it.price) : undefined
      });
    }

    const pack: ResearchPack = {
      schema_version: raw.schema_version || '1.0',
      pack_id: raw.pack_id || `pack-${Date.now().toString(36)}`,
      title: raw.title || 'Investigación ChatGPT Sin Título',
      generated_at: raw.generated_at || new Date().toISOString(),
      source: raw.source || 'chatgpt-research',
      status: 'READY',
      items_count: items.length,
      items
    };

    return {
      valid: items.length > 0,
      pack,
      errors,
      warnings
    };
  } catch (err: any) {
    errors.push(`Error de sintaxis JSON: ${err.message}`);
    return {
      valid: false,
      pack: null as any,
      errors,
      warnings
    };
  }
}

/**
 * Parsea una lista de URLs crudas (una por línea, separadas por coma o espacio)
 */
export function parseRawUrlsList(text: string, titleHint = 'Importación de URLs'): ParseResult {
  const lines = text
    .split(/[\n,;]+/)
    .map(l => l.trim())
    .filter(l => l.length > 5 && (l.startsWith('http://') || l.startsWith('https://')));

  const items: ResearchPackItemInput[] = lines.map(url => {
    const adapter = resolveAdapterForUrl(url);
    return {
      url,
      retailer: adapter.source,
      reason: 'manual-urls',
      tags: ['manual-import']
    };
  });

  const pack: ResearchPack = {
    schema_version: '1.0',
    pack_id: `urls-${Date.now().toString(36)}`,
    title: titleHint,
    generated_at: new Date().toISOString(),
    source: 'manual-urls',
    status: 'READY',
    items_count: items.length,
    items
  };

  return {
    valid: items.length > 0,
    pack,
    errors: items.length === 0 ? ['No se encontraron URLs válidas que comiencen con http/https.'] : [],
    warnings: []
  };
}

/**
 * Parsea contenido CSV con columnas url, brand, license, retailer...
 */
export function parseCsvInput(csvText: string, titleHint = 'Importación CSV'): ParseResult {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) {
    return {
      valid: false,
      pack: null as any,
      errors: ['El archivo CSV debe contener al menos un encabezado y una fila de datos.'],
      warnings: []
    };
  }

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
  const urlIdx = headers.findIndex(h => h === 'url' || h === 'link' || h === 'product_url');

  if (urlIdx === -1) {
    return {
      valid: false,
      pack: null as any,
      errors: ['El CSV no contiene una columna "url" o "link".'],
      warnings: []
    };
  }

  const brandIdx = headers.findIndex(h => h === 'brand' || h === 'marca');
  const licenseIdx = headers.findIndex(h => h === 'license' || h === 'licencia');
  const priceIdx = headers.findIndex(h => h === 'price' || h === 'precio');

  const items: ResearchPackItemInput[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    const url = cols[urlIdx];
    if (!url || !url.startsWith('http')) continue;

    const adapter = resolveAdapterForUrl(url);
    items.push({
      url,
      retailer: adapter.source,
      brand: brandIdx >= 0 ? cols[brandIdx] : undefined,
      license: licenseIdx >= 0 ? cols[licenseIdx] : undefined,
      price: priceIdx >= 0 ? Number(cols[priceIdx]) : undefined,
      tags: ['csv-import']
    });
  }

  const pack: ResearchPack = {
    schema_version: '1.0',
    pack_id: `csv-${Date.now().toString(36)}`,
    title: titleHint,
    generated_at: new Date().toISOString(),
    source: 'csv-upload',
    status: 'READY',
    items_count: items.length,
    items
  };

  return {
    valid: items.length > 0,
    pack,
    errors: items.length === 0 ? ['No se extrajo ningún registro válido del CSV.'] : [],
    warnings: []
  };
}
