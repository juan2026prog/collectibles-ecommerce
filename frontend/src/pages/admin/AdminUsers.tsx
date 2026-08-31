import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Shield, ShieldCheck, Store, Star, Share2, Search, RefreshCw, UserCog, Clock, ChevronDown, Trash2, Lock, Unlock, CheckCircle2, XCircle } from 'lucide-react';
import { useToast } from '../../components/admin/Toast';
import { useConfirmModal } from '../../components/admin/ConfirmModal';
import CustomerFileModal from '../../components/admin/crm/CustomerFileModal';
import { STORE_TYPE_OPTIONS, type StoreType } from '../../config/conditionConfig';
import { BackofficePageHeader, BackofficeSearch, BackofficeTabs, BackofficeCompactRow } from '../../components/backoffice';

export default function AdminUsers() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'admin' | 'vendor' | 'artist' | 'affiliate'>('all');
  const [saving, setSaving] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [showAudit, setShowAudit] = useState(false);

  const { toast } = useToast();
  const { confirm } = useConfirmModal();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newUser, setNewUser] = useState({
    email: '', password: '', firstName: '', lastName: '',
    roles: [] as string[]
  });
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);

  // Vendor Management Modal State
  const [selectedVendorUser, setSelectedVendorUser] = useState<any | null>(null);
  const [vendorModalForm, setVendorModalForm] = useState({
    storeName: '',
    storeType: 'standard' as StoreType,
    canRequestCategories: false,
    canRequestBrands: false,
    canRequestLicenses: false
  });
  const [vendorModalSaving, setVendorModalSaving] = useState(false);

  useEffect(() => { fetchUsers(); fetchAuditLogs(); }, []);

  async function fetchUsers() {
    setLoading(true);
    try {
      // 1. Fetch profiles
      const { data: profilesData, error: profErr } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profErr) throw profErr;

      if (profilesData && profilesData.length > 0) {
        const userIds = profilesData.map(p => p.id);

        // 2. Batch fetch vendors
        const { data: vendorsData } = await supabase
          .from('vendors')
          .select('id, store_name, slug, status, can_request_categories, can_request_brands, can_request_licenses, store_type')
          .in('id', userIds);

        // 3. Batch fetch vendor_stores
        const { data: vendorStoresData } = await supabase
          .from('vendor_stores')
          .select('id, vendor_id, store_name, status, store_type')
          .in('vendor_id', userIds);

        const vendorMap = new Map(vendorsData?.map(v => [v.id, v]) || []);
        const vendorStoreMap = new Map(vendorStoresData?.map(vs => [vs.vendor_id, vs]) || []);

        const combined = profilesData.map(p => {
          const v = vendorMap.get(p.id);
          const vs = vendorStoreMap.get(p.id);

          // Canonical store name resolution: vendor_stores.store_name -> vendors.store_name -> 'Vendor sin nombre'
          let canonicalStoreName = '—';
          if (p.is_vendor) {
            canonicalStoreName = vs?.store_name || v?.store_name || 'Vendor sin nombre';
          }

          return {
            ...p,
            vendor_info: v || null,
            vendor_store_info: vs || null,
            canonical_store_name: canonicalStoreName,
            can_request_categories: v?.can_request_categories ?? false,
            can_request_brands: v?.can_request_brands ?? false,
            can_request_licenses: v?.can_request_licenses ?? false,
            store_type: (v?.store_type || vs?.store_type || 'standard') as StoreType,
            vendor_status: v?.status || vs?.status || 'active'
          };
        });

        setUsers(combined);
      } else {
        setUsers([]);
      }
    } catch (err: any) {
      toast.error('Error cargando usuarios: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchAuditLogs() {
    const { data } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    setAuditLogs(data || []);
  }

  async function toggleRole(userId: string, role: string, current: boolean) {
    if (role === 'is_vendor') {
      const u = users.find(usr => usr.id === userId);
      if (u) {
        await openVendorModal(u);
        return;
      }
    }

    setSaving(userId + role);
    const newValue = !current;
    const { error } = await supabase.from('profiles').update({ [role]: newValue }).eq('id', userId);
    if (!error) {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, [role]: newValue } : u));
      toast.success('Rol actualizado');
    } else {
      toast.error('Error al actualizar rol');
    }
    setSaving(null);
  }

  async function openVendorModal(u: any) {
    const defaultStoreName = u.canonical_store_name !== '—'
      ? u.canonical_store_name
      : (u.first_name ? `${u.first_name} ${u.last_name || ''}`.trim() : 'Mi Tienda');

    setSelectedVendorUser(u);
    setVendorModalForm({
      storeName: defaultStoreName,
      storeType: (u.store_type || 'standard') as StoreType,
      canRequestCategories: u.can_request_categories ?? false,
      canRequestBrands: u.can_request_brands ?? false,
      canRequestLicenses: u.can_request_licenses ?? false
    });

    // Fetch real-time values from DB to guarantee accurate state
    try {
      const { data: vRecord } = await supabase
        .from('vendors')
        .select('store_name, store_type, can_request_categories, can_request_brands, can_request_licenses')
        .eq('id', u.id)
        .maybeSingle();

      if (vRecord) {
        setVendorModalForm({
          storeName: vRecord.store_name || defaultStoreName,
          storeType: (vRecord.store_type || 'standard') as StoreType,
          canRequestCategories: !!vRecord.can_request_categories,
          canRequestBrands: !!vRecord.can_request_brands,
          canRequestLicenses: !!vRecord.can_request_licenses
        });
      }
    } catch (e) {
      // Fallback to local state if fetch fails
    }
  }

  async function handleSaveVendorModal() {
    if (!selectedVendorUser) return;
    setVendorModalSaving(true);
    try {
      const userId = selectedVendorUser.id;
      const isNewVendor = !selectedVendorUser.is_vendor;

      // 1. Update profile role if turning into vendor
      if (isNewVendor) {
        const { error: profErr } = await supabase
          .from('profiles')
          .update({ is_vendor: true })
          .eq('id', userId);
        if (profErr) throw profErr;
      }

      // 2. Fetch existing vendor record
      const { data: existingVendor } = await supabase
        .from('vendors')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      const slug = existingVendor?.slug || `vendor-${userId.slice(0, 8)}`;
      const storeName = vendorModalForm.storeName.trim() || 'Mi Tienda';

      const vendorPayload = {
        id: userId,
        store_name: storeName,
        slug: slug,
        status: existingVendor?.status || 'active',
        store_type: vendorModalForm.storeType,
        can_request_categories: vendorModalForm.canRequestCategories,
        can_request_brands: vendorModalForm.canRequestBrands,
        can_request_licenses: vendorModalForm.canRequestLicenses
      };

      const { error: vendorErr } = await supabase
        .from('vendors')
        .upsert(vendorPayload, { onConflict: 'id' });

      if (vendorErr) throw vendorErr;

      // 3. Update vendor_stores store_name & store_type if exists (without duplicating)
      const { data: existingVS } = await supabase
        .from('vendor_stores')
        .select('id')
        .eq('vendor_id', userId)
        .maybeSingle();

      if (existingVS) {
        await supabase
          .from('vendor_stores')
          .update({ store_name: storeName, store_type: vendorModalForm.storeType })
          .eq('id', existingVS.id);
      }

      // 4. Record Audit Log
      const currentUser = (await supabase.auth.getUser()).data.user;
      await supabase.from('audit_logs').insert({
        user_id: currentUser?.id || null,
        action: 'UPDATE',
        table_name: 'vendors',
        record_id: userId,
        old_data: {
          is_vendor: selectedVendorUser.is_vendor,
          store_type: selectedVendorUser.store_type || 'standard',
          can_request_categories: selectedVendorUser.can_request_categories,
          can_request_brands: selectedVendorUser.can_request_brands,
          can_request_licenses: selectedVendorUser.can_request_licenses
        },
        new_data: {
          is_vendor: true,
          store_name: storeName,
          store_type: vendorModalForm.storeType,
          can_request_categories: vendorModalForm.canRequestCategories,
          can_request_brands: vendorModalForm.canRequestBrands,
          can_request_licenses: vendorModalForm.canRequestLicenses
        }
      });

      // 5. Update local users state IMMEDIATELY for seamless UI update
      setUsers(prev => prev.map(u => {
        if (u.id === userId) {
          return {
            ...u,
            is_vendor: true,
            canonical_store_name: storeName,
            store_type: vendorModalForm.storeType,
            can_request_categories: vendorModalForm.canRequestCategories,
            can_request_brands: vendorModalForm.canRequestBrands,
            can_request_licenses: vendorModalForm.canRequestLicenses
          };
        }
        return u;
      }));

      toast.success('Permisos del Vendor actualizados correctamente.');
      setSelectedVendorUser(null);
      await fetchAuditLogs();
    } catch (err: any) {
      toast.error('Error al guardar datos del vendor: ' + (err.message || err.details || 'Permiso denegado'));
    } finally {
      setVendorModalSaving(false);
    }
  }

  async function handleBlockToggle(userId: string, isBlocked: boolean, email: string) {
    const action = isBlocked ? 'unblock' : 'block';
    const message = isBlocked 
      ? `¿Estás seguro de que deseas desbloquear al usuario ${email}?` 
      : `¿Estás seguro de que deseas bloquear al usuario ${email}? No podrá iniciar sesión ni realizar compras.`;
      
    if (!(await confirm(message, { danger: !isBlocked }))) return;
    
    setSaving(userId + 'block');
    try {
      const { data, error } = await supabase.functions.invoke('block-user', {
        body: { userId, action }
      });
      
      if (error || data?.error) {
        throw new Error(data?.error || error?.message || `Error al ${isBlocked ? 'desbloquear' : 'bloquear'} usuario`);
      }
      
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_blocked: !isBlocked } : u));
      toast.success(isBlocked ? 'Usuario desbloqueado con éxito' : 'Usuario bloqueado con éxito');
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setSaving(null);
    }
  }

  async function handleDeleteUser(userId: string, email: string) {
    const message = `¿Estás SEGURO de que deseas ELIMINAR permanentemente al usuario ${email}? Esta acción es irreversible y eliminará todos sus perfiles asociados.`;
    
    if (!(await confirm(message, { danger: true }))) return;
    
    setSaving(userId + 'delete');
    try {
      const { data, error } = await supabase.functions.invoke('delete-user', {
        body: { userId }
      });
      
      if (error || data?.error) {
        throw new Error(data?.error || error?.message || 'Error al eliminar usuario');
      }
      
      setUsers(prev => prev.filter(u => u.id !== userId));
      toast.success('Usuario eliminado permanentemente');
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setSaving(null);
    }
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    if (!newUser.email || !newUser.password) return toast.error("Correo y contraseña son obligatorios");
    
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-user', {
         body: newUser
      });

      if (error || data?.error) {
         throw new Error(data?.error || error?.message || "Error desconocido creando usuario");
      }

      toast.success("¡Usuario creado con éxito!");
      setShowCreateModal(false);
      setNewUser({ email: '', password: '', firstName: '', lastName: '', roles: [] });
      fetchUsers();
    } catch (err: any) {
      toast.error("Error: " + err.message);
    } finally {
      setCreating(false);
    }
  }

  const toggleNewUserRole = (role: string) => {
     setNewUser(prev => ({
        ...prev,
        roles: prev.roles.includes(role) 
          ? prev.roles.filter(r => r !== role) 
          : [...prev.roles, role]
     }));
  };

  const filtered = users.filter(u => {
    const matchSearch = !search || 
      (u.email || '').toLowerCase().includes(search.toLowerCase()) ||
      (u.first_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (u.last_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (u.canonical_store_name || '').toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'all' ||
      (filter === 'admin' && u.is_admin) ||
      (filter === 'vendor' && u.is_vendor) ||
      (filter === 'artist' && u.is_artist) ||
      (filter === 'affiliate' && u.is_affiliate);
    return matchSearch && matchFilter;
  });

  const roleBadge = (active: boolean, label: string, color: string) => (
    <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border ${
      active ? color : 'bg-gray-50 text-gray-300 border-gray-200'
    }`}>{label}</span>
  );

  return (
    <div className="space-y-4 min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-2">
        <div className="flex items-center gap-3">
          <h2 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white">Usuarios & Permisos</h2>
          <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2.5 py-1 rounded-full border border-gray-200">
            {users.length} {users.length === 1 ? 'usuario' : 'usuarios'}
          </span>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <button onClick={() => setShowCreateModal(true)} className="bg-[#f00856] hover:bg-[#ff2c68] text-white font-semibold text-xs sm:text-sm px-4 py-2 rounded-xl cursor-pointer min-h-[44px] shadow-sm active:scale-95 flex items-center justify-center gap-1.5 transition-all flex-1 sm:flex-initial">
            <UserCog className="w-4 h-4" /> Crear Usuario
          </button>
          <button onClick={() => setShowAudit(!showAudit)} className={`py-2 px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl min-h-[44px] flex items-center justify-center gap-1.5 transition-colors ${showAudit ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : ''}`}>
            <Clock className="w-4 h-4" /> {showAudit ? 'Ver Usuarios' : 'Ver Logs'}
          </button>
          <button onClick={() => { fetchUsers(); fetchAuditLogs(); }} className="p-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {!showAudit ? (
        <>
          {/* Filters Bar */}
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
            <div className="relative flex-1 w-full md:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input className="form-input pl-10 w-full text-xs py-2 rounded-xl" placeholder="Buscar por email, nombre o tienda..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>

            {/* Mobile Filter Selector (< md) */}
            <div className="md:hidden w-full">
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as any)}
                className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-xs font-bold text-gray-900 shadow-2xs focus:ring-2 focus:ring-[#f00856] outline-none min-h-[44px] cursor-pointer"
              >
                <option value="all">Todos los usuarios</option>
                <option value="admin">Administradores</option>
                <option value="vendor">Vendedores (Vendors)</option>
                <option value="artist">Artistas (Artists)</option>
                <option value="affiliate">Afiliados (Affiliates)</option>
              </select>
            </div>

            {/* Desktop Filter Pills (>= md) */}
            <div className="hidden md:flex gap-1 bg-gray-100 rounded-lg p-1">
              {[
                { key: 'all', label: 'Todos' },
                { key: 'admin', label: 'Admins' },
                { key: 'vendor', label: 'Vendors' },
                { key: 'artist', label: 'Artists' },
                { key: 'affiliate', label: 'Affiliates' },
              ].map(f => (
                <button key={f.key} onClick={() => setFilter(f.key as any)}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${filter === f.key ? 'bg-white shadow-xs text-gray-900' : 'text-gray-500 hover:text-gray-900'}`}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* MOBILE CARDS LIST (< md) */}
          <div className="block md:hidden space-y-2.5">
            {loading ? (
              <div className="p-6 text-center text-xs text-gray-400 font-medium bg-white rounded-xl border border-gray-200 animate-pulse">
                Cargando usuarios...
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-center text-xs text-gray-400 bg-white rounded-xl border border-gray-200">
                No se encontraron usuarios
              </div>
            ) : (
              filtered.map(u => (
                <div 
                  key={u.id} 
                  onClick={() => setSelectedCustomer(u.id)}
                  className="bg-white rounded-xl border border-gray-200 p-3 space-y-2 shadow-2xs cursor-pointer hover:border-primary-300 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="w-8 h-8 bg-gradient-to-br from-primary-400 to-primary-600 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0">
                        {(u.first_name?.[0] || u.email?.[0] || '?').toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-gray-900 truncate">
                          {u.first_name || ''} {u.last_name || ''} {!u.first_name && u.email}
                        </p>
                        <p className="text-[10px] text-gray-400 font-mono truncate">{u.email}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {roleBadge(u.is_admin, 'Admin', 'bg-blue-100 text-blue-700 border-blue-200')}
                      {roleBadge(u.is_vendor, 'Vendor', 'bg-purple-100 text-purple-700 border-purple-200')}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-gray-100 text-xs">
                    {u.is_vendor ? (
                      <span className="text-[11px] font-bold text-purple-800 flex items-center gap-1 truncate max-w-[180px]">
                        <Store className="w-3 h-3 text-purple-600 shrink-0" />
                        {u.canonical_store_name}
                      </span>
                    ) : (
                      <span className="text-[10px] text-gray-400 font-mono">Usuario Estándar</span>
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openVendorModal(u);
                      }}
                      className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-900 font-bold rounded-lg text-xs transition-colors min-h-[36px]"
                    >
                      {u.is_vendor ? 'Gestionar' : 'Autorizar'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* DESKTOP TABLE (>= md) */}
          <div className="hidden md:block bg-white rounded-xl border border-gray-200 shadow-2xs overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-gray-400 animate-pulse">Cargando usuarios y tiendas...</div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center text-gray-400">
                <UserCog className="w-12 h-12 mx-auto mb-3 text-gray-200" />
                <p className="font-semibold">No se encontraron usuarios</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Usuario</th>
                      <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Tienda</th>
                      <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Roles</th>
                      <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Permisos Catálogo</th>
                      <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Registro</th>
                      <th className="px-6 py-3 text-center text-[10px] font-black text-gray-500 uppercase tracking-widest">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.map(u => (
                      <tr key={u.id} className="hover:bg-gray-50/50 transition-colors group cursor-pointer" onClick={() => setSelectedCustomer(u.id)}>
                        {/* USUARIO */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-gradient-to-br from-primary-400 to-primary-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
                              {(u.first_name?.[0] || u.email?.[0] || '?').toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-gray-900 flex items-center gap-2">
                                {u.first_name || ''} {u.last_name || ''}
                                {u.is_blocked && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black bg-red-100 text-red-700 border border-red-200 uppercase tracking-wider">
                                    Bloqueado
                                  </span>
                                )}
                              </p>
                              <p className="text-xs text-gray-400 font-mono">{u.email}</p>
                            </div>
                          </div>
                        </td>

                        {/* TIENDA */}
                        <td className="px-6 py-4">
                          {u.is_vendor ? (
                            <div>
                              <p className="text-xs font-bold text-purple-900 flex items-center gap-1">
                                <Store className="w-3.5 h-3.5 text-purple-600 inline" />
                                {u.canonical_store_name}
                              </p>
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className="text-[10px] text-gray-400 capitalize">{u.vendor_status || 'Activo'}</span>
                                <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border ${
                                  u.store_type === 'tcg'
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                    : u.store_type === 'vintage'
                                    ? 'bg-purple-100 text-purple-800 border-purple-200'
                                    : u.store_type === 'mixed'
                                    ? 'bg-amber-100 text-amber-800 border-amber-200'
                                    : 'bg-blue-50 text-blue-700 border-blue-200'
                                }`}>
                                  {u.store_type === 'tcg' ? 'TCG STORE' : u.store_type === 'vintage' ? 'VINTAGE' : u.store_type === 'mixed' ? 'MIXED' : 'STANDARD'}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <span className="text-gray-300 text-xs font-mono">—</span>
                          )}
                        </td>

                        {/* ROLES */}
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1">
                            {roleBadge(u.is_admin, 'Admin', 'bg-blue-100 text-blue-700 border-blue-200')}
                            {roleBadge(u.is_vendor, 'Vendor', 'bg-purple-100 text-purple-700 border-purple-200')}
                            {roleBadge(u.is_artist, 'Artist', 'bg-yellow-100 text-yellow-700 border-yellow-200')}
                            {roleBadge(u.is_affiliate, 'Affiliate', 'bg-pink-100 text-pink-700 border-pink-200')}
                          </div>
                        </td>

                        {/* PERMISOS CATÁLOGO */}
                        <td className="px-6 py-4">
                          {u.is_vendor ? (
                            <div className="flex items-center gap-1.5">
                              <span 
                                title={u.can_request_categories ? "Puede solicitar nuevas categorías" : "No puede solicitar categorías"} 
                                className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-0.5 border ${
                                  u.can_request_categories 
                                    ? 'bg-green-100 text-green-800 border-green-300' 
                                    : 'bg-gray-100 text-gray-400 border-gray-200'
                                }`}
                              >
                                Cat {u.can_request_categories ? '✓' : '—'}
                              </span>
                              <span 
                                title={u.can_request_brands ? "Puede solicitar nuevas marcas/fabricantes" : "No puede solicitar marcas"} 
                                className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-0.5 border ${
                                  u.can_request_brands 
                                    ? 'bg-green-100 text-green-800 border-green-300' 
                                    : 'bg-gray-100 text-gray-400 border-gray-200'
                                }`}
                              >
                                Marca {u.can_request_brands ? '✓' : '—'}
                              </span>
                              <span 
                                title={u.can_request_licenses ? "Puede solicitar nuevas licencias/franquicias" : "No puede solicitar licencias"} 
                                className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-0.5 border ${
                                  u.can_request_licenses 
                                    ? 'bg-green-100 text-green-800 border-green-300' 
                                    : 'bg-gray-100 text-gray-400 border-gray-200'
                                }`}
                              >
                                Lic {u.can_request_licenses ? '✓' : '—'}
                              </span>
                            </div>
                          ) : (
                            <span className="text-gray-300 text-xs font-mono">—</span>
                          )}
                        </td>

                        {/* REGISTRO */}
                        <td className="px-6 py-4 text-xs text-gray-400">
                          {u.created_at ? new Date(u.created_at).toLocaleDateString('es') : '-'}
                        </td>

                        {/* ACCIONES */}
                        <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-center items-center gap-2">
                            {/* Explicit GESTIONAR VENDOR button for Vendor users */}
                            {u.is_vendor ? (
                              <button
                                type="button"
                                onClick={() => openVendorModal(u)}
                                className="px-3 py-1.5 text-xs font-bold text-purple-700 bg-purple-100 hover:bg-purple-200 border border-purple-300 rounded-lg flex items-center gap-1.5 shadow-sm transition-all"
                                title="Gestionar Tienda y Permisos de Catálogo"
                              >
                                <Store className="w-3.5 h-3.5 text-purple-600" />
                                <span>GESTIONAR VENDOR</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => openVendorModal(u)}
                                className="px-2 py-1 text-[11px] font-bold text-gray-500 bg-gray-50 hover:bg-purple-50 hover:text-purple-700 border border-gray-200 rounded-lg flex items-center gap-1 transition-all"
                                title="Autorizar como Vendor"
                              >
                                <Store className="w-3.5 h-3.5" />
                                <span>Autorizar Vendor</span>
                              </button>
                            )}

                            <div className="w-px h-5 bg-gray-200 mx-0.5" />

                            {/* Other Role Toggles */}
                            {[
                              { role: 'is_admin', icon: ShieldCheck, label: 'Admin', active: u.is_admin, color: 'text-blue-600 bg-blue-50 hover:bg-blue-100' },
                              { role: 'is_artist', icon: Star, label: 'Artist', active: u.is_artist, color: 'text-yellow-600 bg-yellow-50 hover:bg-yellow-100' },
                              { role: 'is_affiliate', icon: Share2, label: 'Affiliate', active: u.is_affiliate, color: 'text-pink-600 bg-pink-50 hover:bg-pink-100' },
                            ].map(r => (
                              <button key={r.role} onClick={() => toggleRole(u.id, r.role, r.active)} title={r.label}
                                disabled={!!saving}
                                className={`p-1.5 rounded-lg transition-all ${r.active ? r.color + ' ring-2 ring-offset-1 ring-current' : 'text-gray-300 bg-gray-50 hover:bg-gray-100 hover:text-gray-500'}`}>
                                <r.icon className="w-4 h-4" />
                              </button>
                            ))}
                            
                            <div className="w-px h-5 bg-gray-200 mx-0.5" />

                            <button 
                              onClick={() => handleBlockToggle(u.id, !!u.is_blocked, u.email)}
                              title={u.is_blocked ? 'Desbloquear usuario' : 'Bloquear usuario'}
                              disabled={!!saving}
                              className={`p-1.5 rounded-lg transition-all ${
                                u.is_blocked 
                                  ? 'text-red-600 bg-red-50 hover:bg-red-100 ring-2 ring-offset-1 ring-red-600' 
                                  : 'text-gray-400 bg-gray-50 hover:bg-red-50 hover:text-red-500'
                              }`}
                            >
                              {u.is_blocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                            </button>

                            <button 
                              onClick={() => handleDeleteUser(u.id, u.email)}
                              title="Eliminar usuario"
                              disabled={!!saving}
                              className="p-1.5 rounded-lg text-gray-400 bg-gray-50 hover:bg-red-100 hover:text-red-600 transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        /* Audit Logs */
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b bg-indigo-50/50">
            <h3 className="font-bold text-indigo-900 flex items-center gap-2"><Shield className="w-5 h-5" /> Registro de Auditoría</h3>
            <p className="text-xs text-indigo-600 mt-1">Trazabilidad inmutable de cambios en tablas críticas (vendors, products, site_settings, profiles)</p>
          </div>
          {auditLogs.length === 0 ? (
            <div className="p-12 text-center text-gray-400">No hay registros de auditoría aún.</div>
          ) : (
            <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
              {auditLogs.map((log: any) => (
                <details key={log.id} className="group">
                  <summary className="px-6 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors list-none">
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${
                        log.action === 'INSERT' ? 'bg-green-100 text-green-700' :
                        log.action === 'UPDATE' ? 'bg-blue-100 text-blue-700' :
                        'bg-red-100 text-red-700'
                      }`}>{log.action}</span>
                      <span className="text-sm font-bold text-gray-700">{log.table_name}</span>
                      <span className="text-xs text-gray-400 font-mono">{log.record_id?.slice(0, 8)}...</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-400">{new Date(log.created_at).toLocaleString('es')}</span>
                      <ChevronDown className="w-4 h-4 text-gray-300 group-open:rotate-180 transition-transform" />
                    </div>
                  </summary>
                  <div className="px-6 pb-4 bg-gray-50">
                    <div className="grid grid-cols-2 gap-4 mt-2">
                      <div>
                        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Dato Anterior</p>
                        <pre className="text-xs bg-red-50 p-3 rounded-lg overflow-x-auto border border-red-100 max-h-32 text-red-800">{JSON.stringify(log.old_data, null, 2) || '—'}</pre>
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Dato Nuevo</p>
                        <pre className="text-xs bg-green-50 p-3 rounded-lg overflow-x-auto border border-green-100 max-h-32 text-green-800">{JSON.stringify(log.new_data, null, 2) || '—'}</pre>
                      </div>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          )}
        </div>
      )}

      {/* GESTIONAR VENDOR MODAL */}
      {selectedVendorUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setSelectedVendorUser(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-purple-50/50">
              <div>
                <h3 className="font-bold text-lg text-gray-900 flex items-center gap-2">
                  <Store className="w-5 h-5 text-purple-600" /> 
                  GESTIONAR VENDOR
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">Configura tienda y permisos de catálogo</p>
              </div>
              <button onClick={() => setSelectedVendorUser(null)} className="text-gray-400 hover:text-gray-600 transition-colors text-xl font-bold">&times;</button>
            </div>

            <div className="p-6 space-y-5">
              <div className="bg-gray-50 rounded-xl p-3 border border-gray-200/80 space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Usuario</span>
                  <span className="text-[10px] font-mono text-gray-400">ID: {selectedVendorUser.id.slice(0, 8)}...</span>
                </div>
                <p className="text-sm font-bold text-gray-900">{selectedVendorUser.email}</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Nombre de la Tienda</label>
                <input 
                  type="text" 
                  className="form-input w-full bg-gray-50 text-sm font-semibold" 
                  placeholder="Ej: JorgiToys" 
                  value={vendorModalForm.storeName} 
                  onChange={e => setVendorModalForm({ ...vendorModalForm, storeName: e.target.value })} 
                />
              </div>

              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-gray-700">Estado</span>
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                  selectedVendorUser.vendor_status === 'active' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                }`}>
                  ● {selectedVendorUser.vendor_status || 'Activo'}
                </span>
              </div>

              {/* TIPO DE TIENDA */}
              <div className="pt-3 border-t border-gray-100 space-y-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-purple-900">TIPO DE TIENDA</p>
                  <p className="text-[11px] text-gray-400 leading-tight mt-0.5">
                    Configuración privada por Vendor. Determina el comportamiento del sistema Condition al publicar productos.
                  </p>
                </div>
                <div className="space-y-2">
                  {STORE_TYPE_OPTIONS.map(opt => {
                    const isSelected = vendorModalForm.storeType === opt.value;
                    return (
                      <label
                        key={opt.value}
                        htmlFor={`store_type_${opt.value}`}
                        className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                          isSelected
                            ? 'border-purple-500 bg-purple-50/70 shadow-sm'
                            : 'border-gray-200 bg-white hover:border-gray-300'
                        }`}
                      >
                        <input
                          id={`store_type_${opt.value}`}
                          type="radio"
                          name="storeTypeRadio"
                          value={opt.value}
                          checked={isSelected}
                          onChange={() => setVendorModalForm({ ...vendorModalForm, storeType: opt.value })}
                          className="mt-0.5 text-purple-600 focus:ring-purple-500 cursor-pointer"
                        />
                        <div>
                          <p className="text-xs font-bold text-gray-900 flex items-center gap-2">
                            {opt.label}
                            {opt.value === 'standard' && (
                              <span className="text-[9px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">Default</span>
                            )}
                          </p>
                          <p className="text-[10px] text-gray-500 mt-0.5 leading-normal">{opt.desc}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 border-t border-gray-100 space-y-3">
                <p className="text-xs font-black uppercase tracking-wider text-gray-500">PERMISOS DE CATÁLOGO</p>
                <p className="text-[11px] text-gray-400 leading-tight">
                  Define si este Vendor puede solicitar la incorporación de nuevos elementos al catálogo (las solicitudes requieren aprobación del Admin).
                </p>

                <div className="space-y-2.5 pt-1">
                  {[
                    { 
                      key: 'canRequestCategories', 
                      label: 'Categorías', 
                      desc: 'Permitir que este Vendor solicite nuevas categorías.' 
                    },
                    { 
                      key: 'canRequestBrands', 
                      label: 'Marcas', 
                      desc: 'Permitir que este Vendor solicite nuevas marcas/fabricantes.' 
                    },
                    { 
                      key: 'canRequestLicenses', 
                      label: 'Licencias', 
                      desc: 'Permitir que este Vendor solicite nuevas licencias/franquicias.' 
                    }
                  ].map(perm => {
                    const isChecked = (vendorModalForm as any)[perm.key];
                    return (
                      <div key={perm.key} className="flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100/80 rounded-xl border border-gray-200/60 transition-colors">
                        <div className="pr-3">
                          <p className="text-xs font-bold text-gray-800">{perm.label}</p>
                          <p className="text-[10px] text-gray-500 mt-0.5">{perm.desc}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setVendorModalForm({
                            ...vendorModalForm,
                            [perm.key]: !isChecked
                          })}
                          className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors flex-shrink-0 ${
                            isChecked ? 'bg-green-600 justify-end' : 'bg-gray-300 justify-start'
                          }`}
                        >
                          <span className="w-4 h-4 bg-white rounded-full shadow-md" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-4 border-t flex justify-end gap-3">
                <button 
                  type="button" 
                  onClick={() => setSelectedVendorUser(null)} 
                  className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  CANCELAR
                </button>
                <button 
                  type="button" 
                  disabled={vendorModalSaving}
                  onClick={handleSaveVendorModal}
                  className="px-5 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-lg transition-all shadow-md shadow-purple-200"
                >
                  {vendorModalSaving ? 'GUARDANDO...' : 'GUARDAR CAMBIOS'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CREATE USER MODAL */}
      {showCreateModal && (
         <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
               <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                  <h3 className="font-bold text-xl text-gray-900 flex items-center gap-2">
                     <UserCog className="w-5 h-5 text-green-600" /> Nuevo Usuario
                  </h3>
                  <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors">&times;</button>
               </div>
               
               <form onSubmit={handleCreateUser} className="p-6 space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                     <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Nombre</label>
                        <input required type="text" className="form-input w-full bg-gray-50" placeholder="Ej: Carlos" 
                           value={newUser.firstName} onChange={e => setNewUser({...newUser, firstName: e.target.value})} />
                     </div>
                     <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Apellido</label>
                        <input required type="text" className="form-input w-full bg-gray-50" placeholder="Ej: López" 
                           value={newUser.lastName} onChange={e => setNewUser({...newUser, lastName: e.target.value})} />
                     </div>
                  </div>
                  <div>
                     <label className="block text-xs font-bold text-gray-700 mb-1">Correo Electrónico *</label>
                     <input required type="email" className="form-input w-full bg-gray-50" placeholder="usuario@correo.com" 
                        value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} />
                  </div>
                  <div>
                     <label className="block text-xs font-bold text-gray-700 mb-1">Contraseña Temporal *</label>
                     <input required type="text" className="form-input w-full bg-gray-50" placeholder="Al menos 6 caracteres" minLength={6}
                        value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} />
                     <p className="text-[10px] text-gray-400 mt-1">El usuario podrá cambiarla o entrar con Google luego si el correo coincide.</p>
                  </div>

                  <div>
                     <label className="block text-xs font-bold text-gray-700 mb-2">Asignar Roles Especiales (Opcional)</label>
                     <div className="grid grid-cols-2 gap-3">
                        {[
                           { id: 'admin', label: 'Administrador', desc: 'Acceso total al panel', color: 'blue' },
                           { id: 'vendor', label: 'Vendedor', desc: 'Gestión de sus ventas', color: 'purple' },
                           { id: 'artist', label: 'Artista', desc: 'Acceso a portal de arte', color: 'yellow' },
                           { id: 'affiliate', label: 'Afiliado', desc: 'Links de referidos', color: 'pink' }
                        ].map(role => (
                           <button type="button" key={role.id} onClick={() => toggleNewUserRole(role.id)}
                              className={`text-left p-3 rounded-xl border-2 transition-all ${
                                 newUser.roles.includes(role.id) 
                                   ? `border-${role.color}-500 bg-${role.color}-50` 
                                   : 'border-gray-100 bg-white hover:border-gray-200'
                              }`}>
                              <p className={`text-sm font-bold ${newUser.roles.includes(role.id) ? `text-${role.color}-700` : 'text-gray-700'}`}>{role.label}</p>
                              <p className="text-[10px] text-gray-500 mt-0.5">{role.desc}</p>
                           </button>
                        ))}
                     </div>
                  </div>

                  <div className="pt-4 border-t flex justify-end gap-3">
                     <button type="button" onClick={() => setShowCreateModal(false)} className="px-5 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancelar</button>
                     <button type="submit" disabled={creating} className="px-5 py-2 text-sm font-bold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg transition-all shadow-lg shadow-green-200">
                        {creating ? 'Creando...' : 'Crear Usuario'}
                     </button>
                  </div>
               </form>
            </div>
         </div>
      )}

      {/* CUSTOMER CRM FILE MODAL */}
      {selectedCustomer && (
        <CustomerFileModal userId={selectedCustomer} onClose={() => setSelectedCustomer(null)} />
      )}
    </div>
  );
}
