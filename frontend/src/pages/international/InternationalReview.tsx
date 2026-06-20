import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, ArrowRight, ArrowLeft, Loader2, RefreshCw, AlertTriangle, CheckCircle } from 'lucide-react';
import { useInternationalCartContext } from '../../contexts/InternationalCartContext';
import { supabase } from '../../lib/supabase';
import { useCurrency } from '../../contexts/CurrencyContext';
import { calculateUruboxEstimate, getEstimatedWeightKg } from '../../lib/urubox';

export default function InternationalReview() {
  const navigate = useNavigate();
  const { items } = useInternationalCartContext();
  const { formatCurrencyPrice } = useCurrency();
  const [courierInfo, setCourierInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkResults, setCheckResults] = useState<any[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem('collectibles_international_courier');
    if (!saved) {
      navigate('/internacional/checkout/courier');
      return;
    }
    setCourierInfo(JSON.parse(saved));
  }, [navigate]);

  if (items.length === 0) {
    navigate('/internacional/cart');
    return null;
  }

  const totalWeightKg = items.reduce((acc, item) => {
    const itemWeight = item.weight_kg || getEstimatedWeightKg(item.international_data?.category);
    return acc + itemWeight * item.quantity;
  }, 0);
  const totalUsd = items.reduce((sum, i) => sum + (i.price_usd * i.quantity), 0);
  
  const uruboxEstimate = calculateUruboxEstimate({
    weight_kg: totalWeightKg,
    destination_type: 'no_local_delivery'
  });
  const totalUruboxEstimated = uruboxEstimate.total_urubox_usd;
  const totalWithCourier = totalUsd + totalUruboxEstimated;

  const handleLiveCheckAndSimulate = async () => {
    setLoading(true);
    setError(null);
    setCheckResults([]);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('zinc-live-check-before-payment', {
        body: { cart_items: items.map(i => ({ product_id: i.product_id })) }
      });

      if (fnError) throw new Error(fnError.message);

      if (data && data.results) {
        setCheckResults(data.results);
        const allOk = data.results.every((r: any) => r.ok);
        if (!allOk) {
          setError('Algunos productos cambiaron de precio o disponibilidad. Revisa los detalles abajo.');
          setLoading(false);
          return;
        }
      }

      // If everything is OK, simulate order success
      const orderPayload = {
        orderId: 'INT-' + Math.floor(Math.random() * 1000000),
        items,
        courierInfo,
        totals: {
          productsUsd: totalUsd,
          uruboxUsd: totalUruboxEstimated,
          totalUsd: totalWithCourier
        },
        status: 'pending_purchase',
        date: new Date().toISOString()
      };
      
      localStorage.setItem('collectibles_international_order_preview', JSON.stringify(orderPayload));
      navigate('/internacional/checkout/success');

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error de conexión con Zinc o Profit Protection Engine.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <button onClick={() => navigate(-1)} className="text-slate-400 hover:text-white flex items-center gap-2 mb-8">
        <ArrowLeft className="w-4 h-4" /> Volver a Courier
      </button>

      <h1 className="text-3xl font-black text-white uppercase tracking-tighter mb-8">Revisión Final (Live Check)</h1>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="glass p-6 rounded-2xl border border-white/10">
            <h3 className="font-bold text-white uppercase tracking-widest text-sm mb-4">Dirección de Entrega</h3>
            {courierInfo?.type === 'urubox' ? (
              <div>
                <p className="text-[#f00856] font-black uppercase mb-1">Envío vía Urubox</p>
                <p className="text-slate-300">Suite: <span className="font-bold text-white">{courierInfo.suite}</span></p>
                <p className="text-slate-400 text-sm mt-2">Doral, FL 33172</p>
              </div>
            ) : courierInfo?.type === 'other' ? (
              <div className="text-slate-300 text-sm space-y-1">
                <p className="font-bold text-white mb-2 uppercase">{courierInfo.address?.fullName}</p>
                <p>{courierInfo.address?.address1} {courierInfo.address?.address2}</p>
                <p>{courierInfo.address?.city}, {courierInfo.address?.state} {courierInfo.address?.zip}</p>
                <p>Tel: {courierInfo.address?.phone}</p>
              </div>
            ) : null}
          </div>

          <div className="glass p-6 rounded-2xl border border-white/10">
            <h3 className="font-bold text-white uppercase tracking-widest text-sm mb-4">Productos</h3>
            <div className="space-y-4">
              {items.map((item) => (
                <div key={item.variant_id} className="flex gap-4">
                  <img src={item.image_url} alt={item.title} className="w-16 h-16 rounded object-cover" />
                  <div className="flex-1">
                    <p className="text-sm text-white font-bold line-clamp-2 leading-tight">{item.title}</p>
                    <p className="text-xs text-slate-400 mt-1">Cant: {item.quantity}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-[#f00856]">USD {(item.price_usd * item.quantity).toFixed(2)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          <div className="glass p-6 rounded-3xl sticky top-24 border-2 border-[#f00856]/20 shadow-[0_0_30px_rgba(240,8,86,0.1)]">
            <h2 className="text-lg font-black uppercase tracking-widest text-white mb-6 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#f00856]" />
              Resumen y Live Check
            </h2>
            
            <div className="space-y-4 mb-6 text-sm">
              <div className="flex justify-between text-slate-300">
                <span>Subtotal ({items.length} items)</span>
                <span className="font-bold text-white">USD {totalUsd.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Shipping USA</span>
                <span className="font-bold text-green-400">Gratis</span>
              </div>
              <div className="flex justify-between text-slate-300 border-b border-white/10 pb-4">
                <span>Estimación Urubox (Opcional)</span>
                <span className="font-bold text-white">USD {totalUruboxEstimated.toFixed(2)}</span>
              </div>
              
              <div className="flex justify-between text-xl font-black text-white pt-2">
                <span>Costo Total Estimado</span>
                <span className="text-[#f00856]">USD {totalWithCourier.toFixed(2)}</span>
              </div>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl text-sm mb-6 flex flex-col gap-2">
                <div className="flex gap-2 items-center font-bold">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Alerta del Profit Protection Engine
                </div>
                <p>{error}</p>
                {checkResults.length > 0 && (
                  <ul className="list-disc pl-5 mt-2 space-y-1 text-xs">
                    {checkResults.filter(r => !r.ok).map(r => (
                      <li key={r.product_id}>{r.message || 'Error en validación.'}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <button 
              onClick={handleLiveCheckAndSimulate}
              disabled={loading}
              className="w-full btn-primary py-4 rounded-xl flex justify-center items-center gap-2 font-black uppercase tracking-widest text-sm shadow-xl shadow-[#f00856]/20 hover:-translate-y-1 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <><RefreshCw className="w-5 h-5 animate-spin" /> Verificando Precio Real...</>
              ) : (
                <><CheckCircle className="w-5 h-5" /> Validar y Simular Compra</>
              )}
            </button>
            <p className="text-[10px] text-slate-500 mt-4 text-center">
              Al hacer clic, el <strong>Live Check Engine</strong> verificará disponibilidad y rentabilidad actual antes de aprobar la orden de forma simulada.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
