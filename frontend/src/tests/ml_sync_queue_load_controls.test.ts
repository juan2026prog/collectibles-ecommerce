import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';

const relativeDirectory = '../../../supabase/functions/mercadolibre-sync/';
const directory = new URL(relativeDirectory, import.meta.url);
const read = (file: string) => readFileSync(new URL(file, directory), 'utf8').replace(/\r\n/g, '\n');
const hash = (value: string) => createHash('sha256').update(value.trimEnd()).digest('hex');
const DEPLOYED_INDEX = '6fd6dc579f4feb6bb5c660a909420b372326339a6c0ccb11db223dc2055a15d4';
const DEPLOYED_AUTH = '32d232de65dd7369a2e57cba8cfb23211903138cd6c45cdc6b4e3cfb50027e68';

function reverseAllowedPatch(source: string, patch: string) {
  const lines = source.split('\n');
  const hunks: { start: number, before: string[], after: string[] }[] = [];
  let hunk: (typeof hunks)[number] | undefined;
  for (const line of patch.split('\n')) {
    const header = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (header) { hunk = { start: Number(header[1]) - 1, before: [], after: [] }; hunks.push(hunk); continue; }
    if (!hunk || !line || line.startsWith('\\')) continue;
    if (line[0] === ' ' || line[0] === '-') hunk.before.push(line.slice(1));
    if (line[0] === ' ' || line[0] === '+') hunk.after.push(line.slice(1));
  }
  assert.ok(hunks.length > 0);
  for (const part of hunks.reverse()) {
    assert.deepEqual(lines.slice(part.start, part.start + part.after.length), part.after);
    lines.splice(part.start, part.after.length, ...part.before);
  }
  return lines.join('\n');
}

