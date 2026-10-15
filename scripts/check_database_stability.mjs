// Read-only, sequential probes. No cache busting, provider calls or credentials.
import { pathToFileURL } from 'node:url';

const ORIGIN = 'https://collectibles.uy';
const PATHS = ['/', '/shop', '/api/public-catalog?limit=15&availability=all', '/api/public-catalog?limit=15&availability=all&search=pokemon'];

export async function checkDatabaseStability(fetcher = fetch) {
  const checks = [];
  for (const path of PATHS) {
    const started = performance.now();
    try {
      const response = await fetcher(new URL(path, ORIGIN), { signal: AbortSignal.timeout(15_000) });
      const body = await response.text();
      const api = path.startsWith('/api/');
      const data = api && response.ok ? JSON.parse(body) : null;
      const valid = response.status === 200 && (api
        ? Array.isArray(data?.products) && data.products.length <= 15 && Number.isInteger(data.count) && data.count >= data.products.length && (path.includes('search=') || data.count > 0)
        : /Collectibles/i.test(body) && /<html/i.test(body));
      const elapsed_ms = Math.round(performance.now() - started);
      checks.push({ path, status: response.status, ok: valid, elapsed_ms,
        slow: elapsed_ms > 4000, cache: response.headers.get('x-vercel-cache'),
        ...(api && data ? { count: data.count, page_size: data.products?.length,
          origin_snapshot: response.headers.get('x-catalog-snapshot'),
          origin_snapshot_age_seconds: response.headers.has('x-catalog-snapshot-age') ? Number(response.headers.get('x-catalog-snapshot-age')) : null,
          cdn_age_seconds: response.headers.has('age') ? Number(response.headers.get('age')) : null } : {}) });
    } catch (error) {
      // Print no response bodies, credentials or raw upstream errors.
      checks.push({ path, ok: false, elapsed_ms: Math.round(performance.now() - started),
        error: error?.name === 'TimeoutError' ? 'TIMEOUT' : 'INVALID_OR_UNAVAILABLE_RESPONSE' });
    }
  }
  return { checked_at: new Date().toISOString(), ok: checks.every(check => check.ok), checks };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await checkDatabaseStability();
  console.log(JSON.stringify(result));
  process.exitCode = result.ok ? 0 : 1;
}
