import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabase = createClient(supabaseUrl, supabaseServiceKey);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Falta cabecera Authorization");

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error("Sesión de Supabase no válida.");

    const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
    if (!profile?.is_admin) throw new Error(`El usuario no tiene permisos de administrador.`);

    const body = await req.json();
    const action = body.action;
    const incomingIds = body.product_ids || [];
    const product_ids = incomingIds.length > 0 ? incomingIds : (body.ml_item_ids || []);
    const status = body.status || 'active';
    const sort = body.sort || 'relevance';
    let limit = body.limit || 20;

    let mlToken = body.auth_token;
    if (!mlToken) {
      const { data: tokenData } = await supabase.from('site_settings').select('value').eq('key', 'mercadolibre_access_token').single();
      mlToken = tokenData?.value;
    }
    if (!mlToken) throw new Error("Mercado Libre no está conectado.");

    const headers = { 'Authorization': `Bearer ${mlToken}`, 'Content-Type': 'application/json' };

    if (action === 'list_items') {
        const userRes = await fetch('https://api.mercadolibre.com/users/me', { headers });
        const userData = await userRes.json();
        if (!userRes.ok) throw new Error(`ML Error: ${userData.message}`);

        let allIds: string[] = [];
        let offset = 0;
        const maxLimit = Math.min(limit, 500); // Increased max limit for "Show All"
        
        while (allIds.length < maxLimit) {
            const batchSize = Math.min(50, maxLimit - allIds.length);
            const searchUrl = `https://api.mercadolibre.com/users/${userData.id}/items/search?limit=${batchSize}&offset=${offset}&status=${status === 'all' ? '' : status}&sort=${sort}`;
            const searchRes = await fetch(searchUrl, { headers });
            const searchData = await searchRes.json();
            const batchIds = searchData.results || [];
            if (!batchIds.length) break;
            allIds = [...allIds, ...batchIds];
            offset += batchIds.length;
            if (batchIds.length < batchSize) break;
        }

        if (!allIds.length) return new Response(JSON.stringify({ success: true, items: [], total: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

        const allItems = [];
        for (let i = 0; i < allIds.length; i += 20) {
            const chunk = allIds.slice(i, i + 20);
            const detailsRes = await fetch(`https://api.mercadolibre.com/items?ids=${chunk.join(',')}`, { headers });
            const details = await detailsRes.json();
            allItems.push(...details.map((r: any) => r.body));
        }

        return new Response(JSON.stringify({ success: true, items: allItems, total: allIds.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === 'import') {
        if (!product_ids.length) throw new Error("No hay productos seleccionados");
        
        const results = [];
        for (const mlId of product_ids) {
            try {
                const res = await fetch(`https://api.mercadolibre.com/items/${mlId}`, { headers });
                const item = await res.json();
                
                let description = item.title;
                try {
                  const descRes = await fetch(`https://api.mercadolibre.com/items/${mlId}/description`, { headers });
                  const descData = await descRes.json();
                  description = descData.plain_text || item.title;
                } catch(e) {}

                let brandId = null;
                try {
                  const brandAttr = item.attributes?.find((a: any) => a.id === 'BRAND')?.value_name;
                  if (brandAttr) {
                     const slugBrand = brandAttr.toLowerCase().replace(/[^a-z0-9]+/g, '-');
                     const { data: br } = await supabase.from('brands').upsert({
                        name: brandAttr,
                        slug: slugBrand
                     }, { onConflict: 'name' }).select().single();
                     if (br) brandId = br.id;
                  }
                } catch(e) {}

                const meta = {
                    attributes: item.attributes || [],
                    permalink: item.permalink,
                    initial_quantity: item.initial_quantity,
                    sold_quantity: item.sold_quantity,
                    accepts_mercadopago: item.accepts_mercadopago,
                    health: item.health,
                    video_id: item.video_id
                };

                const { data: prod, error: ep } = await supabase.from('products').upsert({
                    title: item.title,
                    description: description,
                    slug: `mercadolibre-${item.id}`, 
                    base_price: item.price,
                    ml_item_id: item.id,
                    ml_status: item.status,
                    condition: item.condition,
                    listing_type_id: item.listing_type_id,
                    brand_id: brandId,
                    metadata: meta,
                    status: item.status === 'active' ? 'published' : 'draft'
                }, { onConflict: 'ml_item_id' }).select().single();
                
                if (ep) throw new Error(ep.message);
                
                // ═══ Media (Download from ML and Upload to Supabase Storage) ═══
                await supabase.from('product_images').delete().eq('product_id', prod.id);
                const pics = item.pictures || [];
                const localImages = [];
                
                for (let i = 0; i < Math.min(pics.length, 10); i++) { // Limit to 10 images per product to avoid timeouts
                  const p = pics[i];
                  const imageUrl = (p.secure_url || p.url).replace('http://', 'https://');
                  
                  try {
                    const imgRes = await fetch(imageUrl);
                    if (!imgRes.ok) throw new Error("Could not fetch ML image");
                    const blob = await imgRes.blob();
                    const fileName = `ml-sync/${prod.id}-${i}-${Date.now()}.jpg`;
                    
                    const { data: uploadData, error: uploadError } = await supabase.storage
                      .from('public-assets')
                      .upload(fileName, blob, { contentType: 'image/jpeg', upsert: true });

                    if (uploadError) throw uploadError;

                    const { data: { publicUrl } } = supabase.storage
                      .from('public-assets')
                      .getPublicUrl(fileName);

                    localImages.push({
                      product_id: prod.id,
                      url: publicUrl,
                      alt_text: item.title,
                      sort_order: i,
                      is_primary: i === 0
                    });
                  } catch (imgErr) {
                    console.error(`Error syncing image ${i} for ${mlId}:`, imgErr);
                    // Fallback to original URL if upload fails
                    localImages.push({
                      product_id: prod.id,
                      url: imageUrl,
                      sort_order: i,
                      is_primary: i === 0
                    });
                  }
                }

                if (localImages.length > 0) {
                    await supabase.from('product_images').insert(localImages);
                }

                await supabase.from('product_variants').upsert({
                    product_id: prod.id,
                    sku: item.seller_custom_field || `ML-${item.id}`,
                    name: 'Estándar',
                    inventory_count: item.available_quantity || 0
                }, { onConflict: 'product_id' });

                results.push({ ml_id: mlId, status: "success" });
            } catch (e:any) { results.push({ ml_id: mlId, status: "error", error: e.message }); }
        }
        return new Response(JSON.stringify({ success: true, results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ success: true, message: "Sync complete" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e:any) {
    return new Response(JSON.stringify({ success: false, error: e.message }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
  }
});
