import { readFileSync } from 'node:fs';
import * as ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runWorkerBatch } from '../../../supabase/functions/_shared/workerBatch.ts';
import { releaseUnstartedMlItems } from '../../../supabase/functions/_shared/mlImportClaims.ts';

// Exercise the actual batch function without evaluating Deno.serve, importing
// remote SDKs or calling any provider. TypeScript supplies its exact AST body.
function functionCode(name: string) {
  const relativePath = '../../../supabase/functions/ml-import-worker/index.ts';
  const path = new URL(relativePath, import.meta.url);
  const source = ts.createSourceFile('index.ts', readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
  const declaration = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  if (!declaration) throw new Error('Missing batch function');
  return ts.transpileModule(declaration.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.None } }).outputText;
}
function loadBatch(importItem: (...args: any[]) => Promise<any>, token = async () => 'test-token') {
  const compiled = functionCode('processBatchItems');
  return new Function('getValidMercadoLibreToken', 'importMLItemToStaging', 'runWorkerBatch', 'releaseUnstartedMlItems', `${compiled}; return processBatchItems;`)(token, importItem, runWorkerBatch, releaseUnstartedMlItems);
}

function database(items: any[]) {
  const job = { processed_items: 0, imported_items: 0, skipped_items: 0, error_items: 0, total_items: items.length };
  return { items, job, from(table: string) {
    let changes: any = null;
    const predicates: ((row: any) => boolean)[] = [];
    const execute = () => {
      if (table === 'ml_import_jobs') {
        if (changes) Object.assign(job, changes);
        return { data: job, error: null };
      }
      const rows = items.filter(row => predicates.every(test => test(row)));
      if (changes) for (const row of rows) Object.assign(row, changes);
      return { data: rows.map(row => ({ ...row })), error: null };
    };
    const builder: any = { update(value: any) { changes = value; return builder; }, select: () => builder,
      eq(key: string, value: any) { predicates.push(row => row[key] === value); return builder; },
      in(key: string, values: any[]) { predicates.push(row => values.includes(row[key])); return builder; },
      single: async () => execute(), then: (resolve: any, reject: any) => Promise.resolve(execute()).then(resolve, reject) };
    return builder;
  } };
}
const claimed = (id: string, attempts: number, owner = 'worker') => ({ id, ml_item_id: `fixture-${id}`, attempts, status: 'running', locked_by: owner, locked_at: 'fixture-time' });
afterEach(() => vi.restoreAllMocks());

describe('ML import attempts are counted once by the claiming RPC', () => {
  it('normalizes cancelled response-body reads before any staging write occurs', async () => {
    const controller = new AbortController();
    const cause = new Error('budget exhausted');
    const fetcher = async () => ({ status: 200, ok: true, json: async () => {
      controller.abort(cause); throw new DOMException('body interrupted', 'AbortError');
    } });
    const importer = new Function('fetchWithWorkerReadBackoff', `${functionCode('importMLItemToStaging')}; return importMLItemToStaging;`)(fetcher);
    const database = { from: vi.fn(() => { throw new Error('No writes expected'); }) };
    await expect(importer(database, 'fixture-id', 'fixture-seller', null, 'fixture-token', controller.signal)).rejects.toBe(cause);
    expect(database.from).not.toHaveBeenCalled();
  });
  it('successful batch preserves the different attempt counters already incremented by the RPC', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const db = database([claimed('first', 1), claimed('retry', 4)]);
    const batch = loadBatch(async () => ({ category: 'importado' }));
    const processed = await batch(db, { id: 'job', seller_id: 'fixture', vendor_id: null }, db.items.map(item => ({ ...item })), 'worker', { expired: () => false, signal: new AbortController().signal });
    expect(processed).toBe(2);
    expect(db.items.map(item => [item.status, item.attempts])).toEqual([['completed', 1], ['completed', 4]]);
    expect(db.job.processed_items).toBe(2);
  });
  it('returns cancelled provider reads to pending without charging an unperformed attempt', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const controller = new AbortController();
    const db = database([claimed('first', 1), claimed('retry', 4), claimed('unstarted', 2)]);
    const batch = loadBatch(async () => { controller.abort(new Error('budget')); throw controller.signal.reason; });
    const processed = await batch(db, { id: 'job', seller_id: 'fixture' }, db.items.map(item => ({ ...item })), 'worker', { expired: () => controller.signal.aborted, signal: controller.signal });
    expect(processed).toBe(0);
    expect(db.items.map(item => [item.status, item.attempts, item.locked_by])).toEqual([['pending', 0, null], ['pending', 3, null], ['pending', 1, null]]);
    expect(db.job.error_items).toBe(0);
  });
  it('cannot restore counters or release a claim after ownership has changed', async () => {
    const db = database([claimed('mine', 2), claimed('foreign', 3, 'another-worker')]);
    expect(await releaseUnstartedMlItems(db, db.items.map(item => ({ ...item })), 'worker')).toBe(1);
    expect(db.items[0]).toMatchObject({ status: 'pending', attempts: 1, locked_by: null });
    expect(db.items[1]).toMatchObject({ status: 'running', attempts: 3, locked_by: 'another-worker' });
  });
});
