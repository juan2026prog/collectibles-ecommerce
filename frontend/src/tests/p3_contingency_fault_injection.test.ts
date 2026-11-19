import { describe, it, expect } from 'vitest';
import {
  DEPENDENCY_MATRIX,
  CircuitBreaker,
  CircuitOpenError,
  TimeoutError,
  withTimeout,
  withBoundedRetry,
  evaluateCheckoutSafety,
} from '../lib/resilience/contingencyEngine';
import {
  classifyUpstreamError,
  withEdgeTimeout,
  withEdgeBoundedRetry,
  ServerCircuitBreaker,
} from '../../../supabase/functions/_shared/resilience';

describe('P3.1 — Dependency Matrix & Circuit Breaker State Machine', () => {
  it('classifies all 15 platform dependencies with bounded timeouts and thresholds', () => {
    const ids = Object.keys(DEPENDENCY_MATRIX);
    expect(ids).toHaveLength(15);
    for (const spec of Object.values(DEPENDENCY_MATRIX)) {
      expect(spec.timeoutMs).toBeGreaterThan(0);
      expect(spec.failureThreshold).toBeGreaterThanOrEqual(2);
      expect(spec.cooldownMs).toBeGreaterThanOrEqual(20_000);
      expect(spec.fallbackBehavior.length).toBeGreaterThan(10);
    }
  });

  it('transitions CLOSED -> OPEN -> HALF_OPEN -> CLOSED deterministically with clock tracking', async () => {
    let clock = 1_000_000;
    const cb = new CircuitBreaker('supabase_db_write', {
      failureThreshold: 3,
      cooldownMs: 30_000,
      now: () => clock,
    });

    expect(cb.getState()).toBe('CLOSED');

    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(async () => { throw new Error('DB_ERROR'); })).rejects.toThrow('DB_ERROR');
      clock += 100;
    }

    expect(cb.getState()).toBe('OPEN');
    expect(cb.getMetrics().openCount).toBe(1);
    await expect(cb.execute(async () => 'should-not-run')).rejects.toBeInstanceOf(CircuitOpenError);

    // Advance past cooldown -> HALF_OPEN
    clock += 30_000;
    expect(cb.getState()).toBe('HALF_OPEN');

    // Recovery probe succeeds -> CLOSED
    const result = await cb.execute(async () => 'RECOVERED');
    expect(result).toBe('RECOVERED');
    expect(cb.getState()).toBe('CLOSED');
    expect(cb.getMetrics().lastRecoveredAt).toBe(clock);
  });

  it('enforces bounded retries without infinite loops', async () => {
    let attempts = 0;
    await expect(
      withBoundedRetry(
        async () => {
          attempts += 1;
          throw new Error('503_UPSTREAM');
        },
        { maxRetries: 2, baseDelayMs: 1, jitterMs: 0, sleep: async () => {} }
      )
    ).rejects.toThrow('503_UPSTREAM');
    expect(attempts).toBe(3); // initial + 2 retries
  });
});

