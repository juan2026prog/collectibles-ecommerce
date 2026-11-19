import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  SNAPSHOT_ENVELOPE_VERSION,
  computeSnapshotChecksum,
  isValidRawCatalogSnapshot,
  serializeVerifiedSnapshot,
  parseVerifiedSnapshot,
} from '../../../api/_lib/public-catalog.js';
import {
  parsePayPalWebhookEvent,
  evaluatePayPalWebhookTransition,
} from '../../../supabase/functions/_shared/paypal-webhook-core';
import { PublicCatalogProvider } from '../lib/providers/PublicCatalogProvider';

const REPO_ROOT = path.resolve(__dirname, '../../..');

function makeValidRawSnapshot() {
  return {
    internationalEnabled: true,
    local: [{ id: 'loc-1', title: 'Spider-Man Figure', status: 'published', is_active: true, price: 2500 }],
    international: [{ id: 'intl-1', title: 'Batman Statue', status: 'published', is_active: true, final_price_usd: 120 }],
    categories: [{ id: 'cat-1', name: 'Figuras', slug: 'figuras', parent_id: null }],
    brands: [{ id: 'br-1', name: 'Hasbro', slug: 'hasbro' }],
    licenses: [{ id: 'lic-1', name: 'Marvel', slug: 'marvel' }],
    themes: [{ id: 'th-1', name: 'Superheroes', slug: 'superheroes' }],
    licenseThemes: [{ license_id: 'lic-1', theme_id: 'th-1' }],
    groups: [{ id: 'grp-1', name: 'Novedades', slug: 'novedades' }],
  };
}

