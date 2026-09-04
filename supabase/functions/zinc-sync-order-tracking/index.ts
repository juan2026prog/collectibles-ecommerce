import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders, handleOptions } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

serve(async (req) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  try {
    // Check bypass or authorization
    const bypassHeader = req.headers.get("x-zinc-sync-bypass");
    const authHeader = req.headers.get("Authorization") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    
    const isBypass = bypassHeader === "collectibles-zinc-sync-secret";
    const isServiceCall = authHeader.includes(serviceRoleKey);

    if (!isBypass && !isServiceCall) {
      // If called manually by an admin, verify they are admin
      const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
      const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
      const supabase = createClient(supabaseUrl, supabaseKey, { global: { headers: { Authorization: authHeader } } });
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("Unauthorized");

      // Verify admin status
      const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
      if (!profile || !profile.is_admin) throw new Error("Forbidden: Admin access required");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    const { resolveZincApiKey } = await import("../_shared/zinc/index.ts");
    let ZINC_API_KEY = "";
    try {
      ZINC_API_KEY = await resolveZincApiKey(serviceClient, "production");
    } catch {
      ZINC_API_KEY = await resolveZincApiKey(serviceClient, "sandbox");
    }

    // Fetch active international order items
    const activeStatuses = ['zinc_order_created', 'zinc_processing', 'purchased', 'shipped_to_courier'];
    const { data: activeItems, error: activeItemsErr } = await serviceClient
      .from('international_order_items')
      .select('*, order_item:order_items(id, order_id)')
      .in('purchase_status', activeStatuses);

    if (activeItemsErr) throw activeItemsErr;
    if (!activeItems || activeItems.length === 0) {
      return new Response(JSON.stringify({ success: true, processed: 0, message: "No active international items to track" }), {
        headers: getCorsHeaders(),
        status: 200
      });
    }

    let updatedCount = 0;

    for (const item of activeItems) {
      if (!item.zinc_order_id) continue;

      try {
        const url = `https://api.zinc.com/orders/${item.zinc_order_id}`;
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${ZINC_API_KEY}` } });
        
        if (!res.ok) {
          console.error(`Error querying Zinc order status for ${item.zinc_order_id}: ${res.status}`);
          continue;
        }

        const zincData = await res.json();
        const updates: any = {
          zinc_response_payload: zincData,
          last_zinc_status_check_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        const zincStatus = (zincData.status || '').toLowerCase();

        if (zincStatus === 'failed') {
          updates.purchase_status = 'zinc_failed';
          updates.review_reason_code = 'ZINC_REJECTED';
          updates.zinc_error_message = zincData.failure_reason || (zincData.error && zincData.error.message) || "Zinc order placement failed";
          
          // Mark parent order as manual review
          if (item.order_item?.order_id) {
            await serviceClient.from('orders').update({ status: 'manual_review' }).eq('id', item.order_item.order_id);
          }
        } else if (zincStatus === 'processing') {
          updates.purchase_status = 'zinc_processing';
        } else if (zincStatus === 'completed' || zincStatus === 'shipped' || zincStatus === 'delivered' || zincStatus === 'order_placed') {
          updates.purchase_status = zincStatus === 'order_placed' ? 'purchased' : (zincStatus === 'delivered' ? 'delivered_to_courier' : 'shipped_to_courier');

          // Extract V2 tracking numbers
          const trackingNumbers = Array.isArray(zincData.tracking_numbers) ? zincData.tracking_numbers : [];
          if (trackingNumbers.length > 0) {
            const track = trackingNumbers[0];
            updates.purchase_status = 'shipped_to_courier';
            updates.tracking_number = track.tracking_number || item.tracking_number;
            updates.carrier = track.carrier || item.carrier;
            updates.tracking_url = track.url || item.tracking_url;

            if (track.delivered_at || zincStatus === 'delivered') {
              updates.purchase_status = 'delivered_to_courier';
              updates.delivered_to_courier_at = track.delivered_at || new Date().toISOString();
            }
          } else if (zincData.tracking_number) {
            updates.purchase_status = 'shipped_to_courier';
            updates.tracking_number = zincData.tracking_number;
            updates.carrier = zincData.carrier;
            updates.tracking_url = zincData.tracking_url;
          }

          if (zincStatus === 'delivered' && updates.purchase_status !== 'delivered_to_courier') {
            updates.purchase_status = 'delivered_to_courier';
            updates.delivered_to_courier_at = new Date().toISOString();
          }
        }

        await serviceClient.from('international_order_items').update(updates).eq('id', item.id);
        updatedCount++;
      } catch (err) {
        console.error(`Failed to sync tracking for item ${item.id} with zinc_order_id ${item.zinc_order_id}:`, err);
      }
    }

    return new Response(JSON.stringify({ success: true, processed: activeItems.length, updated: updatedCount }), {
      headers: getCorsHeaders(),
      status: 200
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { headers: getCorsHeaders(), status: 500 });
  }
});
