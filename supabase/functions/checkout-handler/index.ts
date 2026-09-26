// @ts-ignore
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// @ts-ignore
import { createClient } from "jsr:@supabase/supabase-js@2";
// @ts-ignore
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { verifyAuth } from "../_shared/auth.ts";
import { executeSkyPostalPricingPipeline } from "../_shared/skypostal/skypostal-pricing-pipeline.ts";

const checkoutSchema = z.object({
  items: z.array(z.object({
    product_id: z.string().uuid(),
    variant_id: z.string().uuid().optional(),
    quantity: z.number().int().min(1),
    price: z.number().min(0), // Client-sent price (will be verified server-side)
    title: z.string().optional(),
    weight_kg: z.number().optional(),
  })).min(1),
  coupon_code: z.string().optional(),
  affiliate_code: z.string().optional(),
  quote_id: z.string().optional(),
  payment_method: z.enum(['dlocalgo', 'mercadopago', 'transfer', 'handy', 'paypal']),
  currency: z.string().default('UYU'),
  shipping_address: z.object({
    first_name: z.string().min(1),
    last_name: z.string().min(1),
    street: z.string().min(1),
    apartment: z.string().optional(),
    city: z.string().min(1),
    department: z.string().optional(),
    barrio: z.string().optional(),
    reference: z.string().optional(),
    postal_code: z.string().optional(),
    country: z.string().default('Uruguay'),
    country_code: z.string().optional(),
    ci: z.string().optional(),
    rut: z.string().optional(),
    dni: z.string().optional(),
    cpf: z.string().optional(),
    rfc: z.string().optional(),
  }),
  customer_email: z.string().email(),
  customer_phone: z.string().optional(),
});

// ═══ Domestic Shipping zones (mirrors frontend uruguayLocations.ts) ═══
const FLEX_NEAR = new Set([
  'Buceo','Carrasco','Carrasco Norte','Flor de Maroñas','Las Canteras','Malvín','Malvín Norte','Maroñas','Playa Verde','Pocitos Nuevo','Puerto Buceo','Punta Gorda','Unión',
  'Aguada','Barrio Sur','Centro','Ciudad Vieja','Cordón','Goes','Jacinto Vera','La Blanqueada','La Comercial','La Figurita','Larrañaga','Palermo','Parque Batlle','Parque Rodó','Pocitos','Punta Carretas','Reducto','Tres Cruces','Villa Biarritz','Villa Dolores','Villa Muñoz',
  'Aires Puros','Arroyo Seco','Atahualpa','Bella Vista','Belvedere','Bolívar','Brazo Oriental','Capurro','Casavalle','Castro','Cerrito','Ituzaingó','Jardines Hipódromo','La Teja','Las Acacias','Lavalleja','Marconi','Paso de las Duranas','Paso Molino','Peñarol','Piedras Blancas','Prado','Sayago','Villa Española'
]);
const FLEX_MEDIUM = new Set([
  'Casabó','Cerro','La Paloma','Nuevo París','Pajas Blancas','Paso de la Arena','Punta Espinillo','Santiago Vázquez','Tres Ombúes','Victoria','Villa del Cerro',
  'Abayubá','Colón','Conciliación','Cuchilla Pereira','Lezica','Melilla',
  'Manga','Toledo Chico','Villa García',
  'Bañados de Carrasco','Bella Italia','Chacarita','Punta Rieles',
  'Ciudad de la Costa','Colinas de Carrasco','El Pinar','Lagomar','Lomas de Solymar','Parque Carrasco','Paso de Carrasco','Shangrilá','Solymar'
]);
const FLEX_FAR = new Set([
  'La Paz','Las Piedras','Progreso',
  'Barros Blancos','Joaquín Suárez','Pando','Toledo',
  'Ciudad de Canelones','Canelones'
]);

function calculateDomesticShipping(city: string, department: string, subtotal: number, freeShippingThreshold = 4000): number {
  if (subtotal >= freeShippingThreshold) return 0;
  if (!city || !department) return 350;
  const c = city.trim();
  if (FLEX_NEAR.has(c)) return 169;
  if (FLEX_MEDIUM.has(c)) return 200;
  if (FLEX_FAR.has(c)) return 290;
  if (department === 'Montevideo') return 200;
  return 350;
}