describe('P2.1 — Resilient Public Catalog (12 Scenarios)', () => {
  it('1. serializes and parses a valid verified snapshot with SHA-256 checksum', () => {
    const raw = makeValidRawSnapshot();
    const now = 1_700_000_000_000;
    const serialized = serializeVerifiedSnapshot(raw, now - 5_000);
    const parsed = parseVerifiedSnapshot(serialized, now, 60_000);
    expect(parsed).not.toBeNull();
    expect(parsed?.checksum).toBe(computeSnapshotChecksum(raw));
    expect(parsed?.raw.local).toHaveLength(1);
  });

  it('2. rejects an expired snapshot (age >= maxAgeMs)', () => {
    const raw = makeValidRawSnapshot();
    const now = 1_700_000_000_000;
    const serialized = serializeVerifiedSnapshot(raw, now - 61_000);
    expect(parseVerifiedSnapshot(serialized, now, 60_000)).toBeNull();
  });

  it('3. rejects a clock-skew future snapshot (age < 0)', () => {
    const raw = makeValidRawSnapshot();
    const now = 1_700_000_000_000;
    const serialized = serializeVerifiedSnapshot(raw, now + 10_000);
    expect(parseVerifiedSnapshot(serialized, now, 60_000)).toBeNull();
  });

  it('4. rejects a tampered snapshot whose checksum does not match', () => {
    const raw = makeValidRawSnapshot();
    const now = 1_700_000_000_000;
    const envelope = JSON.parse(serializeVerifiedSnapshot(raw, now - 1_000));
    envelope.raw.local[0].price = 1; // tampered price
    expect(parseVerifiedSnapshot(JSON.stringify(envelope), now, 60_000)).toBeNull();
  });

  it('5. rejects a snapshot with an incompatible envelope version', () => {
    const raw = makeValidRawSnapshot();
    const now = 1_700_000_000_000;
    const envelope = JSON.parse(serializeVerifiedSnapshot(raw, now - 1_000));
    envelope.version = SNAPSHOT_ENVELOPE_VERSION - 1;
    expect(parseVerifiedSnapshot(JSON.stringify(envelope), now, 60_000)).toBeNull();
  });

  it('6. rejects corrupt/non-JSON snapshot payloads', () => {
    expect(() => parseVerifiedSnapshot('{corrupt-json', Date.now(), 60_000)).toThrow();
  });

  it('7. rejects raw snapshots missing required arrays', () => {
    expect(isValidRawCatalogSnapshot(null)).toBe(false);
    expect(isValidRawCatalogSnapshot({ local: [] })).toBe(false);
    expect(isValidRawCatalogSnapshot(makeValidRawSnapshot())).toBe(true);
  });

  it('8. degraded international card formatter uses canonical USD without multiplying by exchangeRate', () => {
    const handlerPath = path.join(REPO_ROOT, 'api/_lib/public-catalog-handler.js');
    const source = fs.readFileSync(handlerPath, 'utf8');
    expect(source).toContain("p.origin === 'international' ? (p.final_price_usd || 0) : (p.base_price || 0)");
    expect(source).not.toContain('final_price_usd * filters.exchangeRate');
  });

  it('9. atomic disk write in public-catalog.js writes to temp file before rename', () => {
    const libPath = path.join(REPO_ROOT, 'api/_lib/public-catalog.js');
    const source = fs.readFileSync(libPath, 'utf8');
    expect(source).toContain('fs.promises.writeFile(tmpPath');
    expect(source).toContain('fs.promises.rename(tmpPath, DISK_SNAPSHOT_PATH)');
  });

  describe('PublicCatalogProvider browser resilience & failover', () => {
    const storageMap = new Map<string, string>();
    const mockLocalStorage = {
      getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
      setItem: (k: string, v: string) => { storageMap.set(k, String(v)); },
      removeItem: (k: string) => { storageMap.delete(k); },
      clear: () => { storageMap.clear(); },
      key: (i: number) => Array.from(storageMap.keys())[i] ?? null,
      get length() { return storageMap.size; },
    };

    beforeEach(() => {
      storageMap.clear();
      vi.stubGlobal('localStorage', mockLocalStorage);
      PublicCatalogProvider.setRuntimeKillSwitch(false);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    it('10. rejects malformed/error payloads ({ ok: false }) and falls back to valid localStorage snapshot', async () => {
      const validPayload = {
        ok: true,
        count: 1,
        totalCount: 1,
        products: [{ id: 'p-1', title: 'Funko Goku', price: 990 }],
        pagination: { total: 1, page: 1, limit: 15, total_pages: 1, has_more: false },
      };

      const uniqueFilter = { availability: 'local', limit: 15, offset: 0, search: 'goku_fallback_test' };
      const okFetcher = vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify(validPayload), { status: 200, headers: { 'Content-Type': 'application/json' } })
      );
      const first = await PublicCatalogProvider.getProducts(uniqueFilter, okFetcher as any);
      expect(first.data.products).toHaveLength(1);
      expect(first.staleFallback).toBe(false);

      // Next call with a different key seeded only in localStorage, while network returns ok:false
      const secondFilter = { availability: 'local', limit: 15, offset: 0, search: 'batman_malformed_test' };
      const seededKeys = Array.from(storageMap.keys()).filter(k => k.startsWith('collectibles_d1_snap_v1:'));
      expect(seededKeys.length).toBeGreaterThanOrEqual(1);
      const savedEntry = JSON.parse(storageMap.get(seededKeys[0])!);
      savedEntry.expiresAt = Date.now() - 1_000;
      const badKey = seededKeys[0].replace('goku_fallback_test', 'batman_malformed_test');
      storageMap.set(badKey, JSON.stringify(savedEntry));

      const malformedFetcher = vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: false, error: 'UPSTREAM_DEGRADED' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      );
      const fallback = await PublicCatalogProvider.getProducts(secondFilter, malformedFetcher as any);
      expect(fallback.staleFallback).toBe(true);
      expect(fallback.data.products).toHaveLength(1);
    });

    it('11. prunes corrupt and excess persistent localStorage snapshots (bounded cache)', async () => {
      for (let i = 0; i < 35; i++) {
        storageMap.set(`collectibles_d1_snap_v1:/api/v1/products?p=${i}`, JSON.stringify({
          schemaVersion: 2,
          expiresAt: Date.now() + 60_000,
          staleUntil: Date.now() + 3600_000,
          savedAt: Date.now() - i * 1000,
          data: { ok: true, products: [] },
        }));
      }
      storageMap.set('collectibles_d1_snap_v1:corrupt', '{not-json');

      const okFetcher = vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, count: 0, totalCount: 0, products: [], pagination: { total: 0, page: 1, limit: 15, total_pages: 0, has_more: false } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      await PublicCatalogProvider.getProducts({ availability: 'local', limit: 15, offset: 0, search: 'prune_trigger' }, okFetcher as any);
      const remaining = Array.from(storageMap.keys()).filter(k => k.startsWith('collectibles_d1_snap_v1:'));
      expect(remaining.length).toBeLessThanOrEqual(30);
      expect(storageMap.has('collectibles_d1_snap_v1:corrupt')).toBe(false);
    });

    it('12. publicCatalog.ts fails over from Worker failure to /api/public-catalog and preserves stale_fallback', () => {
      const clientPath = path.join(REPO_ROOT, 'frontend/src/lib/publicCatalog.ts');
      const source = fs.readFileSync(clientPath, 'utf8');
      expect(source).toContain('failing over to /api/public-catalog');
      expect(source).toContain('/api/public-catalog');
      expect(source).toContain('stale_fallback');
    });
  });
});

