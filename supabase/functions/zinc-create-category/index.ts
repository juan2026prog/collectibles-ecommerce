import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders, handleOptions } from "../_shared/cors.ts";
import { verifyAdmin } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

function generateSlug(text: string) {
  return text
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, '-');
}

serve(async (req) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  try {
    await verifyAdmin(req);
    
    const { name, parent_id } = await req.json();

    if (!name) {
      throw new Error("El nombre de la categoría es requerido");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    let baseSlug = generateSlug(name);
    let slug = baseSlug;
    let counter = 1;

    // Ensure unique slug
    while (true) {
      const { data, error } = await supabase.from('categories').select('id').eq('slug', slug).maybeSingle();
      if (error) throw error;
      if (!data) break; // Slug is unique
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    const { data: category, error: insertError } = await supabase
      .from('categories')
      .insert({
        name,
        slug,
        parent_id: parent_id || null,
        is_active: true
      })
      .select()
      .single();

    if (insertError) throw insertError;

    return new Response(
      JSON.stringify({ success: true, category }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("zinc-create-category error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
