import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { verifyOptionalAuth } from "../_shared/auth.ts";

import { getCorsHeaders } from "../_shared/cors.ts";

const itemSchema = z.object({
  product_id: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
  variant_id: z.string().uuid().optional(),
  quantity: z.number().int().min(1),
  price: z.number().min(0),
  title: z.string().optional(),
}).refine(data => data.product_id || data.id, {
  message: "Debe proporcionar product_id o id",
  path: ["product_id"]
});

const checkoutSchema = z.object({
  items: z.array(itemSchema).min(1),
  coupon_code: z.string().trim().min(1).optional(),
  affiliate_code: z.string().trim().min(1).optional(),
  payment_method: z.enum(["dlocalgo", "mercadopago", "paypal", "handy"]),
  currency: z.string().default("UYU"),
  shipping_method: z.enum(["delivery", "pickup", "dac", "dac_home", "dac_agency"]).default("delivery"),
  shipping_address: z.object({
    first_name: z.string().trim().min(1),
    last_name: z.string().trim().min(1),
    street: z.string().trim().optional(),
    apartment: z.string().trim().optional(),
    city: z.string().trim().optional(),
    department: z.string().trim().optional(),
    barrio: z.string().trim().optional(),
    reference: z.string().trim().optional(),
    postal_code: z.string().trim().optional(),
    country: z.string().trim().default("Uruguay"),
    dac_delivery_mode: z.string().optional(),
    dac_office_id: z.string().uuid().nullable().optional(),
    dac_k_oficina_destino: z.number().int().nullable().optional(),
    dac_office_name: z.string().optional(),
    dac_office_address: z.string().optional(),
    ci: z.string().optional(),
  }).passthrough(),
  customer_email: z.string().email(),
  customer_phone: z.string().trim().optional(),
  bank_promo: z.object({
    promo_id: z.string().uuid(),
  }).optional(),
});

const FLEX_NEAR = new Set([
  "Buceo", "Carrasco", "Carrasco Norte", "Flor de Maronas", "Las Canteras", "Malvin", "Malvin Norte", "Maronas", "Playa Verde", "Pocitos Nuevo", "Puerto Buceo", "Punta Gorda", "Union",
  "Aguada", "Barrio Sur", "Centro", "Ciudad Vieja", "Cordon", "Goes", "Jacinto Vera", "La Blanqueada", "La Comercial", "La Figurita", "Larranaga", "Palermo", "Parque Batlle", "Parque Rodo", "Pocitos", "Punta Carretas", "Reducto", "Tres Cruces", "Villa Biarritz", "Villa Dolores", "Villa Munoz",
  "Aires Puros", "Arroyo Seco", "Atahualpa", "Bella Vista", "Belvedere", "Bolivar", "Brazo Oriental", "Capurro", "Casavalle", "Castro", "Cerrito", "Ituzaingo", "Jardines Hipodromo", "La Teja", "Las Acacias", "Lavalleja", "Marconi", "Paso de las Duranas", "Paso Molino", "Penarol", "Piedras Blancas", "Prado", "Sayago", "Villa Espanola",
]);

const FLEX_MEDIUM = new Set([
  "Casabo", "Cerro", "La Paloma", "Nuevo Paris", "Pajas Blancas", "Paso de la Arena", "Punta Espinillo", "Santiago Vazquez", "Tres Ombues", "Victoria", "Villa del Cerro",
  "Abayuba", "Colon", "Conciliacion", "Cuchilla Pereira", "Lezica", "Melilla",
  "Manga", "Toledo Chico", "Villa Garcia",
  "Banados de Carrasco", "Bella Italia", "Chacarita", "Punta Rieles",
  "Ciudad de la Costa", "Colinas de Carrasco", "El Pinar", "Lagomar", "Lomas de Solymar", "Parque Carrasco", "Paso de Carrasco", "Shangrila", "Solymar",
]);

const FLEX_FAR = new Set([
  "La Paz", "Las Piedras", "Progreso",
  "Barros Blancos", "Joaquin Suarez", "Pando", "Toledo",
  "Ciudad de Canelones", "Canelones",
]);

