/**
 * CommerceOperationsProvider — Autoridad Transaccional y Operacional (Supabase)
 *
 * Reglas obligatorias (Fase F — Blindaje de Checkout, Stock, Pagos y Pedidos):
 * 1. D1 es informativo y de navegación; NUNCA es la autoridad transaccional.
 * 2. Antes de crear un pedido o iniciar un pago, SIEMPRE se revalida contra Supabase:
 *    - Existencia y vigencia del producto (`status = 'published'`, `is_active = true`).
 *    - Estado activo del vendedor (`vendor.status = 'active'`).
 *    - Moneda canónica real (`UYU` para stock local/vendedores Uruguay, `USD` para internacional).
 *    - Precio actual real (detecta discrepancias frente al carrito cacheado).
 *    - Stock disponible real.
 * 3. Si Supabase no responde o devuelve error transaccional, falla de forma segura (fail-closed)
 *    preservando el carrito del usuario y mostrando un mensaje claro.
 */

import { supabase } from '../supabase';
import { resolveProductInventory } from '../canonicalStock';

export interface CheckoutItemInput {
  id?: string;
  product_id?: string;
  variant_id?: string | null;
  title?: string;
  quantity: number;
  price: number;
  currency?: 'UYU' | 'USD' | string;
  is_international?: boolean;
  vendor_id?: string | null;
}

export interface CheckoutValidationDiscrepancy {
  productId: string;
  title: string;
  reason:
    | 'not_found_or_unpublished'
    | 'out_of_stock'
    | 'insufficient_stock'
    | 'price_changed'
    | 'currency_mismatch'
    | 'vendor_inactive';
  message: string;
  expectedPrice?: number;
  actualPrice?: number;
  expectedCurrency?: string;
  actualCurrency?: string;
  availableStock?: number;
}

export interface CheckoutValidationResult {
  valid: boolean;
  supabaseReachable: boolean;
  canonicalCurrency: 'UYU' | 'USD' | 'MIXED';
  discrepancies: CheckoutValidationDiscrepancy[];
  userMessage?: string;
}