describe('P2.2 — Asynchronous PayPal Webhook State Machine (14 Scenarios)', () => {
  const baseOrder = {
    id: 'ord-uy-001',
    status: 'pending_payment',
    payment_status: 'pending',
    payment_processed_at: null,
    total_amount: 4200,
    currency: 'UYU',
    payment_total: 100.0,
    payment_currency: 'USD',
    payment_id: 'PP-ORDER-123',
  };

  function makeEvent(overrides: Record<string, any> = {}) {
    return parsePayPalWebhookEvent({
      id: 'WH-EVT-001',
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      create_time: '2026-11-19T03:00:00Z',
      resource_type: 'capture',
      resource: {
        id: 'CAP-999',
        custom_id: 'ord-uy-001',
        amount: { value: '100.00', currency_code: 'USD' },
        payee: { merchant_id: 'MERCHANT_COLLECTIBLES' },
        supplementary_data: { related_ids: { order_id: 'PP-ORDER-123' } },
      },
      ...overrides,
    });
  }

  it('1. PAYMENT.CAPTURE.COMPLETED on pending order -> VERIFY_CAPTURE_AND_FINALIZE', () => {
    const decision = evaluatePayPalWebhookTransition({
      event: makeEvent(),
      order: baseOrder,
      expectedMerchantId: 'MERCHANT_COLLECTIBLES',
    });
    expect(decision.action).toBe('VERIFY_CAPTURE_AND_FINALIZE');
    expect(decision.shouldDeadLetter).toBe(false);
    expect(decision.httpStatus).toBe(200);
  });

  it('2. CHECKOUT.ORDER.APPROVED (tab closed by buyer) -> CAPTURE_AND_FINALIZE', () => {
    const event = parsePayPalWebhookEvent({
      id: 'WH-EVT-002',
      event_type: 'CHECKOUT.ORDER.APPROVED',
      resource: {
        id: 'PP-ORDER-123',
        purchase_units: [
          {
            reference_id: 'ord-uy-001',
            amount: { value: '100.00', currency_code: 'USD' },
            payee: { merchant_id: 'MERCHANT_COLLECTIBLES' },
          },
        ],
      },
    });
    const decision = evaluatePayPalWebhookTransition({
      event,
      order: baseOrder,
      expectedMerchantId: 'MERCHANT_COLLECTIBLES',
    });
    expect(decision.action).toBe('CAPTURE_AND_FINALIZE');
    expect(decision.shouldDeadLetter).toBe(false);
  });

  it('3. Duplicate webhook on already finalized order -> IGNORE_ALREADY_FINALIZED (idempotent)', () => {
    const decision = evaluatePayPalWebhookTransition({
      event: makeEvent(),
      order: { ...baseOrder, status: 'paid', payment_processed_at: '2026-11-19T02:59:00Z' },
      expectedMerchantId: 'MERCHANT_COLLECTIBLES',
    });
    expect(decision.action).toBe('IGNORE_ALREADY_FINALIZED');
    expect(decision.shouldDeadLetter).toBe(false);
  });

  it('4. Delayed approval on expired/cancelled order -> MANUAL_VERIFICATION_REQUIRED + dead-letter', () => {
    const decision = evaluatePayPalWebhookTransition({
      event: makeEvent(),
      order: { ...baseOrder, status: 'expired' },
      expectedMerchantId: 'MERCHANT_COLLECTIBLES',
    });
    expect(decision.action).toBe('MANUAL_VERIFICATION_REQUIRED');
    expect(decision.shouldDeadLetter).toBe(true);
  });

  it('5. Out-of-order PAYMENT.CAPTURE.DENIED after paid -> IGNORE_OUT_OF_ORDER (never downgrades)', () => {
    const decision = evaluatePayPalWebhookTransition({
      event: makeEvent({ event_type: 'PAYMENT.CAPTURE.DENIED' }),
      order: { ...baseOrder, status: 'paid', payment_processed_at: '2026-11-19T02:59:00Z' },
      expectedMerchantId: 'MERCHANT_COLLECTIBLES',
    });
    expect(decision.action).toBe('IGNORE_OUT_OF_ORDER');
    expect(decision.effectiveNormalizedStatus).toBe('approved');
  });

  it('6. Out-of-order PAYMENT.CAPTURE.PENDING after paid -> IGNORE_OUT_OF_ORDER', () => {
    const decision = evaluatePayPalWebhookTransition({
      event: makeEvent({ event_type: 'PAYMENT.CAPTURE.PENDING' }),
      order: { ...baseOrder, status: 'confirmed', payment_processed_at: '2026-11-19T02:59:00Z' },
      expectedMerchantId: 'MERCHANT_COLLECTIBLES',
    });
    expect(decision.action).toBe('IGNORE_OUT_OF_ORDER');
  });

  it('7. Wrong currency (EUR instead of USD) -> MANUAL_VERIFICATION_REQUIRED + dead-letter', () => {
    const event = makeEvent({
      resource: {
        id: 'CAP-999',
        custom_id: 'ord-uy-001',
        amount: { value: '100.00', currency_code: 'EUR' },
        payee: { merchant_id: 'MERCHANT_COLLECTIBLES' },
      },
    });
    const decision = evaluatePayPalWebhookTransition({
      event,
      order: baseOrder,
      expectedMerchantId: 'MERCHANT_COLLECTIBLES',
    });
    expect(decision.action).toBe('MANUAL_VERIFICATION_REQUIRED');
    expect(decision.reason).toContain('PAYPAL_CURRENCY_MISMATCH');
    expect(decision.shouldDeadLetter).toBe(true);
  });

  it('8. Wrong amount (95.00 instead of 100.00) -> MANUAL_VERIFICATION_REQUIRED + dead-letter', () => {
    const event = makeEvent({
      resource: {
        id: 'CAP-999',
        custom_id: 'ord-uy-001',
        amount: { value: '95.00', currency_code: 'USD' },
        payee: { merchant_id: 'MERCHANT_COLLECTIBLES' },
      },
    });
    const decision = evaluatePayPalWebhookTransition({
      event,
      order: baseOrder,
      expectedMerchantId: 'MERCHANT_COLLECTIBLES',
    });
    expect(decision.action).toBe('MANUAL_VERIFICATION_REQUIRED');
    expect(decision.reason).toContain('PAYPAL_AMOUNT_MISMATCH');
    expect(decision.shouldDeadLetter).toBe(true);
  });

  it('9. Nonexistent order (orphan webhook) -> DEAD_LETTER', () => {
    const decision = evaluatePayPalWebhookTransition({
      event: makeEvent(),
      order: null,
      expectedMerchantId: 'MERCHANT_COLLECTIBLES',
    });
    expect(decision.action).toBe('DEAD_LETTER');
    expect(decision.effectiveNormalizedStatus).toBe('orphan_event');
    expect(decision.shouldDeadLetter).toBe(true);
  });

  it('10. Wrong merchant ID (cross-account isolation) -> DEAD_LETTER', () => {
    const decision = evaluatePayPalWebhookTransition({
      event: makeEvent(),
      order: baseOrder,
      expectedMerchantId: 'DIFFERENT_MERCHANT',
    });
    expect(decision.action).toBe('DEAD_LETTER');
    expect(decision.reason).toContain('PAYPAL_MERCHANT_MISMATCH');
    expect(decision.shouldDeadLetter).toBe(true);
  });

  it('11. PAYMENT.CAPTURE.REFUNDED on paid order -> RECORD_REFUND', () => {
    const decision = evaluatePayPalWebhookTransition({
      event: makeEvent({ event_type: 'PAYMENT.CAPTURE.REFUNDED' }),
      order: { ...baseOrder, status: 'paid', payment_processed_at: '2026-11-19T02:59:00Z' },
      expectedMerchantId: 'MERCHANT_COLLECTIBLES',
    });
    expect(decision.action).toBe('RECORD_REFUND');
    expect(decision.effectiveNormalizedStatus).toBe('refunded');
  });

  it('12. PAYMENT.CAPTURE.REVERSED (chargeback) on paid order -> RECORD_DISPUTE_OR_REVERSAL', () => {
    const decision = evaluatePayPalWebhookTransition({
      event: makeEvent({ event_type: 'PAYMENT.CAPTURE.REVERSED' }),
      order: { ...baseOrder, status: 'paid', payment_processed_at: '2026-11-19T02:59:00Z' },
      expectedMerchantId: 'MERCHANT_COLLECTIBLES',
    });
    expect(decision.action).toBe('RECORD_DISPUTE_OR_REVERSAL');
    expect(decision.effectiveNormalizedStatus).toBe('disputed');
  });

  it('13. Unsupported event type -> IGNORE_UNSUPPORTED_EVENT', () => {
    const decision = evaluatePayPalWebhookTransition({
      event: makeEvent({ event_type: 'BILLING.SUBSCRIPTION.CREATED' }),
      order: baseOrder,
      expectedMerchantId: 'MERCHANT_COLLECTIBLES',
    });
    expect(decision.action).toBe('IGNORE_UNSUPPORTED_EVENT');
    expect(decision.httpStatus).toBe(200);
  });

  it('14. Malformed webhook payload throws deterministic parse error', () => {
    expect(() => parsePayPalWebhookEvent(null)).toThrow(/PAYPAL_WEBHOOK_INVALID_BODY/);
    expect(() => parsePayPalWebhookEvent({ id: '1' })).toThrow(/PAYPAL_WEBHOOK_MISSING_FIELDS/);
  });

  it('15. Edge Function paypal-webhook enforces fail-closed signature verification and env-first secrets', () => {
    const fnPath = path.join(REPO_ROOT, 'supabase/functions/paypal-webhook/index.ts');
    const source = fs.readFileSync(fnPath, 'utf8');
    expect(source).toContain('/v1/notifications/verify-webhook-signature');
    expect(source).toContain('Deno.env.get("PAYPAL_CLIENT_ID")');
    expect(source).toContain('Deno.env.get("PAYPAL_WEBHOOK_ID")');
    expect(source).toContain('paypal_webhook_events');
    expect(source).toContain('STOCK_EXHAUSTED_ON_LATE_APPROVAL');
  });
});

