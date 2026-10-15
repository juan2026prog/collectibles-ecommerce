import { collectPublicMediaSources } from '../../../shared/public-media-sources.js';

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
  return collectPublicMediaSources(value);
}
