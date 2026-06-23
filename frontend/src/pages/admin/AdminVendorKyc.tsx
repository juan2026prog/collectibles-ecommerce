import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { ShieldCheck, CheckCircle, XCircle, AlertTriangle, FileText, Search, ChevronLeft, ChevronRight } from 'lucide-react';

export default function AdminVendorKyc() {
  const [kycRecords, setKycRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [searchQuery, setSearchQuery] = useState('');

  // Pagination
  const [page, setPage] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const pageSize = 50;

  useEffect(() => {
    fetchKyc();
  }, [page, statusFilter, searchQuery]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [statusFilter, searchQuery]);

  async function fetchKyc() {
    setLoading(true);
    try {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from('vendors')
        .select(`
          id, store_name, tax_id, company_name, kyc_status, kyc_documents,
          profiles:profiles!vendors_id_fkey(email, first_name, last_name)
        `, { count: 'exact' });

      if (statusFilter !== 'all') {
        query = query.eq('kyc_status', statusFilter);
      }

      if (searchQuery) {
        query = query.or(`store_name.ilike.%${searchQuery}%,company_name.ilike.%${searchQuery}%`);
      }

      const { data, count, error } = await query
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;
      setKycRecords(data || []);
      if (count !== null) setTotalRecords(count);
    } catch (err) {
      console.error('Error fetching KYC:', err);
    }
    setLoading(false);
  }

  async function updateKycStatus(vendorId: string, status: string) {
    if (!confirm(`¿Estás seguro de marcar este KYC como ${status}?`)) return;
    try {
      const { error } = await supabase
        .from('vendors')
        .update({ kyc_status: status })
        .eq('id', vendorId);

      if (error) throw error;
      
      setKycRecords(current =>
        current.map(k => k.id === vendorId ? { ...k, kyc_status: status } : k)
      );
    } catch (err) {
      console.error('Error updating KYC status:', err);
      alert('Error al actualizar.');
    }
  }

  const totalPages = Math.ceil(totalRecords / pageSize);

  return (
    <div className="max-w-7xl mx-auto animate-fade-in space-y-6 pb-20">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-indigo-600" />
            Verificación KYC Vendors
          </h1>
          <p className="text-gray-500 mt-1">
            Gestiona la documentación legal y fiscal de los vendedores.
          </p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-center bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <div className="relative w-full md:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar tienda o empresa..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="w-full md:w-auto px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
        >
          <option value="pending">Pendientes de Revisión</option>
          <option value="approved">Aprobados</option>
          <option value="rejected">Rechazados</option>
          <option value="all">Todos</option>
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead>
              <tr className="bg-gray-50/80">
                <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Tienda / Usuario</th>
                <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Datos Legales</th>
                <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Documentos</th>
                <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Estado</th>
                <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                 <tr><td colSpan={5} className="p-8 text-center text-gray-500 animate-pulse">Cargando registros KYC...</td></tr>
              ) : kycRecords.length === 0 ? (
                 <tr>
                   <td colSpan={5} className="p-12 text-center text-gray-400">
                     <ShieldCheck className="w-12 h-12 mx-auto mb-3 text-gray-200" />
                     <p className="font-semibold">No hay registros KYC en esta vista</p>
                   </td>
                 </tr>
              ) : (
                kycRecords.map(k => (
                <tr key={k.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="text-sm font-bold text-gray-900">{k.store_name}</div>
                    <div className="text-xs text-gray-500">{k.profiles?.email}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-700"><strong>RS:</strong> {k.company_name || '-'}</div>
                    <div className="text-xs text-gray-500"><strong>RUT:</strong> {k.tax_id || '-'}</div>
                  </td>
                  <td className="px-6 py-4">
                    {k.kyc_documents && k.kyc_documents.length > 0 ? (
                      <span className="text-xs font-bold text-blue-600 flex items-center gap-1"><FileText className="w-3 h-3"/> {k.kyc_documents.length} Archivos</span>
                    ) : (
                      <span className="text-xs text-gray-400">Sin documentos</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {k.kyc_status === 'approved' && <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest rounded-md bg-green-100 text-green-800"><CheckCircle className="w-3 h-3" /> Aprobado</span>}
                    {k.kyc_status === 'pending' && <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest rounded-md bg-yellow-100 text-yellow-800"><AlertTriangle className="w-3 h-3" /> Revisión</span>}
                    {k.kyc_status === 'rejected' && <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest rounded-md bg-red-100 text-red-800"><XCircle className="w-3 h-3" /> Rechazado</span>}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {k.kyc_status !== 'approved' && (
                        <button
                          onClick={() => updateKycStatus(k.id, 'approved')}
                          className="text-xs font-bold text-green-600 bg-green-50 hover:bg-green-100 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                        >
                          <CheckCircle className="w-3 h-3" /> Aprobar
                        </button>
                      )}
                      {k.kyc_status !== 'rejected' && (
                        <button
                          onClick={() => updateKycStatus(k.id, 'rejected')}
                          className="text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                        >
                          <XCircle className="w-3 h-3" /> Rechazar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-gray-200 bg-white flex items-center justify-between">
            <span className="text-sm text-gray-500">
              Mostrando <span className="font-bold">{(page - 1) * pageSize + 1}</span> a <span className="font-bold">{Math.min(page * pageSize, totalRecords)}</span> de <span className="font-bold">{totalRecords}</span> registros
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
