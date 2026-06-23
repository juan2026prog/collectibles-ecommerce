import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Store, CheckCircle, XCircle, Clock, AlertTriangle, Search, ChevronLeft, ChevronRight, MailPlus } from 'lucide-react';

export default function AdminVendors() {
  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Pagination
  const [page, setPage] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const pageSize = 25;

  const [stats, setStats] = useState({ totalVendors: 0, activeVendors: 0, gmv: 0, commissions: 0 });
  const [topVendors, setTopVendors] = useState<any[]>([]);

  // Invite Modal
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteStoreName, setInviteStoreName] = useState('');
  const [inviteCommission, setInviteCommission] = useState(10);
  const [inviteStatus, setInviteStatus] = useState('active');
  const [inviteMessage, setInviteMessage] = useState('');
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    fetchVendors();
  }, [page, searchTerm]);

  async function fetchStats() {
    try {
      const [kpisRes, topRes] = await Promise.all([
        supabase.rpc('get_marketplace_kpis'),
        supabase.rpc('get_top_vendors', { p_limit: 5 })
      ]);

      if (!kpisRes.error && kpisRes.data && kpisRes.data.length > 0) {
        setStats({
          totalVendors: kpisRes.data[0].total_vendors || 0,
          activeVendors: kpisRes.data[0].active_vendors || 0,
          gmv: kpisRes.data[0].total_gmv || 0,
          commissions: kpisRes.data[0].total_commissions || 0
        });
      }

      if (!topRes.error && topRes.data) {
        setTopVendors(topRes.data);
      }
    } catch (err) {
      console.error('Error fetching stats via RPC:', err);
    }
  }

  async function fetchVendors() {
    setLoading(true);
    try {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from('vendors')
        .select(`*, profiles:profiles!vendors_id_fkey(email, first_name, last_name)`, { count: 'exact' });

      if (searchTerm) {
        query = query.ilike('store_name', `%${searchTerm}%`);
      }

      const { data, count, error } = await query
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;
      setVendors(data || []);
      if (count !== null) setTotalRecords(count);
    } catch (err) {
      console.error('Error fetching vendors:', err);
    }
    setLoading(false);
  }

  async function updateVendorStatus(vendorId: string, status: string) {
    try {
      const { error } = await supabase
        .from('vendors')
        .update({ status })
        .eq('id', vendorId);

      if (error) throw error;
      
      setVendors(current =>
        current.map(v => v.id === vendorId ? { ...v, status } : v)
      );
      setStats(prev => ({
        ...prev,
        activeVendors: prev.activeVendors + (status === 'active' ? 1 : -1)
      }));
    } catch (err) {
      console.error('Error updating vendor status:', err);
      alert('Error al actualizar el estado del vendor.');
    }
  }

  async function updateVendorCommission(vendorId: string, base_commission_rate: number) {
    if (base_commission_rate < 0 || base_commission_rate > 100) {
       alert('La comisión debe estar entre 0 y 100');
       return;
    }
    try {
      const { error } = await supabase
        .from('vendors')
        .update({ base_commission_rate })
        .eq('id', vendorId);

      if (error) throw error;
      
      setVendors(current =>
        current.map(v => v.id === vendorId ? { ...v, base_commission_rate } : v)
      );
    } catch (err) {
      console.error('Error updating commission:', err);
      alert('Error al actualizar la comisión.');
    }
  }

  const totalPages = Math.ceil(totalRecords / pageSize);

  async function handleInviteVendor(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail || !inviteStoreName) return;
    setInviting(true);
    try {
      const { data: inviteId, error } = await supabase.rpc('create_vendor_invitation', {
        p_email: inviteEmail,
        p_store_name: inviteStoreName,
        p_commission_rate: inviteCommission,
        p_initial_status: inviteStatus,
        p_message: inviteMessage
      });

      if (error) throw error;

      // Recuperar el token para generar el enlace
      const { data: inviteData, error: fetchError } = await supabase
        .from('vendor_invitations')
        .select('token, expires_at')
        .eq('id', inviteId)
        .single();
        
      if (fetchError) throw fetchError;

      const inviteLink = `${window.location.origin}/login_vendors?invite=${inviteData.token}`;

      // Enviar email vía Edge Function
      await supabase.functions.invoke('transactional-emails', {
        body: {
          type: 'vendor_invitation',
          email: inviteEmail,
          store_name: inviteStoreName,
          invite_link: inviteLink,
          expires_at: new Date(inviteData.expires_at).toLocaleDateString()
        }
      });

      alert('Invitación enviada exitosamente.');
      setShowInviteModal(false);
      setInviteEmail('');
      setInviteStoreName('');
      setInviteMessage('');
      setInviteCommission(10);
      setInviteStatus('active');
    } catch (err: any) {
      console.error('Error enviando invitación:', err);
      alert('Error enviando invitación: ' + err.message);
    }
    setInviting(false);
  }

  return (
    <div className="max-w-7xl mx-auto animate-fade-in space-y-6 pb-20">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Store className="w-6 h-6 text-teal-600" />
            Marketplace Vendors
          </h1>
          <p className="text-gray-500 mt-1">
            Gestiona los vendedores de la plataforma.
          </p>
        </div>
        <button
          onClick={() => setShowInviteModal(true)}
          className="btn-primary flex items-center gap-2"
        >
          <MailPlus className="w-5 h-5" />
          Invitar Vendor
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Total Vendors</p>
          <p className="text-3xl font-black text-gray-900">{stats.totalVendors}</p>
        </div>
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Vendors Activos</p>
          <p className="text-3xl font-black text-teal-600">{stats.activeVendors}</p>
        </div>
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">GMV (Bruto Vendedores)</p>
          <p className="text-3xl font-black text-gray-900">${stats.gmv.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
            <Store className="w-24 h-24 text-indigo-500 -rotate-12" />
          </div>
          <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1 relative z-10">Comisiones Ganadas</p>
          <p className="text-3xl font-black text-indigo-600 relative z-10">${stats.commissions.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
      </div>

      {topVendors.length > 0 && (
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <h2 className="text-sm font-black text-gray-900 uppercase tracking-widest mb-4">Top 5 Vendors por GMV</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {topVendors.map((tv, idx) => (
              <div key={tv.vendor_id} className="flex flex-col p-4 bg-gray-50 rounded-lg border border-gray-100">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-black text-gray-400">#{idx + 1}</span>
                  <span className="text-sm font-bold text-gray-900 truncate">{tv.store_name}</span>
                </div>
                <div className="mt-auto">
                  <span className="text-lg font-black text-emerald-600">${tv.gmv.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-200 bg-gray-50 flex flex-col sm:flex-row gap-4 justify-between items-center">
          <div className="relative w-full sm:w-96">
            <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Buscar tienda..." 
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-600">
              <tr>
                <th className="p-4 font-bold">Tienda</th>
                <th className="p-4 font-bold">Responsable</th>
                <th className="p-4 font-bold">Comisión (%)</th>
                <th className="p-4 font-bold">KYC</th>
                <th className="p-4 font-bold">Estado</th>
                <th className="p-4 font-bold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={6} className="p-8 text-center text-gray-500 animate-pulse">Cargando...</td></tr>
              ) : vendors.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-gray-500">No se encontraron vendors.</td></tr>
              ) : (
                vendors.map(v => (
                  <tr key={v.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg border border-gray-200 overflow-hidden bg-white flex items-center justify-center flex-shrink-0">
                          {v.logo_url ? <img src={v.logo_url} alt="" className="w-full h-full object-cover" /> : <Store className="w-5 h-5 text-gray-300" />}
                        </div>
                        <div>
                          <p className="font-bold text-gray-900">{v.store_name}</p>
                          <p className="text-xs text-gray-500">/{v.slug}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <p className="font-medium text-gray-900">{v.profiles?.first_name} {v.profiles?.last_name}</p>
                      <p className="text-xs text-gray-500">{v.profiles?.email}</p>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-1">
                        <input 
                          type="number"
                          min="0"
                          max="100"
                          defaultValue={v.base_commission_rate !== null ? v.base_commission_rate : 10}
                          onBlur={(e) => {
                            const val = Number(e.target.value);
                            if (val !== v.base_commission_rate) {
                              updateVendorCommission(v.id, val);
                            }
                          }}
                          className="w-16 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-teal-500 outline-none font-bold"
                        />
                        <span className="text-gray-500 font-bold text-sm">%</span>
                      </div>
                    </td>
                    <td className="p-4">
                      {v.kyc_status === 'approved' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">
                          <CheckCircle className="w-3.5 h-3.5" /> Aprobado
                        </span>
                      ) : v.kyc_status === 'rejected' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700">
                          <XCircle className="w-3.5 h-3.5" /> Rechazado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
                          <Clock className="w-3.5 h-3.5" /> Pendiente
                        </span>
                      )}
                    </td>
                    <td className="p-4">
                      <select
                        value={v.status}
                        onChange={(e) => updateVendorStatus(v.id, e.target.value)}
                        className={`text-xs font-bold rounded-full px-3 py-1.5 border-0 focus:ring-2 ${
                          v.status === 'active' ? 'bg-teal-100 text-teal-800' : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        <option value="active">Activo</option>
                        <option value="suspended">Suspendido</option>
                      </select>
                    </td>
                    <td className="p-4 text-right">
                      {v.status === 'suspended' && (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded">
                          <AlertTriangle className="w-3 h-3" /> Tienda inactiva
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-gray-200 bg-white flex items-center justify-between">
            <span className="text-sm text-gray-500">
              Mostrando <span className="font-bold">{(page - 1) * pageSize + 1}</span> a <span className="font-bold">{Math.min(page * pageSize, totalRecords)}</span> de <span className="font-bold">{totalRecords}</span> vendors
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4 text-gray-600" />
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4 text-gray-600" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-fade-in-up">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <MailPlus className="w-5 h-5 text-teal-600" />
                Invitar nuevo Vendor
              </h2>
              <button onClick={() => setShowInviteModal(false)} className="text-gray-400 hover:text-gray-600">
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            
            <form onSubmit={handleInviteVendor} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Email del Vendor</label>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-teal-500"
                  placeholder="vendor@ejemplo.com"
                />
              </div>
              
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Nombre Comercial (Tienda)</label>
                <input
                  type="text"
                  required
                  value={inviteStoreName}
                  onChange={(e) => setInviteStoreName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-teal-500"
                  placeholder="Mi Tienda Cool"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Comisión (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    required
                    value={inviteCommission}
                    onChange={(e) => setInviteCommission(Number(e.target.value))}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Estado Inicial</label>
                  <select
                    value={inviteStatus}
                    onChange={(e) => setInviteStatus(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="active">Activo</option>
                    <option value="pending">Pendiente</option>
                  </select>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Mensaje Opcional</label>
                <textarea
                  value={inviteMessage}
                  onChange={(e) => setInviteMessage(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-teal-500"
                  placeholder="Mensaje personalizado..."
                  rows={2}
                ></textarea>
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={inviting}
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-bold flex items-center gap-2 disabled:opacity-50"
                >
                  {inviting ? 'Enviando...' : 'Enviar Invitación'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
