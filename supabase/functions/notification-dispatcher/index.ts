import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { notificationTemplates, formatCurrencyUYU, formatOrderNumber } from "../_shared/notificationTemplates.ts";

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

export interface NotificationPayload {
  event_type: string;
  scope?: 'vendor' | 'admin';
  vendor_id?: string | null;
  user_ids?: string[];
  recipient?: string;
  title?: string;
  body?: string;
  url?: string;
  idempotency_key?: string;
  order_id?: string;
  payout_id?: string;
  variant_id?: string;
  product_id?: string;
  shipment_id?: string;
  webhook_secret?: string;
  channel?: string;
  subject?: string;
  // Daily Summary fields
  date_str?: string;
  vendor_rows?: Array<{ store_name: string; order_count: number; total_amount: number }>;
  marketplace_total?: number;
  order_count?: number;
  vendor_count?: number;
  commission_total?: number;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const body: NotificationPayload = await req.json();
    const { 
      event_type, 
      webhook_secret, 
      order_id, 
      payout_id, 
      variant_id, 
      shipment_id, 
      vendor_id: body_vendor_id,
      user_ids: body_user_ids
    } = body;

    // 1. Authenticate Request
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    
    let isAuthorized = false;
    let authUserId: string | null = null;
    let authUser: any = null;

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

    if (token) {
      try {
        const { data: userData } = await supabaseAdmin.auth.getUser(token);
        if (userData?.user) {
          authUser = userData.user;
          authUserId = authUser.id;
          if (token !== supabaseServiceKey) {
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

    // 2. Load Secrets
    const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID') || '00a0c8cc-6b24-4ad1-9503-2e329ee5c566';
    const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY') || '';

    const { data: waSettings } = await supabaseAdmin
      .from('site_settings')
      .select('key, value')
      .in('key', ['whatsapp_token', 'whatsapp_phone_id', 'resend_api_key', 'resend_from']);

    const waConfig = Object.fromEntries((waSettings || []).map((s: any) => [s.key, s.value]));
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || waConfig.resend_api_key || '';
    const RESEND_FROM = Deno.env.get('RESEND_FROM') || waConfig.resend_from || 'Collectibles Marketplace <notificaciones@collectibles.uy>';

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

    // 5. PROVIDERS
    const dispatchPushProvider = async (
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
        await logNotification({
          scope,
          vendor_id: vendorId,
          channel: 'push',
          provider: 'onesignal',
          recipient: userIds.join(',') || (vendorId || 'admin'),
          status: 'provider_unavailable',
          idempotency_key: idempotencyKey,
          error_message: 'ONESIGNAL_REST_API_KEY no configurado en Supabase Secrets.'
        });
        return false;
      }

      const validUserIds = userIds.filter(Boolean);
      let payload: any = {
        app_id: ONESIGNAL_APP_ID,
        headings: { es: title, en: title },
        contents: { es: message, en: message },
        url: targetUrl
      };

      if (validUserIds.length > 0) {
        payload.target_channel = "push";
        payload.include_aliases = { external_id: validUserIds };
      } else {
        let query = supabaseAdmin
          .from('user_notification_devices')
          .select('provider_subscription_id')
          .eq('active', true);

        if (vendorId) {
          query = query.eq('vendor_id', vendorId);
        }

        const { data: devices } = await query;
        const subscriptionIds = (devices || []).map(d => d.provider_subscription_id).filter(Boolean);

        if (subscriptionIds.length === 0) {
          await logNotification({
            scope,
            vendor_id: vendorId,
            channel: 'push',
            provider: 'onesignal',
            recipient: 'Sin dispositivos registrados',
            status: 'provider_unavailable',
            idempotency_key: idempotencyKey,
            error_message: 'Sin dispositivos push activos registrados'
          });
          return false;
        }

        payload.include_subscription_ids = subscriptionIds;
      }

      try {
        const response = await fetch('https://api.onesignal.com/notifications', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Authorization': `Key ${ONESIGNAL_REST_API_KEY}`
          },
          body: JSON.stringify(payload)
        });

        const resData = await response.json();
        if (!response.ok) throw new Error(resData?.errors?.[0] || JSON.stringify(resData));

        await logNotification({
          scope,
          vendor_id: vendorId,
          channel: 'push',
          provider: 'onesignal',
          recipient: validUserIds.length > 0 ? `${validUserIds.length} usuario(s)` : 'Dispositivo(s) registrados',
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

    const dispatchEmailProvider = async (
      email: string,
      subject: string,
      body: string,
      idempotencyKey: string,
      scope: 'vendor' | 'admin',
      vendorId: string | null
    ): Promise<{ success: boolean; status: number; error?: string; provider_message_id?: string | null }> => {
      if (await isAlreadyDispatched(idempotencyKey)) return { success: true, status: 200 };

      if (!RESEND_API_KEY) {
        await logNotification({
          scope,
          vendor_id: vendorId,
          channel: 'email',
          provider: 'resend',
          recipient: email,
          status: 'provider_unavailable',
          idempotency_key: idempotencyKey,
          error_message: 'Falta RESEND_API_KEY en Supabase Secrets'
        });
        return { success: false, status: 503, error: 'Falta RESEND_API_KEY en Supabase Secrets' };
      }

      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            from: RESEND_FROM,
            to: [email],
            subject: subject,
            html: body.includes('<') ? body : `<div style="font-family: sans-serif; padding: 20px; color: #333;"><h2 style="color: #6366f1;">Collectibles Store</h2><p>${body}</p></div>`,
            text: body.replace(/<[^>]*>?/gm, '')
          })
        });

        const resData = await res.json();
        if (!res.ok) {
          const errMsg = resData?.message || resData?.error || JSON.stringify(resData);
          await logNotification({
            scope,
            vendor_id: vendorId,
            channel: 'email',
            provider: 'resend',
            recipient: email,
            status: 'failed',
            idempotency_key: idempotencyKey,
            error_message: errMsg
          });
          return { success: false, status: res.status || 502, error: errMsg };
        }

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
        return { success: true, status: 200, provider_message_id: resData?.id || null };
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
        return { success: false, status: 500, error: err.message };
      }
    };

