import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Clock, Box, Truck, CheckCircle2, ChevronRight, MapPin, Store } from 'lucide-react';
import { useToast } from '../../components/admin/Toast';

const PREORDER_STATUSES = [
  { id: 'reserved', label: 'Reservada', icon: Clock, color: 'text-gray-400 bg-gray-500/20' },
  { id: 'confirmed', label: 'Confirmada', icon: CheckCircle2, color: 'text-blue-400 bg-blue-500/20' },
  { id: 'in_production', label: 'En Producción', icon: Box, color: 'text-orange-400 bg-orange-500/20' },
  { id: 'in_transit', label: 'En Tránsito', icon: Truck, color: 'text-purple-400 bg-purple-500/20' },
  { id: 'arrived', label: 'Llegó al Local', icon: MapPin, color: 'text-teal-400 bg-teal-500/20' },
  { id: 'ready_for_pickup', label: 'Lista para Retirar', icon: Store, color: 'text-green-400 bg-green-500/20' },
  { id: 'delivered', label: 'Entregada', icon: CheckCircle2, color: 'text-emerald-400 bg-emerald-500/20' },
  { id: 'cancelled', label: 'Cancelada', icon: CheckCircle2, color: 'text-red-400 bg-red-500/20' }
];

export default function AdminPreorders() {
  const [preorders, setPreorders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchPreorders();
  }, []);

  async function fetchPreorders() {
    setLoading(true);
    const { data } = await supabase
      .from('preorder_items')
      .select('*, products(title, images), profiles(first_name, last_name, email), order_items(price, quantity, orders(order_number))')
      .order('created_at', { ascending: false });
    
    if (data) setPreorders(data);
    setLoading(false);
  }

  const updateStatus = async (id: string, newStatus: string) => {
    const { error } = await supabase.from('preorder_items').update({ status: newStatus }).eq('id', id);
    if (error) {
      toast.error('Error al actualizar estado');
    } else {
      toast.success('Estado actualizado (Las automatizaciones se dispararán en segundo plano)');
      fetchPreorders();
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-400">Cargando preventas...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Clock className="w-6 h-6 text-primary-500" />
            Gestión de Preventas
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Visualiza y actualiza el estado de los artículos reservados antes de su lanzamiento.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-7 gap-4 overflow-x-auto pb-4">
        {PREORDER_STATUSES.map(col => {
          const colItems = preorders.filter(p => p.status === col.id);
          return (
            <div key={col.id} className="glass rounded-xl min-w-[280px] border border-white/5 flex flex-col max-h-[80vh]">
              <div className="p-4 border-b border-white/10 bg-dark-800 flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-sm">
                  <col.icon className={`w-4 h-4 ${col.color.split(' ')[0]}`} />
                  {col.label}
                </div>
                <span className="bg-dark-900 px-2 py-0.5 rounded-full text-xs text-slate-400">{colItems.length}</span>
              </div>
              <div className="p-3 flex-1 overflow-y-auto space-y-3">
                {colItems.map(item => (
                  <div key={item.id} className="bg-dark-800 p-3 rounded-lg border border-white/10 shadow-sm hover:border-primary-500/50 transition-colors cursor-grab">
                    <img src={item.products?.images?.[0] || '/placeholder.png'} className="w-full h-24 object-cover rounded-md mb-2 bg-dark-900" alt="Producto" />
                    <div className="text-xs text-slate-400 mb-1">Orden #{item.order_items?.orders?.order_number || 'N/A'}</div>
                    <div className="font-bold text-sm leading-tight mb-2">{item.products?.title || 'Producto'}</div>
                    <div className="text-xs text-slate-300 bg-dark-900 p-2 rounded mb-3 flex flex-col gap-1">
                      <span className="font-bold text-white">{item.profiles?.first_name} {item.profiles?.last_name}</span>
                      <span className="text-[10px] truncate">{item.profiles?.email}</span>
                    </div>
                    
                    <div className="pt-2 border-t border-white/5 flex justify-between items-center">
                      <select 
                        className="bg-dark-900 border border-white/10 text-white text-[10px] rounded px-2 py-1 flex-1"
                        value={item.status}
                        onChange={(e) => updateStatus(item.id, e.target.value)}
                      >
                        {PREORDER_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                      </select>
                    </div>
                  </div>
                ))}
                {colItems.length === 0 && (
                  <div className="text-center text-slate-500 text-xs py-8 border-2 border-dashed border-white/5 rounded-lg">
                    Sin preventas en este estado
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
