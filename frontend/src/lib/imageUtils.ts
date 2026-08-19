/**
 * Centralized product image resolver for Collectibles.
 * 
 * Handles all image URL formats stored in the database:
 * - Full HTTPS URL → returned as-is
 * - Supabase Storage bucket path (e.g. "folder/file.jpg") → resolved to full public URL
 * - UUID-only filename (e.g. "a1b2c3d4-...") → resolved via product-images bucket
 * - Array of images → picks the primary or first available
 * - Missing/null → returns local SVG fallback (no external placeholder services)
 */

const SUPABASE_URL = 'https://cobtsgkwcftvexaarwmo.supabase.co';
const STORAGE_BUCKET = 'product-images';

/** Local inline SVG fallback — no external requests, no via.placeholder.com */
const FALLBACK_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400' fill='none'%3E%3Crect width='400' height='400' rx='24' fill='%23111827'/%3E%3Cpath d='M200 160c-22 0-40 18-40 40s18 40 40 40 40-18 40-40-18-40-40-40zm0 64c-13.3 0-24-10.7-24-24s10.7-24 24-24 24 10.7 24 24-10.7 24-24 24z' fill='%231f2937'/%3E%3Cpath d='M280 136h-33.4l-12.8-16H166.2l-12.8 16H120c-8.8 0-16 7.2-16 16v112c0 8.8 7.2 16 16 16h160c8.8 0 16-7.2 16-16V152c0-8.8-7.2-16-16-16z' fill='%231f2937' opacity='.5'/%3E%3C/svg%3E";

export type ImageSizeVariant = 'thumbnail' | 'card' | 'detail' | 'raw';

/**
 * Resolves a single URL string to a usable image src with optional size transformation.
 */
function resolveImageUrl(url: string | null | undefined, variant: ImageSizeVariant = 'card'): string {
  if (!url || typeof url !== 'string') return FALLBACK_IMAGE;

  const trimmed = url.trim();
  if (!trimmed) return FALLBACK_IMAGE;

  let rawUrl = trimmed;

  // Block via.placeholder.com in production
  if (rawUrl.includes('via.placeholder.com')) return FALLBACK_IMAGE;

  // UUID-only pattern (e.g. "a1b2c3d4-e5f6-...")
  if (/^[a-f0-9-]{36}$/i.test(trimmed)) {
    rawUrl = `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${trimmed}`;
  } else if (!/^(https?:\/\/|data:)/.test(trimmed)) {
    // Relative path (bucket path like "products/image.jpg")
    const cleanPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    rawUrl = `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}${cleanPath}`;
  }

  // If raw, or data URI, return full original URL
  if (variant === 'raw' || rawUrl.startsWith('data:')) {
    return rawUrl;
  }

  // Apply Supabase Storage Render transformation if it's a Supabase Storage URL
  if (rawUrl.includes(`${SUPABASE_URL}/storage/v1/object/public/`)) {
    const renderUrl = rawUrl.replace(
      `${SUPABASE_URL}/storage/v1/object/public/`,
      `${SUPABASE_URL}/storage/v1/render/image/public/`
    );
    const params = variant === 'thumbnail'
      ? '?width=240&height=240&resize=contain&quality=80'
      : variant === 'card'
      ? '?width=500&height=500&resize=contain&quality=80'
      : '?width=1200&height=1200&resize=contain&quality=85';
    return `${renderUrl}${params}`;
  }

  return rawUrl;
}

/**
 * Gets the best product image from a product object.
 * Supports product.images array, picks primary first.
 */
export function getProductImage(product: any, variant: ImageSizeVariant = 'card'): string {
  if (!product) return FALLBACK_IMAGE;

  const images = product.images;

  // Handle images array
  if (Array.isArray(images) && images.length > 0) {
    // Try primary image first
    const primary = images.find((img: any) => img.is_primary);
    if (primary?.url) {
      const resolved = resolveImageUrl(primary.url, variant);
      if (resolved !== FALLBACK_IMAGE) return resolved;
    }

    // Fall through sorted images
    const sorted = [...images].sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0));
    for (const img of sorted) {
      const resolved = resolveImageUrl(img?.url, variant);
      if (resolved !== FALLBACK_IMAGE) return resolved;
    }
  }

  // Fallback: product.image_url or product.image (single field)
  if (product.image_url) return resolveImageUrl(product.image_url, variant);
  if (product.image) return resolveImageUrl(product.image, variant);

  return FALLBACK_IMAGE;
}

/**
 * Resolves a specific image URL (e.g., from images array, cart items, thumbnails).
 */
export function resolveImage(url: string | null | undefined, variant: ImageSizeVariant = 'card'): string {
  return resolveImageUrl(url, variant);
}

/** Exported fallback for direct use */
export { FALLBACK_IMAGE };

