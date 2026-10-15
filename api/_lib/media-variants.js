import { collectPublicMediaSources } from '../../shared/public-media-sources.js';

/** One optional indexed read, bounded independently of catalog availability. */
export async function readMediaVariants(client, value) {
  const urls = collectPublicMediaSources(value);
  if (!urls.length) return [];
  try {
    const { data, error } = await client.rpc('get_catalog_media_variants', { urls: urls.slice(0, 300) })
      .abortSignal(AbortSignal.timeout(2000));
    return error ? [] : data || [];
  } catch { return []; }
}
