import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders, handleOptions } from "../_shared/cors.ts";
declare const Deno: any;
serve(async (req: Request) => {
  const options = handleOptions(req);
  if (options) return options;
  try {
    const body = await req.json();
    const headers = new Headers({ "Content-Type":"application/json", "origin":req.headers.get("origin") || "https://collectibles.uy" });
    for (const key of ["authorization","apikey"]) { const value=req.headers.get(key); if(value) headers.set(key,value); }
    const upstream = await fetch(Deno.env.get("SUPABASE_URL")+"/functions/v1/create-payment", {
      method:"POST",headers,body:JSON.stringify({ provider:"mercadopago",order_id:body.orderId,order_token:body.order_token }),signal:AbortSignal.timeout(60000),
    });
    const result = await upstream.json();
    return new Response(JSON.stringify({ ...result,redirect_url:result.checkout_url }),{status:upstream.status,headers:{...getCorsHeaders(req),"Content-Type":"application/json"}});
  } catch {
    return new Response(JSON.stringify({ error:"No se pudo verificar el intento. Conservá esta orden antes de reintentar.",code:"RECONCILIATION_REQUIRED" }),{status:409,headers:{...getCorsHeaders(req),"Content-Type":"application/json"}});
  }
});
