/** Public original references only. Registry payloads must not feed their own
 * generated derivatives back into catalog discovery or migration. */
export function isPublicMediaSource(value) {
  return typeof value === 'string' && !value.includes('/_variants/')
    && /^https:\/\/(?:cobtsgkwcftvexaarwmo\.supabase\.co\/storage\/v1\/object\/public\/(?:public-assets|product-images)\/|http2\.mlstatic\.com\/|m\.media-amazon\.com\/images\/I\/)/.test(value);
}

export function collectPublicMediaSources(value) {
  const urls = new Set();
  const visit = (item, key = '') => {
    if (key === 'image_variants') return;
    if (typeof item === 'string' && /url|image|logo|icon|main|link/i.test(key)
      && isPublicMediaSource(item)) urls.add(item);
    else if (Array.isArray(item)) item.forEach(child => visit(child, key));
    else if (item && typeof item === 'object') Object.entries(item).forEach(([name, child]) => visit(child, name));
  };
  visit(value);
  return [...urls];
}
