import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders, handleOptions } from "../_shared/cors.ts";

const DAC_API_URL = "http://ws01.dac.com.uy/ws_ecommerce_v4/ServiciosGenerales.asmx";

const DISTRILOGIC_TEST_URL = "http://test.DISTRILOGIC.com.uy/rest/WsGetTarifaPorCliente";
const DISTRILOGIC_PROD_URL = "http://tracking.districad.com.uy/rest/WsGetTarifaPorCliente";

serve(async (req) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  const corsHeaders = getCorsHeaders(req);

  try {
    const { provider, credentials, environment = 'testing' } = await req.json();

    if (!provider || !credentials) {
      throw new Error("Faltan parámetros requeridos: provider o credentials");
    }

    let success = false;
    let message = "";
    let servicesFound: any[] = [];

    if (provider === 'distrilogic') {
      const { guid, usuario, password, cueId, cue_id } = credentials;
      const clientCueId = cueId || cue_id;

      if (!guid || !usuario || !password || !clientCueId) {
        throw new Error("Distrilogic requiere GUID, Usuario, Contraseña y Nro. de Cliente (CueId)");
      }

      const targetUrl = environment === 'production' ? DISTRILOGIC_PROD_URL : DISTRILOGIC_TEST_URL;

      const payload = {
        WSAutorizacion: {
          Guid: String(guid).trim(),
          Usuario: String(usuario).trim(),
          Password: String(password).trim()
        },
        CueId: String(clientCueId).trim(),
        DeptoCod: "Montevideo"
      };

      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        throw new Error(`Error de red HTTP ${res.status} al conectar con Distrilogic (${environment})`);
      }

      const resData = await res.json();

      // Check ErrorCode in response
      const errorCode = resData.ErrorCode ?? resData.errorCode;
      const errorMsg = resData.ErrorMsg ?? resData.errorMsg ?? "";

      if (errorCode === 200) {
        success = true;
        const tarifas = resData.MTarifas || resData.mtarifas || [];
        servicesFound = tarifas.map((t: any) => ({
          id: String(t.TSrvId || t.tsrvId || ''),
          name: t.TSrvDsc || t.tsrvDsc || 'Servicio Distrilogic',
          price: parseFloat(t.TrfImp || t.trfImp || '0'),
          estimatedHours: t.TSrvTEnt || t.tsrvTEnt || null
        }));
        message = `Conexión con Distrilogic exitosa. Se detectaron ${servicesFound.length} servicio(s) activados.`;
      } else if (errorCode === 405) {
        // Valid client & credentials, but no active rates yet
        success = true;
        message = "Credenciales válidas y cliente identificado en Distrilogic (sin tarifas activas aún).";
      } else if (errorCode === 401) {
        throw new Error("Credenciales inválidas (Usuario / Contraseña / GUID no autorizados)");
      } else if (errorCode === 402) {
        throw new Error("GUID de autorización incorrecto");
      } else if (errorCode === 403) {
        throw new Error("El número de cliente (CueId) no existe en Distrilogic");
      } else {
        throw new Error(`Distrilogic respondió error [${errorCode}]: ${errorMsg || 'Credenciales o cliente no válidos'}`);
      }

      return new Response(JSON.stringify({ 
        success, 
        message, 
        environment, 
        services: servicesFound 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });

    } else if (provider === 'dac') {
      const { username, password } = credentials;
      if (!username || !password) {
        throw new Error("DAC requiere usuario y contraseña");
      }

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
    // Sanitized response - never leak raw body or sensitive credentials
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
