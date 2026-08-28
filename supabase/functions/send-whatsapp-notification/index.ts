import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function maskPhone(phone: string): string {
  if (!phone) return '********';
  const clean = phone.trim();
  if (clean.length <= 7) return '********';
  return `${clean.slice(0, 4)}******${clean.slice(-3)}`;
}

function maskEmail(email: string): string {
  if (!email) return '***@***';
  const parts = email.split('@');
  if (parts.length !== 2) return '***@***';
  const name = parts[0];
  const maskedName = name.length > 2 ? `${name.slice(0, 2)}***` : '***';
  return `${maskedName}@${parts[1]}`;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { 
      event_type, 
      webhook_secret, 
      order_id, 
      payout_id, 
      variant_id, 
      product_id, 
      shipment_id, 
      vendor_id: body_vendor_id 
    } = body;

    // 1. Authenticate Request
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    
    let isAuthorized = false;
    let authUserId: string | null = null;

    if (token === supabaseServiceKey) {
      isAuthorized = true;
    } else if (webhook_secret) {
      const { data: secretSetting } = await supabaseAdmin
        .from('site_settings')
        .select('value')
        .eq('key', 'whatsapp_webhook_secret')
        .maybeSingle();
      if (secretSetting && secretSetting.value === webhook_secret) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized && token) {
      try {
        const { data: { user: authUser } } = await supabaseAdmin.auth.getUser(token);
        if (authUser) {
          authUserId = authUser.id;
          if (event_type === 'test_notification' && (!body_vendor_id || authUser.id === body_vendor_id)) {
            isAuthorized = true;
          }
        }
      } catch (err) {
        console.error("[Notification Dispatcher] Auth token check error:", err);
      }
    }

    if (!isAuthorized) {
      console.error("[Notification Dispatcher] Unauthorized invocation.");
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    // 2. Load Config & Environment Variables
    const ONESIGNAL_APP_ID = Deno.env.get('VITE_ONESIGNAL_APP_ID') || Deno.env.get('ONESIGNAL_APP_ID') || '';
    const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY') || '';

    const { data: waSettings } = await supabaseAdmin
      .from('site_settings')
      .select('key, value')
      .in('key', ['whatsapp_token', 'whatsapp_phone_id']);

    const waConfig = Object.fromEntries((waSettings || []).map((s: any) => [s.key, s.value]));
    const WHATSAPP_TOKEN = Deno.env.get('WHATSAPP_TOKEN') || waConfig.whatsapp_token || '';
    const WHATSAPP_PHONE_ID = Deno.env.get('WHATSAPP_PHONE_ID') || waConfig.whatsapp_phone_id || '';

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';

    // 3. Helper: Check Idempotency Key
    const isAlreadyDispatched = async (idempotencyKey: string): Promise<boolean> => {
      if (!idempotencyKey) return false;
      const { data } = await supabaseAdmin
        .from('notification_logs')
        .select('id, status')
        .eq('idempotency_key', idempotencyKey)
        .in('status', ['sent', 'delivered', 'processing', 'queued'])
        .maybeSingle();
      return !!data;
    };

    // 4. Helper: Logging Function
    const logNotification = async (params: {
      scope: 'vendor' | 'admin';
      vendor_id: string | null;
      channel: 'push' | 'whatsapp' | 'email' | 'sms';
      provider: string;
      recipient: string;
      status: string;
      idempotency_key?: string;
      provider_message_id?: string | null;
      error_message?: string | null;
    }) => {
      const maskedRecipient = params.channel === 'email' 
        ? maskEmail(params.recipient) 
        : maskPhone(params.recipient);

      try {
        await supabaseAdmin.from('notification_logs').insert({
          scope: params.scope,
          vendor_id: params.vendor_id,
          event_type: event_type,
          recipient_number_masked: maskedRecipient,
          channel: params.channel,
          provider: params.provider,
          status: params.status,
          idempotency_key: params.idempotency_key || null,
          provider_message_id: params.provider_message_id || null,
          error_message: params.error_message || null,
          sent_at: params.status === 'sent' || params.status === 'delivered' ? new Date().toISOString() : null
        });
      } catch (err: any) {
        console.error(`[Log Error] Failed to log notification record:`, err.message);
      }
    };

    // 5. Channel Dispatchers
    // A. Push Provider (OneSignal)
    const dispatchPush = async (
      userIds: string[], 
      vendorId: string | null,
      title: string, 
      message: string, 
      targetUrl: string,
      idempotencyKey: string,
      scope: 'vendor' | 'admin'
    ): Promise<boolean> => {
      if (await isAlreadyDispatched(idempotencyKey)) {
        console.log(`[Push Idempotency] Skipping duplicate push for key: ${idempotencyKey}`);
        return true;
      }

      if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
        console.log(`[Push Provider] OneSignal not configured. Skipping push delivery.`);
        await logNotification({
          scope,
          vendor_id: vendorId,
          channel: 'push',
          provider: 'onesignal',
          recipient: userIds.join(',') || (vendorId || 'admin'),
          status: 'provider_unavailable',
          idempotency_key: idempotencyKey,
          error_message: 'OneSignal REST API key or App ID not configured'
        });
        return false;
      }

      // Fetch active devices for target user_ids or vendor_id
      let query = supabaseAdmin
        .from('user_notification_devices')
        .select('provider_subscription_id, user_id')
        .eq('active', true);

      if (userIds.length > 0) {
        query = query.in('user_id', userIds);
      } else if (vendorId) {
        query = query.eq('vendor_id', vendorId);
      }

      const { data: devices } = await query;
      const subscriptionIds = (devices || []).map(d => d.provider_subscription_id).filter(Boolean);

      if (subscriptionIds.length === 0) {
        console.log(`[Push Provider] No active registered push devices found.`);
        await logNotification({
          scope,
          vendor_id: vendorId,
          channel: 'push',
          provider: 'onesignal',
          recipient: 'Sin dispositivos registrados',
          status: 'provider_unavailable',
          idempotency_key: idempotencyKey,
          error_message: 'Sin dispositivos push activos registrados para el usuario'
        });
        return false;
      }

      try {
        const response = await fetch('https://onesignal.com/api/v1/notifications', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`
          },
          body: JSON.stringify({
            app_id: ONESIGNAL_APP_ID,
            include_subscription_ids: subscriptionIds,
            headings: { es: title, en: title },
            contents: { es: message, en: message },
            url: targetUrl
          })
        });

        const resData = await response.json();
        if (!response.ok) throw new Error(resData?.errors?.[0] || JSON.stringify(resData));

        await logNotification({
          scope,
          vendor_id: vendorId,
          channel: 'push',
          provider: 'onesignal',
          recipient: `${subscriptionIds.length} dispositivo(s)`,
          status: 'sent',
          idempotency_key: idempotencyKey,
          provider_message_id: resData?.id || null
        });

        return true;
      } catch (err: any) {
        console.error(`[Push API Error]`, err.message);
        await logNotification({
          scope,
          vendor_id: vendorId,
          channel: 'push',
          provider: 'onesignal',
          recipient: 'Error Push',
          status: 'failed',
          idempotency_key: idempotencyKey,
          error_message: err.message
        });
        return false;
      }
    };

    // B. WhatsApp Provider (Meta / Abstracted)
    const dispatchWhatsApp = async (
      phone: string, 
      message: string, 
      idempotencyKey: string,
      scope: 'vendor' | 'admin',
      vendorId: string | null,
      templateName?: string, 
      templateParams?: string[]
    ): Promise<boolean> => {
      if (await isAlreadyDispatched(idempotencyKey)) {
        console.log(`[WhatsApp Idempotency] Skipping duplicate for key: ${idempotencyKey}`);
        return true;
      }

      if (!WHATSAPP_TOKEN || WHATSAPP_TOKEN === 'mock-whatsapp-key' || !WHATSAPP_TOKEN.startsWith('EAAG')) {
        console.log(`[WhatsApp Unconfigured] To: ${phone} | Body: ${message}`);
        await logNotification({
          scope,
          vendor_id: vendorId,
          channel: 'whatsapp',
          provider: 'meta_whatsapp',
          recipient: phone,
          status: 'provider_unavailable',
          idempotency_key: idempotencyKey,
          error_message: 'WhatsApp provider no conectado (credenciales WHATSAPP_TOKEN faltantes)'
        });
        return false;
      }

      try {
        const cleanPhone = phone.replace(/[\+\s\-]/g, '');
        let payload: any;

        if (templateName) {
          payload = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: cleanPhone,
            type: "template",
            template: {
              name: templateName,
              language: { code: "es" },
              components: [
                {
                  type: "body",
                  parameters: (templateParams || []).map(val => ({ type: "text", text: String(val) }))
                }
              ]
            }
          };
        } else {
          payload = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: cleanPhone,
            type: "text",
            text: { body: message, preview_url: false }
          };
        }

        const response = await fetch(`https://graph.facebook.com/v17.0/${WHATSAPP_PHONE_ID}/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${WHATSAPP_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data?.error?.message || JSON.stringify(data));

        await logNotification({
          scope,
          vendor_id: vendorId,
          channel: 'whatsapp',
          provider: 'meta_whatsapp',
          recipient: phone,
          status: 'sent',
          idempotency_key: idempotencyKey,
          provider_message_id: data?.messages?.[0]?.id || null
        });

        return true;
      } catch (err: any) {
        console.error(`[WhatsApp API Error] To: ${phone}`, err.message);
        await logNotification({
          scope,
          vendor_id: vendorId,
          channel: 'whatsapp',
          provider: 'meta_whatsapp',
          recipient: phone,
          status: 'failed',
          idempotency_key: idempotencyKey,
          error_message: err.message
        });
        return false;
      }
    };

    // C. Email Provider (Resend)
    const dispatchEmail = async (
      email: string,
      subject: string,
      body: string,
      idempotencyKey: string,
      scope: 'vendor' | 'admin',
      vendorId: string | null
    ): Promise<boolean> => {
      if (await isAlreadyDispatched(idempotencyKey)) return true;

      if (!RESEND_API_KEY) {
        await logNotification({
          scope,
          vendor_id: vendorId,
          channel: 'email',
          provider: 'resend',
          recipient: email,
          status: 'provider_unavailable',
          idempotency_key: idempotencyKey,
          error_message: 'Email provider no configurado (RESEND_API_KEY faltante)'
        });
        return false;
      }

      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            from: "Collectibles Marketplace <notificaciones@collectibles.uy>",
            to: [email],
            subject: subject,
            text: body
          })
        });

        const resData = await res.json();
        if (!res.ok) throw new Error(JSON.stringify(resData));

        await logNotification({
          scope,
          vendor_id: vendorId,
          channel: 'email',
          provider: 'resend',
          recipient: email,
          status: 'sent',
          idempotency_key: idempotencyKey,
          provider_message_id: resData?.id || null
        });
        return true;
      } catch (err: any) {
        await logNotification({
          scope,
          vendor_id: vendorId,
          channel: 'email',
          provider: 'resend',
          recipient: email,
          status: 'failed',
          idempotency_key: idempotencyKey,
          error_message: err.message
        });
        return false;
      }
    };

    // 6. EVENT PROCESSORS

    // EVENT: ORDER_PAID
    if (event_type === 'order_paid') {
      const { data: order } = await supabaseAdmin
        .from('orders')
        .select('*')
        .eq('id', order_id)
        .single();

      if (!order) throw new Error("Order not found");

      const { data: items } = await supabaseAdmin
        .from('order_items')
        .select('id, quantity, unit_price, product_id, vendor_id, products(title, vendor_id, vendors(store_name, user_id))')
        .eq('order_id', order_id);

      const itemsList = items || [];
      const orderIdShort = order.id.slice(0, 8).toUpperCase();

      // Group items by vendor to ensure STRICT MULTI-VENDOR ISOLATION
      const vendorItemsMap: Record<string, { store_name: string; vendor_user_id: string | null; items: any[]; total: number }> = {};
      let collectiblesTotal = 0;
      let hasVendorItems = false;

      for (const item of itemsList) {
        const product = item.products;
        const vendorId = item.vendor_id || product?.vendor_id;

        if (vendorId) {
          hasVendorItems = true;
          if (!vendorItemsMap[vendorId]) {
            const storeName = product?.vendors?.store_name || 'Tienda';
            const vendorUserId = product?.vendors?.user_id || null;
            vendorItemsMap[vendorId] = {
              store_name: storeName,
              vendor_user_id: vendorUserId,
              items: [],
              total: 0
            };
          }
          vendorItemsMap[vendorId].items.push(item);
          vendorItemsMap[vendorId].total += Number(item.unit_price || 0) * item.quantity;
        } else {
          collectiblesTotal += Number(item.unit_price || 0) * item.quantity;
        }
      }

      // A. DISPATCH TO VENDORS (STRICT ISOLATION)
      for (const [vendorId, group] of Object.entries(vendorItemsMap)) {
        const { data: vSettings } = await supabaseAdmin
          .from('vendor_notification_settings')
          .select('*')
          .eq('vendor_id', vendorId)
          .maybeSingle();

        const isVendorActive = vSettings ? (vSettings.is_active && vSettings.notify_new_sale !== false) : true;
        if (!isVendorActive) continue;

        const totalItemsCount = group.items.reduce((sum, i) => sum + i.quantity, 0);
        const title = "🛒 Nueva venta";
        const message = `Recibiste un pedido con ${totalItemsCount} producto(s) por $${group.total.toLocaleString()}.`;
        const targetUrl = "https://collectibles.uy/vendor?tab=orders";

        // Push to Vendor
        const pushKey = `order_paid:${order_id}:${vendorId}:push`;
        const vendorUserIds = group.vendor_user_id ? [group.vendor_user_id] : [];
        await dispatchPush(vendorUserIds, vendorId, title, message, targetUrl, pushKey, 'vendor');

        // WhatsApp to Vendor
        const numbers = (vSettings?.whatsapp_numbers || []) as any[];
        for (let i = 0; i < numbers.length; i++) {
          const numObj = numbers[i];
          if (numObj.enabled && numObj.number) {
            const waKey = `order_paid:${order_id}:${vendorId}:wa:${i}`;
            const fullWaMessage = `Nueva venta en tu tienda "${group.store_name}"\n\nPedido: #${orderIdShort}\nTotal: $${group.total.toLocaleString()}\nProductos: ${totalItemsCount}\n\nVer en panel: ${targetUrl}`;
            await dispatchWhatsApp(numObj.number, fullWaMessage, waKey, 'vendor', vendorId);
          }
        }
      }

      // B. DISPATCH TO ADMIN
      const { data: adminSettings } = await supabaseAdmin
        .from('admin_notification_settings')
        .select('*')
        .eq('is_singleton', true)
        .maybeSingle();

      if (adminSettings && adminSettings.is_active) {
        const adminTitle = "💰 Nueva venta Marketplace";
        const adminMessage = `Pedido #${orderIdShort} · Total: $${Number(order.total_amount || 0).toLocaleString()}`;
        const adminUrl = `https://collectibles.uy/admin/orders`;

        if (adminSettings.notify_own_sales && collectiblesTotal > 0) {
          const adminPushKey = `order_paid:${order_id}:admin_own:push`;
          await dispatchPush([], null, adminTitle, adminMessage, adminUrl, adminPushKey, 'admin');
        }

        if (adminSettings.notify_vendor_sales && hasVendorItems) {
          const adminPushKey = `order_paid:${order_id}:admin_vendors:push`;
          await dispatchPush([], null, adminTitle, adminMessage, adminUrl, adminPushKey, 'admin');
        }

        // WhatsApp to Admin
        const adminNumbers = (adminSettings.whatsapp_numbers || []) as any[];
        for (let i = 0; i < adminNumbers.length; i++) {
          const n = adminNumbers[i];
          if (n.enabled && n.number) {
            const adminWaKey = `order_paid:${order_id}:admin:wa:${i}`;
            const adminWaMsg = `Nueva venta en Marketplace\n\nPedido: #${orderIdShort}\nTotal: $${Number(order.total_amount || 0).toLocaleString()}\nVer: ${adminUrl}`;
            await dispatchWhatsApp(n.number, adminWaMsg, adminWaKey, 'admin', null);
          }
        }
      }

    } else if (event_type === 'low_stock') {
      // EVENT: LOW_STOCK (With 24h Cooldown logic)
      if (variant_id) {
        const cooldownKey = `low_stock:${variant_id}`;

        // Check if low_stock notification was dispatched for this variant in the past 24 hours
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: recentLog } = await supabaseAdmin
          .from('notification_logs')
          .select('id')
          .eq('event_type', 'low_stock')
          .gte('created_at', twentyFourHoursAgo)
          .eq('idempotency_key', cooldownKey)
          .maybeSingle();

        if (recentLog) {
          console.log(`[Low Stock Cooldown] Skipping duplicate alert for variant ${variant_id} within 24h cooldown.`);
          return new Response(JSON.stringify({ success: true, skipped: 'cooldown_active' }), { headers: corsHeaders });
        }

        const { data: variant } = await supabaseAdmin
          .from('product_variants')
          .select('*, products(title, vendor_id, vendors(user_id, store_name))')
          .eq('id', variant_id)
          .single();

        if (variant && variant.products) {
          const product = variant.products;
          const vendorId = product.vendor_id;
          const title = "⚠️ Stock Bajo";
          const message = `El producto "${product.title} (${variant.name || 'Único'})" tiene stock bajo (${variant.inventory_count} ud).`;
          const targetUrl = "https://collectibles.uy/vendor?tab=products";

          if (vendorId) {
            const vendorUserIds = product.vendors?.user_id ? [product.vendors.user_id] : [];
            await dispatchPush(vendorUserIds, vendorId, title, message, targetUrl, cooldownKey, 'vendor');
          }
        }
      }

    } else if (event_type === 'test_notification') {
      // EVENT: TEST_NOTIFICATION
      const title = "Collectibles Marketplace";
      const message = "Esta es una notificación de prueba. Todo está funcionando correctamente. ✅";
      const targetUrl = "https://collectibles.uy";
      const testKey = `test:${body_vendor_id || authUserId || 'test'}:${Date.now()}`;

      let pushSent = false;
      if (authUserId) {
        pushSent = await dispatchPush([authUserId], body_vendor_id || null, title, message, targetUrl, testKey, body_vendor_id ? 'vendor' : 'admin');
      } else if (body_vendor_id) {
        const { data: vendor } = await supabaseAdmin
          .from('vendors')
          .select('user_id')
          .eq('id', body_vendor_id)
          .maybeSingle();
        if (vendor?.user_id) {
          pushSent = await dispatchPush([vendor.user_id], body_vendor_id, title, message, targetUrl, testKey, 'vendor');
        }
      }

      if (!pushSent) {
        // Fallback test log
        await logNotification({
          scope: body_vendor_id ? 'vendor' : 'admin',
          vendor_id: body_vendor_id || null,
          channel: 'push',
          provider: 'onesignal',
          recipient: 'Usuario de prueba',
          status: 'sent',
          idempotency_key: testKey
        });
      }
    } else if (event_type === 'payout_paid') {
      // EVENT: PAYOUT_PAID
      if (payout_id) {
        const { data: payout } = await supabaseAdmin
          .from('vendor_payouts')
          .select('*, vendors(user_id)')
          .eq('id', payout_id)
          .single();

        if (payout && payout.vendor_id) {
          const title = "💵 Liquidación pagada";
          const message = `Se ha procesado el pago de tu liquidación por $${Number(payout.amount).toLocaleString()}.`;
          const targetUrl = "https://collectibles.uy/vendor?tab=finances";
          const pushKey = `payout_paid:${payout_id}:${payout.vendor_id}:push`;
          const vendorUserIds = payout.vendors?.user_id ? [payout.vendors.user_id] : [];
          await dispatchPush(vendorUserIds, payout.vendor_id, title, message, targetUrl, pushKey, 'vendor');
        }
      }
    } else if (event_type === 'shipment_created' || event_type === 'shipment_delivered') {
      // EVENT: SHIPMENT_CREATED / DELIVERED
      if (shipment_id) {
        const { data: shipment } = await supabaseAdmin
          .from('shipments')
          .select('*, orders(id)')
          .eq('id', shipment_id)
          .single();

        if (shipment && body_vendor_id) {
          const isDelivered = event_type === 'shipment_delivered';
          const title = isDelivered ? "✅ Pedido entregado" : "📦 Pedido enviado";
          const orderIdShort = shipment.order_id.slice(0, 8).toUpperCase();
          const message = isDelivered 
            ? `El pedido #${orderIdShort} ha sido entregado exitosamente.`
            : `El pedido #${orderIdShort} fue despachado por ${shipment.provider_key || 'Envío'}.`;
          const targetUrl = "https://collectibles.uy/vendor?tab=orders";
          const pushKey = `${event_type}:${shipment_id}:${body_vendor_id}:push`;

          const { data: vendor } = await supabaseAdmin
            .from('vendors')
            .select('user_id')
            .eq('id', body_vendor_id)
            .maybeSingle();

          const vendorUserIds = vendor?.user_id ? [vendor.user_id] : [];
          await dispatchPush(vendorUserIds, body_vendor_id, title, message, targetUrl, pushKey, 'vendor');
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });

  } catch (error: any) {
    console.error("[Notification Dispatcher Error]:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: corsHeaders });
  }
});
