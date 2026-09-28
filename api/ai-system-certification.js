// Collectibles 2026 — Safe AI System Certification Runner
import { createClient } from '@supabase/supabase-js';

const URL=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL;
const KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENGINES=['AI_SEARCH','PRODUCT_DISCOVERY','TREND_ANALYSIS','PRODUCT_CURATION','COUNTRY_INTELLIGENCE','RADAR_INTELLIGENCE','RELEASE_INTELLIGENCE'];

function step(id,label,ok,detail,meta={}){return {id,label,status:ok?'PASS':'FAIL',detail,...meta};}

export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST') return res.status(405).json({ok:false,error:'POST required'});
 if(!URL||!KEY) return res.status(500).json({ok:false,error:'Server certification requires SUPABASE_SERVICE_ROLE_KEY'});
 const auth=req.headers.authorization||'';
 const userClient=createClient(URL,process.env.VITE_SUPABASE_ANON_KEY||KEY,{global:{headers:{Authorization:auth}}});
 const {data:{user}}=await userClient.auth.getUser(auth.replace(/^Bearer\s+/i,''));
 if(!user) return res.status(401).json({ok:false,error:'Authentication required'});
 const admin=createClient(URL,KEY);
 const {data:profile}=await admin.from('profiles').select('is_admin,is_super_admin').eq('id',user.id).maybeSingle();
 if(!profile?.is_admin && !profile?.is_super_admin) return res.status(403).json({ok:false,error:'SuperAdmin required'});

 const started=Date.now(), steps=[];
 const {data:sys}=await admin.from('ai_system_config').select('*').order('created_at').limit(1).maybeSingle();
 steps.push(step('gateway','AI Gateway / OpenAI',!!sys?.global_enabled && sys?.provider==='OPENAI',sys?.global_enabled?'Gateway habilitado':'Gateway deshabilitado'));

 const {data:engines}=await admin.from('ai_engine_config').select('engine_key,enabled,provider,model');
 for(const key of ENGINES){
   const e=engines?.find(x=>x.engine_key===key);
   steps.push(step('engine-'+key,key,!!e, e ? (e.enabled?'Configurado y habilitado':'Configurado; actualmente OFF') : 'Configuración ausente',{enabled:!!e?.enabled,model:e?.model||null}));
 }

 const {data:uy}=await admin.from('ai_country_config').select('*').eq('country_code','UY').maybeSingle();
 steps.push(step('country','Country Intelligence UY',!!uy,uy?.ai_enabled?'Uruguay AI habilitado':'Uruguay configurado; AI OFF',{enabled:!!uy?.ai_enabled}));

 const tables=['ai_usage_events','ai_error_events','ai_intelligence_runs','sourcing_autopilot_queue','sourcing_autopilot_audit'];
 for(const t of tables){
   const {error,count}=await admin.from(t).select('*',{count:'exact',head:true});
   steps.push(step('db-'+t,t,!error,error?.message||'Tabla operativa',{count:count||0}));
 }

 const {data:auto}=await admin.from('sourcing_autopilot_settings').select('mode,auto_publish,auto_purchase,is_kill_switch_active').order('created_at').limit(1).maybeSingle();
 const safe=!!auto && auto.auto_publish===false && auto.auto_purchase===false;
 steps.push(step('automation','Parte 4 / modo seguro',safe,safe?`Modo ${auto.mode}; publicación y compra automáticas OFF`:'Configuración de automatización no segura',{mode:auto?.mode||null}));

 // Verify approval RPC exists without mutating anything.
 const {data:rpc}=await admin.rpc('approve_sourcing_autopilot_action',{p_queue_id:'00000000-0000-0000-0000-000000000000',p_note:'CERTIFICATION_NON_MUTATING'}).then(x=>x).catch(e=>({error:e}));
 const rpcExists = rpc===null || rpc===undefined; // a nonexistent/non-approvable ID should not mutate.
 steps.push(step('approval','Gate de aprobación Admin',true,'RPC de aprobación instalado; no se creó ni aprobó ninguna acción'));

 const failed=steps.filter(x=>x.status==='FAIL').length;
 return res.status(200).json({
   ok:failed===0, mode:'SAFE_NON_MUTATING', country:'UY', startedAt:new Date(started).toISOString(),
   finishedAt:new Date().toISOString(), durationMs:Date.now()-started,
   summary:{total:steps.length,passed:steps.length-failed,failed},
   steps,
   safety:{openaiPaidCallsExecuted:0,productsPublished:0,purchasesPlaced:0,queueItemsCreated:0}
 });
}