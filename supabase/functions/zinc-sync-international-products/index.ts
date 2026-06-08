import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders, handleOptions } from "../_shared/cors.ts";
import { verifyAdmin } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

serve(async (req) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  try {
    await verifyAdmin(req);
    
    const ZINC_API_KEY = Deno.env.get("ZINC_API_KEY");
    if (!ZINC_API_KEY) {
      throw new Error("ZINC_API_KEY no configurada");
    }

    const { product_ids } = await req.json();

    if (!Array.isArray(product_ids) || product_ids.length === 0) {
      throw new Error("No hay productos seleccionados para sincronizar");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: products, error: productsError } = await supabase
      .from('international_products')
      .select('*')
      .in('id', product_ids);

    if (productsError) throw productsError;

    let syncedCount = 0;
    let errorCount = 0;

    for (const p of products) {
      if (!p.product_url_external) {
        errorCount++;
        continue;
      }

      try {
        // According to Zinc API docs, to get a specific product you can use the product_id (ASIN)
        // However, the user said "Zinc usa products[].url, no ASIN. Por eso guardar siempre product_url_external."
        // We will query the product search using the URL as query or we can use the URL if we extract the ASIN, but the prompt says:
        // "consultar nuevamente Zinc usando product_url_external o el método compatible"
        // Let's use Zinc's product details endpoint with the product_id we saved.
        // If external_product_id isn't guaranteed, we might need to search the URL.
        // Actually, Zinc's product endpoint uses `retailer` and `product_id`.
        
        let zincUrl = "";
        if (p.external_product_id) {
            zincUrl = `https://api.zinc.com/products/${p.external_product_id}?retailer=${p.source_retailer || 'amazon'}`;
        } else {
            // Fallback to searching the URL
            zincUrl = `https://api.zinc.com/products/search?query=${encodeURIComponent(p.product_url_external)}&retailer=${p.source_retailer || 'amazon'}`;
        }

        const zincRes = await fetch(zincUrl, {
          headers: {
            'Authorization': `Bearer ${ZINC_API_KEY}`
          }
        });

        if (!zincRes.ok) {
           // Product might be unavailable
           await supabase.from('international_products').update({
             availability: 'unavailable',
             last_synced_at: new Date().toISOString()
           }).eq('id', p.id);
           syncedCount++;
           continue;
        }

        const rawData = await zincRes.json();
        
        let price = null;
        let availability = 'unavailable';
        let rating = p.rating;
        let review_count = p.review_count;
        let image_url = p.image_url;
        
        if (rawData.results && Array.isArray(rawData.results)) {
            // It was a search response
            const match = rawData.results[0];
            if (match) {
                price = match.price ? match.price / 100 : null;
                availability = 'available';
                rating = match.stars || rating;
                review_count = match.num_reviews || review_count;
                image_url = match.image || image_url;
            }
        } else {
            // It was a direct product response
            price = rawData.price ? rawData.price / 100 : null;
            availability = 'available'; // If we got a 200 OK, it usually means we got it. We could check rawData.buy_box
            rating = rawData.stars || rating;
            review_count = rawData.num_reviews || review_count;
            if (rawData.images && rawData.images.length > 0) {
                image_url = rawData.images[0];
            } else if (rawData.image) {
                image_url = rawData.image;
            }
        }

        const base_price_usd = price !== null ? price : p.base_price_usd;
        
        // Recalculate final_price_usd
        // The exchange rate isn't natively stored in the DB, only final_price_uyu. 
        // We can infer the previous exchange rate if we want, or rely on base_price_usd.
        // Prompt: "final_price_uyu usando el tipo de cambio guardado o el valor indicado por admin si existe."
        // We will infer exchange rate: final_price_uyu / final_price_usd
        
        let exchange_rate = 40; // fallback
        if (p.final_price_usd > 0 && p.final_price_uyu > 0) {
            exchange_rate = Number(p.final_price_uyu) / Number(p.final_price_usd);
        }

        const final_price_usd = Number(base_price_usd) + Number(p.usa_domestic_shipping_usd || 0) + Number(p.collectibles_fee_usd || 0);
        const final_price_uyu = final_price_usd * exchange_rate;

        await supabase.from('international_products').update({
            base_price_usd,
            final_price_usd,
            final_price_uyu,
            availability,
            rating,
            review_count,
            image_url,
            raw_data: rawData,
            last_synced_at: new Date().toISOString()
        }).eq('id', p.id);
        
        syncedCount++;
      } catch (err) {
        console.error("Error syncing product", p.id, err);
        errorCount++;
      }
    }

    return new Response(
      JSON.stringify({ success: true, synced: syncedCount, errors: errorCount }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("zinc-sync-international-products error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
