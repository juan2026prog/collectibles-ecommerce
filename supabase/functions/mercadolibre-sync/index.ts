import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { getCorsHeaders, handleOptions } from "../_shared/cors.ts";
import { verifyAuth } from "../_shared/auth.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ML_CLIENT_ID = Deno.env.get("MERCADOLIBRE_CLIENT_ID") || "";
const ML_CLIENT_SECRET = Deno.env.get("MERCADOLIBRE_CLIENT_SECRET") || "";

async function getValidMercadoLibreToken(supabase: any, sellerId?: string, fetchFn: typeof fetch = fetch) {
  let query = supabase.from('ml_seller_accounts').select('*');
  if (sellerId) {
    query = query.eq('seller_id', sellerId);
  } else {
    query = query.is('vendor_id', null);
  }
  let { data } = await query.maybeSingle();
  
  if (!data && !sellerId) {
     // If not found, check if there is any account at all (fallback for safety)
     const { data: fallbackData } = await supabase.from('ml_seller_accounts').select('*').limit(1).maybeSingle();
     data = fallbackData;
  }
  
  if (!data) return null;
  
  let currentAccessToken = data.access_token;
  let currentRefreshToken = data.refresh_token;
  let currentExpiresAt = data.expires_at;
  
  // 1. Check if token expired and refresh if necessary
  if (currentExpiresAt && new Date(currentExpiresAt) <= new Date()) {
    // Token expired, refresh
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: ML_CLIENT_ID,
      client_secret: ML_CLIENT_SECRET,
      refresh_token: currentRefreshToken
    });
    const res = await fetchFn("https://api.mercadolibre.com/oauth/token", {
       method: "POST",
       headers: { "Content-Type": "application/x-www-form-urlencoded" },
       body: params.toString()
    });
    if (res.ok) {
       const mlData = await res.json();
       const expiresAt = new Date(Date.now() + (mlData.expires_in * 1000)).toISOString();
       currentAccessToken = mlData.access_token;
       currentRefreshToken = mlData.refresh_token || currentRefreshToken;
       currentExpiresAt = expiresAt;
       
       await supabase.from('ml_seller_accounts').update({
           access_token: currentAccessToken,
           refresh_token: currentRefreshToken,
           expires_at: currentExpiresAt,
           updated_at: new Date().toISOString()
       }).eq('id', data.id);
    } else {
       throw new Error("Mercado Libre token refresh failed. Por favor reconecta la cuenta.");
    }
  }
  
  // 2. SELF-HEALING: If seller_id starts with 'PLATFORM_MIGRATED_'
  if (data.seller_id && data.seller_id.startsWith('PLATFORM_MIGRATED_')) {
    console.log(`[Self-Healing] Migrated account detected with ID ${data.seller_id}. Fetching profile from ML...`);
    const meRes = await fetchFn("https://api.mercadolibre.com/users/me", {
      headers: { "Authorization": `Bearer ${currentAccessToken}` }
    });
    if (meRes.ok) {
      const meData = await meRes.json();
      const realSellerId = meData.id.toString();
      const realNickname = meData.nickname;
      
      console.log(`[Self-Healing] Found real seller_id: ${realSellerId}, nickname: ${realNickname}. Updating...`);
      
      // Update with real seller_id and nickname
      const { error: updateErr } = await supabase.from('ml_seller_accounts').update({
          seller_id: realSellerId,
          nickname: realNickname,
          updated_at: new Date().toISOString()
      }).eq('id', data.id);
      
      if (updateErr) {
        console.error("[Self-Healing] Error updating seller_id:", updateErr.message);
      }
    } else {
      console.error("[Self-Healing] Failed to query /users/me from MeLi:", meRes.status);
    }
  }
  
  return currentAccessToken;
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

   if (item.seller_custom_field) { sku = item.seller_custom_field; source = 'seller_custom_field'; }
   else if (variation?.seller_custom_field) { sku = variation.seller_custom_field; source = 'seller_custom_field_var'; }
   else if (getFromAttr(item.attributes, 'SELLER_SKU')) { sku = getFromAttr(item.attributes, 'SELLER_SKU'); source = 'seller_sku'; }
   else if (getFromAttr(item.attributes, 'SKU')) { sku = getFromAttr(item.attributes, 'SKU'); source = 'sku'; }
   else if (item.inventory_id) { sku = item.inventory_id; source = 'inventory_id'; }
   else if (variation?.inventory_id) { sku = variation.inventory_id; source = 'inventory_id_var'; }

   if (!sku) {
       sku = item.id; 
       source = 'ml_item_id_fallback';
   }
   return { sku, source, generated_sku: sku };
}

