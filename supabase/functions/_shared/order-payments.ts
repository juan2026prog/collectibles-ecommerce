import { enqueueMlSyncEvent } from "./mercadolibre.ts";

export function orderSummary(order: any) {
  if (!order) return null;
  return {
    id: order.id,
    status: order.status,
    payment_status: order.payment_status,
    total_amount: order.total_amount,
    currency: order.currency || "UYU",
    payment_method: order.payment_method,
    customer_email: order.customer_email,
    customer_phone: order.customer_phone,
    shipping_address: order.shipping_address,
    payment_id: order.payment_id,
  };
}

export async function triggerPostPaymentActions(
  supabaseClient: any,
  supabaseUrl: string,
  supabaseServiceRoleKey: string,
  orderId: string,
) {
  const { data: orderItems } = await supabaseClient
    .from("order_items")
    .select("*")
    .eq("order_id", orderId);

  if (orderItems) {
    for (const item of orderItems) {
      if (item.variant_id) {
        const { error: invError } = await supabaseClient.rpc("decrement_inventory", {
          p_variant_id: item.variant_id,
          p_quantity: item.quantity,
        });
        if (invError) {
          console.error("Inventory error:", invError);
        } else {
          // Enqueue ML stock sync event without blocking
          await enqueueMlSyncEvent(supabaseClient, item.variant_id);
        }
      }
    }
  }

  const functionHeaders = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${supabaseServiceRoleKey}`,
  };

  await fetch(`${supabaseUrl}/functions/v1/calculate-commissions`, {
    method: "POST",
    headers: functionHeaders,
    body: JSON.stringify({ order_id: orderId }),
  }).catch((err: any) => console.error("Commissions error:", err));

  try {
    const soyResponse = await fetch(`${supabaseUrl}/functions/v1/soydelivery-sync`, {
      method: "POST",
      headers: functionHeaders,
      body: JSON.stringify({ order_id: orderId }),
    });

    if (!soyResponse.ok) {
      const errorText = await soyResponse.text();
      console.error(`Soy Delivery provider validation error (Status: ${soyResponse.status}):`, errorText);
    }
  } catch (err: any) {
    console.error("Soy Delivery provider validation error:", err);
  }

  // Trigger DAC post-payment shipment automation per suborder
  try {
    const { data: suborders } = await supabaseClient
      .from('order_suborders')
      .select('*')
      .eq('parent_order_id', orderId);

    if (suborders) {
      for (const sub of suborders) {
        if (sub.shipping_method === "dac_home" || sub.shipping_method === "dac_agency" || sub.shipping_method === "dac") {
          console.log(`[Post-Payment] Triggering DAC shipment creation for suborder ${sub.suborder_number} (${sub.id})`);
          const dacResponse = await fetch(`${supabaseUrl}/functions/v1/dac-create-shipment`, {
            method: "POST",
            headers: functionHeaders,
            body: JSON.stringify({ order_id: sub.id }), // Polymorphic: passes suborder ID
          });

          if (!dacResponse.ok) {
            const errorText = await dacResponse.text();
            console.error(`[Post-Payment] DAC shipment creation failed for suborder ${sub.suborder_number} (Status: ${dacResponse.status}):`, errorText);
          } else {
            const resJson = await dacResponse.json();
            console.log(`[Post-Payment] DAC shipment creation result for suborder ${sub.suborder_number}:`, resJson);
          }
        }
      }
    }
  } catch (err: any) {
    console.error("[Post-Payment] DAC post-payment trigger failed:", err);
  }

  const { data: fullOrder } = await supabaseClient
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .single();

  if (fullOrder) {
    await fetch(`${supabaseUrl}/functions/v1/transactional-emails`, {
      method: "POST",
      headers: functionHeaders,
      body: JSON.stringify({
        type: "UPDATE",
        table: "orders",
        record: fullOrder,
        old_record: { ...fullOrder, status: "pending" },
      }),
    }).catch((err: any) => console.error("Email error:", err));
  }
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

  const { data: updatedOrder, error: updateError } = await supabaseClient
    .from("orders")
    .update({
      status: "paid",
      payment_status: "approved",
      payment_id: paymentId || currentOrder.payment_id,
      payment_provider: currentOrder.payment_method,
      payment_provider_reference: paymentId || currentOrder.payment_id,
      total_payment_fee: totalPaymentFee,
      payment_processed_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .select("*")
    .single();

  if (updateError || !updatedOrder) {
    throw new Error(updateError?.message || "No se pudo marcar la orden como pagada.");
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
