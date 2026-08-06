import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Package, Truck, FileText, RefreshCw, AlertTriangle, CheckCircle, Clock, XCircle, ShieldAlert } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import ShipmentLabelModal from '../ShipmentLabelModal';

export default function VOrders() {
  const { user } = useAuth();
  const [suborders, setSuborders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal State
  const [selectedSuborderId, setSelectedSuborderId] = useState<string | null>(null);
  const [modalTab, setModalTab] = useState<'label' | 'slip'>('label');

  useEffect(() => {
    if (user) {
      fetchSuborders();
    } else {
      setLoading(false);
    }
  }, [user]);

  async function fetchSuborders() {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('order_suborders')
        .select(`
          *,
          parentOrder:orders (
            id,
            status,
            payment_status,
            payment_provider,
            payment_method,
            customer_phone,
            shipping_address
          )
        `)
        .eq('vendor_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSuborders(data || []);
    } catch (err) {
      console.error('Error fetching vendor suborders:', err);
    } finally {
      setLoading(false);
    }
  }

  function handleOpenModal(suborderId: string, tab: 'label' | 'slip') {
    setModalTab(tab);
    setSelectedSuborderId(suborderId);
  }

  function renderPaymentOperationalBadge(parentOrder: any) {
    const payStatus = parentOrder?.payment_status || (parentOrder?.status === 'paid' ? 'approved' : 'pending');

    switch (payStatus) {
      case 'approved':
        return (
          <div className="flex flex-col gap-0.5">
            <span className="inline-flex items-center gap-1 w-fit px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300">
              <CheckCircle className="w-3 h-3 text-emerald-600" /> PAGO CONFIRMADO
            </span>
            <span className="text-[10px] text-emerald-700 font-medium">Podés preparar el pedido.</span>
          </div>
        );
      case 'initiated':
      case 'pending':
      case 'processing':
        return (
          <div className="flex flex-col gap-0.5">
            <span className="inline-flex items-center gap-1 w-fit px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-md bg-amber-100 text-amber-900 border border-amber-300">
              <Clock className="w-3 h-3 text-amber-600" /> PAGO AÚN NO CONFIRMADO
            </span>
            <span className="text-[10px] text-amber-700 font-medium">No prepares ni despaches este pedido.</span>
          </div>
        );
      case 'rejected':
      case 'failed':
        return (
          <div className="flex flex-col gap-0.5">
            <span className="inline-flex items-center gap-1 w-fit px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-md bg-rose-100 text-rose-900 border border-rose-300">
              <XCircle className="w-3 h-3 text-rose-600" /> PAGO RECHAZADO
            </span>
            <span className="text-[10px] text-rose-700 font-medium">El comprador no completó el pago.</span>
          </div>
        );
      case 'expired':
        return (
          <div className="flex flex-col gap-0.5">
            <span className="inline-flex items-center gap-1 w-fit px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-md bg-slate-200 text-slate-800 border border-slate-300">
              <XCircle className="w-3 h-3 text-slate-500" /> PAGO EXPIRADO
            </span>
            <span className="text-[10px] text-slate-600 font-medium">La sesión venció. No prepares el pedido.</span>
          </div>
        );
      case 'refunded':
      case 'partially_refunded':
      case 'cancelled':
        return (
          <div className="flex flex-col gap-0.5">
            <span className="inline-flex items-center gap-1 w-fit px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-md bg-purple-100 text-purple-900 border border-purple-300">
              <AlertTriangle className="w-3 h-3 text-purple-600" /> PAGO CANCELADO / REEMBOLSADO
            </span>
            <span className="text-[10px] text-purple-700 font-medium">Pedido cancelado. No despachar.</span>
          </div>
        );
      default:
        return (
          <div className="flex flex-col gap-0.5">
            <span className="inline-flex items-center gap-1 w-fit px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-md bg-orange-100 text-orange-900 border border-orange-300">
              <ShieldAlert className="w-3 h-3 text-orange-600" /> PAGO EN REVISIÓN
            </span>
            <span className="text-[10px] text-orange-700 font-medium">No despaches hasta confirmación de Collectibles.</span>
          </div>
        );
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20 animate-fade-in">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Package className="w-6 h-6 text-emerald-600" />
            Gestión de Pedidos (Subórdenes)
          </h1>
          <p className="text-gray-500 mt-1">Monitoreo de estado de pago, preparación e información financiera de cada paquete.</p>
        </div>
        <button 
          onClick={fetchSuborders}
          className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-bold"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Actualizar
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50/80">
              <tr>
                <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Suborden / Fecha</th>
                <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Cliente</th>
                <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Estado de Pago</th>
                <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Finanzas Estimadas</th>
                <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Logística / Tracking</th>
                <th className="px-6 py-3 text-center text-[10px] font-black text-gray-500 uppercase tracking-widest">Acciones Operativas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={6} className="p-8 text-center text-gray-500">Cargando subórdenes...</td></tr>
              ) : suborders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-gray-400">
                    <Package className="w-12 h-12 mx-auto mb-3 text-gray-200" />
                    <p className="font-semibold">No hay subórdenes registradas para tu tienda.</p>
                  </td>
                </tr>
              ) : (
                suborders.map(sub => {
                  const addr = sub.parentOrder?.shipping_address || {};
                  const clientName = `${addr.first_name || ''} ${addr.last_name || ''}`.trim() || 'Cliente Oculto';
                  const isPaymentApproved = (sub.parentOrder?.payment_status === 'approved') || (sub.parentOrder?.status === 'paid');

                  const gross = Number(sub.product_subtotal || 0);
                  const shipCost = Number(sub.shipping_cost || 0);
                  const mktFee = Number(sub.marketplace_fee || 0);
                  const feeShare = Number(sub.payment_fee_share || 0);
                  const net = Number(sub.vendor_net_amount || (gross + shipCost - mktFee - feeShare));
                  
                  return (
                    <tr key={sub.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-bold text-gray-900 text-sm">{sub.suborder_number}</div>
                        <div className="text-xs text-gray-500">{new Date(sub.created_at).toLocaleDateString()}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 whitespace-nowrap">
                        {clientName}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {renderPaymentOperationalBadge(sub.parentOrder)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-xs">
                        <div className="flex flex-col">
                          <span className="font-bold text-gray-900">Neto: ${net.toFixed(2)} UYU</span>
                          <span className="text-[10px] text-gray-500">
                            Prod: ${gross} | Com: -${mktFee} | Liq: <span className="font-semibold capitalize text-emerald-700">{sub.liquidation_status || 'pendiente'}</span>
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          <span className="text-xs font-bold text-gray-700 uppercase tracking-widest">{sub.shipping_method || 'Standard'}</span>
                          {sub.tracking_number ? (
                            <div className="flex items-center gap-1 text-[11px] text-blue-600 font-bold bg-blue-50 px-2 py-1 rounded w-fit border border-blue-100 font-mono">
                              <Truck className="w-3 h-3" />
                              {sub.shipping_provider ? `${sub.shipping_provider.toUpperCase()}: ` : ''}{sub.tracking_number}
                            </div>
                          ) : (
                            <span className="text-[10px] text-amber-600 font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-100 flex items-center gap-1 w-fit">
                              {['pickup', 'local'].includes((sub.shipping_method || '').toLowerCase()) ? 'Listo para retiro' : 
                               (sub.shipping_method || '').toLowerCase().includes('manual') ? 'Envío manual' : 'Rastreo pendiente'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="flex justify-center items-center gap-2">
                          <button
                            onClick={() => isPaymentApproved && handleOpenModal(sub.id, 'label')}
                            disabled={!isPaymentApproved}
                            className={`flex items-center gap-1 font-bold text-xs px-3 py-1.5 rounded-lg transition-all shadow-sm ${
                              isPaymentApproved
                                ? 'bg-slate-900 hover:bg-slate-800 text-white cursor-pointer'
                                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                            }`}
                            title={isPaymentApproved ? "Ver Etiqueta de Envío" : "Bloqueado: El pago aún no está confirmado."}
                          >
                            <Truck className="w-3.5 h-3.5" /> Etiqueta
                          </button>
                          
                          <button
                            onClick={() => isPaymentApproved && handleOpenModal(sub.id, 'slip')}
                            disabled={!isPaymentApproved}
                            className={`flex items-center gap-1 font-bold text-xs px-3 py-1.5 rounded-lg transition-all ${
                              isPaymentApproved
                                ? 'bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 cursor-pointer'
                                : 'bg-gray-100 border border-gray-200 text-gray-400 cursor-not-allowed'
                            }`}
                            title={isPaymentApproved ? "Ver Packing Slip de Preparación" : "Bloqueado: El pago aún no está confirmado."}
                          >
                            <FileText className="w-3.5 h-3.5" /> Packing Slip
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reusable Shipment Label Modal */}
      {selectedSuborderId && (
        <ShipmentLabelModal
          suborderId={selectedSuborderId}
          initialTab={modalTab}
          onClose={() => {
            setSelectedSuborderId(null);
            fetchSuborders();
          }}
        />
      )}
    </div>
  );
}
