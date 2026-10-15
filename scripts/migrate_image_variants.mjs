/** Bounded/resumable migration. Default is a read-only plan; --apply explicitly writes derivatives. */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { isPublicMediaSource } from '../shared/public-media-sources.js';

config({ path: '.env', quiet: true });
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const limit = Number(option('--limit', '8'));
if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('Use --limit 1..50');
const apply = args.includes('--apply');
const url = process.env.SUPABASE_URL;
if (url !== 'https://cobtsgkwcftvexaarwmo.supabase.co') throw new Error('Unexpected target project');
const client = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const cache = 'frontend/node_modules/.cache/media-variants';
const journal = 'docs/audits/monitoring/image-variants-migration.jsonl';
await mkdir(cache, { recursive: true });
await mkdir(path.dirname(journal), { recursive: true });
const python = option('--python', process.env.IMAGE_VARIANTS_PYTHON || 'python');
const run = promisify(execFile);
let manifest;
if (args.includes('--manifest')) manifest = JSON.parse(await readFile(option('--manifest'), 'utf8'));
else {
  const response = await fetch('https://collectibles.uy/api/public-catalog?limit=15', { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('Catalog plan unavailable');
  const catalog = await response.json();
  const urls = new Set();
  for (const product of catalog.products) {
    const images = [...(product.images || [])].sort((a,b) => Number(Boolean(b.is_primary))-Number(Boolean(a.is_primary))
      || (a.sort_order ?? 2147483647)-(b.sort_order ?? 2147483647) || String(a.id || a.url).localeCompare(String(b.id || b.url)));
    const primary = images.find(image => image.url?.startsWith(url + '/storage/'));
    if (primary) urls.add(primary.url);
  }
  for (const product of catalog.products) {
    for (const image of product.images || []) if (image.url?.startsWith(url + '/storage/')) urls.add(image.url);
    for (const item of product.product_group_items || []) if (item.group?.badge_image_url?.startsWith(url + '/storage/')) urls.add(item.group.badge_image_url);
  }
  manifest = [...urls];
  await writeFile(`${cache}/catalog-plan.json`, JSON.stringify(manifest, null, 2));
}
let processed = 0;
for (const original_url of [...new Set(manifest)]) {
  if (!isPublicMediaSource(original_url)) continue;
  const parsed = new URL(original_url);
  const match = parsed.pathname.match(/^\/storage\/v1\/object\/public\/(public-assets|product-images)\/(.+)$/);
  if (parsed.origin !== url || !match || parsed.search || /\.(svg|gif)$/i.test(parsed.pathname)) continue;
  const [, bucket_id, object_path] = match;
  const { data: existing, error: lookupError } = await client.from('media_image_variants').select('content_hash').eq('original_url', original_url).maybeSingle();
  if (lookupError) throw new Error(`Registry unavailable: ${lookupError.code}`);
  if (existing && !args.includes('--recheck')) continue;
  if (processed++ >= limit) break;
  if (!apply) { console.log(JSON.stringify({ original_url, state: 'planned' })); continue; }
  const entry = { at: new Date().toISOString(), original_url };
  try {
    const response = await fetch(original_url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`source_http_${response.status}`);
    const source = Buffer.from(await response.arrayBuffer());
    if (source.length > 20 * 1024 * 1024) throw new Error('source_exceeds_20mb');
    const content_hash = createHash('sha256').update(source).digest('hex');
    const dir = `${cache}/${content_hash}`;
    await mkdir(dir, { recursive: true });
    const sourcePath = `${dir}/original`;
    await writeFile(sourcePath, source);
    const { stdout } = await run(python, ['scripts/generate_image_variants.py', sourcePath, dir], { windowsHide: true, maxBuffer: 1024 * 1024 });
    const generated = JSON.parse(stdout);
    if (generated.skipped) { Object.assign(entry, { state: 'skipped', reason: generated.skipped }); }
    else {
      const folder = object_path.includes('/') ? object_path.slice(0, object_path.lastIndexOf('/') + 1) : 'media/';
      const variants = {};
      const uploaded = new Set();
      for (const [name, variant] of Object.entries(generated.variants)) {
        const target = `${folder}_variants/v1/${content_hash}/${variant.width}.webp`;
        if (!uploaded.has(target)) {
          const bytes = await readFile(variant.file);
          const { error } = await client.storage.from(bucket_id).upload(target, bytes,
            { contentType: 'image/webp', cacheControl: '31536000', upsert: false });
          if (error && !/already exists|duplicate/i.test(error.message)) throw new Error(`upload_${error.statusCode || 'failed'}`);
          const check = await fetch(client.storage.from(bucket_id).getPublicUrl(target).data.publicUrl, { signal: AbortSignal.timeout(15000) });
          if (!check.ok || check.headers.get('content-type') !== 'image/webp'
            || !/max-age=31536000/.test(check.headers.get('cache-control') || '')) throw new Error('variant_http_verification_failed');
          const published = Buffer.from(await check.arrayBuffer());
          if (!published.equals(bytes)) throw new Error('published_variant_differs');
          uploaded.add(target);
        }
        variants[name] = { url: client.storage.from(bucket_id).getPublicUrl(target).data.publicUrl,
          width: variant.width, height: variant.height, bytes: variant.bytes };
      }
      const record = { original_url, bucket_id, object_path, content_hash, width: generated.width,
        height: generated.height, original_bytes: source.length, variants };
      const { error } = await client.from('media_image_variants').upsert(record, { onConflict: 'original_url' });
      if (error) throw new Error(`registry_${error.code}`);
      Object.assign(entry, { state: 'ready', ...record, alpha: generated.alpha,
        card_savings_percent: variants.card ? Math.round((1 - variants.card.bytes / source.length) * 10000) / 100 : 0 });
    }
  } catch (error) { Object.assign(entry, { state: 'error', error: String(error.message).slice(0, 150) }); }
  await appendFile(journal, JSON.stringify(entry) + '\n');
  console.log(JSON.stringify(entry));
  if (entry.state === 'error') process.exitCode = 1;
}
