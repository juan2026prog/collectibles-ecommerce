import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { verifyOptionalAuth } from "../_shared/auth.ts";

import { getCorsHeaders } from "../_shared/cors.ts";

const itemSchema = z.object({
  product_id: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
  variant_id: z.string().uuid().optional(),
  vendor_id: z.string().uuid().nullable().optional(),
  vendor_store_id: z.string().uuid().nullable().optional(),
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
  terms_accepted: z.boolean().refine(val => val === true, {
    message: "Debe aceptar los Términos y Condiciones",
  }),
  terms_accepted_at: z.string(),
  accepted_terms_version: z.string(),
  email_opt_in: z.boolean().optional().default(false),
  whatsapp_opt_in: z.boolean().optional().default(false),
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

function isLocationInSoyDeliveryZone(department?: string | null, city?: string | null): boolean {
  if (!department || !city) return false;
  
  const normDept = normalizeLocation(department).toLowerCase();
  const normCity = normalizeLocation(city).toLowerCase();
  
  if (normDept === "montevideo") {
    return true;
  }
  
  if (normDept === "san jose") {
    return normCity === "ciudad del plata";
  }
  
  if (normDept === "canelones") {
    const coveredCanelones = new Set([
      "ciudad de la costa", "colinas de carrasco", "el pinar", "lagomar", "lomas de solymar",
      "parque carrasco", "paso de carrasco", "shangrila", "solymar",
      "la paz", "las piedras", "progreso", "barros blancos", "joaquin suarez", "pando", "toledo",
      "ciudad de canelones", "canelones"
    ]);
    return coveredCanelones.has(normCity);
  }
  
  return false;
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
      .select("id, title, base_price, category_id, brand_id, vendor_id, vendor_store_id, vendors(store_name), product_tags(tag_id)")
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
        .select("id, sku, name, price_adjustment")
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

      let serverPrice = 0;
      if (item.vendor_id) {
        const { data: vProduct, error: vpError } = await supabase
          .from("vendor_products")
          .select("id, price")
          .eq("product_id", productId)
          .eq("vendor_id", item.vendor_id)
          .eq("status", "active")
          .maybeSingle();

        if (vpError) {
          console.error("Error fetching vendor product price:", vpError);
        }

        if (vProduct) {
          let adjustment = 0;
          if (item.variant_id) {
            const { data: vVariant, error: vvError } = await supabase
              .from("vendor_product_variants")
              .select("price_adjustment")
              .eq("vendor_product_id", vProduct.id)
              .eq("variant_id", item.variant_id)
              .maybeSingle();

            if (vvError) {
              console.error("Error fetching vendor product variant adjustment:", vvError);
            }
            adjustment = Number(vVariant?.price_adjustment || 0);
          }
          serverPrice = Number(vProduct.price) + adjustment;
        } else {
          return new Response(JSON.stringify({
            success: false,
            error: `El vendedor no tiene este producto activo.`,
            details: {
              product_id: productId,
              vendor_id: item.vendor_id,
              reason: "vendor_product_not_found"
            }
          }), {
            status: 200,
            headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }
          });
        }
      } else {
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

        serverPrice = dbBasePrice;
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

      const dbProduct = products?.find(p => p.id === productId);
      const resolvedStoreId = item.vendor_store_id || dbProduct?.vendor_store_id || null;

      verifiedItems.push({
        ...item,
        product_id: productId, // Garantizar que se guarde como product_id
        vendor_store_id: resolvedStoreId,
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

    // --- AUTO PROMOTIONS ENGINE ---
    let autoDiscountAmount = 0;
    const autoPromosApplied = [];
    try {
      const now = new Date().toISOString();
      const { data: autoPromotions, error: autoPromosError } = await supabase
        .from("promotions")
        .select("id, name, discount_type, discount_value, min_quantity, is_stackable, priority, owner_vendor_id")
        .neq("discount_type", "bank_discount")
        .eq("is_active", true)
        .or(`starts_at.is.null,starts_at.lte.${now}`)
        .or(`ends_at.is.null,ends_at.gte.${now}`)
        .order("priority", { ascending: false });

      if (!autoPromosError && autoPromotions && autoPromotions.length > 0) {
        const promoIds = autoPromotions.map(p => p.id);
        const { data: allTargets } = await supabase.from("promotion_targets").select("*").in("promotion_id", promoIds);
        const { data: allExclusions } = await supabase.from("promotion_exclusions").select("*").in("promotion_id", promoIds);
        const { data: allTiers } = await supabase.from("promotion_tiers").select("*").in("promotion_id", promoIds);

        const groupIds = new Set<string>();
        (allTargets || []).filter((t: any) => t.target_type === 'group').forEach((t: any) => groupIds.add(t.target_id));
        (allExclusions || []).filter((e: any) => e.target_type === 'group').forEach((e: any) => groupIds.add(e.target_id));

        let groupItems: any[] = [];
        if (groupIds.size > 0) {
          const { data } = await supabase.from('product_group_items').select('group_id, product_id').in('group_id', Array.from(groupIds));
          groupItems = data || [];
        }

        for (const item of verifiedItems) {
          const product = products?.find(p => p.id === item.product_id);
          if (!product) continue;

          let itemDiscount = 0;

          for (const promo of autoPromotions) {
            const itemVendorId = item.vendor_id || product.vendor_id || null;
            if (promo.owner_vendor_id && promo.owner_vendor_id !== itemVendorId) {
              continue;
            }

            // Check exclusions
            let isExcluded = false;
            const promoExclusions = (allExclusions || []).filter(e => e.promotion_id === promo.id);
            for (const exc of promoExclusions) {
              if (exc.target_type === 'product' && exc.target_id === item.product_id) isExcluded = true;
              if (exc.target_type === 'category' && product.category_id === exc.target_id) isExcluded = true;
              if (exc.target_type === 'brand' && product.brand_id === exc.target_id) isExcluded = true;
              if (exc.target_type === 'vendor' && product.vendor_id === exc.target_id) isExcluded = true;
              if (exc.target_type === 'tag' && product.product_tags?.some((pt: any) => pt.tag_id === exc.target_id)) isExcluded = true;
              if (exc.target_type === 'group' && groupItems.some(gi => gi.group_id === exc.target_id && gi.product_id === item.product_id)) isExcluded = true;
            }
            if (isExcluded) continue;

            // Check inclusions
            let isIncluded = false;
            const promoTargets = (allTargets || []).filter(t => t.promotion_id === promo.id);
            if (promoTargets.length === 0) {
              isIncluded = true;
            } else {
              for (const tgt of promoTargets) {
                if (tgt.target_type === 'product' && tgt.target_id === item.product_id) isIncluded = true;
                if (tgt.target_type === 'category' && product.category_id === tgt.target_id) isIncluded = true;
                if (tgt.target_type === 'brand' && product.brand_id === tgt.target_id) isIncluded = true;
                if (tgt.target_type === 'vendor' && product.vendor_id === tgt.target_id) isIncluded = true;
                if (tgt.target_type === 'tag' && product.product_tags?.some((pt: any) => pt.tag_id === tgt.target_id)) isIncluded = true;
                if (tgt.target_type === 'group' && groupItems.some(gi => gi.group_id === tgt.target_id && gi.product_id === item.product_id)) isIncluded = true;
              }
            }
            if (!isIncluded) continue;

            // Min quantity
            if (promo.min_quantity && item.quantity < promo.min_quantity) continue;

            let currentDiscount = 0;
            if (promo.discount_type === 'percentage') {
               currentDiscount = (item.price * item.quantity) * (Number(promo.discount_value) / 100);
            } else if (promo.discount_type === 'fixed') {
               currentDiscount = Number(promo.discount_value) * item.quantity;
            } else if (promo.discount_type === '2x1') {
               const freeItems = Math.floor(item.quantity / 2);
               currentDiscount = freeItems * item.price;
            } else if (promo.discount_type === 'buy_x_get_y') {
               const freeItems = Math.floor(item.quantity / (promo.min_quantity || 2));
               currentDiscount = freeItems * item.price;
            } else if (promo.discount_type === 'tiered') {
               const promoTiers = (allTiers || []).filter(t => t.promotion_id === promo.id).sort((a,b) => b.min_quantity - a.min_quantity);
               const activeTier = promoTiers.find(t => item.quantity >= t.min_quantity);
               if (activeTier) {
                 if (activeTier.discount_type === 'percentage') {
                   currentDiscount = (item.price * item.quantity) * (Number(activeTier.discount_value) / 100);
                 } else if (activeTier.discount_type === 'fixed') {
                   currentDiscount = Number(activeTier.discount_value) * item.quantity;
                 }
               }
            }

            if (currentDiscount > 0) {
               // Bugfix Acumulación: Si esta promo no es acumulable y ya hay descuentos previos (de mayor prioridad), no puede aplicar
               if (!promo.is_stackable && itemDiscount > 0) {
                 continue;
               }

               itemDiscount += currentDiscount;
               autoPromosApplied.push({ 
                 id: promo.id, 
                 name: promo.name, 
                 discount: currentDiscount, 
                 product_id: item.product_id,
                 vendor_id: product.vendor_id,
                 quantity: item.quantity,
                 original_unit_price: item.price,
                 final_unit_price: item.price - (currentDiscount / item.quantity),
                 is_stackable: promo.is_stackable
               });
               if (!promo.is_stackable) break; // Stop evaluating further promos for this item
            }
          }
          
          itemDiscount = Math.min(itemDiscount, item.price * item.quantity);
          autoDiscountAmount += itemDiscount;
        }
      }
    } catch (e) {
      console.warn("[Promotions Engine] Auto-promotions eval failed (tables may not exist):", e);
    }


    let bankDiscount = 0;
    let bankPromoSummary: Record<string, unknown> | null = null;
    if (payload.bank_promo?.promo_id) {
      const now = new Date().toISOString();
      const { data: promotion } = await supabase
        .from("promotions")
        .select("id, bank_name, discount_type, discount_value, min_purchase, max_discount, promo_label, starts_at, ends_at, is_active, owner_vendor_id")
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

      // Safe exclusions check without breaking if table doesn't exist yet
      const { data: exclusions, error: excError } = await supabase
        .from("promotion_exclusions")
        .select("target_type, target_id")
        .eq("promotion_id", promotion.id);

      if (excError) {
        console.warn("[Promotions Engine] Could not fetch exclusions (table might not exist yet):", excError.message);
      }

      let eligibleSubtotal = 0;
      
      for (const item of verifiedItems) {
        const product = products?.find(p => p.id === item.product_id);
        let isExcluded = false;

        const itemVendorId = item.vendor_id || product?.vendor_id || null;
        if (promotion.owner_vendor_id && promotion.owner_vendor_id !== itemVendorId) {
          isExcluded = true;
        }
        
        if (exclusions && exclusions.length > 0) {
           for (const exc of exclusions) {
              if (exc.target_type === 'product' && exc.target_id === item.product_id) isExcluded = true;
              if (exc.target_type === 'category' && product?.category_id === exc.target_id) isExcluded = true;
              if (exc.target_type === 'brand' && product?.brand_id === exc.target_id) isExcluded = true;
              if (exc.target_type === 'vendor' && product?.vendor_id === exc.target_id) isExcluded = true;
              if (exc.target_type === 'tag' && product?.product_tags?.some((pt: any) => pt.tag_id === exc.target_id)) isExcluded = true;
           }
        }
        
        // Regla de Acumulación: si el item ya tiene una promoción no acumulable, el banco NO aplica sobre él
        const appliedNonStackable = autoPromosApplied.find((ap: any) => ap.product_id === item.product_id && ap.is_stackable === false);
        if (appliedNonStackable) isExcluded = true;
        
        if (!isExcluded) {
           eligibleSubtotal += item.price * item.quantity;
        }
      }

      // Usar un "subtotal residual" que descuente los auto-discounts para compras bancarias mínimas
      const adjustedSubtotal = Math.max(subtotal - autoDiscountAmount, 0);
      if (eligibleSubtotal > adjustedSubtotal) eligibleSubtotal = adjustedSubtotal;

      if (eligibleSubtotal < minPurchase) {
        throw new Error(`La promocion requiere una compra minima de ${minPurchase} en productos elegibles.`);
      }

      bankDiscount = Math.round(eligibleSubtotal * (Number(promotion.discount_value) / 100));
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

    // Fetch free shipping threshold and global SoyDelivery setting from DB
    const { data: settingsList } = await supabase
      .from('site_settings')
      .select('key, value')
      .in('key', ['free_shipping_threshold', 'shipping_soydelivery_enabled']);

    const settingsMap = Object.fromEntries((settingsList || []).map(s => [s.key, s.value]));
    const freeShippingThreshold = settingsMap['free_shipping_threshold'] ? Number(settingsMap['free_shipping_threshold']) : 4000;
    const isSoyDeliveryEnabledGlobally = settingsMap['shipping_soydelivery_enabled'] !== 'false';

    // Fetch global active status of delivery providers
    const { data: globalProvidersList } = await supabase
      .from('delivery_providers')
      .select('provider_key, is_active');
    const globalProvidersMap = Object.fromEntries(
      (globalProvidersList || []).map(p => [p.provider_key, p.is_active])
    );

    // Map variants for easy lookup of SKU and name
    const variantMap = new Map<string, any>();
    if (variantIds.length > 0) {
      // Re-create the map using the loaded variants
      const { data: fullVariants } = await supabase
        .from("product_variants")
        .select("id, sku, name")
        .in("id", variantIds);
      for (const v of fullVariants || []) {
        variantMap.set(v.id, v);
      }
    }

    // Group items by vendor store
    const groups = new Map<string | null, any[]>();
    for (const item of verifiedItems) {
      const dbProduct = products?.find(p => p.id === item.product_id);
      const storeId = item.vendor_store_id || dbProduct?.vendor_store_id || null;
      const groupKey = storeId || item.vendor_id || dbProduct?.vendor_id || null;
      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      
      const variantObj = item.variant_id ? variantMap.get(item.variant_id) : null;
      const productName = variantObj ? `${dbProduct?.title} (${variantObj.name})` : (dbProduct?.title || item.title || "Producto");
      const itemSku = variantObj?.sku || null;

      groups.get(groupKey)!.push({
        ...item,
        product_name: productName,
        sku: itemSku,
        vendor_id: item.vendor_id || dbProduct?.vendor_id || null,
        vendor_store_id: storeId,
      });
    }

    const totalDiscounts = discountAmount + autoDiscountAmount + bankDiscount;
    const subordersList = [];
    let totalShippingCost = 0;

    // Process each vendor store group
    for (const [groupKey, groupItems] of groups.entries()) {
      let vendorId: string | null = null;
      let vendorStoreId: string | null = null;
      let vendorName = "Vendor";

      if (groupKey === null) {
        vendorName = "Collectibles";
      } else {
        const { data: storeData } = await supabase
          .from('vendor_stores')
          .select('id, vendor_id, store_name')
          .eq('id', groupKey)
          .maybeSingle();

        if (storeData) {
          vendorStoreId = storeData.id;
          vendorId = storeData.vendor_id;
          vendorName = storeData.store_name;
        } else {
          vendorId = groupKey;
          const { data: vendorData } = await supabase
            .from('vendors')
            .select('store_name')
            .eq('id', vendorId)
            .maybeSingle();
          vendorName = vendorData?.store_name || "Vendor";
        }
      }

      const groupSubtotal = groupItems.reduce((sum, it) => sum + it.price * it.quantity, 0);
      const groupDiscount = subtotal > 0 ? (totalDiscounts * groupSubtotal / subtotal) : 0;
      
      // 1. Get vendor dispatch address
      let vendorAddress = null;
      if (vendorId === null) {
        vendorAddress = {
          department: "Montevideo",
          city: "Montevideo",
          address: "Vázquez 1418"
        };
      } else {
        let storeAddr = null;
        if (vendorStoreId) {
          const { data: defaultStoreAddr } = await supabase
            .from('vendor_dispatch_addresses')
            .select('department, city, address, phone')
            .eq('vendor_id', vendorId)
            .eq('vendor_store_id', vendorStoreId)
            .order('is_default', { ascending: false })
            .limit(1)
            .maybeSingle();
          storeAddr = defaultStoreAddr;
        }

        if (storeAddr) {
          vendorAddress = storeAddr;
        } else {
          const { data: defaultAddr } = await supabase
            .from('vendor_dispatch_addresses')
            .select('department, city, address, phone')
            .eq('vendor_id', vendorId)
            .is('vendor_store_id', null)
            .order('is_default', { ascending: false })
            .limit(1)
            .maybeSingle();
          
          if (defaultAddr) {
            vendorAddress = defaultAddr;
          } else {
            const { data: anyAddr } = await supabase
              .from('vendor_dispatch_addresses')
              .select('department, city, address, phone')
              .eq('vendor_id', vendorId)
              .limit(1)
              .maybeSingle();
            vendorAddress = anyAddr || null;
          }
        }
      }

      // 2. Get vendor shipping settings
      let shippingSettings: any = {};
      if (vendorId === null) {
        shippingSettings = { soydelivery: { active: true }, dac: { active: true } };
      } else {
        const { data: vendorData } = await supabase
          .from('vendors')
          .select('shipping_settings')
          .eq('id', vendorId)
          .maybeSingle();
        if (vendorData?.shipping_settings) {
          shippingSettings = vendorData.shipping_settings;
        }
      }

      // Check coverage
      const isClientMontevideo = payload.shipping_address.department === "Montevideo";
      const isClientCovered = isClientMontevideo && isLocationInSoyDeliveryZone(payload.shipping_address.department, shippingCity);
      const isVendorCovered = vendorAddress ? isLocationInSoyDeliveryZone(vendorAddress.department, vendorAddress.city) : false;
      const isSoyDeliveryAvailable = isSoyDeliveryEnabledGlobally && isClientCovered && isVendorCovered;

      let shippingProvider = "DAC";
      let groupShippingCost = 0;

      if (payload.shipping_method === "pickup") {
        shippingProvider = "Retiro en local";
        groupShippingCost = 0;
      } else if (payload.shipping_method === "delivery" && isSoyDeliveryAvailable) {
        shippingProvider = "SoyDelivery";
        groupShippingCost = calculateShipping(shippingCity, "Montevideo", groupSubtotal, freeShippingThreshold);
      } else {
        const isDacActive = shippingSettings.dac?.active && globalProvidersMap['dac'] === true;
        const isUesActive = shippingSettings.ues?.active && globalProvidersMap['ues'] === true;
        const isCorreoActive = shippingSettings.correo_uruguayo?.active === true;
        const isManualActive = shippingSettings.manual?.active === true;

        if (isDacActive) {
          shippingProvider = "DAC";
          if (groupSubtotal >= freeShippingThreshold) {
            groupShippingCost = 0;
          } else {
            const dacMode = (payload.shipping_method === "dac_agency") ? "agency" : "home";
            const dacCostResponse = await fetch(`${supabaseUrl}/functions/v1/dac-get-cost`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseServiceKey}`
              },
              body: JSON.stringify({
                mode: dacMode,
                department: payload.shipping_address.department,
                city: payload.shipping_address.department === "Montevideo" ? "Montevideo" : payload.shipping_address.city,
                address: payload.shipping_address.street || '',
                dac_office_id: payload.shipping_address.dac_office_id,
                k_oficina_destino: payload.shipping_address.dac_k_oficina_destino,
                package_quantity: 1,
                package_type: 1,
                cart_total: groupSubtotal,
                items: groupItems
              })
            });
            const dacCostResult = await dacCostResponse.json();
            
            if (!dacCostResult || !dacCostResult.success) {
              const dacError = dacCostResult?.error || `No pudimos calcular el costo de envío DAC para el vendedor ${vendorName}.`;
              console.error(`[Create Order] DAC cost failed for ${vendorName}:`, dacError);
              throw new Error(dacError);
            }
            
            groupShippingCost = dacCostResult.cost;
          }
        } else if (isUesActive) {
          shippingProvider = "UES";
          groupShippingCost = (groupSubtotal >= freeShippingThreshold) ? 0 : 220;
        } else if (isCorreoActive) {
          shippingProvider = "Correo Uruguayo";
          groupShippingCost = (groupSubtotal >= freeShippingThreshold) ? 0 : 180;
        } else if (isManualActive) {
          shippingProvider = "Envío manual";
          groupShippingCost = Number(shippingSettings.manual?.fixed_cost || 0);
        } else {
          throw new Error("Este vendedor no tiene métodos de envío disponibles para tu dirección. Probá coordinar envío manual o contactanos.");
        }
      }

      totalShippingCost += groupShippingCost;

      // Commission Rate & Fee
      let commissionRate = 0;
      let marketplaceFee = 0;
      if (vendorId !== null) {
        const { data: commData, error: commErr } = await supabase.rpc("get_vendor_commission_rate", { p_vendor_id: vendorId });
        if (commErr) {
          console.warn(`[Create Order] Failed to fetch commission rate for ${vendorName}, using default 5%`, commErr);
          commissionRate = 5.00;
        } else {
          commissionRate = Number(commData);
        }
        marketplaceFee = groupSubtotal * (commissionRate / 100);
      }

      subordersList.push({
        vendor_id: vendorId,
        vendor_name: vendorName,
        vendor_store_id: vendorStoreId,
        vendor_store_name: vendorStoreId ? vendorName : null,
        is_collectibles_order: vendorId === null,
        product_subtotal: groupSubtotal,
        shipping_method: payload.shipping_method,
        shipping_provider: shippingProvider,
        shipping_cost: groupShippingCost,
        marketplace_commission_rate: commissionRate,
        marketplace_fee: marketplaceFee,
        vendor_gross_amount: groupSubtotal + groupShippingCost,
        vendor_net_amount: groupSubtotal + groupShippingCost - marketplaceFee,
        discount_total: groupDiscount
      });
    }

    const totalAmount = Math.max(subtotal - totalDiscounts + totalShippingCost, 0);

    const orderItems = [];
    for (const [groupKey, groupItems] of groups.entries()) {
      for (const item of groupItems) {
        const itemDiscount = subtotal > 0 ? (totalDiscounts * (item.price * item.quantity) / subtotal) : 0;
        orderItems.push({
          product_id: item.product_id,
          variant_id: item.variant_id || "",
          vendor_id: item.vendor_id || "",
          vendor_store_id: item.vendor_store_id || "",
          quantity: item.quantity,
          unit_price: item.price,
          product_name: item.product_name,
          sku: item.sku,
          discount_total: itemDiscount,
          final_total: Math.max(item.price - (item.quantity > 0 ? (itemDiscount / item.quantity) : 0), 0)
        });
      }
    }

    const orderShippingAddress = {
      ...payload.shipping_address,
      shipping_method: payload.shipping_method,
      bank_promo: bankPromoSummary,
      shipping_cost: totalShippingCost,
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
      p_suborders: subordersList,
      p_terms_accepted: payload.terms_accepted,
      p_terms_accepted_at: payload.terms_accepted_at,
      p_accepted_terms_version: payload.accepted_terms_version,
      p_email_opt_in: payload.email_opt_in,
      p_whatsapp_opt_in: payload.whatsapp_opt_in,
    });

    if (rpcError) {
      console.error("Atomic order creation failed:", rpcError);
      throw new Error(rpcError.message || "No se pudo crear la orden.");
    }

    // Analytics (Phase 4C): Register granular promotion usage (fail-safe)
    try {
      const usageRecords: any[] = [];
      if (autoPromosApplied.length > 0) {
        for (const ap of autoPromosApplied) {
           usageRecords.push({ 
             promotion_id: ap.id, 
             order_id: orderResult.order_id, 
             product_id: ap.product_id,
             vendor_id: ap.vendor_id || null,
             discount_amount: ap.discount,
             quantity: ap.quantity,
             original_unit_price: ap.original_unit_price,
             final_unit_price: ap.final_unit_price
           });
        }
      }
      if (bankPromoSummary?.id) {
         // Bank discounts apply generically to the order total, we log a single record
         usageRecords.push({ 
             promotion_id: bankPromoSummary.id, 
             order_id: orderResult.order_id, 
             discount_amount: bankPromoSummary.discount_amount 
         });
      }
      if (usageRecords.length > 0) {
         // Bugfix Analytics: Esperar asíncronamente para que la Edge Function no mate la promesa en Deno
         const { error } = await supabase.from('promotion_usage').insert(usageRecords);
         if (error) console.warn('[Promotions Analytics] Failed to insert granular usage data:', error.message);
      }
    } catch (e) {
      console.warn('[Promotions Analytics] Unhandled error preparing granular usage stats:', e);
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
