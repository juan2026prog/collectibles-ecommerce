import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Calculates the exact 22:00–22:00 America/Montevideo commercial window
 */
export function getMontevideoCutoffWindow(now: Date = new Date()) {
  // Format current date in America/Montevideo timezone
  const mvdOptions: Intl.DateTimeFormatOptions = { 
    timeZone: 'America/Montevideo', 
    year: 'numeric', 
    month: '2-digit', 
    day: '2-digit', 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit', 
    hour12: false 
  };
  const formatter = new Intl.DateTimeFormat('en-US', mvdOptions);
  const parts = formatter.formatToParts(now);
  
  const getPart = (type: string) => parts.find(p => p.type === type)?.value;
  const year = parseInt(getPart('year')!, 10);
  const month = parseInt(getPart('month')!, 10) - 1; // 0-indexed
  const day = parseInt(getPart('day')!, 10);
  const hour = parseInt(getPart('hour')!, 10);

  let cutoffEndYear = year;
  let cutoffEndMonth = month;
  let cutoffEndDay = day;

  // If running before 22:00 Montevideo time (e.g. manual trigger at 15:00), cutoff end is YESTERDAY's 22:00 Montevideo time
  if (hour < 22) {
    const tempDate = new Date(Date.UTC(year, month, day - 1));
    cutoffEndYear = tempDate.getUTCFullYear();
    cutoffEndMonth = tempDate.getUTCMonth();
    cutoffEndDay = tempDate.getUTCDate();
  }

  const monthPadded = String(cutoffEndMonth + 1).padStart(2, '0');
  const dayPadded = String(cutoffEndDay).padStart(2, '0');
  
  // Cutoff End: YYYY-MM-DD 22:00:00 -03:00 (America/Montevideo timezone)
  const cutoffEndISO = `${cutoffEndYear}-${monthPadded}-${dayPadded}T22:00:00-03:00`;
  
  // Cutoff Start: 24h prior (YYYY-MM-(DD-1) 22:00:00 -03:00)
  const prevDate = new Date(Date.UTC(cutoffEndYear, cutoffEndMonth, cutoffEndDay - 1));
  const prevYear = prevDate.getUTCFullYear();
  const prevMonth = String(prevDate.getUTCMonth() + 1).padStart(2, '0');
  const prevDay = String(prevDate.getUTCDate()).padStart(2, '0');
  const cutoffStartISO = `${prevYear}-${prevMonth}-${prevDay}T22:00:00-03:00`;

  return { cutoffStartISO, cutoffEndISO, dateFormatted: `${dayPadded}/${monthPadded}/${cutoffEndYear}` };
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (token !== supabaseServiceKey) {
      console.warn("[Admin Daily Summary Cron] Unauthorized call.");
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    // 1. Calculate Exact Commercial Window: 22:00 Montevideo -> 22:00 Montevideo
    const { cutoffStartISO, cutoffEndISO, dateFormatted } = getMontevideoCutoffWindow();

    console.log(`[Admin Daily Summary Cron] Commercial Window: ${cutoffStartISO} to ${cutoffEndISO} (America/Montevideo)`);

    // 2. Query Certified Suborders Paid within the Commercial Window
    // Condition: orders.payment_processed_at IS NOT NULL AND orders.payment_status IN ('approved', 'paid')
    const { data: suborders, error: subErr } = await supabaseAdmin
      .from('order_suborders')
      .select('id, parent_order_id, vendor_id, product_subtotal, shipping_cost, discount_total, marketplace_fee, status, created_at, updated_at, vendors(store_name, base_commission_rate), orders!inner(id, payment_status, status, payment_processed_at, created_at)')
      .gte('orders.payment_processed_at', cutoffStartISO)
      .lte('orders.payment_processed_at', cutoffEndISO)
      .not('orders.payment_processed_at', 'is', null)
      .in('orders.payment_status', ['approved', 'paid']);

    if (subErr) {
      console.error("[Admin Daily Summary Cron] Database query error:", subErr);
      throw new Error(`DB Error: ${subErr.message}`);
    }

    const validSuborders = (suborders || []).filter(s => s.vendor_id !== null);

    // 3. ZERO SALES GUARD (Requirement 13)
    if (validSuborders.length === 0) {
      console.log(`[Admin Daily Summary Cron] 0 vendor sales in commercial window ${cutoffStartISO} to ${cutoffEndISO}. Skipping notification dispatch.`);
      return new Response(JSON.stringify({
        success: true,
        skipped: true,
        reason: 'no_vendor_sales',
        window: { start: cutoffStartISO, end: cutoffEndISO }
      }), { headers: corsHeaders });
    }

    // 4. Group & Summarize Sales per Vendor
    const vendorMap: Record<string, { store_name: string; order_count: number; total_amount: number; commission: number }> = {};
    const orderSet = new Set<string>();

    let totalMarketplaceGmv = 0;
    let totalCommission = 0;

    for (const sub of validSuborders) {
      const vendorId = sub.vendor_id!;
      const storeName = sub.vendors?.store_name || 'Tienda';
      const subtotal = Number(sub.product_subtotal || 0);

      // Real commission calculation (Requirement 12)
      let commission = Number(sub.marketplace_fee || 0);
      if (commission === 0 && sub.vendors?.base_commission_rate) {
        commission = (subtotal * Number(sub.vendors.base_commission_rate)) / 100;
      }

      orderSet.add(sub.parent_order_id);

      if (!vendorMap[vendorId]) {
        vendorMap[vendorId] = {
          store_name: storeName,
          order_count: 0,
          total_amount: 0,
          commission: 0
        };
      }

      vendorMap[vendorId].order_count += 1;
      vendorMap[vendorId].total_amount += subtotal;
      vendorMap[vendorId].commission += commission;

      totalMarketplaceGmv += subtotal;
      totalCommission += commission;
    }

    const vendorRows = Object.values(vendorMap).map(v => ({
      store_name: v.store_name,
      order_count: v.order_count,
      total_amount: v.total_amount
    }));

    const vendorCount = vendorRows.length;
    const orderCount = orderSet.size;

    console.log(`[Admin Daily Summary Cron] Vendors with sales: ${vendorCount}, Orders: ${orderCount}, Total GMV: $${totalMarketplaceGmv}, Commission: $${totalCommission}`);

    // 5. Invoke notification-dispatcher with admin_vendor_daily_summary
    const dispatcherUrl = `${supabaseUrl}/functions/v1/notification-dispatcher`;
    const dispatchRes = await fetch(dispatcherUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`
      },
      body: JSON.stringify({
        event_type: 'admin_vendor_daily_summary',
        date_str: dateFormatted,
        vendor_rows: vendorRows,
        marketplace_total: totalMarketplaceGmv,
        order_count: orderCount,
        vendor_count: vendorCount,
        commission_total: totalCommission
      })
    });

    const dispatchData = await dispatchRes.json();
    console.log(`[Admin Daily Summary Cron] Dispatcher response:`, dispatchData);

    return new Response(JSON.stringify({
      success: true,
      window: { start: cutoffStartISO, end: cutoffEndISO },
      summary: {
        date_str: dateFormatted,
        vendor_count: vendorCount,
        order_count: orderCount,
        marketplace_total: totalMarketplaceGmv,
        commission_total: totalCommission
      },
      dispatcher_response: dispatchData
    }), { headers: corsHeaders });

  } catch (error: any) {
    console.error("[Admin Daily Summary Cron Error]:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
});
