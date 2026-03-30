import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { verifyAuth } from "../_shared/auth.ts";

const checkoutSchema = z.object({
  items: z.array(z.object({
    product_id: z.string().uuid(),
    variant_id: z.string().uuid().optional(),
    quantity: z.number().int().min(1),
    price: z.number().min(0),
    title: z.string().optional(),
  })).min(1),
  coupon_code: z.string().optional(),
  affiliate_code: z.string().optional(),
  payment_method: z.enum(['dlocalgo', 'mercadopago', 'transfer']),
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

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    // 1. Verify the user is authenticated
    const user = await verifyAuth(req);
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 2. Validate incoming payload
    const body = await req.json();
    const payload = checkoutSchema.parse(body);

    // 3. Verify stock availability for each item
    for (const item of payload.items) {
      if (item.variant_id) {
        const available = await supabase.rpc('check_stock', {
          p_variant_id: item.variant_id,
          p_quantity: item.quantity
        });
        if (!available.data) {
          throw new Error(`Stock insuficiente para el producto: ${item.title || item.product_id}`);
        }
      }
    }

    // 4. Resolve coupon if provided
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
        const subtotal = payload.items.reduce((s, i) => s + i.price * i.quantity, 0);
        discountAmount = coupon.discount_type === 'percentage'
          ? subtotal * (coupon.discount_value / 100)
          : coupon.discount_value;
      }
    }

    // 5. Resolve affiliate if code provided
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

    // 6. Calculate totals
    const subtotal = payload.items.reduce((s, i) => s + i.price * i.quantity, 0);
    const shippingRate = subtotal >= 4000 ? 0 : 350;
    const totalAmount = Math.max(subtotal - discountAmount + shippingRate, 0);

    // 7. Create order in a single transaction-like flow
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        customer_id: user.id,
        user_id: user.id,
        total_amount: totalAmount,
        currency: payload.currency,
        status: 'pending',
        payment_method: payload.payment_method,
        customer_email: payload.customer_email,
        customer_phone: payload.customer_phone || null,
        shipping_address: payload.shipping_address,
        affiliate_id: affiliateId,
        coupon_id: couponId,
      })
      .select()
      .single();

    if (orderErr || !order) throw new Error(orderErr?.message || 'Error creating order');

    // 8. Insert order items
    const orderItems = payload.items.map(item => ({
      order_id: order.id,
      product_id: item.product_id,
      variant_id: item.variant_id || null,
      quantity: item.quantity,
      unit_price: item.price,
      total_price: item.price * item.quantity,
    }));

    const { error: itemsErr } = await supabase.from('order_items').insert(orderItems);
    if (itemsErr) throw new Error('Error al insertar los items de la orden: ' + itemsErr.message);

    // 9. Return the created order for frontend to continue with payment
    return new Response(JSON.stringify({
      success: true,
      order: {
        id: order.id,
        total_amount: totalAmount,
        subtotal,
        discount: discountAmount,
        shipping: shippingRate,
        status: order.status,
        items_count: payload.items.length,
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
