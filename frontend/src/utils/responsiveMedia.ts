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
        // License specs: Min 600x300. Rec 1200x600. Max rec weight 250 KB
        if (width < 600 || height < 300) {
          errors.push(`La dimensión (${width}×${height}px) es inferior al mínimo requerido para Licencias (600×300px).`);
        }
        if (width < 1200 || height < 600) {
          warnings.push(`La dimensión (${width}×${height}px) es menor a la recomendada (1200×600px).`);
        }
        if (size > 250 * 1024) {
          warnings.push(`El peso (${(size / 1024).toFixed(0)} KB) supera el recomendado de 250 KB.`);
        }
      } else {
        // Theme specs: Min 1200x675. Rec 1600x900. Max rec weight 350 KB
        if (width < 1200 || height < 675) {
          errors.push(`La dimensión (${width}×${height}px) es inferior al mínimo requerido para Themes (1200×675px).`);
        }
        if (width < 1600 || height < 900) {
          warnings.push(`La dimensión (${width}×${height}px) es menor a la recomendada (1600×900px).`);
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
): Promise<{ mainUrl: string; derivativeUrls: string[] }> {
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
        }
      }
    }
  }

  const mainPublicUrl = supabase.storage.from(BUCKET_NAME).getPublicUrl(mainFileName).data.publicUrl;
  return { mainUrl: mainPublicUrl, derivativeUrls };
}

/**
 * Generates responsive srcset & sizes attributes for storefront images.
 * Supports legacy image fallbacks seamlessly.
 */
export function getResponsiveMediaProps(
  url: string | null | undefined,
  entityType: 'license' | 'theme',
  altText?: string
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

  const isDerivativePattern = /-(logo|theme)-?\d*/i.test(url) || url.includes('.webp');

  if (!isDerivativePattern) {
    // Legacy fallback image without derivatives
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

  let srcSet = '';
  let sizes = '';

  if (entityType === 'license') {
    const widths = [300, 600, 1200];
    srcSet = widths.map(w => `${baseUrl}-${w}.webp ${w}w`).join(', ') + `, ${baseUrl}.webp 1200w`;
    sizes = '(max-width: 640px) 150px, (max-width: 1024px) 300px, 600px';
  } else {
    const widths = [400, 800, 1200, 1600];
    srcSet = widths.map(w => `${baseUrl}-${w}.webp ${w}w`).join(', ') + `, ${baseUrl}.webp 1600w`;
    sizes = '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw';
  }

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
 * Dropdown License: ~300w
 * Dropdown Theme: ~400w
 */
export function getDropdownMediaUrl(
  url: string | null | undefined,
  targetWidth: 300 | 400
): string {
  if (!url) return '';
  if (!url.includes('.webp')) return url;

  const baseUrl = url.replace(/-(300|400|600|800|1200|1600)\.webp$/i, '').replace(/\.webp$/i, '');
  return `${baseUrl}-${targetWidth}.webp`;
}
