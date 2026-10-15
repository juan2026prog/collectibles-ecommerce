// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import { prepareCatalog, parseFilters, selectCatalog, createCatalogRepository } from '../../../api/_lib/public-catalog.js';
import { createCatalogHandler } from '../../../api/public-catalog.js';
import { withDeadline } from '../../../api/_lib/public-supabase.js';
import { authorizeWorker, guardWorker } from '../../../supabase/functions/_shared/workerGuard.ts';

const raw = (overrides = {}) => ({
  categories:[{id:'parent',name:'Figuras',slug:'figuras'},{id:'child',name:'Héroes',slug:'heroes',parent_id:'parent'},{id:'grand',name:'Marvel',slug:'marvel',parent_id:'child'}],
  brands:[{id:'brand',name:'Hasbro',slug:'hasbro'}], licenses:[{id:'license',name:'Marvel',slug:'marvel'}],
  themes:[{id:'theme',name:'Comics',slug:'comics'}],licenseThemes:[{license_id:'license',theme_id:'theme'}],groups:[],
  local:[{id:'a',title:'Spider-Man',status:'published',is_active:true,category_id:'grand',product_categories:[{category_id:'child'}],brand_id:'brand',license_id:'license',base_price:1500,created_at:'2026-10-01'},
    {id:'b',title:'Otro héroe',status:'published',is_active:true,category_id:'child',brand_id:'brand',base_price:3000,condition:'used_complete',created_at:'2026-10-02'}],
  international:[{id:'c',title:'Importado',status:'published',brand:'Hasbro',final_price_usd:50,collectibles_category_id:'parent',created_at:'2026-10-03'}],
  internationalEnabled:true,...overrides,
});
const select = (filters = {}, fixture = raw()) => selectCatalog(prepareCatalog(fixture),parseFilters({availability:'all',...filters}));
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('Public catalog correctness and bounded payloads', () => {
  it('counts a product only once across multiple category assignments and includes descendants', () => {
    const result=select({category:'figuras'});
    expect(result.count).toBe(3); expect(result.facets.categoryFacets.parent).toBe(3);
    expect(result.facets.categoryFacets.child).toBe(2); expect(result.facets.categoryFacets.grand).toBe(1);
  });
  it('uses one global order for local and international pages with currency conversion', () => {
    const first=select({sortBy:'price-low',exchangeRate:'40',limit:'2'});
    const second=select({sortBy:'price-low',exchangeRate:'40',limit:'2',offset:'2'});
    expect(first.selected.map(p=>p.id)).toEqual(['a','c']);
    expect(second.selected.map(p=>p.id)).toEqual(['b']);
    expect(new Set([...first.selected,...second.selected].map(p=>p.id)).size).toBe(3);
  });
  it('applies price, license and theme filters consistently to products and facets', () => {
    expect(select({license:'marvel',theme:'comics',minPrice:'1400',maxPrice:'1600'}).selected.map(p=>p.id)).toEqual(['a']);
    expect(select({license:'marvel',minPrice:'2000'}).count).toBe(0);
  });
  it('supports aliases and accent-insensitive search and reports the same count in facets', () => {
    const result=select({search:'Spiderman'});
    expect(result.selected.map(p=>p.id)).toEqual(['a']);expect(result.facets.totalCatalogProducts).toBe(result.count);
  });
  it('never includes drafts, inactive rows or disabled international inventory', () => {
    const fixture=raw({internationalEnabled:false});
    fixture.local.push({...fixture.local[0],id:'draft',status:'draft'},{...fixture.local[0],id:'inactive',is_active:false});
    expect(select({},fixture).selected.map(p=>p.id).sort()).toEqual(['a','b']);
  });
  it('bounds page size and rejects malformed numeric input before querying data', () => {
    expect(parseFilters({limit:'999999'}).limit).toBe(60);
    expect(()=>parseFilters({offset:'NaN'})).toThrow();expect(()=>parseFilters({limit:['1','2']})).toThrow();
  });
});

