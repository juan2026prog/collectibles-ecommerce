// @ts-ignore
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
// @ts-ignore
import { corsHeaders } from "../_shared/cors.ts";

declare const Deno: any;

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || 'mock-resend-key';
const WHATSAPP_TOKEN = Deno.env.get('WHATSAPP_TOKEN') || 'mock-whatsapp-key';
const WHATSAPP_PHONE_ID = Deno.env.get('WHATSAPP_PHONE_ID') || '1234567890';

const supabaseClient = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

// Helper for Email Sending and Logging
async function sendEmailAndLog(recipientEmail: string, subject: string, htmlContent: string, emailType: string, customerId?: string) {
  let status = 'sent';
  let errorMsg = null;
  
  if (RESEND_API_KEY === 'mock-resend-key') {
    console.log(`[Dev Mode] Simulated Email to ${recipientEmail} | Subject: ${subject}`);
  } else {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: "Collectibles <ventas@collectibles.com>", // Update to verified domain
          to: [recipientEmail],
          subject: subject,
          html: htmlContent
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(JSON.stringify(data));
      console.log(`Resend success to ${recipientEmail}`);
    } catch (err: any) {
      status = 'failed';
      errorMsg = err.message;
      console.error("Resend API failed:", err.message);
    }
  }

  // Insert into email_logs
  await supabaseClient.from('email_logs').insert({
    customer_id: customerId || null,
    recipient_email: recipientEmail,
    subject,
    email_type: emailType,
    status,
    error_message: errorMsg
  });
}

