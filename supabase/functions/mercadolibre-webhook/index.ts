import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ML_CLIENT_ID = Deno.env.get("MERCADOLIBRE_CLIENT_ID") || "";
const ML_CLIENT_SECRET = Deno.env.get("MERCADOLIBRE_CLIENT_SECRET") || "";

// Custom fetch for test intercepting
async function getValidTokenForSeller(supabase: any, sellerId: string, fetchFn: typeof fetch = fetch) {
  const { data, error } = await supabase
    .from('ml_seller_accounts')
    .select('*')
    .eq('seller_id', sellerId)
    .maybeSingle();

  if (error || !data) return null;

  let currentAccessToken = data.access_token;
  let currentRefreshToken = data.refresh_token;
  let currentExpiresAt = data.expires_at;

  if (currentExpiresAt && new Date(currentExpiresAt) <= new Date()) {
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: ML_CLIENT_ID,
      client_secret: ML_CLIENT_SECRET,
      refresh_token: currentRefreshToken
    });
    const res = await fetchFn("https://api.mercadolibre.com/oauth/token", {
       method: "POST",
       headers: { "Content-Type": "application/x-www-form-urlencoded" },
       body: params.toString()
    });
    if (res.ok) {
       const mlData = await res.json();
       const expiresAt = new Date(Date.now() + (mlData.expires_in * 1000)).toISOString();
       currentAccessToken = mlData.access_token;
       currentRefreshToken = mlData.refresh_token || currentRefreshToken;
       currentExpiresAt = expiresAt;
       
       await supabase.from('ml_seller_accounts').update({
           access_token: currentAccessToken,
           refresh_token: currentRefreshToken,
           expires_at: currentExpiresAt,
           updated_at: new Date().toISOString()
        }).eq('id', data.id);
     } else {
        try {
          const { sendAlert } = await import("../_shared/alerts.ts");
          await sendAlert(supabase, {
            alertType: "oauth_expired",
            severity: "critical",
            message: `OAuth token refresh failed for seller account ${sellerId}. Account disconnected.`,
            details: { seller_id: sellerId, error: "OAuth token refresh failed" },
            sellerId: sellerId
          });
        } catch (e: any) {
           console.error("Alert trigger failed in token refresh:", e.message);
        }
        throw new Error("Mercado Libre token refresh failed during webhook processing.");
     }
  }
  return currentAccessToken;
}

