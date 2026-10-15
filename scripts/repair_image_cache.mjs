/** Repair only the reviewed malformed headers through Storage API, preserving URLs and bytes. */
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { readFile, appendFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
config({ path: '.env', quiet: true });
const args = process.argv.slice(2);
const limit = Number(args.includes('--limit') ? args[args.indexOf('--limit') + 1] : 1);
if (!Number.isInteger(limit) || limit < 1 || limit > 44) throw new Error('Use --limit 1..44');
const project = 'https://cobtsgkwcftvexaarwmo.supabase.co';
if (process.env.SUPABASE_URL !== project) throw new Error('Unexpected project');
const client = createClient(project, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const manifest = JSON.parse(await readFile('docs/audits/image-cache-repair-plan.json', 'utf8'));
const journal = 'docs/audits/monitoring/image-cache-repair.jsonl';
const completed = new Set();
try { for (const line of (await readFile(journal, 'utf8')).trim().split('\n')) {
  const entry = JSON.parse(line); if (entry.state === 'verified') completed.add(entry.path);
} } catch { /* First bounded batch. */ }
let count = 0;
for (const item of manifest) {
  if (completed.has(item.path)) continue;
  if (count++ >= limit) break;
  const url = client.storage.from(item.bucket).getPublicUrl(item.path).data.publicUrl;
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`source_http_${response.status}`);
  const body = Buffer.from(await response.arrayBuffer());
  const before = { cache_control: response.headers.get('cache-control'), type: response.headers.get('content-type'), etag: response.headers.get('etag') };
  if (body.length !== Number(item.bytes) || before.type !== item.type) throw new Error('Source differs from reviewed plan');
  if (!args.includes('--apply') && !args.includes('--verify-only')) { console.log(JSON.stringify({ path: item.path, before, state: 'planned' })); continue; }
  if (args.includes('--apply') && !/max-age=3600/.test(before.cache_control || '')) {
    const { error } = await client.storage.from(item.bucket).update(item.path, body,
      { cacheControl: '3600', contentType: item.type, upsert: false });
    if (error) throw new Error(`storage_update_${error.statusCode || 'failed'}`);
  }
  const check = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { 'Cache-Control': 'no-cache' } });
  const bytes = Buffer.from(await check.arrayBuffer());
  const after = { cache_control: check.headers.get('cache-control'), type: check.headers.get('content-type'), etag: check.headers.get('etag') };
  const equal = check.ok && bytes.equals(body) && before.type === after.type && before.etag === after.etag;
  const entry = { at: new Date().toISOString(), path: item.path, url, before, after,
    bytes: body.length, sha256: createHash('sha256').update(body).digest('hex'),
    state: equal && /max-age=3600/.test(after.cache_control || '') ? 'verified' : equal ? 'cdn_header_pending' : 'verification_failed' };
  await appendFile(journal, JSON.stringify(entry) + '\n');
  console.log(JSON.stringify(entry));
  if (!equal) throw new Error('Original verification failed; batch stopped');
}
