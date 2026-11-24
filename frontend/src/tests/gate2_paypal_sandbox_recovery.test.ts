import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  PAYPAL_SANDBOX_API_BASE,
  PAYPAL_LIVE_API_BASE,
  PayPalConfigError,
  resolvePayPalRuntimeConfig,
} from '../../../supabase/functions/_shared/paypal-config';
import { resolvePayPalChargeFromRate, verifyPayPalCaptureReconciliation } from '../../../supabase/functions/_shared/paypal-fx';
import { parsePayPalWebhookEvent, evaluatePayPalWebhookTransition } from '../../../supabase/functions/_shared/paypal-webhook-core';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const STAGING_URL = 'https://csnudufkpfzveoonjumy.supabase.co';
const PROD_URL = 'https://cobtsgkwcftvexaarwmo.supabase.co';

describe('GATE 2 — PayPal Runtime Selector (Staging Sandbox-Only & Fail-Closed)', () => {
  it('1. Staging + PAYPAL_SANDBOX=true + Edge Secrets -> resolves strictly to Sandbox API', () => {
    const cfg = resolvePayPalRuntimeConfig({
      supabaseUrl: STAGING_URL,
      env: {
        PAYPAL_SANDBOX: 'true',
        PAYPAL_SANDBOX_CLIENT_ID: 'sb_client_id_mock',
        PAYPAL_SANDBOX_CLIENT_SECRET: 'sb_client_secret_mock',
        PAYPAL_SANDBOX_WEBHOOK_ID: 'WH-SB-123',
        PAYPAL_SANDBOX_MERCHANT_ID: 'MERCHANT-SB-1',
      },
      requireWebhookId: true,
    });
    expect(cfg.isSandbox).toBe(true);
    expect(cfg.environment).toBe('sandbox');
    expect(cfg.apiBase).toBe(PAYPAL_SANDBOX_API_BASE);
    expect(cfg.credentialSource).toBe('env');
    expect(cfg.webhookId).toBe('WH-SB-123');
    expect(cfg.merchantId).toBe('MERCHANT-SB-1');
  });

  it('2. Staging + payments_paypal_sandbox=false -> REJECTED (PAYPAL_LIVE_FORBIDDEN_IN_STAGING)', () => {
    expect(() =>
      resolvePayPalRuntimeConfig({
        supabaseUrl: STAGING_URL,
        siteSettings: {
          payments_paypal_sandbox: 'false',
          payments_paypal_client_id: 'live_id',
          payments_paypal_client_secret: 'live_secret',
        },
      })
    ).toThrow(PayPalConfigError);

    try {
      resolvePayPalRuntimeConfig({
        supabaseUrl: STAGING_URL,
        env: { PAYPAL_SANDBOX: 'false', PAYPAL_CLIENT_ID: 'x', PAYPAL_CLIENT_SECRET: 'y' },
      });
    } catch (err: any) {
      expect(err.code).toBe('PAYPAL_LIVE_FORBIDDEN_IN_STAGING');
      expect(err.message).not.toContain('live_secret');
    }
  });

  it('3. Staging + missing sandbox flag -> REJECTED fail-closed (never silently falls back to Live)', () => {
    try {
      resolvePayPalRuntimeConfig({
        supabaseUrl: STAGING_URL,
        siteSettings: {
          payments_paypal_client_id: 'sb_id',
          payments_paypal_client_secret: 'sb_secret',
        },
      });
      expect.fail('Should have thrown PAYPAL_SANDBOX_MODE_REQUIRED_IN_STAGING');
    } catch (err: any) {
      expect(err.code).toBe('PAYPAL_SANDBOX_MODE_REQUIRED_IN_STAGING');
    }
  });

  it('4. Staging + missing credentials -> REJECTED (PAYPAL_CREDENTIALS_MISSING)', () => {
    try {
      resolvePayPalRuntimeConfig({
        supabaseUrl: STAGING_URL,
        env: { PAYPAL_SANDBOX: 'true' },
      });
      expect.fail('Should have thrown PAYPAL_CREDENTIALS_MISSING');
    } catch (err: any) {
      expect(err.code).toBe('PAYPAL_CREDENTIALS_MISSING');
    }
  });

  it('5. Staging webhook with requireWebhookId=true and missing webhook ID -> REJECTED (PAYPAL_WEBHOOK_ID_MISSING)', () => {
    try {
      resolvePayPalRuntimeConfig({
        supabaseUrl: STAGING_URL,
        env: {
          PAYPAL_SANDBOX: 'true',
          PAYPAL_SANDBOX_CLIENT_ID: 'sb_id',
          PAYPAL_SANDBOX_CLIENT_SECRET: 'sb_secret',
        },
        requireWebhookId: true,
      });
      expect.fail('Should have thrown PAYPAL_WEBHOOK_ID_MISSING');
    } catch (err: any) {
      expect(err.code).toBe('PAYPAL_WEBHOOK_ID_MISSING');
    }
  });

  it('6. Production + payments_paypal_sandbox=false -> preserves Live compatibility', () => {
    const cfg = resolvePayPalRuntimeConfig({
      supabaseUrl: PROD_URL,
      siteSettings: {
        payments_paypal_sandbox: 'false',
        payments_paypal_client_id: 'prod_id_mock',
        payments_paypal_client_secret: 'prod_secret_mock',
      },
    });
    expect(cfg.isSandbox).toBe(false);
    expect(cfg.environment).toBe('live');
    expect(cfg.apiBase).toBe(PAYPAL_LIVE_API_BASE);
    expect(cfg.credentialSource).toBe('site_settings');
  });

  it('7. Production + ambiguous/missing mode -> REJECTED (PAYPAL_MODE_AMBIGUOUS)', () => {
    try {
      resolvePayPalRuntimeConfig({
        supabaseUrl: PROD_URL,
        siteSettings: {
          payments_paypal_client_id: 'prod_id_mock',
          payments_paypal_client_secret: 'prod_secret_mock',
        },
      });
      expect.fail('Should have thrown PAYPAL_MODE_AMBIGUOUS');
    } catch (err: any) {
      expect(err.code).toBe('PAYPAL_MODE_AMBIGUOUS');
    }
  });
});

