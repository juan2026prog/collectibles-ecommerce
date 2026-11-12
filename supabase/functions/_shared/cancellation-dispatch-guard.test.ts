import { assertDispatchAllowed } from './cancellation-dispatch-guard.ts';

// Intentionally dependency-free Deno tests for dispatch preflight.
function createClient(order: Record<string, unknown> | null, requests: Array<Record<string, unknown>>, failRequest = false) {
  return {
    from(table: string) {
      let suborderFilter: string | null = null;
      return {
        select(_columns: string) { return this; },
        eq(_field: string, _value: unknown) { return this; },
        in(_field: string, _values: unknown[]) { return this; },
        or(expression: string) { suborderFilter = expression.split('suborder_id.eq.')[1] || null; return this; },
        single() { return Promise.resolve({ data: table === 'orders' ? order : null, error: order ? null : {message:'not found'} }); },
        limit(_count: number) { return this; },
        then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          const rows = suborderFilter
            ? requests.filter(r => !r.suborder_id || r.suborder_id === suborderFilter)
            : requests;
          return Promise.resolve({ data: rows, error: failRequest ? {message:'read failed'} : null }).then(resolve, reject);
        }
      };
    }
  };
}
const ORDER_ID='00000000-0000-0000-0000-000000000001';
const SUB_A='00000000-0000-0000-0000-000000000002';
const SUB_B='00000000-0000-0000-0000-000000000003';

Deno.test('allows safe active Handy orders with no cancellation', async () => {
  await assertDispatchAllowed(createClient({payment_method:'handy',status:'confirmed'}, []),ORDER_ID);
});
Deno.test('blocks Handy if a full-order cancellation is active', async () => {
  let blocked=false;
  try { await assertDispatchAllowed(createClient({payment_method:'handy',status:'confirmed'},[{id:'req-1',suborder_id:null}]),ORDER_ID,SUB_A); }
  catch(e) { blocked=String(e).includes('DISPATCH_BLOCKED_BY_CANCELLATION'); }
  if(!blocked) throw Error('Dispatch should be blocked');
});
Deno.test('only blocks the affected suborder for a partial cancellation', async () => {
  const client=createClient({payment_method:'mercadopago',status:'confirmed'},[{id:'req-1',suborder_id:SUB_A}]);
  await assertDispatchAllowed(client,ORDER_ID,SUB_B);
  let blocked=false;
  try { await assertDispatchAllowed(client,ORDER_ID,SUB_A); } catch { blocked=true; }
  if(!blocked) throw Error('Affected suborder must be blocked');
});
Deno.test('excludes Mercado Libre orders', async () => {
  await assertDispatchAllowed(createClient({payment_method:'mercadopago',status:'confirmed',ml_order_id:'123'},[{id:'req'}]),ORDER_ID);
});
Deno.test('blocks manual refund pending even with no request row', async () => {
  let blocked=false;
  try { await assertDispatchAllowed(createClient({payment_method:'handy',status:'refund_pending_manual'},[]),ORDER_ID); } catch { blocked=true; }
  if(!blocked) throw Error('Manual refund must block dispatch');
});
Deno.test('fails closed on cancellation lookup errors', async () => {
  let blocked=false;
  try { await assertDispatchAllowed(createClient({payment_method:'handy',status:'confirmed'},[],true),ORDER_ID); } catch { blocked=true; }
  if(!blocked) throw Error('Lookup failure must block dispatch');
});
