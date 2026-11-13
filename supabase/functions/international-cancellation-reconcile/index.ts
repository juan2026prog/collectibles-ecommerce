import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { verifyAdmin } from "../_shared/auth.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

const operations = ["refund","split_reversal","zinc_cancellation","zinc_wallet_recovery"] as const;
type Operation = typeof operations[number];
Deno.serve(async (req: Request) => {
 const headers = {...getCorsHeaders(req), "Content-Type":"application/json"};
 if(req.method==="OPTIONS") return new Response("ok",{headers});
 if(req.method!=="POST") return new Response(JSON.stringify({error:"METHOD_NOT_ALLOWED"}),{status:405,headers});
 try {
   const admin = await verifyAdmin(req);
   const url=Deno.env.get("SUPABASE_URL")||"", key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
   if(!url||!key) throw new Error("SERVER_NOT_CONFIGURED");
   const db=createClient(url,key);
   const body=await req.json();
   const orderId=String(body.order_id||"");
   const operation=String(body.operation||"") as Operation;
   const requestId=String(body.cancellation_request_id||"");
   if(!/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(orderId)||!operations.includes(operation)) return new Response(JSON.stringify({error:"INVALID_INPUT"}),{status:400,headers});
   const {data:order,error:orderErr}=await db.from("orders").select("id,is_international,payment_method,total_amount,currency,payment_status,payment_id").eq("id",orderId).maybeSingle();
   if(orderErr||!order||order.is_international!==true||order.payment_method!=="dlocalgo") return new Response(JSON.stringify({error:"ORDER_NOT_ELIGIBLE"}),{status:409,headers});
   const {data:cancellation,error:cancellationError}=await db.from("international_cancellation_requests").select("id,status").eq("order_id",orderId).eq("id",requestId).maybeSingle();
   if(cancellationError||!cancellation) return new Response(JSON.stringify({error:"CANCELLATION_REQUEST_REQUIRED"}),{status:409,headers});
   const amount=body.amount===null||body.amount===undefined?null:Number(body.amount);
   if(amount!==null&&(!Number.isFinite(amount)||amount<0||amount>Number(order.total_amount))) return new Response(JSON.stringify({error:"INVALID_AMOUNT"}),{status:400,headers});
   const currency=String(body.currency||order.currency).toUpperCase();
   if(currency!==String(order.currency).toUpperCase()) return new Response(JSON.stringify({error:"CURRENCY_MISMATCH"}),{status:409,headers});
   const reference=String(body.provider_reference||"").trim();
   const provider=operation==="refund"?"dlocalgo":operation==="split_reversal"?"logistics": "zinc";
   const keyId=[orderId,requestId,operation,reference||"pending"].join(":");
   // This is an audit/operations work item, not an instruction to move funds.
   // Evidence of an actual refund must be verified against dLocal before completion.
   const {data,error}=await db.from("international_payment_reconciliations").upsert({
     order_id:orderId,cancellation_request_id:requestId,operation,provider,
     provider_reference:reference||null,amount,currency,idempotency_key:keyId,
     status:"manual_review",evidence:{note:String(body.note||"").slice(0,1500),actor:admin.id,recorded_at:new Date().toISOString()}
   },{onConflict:"idempotency_key",ignoreDuplicates:true}).select("id,status,operation").maybeSingle();
   if(error) throw error;
   return new Response(JSON.stringify({success:true,operation,status:data?.status||"manual_review",id:data?.id||null,external_action_executed:false}),{status:202,headers});
 } catch(e) {
   console.error("INTERNATIONAL_RECONCILIATION_ERROR",e);
   return new Response(JSON.stringify({error:"RECONCILIATION_FAILED"}),{status:500,headers});
 }
});
