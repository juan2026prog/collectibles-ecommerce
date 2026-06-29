import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Store, CheckCircle, XCircle, Clock, AlertTriangle, Search, ChevronLeft, ChevronRight, MailPlus, Award, Trash2, CreditCard } from 'lucide-react';
import { useToast } from '../../components/admin/Toast';
import { useConfirmModal } from '../../components/admin/ConfirmModal';

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

  // Modal / Detail States
  const [selectedVendor, setSelectedVendor] = useState<any | null>(null);
  const [selectedStoreProducts, setSelectedStoreProducts] = useState<any | null>(null);

  const { toast } = useToast();
  const { confirm } = useConfirmModal();

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

  // Sync selectedVendor details on vendor updates
  useEffect(() => {
    if (selectedVendor) {
      const current = vendors.find(v => v.id === selectedVendor.id);
      if (current) {
        setSelectedVendor(current);
      }
    }
  }, [vendors]);

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
        .select(`
          *, 
          profiles:profiles!vendors_id_fkey(email, first_name, last_name, phone),
          vendor_stores(
            *,
            vendor_store_brands(
              *,
              brands(*)
            )
          ),
          products(
            *,
            brand:brands(name),
            product_variants(inventory_count)
          ),
          ml_seller_accounts(id, nickname)
        `, { count: 'exact' });

      if (searchTerm) {
        query = query.ilike('store_name', `%${searchTerm}%`);
      }

      const [vendorsRes, metricsRes] = await Promise.all([
        query.order('created_at', { ascending: false }).range(from, to),
        supabase.rpc('get_vendor_sales_metrics')
      ]);

      if (vendorsRes.error) throw vendorsRes.error;

      const metricsMap = new Map((metricsRes.data || []).map((m: any) => [m.vendor_id, m]));
      const vendorsWithMetrics = (vendorsRes.data || []).map((v: any) => ({
        ...v,
        metrics: metricsMap.get(v.id) || {
          confirmed_gmv: 0,
          pending_gmv: 0,
          liquidated_gmv: 0,
          refunded_amount: 0,
          disputed_amount: 0,
          marketplace_fees: 0,
          net_to_vendor: 0,
          order_count: 0,
          suborder_count: 0
        }
      }));

      setVendors(vendorsWithMetrics);
      if (vendorsRes.count !== null) setTotalRecords(vendorsRes.count);
    } catch (err) {
      console.error('Error fetching vendors:', err);
    }
    setLoading(false);
  }

  async function updateVendorStatus(vendorId: string, status: string) {
    const actionText = status === 'active' ? 'reactivar' : 'suspender';
    if (!(await confirm(`¿Estás seguro de que deseas ${actionText} a este vendedor?`))) return;

    try {
      const { error } = await supabase
        .from('vendors')
        .update({ status })
        .eq('id', vendorId);

      if (error) throw error;
      
      setVendors(current =>
        current.map(v => v.id === vendorId ? { ...v, status } : v)
      );
      toast.success(status === 'active' ? 'Vendedor reactivado con éxito' : 'Vendedor suspendido con éxito');
    } catch (err: any) {
      console.error('Error updating vendor status:', err);
      toast.error('Error al actualizar el estado del vendor: ' + err.message);
    }
  }

  async function deleteVendor(vendorId: string) {
    if (!(await confirm('¿Estás completamente seguro de que deseas eliminar permanentemente a este vendedor? Esta acción borrará todas sus tiendas, productos y configuraciones asociadas de forma irreversible.'))) return;

    try {
      const { error } = await supabase
        .from('vendors')
        .delete()
        .eq('id', vendorId);

      if (error) throw error;

      setVendors(current => current.filter(v => v.id !== vendorId));
      toast.success('Vendedor eliminado con éxito');
    } catch (err: any) {
      console.error('Error deleting vendor:', err);
      toast.error('Error al eliminar el vendedor: ' + err.message);
    }
  }

  async function handleDeleteStore(vendorId: string, storeId: string) {
    if (!(await confirm('¿Estás seguro de que deseas eliminar permanentemente esta tienda? Todos sus productos asociados serán eliminados también.'))) return;

    try {
      const { error } = await supabase
        .from('vendor_stores')
        .delete()
        .eq('id', storeId);

      if (error) throw error;

      // Update local state
      setVendors(current => current.map(v => {
        if (v.id !== vendorId) return v;
        return {
          ...v,
          vendor_stores: v.vendor_stores?.filter((s: any) => s.id !== storeId) || []
        };
      }));

      // If selectedVendor is open, update its state too
      if (selectedVendor && selectedVendor.id === vendorId) {
        setSelectedVendor(prev => {
          if (!prev) return null;
          return {
            ...prev,
            vendor_stores: prev.vendor_stores?.filter((s: any) => s.id !== storeId) || []
          };
        });
      }

      toast.success('Tienda eliminada con éxito');
    } catch (err: any) {
      console.error('Error deleting store:', err);
      toast.error('Error al eliminar la tienda: ' + err.message);
    }
  }

  async function handleToggleStoreOfficial(vendorId: string, storeId: string, currentOfficial: boolean) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const payload: any = {
        is_official: !currentOfficial
      };
      
      if (!currentOfficial) {
        payload.official_badge_text = 'Tienda Oficial';
        payload.approved_by = user?.id || null;
        payload.approved_at = new Date().toISOString();
        payload.status = 'active';
      } else {
        payload.official_badge_text = null;
        payload.approved_by = null;
        payload.approved_at = null;
      }

      const { error } = await supabase
        .from('vendor_stores')
        .update(payload)
        .eq('id', storeId);

      if (error) throw error;
      toast.success(currentOfficial ? 'Tienda desmarcada como oficial' : 'Tienda marcada como oficial');
      
      // Update local state
      setVendors(current =>
        current.map(v => v.id === vendorId ? {
          ...v,
          vendor_stores: v.vendor_stores.map((s: any) => s.id === storeId ? { ...s, ...payload } : s)
        } : v)
      );
    } catch (err: any) {
      toast.error('Error al actualizar estado oficial: ' + err.message);
    }
  }

  async function handleUpdateStoreStatus(vendorId: string, storeId: string, status: 'active' | 'suspended') {
    const actionText = status === 'active' ? 'aprobar' : 'suspender';
    if (!(await confirm(`¿Estás seguro de que deseas ${actionText} esta tienda?`))) return;

    try {
      const { error } = await supabase
        .from('vendor_stores')
        .update({ status })
        .eq('id', storeId);

      if (error) throw error;
      toast.success(`Tienda puesta en estado ${status}`);
      
      // Update local state
      setVendors(current =>
        current.map(v => v.id === vendorId ? {
          ...v,
          vendor_stores: v.vendor_stores.map((s: any) => s.id === storeId ? { ...s, status } : s)
        } : v)
      );
    } catch (err: any) {
      toast.error('Error al actualizar tienda: ' + err.message);
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
                  <span className="text-lg font-black text-emerald-600">${Number(tv.gmv).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
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
                <th className="p-4 font-bold text-[10px] uppercase tracking-wider">Vendor / Empresa</th>
                <th className="p-4 font-bold text-[10px] uppercase tracking-wider">Email Principal</th>
                <th className="p-4 font-bold text-[10px] uppercase tracking-wider">Teléfono</th>
                <th className="p-4 font-bold text-[10px] uppercase tracking-wider">Estado</th>
                <th className="p-4 font-bold text-[10px] uppercase tracking-wider">KYC</th>
                <th className="p-4 font-bold text-[10px] uppercase tracking-wider">Tiendas</th>
                <th className="p-4 font-bold text-[10px] uppercase tracking-wider">GMV Confirmado</th>
                <th className="p-4 font-bold text-[10px] uppercase tracking-wider text-center">Productos</th>
                <th className="p-4 font-bold text-[10px] uppercase tracking-wider text-center">Mercado Libre</th>
                <th className="p-4 font-bold text-[10px] uppercase tracking-wider">Fecha Alta</th>
                <th className="p-4 font-bold text-[10px] uppercase tracking-wider text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={11} className="p-8 text-center text-gray-500 animate-pulse">Cargando...</td></tr>
              ) : vendors.length === 0 ? (
                <tr><td colSpan={11} className="p-8 text-center text-gray-500">No se encontraron vendors.</td></tr>
              ) : (
                vendors.map(v => {
                  const storeNames = v.vendor_stores?.map((s: any) => s.store_name).join(', ') || 'Ninguna';
                  const prodCount = v.products?.length || 0;
                  const mlConnected = (v.ml_seller_accounts?.length || 0) > 0;
                  return (
                    <tr key={v.id} className="hover:bg-gray-50 transition-colors">
                      {/* Vendor / Empresa */}
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg border border-gray-200 overflow-hidden bg-white flex items-center justify-center flex-shrink-0">
                            {v.logo_url ? <img src={v.logo_url} alt="" className="w-full h-full object-cover" /> : <Store className="w-5 h-5 text-gray-300" />}
                          </div>
                          <div>
                            <p className="font-bold text-gray-900">{v.store_name}</p>
                            <p className="text-xs text-gray-500">{v.company_name || 'Razón social no especificada'}</p>
                          </div>
                        </div>
                      </td>
                      
                      {/* Email usuario principal */}
                      <td className="p-4">
                        <p className="text-xs text-gray-500 font-semibold">{v.profiles?.email || '—'}</p>
                      </td>

                      {/* Teléfono */}
                      <td className="p-4">
                        <p className="text-xs text-gray-500 font-semibold">{v.contact_phone || v.profiles?.phone || '—'}</p>
                      </td>

                      {/* Estado */}
                      <td className="p-4">
                        <span className={`inline-flex px-2 py-1 rounded-full text-xs font-bold ${
                          v.status === 'active' ? 'bg-teal-100 text-teal-800' : 'bg-gray-100 text-gray-800'
                        }`}>
                          {v.status === 'active' ? 'Activo' : 'Suspendido'}
                        </span>
                      </td>

                      {/* KYC */}
                      <td className="p-4">
                        {v.kyc_status === 'approved' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">
                            Aprobado
                          </span>
                        ) : v.kyc_status === 'rejected' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700">
                            Rechazado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
                            Pendiente
                          </span>
                        )}
                      </td>

                       {/* Tiendas */}
                      <td className="p-4 max-w-xs truncate" title={storeNames}>
                        <p className="text-xs font-semibold text-gray-800">{v.vendor_stores?.length || 0} tiendas</p>
                        <p className="text-[10px] text-gray-400 truncate">{storeNames}</p>
                      </td>

                      {/* GMV Confirmado */}
                      <td className="p-4 font-semibold text-emerald-600">
                        ${Number(v.metrics?.confirmed_gmv || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>

                      {/* Productos */}
                      <td className="p-4 text-center font-bold text-gray-805">
                        {prodCount}
                      </td>

                      {/* Mercado Libre conectado */}
                      <td className="p-4 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          mlConnected ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-gray-50 text-gray-400 border border-gray-200'
                        }`}>
                          {mlConnected ? 'Sí' : 'No'}
                        </span>
                      </td>

                      {/* Fecha de alta */}
                      <td className="p-4 text-xs text-gray-500 font-semibold">
                        {v.created_at ? new Date(v.created_at).toLocaleDateString('es') : '—'}
                      </td>

                      {/* Acciones */}
                      <td className="p-4 text-right">
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() => setSelectedVendor(v)}
                            className="bg-teal-50 hover:bg-teal-100 text-teal-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                          >
                            Ver Detalle
                          </button>

                          {v.status === 'active' ? (
                            <button
                              onClick={() => updateVendorStatus(v.id, 'suspended')}
                              className="bg-amber-50 hover:bg-amber-100 text-amber-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                            >
                              Suspender
                            </button>
                          ) : (
                            <button
                              onClick={() => updateVendorStatus(v.id, 'active')}
                              className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                            >
                              Reactivar
                            </button>
                          )}

                          <button
                            onClick={() => deleteVendor(v.id)}
                            className="bg-red-50 hover:bg-red-100 text-red-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                          >
                            Eliminar
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

      {/* Vendor Detail Modal */}
      {selectedVendor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-5xl shadow-2xl overflow-hidden my-8" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h3 className="font-bold text-xl text-gray-900 flex items-center gap-2">
                <Store className="w-5 h-5 text-teal-600" /> Detalle del Vendor: {selectedVendor.store_name}
              </h3>
              <button onClick={() => setSelectedVendor(null)} className="text-gray-400 hover:text-gray-600 text-2xl font-bold">&times;</button>
            </div>
            
            <div className="p-6 space-y-8 max-h-[80vh] overflow-y-auto">
              {/* Datos del Vendor */}
              <div>
                <h4 className="font-bold text-sm text-gray-900 uppercase tracking-wider border-b pb-2 mb-4">Datos del Vendor</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
                  <div>
                    <span className="text-xs text-gray-400 font-bold block mb-1">Nombre Comercial</span>
                    <span className="font-semibold text-gray-805">{selectedVendor.store_name || '—'}</span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400 font-bold block mb-1">Razón Social</span>
                    <span className="font-semibold text-gray-805">{selectedVendor.company_name || '—'}</span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400 font-bold block mb-1">RUT / Tax ID</span>
                    <span className="font-semibold text-gray-805">{selectedVendor.tax_id || '—'}</span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400 font-bold block mb-1">Email Principal</span>
                    <span className="font-semibold text-gray-805">{selectedVendor.contact_email || selectedVendor.profiles?.email || '—'}</span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400 font-bold block mb-1">Teléfono</span>
                    <span className="font-semibold text-gray-850">{selectedVendor.contact_phone || selectedVendor.profiles?.phone || '—'}</span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400 font-bold block mb-1">Estado</span>
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-bold uppercase ${selectedVendor.status === 'active' ? 'bg-teal-100 text-teal-800' : 'bg-gray-100 text-gray-800'}`}>
                      {selectedVendor.status === 'active' ? 'Activo' : 'Suspendido'}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400 font-bold block mb-1">Comisión base</span>
                    <span className="font-semibold text-gray-805">{selectedVendor.base_commission_rate}%</span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400 font-bold block mb-1">Promociones Opt-In</span>
                    <span className="font-semibold text-gray-805">{selectedVendor.promotions_opt_in ? 'Sí' : 'No'}</span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400 font-bold block mb-1">Mercado Libre Conectado</span>
                    <span className="font-semibold text-gray-805">{(selectedVendor.ml_seller_accounts?.length || 0) > 0 ? 'Sí' : 'No'}</span>
                  </div>
                </div>
              </div>

              {/* Métricas de Ventas Reales */}
              <div>
                <h4 className="font-bold text-sm text-gray-900 uppercase tracking-wider border-b pb-2 mb-4 flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-teal-600" /> Métricas de Ventas Reales (Marketplace)
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                    <span className="text-[10px] text-gray-400 font-black uppercase tracking-wider block mb-1">GMV Confirmado</span>
                    <span className="font-black text-lg text-emerald-600">
                      ${Number(selectedVendor.metrics?.confirmed_gmv || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                    <span className="text-[10px] text-gray-400 font-black uppercase tracking-wider block mb-1">Pendiente de Liquidar</span>
                    <span className="font-black text-lg text-amber-600">
                      ${Number((selectedVendor.metrics?.confirmed_gmv || 0) - (selectedVendor.metrics?.liquidated_gmv || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                    <span className="text-[10px] text-gray-400 font-black uppercase tracking-wider block mb-1">Liquidado</span>
                    <span className="font-black text-lg text-teal-600">
                      ${Number(selectedVendor.metrics?.liquidated_gmv || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                    <span className="text-[10px] text-gray-400 font-black uppercase tracking-wider block mb-1">GMV Pendiente (Sin entregar)</span>
                    <span className="font-black text-lg text-gray-700">
                      ${Number(selectedVendor.metrics?.pending_gmv || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                    <span className="text-[10px] text-gray-400 font-black uppercase tracking-wider block mb-1">Reembolsado</span>
                    <span className="font-black text-lg text-red-600">
                      ${Number(selectedVendor.metrics?.refunded_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                    <span className="text-[10px] text-gray-400 font-black uppercase tracking-wider block mb-1">En Disputa</span>
                    <span className="font-black text-lg text-purple-600">
                      ${Number(selectedVendor.metrics?.disputed_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                    <span className="text-[10px] text-gray-400 font-black uppercase tracking-wider block mb-1">Comisión Collectibles</span>
                    <span className="font-black text-lg text-indigo-600">
                      ${Number(selectedVendor.metrics?.marketplace_fees || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                    <span className="text-[10px] text-gray-400 font-black uppercase tracking-wider block mb-1">Neto Vendor</span>
                    <span className="font-black text-lg text-teal-800">
                      ${Number(selectedVendor.metrics?.net_to_vendor || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Usuarios Asociados */}
              <div>
                <h4 className="font-bold text-sm text-gray-900 uppercase tracking-wider border-b pb-2 mb-4">Usuarios Asociados</h4>
                <div className="overflow-x-auto border border-gray-100 rounded-xl">
                  <table className="min-w-full divide-y divide-gray-200 text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left font-bold text-gray-500">Email</th>
                        <th className="px-4 py-2 text-left font-bold text-gray-500">Rol</th>
                        <th className="px-4 py-2 text-left font-bold text-gray-500">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-150">
                      <tr>
                        <td className="px-4 py-3 font-semibold text-gray-805">{selectedVendor.profiles?.email}</td>
                        <td className="px-4 py-3 text-gray-500">Vendedor Principal</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${selectedVendor.status === 'active' ? 'bg-teal-100 text-teal-800' : 'bg-gray-100 text-gray-800'}`}>
                            {selectedVendor.status === 'active' ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Tiendas del Vendor */}
              <div>
                <h4 className="font-bold text-sm text-gray-900 uppercase tracking-wider border-b pb-2 mb-4">Tiendas del Vendor</h4>
                <div className="overflow-x-auto border border-gray-100 rounded-xl">
                  <table className="min-w-full divide-y divide-gray-200 text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left font-bold text-gray-500">Nombre Tienda</th>
                        <th className="px-4 py-2 text-left font-bold text-gray-500">Slug / URL</th>
                        <th className="px-4 py-2 text-left font-bold text-gray-500">Estado</th>
                        <th className="px-4 py-2 text-left font-bold text-gray-500">Marcas Asociadas</th>
                        <th className="px-4 py-2 text-left font-bold text-gray-500">Tienda Oficial</th>
                        <th className="px-4 py-2 text-left font-bold text-gray-500">Productos</th>
                        <th className="px-4 py-2 text-right font-bold text-gray-500">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-150">
                      {(!selectedVendor.vendor_stores || selectedVendor.vendor_stores.length === 0) ? (
                        <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400 italic">No hay tiendas registradas para este vendor.</td></tr>
                      ) : (
                        selectedVendor.vendor_stores.map((store: any) => {
                          const storeProds = selectedVendor.products?.filter((p: any) => p.vendor_store_id === store.id) || [];
                          const brandsList = store.vendor_store_brands?.map((b: any) => b.brands?.name).filter(Boolean).join(', ') || 'Ninguna';
                          const isStoreOfficial = !!(store.is_official && store.approved_by && store.approved_at);
                          return (
                            <tr key={store.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3 font-semibold text-gray-805">{store.store_name}</td>
                              <td className="px-4 py-3 text-gray-500 font-mono">/{store.slug}</td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  store.status === 'active' ? 'bg-teal-100 text-teal-800' :
                                  store.status === 'suspended' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-800'
                                }`}>
                                  {store.status === 'active' ? 'Activa' : store.status === 'suspended' ? 'Suspendida' : store.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-gray-500 max-w-xs truncate" title={brandsList}>{brandsList}</td>
                              <td className="px-4 py-3 font-bold text-gray-700">
                                {isStoreOfficial ? (
                                  <span className="text-blue-600 bg-blue-50 px-2 py-0.5 rounded font-black text-[9px] border border-blue-200">SÍ</span>
                                ) : 'NO'}
                              </td>
                              <td className="px-4 py-3 font-semibold text-gray-700">{storeProds.length}</td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex justify-end gap-1">
                                  {/* Toggle Official Store */}
                                  <button
                                    onClick={() => handleToggleStoreOfficial(selectedVendor.id, store.id, isStoreOfficial)}
                                    className={`px-2 py-1 rounded text-[10px] font-bold border transition-colors ${
                                      isStoreOfficial
                                        ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                                        : 'bg-gray-50 text-gray-400 border-gray-200 hover:text-gray-600'
                                    }`}
                                  >
                                    {isStoreOfficial ? 'Quitar Oficial' : 'Hacer Oficial'}
                                  </button>

                                  {/* Approve/Suspend Store */}
                                  {store.status !== 'active' ? (
                                    <button
                                      onClick={() => handleUpdateStoreStatus(selectedVendor.id, store.id, 'active')}
                                      className="px-2 py-1 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                                    >
                                      Aprobar
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => handleUpdateStoreStatus(selectedVendor.id, store.id, 'suspended')}
                                      className="px-2 py-1 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100"
                                    >
                                      Suspender
                                    </button>
                                  )}

                                  {/* Ver productos */}
                                  <button
                                    onClick={() => setSelectedStoreProducts({ store, products: storeProds })}
                                    className="px-2 py-1 rounded text-[10px] font-bold bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200"
                                  >
                                    Productos
                                  </button>

                                  {/* Abrir tienda pública */}
                                  <a
                                    href={`/store/${store.slug}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="px-2 py-1 rounded text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100 text-center"
                                  >
                                    Ver Pública
                                  </a>

                                  {/* Eliminar Tienda */}
                                  <button
                                    onClick={() => handleDeleteStore(selectedVendor.id, store.id)}
                                    className="px-2 py-1 rounded text-[10px] font-bold bg-red-50 text-red-700 border border-red-200 hover:bg-red-100"
                                  >
                                    Eliminar
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
            </div>
            
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end">
              <button onClick={() => setSelectedVendor(null)} className="btn-secondary text-sm font-bold">Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Store Products List Modal */}
      {selectedStoreProducts && (
        <div className="fixed inset-0 z-55 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden my-8" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h3 className="font-bold text-xl text-gray-900 flex items-center gap-2">
                <Store className="w-5 h-5 text-teal-600" /> Productos de la Tienda: {selectedStoreProducts.store.store_name}
              </h3>
              <button onClick={() => setSelectedStoreProducts(null)} className="text-gray-400 hover:text-gray-600 text-2xl font-bold">&times;</button>
            </div>
            
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto text-xs">
              <div className="overflow-x-auto border border-gray-100 rounded-xl">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-bold text-gray-500">Producto</th>
                      <th className="px-4 py-3 text-left font-bold text-gray-500">Marca</th>
                      <th className="px-4 py-3 text-left font-bold text-gray-500">Tienda</th>
                      <th className="px-4 py-3 text-left font-bold text-gray-500">Precio</th>
                      <th className="px-4 py-3 text-left font-bold text-gray-500 text-center">Stock</th>
                      <th className="px-4 py-3 text-left font-bold text-gray-500">Estado</th>
                      <th className="px-4 py-3 text-left font-bold text-gray-500 text-center">Visible</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-150">
                    {selectedStoreProducts.products.length === 0 ? (
                      <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400 italic">No hay productos en esta tienda.</td></tr>
                    ) : (
                      selectedStoreProducts.products.map((p: any) => {
                        const totalStock = p.product_variants?.reduce((sum: number, v: any) => sum + (v.inventory_count || 0), 0) || 0;
                        return (
                          <tr key={p.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-semibold text-gray-900">{p.title}</td>
                            <td className="px-4 py-3 text-gray-500">{p.brand?.name || '—'}</td>
                            <td className="px-4 py-3 text-gray-500">{selectedStoreProducts.store.store_name}</td>
                            <td className="px-4 py-3 font-bold text-gray-805">${p.base_price}</td>
                            <td className="px-4 py-3 text-center font-semibold text-gray-700">{totalStock}</td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                p.status === 'published' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-800'
                              }`}>
                                {p.status === 'published' ? 'Publicado' : p.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center font-bold text-gray-700">{p.is_active ? 'SÍ' : 'NO'}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end">
              <button onClick={() => setSelectedStoreProducts(null)} className="btn-secondary text-sm font-bold">Volver</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
