/**
 * CANONICAL PRODUCT PRICE & CURRENCY RESOLVER — COLLECTIBLES 2026
 * 
 * Reglas de negocio fundamentales:
 * 1. PRODUCTOS LOCALES DE URUGUAY:
 *    - Moneda canónica/nativa: UYU
 *    - Productos propios de Collectibles Uruguay (vendor_id null o platform)
 *    - Productos de vendors uruguayos marketplace
 *    - Productos sin source_provider internacional
 *    - Ejemplo: base_price = 1090 -> $ 1.090 UYU (NUNCA US$ 1.090)
 * 
 * 2. PRODUCTOS INTERNACIONALES:
 *    - Moneda canónica/nativa: USD
 *    - Retailers internacionales: Amazon, eBay, BestBuy, Zinc, etc.
 *    - is_international = true, shipping_type = international_courier_direct
 *    - Ejemplo: base_price = 24.99 -> US$ 24,99
 * 
 * 3. PRIORIDAD DE RESOLUCIÓN:
 *    - Explicit `product.currency` o `product.price_currency` si es 'UYU' o 'USD'.
 *    - Fallback inequívoco según origen (source_provider, is_international, vendor_id).
 * 
 * 4. INVARIANZA:
 *    - Ninguna capa o localStorage puede mutar la moneda nativa del producto.
 *    - Todo cálculo financiero, carrito y checkout respeta la moneda origen.
 */

export type ProductCurrency = 'UYU' | 'USD';

export interface ResolvedProductPrice {
  amount: number;
  finalPrice: number;
  currency: ProductCurrency;
  basePrice: number;
  adjustment: number;
  isInternational: boolean;
  formatted: string;
}

export interface FormatProductMoneyOptions {
  amount: number;
  currency: ProductCurrency;
  displayCurrency?: string;
  exchangeRate?: number | null;
}

/**
 * 1. Resolutor canónico de moneda nativa/origen de un producto.
 */
export function resolveProductNativeCurrency(product: any): ProductCurrency {
  if (!product) return 'UYU';

  // 1. Moneda explícita en producto o metadata
  const explicitCurrency = (
    product.currency || 
    product.price_currency || 
    product.metadata?.currency || 
    product.metadata?.price_currency
  )?.toString().toUpperCase().trim();

  // Si está explícitamente fijada y verificada
  if (explicitCurrency === 'UYU') return 'UYU';
  if (explicitCurrency === 'USD') return 'USD';

  // 2. Fallback inequívoco por origen internacional
  const source = (
    product.source_provider || 
    product.source_retailer || 
    product.source_platform || 
    ''
  ).toString().toLowerCase().trim();

  if (
    source === 'amazon' ||
    source === 'ebay' ||
    source === 'bestbuy' ||
    source === 'zinc' ||
    product.is_international === true ||
    product.shipping_type === 'international_courier_direct' ||
    Boolean(product.international_products && product.international_products.length > 0) ||
    Boolean(product.raw_international_data)
  ) {
    return 'USD';
  }

  // 3. Todo producto local (Collectibles o Vendor Uruguay) es UYU
  return 'UYU';
}

/**
 * 2. Verifica si un producto es de origen internacional.
 */
export function isInternationalProduct(product: any): boolean {
  if (!product) return false;
  return resolveProductNativeCurrency(product) === 'USD';
}

/**
 * 3. Resolutor unificado de importe y componentes de precio de un producto y su variante.
 */
export function resolveProductPrice(product: any, variant?: any): ResolvedProductPrice {
  if (!product) {
    return {
      amount: 0,
      finalPrice: 0,
      currency: 'UYU',
      basePrice: 0,
      adjustment: 0,
      isInternational: false,
      formatted: '$ 0 UYU'
    };
  }

  const currency = resolveProductNativeCurrency(product);
  const isInternational = currency === 'USD';

  // Descartar synthetic browser events pasados accidentalmente como variante
  const isEvent = variant && (
    (typeof Event !== 'undefined' && variant instanceof Event) ||
    variant.nativeEvent ||
    variant.target ||
    typeof variant.preventDefault === 'function'
  );
  const cleanVariant = isEvent ? undefined : variant;

  let base = 0;
  let adjustment = 0;

  // Extraer base price considerando campos estándar
  const priceFields = [
    'final_price_usd', // internacional específico
    'base_price',
    'price_uyu',
    'price',
    'sale_price',
    'final_price',
    'unit_price'
  ];

  for (const field of priceFields) {
    if (product[field] !== undefined && product[field] !== null && product[field] !== '') {
      const val = Number(product[field]);
      if (!isNaN(val) && val > 0) {
        base = val;
        break;
      }
    }
  }

  if (cleanVariant) {
    // Si la variante tiene precio directo
    for (const field of priceFields) {
      if (cleanVariant[field] !== undefined && cleanVariant[field] !== null && cleanVariant[field] !== '') {
        const val = Number(cleanVariant[field]);
        if (!isNaN(val) && val > 0) {
          base = val;
          break;
        }
      }
    }

    // Si la variante tiene price_adjustment
    const adjustmentFields = ['price_adjustment', 'adjustment', 'priceAdjustment'];
    for (const field of adjustmentFields) {
      if (cleanVariant[field] !== undefined && cleanVariant[field] !== null && cleanVariant[field] !== '') {
        const val = Number(cleanVariant[field]);
        if (!isNaN(val)) {
          adjustment = val;
          break;
        }
      }
    }
  }

  const amount = Number((base + adjustment).toFixed(2));
  const safeAmount = isNaN(amount) || amount <= 0 ? 0 : amount;

  return {
    amount: safeAmount,
    finalPrice: safeAmount,
    currency,
    basePrice: base,
    adjustment,
    isInternational,
    formatted: formatProductMoney({ amount: safeAmount, currency })
  };
}

