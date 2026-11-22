// frontend/src/lib/resilience/contingencyEngine.ts
// P3 — Automatic Contingency Engine, Dependency Criticality Matrix,
// Circuit Breakers, Bounded Retries, and Fail-Closed Checkout Safety Guard.

export type DependencyCriticality =
  | 'CRITICAL_TRANSACTIONAL'
  | 'CRITICAL_READ'
  | 'DEGRADABLE'
  | 'OPTIONAL'
  | 'BACKGROUND';

export type DependencyId =
  | 'supabase_db_write'
  | 'supabase_auth'
  | 'payment_mercadopago'
  | 'payment_handy'
  | 'payment_paypal'
  | 'fx_exchange_rate'
  | 'catalog_worker_d1'
  | 'public_catalog_api'
  | 'supabase_storage_media'
  | 'zinc_amazon_api'
  | 'logistics_dac_soydelivery'
  | 'geoip_country_detection'
  | 'notifications_email_resend'
  | 'notifications_whatsapp'
  | 'radar_trends_analytics';

export interface DependencySpec {
  id: DependencyId;
  criticality: DependencyCriticality;
  timeoutMs: number;
  failureThreshold: number;
  cooldownMs: number;
  fallbackBehavior: string;
}

export const DEPENDENCY_MATRIX: Record<DependencyId, DependencySpec> = {
  supabase_db_write: {
    id: 'supabase_db_write',
    criticality: 'CRITICAL_TRANSACTIONAL',
    timeoutMs: 8_000,
    failureThreshold: 3,
    cooldownMs: 30_000,
    fallbackBehavior: 'Fail-closed: block order creation and stock mutations to prevent overselling.',
  },
  supabase_auth: {
    id: 'supabase_auth',
    criticality: 'CRITICAL_TRANSACTIONAL',
    timeoutMs: 6_000,
    failureThreshold: 3,
    cooldownMs: 20_000,
    fallbackBehavior: 'Allow public catalog browsing; block authenticated writes and admin actions.',
  },
  payment_mercadopago: {
    id: 'payment_mercadopago',
    criticality: 'CRITICAL_TRANSACTIONAL',
    timeoutMs: 12_000,
    failureThreshold: 3,
    cooldownMs: 45_000,
    fallbackBehavior: 'Disable MercadoPago option temporarily; keep Handy and other healthy gateways active.',
  },
  payment_handy: {
    id: 'payment_handy',
    criticality: 'CRITICAL_TRANSACTIONAL',
    timeoutMs: 12_000,
    failureThreshold: 3,
    cooldownMs: 45_000,
    fallbackBehavior: 'Disable Handy option temporarily; keep MercadoPago and other healthy gateways active.',
  },
  payment_paypal: {
    id: 'payment_paypal',
    criticality: 'CRITICAL_TRANSACTIONAL',
    timeoutMs: 12_000,
    failureThreshold: 3,
    cooldownMs: 45_000,
    fallbackBehavior: 'Disable PayPal option temporarily; keep local Uruguay gateways active.',
  },
  fx_exchange_rate: {
    id: 'fx_exchange_rate',
    criticality: 'CRITICAL_TRANSACTIONAL',
    timeoutMs: 5_000,
    failureThreshold: 2,
    cooldownMs: 30_000,
    fallbackBehavior: 'Block cross-currency checkout (fail-closed); allow same-currency UYU local checkout.',
  },
  catalog_worker_d1: {
    id: 'catalog_worker_d1',
    criticality: 'CRITICAL_READ',
    timeoutMs: 5_000,
    failureThreshold: 3,
    cooldownMs: 30_000,
    fallbackBehavior: 'Automatic failover to /api/public-catalog and localStorage snapshot.',
  },
  public_catalog_api: {
    id: 'public_catalog_api',
    criticality: 'CRITICAL_READ',
    timeoutMs: 10_000,
    failureThreshold: 3,
    cooldownMs: 30_000,
    fallbackBehavior: 'Serve verified /tmp disk snapshot or browser localStorage snapshot (stale_fallback=true).',
  },
  supabase_storage_media: {
    id: 'supabase_storage_media',
    criticality: 'DEGRADABLE',
    timeoutMs: 8_000,
    failureThreshold: 5,
    cooldownMs: 30_000,
    fallbackBehavior: 'Serve CDN cached variants or placeholder thumbnail without blocking product pages.',
  },
  zinc_amazon_api: {
    id: 'zinc_amazon_api',
    criticality: 'DEGRADABLE',
    timeoutMs: 10_000,
    failureThreshold: 3,
    cooldownMs: 60_000,
    fallbackBehavior: 'Pause international checkout only; keep Uruguay local catalog and checkout 100% live.',
  },
  logistics_dac_soydelivery: {
    id: 'logistics_dac_soydelivery',
    criticality: 'DEGRADABLE',
    timeoutMs: 7_000,
    failureThreshold: 3,
    cooldownMs: 30_000,
    fallbackBehavior: 'Fallback to static shipping tiers / store pickup without blocking order completion.',
  },
  geoip_country_detection: {
    id: 'geoip_country_detection',
    criticality: 'OPTIONAL',
    timeoutMs: 3_000,
    failureThreshold: 2,
    cooldownMs: 60_000,
    fallbackBehavior: 'Default safely to UY without altering active cart currency.',
  },
  notifications_email_resend: {
    id: 'notifications_email_resend',
    criticality: 'BACKGROUND',
    timeoutMs: 8_000,
    failureThreshold: 5,
    cooldownMs: 60_000,
    fallbackBehavior: 'Persist event in notification_outbox for async worker retry; never block checkout.',
  },
  notifications_whatsapp: {
    id: 'notifications_whatsapp',
    criticality: 'BACKGROUND',
    timeoutMs: 8_000,
    failureThreshold: 5,
    cooldownMs: 60_000,
    fallbackBehavior: 'Persist event in notification_outbox for async worker retry; never block checkout.',
  },
  radar_trends_analytics: {
    id: 'radar_trends_analytics',
    criticality: 'OPTIONAL',
    timeoutMs: 4_000,
    failureThreshold: 3,
    cooldownMs: 60_000,
    fallbackBehavior: 'Degrade silently without impacting home, catalog, or checkout.',
  },
};

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitMetrics {
  dependencyId: DependencyId;
  state: CircuitState;
  consecutiveFailures: number;
  halfOpenSuccesses: number;
  openCount: number;
  lastFailureAt: number | null;
  lastOpenedAt: number | null;
  lastRecoveredAt: number | null;
}

