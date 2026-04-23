import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { verifyAdmin } from "../_shared/auth.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

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
      const { data: tokenData } = await supabase.from('site_settings').select('value').eq('key', 'mercadolibre_access_token').single();
      mlToken = tokenData?.value;
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
                const res = await fetch(`https://api.mercadolibre.com/items/${mlId}`, { headers });
                const item = await res.json();
                
                if (!res.ok) {
                  results.push({ ml_id: mlId, status: "error", error: item.message || "No se pudo obtener el item" });
                  return;
                }
                
                let description = item.title;
                try {
                  const descRes = await fetch(`https://api.mercadolibre.com/items/${mlId}/description`, { headers });
                  if (descRes.ok) {
                    const descData = await descRes.json();
                    description = descData.plain_text || item.title;
                  }
                } catch(_e) { /* description fallback to title */ }

                let brandId = null;
                let brandAttr = '';
                try {
                  brandAttr = item.attributes?.find((a: any) => a.id === 'BRAND')?.value_name || '';
                  if (brandAttr) {
                     const slugBrand = brandAttr.toLowerCase().replace(/[^a-z0-9]+/g, '-');
                     const { data: br } = await supabase.from('brands').upsert({
                        name: brandAttr,
                        slug: slugBrand
                     }, { onConflict: 'name' }).select().single();
                     if (br) brandId = br.id;
                  }
                } catch(_e) { /* brand extraction optional */ }

                // ═══ Extract category from ML API, Manual Rules, or AI ═══
                let categoryId = null;
                try {
                  if (item.category_id) {
                    
                    // Step 0: Manual Keyword Business Rules
                    const titleTitle = (item.title || '').toLowerCase();
                    const brandStr = brandAttr.toLowerCase();
                    
                    if (titleTitle.includes('funko')) {
                        const { data: funkoCat } = await supabase
                          .from('categories')
                          .select('id')
                          .eq('slug', 'funko-pop')
                          .maybeSingle();
                        if (funkoCat) categoryId = funkoCat.id;
                    } 
                    else if (
                        titleTitle.includes('estatua') || 
                        titleTitle.includes('statue') || 
                        titleTitle.includes('iron studios') || 
                        titleTitle.includes('minco') ||
                        brandStr.includes('iron studios') || 
                        brandStr.includes('minco')
                    ) {
                        const { data: estCat } = await supabase
                          .from('categories')
                          .select('id')
                          .eq('slug', 'esculturas')
                          .maybeSingle();
                        if (estCat) categoryId = estCat.id;
                    }

                    // Step 1: Check direct ML category ID mapping
                    if (!categoryId) {
                      const { data: matchedCat } = await supabase
                        .from('categories')
                        .select('id')
                        .contains('metadata', { ml_category_id: item.category_id })
                        .maybeSingle();

                      if (matchedCat) categoryId = matchedCat.id;
                    }

                    if (!categoryId) {
                      // Step 2: Check if AI category matching is enabled
                      const { data: aiToggle } = await supabase
                        .from('site_settings')
                        .select('value')
                        .eq('key', 'ai_category_matching_enabled')
                        .maybeSingle();
                      const aiEnabled = aiToggle?.value === 'true';
                      const geminiKey = Deno.env.get('GEMINI_API_KEY');

                      // Fetch all internal categories for matching
                      const { data: internalCats } = await supabase
                        .from('categories')
                        .select('id, name, slug')
                        .eq('is_active', true)
                        .order('name');

                      // Step 2a: Try LLM matching if enabled
                      if (aiEnabled && geminiKey && internalCats && internalCats.length > 0) {
                        try {
                          const categoryList = internalCats.map(c => `- "${c.name}" (id: ${c.id})`).join('\n');
                          const prompt = `Eres un sistema de clasificación de productos para una tienda de coleccionables.

Producto: "${item.title}"

Categorías disponibles en la tienda:
${categoryList}

Responde SOLO con el id (UUID) de la categoría más adecuada para este producto.
Si ninguna categoría es apropiada, responde exactamente: NONE
No agregues explicación, solo el id o NONE.`;

                          const geminiRes = await fetch(
                            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
                            {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
                            }
                          );

                          if (geminiRes.ok) {
                            const geminiData = await geminiRes.json();
                            const aiResponse = (geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();

                            // Log token usage
                            const usageMeta = geminiData.usageMetadata;
                            const tokensUsed = (usageMeta?.promptTokenCount || 0) + (usageMeta?.candidatesTokenCount || 0);
                            const estimatedCost = ((usageMeta?.promptTokenCount || 0) * 0.0000001) + ((usageMeta?.candidatesTokenCount || 0) * 0.0000004);
                            await supabase.from('ai_usage_log').insert({
                              tool_key: 'ai_category_matching',
                              tokens_used: tokensUsed,
                              estimated_cost: estimatedCost
                            }).then(() => {});

                            // Validate: check if response is a valid UUID that exists in our categories
                            if (aiResponse !== 'NONE' && aiResponse.length > 10) {
                              const matchedInternal = internalCats.find(c => c.id === aiResponse);
                              if (matchedInternal) {
                                categoryId = matchedInternal.id;
                                console.log(`AI matched "${item.title}" → "${matchedInternal.name}"`);
                              }
                            }
                          }
                        } catch (aiErr) {
                          console.error('AI category matching error (non-fatal):', aiErr);
                        }
                      }

                      // Step 3: If no category was assigned (AI failed or missing), we leave it as null
                      if (!categoryId) {
                         console.log(`No category mapped for ${item.title}. Leaving as unassigned to protect taxonomy.`);
                      }
                    }
                  }
                } catch(_e) { 
                  console.error("Category extraction error:", _e);
                  /* category extraction is optional, don't fail the import */ 
                }

                const meta = {
                    attributes: item.attributes || [],
                    permalink: item.permalink,
                    initial_quantity: item.initial_quantity,
                    sold_quantity: item.sold_quantity,
                    accepts_mercadopago: item.accepts_mercadopago,
                    health: item.health,
                    video_id: item.video_id,
                    ml_category_id: item.category_id
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
                    category_id: categoryId,
                    metadata: meta,
                    status: item.status === 'active' ? 'published' : 'draft',
                    updated_at: new Date().toISOString()
                }, { onConflict: 'ml_item_id' }).select().single();
                
                if (ep) throw new Error(ep.message);
                
                // ═══ Media (Download from ML and Upload to Supabase Storage) ═══
                await supabase.from('product_images').delete().eq('product_id', prod.id);
                const pics = item.pictures || [];
                const localImages = [];
                
                // Parallel download and upload for images to avoid timeouts
                await Promise.all(pics.slice(0, 10).map(async (p: any, i: number) => {
                  const imageUrl = (p.secure_url || p.url).replace('http://', 'https://');
                  
                  try {
                    const imgRes = await fetch(imageUrl);
                    if (!imgRes.ok) throw new Error("Could not fetch ML image");
                    const blob = await imgRes.blob();
                    const fileName = `ml-sync/${prod.id}-${i}-${Date.now()}.jpg`;
                    
                    const { error: uploadError } = await supabase.storage
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
                }));


                if (localImages.length > 0) {
                    await supabase.from('product_images').insert(localImages);
                }

                // ═══ Extract real SKU: SELLER_SKU > GTIN/UPC/EAN > seller_custom_field > ML-ID ═══
                const attrs = item.attributes || [];
                const sellerSku = attrs.find((a: any) => a.id === 'SELLER_SKU')?.value_name;
                const gtin = attrs.find((a: any) => a.id === 'GTIN')?.value_name;
                const upc = attrs.find((a: any) => a.id === 'UPC')?.value_name;
                const ean = attrs.find((a: any) => a.id === 'EAN')?.value_name;
                const mpn = attrs.find((a: any) => a.id === 'MPN')?.value_name;
                const realSku = sellerSku || gtin || upc || ean || mpn || item.seller_custom_field || `ML-${item.id}`;

                // ═══ Calculate real stock: ML returns 999 for "buy it now" listings ═══
                const mlAvailable = item.available_quantity || 0;
                const mlInitial = item.initial_quantity || 0;
                const mlSold = item.sold_quantity || 0;
                const realStock = mlAvailable >= 999 
                  ? Math.max(mlInitial - mlSold, 0) 
                  : mlAvailable;

                // Delete existing variant for this product, then insert with real SKU
                await supabase.from('product_variants').delete().eq('product_id', prod.id);
                await supabase.from('product_variants').insert({
                    product_id: prod.id,
                    sku: realSku,
                    name: 'Estándar',
                    inventory_count: realStock
                });

                // ═══ Link product to category in junction table (many-to-many) ═══
                if (categoryId) {
                  try {
                    // Check if link already exists to avoid duplicate
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
                  } catch(_e) { /* junction table link optional */ }
                }

                results.push({ ml_id: mlId, status: "success" });
            } catch (e: any) {
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
