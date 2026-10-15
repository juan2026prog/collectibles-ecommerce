import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ upload:vi.fn(), upsert:vi.fn(), load:vi.fn(), encode:vi.fn() }));
vi.mock('../lib/supabase', () => ({ supabase:{
  storage:{from:()=>({upload:mocks.upload,getPublicUrl:(path:string)=>({data:{publicUrl:'https://storage/'+path}})})},
  from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:null})})}),upsert:mocks.upsert})
} }));
vi.mock('../lib/imageUploadOptimizer', () => ({loadImage:mocks.load,canvasToBlob:mocks.encode}));
import { uploadPublicMedia } from '../lib/persistentMediaUpload';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.upload.mockResolvedValue({data:{path:'original.png'},error:null});
  mocks.upsert.mockResolvedValue({error:null});
  mocks.load.mockResolvedValue({naturalWidth:80,naturalHeight:60});
  mocks.encode.mockResolvedValue(new Blob(['small webp'],{type:'image/webp'}));
});
const file = (type='image/png') => ({type,size:1000,name:'original.png',arrayBuffer:async()=>new TextEncoder().encode('original bytes').buffer}) as File;
describe('Persistent public image uploads', () => {
  it('keeps a compact original when resized encodings would increase download bytes', async () => {
    vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({drawImage:vi.fn()} as any);
    mocks.load.mockResolvedValue({naturalWidth:1200,naturalHeight:900});
    mocks.encode.mockResolvedValue(new Blob(['x'.repeat(2000)],{type:'image/webp'}));
    await uploadPublicMedia('public-assets','compact.png',file());
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(mocks.upsert.mock.calls[0][0].variants).toEqual({});
    vi.restoreAllMocks();
  });
  it('keeps original bytes and creates one versioned derivative for a small source without upscaling', async () => {
    vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({drawImage:vi.fn()} as any);
    const original=file();
    const result=await uploadPublicMedia('public-assets','vendors/owner/original.png',original);
    expect(result.error).toBeNull();
    expect(mocks.upload.mock.calls[0][1]).toBe(original);
    expect(mocks.upload.mock.calls[0][2]).toMatchObject({upsert:false,cacheControl:'3600'});
    expect(mocks.encode).toHaveBeenCalledTimes(1);
    expect(mocks.upload.mock.calls[1][0]).toMatch(/^vendors\/owner\/_variants\/v1\/[a-f0-9]{64}\/80.webp$/);
    const record=mocks.upsert.mock.calls[0][0];
    for (const variant of Object.values(record.variants) as any[]) {
      expect(variant.width).toBe(80); expect(variant.height).toBe(60);
    }
    vi.restoreAllMocks();
  });
  it.each(['image/svg+xml','image/gif'])('preserves %s without rasterizing it', async type => {
    const original=file(type);
    await uploadPublicMedia('public-assets','original',original);
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(mocks.upload.mock.calls[0][1]).toBe(original);
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it('does not generate or publish derivatives when original upload fails', async () => {
    mocks.upload.mockResolvedValue({error:{message:'denied'}});
    expect((await uploadPublicMedia('public-assets','original',file())).error).toBeTruthy();
    expect(mocks.load).not.toHaveBeenCalled(); expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