describe('P3.2 — Fault Injection Certification (Scenarios A–F)', () => {
  it('Scenario A (Slow DB): timeout aborts hung query and trips circuit before request pileup', async () => {
    let clock = 10_000;
    const dbBreaker = new CircuitBreaker('supabase_db_write', {
      failureThreshold: 2,
      cooldownMs: 30_000,
      now: () => clock,
    });

    const slowQuery = () =>
      withTimeout(() => new Promise((resolve) => setTimeout(resolve, 200)), 15);

    const t0 = Date.now();
    await expect(dbBreaker.execute(slowQuery)).rejects.toBeInstanceOf(TimeoutError);
    await expect(dbBreaker.execute(slowQuery)).rejects.toBeInstanceOf(TimeoutError);
    const detectionMs = Date.now() - t0;

    expect(dbBreaker.getState()).toBe('OPEN');
    expect(detectionMs).toBeLessThan(200);
  });

  it('Scenario B (DB Down): blocks checkout fail-closed (no overselling) and recovers when DB returns', async () => {
    let clock = 50_000;
    const dbBreaker = new CircuitBreaker('supabase_db_write', {
      failureThreshold: 3,
      cooldownMs: 30_000,
      now: () => clock,
    });

    for (let i = 0; i < 3; i++) {
      await expect(dbBreaker.execute(async () => { throw new Error('ECONNREFUSED'); })).rejects.toThrow();
    }
    expect(dbBreaker.getState()).toBe('OPEN');

    const decisionDuringOutage = evaluateCheckoutSafety({
      hasLocalItems: true,
      hasInternationalItems: false,
      cartCurrency: 'UYU',
      paymentCurrency: 'UYU',
      stockVerified: false,
      fxRate: null,
      fxAgeMs: null,
      circuitStates: { supabase_db_write: dbBreaker.getState() },
    });

    expect(decisionDuringOutage.allowCheckout).toBe(false);
    expect(decisionDuringOutage.blockingReasons).toContain('DB_WRITE_UNAVAILABLE');
    expect(decisionDuringOutage.blockingReasons).toContain('STOCK_UNVERIFIED');

    // DB returns after cooldown
    clock += 30_001;
    await dbBreaker.execute(async () => ({ ok: true }));
    expect(dbBreaker.getState()).toBe('CLOSED');

    const decisionAfterRecovery = evaluateCheckoutSafety({
      hasLocalItems: true,
      hasInternationalItems: false,
      cartCurrency: 'UYU',
      paymentCurrency: 'UYU',
      stockVerified: true,
      fxRate: null,
      fxAgeMs: null,
      circuitStates: { supabase_db_write: dbBreaker.getState() },
    });
    expect(decisionAfterRecovery.allowCheckout).toBe(true);
  });

  it('Scenario C (Zinc/Amazon Down): pauses international checkout while keeping Uruguay local checkout 100% live', () => {
    const localCart = evaluateCheckoutSafety({
      hasLocalItems: true,
      hasInternationalItems: false,
      cartCurrency: 'UYU',
      paymentCurrency: 'UYU',
      stockVerified: true,
      fxRate: null,
      fxAgeMs: null,
      circuitStates: { zinc_amazon_api: 'OPEN' },
    });
    expect(localCart.allowCheckout).toBe(true);
    expect(localCart.allowLocalCheckout).toBe(true);
    expect(localCart.allowInternationalCheckout).toBe(false);
    expect(localCart.degradedModes).toContain('INTERNATIONAL_PAUSED');

    const intlCart = evaluateCheckoutSafety({
      hasLocalItems: false,
      hasInternationalItems: true,
      cartCurrency: 'USD',
      paymentCurrency: 'USD',
      stockVerified: true,
      fxRate: 42,
      fxAgeMs: 1_000,
      circuitStates: { zinc_amazon_api: 'OPEN' },
    });
    expect(intlCart.allowCheckout).toBe(false);
    expect(intlCart.blockingReasons).toContain('INTERNATIONAL_SOURCING_UNAVAILABLE');
  });

  it('Scenario D (Payment Gateway Down): isolates PayPal outage while keeping MercadoPago & Handy operational; blocks if all fail', () => {
    const paypalDown = evaluateCheckoutSafety({
      hasLocalItems: true,
      hasInternationalItems: false,
      cartCurrency: 'UYU',
      paymentCurrency: 'UYU',
      stockVerified: true,
      fxRate: null,
      fxAgeMs: null,
      circuitStates: { payment_paypal: 'OPEN' },
    });
    expect(paypalDown.allowCheckout).toBe(true);
    expect(paypalDown.availableGateways).toEqual(['mercadopago', 'handy']);
    expect(paypalDown.degradedModes).toContain('PARTIAL_PAYMENT_GATEWAYS');

    const allDown = evaluateCheckoutSafety({
      hasLocalItems: true,
      hasInternationalItems: false,
      cartCurrency: 'UYU',
      paymentCurrency: 'UYU',
      stockVerified: true,
      fxRate: null,
      fxAgeMs: null,
      circuitStates: {
        payment_mercadopago: 'OPEN',
        payment_handy: 'OPEN',
        payment_paypal: 'OPEN',
      },
    });
    expect(allDown.allowCheckout).toBe(false);
    expect(allDown.blockingReasons).toContain('ALL_PAYMENT_GATEWAYS_UNAVAILABLE');
  });

  it('Scenario E (Email / WhatsApp Down): never blocks checkout; marks notifications queued in outbox', () => {
    const notifDown = evaluateCheckoutSafety({
      hasLocalItems: true,
      hasInternationalItems: false,
      cartCurrency: 'UYU',
      paymentCurrency: 'UYU',
      stockVerified: true,
      fxRate: null,
      fxAgeMs: null,
      circuitStates: {
        notifications_email_resend: 'OPEN',
        notifications_whatsapp: 'OPEN',
        geoip_country_detection: 'OPEN',
      },
    });
    expect(notifDown.allowCheckout).toBe(true);
    expect(notifDown.notificationsQueuedAsync).toBe(true);
    expect(notifDown.degradedModes).toContain('NOTIFICATIONS_ASYNC_QUEUED');
    expect(notifDown.degradedModes).toContain('GEOIP_DEFAULT_UY');
  });

  it('Scenario F (FX Missing / Stale): blocks cross-currency checkout fail-closed while same-currency UYU stays live', () => {
    const crossCurrencyStaleFx = evaluateCheckoutSafety({
      hasLocalItems: true,
      hasInternationalItems: false,
      cartCurrency: 'UYU',
      paymentCurrency: 'USD',
      stockVerified: true,
      fxRate: 42.0,
      fxAgeMs: 8 * 3_600_000, // 8h > 6h max
      circuitStates: {},
    });
    expect(crossCurrencyStaleFx.allowCheckout).toBe(false);
    expect(crossCurrencyStaleFx.blockingReasons).toContain('FX_RATE_UNAVAILABLE_OR_STALE');

    const sameCurrencyUyu = evaluateCheckoutSafety({
      hasLocalItems: true,
      hasInternationalItems: false,
      cartCurrency: 'UYU',
      paymentCurrency: 'UYU',
      stockVerified: true,
      fxRate: null,
      fxAgeMs: null,
      circuitStates: { fx_exchange_rate: 'OPEN' },
    });
    expect(sameCurrencyUyu.allowCheckout).toBe(true);
  });
});

