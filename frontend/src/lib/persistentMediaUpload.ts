import { supabase } from './supabase';
import { loadImage, canvasToBlob } from './imageUploadOptimizer';
import { registerMediaVariants, type ImageDerivative } from './mediaVariants';

export async function createPersistentVariants(bucket: string, path: string, file: File) {
  if (!['public-assets', 'product-images'].includes(bucket)
    || !/^image\/(jpeg|png|webp|avif)$/.test(file.type)) return;
  const original_url = supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  const bytes = await file.arrayBuffer();
  if (file.type === 'image/webp' && new TextDecoder('latin1').decode(bytes).includes('ANIM')) return;
  const content_hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map(value => value.toString(16).padStart(2, '0')).join('');
  const { data: existing } = await supabase.from('media_image_variants').select('content_hash')
    .eq('original_url', original_url).maybeSingle();
  if (existing?.content_hash === content_hash) return;
  const image = await loadImage(file);
  const variants: Record<string, ImageDerivative> = {};
  const generated = new Map<number, ImageDerivative | null>();
  const folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : 'media/';
  for (const [name, target] of Object.entries({ thumbnail: 160, card: 320, 'card-2x': 640, detail: 960 })) {
    const width = Math.min(target, image.naturalWidth);
    if (!generated.has(width)) {
      const height = Math.max(1, Math.round(width * image.naturalHeight / image.naturalWidth));
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d', { alpha: true });
      if (!context) throw new Error('Canvas unavailable');
      context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
      context.drawImage(image, 0, 0, width, height);
      const blob = await canvasToBlob(canvas, 0.86);
      if (blob.type !== 'image/webp') throw new Error('WebP encoder unavailable');
      if (blob.size >= file.size && width === image.naturalWidth) { generated.set(width, null); continue; }
      const variantPath = `${folder}_variants/v1/${content_hash}/${width}.webp`;
      const { error } = await supabase.storage.from(bucket).upload(variantPath, blob,
        { cacheControl: '31536000', upsert: false, contentType: 'image/webp' });
      if (error && !/already exists|duplicate/i.test(error.message)) throw error;
      generated.set(width, { url: supabase.storage.from(bucket).getPublicUrl(variantPath).data.publicUrl,
        width, height, bytes: blob.size });
    }
    const derivative = generated.get(width);
    if (derivative) variants[name] = derivative;
  }
  const record = { original_url, bucket_id: bucket, object_path: path, content_hash,
    width: image.naturalWidth, height: image.naturalHeight, original_bytes: file.size, variants };
  const { error } = await supabase.from('media_image_variants').upsert(record, { onConflict: 'original_url' });
  if (error) throw error;
  registerMediaVariants([record]);
}

/** Upload the unchanged original first; derivative failure never loses the original. */
export async function uploadPublicMedia(bucket: string, path: string, file: File) {
  const result = await supabase.storage.from(bucket).upload(path, file,
    { cacheControl: '3600', upsert: false, contentType: file.type || undefined });
  if (result.error) return result;
  try { await createPersistentVariants(bucket, path, file); }
  catch { console.warn('[media-variants] Original saved; derivative generation needs retry'); }
  return result;
}