function normalizeLocation(value?: string | null) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function calculateShipping(city: string, department: string, subtotal: number, freeShippingThreshold = 4000) {
  if (subtotal >= freeShippingThreshold) return 0;
  if (!city || !department) return 350;

  const normalizedCity = normalizeLocation(city);
  const normalizedDepartment = normalizeLocation(department);

  if (FLEX_NEAR.has(normalizedCity)) return 169;
  if (FLEX_MEDIUM.has(normalizedCity)) return 200;
  if (FLEX_FAR.has(normalizedCity)) return 290;
  if (normalizedDepartment === "Montevideo") return 200;
  return 350;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }

  try {
    console.log("create-order started");
    console.log("method:", req.method);

    if (req.method !== "POST") {
      return new Response(JSON.stringify({
        success: false,
        error: "Método no permitido",
      }), {
        status: 405,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const user = await verifyOptionalAuth(req);
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let payload;
    try {
      const bodyText = await req.text();
      if (!bodyText || bodyText.trim() === "") {
        return new Response(
          JSON.stringify({
            success: false,
            error: "El cuerpo de la peticion esta vacio o no existe",
          }),
          {
            status: 200,
            headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
          }
        );
      }
      payload = checkoutSchema.parse(JSON.parse(bodyText));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Datos de checkout invalidos",
            details: error.errors,
          }),
          {
            status: 200,
            headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
          }
        );
      }
      return new Response(
        JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : "Error al procesar el cuerpo de la peticion",
        }),
        {
          status: 200,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        }
      );
    }

    if (
      (payload.shipping_method === "delivery" || payload.shipping_method === "dac" || payload.shipping_method === "dac_home") &&
      (!payload.shipping_address.street || !payload.shipping_address.city || !payload.shipping_address.department)
    ) {
      throw new Error("Completa la direccion de envio antes de continuar.");
    }

    if (
      payload.shipping_method === "dac_agency" &&
      (!payload.shipping_address.dac_office_id && !payload.shipping_address.dac_k_oficina_destino)
    ) {
      throw new Error("Selecciona una agencia DAC para el retiro.");
    }

    // 1. Agregar logs seguros antes de la verificación
    console.log("create-order payload:", JSON.stringify(payload, null, 2));
    console.log("items received:", payload.items);

    const productIds = payload.items.map((item) => item.product_id || item.id).filter(Boolean);
    console.log("product ids:", productIds);

    const variantIds = payload.items
      .map((item) => item.variant_id)
      .filter(Boolean) as string[];

    // 3. Consulta segura y correcta a la tabla real 'products' (columna 'base_price')
    const { data: products, error: productError } = await supabase
      .from("products")
      .select("id, base_price")
      .in("id", productIds);

    if (productError) {
      console.error("Error fetching products:", productError);
      return new Response(JSON.stringify({
        success: false,
        error: "Error al verificar los precios en la base de datos",
        details: {
          reason: "database_error",
          message: productError.message
        }
      }), {
        status: 200,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }
      });
    }

    const productPriceMap = new Map<string, number>();
    for (const product of products || []) {
      productPriceMap.set(product.id, Number(product.base_price));
    }

    const variantPriceAdjustmentMap = new Map<string, number>();
    if (variantIds.length > 0) {
      // 3. Consulta segura y correcta a la tabla real 'product_variants' (columna 'price_adjustment')
      const { data: variants, error: variantError } = await supabase
        .from("product_variants")
        .select("id, price_adjustment")
        .in("id", variantIds);

      if (variantError) {
        console.error("Error fetching variants:", variantError);
        return new Response(JSON.stringify({
          success: false,
          error: "Error al verificar las variantes en la base de datos",
          details: {
            reason: "database_error",
            message: variantError.message
          }
        }), {
          status: 200,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }
        });
      }

      for (const variant of variants || []) {
        variantPriceAdjustmentMap.set(variant.id, Number(variant.price_adjustment || 0));
      }
    }

    // 6, 7, 8, 9. Verificación robusta de precios
    const verifiedItems = [];
    for (const item of payload.items) {
      const productId = item.product_id || item.id;
      if (!productId) {
        return new Response(JSON.stringify({
          success: false,
          error: "ID de producto no proporcionado en el item",
          details: {
            reason: "missing_product_id"
          }
        }), {
          status: 200,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }
        });
      }

      const dbBasePrice = productPriceMap.get(productId);
      if (dbBasePrice === undefined) {
        return new Response(JSON.stringify({
          success: false,
          error: `No se pudo verificar el precio del producto ${productId}`,
          details: {
            product_id: productId,
            reason: "not_found"
          }
        }), {
          status: 200,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }
        });
      }

      let serverPrice = dbBasePrice;
      if (item.variant_id) {
        if (!variantPriceAdjustmentMap.has(item.variant_id)) {
          return new Response(JSON.stringify({
            success: false,
            error: `No se pudo verificar el precio de la variante ${item.variant_id}`,
            details: {
              product_id: productId,
              variant_id: item.variant_id,
              reason: "not_found"
            }
          }), {
            status: 200,
            headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }
          });
        }
        const adjustment = variantPriceAdjustmentMap.get(item.variant_id) || 0;
        serverPrice = dbBasePrice + adjustment;
      }

      if (serverPrice === undefined || isNaN(serverPrice)) {
        return new Response(JSON.stringify({
          success: false,
          error: `No se pudo verificar el precio del producto ${productId}`,
          details: {
            product_id: productId,
            reason: "missing_price"
          }
        }), {
          status: 200,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }
        });
      }

      // Comparación segura de precios. Si difiere, error claro.
      if (Math.abs(item.price - serverPrice) > 1) {
        return new Response(JSON.stringify({
          success: false,
          error: `El precio para el producto ${productId} no coincide con el servidor`,
          details: {
            product_id: productId,
            reason: "price_mismatch",
            frontend_price: item.price,
            server_price: serverPrice
          }
        }), {
          status: 200,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }
        });
      }

      verifiedItems.push({
        ...item,
        product_id: productId, // Garantizar que se guarde como product_id
        price: serverPrice     // Usar precio del servidor
      });
    }

    const subtotal = verifiedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

    let couponId: string | null = null;
    let discountAmount = 0;
    if (payload.coupon_code) {
      const { data: coupon } = await supabase
        .from("coupons")
        .select("*")
        .eq("code", payload.coupon_code.toUpperCase())
        .eq("is_active", true)
        .single();

      if (!coupon) {
        throw new Error("El cupon ingresado no es valido.");
      }

      if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
        throw new Error("El cupon ha expirado.");
      }

      couponId = coupon.id;
      discountAmount = coupon.discount_type === "percentage"
        ? subtotal * (Number(coupon.discount_value) / 100)
        : Number(coupon.discount_value);
    }

    let affiliateId: string | null = null;
    if (payload.affiliate_code) {
      const { data: affiliate } = await supabase
        .from("affiliates")
        .select("id")
        .eq("code", payload.affiliate_code)
        .eq("status", "active")
        .single();

      if (affiliate?.id) {
        affiliateId = affiliate.id;
      }
    }

    let bankDiscount = 0;
    let bankPromoSummary: Record<string, unknown> | null = null;
    if (payload.bank_promo?.promo_id) {
      const now = new Date().toISOString();
      const { data: promotion } = await supabase
        .from("promotions")
        .select("id, bank_name, discount_type, discount_value, min_purchase, max_discount, promo_label, starts_at, ends_at, is_active")
        .eq("id", payload.bank_promo.promo_id)
        .eq("is_active", true)
        .single();

      if (!promotion) {
        throw new Error("La promocion bancaria seleccionada ya no esta disponible.");
      }

      if (promotion.discount_type !== "bank_discount" && promotion.discount_type !== "percentage") {
        throw new Error("La promocion bancaria seleccionada no es valida.");
      }

      if ((promotion.starts_at && promotion.starts_at > now) || (promotion.ends_at && promotion.ends_at < now)) {
        throw new Error("La promocion bancaria seleccionada ya no esta vigente.");
      }

      const minPurchase = Number(promotion.min_purchase || 0);
      if (subtotal < minPurchase) {
        throw new Error(`La promocion requiere una compra minima de ${minPurchase}.`);
      }

      bankDiscount = Math.round(subtotal * (Number(promotion.discount_value) / 100));
      if (Number(promotion.max_discount || 0) > 0) {
        bankDiscount = Math.min(bankDiscount, Number(promotion.max_discount));
      }

      bankPromoSummary = {
        id: promotion.id,
        bank_name: promotion.bank_name,
        discount_value: promotion.discount_value,
        discount_amount: bankDiscount,
        promo_label: promotion.promo_label,
      };
    }

    const shippingCity = payload.shipping_address.department === "Montevideo"
      ? (payload.shipping_address.barrio || "")
      : (payload.shipping_address.city || "");

    // Fetch free shipping threshold setting from DB
    const { data: thresholdSetting } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'free_shipping_threshold')
      .maybeSingle();

    const freeShippingThreshold = thresholdSetting?.value ? Number(thresholdSetting.value) : 4000;

    let shippingRate = 0;
    if (payload.shipping_method === "delivery" || payload.shipping_method === "dac" || payload.shipping_method === "dac_home" || payload.shipping_method === "dac_agency") {
      const isMontevideo = payload.shipping_address.department === "Montevideo";
      if (isMontevideo) {
        shippingRate = calculateShipping(shippingCity, "Montevideo", subtotal, freeShippingThreshold);
      } else {
        if (subtotal >= freeShippingThreshold) {
          shippingRate = 0;
        } else {
          // DAC shipping cost — NO FALLBACKS. If this fails, order creation is blocked.
          const { data: provider } = await supabase
            .from('delivery_providers')
            .select('is_active')
            .eq('provider_key', 'dac')
            .single();

          if (!provider || !provider.is_active) {
            throw new Error("El servicio de envío DAC no está disponible. Consultanos por WhatsApp.");
          }

          const dacCostResponse = await fetch(`${supabaseUrl}/functions/v1/dac-get-cost`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`
            },
            body: JSON.stringify({
              mode: payload.shipping_method === "dac_agency" ? "agency" : "home",
              department: payload.shipping_address.department,
              city: payload.shipping_address.city,
              address: payload.shipping_address.street || '',
              dac_office_id: payload.shipping_address.dac_office_id,
              k_oficina_destino: payload.shipping_address.dac_k_oficina_destino,
              package_quantity: 1,
              package_type: 1,
              cart_total: subtotal,
              items: verifiedItems
            })
          });
          const dacCostResult = await dacCostResponse.json();
          
          if (!dacCostResult || !dacCostResult.success) {
            const dacError = dacCostResult?.error || "No pudimos calcular el costo de envío DAC.";
            console.error("[Create Order] DAC cost failed, BLOCKING order:", dacError);
            throw new Error(dacError);
          }
          
          shippingRate = dacCostResult.cost;
          console.log("[Create Order] DAC cost calculated successfully:", shippingRate);
        }
      }
    }

    const totalAmount = Math.max(subtotal - discountAmount - bankDiscount + shippingRate, 0);
    const orderItems = verifiedItems.map((item) => ({
      product_id: item.product_id,
      variant_id: item.variant_id || "",
      quantity: item.quantity,
      unit_price: item.price,
    }));

    const orderShippingAddress = {
      ...payload.shipping_address,
      shipping_method: payload.shipping_method,
      bank_promo: bankPromoSummary,
      shipping_cost: shippingRate,
      discount_amount: discountAmount,
      bank_discount: bankDiscount,
      dac_delivery_mode: payload.shipping_method === "dac_agency" ? "agency" : "home",
      dac_office_id: payload.shipping_address.dac_office_id || null,
      dac_k_oficina_destino: payload.shipping_address.dac_k_oficina_destino || null,
      dac_office_name: payload.shipping_address.dac_office_name || null,
      dac_office_address: payload.shipping_address.dac_office_address || null,
      shipping_provider: "dac"
    };

    const { data: orderResult, error: rpcError } = await supabase.rpc("create_order_atomic", {
      p_customer_id: user?.id || null,
      p_total_amount: totalAmount,
      p_currency: payload.currency,
      p_payment_method: payload.payment_method,
      p_customer_email: payload.customer_email,
      p_customer_phone: payload.customer_phone || null,
      p_shipping_address: orderShippingAddress,
      p_affiliate_id: affiliateId,
      p_coupon_id: couponId,
      p_items: orderItems,
    });

    if (rpcError) {
      console.error("Atomic order creation failed:", rpcError);
      throw new Error(rpcError.message || "No se pudo crear la orden.");
    }

    return new Response(JSON.stringify({
      success: true,
      order: {
        id: orderResult.order_id,
        total_amount: totalAmount,
        subtotal,
        discount: discountAmount,
        bank_discount: bankDiscount,
        shipping: shippingRate,
        status: orderResult.status,
        payment_status: orderResult.payment_status,
        items_count: orderResult.items_count,
        currency: payload.currency,
        payment_method: payload.payment_method,
        customer_email: payload.customer_email,
      },
    }), {
      status: 200,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("create-order error:", error);

    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : "Error inesperado en create-order",
    }), {
      status: 200,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
