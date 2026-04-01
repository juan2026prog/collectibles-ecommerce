import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { verifyAdmin } from "../_shared/auth.ts";

const syncSchema = z.object({
  action: z.enum(['publish', 'sync_stock']),
  product_ids: z.array(z.string().uuid()).min(1),
  auth_token: z.string().optional()
});

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabase = createClient(supabaseUrl, supabaseServiceKey);

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    // 1. Verificar Admin Autorizado
    await verifyAdmin(req);

    // 2. Validar Input Payload
    const body = await req.json();
    const payload = syncSchema.parse(body);
    const { action, product_ids } = payload;

    // 1. Fetch the products from our database
    const { data: products, error } = await supabase
      .from('products')
      .select('*, product_variants(sku, inventory_count), categories(name)')
      .in('id', product_ids);

    if (error) throw error;
    if (!products) throw new Error("Productos no encontrados");

    // Mercado Libre Token (Prefer DB, fallback to env)
    let mlToken = payload.auth_token;
    if (!mlToken) {
      const { data: tokenData } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'mercadolibre_access_token')
        .single();
      mlToken = tokenData?.value || Deno.env.get("MERCADOLIBRE_ACCESS_TOKEN");
    }

    if (!mlToken) throw new Error("MERCADOLIBRE_ACCESS_TOKEN no configurado.");

    const results = [];
    const headers = {
        'Authorization': `Bearer ${mlToken}`,
        'Content-Type': 'application/json'
    };

    for (const p of products) {
        const stock = p.product_variants?.[0]?.inventory_count || 0;
        
        if (action === "publish") {
            const mappedItem = {
                title: p.title.substring(0, 60),
                category_id: "MLA1234", // Requiere category prediction real en prod
                price: p.base_price * 1.1,
                currency_id: "UYU",
                available_quantity: stock,
                buying_mode: "buy_it_now",
                condition: "new",
                listing_type_id: "gold_special",
                description: { plain_text: p.description || p.short_description || "Excelente producto coleccionable." },
                attributes: [
                  { id: "ITEM_CONDITION", value_name: "Nuevo" }
                ],
                pictures: p.images?.slice(0, 5).map((imgUrl: string) => ({ source: imgUrl })) || []
            };

            if (mlToken.includes("mock") || mlToken.includes("test")) {
                results.push({ product_id: p.id, status: "mock_success", item_id: "MLA_MOCK_" + Date.now() });
                await supabase.from("products").update({ ml_item_id: "MLA_MOCK_" + Date.now() }).eq("id", p.id);
                continue;
            }

            const response = await fetch('https://api.mercadolibre.com/items', {
                method: 'POST',
                headers,
                body: JSON.stringify(mappedItem)
            });
            const data = await response.json();
            
            if (!response.ok) {
                results.push({ product_id: p.id, status: "error", error: data });
            } else {
                results.push({ product_id: p.id, status: "published", item_id: data.id });
                // Store the ML ID back to our DB
                await supabase.from("products").update({ ml_item_id: data.id }).eq("id", p.id);
            }
        } else if (action === "sync_stock") {
            // Check if product was published
            const mlItemId = (p as any).ml_item_id;
            if (!mlItemId) {
                results.push({ product_id: p.id, status: "skipped", reason: "Product never published to ML" });
                continue;
            }

            if (mlToken.includes("mock") || mlToken.includes("test")) {
                results.push({ product_id: p.id, status: "mock_stock_updated", new_stock: stock });
                continue;
            }

            // Sync ML Stock (Put request to item)
            const response = await fetch(`https://api.mercadolibre.com/items/${mlItemId}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify({ available_quantity: stock })
            });

            if (!response.ok) {
                results.push({ product_id: p.id, status: "error", error: await response.json() });
            } else {
                results.push({ product_id: p.id, status: "stock_updated", new_stock: stock });
            }
        }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Sincronización '${action}' ejecutada.`,
        results
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
    
  } catch (error: any) {
    const isZodError = error instanceof z.ZodError;
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: isZodError ? "Error de validación" : error.message,
        details: isZodError ? error.errors : undefined
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: isZodError ? 400 : 403 }
    );
  }
});
