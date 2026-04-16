import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
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

    // ═══ ACTION: LIST ITEMS ═══
    if (action === 'list_items') {
        const userRes = await fetch('https://api.mercadolibre.com/users/me', { headers });
        const userData = await userRes.json();
        if (!userRes.ok) {
          // Token expired or invalid — provide clear error
          const mlError = userData.message || userData.error || 'Error de autenticación con Mercado Libre';
          return new Response(
            JSON.stringify({ success: false, error: `ML API Error: ${mlError}. Es posible que el token haya expirado. Reconecta tu cuenta.` }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
          );
        }

        let allIds: string[] = [];
        let offset = 0;
        const maxLimit = limit === -1 ? 1000 : limit;
        
        while (allIds.length < maxLimit) {
            const batchSize = Math.min(50, maxLimit - allIds.length);
            const statusParam = status === 'all' ? '' : status;
            const searchUrl = `https://api.mercadolibre.com/users/${userData.id}/items/search?limit=${batchSize}&offset=${offset}&status=${statusParam}&sort=${sort}`;
            const searchRes = await fetch(searchUrl, { headers });
            const searchData = await searchRes.json();
            
            if (!searchRes.ok) {
              console.error("ML Search Error:", JSON.stringify(searchData));
              break;
            }
            
            const batchIds = searchData.results || [];
            if (!batchIds.length) break;
            allIds = [...allIds, ...batchIds];
            offset += batchIds.length;
            if (batchIds.length < batchSize) break;
        }

        if (!allIds.length) {
          return new Response(
            JSON.stringify({ success: true, items: [], total: 0 }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const allItems = [];
        const itemIdsChunks = [];
        for (let i = 0; i < allIds.length; i += 20) {
            itemIdsChunks.push(allIds.slice(i, i + 20));
        }

        // Fetch details in parallel strictly to avoid Deno Deploy timeouts
        await Promise.all(itemIdsChunks.map(async (chunk) => {
            try {
              const detailsRes = await fetch(`https://api.mercadolibre.com/items?ids=${chunk.join(',')}`, { headers });
              if (detailsRes.ok) {
                const details = await detailsRes.json();
                allItems.push(...details.map((r: any) => r.body).filter(Boolean));
              }
            } catch (err) {
              console.error("ML Items Details Error for chunk", chunk, err);
            }
        }));

        // ═══ Resolve category names from ML API (batch unique category_ids) ═══
        const uniqueCatIds = [...new Set(allItems.map((it: any) => it.category_id).filter(Boolean))];
        const catNameMap: Record<string, string> = {};
        
        const catChunks = [];
        for (let i = 0; i < uniqueCatIds.length; i += 20) {
            catChunks.push(uniqueCatIds.slice(i, i + 20));
        }

        await Promise.all(catChunks.map(async (catChunk) => {
            await Promise.all(catChunk.map(async (catId: string) => {
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
        }));

        // Enrich items with resolved category name
        const enrichedItems = allItems.map((it: any) => ({
          ...it,
          category_name: catNameMap[it.category_id] || null
        }));

        return new Response(
          JSON.stringify({ success: true, items: enrichedItems, total: allIds.length }),
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
        
        const results = [];
        for (const mlId of product_ids) {
            try {
                const res = await fetch(`https://api.mercadolibre.com/items/${mlId}`, { headers });
                const item = await res.json();
                
                if (!res.ok) {
                  results.push({ ml_id: mlId, status: "error", error: item.message || "No se pudo obtener el item" });
                  continue;
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
                } catch(_e) { /* brand extraction optional */ }

                // ═══ Extract category from ML API ═══
                let categoryId = null;
                try {
                  if (item.category_id) {
                    const catRes = await fetch(`https://api.mercadolibre.com/categories/${item.category_id}`);
                    if (catRes.ok) {
                      const catData = await catRes.json();
                      // Use the full category path to get the leaf (most specific) category
                      const pathFromRoot = catData.path_from_root || [];
                      // Use the leaf category (last in path), fallback to the direct category
                      const leafCat = pathFromRoot.length > 0 ? pathFromRoot[pathFromRoot.length - 1] : { id: item.category_id, name: catData.name };
                      const catName = leafCat.name;
                      const catSlug = catName.toLowerCase().replace(/[^a-z0-9áéíóúñü]+/g, '-').replace(/^-|-$/g, '');

                      // Upsert category: don't duplicate if slug already exists
                      const { data: existingCat } = await supabase
                        .from('categories')
                        .select('id')
                        .eq('slug', catSlug)
                        .maybeSingle();

                      if (existingCat) {
                        categoryId = existingCat.id;
                      } else {
                        // Check if parent category should be created (one level up)
                        let parentCategoryId = null;
                        if (pathFromRoot.length > 1) {
                          const parentCat = pathFromRoot[pathFromRoot.length - 2];
                          const parentSlug = parentCat.name.toLowerCase().replace(/[^a-z0-9áéíóúñü]+/g, '-').replace(/^-|-$/g, '');
                          const { data: existingParent } = await supabase
                            .from('categories')
                            .select('id')
                            .eq('slug', parentSlug)
                            .maybeSingle();

                          if (existingParent) {
                            parentCategoryId = existingParent.id;
                          } else {
                            const { data: newParent } = await supabase
                              .from('categories')
                              .insert({ name: parentCat.name, slug: parentSlug, is_active: true, metadata: { ml_category_id: parentCat.id } })
                              .select()
                              .single();
                            if (newParent) parentCategoryId = newParent.id;
                          }
                        }

                        const { data: newCat } = await supabase
                          .from('categories')
                          .insert({ 
                            name: catName, 
                            slug: catSlug, 
                            parent_id: parentCategoryId,
                            is_active: true, 
                            metadata: { ml_category_id: leafCat.id } 
                          })
                          .select()
                          .single();
                        if (newCat) categoryId = newCat.id;
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
                
                for (let i = 0; i < Math.min(pics.length, 10); i++) {
                  const p = pics[i];
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
                }

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
        }
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