export class CircuitOpenError extends Error {
  public readonly dependencyId: DependencyId;
  constructor(dependencyId: DependencyId) {
    super(`CIRCUIT_OPEN:${dependencyId}`);
    this.name = 'CircuitOpenError';
    this.dependencyId = dependencyId;
  }
}

export class TimeoutError extends Error {
  public readonly timeoutMs: number;
  constructor(timeoutMs: number) {
    super(`OPERATION_TIMEOUT:${timeoutMs}ms`);
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private consecutiveFailures = 0;
  private halfOpenSuccesses = 0;
  private halfOpenProbeInFlight = false;
  private openUntil = 0;
  private openCount = 0;
  private lastFailureAt: number | null = null;
  private lastOpenedAt: number | null = null;
  private lastRecoveredAt: number | null = null;

  private readonly spec: DependencySpec;
  private readonly halfOpenSuccessThreshold: number;
  private readonly now: () => number;

  constructor(
    dependencyId: DependencyId,
    options?: {
      failureThreshold?: number;
      cooldownMs?: number;
      halfOpenSuccessThreshold?: number;
      now?: () => number;
    }
  ) {
    const base = DEPENDENCY_MATRIX[dependencyId];
    this.spec = {
      ...base,
      failureThreshold: options?.failureThreshold ?? base.failureThreshold,
      cooldownMs: options?.cooldownMs ?? base.cooldownMs,
    };
    this.halfOpenSuccessThreshold = options?.halfOpenSuccessThreshold ?? 1;
    this.now = options?.now ?? (() => Date.now());
  }

  public getState(): CircuitState {
    if (this.state === 'OPEN' && this.now() >= this.openUntil) {
      this.state = 'HALF_OPEN';
      this.halfOpenSuccesses = 0;
      this.halfOpenProbeInFlight = false;
    }
    return this.state;
  }

  public getMetrics(): CircuitMetrics {
    return {
      dependencyId: this.spec.id,
      state: this.getState(),
      consecutiveFailures: this.consecutiveFailures,
      halfOpenSuccesses: this.halfOpenSuccesses,
      openCount: this.openCount,
      lastFailureAt: this.lastFailureAt,
      lastOpenedAt: this.lastOpenedAt,
      lastRecoveredAt: this.lastRecoveredAt,
    };
  }

  public recordSuccess(): void {
    const current = this.getState();
    this.consecutiveFailures = 0;
    this.halfOpenProbeInFlight = false;
    if (current === 'HALF_OPEN') {
      this.halfOpenSuccesses += 1;
      if (this.halfOpenSuccesses >= this.halfOpenSuccessThreshold) {
        this.state = 'CLOSED';
        this.openUntil = 0;
        this.lastRecoveredAt = this.now();
      }
    } else {
      this.state = 'CLOSED';
    }
  }

  public recordFailure(): void {
    const ts = this.now();
    this.lastFailureAt = ts;
    this.consecutiveFailures += 1;
    this.halfOpenProbeInFlight = false;

    if (this.state === 'HALF_OPEN' || this.consecutiveFailures >= this.spec.failureThreshold) {
      this.state = 'OPEN';
      this.openUntil = ts + this.spec.cooldownMs;
      this.openCount += 1;
      this.lastOpenedAt = ts;
      this.halfOpenSuccesses = 0;
    }
  }

  public async execute<T>(fn: () => Promise<T>): Promise<T> {
    const current = this.getState();
    if (current === 'OPEN') {
      throw new CircuitOpenError(this.spec.id);
    }
    // Single-probe concurrency gate in HALF_OPEN: prevent thundering herd on recovering service
    if (current === 'HALF_OPEN') {
      if (this.halfOpenProbeInFlight) {
        throw new CircuitOpenError(this.spec.id);
      }
      this.halfOpenProbeInFlight = true;
    }
    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  public reset(): void {
    this.state = 'CLOSED';
    this.consecutiveFailures = 0;
    this.halfOpenSuccesses = 0;
    this.halfOpenProbeInFlight = false;
    this.openUntil = 0;
  }
}

const _registry = new Map<DependencyId, CircuitBreaker>();

export function getDependencyBreaker(id: DependencyId): CircuitBreaker {
  let breaker = _registry.get(id);
  if (!breaker) {
    breaker = new CircuitBreaker(id);
    _registry.set(id, breaker);
  }
  return breaker;
}

export function getAllCircuitStates(): Partial<Record<DependencyId, CircuitState>> {
  const states: Partial<Record<DependencyId, CircuitState>> = {};
  for (const [id, breaker] of _registry.entries()) {
    states[id] = breaker.getState();
  }
  return states;
}

export function resetAllDependencyBreakers(): void {
  for (const breaker of _registry.values()) {
    breaker.reset();
  }
}

export async function withTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new TimeoutError(timeoutMs)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function withBoundedRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options?: {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    jitterMs?: number;
    shouldRetry?: (error: unknown, attempt: number) => boolean;
    sleep?: (ms: number) => Promise<void>;
  }
): Promise<T> {
  const maxRetries = Math.max(0, Math.min(options?.maxRetries ?? 2, 5));
  const baseDelayMs = options?.baseDelayMs ?? 150;
  const maxDelayMs = options?.maxDelayMs ?? 2_000;
  const jitterMs = options?.jitterMs ?? 50;
  const shouldRetry = options?.shouldRetry ?? (() => true);
  const sleep = options?.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= maxRetries || !shouldRetry(error, attempt)) {
        throw error;
      }
      const expDelay = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt));
      const delay = expDelay + Math.floor(Math.random() * (jitterMs + 1));
      await sleep(delay);
    }
  }
  throw lastError;
}