// @ts-ignore
const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
// @ts-ignore
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// @ts-ignore
Deno.serve(async (req: any) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    // 1. Verify user authentication
    const user = await verifyAuth(req);
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 2. Validate incoming payload
    const body = await req.json();
    const payload = checkoutSchema.parse(body);

    // 3. Resolve destination country & logistics mode
    const countryRaw = payload.shipping_address.country_code || payload.shipping_address.country || 'UY';
    const countryCode = countryRaw.length === 2 ? countryRaw.toUpperCase() : (countryRaw.toLowerCase().includes('chile') ? 'CL' : countryRaw.toLowerCase().includes('per') ? 'PE' : countryRaw.toLowerCase().includes('brasil') || countryRaw.toLowerCase().includes('brazil') ? 'BR' : countryRaw.toLowerCase().includes('colombia') ? 'CO' : countryRaw.toLowerCase().includes('ecuador') ? 'EC' : countryRaw.toLowerCase().includes('m') ? 'MX' : countryRaw.toLowerCase().includes('arg') ? 'AR' : 'UY');

    const isSkyPostal = ['CL', 'PE', 'BR', 'CO', 'EC'].includes(countryCode);
    const isImportHub = ['UY', 'AR'].includes(countryCode);

    // Check market status if international
    if (isSkyPostal || countryCode === 'MX') {
      const { data: market } = await supabase
        .from('international_markets')
        .select('*')
        .eq('country_code', countryCode)
        .maybeSingle();

      if (!market || market.market_status === 'DISABLED') {
        return new Response(JSON.stringify({
          success: false,
          error: `El mercado de destino (${countryCode}) no está disponible para compras.`
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // 4. Server-side price verification
    const productIds = payload.items.map((i: any) => i.product_id);
    const variantIds = payload.items.map((i: any) => i.variant_id).filter(Boolean) as string[];

    const { data: products, error: prodErr } = await supabase
      .from('products')
      .select('id, price, weight_kg, dimensions, product_group_items(group:product_groups(allowed_payment_providers, payment_method_restriction, is_active))')
      .in('id', productIds);

    if (prodErr || !products) {
      throw new Error('No se pudieron verificar los productos en la base de datos.');
    }

    // Server-side payment restrictions verification
    let allowedProvidersIntersection: string[] | null = null;
    for (const p of products) {
      const items = (p.product_group_items || []) as any[];
      const activeGroups = items.map(i => i.group).filter(g => g && g.is_active);
      for (const g of activeGroups) {
        if (Array.isArray(g.allowed_payment_providers) && g.allowed_payment_providers.length > 0) {
          if (allowedProvidersIntersection === null) {
            allowedProvidersIntersection = [...g.allowed_payment_providers];
          } else {
            allowedProvidersIntersection = allowedProvidersIntersection.filter(prov => g.allowed_payment_providers.includes(prov));
          }
        }
      }
    }

    if (allowedProvidersIntersection !== null && !allowedProvidersIntersection.includes(payload.payment_method)) {
      return new Response(JSON.stringify({ error: `El método de pago ${payload.payment_method} no está autorizado para uno o más productos de este pedido.` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Build price lookup
    const productPriceMap = new Map<string, number>();
    for (const p of products) {
      productPriceMap.set(p.id, p.price);
    }

    let variantPriceMap = new Map<string, number>();
    if (variantIds.length > 0) {
      const { data: variants } = await supabase
        .from('product_variants')
        .select('id, price')
        .in('id', variantIds);
      if (variants) {
        for (const v of variants) {
          if (v.price != null) variantPriceMap.set(v.id, v.price);
        }
      }
    }

    const verifiedItems = payload.items.map((item: any) => {
      const serverPrice = item.variant_id && variantPriceMap.has(item.variant_id)
        ? variantPriceMap.get(item.variant_id)!
        : productPriceMap.get(item.product_id);

      if (serverPrice === undefined) {
        throw new Error(`Producto ${item.product_id} no encontrado.`);
      }

      if (Math.abs(item.price - serverPrice) > 1) {
        throw new Error(`Precio no coincide. Esperado: ${serverPrice}, Recibido: ${item.price}.`);
      }

      return { ...item, price: serverPrice };
    });

    // 5. Calculate Subtotal & Coupons
    const subtotal = verifiedItems.reduce((s: number, i: any) => s + i.price * i.quantity, 0);

    let discountAmount = 0;
    let couponId: string | null = null;
    if (payload.coupon_code) {
      const { data: coupon } = await supabase
        .from('coupons')
        .select('*')
        .eq('code', payload.coupon_code.toUpperCase())
        .eq('is_active', true)
        .single();

      if (coupon) {
        if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
          throw new Error('El cupón ha expirado.');
        }
        couponId = coupon.id;
        discountAmount = coupon.discount_type === 'percentage'
          ? subtotal * (coupon.discount_value / 100)
          : coupon.discount_value;
      }
    }

    let affiliateId: string | null = null;
    if (payload.affiliate_code) {
      const { data: affiliate } = await supabase
        .from('affiliates')
        .select('id')
        .eq('code', payload.affiliate_code)
        .eq('status', 'active')
        .single();
      if (affiliate) affiliateId = affiliate.id;
    }

    // 6. Calculate Shipping Rate Server-Side
    let shippingRate = 0;
    let quoteSnapshot: any = null;

    if (isSkyPostal) {
      // Calculate server-side authoritative SkyPostal quote
      const totalWeight = verifiedItems.reduce((sum: number, it: any) => sum + (Number(it.weight_kg) || 0.5) * it.quantity, 0);
      const quoteResult = executeSkyPostalPricingPipeline({
        countryCode,
        product: {
          title: verifiedItems[0]?.title || 'Coleccionable Internacional',
          fobValueUsd: subtotal,
          quantity: verifiedItems.reduce((sum: number, it: any) => sum + it.quantity, 0),
          actualWeightKg: totalWeight
        }
      });

      if (!quoteResult.isEligible) {
        return new Response(JSON.stringify({
          success: false,
          error: `Restricción de envío internacional: ${quoteResult.blockReason || 'Producto no elegible para el destino'}`
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      shippingRate = quoteResult.pricingBreakdown.customerShippingPriceUsd;
      quoteSnapshot = quoteResult;

      // Persist quote snapshot in database for audit
      await supabase
        .from('skypostal_quote_snapshots')
        .insert({
          quote_id: quoteResult.quoteId,
          country_code: countryCode,
          currency: 'USD',
          provider: 'skypostal',
          service_name: quoteResult.serviceName,
          service_code: quoteResult.serviceCode,
          rate_card_code: quoteResult.rateCardCode,
          rate_version: quoteResult.rateVersion,
          actual_weight_kg: quoteResult.packageDetails.actualWeightKg,
          dimensional_weight_kg: quoteResult.packageDetails.dimensionalWeightKg,
          billable_weight_kg: quoteResult.packageDetails.billableWeightKg,
          transportation_charge: quoteResult.pricingBreakdown.transportationChargeUsd,
          fuel_index_value: 2.45,
          fuel_percentage: quoteResult.pricingBreakdown.fuelAdjustmentPercent,
          fuel_amount: quoteResult.pricingBreakdown.fuelAmountUsd,
          fuel_status: quoteResult.pricingBreakdown.fuelStatus,
          provider_estimated_cost: quoteResult.pricingBreakdown.providerCostUsd,
          markup_percentage: quoteResult.pricingBreakdown.markupPercent,
          markup_amount: quoteResult.pricingBreakdown.markupAmountUsd,
          customer_shipping_price: quoteResult.pricingBreakdown.customerShippingPriceUsd,
          compliance_status: quoteResult.compliance.status,
          compliance_reason: quoteResult.compliance.reason,
          expires_at: quoteResult.expiresAt,
          raw_snapshot: quoteResult
        });
    } else {
      // Domestic Uruguay shipping calculation
      const { data: thresholdSetting } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'free_shipping_threshold')
        .maybeSingle();

      const freeShippingThreshold = thresholdSetting?.value ? Number(thresholdSetting.value) : 4000;
      const shippingCity = payload.shipping_address.department === 'Montevideo'
        ? (payload.shipping_address.barrio || '')
        : (payload.shipping_address.city || '');
      const shippingDept = payload.shipping_address.department || '';
      shippingRate = calculateDomesticShipping(shippingCity, shippingDept, subtotal, freeShippingThreshold);
    }

    const totalAmount = Math.max(subtotal - discountAmount + shippingRate, 0);

    // 7. Create order atomically
    const orderItems = verifiedItems.map((item: any) => ({
      product_id: item.product_id,
      variant_id: item.variant_id || '',
      quantity: item.quantity,
      unit_price: item.price,
    }));

    const { data: orderResult, error: rpcError } = await supabase.rpc('create_order_atomic', {
      p_customer_id: user.id,
      p_total_amount: totalAmount,
      p_currency: payload.currency,
      p_payment_method: payload.payment_method,
      p_customer_email: payload.customer_email,
      p_customer_phone: payload.customer_phone || null,
      p_shipping_address: payload.shipping_address,
      p_affiliate_id: affiliateId,
      p_coupon_id: couponId,
      p_items: orderItems,
    });

    if (rpcError) {
      console.error('Atomic order creation failed:', rpcError);
      throw new Error(rpcError.message || 'Error creating order');
    }

    // 8. If international, update order with quote reference and logistics mode
    if (isSkyPostal && quoteSnapshot) {
      await supabase
        .from('orders')
        .update({
          international_quote_id: quoteSnapshot.quoteId,
          logistics_mode: 'SKYPOSTAL',
          destination_country_code: countryCode,
          recipient_tax_id: payload.shipping_address.rut || payload.shipping_address.dni || payload.shipping_address.cpf || payload.shipping_address.rfc || payload.shipping_address.ci
        })
        .eq('id', orderResult.order_id);
    }

    return new Response(JSON.stringify({
      success: true,
      order: {
        id: orderResult.order_id,
        total_amount: totalAmount,
        subtotal,
        discount: discountAmount,
        shipping: shippingRate,
        status: orderResult.status,
        payment_status: orderResult.payment_status,
        items_count: orderResult.items_count,
        quote_id: quoteSnapshot?.quoteId
      }
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    const isZodError = error instanceof z.ZodError;
    return new Response(
      JSON.stringify({
        success: false,
        error: isZodError ? "Datos de checkout inválidos" : error.message,
        details: isZodError ? error.errors : undefined,
      }), {
        status: isZodError ? 400 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});