async function processEvent(supabase: any, eventId: string, fetchFn: typeof fetch = fetch) {
  const { data: event, error: fetchErr } = await supabase
    .from('ml_incoming_events')
    .select('*')
    .eq('id', eventId)
    .single();

  if (fetchErr || !event) {
    console.error(`[Webhook Process] Event ${eventId} not found`);
    return;
  }

  // Set processing status
  await supabase
    .from('ml_incoming_events')
    .update({ status: 'processing', attempts: event.attempts + 1, last_error: null })
    .eq('id', eventId);

  try {
    const sellerId = event.seller_id;
    if (!sellerId) {
      throw new Error("Missing seller_id in event metadata");
    }

    const token = await getValidTokenForSeller(supabase, sellerId, fetchFn);
    if (!token) {
      throw new Error(`No active Mercado Libre connection found for seller: ${sellerId}`);
    }

    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

    // Fetch vendor_id from seller account
    const { data: sellerAcc } = await supabase
      .from('ml_seller_accounts')
      .select('vendor_id')
      .eq('seller_id', sellerId)
      .maybeSingle();
    const vendorId = sellerAcc?.vendor_id || null;

    // ═══ Topic: orders / orders_v2 ═══
    if (event.topic === 'orders' || event.topic === 'orders_v2' || event.topic === 'orders_feed') {
      const orderId = event.resource.split('/').pop();
      console.log(`[Webhook Process] Processing order ${orderId}...`);

      const orderRes = await fetchFn(`https://api.mercadolibre.com/orders/${orderId}`, { headers });
      if (!orderRes.ok) {
        throw new Error(`Failed to fetch order ${orderId} from ML (HTTP ${orderRes.status})`);
      }
      const mlOrder = await orderRes.json();

      // Check if order already exists locally
      const { data: existingOrder } = await supabase
        .from('orders')
        .select('id, status')
        .eq('ml_order_id', orderId)
        .maybeSingle();

      if (!existingOrder) {
        // Fetch shipping address details if exists
        let shippingAddressObj = {
          first_name: mlOrder.buyer?.first_name || 'Comprador',
          last_name: mlOrder.buyer?.last_name || 'ML',
          phone: mlOrder.buyer?.phone?.number || '',
          street: 'Retiro en sucursal / Ver ML',
          city: 'Montevideo',
          department: 'Montevideo',
          shipping_method: 'mercadolibre'
        };

        if (mlOrder.shipping && mlOrder.shipping.id) {
          const shipRes = await fetchFn(`https://api.mercadolibre.com/shipments/${mlOrder.shipping.id}`, { headers });
          if (shipRes.ok) {
            const mlShip = await shipRes.json();
            const addr = mlShip.receiver_address || {};
            shippingAddressObj = {
              first_name: mlShip.receiver_name || mlOrder.buyer?.first_name || 'Comprador',
              last_name: mlOrder.buyer?.last_name || 'ML',
              phone: mlShip.receiver_phone || mlOrder.buyer?.phone?.number || '',
              street: `${addr.street_name || ''} ${addr.street_number || ''} ${addr.comment || ''}`.trim(),
              city: addr.city?.name || 'Montevideo',
              department: addr.state?.name || 'Montevideo',
              shipping_method: 'mercadolibre'
            };
          }
        }

        // Calculate order amounts
        const totalAmount = Number(mlOrder.total_amount || 0);

        // Create Order local record
        const { data: newOrder, error: orderErr } = await supabase
          .from('orders')
          .insert({
            total_amount: totalAmount,
            currency: mlOrder.currency_id || 'UYU',
            status: mlOrder.status === 'paid' ? 'paid' : 'pending',
            payment_status: mlOrder.status === 'paid' ? 'approved' : 'pending_payment',
            payment_method: 'MercadoPago',
            payment_id: mlOrder.payments?.[0]?.id?.toString() || null,
            customer_email: mlOrder.buyer?.email || `ml-buyer-${mlOrder.buyer?.id}@mercadolibre.com`,
            customer_phone: mlOrder.buyer?.phone?.number || '',
            shipping_address: shippingAddressObj,
            ml_order_id: orderId,
            payment_processed_at: mlOrder.status === 'paid' ? new Date().toISOString() : null
          })
          .select()
          .single();

        if (orderErr) throw new Error(`Failed to create local order: ${orderErr.message}`);

        // Process order items
        const orderItems = mlOrder.order_items || [];
        for (const item of orderItems) {
          const mlItemId = item.item?.id;
          const qty = Number(item.quantity || 1);
          const price = Number(item.unit_price || 0);

          // Find local catalog mapping
          const { data: link } = await supabase
            .from('ml_catalog_links')
            .select('product_id, variant_id, vendor_product_id, vendor_product_variant_id')
            .eq('ml_item_id', mlItemId)
            .maybeSingle();

          if (link) {
            // Insert order item
            const { error: itemErr } = await supabase
              .from('order_items')
              .insert({
                order_id: newOrder.id,
                product_id: link.product_id,
                variant_id: link.variant_id,
                quantity: qty,
                unit_price: price,
                total_price: price * qty,
                vendor_id: vendorId
              });

            if (itemErr) {
              console.error(`[Webhook Process] Error inserting order item:`, itemErr.message);
            }

            // Deduct master stock
            const { error: invErr } = await supabase.rpc("decrement_inventory", {
              p_variant_id: link.variant_id,
              p_quantity: qty,
              p_skip_ml_sync: true
            });
            if (invErr) console.error(`[Webhook Process] Master inventory decrement failed:`, invErr.message);

            // Deduct vendor variants stock if applicable
            if (link.vendor_product_variant_id) {
              const { data: vvVariant } = await supabase
                .from('vendor_product_variants')
                .select('inventory_count')
                .eq('id', link.vendor_product_variant_id)
                .maybeSingle();

              if (vvVariant) {
                const newStock = Math.max((vvVariant.inventory_count || 0) - qty, 0);
                const { error: vvErr } = await supabase
                  .from('vendor_product_variants')
                  .update({
                    inventory_count: newStock,
                    skip_ml_sync: true,
                    updated_at: new Date().toISOString()
                  })
                  .eq('id', link.vendor_product_variant_id);
                if (vvErr) console.error(`[Webhook Process] Vendor product variant decrement failed:`, vvErr.message);
              }
            }
          } else {
            console.warn(`[Webhook Process] Order item ${mlItemId} has no local catalog link. Skipping inventory decrement.`);
            // Create unlinked item in order_items for catalog consistency
            await supabase
              .from('order_items')
              .insert({
                order_id: newOrder.id,
                product_id: null,
                variant_id: null,
                quantity: qty,
                unit_price: price,
                total_price: price * qty,
                vendor_id: vendorId
              });
          }
        }

        // Log success audit
        await supabase.from('ml_import_logs').insert({
          seller_id: sellerId,
          action: 'webhook_order_created',
          status: 'success',
          details: {
            ml_order_id: orderId,
            local_order_id: newOrder.id,
            total_items: orderItems.length
          }
        });
      } else {
        // Order exists, check if status changed to paid
        const newStatus = mlOrder.status === 'paid' ? 'paid' : existingOrder.status;
        if (existingOrder.status !== 'paid' && newStatus === 'paid') {
          await supabase
            .from('orders')
            .update({
              status: 'paid',
              payment_status: 'approved',
              payment_processed_at: new Date().toISOString(),
              payment_id: mlOrder.payments?.[0]?.id?.toString() || null
            })
            .eq('id', existingOrder.id);

          // Deduct stock if it was not deducted (assumes it was pending payment)
          const { data: localItems } = await supabase
            .from('order_items')
            .select('*')
            .eq('order_id', existingOrder.id);

          for (const item of (localItems || [])) {
            if (item.variant_id) {
              await supabase.rpc("decrement_inventory", {
                p_variant_id: item.variant_id,
                p_quantity: item.quantity
              });
            }
          }

          // Log success audit
          await supabase.from('ml_import_logs').insert({
             seller_id: sellerId,
             action: 'webhook_order_paid',
             status: 'success',
             details: {
               ml_order_id: orderId,
               local_order_id: existingOrder.id
             }
          });
        }
      }
    }
    // ═══ Topic: items ═══
    else if (event.topic === 'items') {
      const mlItemId = event.resource.split('/').pop();
      console.log(`[Webhook Process] Processing item ${mlItemId} update...`);

      const itemRes = await fetchFn(`https://api.mercadolibre.com/items/${mlItemId}`, { headers });
      if (!itemRes.ok) {
        throw new Error(`Failed to fetch item ${mlItemId} from ML (HTTP ${itemRes.status})`);
      }
      const mlItem = await itemRes.json();

      // Find staging raw record
      const { data: rawRecord } = await supabase
        .from('ml_raw_items')
        .select('*')
        .eq('ml_item_id', mlItemId)
        .maybeSingle();

      if (rawRecord) {
        // Update raw staging values
        const meta = rawRecord.raw_payload?.normalized_metadata || {};
        meta.extracted_seller_sku = mlItem.attributes?.find((a: any) => a.id === 'SELLER_SKU')?.value_name || meta.extracted_seller_sku;
        
        const newPayload = {
          ...mlItem,
          description: rawRecord.raw_payload?.description || mlItem.title,
          normalized_metadata: meta
        };

        await supabase
          .from('ml_raw_items')
          .update({
            title: mlItem.title,
            price: Number(mlItem.price || 0),
            available_quantity: Number(mlItem.available_quantity || 0),
            raw_payload: newPayload,
            updated_at: new Date().toISOString()
          })
          .eq('id', rawRecord.id);
      }

      // Handle listing state changes (pause or delete)
      const isPaused = mlItem.status === 'paused' || mlItem.status === 'closed' || mlItem.status === 'under_review';
      if (isPaused) {
        console.log(`[Webhook Process] Item ${mlItemId} is paused/closed in ML. Disabling local vendor offer...`);
        // Find links
        const { data: links } = await supabase
          .from('ml_catalog_links')
          .select('vendor_product_id')
          .eq('ml_item_id', mlItemId);

        for (const link of (links || [])) {
          if (link.vendor_product_id) {
            // Pause vendor product offer
            await supabase
              .from('vendor_products')
              .update({ status: 'paused', updated_at: new Date().toISOString() })
              .eq('id', link.vendor_product_id);
          }
        }
      }

      // Log success audit
      await supabase.from('ml_import_logs').insert({
        seller_id: sellerId,
        action: 'webhook_item_updated',
        status: 'success',
        details: {
          ml_item_id: mlItemId,
          ml_status: mlItem.status,
          ml_stock: mlItem.available_quantity
        }
      });
    }
    // ═══ Topic: questions / messages / others ═══
    else {
      console.log(`[Webhook Process] Skipping unhandled topic: ${event.topic}`);
    }

    // Set processed status
    await supabase
      .from('ml_incoming_events')
      .update({ status: 'processed', processed_at: new Date().toISOString() })
      .eq('id', eventId);

  } catch (err: any) {
    console.error(`[Webhook Process] Error processing event ${eventId}:`, err.message);

    const isDeadLetter = event.attempts + 1 >= 3;
    const finalStatus = isDeadLetter ? 'dead_letter' : 'failed';

    await supabase
      .from('ml_incoming_events')
      .update({
        status: finalStatus,
        last_error: err.message,
        processed_at: new Date().toISOString()
      })
      .eq('id', eventId);

    // If dead letter, insert to dlq table
    if (isDeadLetter) {
      await supabase
        .from('ml_dead_letter_queue')
        .insert({
          event_id: eventId,
          resource: event.resource,
          topic: event.topic,
          seller_id: event.seller_id,
          raw_payload: event.raw_payload,
          error_message: err.message
        });

      await supabase.from('ml_import_logs').insert({
        seller_id: event.seller_id,
        action: 'webhook_dead_letter',
        status: 'error',
        details: {
          event_id: eventId,
          error: err.message,
          resource: event.resource
        }
      });

      // Trigger critical DLQ alert
      try {
        const { sendAlert } = await import("../_shared/alerts.ts");
        await sendAlert(supabase, {
          alertType: "dead_letter",
          severity: "critical",
          message: `Webhook event moved to Dead Letter Queue: ${err.message}`,
          details: { event_id: eventId, resource: event.resource, topic: event.topic, error: err.message },
          sellerId: event.seller_id
        });
      } catch (e: any) {
        console.error("Alert trigger failed in DLQ webhook error handler:", e.message);
      }
    } else {
      // Trigger warning webhook failure alert
      try {
        const { sendAlert } = await import("../_shared/alerts.ts");
        await sendAlert(supabase, {
          alertType: "webhook_failure",
          severity: "warning",
          message: `Webhook processing attempt ${event.attempts + 1} failed: ${err.message}`,
          details: { event_id: eventId, resource: event.resource, topic: event.topic, attempt: event.attempts + 1, error: err.message },
          sellerId: event.seller_id
        });
      } catch (e: any) {
        console.error("Alert trigger failed in webhook retry handler:", e.message);
      }
    }
  }
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const bypassSecret = Deno.env.get('TEST_BYPASS_SECRET');
  const isTestBypass = bypassSecret && req.headers.get('x-test-bypass') === bypassSecret;

  // Mock fetch functions for testing
  const mockOrderPayload = {
    id: 2000003508419054,
    status: "paid",
    total_amount: 1450.00,
    currency_id: "UYU",
    buyer: {
      id: 99988877,
      first_name: "John",
      last_name: "Doe",
      email: "johndoe@test.local",
      phone: { number: "099123456" }
    },
    shipping: { id: 4000000000 },
    payments: [{ id: 777666555, status: "approved" }],
    order_items: [{
      item: { id: "MLU615456398" },
      quantity: 1,
      unit_price: 1450.00
    }]
  };

  const mockShipmentPayload = {
    id: 4000000000,
    receiver_name: "John Doe Delivery",
    receiver_phone: "099123456",
    receiver_address: {
      street_name: "Av. Italia",
      street_number: "4567",
      comment: "Apto 302",
      city: { name: "Montevideo" },
      state: { name: "Montevideo" }
    }
  };

  const mockItemPayload = {
    id: "MLU615456398",
    title: "Harry Potter! Llaveros Plush - Cedric Diggory Amarillo",
    price: 1450.00,
    available_quantity: 2,
    status: "active",
    attributes: [{ id: "SELLER_SKU", value_name: "4895205606166" }]
  };

  const customFetch = async (url: string, init?: any) => {
    if (isTestBypass) {
      console.log(`[Mock Webhook Fetch] Intercepting URL: ${url}`);
      const parsed = new URL(url);
      const path = parsed.pathname;

      if (path === "/oauth/token") {
        return new Response(JSON.stringify({ access_token: "mock-new-token", expires_in: 3600 }), { status: 200 });
      }
      if (path.startsWith("/orders/")) {
        return new Response(JSON.stringify(mockOrderPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (path.startsWith("/shipments/")) {
        return new Response(JSON.stringify(mockShipmentPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (path.startsWith("/items/")) {
        return new Response(JSON.stringify(mockItemPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
    }
    return fetch(url, init);
  };

  try {
    const body = await req.json();
    const action = body.action;

    // Check Kill Switch for non-test actions
    const isTestAction = action === 'test_cleanup' ||
      action === 'test_assertion' ||
      action === 'test_decrement_inventory' ||
      action === 'test_cancel_order' ||
      action === 'test_expire_token' ||
      action === 'get_dlq_test' ||
      action === 'test_set_kill_switch' ||
      action === 'test_simulate_backlog' ||
      action === 'test_set_token_expiry';
    
    if (!isTestAction) {
      const { data: wsData } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'ml_webhooks_enabled')
        .maybeSingle();
      
      if (wsData?.value === 'false') {
        console.warn("[Webhook Server] Webhook processing is globally disabled (ml_webhooks_enabled = false). Aborting request.");
        return new Response(
          JSON.stringify({ success: false, error: "Webhooks are globally disabled", message: "Webhooks are globally disabled" }), 
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
      }
    }

    // ═══ Action: process_event (DB Webhook or Sweep trigger) ═══
    if (action === 'process_event') {
      const eventId = body.event_id;
      if (!eventId) throw new Error("Missing event_id");
      await processEvent(supabase, eventId, customFetch);
      return new Response(JSON.stringify({ success: true, processed: eventId }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ═══ Action: sweep (Cron job / manual Sweep) ═══
    if (action === 'sweep') {
      const { data: pendingEvents, error } = await supabase
        .from('ml_incoming_events')
        .select('id')
        .in('status', ['pending', 'failed'])
        .lt('attempts', 3)
        .order('created_at', { ascending: true })
        .limit(10);

      if (error) throw error;

      const processedIds = [];
      for (const ev of (pendingEvents || [])) {
        await processEvent(supabase, ev.id, customFetch);
        processedIds.push(ev.id);
      }

      return new Response(JSON.stringify({ success: true, swept_count: processedIds.length, ids: processedIds }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ═══ Action: get_dlq_test (For automated testing RLS bypass) ═══
    if (action === 'get_dlq_test') {
      if (!isTestBypass) {
        return new Response(JSON.stringify({ error: "Unauthorized test action" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const sellerId = body.seller_id;
      const { data, error } = await supabase
        .from('ml_dead_letter_queue')
        .select('id, resource, seller_id, error_message')
        .eq('seller_id', sellerId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return new Response(JSON.stringify({ success: true, data }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ═══ Action: test_cleanup (For automated testing RLS bypass) ═══
    if (action === 'test_cleanup') {
      if (!isTestBypass) {
        return new Response(JSON.stringify({ error: "Unauthorized test action" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      
      // Delete test orders
      await supabase.from('orders').delete().eq('ml_order_id', '2000003508419054');
      await supabase.from('orders').delete().eq('ml_order_id', '2000003508419055');
      // Delete test events
      await supabase.from('ml_incoming_events').delete().eq('resource', '/orders/2000003508419054');
      await supabase.from('ml_incoming_events').delete().eq('resource', '/orders/2000003508419055');
      await supabase.from('ml_incoming_events').delete().eq('resource', '/items/MLU000000000');
      // Delete test alerts
      await supabase.from('ml_alerts').delete().eq('alert_type', 'test_alert');
      await supabase.from('ml_alerts').delete().eq('alert_type', 'dead_letter');
      await supabase.from('ml_alerts').delete().eq('alert_type', 'oauth_expired');
      await supabase.from('ml_alerts').delete().eq('alert_type', 'webhook_failure');
      await supabase.from('ml_alerts').delete().eq('alert_type', 'stock_mismatch');
      await supabase.from('ml_alerts').delete().eq('alert_type', 'sync_queue_backlog');
      await supabase.from('ml_alerts').delete().eq('alert_type', 'oauth_expiring');
      // Delete simulated backlog items
      await supabase.from('ml_sync_queue').delete().eq('ml_item_id', 'MLU_MOCK_BACKLOG');

      return new Response(JSON.stringify({ success: true, message: "Test data cleaned up successfully" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ═══ Action: test_assertion (For automated testing RLS bypass) ═══
    if (action === 'test_assertion') {
      if (!isTestBypass) {
        return new Response(JSON.stringify({ error: "Unauthorized test action" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      
      const orderId = body.ml_order_id;
      const variantId = body.variant_id;
      const vendorVariantId = body.vendor_product_variant_id;
      const sellerId = body.seller_id;
      const eventResource = body.event_resource;

      let order = null;
      if (orderId) {
        const { data, error } = await supabase.from('orders').select('*').eq('ml_order_id', orderId).maybeSingle();
        if (error) console.error("[Test Assertion] orders query error:", error.message);
        order = data;
      }

      let variant = null;
      if (variantId) {
        const { data, error } = await supabase.from('product_variants').select('inventory_count').eq('id', variantId).maybeSingle();
        if (error) console.error("[Test Assertion] variants query error:", error.message);
        variant = data;
      }

      let vendorVariant = null;
      if (vendorVariantId) {
        const { data, error } = await supabase.from('vendor_product_variants').select('inventory_count').eq('id', vendorVariantId).maybeSingle();
        if (error) console.error("[Test Assertion] vendor variants query error:", error.message);
        vendorVariant = data;
      }

      let alert = null;
      if (body.alert_type) {
        const { data, error } = await supabase.from('ml_alerts').select('*').eq('alert_type', body.alert_type).order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (error) console.error("[Test Assertion] alerts query error:", error.message);
        alert = data;
      }

      let seller = null;
      if (sellerId) {
        const { data, error } = await supabase.from('ml_seller_accounts').select('*').eq('seller_id', sellerId).maybeSingle();
        if (error) console.error("[Test Assertion] seller query error:", error.message);
        seller = data;
      }

      let event = null;
      if (eventResource) {
        const { data, error } = await supabase.from('ml_incoming_events').select('*').eq('resource', eventResource).order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (error) console.error("[Test Assertion] event query error:", error.message);
        event = data;
      }

      return new Response(JSON.stringify({ success: true, order, variant, vendorVariant, alert, seller, event }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ═══ Action: test_cancel_order (For automated testing RLS bypass) ═══
    if (action === 'test_cancel_order') {
      if (!isTestBypass) {
        return new Response(JSON.stringify({ error: "Unauthorized test action" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const orderId = body.order_id;
      const { error } = await supabase
        .from('orders')
        .update({ status: 'cancelled' })
        .eq('id', orderId);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ═══ Action: test_expire_token (For automated testing RLS bypass) ═══
    if (action === 'test_expire_token') {
      if (!isTestBypass) {
        return new Response(JSON.stringify({ error: "Unauthorized test action" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const sellerId = body.seller_id;
      const pastDate = new Date(Date.now() - 3600 * 1000).toISOString();
      const { error } = await supabase
        .from('ml_seller_accounts')
        .update({ expires_at: pastDate })
        .eq('seller_id', sellerId);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ═══ Action: test_set_kill_switch (For automated testing RLS bypass) ═══
    if (action === 'test_set_kill_switch') {
      if (!isTestBypass) {
        return new Response(JSON.stringify({ error: "Unauthorized test action" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const enabled = body.enabled;
      const { error } = await supabase
        .from('site_settings')
        .upsert({
          key: 'ml_webhooks_enabled',
          value: enabled ? 'true' : 'false',
          updated_at: new Date().toISOString()
        }, { onConflict: 'key' });
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ═══ Action: test_simulate_backlog (For automated testing RLS bypass) ═══
    if (action === 'test_simulate_backlog') {
      if (!isTestBypass) {
        return new Response(JSON.stringify({ error: "Unauthorized test action" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const sellerId = body.seller_id;
      const variantId = body.variant_id;
      const productId = body.product_id;
      
      const itemsToInsert = [];
      for (let i = 0; i < 55; i++) {
        itemsToInsert.push({
          product_id: productId,
          variant_id: variantId,
          ml_item_id: 'MLU_MOCK_BACKLOG',
          seller_id: sellerId,
          action: 'sync_stock',
          payload: { available_quantity: 10 },
          status: 'pending',
          retry_count: 0
        });
      }
      const { error } = await supabase.from('ml_sync_queue').insert(itemsToInsert);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ═══ Action: test_set_token_expiry (For automated testing RLS bypass) ═══
    if (action === 'test_set_token_expiry') {
      if (!isTestBypass) {
        return new Response(JSON.stringify({ error: "Unauthorized test action" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const sellerId = body.seller_id;
      const hoursOffset = body.hours_offset || 0;
      const targetDate = new Date(Date.now() + hoursOffset * 3600 * 1000).toISOString();
      const { error } = await supabase
        .from('ml_seller_accounts')
        .update({ expires_at: targetDate })
        .eq('seller_id', sellerId);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ═══ Action: test_decrement_inventory (For automated testing RLS bypass) ═══
    if (action === 'test_decrement_inventory') {
      if (!isTestBypass) {
        return new Response(JSON.stringify({ error: "Unauthorized test action" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      
      const variantId = body.variant_id;
      const qty = body.quantity || 1;

      const { error } = await supabase.rpc("decrement_inventory", {
        p_variant_id: variantId,
        p_quantity: qty
      });

      if (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ═══ External Webhook Event Ingestion ═══
    const resource = body.resource;
    const topic = body.topic;
    const sellerIdStr = (body.user_id || "").toString();
    const appId = body.application_id;
    const sentAtStr = body.sent || new Date().toISOString();

    if (!resource || !topic) {
      return new Response(JSON.stringify({ error: "Invalid webhook payload (missing resource or topic)" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 1. Check idempotency: is there an active event in the queue?
    const { data: existingEvent } = await supabase
      .from('ml_incoming_events')
      .select('id, status')
      .eq('resource', resource)
      .eq('topic', topic)
      .eq('seller_id', sellerIdStr)
      .in('status', ['pending', 'processing'])
      .maybeSingle();

    if (existingEvent) {
      console.log(`[Webhook Event] Event already in queue or processing (Resource: ${resource}, Status: ${existingEvent.status}). Skipping...`);
      return new Response(JSON.stringify({ success: true, message: "Duplicate event skipped", id: existingEvent.id }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 2. Ingest or update the event as pending
    let newEvent = null;
    const { data: insertedEvent, error: insertErr } = await supabase
      .from('ml_incoming_events')
      .insert({
        resource,
        topic,
        seller_id: sellerIdStr,
        application_id: appId,
        sent_at: sentAtStr,
        raw_payload: body,
        status: 'pending',
        attempts: 0,
        last_error: null,
        processed_at: null
      })
      .select()
      .maybeSingle();

    if (insertErr) {
      if (insertErr.message?.includes('duplicate key')) {
        // Reset the existing processed/failed event to pending
        const { data: updatedEvent, error: updateErr } = await supabase
          .from('ml_incoming_events')
          .update({
            status: 'pending',
            attempts: 0,
            last_error: null,
            processed_at: null,
            sent_at: sentAtStr,
            raw_payload: body
          })
          .eq('resource', resource)
          .eq('topic', topic)
          .eq('seller_id', sellerIdStr)
          .select()
          .single();

        if (updateErr) throw updateErr;
        newEvent = updatedEvent;
      } else {
        throw insertErr;
      }
    } else {
      newEvent = insertedEvent;
    }

    if (!newEvent) {
      throw new Error("Failed to register event");
    }

    console.log(`[Webhook Event] Ingested event ${newEvent.id} (Resource: ${resource}, Topic: ${topic}). Responding 200 OK.`);

    // 3. Process event asynchronously in the background
    // EdgeRuntime.waitUntil is supported on Supabase Deno Deploy to keep isolate alive
    if (typeof (globalThis as any).EdgeRuntime !== 'undefined' && (globalThis as any).EdgeRuntime.waitUntil) {
      (globalThis as any).EdgeRuntime.waitUntil(processEvent(supabase, newEvent.id, customFetch));
    } else {
      // Local development background process (non-awaited promise)
      processEvent(supabase, newEvent.id, customFetch).catch(err => {
         console.error(`[Background Error] Failed to process event ${newEvent.id}:`, err.message);
      });
    }

    // Return low-latency response to Mercado Libre (<50ms)
    return new Response(JSON.stringify({ success: true, message: "Event ingested", id: newEvent.id }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    console.error("mercadolibre-webhook error:", err);
    return new Response(JSON.stringify({ success: false, error: err.message }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
  }
});
