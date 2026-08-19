/**
 * Unified Product Publication Validation Engine
 * Collectibles.uy / Collectibles2026
 */

export interface PublicationValidationError {
  code: string;
  field: 'title' | 'base_price' | 'categories' | 'brands' | 'image_url' | 'stock' | 'condition' | 'duplicate' | 'general';
  message: string;
  severity: 'HARD_BLOCKER' | 'WARNING' | 'INFO';
}

export interface PublicationValidationResult {
  isValid: boolean;
  hasWarnings: boolean;
  errors: PublicationValidationError[];
  warnings: PublicationValidationError[];
}

export interface ValidationParams {
  form: {
    title?: string;
    base_price?: string | number;
    compare_at_price?: string | number;
    categories?: string[];
    category_id?: string;
    brands?: string[];
    brand_id?: string;
    image_url?: string;
    gallery?: any[];
    stock?: string | number;
    condition?: string;
    vendor_id?: string | null;
  };
  userRole: 'admin' | 'vendor';
  storeType: 'standard' | 'vintage' | 'mixed' | 'tcg';
  targetStatus: 'published' | 'draft' | 'archived';
  brandsList?: Array<{ id: string; name: string; brand_type?: string }>;
  dbLicenses?: Array<{ id: string; name: string }>;
}

export const GENERIC_BRAND_LIST = [
  'genérica', 'generica', 'generic', 'sin marca', 'no brand', 'n/a', 'na', 'desconocido', 'ninguna', '—', '-', 'desconocida', 'marca blanca', 'unbranded'
];

export const KNOWN_FRANCHISE_LICENSES = [
  'marvel', 'disney', 'star wars', 'dc', 'dc comics', 'pokémon', 'pokemon',
  'sonic', 'minecraft', 'roblox', 'harry potter', 'dragon ball', 'naruto',
  'one piece', 'zelda', 'plantas vs zombies', 'batman', 'spiderman', 'x-men'
];

/**
 * Validates a product form for publication or draft save.
 */
export function validateProductForPublication(params: ValidationParams): PublicationValidationResult {
  const errors: PublicationValidationError[] = [];
  const warnings: PublicationValidationError[] = [];
  const { form, userRole, storeType, targetStatus, brandsList = [], dbLicenses = [] } = params;

  // 1. RULE: Title is ALWAYS required (even for Draft)
  if (!form.title || !form.title.trim()) {
    errors.push({
      code: 'TITLE_REQUIRED',
      field: 'title',
      message: 'Escribí un título para identificar el producto.',
      severity: 'HARD_BLOCKER'
    });
  }

  // If saving as DRAFT or ARCHIVED, return early without enforcing publication rules
  if (targetStatus === 'draft' || targetStatus === 'archived') {
    return {
      isValid: errors.length === 0,
      hasWarnings: warnings.length > 0,
      errors,
      warnings
    };
  }

  // 2. RULES FOR PUBLISHING (targetStatus === 'published')

  // A. Base Price
  const rawPrice = typeof form.base_price === 'number' ? form.base_price : parseFloat(form.base_price || '0');
  if (isNaN(rawPrice) || rawPrice <= 0) {
    errors.push({
      code: 'PRICE_REQUIRED',
      field: 'base_price',
      message: 'Ingresá un precio mayor a $0 para publicar.',
      severity: 'HARD_BLOCKER'
    });
  }

  // B. Stock (0 is ALLOWED for sold out / pre-order; negative is BLOCKED)
  const rawStock = typeof form.stock === 'number' ? form.stock : parseInt(form.stock || '0', 10);
  if (isNaN(rawStock) || rawStock < 0) {
    errors.push({
      code: 'STOCK_INVALID',
      field: 'stock',
      message: 'El stock no puede ser negativo.',
      severity: 'HARD_BLOCKER'
    });
  }

  // C. Primary Category
  const selectedCatId = form.categories?.[0] || form.category_id;
  if (!selectedCatId) {
    errors.push({
      code: 'CATEGORY_REQUIRED',
      field: 'categories',
      message: 'Seleccioná al menos una categoría.',
      severity: 'HARD_BLOCKER'
    });
  }

  // D. Brand / Manufacturer
  const selectedBrandId = form.brands?.[0] || form.brand_id;
  if (!selectedBrandId) {
    errors.push({
      code: 'BRAND_REQUIRED',
      field: 'brands',
      message: 'Seleccioná la marca o fabricante del producto.',
      severity: 'HARD_BLOCKER'
    });
  } else {
    const selectedBrandObj = brandsList.find(b => b.id === selectedBrandId);
    const brandName = (selectedBrandObj?.name || '').toLowerCase().trim();

    if (userRole === 'vendor') {
      // Check Generic Brand (Prohibited for Vendors)
      if (GENERIC_BRAND_LIST.includes(brandName)) {
        errors.push({
          code: 'GENERIC_BRAND_PROHIBITED',
          field: 'brands',
          message: 'La marca elegida es genérica. Por favor seleccioná el fabricante real del producto.',
          severity: 'HARD_BLOCKER'
        });
      }

      // Check License used as Brand for Vendors
      const isKnownLicense = KNOWN_FRANCHISE_LICENSES.includes(brandName) || 
        dbLicenses.some(l => l.name.toLowerCase().trim() === brandName);

      if (isKnownLicense && selectedBrandObj?.brand_type !== 'manufacturer') {
        errors.push({
          code: 'LICENSE_AS_BRAND_PROHIBITED',
          field: 'brands',
          message: 'Esta opción corresponde a una Licencia / Franquicia. Seleccioná el fabricante real del producto.',
          severity: 'HARD_BLOCKER'
        });
      }
    } else if (userRole === 'admin') {
      // Admin: Warning if License used as Brand
      const isKnownLicense = KNOWN_FRANCHISE_LICENSES.includes(brandName);
      if (isKnownLicense) {
        warnings.push({
          code: 'LICENSE_AS_BRAND_WARNING',
          field: 'brands',
          message: 'La marca seleccionada parece ser una franquicia/licencia. Asegúrate de verificar el fabricante real si está disponible.',
          severity: 'WARNING'
        });
      }
    }
  }

  // E. Primary Image
  if (!form.image_url) {
    errors.push({
      code: 'IMAGE_REQUIRED',
      field: 'image_url',
      message: 'Agregá al menos una foto principal.',
      severity: 'HARD_BLOCKER'
    });
  }

  // F. Condition (Mandatory ONLY for Vintage / Mixed Stores when Publishing)
  if (storeType === 'vintage' || storeType === 'mixed') {
    if (!form.condition || !form.condition.trim()) {
      errors.push({
        code: 'CONDITION_REQUIRED',
        field: 'condition',
        message: 'Seleccioná el estado del producto antes de publicar.',
        severity: 'HARD_BLOCKER'
      });
    }
  }

  return {
    isValid: errors.length === 0,
    hasWarnings: warnings.length > 0,
    errors,
    warnings
  };
}
