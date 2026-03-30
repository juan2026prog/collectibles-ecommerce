import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Eye, ChevronDown, Package, Truck, PhoneCall, X, Save } from 'lucide-react';

const ORDER_STATUSES = [
  { value: 'pending', label: 'Pendiente de Pago', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'paid', label: 'Pagado', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'en_preparacion', label: 'En Preparación', color: 'bg-blue-100 text-blue-700' },
  { value: 'despachado', label: 'Despachado', color: 'bg-indigo-100 text-indigo-700' },
  { value: 'en_transito', label: 'En Tránsito', color: 'bg-purple-100 text-purple-700' },
  { value: 'para_retirar', label: 'Listo para Retirar', color: 'bg-orange-100 text-orange-800' },
  { value: 'entregado', label: 'Entregado', color: 'bg-green-100 text-green-800' },
  { value: 'cancelada', label: 'Cancelada', color: 'bg-red-100 text-red-700' }
];

export default function AdminOrders() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);

  useEffect(() => { fetchOrders(); }, [statusFilter]);

  async function fetchOrders() {
    setLoading(true);
    let query = supabase.from('orders').select('*, customer:profiles(email, first_name, last_name)').order('created_at', { ascending: false });
    if (statusFilter !== 'all') query = query.eq('status', statusFilter);
    const { data } = await query;
    setOrders(data || []);
    setLoading(false);
  }

  async function updateStatus(id: string, status: string) {
    await supabase.from('orders').update({ status }).eq('id', id);
    fetchOrders();
    if (selectedOrder?.id === id) {
      setSelectedOrder({ ...selectedOrder, status });
    }
  }

  async function saveOrderDetails(updatedData: any) {
    await supabase.from('orders').update({
      tracking_number: updatedData.tracking_number,
      tracking_provider: updatedData.tracking_provider,
      delivery_notes: updatedData.delivery_notes,
      is_assisted_purchase: updatedData.is_assisted_purchase
    }).eq('id', updatedData.id);
    
    setSelectedOrder(null);
    fetchOrders();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Órdenes de Venta</h2>
          <p className="text-sm text-gray-500 mt-1">Gestión de logística y seguimiento</p>
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="form-input w-48 text-sm font-medium">
          <option value="all">Ver Todos los Estados</option>
          {ORDER_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Orden ID / Cliente</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Total</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Estado y Logística</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Fecha</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Tags</th>
                <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-400">Cargando órdenes...</td></tr>
              ) : orders.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-400">No hay órdenes para mostrar</td></tr>
              ) : orders.map(o => {
                const statusObj = ORDER_STATUSES.find(s => s.value === o.status) || ORDER_STATUSES[0];
                return (
                  <tr key={o.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="text-sm font-mono font-bold text-primary-600">#{o.id.slice(0,8).toUpperCase()}</p>
                      <p className="text-sm text-gray-600">{o.customer?.email || o.customer_email || 'Sin usuario asociado'}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-bold text-gray-900">${o.total_amount}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="relative inline-block">
                        <select
                          value={o.status}
                          onChange={e => updateStatus(o.id, e.target.value)}
                          className={`appearance-none px-3 py-1 pr-7 rounded-full text-xs font-bold cursor-pointer border border-transparent hover:border-gray-300 focus:ring-0 ${statusObj.color}`}
                        >
                          {ORDER_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                        <ChevronDown className={`absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none ${statusObj.color.split(' ')[1]}`} />
                      </div>
                      {o.tracking_number && (
                        <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                          <Truck className="w-3 h-3" /> {o.tracking_provider}: {o.tracking_number}
                        </p>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(o.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      {o.is_assisted_purchase && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-pink-100 text-pink-700" title="Venta cerrada por soporte/WhatsApp">
                          <PhoneCall className="w-3 h-3" /> Asistida
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => setSelectedOrder(o)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg group transition-colors">
                        <Eye className="w-4 h-4" />
                        <span className="sr-only">Ver Detalles</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: ORDER DETAILS */}
      {selectedOrder && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm" onClick={() => setSelectedOrder(null)} />
          <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white z-50 shadow-2xl flex flex-col animate-slide-in-left">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <div>
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <Package className="w-5 h-5 text-gray-400" />
                  Orden #{selectedOrder.id.slice(0,8).toUpperCase()}
                </h3>
                <p className="text-sm text-gray-500 mt-1">{new Date(selectedOrder.created_at).toLocaleString()}</p>
              </div>
              <button onClick={() => setSelectedOrder(null)} className="p-2 text-gray-400 hover:bg-gray-200 rounded-lg"><X className="w-5 h-5" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* STATUS & COMPRA ASISTIDA */}
              <div className="space-y-4 bg-white p-4 rounded-xl border border-gray-100">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Operación</h4>
                
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Estado de la Orden</label>
                  <select 
                    value={selectedOrder.status} 
                    onChange={e => setSelectedOrder({...selectedOrder, status: e.target.value})}
                    className="form-input font-medium"
                  >
                    {ORDER_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>

                <label className="flex items-center gap-3 p-3 border border-pink-100 bg-pink-50/50 rounded-lg cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={selectedOrder.is_assisted_purchase} 
                    onChange={e => setSelectedOrder({...selectedOrder, is_assisted_purchase: e.target.checked})}
                    className="w-4 h-4 text-pink-600 border-pink-300 rounded focus:ring-pink-500"
                  />
                  <div>
                    <span className="text-sm font-bold text-pink-900 block">Compra Asistida</span>
                    <span className="text-[10px] text-pink-700">Marca esto si la venta se cerró vía Callcenter / WhatsApp</span>
                  </div>
                </label>
              </div>

              {/* LOGISTICS CARD */}
              <div className="space-y-4 bg-white p-4 rounded-xl border border-gray-100">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Truck className="w-4 h-4" /> Envíos y Rastreo
                </h4>
                
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Empresa de Logística</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="Ej. MercadoEnvios, UES, Correo Uruguayo"
                    value={selectedOrder.tracking_provider || ''} 
                    onChange={e => setSelectedOrder({...selectedOrder, tracking_provider: e.target.value})} 
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Número de Seguimiento (Tracking ID)</label>
                  <input 
                    type="text" 
                    className="form-input font-mono" 
                    placeholder="ej. UY-123456789"
                    value={selectedOrder.tracking_number || ''} 
                    onChange={e => setSelectedOrder({...selectedOrder, tracking_number: e.target.value})} 
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Notas Internas de Despacho</label>
                  <textarea 
                    className="form-input min-h-[80px] text-sm" 
                    placeholder="Notas para los preparadores de pedidos..."
                    value={selectedOrder.delivery_notes || ''} 
                    onChange={e => setSelectedOrder({...selectedOrder, delivery_notes: e.target.value})} 
                  />
                </div>
              </div>

            </div>
            
            <div className="p-4 border-t bg-white">
              <button 
                onClick={() => saveOrderDetails(selectedOrder)}
                className="w-full btn-primary py-3 flex justify-center items-center gap-2"
              >
                <Save className="w-5 h-5" /> Guardar Cambios
              </button>
            </div>
          </div>
        </>
      )}

    </div>
  );
}
