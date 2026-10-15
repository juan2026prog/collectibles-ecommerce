/** One optional indexed read, bounded independently of catalog availability. */
export async function readMediaVariants(client, value) {
  const urls = new Set();
  const visit = (item, key = '') => {
    if (typeof item === 'string' && /url|image|logo|icon/i.test(key)
      && /^https:\/\/(?:cobtsgkwcftvexaarwmo\.supabase\.co\/storage\/v1\/object\/public\/(?:public-assets|product-images)\/|http2\.mlstatic\.com\/|m\.media-amazon\.com\/images\/I\/)/.test(item)) urls.add(item);
    else if (Array.isArray(item)) item.forEach(child => visit(child, key));
    else if (item && typeof item === 'object') Object.entries(item).forEach(([k, v]) => visit(v, k));
  };
  visit(value);
  if (!urls.size) return [];
  try {
    const { data, error } = await client.rpc('get_catalog_media_variants', { urls: [...urls].slice(0, 300) })
      .abortSignal(AbortSignal.timeout(2000));
    return error ? [] : data || [];
  } catch { return []; }
}
