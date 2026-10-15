// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { monitorDatabaseStability } from '../../../scripts/monitor_database_stability.mjs';
import { probeDatabasePath } from '../../../scripts/check_database_stability.mjs';

const success = (url: URL) => new Response(url.pathname.startsWith('/api/')
  ? JSON.stringify({ products:[{id:'public'}],count:1 }) : '<html>Collectibles</html>');

describe('Hosted stability observation', () => {
  it('uses four sequential requests with no cache-busting and retries only the failed probe', async () => {
    let active=0, maximum=0;
    const calls:string[]=[];
    const fetcher=vi.fn(async (url:URL) => {
      maximum=Math.max(maximum,++active);calls.push(url.pathname+url.search);
      await Promise.resolve();active--;
      return url.pathname==='/shop'&&calls.length===2?new Response('unavailable',{status:503}):success(url);
    });
    const result=await monitorDatabaseStability(fetcher,async()=>{});
    expect(maximum).toBe(1);expect(calls).toHaveLength(5);
    expect(calls[4]).toBe('/shop');expect(calls.some(path=>/\bt=|cache|nocache/.test(path))).toBe(false);
    expect(result.ok).toBe(true);expect(result.checks[1].status).toBe(503);
    expect(result.retries).toMatchObject([{path:'/shop',attempt:2,status:200}]);
  });
  it('confirms a repeated failed response without treating malformed empty success as healthy', async()=>{
    const fetcher=async (url:URL)=>url.pathname.startsWith('/api/')?new Response('{"products":[],"count":-1}'):success(url);
    const result=await monitorDatabaseStability(fetcher,async()=>{});
    expect(result.ok).toBe(false);expect(result.confirmed_failures).toHaveLength(2);
    expect(result.checks).toHaveLength(4);expect(result.retries).toHaveLength(2);
  });
  it('redacts upstream response bodies and exception text while retaining controlled DNS metadata', async()=>{
    const failure=Object.assign(new TypeError('credentials-and-customer-data'),{cause:{code:'ENOTFOUND'}});
    const result=await monitorDatabaseStability(async()=>{throw failure;},async()=>{});
    const json=JSON.stringify(result);
    expect(json).not.toContain('credentials-and-customer-data');expect(json).toContain('ENOTFOUND');
    expect(result.retries).toHaveLength(4);expect(result.ok).toBe(false);
    await expect(probeDatabasePath('https://unrelated.invalid')).rejects.toThrow('Unknown stability probe');
  });
});
