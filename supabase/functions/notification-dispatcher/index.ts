import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { notificationTemplates, formatCurrencyUYU, formatOrderNumber } from "../_shared/notificationTemplates.ts";

declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-collectibles-cron-secret, x-webhook-secret',
};

export function maskPhone(phone: string): string {
  if (!phone) return '********';
  const clean = phone.trim();
  if (clean.length <= 7) return '********';
  return `${clean.slice(0, 4)}******${clean.slice(-3)}`;
}

export function maskEmail(email: string): string {
  if (!email) return '***@***';
  const parts = email.split('@');
  if (parts.length !== 2) return '***@***';
  const name = parts[0];
  const maskedName = name.length > 2 ? `${name.slice(0, 2)}***` : '***';
  return `${maskedName}@${parts[1]}`;
}

export type RoleScope = 'customer' | 'vendor' | 'admin' | 'affiliate';

export interface NotificationPayload {
  event_type: string;
  scope?: RoleScope;
  vendor_id?: string | null;
  affiliate_id?: string | null;
  customer_id?: string | null;
  user_ids?: string[];
  recipient?: string;
  title?: string;
  body?: string;
  url?: string;
  idempotency_key?: string;
  outbox_id?: string;
  log_id?: string;
  order_id?: string;
  suborder_id?: string;
  payout_id?: string;
  liquidation_id?: string;
  variant_id?: string;
  product_id?: string;
  shipment_id?: string;
  question_id?: string;
  answer_id?: string;
  request_id?: string;
  dispute_id?: string;
  adjustment_id?: string;
  commission_id?: string;
  payout_request_id?: string;
  coupon_id?: string;
  webhook_secret?: string;
  channel?: string;
  subject?: string;
  batch_size?: number;
  // Additional context fields
  tracking_number?: string;
  tracking_url?: string;
  shipping_provider?: string;
  payment_status?: string;
  amount?: number;
  base_amount?: number;
  commission_rate?: number;
  reason?: string;
  status?: string;
  old_status?: string;
  request_type?: string;
  type_adj?: string;
  provider?: string;
  error_message?: string;
  code?: string;
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

    const body: NotificationPayload = await req.json().catch(() => ({ event_type: 'unknown' }));
    const {
      event_type,
      webhook_secret,
      order_id,
      vendor_id: body_vendor_id,
      user_ids: body_user_ids,
    } = body;

    // ════════════════════════════════════════════════════════════════════════
    // 1. AUTHENTICATION & AUTHORIZATION (Multi-Layer Server & User Auth)
    // ════════════════════════════════════════════════════════════════════════
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace(/^Bearer\s+/i, '').trim();
    const cronSecretHeader = req.headers.get('x-collectibles-cron-secret')?.trim();
    const webhookSecretHeader = req.headers.get('x-webhook-secret')?.trim() || webhook_secret;

    let isAuthorized = false;
    let isSystemCaller = false;
    let authUserId: string | null = null;
    let isAdmin = false;
    let isVendor = false;
    let isAffiliate = false;

    // Layer A: Service Role Key
    if (token && supabaseServiceKey && token === supabaseServiceKey) {
      isAuthorized = true;
      isSystemCaller = true;
    }

    // Layer B: Internal Vault Cron Secret (x-collectibles-cron-secret)
    if (!isAuthorized && cronSecretHeader && cronSecretHeader.length >= 16) {
      const envCronSecret = Deno.env.get('COLLECTIBLES_CRON_SECRET');
      if (envCronSecret && cronSecretHeader === envCronSecret) {
        isAuthorized = true;
        isSystemCaller = true;
      } else {
        const { data: cronValid } = await supabaseAdmin.rpc('verify_internal_cron_secret', { p_secret: cronSecretHeader });
        if (cronValid === true) {
          isAuthorized = true;
          isSystemCaller = true;
        }
      }
    }

    // Layer C: Webhook Secret from site_settings
    if (!isAuthorized && webhookSecretHeader) {
      const { data: secretSetting } = await supabaseAdmin
        .from('site_settings')
        .select('value')
        .eq('key', 'whatsapp_webhook_secret')
        .maybeSingle();
      if (secretSetting && secretSetting.value && secretSetting.value === webhookSecretHeader) {
        isAuthorized = true;
        isSystemCaller = true;
      }
    }

    // Layer D: Authenticated User JWT
    if (!isSystemCaller && token && token !== supabaseServiceKey) {
      try {
        const { data: userData } = await supabaseAdmin.auth.getUser(token);
        if (userData?.user) {
          authUserId = userData.user.id;
          isAuthorized = true;

          const { data: prof } = await supabaseAdmin
            .from('profiles')
            .select('is_admin, is_vendor, is_affiliate')
            .eq('id', authUserId)
            .maybeSingle();
          isAdmin = !!prof?.is_admin;
          isVendor = !!prof?.is_vendor;
          isAffiliate = !!prof?.is_affiliate;
        }
      } catch (err) {
        console.error("[Notification Dispatcher] Auth token check error:", err);
      }
    }

