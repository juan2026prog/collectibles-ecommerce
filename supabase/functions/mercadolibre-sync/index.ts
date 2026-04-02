import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";
import { z } from "https://deno.land/x/deno@v3.22.4/mod.ts"; // Note: this was zod in previous, let me fix import

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Re-using manual Zod-like check if import fails or just keep it simple
const validateBody = (body: any) => {
    if (!body.action) throw new Error("Acción requerida");
    return body;
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
    if (authError || !user) throw new Error("Sesión inválida o expirada de Supabase");

    const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
    if (!profile?.is_admin) throw new Error(`El usuario ${user.email} no tiene permisos de administrador.`);

    const body = await req.json();
    const action = body.action;
    const product_ids = body.product_ids || [];
    const status = body.status || 'active';
    const limit = body.limit || 20;

    let mlToken = body.auth_token;
    if (!mlToken) {
      const { data: tokenData } = await supabase.from('site_settings').select('value').eq('key', 'mercadolibre_access_token').single();
      mlToken = tokenData?.value;
    }
    if (!mlToken) throw new Error("Mercado Libre no está conectado (Falta access_token)");

    const headers = { 'Authorization': `Bearer ${mlToken}`, 'Content-Type': 'application/json' };

    if (action === 'list_items') {
        const userRes = await fetch('https://api.mercadolibre.com/users/me', { headers });
        const userData = await userRes.json();
        if (!userRes.ok) throw new Error(`ML Auth Error: ${userData.message || 'Token inválido'}`);

        const searchUrl = `https://api.mercadolibre.com/users/${userData.id}/items/search?limit=${limit}${status !== 'all' ? '&status=' + status : ''}`;
        const searchRes = await fetch(searchUrl, { headers });
        const searchData = await searchRes.json();
        const ids = searchData.results || [];
        
        if (!ids.length) return new Response(JSON.stringify({ success: true, items: [], total: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

        const detailsRes = await fetch(`https://api.mercadolibre.com/items?ids=${ids.join(',')}`, { headers });
        const details = await detailsRes.json();
        return new Response(JSON.stringify({ success: true, items: details.map((r:any)=>r.body), total: searchData.paging?.total || 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === 'import') {
        if (!product_ids.length) throw new Error("No hay IDs para importar");
        const results = [];
        for (const mlId of product_ids) {
            try {
                const res = await fetch(`https://api.mercadolibre.com/items/${mlId}`, { headers });
                const item = await res.json();
                const { data: prod, error: ep } = await supabase.from('products').upsert({
                    title: item.title, description: item.title, base_price: item.price,
                    ml_item_id: item.id, ml_status: item.status, condition: item.condition,
                    listing_type_id: item.listing_type_id, status: item.status === 'active' ? 'published' : 'draft'
                }, { onConflict: 'ml_item_id' }).select().single();
                if (ep) throw ep;
                await supabase.from('product_images').delete().eq('product_id', prod.id);
                const pics = item.pictures || [];
                if (pics.length > 0) {
                    await supabase.from('product_images').insert(pics.map((p:any, i:number) => ({ product_id: prod.id, url: (p.secure_url || p.url).replace('http://', 'https://'), sort_order: i, is_primary: i===0 })));
                }
                results.push({ ml_id: mlId, status: "success" });
            } catch (e:any) { results.push({ ml_id: mlId, status: "error", error: e.message }); }
        }
        return new Response(JSON.stringify({ success: true, results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ success: true, message: "Sync complete" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e:any) {
    return new Response(JSON.stringify({ success: false, error: e.message }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
  }
});
