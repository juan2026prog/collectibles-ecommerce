import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Converts a Vercel source pattern to a RegExp following Vercel's path matching rules:
 * - Named wildcard parameters like :path* become (.*)
 * - Named single parameters like :slug become ([^/]+)
 * - Regex blocks inside parentheses like ((?!api|admin).*) are preserved
 */
function vercelSourceToRegExp(source: string): RegExp {
  let pattern = source;

  // Replace :name* with (.*)
  pattern = pattern.replace(/:[a-zA-Z0-9_]+\*/g, '(.*)');

  // Replace :name with ([^/]+)
  pattern = pattern.replace(/:[a-zA-Z0-9_]+/g, '([^/]+)');

  // Ensure pattern matches full path
  return new RegExp(`^${pattern}$`);
}

describe('Vercel Routing and Headers Precedence Verification', () => {
  const vercelConfigPath = fs.existsSync(path.resolve(process.cwd(), 'vercel.json'))
    ? path.resolve(process.cwd(), 'vercel.json')
    : path.resolve(process.cwd(), '..', 'vercel.json');
  const vercelConfig = JSON.parse(fs.readFileSync(vercelConfigPath, 'utf8'));

  function resolveHeadersForPath(requestPath: string): Record<string, string> {
    const finalHeaders: Record<string, string> = {};

    for (const rule of vercelConfig.headers || []) {
      const regex = vercelSourceToRegExp(rule.source);
      if (regex.test(requestPath)) {
        for (const header of rule.headers) {
          // In Vercel, matching rules execute in order, and subsequent rules overwrite previous keys
          finalHeaders[header.key.toLowerCase()] = header.value;
        }
      }
    }

    return finalHeaders;
  }

  function resolveRewriteForPath(requestPath: string): string | null {
    for (const rewrite of vercelConfig.rewrites || []) {
      if (rewrite.has) continue; // Skip conditional crawler rules for standard requests
      const regex = vercelSourceToRegExp(rewrite.source);
      if (regex.test(requestPath)) {
        return rewrite.destination;
      }
    }
    return null;
  }

  describe('Merchant Feed Routing & Headers', () => {
    it('rewrites /merchant-feed.xml directly to /api/merchant-feed before SPA catch-all', () => {
      const destination = resolveRewriteForPath('/merchant-feed.xml');
      expect(destination).toBe('/api/merchant-feed');
    });

    it('does NOT match the public HTML caching negative lookahead for /merchant-feed.xml', () => {
      const htmlCacheRule = vercelConfig.headers.find((h: any) =>
        h.source.includes('((?!api|admin')
      );
      expect(htmlCacheRule).toBeDefined();

      const regex = vercelSourceToRegExp(htmlCacheRule.source);
      // /merchant-feed.xml must NOT match the HTML cache rule
      expect(regex.test('/merchant-feed.xml')).toBe(false);
    });

    it('applies public CDN caching headers to /merchant-feed.xml', () => {
      const headers = resolveHeadersForPath('/merchant-feed.xml');
      expect(headers['cache-control']).toBe('public, max-age=1800, s-maxage=3600, stale-while-revalidate=14400');
      expect(headers['cdn-cache-control']).toBe('public, s-maxage=3600, stale-while-revalidate=14400');
      expect(headers['vercel-cdn-cache-control']).toBe('public, s-maxage=3600, stale-while-revalidate=14400');
    });

    it('ensures /api/merchant-feed overrides generic /api/:path* no-store rule', () => {
      const headers = resolveHeadersForPath('/api/merchant-feed');
      // Generic /api/:path* defines no-store, but /api/merchant-feed is defined AFTER it and must override
      expect(headers['cache-control']).toBe('public, max-age=1800, s-maxage=3600, stale-while-revalidate=14400');
      expect(headers['cdn-cache-control']).toBe('public, s-maxage=3600, stale-while-revalidate=14400');
      expect(headers['vercel-cdn-cache-control']).toBe('public, s-maxage=3600, stale-while-revalidate=14400');
    });
  });

  describe('Standard API and SPA Routing Precedence', () => {
    it('applies no-store to general API endpoints like /api/public-catalog', () => {
      const headers = resolveHeadersForPath('/api/public-catalog');
      expect(headers['cache-control']).toBe('no-store, no-cache, must-revalidate');
      expect(headers['cdn-cache-control']).toBe('no-store');
      expect(headers['vercel-cdn-cache-control']).toBe('no-store');
    });

    it('applies immutable caching to /assets/main.js', () => {
      const headers = resolveHeadersForPath('/assets/main.js');
      expect(headers['cache-control']).toBe('public, max-age=31536000, immutable');
    });

    it('applies SPA revalidation headers to public HTML pages like /producto/batman', () => {
      const headers = resolveHeadersForPath('/producto/batman');
      expect(headers['cache-control']).toBe('public, max-age=0, must-revalidate');
      expect(headers['cdn-cache-control']).toBe('public, s-maxage=3600, stale-while-revalidate=86400');
    });

    it('routes public page /producto/batman to /index.html in SPA catch-all rewrite', () => {
      const destination = resolveRewriteForPath('/producto/batman');
      expect(destination).toBe('/index.html');
    });

    it('routes /api/public-catalog to consolidated serverless endpoint /api/meta-catalog?__public_catalog=1, not /index.html', () => {
      const destination = resolveRewriteForPath('/api/public-catalog');
      expect(destination).toBe('/api/meta-catalog?__public_catalog=1');
      expect(destination).not.toBe('/index.html');
    });
  });
});