describe('Snapshot stampede and failure protection', () => {
  function fakeClient(fail:()=>boolean=()=>false) {
    const from=vi.fn((table:string)=>{
      const builder:any={select:()=>builder,eq:()=>builder,order:()=>builder,
        range:vi.fn(async()=> fail() && table==='products' ? {data:null,error:{message:'timeout'}} : {data:[],error:null})};return builder;
    });
    return {from,rpc:vi.fn(async()=>({data:{international_public_enabled:false},error:null}))};
  }
  it('collapses simultaneous refreshes and reuses a successful snapshot', async()=>{
    const client=fakeClient();const repo=createCatalogRepository(client);
    await Promise.all([repo.get(),repo.get(),repo.get()]);expect(client.rpc).toHaveBeenCalledTimes(1);
    await repo.get();expect(client.rpc).toHaveBeenCalledTimes(1);
  });
  it('does not cache partial results and backs off after an upstream failure',async()=>{
    let clock=0,fail=true;const client=fakeClient(()=>fail);const repo=createCatalogRepository(client,()=>clock);
    await expect(repo.get()).rejects.toThrow();const calls=client.from.mock.calls.length;
    await expect(repo.get()).rejects.toThrow();expect(client.from.mock.calls.length).toBe(calls);
    clock=31000;fail=false;await expect(repo.get()).resolves.toMatchObject({stale:false});
  });
});

describe('HTTP failure and cancellation semantics',()=>{
  function response(){return {headers:{} as Record<string,string>,statusCode:0,body:null as any,
    setHeader(k:string,v:string){this.headers[k]=v;},status(n:number){this.statusCode=n;return this;},json(v:any){this.body=v;return this;}};}
  it('returns uncached 503 on unavailable data rather than a successful empty catalog',async()=>{
    const res=response();await createCatalogHandler(()=>({get:async()=>{throw Error('offline');}}))({method:'GET',query:{}},res);
    expect(res.statusCode).toBe(503);expect(res.headers['Vercel-CDN-Cache-Control']).toBe('no-store');expect(res.headers['Retry-After']).toBe('30');
  });
  it('returns only the requested page from the cacheable anonymous handler',async()=>{
    const catalog=prepareCatalog(raw());const res=response();
    const from=vi.fn(()=>{throw Error('Facets must not hydrate cards');});
    await createCatalogHandler(()=>({get:async()=>({catalog}),client:{from}}))({method:'GET',query:{mode:'facets',availability:'all',limit:'0'},headers:{authorization:'Bearer private-user'}},res);
    expect(res.statusCode).toBe(200);expect(res.body.products).toEqual([]);expect(res.body.count).toBe(3);expect(from).not.toHaveBeenCalled();
    expect(res.headers['Vercel-CDN-Cache-Control']).toContain('s-maxage=60');
  });
  it('aborts the actual database operation at its deadline',async()=>{
    vi.useFakeTimers();let signal:AbortSignal|undefined;
    const operation={abortSignal(s:AbortSignal){signal=s;return new Promise(()=>{});}};
    const result=withDeadline(operation,50);const assertion=expect(result).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(51);await assertion;expect(signal?.aborted).toBe(true);
  });
});

describe('Worker authorization and coordination',()=>{
  const env={get:(name:string)=>name==='SUPABASE_SERVICE_ROLE_KEY'?'server-only-key':undefined};
  it('rejects an anonymous caller before touching privileged data',async()=>{
    const client={rpc:vi.fn(),from:vi.fn()};
    await expect(authorizeWorker(new Request('https://example.com'),client,env)).rejects.toMatchObject({status:401});
    expect(client.rpc).not.toHaveBeenCalled();expect(client.from).not.toHaveBeenCalled();
  });
  it('rejects a signed-in non-admin even when the identity is valid',async()=>{
    const chain:any={select:()=>chain,eq:()=>chain,maybeSingle:async()=>({data:{is_admin:false},error:null})};
    const client={auth:{getUser:async()=>({data:{user:{id:'u'}},error:null})},from:()=>chain};
    await expect(authorizeWorker(new Request('https://example.com',{headers:{authorization:'Bearer user-token'}}),client,env)).rejects.toMatchObject({status:403});
  });
  it('never trusts a request header merely because a service key appears inside it',async()=>{
    const client={auth:{getUser:async()=>({data:null,error:{message:'invalid'}})}};
    await expect(authorizeWorker(new Request('https://example.com',{headers:{authorization:'Bearer prefix-server-only-key'}}),client,env)).rejects.toMatchObject({status:401});
  });
  it('refuses overlapping runs and releases only the lease owner',async()=>{
    const client={rpc:vi.fn().mockResolvedValueOnce({data:false,error:null})};
    const req=new Request('https://example.com',{headers:{authorization:'Bearer server-only-key'}});
    await expect(guardWorker(req,client,'campaign-runner',env)).rejects.toMatchObject({status:409});
    client.rpc.mockResolvedValue({data:true,error:null});const lease=await guardWorker(req,client,'campaign-runner',env);await lease.release();
    const owner=client.rpc.mock.calls[1][1].p_owner;
    expect(client.rpc).toHaveBeenLastCalledWith('release_worker_lease',{p_worker:'campaign-runner',p_owner:owner});
  });
});
