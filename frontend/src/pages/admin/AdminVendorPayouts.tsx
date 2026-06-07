import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { CreditCard, CheckCircle, Clock, AlertTriangle, Search, ChevronLeft, ChevronRight } from 'lucide-react';

export default function AdminVendorPayouts() {
  const [payouts, setPayouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Pagination
  const [page, setPage] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const pageSize = 50;

  useEffect(() => {
    fetchPayouts();
  }, [page, statusFilter, searchQuery]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [statusFilter, searchQuery]);

  async function fetchPayouts() {
    setLoading(true);
    try {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from('vendor_payouts')
        .select(`
          *,
          vendor:vendors(store_name, slug),
          order:orders(id, created_at)
        `, { count: 'exact' });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }
      
      // We can search in vendor_id or order_id directly, but searching across relations in Supabase
      // without RPC is tricky for nested `ilike`. We will fallback to order_id UUID string match 
      // or we can just fetch and ignore the store_name search if it's too complex natively.
      // However, Supabase allows syntax: !inner(store_name.ilike.%term%)
      if (searchQuery) {
         // To prevent breaking UUID casts, we'll try to find if it matches an order prefix
         // or we use the relation filter. Let's filter by order ID directly if it looks like uuid
         if (searchQuery.length > 5) {
            query = query.ilike('order_id', `%${searchQuery}%`);
         }
      }

      const { data, count, error } = await query
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;
      setPayouts(data || []);
      if (count !== null) setTotalRecords(count);
    } catch (err) {
      console.error('Error fetching vendor payouts:', err);
    }
    setLoading(false);
  }

  async function updatePayoutStatus(payoutId: string, status: string) {
    try {
      const updateData: any = { status };
      if (status === 'paid') {
        updateData.paid_at = new Date().toISOString();
      }
      const { error } = await supabase
        .from('vendor_payouts')
        .update(updateData)
        .eq('id', payoutId);

      if (error) throw error;
      
      setPayouts(current =>
        current.map(p => p.id === payoutId ? { ...p, status, paid_at: updateData.paid_at || p.paid_at } : p)
      );
    } catch (err) {
      console.error('Error updating payout status:', err);
      alert('Error al actualizar la liquidación.');
    }
  }

  const totalPages = Math.ceil(totalRecords / pageSize);

  return (
    <div className="max-w-7xl mx-auto animate-fade-in space-y-6 pb-20">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-emerald-600" />
            Liquidaciones a Vendedores
          </h1>
          <p className="text-gray-500 mt-1">
            Gestiona y marca como pagadas las transferencias a los vendors.
          </p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-center bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <div className="relative w-full md:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por ID de orden..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="w-full md:w-auto px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
        >
          <option value="all">Todos los estados</option>
          <option value="pending">Pendientes</option>
          <option value="held">Retenidos</option>
          <option value="paid">Pagados</option>
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead>
              <tr className="bg-gray-50/80">
                <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Fecha / Orden</th>
                <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Tienda (Vendor)</th>
                <th className="px-6 py-3 text-right text-[10px] font-black text-gray-500 uppercase tracking-widest">Neto a Pagar</th>
                <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Estado</th>
                <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                 <tr><td colSpan={5} className="p-8 text-center text-gray-500 animate-pulse">Cargando liquidaciones...</td></tr>
              ) : payouts.length === 0 ? (
                 <tr>
                   <td colSpan={5} className="p-12 text-center text-gray-400">
                     <CreditCard className="w-12 h-12 mx-auto mb-3 text-gray-200" />
                     <p className="font-semibold">No hay liquidaciones que coincidan</p>
                   </td>
                 </tr>
              ) : (
                payouts.map(p => {
                const gross = Number(p.amount) / (1 - Number(p.fee_percentage) / 100);
                const fee = gross - Number(p.amount);
                
                return (
                  <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="text-sm font-bold text-gray-900">{new Date(p.created_at).toLocaleDateString('es')}</div>
                      <div className="text-xs text-gray-400">ORD: {p.order?.id?.slice(0,8).toUpperCase()}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-bold text-gray-900">{p.vendor?.store_name || 'Desconocida'}</div>
                      <div className="text-xs text-gray-500">{p.vendor?.slug || ''}</div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="text-sm font-black text-emerald-600">${Number(p.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                      <div className="text-[10px] text-gray-400">Bruto: ${gross.toLocaleString()} | Com: -${fee.toLocaleString()} ({p.fee_percentage}%)</div>
                    </td>
                    <td className="px-6 py-4">
                      {p.status === 'paid' && (
                         <div className="flex flex-col gap-1">
                           <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest rounded-md bg-green-100 text-green-800"><CheckCircle className="w-3 h-3" /> Pagado</span>
                           {p.paid_at && <span className="text-[9px] text-gray-400">{new Date(p.paid_at).toLocaleDateString('es')}</span>}
                         </div>
                      )}
                      {p.status === 'pending' && <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest rounded-md bg-amber-100 text-amber-800"><Clock className="w-3 h-3" /> Pendiente</span>}
                      {p.status === 'held' && <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest rounded-md bg-red-100 text-red-800"><AlertTriangle className="w-3 h-3" /> Retenido</span>}
                    </td>
                    <td className="px-6 py-4">
                      <select
                        value={p.status}
                        onChange={(e) => updatePayoutStatus(p.id, e.target.value)}
                        className="text-xs font-bold rounded-lg px-3 py-2 border-gray-200 bg-gray-50 hover:bg-gray-100 focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                      >
                        <option value="pending">Marcar Pendiente</option>
                        <option value="held">Retener Fondos</option>
                        <option value="paid">Marcar Pagado</option>
                      </select>
                    </td>
                  </tr>
                );
              }))}
            </tbody>
          </table>
        </div>
        
        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-gray-200 bg-white flex items-center justify-between">
            <span className="text-sm text-gray-500">
              Mostrando <span className="font-bold">{(page - 1) * pageSize + 1}</span> a <span className="font-bold">{Math.min(page * pageSize, totalRecords)}</span> de <span className="font-bold">{totalRecords}</span> liquidaciones
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4 text-gray-600" />
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4 text-gray-600" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
