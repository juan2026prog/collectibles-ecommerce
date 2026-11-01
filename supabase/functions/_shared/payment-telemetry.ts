export function paymentTelemetry(requestId = crypto.randomUUID()) {
  const started = performance.now();
  const timings: Record<string, number> = {};
  const measure = async <T>(stage: string, run: () => PromiseLike<T>): Promise<T> => {
    const start = performance.now();
    try { return await run(); }
    finally {
      const duration = Math.round(performance.now() - start);
      timings[stage] = (timings[stage] || 0) + duration;
      console.info(JSON.stringify({ event: 'payment_timing', request_id: requestId, stage, duration_ms: duration }));
    }
  };
  return {
    requestId, timings, measure,
    fetch: (fetcher: typeof fetch = fetch): typeof fetch => (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      const layer = url.hostname === 'api.mercadopago.com' ? 'provider' : 'supabase';
      return measure(layer, async () => {
        const response = await fetcher(input, { ...init, signal: init?.signal || AbortSignal.timeout(15000) });
        // Read inside the span so the duration includes the response body.
        const body = await response.arrayBuffer();
        console.info(JSON.stringify({ event: 'payment_http', request_id: requestId, layer, path: url.pathname,
          http_status: response.status, provider_request_id: response.headers.get('x-request-id') }));
        return new Response(body.byteLength ? body : null, { status: response.status, statusText: response.statusText, headers: response.headers });
      });
    },
    headers: () => ({
      'X-Payment-Request-Id': requestId,
      'Server-Timing': [...Object.entries(timings).map(([name, duration]) => `${name};dur=${duration}`), `total;dur=${Math.round(performance.now()-started)}`].join(', '),
      'Access-Control-Expose-Headers': 'Server-Timing, X-Payment-Request-Id',
    }),
  };
}
