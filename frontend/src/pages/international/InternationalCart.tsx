import { Link, useNavigate } from 'react-router-dom';
import { useInternationalCartContext } from '../../contexts/InternationalCartContext';
import { Trash2, Package, ArrowRight, ShieldCheck, AlertCircle } from 'lucide-react';
import { useCurrency } from '../../contexts/CurrencyContext';

export default function InternationalCart() {
  const { items, removeItem, updateQuantity, totalUsd } = useInternationalCartContext();
  const { formatCurrencyPrice } = useCurrency();
  const navigate = useNavigate();

  // Calcular estimado Urubox global
  const uruboxRate = 22; // USD per Kg
  const totalWeightKg = items.reduce((acc, item) => acc + (item.weight_kg || 1) * item.quantity, 0);
  const totalUruboxEstimated = totalWeightKg * uruboxRate;
  
  const totalWithCourier = totalUsd + totalUruboxEstimated;

  if (items.length === 0) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-4">
        <Package className="w-16 h-16 text-slate-600 mb-4" />
        <h2 className="text-2xl font-black text-white mb-2 tracking-widest uppercase">Carrito Internacional Vacío</h2>
        <p className="text-slate-400 mb-8 text-center max-w-md">No tenés productos de importación en tu carrito.</p>
        <Link to="/internacional" className="btn-primary px-8 py-3 rounded-full font-bold uppercase tracking-widest text-sm hover:-translate-y-1 transition-all">
          Ir a Catálogo Internacional
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <div className="flex items-center gap-3 mb-8">
        <h1 className="text-3xl md:text-4xl font-black text-white uppercase tracking-tighter">Carrito Internacional</h1>
        <div className="bg-[#f00856]/10 text-[#f00856] px-3 py-1 rounded-md text-xs font-bold uppercase tracking-widest">
          Simulador Urubox
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          {items.map((item) => {
            const itemWeight = item.weight_kg || 1;
            const itemUrubox = itemWeight * uruboxRate;
            return (
              <div key={item.variant_id} className="glass p-4 rounded-2xl flex gap-4 border border-white/5 relative">
                <img src={item.image_url} alt={item.title} className="w-24 h-24 object-cover rounded-xl bg-slate-800" />
                <div className="flex-1">
                  <h3 className="font-bold text-white text-lg leading-tight line-clamp-2">{item.title}</h3>
                  <div className="text-xs text-slate-400 mt-1 uppercase tracking-widest flex gap-2">
                    <span>Peso est: {itemWeight.toFixed(2)}kg</span>
                  </div>
                  
                  <div className="flex justify-between items-end mt-4">
                    <div className="flex items-center bg-black/40 rounded-full overflow-hidden border border-white/10">
                      <button onClick={() => updateQuantity(item.variant_id, item.quantity - 1)} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white">-</button>
                      <span className="w-8 text-center text-sm font-bold text-white">{item.quantity}</span>
                      <button onClick={() => updateQuantity(item.variant_id, item.quantity + 1)} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white">+</button>
                    </div>
                    
                    <div className="text-right">
                      <div className="text-xl font-black text-[#f00856]">USD {(item.price_usd * item.quantity).toFixed(2)}</div>
                      <div className="text-[10px] text-slate-500 uppercase">Collectibles</div>
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => removeItem(item.variant_id)}
                  className="absolute top-4 right-4 text-slate-500 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            );
          })}
        </div>

        <div className="lg:col-span-1">
          <div className="glass p-6 rounded-3xl sticky top-24 border border-[#f00856]/20 shadow-[0_0_30px_rgba(240,8,86,0.1)]">
            <h2 className="text-lg font-black uppercase tracking-widest text-white mb-6">Resumen de Compra</h2>
            
            <div className="space-y-4 mb-6">
              <div className="flex justify-between text-slate-300">
                <span>Subtotal Collectibles ({items.length} items)</span>
                <span className="font-bold text-white">USD {totalUsd.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-300 border-b border-white/10 pb-4">
                <span>Shipping a Courier USA</span>
                <span className="font-bold text-green-400">GRATIS</span>
              </div>
              
              <div className="bg-[#f00856]/10 p-3 rounded-lg border border-[#f00856]/20">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-[#f00856] font-bold">Estimación Courier (Urubox)</span>
                  <span className="text-white font-bold">USD {totalUruboxEstimated.toFixed(2)}</span>
                </div>
                <p className="text-[10px] text-slate-400 leading-tight">
                  Calculado a aprox. USD {uruboxRate}/kg. El costo final dependerá del peso real y de tu contrato con el courier.
                </p>
              </div>
              
              <div className="flex justify-between text-xl font-black text-white pt-4">
                <span>Costo Total Estimado</span>
                <span className="text-[#f00856]">USD {totalWithCourier.toFixed(2)}</span>
              </div>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg mb-6 flex gap-3 text-amber-200 text-xs">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p>Al continuar, verificarás disponibilidad en tiempo real. Los precios podrían cambiar ligeramente.</p>
            </div>

            <button 
              onClick={() => navigate('/internacional/checkout/courier')}
              className="w-full btn-primary py-4 rounded-xl flex justify-center items-center gap-2 font-black uppercase tracking-widest text-sm shadow-xl shadow-[#f00856]/20 hover:-translate-y-1 transition-all"
            >
              Continuar a Envío <ArrowRight className="w-5 h-5" />
            </button>
            
            <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-500">
              <ShieldCheck className="w-4 h-4" /> Importación Garantizada por Collectibles
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
