import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { CheckCircle2, Box, Truck, ArrowRight } from 'lucide-react';
import { useInternationalCartContext } from '../../contexts/InternationalCartContext';

export default function InternationalOrderPreview() {
  const navigate = useNavigate();
  const { clearCart } = useInternationalCartContext();
  const [order, setOrder] = useState<any>(null);

  useEffect(() => {
    const saved = localStorage.getItem('collectibles_international_order_preview');
    if (!saved) {
      navigate('/internacional');
      return;
    }
    setOrder(JSON.parse(saved));
    // Vaciamos el carrito porque la compra (simulada) se completó
    clearCart();
    localStorage.removeItem('collectibles_international_cart');
  }, [navigate, clearCart]);

  if (!order) return null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-16">
      <div className="text-center mb-12">
        <div className="w-20 h-20 bg-green-500/20 text-green-400 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-10 h-10" />
        </div>
        <h1 className="text-4xl font-black text-white uppercase tracking-tighter mb-4">Simulación Exitosa</h1>
        <p className="text-lg text-slate-400">
          La compra internacional ha pasado todas las validaciones de rentabilidad y disponibilidad.
        </p>
        <div className="inline-block mt-4 px-4 py-2 bg-slate-800 rounded-full text-sm font-mono text-slate-300">
          Orden: <span className="font-bold text-white">{order.orderId}</span>
        </div>
      </div>

      <div className="glass p-8 rounded-3xl border border-white/10 mb-8">
        <h2 className="font-black text-white uppercase tracking-widest text-sm mb-6 border-b border-white/10 pb-4">
          Resumen de la Orden Simulada
        </h2>

        <div className="grid md:grid-cols-2 gap-8">
          <div>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Courier</h3>
            {order.courierInfo?.type === 'urubox' ? (
              <div className="flex items-center gap-3 text-slate-300">
                <Box className="w-5 h-5 text-[#f00856]" />
                <div>
                  <p className="font-bold text-white">Urubox</p>
                  <p className="text-sm">Suite: {order.courierInfo.suite}</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 text-slate-300">
                <Truck className="w-5 h-5 text-slate-400" />
                <div>
                  <p className="font-bold text-white">{order.courierInfo.address?.fullName}</p>
                  <p className="text-sm">Envío a Courier Privado</p>
                </div>
              </div>
            )}
          </div>

          <div>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Totales</h3>
            <div className="space-y-1 text-sm text-slate-300">
              <div className="flex justify-between">
                <span>Productos ({order.items.length})</span>
                <span className="font-bold text-white">USD {order.totals.productsUsd.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Estimado Urubox</span>
                <span className="font-bold text-white">USD {order.totals.uruboxUsd.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-[#f00856] pt-2 border-t border-white/10 mt-2">
                <span>Costo Total Final</span>
                <span>USD {order.totals.totalUsd.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-white/10">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Items Importados</h3>
          <div className="space-y-3">
            {order.items.map((item: any) => (
              <div key={item.variant_id} className="flex gap-4 items-center bg-black/20 p-3 rounded-xl border border-white/5">
                <img src={item.image_url} alt={item.title} className="w-12 h-12 rounded object-cover" />
                <div className="flex-1">
                  <p className="text-sm text-white font-bold line-clamp-1">{item.title}</p>
                  <p className="text-xs text-slate-400">Cant: {item.quantity} | Peso est: {item.weight_kg?.toFixed(2)}kg</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-white">USD {(item.price_usd * item.quantity).toFixed(2)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-center">
        <Link to="/internacional" className="btn-primary px-8 py-4 rounded-xl flex items-center gap-2 font-black uppercase tracking-widest text-sm hover:-translate-y-1 transition-all shadow-xl shadow-[#f00856]/20">
          Volver a Internacional <ArrowRight className="w-5 h-5" />
        </Link>
      </div>
    </div>
  );
}
