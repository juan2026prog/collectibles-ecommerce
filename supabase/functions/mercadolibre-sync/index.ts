import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { verifyAdmin } from "../_shared/auth.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ML_CLIENT_ID = Deno.env.get("MERCADOLIBRE_CLIENT_ID") || "";
const ML_CLIENT_SECRET = Deno.env.get("MERCADOLIBRE_CLIENT_SECRET") || "";

async function getValidMercadoLibreToken(supabase: any) {
  const { data } = await supabase.from('ml_credentials').select('*').single();
  if (!data) return null;
  
  if (data.expires_at && new Date(data.expires_at) <= new Date()) {
    // Token expired, refresh
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: ML_CLIENT_ID,
      client_secret: ML_CLIENT_SECRET,
      refresh_token: data.refresh_token
    });
    const res = await fetch("https://api.mercadolibre.com/oauth/token", {
       method: "POST",
       headers: { "Content-Type": "application/x-www-form-urlencoded" },
       body: params.toString()
    });
    if (res.ok) {
       const mlData = await res.json();
       const expiresAt = new Date(Date.now() + (mlData.expires_in * 1000)).toISOString();
       await supabase.from('ml_credentials').update({
           access_token: mlData.access_token,
           refresh_token: mlData.refresh_token || data.refresh_token,
           expires_at: expiresAt,
           updated_at: new Date().toISOString()
       }).eq('id', data.id);
       return mlData.access_token;
    } else {
       throw new Error("Mercado Libre token refresh failed. Por favor reconecta la cuenta.");
    }
  }
  return data.access_token;
}

async function resolveCollectiblesCategoryFromML(supabase: any, title: string, brand: string | null) {
    const t = title.toLowerCase();
    
    const rules = [
      { slug: "funko-pop", keywords: ["funko", "pop!"], priority: 100 },
      { slug: "beyblade", keywords: ["beyblade", "takara", "hasbro blade"], priority: 90 },
      { slug: "juegos-de-cartas-coleccionables", keywords: ["tcg", "pokemon tcg", "magic", "yugioh", "cartas"], priority: 80 },
      { slug: "albumes-y-figuritas", keywords: ["panini", "album", "álbum", "figuritas", "sticker"], priority: 70 },
      { slug: "figuras-de-accion", keywords: ["mortal kombat", "marvel legends", "mcfarlane", "neca", "figura"], priority: 60 },
      { slug: "lego", keywords: ["lego"], priority: 55 },
      { slug: "peluches", keywords: ["peluche", "plush", "mascota"], priority: 50 },
      { slug: "juegos-y-juguetes", keywords: ["juguete", "juego"], priority: 40 }
    ];

    let bestMatch = null;
    let highestPriority = -1;

    for (const rule of rules) {
       for (const kw of rule.keywords) {
          if (t.includes(kw) && rule.priority > highestPriority) {
              bestMatch = rule.slug;
              highestPriority = rule.priority;
          }
       }
    }

    const finalSlug = bestMatch || "otras-colecciones";
    
    const { data } = await supabase.from('categories').select('id, slug').eq('slug', finalSlug).maybeSingle();
    if (data) return data.id;

    const { data: d3 } = await supabase.from('categories').select('id').in('slug', ['otras-colecciones', 'sin-categorizar']).limit(1).maybeSingle();
    if (d3) return d3.id;

    const { data: d4 } = await supabase.from('categories').insert({ name: 'Otras Colecciones', slug: 'otras-colecciones' }).select().single();
    return d4?.id || null;
}