    if (!isAuthorized) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Granular operation-level permission check for non-system callers
    if (!isSystemCaller) {
      const adminOnlyEvents = ['admin_daily_summary', 'admin_vendor_daily_summary', 'order_dispute_opened', 'vendor_payout_processed', 'campaign_broadcast', 'process_outbox', 'retry_notification'];
      if (body.scope === 'admin' || adminOnlyEvents.includes(event_type)) {
        if (!isAdmin) {
          return new Response(JSON.stringify({ error: 'Forbidden: Admin privileges required for this event.' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }

      if (body.scope === 'vendor' || event_type.startsWith('vendor_')) {
        if (!isAdmin && (!isVendor || (body_vendor_id && body_vendor_id !== authUserId))) {
          return new Response(JSON.stringify({ error: 'Forbidden: Unauthorized vendor scope.' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }

      if (order_id && !isAdmin && !['product_question_received', 'product_question_answered'].includes(event_type)) {
        const { data: orderOwner } = await supabaseAdmin.from('orders').select('customer_id, user_id').eq('id', order_id).maybeSingle();
        const isOrderOwner = orderOwner && (orderOwner.customer_id === authUserId || orderOwner.user_id === authUserId);
        if (!isOrderOwner && !isVendor) {
          return new Response(JSON.stringify({ error: 'Forbidden: Cannot trigger notifications for orders you do not own.' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // 2. LOAD PROVIDER SECRETS & CONFIGURATION
    // ════════════════════════════════════════════════════════════════════════
    const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID') || '00a0c8cc-6b24-4ad1-9503-2e329ee5c566';
    const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY') || '';

    const { data: waSettings } = await supabaseAdmin
      .from('site_settings')
      .select('key, value')
      .in('key', ['whatsapp_token', 'whatsapp_phone_id', 'resend_api_key', 'resend_from']);

    const waConfig = Object.fromEntries((waSettings || []).map((s: any) => [s.key, s.value]));
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || waConfig.resend_api_key || '';
    const RESEND_FROM = Deno.env.get('RESEND_FROM') || waConfig.resend_from || 'Collectibles Marketplace <notificaciones@collectibles.uy>';
    const WHATSAPP_TOKEN = Deno.env.get('WHATSAPP_TOKEN') || waConfig.whatsapp_token || '';
    const WHATSAPP_PHONE_ID = Deno.env.get('WHATSAPP_PHONE_ID') || waConfig.whatsapp_phone_id || '';
    const isWhatsAppConfigured = Boolean(
      WHATSAPP_TOKEN &&
      WHATSAPP_TOKEN !== 'mock-whatsapp-key' &&
      WHATSAPP_PHONE_ID &&
      WHATSAPP_PHONE_ID !== '1234567890'
    );

    // ════════════════════════════════════════════════════════════════════════
    // 3. HELPERS: IDEMPOTENCY, LOGGING, IN-APP FEED & CHANNEL PROVIDERS
    // ════════════════════════════════════════════════════════════════════════
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

    const logNotification = async (params: {
      scope: RoleScope;
      vendor_id?: string | null;
      affiliate_id?: string | null;
      user_id?: string | null;
      order_id?: string | null;
      suborder_id?: string | null;
      outbox_id?: string | null;
      event_type: string;
      channel: 'push' | 'whatsapp' | 'email' | 'sms' | 'in_app';
      provider: string;
      recipient: string;
      status: 'queued' | 'processing' | 'sent' | 'delivered' | 'failed' | 'retrying' | 'exhausted' | 'provider_unavailable';
      idempotency_key?: string;
      provider_message_id?: string | null;
      error_message?: string | null;
      is_permanent_error?: boolean;
      attempts?: number;
      metadata?: Record<string, any>;
    }) => {
      const maskedRecipient = params.channel === 'email'
        ? maskEmail(params.recipient)
        : params.channel === 'whatsapp' || params.channel === 'sms'
        ? maskPhone(params.recipient)
        : params.recipient;

      try {
        const recordPayload: Record<string, any> = {
          scope: params.scope,
          vendor_id: params.vendor_id || null,
          affiliate_id: params.affiliate_id || null,
          user_id: params.user_id || null,
          order_id: params.order_id || null,
          suborder_id: params.suborder_id || null,
          outbox_id: params.outbox_id || null,
          event_type: params.event_type,
          recipient_number_masked: maskedRecipient || 'N/A',
          channel: params.channel,
          provider: params.provider,
          status: params.status,
          idempotency_key: params.idempotency_key || null,
          provider_message_id: params.provider_message_id || null,
          error_message: params.error_message || null,
          is_permanent_error: params.is_permanent_error ?? false,
          attempts: params.attempts ?? 1,
          metadata: params.metadata || {},
          sent_at: params.status === 'sent' || params.status === 'delivered' ? new Date().toISOString() : null,
        };

        if (params.idempotency_key) {
          await supabaseAdmin
            .from('notification_logs')
            .upsert(recordPayload, { onConflict: 'idempotency_key' });
        } else {
          await supabaseAdmin.from('notification_logs').insert(recordPayload);
        }
      } catch (err: any) {
        console.error(`[Log Error] Failed to log notification record:`, err.message);
      }
    };

    // Helper: Insert into Unified In-App Activity Center (user_notifications)
    const dispatchInAppNotification = async (params: {
      user_id?: string | null;
      role_scope: RoleScope;
      vendor_id?: string | null;
      affiliate_id?: string | null;
      category: string;
      event_type: string;
      title: string;
      body: string;
      action_url?: string | null;
      entity_type?: string | null;
      entity_id?: string | null;
      severity?: string;
      idempotency_key: string;
      metadata?: Record<string, any>;
    }): Promise<boolean> => {
      try {
        // Resolve user_id if vendor or affiliate provided without user_id
        let resolvedUserId = params.user_id || null;
        if (!resolvedUserId && params.vendor_id) {
          resolvedUserId = params.vendor_id; // vendors.id == profiles.id in Collectibles schema
        }
        if (!resolvedUserId && params.affiliate_id) {
          resolvedUserId = params.affiliate_id; // affiliates.id == profiles.id
        }

        const { error } = await supabaseAdmin
          .from('user_notifications')
          .upsert({
            user_id: resolvedUserId,
            role_scope: params.role_scope,
            vendor_id: params.vendor_id || null,
            affiliate_id: params.affiliate_id || null,
            category: params.category || 'general',
            event_type: params.event_type,
            title: params.title,
            body: params.body,
            action_url: params.action_url || null,
            entity_type: params.entity_type || null,
            entity_id: params.entity_id || null,
            severity: params.severity || 'info',
            idempotency_key: params.idempotency_key,
            metadata: params.metadata || {},
          }, { onConflict: 'idempotency_key', ignoreDuplicates: true });

        if (error) {
          console.warn('[In-App Notification Warning]:', error.message);
          return false;
        }
        return true;
      } catch (err: any) {
        console.error('[In-App Notification Error]:', err.message);
        return false;
      }
    };

    // Helper: Check User / Role Preferences
    const checkUserPreferences = async (
      userId: string | null | undefined,
      roleScope: RoleScope,
      category: string,
      isTransactionalMandatory: boolean = false
    ): Promise<{ email: boolean; push: boolean; in_app: boolean; whatsapp: boolean }> => {
      const defaults = { email: true, push: true, in_app: true, whatsapp: isWhatsAppConfigured };
      if (!userId) return defaults;

      try {
        const { data: pref } = await supabaseAdmin
          .from('notification_preferences')
          .select('channels, categories')
          .eq('user_id', userId)
          .eq('role_scope', roleScope)
          .maybeSingle();

        if (!pref) return defaults;

        const channels = pref.channels || {};
        const categories = pref.categories || {};
        const catAllowed = isTransactionalMandatory ? true : (categories[category] !== false);

        return {
          email: isTransactionalMandatory ? true : (catAllowed && channels.email !== false),
          push: catAllowed && channels.push !== false,
          in_app: true, // Activity center always records history
          whatsapp: catAllowed && channels.whatsapp === true && isWhatsAppConfigured,
        };
      } catch {
        return defaults;
      }
    };

    // Provider 1: OneSignal Push
    const dispatchPushProvider = async (
      userIds: string[],
      vendorId: string | null,
      title: string,
      message: string,
      targetUrl: string,
      idempotencyKey: string,
      scope: RoleScope,
      evType: string,
      extraMeta?: { order_id?: string | null; suborder_id?: string | null; affiliate_id?: string | null; outbox_id?: string | null }
    ): Promise<{ success: boolean; transientError?: boolean; error?: string }> => {
      if (await isAlreadyDispatched(idempotencyKey)) {
        return { success: true };
      }

      if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
        await logNotification({
          scope,
          vendor_id: vendorId,
          user_id: userIds[0] || null,
          affiliate_id: extraMeta?.affiliate_id || null,
          order_id: extraMeta?.order_id || null,
          suborder_id: extraMeta?.suborder_id || null,
          outbox_id: extraMeta?.outbox_id || null,
          event_type: evType,
          channel: 'push',
          provider: 'onesignal',
          recipient: userIds.join(',') || (vendorId || scope),
          status: 'provider_unavailable',
          idempotency_key: idempotencyKey,
          is_permanent_error: true,
          error_message: 'ONESIGNAL_REST_API_KEY no configurado en Supabase Secrets.'
        });
        return { success: false, transientError: false, error: 'ONESIGNAL_REST_API_KEY no configurado' };
      }

      const validUserIds = userIds.filter(Boolean);
      const payload: any = {
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
        } else if (scope === 'admin') {
          query = query.is('vendor_id', null);
        }

        const { data: devices } = await query;
        const subscriptionIds = (devices || []).map((d: any) => d.provider_subscription_id).filter(Boolean);

        if (subscriptionIds.length === 0) {
          await logNotification({
            scope,
            vendor_id: vendorId,
            order_id: extraMeta?.order_id || null,
            outbox_id: extraMeta?.outbox_id || null,
            event_type: evType,
            channel: 'push',
            provider: 'onesignal',
            recipient: 'Sin dispositivos registrados',
            status: 'provider_unavailable',
            idempotency_key: idempotencyKey,
            is_permanent_error: true,
            error_message: 'Sin dispositivos push activos registrados'
          });
          return { success: false, transientError: false, error: 'Sin dispositivos push activos' };
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
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10000),
        });

        const resData = await response.json().catch(() => ({}));
        if (!response.ok) {
          const isTransient = response.status >= 500 || response.status === 429;
          const errStr = resData?.errors?.[0] || JSON.stringify(resData);
          await logNotification({
            scope,
            vendor_id: vendorId,
            user_id: validUserIds[0] || null,
            order_id: extraMeta?.order_id || null,
            outbox_id: extraMeta?.outbox_id || null,
            event_type: evType,
            channel: 'push',
            provider: 'onesignal',
            recipient: validUserIds[0] || 'Push Device',
            status: isTransient ? 'retrying' : 'failed',
            idempotency_key: idempotencyKey,
            is_permanent_error: !isTransient,
            error_message: errStr
          });
          return { success: false, transientError: isTransient, error: errStr };
        }

        await logNotification({
          scope,
          vendor_id: vendorId,
          user_id: validUserIds[0] || null,
          order_id: extraMeta?.order_id || null,
          suborder_id: extraMeta?.suborder_id || null,
          affiliate_id: extraMeta?.affiliate_id || null,
          outbox_id: extraMeta?.outbox_id || null,
          event_type: evType,
          channel: 'push',
          provider: 'onesignal',
          recipient: validUserIds.length > 0 ? `${validUserIds.length} usuario(s)` : 'Dispositivo(s) registrados',
          status: 'sent', // Accepted by OneSignal (not falsely declared delivered until webhook confirmation)
          idempotency_key: idempotencyKey,
          provider_message_id: resData?.id || null
        });

        return { success: true };
      } catch (err: any) {
        console.error(`[Push API Error]`, err.message);
        await logNotification({
          scope,
          vendor_id: vendorId,
          user_id: validUserIds[0] || null,
          order_id: extraMeta?.order_id || null,
          outbox_id: extraMeta?.outbox_id || null,
          event_type: evType,
          channel: 'push',
          provider: 'onesignal',
          recipient: 'Error Push',
          status: 'retrying',
          idempotency_key: idempotencyKey,
          is_permanent_error: false,
          error_message: err.message
        });
        return { success: false, transientError: true, error: err.message };
      }
    };

    // Provider 2: Resend Email
    const dispatchEmailProvider = async (
      email: string,
      subject: string,
      bodyHtml: string,
      idempotencyKey: string,
      scope: RoleScope,
      vendorId: string | null,
      evType: string,
      extraMeta?: { user_id?: string | null; affiliate_id?: string | null; order_id?: string | null; suborder_id?: string | null; outbox_id?: string | null }
    ): Promise<{ success: boolean; status: number; transientError?: boolean; error?: string; provider_message_id?: string | null }> => {
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        return { success: false, status: 422, transientError: false, error: 'Dirección de correo inválida' };
      }
      if (await isAlreadyDispatched(idempotencyKey)) {
        return { success: true, status: 200 };
      }

      if (!RESEND_API_KEY || RESEND_API_KEY === 'mock-resend-key') {
        await logNotification({
          scope,
          vendor_id: vendorId,
          user_id: extraMeta?.user_id || null,
          affiliate_id: extraMeta?.affiliate_id || null,
          order_id: extraMeta?.order_id || null,
          suborder_id: extraMeta?.suborder_id || null,
          outbox_id: extraMeta?.outbox_id || null,
          event_type: evType,
          channel: 'email',
          provider: 'resend',
          recipient: email,
          status: 'provider_unavailable',
          idempotency_key: idempotencyKey,
          is_permanent_error: true,
          error_message: 'Falta RESEND_API_KEY en Supabase Secrets'
        });
        return { success: false, status: 503, transientError: false, error: 'Falta RESEND_API_KEY en Supabase Secrets' };
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
            to: [email.trim()],
            subject: subject,
            html: bodyHtml.includes('<') ? bodyHtml : `<div style="font-family: sans-serif; padding: 20px; color: #333;"><h2 style="color: #f00856;">Collectibles.uy</h2><p>${bodyHtml}</p></div>`,
            text: bodyHtml.replace(/<[^>]*>?/gm, '')
          }),
          signal: AbortSignal.timeout(10000),
        });

        const resData = await res.json().catch(() => ({}));
        if (!res.ok) {
          const isTransient = res.status >= 500 || res.status === 429;
          const errMsg = resData?.message || resData?.error || JSON.stringify(resData);
          await logNotification({
            scope,
            vendor_id: vendorId,
            user_id: extraMeta?.user_id || null,
            affiliate_id: extraMeta?.affiliate_id || null,
            order_id: extraMeta?.order_id || null,
            suborder_id: extraMeta?.suborder_id || null,
            outbox_id: extraMeta?.outbox_id || null,
            event_type: evType,
            channel: 'email',
            provider: 'resend',
            recipient: email,
            status: isTransient ? 'retrying' : 'failed',
            idempotency_key: idempotencyKey,
            is_permanent_error: !isTransient,
            error_message: errMsg,
            metadata: { subject, recipient_email: email }
          });
          return { success: false, status: res.status || 502, transientError: isTransient, error: errMsg };
        }

        await logNotification({
          scope,
          vendor_id: vendorId,
          user_id: extraMeta?.user_id || null,
          affiliate_id: extraMeta?.affiliate_id || null,
          order_id: extraMeta?.order_id || null,
          suborder_id: extraMeta?.suborder_id || null,
          outbox_id: extraMeta?.outbox_id || null,
          event_type: evType,
          channel: 'email',
          provider: 'resend',
          recipient: email,
          status: 'sent', // Accepted by Resend API
          idempotency_key: idempotencyKey,
          provider_message_id: resData?.id || null,
          metadata: { subject }
        });

        // Also mirror into legacy email_logs for full backward compatibility
        try {
          await supabaseAdmin.from('email_logs').insert({
            customer_id: extraMeta?.user_id || null,
            recipient_email: maskEmail(email),
            subject,
            email_type: evType,
            status: 'sent',
            provider_message_id: resData?.id || null
          });
        } catch {
          // non-blocking
        }

        return { success: true, status: 200, provider_message_id: resData?.id || null };
      } catch (err: any) {
        await logNotification({
          scope,
          vendor_id: vendorId,
          user_id: extraMeta?.user_id || null,
          affiliate_id: extraMeta?.affiliate_id || null,
          order_id: extraMeta?.order_id || null,
          suborder_id: extraMeta?.suborder_id || null,
          outbox_id: extraMeta?.outbox_id || null,
          event_type: evType,
          channel: 'email',
          provider: 'resend',
          recipient: email,
          status: 'retrying',
          idempotency_key: idempotencyKey,
          is_permanent_error: false,
          error_message: err.message
        });
        return { success: false, status: 500, transientError: true, error: err.message };
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
          if (active.length > 0) {
            return active.map((r: any) => ({ name: r.name || 'Vendedor', email: String(r.email).trim() }));
          }
          // Fallback to vendor contact_email or profile email
          const { data: vRow } = await supabaseAdmin.from('vendors').select('contact_email, store_name').eq('id', vendorId).maybeSingle();
          if (vRow?.contact_email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(vRow.contact_email.trim())) {
            return [{ name: vRow.store_name || 'Vendedor', email: vRow.contact_email.trim() }];
          }
          const { data: pRow } = await supabaseAdmin.from('profiles').select('email, first_name').eq('id', vendorId).maybeSingle();
          if (pRow?.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pRow.email.trim())) {
            return [{ name: pRow.first_name || 'Vendedor', email: pRow.email.trim() }];
          }
          return [];
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

    // ════════════════════════════════════════════════════════════════════════
    // 4. CORE EVENT PROCESSOR FUNCTION (Can be called directly or from Outbox)
    // ════════════════════════════════════════════════════════════════════════
    const processSingleEvent = async (evPayload: NotificationPayload): Promise<{ success: boolean; transientFailure?: boolean; skipped?: boolean; reason?: string; error?: string }> => {
      const evType = evPayload.event_type;
      const evOrderId = evPayload.order_id;
      const evSuborderId = evPayload.suborder_id;
      const evOutboxId = evPayload.outbox_id || null;
      let anyTransientFailure = false;

      // ----------------------------------------------------------------------
      // A. ORDER CREATED (Pending payment)
      // ----------------------------------------------------------------------
      if (evType === 'order_created' && evOrderId) {
        const { data: order } = await supabaseAdmin.from('orders').select('*').eq('id', evOrderId).maybeSingle();
        if (!order) return { success: true, skipped: true, reason: 'order_not_found' };

        const orderNumStr = formatOrderNumber(order);
        const customerId = order.customer_id || order.user_id || null;
        const tpl = notificationTemplates.customer_order_created({
          orderNumber: orderNumStr,
          orderId: order.id,
          totalAmount: Number(order.total_amount || 0),
          currency: order.currency || 'UYU'
        });

        // Customer In-App Activity
        if (customerId) {
          await dispatchInAppNotification({
            user_id: customerId,
            role_scope: 'customer',
            category: 'purchases',
            event_type: 'order_created',
            title: tpl.inApp.title,
            body: tpl.inApp.body,
            action_url: `/account?tab=orders&order_id=${order.id}`,
            entity_type: 'order',
            entity_id: order.id,
            severity: 'info',
            idempotency_key: `inapp:customer:order_created:${order.id}`
          });
        }

        // Preliminary Affiliate Activity if order has affiliate_id or coupon tied to affiliate
        let affId = order.affiliate_id;
        let usedCode = '';
        if (order.coupon_id) {
          const { data: cpn } = await supabaseAdmin.from('coupons').select('code, affiliate_id').eq('id', order.coupon_id).maybeSingle();
          if (cpn) {
            usedCode = cpn.code;
            if (!affId && cpn.affiliate_id) affId = cpn.affiliate_id;
          }
        }
        if (affId) {
          const { data: aff } = await supabaseAdmin.from('affiliates').select('id, code').eq('id', affId).maybeSingle();
          if (aff) {
            const codeStr = usedCode || aff.code;
            const affTpl = notificationTemplates.affiliate_event({
              eventSubType: 'code_used_checkout',
              code: codeStr,
              orderReference: orderNumStr,
              saleDate: order.created_at,
              statusLabel: 'Pendiente de pago (sin comisión aún)'
            });
            await dispatchInAppNotification({
              user_id: aff.id,
              affiliate_id: aff.id,
              role_scope: 'affiliate',
              category: 'commissions',
              event_type: 'affiliate_code_used_checkout',
              title: affTpl.inApp.title,
              body: affTpl.inApp.body,
              action_url: `/affiliate?tab=overview`,
              entity_type: 'order',
              entity_id: order.id,
              severity: 'info',
              idempotency_key: `inapp:affiliate:code_used:${order.id}:${aff.id}`
            });
          }
        }
        return { success: true };
      }

      // ----------------------------------------------------------------------
      // B. PAYMENT PENDING / OFFLINE
      // ----------------------------------------------------------------------
      if (evType === 'payment_pending' && evOrderId) {
        const { data: order } = await supabaseAdmin.from('orders').select('*').eq('id', evOrderId).maybeSingle();
        if (!order) return { success: true, skipped: true, reason: 'order_not_found' };

        const orderNumStr = formatOrderNumber(order);
        const customerId = order.customer_id || order.user_id || null;
        const tpl = notificationTemplates.customer_payment_pending({
          orderNumber: orderNumStr,
          orderId: order.id,
          totalAmount: Number(order.total_amount || 0),
          currency: order.currency || 'UYU',
          paymentMethod: order.payment_method
        });

        if (customerId) {
          await dispatchInAppNotification({
            user_id: customerId,
            role_scope: 'customer',
            category: 'payments',
            event_type: 'payment_pending',
            title: tpl.inApp.title,
            body: tpl.inApp.body,
            action_url: `/account?tab=orders&order_id=${order.id}`,
            entity_type: 'order',
            entity_id: order.id,
            severity: 'warning',
            idempotency_key: `inapp:customer:payment_pending:${order.id}`
          });
        }

        if (order.customer_email) {
          const emailRes = await dispatchEmailProvider(
            order.customer_email,
            tpl.email.subject,
            tpl.email.html,
            `customer_payment_pending:${order.id}:email`,
            'customer',
            null,
            'payment_pending',
            { user_id: customerId, order_id: order.id, outbox_id: evOutboxId }
          );
          if (emailRes.transientError) anyTransientFailure = true;
        }
        return { success: !anyTransientFailure, transientFailure: anyTransientFailure };
      }

      // ----------------------------------------------------------------------
      // C. PAYMENT REJECTED
      // ----------------------------------------------------------------------
      if (evType === 'payment_rejected' && evOrderId) {
        const { data: order } = await supabaseAdmin.from('orders').select('*').eq('id', evOrderId).maybeSingle();
        if (!order) return { success: true, skipped: true, reason: 'order_not_found' };
        // Do not notify rejected if order is already paid
        if (order.payment_status === 'approved' || order.status === 'paid') {
          return { success: true, skipped: true, reason: 'already_paid' };
        }

        const orderNumStr = formatOrderNumber(order);
        const customerId = order.customer_id || order.user_id || null;
        const tpl = notificationTemplates.customer_payment_rejected({
          orderNumber: orderNumStr,
          orderId: order.id,
          totalAmount: Number(order.total_amount || 0),
          currency: order.currency || 'UYU'
        });

        if (customerId) {
          await dispatchInAppNotification({
            user_id: customerId,
            role_scope: 'customer',
            category: 'payments',
            event_type: 'payment_rejected',
            title: tpl.inApp.title,
            body: tpl.inApp.body,
            action_url: `/account?tab=orders&order_id=${order.id}`,
            entity_type: 'order',
            entity_id: order.id,
            severity: 'error',
            idempotency_key: `inapp:customer:payment_rejected:${order.id}:${evPayload.idempotency_key || '1'}`
          });
        }

        // Also record in Admin Activity Feed
        await dispatchInAppNotification({
          role_scope: 'admin',
          category: 'payments',
          event_type: 'payment_rejected',
          title: `Pago rechazado — Pedido ${orderNumStr}`,
          body: `Intento de pago rechazado por ${formatCurrencyUYU(Number(order.total_amount || 0), order.currency || 'UYU')} (${order.payment_method || 'pasarela'}).`,
          action_url: `/admin/orders?order_id=${order.id}`,
          entity_type: 'order',
          entity_id: order.id,
          severity: 'warning',
          idempotency_key: `inapp:admin:payment_rejected:${order.id}:${evPayload.idempotency_key || '1'}`
        });

        if (order.customer_email) {
          const emailRes = await dispatchEmailProvider(
            order.customer_email,
            tpl.email.subject,
            tpl.email.html,
            `customer_payment_rejected:${order.id}:email`,
            'customer',
            null,
            'payment_rejected',
            { user_id: customerId, order_id: order.id, outbox_id: evOutboxId }
          );
          if (emailRes.transientError) anyTransientFailure = true;
        }
        return { success: !anyTransientFailure, transientFailure: anyTransientFailure };
      }

      // ----------------------------------------------------------------------
      // D. ORDER PAID (Customer + Vendors + Admin with Sales Mode Filter)
      // ----------------------------------------------------------------------
      if (evType === 'order_paid') {
        const { data: order } = await supabaseAdmin
          .from('orders')
          .select('*')
          .eq('id', evOrderId)
          .maybeSingle();

        if (!order) throw new Error("Order not found");

        // STRICT VALIDATION 1 OBLIGATORIA: payment_processed_at IS NOT NULL AND payment_status IN ('approved', 'paid', 'accredited')
        const isPaymentCertifiedProcessed = order.payment_processed_at !== null && (
          order.payment_status === 'approved' || order.payment_status === 'paid' || order.payment_status === 'accredited'
        );

        if (!isPaymentCertifiedProcessed) {
          console.log(`[Notification Dispatcher] REJECTED order_paid for order ${evOrderId} — payment NOT certified as processed`);
          return {
            success: true,
            skipped: true,
            reason: 'payment_not_certified_processed'
          };
        }

        const { data: items } = await supabaseAdmin
          .from('order_items')
          .select('id, quantity, unit_price, product_id, product_name, vendor_id, products(title, vendor_id, vendors(store_name, id))')
          .eq('order_id', evOrderId);

        const itemsList = items || [];
        const orderNumStr = formatOrderNumber(order);
        const customerId = order.customer_id || order.user_id || null;

        const vendorItemsMap: Record<string, { store_name: string; vendor_user_id: string | null; items: { product_name: string; quantity: number }[]; total: number }> = {};
        const collectiblesItems: { product_name: string; quantity: number }[] = [];
        const allOrderItemsFormatted: { product_name: string; quantity: number }[] = [];
        let collectiblesTotal = 0;
        let vendorTotalAll = 0;

        for (const item of itemsList) {
          const product: any = item.products;
          const vendorId = item.vendor_id || product?.vendor_id;
          const productName = item.product_name || product?.title || 'Producto';
          const itemSubtotal = Number(item.unit_price || 0) * item.quantity;

          allOrderItemsFormatted.push({ product_name: productName, quantity: item.quantity });

          if (vendorId) {
            if (!vendorItemsMap[vendorId]) {
              const storeName = product?.vendors?.store_name || 'Tienda';
              vendorItemsMap[vendorId] = {
                store_name: storeName,
                vendor_user_id: vendorId,
                items: [],
                total: 0
              };
            }
            vendorItemsMap[vendorId].items.push({ product_name: productName, quantity: item.quantity });
            vendorItemsMap[vendorId].total += itemSubtotal;
            vendorTotalAll += itemSubtotal;
          } else {
            collectiblesItems.push({ product_name: productName, quantity: item.quantity });
            collectiblesTotal += itemSubtotal;
          }
        }

        // D.1 CUSTOMER ORDER PAID CONFIRMATION (Unified in notification-dispatcher!)
        const isArgentina = (order.shipping_address?.country || '').toLowerCase().trim() === 'argentina' || (order.shipping_address?.country || '').toLowerCase().trim() === 'ar';
        const custTpl = notificationTemplates.customer_order_paid({
          orderNumber: orderNumStr,
          orderId: order.id,
          totalAmount: Number(order.total_amount || 0),
          currency: order.currency || 'UYU',
          displayTotal: order.display_total,
          displayCurrency: order.display_currency,
          fxRate: order.fx_rate,
          isArgentina,
          items: allOrderItemsFormatted
        });

        if (customerId) {
          await dispatchInAppNotification({
            user_id: customerId,
            role_scope: 'customer',
            category: 'purchases',
            event_type: 'order_paid',
            title: custTpl.inApp.title,
            body: custTpl.inApp.body,
            action_url: `/account?tab=orders&order_id=${order.id}`,
            entity_type: 'order',
            entity_id: order.id,
            severity: 'success',
            idempotency_key: `inapp:customer:order_paid:${order.id}`
          });

          const custPrefs = await checkUserPreferences(customerId, 'customer', 'purchases', true);
          if (custPrefs.push) {
            await dispatchPushProvider(
              [customerId],
              null,
              custTpl.push.title,
              custTpl.push.body,
              custTpl.deepLink,
              `customer_order_paid:${order.id}:push`,
              'customer',
              'order_paid',
              { order_id: order.id, outbox_id: evOutboxId }
            );
          }
        }

        if (order.customer_email) {
          // Check if legacy transactional-emails already sent 'order_confirmation' for this order to avoid duplicate email during transition
          const custEmailKey = `customer_order_paid:${order.id}:email`;
          const emailRes = await dispatchEmailProvider(
            order.customer_email,
            custTpl.email.subject,
            custTpl.email.html,
            custEmailKey,
            'customer',
            null,
            'order_paid',
            { user_id: customerId, order_id: order.id, outbox_id: evOutboxId }
          );
          if (emailRes.transientError) anyTransientFailure = true;
        }

        // D.2 VENDOR NOTIFICATIONS (Strict Multi-Vendor Isolation)
        for (const [vendorId, group] of Object.entries(vendorItemsMap)) {
          const { data: vSettings } = await supabaseAdmin
            .from('vendor_notification_settings')
            .select('*')
            .eq('vendor_id', vendorId)
            .maybeSingle();

          const tpl = notificationTemplates.vendor_order_paid({
            orderNumber: orderNumStr,
            orderId: order.id,
            vendorTotal: group.total,
            items: group.items
          });

          // Always record in Vendor In-App Activity Center
          await dispatchInAppNotification({
            user_id: vendorId,
            vendor_id: vendorId,
            role_scope: 'vendor',
            category: 'sales',
            event_type: 'order_paid',
            title: tpl.inApp.title,
            body: tpl.inApp.body,
            action_url: `/vendor?tab=orders&order_id=${order.id}`,
            entity_type: 'order',
            entity_id: order.id,
            severity: 'success',
            idempotency_key: `inapp:vendor:order_paid:${order.id}:${vendorId}`
          });

          const isVendorActive = vSettings ? (vSettings.is_active && vSettings.notify_new_sale !== false) : true;
          if (!isVendorActive) continue;

          const channelPrefs = vSettings?.channel_preferences || { push: true, email: true };

          if (channelPrefs.push !== false) {
            const pushKey = `vendor_order_paid:${order.id}:${vendorId}:push`;
            const vendorUserIds = group.vendor_user_id ? [group.vendor_user_id] : [vendorId];
            await dispatchPushProvider(vendorUserIds, vendorId, tpl.push.title, tpl.push.body, tpl.deepLink, pushKey, 'vendor', 'order_paid', { order_id: order.id, outbox_id: evOutboxId });
          }

          if (channelPrefs.email !== false) {
            const activeEmails = await getActiveEmailRecipients('vendor', vendorId);
            for (let i = 0; i < activeEmails.length; i++) {
              const recipient = activeEmails[i];
              const emailKey = `vendor_order_paid:${order.id}:${vendorId}:email:${i}`;
              const r = await dispatchEmailProvider(recipient.email, tpl.email.subject, tpl.email.html, emailKey, 'vendor', vendorId, 'order_paid', { user_id: vendorId, order_id: order.id, outbox_id: evOutboxId });
              if (r.transientError) anyTransientFailure = true;
            }
          }
        }

        // D.3 ADMIN NOTIFICATIONS (Configurable Sales Modes: own_only, all, vendors_only, international_only, influencer_only, daily_summary_only, custom)
        const { data: adminSettings } = await supabaseAdmin
          .from('admin_notification_settings')
          .select('*')
          .eq('is_singleton', true)
          .maybeSingle();

        const isInternationalOrder = Boolean(order.is_international);
        const isInfluencerOrder = Boolean(order.affiliate_id || order.coupon_id);
        const hasOwnItems = collectiblesTotal > 0 && collectiblesItems.length > 0;
        const hasVendorItems = vendorTotalAll > 0 && Object.keys(vendorItemsMap).length > 0;

        const salesMode = adminSettings?.sales_notification_mode || 'own_only';
        const isAdminMasterActive = adminSettings ? adminSettings.is_active !== false : true;

        // Always log the sale in Admin Activity Feed
        const saleTypeLabel = isInternationalOrder
          ? 'Internacional'
          : hasOwnItems && hasVendorItems
          ? 'Mixta (Collectibles + Vendor)'
          : hasVendorItems
          ? 'Marketplace Vendor'
          : 'Collectibles Propia';

        await dispatchInAppNotification({
          role_scope: 'admin',
          category: 'sales',
          event_type: 'order_paid',
          title: `🎉 Venta confirmada (${saleTypeLabel}) — ${orderNumStr}`,
          body: `Total orden: ${formatCurrencyUYU(Number(order.total_amount || 0), order.currency || 'UYU')}${isInfluencerOrder ? ' · Atribuida a Afiliado/Cupón' : ''}.`,
          action_url: `/admin/orders?order_id=${order.id}`,
          entity_type: 'order',
          entity_id: order.id,
          severity: 'success',
          idempotency_key: `inapp:admin:order_paid:${order.id}`
        });

        let shouldAlertAdminImmediately = false;
        let adminAlertItems = collectiblesItems;
        let adminAlertTotal = collectiblesTotal;

        if (isAdminMasterActive && salesMode !== 'daily_summary_only') {
          if (salesMode === 'all') {
            shouldAlertAdminImmediately = true;
            adminAlertItems = allOrderItemsFormatted;
            adminAlertTotal = Number(order.total_amount || 0);
          } else if (salesMode === 'own_only') {
            // Default backward-compatible behavior: own sales immediate
            if (hasOwnItems && adminSettings?.notify_own_sales !== false) {
              shouldAlertAdminImmediately = true;
              adminAlertItems = collectiblesItems;
              adminAlertTotal = collectiblesTotal;
            }
          } else if (salesMode === 'vendors_only') {
            if (hasVendorItems) {
              shouldAlertAdminImmediately = true;
              adminAlertItems = allOrderItemsFormatted;
              adminAlertTotal = vendorTotalAll;
            }
          } else if (salesMode === 'international_only') {
            if (isInternationalOrder) {
              shouldAlertAdminImmediately = true;
              adminAlertItems = allOrderItemsFormatted;
              adminAlertTotal = Number(order.total_amount || 0);
            }
          } else if (salesMode === 'influencer_only') {
            if (isInfluencerOrder) {
              shouldAlertAdminImmediately = true;
              adminAlertItems = allOrderItemsFormatted;
              adminAlertTotal = Number(order.total_amount || 0);
            }
          } else if (salesMode === 'custom') {
            if ((hasOwnItems && adminSettings?.notify_own_sales !== false) ||
                (hasVendorItems && adminSettings?.notify_vendor_sales === true) ||
                (isInternationalOrder && adminSettings?.notify_international_sales === true) ||
                (isInfluencerOrder && adminSettings?.notify_influencer_sales === true)) {
              shouldAlertAdminImmediately = true;
              adminAlertItems = hasOwnItems && !hasVendorItems ? collectiblesItems : allOrderItemsFormatted;
              adminAlertTotal = hasOwnItems && !hasVendorItems ? collectiblesTotal : Number(order.total_amount || 0);
            }
          }
        }

        if (shouldAlertAdminImmediately && adminAlertItems.length > 0) {
          const channelPrefs = adminSettings?.channel_preferences || { push: true, email: true };
          const adminTpl = notificationTemplates.admin_own_order_paid({
            orderNumber: orderNumStr,
            orderId: order.id,
            collectiblesTotal: adminAlertTotal,
            items: adminAlertItems,
            saleTypeLabel
          });

          if (channelPrefs.push !== false) {
            const adminPushKey = `admin_own_order_paid:${order.id}:push`;
            await dispatchPushProvider([], null, adminTpl.push.title, adminTpl.push.body, adminTpl.deepLink, adminPushKey, 'admin', 'order_paid', { order_id: order.id, outbox_id: evOutboxId });
          }

          if (channelPrefs.email !== false) {
            const activeAdminEmails = await getActiveEmailRecipients('admin', null);
            for (let i = 0; i < activeAdminEmails.length; i++) {
              const recipient = activeAdminEmails[i];
              const adminEmailKey = `admin_own_order_paid:${order.id}:email:${i}`;
              const r = await dispatchEmailProvider(recipient.email, adminTpl.email.subject, adminTpl.email.html, adminEmailKey, 'admin', null, 'order_paid', { order_id: order.id, outbox_id: evOutboxId });
              if (r.transientError) anyTransientFailure = true;
            }
          }
        }

        return { success: !anyTransientFailure, transientFailure: anyTransientFailure };
      }

      // ----------------------------------------------------------------------
      // E. SUBORDER / ORDER PREPARING & PREPARED
      // ----------------------------------------------------------------------
      if ((evType === 'suborder_preparing' || evType === 'suborder_prepared') && evOrderId) {
        const { data: order } = await supabaseAdmin.from('orders').select('*').eq('id', evOrderId).maybeSingle();
        if (!order) return { success: true, skipped: true };

        let suborderNumber: string | undefined = undefined;
        let subItems: { product_name: string; quantity: number }[] = [];

        if (evSuborderId) {
          const { data: sub } = await supabaseAdmin.from('order_suborders').select('*').eq('id', evSuborderId).maybeSingle();
          suborderNumber = sub?.suborder_number;
          const { data: oItems } = await supabaseAdmin.from('order_items').select('product_name, quantity, products(title)').eq('suborder_id', evSuborderId);
          subItems = (oItems || []).map((i: any) => ({ product_name: i.product_name || i.products?.title || 'Producto', quantity: i.quantity }));
        }

        const isPrepared = evType === 'suborder_prepared';
        const orderNumStr = formatOrderNumber(order);
        const customerId = order.customer_id || order.user_id || null;

        const tpl = notificationTemplates.customer_order_preparing({
          orderNumber: orderNumStr,
          orderId: order.id,
          suborderNumber,
          isPrepared,
          items: subItems
        });

        if (customerId) {
          await dispatchInAppNotification({
            user_id: customerId,
            role_scope: 'customer',
            category: 'shipments',
            event_type: evType,
            title: tpl.inApp.title,
            body: tpl.inApp.body,
            action_url: `/account?tab=orders&order_id=${order.id}`,
            entity_type: 'order',
            entity_id: order.id,
            severity: 'info',
            idempotency_key: `inapp:customer:${evType}:${evSuborderId || order.id}`
          });

          const prefs = await checkUserPreferences(customerId, 'customer', 'shipments', false);
          if (isPrepared && prefs.email && order.customer_email) {
            await dispatchEmailProvider(
              order.customer_email,
              tpl.email.subject,
              tpl.email.html,
              `customer_${evType}:${evSuborderId || order.id}:email`,
              'customer',
              null,
              evType,
              { user_id: customerId, order_id: order.id, suborder_id: evSuborderId || null, outbox_id: evOutboxId }
            );
          }
        }

        if (evPayload.vendor_id) {
          await dispatchInAppNotification({
            user_id: evPayload.vendor_id,
            vendor_id: evPayload.vendor_id,
            role_scope: 'vendor',
            category: 'shipments',
            event_type: evType,
            title: isPrepared ? `Suborden ${suborderNumber || orderNumStr} marcada como preparada` : `Suborden ${suborderNumber || orderNumStr} en preparación`,
            body: `Estado actualizado en tu panel de pedidos.`,
            action_url: `/vendor?tab=orders&order_id=${order.id}`,
            entity_type: 'suborder',
            entity_id: evSuborderId || order.id,
            severity: 'info',
            idempotency_key: `inapp:vendor:${evType}:${evSuborderId || order.id}`
          });
        }
        return { success: true };
      }

      // ----------------------------------------------------------------------
      // F. SHIPMENT / SUBORDER / ORDER DISPATCHED (Tracking to Customer)
      // ----------------------------------------------------------------------
      if (['shipment_dispatched', 'suborder_shipped', 'order_shipped'].includes(evType)) {
        let targetOrderId = evOrderId;
        let targetSuborderId = evSuborderId;
        let trackingNumber = evPayload.tracking_number || null;
        let trackingUrl = evPayload.tracking_url || null;
        let carrier = evPayload.shipping_provider || null;
        let dispatchedAt = new Date().toISOString();

        if (evPayload.shipment_id) {
          const { data: ship } = await supabaseAdmin.from('shipments').select('*').eq('id', evPayload.shipment_id).maybeSingle();
          if (ship) {
            targetOrderId = targetOrderId || ship.order_id;
            targetSuborderId = targetSuborderId || ship.suborder_id;
            trackingNumber = trackingNumber || ship.tracking_code || ship.external_tracking_number || ship.external_guide;
            carrier = carrier || ship.provider_key;
            dispatchedAt = ship.dispatched_at || ship.updated_at || dispatchedAt;
          }
        }

        if (!targetOrderId) return { success: true, skipped: true, reason: 'missing_order_id' };

        const { data: order } = await supabaseAdmin.from('orders').select('*').eq('id', targetOrderId).maybeSingle();
        if (!order) return { success: true, skipped: true, reason: 'order_not_found' };

        // Check total suborders to determine if partial shipment
        const { data: allSuborders } = await supabaseAdmin.from('order_suborders').select('id, suborder_number, vendor_id, tracking_number, tracking_url, shipping_provider, shipping_method').eq('parent_order_id', targetOrderId);
        const totalSubordersCount = (allSuborders || []).length;
        const matchedSuborder = targetSuborderId ? (allSuborders || []).find((s: any) => s.id === targetSuborderId) : null;

        if (matchedSuborder) {
          trackingNumber = trackingNumber || matchedSuborder.tracking_number;
          trackingUrl = trackingUrl || matchedSuborder.tracking_url;
          carrier = carrier || matchedSuborder.shipping_provider || matchedSuborder.shipping_method;
        } else {
          trackingNumber = trackingNumber || order.tracking_number;
          carrier = carrier || order.tracking_provider || order.shipping_provider || order.shipping_method;
        }

        let shippedItemsQuery = supabaseAdmin.from('order_items').select('product_name, quantity, products(title)').eq('order_id', targetOrderId);
        if (targetSuborderId) {
          shippedItemsQuery = shippedItemsQuery.eq('suborder_id', targetSuborderId);
        }
        const { data: shippedItemsRaw } = await shippedItemsQuery;
        const shippedItems = (shippedItemsRaw || []).map((i: any) => ({
          product_name: i.product_name || i.products?.title || 'Producto',
          quantity: i.quantity
        }));

        const orderNumStr = formatOrderNumber(order);
        const customerId = order.customer_id || order.user_id || null;
        const scopeUnitId = targetSuborderId || order.id;

        const tpl = notificationTemplates.customer_order_shipped({
          orderNumber: orderNumStr,
          orderId: order.id,
          suborderNumber: matchedSuborder?.suborder_number || null,
          isPartialShipment: totalSubordersCount > 1 && Boolean(targetSuborderId),
          carrier,
          trackingNumber,
          trackingUrl,
          dispatchedAt,
          items: shippedItems
        });

        if (customerId) {
          await dispatchInAppNotification({
            user_id: customerId,
            role_scope: 'customer',
            category: 'shipments',
            event_type: 'order_shipped',
            title: tpl.inApp.title,
            body: tpl.inApp.body,
            action_url: `/account?tab=orders&order_id=${order.id}`,
            entity_type: 'order',
            entity_id: order.id,
            severity: 'info',
            idempotency_key: `inapp:customer:shipped:${scopeUnitId}`,
            metadata: { tracking_number: trackingNumber, carrier, suborder_id: targetSuborderId }
          });

          const prefs = await checkUserPreferences(customerId, 'customer', 'shipments', true);
          if (prefs.push) {
            await dispatchPushProvider(
              [customerId],
              null,
              tpl.push.title,
              tpl.push.body,
              tpl.deepLink,
              `customer_shipped:${scopeUnitId}:push`,
              'customer',
              'order_shipped',
              { order_id: order.id, suborder_id: targetSuborderId, outbox_id: evOutboxId }
            );
          }
        }

        if (order.customer_email) {
          const emailRes = await dispatchEmailProvider(
            order.customer_email,
            tpl.email.subject,
            tpl.email.html,
            `customer_shipped:${scopeUnitId}:email`,
            'customer',
            null,
            'order_shipped',
            { user_id: customerId, order_id: order.id, suborder_id: targetSuborderId, outbox_id: evOutboxId }
          );
          if (emailRes.transientError) anyTransientFailure = true;
        }

        const vendorId = evPayload.vendor_id || matchedSuborder?.vendor_id;
        if (vendorId) {
          await dispatchInAppNotification({
            user_id: vendorId,
            vendor_id: vendorId,
            role_scope: 'vendor',
            category: 'shipments',
            event_type: 'order_shipped',
            title: `🚚 Envío despachado — ${matchedSuborder?.suborder_number || orderNumStr}`,
            body: `Despacho registrado (${(carrier || 'Logística').toUpperCase()})${trackingNumber ? ` · Guía: ${trackingNumber}` : ''}.`,
            action_url: `/vendor?tab=shipments`,
            entity_type: 'suborder',
            entity_id: scopeUnitId,
            severity: 'info',
            idempotency_key: `inapp:vendor:shipped:${scopeUnitId}`
          });
        }

        return { success: !anyTransientFailure, transientFailure: anyTransientFailure };
      }

      // ----------------------------------------------------------------------
      // G. SHIPMENT / SUBORDER / ORDER DELIVERED
      // ----------------------------------------------------------------------
      if (['shipment_delivered', 'suborder_delivered', 'order_delivered'].includes(evType)) {
        let targetOrderId = evOrderId;
        let targetSuborderId = evSuborderId;

        if (evPayload.shipment_id && !targetOrderId) {
          const { data: ship } = await supabaseAdmin.from('shipments').select('order_id, suborder_id, vendor_id').eq('id', evPayload.shipment_id).maybeSingle();
          if (ship) {
            targetOrderId = ship.order_id;
            targetSuborderId = targetSuborderId || ship.suborder_id;
          }
        }

        if (!targetOrderId) return { success: true, skipped: true };
        const { data: order } = await supabaseAdmin.from('orders').select('*').eq('id', targetOrderId).maybeSingle();
        if (!order) return { success: true, skipped: true };

        let suborderNumber: string | null = null;
        let vendorId = evPayload.vendor_id || null;
        if (targetSuborderId) {
          const { data: sub } = await supabaseAdmin.from('order_suborders').select('suborder_number, vendor_id').eq('id', targetSuborderId).maybeSingle();
          if (sub) {
            suborderNumber = sub.suborder_number;
            vendorId = vendorId || sub.vendor_id;
          }
        }

        const scopeUnitId = targetSuborderId || order.id;
        const orderNumStr = formatOrderNumber(order);
        const customerId = order.customer_id || order.user_id || null;

        const tpl = notificationTemplates.customer_order_delivered({
          orderNumber: orderNumStr,
          orderId: order.id,
          suborderNumber
        });

        if (customerId) {
          await dispatchInAppNotification({
            user_id: customerId,
            role_scope: 'customer',
            category: 'deliveries',
            event_type: 'order_delivered',
            title: tpl.inApp.title,
            body: tpl.inApp.body,
            action_url: `/account?tab=orders&order_id=${order.id}`,
            entity_type: 'order',
            entity_id: order.id,
            severity: 'success',
            idempotency_key: `inapp:customer:delivered:${scopeUnitId}`
          });

          const prefs = await checkUserPreferences(customerId, 'customer', 'deliveries', true);
          if (prefs.push) {
            await dispatchPushProvider(
              [customerId],
              null,
              tpl.push.title,
              tpl.push.body,
              tpl.deepLink,
              `customer_delivered:${scopeUnitId}:push`,
              'customer',
              'order_delivered',
              { order_id: order.id, suborder_id: targetSuborderId, outbox_id: evOutboxId }
            );
          }
        }

        if (order.customer_email) {
          const emailRes = await dispatchEmailProvider(
            order.customer_email,
            tpl.email.subject,
            tpl.email.html,
            `customer_delivered:${scopeUnitId}:email`,
            'customer',
            null,
            'order_delivered',
            { user_id: customerId, order_id: order.id, suborder_id: targetSuborderId, outbox_id: evOutboxId }
          );
          if (emailRes.transientError) anyTransientFailure = true;
        }

        // Notify Vendor of Delivery
        if (vendorId) {
          await dispatchInAppNotification({
            user_id: vendorId,
            vendor_id: vendorId,
            role_scope: 'vendor',
            category: 'deliveries',
            event_type: 'order_delivered',
            title: `✅ Pedido entregado — ${suborderNumber || orderNumStr}`,
            body: `El envío del pedido ${orderNumStr} fue entregado al comprador.`,
            action_url: `/vendor?tab=orders&order_id=${order.id}`,
            entity_type: 'suborder',
            entity_id: scopeUnitId,
            severity: 'success',
            idempotency_key: `inapp:vendor:delivered:${scopeUnitId}`
          });

          const { data: vSettings } = await supabaseAdmin.from('vendor_notification_settings').select('*').eq('vendor_id', vendorId).maybeSingle();
          if (vSettings?.is_active && vSettings?.notify_order_delivered !== false && vSettings?.channel_preferences?.email !== false) {
            const activeEmails = await getActiveEmailRecipients('vendor', vendorId);
            for (let i = 0; i < activeEmails.length; i++) {
              await dispatchEmailProvider(
                activeEmails[i].email,
                `✅ Pedido entregado — ${suborderNumber || orderNumStr}`,
                `<p>Confirmamos que el envío correspondiente al pedido <strong>${orderNumStr}</strong> (${suborderNumber || 'Envío'}) fue entregado al comprador.</p>`,
                `vendor_delivered:${scopeUnitId}:email:${i}`,
                'vendor',
                vendorId,
                'order_delivered',
                { user_id: vendorId, order_id: order.id, suborder_id: targetSuborderId, outbox_id: evOutboxId }
              );
            }
          }
        }

        return { success: !anyTransientFailure, transientFailure: anyTransientFailure };
      }

      // ----------------------------------------------------------------------
      // H. ORDER CANCELLED (Only if previously paid/confirmed)
      // ----------------------------------------------------------------------
      if (evType === 'order_cancelled') {
        const { data: order } = await supabaseAdmin
          .from('orders')
          .select('*')
          .eq('id', evOrderId)
          .maybeSingle();

        if (!order) throw new Error("Order not found");

        // REQUIREMENT 8 & 23: Only notify commercial cancellation if order was previously certified as paid/confirmed!
        const werePreviouslyPaid = order.payment_processed_at !== null || order.payment_status === 'approved' || order.payment_status === 'paid' || order.payment_status === 'refunded' || order.status === 'refunded';
        
        const { data: paidLog } = await supabaseAdmin
          .from('notification_logs')
          .select('id')
          .eq('event_type', 'order_paid')
          .like('idempotency_key', `%:${evOrderId}:%`)
          .limit(1)
          .maybeSingle();

        if (!werePreviouslyPaid && !paidLog) {
          console.log(`[Notification Dispatcher] Skipping order_cancelled for order ${evOrderId} — order was never paid/confirmed`);
          return { success: true, skipped: true, reason: 'order_never_paid' };
        }

        const { data: items } = await supabaseAdmin
          .from('order_items')
          .select('vendor_id, products(vendor_id)')
          .eq('order_id', evOrderId);

        const vendorIds = new Set<string>();
        for (const item of (items || [])) {
          const prod: any = item.products;
          const vId = item.vendor_id || prod?.vendor_id;
          if (vId) vendorIds.add(vId);
        }

        const orderNumStr = formatOrderNumber(order);
        const customerId = order.customer_id || order.user_id || null;

        // 1. Notify Customer
        const custCancelTpl = notificationTemplates.order_cancelled({
          orderNumber: orderNumStr,
          orderId: order.id,
          isCustomer: true,
          reason: evPayload.reason
        });

        if (customerId) {
          await dispatchInAppNotification({
            user_id: customerId,
            role_scope: 'customer',
            category: 'returns',
            event_type: 'order_cancelled',
            title: custCancelTpl.inApp.title,
            body: custCancelTpl.inApp.body,
            action_url: `/account?tab=orders&order_id=${order.id}`,
            entity_type: 'order',
            entity_id: order.id,
            severity: 'warning',
            idempotency_key: `inapp:customer:order_cancelled:${order.id}`
          });

          await dispatchPushProvider([customerId], null, custCancelTpl.push.title, custCancelTpl.push.body, custCancelTpl.deepLink, `customer_order_cancelled:${order.id}:push`, 'customer', 'order_cancelled', { order_id: order.id, outbox_id: evOutboxId });
        }

        if (order.customer_email) {
          const r = await dispatchEmailProvider(order.customer_email, custCancelTpl.email.subject, custCancelTpl.email.html, `customer_order_cancelled:${order.id}:email`, 'customer', null, 'order_cancelled', { user_id: customerId, order_id: order.id, outbox_id: evOutboxId });
          if (r.transientError) anyTransientFailure = true;
        }

        // 2. Notify Vendors
        for (const vendorId of vendorIds) {
          const tpl = notificationTemplates.order_cancelled({ orderNumber: orderNumStr, orderId: order.id, isVendor: true });

          await dispatchInAppNotification({
            user_id: vendorId,
            vendor_id: vendorId,
            role_scope: 'vendor',
            category: 'sales',
            event_type: 'order_cancelled',
            title: tpl.inApp.title,
            body: tpl.inApp.body,
            action_url: `/vendor?tab=orders&order_id=${order.id}`,
            entity_type: 'order',
            entity_id: order.id,
            severity: 'error',
            idempotency_key: `inapp:vendor:order_cancelled:${order.id}:${vendorId}`
          });

          const { data: vSettings } = await supabaseAdmin
            .from('vendor_notification_settings')
            .select('*')
            .eq('vendor_id', vendorId)
            .maybeSingle();

          const channelPrefs = vSettings?.channel_preferences || { push: true, email: true };

          if (channelPrefs.push !== false) {
            const pushKey = `order_cancelled:${order.id}:${vendorId}:push`;
            await dispatchPushProvider([vendorId], vendorId, tpl.push.title, tpl.push.body, tpl.deepLink, pushKey, 'vendor', 'order_cancelled', { order_id: order.id, outbox_id: evOutboxId });
          }

          if (channelPrefs.email !== false) {
            const activeEmails = await getActiveEmailRecipients('vendor', vendorId);
            for (let i = 0; i < activeEmails.length; i++) {
              const recipient = activeEmails[i];
              const emailKey = `order_cancelled:${order.id}:${vendorId}:email:${i}`;
              const r = await dispatchEmailProvider(recipient.email, tpl.email.subject, tpl.email.html, emailKey, 'vendor', vendorId, 'order_cancelled', { user_id: vendorId, order_id: order.id, outbox_id: evOutboxId });
              if (r.transientError) anyTransientFailure = true;
            }
          }
        }

        // 3. Notify Admin
        const adminTpl = notificationTemplates.order_cancelled({ orderNumber: orderNumStr, orderId: order.id, isVendor: false });
        await dispatchInAppNotification({
          role_scope: 'admin',
          category: 'sales',
          event_type: 'order_cancelled',
          title: adminTpl.inApp.title,
          body: adminTpl.inApp.body,
          action_url: `/admin/orders?order_id=${order.id}`,
          entity_type: 'order',
          entity_id: order.id,
          severity: 'warning',
          idempotency_key: `inapp:admin:order_cancelled:${order.id}`
        });

        const { data: adminSettings } = await supabaseAdmin
          .from('admin_notification_settings')
          .select('*')
          .eq('is_singleton', true)
          .maybeSingle();

        const channelPrefs = adminSettings?.channel_preferences || { push: true, email: true };

        if (channelPrefs.push !== false) {
          const pushKey = `order_cancelled:${order.id}:admin:push`;
          await dispatchPushProvider([], null, adminTpl.push.title, adminTpl.push.body, adminTpl.deepLink, pushKey, 'admin', 'order_cancelled', { order_id: order.id, outbox_id: evOutboxId });
        }

        if (channelPrefs.email !== false) {
          const activeAdminEmails = await getActiveEmailRecipients('admin', null);
          for (let i = 0; i < activeAdminEmails.length; i++) {
            const recipient = activeAdminEmails[i];
            const emailKey = `order_cancelled:${order.id}:admin:email:${i}`;
            const r = await dispatchEmailProvider(recipient.email, adminTpl.email.subject, adminTpl.email.html, emailKey, 'admin', null, 'order_cancelled', { order_id: order.id, outbox_id: evOutboxId });
            if (r.transientError) anyTransientFailure = true;
          }
        }

        return { success: !anyTransientFailure, transientFailure: anyTransientFailure };
      }

      // ----------------------------------------------------------------------
      // I. RETURNS, CLAIMS, REFUNDS, DISPUTES & ADJUSTMENTS
      // ----------------------------------------------------------------------
      if (evType === 'return_or_claim_requested' || evType === 'return_or_claim_updated') {
        const reqId = evPayload.request_id || evPayload.idempotency_key || 'req';
        const { data: order } = evOrderId ? await supabaseAdmin.from('orders').select('*').eq('id', evOrderId).maybeSingle() : { data: null };
        const orderNumStr = order ? formatOrderNumber(order) : '#COL';
        const customerId = evPayload.customer_id || order?.customer_id || order?.user_id || null;
        const vendorId = evPayload.vendor_id || null;
        const statusStr = evPayload.status || 'UNDER_REVIEW';
        const reqType = evPayload.request_type || 'return';
        const amt = Number(evPayload.amount_approved || evPayload.amount_requested || 0);

        // Customer notification
        const custTpl = notificationTemplates.return_or_claim_event({
          orderNumber: orderNumStr,
          orderId: evOrderId || '',
          requestType: reqType,
          status: statusStr,
          reason: evPayload.reason,
          amount: amt,
          recipientRole: 'customer'
        });

        if (customerId) {
          await dispatchInAppNotification({
            user_id: customerId,
            role_scope: 'customer',
            category: reqType.includes('claim') ? 'claims' : 'returns',
            event_type: evType,
            title: custTpl.inApp.title,
            body: custTpl.inApp.body,
            action_url: `/account?tab=requests`,
            entity_type: 'request',
            entity_id: String(reqId),
            severity: custTpl.inApp.severity,
            idempotency_key: `inapp:customer:${evType}:${reqId}:${statusStr}`
          });
        }
        if (order?.customer_email) {
          await dispatchEmailProvider(order.customer_email, custTpl.email.subject, custTpl.email.html, `customer_${evType}:${reqId}:${statusStr}:email`, 'customer', null, evType, { user_id: customerId, order_id: evOrderId, outbox_id: evOutboxId });
        }

        // Vendor notification (if vendor order)
        if (vendorId) {
          const venTpl = notificationTemplates.return_or_claim_event({
            orderNumber: orderNumStr,
            orderId: evOrderId || '',
            requestType: reqType,
            status: statusStr,
            reason: evPayload.reason,
            amount: amt,
            recipientRole: 'vendor'
          });
          await dispatchInAppNotification({
            user_id: vendorId,
            vendor_id: vendorId,
            role_scope: 'vendor',
            category: 'returns',
            event_type: evType,
            title: venTpl.inApp.title,
            body: venTpl.inApp.body,
            action_url: `/vendor?tab=orders&order_id=${evOrderId || ''}`,
            entity_type: 'request',
            entity_id: String(reqId),
            severity: venTpl.inApp.severity,
            idempotency_key: `inapp:vendor:${evType}:${reqId}:${statusStr}`
          });
          await dispatchPushProvider([vendorId], vendorId, venTpl.push.title, venTpl.push.body, venTpl.deepLink, `vendor_${evType}:${reqId}:${statusStr}:push`, 'vendor', evType, { order_id: evOrderId, outbox_id: evOutboxId });
          const activeEmails = await getActiveEmailRecipients('vendor', vendorId);
          for (let i = 0; i < activeEmails.length; i++) {
            await dispatchEmailProvider(activeEmails[i].email, venTpl.email.subject, venTpl.email.html, `vendor_${evType}:${reqId}:${statusStr}:email:${i}`, 'vendor', vendorId, evType, { user_id: vendorId, order_id: evOrderId, outbox_id: evOutboxId });
          }
        }

        // Admin notification
        const admTpl = notificationTemplates.return_or_claim_event({
          orderNumber: orderNumStr,
          orderId: evOrderId || '',
          requestType: reqType,
          status: statusStr,
          reason: evPayload.reason,
          amount: amt,
          recipientRole: 'admin'
        });
        await dispatchInAppNotification({
          role_scope: 'admin',
          category: reqType.includes('claim') ? 'claims' : 'returns',
          event_type: evType,
          title: admTpl.inApp.title,
          body: admTpl.inApp.body,
          action_url: `/admin/refunds`,
          entity_type: 'request',
          entity_id: String(reqId),
          severity: admTpl.inApp.severity,
          idempotency_key: `inapp:admin:${evType}:${reqId}:${statusStr}`
        });

        if (evType === 'return_or_claim_requested') {
          const activeAdminEmails = await getActiveEmailRecipients('admin', null);
          for (let i = 0; i < activeAdminEmails.length; i++) {
            await dispatchEmailProvider(activeAdminEmails[i].email, admTpl.email.subject, admTpl.email.html, `admin_${evType}:${reqId}:email:${i}`, 'admin', null, evType, { order_id: evOrderId, outbox_id: evOutboxId });
          }
        }

        return { success: true };
      }

      if (['refund_processed', 'refund_initiated', 'refund_completed', 'manual_refund_required'].includes(evType)) {
        const { data: order } = evOrderId ? await supabaseAdmin.from('orders').select('*').eq('id', evOrderId).maybeSingle() : { data: null };
        const orderNumStr = order ? formatOrderNumber(order) : '#COL';
        const customerId = evPayload.customer_id || order?.customer_id || order?.user_id || null;
        const vendorId = evPayload.vendor_id || null;
        const amt = Number(evPayload.amount || order?.refunded_amount || order?.total_amount || 0);
        const statusType: 'requested' | 'completed' | 'rejected' | 'manual_required' | 'failed' =
          evType === 'manual_refund_required' || evPayload.status === 'manual_required'
            ? 'manual_required'
            : evType === 'refund_initiated' || evPayload.status === 'requested'
            ? 'requested'
            : evPayload.status === 'rejected'
            ? 'rejected'
            : evPayload.status === 'failed'
            ? 'failed'
            : 'completed';

        const unitId = evPayload.request_id || evOrderId || evPayload.idempotency_key || Date.now().toString();

        // 1. Admin Notification
        const admTpl = notificationTemplates.refund_processed({
          orderNumber: orderNumStr,
          orderId: evOrderId || '',
          amount: amt,
          currency: order?.currency || 'UYU',
          reason: evPayload.reason,
          status: statusType,
          recipientRole: 'admin',
          provider: evPayload.provider || order?.payment_method
        });
        await dispatchInAppNotification({
          role_scope: 'admin',
          category: statusType === 'manual_required' || statusType === 'failed' ? 'alerts' : 'returns',
          event_type: evType,
          title: admTpl.inApp.title,
          body: admTpl.inApp.body,
          action_url: `/admin/refunds`,
          entity_type: 'order',
          entity_id: String(evOrderId || unitId),
          severity: admTpl.inApp.severity,
          idempotency_key: `inapp:admin:refund:${unitId}:${statusType}`
        });
        if (statusType === 'manual_required' || statusType === 'failed' || statusType === 'completed') {
          const activeAdminEmails = await getActiveEmailRecipients('admin', null);
          for (let i = 0; i < activeAdminEmails.length; i++) {
            await dispatchEmailProvider(activeAdminEmails[i].email, admTpl.email.subject, admTpl.email.html, `admin_refund:${unitId}:${statusType}:email:${i}`, 'admin', null, evType, { order_id: evOrderId, outbox_id: evOutboxId });
          }
        }

        // 2. Customer Notification (only for requested, completed, or rejected — never internal manual_required alerts)
        if (['requested', 'completed', 'rejected'].includes(statusType)) {
          const custTpl = notificationTemplates.refund_processed({
            orderNumber: orderNumStr,
            orderId: evOrderId || '',
            amount: amt,
            currency: order?.currency || 'UYU',
            reason: evPayload.reason,
            status: statusType,
            recipientRole: 'customer'
          });
          if (customerId) {
            await dispatchInAppNotification({
              user_id: customerId,
              role_scope: 'customer',
              category: 'returns',
              event_type: evType,
              title: custTpl.inApp.title,
              body: custTpl.inApp.body,
              action_url: `/account?tab=orders&order_id=${evOrderId || ''}`,
              entity_type: 'order',
              entity_id: String(evOrderId || unitId),
              severity: custTpl.inApp.severity,
              idempotency_key: `inapp:customer:refund:${unitId}:${statusType}`
            });
            await dispatchPushProvider([customerId], null, custTpl.push.title, custTpl.push.body, custTpl.deepLink, `customer_refund:${unitId}:${statusType}:push`, 'customer', evType, { order_id: evOrderId, outbox_id: evOutboxId });
          }
          if (order?.customer_email) {
            await dispatchEmailProvider(order.customer_email, custTpl.email.subject, custTpl.email.html, `customer_refund:${unitId}:${statusType}:email`, 'customer', null, evType, { user_id: customerId, order_id: evOrderId, outbox_id: evOutboxId });
          }
        }

        // 3. Vendor Notification (if vendor_id provided or completed refund on vendor suborders)
        if (vendorId && statusType === 'completed') {
          const venTpl = notificationTemplates.refund_processed({
            orderNumber: orderNumStr,
            orderId: evOrderId || '',
            amount: amt,
            currency: order?.currency || 'UYU',
            reason: evPayload.reason,
            status: 'completed',
            recipientRole: 'vendor'
          });
          await dispatchInAppNotification({
            user_id: vendorId,
            vendor_id: vendorId,
            role_scope: 'vendor',
            category: 'returns',
            event_type: evType,
            title: venTpl.inApp.title,
            body: venTpl.inApp.body,
            action_url: `/vendor?tab=finances`,
            entity_type: 'order',
            entity_id: String(evOrderId || unitId),
            severity: 'info',
            idempotency_key: `inapp:vendor:refund:${unitId}:${vendorId}`
          });
          const activeVendorEmails = await getActiveEmailRecipients('vendor', vendorId);
          for (let i = 0; i < activeVendorEmails.length; i++) {
            await dispatchEmailProvider(activeVendorEmails[i].email, venTpl.email.subject, venTpl.email.html, `vendor_refund:${unitId}:${vendorId}:email:${i}`, 'vendor', vendorId, evType, { user_id: vendorId, order_id: evOrderId, outbox_id: evOutboxId });
          }
        }

        return { success: true };
      }

      if (evType === 'dispute_opened') {
        const dispId = evPayload.dispute_id || evPayload.idempotency_key || 'disp';
        const { data: order } = evOrderId ? await supabaseAdmin.from('orders').select('*').eq('id', evOrderId).maybeSingle() : { data: null };
        const orderNumStr = order ? formatOrderNumber(order) : '#COL';
        const customerId = order?.customer_id || order?.user_id || null;
        const vendorId = evPayload.vendor_id || null;
        const amt = Number(evPayload.amount || 0);

        // Admin priority alert
        const admTpl = notificationTemplates.dispute_or_chargeback({
          orderNumber: orderNumStr,
          orderId: evOrderId || '',
          amount: amt,
          reason: evPayload.reason,
          provider: evPayload.provider,
          recipientRole: 'admin'
        });
        await dispatchInAppNotification({
          role_scope: 'admin',
          category: 'claims',
          event_type: 'dispute_opened',
          title: admTpl.inApp.title,
          body: admTpl.inApp.body,
          action_url: `/admin/refunds`,
          entity_type: 'dispute',
          entity_id: String(dispId),
          severity: 'priority',
          idempotency_key: `inapp:admin:dispute:${dispId}`
        });
        await dispatchPushProvider([], null, admTpl.push.title, admTpl.push.body, admTpl.deepLink, `admin_dispute:${dispId}:push`, 'admin', 'dispute_opened', { order_id: evOrderId, outbox_id: evOutboxId });
        const activeAdminEmails = await getActiveEmailRecipients('admin', null);
        for (let i = 0; i < activeAdminEmails.length; i++) {
          await dispatchEmailProvider(activeAdminEmails[i].email, admTpl.email.subject, admTpl.email.html, `admin_dispute:${dispId}:email:${i}`, 'admin', null, 'dispute_opened', { order_id: evOrderId, outbox_id: evOutboxId });
        }

        // Vendor priority alert
        if (vendorId) {
          const venTpl = notificationTemplates.dispute_or_chargeback({
            orderNumber: orderNumStr,
            orderId: evOrderId || '',
            amount: amt,
            reason: evPayload.reason,
            provider: evPayload.provider,
            recipientRole: 'vendor'
          });
          await dispatchInAppNotification({
            user_id: vendorId,
            vendor_id: vendorId,
            role_scope: 'vendor',
            category: 'claims',
            event_type: 'dispute_opened',
            title: venTpl.inApp.title,
            body: venTpl.inApp.body,
            action_url: `/vendor?tab=finances`,
            entity_type: 'dispute',
            entity_id: String(dispId),
            severity: 'priority',
            idempotency_key: `inapp:vendor:dispute:${dispId}`
          });
          const activeVendorEmails = await getActiveEmailRecipients('vendor', vendorId);
          for (let i = 0; i < activeVendorEmails.length; i++) {
            await dispatchEmailProvider(activeVendorEmails[i].email, venTpl.email.subject, venTpl.email.html, `vendor_dispute:${dispId}:email:${i}`, 'vendor', vendorId, 'dispute_opened', { user_id: vendorId, order_id: evOrderId, outbox_id: evOutboxId });
          }
        }

        // Customer alert
        if (customerId || order?.customer_email) {
          const custTpl = notificationTemplates.dispute_or_chargeback({
            orderNumber: orderNumStr,
            orderId: evOrderId || '',
            amount: amt,
            reason: evPayload.reason,
            provider: evPayload.provider,
            recipientRole: 'customer'
          });
          if (customerId) {
            await dispatchInAppNotification({
              user_id: customerId,
              role_scope: 'customer',
              category: 'claims',
              event_type: 'dispute_opened',
              title: custTpl.inApp.title,
              body: custTpl.inApp.body,
              action_url: `/account?tab=orders&order_id=${evOrderId || ''}`,
              entity_type: 'dispute',
              entity_id: String(dispId),
              severity: 'warning',
              idempotency_key: `inapp:customer:dispute:${dispId}`
            });
          }
          if (order?.customer_email) {
            await dispatchEmailProvider(order.customer_email, custTpl.email.subject, custTpl.email.html, `customer_dispute:${dispId}:email`, 'customer', null, 'dispute_opened', { user_id: customerId, order_id: evOrderId, outbox_id: evOutboxId });
          }
        }
        return { success: true };
      }

      if (evType === 'vendor_adjustment_created') {
        const adjId = evPayload.adjustment_id || evPayload.idempotency_key || 'adj';
        const vendorId = evPayload.vendor_id;
        if (!vendorId) return { success: true, skipped: true };

        const { data: vRow } = await supabaseAdmin.from('vendors').select('store_name').eq('id', vendorId).maybeSingle();
        const { data: order } = evOrderId ? await supabaseAdmin.from('orders').select('order_number, id').eq('id', evOrderId).maybeSingle() : { data: null };
        const orderNumStr = order ? formatOrderNumber(order) : 'Ajuste Manual';

        const tpl = notificationTemplates.vendor_financial_adjustment({
          storeName: vRow?.store_name || 'Vendedor',
          orderNumber: orderNumStr,
          amount: Number(evPayload.amount || 0),
          typeAdj: evPayload.type_adj || 'debit',
          reason: evPayload.reason
        });

        await dispatchInAppNotification({
          user_id: vendorId,
          vendor_id: vendorId,
          role_scope: 'vendor',
          category: 'payouts',
          event_type: 'vendor_adjustment_created',
          title: tpl.inApp.title,
          body: tpl.inApp.body,
          action_url: `/vendor?tab=finances`,
          entity_type: 'adjustment',
          entity_id: String(adjId),
          severity: 'warning',
          idempotency_key: `inapp:vendor:adjustment:${adjId}`
        });

        const activeEmails = await getActiveEmailRecipients('vendor', vendorId);
        for (let i = 0; i < activeEmails.length; i++) {
          await dispatchEmailProvider(activeEmails[i].email, tpl.email.subject, tpl.email.html, `vendor_adj:${adjId}:email:${i}`, 'vendor', vendorId, 'vendor_adjustment_created', { user_id: vendorId, order_id: evOrderId, outbox_id: evOutboxId });
        }
        return { success: true };
      }

      // ----------------------------------------------------------------------
      // J. VENDOR LIQUIDATIONS & PAYOUTS
      // ----------------------------------------------------------------------
      if (['vendor_liquidation_available', 'vendor_liquidation_paid', 'payout_paid'].includes(evType)) {
        const vendorId = evPayload.vendor_id;
        if (!vendorId) return { success: true, skipped: true };

        const isPaid = evType === 'vendor_liquidation_paid' || evType === 'payout_paid';
        const entityId = evPayload.liquidation_id || evPayload.payout_id || evPayload.idempotency_key || 'liq';
        const amount = Number(evPayload.amount || (evPayload as any).net_amount || 0);

        const tpl = notificationTemplates.vendor_liquidation_event({
          amount,
          isPaid,
          reference: (evPayload as any).payment_reference
        });

        await dispatchInAppNotification({
          user_id: vendorId,
          vendor_id: vendorId,
          role_scope: 'vendor',
          category: 'payouts',
          event_type: evType,
          title: tpl.inApp.title,
          body: tpl.inApp.body,
          action_url: `/vendor?tab=settlements`,
          entity_type: 'liquidation',
          entity_id: String(entityId),
          severity: tpl.inApp.severity,
          idempotency_key: `inapp:vendor:${evType}:${entityId}`
        });

        const { data: vSettings } = await supabaseAdmin.from('vendor_notification_settings').select('*').eq('vendor_id', vendorId).maybeSingle();
        if (vSettings?.is_active !== false && vSettings?.notify_liquidations !== false && vSettings?.channel_preferences?.email !== false) {
          const activeEmails = await getActiveEmailRecipients('vendor', vendorId);
          for (let i = 0; i < activeEmails.length; i++) {
            await dispatchEmailProvider(activeEmails[i].email, tpl.email.subject, tpl.email.html, `vendor_${evType}:${entityId}:email:${i}`, 'vendor', vendorId, evType, { user_id: vendorId, outbox_id: evOutboxId });
          }
        }
        return { success: true };
      }

      // ----------------------------------------------------------------------
      // K. AFFILIATES & INFLUENCERS EVENTS
      // ----------------------------------------------------------------------
      if ([
        'affiliate_commission_created',
        'affiliate_commission_updated',
        'affiliate_payout_requested',
        'affiliate_payout_paid',
        'affiliate_code_deactivated',
        'affiliate_code_expiring'
      ].includes(evType)) {
        const affId = evPayload.affiliate_id;
        if (!affId) return { success: true, skipped: true };

        const { data: aff } = await supabaseAdmin.from('affiliates').select('*').eq('id', affId).maybeSingle();
        const { data: prof } = await supabaseAdmin.from('profiles').select('email, first_name').eq('id', affId).maybeSingle();
        if (!aff) return { success: true, skipped: true };

        const codeStr = evPayload.code || aff.code || 'AFF';
        let orderRef = '';
        if (evOrderId) {
          const { data: ord } = await supabaseAdmin.from('orders').select('order_number, id').eq('id', evOrderId).maybeSingle();
          if (ord) orderRef = formatOrderNumber(ord);
        }

        let subType: any = 'sale_paid_commission';
        let statusLabel = 'Pendiente de liquidación';
        const commAmt = Number(evPayload.amount ?? 0);

        if (evType === 'affiliate_commission_created') {
          subType = 'sale_paid_commission';
          statusLabel = 'Comisión generada (Pago confirmado)';
        } else if (evType === 'affiliate_commission_updated') {
          const newSt = (evPayload.status || '').toLowerCase();
          if (newSt === 'cancelled' || newSt === 'reversed' || commAmt === 0) {
            subType = 'commission_cancelled';
            statusLabel = 'Anulada por reembolso/cancelación';
          } else if (newSt === 'available' || newSt === 'approved' || newSt === 'confirmed') {
            subType = 'commission_approved';
            statusLabel = 'Aprobada / Disponible';
          } else if (newSt === 'paid') {
            subType = 'commission_paid';
            statusLabel = 'Pagada';
          } else {
            subType = 'commission_adjusted';
            statusLabel = 'Ajustada por reembolso parcial';
          }
        } else if (evType === 'affiliate_payout_requested') {
          subType = 'payout_requested';
          statusLabel = 'En revisión administrativa';
        } else if (evType === 'affiliate_payout_paid') {
          subType = 'commission_paid';
          statusLabel = 'Liquidación pagada';
        } else if (evType === 'affiliate_code_deactivated') {
          subType = 'code_deactivated';
          statusLabel = 'Inactivo';
        } else if (evType === 'affiliate_code_expiring') {
          subType = 'code_expiring';
          statusLabel = 'Próximo a vencer';
        }

        const tpl = notificationTemplates.affiliate_event({
          eventSubType: subType,
          code: codeStr,
          orderReference: orderRef || undefined,
          commissionableAmount: evPayload.base_amount !== undefined ? Number(evPayload.base_amount) : undefined,
          commissionAmount: commAmt,
          commissionRate: evPayload.commission_rate ? Number(evPayload.commission_rate) : Number(aff.base_commission_rate || 5),
          statusLabel,
          reason: (evPayload as any).notes || evPayload.reason
        });

        const uniqueUnit = evPayload.commission_id || evPayload.payout_request_id || evPayload.coupon_id || evPayload.idempotency_key || Date.now().toString();

        // 1. Affiliate In-App Activity Center
        await dispatchInAppNotification({
          user_id: aff.id,
          affiliate_id: aff.id,
          role_scope: 'affiliate',
          category: 'commissions',
          event_type: evType,
          title: tpl.inApp.title,
          body: tpl.inApp.body,
          action_url: `/affiliate?tab=overview`,
          entity_type: 'affiliate_commission',
          entity_id: String(uniqueUnit),
          severity: tpl.inApp.severity,
          idempotency_key: `inapp:affiliate:${evType}:${uniqueUnit}:${evPayload.status || ''}`
        });

        // 2. Affiliate Email & Push
        const affPrefs = await checkUserPreferences(aff.id, 'affiliate', 'commissions', false);
        if (affPrefs.push) {
          await dispatchPushProvider([aff.id], null, tpl.push.title, tpl.push.body, tpl.deepLink, `affiliate_${evType}:${uniqueUnit}:push`, 'affiliate', evType, { affiliate_id: aff.id, order_id: evOrderId, outbox_id: evOutboxId });
        }
        if (affPrefs.email && prof?.email) {
          const r = await dispatchEmailProvider(prof.email, tpl.email.subject, tpl.email.html, `affiliate_${evType}:${uniqueUnit}:${evPayload.status || ''}:email`, 'affiliate', null, evType, { user_id: aff.id, affiliate_id: aff.id, order_id: evOrderId, outbox_id: evOutboxId });
          if (r.transientError) anyTransientFailure = true;
        }

        // 3. Also log in Admin Activity Center for Commission Generated / Paid / Payout Requested
        if (['affiliate_commission_created', 'affiliate_payout_requested', 'affiliate_payout_paid'].includes(evType)) {
          await dispatchInAppNotification({
            role_scope: 'admin',
            category: 'commissions',
            event_type: evType,
            title: `Afiliado (${codeStr}) — ${tpl.inApp.title}`,
            body: tpl.inApp.body,
            action_url: `/admin/affiliates`,
            entity_type: 'affiliate',
            entity_id: aff.id,
            severity: 'info',
            idempotency_key: `inapp:admin:${evType}:${uniqueUnit}`
          });
        }

        return { success: !anyTransientFailure, transientFailure: anyTransientFailure };
      }

      // ----------------------------------------------------------------------
      // L. ADMIN DAILY SUMMARY
      // ----------------------------------------------------------------------
      if (evType === 'admin_vendor_daily_summary') {
        const { date_str, vendor_rows, marketplace_total, order_count, vendor_count, commission_total } = evPayload;

        // REQUIREMENT 13: Zero sales guard
        if (!vendor_count || vendor_count === 0 || !vendor_rows || vendor_rows.length === 0) {
          console.log(`[Notification Dispatcher] Skipping daily summary — 0 vendor sales in period.`);
          return { success: true, skipped: true, reason: 'no_vendor_sales' };
        }

        const { data: adminSettings } = await supabaseAdmin
          .from('admin_notification_settings')
          .select('*')
          .eq('is_singleton', true)
          .maybeSingle();

        const isAdminActive = adminSettings ? (adminSettings.is_active && adminSettings.notify_vendor_sales !== false) : true;
        if (!isAdminActive) {
          return { success: true, skipped: true, reason: 'admin_notifications_disabled' };
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

        await dispatchInAppNotification({
          role_scope: 'admin',
          category: 'summaries',
          event_type: 'admin_vendor_daily_summary',
          title: tpl.inApp.title,
          body: tpl.inApp.body,
          action_url: `/admin/marketplace`,
          entity_type: 'summary',
          entity_id: dateKey,
          severity: 'info',
          idempotency_key: `inapp:admin:daily_summary:${dateKey}`
        });

        if (channelPrefs.push !== false) {
          const pushKey = `admin_vendor_daily_summary:${dateKey}:push`;
          await dispatchPushProvider([], null, tpl.push.title, tpl.push.body, tpl.deepLink, pushKey, 'admin', 'admin_vendor_daily_summary', { outbox_id: evOutboxId });
        }

        if (channelPrefs.email !== false) {
          const activeAdminEmails = await getActiveEmailRecipients('admin', null);
          for (let i = 0; i < activeAdminEmails.length; i++) {
            const recipient = activeAdminEmails[i];
            const emailKey = `admin_vendor_daily_summary:${dateKey}:email:${i}`;
            const r = await dispatchEmailProvider(recipient.email, tpl.email.subject, tpl.email.html, emailKey, 'admin', null, 'admin_vendor_daily_summary', { outbox_id: evOutboxId });
            if (r.transientError) anyTransientFailure = true;
          }
        }
        return { success: !anyTransientFailure, transientFailure: anyTransientFailure };
      }

      // ----------------------------------------------------------------------
      // M. LOW STOCK
      // ----------------------------------------------------------------------
      if (evType === 'low_stock') {
        const variantId = evPayload.variant_id;
        if (variantId) {
          const cooldownKey = `low_stock:${variantId}`;
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
              .select('*, products(title, vendor_id, vendors(id, store_name))')
              .eq('id', variantId)
              .maybeSingle();

            if (variant && variant.products) {
              const product: any = variant.products;
              const vendorId = product.vendor_id;
              const title = "⚠️ Stock Bajo";
              const message = `El producto "${product.title} (${variant.name || 'Único'})" tiene stock bajo (${variant.inventory_count} ud).`;
              const targetUrl = "https://collectibles.uy/vendor?tab=products";

              if (vendorId) {
                await dispatchInAppNotification({
                  user_id: vendorId,
                  vendor_id: vendorId,
                  role_scope: 'vendor',
                  category: 'alerts',
                  event_type: 'low_stock',
                  title,
                  body: message,
                  action_url: `/vendor?tab=products`,
                  entity_type: 'variant',
                  entity_id: variantId,
                  severity: 'warning',
                  idempotency_key: `inapp:vendor:low_stock:${variantId}:${new Date().toISOString().slice(0, 10)}`
                });
                await dispatchPushProvider([vendorId], vendorId, title, message, targetUrl, cooldownKey, 'vendor', 'low_stock', { outbox_id: evOutboxId });
              } else {
                await dispatchInAppNotification({
                  role_scope: 'admin',
                  category: 'alerts',
                  event_type: 'low_stock',
                  title,
                  body: message,
                  action_url: `/admin/products`,
                  entity_type: 'variant',
                  entity_id: variantId,
                  severity: 'warning',
                  idempotency_key: `inapp:admin:low_stock:${variantId}:${new Date().toISOString().slice(0, 10)}`
                });
              }
            }
          }
        }
        return { success: true };
      }

      // ----------------------------------------------------------------------
      // N. PRODUCT QUESTIONS & ANSWERS
      // ----------------------------------------------------------------------
      if (evType === 'product_question_received') {
        const lookupId = evPayload.question_id || evPayload.product_id || evPayload.variant_id || evPayload.order_id;
        const { data: question } = await supabaseAdmin
          .from('product_questions')
          .select(`
            id, question, product_id, vendor_id,
            product:products(id, title, slug)
          `)
          .eq('id', lookupId)
          .maybeSingle();

        if (question && question.product) {
          const prod: any = Array.isArray(question.product) ? question.product[0] : question.product;
          const isVendor = Boolean(question.vendor_id);
          const tpl = notificationTemplates.product_question_received({
            productTitle: prod.title,
            productId: prod.id,
            questionText: question.question,
            isVendor
          });

          if (isVendor && question.vendor_id) {
            await dispatchInAppNotification({
              user_id: question.vendor_id,
              vendor_id: question.vendor_id,
              role_scope: 'vendor',
              category: 'questions',
              event_type: 'product_question_received',
              title: tpl.inApp.title,
              body: tpl.inApp.body,
              action_url: `/vendor?tab=questions`,
              entity_type: 'question',
              entity_id: question.id,
              severity: 'info',
              idempotency_key: `inapp:vendor:question_received:${question.id}`
            });

            const { data: vSettings } = await supabaseAdmin
              .from('vendor_notification_settings')
              .select('*')
              .eq('vendor_id', question.vendor_id)
              .maybeSingle();

            const isActive = vSettings ? (vSettings.is_active && vSettings.notify_product_questions !== false) : true;
            if (isActive) {
              const channelPrefs = vSettings?.channel_preferences || { push: true, email: true };
              if (channelPrefs.push !== false) {
                const pushKey = `question_received:${question.id}:vendor:push`;
                await dispatchPushProvider([question.vendor_id], question.vendor_id, tpl.push.title, tpl.push.body, tpl.deepLink, pushKey, 'vendor', 'product_question_received', { outbox_id: evOutboxId });
              }
              if (channelPrefs.email !== false) {
                const activeEmails = await getActiveEmailRecipients('vendor', question.vendor_id);
                for (let i = 0; i < activeEmails.length; i++) {
                  const r = activeEmails[i];
                  const emailKey = `question_received:${question.id}:vendor:email:${i}`;
                  await dispatchEmailProvider(r.email, tpl.email.subject, tpl.email.html, emailKey, 'vendor', question.vendor_id, 'product_question_received', { user_id: question.vendor_id, outbox_id: evOutboxId });
                }
              }
            }
          } else {
            await dispatchInAppNotification({
              role_scope: 'admin',
              category: 'questions',
              event_type: 'product_question_received',
              title: tpl.inApp.title,
              body: tpl.inApp.body,
              action_url: `/admin/questions`,
              entity_type: 'question',
              entity_id: question.id,
              severity: 'info',
              idempotency_key: `inapp:admin:question_received:${question.id}`
            });

            const { data: adminSettings } = await supabaseAdmin
              .from('admin_notification_settings')
              .select('*')
              .eq('is_singleton', true)
              .maybeSingle();

            const isActive = adminSettings ? (adminSettings.is_active && adminSettings.notify_product_questions !== false) : true;
            if (isActive) {
              const channelPrefs = adminSettings?.channel_preferences || { push: true, email: true };
              if (channelPrefs.push !== false) {
                const adminPushKey = `question_received:${question.id}:admin:push`;
                await dispatchPushProvider([], null, tpl.push.title, tpl.push.body, tpl.deepLink, adminPushKey, 'admin', 'product_question_received', { outbox_id: evOutboxId });
              }
              if (channelPrefs.email !== false) {
                const activeAdminEmails = await getActiveEmailRecipients('admin', null);
                for (let i = 0; i < activeAdminEmails.length; i++) {
                  const r = activeAdminEmails[i];
                  const emailKey = `question_received:${question.id}:admin:email:${i}`;
                  await dispatchEmailProvider(r.email, tpl.email.subject, tpl.email.html, emailKey, 'admin', null, 'product_question_received', { outbox_id: evOutboxId });
                }
              }
            }
          }
        }
        return { success: true };
      }

      if (evType === 'product_question_answered') {
        const lookupId = evPayload.answer_id || evPayload.product_id || evPayload.variant_id || evPayload.order_id;
        const { data: answer } = await supabaseAdmin
          .from('product_question_answers')
          .select(`
            id, answer, answered_by_user_id, is_admin_answer, vendor_id,
            question:product_questions(
              id, question, asked_by_user_id,
              product:products(id, title, slug)
            )
          `)
          .eq('id', lookupId)
          .maybeSingle();

        const qObj: any = answer?.question ? (Array.isArray(answer.question) ? answer.question[0] : answer.question) : null;
        const prodObj: any = qObj?.product ? (Array.isArray(qObj.product) ? qObj.product[0] : qObj.product) : null;

        if (answer && qObj && prodObj) {
          const answeredByName = answer.is_admin_answer ? 'Collectibles.uy' : 'El Vendedor';
          const tpl = notificationTemplates.product_question_answered({
            productTitle: prodObj.title,
            productSlug: prodObj.slug,
            questionId: qObj.id,
            questionText: qObj.question,
            answerText: answer.answer,
            answeredBy: answeredByName
          });

          const buyerUserId = qObj.asked_by_user_id;
          const pushKey = `question_answered:${answer.id}:buyer:push`;

          if (buyerUserId) {
            await dispatchInAppNotification({
              user_id: buyerUserId,
              role_scope: 'customer',
              category: 'questions',
              event_type: 'product_question_answered',
              title: tpl.inApp.title,
              body: tpl.inApp.body,
              action_url: `/p/${prodObj.slug}#pregunta-${qObj.id}`,
              entity_type: 'question',
              entity_id: qObj.id,
              severity: 'success',
              idempotency_key: `inapp:customer:question_answered:${answer.id}`
            });
            await dispatchPushProvider([buyerUserId], null, tpl.push.title, tpl.push.body, tpl.deepLink, pushKey, 'customer', 'product_question_answered', { outbox_id: evOutboxId });
          }

          const { data: buyerProfile } = await supabaseAdmin
            .from('profiles')
            .select('email')
            .eq('id', buyerUserId)
            .maybeSingle();

          if (buyerProfile?.email) {
            const emailKey = `question_answered:${answer.id}:buyer:email`;
            await dispatchEmailProvider(buyerProfile.email, tpl.email.subject, tpl.email.html, emailKey, 'customer', null, 'product_question_answered', { user_id: buyerUserId, outbox_id: evOutboxId });
          }
        }
        return { success: true };
      }

      // ----------------------------------------------------------------------
      // O. LOGISTICS INCIDENTS & INTERNATIONAL UPDATES
      // ----------------------------------------------------------------------
      if (evType === 'logistics_incident' || evType === 'international_order_updated' || evType === 'international_purchase_failed') {
        const isPriority = evType === 'international_purchase_failed' || evType === 'logistics_incident';
        const { data: order } = evOrderId ? await supabaseAdmin.from('orders').select('*').eq('id', evOrderId).maybeSingle() : { data: null };
        const orderNumStr = order ? formatOrderNumber(order) : '#COL';
        const customerId = order?.customer_id || order?.user_id || null;
        const unitKey = evPayload.shipment_id || evOrderId || Date.now().toString();

        // Admin alert
        await dispatchInAppNotification({
          role_scope: 'admin',
          category: 'alerts',
          event_type: evType,
          title: isPriority ? `🚨 Incidencia operativa — Pedido ${orderNumStr}` : `🌐 Actualización internacional — ${orderNumStr}`,
          body: evPayload.error_message || evPayload.reason || `Evento ${evType} registrado en el pedido ${orderNumStr}.`,
          action_url: `/admin/orders?order_id=${evOrderId || ''}`,
          entity_type: 'order',
          entity_id: String(evOrderId || unitKey),
          severity: isPriority ? 'priority' : 'info',
          idempotency_key: `inapp:admin:${evType}:${unitKey}`
        });

        if (isPriority) {
          const activeAdminEmails = await getActiveEmailRecipients('admin', null);
          for (let i = 0; i < activeAdminEmails.length; i++) {
            await dispatchEmailProvider(
              activeAdminEmails[i].email,
              `🚨 Alerta Operativa — Pedido ${orderNumStr}`,
              `<p>Se detectó una incidencia en el pedido <strong>${orderNumStr}</strong>:</p><p>${evPayload.error_message || evPayload.reason || evType}</p>`,
              `admin_${evType}:${unitKey}:email:${i}`,
              'admin',
              null,
              evType,
              { order_id: evOrderId, outbox_id: evOutboxId }
            );
          }
        }

        if (evType === 'international_order_updated' && customerId) {
          await dispatchInAppNotification({
            user_id: customerId,
            role_scope: 'customer',
            category: 'shipments',
            event_type: evType,
            title: `🌐 Actualización de compra internacional — ${orderNumStr}`,
            body: evPayload.reason || `Tu compra internacional avanzó a estado: ${evPayload.status || 'En tránsito'}.`,
            action_url: `/account?tab=orders&order_id=${evOrderId}`,
            entity_type: 'order',
            entity_id: String(evOrderId),
            severity: 'info',
            idempotency_key: `inapp:customer:intl_update:${evOrderId}:${evPayload.status || unitKey}`
          });
        }
        return { success: true };
      }

      return { success: true };
    };

    // ════════════════════════════════════════════════════════════════════════
    // 5. SPECIAL OPERATIONS: OUTBOX DRAIN, RETRY & TEST NOTIFICATION
    // ════════════════════════════════════════════════════════════════════════
    if (event_type === 'process_outbox') {
      const workerId = `dispatcher-outbox-${Math.random().toString(36).slice(2, 8)}`;
      const batchSize = Math.min(50, Math.max(1, Number(body.batch_size || 20)));
      const { data: claimed, error: claimErr } = await supabaseAdmin.rpc('claim_notification_outbox_batch', {
        p_worker_id: workerId,
        p_limit: batchSize,
        p_lock_seconds: 180
      });

      if (claimErr) {
        return new Response(JSON.stringify({ error: claimErr.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const rows = Array.isArray(claimed) ? claimed : [];
      let processed = 0;
      let retried = 0;
      let exhausted = 0;

      for (const row of rows) {
        try {
          const itemPayload: NotificationPayload = {
            ...(row.payload || {}),
            event_type: row.event_type,
            idempotency_key: row.idempotency_key,
            outbox_id: row.id
          };
          const res = await processSingleEvent(itemPayload);

          if (res.success || res.skipped) {
            await supabaseAdmin
              .from('notification_outbox')
              .update({
                status: 'sent',
                processed_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                locked_by: null,
                locked_at: null,
                last_error: null,
                error_classification: 'none'
              })
              .eq('id', row.id);
            processed++;
          } else {
            const isExhausted = row.attempts >= row.max_attempts || res.transientFailure === false;
            const backoffSec = Math.min(3600, Math.pow(2, row.attempts) * 30);
            const nextRetryIso = new Date(Date.now() + backoffSec * 1000).toISOString();

            await supabaseAdmin
              .from('notification_outbox')
              .update({
                status: isExhausted ? 'exhausted' : 'retrying',
                next_retry_at: nextRetryIso,
                updated_at: new Date().toISOString(),
                locked_by: null,
                locked_at: null,
                last_error: res.error || 'Error en entrega de canal',
                error_classification: res.transientFailure ? 'transient' : 'permanent'
              })
              .eq('id', row.id);

            if (isExhausted) exhausted++;
            else retried++;
          }
        } catch (err: any) {
          const isExhausted = row.attempts >= row.max_attempts;
          const backoffSec = Math.min(3600, Math.pow(2, row.attempts) * 30);
          await supabaseAdmin
            .from('notification_outbox')
            .update({
              status: isExhausted ? 'exhausted' : 'retrying',
              next_retry_at: new Date(Date.now() + backoffSec * 1000).toISOString(),
              updated_at: new Date().toISOString(),
              locked_by: null,
              locked_at: null,
              last_error: err.message,
              error_classification: 'transient'
            })
            .eq('id', row.id);
          if (isExhausted) exhausted++;
          else retried++;
        }
      }

      return new Response(JSON.stringify({
        success: true,
        claimed: rows.length,
        processed,
        retried,
        exhausted
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Safe Administrative Re-dispatch (Only retries notification delivery; NEVER re-executes business/financial logic)
    if (event_type === 'retry_notification') {
      if (body.outbox_id) {
        const { data: outboxRow } = await supabaseAdmin
          .from('notification_outbox')
          .select('*')
          .eq('id', body.outbox_id)
          .maybeSingle();

        if (!outboxRow) {
          return new Response(JSON.stringify({ error: 'Outbox record not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // Delete failed notification_logs for this outbox_id so idempotency allows fresh delivery attempt
        await supabaseAdmin
          .from('notification_logs')
          .delete()
          .eq('outbox_id', outboxRow.id)
          .in('status', ['failed', 'retrying', 'exhausted', 'provider_unavailable']);

        const res = await processSingleEvent({
          ...(outboxRow.payload || {}),
          event_type: outboxRow.event_type,
          idempotency_key: outboxRow.idempotency_key,
          outbox_id: outboxRow.id
        });

        await supabaseAdmin
          .from('notification_outbox')
          .update({
            status: res.success ? 'sent' : 'failed',
            attempts: (outboxRow.attempts || 0) + 1,
            processed_at: res.success ? new Date().toISOString() : null,
            last_error: res.error || null,
            updated_at: new Date().toISOString()
          })
          .eq('id', outboxRow.id);

        return new Response(JSON.stringify({ success: res.success, result: res }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (body.log_id) {
        const { data: logRow } = await supabaseAdmin
          .from('notification_logs')
          .select('*')
          .eq('id', body.log_id)
          .maybeSingle();

        if (!logRow) {
          return new Response(JSON.stringify({ error: 'Notification log not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        if (logRow.outbox_id) {
          // Delegate to outbox retry
          const { data: outboxRow } = await supabaseAdmin.from('notification_outbox').select('*').eq('id', logRow.outbox_id).maybeSingle();
          if (outboxRow) {
            await supabaseAdmin.from('notification_logs').delete().eq('id', logRow.id);
            const res = await processSingleEvent({
              ...(outboxRow.payload || {}),
              event_type: outboxRow.event_type,
              idempotency_key: outboxRow.idempotency_key,
              outbox_id: outboxRow.id
            });
            return new Response(JSON.stringify({ success: res.success, result: res }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }
        }

        return new Response(JSON.stringify({ success: false, error: 'Este registro histórico no contiene carga útil reprocesable.' }), { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // Test Notification (Admin & Vendor Settings UI)
    if (event_type === 'test_notification') {
      const testChannel = body.channel || 'push';
      const targetUserId = isSystemCaller ? (body_user_ids?.[0] || authUserId) : authUserId;
      const testKey = `test:${testChannel}:${targetUserId || 'test'}:${Date.now()}`;
      const scope: RoleScope = body_vendor_id ? 'vendor' : 'admin';

      // Also insert into In-App Activity Center so user sees immediate feedback in bell
      await dispatchInAppNotification({
        user_id: targetUserId,
        vendor_id: body_vendor_id || null,
        role_scope: scope,
        category: 'alerts',
        event_type: 'test_notification',
        title: `🔔 Notificación de prueba (${testChannel.toUpperCase()})`,
        body: `Prueba de canal ${testChannel.toUpperCase()} ejecutada correctamente.`,
        action_url: scope === 'vendor' ? '/vendor?tab=settings' : '/admin/notifications',
        severity: 'success',
        idempotency_key: `inapp:${testKey}`
      });

      if (testChannel === 'email') {
        const activeRecipients = await getActiveEmailRecipients(scope, body_vendor_id || null);

        if (activeRecipients.length === 0) {
          return new Response(JSON.stringify({ status: 'no_active_recipients', error: 'No hay destinatarios Email configurados.' }), { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const vendorTag = body_vendor_id ? ' (Vendedor)' : '';
        const subject = body.subject || "Prueba de notificaciones — Collectibles";
        const emailMessage = body.body || `Esta es una notificación de prueba. El canal Email está funcionando correctamente.${vendorTag} ✅`;
        const htmlBody = `<div style="font-family: sans-serif; padding: 20px; color: #333;"><h2 style="color: #f00856;">Collectibles.uy</h2><p>${emailMessage}</p></div>`;

        let successCount = 0;
        let lastError: string | null = null;
        let lastStatus = 200;

        for (let i = 0; i < activeRecipients.length; i++) {
          const r = activeRecipients[i];
          const recipientKey = `${testKey}:${r.email}:${i}`;
          const result = await dispatchEmailProvider(r.email, subject, htmlBody, recipientKey, scope, body_vendor_id || null, 'test_notification', { user_id: targetUserId });

          if (result.success) {
            successCount++;
          } else {
            lastError = result.error || 'Error al entregar correo';
            lastStatus = result.status;
          }
        }

        if (successCount > 0) {
          return new Response(JSON.stringify({ success: true, count: successCount, total: activeRecipients.length, message: `Email de prueba enviado a ${successCount} destinatario(s) activo(s)` }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        } else if (lastStatus === 503) {
          return new Response(JSON.stringify({ status: 'provider_unavailable', error: 'Falta RESEND_API_KEY en Supabase Secrets' }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        } else {
          return new Response(JSON.stringify({ status: 'failed', error: lastError || 'Error al entregar correo vía Resend API' }), { status: lastStatus || 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      } else {
        const title = body.title || "Collectibles Marketplace";
        const message = body.body || "Esta es una notificación de prueba. Todo está funcionando correctamente. ✅";
        const targetUrl = body.url || "https://collectibles.uy";

        if (targetUserId) {
          await dispatchPushProvider([targetUserId], body_vendor_id || null, title, message, targetUrl, testKey, scope, 'test_notification');
        } else {
          await logNotification({
            scope,
            vendor_id: body_vendor_id || null,
            event_type: 'test_notification',
            channel: 'push',
            provider: 'onesignal',
            recipient: 'Usuario de prueba',
            status: 'provider_unavailable',
            idempotency_key: testKey,
            error_message: 'No se especificó un usuario autenticado para enviar la prueba.'
          });
        }
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // 6. PROCESS DIRECT EVENT & UPDATE OUTBOX IF LINKED
    // ════════════════════════════════════════════════════════════════════════
    const result = await processSingleEvent(body);

    if (body.outbox_id) {
      if (result.success || result.skipped) {
        await supabaseAdmin
          .from('notification_outbox')
          .update({
            status: 'sent',
            processed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            locked_by: null,
            locked_at: null,
            last_error: null,
            error_classification: 'none'
          })
          .eq('id', body.outbox_id);
      } else {
        await supabaseAdmin
          .from('notification_outbox')
          .update({
            status: result.transientFailure ? 'retrying' : 'failed',
            next_retry_at: new Date(Date.now() + 60000).toISOString(),
            updated_at: new Date().toISOString(),
            locked_by: null,
            locked_at: null,
            last_error: result.error || 'Error en entrega'
          })
          .eq('id', body.outbox_id);
      }
    }

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error("[Notification Dispatcher Error]:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
