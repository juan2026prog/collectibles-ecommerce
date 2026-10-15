// @vitest-environment node
import {describe,it,expect} from 'vitest';
import {parseResourceMetrics,resourceDeltas,sampleDatabaseResources} from '../../../scripts/sample_database_resources.mjs';

describe('Sanitized official resource metrics',()=>{
  it('retains only numeric approved metrics and controlled mode/device labels',()=>{
    const metrics=parseResourceMetrics('node_memory_MemAvailable_bytes{instance="private-host",user="customer"} 123\nnode_disk_reads_completed_total{device="nvme1n1",query="secret-sql"} 15\nnot_allowed{key="secret"} 200\nnode_cpu_seconds_total{cpu="0",mode="idle"} 30\n');
    expect(metrics).toHaveLength(3);expect(JSON.stringify(metrics)).not.toMatch(/private-host|customer|secret/);
    expect(metrics[1]).toMatchObject({device:'nvme1n1',value:15});
  });
  it('derives CPU, IOPS and swap rates only from observed counter differences',()=>{
    const make=(at:string,idle:number,user:number,reads:number)=>({checked_at:at,metrics:[{name:'node_cpu_seconds_total',mode:'idle',value:idle},{name:'node_cpu_seconds_total',mode:'user',value:user},{name:'node_cpu_seconds_total',mode:'iowait',value:0},{name:'node_disk_reads_completed_total',device:'disk',value:reads},{name:'node_disk_read_time_seconds_total',device:'disk',value:reads/1000}]});
    const result=resourceDeltas(make('2026-10-15T00:00:00Z',100,10,10),make('2026-10-15T00:01:00Z',148,22,130));
    expect(result.cpu.busy_percent).toBe(20);expect(result.disks[0].read_iops).toBe(2);expect(result.disks[0].average_read_ms).toBeCloseTo(1);
    expect(result.swap_in_pages_per_second).toBeNull();
  });
  it('does not print unauthorized metric response bodies or transport error text',async()=>{
    const denied=await sampleDatabaseResources('test-key',async()=>new Response('sensitive response',{status:401}));
    expect(denied.available).toBe(false);expect(JSON.stringify(denied)).not.toContain('sensitive');
    const failed=await sampleDatabaseResources('test-key',async()=>{throw Error('secret-header');});
    expect(JSON.stringify(failed)).not.toContain('secret-header');
    expect(resourceDeltas({checked_at:'2026-10-15T00:00:00Z',metrics:[]},{checked_at:'2026-10-15T00:00:00Z',metrics:[]}).available).toBe(false);
  });
  it('does not treat a newly appearing device or reset counter as a measured rate',()=>{
    const before={checked_at:'2026-10-15T00:00:00Z',metrics:[{name:'node_disk_reads_completed_total',device:'old',value:100}]};
    const after={checked_at:'2026-10-15T00:01:00Z',metrics:[{name:'node_disk_reads_completed_total',device:'old',value:1},{name:'node_disk_reads_completed_total',device:'new',value:200}]};
    expect(resourceDeltas(before,after).disks.map(d=>d.read_iops)).toEqual([null,null]);
  });
});
