// Official Metrics API, fixed project, numeric allowlist. Never persist raw labels/bodies.
import { config } from 'dotenv';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const ORIGIN='https://cobtsgkwcftvexaarwmo.supabase.co';
const ALLOWED=/^(node_cpu_seconds_total|node_memory_(MemTotal|MemAvailable|SwapTotal|SwapFree)_bytes|node_vmstat_pswp(in|out)|node_disk_(reads_completed_total|writes_completed_total|read_time_seconds_total|write_time_seconds_total|io_time_seconds_total)|pg_up|pgbouncer_up|pgbouncer_pools_(server_(active|idle|login|used|testing)|client_(active|waiting))_connections|pgbouncer_pools_client_maxwait_seconds|pgbouncer_stats_client_wait_seconds_total)$/;
export function parseResourceMetrics(text) {
  const metrics=[];
  for(const line of text.split('\n')) {
    if(!line||line.startsWith('#'))continue;
    const m=line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{([^}]*)\})?\s+([-+0-9.eE]+)(?:\s|$)/);
    if(!m||!ALLOWED.test(m[1])||!Number.isFinite(Number(m[3])))continue;
    const labels=m[2]||'',mode=labels.match(/(?:^|,)mode="([a-z]{1,16})"/)?.[1];
    const device=labels.match(/(?:^|,)device="([a-zA-Z0-9._/-]{1,80})"/)?.[1];
    metrics.push({name:m[1],...(mode?{mode}:{}),...(device?{device}:{}),value:Number(m[3])});
  }
  return metrics;
}
export function resourceDeltas(previous,current) {
  const seconds=(Date.parse(current.checked_at)-Date.parse(previous.checked_at))/1000;
  if(!(seconds>=1))return {available:false,reason:'INSUFFICIENT_INTERVAL'};
  const sum=(s,name,mode,device)=>s.metrics.filter(m=>m.name===name&&(mode===undefined||m.mode===mode)&&(device===undefined||m.device===device)).reduce((n,m)=>n+m.value,0);
  const delta=(name,mode,device)=>{
    const matches=m=>m.name===name&&(mode===undefined||m.mode===mode)&&(device===undefined||m.device===device);
    if(!previous.metrics.some(matches)||!current.metrics.some(matches))return null;
    const n=sum(current,name,mode,device)-sum(previous,name,mode,device);return n>=0?n:null;
  };
  const total=delta('node_cpu_seconds_total'),idle=delta('node_cpu_seconds_total','idle'),wait=delta('node_cpu_seconds_total','iowait');
  const cpu=total>0&&idle!==null&&wait!==null?{busy_percent:Math.round((total-idle-wait)/total*10000)/100,iowait_percent:Math.round(wait/total*10000)/100}:null;
  const disks=[...new Set(current.metrics.filter(m=>m.name==='node_disk_reads_completed_total'&&m.device).map(m=>m.device))].map(device=>{
    const reads=delta('node_disk_reads_completed_total',undefined,device),writes=delta('node_disk_writes_completed_total',undefined,device);
    const rt=delta('node_disk_read_time_seconds_total',undefined,device),wt=delta('node_disk_write_time_seconds_total',undefined,device);
    return {device,read_iops:reads===null?null:reads/seconds,write_iops:writes===null?null:writes/seconds,
      average_read_ms:reads>0&&rt!==null?rt/reads*1000:null,average_write_ms:writes>0&&wt!==null?wt/writes*1000:null};
  });
  return {available:true,interval_seconds:seconds,cpu,disks,
    swap_in_pages_per_second:delta('node_vmstat_pswpin')===null?null:delta('node_vmstat_pswpin')/seconds,
    swap_out_pages_per_second:delta('node_vmstat_pswpout')===null?null:delta('node_vmstat_pswpout')/seconds,
    limits:['Counter deltas for this observed interval only; not historical incident measurements.','Per-device OS counters are not PostgreSQL query IOPS. Counter resets/missing metrics produce null.']};
}
export async function sampleDatabaseResources(credential,fetcher=fetch) {
  const result={checked_at:new Date().toISOString(),source:'Supabase Metrics API',status:null,metrics:[]};
  if(!credential)return {...result,available:false,error:'METRICS_CREDENTIAL_UNAVAILABLE'};
  try {
    const response=await fetcher(ORIGIN+'/customer/v1/privileged/metrics',{headers:{Authorization:'Basic '+Buffer.from('service_role:'+credential).toString('base64')},signal:AbortSignal.timeout(15000)});
    result.status=response.status;
    if(response.ok)result.metrics=parseResourceMetrics(await response.text());
    return {...result,available:response.ok&&result.metrics.length>0};
  }catch(error){return {...result,available:false,error:['TimeoutError','AbortError'].includes(error.name)?error.name:'METRICS_TRANSPORT_ERROR'};}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  config({path:'.env',quiet:true});
  if(process.env.SUPABASE_URL&&process.env.SUPABASE_URL!==ORIGIN)throw Error('Unexpected project');
  const result=await sampleDatabaseResources(process.env.SUPABASE_METRICS_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY);
  if(process.argv[3])result.delta=resourceDeltas(JSON.parse(await readFile(process.argv[3],'utf8')),result);
  if(process.argv[2]){await mkdir(new URL('.',pathToFileURL(process.argv[2])),{recursive:true});await writeFile(process.argv[2],JSON.stringify(result,null,2)+'\n');}
  console.log(JSON.stringify(result));process.exitCode=result.available?0:1;
}
