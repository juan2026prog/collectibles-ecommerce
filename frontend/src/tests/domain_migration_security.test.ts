import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  classifyHost,
  normalizeHostname,
  resolveCountryFromHostname,
} from '../lib/marketEngine/domainMarketResolver';
import {
  isBlockedLegacyHostname,
  isTrustedBrowserOrigin,
  getCorsHeaders,
  handleOptions,
  resolveTrustedReturnOrigin,
  getOfficialSiteUrl,
} from '../../../supabase/functions/_shared/cors';
import {
  STABLE_ADMIN_EMAIL,
  isUntrustedEmailAddress,
  sanitizeStoredRecipients,
  resolveSafeEmailSender,
  resolveSafeReplyTo,
} from '../../../supabase/functions/_shared/email-guard';
// @ts-ignore — JS serverless module
import { isPrivateOrReservedIp, isTargetUrlAllowed } from '../../../api/catalog-image.js';
import {
  isAllowedWorkerOrigin,
  buildCorsHeaders,
} from '../../../cloudflare/collectibles-catalog-api/src/index';
import { BASE_URL, generateCanonical } from '../seo/seoConfig';

const REPO_ROOT = path.resolve(__dirname, '../../..');

describe('Phase 2 Security & Domain Migration Regression Suite (collectibles.uy -> collectibles.com.uy)', () => {
  describe('1. Domain Market Resolver (AUD-003)', () => {
    it('classifies collectibles.com.uy and www.collectibles.com.uy as PRODUCTION_OFFICIAL with checkout enabled', () => {
      for (const host of ['collectibles.com.uy', 'www.collectibles.com.uy', 'https://collectibles.com.uy/checkout']) {
        const res = classifyHost(host);
        expect(res.classification).toBe('PRODUCTION_OFFICIAL');
        expect(res.isAuthorizedHost).toBe(true);
        expect(res.canCheckoutOnDomain).toBe(true);
        expect(res.countryCode).toBe('UY');
      }
    });

    it('classifies collectibles-ecommerce.vercel.app and project previews as PREVIEW_AUTHORIZED', () => {
      for (const host of [
        'collectibles-ecommerce.vercel.app',
        'collectibles-ecommerce-git-fix-domain-migration-juans.vercel.app',
      ]) {
        const res = classifyHost(host);
        expect(res.classification).toBe('PREVIEW_AUTHORIZED');
        expect(res.isAuthorizedHost).toBe(true);
        expect(res.canCheckoutOnDomain).toBe(true);
      }
    });

    it('strictly rejects untrusted legacy collectibles.uy, subdomains, lookalikes, and arbitrary vercel.app', () => {
      const hostileHosts = [
        'collectibles.uy',
        'www.collectibles.uy',
        'checkout.collectibles.uy',
        'https://collectibles.uy/checkout',
        'evil-collectibles.com.uy',
        'collectibles.com.uy.attacker.com',
        'arbitrary-other-project.vercel.app',
        'collectibles-ecommerce.evil.vercel.app',
      ];
      for (const host of hostileHosts) {
        const res = classifyHost(host);
        expect(res.classification).toBe('UNTRUSTED_UNKNOWN');
        expect(res.isAuthorizedHost).toBe(false);
        expect(res.canCheckoutOnDomain).toBe(false);
      }
    });

    it('normalizes hostnames safely and resolves country fallback to UY', () => {
      expect(normalizeHostname('https://WWW.COLLECTIBLES.COM.UY:443/shop')).toBe('www.collectibles.com.uy');
      expect(resolveCountryFromHostname('collectibles.com.uy')).toBe('UY');
    });
  });

  describe('2. Shared Edge Function CORS & Return Origin Guard (AUD-002, AUD-010, AUD-018)', () => {
    const prodEnv = { SUPABASE_URL: 'https://cobtsgkwcftvexaarwmo.supabase.co', ENVIRONMENT: 'production' };
    const stagingEnv = { SUPABASE_URL: 'https://csnudufkpfzveoonjumy.supabase.co', ENVIRONMENT: 'staging' };

    it('identifies collectibles.uy and all *.collectibles.uy subdomains as blocked legacy hostnames', () => {
      expect(isBlockedLegacyHostname('collectibles.uy')).toBe(true);
      expect(isBlockedLegacyHostname('www.collectibles.uy')).toBe(true);
      expect(isBlockedLegacyHostname('storage.collectibles.uy')).toBe(true);
      expect(isBlockedLegacyHostname('collectibles.com.uy')).toBe(false);
      expect(isBlockedLegacyHostname('www.collectibles.com.uy')).toBe(false);
    });

    it('authorizes official origins and rejects collectibles.uy, non-HTTPS, arbitrary vercel.app, and localhost in prod', () => {
      expect(getOfficialSiteUrl()).toBe('https://collectibles.com.uy');

      expect(isTrustedBrowserOrigin('https://collectibles.com.uy', prodEnv)).toBe(true);
      expect(isTrustedBrowserOrigin('https://www.collectibles.com.uy', prodEnv)).toBe(true);
      expect(isTrustedBrowserOrigin('https://collectibles-ecommerce.vercel.app', prodEnv)).toBe(true);
      expect(isTrustedBrowserOrigin('https://collectibles-ecommerce-pr-50.vercel.app', prodEnv)).toBe(true);

      expect(isTrustedBrowserOrigin('https://collectibles.uy', prodEnv)).toBe(false);
      expect(isTrustedBrowserOrigin('https://www.collectibles.uy', prodEnv)).toBe(false);
      expect(isTrustedBrowserOrigin('http://collectibles.com.uy', prodEnv)).toBe(false);
      expect(isTrustedBrowserOrigin('https://attacker.vercel.app', prodEnv)).toBe(false);
      expect(isTrustedBrowserOrigin('https://collectibles.com.uy.evil.com', prodEnv)).toBe(false);
      expect(isTrustedBrowserOrigin('http://localhost:5173', prodEnv)).toBe(false);

      expect(isTrustedBrowserOrigin('http://localhost:5173', stagingEnv)).toBe(true);
      expect(
        isTrustedBrowserOrigin('https://collectibles.uy', {
          ...stagingEnv,
          ALLOWED_ORIGINS: 'https://collectibles.uy,https://collectibles.com.uy',
        })
      ).toBe(false);
    });

    it('returns 403 without Access-Control-Allow-Origin on OPTIONS preflight from untrusted origins', () => {
      const hostileReq = new Request('https://cobtsgkwcftvexaarwmo.supabase.co/functions/v1/create-payment', {
        method: 'OPTIONS',
        headers: { Origin: 'https://collectibles.uy' },
      });
      const hostileRes = handleOptions(hostileReq, undefined, prodEnv);
      expect(hostileRes).not.toBeNull();
      expect(hostileRes!.status).toBe(403);
      expect(hostileRes!.headers.get('Access-Control-Allow-Origin')).toBeNull();

      const hostileCors = getCorsHeaders(hostileReq, undefined, prodEnv);
      expect(hostileCors['Access-Control-Allow-Origin']).toBeUndefined();

      const validReq = new Request('https://cobtsgkwcftvexaarwmo.supabase.co/functions/v1/create-payment', {
        method: 'OPTIONS',
        headers: { Origin: 'https://collectibles.com.uy' },
      });
      const validRes = handleOptions(validReq, undefined, prodEnv);
      expect(validRes).not.toBeNull();
      expect(validRes!.status).toBe(200);
      expect(validRes!.headers.get('Access-Control-Allow-Origin')).toBe('https://collectibles.com.uy');
    });

    it('prevents open redirects and untrusted payment return URLs via resolveTrustedReturnOrigin', () => {
      expect(resolveTrustedReturnOrigin('https://collectibles.uy/checkout', { envOverride: prodEnv })).toBe(
        'https://collectibles.com.uy'
      );
      expect(resolveTrustedReturnOrigin('https://evil.com', { envOverride: prodEnv })).toBe(
        'https://collectibles.com.uy'
      );
      expect(resolveTrustedReturnOrigin('https://www.collectibles.com.uy/checkout', { envOverride: prodEnv })).toBe(
        'https://www.collectibles.com.uy'
      );
      expect(resolveTrustedReturnOrigin('https://collectibles-ecommerce.vercel.app', { envOverride: prodEnv })).toBe(
        'https://collectibles-ecommerce.vercel.app'
      );
    });
  });

  describe('3. Sensitive Email & Notification Containment Guard (AUD-001, AUD-006..AUD-009)', () => {
    it('blocks all @collectibles.uy, *.collectibles.uy, @collectibles.com, and @tudominio.com recipients', () => {
      expect(isUntrustedEmailAddress('admin@collectibles.uy')).toBe(true);
      expect(isUntrustedEmailAddress('pagos@finanzas.collectibles.uy')).toBe(true);
      expect(isUntrustedEmailAddress('notificaciones@collectibles.com')).toBe(true);
      expect(isUntrustedEmailAddress('noreply@tudominio.com')).toBe(true);
      expect(isUntrustedEmailAddress('cliente@example.invalid')).toBe(true);

      expect(isUntrustedEmailAddress('collectiblesuy@gmail.com')).toBe(false);
      expect(isUntrustedEmailAddress('info@collectibles.com.uy')).toBe(false);
    });

    it('strips untrusted stored recipients and routes admin fallback to collectiblesuy@gmail.com', () => {
      const sanitized = sanitizeStoredRecipients(
        [
          { name: 'Admin Old', email: 'admin@collectibles.uy', active: true },
          { name: 'Depósito Old', email: 'deposito@collectibles.uy', active: true },
          { name: 'Admin Oficial', email: 'collectiblesuy@gmail.com', active: true },
        ],
        { ensureAdminFallback: true }
      );
      expect(sanitized.map((r) => r.email)).toEqual(['collectiblesuy@gmail.com']);

      const fallbackOnly = sanitizeStoredRecipients(
        [{ name: 'Admin Old', email: 'admin@collectibles.uy', active: true }],
        { ensureAdminFallback: true }
      );
      expect(fallbackOnly.map((r) => r.email)).toEqual([STABLE_ADMIN_EMAIL]);
    });

    it('halts safely without simulating delivery when RESEND_FROM is missing or uses blocked domain', () => {
      const missingRes = resolveSafeEmailSender('');
      expect(missingRes.allowed).toBe(false);
      expect(missingRes.from).toBeNull();

      const legacyRes = resolveSafeEmailSender('Collectibles <notificaciones@collectibles.uy>');
      expect(legacyRes.allowed).toBe(false);

      const unownedComRes = resolveSafeEmailSender('Collectibles <notificaciones@collectibles.com>');
      expect(unownedComRes.allowed).toBe(false);

      const verifiedRes = resolveSafeEmailSender('Collectibles <onboarding@resend.dev>');
      expect(verifiedRes.allowed).toBe(true);
      expect(verifiedRes.replyTo).toBe('info@collectibles.com.uy');

      expect(resolveSafeReplyTo('soporte@collectibles.uy')).toBe('info@collectibles.com.uy');
    });
  });

  describe('4. SSRF & Domain Guard on Catalog Image Proxy (AUD-004, AUD-005)', () => {
    it('blocks private, loopback, link-local metadata, multicast, and IPv4-mapped IPv6 addresses', () => {
      const blockedIps = [
        '127.0.0.1',
        '10.0.0.5',
        '172.16.0.1',
        '172.31.255.255',
        '192.168.1.10',
        '169.254.169.254',
        '0.0.0.0',
        '100.64.0.1',
        '::1',
        '::',
        'fc00::1',
        'fd12:3456::1',
        'fe80::1',
        '::ffff:127.0.0.1',
        '::ffff:169.254.169.254',
      ];
      for (const ip of blockedIps) {
        expect(isPrivateOrReservedIp(ip)).toBe(true);
      }
      expect(isPrivateOrReservedIp('104.18.10.25')).toBe(false);
    });

    it('rejects HTTP, collectibles.uy, raw IPs, credentials, proxy loops, and non-public Supabase paths', () => {
      const rejectedUrls = [
        'http://cobtsgkwcftvexaarwmo.supabase.co/storage/v1/object/public/product-images/a.jpg',
        'https://collectibles.uy/images/logo.png',
        'https://cdn.collectibles.uy/images/logo.png',
        'https://169.254.169.254/latest/meta-data/',
        'https://user:secret@http2.mlstatic.com/D_NQ_NP_1.webp',
        'https://cobtsgkwcftvexaarwmo.supabase.co/rest/v1/orders',
        'https://cobtsgkwcftvexaarwmo.supabase.co/storage/v1/object/authenticated/private/doc.pdf',
        'https://collectibles.com.uy/catalog-images/product-images/loop.jpg',
        'https://collectibles.com.uy/api/public-catalog',
        'https://evil.example.com/malicious.svg',
      ];
      for (const raw of rejectedUrls) {
        expect(isTargetUrlAllowed(new URL(raw))).toBe(false);
      }

      const allowedUrls = [
        'https://cobtsgkwcftvexaarwmo.supabase.co/storage/v1/object/public/product-images/item.webp',
        'https://http2.mlstatic.com/D_NQ_NP_12345.webp',
        'https://m.media-amazon.com/images/I/71example.jpg',
        'https://collectibles.com.uy/images/logo.png',
      ];
      for (const raw of allowedUrls) {
        expect(isTargetUrlAllowed(new URL(raw))).toBe(true);
      }
    });
  });

  describe('5. Cloudflare Worker CORS & Feed Hardening (AUD-055, AUD-056)', () => {
    const workerProdEnv: any = {
      ENVIRONMENT: 'production',
      CATALOG_RUNTIME_ENABLED: 'false',
      ALLOWED_ORIGINS: 'https://collectibles.com.uy,https://www.collectibles.com.uy,https://collectibles-ecommerce.vercel.app',
    };

    it('authorizes official origins and rejects collectibles.uy, arbitrary vercel.app, and localhost in prod', () => {
      expect(isAllowedWorkerOrigin('https://collectibles.com.uy', workerProdEnv)).toBe(true);
      expect(isAllowedWorkerOrigin('https://www.collectibles.com.uy', workerProdEnv)).toBe(true);
      expect(isAllowedWorkerOrigin('https://collectibles-ecommerce.vercel.app', workerProdEnv)).toBe(true);
      expect(isAllowedWorkerOrigin('https://collectibles-ecommerce-git-fix-juans.vercel.app', workerProdEnv)).toBe(true);

      expect(isAllowedWorkerOrigin('https://collectibles.uy', workerProdEnv)).toBe(false);
      expect(isAllowedWorkerOrigin('https://www.collectibles.uy', workerProdEnv)).toBe(false);
      expect(isAllowedWorkerOrigin('https://random-tenant.vercel.app', workerProdEnv)).toBe(false);
      expect(isAllowedWorkerOrigin('http://localhost:5173', workerProdEnv)).toBe(false);

      const badReq = new Request('https://collectibles-catalog-api.workers.dev/api/v1/health', {
        headers: { Origin: 'https://collectibles.uy' },
      });
      const headers = buildCorsHeaders(badReq, workerProdEnv);
      expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
    });
  });

  describe('6. SEO, Sitemap, Robots & Social Profile Preservation (AUD-035..AUD-048) & Webhook HMAC (AUD-020)', () => {
    it('emits collectibles.com.uy canonicals while preserving instagram/facebook collectibles.uy handles', () => {
      expect(BASE_URL).toBe('https://collectibles.com.uy');
      expect(generateCanonical('home')).toBe('https://collectibles.com.uy');
      expect(generateCanonical('producto', 'funko-batman')).toBe('https://collectibles.com.uy/producto/funko-batman');

      const prerenderSrc = fs.readFileSync(path.join(REPO_ROOT, 'api/seo-prerender.js'), 'utf8');
      expect(prerenderSrc).toContain("const BASE_URL = 'https://collectibles.com.uy';");
      expect(prerenderSrc).toContain('https://instagram.com/collectibles.uy');
      expect(prerenderSrc).toContain('https://facebook.com/collectibles.uy');

      const robotsTxt = fs.readFileSync(path.join(REPO_ROOT, 'frontend/public/robots.txt'), 'utf8');
      expect(robotsTxt).toContain('Sitemap: https://collectibles.com.uy/sitemap.xml');
      expect(robotsTxt).not.toContain('https://collectibles.uy');

      const indexHtml = fs.readFileSync(path.join(REPO_ROOT, 'frontend/index.html'), 'utf8');
      expect(indexHtml).toContain('content="https://collectibles.com.uy"');
      expect(indexHtml).toContain('https://instagram.com/collectibles.uy');
      expect(indexHtml).toContain('https://facebook.com/collectibles.uy');
      expect(indexHtml).not.toContain('https://collectibles.uy');
    });

    it('enforces mandatory constant-time HMAC signature verification in dlocalgo-webhook and mercadopago-webhook', () => {
      const dlocalWebhookSrc = fs.readFileSync(
        path.join(REPO_ROOT, 'supabase/functions/dlocalgo-webhook/index.ts'),
        'utf8'
      );
      expect(dlocalWebhookSrc).toContain('timingSafeEqual');
      expect(dlocalWebhookSrc).not.toContain('envMode === "production" && !secretKey');

      const mpWebhookSrc = fs.readFileSync(
        path.join(REPO_ROOT, 'supabase/functions/mercadopago-webhook/index.ts'),
        'utf8'
      );
      expect(mpWebhookSrc).toContain('HMAC');
    });
  });
});
