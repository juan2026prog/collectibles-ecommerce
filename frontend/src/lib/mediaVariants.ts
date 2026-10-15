export interface ImageDerivative { url: string; width: number; height: number; bytes: number }
export interface MediaVariantRecord {
  original_url: string; width: number; height: number; original_bytes: number;
  source_url?: string | null;
  variants: Partial<Record<'thumbnail' | 'card' | 'card-2x' | 'detail', ImageDerivative>>;
}

const registry = new Map<string, MediaVariantRecord>();
export function registerMediaVariants(records: MediaVariantRecord[] = []) {
  for (const record of records) if (record?.original_url && record.variants) {
    registry.set(record.original_url, record);
    if (record.source_url) registry.set(record.source_url, record);
  }
}
export function getMediaVariants(url: string) { return registry.get(url); }

/** Collect only public image references, never arbitrary product/customer data. */
export function collectMediaUrls(value: any): string[] {
  const urls = new Set<string>();
  const visit = (item: any, key = '') => {
    if (typeof item === 'string' && /(?:url|image|logo|icon)/i.test(key)
      && /^https:\/\/(?:cobtsgkwcftvexaarwmo\.supabase\.co\/storage\/v1\/object\/public\/(?:public-assets|product-images)\/|http2\.mlstatic\.com\/|m\.media-amazon\.com\/images\/I\/)/.test(item)) urls.add(item);
    else if (Array.isArray(item)) item.forEach(child => visit(child, key));
    else if (item && typeof item === 'object') Object.entries(item).forEach(([k, v]) => visit(v, k));
  };
  visit(value);
  return [...urls];
}