describe('GATE 2 — End-to-End PayPal Flow Contract (Create -> FX -> Capture -> Webhook -> Idempotency)', () => {
  it('8. executes full UYU->USD FX conversion, capture reconciliation, webhook approval, and idempotent replay', () => {
    // Step 1: FX calculation from authoritative currency_exchange_rates row
    const charge = resolvePayPalChargeFromRate(4250, 'UYU', {
      base_currency: 'USD',
      quote_currency: 'UYU',
      rate: 42.5,
      status: 'VERIFIED',
      is_active: true,
      provider: 'STAGING_SEED',
      source_name: 'BROU',
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    });
    expect(charge.paypalCurrency).toBe('USD');
    expect(charge.paypalAmount).toBe('100.00');
    expect(charge.fxRate).toBe(42.5);

    // Step 2: Capture reconciliation matches persisted payment_total/payment_currency
    const captureData = {
      status: 'COMPLETED',
      purchase_units: [
        {
          payments: {
            captures: [{ id: 'CAP-SB-100', status: 'COMPLETED', amount: { value: '100.00', currency_code: 'USD' } }],
          },
        },
      ],
    };
    expect(() =>
      verifyPayPalCaptureReconciliation({
        expectedPaymentCurrency: charge.paypalCurrency,
        expectedPaymentTotal: charge.paypalAmountNumeric,
        captureData,
      })
    ).not.toThrow();

    // Step 3: Async webhook on pending order -> VERIFY_CAPTURE_AND_FINALIZE
    const event = parsePayPalWebhookEvent({
      id: 'WH-EVT-SB-1',
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: {
        id: 'CAP-SB-100',
        custom_id: 'order-sb-1',
        amount: { value: '100.00', currency_code: 'USD' },
        payee: { merchant_id: 'MERCHANT-SB-1' },
      },
    });
    const pendingDecision = evaluatePayPalWebhookTransition({
      event,
      order: {
        id: 'order-sb-1',
        status: 'pending_payment',
        payment_processed_at: null,
        total_amount: 4250,
        currency: 'UYU',
        payment_total: 100.0,
        payment_currency: 'USD',
      },
      expectedMerchantId: 'MERCHANT-SB-1',
    });
    expect(pendingDecision.action).toBe('VERIFY_CAPTURE_AND_FINALIZE');

    // Step 4: Duplicate webhook replay on finalized order -> IGNORE_ALREADY_FINALIZED (idempotent)
    const replayDecision = evaluatePayPalWebhookTransition({
      event,
      order: {
        id: 'order-sb-1',
        status: 'paid',
        payment_processed_at: new Date().toISOString(),
        total_amount: 4250,
        currency: 'UYU',
        payment_total: 100.0,
        payment_currency: 'USD',
      },
      expectedMerchantId: 'MERCHANT-SB-1',
    });
    expect(replayDecision.action).toBe('IGNORE_ALREADY_FINALIZED');
  });

  it('9. verifies create-payment, confirm-payment, and paypal-webhook all use resolvePayPalRuntimeConfig', () => {
    for (const rel of [
      'supabase/functions/create-payment/index.ts',
      'supabase/functions/confirm-payment/index.ts',
      'supabase/functions/paypal-webhook/index.ts',
    ]) {
      const src = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
      expect(src, `${rel} must use resolvePayPalRuntimeConfig`).toContain('resolvePayPalRuntimeConfig');
      expect(src, `${rel} must not contain silent fallback to api-m.paypal.com`).not.toContain('api-m.paypal.com');
    }
  });

  it('10. verifies Staging-only migration uses TEST_ONLY fixture (never VERIFIED) and revokes anon RPC execute', () => {
    const migPath = path.join(
      REPO_ROOT,
      'supabase/migrations_staging/20271124000000_staging_paypal_sandbox_prerequisites.sql'
    );
    const sql = fs.readFileSync(migPath, 'utf8');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.currency_exchange_rates');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.payment_events');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.record_payment_transaction_atomic');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.paypal_webhook_events');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.record_payment_transaction_atomic');
    expect(sql).toContain("('payments_paypal_sandbox', 'true')");
    expect(sql).toContain("'TEST_ONLY_STAGING_FIXTURE'");
    expect(sql).toContain("'TEST_ONLY'");
    expect(sql).not.toContain("'STAGING_SEED', 'BROU Staging Reference'");
    expect(sql).not.toMatch(/\bDROP\s+TABLE\b/i);
  });

  it('11. blocks TEST_ONLY FX fixture in Live/Production while allowing it exclusively in Staging Sandbox', () => {
    const fixtureRow = {
      base_currency: 'USD',
      quote_currency: 'UYU',
      rate: 42.5,
      status: 'TEST_ONLY',
      is_active: true,
      provider: 'TEST_ONLY_STAGING_FIXTURE',
      source_name: 'TEST ONLY — Staging Sandbox Fixture',
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    };

    // Default / Production Live MUST reject TEST_ONLY fixture
    expect(() => resolvePayPalChargeFromRate(4250, 'UYU', fixtureRow)).toThrow(/PAYPAL_FX_TEST_FIXTURE_FORBIDDEN_IN_LIVE/);
    expect(() => resolvePayPalChargeFromRate(4250, 'UYU', fixtureRow, Date.now(), { allowTestFixture: false })).toThrow(/PAYPAL_FX_TEST_FIXTURE_FORBIDDEN_IN_LIVE/);

    // Staging Sandbox with explicit allowTestFixture=true permits it
    const sandboxCharge = resolvePayPalChargeFromRate(4250, 'UYU', fixtureRow, Date.now(), { allowTestFixture: true });
    expect(sandboxCharge.paypalAmount).toBe('100.00');
    expect(sandboxCharge.paypalCurrency).toBe('USD');
  });

  it('12. guarantees create-payment, confirm-payment, and paypal-webhook resolve identical Sandbox credentials', () => {
    const sharedEnv = {
      PAYPAL_SANDBOX: 'true',
      PAYPAL_SANDBOX_CLIENT_ID: 'sb_shared_client',
      PAYPAL_SANDBOX_CLIENT_SECRET: 'sb_shared_secret',
      PAYPAL_SANDBOX_WEBHOOK_ID: 'WH-SHARED-1',
      PAYPAL_SANDBOX_MERCHANT_ID: 'MERCHANT-SHARED-1',
    };
    const createCfg = resolvePayPalRuntimeConfig({ supabaseUrl: STAGING_URL, env: sharedEnv, requireWebhookId: false });
    const confirmCfg = resolvePayPalRuntimeConfig({ supabaseUrl: STAGING_URL, env: sharedEnv, requireWebhookId: false });
    const webhookCfg = resolvePayPalRuntimeConfig({ supabaseUrl: STAGING_URL, env: sharedEnv, requireWebhookId: true });

    expect(createCfg.apiBase).toBe(PAYPAL_SANDBOX_API_BASE);
    expect(confirmCfg.apiBase).toBe(PAYPAL_SANDBOX_API_BASE);
    expect(webhookCfg.apiBase).toBe(PAYPAL_SANDBOX_API_BASE);
    expect(createCfg.clientId).toBe(confirmCfg.clientId);
    expect(confirmCfg.clientId).toBe(webhookCfg.clientId);
    expect(createCfg.clientSecret).toBe(confirmCfg.clientSecret);
    expect(confirmCfg.clientSecret).toBe(webhookCfg.clientSecret);
  });
});
