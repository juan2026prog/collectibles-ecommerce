export interface ImageValidationResult {
  valid: boolean;
  error?: string;
}

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_VAULT_IMAGE_SIZE_BYTES = MAX_FILE_SIZE_BYTES;
export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Validates personal photos before upload to the vault storage bucket.
 */
export function validateVaultImage(file: { size: number; type: string }): ImageValidationResult {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `El tamaño máximo de imagen permitido es de 5 MB. Tu archivo pesa ${(file.size / (1024 * 1024)).toFixed(1)} MB.`
    };
  }

  if (!ALLOWED_MIME_TYPES.includes(file.type.toLowerCase())) {
    return {
      valid: false,
      error: 'Formato de imagen no soportado. Por favor utiliza JPG, PNG o WEBP.'
    };
  }

  return { valid: true };
}

/**
 * Constructs a secure, isolated storage path per user for personal collection photos.
 */
export function getVaultStoragePath(userId: string, filename: string): string {
  const ext = filename.split('.').pop() || 'jpg';
  const cleanExt = ext.toLowerCase().replace(/[^a-z0-9]/g, '');
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 7);
  return `${userId}/${timestamp}-${randomSuffix}.${cleanExt}`;
}

export const buildVaultStoragePath = getVaultStoragePath;