    const getActiveEmailRecipients = async (scope: 'admin' | 'vendor', vendorId?: string | null): Promise<{ name: string; email: string }[]> => {
      try {
        if (scope === 'vendor' && vendorId) {
          const { data } = await supabaseAdmin
            .from('vendor_notification_settings')
            .select('email_recipients')
            .eq('vendor_id', vendorId)
            .maybeSingle();

          const raw = data?.email_recipients || [];
          const active = raw.filter((r: any) => r.active && r.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(r.email).trim()));
          return active.map((r: any) => ({ name: r.name || 'Vendedor', email: String(r.email).trim() }));
        } else {
          const { data } = await supabaseAdmin
            .from('admin_notification_settings')
            .select('email_recipients')
            .maybeSingle();

          const raw = data?.email_recipients || [];
          const active = raw.filter((r: any) => r.active && r.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(r.email).trim()));
          return active.map((r: any) => ({ name: r.name || 'Admin', email: String(r.email).trim() }));
        }
      } catch (err) {
        console.error('[Notification Dispatcher] Error loading email recipients:', err);
      }
      return [];
    };

    // 6. EVENT PROCESSORS

    if (event_type === 'order_paid') {
      const { data: order } = await supabaseAdmin
        .from('orders')
        .select('*')
        .eq('id', order_id)
        .single();

      if (!order) throw new Error("Order not found");

      // ════════════════════════════════════════════════════════════════════════════════
      // VALIDACIÓN ROBUSTA DE PAGO REALMENTE PROCESADO (VALIDACIÓN 1 OBLIGATORIA)
      // Condición estricta certificada en producción:
      // payment_processed_at IS NOT NULL AND payment_status IN ('approved', 'paid')
      // Un cambio administrativo de status (e.g. status='confirmed') SIN payment_processed_at
      // o SIN payment_status IN ('approved', 'paid') genera EXACTAMENTE 0 NOTIFICACIONES.
      // ════════════════════════════════════════════════════════════════════════════════
      const isPaymentCertifiedProcessed = order.payment_processed_at !== null && (order.payment_status === 'approved' || order.payment_status === 'paid' || order.payment_status === 'accredited');

      if (!isPaymentCertifiedProcessed) {
        console.log(`[Notification Dispatcher] REJECTED order_paid for order ${order_id} — payment NOT certified as processed (payment_processed_at: ${order.payment_processed_at}, payment_status: ${order.payment_status}, status: ${order.status})`);
        return new Response(JSON.stringify({
          success: true,
          skipped: true,
          reason: 'payment_not_certified_processed',
          details: {
            order_id,
            status: order.status,
            payment_status: order.payment_status,
            payment_processed_at: order.payment_processed_at
          }
        }), { headers: corsHeaders });
      }

      const { data: items } = await supabaseAdmin
        .from('order_items')
        .select('id, quantity, unit_price, product_id, vendor_id, products(title, vendor_id, vendors(store_name, user_id))')
        .eq('order_id', order_id);

      const itemsList = items || [];
      const orderNumStr = formatOrderNumber(order);

      const vendorItemsMap: Record<string, { store_name: string; vendor_user_id: string | null; items: { product_name: string; quantity: number }[]; total: number }> = {};
      let collectiblesItems: { product_name: string; quantity: number }[] = [];
      let collectiblesTotal = 0;

      for (const item of itemsList) {
        const product = item.products;
        const vendorId = item.vendor_id || product?.vendor_id;
        const productName = product?.title || 'Producto';
        const itemSubtotal = Number(item.unit_price || 0) * item.quantity;

        if (vendorId) {
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
          vendorItemsMap[vendorId].items.push({ product_name: productName, quantity: item.quantity });
          vendorItemsMap[vendorId].total += itemSubtotal;
        } else {
          collectiblesItems.push({ product_name: productName, quantity: item.quantity });
          collectiblesTotal += itemSubtotal;
        }
      }

      // 1. Dispatch Vendor Notifications (Strict Multi-Vendor Isolation)
      for (const [vendorId, group] of Object.entries(vendorItemsMap)) {
        const { data: vSettings } = await supabaseAdmin
          .from('vendor_notification_settings')
          .select('*')
          .eq('vendor_id', vendorId)
          .maybeSingle();

        const isVendorActive = vSettings ? (vSettings.is_active && vSettings.notify_new_sale !== false) : true;
        if (!isVendorActive) continue;

        const channelPrefs = vSettings?.channel_preferences || { push: true, email: true };

        const tpl = notificationTemplates.vendor_order_paid({
          orderNumber: orderNumStr,
          orderId: order.id,
          vendorTotal: group.total,
          items: group.items
        });

        // PUSH VENDOR
        if (channelPrefs.push !== false) {
          const pushKey = `vendor_order_paid:${order.id}:${vendorId}:push`;
          const vendorUserIds = group.vendor_user_id ? [group.vendor_user_id] : [];
          await dispatchPushProvider(vendorUserIds, vendorId, tpl.push.title, tpl.push.body, tpl.deepLink, pushKey, 'vendor');
        }

        // EMAIL VENDOR
        if (channelPrefs.email !== false) {
          const activeEmails = await getActiveEmailRecipients('vendor', vendorId);
          for (let i = 0; i < activeEmails.length; i++) {
            const recipient = activeEmails[i];
            const emailKey = `vendor_order_paid:${order.id}:${vendorId}:email:${i}`;
            await dispatchEmailProvider(recipient.email, tpl.email.subject, tpl.email.html, emailKey, 'vendor', vendorId);
          }
        }
      }

      // 2. Dispatch Admin Notifications (ONLY for Collectibles own products)
      if (collectiblesTotal > 0 && collectiblesItems.length > 0) {
        const { data: adminSettings } = await supabaseAdmin
          .from('admin_notification_settings')
          .select('*')
          .eq('is_singleton', true)
          .maybeSingle();

        const isAdminActive = adminSettings ? (adminSettings.is_active && adminSettings.notify_own_sales !== false) : true;
        if (isAdminActive) {
          const channelPrefs = adminSettings?.channel_preferences || { push: true, email: true };
          
          const adminTpl = notificationTemplates.admin_own_order_paid({
            orderNumber: orderNumStr,
            orderId: order.id,
            collectiblesTotal,
            items: collectiblesItems
          });

          // PUSH ADMIN
          if (channelPrefs.push !== false) {
            const adminPushKey = `admin_own_order_paid:${order.id}:push`;
            await dispatchPushProvider([], null, adminTpl.push.title, adminTpl.push.body, adminTpl.deepLink, adminPushKey, 'admin');
          }

          // EMAIL ADMIN
          if (channelPrefs.email !== false) {
            const activeAdminEmails = await getActiveEmailRecipients('admin', null);
            for (let i = 0; i < activeAdminEmails.length; i++) {
              const recipient = activeAdminEmails[i];
              const adminEmailKey = `admin_own_order_paid:${order.id}:email:${i}`;
              await dispatchEmailProvider(recipient.email, adminTpl.email.subject, adminTpl.email.html, adminEmailKey, 'admin', null);
            }
          }
        }
      }

    } else if (event_type === 'order_cancelled') {
      const { data: order } = await supabaseAdmin
        .from('orders')
        .select('*')
        .eq('id', order_id)
        .single();

      if (!order) throw new Error("Order not found");

      // REQUIREMENT 8 & 23: Only notify commercial cancellation if order was previously certified as paid/confirmed!
      const werePreviouslyPaid = order.payment_processed_at !== null || order.payment_status === 'approved' || order.payment_status === 'paid' || order.payment_status === 'refunded' || order.status === 'refunded';
      
      const { data: paidLog } = await supabaseAdmin
        .from('notification_logs')
        .select('id')
        .eq('event_type', 'order_paid')
        .like('idempotency_key', `%:${order_id}:%`)
        .limit(1)
        .maybeSingle();

      if (!werePreviouslyPaid && !paidLog) {
        console.log(`[Notification Dispatcher] Skipping order_cancelled for order ${order_id} — order was never paid/confirmed`);
        return new Response(JSON.stringify({ success: true, skipped: true, reason: 'order_never_paid' }), { headers: corsHeaders });
      }

      const { data: items } = await supabaseAdmin
        .from('order_items')
        .select('vendor_id, products(vendor_id, vendors(user_id))')
        .eq('order_id', order_id);

      const vendorIds = new Set<string>();
      const vendorUserMap: Record<string, string | null> = {};

      for (const item of (items || [])) {
        const vId = item.vendor_id || item.products?.vendor_id;
        if (vId) {
          vendorIds.add(vId);
          vendorUserMap[vId] = item.products?.vendors?.user_id || null;
        }
      }

      const orderNumStr = formatOrderNumber(order);

      // Notify Vendors
      for (const vendorId of vendorIds) {
        const { data: vSettings } = await supabaseAdmin
          .from('vendor_notification_settings')
          .select('*')
          .eq('vendor_id', vendorId)
          .maybeSingle();

        const channelPrefs = vSettings?.channel_preferences || { push: true, email: true };
        const tpl = notificationTemplates.order_cancelled({ orderNumber: orderNumStr, orderId: order.id, isVendor: true });

        if (channelPrefs.push !== false) {
          const vendorUserIds = vendorUserMap[vendorId] ? [vendorUserMap[vendorId]!] : [];
          const pushKey = `order_cancelled:${order.id}:${vendorId}:push`;
          await dispatchPushProvider(vendorUserIds, vendorId, tpl.push.title, tpl.push.body, tpl.deepLink, pushKey, 'vendor');
        }

        if (channelPrefs.email !== false) {
          const activeEmails = await getActiveEmailRecipients('vendor', vendorId);
          for (let i = 0; i < activeEmails.length; i++) {
            const recipient = activeEmails[i];
            const emailKey = `order_cancelled:${order.id}:${vendorId}:email:${i}`;
            await dispatchEmailProvider(recipient.email, tpl.email.subject, tpl.email.html, emailKey, 'vendor', vendorId);
          }
        }
      }

      // Notify Admin
      const { data: adminSettings } = await supabaseAdmin
        .from('admin_notification_settings')
        .select('*')
        .eq('is_singleton', true)
        .maybeSingle();

      const channelPrefs = adminSettings?.channel_preferences || { push: true, email: true };
      const adminTpl = notificationTemplates.order_cancelled({ orderNumber: orderNumStr, orderId: order.id, isVendor: false });

      if (channelPrefs.push !== false) {
        const pushKey = `order_cancelled:${order.id}:admin:push`;
        await dispatchPushProvider([], null, adminTpl.push.title, adminTpl.push.body, adminTpl.deepLink, pushKey, 'admin');
      }

      if (channelPrefs.email !== false) {
        const activeAdminEmails = await getActiveEmailRecipients('admin', null);
        for (let i = 0; i < activeAdminEmails.length; i++) {
          const recipient = activeAdminEmails[i];
          const emailKey = `order_cancelled:${order.id}:admin:email:${i}`;
          await dispatchEmailProvider(recipient.email, adminTpl.email.subject, adminTpl.email.html, adminEmailKey, 'admin', null);
        }
      }

    } else if (event_type === 'admin_vendor_daily_summary') {
      const { date_str, vendor_rows, marketplace_total, order_count, vendor_count, commission_total } = body;

      // REQUIREMENT 13: Zero sales guard
      if (!vendor_count || vendor_count === 0 || !vendor_rows || vendor_rows.length === 0) {
        console.log(`[Notification Dispatcher] Skipping daily summary — 0 vendor sales in period.`);
        return new Response(JSON.stringify({ success: true, skipped: true, reason: 'no_vendor_sales' }), { headers: corsHeaders });
      }

      const { data: adminSettings } = await supabaseAdmin
        .from('admin_notification_settings')
        .select('*')
        .eq('is_singleton', true)
        .maybeSingle();

      const isAdminActive = adminSettings ? (adminSettings.is_active && adminSettings.notify_vendor_sales !== false) : true;
      if (!isAdminActive) {
        return new Response(JSON.stringify({ success: true, skipped: true, reason: 'admin_notifications_disabled' }), { headers: corsHeaders });
      }

      const channelPrefs = adminSettings?.channel_preferences || { push: true, email: true };
      const tpl = notificationTemplates.admin_vendor_daily_summary({
        dateStr: date_str || new Date().toLocaleDateString('es-UY'),
        vendorRows: (vendor_rows || []).map((r: any) => ({
          storeName: r.store_name,
          orderCount: r.order_count,
          totalAmount: r.total_amount
        })),
        marketplaceTotal: marketplace_total || 0,
        orderCount: order_count || 0,
        vendorCount: vendor_count || 0,
        commissionTotal: commission_total || 0
      });

      const dateKey = (date_str || new Date().toISOString().slice(0, 10)).replace(/\//g, '-');

      if (channelPrefs.push !== false) {
        const pushKey = `admin_vendor_daily_summary:${dateKey}:push`;
        await dispatchPushProvider([], null, tpl.push.title, tpl.push.body, tpl.deepLink, pushKey, 'admin');
      }

      if (channelPrefs.email !== false) {
        const activeAdminEmails = await getActiveEmailRecipients('admin', null);
        for (let i = 0; i < activeAdminEmails.length; i++) {
          const recipient = activeAdminEmails[i];
          const emailKey = `admin_vendor_daily_summary:${dateKey}:email:${i}`;
          await dispatchEmailProvider(recipient.email, tpl.email.subject, tpl.email.html, emailKey, 'admin', null);
        }
      }

    } else if (event_type === 'low_stock') {
      if (variant_id) {
        const cooldownKey = `low_stock:${variant_id}`;
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: recentLog } = await supabaseAdmin
          .from('notification_logs')
          .select('id')
          .eq('event_type', 'low_stock')
          .gte('created_at', twentyFourHoursAgo)
          .eq('idempotency_key', cooldownKey)
          .maybeSingle();

        if (!recentLog) {
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
              await dispatchPushProvider(vendorUserIds, vendorId, title, message, targetUrl, cooldownKey, 'vendor');
            }
          }
        }
      }

    } else if (event_type === 'test_notification') {
      const testChannel = body.channel || 'push';
      const targetUserId = (token === supabaseServiceKey) ? (body_user_ids?.[0] || authUserId) : authUserId;
      const testKey = `test:${testChannel}:${targetUserId || 'test'}:${Date.now()}`;

      if (testChannel === 'email') {
        const scope: 'admin' | 'vendor' = body_vendor_id ? 'vendor' : 'admin';
        const activeRecipients = await getActiveEmailRecipients(scope, body_vendor_id || null);

        if (activeRecipients.length === 0) {
          console.error("[Notification Dispatcher] Email test failed: No active email recipients found.");
          return new Response(JSON.stringify({ status: 'no_active_recipients', error: 'No hay destinatarios Email configurados.' }), { status: 422, headers: corsHeaders });
        }

        const vendorTag = body_vendor_id ? ' (Vendedor)' : '';
        const subject = body.subject || "Prueba de notificaciones — Collectibles";
        const emailMessage = body.body || `Esta es una notificación de prueba. El canal Email está funcionando correctamente.${vendorTag} ✅`;
        const htmlBody = `<div style="font-family: sans-serif; padding: 20px; color: #333;"><h2 style="color: #6366f1;">Collectibles Store</h2><p>${emailMessage}</p></div>`;

        let successCount = 0;
        let lastError: string | null = null;
        let lastStatus = 200;

        for (let i = 0; i < activeRecipients.length; i++) {
          const r = activeRecipients[i];
          const recipientKey = `${testKey}:${r.email}:${i}`;
          const result = await dispatchEmailProvider(r.email, subject, htmlBody, recipientKey, scope, body_vendor_id || null);

          if (result.success) {
            successCount++;
          } else {
            lastError = result.error || 'Error al entregar correo';
            lastStatus = result.status;
          }
        }

        if (successCount > 0) {
          return new Response(JSON.stringify({ success: true, count: successCount, total: activeRecipients.length, message: `Email de prueba enviado a ${successCount} destinatario(s) activo(s)` }), { status: 200, headers: corsHeaders });
        } else if (lastStatus === 503) {
          return new Response(JSON.stringify({ status: 'provider_unavailable', error: 'Falta RESEND_API_KEY en Supabase Secrets' }), { status: 503, headers: corsHeaders });
        } else {
          return new Response(JSON.stringify({ status: 'failed', error: lastError || 'Error al entregar correo vía Resend API' }), { status: lastStatus || 500, headers: corsHeaders });
        }
      } else {
        const title = body.title || "Collectibles Marketplace";
        const message = body.body || "Esta es una notificación de prueba. Todo está funcionando correctamente. ✅";
        const targetUrl = body.url || "https://collectibles.uy";

        if (targetUserId) {
          await dispatchPushProvider([targetUserId], body_vendor_id || null, title, message, targetUrl, testKey, body_vendor_id ? 'vendor' : 'admin');
        } else {
          await logNotification({
            scope: body_vendor_id ? 'vendor' : 'admin',
            vendor_id: body_vendor_id || null,
            channel: 'push',
            provider: 'onesignal',
            recipient: 'Usuario de prueba',
            status: 'provider_unavailable',
            idempotency_key: testKey,
            error_message: 'No se especificó un usuario autenticado para enviar la prueba.'
          });
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });

  } catch (error: any) {
    console.error("[Notification Dispatcher Error]:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: corsHeaders });
  }
});
