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


    // 2.6 NEW PAYMENT AND REFUND NOTIFICATIONS
    if (payload.type === 'client_refund_requested') {
         const { email, phone, order_number } = payload;
         if (!email) return new Response("No email", { status: 400, headers: corsHeaders });
         
         const subject = `Tu solicitud de reembolso ha sido recibida - Collectibles`;
         const html = `
           <div style="font-family: Arial, sans-serif; padding: 20px; background: #fafafa; border-radius: 8px;">
             <h2 style="color: #111;">Solicitud de Reembolso Recibida</h2>
             <p>Te informamos que hemos recibido tu solicitud de reembolso para el pedido <strong>#${order_number}</strong>.</p>
             <p>Nuestros administradores de soporte están evaluando la solicitud. Si se requiere alguna validación adicional, te contactaremos.</p>
             <p>Saludos,<br />El Equipo de Collectibles.</p>
           </div>
         `;
         await sendEmailAndLog(email, subject, html, 'client_refund_requested');
         if (phone) {
            await sendWhatsAppMessage(phone, `⏳ *Reembolso Solicitado*\\n\\nHemos recibido tu solicitud de reembolso para el pedido #${order_number}. Está siendo revisada por soporte.`);
         }
         return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    if (payload.type === 'client_refund_completed') {
         const { email, phone, order_number, amount } = payload;
         if (!email) return new Response("No email", { status: 400, headers: corsHeaders });
         
         const subject = `Tu reembolso ha sido aprobado y procesado - Collectibles`;
         const html = `
           <div style="font-family: Arial, sans-serif; padding: 20px; background: #fafafa; border-radius: 8px;">
             <h2 style="color: #16a34a;">Reembolso Aprobado 🎉</h2>
             <p>Queremos informarte que el reembolso de tu pedido <strong>#${order_number}</strong> por un monto de <strong>$${amount}</strong> ha sido procesado con éxito.</p>
             <p>El dinero debería verse reflejado en tu cuenta original de pago en los próximos días hábiles (dependiendo de la pasarela y tu entidad financiera).</p>
             <p>Saludos,<br />El Equipo de Collectibles.</p>
           </div>
         `;
         await sendEmailAndLog(email, subject, html, 'client_refund_completed');
         if (phone) {
            await sendWhatsAppMessage(phone, `✅ *Reembolso Aprobado*\\n\\nTu reembolso por $${amount} para el pedido #${order_number} ha sido completado con éxito.`);
         }
         return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    if (payload.type === 'client_refund_rejected') {
         const { email, phone, order_number, reason } = payload;
         if (!email) return new Response("No email", { status: 400, headers: corsHeaders });
         
         const subject = `Actualización sobre tu solicitud de reembolso - Collectibles`;
         const html = `
           <div style="font-family: Arial, sans-serif; padding: 20px; background: #fafafa; border-radius: 8px;">
             <h2 style="color: #dc2626;">Solicitud de Reembolso Rechazada</h2>
             <p>Te informamos que tu solicitud de reembolso para el pedido <strong>#${order_number}</strong> ha sido rechazada.</p>
             <p><strong>Motivo indicado:</strong> ${reason || 'Políticas de devolución del marketplace'}</p>
             <p>Si tienes alguna consulta, puedes responder directamente a este correo.</p>
             <p>Saludos,<br />El Equipo de Collectibles.</p>
           </div>
         `;
         await sendEmailAndLog(email, subject, html, 'client_refund_rejected');
         if (phone) {
            await sendWhatsAppMessage(phone, `❌ *Reembolso Rechazado*\\n\\nLa solicitud para el pedido #${order_number} fue rechazada. Motivo: ${reason || 'Políticas del marketplace'}`);
         }
         return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    if (payload.type === 'client_chargeback') {
         const { email, phone, order_number, amount } = payload;
         if (!email) return new Response("No email", { status: 400, headers: corsHeaders });
         
         const subject = `Disputa de pago registrada - Collectibles`;
         const html = `
           <div style="font-family: Arial, sans-serif; padding: 20px; background: #fafafa; border-radius: 8px;">
             <h2 style="color: #ea580c;">Notificación de Disputa</h2>
             <p>Se ha registrado un reporte de disputa o contracargo por un importe de <strong>$${amount}</strong> relacionado a tu pedido <strong>#${order_number}</strong>.</p>
             <p>Nuestro equipo está en proceso de revisión de los comprobantes y la evidencia junto a la pasarela bancaria. Nos comunicaremos contigo a la brevedad.</p>
             <p>Saludos,<br />El Equipo de Soporte.</p>
           </div>
         `;
         await sendEmailAndLog(email, subject, html, 'client_chargeback');
         if (phone) {
            await sendWhatsAppMessage(phone, `⚠️ *Disputa Registrada*\\n\\nSe ha reportado un contracargo por $${amount} en tu orden #${order_number}. El caso está bajo revisión.`);
         }
         return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    if (payload.type === 'vendor_refund_applied') {
         const { email, store_name, order_number, amount } = payload;
         if (!email) return new Response("No email", { status: 400, headers: corsHeaders });
         
         const subject = `Reembolso aplicado a suborden - Collectibles`;
         const html = `
           <div style="font-family: Arial, sans-serif; padding: 20px; background: #fafafa; border-radius: 8px;">
             <h2 style="color: #ea580c;">Reembolso Aplicado</h2>
             <p>Estimado <strong>${store_name}</strong>,</p>
             <p>Te notificamos que se ha procesado un reembolso en tu suborden vinculada al pedido <strong>#${order_number}</strong> por un monto de <strong>$${amount}</strong>.</p>
             <p>Este importe ha sido devuelto al cliente comprador y las comisiones han sido actualizadas correspondientemente en tu panel.</p>
             <p>Saludos,<br />Administración de Finanzas.</p>
           </div>
         `;
         await sendEmailAndLog(email, subject, html, 'vendor_refund_applied');
         return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    if (payload.type === 'vendor_adjustment_created') {
         const { email, store_name, order_number, amount, type_adj, reason } = payload;
         if (!email) return new Response("No email", { status: 400, headers: corsHeaders });
         
         const subject = `Nuevo ajuste financiero registrado - Collectibles`;
         const html = `
           <div style="font-family: Arial, sans-serif; padding: 20px; background: #fafafa; border-radius: 8px;">
             <h2 style="color: #dc2626;">Ajuste Financiero Registrado</h2>
             <p>Estimado <strong>${store_name}</strong>,</p>
             <p>Se ha registrado un ajuste financiero de tipo <strong>${type_adj}</strong> en tu cuenta de vendedor:</p>
             <ul>
               <li><strong>Pedido/Referencia:</strong> #${order_number || 'Ajuste Manual'}</li>
               <li><strong>Monto a deducir:</strong> $${amount}</li>
               <li><strong>Razón:</strong> ${reason || 'Ajuste de reembolso post-liquidación'}</li>
             </ul>
             <p>⚠️ <strong>Aviso Importante:</strong> Este importe de <strong>$${amount}</strong> se descontará automáticamente de tu próxima liquidación de ganancias generada.</p>
             <p>Saludos,<br />Administración de Finanzas.</p>
           </div>
         `;
         await sendEmailAndLog(email, subject, html, 'vendor_adjustment_created');
         return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    if (payload.type === 'vendor_chargeback') {
         const { email, store_name, order_number, amount, reason } = payload;
         if (!email) return new Response("No email", { status: 400, headers: corsHeaders });
         
         const subject = `Alerta de contracargo/disputa - Collectibles`;
         const html = `
           <div style="font-family: Arial, sans-serif; padding: 20px; background: #fafafa; border-radius: 8px;">
             <h2 style="color: #dc2626; margin: 0 0 10px 0;">¡Alerta de Contracargo!</h2>
             <p>Estimado <strong>${store_name}</strong>,</p>
             <p>Hemos recibido una disputa o contracargo en la pasarela para el pedido <strong>#${order_number}</strong> por un monto de <strong>$${amount}</strong>.</p>
             <p><strong>Razón de la disputa:</strong> ${reason || 'No especificada por el cliente'}</p>
             <p>⚠️ <strong>Retención Financiera:</strong> Los fondos asociados a esta suborden quedan retenidos en tu balance y no serán liquidados hasta que se resuelva la disputa a favor de la plataforma.</p>
             <p>Saludos,<br />Protección Financiera del Vendedor.</p>
           </div>
         `;
         await sendEmailAndLog(email, subject, html, 'vendor_chargeback');
         return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    if (payload.type === 'admin_chargeback_received') {
         const { dispute, order, vendor } = payload;
         
         const subject = `[ADMIN] Alerta: Nuevo Contracargo Recibido`;
         const html = `
           <div style="font-family: Arial, sans-serif; padding: 20px; background: #fafafa; border-radius: 8px; border: 2px solid #dc2626;">
             <h2 style="color: #dc2626; margin: 0 0 10px 0;">Contracargo Recibido (Urgente)</h2>
             <p>Se ha recibido una disputa formal en la pasarela:</p>
             <ul>
               <li><strong>Disputa ID:</strong> ${dispute.id}</li>
               <li><strong>Proveedor:</strong> ${dispute.provider}</li>
               <li><strong>Importe:</strong> $${dispute.amount}</li>
               <li><strong>Pedido:</strong> #${order.order_number}</li>
               <li><strong>Cliente:</strong> ${order.customer_name} (${order.customer_email})</li>
               <li><strong>Vendedor Afectado:</strong> ${vendor.store_name}</li>
               <li><strong>Motivo reportado:</strong> ${dispute.dispute_reason}</li>
             </ul>
             <p>El sistema ha congelado automáticamente la liquidación de esta suborden. Por favor, ingresa al panel de control de reembolsos para adjuntar las pruebas de entrega.</p>
           </div>
         `;
         await sendEmailAndLog('admin@collectibles.com', subject, html, 'admin_chargeback_received');
         return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    if (payload.type === 'admin_refund_manual_required') {
         const { order_number, amount, provider, reason } = payload;
         
         const subject = `[ADMIN] Reembolso Manual Requerido - Pasarela: ${provider}`;
         const html = `
           <div style="font-family: Arial, sans-serif; padding: 20px; background: #fafafa; border-radius: 8px; border: 2px solid #ea580c;">
             <h2 style="color: #ea580c; margin: 0 0 10px 0;">Devolución Manual Requerida</h2>
             <p>Se ha solicitado un reembolso que no puede ser procesado automáticamente:</p>
             <ul>
               <li><strong>Pedido:</strong> #${order_number}</li>
               <li><strong>Importe:</strong> $${amount}</li>
               <li><strong>Pasarela:</strong> ${provider}</li>
               <li><strong>Razón de la solicitud:</strong> ${reason}</li>
             </ul>
             <p><strong>Instrucciones:</strong> Por favor, ingresa al portal de ${provider}, realiza la devolución de fondos y luego confirma la transacción en la interfaz administrativa para actualizar los estados del pedido.</p>
           </div>
         `;
         await sendEmailAndLog('admin@collectibles.com', subject, html, 'admin_refund_manual_required');
         return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    if (payload.type === 'admin_refund_failed') {
         const { order_number, amount, provider, error_msg } = payload;
         
         const subject = `[ADMIN] ERROR: Falló Reembolso Automático`;
         const html = `
           <div style="font-family: Arial, sans-serif; padding: 20px; background: #fafafa; border-radius: 8px; border: 2px solid #dc2626;">
             <h2 style="color: #dc2626; margin: 0 0 10px 0;">Error en la API de Reembolso</h2>
             <p>Un intento de reembolso automático con el proveedor falló:</p>
             <ul>
               <li><strong>Pedido:</strong> #${order_number}</li>
               <li><strong>Importe:</strong> $${amount}</li>
               <li><strong>Proveedor de pago:</strong> ${provider}</li>
               <li><strong>Mensaje de error:</strong> ${error_msg}</li>
             </ul>
             <p>Por favor, revisa el estado del pago directamente en el portal de la pasarela y gestiona la devolución manual.</p>
           </div>
         `;
         await sendEmailAndLog('admin@collectibles.com', subject, html, 'admin_refund_failed');
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

    // 4. VENDOR INVITATION
    if (payload.type === 'vendor_invitation') {
      const { email, store_name, invite_link, expires_at } = payload;
      if (!email || !invite_link) return new Response("Missing parameters", { status: 400, headers: corsHeaders });

      const subject = `Invitación para vender en Collectibles Marketplace`;
      const html = `
        <div style="font-family: Arial, sans-serif; padding: 20px; background: #fafafa; border-radius: 8px;">
          <h2 style="color: #111;">Hola ${store_name},</h2>
          <p>Collectibles te ha invitado a gestionar tu tienda dentro de su marketplace.</p>
          <p>Desde tu panel de vendedor podrás:</p>
          <ul>
            <li>Cargar y gestionar tus productos</li>
            <li>Conectar con Mercado Libre y automatizar publicaciones</li>
            <li>Configurar tus envíos</li>
            <li>Ver tus ventas en tiempo real</li>
            <li>Consultar tus liquidaciones y comisiones</li>
          </ul>
          <p style="margin-top:20px; margin-bottom:20px;">
             <a href="${invite_link}" style="padding: 12px 24px; background: #0d9488; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Activar mi cuenta y configurar mi tienda</a>
          </p>
          <p style="color: #eab308; font-weight: bold; font-size: 14px;">Esta invitación vence el: ${expires_at}</p>
          <p style="color: #666; font-size: 12px; margin-top: 20px;">Si tienes alguna pregunta, por favor responde a este correo.</p>
          <p>Saludos,<br />El Equipo de Collectibles Marketplace.</p>
        </div>
      `;

      await sendEmailAndLog(email, subject, html, 'vendor_invitation');

      return new Response(JSON.stringify({ success: true, email }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
    }

    // 5. WELCOME EMAIL (Triggered on new user signup)
    if (payload.type === 'welcome') {
      const { email, first_name } = payload;
      if (!email) return new Response("Missing email parameter", { status: 400, headers: corsHeaders });

      const subject = `¡Te damos la bienvenida a Collectibles! 🎉`;
      const name = first_name || 'Coleccionista';
      const html = `
        <div style="font-family: Arial, sans-serif; padding: 20px; background: #fafafa; border-radius: 8px; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0;">
          <div style="text-align: center; margin-bottom: 20px;">
             <h2 style="color: #f00856; margin: 0;">¡Bienvenido a Collectibles!</h2>
          </div>
          <p>Hola <strong>${name}</strong>,</p>
          <p>Te damos la bienvenida oficial a nuestra comunidad. Tu cuenta ha sido creada exitosamente.</p>
          <p>A partir de ahora podrás:</p>
          <ul>
            <li>Explorar y comprar coleccionables únicos en nuestro marketplace</li>
            <li>Gestionar tus compras y envíos en tu portal de cliente</li>
            <li>Guardar tus productos favoritos en tu lista de deseos</li>
          </ul>
          <p>Esperamos que disfrutes tu experiencia en nuestra plataforma.</p>
          <p style="margin-top:30px; border-top: 1px solid #e2e8f0; padding-top: 15px; color: #666; font-size: 12px; text-align: center;">
             Si tienes alguna duda o necesitas asistencia, responde directamente a este correo.
          </p>
          <p style="text-align: center; font-weight: bold; margin-top: 10px;">El Equipo de Collectibles</p>
        </div>
      `;

      await sendEmailAndLog(email, subject, html, 'welcome_email', payload.customer_id);

      return new Response(JSON.stringify({ success: true, email }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
    }

    return new Response(JSON.stringify({ ignored: true }), { headers: corsHeaders });

  } catch (error: any) {
    console.error("Email processing error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: corsHeaders });
  }
});