/**
 * 4. Resolutor canónico para carrito (compatibilidad retrocompatible directa).
 */
export function resolveCartItemPrice(product: any, variant?: any): number {
  return resolveProductPrice(product, variant).amount;
}

/**
 * 5. Formateador canónico universal de precios de producto.
 * 
 * Reglas de visualización:
 * - UYU: "$ 1.090 UYU" o "$ 1.090"
 * - USD: "US$ 24,99"
 * - Si displayCurrency solicita conversión (ej. UYU -> USD o USD -> UYU), realiza
 *   conversión matemática real con exchangeRate válido. Si no hay FX, fail-closed
 *   manteniendo la moneda nativa sin inventar datos ni cambiar sólo el símbolo.
 */
export function formatProductMoney(options: FormatProductMoneyOptions): string {
  const { amount, currency, displayCurrency, exchangeRate } = options;
  const safeAmount = Number(amount);
  if (isNaN(safeAmount) || !isFinite(safeAmount)) {
    return currency === 'USD' ? 'US$ 0,00' : '$ 0 UYU';
  }

  const targetCurrency = displayCurrency || currency;

  // CASO 1: Misma moneda origen y destino (no hay conversión de display)
  if (targetCurrency === currency) {
    if (currency === 'USD') {
      const formatted = new Intl.NumberFormat('es-UY', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(safeAmount);
      return `US$ ${formatted}`;
    }

    // UYU nativo
    const formatted = Math.round(safeAmount).toLocaleString('es-UY');
    return `$ ${formatted} UYU`;
  }

  // CASO 2: Conversión explícita solicitada (ej. producto USD mostrado en UYU, o UYU mostrado en USD)
  // Conversión USD -> UYU
  if (currency === 'USD' && targetCurrency === 'UYU') {
    if (exchangeRate && exchangeRate > 0) {
      const converted = Math.round(safeAmount * exchangeRate);
      return `$ ${converted.toLocaleString('es-UY')} UYU`;
    }
    // Fail-closed si no hay tasa: mostrar en USD nativo
    return formatProductMoney({ amount: safeAmount, currency: 'USD' });
  }

  // Conversión UYU -> USD
  if (currency === 'UYU' && targetCurrency === 'USD') {
    if (exchangeRate && exchangeRate > 0) {
      const converted = Number((safeAmount / exchangeRate).toFixed(2));
      const formatted = new Intl.NumberFormat('es-UY', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(converted);
      return `US$ ${formatted}`;
    }
    // Fail-closed si no hay tasa: mostrar en UYU nativo (NUNCA cambiar solo el símbolo)
    return formatProductMoney({ amount: safeAmount, currency: 'UYU' });
  }

  // Fallback seguro en moneda nativa
  return formatProductMoney({ amount: safeAmount, currency });
}

/**
 * 6. Helper de conveniencia para formatear un producto directamente con contexto de FX.
 */
export function formatProductPriceCanonical(
  product: any,
  overrideAmount?: number,
  displayCurrency?: string,
  exchangeRate?: number | null
): string {
  const currency = resolveProductNativeCurrency(product);
  const amount = overrideAmount !== undefined ? overrideAmount : resolveProductPrice(product).amount;
  return formatProductMoney({
    amount,
    currency,
    displayCurrency: displayCurrency as ProductCurrency,
    exchangeRate
  });
}

export interface CartCurrencyInspection {
  hasUYU: boolean;
  hasUSD: boolean;
  isMixed: boolean;
  totalUYU: number;
  totalUSD: number;
  canonicalCurrency: 'UYU' | 'USD' | null;
}

/**
 * 7. Inspecciona las monedas de una lista de ítems de carrito para prevenir mezclas inválidas.
 */
export function inspectCartCurrencies(items: Array<{ price?: number; quantity?: number; currency?: string; is_international?: boolean }>): CartCurrencyInspection {
  let hasUYU = false;
  let hasUSD = false;
  let totalUYU = 0;
  let totalUSD = 0;

  for (const item of items || []) {
    const isUSD = item.currency === 'USD' || item.is_international === true;
    const qty = Math.max(1, Number(item.quantity) || 1);
    const price = Number(item.price) || 0;

    if (isUSD) {
      hasUSD = true;
      totalUSD += price * qty;
    } else {
      hasUYU = true;
      totalUYU += price * qty;
    }
  }

  const isMixed = hasUYU && hasUSD;
  const canonicalCurrency = isMixed ? null : (hasUSD ? 'USD' : (hasUYU ? 'UYU' : null));

  return {
    hasUYU,
    hasUSD,
    isMixed,
    totalUYU: Number(totalUYU.toFixed(2)),
    totalUSD: Number(totalUSD.toFixed(2)),
    canonicalCurrency
  };
}