// Helper WhatsApp function
async function sendWhatsAppMessage(toPhone: string, message: string) {
  if (WHATSAPP_TOKEN === 'mock-whatsapp-key') {
     console.log(`[Dev Mode] Simulated WhatsApp a ${toPhone}: ${message}`);
     return;
  }
  
  const cleanPhone = toPhone.replace(/[\+\s\-]/g, '');
  const response = await fetch(`https://graph.facebook.com/v17.0/${WHATSAPP_PHONE_ID}/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: cleanPhone,
      type: "text",
      text: { body: message, preview_url: false }
    })
  });
  
  const data = await response.json();
  if (!response.ok) console.error("WhatsApp API Error:", data);
}

serve(async (req: Request) => {
  // Manejo de CORS
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const payload = await req.json();
    console.log("Transactional Email Request:", payload);

    // 1. CAMPAIGN BULK MAILING (Triggered manually via AdminMailing.tsx)
    if (payload.type === 'campaign') {
      const { campaign_id } = payload;
      const { data: campaign } = await supabaseClient.from('mailing_campaigns').select('*').eq('id', campaign_id).single();
      if (!campaign) return new Response("Campaign not found", { status: 404, headers: corsHeaders });

      // Fetch subscribers based on segment (simplified for MVP: fetch all active emails)
      const { data: subscribers } = await supabaseClient.from('profiles').select('id, email, first_name').not('email', 'is', null);
      if (!subscribers) return new Response("No subscribers", { status: 400, headers: corsHeaders });

      console.log(`Processing Campaign [${campaign.name}] for ${subscribers.length} recipients...`);
      for (const sub of subscribers) {
        if (!sub.email) continue;
        const personalizedHtml = campaign.body_html.replace('{{name}}', sub.first_name || 'Cliente');
        await sendEmailAndLog(sub.email, campaign.subject, personalizedHtml, 'newsletter_campaign', sub.id);
      }
      return new Response(JSON.stringify({ success: true, count: subscribers.length }), { headers: corsHeaders });
    }

    // 2. ORDER TRANSACTIONAL WEBHOOK (Triggered by Postgres on Orders table update)
    if (payload.table === 'orders' && payload.record) {
      const { type, record, old_record } = payload;

      // ORDER PAID CONFIRMATION
      if (record.status === 'paid' && (type === 'INSERT' || old_record?.status !== 'paid')) {
         const customerEmail = record.customer_email || 'noreply@collectibles.com';
         const subject = `¡Confirmación de tu Orden #${record.id.slice(0, 8).toUpperCase()}!`;
         const html = `
           <div style="font-family: Arial, sans-serif; padding: 20px; background: #fafafa;">
             <h2 style="color: #111;">¡Gracias por tu compra!</h2>
             <p>Hemos recibido tu orden y ya comenzamos a prepararla.</p>
             <p><strong>Total:</strong> $${record.total_amount} ${record.currency || 'UYU'}</p>
             <p><strong>Estado:</strong> Confirmada ✅</p>
             <p>Te avisaremos apenas tu orden sea despachada.</p>
             <p>Saludos,<br />El Equipo.</p>
           </div>
         `;
         await sendEmailAndLog(customerEmail, subject, html, 'order_confirmation', record.customer_id);

         if (record.customer_phone) {
            await sendWhatsAppMessage(record.customer_phone, `✨ ¡Gracias por tu compra!\n\nTu orden #${record.id.slice(0,8).toUpperCase()} por $${record.total_amount} está confirmada ✅.`);
         }
      } 
      
      // ORDER SHIPPED/DISPATCHED CONFIRMATION
      else if ((record.status === 'shipped' || record.status === 'despachado') && old_record?.status !== record.status) {
         const customerEmail = record.customer_email;
         if (!customerEmail) return new Response("No email", { status: 200, headers: corsHeaders });
         
         const trackingSnippet = record.tracking_number ? `<p><strong>Guía / Tracking:</strong> ${record.tracking_provider} - ${record.tracking_number}</p>` : '';
         const subject = `¡Tu orden va en camino! 🚚`;
         const html = `
           <div style="font-family: Arial, sans-serif; padding: 20px; background: #fafafa;">
             <h2 style="color: #111;">¡Excelentes noticias!</h2>
             <p>Tu orden #${record.id.slice(0, 8).toUpperCase()} ya fue despachada y está en manos de nuestra logística.</p>
             ${trackingSnippet}
             <p>Mantente atento porque la recibirás muy pronto.</p>
             <p>Saludos,<br />El Equipo.</p>
           </div>
         `;
         await sendEmailAndLog(customerEmail, subject, html, 'shipping_update', record.customer_id);

         if (record.customer_phone) {
            await sendWhatsAppMessage(record.customer_phone, `🚚 ¡Tu orden va en camino!\n\nOrden #${record.id.slice(0,8).toUpperCase()} despachada. ${record.tracking_number ? `Tracking: ${record.tracking_number}` : ''}`);
         }
      }

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
    }

    // 2.5 CUSTOM NOTIFICATIONS (Refunds/Cancellations triggered explicitly)
    if (payload.type === 'custom_order_cancelled') {
         const { order, reason } = payload;
         const customerEmail = order.customer_email || order.customer?.email;
         if (!customerEmail) return new Response("No email", { status: 200, headers: corsHeaders });
         
         const reasonText = reason || "Decisión del administrador";
         const subject = `Tu orden #${order.id.slice(0, 8).toUpperCase()} ha sido cancelada`;
         const html = `
           <div style="font-family: Arial, sans-serif; padding: 20px; background: #fafafa; border-radius: 8px;">
             <h2 style="color: #111;">Orden Cancelada</h2>
             <p>Te informamos que tu orden <strong>#${order.id.slice(0, 8).toUpperCase()}</strong> ha sido cancelada y el dinero ha sido reembolsado automáticamente a tu método de pago original (Tarjeta o saldo de Mercado Pago).</p>
             <p><strong>Motivo de cancelación:</strong> ${reasonText}</p>
             <p>Si tienes dudas, por favor contáctanos.</p>
             <p>Saludos,<br />El Equipo.</p>
           </div>
         `;
         await sendEmailAndLog(customerEmail, subject, html, 'order_cancellation', order.customer_id);

         if (order.customer_phone) {
            await sendWhatsAppMessage(order.customer_phone, `⛔ *Orden Cancelada*\n\nTu orden #${order.id.slice(0,8).toUpperCase()} fue cancelada y el pago está en proceso de reembolso.\n\nMotivo: ${reasonText}`);
         }
         return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    if (payload.type === 'abandoned_order_discount') {
         const { order, discountCode } = payload;
         const customerEmail = order.customer_email || order.customer?.email;
         if (!customerEmail) return new Response("No email", { status: 200, headers: corsHeaders });
         
         const subject = `¡Dejaste algo en nuestro sitio! Aquí tienes un regalo 🎁`;
         const html = `
           <div style="font-family: Arial, sans-serif; padding: 20px; background: #fafafa; border-radius: 8px;">
             <h2 style="color: #111;">¡Hey! Notamos que no finalizaste tu compra.</h2>
             <p>Tu orden <strong>#${order.id.slice(0, 8).toUpperCase()}</strong> quedó pendiente.</p>
             <p>Queremos darte un pequeño empujón: usa el cupón <strong>${discountCode || 'VUELVE10'}</strong> para obtener un descuento especial si finalizas tu compra hoy.</p>
             <p>Saludos,<br />El Equipo.</p>
           </div>
         `;
         await sendEmailAndLog(customerEmail, subject, html, 'abandoned_order_recovery', order.customer_id);

         if (order.customer_phone) {
            await sendWhatsAppMessage(order.customer_phone, `🎁 *¡Hola!*\n\nVimos que no finalizaste tu orden #${order.id.slice(0,8).toUpperCase()}.\nSi aún la quieres, usa el cupón *${discountCode || 'VUELVE10'}* antes de pagar para obtener un descuento exclusivo.\n¡Te esperamos!`);
         }
         return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    // 3. ABANDONED CART RECOVERY (Triggered via Admin UI or Cron)
    if (payload.type === 'abandoned_cart') {
      const { cart_id } = payload;
      const { data: cart, error } = await supabaseClient.from('abandoned_checkouts').select('*').eq('id', cart_id).single();
      
      if (error || !cart) return new Response("Cart not found", { status: 404, headers: corsHeaders });
      if (cart.recovery_email_sent) return new Response("Recovery already sent", { status: 400, headers: corsHeaders });

      const email = cart.email;
      if (!email) return new Response("No email attached to cart", { status: 400, headers: corsHeaders });

      const total = cart.total_amount;
      const subject = "¡Dejaste algo en tu carrito! 🛒";
      const html = `
        <div style="font-family: Arial, sans-serif; padding: 20px; background: #fafafa; border-radius: 8px;">
          <h2 style="color: #111;">¡Hey! Notamos que no terminaste tu compra.</h2>
          <p>Tus productos por un total de <strong>$${total}</strong> siguen esperándote en tu carrito.</p>
          <p>Termina tu compra en 1 clic antes de que alguien más se los lleve usando este enlace:</p>
          <p style="margin-top:20px; margin-bottom:20px;">
             <a href="https://collectibles.com/checkout?recover=${cart.id}" style="padding: 12px 24px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Recuperar mi carrito</a>
          </p>
          <p style="color: #666; font-size: 12px;">Si necesitas ayuda o tienes problemas técnicos con el pago, responde a este correo.</p>
          <p>Saludos,<br />El Equipo de Collectibles.</p>
        </div>
      `;
      
      await sendEmailAndLog(email, subject, html, 'abandoned_cart', cart.customer_id);
      
      // Marcar como enviado
      await supabaseClient.from('abandoned_checkouts').update({ recovery_email_sent: true }).eq('id', cart.id);

      return new Response(JSON.stringify({ success: true, email }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
    }

    return new Response(JSON.stringify({ ignored: true }), { headers: corsHeaders });

  } catch (error: any) {
    console.error("Email processing error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: corsHeaders });
  }
});
