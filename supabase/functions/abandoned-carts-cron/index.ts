// @ts-ignore
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// @ts-ignore
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// Initialize Supabase Client
const supabase = createClient(supabaseUrl, supabaseServiceKey);

Deno.serve(async (req: any) => {
  try {
    // Basic verification: allow anonymous invoke if it's from pg_cron (usually bypasses auth if local, but in prod we'd use headers)
    
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    // Load templates for abandoned carts
    const { data: templates } = await supabase
      .from('communication_templates')
      .select('*')
      .in('name', ['Recuperación Carrito (1H)', 'Recuperación Carrito + Cupón (48H)']);
    const getTemplate = (name: string) => templates?.find(t => t.name === name) || null;

    // 1. Process 1-Hour Carts (First Reminder)
    const { data: carts1h } = await supabase
      .from('abandoned_checkouts')
      .select('*')
      .eq('status', 'abandoned')
      .eq('recovery_email_sent', false)
      .lt('created_at', oneHourAgo.toISOString())
      .gt('created_at', twentyFourHoursAgo.toISOString());

    if (carts1h && carts1h.length > 0) {
      for (const cart of carts1h) {
        const tpl = getTemplate('Recuperación Carrito (1H)');
        let finalHtml = tpl?.content || '<p>Hola {{nombre}}, vimos que dejaste artículos en tu carrito.</p>';
        finalHtml = finalHtml.replace('{{nombre}}', cart.email.split('@')[0]);
        finalHtml = finalHtml.replace('{{checkout_url}}', 'https://tu-tienda.com/checkout');

        console.log(`Sending 1h recovery email to: ${cart.email}`);
        console.log(`SUBJECT: ${tpl?.subject || '¿Olvidaste algo en tu carrito?'}`);
        console.log(`HTML: ${finalHtml}`);
        
        await supabase
          .from('abandoned_checkouts')
          .update({ 
            recovery_email_sent: true,
            last_contact_date: now.toISOString(),
            contact_channel: 'email'
          })
          .eq('id', cart.id);
      }
    }

    // 2. Process 24-Hour Carts (Second Reminder & WhatsApp if opt-in)
    const { data: carts24h } = await supabase
      .from('abandoned_checkouts')
      .select('*')
      .eq('status', 'abandoned')
      .eq('recovery_email_24h_sent', false)
      .lt('created_at', twentyFourHoursAgo.toISOString())
      .gt('created_at', fortyEightHoursAgo.toISOString());

    if (carts24h && carts24h.length > 0) {
      const emails24h = carts24h.map(c => c.email);
      const { data: consents24h } = await supabase.from('customer_consents').select('email, whatsapp_opt_in').in('email', emails24h);
      const consentMap24h = new Map(consents24h?.map(c => [c.email, c]) || []);

      for (const cart of carts24h) {
        let channel = 'email';
        console.log(`Sending 24h recovery email to: ${cart.email}`);
        
        const hasWhatsappOptIn = consentMap24h.get(cart.email)?.whatsapp_opt_in;
        if (hasWhatsappOptIn) {
          console.log(`Sending 24h recovery WhatsApp to: ${cart.email}`);
          channel = 'email+whatsapp';
        }

        await supabase
          .from('abandoned_checkouts')
          .update({ 
            recovery_email_24h_sent: true,
            recovery_whatsapp_24h_sent: hasWhatsappOptIn || false,
            last_contact_date: now.toISOString(),
            contact_channel: channel
          })
          .eq('id', cart.id);
      }
    }

    // 3. Process 48-Hour Carts (Final Reminder + Coupon)
    const { data: carts48h } = await supabase
      .from('abandoned_checkouts')
      .select('*')
      .eq('status', 'abandoned')
      .eq('recovery_48h_sent', false)
      .lt('created_at', fortyEightHoursAgo.toISOString());

    if (carts48h && carts48h.length > 0) {
      const emails48h = carts48h.map(c => c.email);
      const { data: consents48h } = await supabase.from('customer_consents').select('email, whatsapp_opt_in').in('email', emails48h);
      const consentMap48h = new Map(consents48h?.map(c => [c.email, c]) || []);

      for (const cart of carts48h) {
        // Generate unique coupon
        const uniqueCode = `COMEBACK-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        
        // Ensure coupons table has 10% discount
        await supabase.from('coupons').insert({
          code: uniqueCode,
          discount_type: 'percentage',
          discount_value: 10,
          is_active: true,
          expires_at: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days valid
        });

        const tpl = getTemplate('Recuperación Carrito + Cupón (48H)');
        let finalHtml = tpl?.content || '<p>Hola {{nombre}}, vuelve y llévate tu pedido con 10% OFF usando el código {{cupon}}</p>';
        finalHtml = finalHtml.replace('{{nombre}}', cart.email.split('@')[0]);
        finalHtml = finalHtml.replace('{{cupon}}', uniqueCode);
        finalHtml = finalHtml.replace('{{checkout_url}}', 'https://tu-tienda.com/checkout');

        console.log(`Sending 48h recovery email with coupon ${uniqueCode} to: ${cart.email}`);
        console.log(`HTML: ${finalHtml}`);
        
        let channel = 'email';
        const hasWhatsappOptIn = consentMap48h.get(cart.email)?.whatsapp_opt_in;
        if (hasWhatsappOptIn) {
          console.log(`Sending 48h recovery WhatsApp with coupon ${uniqueCode} to: ${cart.email}`);
          channel = 'email+whatsapp';
        }

        await supabase
          .from('abandoned_checkouts')
          .update({ 
            recovery_48h_sent: true,
            last_contact_date: now.toISOString(),
            contact_channel: channel
          })
          .eq('id', cart.id);
      }
    }

    return new Response(JSON.stringify({ success: true, processed: { '1h': carts1h?.length || 0, '24h': carts24h?.length || 0, '48h': carts48h?.length || 0 } }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (error: any) {
    console.error("Abandoned carts cron error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
