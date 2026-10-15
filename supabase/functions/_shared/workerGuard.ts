type Client = any;
type Environment = { get(name: string): string | undefined };

export class WorkerGuardError extends Error {
  constructor(message: string, public status = 401) { super(message); }
}

export async function authorizeWorker(req: Request, client: Client, env: Environment) {
  const bearer = req.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
  const service = env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (service && (bearer === service || req.headers.get('apikey') === service)) return;

  // Only explicitly configured secrets are accepted. No built-in/test secret fallback.
  for (const [header, variable] of [
    ['x-collectibles-cron-secret', 'COLLECTIBLES_CRON_SECRET'],
    ['x-test-bypass', 'ML_WORKER_SECRET'],
    ['x-zinc-sync-bypass', 'ZINC_SYNC_BYPASS_SECRET'],
  ]) {
    const expected = env.get(variable);
    if (expected && expected.length >= 32 && req.headers.get(header) === expected) return;
  }

  const cronSecret = req.headers.get('x-collectibles-cron-secret');
  if (cronSecret && cronSecret.length >= 32 && cronSecret.length <= 256) {
    const { data, error } = await client.rpc('verify_internal_cron_secret', { p_secret: cronSecret });
    if (!error && data === true) return;
  }
  if (!bearer) throw new WorkerGuardError('Unauthorized');
  const { data: identity, error } = await client.auth.getUser(bearer);
  if (error || !identity?.user) throw new WorkerGuardError('Unauthorized');
  const { data: profile, error: profileError } = await client.from('profiles')
    .select('is_admin').eq('id', identity.user.id).maybeSingle();
  if (profileError || profile?.is_admin !== true) throw new WorkerGuardError('Forbidden', 403);
}

export async function guardWorker(req: Request, client: Client, name: string, env: Environment) {
  await authorizeWorker(req, client, env);
  const owner = crypto.randomUUID();
  const { data, error } = await client.rpc('claim_worker_lease', {
    p_worker: name, p_owner: owner, p_seconds: 600,
  });
  if (error) throw new WorkerGuardError('Worker coordination unavailable', 503);
  if (data !== true) throw new WorkerGuardError('Worker already running', 409);
  const deadline = Date.now() + 45000;
  const signal = AbortSignal.timeout(45000);
  return {
    signal,
    expired: () => signal.aborted || Date.now() >= deadline,
    release: async () => {
      const { error } = await client.rpc('release_worker_lease', { p_worker: name, p_owner: owner });
      if (error) console.error('[worker] Lease release failed', name, error.code);
    },
  };
}

export function workerErrorResponse(error: unknown, headers: Record<string, string> = {}) {
  const status = error instanceof WorkerGuardError ? error.status : 500;
  return new Response(JSON.stringify({ success: false, error: status === 500 ? 'Worker failed' : (error as Error).message }), {
    status, headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store',
      ...(status === 409 || status === 503 ? { 'Retry-After': '60' } : {}) },
  });
}

export function workerFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const timeout = AbortSignal.timeout(6000);
  return fetch(input, { ...init, signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout });
}
