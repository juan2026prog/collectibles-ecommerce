/**
 * Utility functions for MBE Argentina Logistics, Packaging Types & Argentina Eligibility Status
 */

export type MbePackagingType = 'mbe_pak' | 'mbe_caja' | null;

export interface ArgentinaShippingStatus {
  isEligible: boolean;
  statusText: 'Envío automático disponible' | 'Requiere cotización' | 'Este vendedor no realiza envíos a Argentina' | 'Vendedor temporalmente inactivo / suspendido';
  badgeColor: 'green' | 'amber' | 'gray';
  reasonCode: 'ELIGIBLE' | 'VENDOR_DISABLED' | 'VENDOR_ARGENTINA_DISABLED' | 'MISSING_WEIGHT' | 'MISSING_PACKAGING' | 'OVER_WEIGHT_LIMIT' | 'OVER_VOLUMETRIC_LIMIT' | 'SHIPPING_QUOTE_REQUIRED';
  reason?: string;
}

/**
 * Sanitizes and validates input for MBE packaging_type
 * Returns 'mbe_pak', 'mbe_caja', or null.
 * Throws or returns null for invalid values (e.g. 'gratis').
 */
export function sanitizeMbePackagingType(val: any): MbePackagingType {
  if (!val || typeof val !== 'string') return null;
  const normalized = val.trim().toLowerCase();
  if (['mbe_pak', 'pak'].includes(normalized)) return 'mbe_pak';
  if (['mbe_caja', 'caja', 'box'].includes(normalized)) return 'mbe_caja';
  if (['none', 'null', 'sin_definir', ''].includes(normalized)) return null;
  return null;
}

/**
 * Validates if value is an allowed MBE packaging type string or null.
 */
export function isValidMbePackagingType(val: any): boolean {
  if (val === null || val === undefined || val === '') return true;
  if (typeof val !== 'string') return false;
  const normalized = val.trim().toLowerCase();
  return ['mbe_pak', 'pak', 'mbe_caja', 'caja', 'box', 'none', 'null', 'sin_definir'].includes(normalized);
}

/**
 * Gets user-friendly display label for MBE packaging type
 */
export function getMbePackagingLabel(val: any): string {
  const sanitized = sanitizeMbePackagingType(val);
  if (sanitized === 'mbe_pak') return 'MBE PAK';
  if (sanitized === 'mbe_caja') return 'MBE Caja';
  return 'Sin definir';
}

/**
 * Safely merges new packaging_type into existing product metadata without losing any existing keys.
 */
export function mergeMbePackagingType(existingMetadata: any, packagingType: any): any {
  const current = existingMetadata && typeof existingMetadata === 'object' ? { ...existingMetadata } : {};
  const sanitized = sanitizeMbePackagingType(packagingType);
  
  if (sanitized) {
    current.packaging_type = sanitized;
  } else {
    delete current.packaging_type;
    delete current.mbe_service_type;
  }
  
  return current;
}

/**
 * Calculates Argentina automatic shipping eligibility based on DB product & vendor data.
 * Priority hierarchy:
 * 1. Collectibles products (vendor_id null or 'platform') are ALWAYS active and enabled for Argentina.
 * 2. Vendor Operational Status: if status !== 'active', return VENDOR_DISABLED immediately.
 * 3. External vendor opt-in: ships_to_argentina === true. If false, return VENDOR_ARGENTINA_DISABLED.
 * 4. Logistics checks: real weight, explicit packaging, and volumetric weight.
 */
export function calculateArgentinaShippingStatus(
  product: {
    vendor_id?: string | null;
    vendor?: { id?: string; status?: string | null; ships_to_argentina?: boolean | null; shipping_settings?: any } | null;
    weight_kg?: number | string | null;
    dimensions?: { length?: number; width?: number; height?: number; l?: number; w?: number; h?: number } | null;
    metadata?: any;
  },
  vendorSettings?: { status?: string | null; ships_to_argentina?: boolean | null }
): ArgentinaShippingStatus {
  // Determine if this is a Collectibles product vs External Vendor
  const isCollectibles = !product.vendor_id || product.vendor_id === 'platform';

  // Priority 1: Operational Status check
  let vendorStatus = 'active';
  if (!isCollectibles) {
    vendorStatus = vendorSettings?.status || product.vendor?.status || 'active';
  }

  if (vendorStatus !== 'active') {
    return {
      isEligible: false,
      statusText: 'Vendedor temporalmente inactivo / suspendido',
      badgeColor: 'gray',
      reasonCode: 'VENDOR_DISABLED',
      reason: `Este vendedor se encuentra ${vendorStatus === 'suspended' ? 'suspendido' : 'inactivo'}`
    };
  }

  // Priority 2: External vendor Argentina Opt-in check
  let vendorEnabled = false;
  if (isCollectibles) {
    // Collectibles products are ALWAYS enabled for Argentina (Override)
    vendorEnabled = true;
  } else {
    const shipsOpt = vendorSettings?.ships_to_argentina ?? product.vendor?.ships_to_argentina ?? product.vendor?.shipping_settings?.ships_to_argentina;
    vendorEnabled = !!shipsOpt;
  }

  if (!vendorEnabled) {
    return {
      isEligible: false,
      statusText: 'Este vendedor no realiza envíos a Argentina',
      badgeColor: 'gray',
      reasonCode: 'VENDOR_ARGENTINA_DISABLED',
      reason: 'Este vendedor no realiza envíos a Argentina'
    };
  }

  // Priority 3: Logistics requirements (weight, packaging, dimensions, rates)
  const weight = Number(product.weight_kg || 0);
  if (!weight || weight <= 0) {
    return {
      isEligible: false,
      statusText: 'Requiere cotización',
      badgeColor: 'amber',
      reasonCode: 'MISSING_WEIGHT',
      reason: 'Falta peso del producto'
    };
  }

  const pkgType = sanitizeMbePackagingType(
    product.metadata?.packaging_type || product.metadata?.mbe_service_type
  );

  if (!pkgType) {
    return {
      isEligible: false,
      statusText: 'Requiere cotización',
      badgeColor: 'amber',
      reasonCode: 'MISSING_PACKAGING',
      reason: 'Tipo de packaging MBE sin definir'
    };
  }

  if (weight > 1.0) {
    return {
      isEligible: false,
      statusText: 'Requiere cotización',
      badgeColor: 'amber',
      reasonCode: 'OVER_WEIGHT_LIMIT',
      reason: 'Peso real > 1.0 kg'
    };
  }

  if (product.dimensions) {
    const dim = product.dimensions;
    const l = Number(dim.length ?? dim.l ?? 0);
    const w = Number(dim.width ?? dim.w ?? 0);
    const h = Number(dim.height ?? dim.h ?? 0);
    if (l > 0 && w > 0 && h > 0) {
      const volKg = (l * w * h) / 5000;
      if (volKg > 1.0) {
        return {
          isEligible: false,
          statusText: 'Requiere cotización',
          badgeColor: 'amber',
          reasonCode: 'OVER_VOLUMETRIC_LIMIT',
          reason: `Peso volumétrico (${volKg.toFixed(2)} kg) > 1.0 kg`
        };
      }
    }
  }

  return {
    isEligible: true,
    statusText: 'Envío automático disponible',
    badgeColor: 'green',
    reasonCode: 'ELIGIBLE'
  };
}
