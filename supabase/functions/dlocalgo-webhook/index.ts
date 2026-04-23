import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  try {
    // TODO: Validate webhook signature from dLocal Go when they provide it.
    // For now, we rely on idempotency to prevent replay attacks.
    const dlocalData = await req.json();
    console.log("📥 dLocal Go Webhook:", dlocalData);
    
    const { order_id, status, id: paymentId } = dlocalData;
    if (!order_id) throw new Error('Missing order_id');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    let dbStatus = 'pending';
    if (status === 'PAID' || status === 'APPROVED') dbStatus = 'paid';
    if (status === 'REJECTED' || status === 'CANCELLED') dbStatus = 'cancelled';
    if (status === 'PENDING') dbStatus = 'pending';

    // IDEMPOTENCY CHECK: Prevent double-processing of the same webhook
    const { data: existingOrder } = await supabase
      .from('orders')
      .select('status, payment_processed_at')
      .eq('id', order_id)
      .single();

    if (existingOrder?.payment_processed_at && dbStatus === 'paid') {
      console.log(`⚠️ Order ${order_id} already processed. Skipping.`);
      return new Response(JSON.stringify({ received: true, skipped: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update order status
    const updateData: Record<string, any> = { 
      status: dbStatus, 
      payment_id: paymentId?.toString() || null,
      updated_at: new Date().toISOString()
    };
    if (dbStatus === 'paid') {
      updateData.payment_processed_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', order_id);

    if (error) throw error;

    // Post-payment actions (only when PAID)
    if (dbStatus === 'paid') {
      // 1. Decrement inventory
      const { data: orderItems } = await supabase
        .from('order_items')
        .select('*')
        .eq('order_id', order_id);

      if (orderItems) {
        for (const item of orderItems) {
          if (item.variant_id) {
            await supabase.rpc('decrement_inventory', {
              p_variant_id: item.variant_id,
              p_quantity: item.quantity
            });
          }
        }
      }

      // 2. Trigger commission calculation
      const fnUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/calculate-commissions`;
      await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
        },
        body: JSON.stringify({ order_id })
      }).catch(err => console.error('Error triggering commissions:', err));

      // 3. Trigger transactional email
      const { data: order } = await supabase
        .from('orders')
        .select('*')
        .eq('id', order_id)
        .single();

      if (order) {
        const emailUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/transactional-emails`;
        await fetch(emailUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
          },
          body: JSON.stringify({
            type: 'UPDATE',
            table: 'orders',
            record: order,
            old_record: { ...order, status: 'pending' }
          })
        }).catch(err => console.error('Error triggering email:', err));
        
        // 4. Trigger SoyDelivery Sync
        const sdUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/soydelivery-sync`;
        await fetch(sdUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
          },
          body: JSON.stringify({ order_id })
        }).catch(err => console.error('Error triggering SoyDelivery:', err));
      }
    }

    return new Response(JSON.stringify({ received: true, mappedStatus: dbStatus }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (err: any) {
    console.error("dLocal Webhook Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
