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
        await supabaseClient.rpc("decrement_inventory", {
          p_variant_id: item.variant_id,
          p_quantity: item.quantity,
        }).catch((err: any) => console.error("Inventory error:", err));
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

  await fetch(`${supabaseUrl}/functions/v1/soydelivery-sync`, {
    method: "POST",
    headers: functionHeaders,
    body: JSON.stringify({ order_id: orderId }),
  }).catch((err: any) => console.error("SoyDelivery error:", err));

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

  const { data: updatedOrder, error: updateError } = await supabaseClient
    .from("orders")
    .update({
      status: "paid",
      payment_status: "approved",
      payment_id: paymentId || currentOrder.payment_id,
      payment_processed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .select("*")
    .single();

  if (updateError || !updatedOrder) {
    throw new Error(updateError?.message || "No se pudo marcar la orden como pagada.");
  }

  await triggerPostPaymentActions(supabaseClient, supabaseUrl, supabaseServiceRoleKey, orderId);
  return updatedOrder;
}
