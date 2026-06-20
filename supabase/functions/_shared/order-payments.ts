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

  // Trigger post-payment shipment automation per suborder (DAC, SoyDelivery, UES)
  try {
    const { data: suborders } = await supabaseClient
      .from('order_suborders')
      .select('*')
      .eq('parent_order_id', orderId);

    if (suborders) {
      for (const sub of suborders) {
        const method = (sub.shipping_method || "").toLowerCase();
        const provider = (sub.shipping_provider || "").toLowerCase();
        
        if (method.includes("dac") || provider.includes("dac")) {
          console.log(`[Post-Payment] Triggering DAC shipment creation for suborder ${sub.suborder_number} (${sub.id})`);
          await fetch(`${supabaseUrl}/functions/v1/dac-create-shipment`, {
            method: "POST",
            headers: functionHeaders,
            body: JSON.stringify({ order_id: sub.id }),
          }).then(async res => {
            if (!res.ok) console.error(`[Post-Payment] DAC failed for suborder ${sub.suborder_number}:`, await res.text());
          }).catch(err => console.error(`[Post-Payment] DAC trigger failed:`, err));
        } 
        
        else if (method.includes("soydelivery") || provider.includes("soydelivery")) {
          console.log(`[Post-Payment] Triggering SoyDelivery shipment creation for suborder ${sub.suborder_number} (${sub.id})`);
          await fetch(`${supabaseUrl}/functions/v1/soydelivery-sync`, {
            method: "POST",
            headers: functionHeaders,
            body: JSON.stringify({ order_id: sub.id }),
          }).then(async res => {
            if (!res.ok) console.error(`[Post-Payment] SoyDelivery failed for suborder ${sub.suborder_number}:`, await res.text());
          }).catch(err => console.error(`[Post-Payment] SoyDelivery trigger failed:`, err));
        }
        
        else if (method.includes("ues") || provider.includes("ues")) {
          console.log(`[Post-Payment] Triggering UES shipment creation for suborder ${sub.suborder_number} (${sub.id})`);
          await fetch(`${supabaseUrl}/functions/v1/ues-create-shipment`, {
            method: "POST",
            headers: functionHeaders,
            body: JSON.stringify({ order_id: sub.id }),
          }).then(async res => {
            if (!res.ok) console.error(`[Post-Payment] UES failed for suborder ${sub.suborder_number}:`, await res.text());
          }).catch(err => console.error(`[Post-Payment] UES trigger failed:`, err));
        }
      }
    }
  } catch (err: any) {
    console.error("[Post-Payment] Suborder shipment triggers failed:", err);
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

  // Trigger Zinc verification and automatic purchase for international items
  await triggerZincVerificationIfNeeded(supabaseClient, supabaseUrl, supabaseServiceRoleKey, orderId);
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

    console.log(`[Zinc Trigger] Order ${orderId} has international products. Invoking zinc-verify-after-payment...`);

    const functionHeaders = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${serviceRoleKey}`,
    };

    const url = `${supabaseUrl}/functions/v1/zinc-verify-after-payment`;
    await fetch(url, {
      method: "POST",
      headers: functionHeaders,
      body: JSON.stringify({ order_id: orderId, is_auto: true }),
    }).then(async (res) => {
      if (!res.ok) {
        console.error(`[Zinc Trigger] failed for order ${orderId}:`, await res.text());
      } else {
        console.log(`[Zinc Trigger] successfully invoked for order ${orderId}`);
      }
    }).catch((err) => {
      console.error(`[Zinc Trigger] connection error for order ${orderId}:`, err);
    });
  } catch (err: any) {
    console.error(`[Zinc Trigger] error:`, err);
  }
}
