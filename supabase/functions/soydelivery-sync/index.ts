import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { order_id } = await req.json();
    if (!order_id) throw new Error("Missing order_id");

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Fetch site settings to get SoyDelivery credentials
    const { data: settingsData } = await supabase.from('site_settings').select('key, value');
    const settings = Object.fromEntries((settingsData || []).map((s: any) => [s.key, s.value]));

    if (settings['shipping_soydelivery_enabled'] !== 'true') {
      return new Response(JSON.stringify({ skipped: true, reason: "SoyDelivery disabled in settings" }), { headers: corsHeaders });
    }

    const apiId = settings['shipping_soydelivery_api_id'];
    const apiKey = settings['shipping_soydelivery_api_key'];
    const negocioId = settings['shipping_soydelivery_negocio_id'];
    const negocioClave = settings['shipping_soydelivery_negocio_clave'];
    const isSandbox = settings['shipping_soydelivery_sandbox'] === 'true';

    if (!apiId || !apiKey || !negocioId || !negocioClave) {
      throw new Error("Missing SoyDelivery credentials in settings");
    }

    // 2. Fetch the order
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("*")
      .eq("id", order_id)
      .single();

    if (orderErr || !order) throw new Error(orderErr?.message || "Order not found");
    
    // Only process if shipping to an address (not pickup)
    const addr = order.shipping_address;
    if (!addr || typeof addr === 'string' || !addr.street) {
      return new Response(JSON.stringify({ skipped: true, reason: "No shipping address (might be pickup)" }), { headers: corsHeaders });
    }

    // Determine base URL
    const baseUrl = isSandbox 
        ? "http://testing.soydelivery.com.uy/rest" 
        : "https://soydelivery.com.uy/rest";

    // 3. Authenticate with SoyDelivery
    const authRes = await fetch(`${baseUrl}/sdws_autenticar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            ApiId: Number(apiId),
            ApiKey: apiKey
        })
    });
    
    const authData = await authRes.json();
    if (authData.ErrId && authData.ErrId !== "0") {
        throw new Error(`SoyDelivery Auth Error: ${authData.ErrDescription}`);
    }
    const token = authData.AccessToken;
    if (!token) throw new Error("No token returned from SoyDelivery");

    // 4. Create the delivery order
    // Parse street and number from addr.street
    const streetMatches = addr.street.match(/^(.*?)([\d].*)$/);
    const street = streetMatches ? streetMatches[1].trim() : addr.street;
    const number = streetMatches ? streetMatches[2].trim() : "S/N";

    // Set delivery date to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const deliveryDate = tomorrow.toISOString().split('T')[0];

    // Build the payload
    const payload = {
        Negocio_id: Number(negocioId),
        Negocio_clave: Number(negocioClave),
        Negocio_RepartidoId: 0,
        Nombre_cliente: `${addr.first_name || ''} ${addr.last_name || ''}`.trim(),
        Telefono_cliente: order.customer_phone || "099000000",
        Email_cliente: order.customer_email || "",
        Negocio_sucursal_external_id: "1",
        Ciudad_origen: "",
        Calle_origen: "Retiro Defecto",
        Numero_origen: "S/N",
        Apto_origen: "",
        Esquina_origen: "",
        Observacion_origen: "",
        Location_origen: "",
        Ciudad_destino: addr.city || "Montevideo",
        Calle_destino: street,
        Numero_destino: number,
        Apto_destino: addr.apartment || "",
        Esquina_destino: "",
        Observacion_destino: "",
        Location_destino: "",
        Fecha_entrega: deliveryDate,
        Franja_horaria: 4, // 4 = Todo el dia (10 a 18hs)
        Cantidad_bultos: 1,
        Detalle: `Orden #${order.id}`,
        Pedido_external_id: order.id,
        Nro_Factura: "",
        Servicio: "Express",
        Tipo_Vehiculo_Nombre: "MOTO",
        Tipo_Producto: 1, // CHICO
        Complejidad: "NORMAL",
        Productos: []
    };

    const createRes = await fetch(`${baseUrl}/awsnuevopedido1`, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify(payload)
    });

    const createData = await createRes.json();
    console.log("SoyDelivery Create Response:", createData);

    if (createData.Error_code !== 0) {
        throw new Error(`SoyDelivery Create Error: ${createData.Error_desc}`);
    }

    // 5. Update order with tracking ID (Pedido_id returned by SoyDelivery)
    const trackingId = createData.Pedido_id;
    if (trackingId) {
        await supabase
          .from("orders")
          .update({ 
               tracking_number: String(trackingId),
               shipping_provider: "SoyDelivery"
          })
          .eq("id", order_id);
    }

    return new Response(JSON.stringify({ success: true, trackingId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("SoyDelivery Sync Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