describe('P2.3 — Migration Integrity & Replay Bootstrap Invariants', () => {
  it('registers paypal-webhook in supabase/config.toml with verify_jwt = false', () => {
    const config = fs.readFileSync(path.join(REPO_ROOT, 'supabase/config.toml'), 'utf8');
    expect(config).toMatch(/\[functions\.paypal-webhook\][\s\S]*verify_jwt\s*=\s*false/);
  });

  it('new P2 migration enables RLS, revokes public/anon/authenticated, and avoids destructive DDL', () => {
    const migPath = path.join(REPO_ROOT, 'supabase/migrations/20271119000300_p2_paypal_webhook_and_dead_letter.sql');
    const sql = fs.readFileSync(migPath, 'utf8');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.paypal_webhook_events');
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('REVOKE ALL ON public.paypal_webhook_events FROM PUBLIC, anon, authenticated');
    expect(sql).not.toMatch(/ALTER\s+TABLE\s+storage\.objects\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i);
    expect(sql).not.toMatch(/\bDROP\s+TABLE\b/i);
  });

  it('bootstrap_empty_db_compat.sql and MIGRATION_REPLAY_AUDIT.md exist and document exact replay blockers', () => {
    const bootstrap = fs.readFileSync(path.join(REPO_ROOT, 'supabase/scripts/bootstrap_empty_db_compat.sql'), 'utf8');
    const audit = fs.readFileSync(path.join(REPO_ROOT, 'docs/certification/MIGRATION_REPLAY_AUDIT.md'), 'utf8');
    expect(bootstrap).toContain('storage');
    expect(audit).toContain('20260326000002_storage_schema.sql');
    expect(audit).toContain('20260327000002_affiliate_system.sql');
  });
});
