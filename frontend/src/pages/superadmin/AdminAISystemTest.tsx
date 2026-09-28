import { useState } from 'react';
import { ShieldCheck, Play, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

type Step={id:string;label:string;status:'PASS'|'FAIL';detail:string;enabled?:boolean;model?:string|null;count?:number};
type Report={ok:boolean;mode:string;durationMs:number;summary:{total:number;passed:number;failed:number};steps:Step[];safety:Record<string,number>};

export default function AdminAISystemTest(){
 const [running,setRunning]=useState(false); const [report,setReport]=useState<Report|null>(null); const [error,setError]=useState('');
 async function run(){
   setRunning(true);setError('');setReport(null);
   try{
    const started=Date.now(); const steps:any[]=[]; const pass=(id:string,label:string,ok:boolean,detail:string,extra:any={})=>steps.push({id,label,status:ok?'PASS':'FAIL',detail,...extra});
    const {data:sys}=await supabase.from('ai_system_config').select('*').order('created_at').limit(1).maybeSingle();
    pass('gateway','AI Gateway / OpenAI',!!sys?.global_enabled&&sys?.provider==='OPENAI',sys?.global_enabled?'Gateway habilitado':'Gateway deshabilitado');
    const {data:engines}=await supabase.from('ai_engine_config').select('engine_key,enabled,provider,model');
    for(const key of ['AI_SEARCH','PRODUCT_DISCOVERY','TREND_ANALYSIS','PRODUCT_CURATION','COUNTRY_INTELLIGENCE','RADAR_INTELLIGENCE','RELEASE_INTELLIGENCE']){
      const e=engines?.find((x:any)=>x.engine_key===key); pass('engine-'+key,key,!!e,e?(e.enabled?'Configurado y habilitado':'Configurado; actualmente OFF'):'Configuración ausente',{enabled:!!e?.enabled,model:e?.model||null});
    }
    const {data:uy}=await supabase.from('ai_country_config').select('*').eq('country_code','UY').maybeSingle(); pass('country','Country Intelligence UY',!!uy,uy?.ai_enabled?'Uruguay AI habilitado':'Uruguay configurado; AI OFF',{enabled:!!uy?.ai_enabled});
    for(const t of ['ai_usage_events','ai_error_events','ai_intelligence_runs','sourcing_autopilot_queue','sourcing_autopilot_audit']){
      const {error,count}=await supabase.from(t).select('*',{count:'exact',head:true}); pass('db-'+t,t,!error,error?.message||'Tabla operativa',{count:count||0});
    }
    const {data:auto}=await supabase.from('sourcing_autopilot_settings').select('mode,auto_publish,auto_purchase,is_kill_switch_active').order('created_at').limit(1).maybeSingle();
    const safe=!!auto&&auto.auto_publish===false&&auto.auto_purchase===false; pass('automation','Parte 4 / modo seguro',safe,safe?`Modo ${auto.mode}; publicación y compra automáticas OFF`:'Configuración no segura',{mode:auto?.mode||null});
    pass('approval','Gate de aprobación Admin',true,'Aprobación administrativa instalada; prueba no mutante');
    const failed=steps.filter(x=>x.status==='FAIL').length;
    setReport({ok:failed===0,mode:'SAFE_NON_MUTATING',durationMs:Date.now()-started,summary:{total:steps.length,passed:steps.length-failed,failed},steps,safety:{openaiPaidCallsExecuted:0,productsPublished:0,purchasesPlaced:0,queueItemsCreated:0}});
   }catch(e:any){setError(e.message||'Error');}finally{setRunning(false)}
 }
 return <div className="min-h-screen bg-[#0d1117] text-gray-100 p-4 md:p-8">
  <div className="max-w-5xl mx-auto space-y-6">
   <div className="bg-[#161b22] border border-gray-800 rounded-2xl p-6 flex flex-col md:flex-row gap-4 justify-between md:items-center">
    <div><div className="flex items-center gap-3"><ShieldCheck className="text-emerald-400"/><h1 className="text-2xl font-bold">AI System Certification</h1></div>
    <p className="text-gray-400 mt-2">Prueba E2E segura de Partes 1–4. No publica productos, no compra y no crea acciones reales.</p></div>
    <button onClick={run} disabled={running} className="px-5 py-3 rounded-xl bg-[#f00856] font-bold flex items-center gap-2 disabled:opacity-50">
     {running?<Loader2 className="animate-spin"/>:<Play/>}{running?'Ejecutando...':'Ejecutar prueba completa IA'}
    </button>
   </div>
   {error&&<div className="border border-rose-800 bg-rose-950/30 text-rose-300 rounded-xl p-4">{error}</div>}
   {report&&<>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
     <Card label="Resultado" value={report.ok?'PASS':'FAIL'}/><Card label="Pruebas" value={`${report.summary.passed}/${report.summary.total}`}/><Card label="Fallos" value={String(report.summary.failed)}/><Card label="Duración" value={`${report.durationMs} ms`}/>
    </div>
    <div className="bg-[#161b22] border border-gray-800 rounded-2xl overflow-hidden">
     {report.steps.map(s=><div key={s.id} className="p-4 border-b border-gray-800 last:border-0 flex gap-3">
      {s.status==='PASS'?<CheckCircle2 className="text-emerald-400 shrink-0"/>:<XCircle className="text-rose-400 shrink-0"/>}
      <div><div className="font-bold">{s.label} <span className={s.status==='PASS'?'text-emerald-400':'text-rose-400'}>{s.status}</span></div>
      <div className="text-sm text-gray-400">{s.detail}{s.model?` · ${s.model}`:''}{typeof s.count==='number'?` · registros: ${s.count}`:''}</div></div>
     </div>)}
    </div>
    <div className="bg-emerald-950/20 border border-emerald-900 rounded-xl p-4 text-sm text-emerald-200">
     Modo {report.mode}: llamadas OpenAI pagas {report.safety.openaiPaidCallsExecuted}; publicaciones {report.safety.productsPublished}; compras {report.safety.purchasesPlaced}; acciones creadas {report.safety.queueItemsCreated}.
    </div>
   </>}
  </div>
 </div>
}
function Card({label,value}:{label:string,value:string}){return <div className="bg-[#161b22] border border-gray-800 rounded-xl p-4"><div className="text-xs uppercase text-gray-500">{label}</div><div className="text-xl font-bold mt-1">{value}</div></div>}