function cleanTitle(title: string): string {
  let t = title;
  const spamWords = [
    /envío gratis/gi, /envio gratis/gi, /nuevo/gi, /garantía/gi, /garantia/gi,
    /original/gi, /meli/gi, /mercado libre/gi, /mercadolibre/gi, /cuotas/gi,
    /impecable/gi, /caja/gi, /oferta/gi, /exclusivo/gi, /descuento/gi
  ];
  for (const regex of spamWords) {
    t = t.replace(regex, "");
  }
  // Remove emojis and special characters
  t = t.replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g, '');
  t = t.replace(/[!¡?¿*\"#]/g, "");
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

async function suggestInternalCategory(supabase: any, cleanTitleText: string) {
  const t = cleanTitleText.toLowerCase();
  const { data: rules } = await supabase
    .from('category_keyword_rules')
    .select('category_id, keyword, priority');

  let bestCategoryId = null;
  let highestPriority = -1;

  if (rules) {
    for (const r of rules) {
      const kw = r.keyword.toLowerCase();
      if (t.includes(kw) && r.priority > highestPriority) {
        bestCategoryId = r.category_id;
        highestPriority = r.priority;
      }
    }
  }
  return bestCategoryId;
}

function detectUniverseAndLine(cleanTitleText: string) {
  const t = cleanTitleText.toLowerCase();
  let universe = null;
  let line = null;

  // Universe keywords
  if (t.includes("marvel") || t.includes("avengers") || t.includes("spiderman") || t.includes("iron man") || t.includes("thor")) {
    universe = "Marvel";
  } else if (t.includes("dc comics") || t.includes("batman") || t.includes("superman") || t.includes("joker") || t.includes("justice league")) {
    universe = "DC Comics";
  } else if (t.includes("star wars") || t.includes("darth vader") || t.includes("mandalorian") || t.includes("jedi")) {
    universe = "Star Wars";
  } else if (t.includes("harry potter") || t.includes("hogwarts") || t.includes("gryffindor")) {
    universe = "Harry Potter";
  } else if (t.includes("pokemon") || t.includes("pikachu") || t.includes("charizard")) {
    universe = "Pokémon";
  } else if (t.includes("dragon ball") || t.includes("goku") || t.includes("vegeta")) {
    universe = "Dragon Ball";
  } else if (t.includes("anime") || t.includes("naruto") || t.includes("one piece")) {
    universe = "Anime";
  }

  // Line keywords
  if (t.includes("funko") || t.includes("pop!")) {
    line = "Funko POP";
  } else if (t.includes("marvel legends")) {
    line = "Marvel Legends";
  } else if (t.includes("black series")) {
    line = "Black Series";
  } else if (t.includes("mcfarlane")) {
    line = "McFarlane";
  } else if (t.includes("die cast") || t.includes("diecast") || t.includes("1:64")) {
    line = "Die-Cast";
  } else if (t.includes("vintage")) {
    line = "Vintage";
  }

  return { universe, line };
}

async function downloadAndUploadImageToSupabase(supabase: any, imageUrl: string, filename: string, fetchFn: typeof fetch = fetch, vendorId?: string | null): Promise<string | null> {
  try {
    const bucket = vendorId ? 'public-assets' : 'product-images';
    const folderPath = vendorId ? `vendors/${vendorId}/ml-curation` : 'ml-curation';
    const storagePath = `${folderPath}/${filename}`;

    // 1. Basic deduplication: Check if file already exists in Supabase storage
    const { data: listData } = await supabase.storage
      .from(bucket)
      .list(folderPath, {
        limit: 1,
        search: filename
      });

    if (listData && listData.length > 0) {
      console.log(`[Image Download] Image ${filename} already exists in storage. Reusing...`);
      const { data: { publicUrl } } = supabase.storage
        .from(bucket)
        .getPublicUrl(storagePath);
      return publicUrl;
    }

    // 2. Timeout protection: 8 seconds timeout using AbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const res = await fetchFn(imageUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) throw new Error(`HTTP error fetching image from ML: ${res.status}`);
    
    const contentType = res.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) {
      throw new Error(`Invalid image content-type: ${contentType}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    if (bytes.length === 0) {
      throw new Error("Downloaded image payload is empty");
    }

    // 3. Upload to bucket
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(storagePath, bytes.buffer, {
        contentType,
        upsert: true
      });

    if (error) {
      console.error("[Image Download] Failed to upload to Supabase storage:", error.message);
      return null;
    }

    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(storagePath);

    return publicUrl;
  } catch (err: any) {
    console.error("[Image Download] Error downloading/uploading image:", err.message);
    return null;
  }
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  // Create supabase client inside the handler to avoid cold-start issues
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const bypassSecret = Deno.env.get('TEST_BYPASS_SECRET');
  const isTestBypass = bypassSecret && req.headers.get('x-test-bypass') === bypassSecret;

  // Mock data for sandbox testing
  const mockItem1 = {
    id: "MLU615456398",
    seller_id: 63700367,
    title: "Harry Potter! Llaveros Plush - Cedric Diggory Amarillo",
    price: 536.00,
    currency_id: "UYU",
    available_quantity: 3,
    permalink: "https://articulo.mercadolibre.com.uy/MLU-615456398-harry-potter-llaveros-plush-cedric-diggory",
    thumbnail: "https://http2.mlstatic.com/D_NQ_NP_908865-MLU72648792019_112023-O.webp",
    pictures: [{ secure_url: "https://http2.mlstatic.com/D_NQ_NP_908865-MLU72648792019_112023-O.webp", url: "https://http2.mlstatic.com/D_NQ_NP_908865-MLU72648792019_112023-O.webp" }],
    attributes: [
      { id: "BRAND", value_name: "Funko" },
      { id: "SELLER_SKU", value_name: "4895205606166" }
    ],
    category_id: "MLU1051"
  };

  const mockItem2 = {
    id: "MLU615456399",
    seller_id: 63700367,
    title: "Harry Potter Llaveros Plush Cedric Amarillo - Oferta Especial",
    price: 550.00,
    currency_id: "UYU",
    available_quantity: 10,
    permalink: "https://articulo.mercadolibre.com.uy/MLU-615456399-harry-potter-llaveros-plush-cedric-amarillo",
    thumbnail: "https://http2.mlstatic.com/D_NQ_NP_908865-MLU72648792019_112023-O.webp",
    pictures: [{ secure_url: "https://http2.mlstatic.com/D_NQ_NP_908865-MLU72648792019_112023-O.webp", url: "https://http2.mlstatic.com/D_NQ_NP_908865-MLU72648792019_112023-O.webp" }],
    attributes: [
      { id: "BRAND", value_name: "Funko" },
      { id: "SELLER_SKU", value_name: "4895205606166" }
    ],
    category_id: "MLU1052"
  };

  const mockItem3 = {
    id: "MLU999999999",
    seller_id: 63700367,
    title: "Peluche Bob Esponja Glow Pals - Patricio Estrella",
    price: 600.00,
    currency_id: "UYU",
    available_quantity: 5,
    permalink: "https://articulo.mercadolibre.com.uy/MLU-999999999-peluche-bob-esponja-glow-pals-patricio-estrella",
    thumbnail: "https://http2.mlstatic.com/D_NQ_NP_908865-MLU72648792019_112023-O.webp",
    pictures: [{ secure_url: "https://http2.mlstatic.com/D_NQ_NP_908865-MLU72648792019_112023-O.webp", url: "https://http2.mlstatic.com/D_NQ_NP_908865-MLU72648792019_112023-O.webp" }],
    attributes: [
      { id: "BRAND", value_name: "Glow Pals" },
      { id: "SELLER_SKU", value_name: "PK-PLUSH-02" }
    ],
    category_id: "MLU1111"
  };

  const mockItem4 = {
    id: "MLU123456789",
    seller_id: 63700367,
    title: "Beyblade Takara Tomy Metal Fusion Pegasus L-Drago",
    price: 1800.00,
    currency_id: "UYU",
    available_quantity: 10,
    permalink: "https://articulo.mercadolibre.com.uy/MLU-123456789-beyblade-takara-tomy",
    thumbnail: "https://http2.mlstatic.com/D_NQ_NP_908865-MLU72648792019_112023-O.webp",
    pictures: [{ secure_url: "https://http2.mlstatic.com/D_NQ_NP_908865-MLU72648792019_112023-O.webp", url: "https://http2.mlstatic.com/D_NQ_NP_908865-MLU72648792019_112023-O.webp" }],
    attributes: [
      { id: "BRAND", value_name: "Takara Tomy" },
      { id: "SELLER_SKU", value_name: "BEY-MOCK-99" }
    ],
    category_id: "MLU3333"
  };

  const mockItem5 = {
    id: "MLU777777777",
    seller_id: 63700367,
    title: "Funko POP Star Wars Darth Vader Vintage",
    price: 1450.00,
    currency_id: "UYU",
    available_quantity: 8,
    permalink: "https://articulo.mercadolibre.com.uy/MLU-777777777-funko-pop-star-wars-darth-vader",
    thumbnail: "https://http2.mlstatic.com/D_NQ_NP_908865-MLU72648792019_112023-O.webp",
    pictures: [{ secure_url: "https://http2.mlstatic.com/D_NQ_NP_908865-MLU72648792019_112023-O.webp", url: "https://http2.mlstatic.com/D_NQ_NP_908865-MLU72648792019_112023-O.webp" }],
    attributes: [
      { id: "BRAND", value_name: "Funko" },
      { id: "SELLER_SKU", value_name: "FK-VADER-99" }
    ],
    category_id: "MLU94c4"
  };

  const customFetch = async (url: string, init?: any) => {
    if (isTestBypass) {
      console.log(`[Mock Fetch] Intercepting URL: ${url}`);
      if (url.includes("http2.mlstatic.com")) {
        const base64Gif = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
        const binaryGif = atob(base64Gif);
        const bytes = new Uint8Array(binaryGif.length);
        for (let i = 0; i < binaryGif.length; i++) {
          bytes[i] = binaryGif.charCodeAt(i);
        }
        return new Response(bytes.buffer, {
          status: 200,
          headers: { "Content-Type": "image/gif" }
        });
      }
      const parsedUrl = new URL(url);
      const path = parsedUrl.pathname;
      
      if (path === "/users/me") {
        return new Response(JSON.stringify({ id: 63700367, nickname: "Platform Store (Migrated)" }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      if (path.startsWith("/users/63700367/items/search")) {
        return new Response(JSON.stringify({ results: ["MLU615456398", "MLU615456399", "MLU999999999", "MLU123456789", "MLU777777777"], paging: { total: 5 } }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      if (path === "/items") {
        const idsParam = parsedUrl.searchParams.get("ids") || "";
        const ids = idsParam.split(",");
        const bodies = ids.map(id => {
          if (id === "MLU615456398") return { code: 200, body: mockItem1 };
          if (id === "MLU615456399") return { code: 200, body: mockItem2 };
          if (id === "MLU999999999") return { code: 200, body: mockItem3 };
          if (id === "MLU123456789") return { code: 200, body: mockItem4 };
          if (id === "MLU777777777") return { code: 200, body: mockItem5 };
          return { code: 404, body: null };
        });
        return new Response(JSON.stringify(bodies), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      if (path.startsWith("/items/")) {
        const parts = path.split("/");
        const id = parts[2];
        const isDesc = parts[3] === "description";
        
        if (isDesc) {
          let descText = "Mock description";
          if (id === "MLU615456398") descText = "Harry Potter! Llaveros Plush - Cedric Diggory Amarillo Description";
          else if (id === "MLU615456399") descText = "Harry Potter Llaveros Plush Cedric Amarillo - Oferta Especial Description";
          else if (id === "MLU999999999") descText = "Peluche de Patricio Estrella de Bob Esponja Description";
          else if (id === "MLU123456789") descText = "Beyblade Takara Tomy Metal Fusion Pegasus L-Drago Description";
          else if (id === "MLU777777777") descText = "Funko POP Star Wars Darth Vader Vintage Figure Description";
          return new Response(JSON.stringify({ plain_text: descText }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        } else {
          if (id === "MLU615456398") return new Response(JSON.stringify(mockItem1), { status: 200, headers: { "Content-Type": "application/json" } });
          if (id === "MLU615456399") return new Response(JSON.stringify(mockItem2), { status: 200, headers: { "Content-Type": "application/json" } });
          if (id === "MLU999999999") return new Response(JSON.stringify(mockItem3), { status: 200, headers: { "Content-Type": "application/json" } });
          if (id === "MLU123456789") return new Response(JSON.stringify(mockItem4), { status: 200, headers: { "Content-Type": "application/json" } });
          if (id === "MLU777777777") return new Response(JSON.stringify(mockItem5), { status: 200, headers: { "Content-Type": "application/json" } });
          return new Response(JSON.stringify({ message: "Item not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
        }
      }
      if (path.startsWith("/categories/")) {
        return new Response(JSON.stringify({ name: "Juguetes", path_from_root: [{ name: "Juegos y Juguetes" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
    }
    
    let attempts = 0;
    const maxAttempts = 3;
    let delay = 1000;
    while (attempts < maxAttempts) {
      try {
        const res = await fetch(url, init);
        if (res.status === 429) {
          console.warn(`[ML API 429] Rate limit hit on ${url}. Retrying in ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
          attempts++;
          delay *= 2;
          continue;
        }
        return res;
      } catch (err: any) {
        if (attempts === maxAttempts - 1) throw err;
        console.warn(`[ML API Error] Fetch failed on ${url}: ${err.message}. Retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        attempts++;
        delay *= 2;
      }
    }
    return fetch(url, init);
  };

  try {
    const bypassSecret = Deno.env.get('TEST_BYPASS_SECRET');
    const isTestBypassReq = bypassSecret && req.headers.get('x-test-bypass') === bypassSecret;
    const isServiceRole = req.headers.get('Authorization')?.replace('Bearer ', '') === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    let user = null;
    let profile = null;
    let targetSellerId = null;
    let targetVendorId = null;

    if (isTestBypassReq || isServiceRole) {
      user = { id: isServiceRole ? 'service_role' : 'test_bypass' };
      profile = { id: user.id, is_admin: true, is_vendor: false };
    } else {
      user = await verifyAuth(req);
      const { data: p } = await supabase.from('profiles').select('id, is_admin, is_vendor').eq('id', user.id).single();
      profile = p || { id: null, is_admin: false, is_vendor: false };
    }

    if (!profile?.is_admin && !profile?.is_vendor) {
      throw new Error("Acceso denegado: Se requiere cuenta de Admin o Vendor.");
    }

    const body = await req.json();
    const action = body.action;
    const incomingIds = body.product_ids || [];
    const product_ids = incomingIds.length > 0 ? incomingIds : (body.ml_item_ids || []);
    const status = body.status || 'active';
    const sort = body.sort || 'relevance';
    let limit = body.limit || 20;

    targetSellerId = body.seller_id;

    if (profile?.is_vendor && !profile?.is_admin) {
      targetVendorId = user.id;
      const { data: vendorAcc } = await supabase.from('ml_seller_accounts').select('seller_id').eq('vendor_id', user.id).maybeSingle();
      if (!vendorAcc) throw new Error("No tienes una cuenta de Mercado Libre conectada.");
      targetSellerId = vendorAcc.seller_id; // FORCED isolation
    } else {
      targetVendorId = body.vendor_id || null;
    }

    let mlToken = body.auth_token;
    if (!mlToken && action !== 'process_sync_queue' && action !== 'process_incoming_events') {
      mlToken = await getValidMercadoLibreToken(supabase, targetSellerId, fetch);
    }
    if (!mlToken && action !== 'process_sync_queue' && action !== 'process_incoming_events') {
      return new Response(
        JSON.stringify({ success: false, error: "Mercado Libre no está conectado. Ve a la sección de configuración para conectar tu cuenta." }),
        { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }, status: 200 }
      );
    }

    const headers = { 'Authorization': `Bearer ${mlToken}`, 'Content-Type': 'application/json' };

    // Fetch all existing seller IDs from ml_seller_accounts to avoid foreign key violations
    const { data: allSellers } = await supabase.from('ml_seller_accounts').select('seller_id');
    const existingSellerIds = new Set((allSellers || []).map((s: any) => s.seller_id));

    // Helper to get safe seller ID or null
    const getSafeSellerId = (sid: string | number | null | undefined): string | null => {
      if (!sid) return null;
      const sStr = sid.toString();
      return existingSellerIds.has(sStr) ? sStr : null;
    };

    // ═══ Shared: search ML item IDs ═══
    async function searchMLItemIds() {
        const userRes = await customFetch('https://api.mercadolibre.com/users/me', { headers });
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
                const url = `https://api.mercadolibre.com/users/${userData.id}/items/search?search_type=scan&limit=100${scrollId ? `&scroll_id=${scrollId}` : ''}${statusParam ? `&status=${statusParam}` : ''}`;
                const searchRes = await customFetch(url, { headers });
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
            const searchUrl = `https://api.mercadolibre.com/users/${userData.id}/items/search?limit=${firstBatch}&offset=0${statusParam ? `&status=${statusParam}` : ''}&sort=${sort}`;
            const searchRes = await customFetch(searchUrl, { headers });
            const searchData = await searchRes.json();
            
            if (!searchRes.ok) throw new Error(searchData.message || 'Error en búsqueda inicial');
 
            allIds = searchData.results || [];
            totalItems = searchData.paging?.total || 0;
            const finalMaxLimit = Math.min(totalItems, maxLimit);
            
            if (allIds.length < finalMaxLimit) {
                const searchUrls = [];
                for (let offset = allIds.length; offset < finalMaxLimit; offset += 50) {
                    const bSize = Math.min(50, finalMaxLimit - offset);
                    const url = `https://api.mercadolibre.com/users/${userData.id}/items/search?limit=${bSize}&offset=${offset}${statusParam ? `&status=${statusParam}` : ''}&sort=${sort}`;
                    searchUrls.push(url);
                }
                for (let i = 0; i < searchUrls.length; i += 5) {
                    const batch = searchUrls.slice(i, i + 5);
                    const results = await Promise.all(batch.map(u => customFetch(u, { headers }).then(r => r.json()).catch(() => ({}))));
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
                  const detailsRes = await customFetch(`https://api.mercadolibre.com/items?ids=${chunk.join(',')}`, { headers });
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
            const catRes = await customFetch(`https://api.mercadolibre.com/categories/${catId}`);
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

    // ═══ ACTION: GET SHIPPING ONBOARDING ═══
    if (action === 'get_shipping_onboarding') {
        let meData: any = {};
        let preferences: any = {};

        if (isTestBypass) {
          const isPlatformSeller = targetSellerId === '63700367' || !targetSellerId;
          const isExternalVendor = targetVendorId !== null && targetVendorId !== 'service_role' && targetVendorId !== 'test_bypass';

          if (isPlatformSeller && !isExternalVendor) {
            meData = {
              address: {
                address: "Vázquez 1418",
                city: "Montevideo",
                state: "Montevideo"
              }
            };
            preferences = {
              local_pick_up: true,
              mode: "me2",
              logistic_type: "drop_off",
              tags: ["flex", "mercado_envios"]
            };
          } else {
            meData = {
              address: {
                address: "Av. Italia 3210",
                city: "Montevideo",
                state: "Montevideo"
              }
            };
            preferences = {
              local_pick_up: true,
              mode: "me2",
              logistic_type: "drop_off",
              tags: ["flex"]
            };
          }
        } else {
          try {
            const meRes = await customFetch(`https://api.mercadolibre.com/users/me`, { headers });
            if (meRes.ok) {
              meData = await meRes.json();
            } else {
              const fallbackRes = await customFetch(`https://api.mercadolibre.com/users/${targetSellerId}`, { headers });
              if (fallbackRes.ok) meData = await fallbackRes.json();
            }
          } catch (e: any) {
            console.error("Error fetching user data from ML:", e.message);
          }

          try {
            const prefRes = await customFetch(`https://api.mercadolibre.com/users/${targetSellerId}/shipping_preferences`, { headers });
            if (prefRes.ok) {
              preferences = await prefRes.json();
            }
          } catch (e: any) {
            console.error("Error fetching shipping preferences from ML:", e.message);
          }
        }

        const address = meData.address?.address || null;
        const city = meData.address?.city || null;
        const location = city ? `${city}, Uruguay` : (meData.address?.state || null);
        let pickup = preferences.local_pick_up || false;
        let shippingMode = preferences.mode || null;
        let logisticType = preferences.logistic_type || null;
        let shippingTags = preferences.tags || [];

        // Fallback: analyze shipping of imported publications by majority
        if (!shippingMode && targetSellerId) {
          try {
            const { data: rawItems } = await supabase
              .from('ml_raw_items')
              .select('raw_payload')
              .eq('seller_id', targetSellerId)
              .limit(50);
            
            if (rawItems && rawItems.length > 0) {
              const modeCounts: Record<string, number> = {};
              const logisticCounts: Record<string, number> = {};
              let localPickUpTrueCount = 0;
              const tagCounts: Record<string, number> = {};

              rawItems.forEach(it => {
                const payload = it.raw_payload || {};
                const ship = payload.shipping || {};
                
                const m = ship.mode;
                if (m) modeCounts[m] = (modeCounts[m] || 0) + 1;

                const l = ship.logistic_type;
                if (l) logisticCounts[l] = (logisticCounts[l] || 0) + 1;

                if (ship.local_pick_up === true) localPickUpTrueCount++;

                const tags = ship.tags || [];
                tags.forEach((t: string) => {
                  tagCounts[t] = (tagCounts[t] || 0) + 1;
                });
              });

              // Detect majority mode
              let maxMode = null;
              let maxModeCount = 0;
              for (const [m, c] of Object.entries(modeCounts)) {
                if (c > maxModeCount) {
                  maxMode = m;
                  maxModeCount = c;
                }
              }
              if (maxMode) shippingMode = maxMode;

              // Detect majority logistic type
              let maxLogistic = null;
              let maxLogisticCount = 0;
              for (const [l, c] of Object.entries(logisticCounts)) {
                if (c > maxLogisticCount) {
                  maxLogistic = l;
                  maxLogisticCount = c;
                }
              }
              if (maxLogistic) logisticType = maxLogistic;

              // Detect majority local pick up
              if (localPickUpTrueCount > rawItems.length / 2) {
                pickup = true;
              }

              // Detect tags that appear in at least 20% of items
              const threshold = rawItems.length * 0.20;
              const activeTags: string[] = [];
              for (const [t, c] of Object.entries(tagCounts)) {
                if (c >= threshold) {
                  activeTags.push(t);
                }
              }
              shippingTags = activeTags;
            }
          } catch (e: any) {
            console.error("Error running majority logistics fallback analysis:", e.message);
          }
        }

        return new Response(
          JSON.stringify({
            success: true,
            pickup,
            shippingMode,
            logisticType,
            location,
            shippingTags,
            address: address ? `${address}${city ? `, ${city}` : ''}` : null
          }),
          { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
        );
    }

    // ═══ ACTION: CREATE IMPORT JOB (Fast Job Queue) ═══
    if (action === 'create_import_job') {
        // 1. Avoid duplicate jobs
        const { data: existingJob, error: existingJobErr } = await supabase
          .from('ml_import_jobs')
          .select('id, status')
          .eq('vendor_id', targetVendorId)
          .in('status', ['fetching_ids', 'pending', 'running', 'paused'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingJobErr) {
          throw new Error(`Failed to check existing jobs: ${existingJobErr.message}`);
        }

        if (existingJob) {
          return new Response(
            JSON.stringify({ 
              success: true, 
              job_id: existingJob.id, 
              already_running: true, 
              status: existingJob.status 
            }),
            { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
          );
        }

        // 2. Insert Job Tracker in 'fetching_ids' state
        const { data: job, error: jobErr } = await supabase
          .from('ml_import_jobs')
          .insert({
            vendor_id: targetVendorId,
            seller_id: targetSellerId,
            status: 'fetching_ids',
            total_items: 0,
            processed_items: 0,
            imported_items: 0,
            skipped_items: 0,
            error_items: 0,
            started_at: new Date().toISOString()
          })
          .select()
          .single();

        if (jobErr) {
          throw new Error(`Failed to create import job: ${jobErr.message}`);
        }

        try {
          // 3. Fetch IDs using scan/scroll or standard search
          const { allIds, totalItems } = await searchMLItemIds();
          
          // 4. Insert Job Items in bulk chunks
          if (allIds.length > 0) {
            const jobItems = allIds.map(mlId => ({
              job_id: job.id,
              vendor_id: targetVendorId,
              ml_item_id: mlId,
              status: 'pending',
              attempts: 0
            }));
            
            const bulkChunkSize = 500;
            for (let offset = 0; offset < jobItems.length; offset += bulkChunkSize) {
              const chunk = jobItems.slice(offset, offset + bulkChunkSize);
              const { error: bulkErr } = await supabase
                .from('ml_import_job_items')
                .insert(chunk);
              if (bulkErr) {
                throw new Error(`Failed to create job items: ${bulkErr.message}`);
              }
            }
          }

          // 5. Update Job status to 'pending' and set total_items
          const { error: updateErr } = await supabase
            .from('ml_import_jobs')
            .update({
              status: 'pending',
              total_items: allIds.length,
              updated_at: new Date().toISOString()
            })
            .eq('id', job.id);

          if (updateErr) throw updateErr;

          return new Response(
            JSON.stringify({ success: true, job_id: job.id, total_items: allIds.length }),
            { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
          );

        } catch (fetchErr: any) {
          // 6. Fail gracefully: status = failed, last_error = detail
          await supabase
            .from('ml_import_jobs')
            .update({
              status: 'failed',
              last_error: fetchErr.message || String(fetchErr),
              completed_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', job.id);

          return new Response(
            JSON.stringify({ 
              success: false, 
              error: fetchErr.message || 'Error fetching Mercado Libre IDs', 
              job_id: job.id 
            }),
            { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }, status: 500 }
          );
        }
    }

    // ═══ ACTION: LIST ITEM IDS (Phase 1 — new frontend, just returns IDs) ═══
    if (action === 'list_item_ids') {
        const { allIds, totalItems } = await searchMLItemIds();
        return new Response(
          JSON.stringify({ success: true, item_ids: allIds, total: totalItems }),
          { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
        );
    }

    // ═══ ACTION: LIST ITEMS (full pipeline — backward compat for old frontend) ═══
    if (action === 'list_items') {
        const { allIds, totalItems } = await searchMLItemIds();
        if (!allIds.length) {
          return new Response(
            JSON.stringify({ success: true, items: [], total: 0 }),
            { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
          );
        }
        const enrichedItems = await fetchItemDetails(allIds);
        return new Response(
          JSON.stringify({ success: true, items: enrichedItems, total: totalItems }),
          { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
        );
    }

    // ═══ ACTION: GET ITEM DETAILS (Phase 2 — takes specific IDs, returns enriched details) ═══
    if (action === 'get_item_details') {
        const mlIds: string[] = body.ml_ids || [];
        if (!mlIds.length) {
          return new Response(
            JSON.stringify({ success: true, items: [] }),
            { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
          );
        }
        const enrichedItems = await fetchItemDetails(mlIds);
        return new Response(
          JSON.stringify({ success: true, items: enrichedItems }),
          { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
        );
    }

    // ═══ ACTION: IMPORT ═══
    if (action === 'import') {
        if (!product_ids.length) {
          return new Response(
            JSON.stringify({ success: false, error: "No hay productos seleccionados para importar" }),
            { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }, status: 200 }
          );
        }
        
        const results: any[] = [];
        for (const mlId of product_ids) {
            let itemFetched = null;
            try {
                // 1. Fetch ML Item
                let res = await customFetch(`https://api.mercadolibre.com/items/${mlId}`, { headers });
                if (res.status === 401) {
                  console.log(`[Staging Ingest] Auth failed for item ${mlId}, falling back to public fetch...`);
                  res = await customFetch(`https://api.mercadolibre.com/items/${mlId}`);
                }
                const item = await res.json();
                itemFetched = item;
                
                if (!res.ok) {
                  results.push({ ml_id: mlId, status: "error", error: item.message || "No se pudo obtener el item de ML" });
                  continue;
                }
                
                // 2. Fetch Description
                let description = item.title;
                try {
                  let descRes = await customFetch(`https://api.mercadolibre.com/items/${mlId}/description`, { headers });
                  if (descRes.status === 401) {
                    descRes = await customFetch(`https://api.mercadolibre.com/items/${mlId}/description`);
                  }
                  if (descRes.ok) {
                    const descData = await descRes.json();
                    description = descData.plain_text || item.title;
                  }
                } catch(_e) { /* description fallback */ }

                // 3. Extract original details
                const { sku: sellerSku } = extractRealSkuFromML(item);
                const catalogProductId = item.catalog_product_id || null;
                const sellerId = (item.seller_id || "").toString();
                const titleOriginal = item.title;
                const price = Number(item.price || 0);
                const stock = Number(item.available_quantity || 0);
                const permalink = item.permalink;
                const thumbnail = (item.pictures?.[0]?.secure_url || item.pictures?.[0]?.url || item.thumbnail || "").replace('http://', 'https://');

                // 4. Run Normalizer
                const cleanTitleText = cleanTitle(titleOriginal);
                
                // Detect Brand from attributes or cleanTitleText
                let brandId = null;
                let brandName = item.attributes?.find((a: any) => a.id === 'BRAND')?.value_name || null;
                if (brandName) {
                   // Search for an existing brand (case insensitive check)
                   const { data: existingBrands } = await supabase
                     .from('brands')
                     .select('id, status, owner_vendor_id')
                     .ilike('name', brandName.trim());
                   
                   const approvedBrand = existingBrands?.find((b: any) => b.status === 'approved');
                   const vendorPendingBrand = targetVendorId ? existingBrands?.find((b: any) => b.status === 'pending_review' && b.owner_vendor_id === targetVendorId) : null;
                   
                   if (approvedBrand) {
                      brandId = approvedBrand.id;
                   } else if (vendorPendingBrand) {
                      brandId = vendorPendingBrand.id;
                   } else {
                      // Create a new brand proposal (pending review if created by vendor)
                      const slugBrandBase = brandName.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');
                      const slugBrand = targetVendorId ? `${slugBrandBase}-v${targetVendorId.substring(0, 4)}` : slugBrandBase;
                      const { data: newBr, error: newBrErr } = await supabase
                        .from('brands')
                        .insert({
                          name: brandName.trim(),
                          slug: slugBrand,
                          owner_vendor_id: targetVendorId || null,
                          status: targetVendorId ? 'pending_review' : 'approved',
                          is_active: targetVendorId ? false : true,
                          is_public: targetVendorId ? false : true,
                          source: targetVendorId ? 'vendor_import' : 'manual'
                        })
                        .select()
                        .single();
                      
                      if (newBrErr) {
                         console.error("Error creating brand during import:", newBrErr.message);
                      } else if (newBr) {
                         brandId = newBr.id;
                      }
                   }
                } else {
                   // Title search fallback for brand
                   // We only match against approved brands
                   const { data: allBrands } = await supabase
                     .from('brands')
                     .select('id, name')
                     .eq('status', 'approved');
                   if (allBrands) {
                     const lowerCleanTitle = cleanTitleText.toLowerCase();
                     const matchedBrand = allBrands.find((b: any) => lowerCleanTitle.includes(b.name.toLowerCase()));
                     if (matchedBrand) {
                       brandId = matchedBrand.id;
                       brandName = matchedBrand.name;
                     }
                   }
                }

                // Detect suggested internal category
                const suggestedInternalCategoryId = await suggestInternalCategory(supabase, cleanTitleText);
                
                // Detect Universe and Line
                const { universe, line } = detectUniverseAndLine(cleanTitleText);

                // 5. Store / Upsert in ml_raw_items Zone
                const rawPayloadObj = {
                   ...item,
                   description,
                   normalized_metadata: {
                     clean_title: cleanTitleText,
                     brand_name: brandName,
                     brand_id: brandId,
                     suggested_category_id: suggestedInternalCategoryId,
                     detected_universe: universe,
                     detected_line: line,
                     extracted_seller_sku: sellerSku
                   }
                };

                const safeSellerId = getSafeSellerId(sellerId);

                const { data: rawRecord, error: rawErr } = await supabase
                  .from('ml_raw_items')
                  .upsert({
                     seller_id: safeSellerId,
                     ml_item_id: mlId,
                     catalog_product_id: catalogProductId,
                     title: titleOriginal,
                     price: price,
                     currency_id: item.currency_id || 'UYU',
                     available_quantity: stock,
                     permalink: permalink,
                     thumbnail: thumbnail,
                     raw_payload: rawPayloadObj,
                     status: 'analyzing',
                     updated_at: new Date().toISOString()
                  }, { onConflict: 'ml_item_id' })
                  .select()
                  .single();

                if (rawErr) {
                   throw new Error(`Failed to save raw item: ${rawErr.message}`);
                }

                const rawItemId = rawRecord.id;

                // Delete existing matches for this raw item first
                await supabase
                  .from('ml_import_matches')
                  .delete()
                  .eq('raw_item_id', rawItemId);

                // 6. Matching Engine
                const matchesToInsert = [];

                // Level 1: SKU Match
                if (sellerSku) {
                  const { data: skuMatches } = await supabase
                    .from('product_variants')
                    .select('product_id')
                    .eq('sku', sellerSku);
                  if (skuMatches && skuMatches.length > 0) {
                     for (const m of skuMatches) {
                       matchesToInsert.push({
                         raw_item_id: rawItemId,
                         matched_product_id: m.product_id,
                         match_type: 'sku',
                         confidence_score: 0.95,
                         is_strong: true
                       });
                     }
                  }
                }

                // Level 2: GTIN Match
                const gtinAttr = item.attributes?.find((a: any) => ['GTIN', 'EAN', 'UPC'].includes(a.id))?.value_name;
                if (gtinAttr) {
                  const { data: gtinMatches } = await supabase
                    .from('product_variants')
                    .select('product_id')
                    .eq('sku', gtinAttr);
                  if (gtinMatches && gtinMatches.length > 0) {
                     for (const m of gtinMatches) {
                       if (!matchesToInsert.some(x => x.matched_product_id === m.product_id)) {
                         matchesToInsert.push({
                           raw_item_id: rawItemId,
                           matched_product_id: m.product_id,
                           match_type: 'gtin',
                           confidence_score: 0.90,
                           is_strong: true
                         });
                       }
                     }
                  }
                }

                // Level 3: catalog_product_id Match
                if (catalogProductId) {
                  const { data: catMatches } = await supabase
                    .from('products')
                    .select('id')
                    .contains('metadata', { catalog_product_id: catalogProductId });
                  if (catMatches && catMatches.length > 0) {
                     for (const m of catMatches) {
                       if (!matchesToInsert.some(x => x.matched_product_id === m.id)) {
                         matchesToInsert.push({
                           raw_item_id: rawItemId,
                           matched_product_id: m.id,
                           match_type: 'catalog_id',
                           confidence_score: 1.00,
                           is_strong: true
                         });
                       }
                     }
                  }
                }

                // Level 4: Trigram Similarity matching
                const { data: trgmMatches, error: trgmErr } = await supabase.rpc('match_products_by_title', {
                   title_query: cleanTitleText,
                   similarity_threshold: 0.3
                });

                if (!trgmErr && trgmMatches) {
                   for (const m of trgmMatches) {
                      if (!matchesToInsert.some(x => x.matched_product_id === m.id)) {
                         const confidence = Number(m.similarity.toFixed(2));
                         matchesToInsert.push({
                            raw_item_id: rawItemId,
                            matched_product_id: m.id,
                            match_type: 'title_similarity',
                            confidence_score: confidence,
                            is_strong: confidence >= 0.80
                         });
                      }
                   }
                }

                // Insert matches if found
                if (matchesToInsert.length > 0) {
                   await supabase.from('ml_import_matches').insert(matchesToInsert);
                }

                // 7. Update status based on matches
                const finalStatus = matchesToInsert.length > 0 ? 'review_needed' : 'pending';
                await supabase
                  .from('ml_raw_items')
                  .update({ status: finalStatus, updated_at: new Date().toISOString() })
                  .eq('id', rawItemId);

                // 8. Log success audit in ml_import_logs
                await supabase.from('ml_import_logs').insert({
                   seller_id: safeSellerId,
                   action: 'staging_import',
                   status: 'success',
                   details: {
                     ml_item_id: mlId,
                     raw_item_id: rawItemId,
                     clean_title: cleanTitleText,
                     match_count: matchesToInsert.length,
                     final_status: finalStatus,
                     brand_detected: brandName,
                     category_suggested_id: suggestedInternalCategoryId
                   }
                });

                const mlStatus = item.status || 'active';
                const stockQty = Number(item.available_quantity || 0);
                
                let itemCategory = "importado";
                let itemReason = "active";
                
                if (mlStatus === 'closed' || mlStatus === 'deleted') {
                  itemCategory = "no_elegible";
                  itemReason = mlStatus;
                } else if (stockQty === 0) {
                  itemCategory = "omitido";
                  itemReason = "out_of_stock";
                } else if (mlStatus === 'paused') {
                  itemCategory = "omitido";
                  itemReason = "paused";
                }

                results.push({
                   ml_id: mlId,
                   status: "success",
                   category: itemCategory,
                   reason: itemReason,
                   raw_item_id: rawItemId,
                   matches_found: matchesToInsert.length,
                   classification: finalStatus
                });

            } catch (e: any) {
              console.error(`Fallo importar ML ${mlId} a staging:`, e.message);
              // Log error in ml_import_logs
              try {
                const logSellerId = getSafeSellerId(itemFetched?.seller_id);
                await supabase.from('ml_import_logs').insert({
                   seller_id: logSellerId,
                   action: 'staging_import',
                   status: 'error',
                   details: {
                     ml_item_id: mlId,
                     error: e.message
                   }
                });
              } catch (_e) { /* ignore */ }
              
              results.push({
                 ml_id: mlId,
                 status: "error",
                 category: "error",
                 reason: "network_error",
                 error: e.message
              });
            }
        }

        return new Response(
          JSON.stringify({ success: true, results }),
          { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
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
                const mlRes = await customFetch('https://api.mercadolibre.com/items', {
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
        return new Response(JSON.stringify({ success: true, results, count: results.filter(r => r.status === 'success').length }), { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
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

                 const mlRes = await customFetch(`https://api.mercadolibre.com/items/${p.ml_item_id}`, { method: 'PUT', headers, body: JSON.stringify(payload) });
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
        return new Response(JSON.stringify({ success: true, results, count: results.filter(r => r.status === 'success').length }), { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
    }

    // ═══ ACTION: PROCESS SYNC QUEUE ═══
    if (action === 'process_sync_queue') {
        const { data: queueItems, error: qErr } = await supabase
          .from('ml_sync_queue')
          .select('*')
          .in('status', ['pending', 'failed'])
          .lt('retry_count', 3)
          .order('created_at', { ascending: true })
          .limit(10);

        if (qErr) {
          throw new Error(`Failed to query sync queue: ${qErr.message}`);
        }

        // Backlog check and alert
        const { count: backlogCount, error: cntErr } = await supabase
          .from('ml_sync_queue')
          .select('*', { count: 'exact', head: true })
          .in('status', ['pending', 'failed'])
          .lt('retry_count', 3);

        if (!cntErr && backlogCount && backlogCount > 50) {
          try {
            const { sendAlert } = await import("../_shared/alerts.ts");
            await sendAlert(supabase, {
              alertType: "sync_queue_backlog",
              severity: "warning",
              message: `Sync queue backlog has exceeded 50 items. Current backlog: ${backlogCount}`,
              details: { backlog_count: backlogCount }
            });
          } catch (e: any) {
            console.error("Alert trigger failed in process_sync_queue backlog check:", e.message);
          }
        }

        const results = [];

        for (const item of (queueItems || [])) {
          // Move item to processing status immediately
          const { error: updErr } = await supabase
            .from('ml_sync_queue')
            .update({ status: 'processing', last_error: null })
            .eq('id', item.id);

          if (updErr) {
             console.error(`[Sync Worker] Failed to set status to processing for item ${item.id}:`, updErr.message);
             continue;
          }

          try {
             // 1. Get valid token for the seller
             const token = await getValidMercadoLibreToken(supabase, item.seller_id, fetch);
             if (!token) {
                throw new Error(`Could not retrieve valid token for seller_id: ${item.seller_id}`);
             }

             // 2. Fetch the current local inventory count and price adjustment
             const { data: variant, error: vErr } = await supabase
               .from('product_variants')
               .select('inventory_count, price_adjustment')
               .eq('id', item.variant_id)
               .maybeSingle();

             if (vErr) throw new Error(`Database error fetching variant ${item.variant_id}: ${vErr.message}`);
             if (!variant) throw new Error(`Variant ${item.variant_id} not found in database`);

             // 3. Determine sync settings from ml_catalog_links (if exists)
             let syncStock = true;
             let syncPrice = false;

             const { data: link } = await supabase
               .from('ml_catalog_links')
               .select('sync_stock, sync_price')
               .eq('variant_id', item.variant_id)
               .eq('ml_item_id', item.ml_item_id)
               .maybeSingle();

             if (link) {
               syncStock = link.sync_stock;
               syncPrice = link.sync_price;
             }

             // 4. Construct payload for ML API
             const payload: any = {};
             if (syncStock) {
               let currentInvCount = variant.inventory_count;
               // Priority 1: vendor specific inventory count from queue payload
               if (item.payload && typeof item.payload.inventory_count === 'number') {
                 currentInvCount = item.payload.inventory_count;
               }
               
               payload.available_quantity = Math.max(0, currentInvCount);
               payload.status = currentInvCount <= 0 ? 'paused' : 'active';
             }

             if (syncPrice) {
               const { data: product } = await supabase
                 .from('products')
                 .select('base_price')
                 .eq('id', item.product_id)
                 .maybeSingle();

               if (product) {
                 let price = product.base_price;
                 const { data: settingsData } = await supabase
                   .from('site_settings')
                   .select('*')
                   .in('key', ['ml_price_rules_enabled', 'ml_price_markup_type', 'ml_price_markup_value']);

                 const rulesEnabled = settingsData?.find((d: any) => d.key === 'ml_price_rules_enabled')?.value !== 'false';
                 const markupType = settingsData?.find((d: any) => d.key === 'ml_price_markup_type')?.value || 'percentage';
                 const markupValue = Number(settingsData?.find((d: any) => d.key === 'ml_price_markup_value')?.value || '10');

                 if (rulesEnabled && price > 0) {
                     if (markupType === 'percentage') price = price * (1 + markupValue / 100);
                     else if (markupType === 'discount_percentage') price = price * (1 - markupValue / 100);
                     else if (markupType === 'fixed') price += markupValue;
                 }
                 price += Number(variant.price_adjustment || 0);
                 if (price > 0) {
                   payload.price = Math.max(1, Math.round(price));
                 }
               }
             }

             // Only call ML if there is something to sync
             if (Object.keys(payload).length > 0) {
                 const mlHeaders = {
                   'Authorization': `Bearer ${token}`,
                   'Content-Type': 'application/json'
                 };

                 const mlRes = await fetch(`https://api.mercadolibre.com/items/${item.ml_item_id}`, {
                   method: 'PUT',
                   headers: mlHeaders,
                   body: JSON.stringify(payload)
                 });

                 const mlData = await mlRes.json();

                 if (!mlRes.ok) {
                   const errMsg = mlData.message || JSON.stringify(mlData);
                   throw new Error(`ML API Error (HTTP ${mlRes.status}): ${errMsg}`);
                 }
             }

             // Mark as completed
             await supabase
               .from('ml_sync_queue')
               .update({
                  status: 'completed',
                  processed_at: new Date().toISOString(),
                  retry_count: item.retry_count + 1
               })
               .eq('id', item.id);

             // Log to ml_import_logs
             const logSellerId = getSafeSellerId(item.seller_id);
             await supabase.from('ml_import_logs').insert({
                 seller_id: logSellerId,
                 action: 'sync_stock_saliente',
                 status: 'success',
                 details: {
                   queue_item_id: item.id,
                   ml_item_id: item.ml_item_id,
                   variant_id: item.variant_id,
                   payload_sent: payload,
                   processed_at: new Date().toISOString()
                 }
             });

             // Update last sync status in catalog link (if exists)
             if (link) {
               await supabase
                 .from('ml_catalog_links')
                 .update({
                   last_sync_status: 'synced',
                   last_sync_error: null,
                   last_synced_at: new Date().toISOString()
                 })
                 .eq('variant_id', item.variant_id)
                 .eq('ml_item_id', item.ml_item_id);
             }

             results.push({ id: item.id, status: 'completed' });

          } catch (err: any) {
             const nextRetry = item.retry_count + 1;
             const isDeadLetter = nextRetry >= 3;
             const finalStatus = isDeadLetter ? 'dead_letter' : 'failed';

             console.error(`[Sync Worker] Error processing item ${item.id}:`, err.message);

             await supabase
               .from('ml_sync_queue')
               .update({
                  status: finalStatus,
                  retry_count: nextRetry,
                  last_error: err.message,
                  processed_at: new Date().toISOString()
               })
               .eq('id', item.id);

             // Log error to ml_import_logs
             const logSellerId = getSafeSellerId(item.seller_id);
             await supabase.from('ml_import_logs').insert({
                 seller_id: logSellerId,
                 action: 'sync_stock_saliente',
                 status: 'error',
                 details: {
                   queue_item_id: item.id,
                   ml_item_id: item.ml_item_id,
                   variant_id: item.variant_id,
                   error: err.message,
                   retry_count: nextRetry,
                   final_status: finalStatus
                 }
             });

             // Update last sync status in catalog link (if exists)
             try {
               await supabase
                 .from('ml_catalog_links')
                 .update({
                   last_sync_status: 'failed',
                   last_sync_error: err.message,
                   last_synced_at: new Date().toISOString()
                 })
                 .eq('variant_id', item.variant_id)
                 .eq('ml_item_id', item.ml_item_id);
             } catch (_e) { /* ignore link update error */ }

             results.push({ id: item.id, status: finalStatus, error: err.message });
          }
        }

        return new Response(
          JSON.stringify({ success: true, processed: results.length, results }),
          { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
        );
    }

    // ═══ ACTION: CURATE LINK ═══
    if (action === 'curate_link') {
        const { raw_item_id, product_id, variant_id } = body;
        if (!raw_item_id || !product_id) {
          throw new Error("Missing raw_item_id or product_id");
        }

        const { data: rawItem, error: rawItemErr } = await supabase
          .from('ml_raw_items')
          .select('*')
          .eq('id', raw_item_id)
          .single();

        if (rawItemErr || !rawItem) {
          throw new Error(`Raw item not found: ${rawItemErr?.message || ''}`);
        }
        
        if (profile?.is_vendor && !profile?.is_admin && String(rawItem.seller_id) !== String(targetSellerId)) {
           throw new Error("Acceso denegado sobre este ítem.");
        }

        let vendorId = null;
        if (profile?.is_vendor && !profile?.is_admin) {
          vendorId = profile.id;
        } else {
          const { data: sellerAcc } = await supabase
            .from('ml_seller_accounts')
            .select('vendor_id')
            .eq('seller_id', rawItem.seller_id)
            .maybeSingle();
          vendorId = sellerAcc?.vendor_id || null;
        }

        let targetVariantId = variant_id;
        if (!targetVariantId) {
          const { data: firstVariant } = await supabase
            .from('product_variants')
            .select('id')
            .eq('product_id', product_id)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();

          if (!firstVariant) {
            const { data: newVar, error: newVarErr } = await supabase
              .from('product_variants')
              .insert({
                product_id: product_id,
                name: 'Estándar',
                sku: `COL-ML-${rawItem.ml_item_id}`,
                inventory_count: rawItem.available_quantity,
                price_adjustment: 0.00
              })
              .select()
              .single();
            if (newVarErr) throw new Error(`Failed to create default variant: ${newVarErr.message}`);
            targetVariantId = newVar.id;
          } else {
            targetVariantId = firstVariant.id;
          }
        }

        let vendorProd;
        let vpQuery = supabase.from('vendor_products').select('*');
        if (vendorId === null) {
          vpQuery = vpQuery.is('vendor_id', null);
        } else {
          vpQuery = vpQuery.eq('vendor_id', vendorId);
        }
        const { data: existingVP } = await vpQuery.eq('product_id', product_id).maybeSingle();

        if (existingVP) {
          const { data: updatedVP, error: vpErr } = await supabase
            .from('vendor_products')
            .update({
              price: rawItem.price,
              status: 'active',
              updated_at: new Date().toISOString()
            })
            .eq('id', existingVP.id)
            .select()
            .single();
          if (vpErr) throw new Error(`Failed to update vendor product: ${vpErr.message}`);
          vendorProd = updatedVP;
        } else {
          const { data: insertedVP, error: vpErr } = await supabase
            .from('vendor_products')
            .insert({
              vendor_id: vendorId,
              product_id: product_id,
              price: rawItem.price,
              status: 'active'
            })
            .select()
            .single();
          if (vpErr) throw new Error(`Failed to create vendor product: ${vpErr.message}`);
          vendorProd = insertedVP;
        }

        const { data: vendorVar, error: vvErr } = await supabase
          .from('vendor_product_variants')
          .upsert({
            vendor_product_id: vendorProd.id,
            variant_id: targetVariantId,
            inventory_count: rawItem.available_quantity,
            price_adjustment: 0.00,
            sku_vendedor: rawItem.raw_payload?.normalized_metadata?.extracted_seller_sku || null
          }, { onConflict: 'vendor_product_id,variant_id' })
          .select()
          .single();

        if (vvErr) throw new Error(`Failed to create vendor product variant: ${vvErr.message}`);

        const { error: linkErr } = await supabase
          .from('ml_catalog_links')
          .upsert({
            product_id: product_id,
            variant_id: targetVariantId,
            ml_item_id: rawItem.ml_item_id,
            seller_id: rawItem.seller_id,
            vendor_product_id: vendorProd.id,
            vendor_product_variant_id: vendorVar.id,
            sync_stock: true,
            sync_price: true,
            last_sync_status: 'synced',
            last_synced_at: new Date().toISOString()
          }, { onConflict: 'ml_item_id' });

        if (linkErr) throw new Error(`Failed to create ML catalog link: ${linkErr.message}`);

        await supabase
          .from('ml_raw_items')
          .update({ status: 'approved', updated_at: new Date().toISOString() })
          .eq('id', raw_item_id);

        const requesterUser = isTestBypass 
          ? { id: 'test_bypass', email: 'test_bypass@supabase.local' } 
          : (await supabase.auth.getUser(req.headers.get('Authorization')?.replace('Bearer ', '') || '')).data.user;

        await supabase.from('ml_import_logs').insert({
          seller_id: getSafeSellerId(rawItem.seller_id),
          action: 'curate_link',
          status: 'success',
          details: {
            raw_item_id,
            product_id,
            variant_id: targetVariantId,
            user_id: requesterUser?.id || null,
            user_email: requesterUser?.email || null,
            timestamp: new Date().toISOString()
          }
        });

        return new Response(
          JSON.stringify({ success: true, message: "Item successfully linked", product_id, vendor_product_id: vendorProd.id }),
          { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
        );
    }

    // ═══ ACTION: CURATE CREATE ═══
    if (action === 'curate_create') {
        const { raw_item_id, title, description, price, stock, category_id, universe, brand_id, line, selected_image } = body;
        if (!raw_item_id || !title || !category_id) {
          throw new Error("Missing raw_item_id, title or category_id");
        }

        const { data: rawItem, error: rawItemErr } = await supabase
          .from('ml_raw_items')
          .select('*')
          .eq('id', raw_item_id)
          .single();

        if (rawItemErr || !rawItem) {
          throw new Error(`Raw item not found: ${rawItemErr?.message || ''}`);
        }
        
        if (profile?.is_vendor && !profile?.is_admin && String(rawItem.seller_id) !== String(targetSellerId)) {
           throw new Error("Acceso denegado sobre este ítem.");
        }

        let vendorId = null;
        if (profile?.is_vendor && !profile?.is_admin) {
          vendorId = profile.id;
        } else {
          const { data: sellerAcc } = await supabase
            .from('ml_seller_accounts')
            .select('vendor_id')
            .eq('seller_id', rawItem.seller_id)
            .maybeSingle();
          vendorId = sellerAcc?.vendor_id || null;
        }

        const slugBase = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        const uniqueSlug = `${slugBase}-${Math.random().toString(36).substring(2, 7)}`;

        const metadata = {
          catalog_product_id: rawItem.catalog_product_id || null,
          universe: universe || null,
          line: line || null,
          source_platform: 'mercadolibre'
        };

        let finalCategoryId = category_id;
        // If it's a ML category (not a UUID), try to map it
        if (finalCategoryId && !finalCategoryId.includes('-')) {
          const { data: catMap } = await supabase.from('categories').select('id').eq('ml_category_id', finalCategoryId).maybeSingle();
          if (catMap) {
            finalCategoryId = catMap.id;
          } else {
            throw new Error(`No se encontró una categoría local mapeada para ${finalCategoryId}. Por favor asígnala manualmente.`);
          }
        }

        // Check if brand is pending review
        let isBrandPending = false;
        const resolvedBrandId = brand_id || rawItem.raw_payload?.normalized_metadata?.brand_id || null;
        if (resolvedBrandId) {
          const { data: brandData } = await supabase.from('brands').select('status').eq('id', resolvedBrandId).maybeSingle();
          if (brandData?.status === 'pending_review') {
            isBrandPending = true;
          }
        }

        // Check if category is pending review
        let isCategoryPending = false;
        if (finalCategoryId) {
          const { data: catData } = await supabase.from('categories').select('status').eq('id', finalCategoryId).maybeSingle();
          if (catData?.status === 'pending_review') {
            isCategoryPending = true;
          }
        }

        const initialProductStatus = (isBrandPending || isCategoryPending) ? 'pending_taxonomy_review' : 'published';
        const initialIsActive = (isBrandPending || isCategoryPending) ? false : true;

        const { data: newProd, error: prodErr } = await supabase
          .from('products')
          .insert({
            vendor_id: vendorId,
            title,
            description: description || title,
            slug: uniqueSlug,
            base_price: price || 0,
            category_id: finalCategoryId,
            brand_id: resolvedBrandId,
            status: initialProductStatus, // set to pending_taxonomy_review if any taxonomy is pending
            is_active: initialIsActive,
            metadata
          })
          .select()
          .single();

        if (prodErr) throw new Error(`Failed to create master product: ${prodErr.message}`);

        // Handle image insertion
        const mainImgUrl = selected_image || rawItem.thumbnail || '';
        if (mainImgUrl) {
          // Download and upload only the main image to Supabase Storage
          const fileExtension = mainImgUrl.split('.').pop()?.split('?')[0] || 'jpg';
          const filename = `${newProd.id}-main.${fileExtension}`;
          
          console.log(`[Curation] Downloading main image for product ${newProd.id}...`);
          const storageUrl = await downloadAndUploadImageToSupabase(supabase, mainImgUrl, filename, customFetch, vendorId);
          const finalMainImgUrl = storageUrl || mainImgUrl.replace('http://', 'https://');

          const { error: mainImgErr } = await supabase
            .from('product_images')
            .insert({
              product_id: newProd.id,
              url: finalMainImgUrl,
              is_primary: true,
              sort_order: 0
            });
          if (mainImgErr) throw new Error(`Failed to insert main image: ${mainImgErr.message}`);

          const pictures = rawItem.raw_payload?.pictures || [];
          const otherImages = pictures
            .map((p: any) => p.secure_url || p.url)
            .filter((url: string) => url && url.replace('http://', 'https://') !== mainImgUrl.replace('http://', 'https://'));

          if (otherImages.length > 0) {
            const imageRecords = otherImages.slice(0, 9).map((url: string, index: number) => ({
              product_id: newProd.id,
              url: url.replace('http://', 'https://'),
              is_primary: false,
              sort_order: index + 1
            }));
            const { error: otherImgErr } = await supabase.from('product_images').insert(imageRecords);
            if (otherImgErr) throw new Error(`Failed to insert other images: ${otherImgErr.message}`);
          }
        }

        // Category link in junction table
        await supabase.from('product_categories').insert({
          product_id: newProd.id,
          category_id: finalCategoryId
        });

        // Extract SKU robustly
        const extractedSku = extractRealSkuFromML(rawItem.raw_payload || {}).sku;

        // Create standard variant
        const { data: newVar, error: varErr } = await supabase
          .from('product_variants')
          .insert({
            product_id: newProd.id,
            name: 'Estándar',
            sku: extractedSku || `COL-ML-${rawItem.ml_item_id}`,
            inventory_count: stock || 0,
            price_adjustment: 0.00
          })
          .select()
          .single();

        if (varErr) throw new Error(`Failed to create variant: ${varErr.message}`);

        // Create vendor product offer
        const { data: vendorProd, error: vpErr } = await supabase
          .from('vendor_products')
          .insert({
            vendor_id: vendorId,
            product_id: newProd.id,
            price: price || 0,
            status: 'active' // Auto activate for vendors when publishing
          })
          .select()
          .single();

        if (vpErr) throw new Error(`Failed to create vendor product: ${vpErr.message}`);

        // Create vendor product variant stock
        const { data: vendorVar, error: vvErr } = await supabase
          .from('vendor_product_variants')
          .insert({
            vendor_product_id: vendorProd.id,
            variant_id: newVar.id,
            inventory_count: stock || 0,
            price_adjustment: 0.00,
            sku_vendedor: extractedSku
          })
          .select()
          .single();

        if (vvErr) throw new Error(`Failed to create vendor variant: ${vvErr.message}`);

        // Create ML Catalog link
        const { error: linkErr } = await supabase
          .from('ml_catalog_links')
          .insert({
            product_id: newProd.id,
            variant_id: newVar.id,
            ml_item_id: rawItem.ml_item_id,
            seller_id: rawItem.seller_id,
            vendor_product_id: vendorProd.id,
            vendor_product_variant_id: vendorVar.id,
            sync_stock: true,
            sync_price: false,
            last_sync_status: 'synced',
            last_synced_at: new Date().toISOString()
          });

        if (linkErr) throw new Error(`Failed to create ML catalog link: ${linkErr.message}`);

        await supabase
          .from('ml_raw_items')
          .update({ status: 'approved', updated_at: new Date().toISOString() })
          .eq('id', raw_item_id);

        const requesterUser = isTestBypass 
          ? { id: 'test_bypass', email: 'test_bypass@supabase.local' } 
          : (await supabase.auth.getUser(req.headers.get('Authorization')?.replace('Bearer ', '') || '')).data.user;

        await supabase.from('ml_import_logs').insert({
          seller_id: getSafeSellerId(rawItem.seller_id),
          action: 'curate_create',
          status: 'success',
          details: {
            raw_item_id,
            product_id: newProd.id,
            variant_id: newVar.id,
            user_id: requesterUser?.id || null,
            user_email: requesterUser?.email || null,
            timestamp: new Date().toISOString()
          }
        });

        return new Response(
          JSON.stringify({ success: true, message: "Product successfully created and linked", product_id: newProd.id }),
          { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
        );
    }

    // ═══ ACTION: CURATE IGNORE ═══
    if (action === 'curate_ignore') {
        const { raw_item_id } = body;
        if (!raw_item_id) throw new Error("Missing raw_item_id");

        const { data: rawItem } = await supabase
          .from('ml_raw_items')
          .select('seller_id')
          .eq('id', raw_item_id)
          .single();
          
        if (profile?.is_vendor && !profile?.is_admin && rawItem?.seller_id !== targetSellerId) {
           throw new Error("Acceso denegado sobre este ítem.");
        }

        await supabase
          .from('ml_raw_items')
          .update({ status: 'ignored', updated_at: new Date().toISOString() })
          .eq('id', raw_item_id);

        const requesterUser = isTestBypass 
          ? { id: 'test_bypass', email: 'test_bypass@supabase.local' } 
          : (await supabase.auth.getUser(req.headers.get('Authorization')?.replace('Bearer ', '') || '')).data.user;

        await supabase.from('ml_import_logs').insert({
          seller_id: getSafeSellerId(rawItem?.seller_id),
          action: 'curate_ignore',
          status: 'success',
          details: {
            raw_item_id,
            user_id: requesterUser?.id || null,
            user_email: requesterUser?.email || null,
            timestamp: new Date().toISOString()
          }
        });

        return new Response(
          JSON.stringify({ success: true, message: "Item ignored successfully" }),
          { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
        );
    }

    // ═══ ACTION: CURATE EDIT RAW ═══
    if (action === 'curate_edit_raw') {
        const { raw_item_id, title, suggested_category_id, brand_id, detected_universe, detected_line } = body;
        if (!raw_item_id || !title) throw new Error("Missing raw_item_id or title");

        const { data: rawItem, error: fetchErr } = await supabase
          .from('ml_raw_items')
          .select('*')
          .eq('id', raw_item_id)
          .single();

        if (fetchErr || !rawItem) throw new Error(`Raw item not found: ${fetchErr?.message || ''}`);
        
        if (profile?.is_vendor && !profile?.is_admin && String(rawItem.seller_id) !== String(targetSellerId)) {
           throw new Error("Acceso denegado sobre este ítem.");
        }

        const metadata = rawItem.raw_payload.normalized_metadata || {};
        metadata.clean_title = title;
        metadata.suggested_category_id = suggested_category_id || metadata.suggested_category_id;
        metadata.brand_id = brand_id || metadata.brand_id;
        metadata.detected_universe = detected_universe || metadata.detected_universe;
        metadata.detected_line = detected_line || metadata.detected_line;
        rawItem.raw_payload.normalized_metadata = metadata;

        await supabase
          .from('ml_raw_items')
          .update({
            title: title,
            raw_payload: rawItem.raw_payload,
            updated_at: new Date().toISOString()
          })
          .eq('id', raw_item_id);

        return new Response(
          JSON.stringify({ success: true, message: "Item updated successfully" }),
          { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
        );
    }

    // ═══ ACTION: CURATE BULK ═══
    if (action === 'curate_bulk') {
        const { raw_item_ids, bulk_action, category_id, universe, brand_id } = body;
        if (!raw_item_ids || !raw_item_ids.length || !bulk_action) {
          throw new Error("Missing raw_item_ids or bulk_action");
        }

        const results = [];
        const requesterUser = isTestBypass 
          ? { id: 'test_bypass', email: 'test_bypass@supabase.local' } 
          : (await supabase.auth.getUser(req.headers.get('Authorization')?.replace('Bearer ', '') || '')).data.user;

        for (const rawId of raw_item_ids) {
          try {
            const { data: rawItem } = await supabase
              .from('ml_raw_items')
              .select('*')
              .eq('id', rawId)
              .single();

            if (!rawItem) throw new Error("Item not found");
            
            if (profile?.is_vendor && !profile?.is_admin && String(rawItem.seller_id) !== String(targetSellerId)) {
               throw new Error("Acceso denegado sobre este ítem.");
            }

            if (bulk_action === 'ignore') {
              await supabase
                .from('ml_raw_items')
                .update({ status: 'ignored', updated_at: new Date().toISOString() })
                .eq('id', rawId);
              
              await supabase.from('ml_import_logs').insert({
                seller_id: getSafeSellerId(rawItem.seller_id),
                action: 'curate_ignore',
                status: 'success',
                details: {
                  raw_item_id: rawId,
                  user_id: requesterUser?.id || null,
                  user_email: requesterUser?.email || null,
                  timestamp: new Date().toISOString(),
                  bulk: true
                }
              });
              results.push({ id: rawId, status: 'success', action: 'ignored' });
            } 
            else if (bulk_action === 'assign_category') {
              if (!category_id) throw new Error("Missing category_id");
              const metadata = rawItem.raw_payload.normalized_metadata || {};
              metadata.suggested_category_id = category_id;
              rawItem.raw_payload.normalized_metadata = metadata;
              
              await supabase
                .from('ml_raw_items')
                .update({
                  raw_payload: rawItem.raw_payload,
                  updated_at: new Date().toISOString()
                })
                .eq('id', rawId);
              
              results.push({ id: rawId, status: 'success', action: 'assigned_category' });
            } 
            else if (bulk_action === 'assign_universe') {
              if (!universe) throw new Error("Missing universe");
              const metadata = rawItem.raw_payload.normalized_metadata || {};
              metadata.detected_universe = universe;
              rawItem.raw_payload.normalized_metadata = metadata;
              
              await supabase
                .from('ml_raw_items')
                .update({
                  raw_payload: rawItem.raw_payload,
                  updated_at: new Date().toISOString()
                })
                .eq('id', rawId);
              
              results.push({ id: rawId, status: 'success', action: 'assigned_universe' });
            }
            else if (bulk_action === 'assign_brand') {
              if (!brand_id) throw new Error("Missing brand_id");
              
              const { data: brand } = await supabase
                .from('brands')
                .select('name')
                .eq('id', brand_id)
                .single();
              
              const metadata = rawItem.raw_payload.normalized_metadata || {};
              metadata.brand_id = brand_id;
              if (brand) metadata.brand_name = brand.name;
              rawItem.raw_payload.normalized_metadata = metadata;
              
              await supabase
                .from('ml_raw_items')
                .update({
                  raw_payload: rawItem.raw_payload,
                  updated_at: new Date().toISOString()
                })
                .eq('id', rawId);
              
              results.push({ id: rawId, status: 'success', action: 'assigned_brand' });
            }
            else if (bulk_action === 'link_strong') {
              const { data: strongMatches, error: matchesErr } = await supabase
                .from('ml_import_matches')
                .select('*')
                .eq('raw_item_id', rawId)
                .eq('is_strong', true);
              
              if (matchesErr) throw matchesErr;
              if (!strongMatches || strongMatches.length === 0) {
                throw new Error("No strong match found for this item");
              }
              if (strongMatches.length > 1) {
                throw new Error("Multiple strong matches found, cannot auto-link safely");
              }
              
              const match = strongMatches[0];
              const product_id = match.matched_product_id;
              
              const { data: sellerAcc } = await supabase
                .from('ml_seller_accounts')
                .select('vendor_id')
                .eq('seller_id', rawItem.seller_id)
                .maybeSingle();
              const vendorId = sellerAcc?.vendor_id || null;
              
              const { data: firstVariant } = await supabase
                .from('product_variants')
                .select('id')
                .eq('product_id', product_id)
                .order('created_at', { ascending: true })
                .limit(1)
                .maybeSingle();
              
              let targetVariantId;
              if (!firstVariant) {
                const { data: newVar, error: newVarErr } = await supabase
                  .from('product_variants')
                  .insert({
                    product_id: product_id,
                    name: 'Estándar',
                    sku: `COL-ML-${rawItem.ml_item_id}`,
                    inventory_count: rawItem.available_quantity,
                    price_adjustment: 0.00
                  })
                  .select()
                  .single();
                if (newVarErr) throw new Error(`Failed to create default variant: ${newVarErr.message}`);
                targetVariantId = newVar.id;
              } else {
                targetVariantId = firstVariant.id;
              }
              
              let vendorProd;
              let vpQuery = supabase.from('vendor_products').select('*');
              if (vendorId === null) {
                vpQuery = vpQuery.is('vendor_id', null);
              } else {
                vpQuery = vpQuery.eq('vendor_id', vendorId);
              }
              const { data: existingVP } = await vpQuery.eq('product_id', product_id).maybeSingle();
              
              if (existingVP) {
                const { data: updatedVP, error: vpErr } = await supabase
                  .from('vendor_products')
                  .update({
                    price: rawItem.price,
                    status: 'active',
                    updated_at: new Date().toISOString()
                  })
                  .eq('id', existingVP.id)
                  .select()
                  .single();
                if (vpErr) throw new Error(`Failed to update vendor product: ${vpErr.message}`);
                vendorProd = updatedVP;
              } else {
                const { data: insertedVP, error: vpErr } = await supabase
                  .from('vendor_products')
                  .insert({
                    vendor_id: vendorId,
                    product_id: product_id,
                    price: rawItem.price,
                    status: 'active'
                  })
                  .select()
                  .single();
                if (vpErr) throw new Error(`Failed to create vendor product: ${vpErr.message}`);
                vendorProd = insertedVP;
              }
              
              const { data: vendorVar, error: vvErr } = await supabase
                .from('vendor_product_variants')
                .upsert({
                  vendor_product_id: vendorProd.id,
                  variant_id: targetVariantId,
                  inventory_count: rawItem.available_quantity,
                  price_adjustment: 0.00,
                  sku_vendedor: rawItem.raw_payload?.normalized_metadata?.extracted_seller_sku || null
                }, { onConflict: 'vendor_product_id,variant_id' })
                .select()
                .single();
              
              if (vvErr) throw new Error(`Failed to create vendor product variant: ${vvErr.message}`);
              
              await supabase
                .from('ml_catalog_links')
                .upsert({
                  product_id: product_id,
                  variant_id: targetVariantId,
                  ml_item_id: rawItem.ml_item_id,
                  seller_id: rawItem.seller_id,
                  vendor_product_id: vendorProd.id,
                  vendor_product_variant_id: vendorVar.id,
                  sync_stock: true,
                  sync_price: true,
                  last_sync_status: 'synced',
                  last_synced_at: new Date().toISOString()
                }, { onConflict: 'ml_item_id' });
              
              await supabase
                .from('ml_raw_items')
                .update({ status: 'approved', updated_at: new Date().toISOString() })
                .eq('id', rawId);
              
              await supabase.from('ml_import_logs').insert({
                seller_id: getSafeSellerId(rawItem.seller_id),
                action: 'curate_link',
                status: 'success',
                details: {
                  raw_item_id: rawId,
                  product_id,
                  variant_id: targetVariantId,
                  user_id: requesterUser?.id || null,
                  user_email: requesterUser?.email || null,
                  timestamp: new Date().toISOString(),
                  bulk: true
                }
              });
              
              results.push({ id: rawId, status: 'success', action: 'linked_strong', product_id });
            }
            else if (bulk_action === 'approve_new') {
              throw new Error("La creación en lote no está permitida todavía.");
            }
          } catch (e: any) {
            results.push({ id: rawId, status: 'error', error: e.message });
          }
        }
        
        return new Response(
          JSON.stringify({ success: true, results }),
          { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
        );
    }

    // ═══ ACTION: STOCK AUDIT ═══
    if (action === 'stock_audit') {
        const { data: links, error: linksErr } = await supabase
          .from('ml_catalog_links')
          .select('id, ml_item_id, seller_id, product_id, variant_id, vendor_product_id, vendor_product_variant_id');
        
        if (linksErr) throw linksErr;

        const report: any[] = [];
        let mismatchCount = 0;

        for (const link of (links || [])) {
          // Fetch master stock
          const { data: variant } = await supabase
            .from('product_variants')
            .select('inventory_count, sku')
            .eq('id', link.variant_id)
            .maybeSingle();

          // Fetch vendor variant stock
          let vendorStock = null;
          if (link.vendor_product_variant_id) {
            const { data: vVar } = await supabase
              .from('vendor_product_variants')
              .select('inventory_count')
              .eq('id', link.vendor_product_variant_id)
              .maybeSingle();
            vendorStock = vVar?.inventory_count;
          }

          // Fetch staging stock
          const { data: rawItem } = await supabase
            .from('ml_raw_items')
            .select('available_quantity')
            .eq('ml_item_id', link.ml_item_id)
            .maybeSingle();
          const stagingStock = rawItem?.available_quantity;

          const masterStock = variant?.inventory_count;
          const sku = variant?.sku;

          // Check for mismatch
          const isMismatch = (masterStock !== vendorStock) || (masterStock !== stagingStock);

          if (isMismatch) {
            mismatchCount++;
            report.push({
              link_id: link.id,
              ml_item_id: link.ml_item_id,
              seller_id: link.seller_id,
              sku: sku || 'N/A',
              master_stock: masterStock ?? 0,
              vendor_stock: vendorStock ?? 0,
              staging_stock: stagingStock ?? 0
            });
          }
        }

        // If there are mismatches, log a warning alert
        if (mismatchCount > 0) {
          try {
            const { sendAlert } = await import("../_shared/alerts.ts");
            await sendAlert(supabase, {
              alertType: "stock_mismatch",
              severity: "warning",
              message: `Stock reconciliation audit found ${mismatchCount} inconsistencies across catalog.`,
              details: { mismatch_count: mismatchCount, sample_mismatches: report.slice(0, 5) }
            });
          } catch (e: any) {
             console.error("Alert trigger failed in stock_audit:", e.message);
          }
        }

        return new Response(
          JSON.stringify({ success: true, mismatch_count: mismatchCount, report }),
          { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
        );
    }

    // ═══ ACTION: CHECK OAUTH TOKENS ═══
    if (action === 'check_oauth_tokens') {
        const { data: accounts, error: accErr } = await supabase
          .from('ml_seller_accounts')
          .select('id, seller_id, nickname, expires_at, vendor_id');

        if (accErr) throw accErr;

        let alertCount = 0;
        const now = new Date();
        const oneDayLater = new Date(Date.now() + 24 * 60 * 60 * 1000);

        for (const s of (accounts || [])) {
          if (!s.expires_at) continue;
          const expiry = new Date(s.expires_at);

          if (expiry <= now) {
            alertCount++;
            try {
              const { sendAlert } = await import("../_shared/alerts.ts");
              await sendAlert(supabase, {
                alertType: "oauth_expired",
                severity: "critical",
                message: `OAuth token for seller ${s.nickname || s.seller_id} has expired! Connection is disconnected.`,
                details: { seller_id: s.seller_id, expires_at: s.expires_at, nickname: s.nickname },
                sellerId: s.seller_id
              });
            } catch (e: any) {
              console.error("Alert trigger failed in check_oauth_tokens:", e.message);
            }
          } else if (expiry <= oneDayLater) {
            alertCount++;
            try {
              const { sendAlert } = await import("../_shared/alerts.ts");
              await sendAlert(supabase, {
                alertType: "oauth_expiring",
                severity: "warning",
                message: `OAuth token for seller ${s.nickname || s.seller_id} expires in less than 24 hours (Expires: ${expiry.toLocaleString()}).`,
                details: { seller_id: s.seller_id, expires_at: s.expires_at, nickname: s.nickname },
                sellerId: s.seller_id
              });
            } catch (e: any) {
              console.error("Alert trigger failed in check_oauth_tokens:", e.message);
            }
          }
        }

        return new Response(
          JSON.stringify({ success: true, checked_accounts: accounts?.length || 0, alerts_raised: alertCount }),
          { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
        );
    }

    // ═══ ACTION: MANUAL RECONCILE ═══
    if (action === 'manual_reconcile') {
        const { link_ids, target } = body;
        if (!link_ids || !link_ids.length) throw new Error("Missing link_ids");
        
        const results = [];
        for (const linkId of link_ids) {
          try {
            const { data: link } = await supabase
              .from('ml_catalog_links')
              .select('*')
              .eq('id', linkId)
              .maybeSingle();

            if (!link) throw new Error("Link not found");

            // Fetch master variant
            const { data: variant } = await supabase
              .from('product_variants')
              .select('inventory_count')
              .eq('id', link.variant_id)
              .maybeSingle();

            // Fetch raw item
            const { data: rawItem } = await supabase
              .from('ml_raw_items')
              .select('available_quantity')
              .eq('ml_item_id', link.ml_item_id)
              .maybeSingle();

            let targetStock = 0;
            if (target === 'ml_to_all') {
              targetStock = rawItem?.available_quantity ?? 0;
            } else {
              targetStock = variant?.inventory_count ?? 0;
            }

            // Align master stock
            await supabase
              .from('product_variants')
              .update({ inventory_count: targetStock, updated_at: new Date().toISOString() })
              .eq('id', link.variant_id);

            // Align vendor variant stock
            if (link.vendor_product_variant_id) {
              await supabase
                .from('vendor_product_variants')
                .update({ inventory_count: targetStock })
                .eq('id', link.vendor_product_variant_id);
            }

            // Align staging stock
            await supabase
              .from('ml_raw_items')
              .update({ available_quantity: targetStock, updated_at: new Date().toISOString() })
              .eq('ml_item_id', link.ml_item_id);

            // Add sync event to sync queue to propagate to Mercado Libre if configured
            const { data: sellerAcc } = await supabase
              .from('ml_seller_accounts')
              .select('seller_id')
              .eq('seller_id', link.seller_id)
              .maybeSingle();
            
            await supabase
              .from('ml_sync_queue')
              .insert({
                product_id: link.product_id,
                variant_id: link.variant_id,
                ml_item_id: link.ml_item_id,
                seller_id: sellerAcc?.seller_id || link.seller_id,
                action: "sync_stock",
                payload: { force_inventory: targetStock },
                status: "pending",
                retry_count: 0
              });

            results.push({ id: linkId, status: 'success', stock_aligned: targetStock });
          } catch (e: any) {
            results.push({ id: linkId, status: 'error', error: e.message });
          }
        }

        return new Response(
          JSON.stringify({ success: true, results }),
          { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
        );
    }

    return new Response(
      JSON.stringify({ success: false, error: "Action not recognized or not implemented" }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );

  } catch (e: any) {
    console.error("mercadolibre-sync error:", e);
    return new Response(
      JSON.stringify({ success: false, error: e.message }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }, status: 200 }
    );
  }
});


