import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getOfficialSiteUrl, isBlockedLegacyHostname } from "../_shared/cors.ts";

serve(async () => {
  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    let domain = getOfficialSiteUrl();
    const envFrontend = Deno.env.get("FRONTEND_URL")?.trim();
    if (envFrontend) {
      try {
        const parsed = new URL(envFrontend);
        if (parsed.protocol === "https:" && !isBlockedLegacyHostname(parsed.hostname) && parsed.hostname !== "www.tudominio.com" && parsed.hostname !== "tudominio.com") {
          domain = parsed.origin;
        }
      } catch {
        domain = getOfficialSiteUrl();
      }
    }

    const { data: products } = await supabaseClient
      .from("products")
      .select("slug, updated_at")
      .eq("is_active", true)
      .eq("status", "published");

    const { data: categories } = await supabaseClient
      .from("categories")
      .select("slug");

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
    xml += `  <url>\n    <loc>${domain}/</loc>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n`;
    xml += `  <url>\n    <loc>${domain}/shop</loc>\n    <changefreq>daily</changefreq>\n    <priority>0.9</priority>\n  </url>\n`;

    if (categories) {
      categories.forEach((cat) => {
        xml += `  <url>\n    <loc>${domain}/categoria/${cat.slug}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
      });
    }

    if (products) {
      products.forEach((prod) => {
        const date = prod.updated_at ? new Date(prod.updated_at).toISOString().split("T")[0] : new Date().toISOString().split("T")[0];
        xml += `  <url>\n    <loc>${domain}/producto/${prod.slug}</loc>\n    <lastmod>${date}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>\n`;
      });
    }

    xml += `</urlset>`;

    return new Response(xml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { "Content-Type": "application/json" },
      status: 400,
    });
  }
});
