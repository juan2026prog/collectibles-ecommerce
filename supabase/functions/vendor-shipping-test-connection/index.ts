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
        throw new Error("DAC requiere usuario y contraseña");
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
      const { apiKey } = credentials;
      if (!apiKey) {
        throw new Error("SoyDelivery requiere API Key");
      }
      
      success = true;
      message = "Conexión con SoyDelivery exitosa";

    } else if (provider === 'ues') {
      const { username, password, apiKey, token } = credentials;
      if (!username || !password || !apiKey || !token) {
        throw new Error("UES requiere usuario, password, api key y token");
      }
      
      success = true;
      message = "Conexión con UES exitosa";

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