function queueCode() {
  const source = ts.createSourceFile('index.ts', read('index.ts'), ts.ScriptTarget.Latest, true);
  let branch: ts.IfStatement | undefined;
  function visit(node: ts.Node) {
    if (ts.isIfStatement(node) && node.expression.getText(source) === "action === 'process_sync_queue'") branch = node;
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(branch);
  const compiled = ts.transpileModule(`async function executeQueue(action) { ${branch.getText(source)} }`, {
    compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.None }, reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics?.filter(item => item.category === ts.DiagnosticCategory.Error).length, 0);
  return compiled.outputText;
}

function database(retryCount: number | null = 0, injectNullableCandidate = false) {
  const state = { queue: [{ id: 'fixture', status: 'pending', retry_count: retryCount, created_at: 'fixture-time', variant_id: 'variant', ml_item_id: 'fixture-ml', seller_id: 'fixture-seller', payload: {}, last_error: null }], logs: [] as any[] };
  return { state, from(table: string) {
    let update: any, insert: any, options: any = {};
    const predicates: ((row: any) => boolean)[] = [];
    function execute() {
      if (table === 'product_variants') return { data: { inventory_count: 5, price_adjustment: 0 }, error: null };
      if (table === 'ml_catalog_links') return { data: null, error: null };
      if (table === 'ml_import_logs') { if (insert) state.logs.push(insert); return { data: [], error: null }; }
      assert.equal(table, 'ml_sync_queue');
      const rows = state.queue.filter(row => predicates.every(predicate => predicate(row)));
      if (update) for (const row of rows) Object.assign(row, update);
      return { data: rows.map(row => ({ ...row })), count: options.count ? rows.length : null, error: null };
    }
    const builder: any = { select(_fields: string, value: any) { options = value || {}; return builder; },
      update(value: any) { update = value; return builder; }, insert(value: any) { insert = value; return builder; },
      eq(key: string, value: any) { predicates.push(row => value != null && row[key] === value); return builder; },
      is(key: string, value: any) { predicates.push(row => row[key] === value); return builder; },
      in(key: string, values: any[]) { predicates.push(row => values.includes(row[key])); return builder; },
      lt(key: string, value: number) {
        // The deployed SQL filter excludes NULL. An explicit fixture injection
        // tests defensive claim handling without changing production eligibility.
        predicates.push(row => injectNullableCandidate && key === 'retry_count' && row[key] == null
          || row[key] != null && row[key] < value);
        return builder;
      },
      order: () => builder, limit: () => builder,
      maybeSingle: async () => execute(), then: (resolve: any, reject: any) => Promise.resolve(execute()).then(resolve, reject) };
    return builder;
  } };
}
function runtime(db: ReturnType<typeof database>, token: (...args: any[]) => Promise<any>, provider: (...args: any[]) => Promise<any>) {
  return new Function('createClient', 'supabaseUrl', 'supabaseServiceKey', 'getValidMercadoLibreToken', 'workerFetch', 'fetchWithWorkerReadBackoff', 'getSafeSellerId', 'getCorsHeaders', 'req', `${queueCode()}; return executeQueue;`)(() => db, 'https://fixture.invalid', 'fixture-key', token, provider, provider, (value: any) => value, () => ({}), new Request('https://fixture.invalid'));
}
afterEach(() => vi.restoreAllMocks());

describe('Active MercadoLibre worker preserves its deployed baseline', () => {
  it('differs from exact deployed v113 only by the allowed patch and auth import location', () => {
    const entrypoint = read('index.ts');
    const dedicatedImport = 'import { verifyAuth } from "./auth-v113.ts";';
    expect(entrypoint.split(dedicatedImport)).toHaveLength(2);
    const baselineImport = entrypoint.replace(dedicatedImport, 'import { verifyAuth } from "../_shared/auth.ts";');
    expect(hash(reverseAllowedPatch(baselineImport, read('baseline-v113-bounded.patch')))).toBe(DEPLOYED_INDEX);
    expect(hash(read('auth-v113.ts'))).toBe(DEPLOYED_AUTH);
    expect(hash(read('../_shared/cors.ts'))).toBe('31f83b2791d5874d3b98ca35eb21756cdd5e9b80e5522893cc29a7bdeb028770');
    expect(hash(read('../_shared/alerts.ts'))).toBe('bb4570cc961e3f13736ed1055844180caefd6704d5632d74a06c0a1e8f227b19');
  });
  it('lets only one of two simultaneous dispatches claim and write the same item', async () => {
    const db = database();
    const provider = vi.fn(async (_url: string, init: any) => { expect(init.method).toBe('PUT'); return new Response('{}'); });
    const queue = runtime(db, async () => 'fixture-token', provider);
    const responses = await Promise.all([queue('process_sync_queue'), queue('process_sync_queue')]);
    const payloads = await Promise.all(responses.map(response => response.json()));
    expect(provider).toHaveBeenCalledTimes(1);
    expect(payloads.reduce((total, payload) => total + payload.processed, 0)).toBe(1);
    expect(db.state.queue[0]).toMatchObject({ status: 'completed', retry_count: 1 });
  });
  it('does not charge an attempt when deferred before any external write', async () => {
    const controller = new AbortController();
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => controller.signal);
    const db = database();
    const provider = vi.fn(async () => new Response('{}'));
    const run = runtime(db, async () => { controller.abort(new Error('budget')); return 'fixture-token'; }, provider);
    await run('process_sync_queue');
    expect(provider).not.toHaveBeenCalled();
    expect(db.state.queue[0]).toMatchObject({ status: 'pending', retry_count: 0 });
  });
  it('counts one ambiguous external write as attempted without retrying it', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const db = database();
    const provider = vi.fn(async () => { throw new Error('fixture write timeout'); });
    await runtime(db, async () => 'fixture-token', provider)('process_sync_queue');
    expect(provider).toHaveBeenCalledTimes(1);
    expect(db.state.queue[0]).toMatchObject({ status: 'failed', retry_count: 1 });
  });
  it('claims an injected NULL counter with IS NULL and normalizes a completed attempt to one', async () => {
    const db = database(null, true);
    const provider = vi.fn(async () => new Response('{}'));
    await runtime(db, async () => 'fixture-token', provider)('process_sync_queue');
    expect(provider).toHaveBeenCalledTimes(1);
    expect(db.state.queue[0]).toMatchObject({ status: 'completed', retry_count: 1 });
  });
  it('releases an injected NULL counter without converting it or charging an attempt', async () => {
    const controller = new AbortController();
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => controller.signal);
    const db = database(null, true);
    const provider = vi.fn(async () => new Response('{}'));
    await runtime(db, async () => { controller.abort(new Error('budget')); return 'fixture-token'; }, provider)('process_sync_queue');
    expect(provider).not.toHaveBeenCalled();
    expect(db.state.queue[0]).toMatchObject({ status: 'pending', retry_count: null });
  });
});
