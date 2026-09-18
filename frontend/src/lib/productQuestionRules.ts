/**
 * PRODUCT QUESTION & ANSWER RULES & CANONICAL ELIGIBILITY
 * Collectibles.uy / Collectibles2026
 *
 * El sistema de preguntas está disponible ÚNICAMENTE para productos que realmente
 * se comercializan/localizan en Uruguay dentro de Collectibles:
 * - Productos propios de Collectibles con stock/localización en Uruguay.
 * - Productos publicados por Vendors dentro de Collectibles.
 * - Productos locales que correspondan al catálogo comercial nacional.
 *
 * Excluye rigurosamente:
 * - Amazon, eBay, Best Buy, Walmart, Target, etc.
 * - Resultados de Sourcing Intelligence / Import Hub no importados.
 * - Productos externos obtenidos mediante Zinc.
 * - Cualquier producto cuyo vendedor no pueda responder la pregunta dentro de Collectibles.
 */

export interface ProductQuestionEligibility {
  allowed: boolean;
  reason?: string;
  isVendorProduct: boolean;
  isCollectiblesProduct: boolean;
}

const EXTERNAL_RETAILER_PROVIDERS = [
  'zinc',
  'amazon',
  'ebay',
  'bestbuy',
  'walmart',
  'target',
  'entertainmentearth',
  'bbts',
  'sourcing'
];

/**
 * Determina de forma canónica si un producto admite preguntas y respuestas en Collectibles.uy
 */
export function canAskProductQuestion(product: any): ProductQuestionEligibility {
  if (!product) {
    return {
      allowed: false,
      reason: 'Producto inválido o inexistente',
      isVendorProduct: false,
      isCollectiblesProduct: false,
    };
  }

  // 1. Verificar si está explícitamente marcado como internacional
  if (product.is_international === true || product.is_international === 'true') {
    return {
      allowed: false,
      reason: 'Los productos del catálogo de importación internacional no admiten preguntas locales directas.',
      isVendorProduct: false,
      isCollectiblesProduct: false,
    };
  }

  // 2. Verificar origen del proveedor / provider
  const sourceProvider = (product.source_provider || product.provider || '').toLowerCase().trim();
  if (EXTERNAL_RETAILER_PROVIDERS.includes(sourceProvider)) {
    return {
      allowed: false,
      reason: `Producto importado mediante ${sourceProvider.toUpperCase()}. Solo disponible para compra internacional directa.`,
      isVendorProduct: false,
      isCollectiblesProduct: false,
    };
  }

  // 3. Verificar si el id o slug pertenece a la tabla international_products (UUID slug de intl)
  if (product.raw_international_data || (Array.isArray(product.international_products) && product.international_products.length > 0)) {
    return {
      allowed: false,
      reason: 'Producto de importación internacional.',
      isVendorProduct: false,
      isCollectiblesProduct: false,
    };
  }

  // 4. Verificar estado del producto (debe estar publicado)
  if (product.status && product.status !== 'published') {
    return {
      allowed: false,
      reason: 'Este producto no se encuentra publicado activamente.',
      isVendorProduct: false,
      isCollectiblesProduct: false,
    };
  }

  if (product.is_active === false) {
    return {
      allowed: false,
      reason: 'Este producto está pausado o inactivo.',
      isVendorProduct: false,
      isCollectiblesProduct: false,
    };
  }

  // 5. Determinar ownership (Vendor vs Collectibles Propio)
  const isVendorProduct = Boolean(
    product.vendor_id && 
    product.vendor_id !== 'platform' && 
    product.vendor_id !== 'collectibles'
  );
  
  const isCollectiblesProduct = !isVendorProduct;

  return {
    allowed: true,
    isVendorProduct,
    isCollectiblesProduct,
  };
}
