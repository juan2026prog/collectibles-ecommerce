const STORAGE_KEY = 'mp_checkout_recovery_v1';
type CheckoutSession = { fingerprint:string; requestKey:string; orderId?:string };
let inFlight:Promise<any>|undefined;
let inFlightFingerprint:string|undefined;

export async function checkoutFingerprint(params: any): Promise<string> {
  const { terms_accepted_at: _termsAt, reservation_id: _reservation, ...stable } = params;
  const bytes = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(stable)));
  return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}

/** A retry keeps its key even when the first order response was lost. */
export async function withRecoverableCheckout(params:any, create:(requestKey:string)=>Promise<{order:any;order_token?:string}>) {
  const fingerprint=await checkoutFingerprint(params);
  if(inFlight) {
    if(inFlightFingerprint !== fingerprint) throw new Error('Hay otra solicitud de checkout en curso. Conservá la orden antes de cambiar la compra.');
    return inFlight;
  }
  const run = async () => {
    let saved:CheckoutSession|undefined;
    try { saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null')||undefined; }
    catch { throw new Error('No se pudo conservar el intento. Habilitá el almacenamiento antes de pagar.'); }
    if (saved && saved.fingerprint !== fingerprint) {
      // Keep the unresolved order even if the buyer changes cart/provider/address after an interrupted checkout.
      throw new Error('Hay una orden de Mercado Pago pendiente. Revisá su estado antes de iniciar otra compra.');
    }
    const current=saved||{fingerprint,requestKey:crypto.randomUUID()};
    try { localStorage.setItem(STORAGE_KEY,JSON.stringify(current)); }
    catch { throw new Error('No se pudo conservar el intento. Habilitá el almacenamiento antes de pagar.'); }
    const result=await create(current.requestKey);
    // Keep only a random key, fingerprint and order ID; guest tokens stay in sessionStorage.
    localStorage.setItem(STORAGE_KEY,JSON.stringify({...current,orderId:result.order.id}));
    return result.order;
  };
  if(typeof navigator === 'undefined' || !navigator.locks) throw new Error('Este navegador no permite proteger el intento entre pestañas. Abrí el checkout en un navegador actualizado.');
  // Double clicks within this tab share the same operation; Web Locks also serialize other tabs.
  inFlightFingerprint=fingerprint;
  inFlight=navigator.locks.request('mp-checkout-order',run);
  try{return await inFlight;}finally{inFlight=undefined;inFlightFingerprint=undefined;}
}

export function clearRecoveredCheckout(orderId:string) {
  try {
    const value=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
    if(value?.orderId===orderId) localStorage.removeItem(STORAGE_KEY);
  } catch { /* Storage failure cannot invalidate a provider-confirmed payment. */ }
}
