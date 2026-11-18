import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";

declare const Deno: any;

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    const { order_id } = await req.json();
    if (!order_id) throw new Error("Falta el order_id");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Fetch the order with its affiliate and coupon reference
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('*, order_items(*, product_variants(*))')
      .eq('id', order_id)
      .single();

    if (orderErr || !order) throw new Error('Order not found: ' + order_id);

    // STRICT PAYMENT CONFIRMATION CHECK:
    // Commissions are ONLY generated after a payment is effectively confirmed!
    const isPaymentConfirmed =
      order.status === 'paid' ||
      order.status === 'confirmed' ||
      order.payment_status === 'approved' ||
      order.payment_status === 'paid' ||
      order.payment_status === 'accredited';

    if (!isPaymentConfirmed) {
      return new Response(JSON.stringify({ 
        success: false, 
        skipped: true, 
        reason: 'Order payment is not confirmed' 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const results: any[] = [];

    // ─── AFFILIATE COMMISSIONS (Link attribution OR Coupon attribution, never double) ───
    let resolvedAffiliateId: string | null = order.affiliate_id || null;
    let attributionType: 'link' | 'coupon' = 'link';
    let usedCouponCode: string | null = null;

    if (order.coupon_id) {
      const { data: couponRow } = await supabase
        .from('coupons')
        .select('code, affiliate_id')
        .eq('id', order.coupon_id)
        .maybeSingle();

      if (couponRow) {
        usedCouponCode = couponRow.code;
        if (!resolvedAffiliateId && couponRow.affiliate_id) {
          resolvedAffiliateId = couponRow.affiliate_id;
          attributionType = 'coupon';
        }
      }
    }

    if (resolvedAffiliateId) {
      const { data: affiliate } = await supabase
        .from('affiliates')
        .select('id, code, base_commission_rate, status')
        .eq('id', resolvedAffiliateId)
        .maybeSingle();

      if (affiliate && affiliate.status === 'active') {
        const commissionRate = Number(affiliate.base_commission_rate ?? 5);
        // Commissionable base: subtotal of products minus discounts (or order.total_amount - shipping if subtotal_products not set)
        const baseAmount = Math.max(
          0,
          Number(order.subtotal_products || (Number(order.total_amount || 0) - Number(order.total_shipping || 0))) - Number(order.total_discounts || 0)
        ) || Number(order.total_amount || 0);

        const commissionAmount = Number(((baseAmount * commissionRate) / 100).toFixed(2));
        const orderRef = order.order_number ? `#${order.order_number.replace(/^#/, '')}` : `#COL-${order.id.slice(0, 8).toUpperCase()}`;

        // Prevent duplicate commissions for the same order & affiliate
        const { data: existing } = await supabase
          .from('affiliate_commissions')
          .select('id, amount, status')
          .eq('order_id', order_id)
          .eq('affiliate_id', resolvedAffiliateId)
          .maybeSingle();

        if (!existing) {
          const { data: insertedComm, error: insertErr } = await supabase
            .from('affiliate_commissions')
            .insert({
              affiliate_id: resolvedAffiliateId,
              order_id: order_id,
              amount: commissionAmount,
              base_amount: baseAmount,
              commission_rate: commissionRate,
              refunded_amount: 0,
              adjustment_amount: 0,
              coupon_code: usedCouponCode || affiliate.code,
              attribution_type: attributionType,
              order_reference: orderRef,
              status: 'pending'
            })
            .select('id')
            .single();

          if (!insertErr && insertedComm) {
            // Audit trail in commission_activity_log
            await supabase.from('commission_activity_log').insert({
              commission_id: insertedComm.id,
              event_type: 'commission_created',
              event_label: `Comisión generada (${commissionRate}%) sobre base $${baseAmount}`,
              metadata: {
                order_id,
                order_reference: orderRef,
                affiliate_id: resolvedAffiliateId,
                base_amount: baseAmount,
                commission_rate: commissionRate,
                commission_amount: commissionAmount,
                attribution_type: attributionType,
                code: usedCouponCode || affiliate.code
              }
            });

            results.push({
              type: 'affiliate_commission',
              commission_id: insertedComm.id,
              affiliate_id: resolvedAffiliateId,
              amount: commissionAmount,
              base_amount: baseAmount,
              rate: commissionRate
            });
          }
        } else {
          results.push({ type: 'affiliate_commission', skipped: true, reason: 'already exists' });
        }
      }
    }

    // ─── VENDOR PAYOUTS ───
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
        .eq('order_id', order_id)
        .maybeSingle();

      if (existingPayout) {
        results.push({ type: 'vendor_payout', skipped: true, reason: 'already exists' });
        continue;
      }

      const { error: payoutErr } = await supabase
        .from('vendor_payouts')
        .insert({
          vendor_id: vendorId,
          order_id: order_id,
          amount: vendorPayout,
          fee_percentage: platformFeeRate,
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
    const loyaltyPoints = Math.floor(order.total_amount / 100);
    if (loyaltyPoints > 0 && order.customer_id) {
      await supabase.from('loyalty_points').insert({
        user_id: order.customer_id,
        points: loyaltyPoints,
        reason: `Compra orden #${order_id.slice(0, 8)}`,
        order_id: order_id
      });

      const { error: loyaltyError } = await supabase.rpc('increment_loyalty', {
        p_user_id: order.customer_id,
        p_points: loyaltyPoints
      });
      
      if (loyaltyError) {
        console.log('Loyalty RPC not found or failed, skipping increment:', loyaltyError);
      }

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