describe('P3.3 — Edge Function Server-Side Resilience Primitives', () => {
  it('classifies transient vs non-retryable upstream errors accurately', () => {
    expect(classifyUpstreamError(new Error('timeout'))).toBe('TIMEOUT');
    expect(classifyUpstreamError(new Error('bad gateway'), 502)).toBe('TRANSIENT_UPSTREAM');
    expect(classifyUpstreamError(new Error('rate limit'), 429)).toBe('RATE_LIMITED');
    expect(classifyUpstreamError(new Error('bad request'), 400)).toBe('NON_RETRYABLE');
  });

  it('does not retry 4xx non-retryable errors and retries transient errors boundedly', async () => {
    let calls = 0;
    const recovered = await withEdgeBoundedRetry(
      async () => {
        calls += 1;
        if (calls < 2) throw new Error('503 fetch failed');
        return 'OK';
      },
      { maxRetries: 2, baseDelayMs: 1, sleep: async () => {} }
    );
    expect(recovered).toBe('OK');
    expect(calls).toBe(2);

    let badReqCalls = 0;
    await expect(
      withEdgeBoundedRetry(
        async () => {
          badReqCalls += 1;
          throw new Error('VALIDATION_ERROR');
        },
        { maxRetries: 2, baseDelayMs: 1, sleep: async () => {} }
      )
    ).rejects.toThrow('VALIDATION_ERROR');
    expect(badReqCalls).toBe(1);
  });

  it('aborts hung Edge calls via AbortSignal and trips ServerCircuitBreaker', async () => {
    let clock = 1000;
    const scb = new ServerCircuitBreaker({ failureThreshold: 2, cooldownMs: 10_000, now: () => clock });
    expect(scb.isOpen()).toBe(false);
    scb.recordFailure();
    scb.recordFailure();
    expect(scb.isOpen()).toBe(true);
    clock += 10_000;
    expect(scb.isOpen()).toBe(false);

    await expect(
      withEdgeTimeout(
        (signal) =>
          new Promise((_, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason));
          }),
        15
      )
    ).rejects.toThrow(/EDGE_TIMEOUT/);
  });
});
