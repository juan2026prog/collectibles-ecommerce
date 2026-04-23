import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Shield, ShieldCheck, Store, Star, Share2, Search, RefreshCw, UserCog, Clock, ChevronDown } from 'lucide-react';

export default function AdminUsers() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'admin' | 'vendor' | 'artist' | 'affiliate'>('all');
  const [saving, setSaving] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [showAudit, setShowAudit] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newUser, setNewUser] = useState({
    email: '', password: '', firstName: '', lastName: '',
    roles: [] as string[]
  });

  useEffect(() => { fetchUsers(); fetchAuditLogs(); }, []);

  async function fetchUsers() {
    setLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    setUsers(data || []);
    setLoading(false);
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
    setSaving(userId + role);
    await supabase.from('profiles').update({ [role]: !current }).eq('id', userId);
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, [role]: !current } : u));
    setSaving(null);
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    if (!newUser.email || !newUser.password) return alert("Correo y contraseña son obligatorios");
    
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-user', {
         body: newUser
      });

      if (error || data?.error) {
         throw new Error(data?.error || error?.message || "Error desconocido creando usuario");
      }

      alert("¡Usuario creado con éxito!");
      setShowCreateModal(false);
      setNewUser({ email: '', password: '', firstName: '', lastName: '', roles: [] });
      fetchUsers();
    } catch (err: any) {
      alert("Error: " + err.message);
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
      (u.last_name || '').toLowerCase().includes(search.toLowerCase());
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
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Usuarios & Auditoría</h2>
          <p className="text-sm text-gray-500 mt-1">{users.length} usuarios registrados · Gestión de roles y trazabilidad</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowCreateModal(true)} className="btn-primary text-sm flex items-center gap-2 bg-green-600 hover:bg-green-700 border-green-700 text-white shadow-sm font-bold">
            <UserCog className="w-4 h-4" /> Crear Usuario
          </button>
          <button onClick={() => setShowAudit(!showAudit)} className={`btn-secondary text-sm flex items-center gap-2 ${showAudit ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : ''}`}>
            <Clock className="w-4 h-4" /> {showAudit ? 'Ver Usuarios' : 'Ver Logs'}
          </button>
          <button onClick={() => { fetchUsers(); fetchAuditLogs(); }} className="btn-secondary text-sm flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> Refrescar
          </button>
        </div>
      </div>

      {!showAudit ? (
        <>
          {/* Filters Bar */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[250px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input className="form-input pl-10 w-full" placeholder="Buscar por email o nombre..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              {[
                { key: 'all', label: 'Todos' },
                { key: 'admin', label: 'Admins' },
                { key: 'vendor', label: 'Vendors' },
                { key: 'artist', label: 'Artists' },
                { key: 'affiliate', label: 'Affiliates' },
              ].map(f => (
                <button key={f.key} onClick={() => setFilter(f.key as any)}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${filter === f.key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-900'}`}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Users Table */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-gray-400 animate-pulse">Cargando usuarios...</div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center text-gray-400">
                <UserCog className="w-12 h-12 mx-auto mb-3 text-gray-200" />
                <p className="font-semibold">No se encontraron usuarios</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Usuario</th>
                      <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Roles</th>
                      <th className="px-6 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Registro</th>
                      <th className="px-6 py-3 text-center text-[10px] font-black text-gray-500 uppercase tracking-widest">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.map(u => (
                      <tr key={u.id} className="hover:bg-gray-50/50 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-gradient-to-br from-primary-400 to-primary-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
                              {(u.first_name?.[0] || u.email?.[0] || '?').toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-gray-900">{u.first_name || ''} {u.last_name || ''}</p>
                              <p className="text-xs text-gray-400 font-mono">{u.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1">
                            {roleBadge(u.is_admin, 'Admin', 'bg-blue-100 text-blue-700 border-blue-200')}
                            {roleBadge(u.is_vendor, 'Vendor', 'bg-purple-100 text-purple-700 border-purple-200')}
                            {roleBadge(u.is_artist, 'Artist', 'bg-yellow-100 text-yellow-700 border-yellow-200')}
                            {roleBadge(u.is_affiliate, 'Affiliate', 'bg-pink-100 text-pink-700 border-pink-200')}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-xs text-gray-400">
                          {u.created_at ? new Date(u.created_at).toLocaleDateString('es') : '-'}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex justify-center gap-1">
                            {[
                              { role: 'is_admin', icon: ShieldCheck, label: 'Admin', active: u.is_admin, color: 'text-blue-600 bg-blue-50 hover:bg-blue-100' },
                              { role: 'is_vendor', icon: Store, label: 'Vendor', active: u.is_vendor, color: 'text-purple-600 bg-purple-50 hover:bg-purple-100' },
                              { role: 'is_artist', icon: Star, label: 'Artist', active: u.is_artist, color: 'text-yellow-600 bg-yellow-50 hover:bg-yellow-100' },
                              { role: 'is_affiliate', icon: Share2, label: 'Affiliate', active: u.is_affiliate, color: 'text-pink-600 bg-pink-50 hover:bg-pink-100' },
                            ].map(r => (
                              <button key={r.role} onClick={() => toggleRole(u.id, r.role, r.active)} title={`Toggle ${r.label}`}
                                disabled={saving === u.id + r.role}
                                className={`p-1.5 rounded-lg transition-all ${r.active ? r.color + ' ring-2 ring-offset-1 ring-current' : 'text-gray-300 bg-gray-50 hover:bg-gray-100 hover:text-gray-500'}`}>
                                <r.icon className="w-4 h-4" />
                              </button>
                            ))}
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
            <p className="text-xs text-indigo-600 mt-1">Trazabilidad inmutable de cambios en tablas críticas (products, site_settings, profiles)</p>
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
    </div>
  );
}
