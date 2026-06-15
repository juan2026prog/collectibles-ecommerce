import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Package, Truck, FileText, Search, Eye, RefreshCw } from 'lucide-react';
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

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20 animate-fade-in">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Package className="w-6 h-6 text-emerald-600" />
            Gestión de Pedidos (Subórdenes)
          </h1>
          <p className="text-gray-500 mt-1">Cada suborden genera sus etiquetas de envío y slips de preparación de forma independiente.</p>
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
                <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Pago / Estado</th>
                <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Logística / Tracking</th>
                <th className="px-6 py-3 text-center text-[10px] font-black text-gray-500 uppercase tracking-widest">Etiquetas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={5} className="p-8 text-center text-gray-500">Cargando...</td></tr>
              ) : suborders.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-gray-400">
                    <Package className="w-12 h-12 mx-auto mb-3 text-gray-200" />
                    <p className="font-semibold">No hay subórdenes registradas para tu tienda.</p>
                  </td>
                </tr>
              ) : (
                suborders.map(sub => {
                  const addr = sub.parentOrder?.shipping_address || {};
                  const clientName = `${addr.first_name || ''} ${addr.last_name || ''}`.trim() || 'Cliente Oculto';
                  
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
                        <div className="flex flex-col gap-1">
                          <span className={`inline-flex items-center w-fit px-2 py-0.5 text-[9px] font-black uppercase tracking-widest rounded-md ${sub.parentOrder?.status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                            {sub.parentOrder?.status || 'pending'}
                          </span>
                          <span className="text-[10px] font-bold text-slate-500 capitalize">Preparación: {sub.status}</span>
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
                            <span className="text-[10px] text-gray-400">Sin tracking</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="flex justify-center items-center gap-2">
                          <button
                            onClick={() => handleOpenModal(sub.id, 'label')}
                            className="flex items-center gap-1 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs px-3 py-1.5 rounded-lg transition-all shadow-sm"
                            title="Ver Etiqueta de Envío"
                          >
                            <Truck className="w-3.5 h-3.5" /> Etiqueta
                          </button>
                          
                          <button
                            onClick={() => handleOpenModal(sub.id, 'slip')}
                            className="flex items-center gap-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold text-xs px-3 py-1.5 rounded-lg transition-all"
                            title="Ver Packing Slip de Preparación"
                          >
                            <FileText className="w-3.5 h-3.5 text-slate-500" /> Packing Slip
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
