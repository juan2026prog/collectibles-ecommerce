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

/** Local inline SVG fallback — clean neutral background, crisp icon, no external requests */
const FALLBACK_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400' viewBox='0 0 400 400' fill='none'%3E%3Crect width='400' height='400' rx='16' fill='%23f8fafc' stroke='%23e2e8f0' stroke-width='2'/%3E%3Cg opacity='0.45' transform='translate(136, 120)'%3E%3Crect x='10' y='26' width='108' height='88' rx='12' stroke='%2364748b' stroke-width='6' fill='%23ffffff'/%3E%3Ccircle cx='46' cy='56' r='14' fill='%2394a3b8'/%3E%3Cpath d='M20 98l28-28 20 20 32-34 18 18v24H20v-0z' fill='%23cbd5e1'/%3E%3Cpath d='M44 14h40l8 12h18a10 10 0 0110 10v4' stroke='%2364748b' stroke-width='5' stroke-linecap='round' fill='none'/%3E%3C/g%3E%3Ctext x='200' y='276' text-anchor='middle' fill='%2394a3b8' font-family='system-ui, -apple-system, sans-serif' font-size='13' font-weight='600' letter-spacing='0.5'%3ESIN IMAGEN%3C/text%3E%3C/svg%3E";

export type ImageSizeVariant = 'thumbnail' | 'card' | 'detail' | 'raw';

const INVALID_IMAGE_PATTERNS = [
  /via\.placeholder\.com/i,
  /example\.jpg/i,
  /xyz\.jpg/i,
  /sample\.jpg/i,
  /test\.jpg/i,
  /placeholder/i,
];

function isInvalidImageUrl(url: string): boolean {
  if (!url) return true;
  return INVALID_IMAGE_PATTERNS.some(p => p.test(url));
}

// In-memory cache of known broken / 404 image URLs in the current session
const brokenImageUrls = new Set<string>();

export function markBrokenImageUrl(url: string | null | undefined): void {
  if (url && typeof url === 'string') {
    const trimmed = url.trim();
    if (trimmed && !trimmed.startsWith('data:')) {
      brokenImageUrls.add(trimmed);
    }
  }
}

export function isBrokenImageUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  return brokenImageUrls.has(url.trim());
}

/**
 * Extracts all possible candidate image URLs from a raw or normalized product object in priority order.
 */
export function extractCandidateImages(product: any): string[] {
  if (!product) return [];
  const urls: string[] = [];

  const add = (u: any) => {
    if (typeof u === 'string') {
      const trimmed = u.trim();
      if (
        trimmed && 
        !isInvalidImageUrl(trimmed) && 
        !isBrokenImageUrl(trimmed) &&
        !trimmed.startsWith('data:image/svg+xml') && 
        !urls.includes(trimmed)
      ) {
        urls.push(trimmed);

        // Amazon image CDN URLs often include transient resize directives such as
        // ._AC_UL320_ that may 404 while the original asset remains available.
        // Add the directive-free original as a fallback candidate.
        if (/m\.media-amazon\.com\/images\/I\//i.test(trimmed)) {
          const original = trimmed.replace(/\._[^.]+_\.(jpg|jpeg|png|webp)(\?.*)?$/i, '.$1$2');
          if (
            original !== trimmed &&
            !isInvalidImageUrl(original) &&
            !isBrokenImageUrl(original) &&
            !urls.includes(original)
          ) {
            urls.push(original);
          }
        }
      }
    } else if (u && typeof u === 'object' && typeof u.url === 'string') {
      add(u.url);
    } else if (u && typeof u === 'object' && typeof u.link === 'string') {
      add(u.link);
    }
  };

  // 1. Direct fields
  add(product.image_url);
  add(product.main_image_url_external);
  add(product.image);

  // 2. Images arrays
  if (Array.isArray(product.images)) {
    product.images.forEach((img: any) => add(img));
  }
  if (Array.isArray(product.gallery_images)) {
    product.gallery_images.forEach((img: any) => add(img));
  }
  if (Array.isArray(product.image_urls_external)) {
    product.image_urls_external.forEach((img: any) => add(img));
  }

  // 3. Raw data nested structures from Zinc / Amazon
  if (product.raw_data) {
    add(product.raw_data.image);
    add(product.raw_data.main_image);
    if (Array.isArray(product.raw_data.images)) {
      product.raw_data.images.forEach((img: any) => add(img));
    }
    if (Array.isArray(product.raw_data.additional_images)) {
      product.raw_data.additional_images.forEach((img: any) => add(img));
    }
    if (product.raw_data._enriched_details) {
      add(product.raw_data._enriched_details.main_image);
      if (Array.isArray(product.raw_data._enriched_details.images)) {
        product.raw_data._enriched_details.images.forEach((img: any) => add(img));
      }
    }
  }

  return urls;
}

/**
 * Resolves a single URL string to a usable image src with optional size transformation.
 */
function resolveImageUrl(url: string | null | undefined, variant: ImageSizeVariant = 'card'): string {
  if (!url || typeof url !== 'string') return FALLBACK_IMAGE;

  const trimmed = url.trim();
  if (!trimmed) return FALLBACK_IMAGE;

  let rawUrl = trimmed;

  // Block invalid / mock / placeholder image URLs in production
  if (isInvalidImageUrl(rawUrl) || isBrokenImageUrl(rawUrl)) return FALLBACK_IMAGE;

  // UUID-only pattern (e.g. "a1b2c3d4-e5f6-...")
  if (/^[a-f0-9-]{36}$/i.test(trimmed)) {
    rawUrl = `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${trimmed}`;
  } else if (!/^(https?:\/\/|data:)/.test(trimmed)) {
    // Relative path (bucket path like "products/image.jpg")
    const cleanPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    rawUrl = `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}${cleanPath}`;
  }

  return rawUrl;
}

/**
 * Gets the best product image from a product object.
 * Supports product.images array, picks primary first.
 */
export function getProductImage(product: any, variant: ImageSizeVariant = 'card'): string {
  if (!product) return FALLBACK_IMAGE;

  const candidates = extractCandidateImages(product);
  if (candidates.length > 0) {
    return resolveImageUrl(candidates[0], variant);
  }

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


