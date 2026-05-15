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

/**
 * Resolves a single URL string to a usable image src.
 */
function resolveImageUrl(url: string | null | undefined): string {
  if (!url || typeof url !== 'string') return FALLBACK_IMAGE;

  const trimmed = url.trim();
  if (!trimmed) return FALLBACK_IMAGE;

  // Already a full URL (http/https/data)
  if (/^(https?:\/\/|data:)/.test(trimmed)) {
    // Block via.placeholder.com in production
    if (trimmed.includes('via.placeholder.com')) return FALLBACK_IMAGE;
    return trimmed;
  }

  // UUID-only pattern (e.g. "a1b2c3d4-e5f6-...")
  if (/^[a-f0-9-]{36}$/i.test(trimmed)) {
    return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${trimmed}`;
  }

  // Relative path (bucket path like "products/image.jpg")
  if (!trimmed.startsWith('/')) {
    return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${trimmed}`;
  }

  // Absolute path starting with /
  return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}${trimmed}`;
}

/**
 * Gets the best product image from a product object.
 * Supports product.images array, picks primary first.
 */
export function getProductImage(product: any): string {
  if (!product) return FALLBACK_IMAGE;

  const images = product.images;

  // Handle images array
  if (Array.isArray(images) && images.length > 0) {
    // Try primary image first
    const primary = images.find((img: any) => img.is_primary);
    if (primary?.url) {
      const resolved = resolveImageUrl(primary.url);
      if (resolved !== FALLBACK_IMAGE) return resolved;
    }

    // Fall through sorted images
    const sorted = [...images].sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0));
    for (const img of sorted) {
      const resolved = resolveImageUrl(img?.url);
      if (resolved !== FALLBACK_IMAGE) return resolved;
    }
  }

  // Fallback: product.image_url or product.image (single field)
  if (product.image_url) return resolveImageUrl(product.image_url);
  if (product.image) return resolveImageUrl(product.image);

  return FALLBACK_IMAGE;
}

/**
 * Resolves a specific image URL (e.g., from images array, cart items, thumbnails).
 */
export function resolveImage(url: string | null | undefined): string {
  return resolveImageUrl(url);
}

/** Exported fallback for direct use */
export { FALLBACK_IMAGE };
