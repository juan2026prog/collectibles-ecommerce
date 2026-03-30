import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle, Clock, Package, ArrowRight, Copy, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useCartContext } from '../contexts/CartContext';
import { analytics } from '../lib/analytics';

export default function CheckoutSuccess() {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get('order_id');
  const status = searchParams.get('status');
  const { clearCart, items, total } = useCartContext();
  const [order, setOrder] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Clear cart on successful arrival
    if (items.length > 0) {
      analytics.track({
        eventName: 'Purchase',
        eventData: {
          content_ids: items.map(i => i.product_id),
          content_type: 'product',
          value: total,
          currency: 'UYU',
          num_items: items.reduce((s, i) => s + i.quantity, 0)
        },
      });
      clearCart();
    }

    // Fetch order details
    if (orderId) {
      supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .single()
        .then(({ data }) => {
          if (data) setOrder(data);
        });
    }
  }, [orderId]);

  const orderNumber = orderId ? orderId.slice(0, 8).toUpperCase() : '---';
  const isPending = status === 'pending' || order?.status === 'pending';

  function copyOrderNumber() {
    navigator.clipboard.writeText(orderNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-16">
      <div className="max-w-lg w-full text-center">
        {/* Animated check icon */}
        <div className="mx-auto w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-6 animate-bounce-slow">
          {isPending ? (
            <Clock className="w-10 h-10 text-amber-500" />
          ) : (
            <CheckCircle className="w-10 h-10 text-green-600" />
          )}
        </div>

        <h1 className="text-3xl font-black text-gray-900 mb-2">
          {isPending ? '¡Tu orden está pendiente!' : '¡Gracias por tu compra!'}
        </h1>
        <p className="text-gray-500 mb-8">
          {isPending
            ? 'Tu pago está siendo procesado. Te notificaremos cuando se confirme.'
            : 'Hemos recibido tu orden y ya estamos preparándola.'}
        </p>

        {/* Order card */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-8 shadow-sm text-left">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-gray-500">Número de Orden</span>
            <button
              onClick={copyOrderNumber}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-mono font-bold transition-colors"
            >
              #{orderNumber}
              {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5 text-gray-400" />}
            </button>
          </div>

          {order && (
            <>
              <div className="flex items-center justify-between py-2 border-t border-gray-100">
                <span className="text-sm text-gray-500">Total</span>
                <span className="text-lg font-black text-gray-900">
                  ${Number(order.total_amount).toLocaleString()} {order.currency || 'UYU'}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-t border-gray-100">
                <span className="text-sm text-gray-500">Método</span>
                <span className="text-sm font-semibold text-gray-700 capitalize">
                  {order.payment_method === 'dlocalgo' ? 'Tarjeta (dLocal)' 
                    : order.payment_method === 'mercadopago' ? 'MercadoPago' 
                    : 'Transferencia'}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-t border-gray-100">
                <span className="text-sm text-gray-500">Estado</span>
                <span className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-widest rounded-md ${
                  order.status === 'paid' ? 'bg-green-100 text-green-700 border border-green-200' 
                  : order.status === 'pending' ? 'bg-amber-100 text-amber-700 border border-amber-200'
                  : 'bg-gray-100 text-gray-600 border border-gray-200'
                }`}>
                  {order.status === 'paid' ? 'Confirmada' : order.status === 'pending' ? 'Pendiente' : order.status}
                </span>
              </div>
            </>
          )}

          {/* Transfer instructions */}
          {order?.payment_method === 'transfer' && order?.status === 'pending' && (
            <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm">
              <p className="font-bold text-blue-900 mb-2">📋 Datos para transferencia:</p>
              <p className="text-blue-800">Banco: <strong>ITAU</strong></p>
              <p className="text-blue-800">Cuenta: <strong>123-456789-0</strong></p>
              <p className="text-blue-800">Titular: <strong>Collectibles S.R.L.</strong></p>
              <p className="text-blue-800 mt-2">Concepto: <strong>Orden #{orderNumber}</strong></p>
              <p className="text-blue-600 text-xs mt-2">Envíanos el comprobante a ventas@collectibles.com</p>
            </div>
          )}
        </div>

        {/* Timeline */}
        <div className="flex items-center justify-center gap-3 mb-10">
          {[
            { icon: CheckCircle, label: 'Orden Creada', active: true },
            { icon: Package, label: 'Preparando', active: order?.status === 'paid' },
            { icon: ArrowRight, label: 'En Camino', active: order?.status === 'shipped' },
          ].map((step, i) => (
            <div key={i} className="flex items-center gap-2">
              <step.icon className={`w-5 h-5 ${step.active ? 'text-green-500' : 'text-gray-300'}`} />
              <span className={`text-xs font-semibold ${step.active ? 'text-gray-900' : 'text-gray-400'}`}>
                {step.label}
              </span>
              {i < 2 && <div className={`w-8 h-px ${step.active ? 'bg-green-400' : 'bg-gray-200'}`} />}
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link to="/shop" className="btn-primary px-8 py-3">
            Seguir Comprando
          </Link>
          <Link to="/account" className="px-8 py-3 border-2 border-gray-200 rounded-xl font-bold text-gray-700 hover:border-gray-400 transition-colors">
            Ver mis Órdenes
          </Link>
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