function extractRealSkuFromML(item: any, variation: any = null) {
   let sku = null;
   let source = 'missing';

   const getFromAttr = (attrs: any[], code: string) => attrs?.find((a: any) => a.id === code)?.value_name;

   if (variation?.seller_custom_field) { sku = variation.seller_custom_field; source = 'seller_custom_field_var'; }
   else if (item.seller_custom_field) { sku = item.seller_custom_field; source = 'seller_custom_field'; }
   else if (getFromAttr(item.attributes, 'SELLER_SKU')) { sku = getFromAttr(item.attributes, 'SELLER_SKU'); source = 'seller_sku'; }
   else if (getFromAttr(item.attributes, 'SKU')) { sku = getFromAttr(item.attributes, 'SKU'); source = 'sku'; }
   else if (getFromAttr(item.attributes, 'GTIN')) { sku = getFromAttr(item.attributes, 'GTIN'); source = 'gtin'; }
   else if (getFromAttr(item.attributes, 'EAN')) { sku = getFromAttr(item.attributes, 'EAN'); source = 'ean'; }
   else if (getFromAttr(item.attributes, 'UPC')) { sku = getFromAttr(item.attributes, 'UPC'); source = 'upc'; }
   else if (getFromAttr(item.attributes, 'ISBN')) { sku = getFromAttr(item.attributes, 'ISBN'); source = 'isbn'; }

   if (!sku) {
       sku = null; 
       source = 'missing';
   }
   return { sku, source, generated_sku: \`COL-ML-\${item.id}\` };
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  // Create supabase client inside the handler to avoid cold-start issues
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Verify admin using shared auth module
    await verifyAdmin(req);

    const body = await req.json();
    const action = body.action;
    const incomingIds = body.product_ids || [];
    const product_ids = incomingIds.length > 0 ? incomingIds : (body.ml_item_ids || []);
    const status = body.status || 'active';
    const sort = body.sort || 'relevance';
    let limit = body.limit || 20;

    let mlToken = body.auth_token;
    if (!mlToken) {
      mlToken = await getValidMercadoLibreToken(supabase);
    }
    if (!mlToken) {
      return new Response(
        JSON.stringify({ success: false, error: "Mercado Libre no está conectado. Ve a la sección de configuración para conectar tu cuenta." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const headers = { 'Authorization': `Bearer ${mlToken}`, 'Content-Type': 'application/json' };

    // ═══ Shared: search ML item IDs ═══
    async function searchMLItemIds() {
        const userRes = await fetch('https://api.mercadolibre.com/users/me', { headers });
        const userData = await userRes.json();
        if (!userRes.ok) {
          const mlError = userData.message || userData.error || 'Error de autenticación con Mercado Libre';
          throw new Error(`ML API Error: ${mlError}. Es posible que el token haya expirado. Reconecta tu cuenta.`);
        }

        const statusParam = status === 'all' ? '' : status;
        let allIds: string[] = [];
        let totalItems = 0;

        if (limit === -1) {
            // Use scroll API (search_type=scan) to bypass 1000 item limit for "Todos"
            let scrollId = '';
            let hasMore = true;
            while (hasMore) {
                const url = `https://api.mercadolibre.com/users/${userData.id}/items/search?search_type=scan&limit=100${scrollId ? `&scroll_id=${scrollId}` : ''}&status=${statusParam}`;
                const searchRes = await fetch(url, { headers });
                const searchData = await searchRes.json();
                
                if (!searchRes.ok) throw new Error(searchData.message || 'Error en búsqueda por scan');
                
                totalItems = searchData.paging?.total || 0;
                if (searchData.results && searchData.results.length > 0) {
                    allIds.push(...searchData.results);
                    scrollId = searchData.scroll_id;
                } else {
                    hasMore = false;
                }
            }
        } else {
            // Standard offset pagination for limited fetches
            const maxLimit = limit;
            const firstBatch = Math.min(50, maxLimit);
            const searchUrl = `https://api.mercadolibre.com/users/${userData.id}/items/search?limit=${firstBatch}&offset=0&status=${statusParam}&sort=${sort}`;
            const searchRes = await fetch(searchUrl, { headers });
            const searchData = await searchRes.json();
            
            if (!searchRes.ok) throw new Error(searchData.message || 'Error en búsqueda inicial');

            allIds = searchData.results || [];
            totalItems = searchData.paging?.total || 0;
            const finalMaxLimit = Math.min(totalItems, maxLimit);
            
            if (allIds.length < finalMaxLimit) {
                const searchUrls = [];
                for (let offset = allIds.length; offset < finalMaxLimit; offset += 50) {
                    const bSize = Math.min(50, finalMaxLimit - offset);
                    const url = `https://api.mercadolibre.com/users/${userData.id}/items/search?limit=${bSize}&offset=${offset}&status=${statusParam}&sort=${sort}`;
                    searchUrls.push(url);
                }
                for (let i = 0; i < searchUrls.length; i += 5) {
                    const batch = searchUrls.slice(i, i + 5);
                    const results = await Promise.all(batch.map(u => fetch(u, { headers }).then(r => r.json()).catch(() => ({}))));
                    for (const res of results) {
                        if (res.results) allIds.push(...res.results);
                    }
                }
            }
        }
        return { allIds, totalItems };
    }

    // ═══ Shared: fetch item details + categories for a list of ML IDs ═══
    async function fetchItemDetails(mlIds: string[]) {
        const allItems: any[] = [];
        const chunks = [];
        for (let i = 0; i < mlIds.length; i += 20) {
            chunks.push(mlIds.slice(i, i + 20));
        }
        for (let i = 0; i < chunks.length; i += 5) {
            const batch = chunks.slice(i, i + 5);
            await Promise.all(batch.map(async (chunk) => {
                try {
                  const detailsRes = await fetch(`https://api.mercadolibre.com/items?ids=${chunk.join(',')}`, { headers });
                  if (detailsRes.ok) {
                    const details = await detailsRes.json();
                    allItems.push(...details.map((r: any) => r.body).filter(Boolean));
                  }
                } catch (_e) { /* skip failed chunks */ }
            }));
        }

        const uniqueCatIds = [...new Set(allItems.map((it: any) => it.category_id).filter(Boolean))];
        const catNameMap: Record<string, string> = {};
        await Promise.all(uniqueCatIds.map(async (catId: string) => {
          try {
            const catRes = await fetch(`https://api.mercadolibre.com/categories/${catId}`);
            if (catRes.ok) {
              const catData = await catRes.json();
              const pathFromRoot = catData.path_from_root || [];
              catNameMap[catId] = pathFromRoot.length > 0
                ? pathFromRoot.map((p: any) => p.name).join(' > ')
                : catData.name || catId;
            }
          } catch(_e) { /* best-effort */ }
        }));

        return allItems.map((it: any) => ({ ...it, category_name: catNameMap[it.category_id] || null }));
    }

    // ═══ ACTION: LIST ITEM IDS (Phase 1 — new frontend, just returns IDs) ═══
    if (action === 'list_item_ids') {
        const { allIds, totalItems } = await searchMLItemIds();
        return new Response(
          JSON.stringify({ success: true, item_ids: allIds, total: totalItems }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    // ═══ ACTION: LIST ITEMS (full pipeline — backward compat for old frontend) ═══
    if (action === 'list_items') {
        const { allIds, totalItems } = await searchMLItemIds();
        if (!allIds.length) {
          return new Response(
            JSON.stringify({ success: true, items: [], total: 0 }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const enrichedItems = await fetchItemDetails(allIds);
        return new Response(
          JSON.stringify({ success: true, items: enrichedItems, total: totalItems }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    // ═══ ACTION: GET ITEM DETAILS (Phase 2 — takes specific IDs, returns enriched details) ═══
    if (action === 'get_item_details') {
        const mlIds: string[] = body.ml_ids || [];
        if (!mlIds.length) {
          return new Response(
            JSON.stringify({ success: true, items: [] }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const enrichedItems = await fetchItemDetails(mlIds);
        return new Response(
          JSON.stringify({ success: true, items: enrichedItems }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    // ═══ ACTION: IMPORT ═══
    if (action === 'import') {
        if (!product_ids.length) {
          return new Response(
            JSON.stringify({ success: false, error: "No hay productos seleccionados para importar" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
          );
        }
        
        const results: any[] = [];
        await Promise.all(product_ids.map(async (mlId) => {
            try {
                // 1. Fetch ML Item
                const res = await fetch(\`https://api.mercadolibre.com/items/\${mlId}\`, { headers });
                const item = await res.json();
                
                if (!res.ok) {
                  results.push({ ml_id: mlId, status: "error", error: item.message || "No se pudo obtener el item" });
                  return;
                }
                
                // 2. Fetch Description
                let description = item.title;
                try {
                  const descRes = await fetch(\`https://api.mercadolibre.com/items/\${mlId}/description\`, { headers });
                  if (descRes.ok) {
                    const descData = await descRes.json();
                    description = descData.plain_text || item.title;
                  }
                } catch(_e) { /* description fallback to title */ }

                // 3. Extract Brand
                let brandId = null;
                let brandName = null;
                try {
                  const brandAttr = item.attributes?.find((a: any) => a.id === 'BRAND')?.value_name;
                  if (brandAttr) {
                     brandName = brandAttr;
                     const slugBrand = brandAttr.toLowerCase().replace(/[^a-z0-9]+/g, '-');
                     const { data: br } = await supabase.from('brands').upsert({
                        name: brandAttr,
                        slug: slugBrand
                     }, { onConflict: 'name' }).select().single();
                     if (br) brandId = br.id;
                  }
                } catch(_e) { /* brand extraction optional */ }

                // 4. Resolve Internal Category
                const categoryId = await resolveCollectiblesCategoryFromML(supabase, item.title, brandName);

                // 5. Anti-Duplicados y Extracción de SKU
                const { sku, source, generated_sku } = extractRealSkuFromML(item);
                
                // Buscar si existe por ml_item_id
                let existingProdId = null;
                const { data: existingProdByMlId } = await supabase.from('products').select('id').eq('ml_item_id', item.id).maybeSingle();
                
                if (existingProdByMlId) {
                  existingProdId = existingProdByMlId.id;
                } else if (sku) {
                  // Si no existe por ml_item_id, buscar por SKU real para no duplicar un producto creado a mano
                  const { data: existingVariantBySku } = await supabase.from('product_variants').select('product_id').eq('sku', sku).maybeSingle();
                  if (existingVariantBySku) {
                     existingProdId = existingVariantBySku.product_id;
                  }
                }

                // Metadata base
                const meta = {
                    attributes: item.attributes || [],
                    permalink: item.permalink,
                    initial_quantity: item.initial_quantity,
                    sold_quantity: item.sold_quantity,
                    accepts_mercadopago: item.accepts_mercadopago,
                    health: item.health,
                    video_id: item.video_id,
                    ml_category_id: item.category_id,
                    source: "mercadolibre",
                    sku_source: source,
                    generated_sku: generated_sku
                };

                let prod;
                if (existingProdId) {
                    // Update existing
                    const { data: updatedProd, error: ep } = await supabase.from('products').update({
                        ml_item_id: item.id,
                        ml_status: item.status,
                        base_price: item.price,
                        source_platform: 'mercadolibre',
                        external_id: item.id,
                        last_ml_sync_at: new Date().toISOString(),
                        last_ml_status: item.status,
                        updated_at: new Date().toISOString()
                    }).eq('id', existingProdId).select().single();
                    if (ep) throw new Error(ep.message);
                    prod = updatedProd;
                } else {
                    // Create new
                    const { data: newProd, error: ep } = await supabase.from('products').insert({
                        title: item.title,
                        description: description,
                        slug: \`mercadolibre-\${item.id}\`, 
                        base_price: item.price,
                        ml_item_id: item.id,
                        ml_status: item.status,
                        condition: item.condition,
                        listing_type_id: item.listing_type_id,
                        brand_id: brandId,
                        category_id: categoryId,
                        metadata: { ...meta, sync_source: 'imported' },
                        status: item.status === 'active' ? 'published' : 'draft',
                        source_platform: 'mercadolibre',
                        external_id: item.id,
                        last_ml_sync_at: new Date().toISOString(),
                        last_ml_status: item.status
                    }).select().single();
                    if (ep) throw new Error(ep.message);
                    prod = newProd;
                }
                
                // 6. Sync Images
                await supabase.from('product_images').delete().eq('product_id', prod.id);
                const pics = item.pictures || [];
                const localImages = [];
                
                const topPics = pics.slice(0, 10);
                for (let i = 0; i < topPics.length; i++) {
                  const p = topPics[i];
                  const imageUrl = (p.secure_url || p.url).replace('http://', 'https://');
                  
                  try {
                    const imgRes = await fetch(imageUrl);
                    if (!imgRes.ok) throw new Error("Could not fetch ML image");
                    
                    const arrayBuffer = await imgRes.arrayBuffer(); 
                    const fileName = \`ml-sync/\${prod.id}-\${i}-\${Date.now()}.jpg\`;
                    
                    const { error: uploadError } = await supabase.storage
                      .from('public-assets')
                      .upload(fileName, arrayBuffer, { contentType: 'image/jpeg', upsert: true });

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

                // 7. Update Real Stock and Variants
                await supabase.from('product_variants').delete().eq('product_id', prod.id);

                if (item.variations && item.variations.length > 0) {
                    const variantsToInsert = item.variations.map((v: any) => {
                       const { sku: varSku } = extractRealSkuFromML(item, v);
                       const varStock = v.available_quantity >= 999 ? Math.max((v.initial_quantity || 0) - (v.sold_quantity || 0), 0) : v.available_quantity;
                       const varName = v.attribute_combinations ? v.attribute_combinations.map((a:any) => a.value_name).join(' - ') : `Variación ${v.id}`;
                       
                       return {
                          product_id: prod.id,
                          sku: varSku || `COL-ML-${item.id}-${v.id}`,
                          name: varName,
                          inventory_count: varStock,
                          price: v.price || item.price,
                          external_variant_id: v.id.toString(),
                          metadata: { attributes: v.attribute_combinations }
                       };
                    });
                    await supabase.from('product_variants').insert(variantsToInsert);
                    
                    // Update global product stock sync time
                    await supabase.from('products').update({ last_ml_stock_sync_at: new Date().toISOString() }).eq('id', prod.id);
                } else {
                    const mlAvailable = item.available_quantity || 0;
                    const mlInitial = item.initial_quantity || 0;
                    const mlSold = item.sold_quantity || 0;
                    const realStock = mlAvailable >= 999 
                      ? Math.max(mlInitial - mlSold, 0) 
                      : mlAvailable;

                    await supabase.from('product_variants').insert({
                        product_id: prod.id,
                        sku: sku || generated_sku,
                        name: 'Estándar',
                        inventory_count: realStock
                    });
                    
                    await supabase.from('products').update({ last_ml_stock_sync_at: new Date().toISOString() }).eq('id', prod.id);
                }

                // 8. Junction table (product_categories)
                if (categoryId) {
                  try {
                    const { data: existingLink } = await supabase
                      .from('product_categories')
                      .select('id')
                      .eq('product_id', prod.id)
                      .eq('category_id', categoryId)
                      .maybeSingle();

                    if (!existingLink) {
                      await supabase.from('product_categories').insert({
                        product_id: prod.id,
                        category_id: categoryId
                      });
                    }
                  } catch(_e) { /* silent fail on junction */ }
                }

                // 9. Logs controlados sin tokens
                console.log(\`Importado ML ID: \${item.id} | SKU Detectado: \${sku || 'No'} | Fuente SKU: \${source} | Categoría Interna: \${categoryId} | Acción: \${existingProdId ? 'updated/linked' : 'imported'}\`);

                results.push({ ml_id: mlId, status: "success", action: existingProdId ? 'linked/updated' : 'imported' });
            } catch (e: any) {
              console.error(\`Fallo importar ML \${mlId}:\`, e.message);
              results.push({ ml_id: mlId, status: "error", error: e.message });
            }
        }));
        return new Response(
          JSON.stringify({ success: true, results }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    // ═══ ACTION: PUBLISH (Web → ML) ═══
    if (action === 'publish') {
        const { data: settingsData } = await supabase.from('site_settings').select('*').in('key', ['ml_price_rules_enabled', 'ml_price_markup_type', 'ml_price_markup_value']);
        const rulesEnabled = settingsData?.find(d => d.key === 'ml_price_rules_enabled')?.value !== 'false'; // default true
        const markupType = settingsData?.find(d => d.key === 'ml_price_markup_type')?.value || 'percentage';
        const markupValue = Number(settingsData?.find(d => d.key === 'ml_price_markup_value')?.value || '10');

        const { data: prods } = await supabase.from('products').select('*, categories(metadata), brands(name), product_variants(sku, inventory_count), product_images(url)').in('id', product_ids);
        
        const results = [];
        for (const p of (prods || [])) {
            if (p.ml_item_id) {
               results.push({ id: p.id, status: 'skipped', error: 'El producto ya está vinculado a Mercado Libre' });
               continue;
            }
            
            // Calc price based on rules if enabled
            let price = p.base_price;
            if (rulesEnabled) {
                if (markupType === 'percentage') price = price * (1 + markupValue / 100);
                else if (markupType === 'discount_percentage') price = price * (1 - markupValue / 100);
                else if (markupType === 'fixed') price += markupValue;
            }

            const mlCategory = p.categories?.metadata?.ml_category_id || 'MLU1051'; // Base fallback
            
            const attributes = [];
            if (p.brands?.name) attributes.push({ id: "BRAND", value_name: p.brands.name });
            if (p.product_variants?.[0]?.sku) attributes.push({ id: "SELLER_SKU", value_name: p.product_variants[0].sku });
            
            const pictures = (p.product_images || []).map((img: any) => ({ source: img.url })).slice(0, 10);
            if (pictures.length === 0) pictures.push({ source: "https://http2.mlstatic.com/frontend-assets/ui-navigation/5.19.1/mercadolibre/logo__large_plus.png" }); // placeholder
            
            const payload = {
                title: p.title.substring(0, 60),
                category_id: mlCategory,
                price: Math.max(1, Math.round(price)),
                currency_id: "UYU",
                available_quantity: Math.max(1, p.product_variants?.[0]?.inventory_count || 1), // ML requires >0 to publish
                buying_mode: "buy_it_now",
                condition: p.condition || "new",
                listing_type_id: "gold_special",
                pictures: pictures,
                attributes: attributes
            };

            try {
                const mlRes = await fetch('https://api.mercadolibre.com/items', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(payload)
                });
                const mlData = await mlRes.json();
                
                if (!mlRes.ok) {
                    results.push({ id: p.id, status: 'error', error: mlData.message });
                } else {
                    await supabase.from('products').update({ ml_item_id: mlData.id, ml_status: 'active' }).eq('id', p.id);
                    results.push({ id: p.id, status: 'success', ml_id: mlData.id });
                }
            } catch (err: any) {
                results.push({ id: p.id, status: 'error', error: err.message });
            }
        }
        return new Response(JSON.stringify({ success: true, results, count: results.filter(r => r.status === 'success').length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ═══ ACTION: SYNC STOCK (Web → ML Bidirectional Partial Implementation) ═══
    if (action === 'sync_stock') {
        const { data: settingsData } = await supabase.from('site_settings').select('*').in('key', ['ml_price_rules_enabled', 'ml_price_markup_type', 'ml_price_markup_value']);
        const rulesEnabled = settingsData?.find(d => d.key === 'ml_price_rules_enabled')?.value !== 'false';
        const markupType = settingsData?.find(d => d.key === 'ml_price_markup_type')?.value || 'percentage';
        const markupValue = Number(settingsData?.find(d => d.key === 'ml_price_markup_value')?.value || '10');

        const { data: prods } = await supabase.from('products').select('id, base_price, ml_item_id, product_variants(inventory_count)').in('id', product_ids).not('ml_item_id', 'is', null);
        
        const results = [];
        for (const p of (prods || [])) {
            try {
                 let price = p.base_price;
                 if (rulesEnabled) {
                     if (markupType === 'percentage') price = price * (1 + markupValue / 100);
                     else if (markupType === 'discount_percentage') price = price * (1 - markupValue / 100);
                     else if (markupType === 'fixed') price += markupValue;
                 }
                 const stock = p.product_variants?.[0]?.inventory_count || 0;
                 
                 const payload: any = {
                     price: Math.max(1, Math.round(price)),
                     available_quantity: stock
                 };
                 // Handle pausing if out of stock, activating if in stock
                 if (stock <= 0) payload.status = 'paused';
                 else payload.status = 'active';

                 const mlRes = await fetch(`https://api.mercadolibre.com/items/${p.ml_item_id}`, { method: 'PUT', headers, body: JSON.stringify(payload) });
                 const mlData = await mlRes.json();
                 
                 if (mlRes.ok) {
                    results.push({ id: p.id, status: 'success' });
                    // Update database status based on ML
                    await supabase.from('products').update({ ml_status: stock <= 0 ? 'paused' : 'active' }).eq('id', p.id);
                 } else {
                    results.push({ id: p.id, status: 'error', error: mlData.message });
                 }
            } catch (err: any) {
                results.push({ id: p.id, status: 'error', error: err.message });
            }
        }
        return new Response(JSON.stringify({ success: true, results, count: results.filter(r => r.status === 'success').length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(
      JSON.stringify({ success: false, error: "Action not recognized or not implemented" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (e: any) {
    console.error("mercadolibre-sync error:", e);
    return new Response(
      JSON.stringify({ success: false, error: e.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  }
});
