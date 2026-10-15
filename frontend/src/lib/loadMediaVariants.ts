import { supabase } from './supabase';
import { collectMediaUrls, registerMediaVariants } from './mediaVariants';

const checked = new Map<string, number>();
/** One bounded batch before rendering detail; absence/error always keeps the original usable. */
export async function loadMediaVariants(value: unknown) {
  const urls = collectMediaUrls(value).filter(url => (checked.get(url) || 0) < Date.now()).slice(0, 150);
  if (!urls.length) return;
  try {
    const { data, error } = await supabase.rpc('get_catalog_media_variants', { urls })
      .abortSignal(AbortSignal.timeout(2000));
    if (!error) {
      registerMediaVariants(data || []);
      urls.forEach(url => checked.set(url, Date.now() + 60000));
    }
  } catch { /* Derivatives are optional; do not fail the product page. */ }
}
