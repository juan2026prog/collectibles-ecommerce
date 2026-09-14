import { enqueueMlSyncEvent } from "./mercadolibre.ts";
import { canTransitionOrder, canTransitionPayment, type OrderStatus, type PaymentStatus } from "./state-machine.ts";

export function orderSummary(order: any, isAuthorized: boolean = true) {
  if (!order) return null;

  const addr = order.shipping_address || {};
  const safeAddress = isAuthorized ? addr : {
    city: addr.city || null,
    department: addr.department || null,
    country: addr.country || "Uruguay",
    first_name: addr.first_name ? `${addr.first_name[0]}***` : null,
  };

  return {
    id: order.id,
    status: order.status,
    payment_status: order.payment_status,
    total_amount: order.total_amount,
    currency: order.currency || "UYU",
    payment_method: order.payment_method,
    customer_email: isAuthorized ? order.customer_email : (order.customer_email ? `${order.customer_email.split('@')[0].slice(0, 2)}***@${order.customer_email.split('@')[1]}` : null),
    customer_phone: isAuthorized ? order.customer_phone : null,
    shipping_address: safeAddress,
    payment_id: order.payment_id,
  };
}

/**
 * Helper to record/execute a durable outbox job idempotently
 */
async function recordAndExecuteJob(
  supabaseClient: any,
  params: {
    orderId: string;
    suborderId?: string | null;
    jobType: string;
    eventId: string;
    payload?: Record<string, any>;
    executor: () => Promise<any>;
  }
) {
  const { orderId, suborderId, jobType, eventId, payload = {}, executor } = params;

  // 1. Try to insert pending job into order_execution_jobs
  const { data: existingJob } = await supabaseClient
    .from("order_execution_jobs")
    .select("id, status, attempts")
    .eq("job_type", jobType)
    .eq("event_id", eventId)
    .maybeSingle();

  if (existingJob && existingJob.status === "COMPLETED") {
    console.log(`[Outbox] Job ${jobType} (${eventId}) already COMPLETED. Skipping.`);
    return existingJob;
  }

  let jobId = existingJob?.id;
  if (!jobId) {
    const { data: inserted, error: insertErr } = await supabaseClient
      .from("order_execution_jobs")
      .insert({
        order_id: orderId,
        suborder_id: suborderId || null,
        job_type: jobType,
        event_id: eventId,
        status: "PROCESSING",
        payload,
        attempts: 1,
      })
      .select("id")
      .single();

    if (insertErr) {
      console.warn(`[Outbox] Job record insert conflict for ${jobType} (${eventId}):`, insertErr.message);
    } else {
      jobId = inserted?.id;
    }
  } else {
    await supabaseClient
      .from("order_execution_jobs")
      .update({
        status: "PROCESSING",
        attempts: (existingJob.attempts || 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);
  }

  // 2. Execute the downstream task
  try {
    const result = await executor();
    if (jobId) {
      await supabaseClient
        .from("order_execution_jobs")
        .update({
          status: "COMPLETED",
          processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("id", jobId);
    }
    return result;
  } catch (err: any) {
    console.error(`[Outbox] Error executing job ${jobType} (${eventId}):`, err);
    if (jobId) {
      await supabaseClient
        .from("order_execution_jobs")
        .update({
          status: "FAILED",
          last_error: err?.message || String(err),
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId);
    }
  }
}

export async function triggerPostPaymentActions(
  supabaseClient: any,
  supabaseUrl: string,
  supabaseServiceRoleKey: string,
  orderId: string,
) {
  const functionHeaders = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${supabaseServiceRoleKey}`,
  };

  // 1. Enqueue ML Stock Sync Jobs
  const { data: orderItems } = await supabaseClient
    .from("order_items")
    .select("*")
    .eq("order_id", orderId);

  if (orderItems) {
    for (const item of orderItems) {
      if (item.variant_id) {
        await recordAndExecuteJob(supabaseClient, {
          orderId,
          jobType: "ml_stock_sync",
          eventId: `${orderId}_ml_sync_${item.variant_id}`,
          payload: { variant_id: item.variant_id },
          executor: async () => {
            await enqueueMlSyncEvent(supabaseClient, item.variant_id);
          },
        });
      }
    }
  }

  // 2. Enqueue Commissions Calculation Job
  await recordAndExecuteJob(supabaseClient, {
    orderId,
    jobType: "commissions_calc",
    eventId: `${orderId}_commissions`,
    payload: { order_id: orderId },
    executor: async () => {
      const res = await fetch(`${supabaseUrl}/functions/v1/calculate-commissions`, {
        method: "POST",
        headers: functionHeaders,
        body: JSON.stringify({ order_id: orderId }),
      });
      if (!res.ok) throw new Error(`Commissions HTTP ${res.status}: ${await res.text()}`);
    },
  });

  // 3. Post-payment shipment automation per suborder
  try {
    const { data: fullOrder } = await supabaseClient
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (!fullOrder) throw new Error("Parent order not found");

    const { data: suborders } = await supabaseClient
      .from('order_suborders')
      .select('*')
      .eq('parent_order_id', orderId);

    // Fetch dynamic active shipping providers
    const { data: activeProviders } = await supabaseClient
      .from('shipping_providers')
      .select('code, is_active, status')
      .eq('is_active', true)
      .eq('status', 'active');

    const activeCodes = (activeProviders || []).map((p: any) => p.code);

    if (suborders) {
      for (const sub of suborders) {
        const method = (sub.shipping_method || "").toLowerCase();
        const provider = (sub.shipping_provider || "").toLowerCase();
        
        let resolvedCode = "";
        if (provider.includes("dac") || method.includes("dac")) resolvedCode = "dac";
        else if (provider.includes("soydelivery") || method.includes("soydelivery")) resolvedCode = "soydelivery";
        else if (provider.includes("ues") || method.includes("ues")) resolvedCode = "ues";
        else if (provider.includes("distrilogic") || method.includes("distrilogic")) resolvedCode = "distrilogic";
        
        if (resolvedCode && activeCodes.includes(resolvedCode)) {
          await recordAndExecuteJob(supabaseClient, {
            orderId,
            suborderId: sub.id,
            jobType: "shipping_creation",
            eventId: `${orderId}_shipping_${sub.id}_${resolvedCode}`,
            payload: { suborder_id: sub.id, provider: resolvedCode },
            executor: async () => {
              console.log(`[Post-Payment] Enqueueing shipment for suborder ${sub.suborder_number} (${sub.id}) using ${resolvedCode}`);

              const addr = fullOrder.shipping_address || {};
              const customerName = `${addr.first_name || ''} ${addr.last_name || ''}`.trim() || 'Cliente';
              const customerPhone = fullOrder.customer_phone || addr.phone || '';
              const customerAddress = addr.street || '';
              const customerCity = addr.city || '';
              const customerDepartment = addr.department || '';
              
              let labelType = 'courier';
              if (resolvedCode === 'soydelivery') {
                labelType = 'flex';
              }

              // Check if shipment already created for this suborder
              const { data: existingShip } = await supabaseClient
                .from('shipments')
                .select('id')
                .eq('suborder_id', sub.id)
                .maybeSingle();

              let shipmentId = existingShip?.id;
              if (!shipmentId) {
                const { data: createdShip, error: createErr } = await supabaseClient
                  .from('shipments')
                  .insert({
                    order_id: orderId,
                    suborder_id: sub.id,
                    provider_key: resolvedCode,
                    tracking_code: null,
                    internal_reference: `COL-${sub.suborder_number}`,
                    shipping_status: 'queued',
                    customer_name: customerName,
                    customer_phone: customerPhone,
                    customer_address: customerAddress,
                    customer_city: customerCity,
                    customer_department: customerDepartment,
                    barcode_value: `COL-${sub.suborder_number}`,
                    qr_value: `COL-${sub.suborder_number}`,
                    label_type: labelType,
                    label_version: 1,
                    label_generated_at: new Date().toISOString()
                  })
                  .select()
                  .single();

                if (createErr || !createdShip) {
                  throw new Error(`Failed to create shipment row: ${createErr?.message}`);
                }
                shipmentId = createdShip.id;

                await supabaseClient.from('shipment_events').insert({
                  shipment_id: shipmentId,
                  event_type: 'queued',
                  description: `Envío encolado para registro automático en ${resolvedCode.toUpperCase()}`,
                  provider_status: 'queued'
                });
              }

              // Insert into shipping_queue if not exists
              const { data: existingQueue } = await supabaseClient
                .from('shipping_queue')
                .select('id')
                .eq('shipment_id', shipmentId)
                .maybeSingle();

              if (!existingQueue) {
                const { error: queueErr } = await supabaseClient
                  .from('shipping_queue')
                  .insert({
                    shipment_id: shipmentId,
                    provider_code: resolvedCode,
                    action: 'create_shipment',
                    priority: 0,
                    attempts: 0,
                    status: 'queued',
                    next_attempt_at: new Date().toISOString()
                  });

                if (queueErr) {
                  throw new Error(`Failed to insert queue item: ${queueErr.message}`);
                }
              }
            },
          });
        }
      }
    }
  } catch (err: any) {
    console.error("[Post-Payment] Suborder shipment triggers failed:", err);
  }

  // 4. Enqueue Transactional Confirmation Email
  await recordAndExecuteJob(supabaseClient, {
    orderId,
    jobType: "email_notification",
    eventId: `${orderId}_email_confirmed`,
    payload: { order_id: orderId },
    executor: async () => {
      const { data: fullOrder } = await supabaseClient
        .from("orders")
        .select("*")
        .eq("id", orderId)
        .single();

      if (fullOrder) {
        const res = await fetch(`${supabaseUrl}/functions/v1/transactional-emails`, {
          method: "POST",
          headers: functionHeaders,
          body: JSON.stringify({
            type: "UPDATE",
            table: "orders",
            record: fullOrder,
            old_record: { ...fullOrder, status: "pending" },
          }),
        });
        if (!res.ok) throw new Error(`Email HTTP ${res.status}: ${await res.text()}`);
      }
    },
  });

  // 5. Trigger Zinc verification and automatic purchase for international items
  await recordAndExecuteJob(supabaseClient, {
    orderId,
    jobType: "zinc_fulfillment",
    eventId: `${orderId}_zinc_verify`,
    payload: { order_id: orderId },
    executor: async () => {
      await triggerZincVerificationIfNeeded(supabaseClient, supabaseUrl, supabaseServiceRoleKey, orderId);
    },
  });
}

export async function finalizeOrderIfNeeded(
  supabaseClient: any,
  supabaseUrl: string,
  supabaseServiceRoleKey: string,
  orderId: string,
  paymentId?: string,
) {
  const { data: currentOrder, error } = await supabaseClient
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .single();

  if (error || !currentOrder) {
    throw new Error("No se encontro la orden a confirmar.");
  }

  if (currentOrder.payment_processed_at) {
    return currentOrder;
  }

  // Retrieve payment details to extract fee if available
  let totalPaymentFee = 0;
  try {
    const { data: payRecord } = await supabaseClient
      .from('payments')
      .select('*')
      .eq('order_id', orderId)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (payRecord) {
      const rawResponse = payRecord.raw_response || {};
      totalPaymentFee = rawResponse.fee_amount || rawResponse.fee || rawResponse.charge_fee || 0;
      if (totalPaymentFee === 0 && rawResponse.net_received_amount) {
        totalPaymentFee = Number(payRecord.amount) - Number(rawResponse.net_received_amount);
      }
      if (totalPaymentFee === 0 && rawResponse.fee_details) {
        totalPaymentFee = rawResponse.fee_details.reduce((sum: number, fee: any) => sum + fee.amount, 0);
      }
    }
  } catch (e) {
    console.warn("Could not retrieve payment record for fee share calculation:", e);
  }

  const { error: confirmError } = await supabaseClient.rpc("confirm_payment_atomic", {
    p_order_id: orderId,
    p_payment_provider: currentOrder.payment_method,
    p_payment_ref: paymentId || currentOrder.payment_id || "UNKNOWN",
  });

  if (confirmError) {
    console.error("confirm_payment_atomic failed:", confirmError);
    throw new Error(confirmError.message || "No se pudo confirmar el pago de la orden.");
  }

  // Update total_payment_fee on orders
  const { data: updatedOrder, error: updateError } = await supabaseClient
    .from("orders")
    .update({
      total_payment_fee: totalPaymentFee,
    })
    .eq("id", orderId)
    .select("*")
    .single();

  if (updateError || !updatedOrder) {
    throw new Error(updateError?.message || "No se pudo recuperar la orden actualizada.");
  }

  // Update order suborders
  const { data: suborders } = await supabaseClient
    .from('order_suborders')
    .select('*')
    .eq('parent_order_id', orderId);

  const orderTotal = Number(updatedOrder.total_amount);

  if (suborders) {
    for (const sub of suborders) {
      const suborderTotal = Number(sub.product_subtotal) + Number(sub.shipping_cost) - Number(sub.discount_total);
      const feeShare = orderTotal > 0 ? (totalPaymentFee * suborderTotal / orderTotal) : 0;
      const vendorNetAmount = Number(sub.product_subtotal) + Number(sub.shipping_cost) - Number(sub.marketplace_fee) - feeShare;

      await supabaseClient
        .from('order_suborders')
        .update({
          status: 'confirmed',
          payment_fee_share: feeShare,
          vendor_net_amount: vendorNetAmount,
          updated_at: new Date().toISOString()
        })
        .eq('id', sub.id);
    }
  }

  await triggerPostPaymentActions(supabaseClient, supabaseUrl, supabaseServiceRoleKey, orderId);
  return updatedOrder;
}

export async function triggerZincVerificationIfNeeded(
  supabaseClient: any,
  supabaseUrl: string,
  serviceRoleKey: string,
  orderId: string
) {
  try {
    // 1. Check if the order has international items
    const { data: orderItems, error: itemsErr } = await supabaseClient
      .from("order_items")
      .select("id, product_id")
      .eq("order_id", orderId);

    if (itemsErr || !orderItems || orderItems.length === 0) return;

    const itemIds = orderItems.map((i: any) => i.id);
    const productIds = orderItems.map((i: any) => i.product_id).filter(Boolean);

    let hasIntlItems = false;
    if (productIds.length > 0) {
      const { data: intlProducts } = await supabaseClient
        .from("international_products")
        .select("id")
        .in("id", productIds);
      if (intlProducts && intlProducts.length > 0) {
        hasIntlItems = true;
      }
    }

    if (!hasIntlItems && itemIds.length > 0) {
      const { data: intlOrderItems } = await supabaseClient
        .from("international_order_items")
        .select("id")
        .in("order_item_id", itemIds);
      if (intlOrderItems && intlOrderItems.length > 0) {
        hasIntlItems = true;
      }
    }

    if (!hasIntlItems) {
      console.log(`[Zinc Trigger] Order ${orderId} does not contain international products. Skipping.`);
      return;
    }

    console.log(`[Zinc Trigger] Order ${orderId} has international products. Committing capacity and invoking verification...`);

    // Commit reserved capacity for this order
    try {
      await supabaseClient.rpc('commit_international_capacity', { p_order_id: orderId });
    } catch (commitCapErr) {
      console.warn(`[Zinc Trigger] Error committing international capacity for order ${orderId}:`, commitCapErr);
    }

    const functionHeaders = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${serviceRoleKey}`,
    };

    const url = `${supabaseUrl}/functions/v1/zinc-verify-after-payment`;
    const res = await fetch(url, {
      method: "POST",
      headers: functionHeaders,
      body: JSON.stringify({ order_id: orderId, is_auto: true }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[Zinc Trigger] failed for order ${orderId}:`, errText);
      throw new Error(`Zinc HTTP ${res.status}: ${errText}`);
    } else {
      console.log(`[Zinc Trigger] successfully invoked for order ${orderId}`);
    }
  } catch (err: any) {
    console.error(`[Zinc Trigger] error:`, err);
    throw err;
  }
}
