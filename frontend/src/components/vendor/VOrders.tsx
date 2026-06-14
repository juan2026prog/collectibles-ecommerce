import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Package, Truck, Search, Eye } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export default function VOrders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchOrders();
    } else {
      setLoading(false);
    }
  }, [user]);

  async function fetchOrders() {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          order_items!inner(*)
        `)
        .eq('order_items.vendor_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (err) {
      console.error('Error fetching vendor orders:', err);
    } finally {
      setLoading(false);
    }
  }


  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20 animate-fade-in">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Package className="w-6 h-6 text-emerald-600" />
            Gestión de Pedidos
          </h1>
          <p className="text-gray-500 mt-1">Pedidos de tus productos y estado logístico real.</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50/80">
              <tr>
                <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">ID Orden / Fecha</th>
                <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Cliente</th>
                <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Estado Pago</th>
                <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Logística / Tracking</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={4} className="p-8 text-center text-gray-500">Cargando...</td></tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-12 text-center text-gray-400">
                    <Package className="w-12 h-12 mx-auto mb-3 text-gray-200" />
                    <p className="font-semibold">No hay pedidos registrados.</p>
                  </td>
                </tr>
              ) : (
                orders.map(o => (
                  <tr key={o.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="font-bold text-gray-900 text-sm">#{o.id.slice(0,8).toUpperCase()}</div>
                      <div className="text-xs text-gray-500">{new Date(o.created_at).toLocaleDateString()}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                       {o.shipping_address?.full_name || 'Cliente Oculto'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 text-[10px] font-black uppercase tracking-widest rounded-md ${o.status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                        {o.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-bold text-gray-700 uppercase tracking-widest">{o.shipping_method || 'Standard'}</span>
                        {o.tracking_number ? (
                          <div className="flex items-center gap-1 text-[11px] text-blue-600 font-bold bg-blue-50 px-2 py-1 rounded w-fit border border-blue-100">
                            <Truck className="w-3 h-3" />
                            {o.carrier ? `${o.carrier.toUpperCase()}: ` : ''}{o.tracking_number}
                          </div>
                        ) : (
                          <span className="text-[10px] text-gray-400">Sin tracking</span>
                        )}
                        {o.tracking_url && (
                          <a href={o.tracking_url} target="_blank" rel="noreferrer" className="text-[10px] text-emerald-600 hover:underline mt-1 font-medium">Ver Seguimiento</a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
