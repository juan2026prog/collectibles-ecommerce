import { supabase } from '../lib/supabase';

export interface ImageSpecsResult {
  isValid: boolean;
  width: number;
  height: number;
  size: number;
  mimeType: string;
  errors: string[];
  warnings: string[];
}

/**
 * Reads real width, height, file size and MIME type of a local File object before uploading.
 * Minimum dimensions enforced for complete responsive pipeline generation:
 * - License: 1200 x 600 px (2:1)
 * - Theme: 1600 x 900 px (16:9)
 */
export async function validateImageFile(
  file: File,
  entityType: 'license' | 'theme'
): Promise<ImageSpecsResult> {
  const size = file.size;
  const mimeType = file.type;
  const errors: string[] = [];
  const warnings: string[] = [];

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      const width = img.width;
      const height = img.height;
      URL.revokeObjectURL(url);

      if (entityType === 'license') {
        // License specs: Min 1200x600 px for full responsive derivatives set (300, 600, 1200)
        if (width < 1200 || height < 600) {
          errors.push(`La dimensión (${width}×${height}px) es inferior al mínimo requerido para Licencias (1200×600px).`);
        }
        if (size > 250 * 1024) {
          warnings.push(`El peso (${(size / 1024).toFixed(0)} KB) supera el recomendado de 250 KB.`);
        }
      } else {
        // Theme specs: Min 1600x900 px for full responsive derivatives set (400, 800, 1200, 1600)
        if (width < 1600 || height < 900) {
          errors.push(`La dimensión (${width}×${height}px) es inferior al mínimo requerido para Themes (1600×900px).`);
        }
        if (size > 350 * 1024) {
          warnings.push(`El peso (${(size / 1024).toFixed(0)} KB) supera el recomendado de 350 KB.`);
        }
      }

      const isValid = errors.length === 0;
      resolve({
        isValid,
        width,
        height,
        size,
        mimeType,
        errors,
        warnings
      });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({
        isValid: false,
        width: 0,
        height: 0,
        size,
        mimeType,
        errors: ['No se pudo procesar o leer el archivo de imagen seleccionado.'],
        warnings: []
      });
    };

    img.src = url;
  });
}

/**
 * Generates responsive WebP derivatives without upscaling, preserving PNG/WebP transparency.
 * Themes: [400, 800, 1200, 1600]
 * Licenses: [300, 600, 1200]
 */
export async function uploadOptimizedMedia(
  file: File,
  entityType: 'license' | 'theme',
  slug: string
): Promise<{ mainUrl: string; derivativeUrls: string[]; availableWidths: number[] }> {
  const BUCKET_NAME = 'public-assets';
  const folder = entityType === 'license' ? 'licenses/' : 'themes/';
  const cleanSlug = (slug || 'media').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const baseName = entityType === 'license' ? `${cleanSlug}-logo` : `theme-${cleanSlug}`;

  // Read dimensions
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    const objectUrl = URL.createObjectURL(file);
    el.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(el);
    };
    el.onerror = (err) => {
      URL.revokeObjectURL(objectUrl);
      reject(err);
    };
    el.src = objectUrl;
  });

  const originalWidth = img.width;
  const originalHeight = img.height;

  // Target widths per entity type
  const allTargetWidths = entityType === 'license'
    ? [300, 600, 1200]
    : [400, 800, 1200, 1600];

  // NO UPSCALE: filter out widths larger than the original image
  const targetWidths = allTargetWidths.filter(w => w <= originalWidth);
  if (!targetWidths.includes(originalWidth)) {
    targetWidths.push(originalWidth);
  }
  targetWidths.sort((a, b) => a - b);

  const timestamp = Date.now();
  const mainFileName = `${folder}${baseName}-${timestamp}.webp`;
  const derivativeUrls: string[] = [];
  const availableWidths: number[] = [];

  for (const targetWidth of targetWidths) {
    const scaleFactor = targetWidth / originalWidth;
    const targetHeight = Math.round(originalHeight * scaleFactor);

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      ctx.clearRect(0, 0, targetWidth, targetHeight);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
    }

    const blob = await new Promise<Blob | null>((res) => {
      canvas.toBlob((b) => res(b), 'image/webp', 0.88);
    });

    if (blob) {
      const isMain = targetWidth === Math.max(...targetWidths);
      const isStandardSize = allTargetWidths.includes(targetWidth);
      const fileName = isMain
        ? mainFileName
        : `${folder}${baseName}-${timestamp}-${targetWidth}.webp`;

      const { error } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(fileName, blob, { contentType: 'image/webp', cacheControl: '31536000', upsert: true });

      if (!error) {
        const publicUrl = supabase.storage.from(BUCKET_NAME).getPublicUrl(fileName).data.publicUrl;
        if (isStandardSize) {
          derivativeUrls.push(`${publicUrl} ${targetWidth}w`);
          availableWidths.push(targetWidth);
        }
      }
    }
  }

  const mainPublicUrl = supabase.storage.from(BUCKET_NAME).getPublicUrl(mainFileName).data.publicUrl;
  return { mainUrl: mainPublicUrl, derivativeUrls, availableWidths };
}

