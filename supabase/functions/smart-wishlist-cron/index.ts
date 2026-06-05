// @ts-ignore
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// @ts-ignore
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const supabase = createClient(supabaseUrl, supabaseServiceKey);

Deno.serve(async (req: any) => {
  try {
    const { data: alerts, error } = await supabase
      .from('wishlist_alerts')
      .select(`
        id,
        alert_type,
        wishlist:wishlist_id (
          user_id,
          product_id,
          products (
            title,
            slug
          )
        )
      `)
      .eq('status', 'pending');

    if (error) throw error;

    // Load templates for wishlist
    const { data: templates } = await supabase
      .from('communication_templates')
      .select('*')
      .in('name', ['Alerta: Producto en Stock']);
    const getTemplate = (name: string) => templates?.find(t => t.name === name) || null;

    if (!alerts || alerts.length === 0) {
      return new Response(JSON.stringify({ success: true, processed: 0 }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    let processedCount = 0;

    for (const alert of alerts) {
      // Get user email
      const { data: user } = await supabase.auth.admin.getUserById(alert.wishlist.user_id);
      
      if (user?.user?.email) {
        // Fetch opt in preferences
        const { data: consents } = await supabase
          .from('customer_consents')
          .select('email_marketing_opt_in, whatsapp_opt_in')
          .eq('email', user.user.email)
          .single();

        const tpl = getTemplate('Alerta: Producto en Stock');
        let finalHtml = tpl?.content || '<p>Hola, el producto {{producto}} ya tiene stock disponible.</p>';
        const pTitle = (alert.wishlist as any).products?.title || 'tu producto';
        const pSlug = (alert.wishlist as any).products?.slug || '';
        
        finalHtml = finalHtml.replace('{{producto}}', pTitle);
        finalHtml = finalHtml.replace('{{url}}', `https://tu-tienda.com/product/${pSlug}`);

        console.log(`Sending ${alert.alert_type} alert to: ${user.user.email}`);
        console.log(`SUBJECT: ${tpl?.subject || '¡El producto volvió a ingresar!'}`);
        console.log(`HTML: ${finalHtml}`);

        if (consents?.whatsapp_opt_in) {
          console.log(`Sending ${alert.alert_type} WhatsApp alert to: ${user.user.email}`);
        }

        // Mark as sent
        await supabase
          .from('wishlist_alerts')
          .update({ status: 'sent' })
          .eq('id', alert.id);

        processedCount++;
      }
    }

    return new Response(JSON.stringify({ success: true, processed: processedCount }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (error: any) {
    console.error("Smart wishlist cron error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