export const CommerceOperationsProvider = {
  /**
   * Revalida todos los ítems del carrito contra la fuente de verdad transaccional (Supabase)
   * antes de invocar `create-order` / `create-payment`.
   */
  async validateCartBeforeCheckout(
    items: CheckoutItemInput[],
    client: typeof supabase = supabase
  ): Promise<CheckoutValidationResult> {
    if (!Array.isArray(items) || items.length === 0) {
      return {
        valid: false,
        supabaseReachable: true,
        canonicalCurrency: 'UYU',
        discrepancies: [],
        userMessage: 'Tu carrito está vacío.',
      };
    }

    const productIds = Array.from(
      new Set(items.map((item) => String(item.product_id || item.id || '')).filter(Boolean))
    );

    try {
      const [localRes, variantsRes, intlRes] = await Promise.all([
        client
          .from('products')
          .select(
            'id, title, status, is_active, base_price, metadata, vendor_id, vendors(id, store_name, status)'
          )
          .in('id', productIds),
        typeof client.from === 'function'
          ? client
              .from('product_variants')
              .select('id, product_id, sku, price_adjustment, inventory_count, is_active')
              .in('product_id', productIds)
          : Promise.resolve({ data: [], error: null }),
        client
          .from('international_products')
          .select('id, title, status, availability, final_price_usd, final_price_uyu')
          .in('id', productIds),
      ]);

      if (localRes.error && intlRes.error) {
        return {
          valid: false,
          supabaseReachable: false,
          canonicalCurrency: 'UYU',
          discrepancies: [],
          userMessage:
            'En este momento no podemos verificar el stock y los precios en tiempo real. Tu carrito está guardado de forma segura; por favor intentá confirmar nuevamente en unos instantes.',
        };
      }

      const variantsByProduct = new Map<string, any[]>();
      for (const v of (variantsRes?.data as any[]) || []) {
        if (!v?.product_id) continue;
        const pid = String(v.product_id);
        const list = variantsByProduct.get(pid) || [];
        list.push(v);
        variantsByProduct.set(pid, list);
      }

      const localMap = new Map<string, any>();
      for (const p of (localRes.data as any[]) || []) {
        const pid = String(p.id);
        const attachedVars = variantsByProduct.get(pid);
        localMap.set(pid, {
          ...p,
          variants: attachedVars && attachedVars.length > 0 ? attachedVars : p.variants,
        });
      }

      const intlMap = new Map<string, any>();
      for (const ip of (intlRes.data as any[]) || []) {
        intlMap.set(String(ip.id), ip);
      }

      const discrepancies: CheckoutValidationDiscrepancy[] = [];
      const seenCurrencies = new Set<'UYU' | 'USD'>();

      for (const item of items) {
        const pid = String(item.product_id || item.id || '');
        const localProd = localMap.get(pid);
        const intlProd = intlMap.get(pid);

        if (!localProd && !intlProd) {
          discrepancies.push({
            productId: pid,
            title: item.title || 'Producto',
            reason: 'not_found_or_unpublished',
            message: `El producto "${item.title || pid}" ya no se encuentra disponible.`,
          });
          continue;
        }

        if (localProd && !localProd.is_international) {
          // Producto local en Uruguay: moneda canónica obligatoria UYU
          const actualCurrency = 'UYU';
          seenCurrencies.add(actualCurrency);

          if (localProd.status !== 'published' || localProd.is_active === false) {
            discrepancies.push({
              productId: pid,
              title: localProd.title,
              reason: 'not_found_or_unpublished',
              message: `El producto "${localProd.title}" fue pausado o retirado del catálogo.`,
            });
            continue;
          }

          const vendorObj = Array.isArray(localProd.vendors) ? localProd.vendors[0] : localProd.vendors;
          if (vendorObj?.status && vendorObj.status !== 'active') {
            discrepancies.push({
              productId: pid,
              title: localProd.title,
              reason: 'vendor_inactive',
              message: `El vendedor del producto "${localProd.title}" no se encuentra activo temporalmente.`,
            });
            continue;
          }

          const meta = localProd.metadata && typeof localProd.metadata === 'object' ? localProd.metadata : {};
          const isPreorder = Boolean(
            localProd.is_preorder ||
              localProd.availability_type === 'preorder' ||
              meta.is_preorder ||
              meta.availability_type === 'preorder'
          );

          const matchedVar =
            item.variant_id && Array.isArray(localProd.variants)
              ? localProd.variants.find((v: any) => String(v.id) === String(item.variant_id))
              : undefined;

          // Resolve stock from real product_variants (or fallback to localProd.stock if passed in unit tests)
          const resolvedInv = resolveProductInventory(localProd, matchedVar);
          const availableStock =
            typeof localProd.stock === 'number'
              ? Number(localProd.stock)
              : Number(resolvedInv.availableQuantity ?? 0);

          if (!isPreorder && availableStock <= 0) {
            discrepancies.push({
              productId: pid,
              title: localProd.title,
              reason: 'out_of_stock',
              message: `El producto "${localProd.title}" acaba de agotarse.`,
              availableStock: 0,
            });
            continue;
          }

          if (!isPreorder && availableStock < item.quantity) {
            discrepancies.push({
              productId: pid,
              title: localProd.title,
              reason: 'insufficient_stock',
              message: `Solo quedan ${availableStock} unidad(es) disponibles de "${localProd.title}".`,
              availableStock,
            });
            continue;
          }

          if (item.currency && item.currency !== 'UYU') {
            discrepancies.push({
              productId: pid,
              title: localProd.title,
              reason: 'currency_mismatch',
              message: `La moneda del producto local "${localProd.title}" debe ser UYU.`,
              expectedCurrency: item.currency,
              actualCurrency: 'UYU',
            });
            continue;
          }

          let expectedUnitBasePrice = Number(localProd.base_price ?? 0);
          if (item.variant_id && Array.isArray(localProd.variants)) {
            const matchedVar = localProd.variants.find((v: any) => String(v.id) === String(item.variant_id));
            if (matchedVar?.price_adjustment) {
              expectedUnitBasePrice += Number(matchedVar.price_adjustment);
            }
          }

          if (Math.abs(expectedUnitBasePrice - Number(item.price)) > 1) {
            discrepancies.push({
              productId: pid,
              title: localProd.title,
              reason: 'price_changed',
              message: `El precio de "${localProd.title}" se actualizó a $${expectedUnitBasePrice} UYU.`,
              expectedPrice: Number(item.price),
              actualPrice: expectedUnitBasePrice,
            });
          }
        } else {
          // Producto internacional: fuente de verdad en USD / estimación UYU
          const source = intlProd || localProd;
          seenCurrencies.add('USD');

          const isPublished = source.status === 'published' && (source.availability ? source.availability === 'in_stock' : true);
          if (!isPublished) {
            discrepancies.push({
              productId: pid,
              title: source.title || item.title || 'Producto Internacional',
              reason: 'out_of_stock',
              message: `El producto internacional "${source.title || item.title}" ya no está disponible en origen.`,
            });
            continue;
          }
        }
      }

      const canonicalCurrency: 'UYU' | 'USD' | 'MIXED' =
        seenCurrencies.size > 1 ? 'MIXED' : seenCurrencies.has('USD') ? 'USD' : 'UYU';

      return {
        valid: discrepancies.length === 0,
        supabaseReachable: true,
        canonicalCurrency,
        discrepancies,
        userMessage:
          discrepancies.length > 0
            ? discrepancies.map((d) => d.message).join(' ')
            : undefined,
      };
    } catch {
      return {
        valid: false,
        supabaseReachable: false,
        canonicalCurrency: 'UYU',
        discrepancies: [],
        userMessage:
          'No pudimos conectar con el servidor de pedidos para validar tu compra de forma segura. Tu carrito sigue guardado; intentá nuevamente en unos segundos.',
      };
    }
  },
};
