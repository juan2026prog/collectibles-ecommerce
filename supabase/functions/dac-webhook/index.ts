import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { getCorsHeaders, handleOptions } from "../_shared/cors.ts";
import { mapDacStatus, parseXmlTag } from "../_shared/dac-client.ts";

function formatDacDate(date: Date) {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

serve(async (req) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  const corsHeaders = getCorsHeaders(req);

  // Initialize service role Supabase Client
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(supabaseUrl, supabaseKey);

  let bodyData: Record<string, any> = {};
  let rawBody = "";

  try {
    const contentType = req.headers.get("content-type") || "";
    rawBody = await req.text();

    if (contentType.includes("application/json")) {
      bodyData = JSON.parse(rawBody);
    } else {
      // Fallback: try parsing JSON, if fails, extract tags from XML/Text
      try {
        bodyData = JSON.parse(rawBody);
      } catch {
        const kGuia = parseXmlTag(rawBody, 'K_Guia') || parseXmlTag(rawBody, 'k_guia') || parseXmlTag(rawBody, 'KGuia');
        const trackingCode = parseXmlTag(rawBody, 'Codigo_Rastreo') || parseXmlTag(rawBody, 'Cod_Rastreo') || parseXmlTag(rawBody, 'codigo_rastreo');
        const estado = parseXmlTag(rawBody, 'Estado') || parseXmlTag(rawBody, 'estado');
        const detalle = parseXmlTag(rawBody, 'Detalle') || parseXmlTag(rawBody, 'detalle') || parseXmlTag(rawBody, 'Observaciones');
        
        bodyData = {
          K_Guia: kGuia,
          Codigo_Rastreo: trackingCode,
          Estado: estado,
          Detalle: detalle,
          _rawXml: rawBody
        };
      }
    }
  } catch (e: any) {
    console.error("[DAC Webhook] Body parsing failed:", e.message);
  }

  // Extract keys
  const kGuia = bodyData.K_Guia || bodyData.k_guia || bodyData.kGuia || "";
  const trackingCode = bodyData.Codigo_Rastreo || bodyData.codigo_rastreo || bodyData.tracking_code || bodyData.trackingCode || "";
  const rawEstado = bodyData.Estado || bodyData.estado || bodyData.status || "";
  const rawDetalle = bodyData.Detalle || bodyData.detalle || bodyData.description || "";

  console.log(`[DAC Webhook] Received tracking update. Guide: ${kGuia}, Code: ${trackingCode}, State: ${rawEstado}`);

  try {
    if (kGuia || trackingCode) {
      // Find matching shipment record
      let query = supabase.from('shipments').select('*');
      if (trackingCode) {
        query = query.eq('tracking_code', trackingCode);
      } else {
        query = query.eq('external_guide', kGuia);
      }

      const { data: shipment } = await query.maybeSingle();

      if (shipment) {
        const internalStatus = mapDacStatus(rawEstado);
        const oldStatus = shipment.shipping_status;

        // 1. Update Shipment record
        await supabase
          .from('shipments')
          .update({
            shipping_status: internalStatus,
            webhook_payload: {
              raw_payload: bodyData,
              received_at: new Date().toISOString()
            },
            updated_at: new Date().toISOString()
          })
          .eq('id', shipment.id);

        // 2. Log update history if status has changed
        if (oldStatus !== internalStatus) {
          await supabase
            .from('order_tracking_updates')
            .insert({
              order_id: shipment.order_id,
              status_text: `DAC Webhook: ${rawEstado} - ${rawDetalle || 'Actualización de estado'}`,
              location: "DAC Network"
            });

          // 3. Sync order status
          let targetOrderStatus = "";
          if (internalStatus === "delivered") {
            targetOrderStatus = "entregado";
          } else if (internalStatus === "out_for_delivery") {
            targetOrderStatus = "en_transito";
          } else if (internalStatus === "in_transit") {
            targetOrderStatus = "en_transito";
          } else if (internalStatus === "rejected") {
            // Keep current status or map to failed if needed, let's keep order status as despachado or en_transito or alert
          }

          if (targetOrderStatus) {
            await supabase
              .from('orders')
              .update({ status: targetOrderStatus })
              .eq('id', shipment.order_id);
          }
        }
      } else {
        console.warn(`[DAC Webhook] No matching shipment found for Guide: ${kGuia}, Code: ${trackingCode}`);
      }
    }
  } catch (error: any) {
    console.error("[DAC Webhook Error handling shipment]:", error.message);
    // Even if database operation failed, we want to return a successful response to DAC so it doesn't loop
  }

  // Always return response in DAC's expected format: { "result": 0, "Fecha": "YYYY-MM-DD HH:mm:ss" }
  const responsePayload = {
    result: 0,
    Fecha: formatDacDate(new Date())
  };

  return new Response(JSON.stringify(responsePayload), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
});
