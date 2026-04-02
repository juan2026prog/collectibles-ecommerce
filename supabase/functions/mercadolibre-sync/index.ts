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
    // Note: We bypass JWT verification on the gateway but we still check it here
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error("Sesión inválida de Supabase. Reintenta loguearte.");

    const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
    if (!profile?.is_admin) throw new Error(`Permisos insuficientes: El usuario ${user.email} no es administrador.`);

    const body = await req.json();
    const action = body.action;
    // Standardize IDs: either they come in product_ids or ml_item_ids
    const incomingIds = body.product_ids || [];
    const product_ids = incomingIds.length > 0 ? incomingIds : (body.ml_item_ids || []);
    const status = body.status || 'active';
    let limit = body.limit || 20;

    let mlToken = body.auth_token;
    if (!mlToken) {
      const { data: tokenData } = await supabase.from('site_settings').select('value').eq('key', 'mercadolibre_access_token').single();
      mlToken = tokenData?.value;
    }
    if (!mlToken) throw new Error("Mercado Libre no está conectado. Ve a Site Settings para vincular la cuenta.");

    const headers = { 'Authorization': `Bearer ${mlToken}`, 'Content-Type': 'application/json' };

    if (action === 'list_items') {
        const userRes = await fetch('https://api.mercadolibre.com/users/me', { headers });
        const userData = await userRes.json();
        if (!userRes.ok) throw new Error(`ML Auth Error: ${userData.message || 'Token expirado'}`);

        // ML only allows limit up to 50 in search. If we want more, we need paging, but for now we cap and suggest multiple imports.
        // Actually, we'll try to fetch in batches of 50 up to 200.
        let allIds: string[] = [];
        let offset = 0;
        const maxLimit = Math.min(limit, 200); // We allow up to 200 per page for now
        
        while (allIds.length < maxLimit) {
            const batchSize = Math.min(50, maxLimit - allIds.length);
            const searchUrl = `https://api.mercadolibre.com/users/${userData.id}/items/search?limit=${batchSize}&offset=${offset}${status && status !== 'all' ? '&status=' + status : ''}`;
            const searchRes = await fetch(searchUrl, { headers });
            const searchData = await searchRes.json();
            const batchIds = searchData.results || [];
            if (!batchIds.length) break;
            allIds = [...allIds, ...batchIds];
            offset += batchIds.length;
            if (batchIds.length < batchSize) break;
        }

        if (!allIds.length) return new Response(JSON.stringify({ success: true, items: [], total: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

        // Multiget supports max 20 IDs. We batch them.
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
        if (!product_ids.length) throw new Error("No has seleccionado productos para importar (IDs vacíos)");
        
        const results = [];
        for (const mlId of product_ids) {
            try {
                // Fetch full product details from ML (Needed because list_items body might be partial)
                const res = await fetch(`https://api.mercadolibre.com/items/${mlId}`, { headers });
                const item = await res.json();
                
                // Fetch Description
                const descRes = await fetch(`https://api.mercadolibre.com/items/${mlId}/description`, { headers });
                const descData = await descRes.json();
                const actualDescription = descData.plain_text || item.title;

                const { data: prod, error: ep } = await supabase.from('products').upsert({
                    title: item.title,
                    description: actualDescription,
                    slug: `mercadolibre-${item.id}`, 
                    base_price: item.price,
                    ml_item_id: item.id,
                    ml_status: item.status,
                    condition: item.condition,
                    listing_type_id: item.listing_type_id,
                    status: item.status === 'active' ? 'published' : 'draft'
                }, { onConflict: 'ml_item_id' }).select().single();
                
                if (ep) throw new Error(`DB Insert Error: ${ep.message}`);
                
                // Clear and Sync Images
                await supabase.from('product_images').delete().eq('product_id', prod.id);
                const pics = item.pictures || [];
                if (pics.length > 0) {
                    await supabase.from('product_images').insert(pics.map((p:any, i:number) => ({
                      product_id: prod.id,
                      url: (p.secure_url || p.url).replace('http://', 'https://'),
                      sort_order: i,
                      is_primary: i===0
                    })));
                }

                // Add or Sync Variant (Default SKU)
                await supabase.from('product_variants').upsert({
                    product_id: prod.id,
                    sku: item.seller_custom_field || `ML-${item.id}`,
                    name: 'Estándar',
                    inventory_count: item.available_quantity || 0
                }, { onConflict: 'product_id' });

                results.push({ ml_id: mlId, status: "success" });
            } catch (e:any) {
                console.error(`Error importing ${mlId}:`, e.message);
                results.push({ ml_id: mlId, status: "error", error: e.message });
            }
        }
        return new Response(JSON.stringify({ success: true, results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ success: true, message: "Sync complete" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e:any) {
    return new Response(JSON.stringify({ success: false, error: e.message }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
  }
});
