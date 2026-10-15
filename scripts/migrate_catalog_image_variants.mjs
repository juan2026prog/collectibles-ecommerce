/** Full-catalog batch runner. Dry-run by default. Originals stay unchanged.
 * --manifest: public URL array, or --catalog to inventory published products;
 * --limit: 1..50; --concurrency: 1..3 (Storage requests are globally serialized);
 * --external explicitly permits immutable snapshots of the two known CDNs.
 * All encodings are decoded/validated offline; every card is verified over HTTP.
 * --verify-all also downloads every derivative after upload (for deep audits). */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
config({path:'.env',quiet:true});
const args=process.argv.slice(2), option=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const limit=Number(option('--limit','8')), concurrency=Number(option('--concurrency','1'));
if (!Number.isInteger(limit)||limit<1||limit>50) throw Error('Use --limit 1..50');
if (!Number.isInteger(concurrency)||concurrency<1||concurrency>3) throw Error('Use --concurrency 1..3');
const url=process.env.SUPABASE_URL;
if (url!=='https://cobtsgkwcftvexaarwmo.supabase.co') throw Error('Unexpected project');
const cache='frontend/node_modules/.cache/media-variants', journal='docs/audits/monitoring/image-variants-migration.jsonl';
await mkdir(cache,{recursive:true}); await mkdir('docs/audits/monitoring',{recursive:true});
// Storage has a separate pool from PostgREST. Bound actual Storage requests,
// including verification GETs, rather than only the number of image workers.
let storageActive=0;const storageWaiters=[];
async function request(input,init={}){
  const storage=String(input).startsWith(url+'/storage/');
  if(storage){if(storageActive>=1)await new Promise(resolve=>storageWaiters.push(resolve));else storageActive++;}
  try{
    const signal=init.signal?AbortSignal.any([init.signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000);
    return await fetch(input,{...init,signal});
  }finally{if(storage){const next=storageWaiters.shift();if(next)next();else storageActive--;}}
}
const client=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:request}});
const run=promisify(execFile), sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const python=option('--python',process.env.IMAGE_VARIANTS_PYTHON||'python');
const sourcePattern=/^https:\/\/(?:http2\.mlstatic\.com\/[A-Za-z0-9_./-]+\.(?:jpg|jpeg|png|webp)|m\.media-amazon\.com\/images\/I\/[A-Za-z0-9_./+-]+\.(?:jpg|jpeg|png|webp))$/;
let manifest;
if(args.includes('--manifest'))manifest=JSON.parse(await readFile(option('--manifest'),'utf8'));
else if(args.includes('--catalog')){
  const urls=new Set();
  const visit=(value,key='')=>{
    if(typeof value==='string'&&/url|image|logo|icon|main/i.test(key)
      &&(value.startsWith(url+'/storage/v1/object/public/')||sourcePattern.test(value)))urls.add(value);
    else if(Array.isArray(value))value.forEach(item=>visit(item,key));
    else if(value&&typeof value==='object')Object.entries(value).forEach(([name,item])=>visit(item,name));
  };
  for(let from=0;;from+=1000){
    const {data,error}=await client.from('product_images').select('id,url,product:products!inner(status,is_active)')
      .eq('product.status','published').eq('product.is_active',true).order('id').range(from,from+999);
    if(error)throw Error('Published image inventory unavailable');visit(data);if(data.length<1000)break;
  }
  for(let from=0;;from+=1000){
    const {data,error}=await client.from('international_products').select('id,image_url,main_image_url_external,gallery_images,image_urls_external,raw_data')
      .eq('status','published').order('id').range(from,from+999);
    if(error)throw Error('International image inventory unavailable');visit(data);if(data.length<1000)break;
  }
  const facets=await fetch('https://collectibles.uy/api/public-catalog?mode=facets',{signal:AbortSignal.timeout(15000)});
  if(!facets.ok)throw Error('Public asset inventory unavailable');visit(await facets.json());
  const {data:groups,error:groupError}=await client.from('product_groups').select('badge_image_url').eq('is_active',true);
  if(groupError)throw Error('Badge inventory unavailable');visit(groups);
  manifest=[...urls];await writeFile(cache+'/full-published-manifest.json',JSON.stringify(manifest,null,2));
}else throw Error('Use --manifest or --catalog');
if (!Array.isArray(manifest)||!manifest.every(x=>typeof x==='string')) throw Error('Manifest must contain public URLs');
const eligible=[...new Set(manifest)].filter(source=>{
  try { const parsed=new URL(source); return (parsed.origin===url&&!parsed.search&&!parsed.hash
    &&/^\/storage\/v1\/object\/public\/(public-assets|product-images)\/.+/.test(parsed.pathname)
    &&!/\.(svg|gif)$/i.test(parsed.pathname))||(args.includes('--external')&&sourcePattern.test(source)); }
  catch {return false;}
});
const registered=new Set();
for(let i=0;i<eligible.length;i+=300){
  const {data,error}=await client.rpc(args.includes('--external')?'get_catalog_media_variants':'get_media_image_variants',{urls:eligible.slice(i,i+300)}).abortSignal(AbortSignal.timeout(15000));
  if(error)throw Error('Registry unavailable');
  for(const item of data||[]){registered.add(item.original_url);if(item.source_url)registered.add(item.source_url);}
}
const plan=eligible.filter(source=>!registered.has(source)).slice(0,limit);
if(!args.includes('--apply')){for(const source_url of plan)console.log(JSON.stringify({source_url,state:'planned'}));process.exit(0);}

