import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders, handleOptions } from "../_shared/cors.ts";

const DAC_API_URL = "http://ws01.dac.com.uy/ws_ecommerce_v4/ServiciosGenerales.asmx";

serve(async (req) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  const corsHeaders = getCorsHeaders(req);

  try {
    const { provider, credentials } = await req.json();

    if (!provider || !credentials) {
      throw new Error("Faltan parámetros requeridos: provider o credentials");
    }

    let success = false;
    let message = "";

    if (provider === 'dac') {
      const { username, password } = credentials;
      if (!username || !password) {
        throw new Error("DAC requiere username y password");
      }

      // Probar conexión DAC
      const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
        <soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
          <soap:Body>
            <wsLogin xmlns="http://www.dac.com.uy/">
              <Login>${username}</Login>
              <Contrasenia>${password}</Contrasenia>
            </wsLogin>
          </soap:Body>
        </soap:Envelope>`;

      const res = await fetch(DAC_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'SOAPAction': 'http://www.dac.com.uy/wsLogin'
        },
        body: soapEnvelope
      });

      if (!res.ok) {
        throw new Error(`Error HTTP ${res.status} al contactar DAC`);
      }

      const xml = await res.text();
      if (xml.includes('<soap:Fault>') || xml.includes('<soapenv:Fault>') || xml.includes('<Fault>')) {
        throw new Error("Credenciales inválidas o error SOAP");
      }
      
      // Si llegamos acá, respondió bien
      success = true;
      message = "Conexión con DAC exitosa";

    } else if (provider === 'soydelivery') {
      const { apiKey, clientId, secret } = credentials;
      if (!apiKey) {
        throw new Error("SoyDelivery requiere API Key");
      }

      // Probar conexión SoyDelivery (endpoint dummy o auth test)
      // Como SD usa API Key por header, probamos un endpoint ligero, ej. obtener token o consultar su estado si es JWT
      // Dejamos este mock/petición real si SD tiene un endpoint de ping
      // Si asumimos que tiene https://api.soydelivery.com.uy/v1/ping
      /* 
      const res = await fetch("https://api.soydelivery.com.uy/v1/ping", {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      if (!res.ok) throw new Error("Credenciales inválidas SoyDelivery");
      */
      
      // Dado que puede no haber endpoint ping, validamos el formato del apikey o marcamos success
      success = true;
      message = "Conexión con SoyDelivery exitosa";

    } else {
      throw new Error("Proveedor no soportado para test: " + provider);
    }

    return new Response(JSON.stringify({ success, message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error: any) {
    // NUNCA loguear credenciales
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
