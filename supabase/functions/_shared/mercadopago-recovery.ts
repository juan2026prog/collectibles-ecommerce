export class PaymentRecoveryError extends Error {
  constructor(public code: string, message = 'Estamos verificando el intento anterior. Conservá esta orden y no vuelvas a pagar hasta confirmar su estado.') {
    super(message);
  }
}

export function validateCheckoutUrl(value: unknown, preferenceId: string): string {
  const url = new URL(String(value || ''));
  if (url.protocol !== 'https:' || !['www.mercadopago.com.uy','sandbox.mercadopago.com.uy'].includes(url.hostname)
    || url.searchParams.get('pref_id') !== preferenceId) throw new PaymentRecoveryError('INVALID_CHECKOUT_URL');
  return url.href;
}

function validatePreference(preference: any, order: any) {
  if (preference.external_reference !== order.id || !preference.id || !Array.isArray(preference.items) || !preference.items.length) {
    throw new PaymentRecoveryError('PREFERENCE_REFERENCE_MISMATCH');
  }
  let cents = 0;
  for (const item of preference.items) {
    if (item.currency_id !== (order.currency || 'UYU') || !Number.isInteger(Number(item.quantity)) || Number(item.quantity) <= 0
      || !Number.isFinite(Number(item.unit_price))) throw new PaymentRecoveryError('PREFERENCE_AMOUNT_MISMATCH');
    cents += Math.round(Number(item.unit_price)*100)*Number(item.quantity);
  }
  if (cents !== Math.round(Number(order.total_amount)*100)) throw new PaymentRecoveryError('PREFERENCE_AMOUNT_MISMATCH');
}

/** No payment/capture/cancel/refund endpoints. An incomplete read always keeps the retry gate closed. */
export async function reconcileMercadoPagoPreference(order: any, preferenceId: string, accessToken: string, fetcher: typeof fetch = fetch) {
  const get = async (path: string) => {
    let response: Response;
    try { response = await fetcher(`https://api.mercadopago.com${path}`, { method: 'GET', headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15000) }); }
    catch { throw new PaymentRecoveryError('PROVIDER_READ_UNAVAILABLE'); }
    if (!response.ok) throw new PaymentRecoveryError(`PROVIDER_READ_HTTP_${response.status}`);
    try { return await response.json(); } catch { throw new PaymentRecoveryError('PROVIDER_READ_INVALID'); }
  };
  const preference = await get(`/checkout/preferences/${encodeURIComponent(preferenceId)}`);
  if (preference.id !== preferenceId) throw new PaymentRecoveryError('PREFERENCE_REFERENCE_MISMATCH');
  validatePreference(preference, order);
  const payments = await get(`/v1/payments/search?external_reference=${encodeURIComponent(order.id)}&sort=date_created&criteria=desc&limit=100&offset=0`);
  // Require the complete, empty search. A payment of ANY status needs the confirmation path, never a new checkout.
  if (!Array.isArray(payments.results) || !Number.isInteger(payments.paging?.total) || payments.paging.total < 0) throw new PaymentRecoveryError('PROVIDER_READ_INVALID');
  if (payments.paging.total !== 0 || payments.results.length !== 0) throw new PaymentRecoveryError('PAYMENT_EXISTS');
  const merchantOrders = await get(`/merchant_orders/search?preference_id=${encodeURIComponent(preferenceId)}&limit=100&offset=0`);
  if (!Array.isArray(merchantOrders.elements) || !Number.isInteger(merchantOrders.total) || merchantOrders.total !== merchantOrders.elements.length) throw new PaymentRecoveryError('PROVIDER_READ_INCOMPLETE');
  for (const merchant of merchantOrders.elements) {
    if (merchant.preference_id !== preferenceId || merchant.external_reference !== order.id || !Array.isArray(merchant.payments)
      || merchant.payments.length || Number(merchant.paid_amount) !== 0 || Number(merchant.refunded_amount) !== 0) throw new PaymentRecoveryError('MERCHANT_ORDER_REQUIRES_REVIEW');
  }
  const now = Date.now();
  if (preference.expires === true && (!preference.expiration_date_to || !Number.isFinite(Date.parse(preference.expiration_date_to))
    || Date.parse(preference.expiration_date_to) <= now
    || (preference.expiration_date_from && Date.parse(preference.expiration_date_from) > now))) throw new PaymentRecoveryError('PREFERENCE_EXPIRED_OR_NOT_ACTIVE');
  const checkoutUrl = validateCheckoutUrl(accessToken.startsWith('TEST-') ? preference.sandbox_init_point : preference.init_point, preferenceId);
  return { preference, checkoutUrl };
}

async function rpc(client: any, name: string, args: any) {
  // A PostgREST builder is a PromiseLike: await it, inspect {data,error}; catch only actual exceptions.
  const { data, error } = await client.rpc(name, args);
  if (error || !data?.success) throw new PaymentRecoveryError('CHECKOUT_PERSISTENCE_FAILED');
  return data;
}

export async function startMercadoPagoPreference(client: any, order: any, payload: any, accessToken: string, fetcher: typeof fetch = fetch) {
  validatePreference({...payload,id:'preflight'},order);
  const claim = await rpc(client, 'claim_mp_checkout', { p_order_id: order.id });
  if (claim.mode === 'hold') throw new PaymentRecoveryError('RECONCILIATION_REQUIRED');
  let preference: any;
  let checkoutUrl: string;
  if (claim.mode === 'existing') {
    ({ preference, checkoutUrl } = await reconcileMercadoPagoPreference(order, claim.preference_id, accessToken, fetcher));
  } else if (claim.mode === 'create') {
    if (!claim.expires_at || !Number.isFinite(Date.parse(claim.expires_at)) || Date.parse(claim.expires_at) <= Date.now()) throw new PaymentRecoveryError('RESERVATION_EXPIRED');
    // The claim persists BEFORE the one POST. Never release it after a timeout or uncertain response.
    let response: Response;
    try { response = await fetcher('https://api.mercadopago.com/checkout/preferences', {
      method:'POST', headers: { 'Content-Type':'application/json', Authorization:`Bearer ${accessToken}` },
      body:JSON.stringify({ ...payload, expires:true, expiration_date_to:claim.expires_at }), signal:AbortSignal.timeout(15000),
    }); } catch { throw new PaymentRecoveryError('PREFERENCE_CREATE_UNCERTAIN'); }
    if (!response.ok) throw new PaymentRecoveryError('PREFERENCE_CREATE_REQUIRES_REVIEW');
    try { preference = await response.json(); } catch { throw new PaymentRecoveryError('PREFERENCE_CREATE_UNCERTAIN'); }
    validatePreference(preference, order);
    checkoutUrl = validateCheckoutUrl(accessToken.startsWith('TEST-') ? preference.sandbox_init_point : preference.init_point, preference.id);
  } else throw new PaymentRecoveryError('INVALID_CHECKOUT_CLAIM');
  // All four tables commit together. A failure returns no redirect and leaves the claim for reconciliation.
  await rpc(client, 'persist_mp_preference', { p_order_id:order.id, p_attempt_id:claim.attempt_id,
    p_preference_id:preference.id, p_checkout_url:checkoutUrl, p_reconciled:claim.mode === 'existing' });
  return { checkout_url:checkoutUrl, preference_id:preference.id, recovered:claim.mode === 'existing' };
}
