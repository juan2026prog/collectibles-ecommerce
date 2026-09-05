import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders, handleOptions } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

interface SourcingMarketRequest {
  normalized_product_id?: string;
  title: string;
  brand?: string;
  character?: string;
  line?: string;
  upc?: string;
  gtin?: string;
  mpn?: string;
  collectibles_price_usd: number;
  force_refresh?: boolean;
}

serve(async (req: Request) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  const corsHeaders = getCorsHeaders(req);

  try {
    const body: SourcingMarketRequest = await req.json();
    const { 
      normalized_product_id = 'GENERIC',
      title, 
      brand = '', 
      character = '', 
      line = '', 
      upc = '', 
      gtin = '', 
      mpn = '', 
      collectibles_price_usd = 0,
      force_refresh = false 
    } = body;

    if (!title) {
      return new Response(JSON.stringify({
        error: "title es requerido para consultar Mercado Libre Uruguay"
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. CHEQUEO DE CACHE PERSISTENTE
    if (!force_refresh) {
      const { data: cached } = await supabase
        .from('sourcing_market_cache')
        .select('*')
        .eq('normalized_product_id', normalized_product_id)
        .eq('source', 'mercado_libre_uy')
        .gt('expires_at', new Date().toISOString())
        .order('checked_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cached && cached.payload) {
        return new Response(JSON.stringify({
          ...cached.payload,
          data_origin: 'CACHE',
          cached_at: cached.checked_at,
          expires_at: cached.expires_at
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // 2. CONSULTA EN VIVO A MERCADO LIBRE URUGUAY (sites/MLU/search)
    // Estrategia de búsqueda priorizada:
    // 1. GTIN / UPC / EAN
    // 2. MPN
    // 3. Marca + Personaje + Línea
    // 4. Título
    const queryPrimary = gtin || upc || mpn || ${brand} .trim() || title;
    const encodedQuery = encodeURIComponent(queryPrimary);
    const mluSearchUrl = https://api.mercadolibre.com/sites/MLU/search?q=&limit=20;

    let mluData: any = null;
    try {
      const mluRes = await fetch(mluSearchUrl, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'CollectiblesUY-SourcingBot/2.0'
        }
      });
      if (mluRes.ok) {
        mluData = await mluRes.json();
      }
    } catch (fetchErr) {
      console.error("MLU Live Search error:", fetchErr);
    }

    const results = (mluData && mluData.results) ? mluData.results : [];

    // Tasa de cambio de referencia UYU a USD (approx 42.0)
    const UYU_TO_USD = 1 / 42.0;

    // Normalizar datos de candidatos encontrados
    const candidateList = results.map((item: any) => {
      const priceUyu = item.currency_id === 'UYU' ? item.price : (item.price * 42.0);
      const priceUsd = item.currency_id === 'USD' ? item.price : Number((item.price * UYU_TO_USD).toFixed(2));
      return {
        id: item.id,
        title: item.title,
        price_usd: priceUsd,
        currency_id: item.currency_id,
        original_price: item.price,
        permalink: item.permalink,
        condition: item.condition,
        seller_id: item.seller?.id,
        available_quantity: item.available_quantity
      };
    });

    // 3. ALGORITMO DE MATCHING DE 5 NIVELES
    const titleLower = title.toLowerCase();
    const brandLower = brand.toLowerCase();
    const charLower = character.toLowerCase();
    const upcNorm = (upc || gtin || '').trim();

    const exactMatches: any[] = [];
    const similarMatches: any[] = [];

    for (const cand of candidateList) {
      const candTitle = cand.title.toLowerCase();
      let isExact = false;
      let isSimilar = false;

      // Nivel 1: GTIN / UPC / EAN exacto en título o atributos
      if (upcNorm && (candTitle.includes(upcNorm) || cand.id.includes(upcNorm))) {
        isExact = true;
      }
      // Nivel 2: Marca + Personaje específico + Línea o palabra clave definitoria
      else if (
        brandLower && 
        charLower && 
        candTitle.includes(brandLower) && 
        candTitle.includes(charLower)
      ) {
        // Verificar si contiene palabras clave del título original
        const titleTokens = titleLower.split(/\s+/).filter(t => t.length > 3 && !['figura', 'action', 'figure', 'toys', 'mcfarlane', 'hasbro'].includes(t));
        const matchedTokens = titleTokens.filter(tok => candTitle.includes(tok));
        
        if (matchedTokens.length >= 2 || titleTokens.length <= 1) {
          isExact = true;
        } else {
          isSimilar = true;
        }
      }
      // Nivel 3: Título normalizado con alta similitud
      else if (brandLower && candTitle.includes(brandLower)) {
        isSimilar = true;
      }

      if (isExact) {
        exactMatches.push(cand);
      } else if (isSimilar) {
        similarMatches.push(cand);
      }
    }

    // 4. DETERMINAR ESTADOS, CONFIDENCIA Y PRECIOS
    let matchType: 'EXACT_MATCH' | 'PROBABLE_MATCH' | 'SIMILAR_PRODUCT' | 'NOT_FOUND' | 'ERROR' = 'NOT_FOUND';
    let matchConfidence = 0;
    let minPrice: number | null = null;
    let avgPrice: number | null = null;
    let medianPrice: number | null = null;
    let maxPrice: number | null = null;
    let listingsCount = 0;
    let sellersCount = 0;
    let sampleTitle = '';
    let sampleUrl = '';

    const activeList = exactMatches.length > 0 ? exactMatches : (similarMatches.length > 0 ? similarMatches : []);

    if (exactMatches.length > 0) {
      matchType = 'EXACT_MATCH';
      matchConfidence = upcNorm ? 98 : 90;
    } else if (similarMatches.length > 0) {
      matchType = 'SIMILAR_PRODUCT';
      matchConfidence = 55;
    } else if (results.length === 0) {
      matchType = 'NOT_FOUND';
      matchConfidence = 0;
    }

    if (activeList.length > 0) {
      const prices = activeList.map(m => m.price_usd).sort((a, b) => a - b);
      minPrice = prices[0];
      maxPrice = prices[prices.length - 1];
      const sum = prices.reduce((acc, p) => acc + p, 0);
      avgPrice = Number((sum / prices.length).toFixed(2));
      medianPrice = prices[Math.floor(prices.length / 2)];
      listingsCount = activeList.length;
      
      const uniqueSellers = new Set(activeList.map(m => m.seller_id).filter(Boolean));
      sellersCount = uniqueSellers.size || listingsCount;

      sampleTitle = activeList[0].title;
      sampleUrl = activeList[0].permalink;
    }

    // 5. COMPARACIÓN DE PRECIOS REAL (SOLO SOBRE EXACT_MATCH)
    let differenceAmount: number | null = null;
    let differencePercent: number | null = null;
    let marketPosition: 'CHEAPER' | 'SIMILAR' | 'MORE_EXPENSIVE' | 'NO_EXACT_COMPETITION' = 'NO_EXACT_COMPETITION';
    let marketVerdict: 'MUCHO_MAS_BARATO' | 'COMPETITIVO' | 'PRECIO_SOBRE_MERCADO' | 'SIN_COMPETENCIA' | 'NO_DISPONIBLE' = 'NO_DISPONIBLE';

    if (matchType === 'EXACT_MATCH' && minPrice !== null && collectibles_price_usd > 0) {
      differenceAmount = Number((collectibles_price_usd - minPrice).toFixed(2));
      differencePercent = Number(((differenceAmount / minPrice) * 100).toFixed(1));

      if (differencePercent <= -10) {
        marketPosition = 'CHEAPER';
        marketVerdict = 'MUCHO_MAS_BARATO';
      } else if (differencePercent <= 5) {
        marketPosition = 'SIMILAR';
        marketVerdict = 'COMPETITIVO';
      } else {
        marketPosition = 'MORE_EXPENSIVE';
        marketVerdict = 'PRECIO_SOBRE_MERCADO';
      }
    } else if (matchType === 'SIMILAR_PRODUCT') {
      marketPosition = 'NO_EXACT_COMPETITION';
      marketVerdict = 'SIN_COMPETENCIA';
    } else {
      marketPosition = 'NO_EXACT_COMPETITION';
      marketVerdict = 'SIN_COMPETENCIA';
    }

    const payload = {
      source: "mercado_libre_uy" as const,
      status: matchType,
      match_type: matchType,
      match_confidence: matchConfidence,
      query: queryPrimary,
      data_origin: 'LIVE' as const,
      exact_match_found: matchType === 'EXACT_MATCH',
      min_price_usd: minPrice,
      avg_price_usd: avgPrice,
      median_price_usd: medianPrice,
      max_price_usd: maxPrice,
      total_listings: listingsCount,
      sellers_count: sellersCount,
      currency: "USD",
      sample_url: sampleUrl,
      sample_title: sampleTitle,
      difference_amount: differenceAmount,
      difference_percent: differencePercent,
      market_position: marketPosition,
      comparison_diff_usd: differenceAmount,
      comparison_diff_percent: differencePercent,
      market_verdict: marketVerdict,
      last_checked_at: new Date().toISOString(),
      exact_matches: exactMatches.slice(0, 5),
      similar_matches: similarMatches.slice(0, 5),
      store_references: [
        {
          store_name: "Mercado Libre Uruguay",
          domain: "mercadolibre.com.uy",
          price_usd: minPrice ?? 0,
          url: sampleUrl || "https://mercadolibre.com.uy",
          in_stock: listingsCount > 0
        }
      ]
    };

    // 6. GUARDAR EN CACHE Y EN HISTÓRICO PERSISTENTE
    try {
      const expiresAt = new Date(Date.now() + (12 * 60 * 60 * 1000)).toISOString();
      await supabase.from('sourcing_market_cache').upsert({
        normalized_product_id,
        source: 'mercado_libre_uy',
        query: queryPrimary,
        match_type: matchType,
        match_confidence: matchConfidence,
        payload,
        checked_at: payload.last_checked_at,
        expires_at: expiresAt
      });

      if (minPrice !== null) {
        await supabase.from('sourcing_market_history').insert({
          normalized_product_id,
          market_source: 'mercado_libre_uy',
          price: minPrice,
          currency: 'USD',
          availability: listingsCount > 0 ? 'in_stock' : 'out_of_stock',
          listing_count: listingsCount,
          raw_payload: { query: queryPrimary, match_type: matchType, sample_title: sampleTitle }
        });
      }
    } catch (dbErr) {
      console.warn("Error saving market intelligence cache/history:", dbErr);
    }

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err: any) {
    return new Response(JSON.stringify({
      error: err.message,
      source: "mercado_libre_uy",
      status: "ERROR",
      match_type: "ERROR",
      data_origin: "ERROR",
      market_verdict: "NO_DISPONIBLE"
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
