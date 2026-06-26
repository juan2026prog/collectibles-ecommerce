import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { CheckCircle, XCircle, AlertTriangle, ShieldAlert, Award, ArrowRight, Trash2, Edit2, Check, RefreshCw, Store } from 'lucide-react';
import { useToast } from '../../components/admin/Toast';
import { useConfirmModal } from '../../components/admin/ConfirmModal';

export default function AdminOfficialStores() {
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pending' | 'active' | 'suspended' | 'all'>('pending');
  const [editingSlugId, setEditingSlugId] = useState<string | null>(null);
  const [newSlug, setNewSlug] = useState('');
  
  // Merge stores modal/form states
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [sourceStoreId, setSourceStoreId] = useState('');
  const [targetStoreId, setTargetStoreId] = useState('');
  const [merging, setMerging] = useState(false);

  // Official badge configuration states
  const [editingBadgeId, setEditingBadgeId] = useState<string | null>(null);
  const [badgeText, setBadgeText] = useState('');

  // Store Brand approval states
  const [selectedStore, setSelectedStore] = useState<any>(null);
  const [storeBrands, setStoreBrands] = useState<any[]>([]);
  const [loadingBrands, setLoadingBrands] = useState(false);

  const [allBadges, setAllBadges] = useState<any[]>([]);
  const [storeBadgeIds, setStoreBadgeIds] = useState<string[]>([]);
  const [badgeAssignments, setBadgeAssignments] = useState<any[]>([]);

  const { toast } = useToast();
  const { confirm } = useConfirmModal();

  useEffect(() => {
    fetchStores();
    fetchSystemBadges();
  }, []);

  async function fetchStores() {
    setLoading(true);
    try {
      // Fetch stores with vendor profile information
      const { data, error } = await supabase
        .from('vendor_stores')
        .select(`
          *,
          vendors (
            id,
            company_name,
            store_name,
            profiles (
              email
            )
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setStores(data || []);
      
      // Update selected store details if currently open
      if (selectedStore) {
        const updated = data?.find(s => s.id === selectedStore.id);
        if (updated) setSelectedStore(updated);
      }
    } catch (err: any) {
      toast.error('Error al cargar tiendas: ' + err.message);
    }
    setLoading(false);
  }

  async function updateStoreStatus(storeId: string, status: 'active' | 'suspended' | 'draft' | 'archived') {
    const actionText = status === 'active' ? 'aprobar' : status === 'suspended' ? 'suspender' : 'rechazar';
    if (!(await confirm(`¿Estás seguro de que deseas ${actionText} esta tienda?`))) return;

    try {
      const { error } = await supabase
        .from('vendor_stores')
        .update({ status })
        .eq('id', storeId);

      if (error) throw error;
      toast.success(`Tienda puesta en estado ${status}`);
      fetchStores();
    } catch (err: any) {
      toast.error('Error al actualizar tienda: ' + err.message);
    }
  }

  async function handleToggleOfficial(storeId: string, currentOfficial: boolean) {
    try {
      const { error } = await supabase
        .from('vendor_stores')
        .update({ is_official: !currentOfficial })
        .eq('id', storeId);

      if (error) throw error;
      toast.success(currentOfficial ? 'Tienda desmarcada como oficial' : 'Tienda marcada como oficial');
      fetchStores();
    } catch (err: any) {
      toast.error('Error al actualizar estado oficial: ' + err.message);
    }
  }

  async function handleSaveBadgeText(storeId: string) {
    try {
      const { error } = await supabase
        .from('vendor_stores')
        .update({ official_badge_text: badgeText.trim() })
        .eq('id', storeId);

      if (error) throw error;
      toast.success('Texto de insignia actualizado');
      setEditingBadgeId(null);
      fetchStores();
    } catch (err: any) {
      toast.error('Error al guardar insignia: ' + err.message);
    }
  }

  async function handleSaveSlug(storeId: string) {
    if (!newSlug.trim()) return;
    try {
      const { error } = await supabase
        .from('vendor_stores')
        .update({ slug: newSlug.trim().toLowerCase() })
        .eq('id', storeId);

      if (error) throw error;
      toast.success('Slug de tienda actualizado');
      setEditingSlugId(null);
      fetchStores();
    } catch (err: any) {
      toast.error('Error al actualizar slug: ' + err.message);
    }
  }
  async function fetchSystemBadges() {
    try {
      const { data } = await supabase.from('vendor_store_badges').select('*').order('label');
      setAllBadges(data || []);
    } catch (e) {
      console.error(e);
    }
  }

  async function fetchStoreBadgeAssignments(storeId: string) {
    try {
      const { data } = await supabase
        .from('vendor_store_badge_assignments')
        .select('badge_id, status, approved_by, approved_at')
        .eq('vendor_store_id', storeId);
      setBadgeAssignments(data || []);
      setStoreBadgeIds(data?.map(x => x.badge_id) || []);
    } catch (e) {
      console.error(e);
    }
  }

  async function handleAssignBadge(badgeId: string, autoApprove = false) {
    if (!selectedStore) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const status = autoApprove ? 'active' : 'pending_review';
      const approvedBy = autoApprove ? user?.id : null;
      const approvedAt = autoApprove ? new Date().toISOString() : null;

      const { error } = await supabase
        .from('vendor_store_badge_assignments')
        .insert({
          vendor_store_id: selectedStore.id,
          badge_id: badgeId,
          status,
          approved_by: approvedBy,
          approved_at: approvedAt
        });

      if (error) throw error;
      toast.success(autoApprove ? 'Insignia asignada y aprobada' : 'Insignia solicitada (pendiente)');
      fetchStoreBadgeAssignments(selectedStore.id);
    } catch (err: any) {
      toast.error('Error al asignar insignia: ' + err.message);
    }
  }

  async function handleUpdateBadgeStatus(badgeId: string, status: 'active' | 'rejected' | 'revoked') {
    if (!selectedStore) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const approvedBy = status === 'active' ? user?.id : null;
      const approvedAt = status === 'active' ? new Date().toISOString() : null;

      const { error } = await supabase
        .from('vendor_store_badge_assignments')
        .update({
          status,
          approved_by: approvedBy,
          approved_at: approvedAt
        })
        .eq('vendor_store_id', selectedStore.id)
        .eq('badge_id', badgeId);

      if (error) throw error;
      toast.success(`Estado de insignia actualizado a: ${status}`);
      fetchStoreBadgeAssignments(selectedStore.id);
    } catch (err: any) {
      toast.error('Error al actualizar insignia: ' + err.message);
    }
  }

  async function handleDeleteBadgeAssignment(badgeId: string) {
    if (!selectedStore) return;
    if (!(await confirm('¿Estás seguro de que deseas eliminar esta asignación por completo?'))) return;
    try {
      const { error } = await supabase
        .from('vendor_store_badge_assignments')
        .delete()
        .eq('vendor_store_id', selectedStore.id)
        .eq('badge_id', badgeId);

      if (error) throw error;
      toast.success('Asignación eliminada');
      fetchStoreBadgeAssignments(selectedStore.id);
    } catch (err: any) {
      toast.error('Error al eliminar asignación: ' + err.message);
    }
  }
  async function fetchStoreBrands(storeId: string) {
    setLoadingBrands(true);
    try {
      const { data, error } = await supabase
        .from('vendor_store_brands')
        .select(`
          id,
          status,
          created_at,
          brands (
            id,
            name,
            logo_url
          )
        `)
        .eq('vendor_store_id', storeId);

      if (error) throw error;
      setStoreBrands(data || []);
    } catch (err: any) {
      toast.error('Error al cargar marcas asociadas: ' + err.message);
    }
    setLoadingBrands(false);
  }

  useEffect(() => {
    if (selectedStore) {
      fetchStoreBrands(selectedStore.id);
      fetchStoreBadgeAssignments(selectedStore.id);
    } else {
      setStoreBrands([]);
      setStoreBadgeIds([]);
      setBadgeAssignments([]);
    }
  }, [selectedStore]);

  async function updateBrandAssociationStatus(associationId: string, status: 'approved' | 'rejected') {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('vendor_store_brands')
        .update({
          status,
          approved_by: user?.id,
          approved_at: new Date().toISOString()
        })
        .eq('id', associationId);

      if (error) throw error;
      toast.success(`Marca ${status === 'approved' ? 'aprobada' : 'rechazada'} para esta tienda`);
      if (selectedStore) fetchStoreBrands(selectedStore.id);
    } catch (err: any) {
      toast.error('Error al actualizar asociación de marca: ' + err.message);
    }
  }

  async function handleMergeStores(e: React.FormEvent) {
    e.preventDefault();
    if (!sourceStoreId || !targetStoreId) {
      toast.error('Selecciona las tiendas de origen y destino');
      return;
    }
    if (sourceStoreId === targetStoreId) {
      toast.error('La tienda origen y destino no pueden ser la misma.');
      return;
    }

    const sourceStore = stores.find(s => s.id === sourceStoreId);
    const targetStore = stores.find(s => s.id === targetStoreId);

    if (!(await confirm(`¿Estás seguro de que deseas fusionar "${sourceStore?.store_name}" en "${targetStore?.store_name}"?\nEsta acción es irreversible y reasignará todos los productos, direcciones y subórdenes del origen al destino, eliminando luego la tienda de origen.`, { danger: true }))) return;

    setMerging(true);
    try {
      // 1. Reassign products
      const { error: prodErr } = await supabase
        .from('products')
        .update({ vendor_store_id: targetStoreId })
        .eq('vendor_store_id', sourceStoreId);
      if (prodErr) throw prodErr;

      // 2. Reassign dispatch addresses (deleting duplicates if necessary)
      // Check for target store default address
      const { data: targetAddrs } = await supabase
        .from('vendor_dispatch_addresses')
        .select('id')
        .eq('vendor_store_id', targetStoreId);
      
      const targetHasAddresses = targetAddrs && targetAddrs.length > 0;

      if (targetHasAddresses) {
        // Just make source addresses non-default if target already has addresses
        const { error: addrErr } = await supabase
          .from('vendor_dispatch_addresses')
          .update({ vendor_store_id: targetStoreId, is_default: false })
          .eq('vendor_store_id', sourceStoreId);
        if (addrErr) throw addrErr;
      } else {
        const { error: addrErr } = await supabase
          .from('vendor_dispatch_addresses')
          .update({ vendor_store_id: targetStoreId })
          .eq('vendor_store_id', sourceStoreId);
        if (addrErr) throw addrErr;
      }

      // 3. Reassign suborders and update names
      const { error: suborderErr } = await supabase
        .from('order_suborders')
        .update({ 
          vendor_store_id: targetStoreId,
          vendor_store_name: targetStore?.store_name
        })
        .eq('vendor_store_id', sourceStoreId);
      if (suborderErr) throw suborderErr;

      // 4. Reassign order items
      const { error: itemErr } = await supabase
        .from('order_items')
        .update({ vendor_store_id: targetStoreId })
        .eq('vendor_store_id', sourceStoreId);
      if (itemErr) throw itemErr;

      // 5. Delete source store
      const { error: deleteErr } = await supabase
        .from('vendor_stores')
        .delete()
        .eq('id', sourceStoreId);
      if (deleteErr) throw deleteErr;

      toast.success('Fusión completada con éxito');
      setShowMergeModal(false);
      setSourceStoreId('');
      setTargetStoreId('');
      fetchStores();
    } catch (err: any) {
      toast.error('Error al fusionar tiendas: ' + err.message);
    } finally {
      setMerging(false);
    }
  }

  const filteredStores = stores.filter(store => {
    if (activeTab === 'pending') return store.status === 'pending_review';
    if (activeTab === 'active') return store.status === 'active';
    if (activeTab === 'suspended') return store.status === 'suspended';
    return true; // all
  });

  return (
    <div className="space-y-6 text-gray-900">
      <div className="flex items-center justify-between pb-4 border-b border-gray-100">
        <div>
          <h2 className="text-2xl font-bold dark:text-white">Tiendas Oficiales / Vendido Por</h2>
          <p className="text-sm text-gray-500 mt-1">
            Revisá, aprobá y gestioná las identidades comerciales oficiales de los vendedores.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowMergeModal(true)}
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-bold text-xs transition-colors"
          >
            Fusionar Duplicados
          </button>
          <button
            onClick={fetchStores}
            className="bg-gray-100 hover:bg-gray-200 text-gray-500 p-2 rounded-lg transition-colors"
            title="Refrescar lista"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs Layout */}
      <div className="flex border-b border-gray-200 gap-6">
        <button
          onClick={() => setActiveTab('pending')}
          className={`pb-3 font-bold text-sm tracking-wide border-b-2 transition-colors ${activeTab === 'pending' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          Pendientes ({stores.filter(s => s.status === 'pending_review').length})
        </button>
        <button
          onClick={() => setActiveTab('active')}
          className={`pb-3 font-bold text-sm tracking-wide border-b-2 transition-colors ${activeTab === 'active' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          Activas ({stores.filter(s => s.status === 'active').length})
        </button>
        <button
          onClick={() => setActiveTab('suspended')}
          className={`pb-3 font-bold text-sm tracking-wide border-b-2 transition-colors ${activeTab === 'suspended' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          Suspendidas ({stores.filter(s => s.status === 'suspended').length})
        </button>
        <button
          onClick={() => setActiveTab('all')}
          className={`pb-3 font-bold text-sm tracking-wide border-b-2 transition-colors ${activeTab === 'all' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          Todas ({stores.length})
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Stores Table */}
        <div className="xl:col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-wider">Tienda</th>
                  <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-wider">Vendor / Email</th>
                  <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-wider">Insignia Oficial</th>
                  <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-wider">Estado</th>
                  <th className="px-6 py-3 text-right text-[10px] font-black text-gray-500 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {loading ? (
                  <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-400">Cargando tiendas oficiales...</td></tr>
                ) : filteredStores.length === 0 ? (
                  <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-400">No se encontraron tiendas en este estado.</td></tr>
                ) : (
                  filteredStores.map(store => (
                    <tr 
                      key={store.id} 
                      className={`hover:bg-gray-50/50 transition-colors ${selectedStore?.id === store.id ? 'bg-primary-50/20' : ''}`}
                    >
                      {/* Logo and Name */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-gray-50 border flex items-center justify-center overflow-hidden flex-shrink-0">
                            {store.logo_url ? <img src={store.logo_url} alt={store.store_name} className="w-full h-full object-contain" /> : <Store className="w-5 h-5 text-gray-400" />}
                          </div>
                          <div>
                            <div className="font-bold text-gray-900 text-sm">{store.store_name}</div>
                            {editingSlugId === store.id ? (
                              <div className="flex items-center gap-1.5 mt-1">
                                <input
                                  type="text"
                                  value={newSlug}
                                  onChange={e => setNewSlug(e.target.value)}
                                  className="border rounded px-2 py-0.5 text-xs text-gray-900 bg-gray-50"
                                />
                                <button onClick={() => handleSaveSlug(store.id)} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"><Check className="w-3.5 h-3.5" /></button>
                                <button onClick={() => setEditingSlugId(null)} className="p-1 text-red-600 hover:bg-red-50 rounded"><XCircle className="w-3.5 h-3.5" /></button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 mt-0.5 text-xs text-gray-400">
                                <span className="font-mono bg-gray-50 px-1.5 py-0.5 rounded">/{store.slug}</span>
                                <button 
                                  onClick={() => { setEditingSlugId(store.id); setNewSlug(store.slug); }} 
                                  className="text-gray-400 hover:text-gray-600 p-0.5"
                                  title="Editar slug/URL"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Vendor details */}
                      <td className="px-6 py-4">
                        <div className="text-xs text-gray-950 font-bold">{store.vendors?.company_name || store.vendors?.store_name || 'Desconocido'}</div>
                        <div className="text-[11px] text-gray-400 font-semibold">{store.vendors?.profiles?.email || '-'}</div>
                      </td>

                      {/* Official Badge status */}
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1 items-start">
                          <button
                            onClick={() => handleToggleOfficial(store.id, store.is_official)}
                            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black tracking-wider uppercase border transition-colors ${store.is_official ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-gray-50 text-gray-400 border-gray-200 hover:text-gray-600'}`}
                          >
                            <Award className="w-3 h-3" /> {store.is_official ? 'SI' : 'NO'}
                          </button>
                          
                          {store.is_official && (
                            <div className="flex items-center gap-1 mt-1">
                              {editingBadgeId === store.id ? (
                                <div className="flex items-center gap-1">
                                  <input
                                    type="text"
                                    value={badgeText}
                                    onChange={e => setBadgeText(e.target.value)}
                                    className="border rounded px-2 py-0.5 text-[10px] font-medium text-gray-900 bg-gray-50"
                                    placeholder="Oficial"
                                  />
                                  <button onClick={() => handleSaveBadgeText(store.id)} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"><Check className="w-3 h-3" /></button>
                                  <button onClick={() => setEditingBadgeId(null)} className="p-1 text-red-600 hover:bg-red-50 rounded"><XCircle className="w-3 h-3" /></button>
                                </div>
                              ) : (
                                <div className="text-[10px] font-semibold text-gray-500 flex items-center gap-1 bg-gray-50 px-1.5 py-0.5 rounded">
                                  Insignia: <span className="font-bold text-gray-700">"{store.official_badge_text}"</span>
                                  <button onClick={() => { setEditingBadgeId(store.id); setBadgeText(store.official_badge_text || 'Oficial'); }} className="text-gray-400 hover:text-gray-600">
                                    <Edit2 className="w-2.5 h-2.5" />
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-6 py-4">
                        {store.status === 'active' && <span className="px-2 py-0.5 text-[9px] font-black bg-emerald-100 text-emerald-800 rounded tracking-wider uppercase">ACTIVA</span>}
                        {store.status === 'pending_review' && <span className="px-2 py-0.5 text-[9px] font-black bg-yellow-100 text-yellow-800 rounded tracking-wider uppercase animate-pulse">PENDIENTE</span>}
                        {store.status === 'suspended' && <span className="px-2 py-0.5 text-[9px] font-black bg-red-100 text-red-800 rounded tracking-wider uppercase">SUSPENDIDA</span>}
                        {store.status === 'draft' && <span className="px-2 py-0.5 text-[9px] font-black bg-blue-100 text-blue-800 rounded tracking-wider uppercase">BORRADOR</span>}
                        {store.status === 'archived' && <span className="px-2 py-0.5 text-[9px] font-black bg-gray-100 text-gray-800 rounded tracking-wider uppercase">ARCHIVADA</span>}
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() => setSelectedStore(store)}
                            className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                          >
                            Marcas
                          </button>

                          {store.status !== 'active' && (
                            <button
                              onClick={() => updateStoreStatus(store.id, 'active')}
                              className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg"
                              title="Aprobar Tienda"
                            >
                              <CheckCircle className="w-5 h-5" />
                            </button>
                          )}
                          {store.status === 'active' && (
                            <button
                              onClick={() => updateStoreStatus(store.id, 'suspended')}
                              className="p-1.5 text-yellow-600 hover:bg-yellow-50 rounded-lg"
                              title="Suspender Tienda"
                            >
                              <ShieldAlert className="w-5 h-5" />
                            </button>
                          )}
                          {store.status !== 'draft' && store.status !== 'archived' && (
                            <button
                              onClick={() => updateStoreStatus(store.id, 'draft')}
                              className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
                              title="Rechazar/Mandar a borrador"
                            >
                              <XCircle className="w-5 h-5" />
                            </button>
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

        {/* Store Brands management panel */}
        <div className="xl:col-span-1">
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm sticky top-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Marcas Asociadas</h3>
            <p className="text-xs text-gray-400 mb-6 font-medium">Gestioná y aprobá las marcas oficiales que esta tienda puede representar.</p>

            {selectedStore ? (
              <div className="space-y-6">
                <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 flex items-center gap-3">
                  <Store className="w-5 h-5 text-gray-400" />
                  <div>
                    <div className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">Tienda Seleccionada</div>
                    <div className="font-bold text-gray-900 text-sm">{selectedStore.store_name}</div>
                  </div>
                </div>

                {loadingBrands ? (
                  <div className="text-xs text-gray-400 text-center py-6">Cargando marcas...</div>
                ) : storeBrands.length === 0 ? (
                  <div className="text-xs text-gray-400 text-center py-6 italic">Esta tienda no tiene solicitudes de marcas.</div>
                ) : (
                  <div className="space-y-3">
                    {storeBrands.map(sb => (
                      <div key={sb.id} className="p-4 rounded-xl bg-gray-50 border border-gray-100 flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded bg-white border flex items-center justify-center overflow-hidden flex-shrink-0">
                              {sb.brands?.logo_url ? <img src={sb.brands.logo_url} alt={sb.brands.name} className="w-full h-full object-contain" /> : <Award className="w-4 h-4 text-gray-300" />}
                            </div>
                            <div>
                              <div className="text-sm font-semibold text-gray-900">{sb.brands?.name || 'Marca Desconocida'}</div>
                              <div className="text-[10px] text-gray-400 font-medium">Solicitada el {new Date(sb.created_at).toLocaleDateString()}</div>
                            </div>
                          </div>

                          <div>
                            {sb.status === 'approved' && <span className="px-2 py-0.5 text-[8px] font-black bg-emerald-100 text-emerald-800 rounded uppercase">APROBADA</span>}
                            {sb.status === 'rejected' && <span className="px-2 py-0.5 text-[8px] font-black bg-red-100 text-red-800 rounded uppercase">RECHAZADA</span>}
                            {sb.status === 'pending_review' && <span className="px-2 py-0.5 text-[8px] font-black bg-yellow-100 text-yellow-800 rounded uppercase animate-pulse">PENDIENTE</span>}
                          </div>
                        </div>

                        {sb.status === 'pending_review' && (
                          <div className="flex gap-2 border-t border-gray-100 pt-3">
                            <button
                              onClick={() => updateBrandAssociationStatus(sb.id, 'approved')}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1"
                            >
                              <Check className="w-3.5 h-3.5" /> Aprobar
                            </button>
                            <button
                              onClick={() => updateBrandAssociationStatus(sb.id, 'rejected')}
                              className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1"
                            >
                              <XCircle className="w-3.5 h-3.5" /> Rechazar
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Official Badges Assignment */}
                <div className="border-t border-gray-150 pt-6 space-y-4">
                  <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                    <Award className="w-4 h-4 text-primary-600" /> Insignias de la Tienda
                  </h4>
                  
                  <div className="space-y-3">
                    {allBadges.map((b) => {
                      const assignment = badgeAssignments.find(x => x.badge_id === b.id);
                      const isAssigned = !!assignment;
                      
                      return (
                        <div 
                          key={b.id} 
                          className={`p-4 rounded-xl border text-xs flex flex-col gap-3 transition-all ${
                            isAssigned 
                              ? 'border-gray-200 bg-gray-50/50' 
                              : 'border-gray-200 bg-white hover:border-gray-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase inline-block ${b.color_class || 'bg-blue-600 text-white'}`}>
                              {b.label}
                            </span>
                            
                            {isAssigned && (
                              <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${
                                assignment.status === 'active' ? 'bg-emerald-100 text-emerald-800' :
                                assignment.status === 'pending_review' ? 'bg-yellow-100 text-yellow-800' :
                                assignment.status === 'rejected' ? 'bg-red-100 text-red-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {assignment.status}
                              </span>
                            )}
                          </div>
                          
                          <p className="text-[10px] text-gray-400 font-semibold">{b.description || 'Sin descripción'}</p>
                          
                          {/* Metadata */}
                          {isAssigned && assignment.status === 'active' && assignment.approved_at && (
                            <div className="text-[9px] text-gray-400 font-semibold">
                              Aprobada el {new Date(assignment.approved_at).toLocaleDateString()}
                            </div>
                          )}

                          {/* Actions */}
                          <div className="flex gap-1.5 justify-end mt-1">
                            {!isAssigned ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleAssignBadge(b.id, false)}
                                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1 rounded font-bold text-[10px] transition-colors"
                                >
                                  Solicitar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleAssignBadge(b.id, true)}
                                  className="bg-primary-600 hover:bg-primary-700 text-white px-2 py-1 rounded font-bold text-[10px] transition-colors"
                                >
                                  Asignar y Aprobar
                                </button>
                              </>
                            ) : (
                              <>
                                {assignment.status === 'pending_review' && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleUpdateBadgeStatus(b.id, 'active')}
                                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded font-bold text-[10px] transition-colors"
                                    >
                                      Aprobar
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleUpdateBadgeStatus(b.id, 'rejected')}
                                      className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-100 px-2.5 py-1 rounded font-bold text-[10px] transition-colors"
                                    >
                                      Rechazar
                                    </button>
                                  </>
                                )}
                                
                                {assignment.status === 'active' && (
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateBadgeStatus(b.id, 'revoked')}
                                    className="bg-yellow-50 hover:bg-yellow-100 text-yellow-700 border border-yellow-100 px-2.5 py-1 rounded font-bold text-[10px] transition-colors"
                                  >
                                    Revocar
                                  </button>
                                )}
                                
                                {(assignment.status === 'rejected' || assignment.status === 'revoked') && (
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateBadgeStatus(b.id, 'active')}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded font-bold text-[10px] transition-colors"
                                  >
                                    Re-Aprobar
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => handleDeleteBadgeAssignment(b.id)}
                                  className="text-gray-400 hover:text-red-500 p-1 transition-colors ml-auto"
                                  title="Eliminar asignación"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-gray-400 text-center py-12 border-2 border-dashed border-gray-100 rounded-2xl">
                Seleccioná una tienda de la tabla para gestionar sus marcas asociadas.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Fusionar/Merge stores Modal */}
      {showMergeModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] border border-gray-200 shadow-xl max-w-lg w-full p-6 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-900">Fusionar Tiendas Oficiales</h3>
              <button onClick={() => setShowMergeModal(false)} className="text-gray-400 hover:text-gray-600">
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <div className="bg-yellow-50 border border-yellow-100 rounded-2xl p-4 flex gap-3 text-xs text-yellow-800 leading-relaxed">
              <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
              <div>
                Esta acción moverá <span className="font-bold">TODOS</span> los productos, subórdenes, ventas y direcciones de despacho de la tienda de origen a la tienda de destino. Al terminar, la tienda de origen será <span className="font-bold">ELIMINADA</span> permanentemente.
              </div>
            </div>

            <form onSubmit={handleMergeStores} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Tienda de Origen (Será Eliminada)</label>
                <select
                  value={sourceStoreId}
                  onChange={e => setSourceStoreId(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:border-primary-600 transition-colors"
                  required
                >
                  <option value="">-- Seleccionar Tienda Origen --</option>
                  {stores.map(s => (
                    <option key={s.id} value={s.id}>{s.store_name} ({s.vendors?.company_name || 'Sin Razón Social'})</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-center text-gray-400 py-1">
                <ArrowRight className="w-6 h-6 rotate-90 sm:rotate-0" />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Tienda de Destino (Conserva los Datos)</label>
                <select
                  value={targetStoreId}
                  onChange={e => setTargetStoreId(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:border-primary-600 transition-colors"
                  required
                >
                  <option value="">-- Seleccionar Tienda Destino --</option>
                  {stores
                    .filter(s => s.id !== sourceStoreId)
                    .map(s => (
                      <option key={s.id} value={s.id}>{s.store_name} ({s.vendors?.company_name || 'Sin Razón Social'})</option>
                    ))}
                </select>
              </div>

              <div className="pt-4 border-t border-gray-100 flex gap-3">
                <button
                  type="submit"
                  disabled={merging}
                  className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-xl font-bold uppercase tracking-wider text-xs transition-colors flex-1 disabled:opacity-50"
                >
                  {merging ? 'Fusionando...' : 'Confirmar Fusión'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowMergeModal(false)}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-3 rounded-xl font-bold uppercase text-xs transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
