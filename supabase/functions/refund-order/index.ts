import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { verifyAdmin } from "../_shared/auth.ts";

Deno.serve(async (req: Request) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    // SECURITY: Only admins can process refunds
    await verifyAdmin(req);

    const { orderId, reason } = await req.json();
    if (!orderId) throw new Error("Falta el ID de la orden");

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Obtener la orden
    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (error || !order) {
      console.error("Error fetching order:", error);
      throw new Error("Orden no encontrada");
    }
    if (order.status === "cancelada") throw new Error("La orden ya está cancelada");

    // Fetch order items separately
    const { data: orderItems } = await supabaseAdmin
      .from("order_items")
      .select("*")
      .eq("order_id", orderId);

    // Fetch customer email if customer_id exists
    let customerEmail = order.customer_email;
    let customerPhone = order.customer_phone;
    if (order.customer_id && !customerEmail) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("email")
        .eq("id", order.customer_id)
        .single();
      if (profile) customerEmail = profile.email;
    }

    // Fetch site settings to get payment tokens
    const { data: settings } = await supabaseAdmin.from('site_settings').select('key, value');
    const config = Object.fromEntries((settings || []).map((s: any) => [s.key, s.value]));
      
    let mpAccessToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN") || config.payments_mercadopago_access_token;

    let refundSuccess = false;
    let refundDetails: any = null;
    const isTestMode = mpAccessToken?.startsWith('TEST-') || mpAccessToken?.includes('test');

    // ═══ REFUND LOGIC ═══
    // Attempt refund for paid MercadoPago orders
    if (order.payment_method === 'mercadopago' && mpAccessToken && !mpAccessToken.includes("mock")) {
      
      if (isTestMode) {
        console.warn("[Refund] ⚠️ Using TEST access token. Sandbox refunds will succeed via API but WON'T affect real credit cards.");
      }
      
      // Step 1: Find the actual MP payment ID
      let actualPaymentId = order.payment_id;
      
      // If payment_id is not a numeric MP payment ID, search for it
      if (!actualPaymentId || isNaN(Number(actualPaymentId)) || String(actualPaymentId).startsWith('MP-MOCK')) {
        console.log(`[Refund] payment_id "${actualPaymentId}" is not a valid MP payment ID. Searching by external_reference...`);
        
        try {
          const searchUrl = `https://api.mercadopago.com/v1/payments/search?external_reference=${orderId}&sort=date_created&criteria=desc`;
          const searchRes = await fetch(searchUrl, {
            headers: { "Authorization": `Bearer ${mpAccessToken}` }
          });
          const searchData = await searchRes.json();
          
          if (searchRes.ok && searchData.results?.length > 0) {
            // Find the approved payment
            const approvedPayment = searchData.results.find((p: any) => p.status === 'approved') || searchData.results[0];
            actualPaymentId = approvedPayment.id.toString();
            console.log(`[Refund] Found MP payment: ${actualPaymentId} (status: ${approvedPayment.status})`);
            
            // Also update the order with the correct payment_id for future reference
            await supabaseAdmin.from('orders').update({ payment_id: actualPaymentId }).eq('id', orderId);
            
            // If payment was approved, also ensure order status reflects it before cancelling
            if (approvedPayment.status === 'approved' && order.status === 'pending') {
              order.status = 'paid'; // Update local reference so refund logic proceeds
            }
          } else {
            console.log(`[Refund] No MP payments found for order ${orderId}`);
          }
        } catch (searchErr: any) {
          console.error("[Refund] Error searching MP payments:", searchErr.message);
        }
      }

      // Step 2: Process the refund if we have a valid payment ID and order was paid
      if (actualPaymentId && !isNaN(Number(actualPaymentId)) && (order.status === 'paid' || order.status === 'pending')) {
        try {
          console.log(`[Refund] Attempting refund for MP payment ${actualPaymentId}`);
          
          const resp = await fetch(`https://api.mercadopago.com/v1/payments/${actualPaymentId}/refunds`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${mpAccessToken}`,
              'Content-Type': 'application/json'
            }
          });
          const mpData = await resp.json();
          
          if (!resp.ok) {
            console.error("Error Mercado Pago Refund:", mpData);
            refundDetails = { error: mpData.message || 'Refund failed', mp_status: mpData.status, isTestMode };
            // Don't throw - still cancel the order even if refund fails
          } else {
            refundSuccess = true;
            refundDetails = { refund_id: mpData.id, amount: mpData.amount, status: mpData.status, isTestMode };
            console.log(`[Refund] MP refund ${isTestMode ? '(SANDBOX)' : '(PRODUCTION)'} successful: ${JSON.stringify(refundDetails)}`);
          }
        } catch (e: any) {
          console.error("MP refund error:", e.message);
          refundDetails = { error: e.message };
        }
      } else if (order.status === 'pending') {
        // Payment might exist at MP but order never got updated — try anyway
        console.log("[Refund] Order is pending, no payment found. Cancelling without refund.");
        refundSuccess = true;
      }
    } else if (order.payment_method === 'paypal') {
      // PayPal refund logic
      const isSandbox = config.payments_paypal_sandbox === 'true';
      const clientId = config.payments_paypal_client_id;
      const secret = config.payments_paypal_client_secret || config.payments_paypal_secret_key;
      const baseUrl = isSandbox ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";

      if (clientId && secret && order.payment_id && order.status === 'paid') {
        try {
          // Get PayPal token
          const auth = btoa(`${clientId}:${secret}`);
          const tokenRes = await fetch(`${baseUrl}/v1/oauth2/token`, {
            method: "POST",
            headers: { "Authorization": `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
            body: "grant_type=client_credentials"
          });
          const tokenData = await tokenRes.json();

          if (tokenRes.ok) {
            // Find the capture ID from the payment
            const captureRes = await fetch(`${baseUrl}/v2/checkout/orders/${order.payment_id}`, {
              headers: { "Authorization": `Bearer ${tokenData.access_token}` }
            });
            const captureData = await captureRes.json();
            const captureId = captureData?.purchase_units?.[0]?.payments?.captures?.[0]?.id;
            
            if (captureId) {
              const refundRes = await fetch(`${baseUrl}/v2/payments/captures/${captureId}/refund`, {
                method: "POST",
                headers: {
                  "Authorization": `Bearer ${tokenData.access_token}`,
                  "Content-Type": "application/json"
                }
              });
              const refundData = await refundRes.json();
              
              if (refundRes.ok) {
                refundSuccess = true;
                refundDetails = { refund_id: refundData.id, status: refundData.status };
              } else {
                refundDetails = { error: refundData.message || 'PayPal refund failed' };
              }
            }
          }
        } catch (e: any) {
          console.error("PayPal refund error:", e.message);
          refundDetails = { error: e.message };
        }
      }
    } else {
      // Non-payment or mock — no refund needed
      console.log("No refund needed (mock/transfer/other). Cancelling directly.");
      refundSuccess = true;
    }

    // ═══ RESTORE INVENTORY ═══
    try {
      if (orderItems && orderItems.length > 0) {
        for (const item of orderItems) {
          if (item.variant_id) {
            const { data: variant } = await supabaseAdmin
              .from('product_variants')
              .select('inventory_count')
              .eq('id', item.variant_id)
              .single();
            if (variant) {
              await supabaseAdmin
                .from('product_variants')
                .update({ inventory_count: (variant.inventory_count || 0) + item.quantity })
                .eq('id', item.variant_id);
            }
          }
        }
      }
    } catch (stockErr: any) {
      console.error("Error restoring inventory (non-fatal):", stockErr.message);
    }

    // ═══ UPDATE ORDER STATUS ═══
    const refundNote = refundSuccess ? 'Reembolso procesado' : (refundDetails?.error ? `Reembolso fallido: ${refundDetails.error}` : 'Sin reembolso');
    const cancelNote = `Cancelada: ${reason || 'Sin razón'}. ${refundNote}`;
    
    await supabaseAdmin.from("orders").update({ 
      status: "cancelada",
      delivery_notes: order.delivery_notes ? `${order.delivery_notes}\n${cancelNote}` : cancelNote
    }).eq("id", orderId);

    // ═══ SEND CANCELLATION EMAIL ═══
    if (customerEmail) {
      const internalUrl = supabaseUrl + "/functions/v1/transactional-emails";
      await fetch(internalUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify({
          type: 'custom_order_cancelled',
          order: { ...order, customer_email: customerEmail, customer_phone: customerPhone },
          reason: reason || "Cancelada por el administrador"
        })
      }).catch(e => console.error("Error enviando email de cancelacion:", e));
    }

    return new Response(JSON.stringify({ success: true, refundSuccess, refundDetails }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: any) {
    console.error("refund-order error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
