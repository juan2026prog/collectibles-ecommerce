import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    const { order_id } = await req.json();
    if (!order_id) throw new Error("Falta el order_id");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Fetch the order with its affiliate reference
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('*, order_items(*, product_variants(*))')
      .eq('id', order_id)
      .single();

    if (orderErr || !order) throw new Error('Order not found: ' + order_id);
    if (order.status !== 'paid') {
      return new Response(JSON.stringify({ 
        success: false, 
        skipped: true, 
        reason: 'Order not in paid status' 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const results: any[] = [];

    // ─── AFFILIATE COMMISSIONS ───
    if (order.affiliate_id) {
      const { data: affiliate } = await supabase
        .from('affiliates')
        .select('base_commission_rate')
        .eq('id', order.affiliate_id)
        .single();

      if (affiliate) {
        const commissionRate = affiliate.base_commission_rate || 5;
        const commissionAmount = (order.total_amount * commissionRate) / 100;

        // Prevent duplicate commissions
        const { data: existing } = await supabase
          .from('affiliate_commissions')
          .select('id')
          .eq('order_id', order_id)
          .eq('affiliate_id', order.affiliate_id)
          .single();

        if (!existing) {
          const { error: insertErr } = await supabase
            .from('affiliate_commissions')
            .insert({
              affiliate_id: order.affiliate_id,
              order_id: order_id,
              amount: commissionAmount,
              status: 'pending'
            });

          if (!insertErr) {
            results.push({
              type: 'affiliate_commission',
              affiliate_id: order.affiliate_id,
              amount: commissionAmount,
              rate: commissionRate
            });
          }
        } else {
          results.push({ type: 'affiliate_commission', skipped: true, reason: 'already exists' });
        }
      }
    }

    // ─── VENDOR PAYOUTS ───
    // Group order items by vendor_id
    const vendorTotals: Record<string, number> = {};
    for (const item of (order.order_items || [])) {
      if (item.vendor_id) {
        vendorTotals[item.vendor_id] = (vendorTotals[item.vendor_id] || 0) 
          + (item.unit_price * item.quantity);
      }
    }

    for (const [vendorId, itemsTotal] of Object.entries(vendorTotals)) {
      const { data: vendor } = await supabase
        .from('vendors')
        .select('base_commission_rate')
        .eq('id', vendorId)
        .single();

      const platformFeeRate = vendor?.base_commission_rate || 10;
      const platformFee = (itemsTotal * platformFeeRate) / 100;
      const vendorPayout = itemsTotal - platformFee;

      // Prevent duplicate payouts
      const { data: existingPayout } = await supabase
        .from('vendor_payouts')
        .select('id')
        .eq('vendor_id', vendorId)
        .maybeSingle();

      // We check if there's a payout for this specific period (simplified: one per order)
      const { error: payoutErr } = await supabase
        .from('vendor_payouts')
        .insert({
          vendor_id: vendorId,
          amount: vendorPayout,
          status: 'pending'
        });

      if (!payoutErr) {
        results.push({
          type: 'vendor_payout',
          vendor_id: vendorId,
          gross: itemsTotal,
          platform_fee: platformFee,
          net_payout: vendorPayout
        });
      }

      // Update order_items with frozen financial data
      for (const item of order.order_items.filter((i: any) => i.vendor_id === vendorId)) {
        await supabase.from('order_items').update({
          vendor_payout: (item.unit_price * item.quantity) * (1 - platformFeeRate / 100),
          platform_fee: (item.unit_price * item.quantity) * (platformFeeRate / 100)
        }).eq('id', item.id);
      }
    }

    // ─── LOYALTY POINTS ───
    // Award 1 point per $100 spent
    const loyaltyPoints = Math.floor(order.total_amount / 100);
    if (loyaltyPoints > 0 && order.customer_id) {
      await supabase.from('loyalty_points').insert({
        user_id: order.customer_id,
        points: loyaltyPoints,
        reason: `Compra orden #${order_id.slice(0, 8)}`,
        order_id: order_id
      });

      await supabase.rpc('increment_loyalty', {
        p_user_id: order.customer_id,
        p_points: loyaltyPoints
      }).catch(() => {
        // RPC might not exist yet; silently skip
        console.log('Loyalty RPC not found, skipping increment');
      });

      results.push({ type: 'loyalty_points', points: loyaltyPoints });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      order_id,
      calculations: results 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: any) {
    console.error("Commission calc error:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