/**
 * Checks if a given image URL belongs to an optimized pipeline asset containing a 13-digit timestamp.
 * Example: logo-1788377399000.webp or logo-1788377399000-300.webp
 */
export function isPipelineOptimizedUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /-\d{13}(-(300|400|600|800|1200|1600))?\.webp$/i.test(url);
}

/**
 * Generates responsive srcset & sizes attributes for storefront images.
 * Legacy images (including legacy WebP without pipeline timestamp) return undefined srcSet.
 */
export function getResponsiveMediaProps(
  url: string | null | undefined,
  entityType: 'license' | 'theme',
  altText?: string,
  availableWidths?: number[]
) {
  if (!url) {
    return {
      src: '',
      srcSet: undefined,
      sizes: undefined,
      alt: altText || '',
      width: entityType === 'license' ? 1200 : 1600,
      height: entityType === 'license' ? 600 : 900
    };
  }

  const alt = altText || (entityType === 'license' ? 'Logo oficial' : 'Imagen temática');

  // Check strict pipeline asset pattern with timestamp
  if (!isPipelineOptimizedUrl(url)) {
    // Legacy fallback image without derivatives (including legacy WebP)
    return {
      src: url,
      srcSet: undefined,
      sizes: undefined,
      alt,
      width: entityType === 'license' ? 1200 : 1600,
      height: entityType === 'license' ? 600 : 900
    };
  }

  const baseUrl = url.replace(/-(300|400|600|800|1200|1600)\.webp$/i, '').replace(/\.webp$/i, '');

  const standardWidths = availableWidths || (entityType === 'license' ? [300, 600, 1200] : [400, 800, 1200, 1600]);
  const srcSet = standardWidths.map(w => `${baseUrl}-${w}.webp ${w}w`).join(', ');
  const sizes = entityType === 'license'
    ? '(max-width: 640px) 150px, (max-width: 1024px) 300px, 600px'
    : '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw';

  return {
    src: url,
    srcSet,
    sizes,
    alt,
    width: entityType === 'license' ? 1200 : 1600,
    height: entityType === 'license' ? 600 : 900
  };
}

/**
 * Gets an optimized small asset variant URL for dropdown thumbnails.
 * License: ~300w
 * Theme: ~400w
 * Returns original URL for legacy images or legacy WebP without timestamp.
 */
export function getDropdownMediaUrl(
  url: string | null | undefined,
  targetWidth: 300 | 400
): string {
  if (!url) return '';
  if (!isPipelineOptimizedUrl(url)) return url;

  const baseUrl = url.replace(/-(300|400|600|800|1200|1600)\.webp$/i, '').replace(/\.webp$/i, '');
  return `${baseUrl}-${targetWidth}.webp`;
}
