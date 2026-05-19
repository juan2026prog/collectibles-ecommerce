// @ts-ignore
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// @ts-ignore
import { createClient } from "jsr:@supabase/supabase-js@2";
// @ts-ignore
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { verifyAuth } from "../_shared/auth.ts";

const checkoutSchema = z.object({
  items: z.array(z.object({
    product_id: z.string().uuid(),
    variant_id: z.string().uuid().optional(),
    quantity: z.number().int().min(1),
    price: z.number().min(0), // Client-sent price (will be verified server-side)
    title: z.string().optional(),
  })).min(1),
  coupon_code: z.string().optional(),
  affiliate_code: z.string().optional(),
  payment_method: z.enum(['dlocalgo', 'mercadopago', 'transfer', 'handy']),
  currency: z.string().default('UYU'),
  shipping_address: z.object({
    first_name: z.string().min(1),
    last_name: z.string().min(1),
    street: z.string().min(1),
    apartment: z.string().optional(),
    city: z.string().min(1),
    department: z.string().optional(),
    postal_code: z.string().optional(),
    country: z.string().default('Uruguay'),
  }),
  customer_email: z.string().email(),
  customer_phone: z.string().optional(),
});

// ═══ Shipping zones (mirrors frontend uruguayLocations.ts) ═══
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

function calculateShipping(city: string, department: string, subtotal: number): number {
  if (subtotal >= 4000) return 0;
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
    // 1. Verify the user is authenticated
    const user = await verifyAuth(req);
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 2. Validate incoming payload
    const body = await req.json();
    const payload = checkoutSchema.parse(body);

    // ═══ FUNC-HIGH-03: Server-side price verification ═══
    // Fetch real prices from database — NEVER trust client-sent prices
    const productIds = payload.items.map((i: any) => i.product_id);
    const variantIds = payload.items.map((i: any) => i.variant_id).filter(Boolean) as string[];

    const { data: products, error: prodErr } = await supabase
      .from('products')
      .select('id, price')
      .in('id', productIds);

    if (prodErr || !products) {
      throw new Error('No se pudieron verificar los precios de los productos.');
    }

    // Build price lookup: variant price > product price
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

    // Verify each item price matches server price
    const verifiedItems = payload.items.map((item: any) => {
      const serverPrice = item.variant_id && variantPriceMap.has(item.variant_id)
        ? variantPriceMap.get(item.variant_id)!
        : productPriceMap.get(item.product_id);

      if (serverPrice === undefined) {
        throw new Error(`Producto ${item.product_id} no encontrado.`);
      }

      // Allow 1 UYU tolerance for rounding
      if (Math.abs(item.price - serverPrice) > 1) {
        throw new Error(
          `Precio del producto no coincide. Esperado: ${serverPrice}, Recibido: ${item.price}. ` +
          `Recargá la página e intentá de nuevo.`
        );
      }

      return { ...item, price: serverPrice }; // Use server-verified price
    });

    // 3. Resolve coupon if provided
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
        const subtotal = verifiedItems.reduce((s: number, i: any) => s + i.price * i.quantity, 0);
        discountAmount = coupon.discount_type === 'percentage'
          ? subtotal * (coupon.discount_value / 100)
          : coupon.discount_value;
      }
    }

    // 4. Resolve affiliate if code provided
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

    // 5. Calculate totals with SERVER-VERIFIED prices
    const subtotal = verifiedItems.reduce((s: number, i: any) => s + i.price * i.quantity, 0);

    // ═══ FUNC-HIGH-04: Use location-based shipping (matches frontend) ═══
    const shippingCity = payload.shipping_address.city || '';
    const shippingDept = payload.shipping_address.department || '';
    const shippingRate = calculateShipping(shippingCity, shippingDept, subtotal);

    const totalAmount = Math.max(subtotal - discountAmount + shippingRate, 0);

    // 6. Create order ATOMICALLY via RPC (prevents ghost orders)
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

    // 7. Return the created order for frontend to continue with payment
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
