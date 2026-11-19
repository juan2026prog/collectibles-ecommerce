// supabase/functions/_shared/resilience.ts
// P3 — Server-side Edge Function resilience primitives:
// bounded timeouts, exponential backoff retries, transient error classification,
// and lightweight per-instance circuit breakers.

export type UpstreamErrorClass = "TIMEOUT" | "TRANSIENT_UPSTREAM" | "RATE_LIMITED" | "NON_RETRYABLE";

export function classifyUpstreamError(error: unknown, httpStatus?: number): UpstreamErrorClass {
  if (httpStatus === 429) return "RATE_LIMITED";
  if (httpStatus !== undefined && httpStatus >= 500) return "TRANSIENT_UPSTREAM";
  if (httpStatus !== undefined && httpStatus >= 400 && httpStatus < 500) return "NON_RETRYABLE";

  const msg = String((error as any)?.message || error || "");
  const name = String((error as any)?.name || "");
  if (name === "AbortError" || name === "TimeoutError" || /timeout|timed out/i.test(msg)) {
    return "TIMEOUT";
  }
  if (/network|fetch failed|ECONNRESET|ETIMEDOUT|502|503|504/i.test(msg)) {
    return "TRANSIENT_UPSTREAM";
  }
  return "NON_RETRYABLE";
}

export async function withEdgeTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`EDGE_TIMEOUT:${timeoutMs}ms`)), timeoutMs);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

export async function withEdgeBoundedRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options?: {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    shouldRetry?: (error: unknown, attempt: number) => boolean;
    sleep?: (ms: number) => Promise<void>;
  }
): Promise<T> {
  const maxRetries = Math.max(0, Math.min(options?.maxRetries ?? 2, 4));
  const baseDelayMs = options?.baseDelayMs ?? 200;
  const maxDelayMs = options?.maxDelayMs ?? 2_000;
  const shouldRetry =
    options?.shouldRetry ??
    ((err: unknown) => {
      const cls = classifyUpstreamError(err);
      return cls === "TIMEOUT" || cls === "TRANSIENT_UPSTREAM" || cls === "RATE_LIMITED";
    });
  const sleep = options?.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      if (attempt >= maxRetries || !shouldRetry(err, attempt)) {
        throw err;
      }
      const delay = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt));
      await sleep(delay);
    }
  }
  throw lastError;
}

export class ServerCircuitBreaker {
  private failures = 0;
  private openUntil = 0;
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly now: () => number;

  constructor(options?: { failureThreshold?: number; cooldownMs?: number; now?: () => number }) {
    this.failureThreshold = options?.failureThreshold ?? 3;
    this.cooldownMs = options?.cooldownMs ?? 30_000;
    this.now = options?.now ?? (() => Date.now());
  }

  public isOpen(): boolean {
    if (this.openUntil === 0) return false;
    if (this.now() >= this.openUntil) {
      this.openUntil = 0;
      return false;
    }
    return true;
  }

  public recordSuccess(): void {
    this.failures = 0;
    this.openUntil = 0;
  }

  public recordFailure(): void {
    this.failures += 1;
    if (this.failures >= this.failureThreshold) {
      this.openUntil = this.now() + this.cooldownMs;
    }
  }
}
