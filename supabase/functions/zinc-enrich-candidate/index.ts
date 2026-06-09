import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders, handleOptions } from "../_shared/cors.ts";
import { verifyAdmin } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

serve(async (req) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  try {
    const user = await verifyAdmin(req);
    
    const ZINC_API_KEY = Deno.env.get("ZINC_API_KEY");
    if (!ZINC_API_KEY) {
      throw new Error("ZINC_API_KEY no configurada");
    }

    const { candidate_ids } = await req.json();

    if (!candidate_ids || !Array.isArray(candidate_ids) || candidate_ids.length === 0) {
      throw new Error("Faltan candidate_ids en el body");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: candidates, error: dbError } = await supabase
      .from('international_import_candidates')
      .select('*')
      .in('id', candidate_ids);

    if (dbError) throw dbError;
    if (!candidates || candidates.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No candidates found" }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }
      });
    }

    const updatedCandidates = [];

    // Process each candidate one by one to avoid rate limits (Zinc API)
    for (const c of candidates) {
      if (!c.external_product_id) continue;

      const zincUrl = `https://api.zinc.com/products/${c.external_product_id}?retailer=amazon`;
      const zincRes = await fetch(zincUrl, {
        headers: {
          'Authorization': `Bearer ${ZINC_API_KEY}`
        }
      });

      if (!zincRes.ok) {
        console.warn(`Falló enriquecimiento para ${c.external_product_id}: ${zincRes.statusText}`);
        continue;
      }

      const pDetails = await zincRes.json();
      
      let amazon_category = null;
      let amazon_subcategory = null;
      let amazon_category_path = null;

      if (pDetails.categories && Array.isArray(pDetails.categories) && pDetails.categories.length > 0) {
        // e.g. ["Toys & Games", "Action Figures & Statues", "Action Figures"]
        amazon_category = pDetails.categories[0] || null;
        amazon_subcategory = pDetails.categories[pDetails.categories.length - 1] || null;
        amazon_category_path = pDetails.categories.join(' > ');
      }

      const updateData = {
        amazon_category,
        amazon_subcategory,
        amazon_category_path,
        main_image_url_external: pDetails.main_image || c.main_image_url_external,
        image_urls_external: pDetails.images || [],
        video_urls_external: [], // Zinc doesn't reliably provide videos in standard plan, but we prepare the field
        raw_data: { ...c.raw_data, _enriched_details: pDetails }
      };

      const { error: updateError } = await supabase
        .from('international_import_candidates')
        .update(updateData)
        .eq('id', c.id);

      if (updateError) {
        console.error("Error actualizando candidate", updateError);
      } else {
        updatedCandidates.push({
          id: c.id,
          ...updateData
        });
      }
    }

    return new Response(
      JSON.stringify({ success: true, updated_count: updatedCandidates.length, updated: updatedCandidates }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("zinc-enrich-candidate error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
