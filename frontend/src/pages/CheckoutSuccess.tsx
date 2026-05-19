import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle, Clock, Package, ArrowRight, Copy, Check, RefreshCcw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useCartContext } from '../contexts/CartContext';
import { analytics } from '../lib/analytics';

export default function CheckoutSuccess() {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get('order_id');
  const provider = searchParams.get('provider');
  const statusParam = searchParams.get('status');
  const { clearCart, items, total } = useCartContext();
  const [order, setOrder] = useState<any>(() => {
    try {
      const stored = sessionStorage.getItem('pending_checkout_order');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [copied, setCopied] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');

  const orderNumber = orderId ? orderId.slice(0, 8).toUpperCase() : '---';
  const isPending = statusParam === 'pending' || order?.status === 'pending' || order?.payment_status === 'pending_payment' || order?.payment_status === 'redirected';

  const shouldTrackPurchase = useMemo(() => {
    if (!orderId || order?.status !== 'paid') return false;
    return !sessionStorage.getItem(`purchase_tracked_${orderId}`);
  }, [order?.status, orderId]);

  useEffect(() => {
    async function verifyPayment() {
      if (!orderId || !provider) return;

      setVerifying(true);
      setError('');
      try {
        const externalId = searchParams.get('token') || searchParams.get('payment_id') || undefined;
        const fallbackEmail = order?.customer_email || '';
        const { data, error } = await supabase.functions.invoke('confirm-payment', {
          body: { provider, order_id: orderId, external_id: externalId, customer_email: fallbackEmail },
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        if (data?.order) {
          setOrder(data.order);
          sessionStorage.setItem('pending_checkout_order', JSON.stringify(data.order));
        }
      } catch (err: any) {
        setError(err.message || 'No se pudo confirmar el estado del pago.');
      } finally {
        setVerifying(false);
      }
    }

    verifyPayment();
  }, [orderId, order?.customer_email, provider, searchParams]);

  useEffect(() => {
    if (!shouldTrackPurchase || !orderId) return;

    analytics.track({
      eventName: 'Purchase',
      eventData: {
        content_ids: items.map((item) => item.product_id),
        content_type: 'product',
        value: order?.total_amount || total,
        currency: order?.currency || 'UYU',
        num_items: items.reduce((sum, item) => sum + item.quantity, 0),
      },
      user: { email: order?.customer_email || undefined },
    });

    clearCart();
    sessionStorage.setItem(`purchase_tracked_${orderId}`, 'true');
    sessionStorage.removeItem('pending_checkout_order');
  }, [clearCart, items, order?.currency, order?.customer_email, order?.status, order?.total_amount, orderId, shouldTrackPurchase, total]);

  function copyOrderNumber() {
    navigator.clipboard.writeText(orderNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-16">
      <div className="max-w-lg w-full text-center">
        <div className="mx-auto w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-6 animate-bounce-slow">
          {isPending ? <Clock className="w-10 h-10 text-amber-500" /> : <CheckCircle className="w-10 h-10 text-green-600" />}
        </div>

        <h1 className="text-3xl font-black text-white mb-2">
          {verifying ? 'Verificando pago...' : isPending ? 'Tu orden esta pendiente' : 'Gracias por tu compra'}
        </h1>
        <p className="text-slate-400 mb-8">
          {verifying
            ? 'Espera un momento mientras confirmamos la transaccion.'
            : isPending
              ? 'Tu pago sigue en proceso. Conservamos la orden y te avisaremos cuando cambie de estado.'
              : 'Recibimos tu pago y tu pedido ya esta confirmado.'}
        </p>

        {error && (
          <div className="mb-6 p-4  border border-amber-200 bg-amber-50 text-amber-700 text-sm text-left">
            <div className="font-bold mb-1">No pudimos validar el proveedor en este momento</div>
            <div>{error}</div>
          </div>
        )}

        <div className="glass  p-6 mb-8 shadow-sm text-left">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-slate-400">Numero de orden</span>
            <button onClick={copyOrderNumber} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/10  text-sm font-mono font-bold transition-colors">
              #{orderNumber}
              {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
            </button>
          </div>

          {order && (
            <>
              <div className="flex items-center justify-between py-2 border-t border-white/10">
                <span className="text-sm text-slate-400">Total</span>
                <span className="text-lg font-black text-white">${Number(order.total_amount || 0).toLocaleString()} {order.currency || 'UYU'}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-t border-white/10">
                <span className="text-sm text-slate-400">Metodo</span>
                <span className="text-sm font-semibold text-gray-700 capitalize">
                  {order.payment_method === 'dlocalgo' || order.payment_method === 'dlocal'
                    ? 'Tarjeta / dLocal Go'
                    : order.payment_method === 'mercadopago'
                      ? 'Mercado Pago'
                      : order.payment_method === 'handy'
                        ? 'Handy Boton de Pago'
                        : 'PayPal'}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-t border-white/10">
                <span className="text-sm text-slate-400">Estado</span>
                <span className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-widest  ${order.status === 'paid' ? 'bg-green-100 text-green-700 border border-green-200' : isPending ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-white/10 text-slate-400 border border-white/10'}`}>
                  {order.status === 'paid' ? 'Confirmada' : isPending ? 'Pendiente' : order.payment_status || order.status}
                </span>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-center gap-3 mb-10">
          {[
            { icon: CheckCircle, label: 'Orden creada', active: true },
            { icon: Package, label: 'Preparando', active: order?.status === 'paid' },
            { icon: ArrowRight, label: 'En camino', active: order?.status === 'shipped' },
          ].map((step, index) => (
            <div key={index} className="flex items-center gap-2">
              <step.icon className={`w-5 h-5 ${step.active ? 'text-green-500' : 'text-slate-500'}`} />
              <span className={`text-xs font-semibold ${step.active ? 'text-white' : 'text-slate-500'}`}>{step.label}</span>
              {index < 2 && <div className={`w-8 h-px ${step.active ? 'bg-green-400' : 'bg-gray-200'}`} />}
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link to="/shop" className="btn-primary px-8 py-3">Seguir comprando</Link>
          {isPending ? (
            <Link to="/checkout" className="px-8 py-3 border-2 border-white/10  font-bold text-gray-700 hover:border-white/30 transition-colors inline-flex items-center justify-center gap-2">
              <RefreshCcw className="w-4 h-4" /> Reintentar pago
            </Link>
          ) : (
            <Link to="/account" className="px-8 py-3 border-2 border-white/10  font-bold text-gray-700 hover:border-white/30 transition-colors">Ver mis ordenes</Link>
          )}
        </div>
      </div>

      <style>{`
        @keyframes bounce-slow {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        .animate-bounce-slow {
          animation: bounce-slow 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