async function health(){
  for(let attempt=0;attempt<2;attempt++){
    const probe={at:new Date().toISOString(),attempt};const started=Date.now();
    try{
      const {error,status}=await client.from('media_image_variants').select('original_url').limit(1).abortSignal(AbortSignal.timeout(10000));
      probe.registry_status=status;
      if(error)probe.registry_error=/^[A-Z0-9_]{1,40}$/.test(error.code||'')?error.code:'READ_FAILED';
      const response=await fetch('https://collectibles.uy/api/public-catalog?limit=15&availability=all',{signal:AbortSignal.timeout(15000)});
      const data=response.ok?await response.json():null;
      probe.catalog_status=response.status;probe.catalog_shape_ok=Array.isArray(data?.products)&&data.count>0;
      probe.origin_snapshot=response.headers.get('x-catalog-snapshot');
      if(!error&&response.ok&&Array.isArray(data?.products)&&data.count>0)return;
    }catch(error){probe.transport_class=['TimeoutError','AbortError','TypeError'].includes(error?.name)?error.name:'CHECK_FAILED';}
    probe.elapsed_ms=Date.now()-started;
    await appendFile('docs/audits/monitoring/image-migration-health.jsonl',JSON.stringify(probe)+'\n');
  }
  throw Error('Confirmed catalog/database health failure; migration stopped');
}
await health();
let stopped=false,cursor=0;
const published=new Map(),verified=new Map(),generating=new Map();
async function publish(bucket,target,bytes,contentType,verify=true){
  const key=`${bucket}/${target}`;
  if(!published.has(key))published.set(key,(async()=>{
    const {error}=await client.storage.from(bucket).upload(target,bytes,{contentType,cacheControl:'31536000',upsert:false});
    if(error&&!/already exists|duplicate/i.test(error.message))throw Error(`upload_${error.statusCode||'failed'}`);
    const publicUrl=client.storage.from(bucket).getPublicUrl(target).data.publicUrl;
    return publicUrl;
  })());
  const publicUrl=await published.get(key);
  if(verify&&!verified.has(key))verified.set(key,(async()=>{
    const check=await request(publicUrl,{signal:AbortSignal.timeout(20000)});
    if(!check.ok)throw Error(`published_http_${check.status}`);
    if(check.headers.get('content-type')?.split(';')[0]!==contentType
      ||!/max-age=31536000/.test(check.headers.get('cache-control')||''))throw Error('published_headers_invalid');
    if(!Buffer.from(await check.arrayBuffer()).equals(bytes))throw Error('published_bytes_differ');
    return true;
  })());
  if(verify)await verified.get(key);
  return publicUrl;
}
async function migrate(source_url){
  const entry={at:new Date().toISOString(),source_url};
  try{
    const external=sourcePattern.test(source_url);
    const response=await request(source_url,{signal:AbortSignal.timeout(20000),redirect:'error'});
    if(!response.ok)throw Error(`source_http_${response.status}`);
    const contentType=response.headers.get('content-type')?.split(';')[0];
    if(!['image/jpeg','image/png','image/webp','image/avif'].includes(contentType))throw Error('unsupported_source_type');
    if(Number(response.headers.get('content-length')||0)>20*1024*1024)throw Error('source_exceeds_20mb');
    const source=Buffer.from(await response.arrayBuffer());
    if(source.length>20*1024*1024)throw Error('source_exceeds_20mb');
    const content_hash=sha(source),dir=`${cache}/${content_hash}`,sourcePath=`${dir}/original`;
    // Reuse byte-identical images already migrated, including provider URLs
    // whose unchanged originals were previously imported by the catalog sync.
    const {data:identical,error:hashError}=external
      ?await client.from('media_image_variants').select('*').eq('content_hash',content_hash).limit(1).abortSignal(AbortSignal.timeout(15000))
      :{data:[],error:null};
    if(hashError){stopped=true;throw Error('registry_lookup_failed');}
    if(external&&identical?.length){
      const record=identical[0];
      const {error}=await client.from('media_image_sources').upsert({source_url,original_url:record.original_url},{onConflict:'source_url'}).abortSignal(AbortSignal.timeout(15000));
      if(error){stopped=true;throw Error(`alias_${error.code||'failed'}`);}
      Object.assign(entry,{state:'ready',...record,reused_identical_snapshot:true});
      await appendFile(journal,JSON.stringify(entry)+'\n');console.log(JSON.stringify(entry));return;
    }
    await mkdir(dir,{recursive:true});await writeFile(sourcePath,source);
    let generated;
    try{
      if(!generating.has(content_hash))generating.set(content_hash,(async()=>{
        const {stdout}=await run(python,['scripts/generate_image_variants.py',sourcePath,dir],{windowsHide:true,maxBuffer:1024*1024,timeout:120000});
        return JSON.parse(stdout);
      })());
      generated=await generating.get(content_hash);
    }catch{throw Error('decode_or_generate_failed');}
    if(generated.skipped)Object.assign(entry,{state:'skipped',reason:generated.skipped});
    else if(!Object.keys(generated.variants).length)Object.assign(entry,{state:'skipped',reason:'already_smaller_than_derivatives'});
    else{
      const parsed=new URL(source_url),match=parsed.pathname.match(/^\/storage\/v1\/object\/public\/(public-assets|product-images)\/(.+)$/);
      const extension={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/avif':'avif'}[contentType];
      const bucket_id=external?'public-assets':match[1];
      const object_path=external?`external/${sha(source_url)}/${content_hash}.${extension}`:match[2];
      const folder=object_path.includes('/')?object_path.slice(0,object_path.lastIndexOf('/')+1):'media/';
      const original_url=external?await publish(bucket_id,object_path,source,contentType):source_url;
      const variants={},items=Object.entries(generated.variants);let next=0;
      await Promise.all([0,1].map(async()=>{
        while(next<items.length){const [name,variant]=items[next++];
          const target=`${folder}_variants/v1/${content_hash}/${variant.width}.webp`;
          const check=args.includes('--verify-all')||name==='card'||!generated.variants.card&&name==='thumbnail';
          const publicUrl=await publish(bucket_id,target,await readFile(variant.file),'image/webp',check);
          variants[name]={url:publicUrl,width:variant.width,height:variant.height,bytes:variant.bytes};}
      }));
      const record={original_url,bucket_id,object_path,content_hash,width:generated.width,height:generated.height,
        original_bytes:source.length,variants};
      const {error}=await client.from('media_image_variants').upsert(record,{onConflict:'original_url'}).abortSignal(AbortSignal.timeout(15000));
      if(error){stopped=true;throw Error(`registry_${error.code||'failed'}`);}
      if(external){
        const {error:aliasError}=await client.from('media_image_sources').upsert({source_url,original_url},{onConflict:'source_url'}).abortSignal(AbortSignal.timeout(15000));
        if(aliasError){stopped=true;throw Error(`alias_${aliasError.code||'failed'}`);}
      }
      Object.assign(entry,{state:'ready',...record,alpha:generated.alpha,
        http_verification:args.includes('--verify-all')?'all_derivatives':'card_and_original_snapshot',
        card_savings_percent:variants.card?Math.round((1-variants.card.bytes/source.length)*10000)/100:0});
    }
  }catch(error){
    if(/^(upload|published_http)_429$/.test(error.message))stopped=true;
    Object.assign(entry,{state:'error',error:/^[a-z0-9_]+$/.test(error.message)?error.message:'network_or_processing_failed'});process.exitCode=1;
  }
  await appendFile(journal,JSON.stringify(entry)+'\n');console.log(JSON.stringify(entry));
}
await Promise.all(Array.from({length:concurrency},async()=>{while(!stopped&&cursor<plan.length)await migrate(plan[cursor++]);}));
if(stopped)process.exitCode=2;
await health();
