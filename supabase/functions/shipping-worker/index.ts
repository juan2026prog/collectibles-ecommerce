// supabase/functions/shipping-worker/index.ts

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { getCorsHeaders, handleOptions } from "../_shared/cors.ts";
import { DACAdapter, SoyDeliveryAdapter } from "../_shared/adapters/shipping-adapter.ts";
import { validateShipmentBeforeDispatch } from "../_shared/logistics-rules.ts";

serve(async (req) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  const corsHeaders = getCorsHeaders(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("[Shipping Worker] Starting queue polling...");

    // Lock and retrieve up to 10 queued/retrying items ready for processing
    const { data: queueItems, error: lockErr } = await supabase.rpc(
      "lock_shipping_queue_items",
      { limit_count: 10 }
    );

    if (lockErr) throw new Error(`Lock queue RPC error: ${lockErr.message}`);
    if (!queueItems || queueItems.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No shipments in queue" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    console.log(`[Shipping Worker] Locked ${queueItems.length} items to process.`);

    for (const item of queueItems) {
      console.log(`[Shipping Worker] Processing queue item ${item.id} (Shipment: ${item.shipment_id})`);
      
      let latencyStart = Date.now();
      let hasError = false;
      let errorMessage = "";

      try {
        // Fetch shipment and suborder details
        const { data: shipment, error: shipErr } = await supabase
          .from("shipments")
          .select("*")
          .eq("id", item.shipment_id)
          .single();

        if (shipErr || !shipment) throw new Error(`Shipment not found: ${shipErr?.message}`);

        const { data: suborder, error: subErr } = await supabase
          .from("order_suborders")
          .select("*")
          .eq("id", shipment.suborder_id)
          .single();

        if (subErr || !suborder) throw new Error(`Suborder not found: ${subErr?.message}`);

        // Fetch parent order shipping address
        const { data: parentOrder, error: parentErr } = await supabase
          .from("orders")
          .select("shipping_address")
          .eq("id", suborder.parent_order_id)
          .single();

        if (parentErr || !parentOrder) throw new Error(`Parent order not found: ${parentErr?.message}`);

        const resolvedAddress = parentOrder.shipping_address || {};

        // Resolve credentials based on provider
        let creds: any = {};
        const providerCode = item.provider_code.toLowerCase();

        if (providerCode === "dac") {
          let hasOwnAccount = false;
          // Check if vendor has their own advanced DAC connection
          if (suborder.vendor_id) {
            const { data: vendor } = await supabase
              .from("vendors")
              .select("shipping_settings")
              .eq("id", suborder.vendor_id)
              .single();
            const s = vendor?.shipping_settings || {};
            if (s.dac?.active && s.dac?.username && s.dac?.password) {
              creds = {
                username: s.dac.username,
                password: s.dac.password,
                apiUrl: s.dac.api_url || "",
                kOficinaOrigen: s.dac.k_oficina_origen || s.dac.preferred_agency || "800",
                settings: s.dac.settings || {}
              };
              hasOwnAccount = true;
            }
          }
          
          // Fallback to global Collectibles credentials
          if (!hasOwnAccount) {
            const { data: globalProv } = await supabase
              .from("shipping_providers")
              .select("*")
              .eq("code", "dac")
              .single();
            if (globalProv) {
              creds = {
                username: globalProv.username,
                password: globalProv.password_encrypted,
                apiUrl: globalProv.api_url || "",
                kOficinaOrigen: "800", // Default office
                settings: globalProv.settings || {}
              };
              
              // Override office of origin with preferred agency of vendor if present
              if (suborder.vendor_id) {
                const { data: vendor } = await supabase
                  .from("vendors")
                  .select("shipping_settings")
                  .eq("id", suborder.vendor_id)
                  .single();
                const s = vendor?.shipping_settings || {};
                if (s.dac?.preferred_agency) {
                  creds.kOficinaOrigen = String(s.dac.preferred_agency);
                }
              }
            }
          }
        } 
        else if (providerCode === "soydelivery") {
          if (suborder.vendor_id) {
            const { data: vendor } = await supabase
              .from("vendors")
              .select("shipping_settings")
              .eq("id", suborder.vendor_id)
              .single();
            const s = vendor?.shipping_settings || {};
            if (s.soydelivery?.enabled && s.soydelivery?.apiKey) {
              creds = {
                apiKey: s.soydelivery.apiKey,
                clientId: s.soydelivery.clientId || s.soydelivery.negocioId,
                negocioId: s.soydelivery.negocioId || s.soydelivery.clientId,
                secret: s.soydelivery.secret || s.soydelivery.negocioClave,
                negocioClave: s.soydelivery.negocioClave || s.soydelivery.secret,
                isSandbox: s.soydelivery.sandbox === "true" || s.soydelivery.isSandbox
              };
            }
          }

          if (!creds.apiKey) {
            const { data: globalProv } = await supabase
              .from("shipping_providers")
              .select("*")
              .eq("code", "soydelivery")
              .single();
            if (globalProv) {
              creds = {
                apiKey: globalProv.settings?.apiKey || globalProv.settings?.shipping_soydelivery_api_key || "",
                clientId: globalProv.settings?.clientId || globalProv.settings?.shipping_soydelivery_api_id || "",
                negocioId: globalProv.settings?.negocioId || globalProv.settings?.shipping_soydelivery_negocio_id || "",
                secret: globalProv.settings?.secret || globalProv.settings?.shipping_soydelivery_negocio_clave || "",
                negocioClave: globalProv.settings?.negocioClave || globalProv.settings?.shipping_soydelivery_negocio_clave || "",
                isSandbox: globalProv.environment === "uat" || globalProv.settings?.sandbox === "true"
              };
            }
          }
        }

        // Pre-validation check
        const validation = validateShipmentBeforeDispatch(shipment, creds);
        if (!validation.valid) {
          throw new Error(`Pre-validación fallida: ${validation.error}`);
        }

        // Initialize adapter and check for existing guide to prevent duplication
        let result;
        let existingResult = null;

        if (providerCode === "dac") {
          const adapter = new DACAdapter();
          if (adapter.checkExistingShipment) {
            console.log(`[Shipping Worker] Checking if guide already exists for suborder ${suborder.id} on DAC...`);
            existingResult = await adapter.checkExistingShipment(supabase, suborder.id, creds);
          }
        }

        if (existingResult && existingResult.success) {
          console.log(`[Shipping Worker] Guide already exists! Tracking: ${existingResult.trackingCode}. Re-using existing guide.`);
          result = existingResult;
        } else {
          // Normal creation flow
          if (providerCode === "dac") {
            const adapter = new DACAdapter();
            if (!adapter.validateConfig(creds)) throw new Error("DAC credentials are incomplete or missing");
            
            let observationsOverride = suborder.observations || "";
            if (suborder.vendor_id) {
              const { data: vendor } = await supabase
                .from("vendors")
                .select("store_name, contact_phone, pickup_address, shipping_settings")
                .eq("id", suborder.vendor_id)
                .single();
              if (vendor) {
                const s = vendor.shipping_settings || {};
                const senderName = vendor.store_name || "Vendedor Collectibles";
                const senderPhone = s.dac?.phone || vendor.contact_phone || "N/A";
                const senderAddress = s.dac?.dispatch_address || vendor.pickup_address || "N/A";
                observationsOverride = `REMITENTE: ${senderName} (Tel: ${senderPhone}, Despacha: ${senderAddress}). ${observationsOverride}`.trim();
              }
            }

            result = await adapter.createShipment(
              supabase,
              suborder.id,
              creds,
              resolvedAddress,
              Number(shipment.package_weight) || 1.0,
              Number(shipment.package_quantity) || 1,
              observationsOverride,
              { name: shipment.customer_name, phone: shipment.customer_phone }
            );
          } 
          else if (providerCode === "soydelivery") {
            const adapter = new SoyDeliveryAdapter();
            if (!adapter.validateConfig(creds)) throw new Error("SoyDelivery credentials are incomplete or missing");
            result = await adapter.createShipment(
              supabase,
              suborder.id,
              creds,
              resolvedAddress,
              Number(shipment.package_weight) || 1.0,
              Number(shipment.package_quantity) || 1,
              suborder.observations || "",
              { name: shipment.customer_name, phone: shipment.customer_phone }
            );
          } 
          else {
            throw new Error(`Unsupported queue provider: ${item.provider_code}`);
          }
        }

        if (result.success) {
          console.log(`[Shipping Worker] Success registering shipment ${shipment.id}. Tracking: ${result.trackingCode}`);

          // Determine label url
          const labelUrl = result.labelUrl || null;
          const labelPath = result.labelPath || null;
          const tracking = result.trackingCode;
          const extGuide = result.externalGuide || null;
          
          let trackingUrl = null;
          if (providerCode === 'dac' && tracking) {
            trackingUrl = `https://www.dac.com.uy/seguimiento-de-envio?guia=${tracking}`;
          } else if (providerCode === 'soydelivery' && tracking) {
            trackingUrl = `https://soydelivery.com.uy/tracking/${tracking}`;
          }

          const isCollectiblesEnvios = providerCode === 'dac' || providerCode === 'soydelivery';
          const chargedToCustomer = Number(suborder.shipping_cost) || 0.00;
          const providerCost = isCollectiblesEnvios ? Number((chargedToCustomer * 0.90).toFixed(2)) : chargedToCustomer;
          const margin = isCollectiblesEnvios ? Number((chargedToCustomer - providerCost).toFixed(2)) : 0.00;
          const billingMode = isCollectiblesEnvios ? 'collectibles_envios' : 'vendor_own_account';
          const paidBy = isCollectiblesEnvios ? 'collectibles' : 'vendor';

          // A. Update shipments table
          await supabase
            .from("shipments")
            .update({
              tracking_code: tracking,
              external_guide: extGuide,
              shipping_label_url: labelUrl,
              shipping_label_path: labelPath,
              shipping_status: labelUrl ? "label_generated" : "created",
              guide_created_at: new Date().toISOString(),
              tracking_assigned_at: new Date().toISOString(),
              provider_response: result.rawResponse || null,
              shipping_quote_to_customer: chargedToCustomer,
              shipping_charged_to_customer: chargedToCustomer,
              shipping_provider_cost_estimated: providerCost,
              shipping_provider_cost_real: providerCost,
              shipping_provider_cost: providerCost,
              shipping_margin_estimated: margin,
              shipping_margin_real: margin,
              shipping_margin: margin,
              shipping_paid_by: paidBy,
              shipping_billing_mode: billingMode,
              shipping_invoice_status: 'pending',
              updated_at: new Date().toISOString()
            })
            .eq("id", shipment.id);

          // B. Update suborders table
          await supabase
            .from("order_suborders")
            .update({
              tracking_number: tracking,
              tracking_url: trackingUrl,
              shipping_status: "processing",
              shipping_quote_to_customer: chargedToCustomer,
              shipping_charged_to_customer: chargedToCustomer,
              shipping_provider_cost_estimated: providerCost,
              shipping_provider_cost_real: providerCost,
              shipping_provider_cost: providerCost,
              shipping_margin_estimated: margin,
              shipping_margin_real: margin,
              shipping_margin: margin,
              shipping_paid_by: paidBy,
              shipping_billing_mode: billingMode,
              shipping_invoice_status: 'pending',
              shipping_provider_invoice_status: 'pending',
              updated_at: new Date().toISOString()
            })
            .eq("id", suborder.id);

          // C. Add event history log
          await supabase.from("shipment_events").insert({
            shipment_id: shipment.id,
            event_type: "created",
            description: result.rawResponse?.resolved_existing
              ? `Envío re-vinculado exitosamente desde el courier ${providerCode.toUpperCase()}. Tracking: ${tracking}`
              : `Envío registrado exitosamente en ${providerCode.toUpperCase()}. Tracking: ${tracking}`,
            provider_status: "created",
            raw_response: result.rawResponse || null
          });

          if (labelUrl) {
            await supabase.from("shipment_events").insert({
              shipment_id: shipment.id,
              event_type: "label_generated",
              description: `Etiqueta oficial del courier descargada y vinculada en Storage.`,
              provider_status: "label_generated"
            });
          }

          // D. Update queue status
          await supabase
            .from("shipping_queue")
            .update({
              status: "completed",
              processed_at: new Date().toISOString()
            })
            .eq("id", item.id);
        } 
        else {
          throw new Error(result.error || "Unknown courier registration failure");
        }

      } catch (err: any) {
        hasError = true;
        errorMessage = err.message || String(err);
        console.error(`[Shipping Worker Error] Processing item ${item.id}:`, errorMessage);

        // Exponential retry backoff logic (max 3 retries)
        const attempts = item.attempts + 1;
        if (attempts >= 3) {
          // Mark permanently failed
          await supabase
            .from("shipping_queue")
            .update({
              status: "failed",
              attempts: attempts,
              last_error: errorMessage,
              processed_at: new Date().toISOString()
            })
            .eq("id", item.id);

          await supabase
            .from("shipments")
            .update({
              shipping_status: "failed",
              error_message: errorMessage,
              updated_at: new Date().toISOString()
            })
            .eq("id", item.shipment_id);

          await supabase.from("shipment_events").insert({
            shipment_id: item.shipment_id,
            event_type: "failed",
            description: `El envío falló de forma permanente tras 3 intentos. Error: ${errorMessage}`,
            provider_status: "failed"
          });

          // Trigger internal Admin Alert
          await supabase.from("admin_alerts").insert({
            title: `Fallo definitivo de envío (Bulto: ${item.shipment_id})`,
            description: `El envío de la suborden falló permanentemente tras 3 reintentos en ${item.provider_code.toUpperCase()}. Detalle: ${errorMessage}`,
            type: 'shipping_error',
            is_read: false
          });
        } 
        else {
          // Exponential backoff: attempts = 1 (30s), 2 (60s)
          const backoffSec = Math.pow(2, attempts - 1) * 30;
          const nextAttempt = new Date();
          nextAttempt.setSeconds(nextAttempt.getSeconds() + backoffSec);

          await supabase
            .from("shipping_queue")
            .update({
              status: "retry_scheduled",
              attempts: attempts,
              next_attempt_at: nextAttempt.toISOString(),
              last_error: errorMessage
            })
            .eq("id", item.id);

          await supabase.from("shipment_events").insert({
            shipment_id: item.shipment_id,
            event_type: "retry_scheduled",
            description: `Error en intento #${attempts}. Reintentando en ${backoffSec}s. Detalle: ${errorMessage}`,
            provider_status: "retry_scheduled"
          });
        }
      } finally {
        // Record latency and update API monitors
        const latency = Date.now() - latencyStart;
        const { data: monitor } = await supabase
          .from("shipping_monitor")
          .select("*")
          .eq("provider_code", item.provider_code.toLowerCase())
          .maybeSingle();

        if (monitor) {
          const reqCount = monitor.request_count + 1;
          const errCount = monitor.error_count + (hasError ? 1 : 0);
          const currentStatus = errCount / reqCount > 0.3 ? "degraded" : "active";
          
          await supabase
            .from("shipping_monitor")
            .update({
              latency_ms: latency,
              request_count: reqCount,
              error_count: errCount,
              last_ping_at: new Date().toISOString(),
              last_error: hasError ? errorMessage : monitor.last_error,
              status: currentStatus,
              updated_at: new Date().toISOString()
            })
            .eq("id", monitor.id);

          // Alert if courier changes status to degraded
          if (currentStatus !== monitor.status && currentStatus === 'degraded') {
            await supabase.from("admin_alerts").insert({
              title: `Courier ${item.provider_code.toUpperCase()} en estado DEGRADADO`,
              description: `La API de ${item.provider_code.toUpperCase()} está experimentando problemas. Tasa de errores elevada: ${((errCount / reqCount) * 100).toFixed(0)}%. Último error: ${errorMessage}`,
              type: 'courier_status',
              is_read: false
            });
          }
        }
      }
    }

    return new Response(JSON.stringify({ success: true, processed: queueItems.length }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