export interface CheckoutSafetyInput {
  hasLocalItems: boolean;
  hasInternationalItems: boolean;
  cartCurrency: 'UYU' | 'USD' | 'ARS';
  paymentCurrency: 'UYU' | 'USD' | 'ARS';
  stockVerified: boolean;
  fxRate: number | null;
  fxAgeMs: number | null;
  maxFxAgeMs?: number;
  circuitStates: Partial<Record<DependencyId, CircuitState>>;
}

export interface CheckoutSafetyDecision {
  allowCheckout: boolean;
  allowLocalCheckout: boolean;
  allowInternationalCheckout: boolean;
  availableGateways: Array<'mercadopago' | 'handy' | 'paypal'>;
  degradedModes: string[];
  blockingReasons: string[];
  notificationsQueuedAsync: boolean;
}

export function evaluateCheckoutSafety(input: CheckoutSafetyInput): CheckoutSafetyDecision {
  const states = input.circuitStates;
  const blockingReasons: string[] = [];
  const degradedModes: string[] = [];

  const dbDown = states.supabase_db_write === 'OPEN';
  if (dbDown) {
    blockingReasons.push('DB_WRITE_UNAVAILABLE');
  }
  if (!input.stockVerified) {
    blockingReasons.push('STOCK_UNVERIFIED');
  }

  const zincDown = states.zinc_amazon_api === 'OPEN';
  if (zincDown) {
    degradedModes.push('INTERNATIONAL_PAUSED');
    if (input.hasInternationalItems) {
      blockingReasons.push('INTERNATIONAL_SOURCING_UNAVAILABLE');
    }
  }

  const needsFx = input.cartCurrency !== input.paymentCurrency;
  const maxFxAgeMs = input.maxFxAgeMs ?? 6 * 3_600_000;
  const fxInvalid =
    states.fx_exchange_rate === 'OPEN' ||
    input.fxRate === null ||
    !Number.isFinite(input.fxRate) ||
    input.fxRate <= 0 ||
    input.fxAgeMs === null ||
    input.fxAgeMs < 0 ||
    input.fxAgeMs > maxFxAgeMs;

  if (needsFx && fxInvalid) {
    blockingReasons.push('FX_RATE_UNAVAILABLE_OR_STALE');
  }

  const availableGateways: Array<'mercadopago' | 'handy' | 'paypal'> = [];
  if (states.payment_mercadopago !== 'OPEN') availableGateways.push('mercadopago');
  if (states.payment_handy !== 'OPEN') availableGateways.push('handy');
  if (states.payment_paypal !== 'OPEN') availableGateways.push('paypal');

  if (availableGateways.length === 0) {
    blockingReasons.push('ALL_PAYMENT_GATEWAYS_UNAVAILABLE');
  } else if (availableGateways.length < 3) {
    degradedModes.push('PARTIAL_PAYMENT_GATEWAYS');
  }

  const notificationsQueuedAsync =
    states.notifications_email_resend === 'OPEN' || states.notifications_whatsapp === 'OPEN';
  if (notificationsQueuedAsync) {
    degradedModes.push('NOTIFICATIONS_ASYNC_QUEUED');
  }

  if (states.geoip_country_detection === 'OPEN') {
    degradedModes.push('GEOIP_DEFAULT_UY');
  }

  const allowLocalCheckout =
    !dbDown &&
    input.stockVerified &&
    availableGateways.length > 0 &&
    (!needsFx || !fxInvalid);

  const allowInternationalCheckout = allowLocalCheckout && !zincDown;

  const allowCheckout =
    blockingReasons.length === 0 &&
    (!input.hasLocalItems || allowLocalCheckout) &&
    (!input.hasInternationalItems || allowInternationalCheckout);

  return {
    allowCheckout,
    allowLocalCheckout,
    allowInternationalCheckout,
    availableGateways,
    degradedModes,
    blockingReasons,
    notificationsQueuedAsync,
  };
}
