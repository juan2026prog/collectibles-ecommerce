import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { 
  RefreshCw, Link2, AlertTriangle, CheckCircle, Clock, Layers, 
  Search, ShieldAlert, Check, X, ToggleLeft, ToggleRight, ExternalLink
} from 'lucide-react';
import { useToast } from '../../components/admin/Toast';

export default function VMercadoLibre() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  // Connection states
  const [account, setAccount] = useState<any>(null);
  const [loadingAccount, setLoadingAccount] = useState(true);
  const [dbClientId, setDbClientId] = useState('');
  
  // Staging items and links state
  const [items, setItems] = useState<any[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Logs state
  const [logs, setLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);

  // Operation states
  const [actionLoading, setActionLoading] = useState(false);
  const [importProgress, setImportProgress] = useState('');

  useEffect(() => {
    if (user?.id) {
      loadAccountDetails();
      loadClientId();
    }
  }, [user]);

  useEffect(() => {
    if (account?.seller_id) {
      loadItemsAndLinks();
      loadImportLogs();
    } else {
      setItems([]);
      setLogs([]);
      setLoadingItems(false);
      setLoadingLogs(false);
    }
  }, [account, statusFilter]);

  async function loadClientId() {
    try {
      const { data } = await supabase
        .from('site_settings')
        .select('key, value')
        .eq('key', 'mercadolibre_client_id')
        .maybeSingle();
      if (data) setDbClientId(data.value);
    } catch (_e) { /* best-effort */ }
  }

  async function loadAccountDetails() {
    setLoadingAccount(true);
    try {
      const { data, error } = await supabase
        .from('ml_seller_accounts')
        .select('*')
        .eq('vendor_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      setAccount(data || null);
    } catch (err: any) {
      toast.error('Error al cargar la cuenta: ' + err.message);
    } finally {
      setLoadingAccount(false);
    }
  }

  async function loadItemsAndLinks() {
    setLoadingItems(true);
    try {
      // Query raw items matching seller
      let query = supabase
        .from('ml_raw_items')
        .select('*, ml_catalog_links(sync_stock, sync_price, last_sync_status, last_synced_at, last_sync_error)')
        .eq('seller_id', account.seller_id)
        .order('updated_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      setItems(data || []);
    } catch (err: any) {
      toast.error('Error al cargar items de catálogo: ' + err.message);
    } finally {
      setLoadingItems(false);
    }
  }

  async function loadImportLogs() {
    setLoadingLogs(true);
    try {
      const { data, error } = await supabase
        .from('ml_import_logs')
        .select('*')
        .eq('seller_id', account.seller_id)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      setLogs(data || []);
    } catch (err: any) {
      toast.error('Error al cargar logs: ' + err.message);
    } finally {
      setLoadingLogs(false);
    }
  }

  // Connect Account OAuth Trigger
  function handleConnect() {
    const clientId = import.meta.env.VITE_ML_CLIENT_ID || dbClientId;
    if (!clientId) {
      toast.error('Configuración de Mercado Libre ausente (Falta Client ID).');
      return;
    }
    const redirectUri = import.meta.env.VITE_ML_REDIRECT_URI || `${window.location.origin}/auth/callback`;
    const authUrl = `https://auth.mercadolibre.com.uy/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}`;
    
    toast.info('Redireccionando a Mercado Libre...');
    window.location.href = authUrl;
  }

  // Disconnect Account
  async function handleDisconnect() {
    if (!confirm('¿Deseas desconectar tu cuenta de Mercado Libre? Se detendrán todas las sincronizaciones.')) return;
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from('ml_seller_accounts')
        .delete()
        .eq('vendor_id', user!.id);
      if (error) throw error;
      toast.success('Cuenta desconectada con éxito');
      setAccount(null);
    } catch (err: any) {
      toast.error('Error al desconectar: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  }

  // Toggle Sync Settings
  async function toggleSyncSetting(mlItemId: string, setting: 'sync_stock' | 'sync_price', currentValue: boolean) {
    try {
      const { error } = await supabase
        .from('ml_catalog_links')
        .update({ [setting]: !currentValue })
        .eq('ml_item_id', mlItemId);

      if (error) throw error;
      toast.success('Sincronización actualizada');
      loadItemsAndLinks();
    } catch (err: any) {
      toast.error('Error al actualizar sincronización: ' + err.message);
    }
  }

  // Import Listings initial trigger
  async function handleImportListings() {
    if (actionLoading) return;
    setActionLoading(true);
    setImportProgress('Obteniendo IDs de publicaciones de Mercado Libre...');

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const session = (await supabase.auth.getSession()).data.session;
      const token = session?.access_token || '';

      // 1. Fetch publication IDs from Mercado Libre
      const listRes = await fetch(`${supabaseUrl}/functions/v1/mercadolibre-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ action: 'list_item_ids', limit: 50 })
      });

      const listData = await listRes.json();
      if (!listRes.ok || !listData.success) {
        throw new Error(listData.error || 'Error al obtener publicaciones de Mercado Libre');
      }

      const itemIds = listData.item_ids || [];
      if (itemIds.length === 0) {
        toast.info('No se encontraron publicaciones activas en tu cuenta.');
        setImportProgress('');
        setActionLoading(false);
        return;
      }

      setImportProgress(`Importando ${itemIds.length} publicaciones a staging...`);

      // 2. Import items to staging
      const importRes = await fetch(`${supabaseUrl}/functions/v1/mercadolibre-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ action: 'import', ml_item_ids: itemIds })
      });

      const importData = await importRes.json();
      if (!importRes.ok || !importData.success) {
        throw new Error(importData.error || 'Fallo en la importación a staging');
      }

      const successes = importData.results?.filter((r: any) => r.status === 'success')?.length || 0;
      toast.success(`Importación finalizada: ${successes} items ingestados en staging.`);
      loadItemsAndLinks();
      loadImportLogs();
    } catch (err: any) {
      toast.error(err.message || 'Error durante la importación');
    } finally {
      setActionLoading(false);
      setImportProgress('');
    }
  }

  // Filter local items
  const filteredItems = items.filter(item => {
    const titleMatch = item.title.toLowerCase().includes(searchQuery.toLowerCase());
    const itemIdMatch = item.ml_item_id.toLowerCase().includes(searchQuery.toLowerCase());
    return titleMatch || itemIdMatch;
  });

  return (
    <div className="max-w-7xl space-y-8 animation-fade-in pb-20 text-white">
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8">
        <div>
           <div className="text-[11px] text-[#f00856] font-black uppercase tracking-[0.4em] mb-3">Ecosystem Sync</div>
           <h2 className="text-5xl font-black text-white">Mercado Libre</h2>
           <p className="text-sm text-slate-500 font-bold mt-3 uppercase tracking-[0.2em]">Sincronización omnicanal de catálogo, stock y precios</p>
        </div>
        
        {account && (
          <div className="flex gap-4">
            <button 
              onClick={handleImportListings}
              disabled={actionLoading}
              className="bg-[#FFE600] text-black text-[12px] font-black uppercase tracking-widest px-12 py-5 rounded-full hover:shadow-[0_0_50px_rgba(255,230,0,0.4)] transition-all flex items-center gap-3 active:scale-[0.98] border border-black/10 disabled:opacity-55"
            >
              <RefreshCw className={`w-5 h-5 ${actionLoading && 'animate-spin'}`} /> 
              {actionLoading ? 'Procesando...' : 'Importar Publicaciones'}
            </button>
            <button 
              onClick={handleDisconnect}
              disabled={actionLoading}
              className="glass border border-white/10 text-white text-[12px] font-black uppercase tracking-widest px-12 py-5 rounded-full hover:bg-red-650/15 hover:border-red-600/30 transition-all flex items-center gap-3 shadow-xl"
            >
              <X className="w-5 h-5 text-red-500" /> Desconectar Cuenta
            </button>
          </div>
        )}
      </div>

      {importProgress && (
        <div className="bg-blue-650/10 border border-blue-500/20 p-4 rounded-3xl flex items-center gap-3 text-xs text-blue-400 animate-pulse">
          <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
          <span>{importProgress}</span>
        </div>
      )}

      {/* Account connection status */}
      {loadingAccount ? (
        <div className="glass rounded-[2.5rem] border border-white/10 p-12 text-center text-slate-500 animate-pulse text-xs uppercase tracking-widest">
          Cargando configuración de Mercado Libre...
        </div>
      ) : !account ? (
        <div className="glass rounded-[2.5rem] border border-white/10 p-12 text-center space-y-6 relative overflow-hidden group">
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-[#FFE600]/5 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700" />
          <div className="w-16 h-16 bg-[#FFE600]/10 border border-[#FFE600]/20 rounded-2xl flex items-center justify-center mx-auto shadow-xl">
            <Link2 className="w-8 h-8 text-[#FFE600]" />
          </div>
          <div className="max-w-md mx-auto space-y-2">
            <h3 className="text-xl font-bold">Conectar tu Tienda</h3>
            <p className="text-xs text-slate-400">
              Conecta tu cuenta de Mercado Libre Collectibles para importar tus artículos, sincronizar stock en tiempo real de forma bidireccional y automatizar el inventario de ventas.
            </p>
          </div>
          <button 
            onClick={handleConnect}
            className="bg-[#FFE600] text-black text-xs font-black uppercase tracking-widest px-10 py-4.5 rounded-full hover:shadow-[0_0_40px_rgba(255,230,0,0.3)] transition-all active:scale-[0.98]"
          >
            Conectar Mercado Libre
          </button>
        </div>
      ) : (
        <>
          {/* Quick Connection Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <MiniStat label="Nick Mercado Libre" value={account.nickname} color="yellow" />
            <MiniStat label="Vendedor ID" value={account.seller_id} color="blue" />
            <MiniStat label="Items en Staging" value={items.length} color="purple" />
            <MiniStat label="Estado de Conexión" value="Conectado" color="green" />
          </div>

          {/* Sync Matrix */}
          <div className="glass rounded-[2.5rem] border border-white/10 overflow-hidden shadow-2xl">
            <div className="p-10 md:p-12 border-b border-white/5 bg-white/[0.04] flex flex-col md:flex-row md:items-center justify-between gap-6">
               <div className="flex items-center gap-6">
                 <div className="w-12 h-12 rounded-2xl bg-[#f00856]/10 flex items-center justify-center shadow-xl">
                    <Layers className="w-6 h-6 text-[#f00856]" />
                 </div>
                 <div>
                   <h3 className="text-[12px] font-black text-white uppercase tracking-[0.5em]">Staging Catalog Matrix</h3>
                   <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">Items importados y vinculaciones del catálogo</p>
                 </div>
               </div>

               <div className="flex gap-2">
                 <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2 shadow-inner focus-within:ring-2 focus-within:ring-pink-500/20">
                   <Search className="w-4 h-4 text-slate-500" />
                   <input 
                     type="text" 
                     placeholder="Buscar por título o ID..." 
                     className="text-xs bg-transparent outline-none w-48 border-none ring-0 focus:ring-0 text-white" 
                     value={searchQuery}
                     onChange={e => setSearchQuery(e.target.value)}
                   />
                 </div>
                 
                 <select
                   value={statusFilter}
                   onChange={e => setStatusFilter(e.target.value)}
                   className="text-xs font-bold bg-white/5 border border-white/10 text-white rounded-xl px-2 py-2 outline-none cursor-pointer"
                 >
                   <option value="all">Ver Todos (Estados)</option>
                   <option value="review_needed">Revisión Requerida</option>
                   <option value="pending">Pendientes</option>
                   <option value="approved">Aprobados</option>
                   <option value="ignored">Ignorados</option>
                 </select>
               </div>
            </div>

            <div className="overflow-x-auto no-scrollbar">
              {loadingItems ? (
                <div className="text-center py-20 text-slate-500 text-xs">Cargando catálogo en staging...</div>
              ) : filteredItems.length === 0 ? (
                <div className="text-center py-20 text-slate-500 text-xs">No se encontraron ítems.</div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead className="bg-white/[0.02] border-b border-white/5">
                    <tr className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">
                      <th className="p-8">Publicación / ID</th>
                      <th className="p-8 text-center">Estado Staging</th>
                      <th className="p-8 text-right">Precio Staging</th>
                      <th className="p-8 text-center">Stock Staging</th>
                      <th className="p-8 text-center">Sincronizar Stock</th>
                      <th className="p-8 text-center">Sincronizar Precio</th>
                      <th className="p-8">Estado Sync</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredItems.map(item => {
                      const link = item.ml_catalog_links?.[0];
                      const isLinked = !!link;
                      
                      return (
                        <tr key={item.id} className="hover:bg-white/[0.02] transition-colors group text-xs">
                          <td className="p-8">
                             <div className="flex items-center gap-3">
                               <img src={item.thumbnail} alt="" className="w-10 h-10 object-cover border border-white/10 rounded" />
                               <div className="min-w-0">
                                 <p className="font-black text-white text-[16px] group-hover:text-[#f00856] transition-colors uppercase tracking-tight truncate max-w-sm">{item.title}</p>
                                 <div className="flex items-center gap-2 mt-1">
                                   <span className="font-mono text-[9px] text-slate-500 uppercase bg-white/5 px-2 py-0.5 rounded">{item.ml_item_id}</span>
                                   <a href={item.permalink} target="_blank" rel="noreferrer" title="Ver en Mercado Libre" className="text-slate-500 hover:text-white">
                                     <ExternalLink className="w-3.5 h-3.5" />
                                   </a>
                                 </div>
                               </div>
                             </div>
                          </td>
                          <td className="p-8 text-center">
                             <span className={`px-2 py-0.5 rounded text-[9px] uppercase font-black tracking-wider ${
                               item.status === 'approved' ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
                               item.status === 'review_needed' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' :
                               item.status === 'ignored' ? 'bg-white/10 text-slate-400' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                             }`}>
                               {item.status}
                             </span>
                          </td>
                          <td className="p-8 text-right text-[15px] font-black tracking-tighter">${Math.round(item.price)}</td>
                          <td className="p-8 text-center font-black text-[15px] tracking-tighter">{item.available_quantity} u.</td>
                          
                          {/* Sync Stock Toggle */}
                          <td className="p-8 text-center">
                            {isLinked ? (
                              <button 
                                onClick={() => toggleSyncSetting(item.ml_item_id, 'sync_stock', link.sync_stock)}
                                className="text-slate-400 hover:text-white transition-colors"
                              >
                                {link.sync_stock ? <ToggleRight className="w-8 h-8 text-pink-600" /> : <ToggleLeft className="w-8 h-8" />}
                              </button>
                            ) : <span className="text-[10px] text-slate-600 italic">No Vinculado</span>}
                          </td>

                          {/* Sync Price Toggle */}
                          <td className="p-8 text-center">
                            {isLinked ? (
                              <button 
                                onClick={() => toggleSyncSetting(item.ml_item_id, 'sync_price', link.sync_price)}
                                className="text-slate-400 hover:text-white transition-colors"
                              >
                                {link.sync_price ? <ToggleRight className="w-8 h-8 text-pink-600" /> : <ToggleLeft className="w-8 h-8" />}
                              </button>
                            ) : <span className="text-[10px] text-slate-600 italic">No Vinculado</span>}
                          </td>

                          <td className="p-8 font-medium">
                             {isLinked ? (
                               link.last_sync_status === 'synced' ? (
                                 <span className="text-emerald-400 flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> Sincronizado</span>
                               ) : (
                                 <span className="text-red-400 flex items-center gap-1" title={link.last_sync_error || 'Fallo desconocido'}><ShieldAlert className="w-3.5 h-3.5" /> Fallido</span>
                               )
                             ) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Logs Panel */}
          <div className="glass rounded-[2.5rem] border border-white/10 overflow-hidden shadow-2xl">
            <div className="p-10 md:p-12 border-b border-white/5 bg-white/[0.04] flex items-center gap-6">
               <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center">
                  <Clock className="w-6 h-6 text-slate-500" />
               </div>
               <div>
                 <h3 className="text-[12px] font-black text-white uppercase tracking-[0.5em]">Event Log / System Activity</h3>
                 <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">Historial reciente de sincronizaciones y errores</p>
               </div>
            </div>
            
            <div className="overflow-x-auto no-scrollbar">
              {loadingLogs ? (
                <div className="text-center py-10 text-slate-500 text-xs">Cargando historial de eventos...</div>
              ) : logs.length === 0 ? (
                <div className="text-center py-10 text-slate-500 text-xs">No hay actividad reciente en el historial.</div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <tbody className="divide-y divide-white/5">
                    {logs.map((log) => (
                      <tr key={log.id} className="hover:bg-white/[0.02] transition-colors group text-xs">
                        <td className="p-8 text-slate-700 font-black uppercase tracking-[0.2em] w-48">
                          {new Date(log.created_at).toLocaleString()}
                        </td>
                        <td className="p-8 font-black text-white text-[15px] uppercase tracking-widest group-hover:text-[#f00856] group-hover:translate-x-2 transition-all">
                          {log.action}
                        </td>
                        <td className="p-8 text-slate-400 font-medium">
                          {JSON.stringify(log.details)}
                        </td>
                        <td className="p-8">
                           <span className={`px-2.5 py-1.5 rounded-full shadow-lg text-[9px] uppercase font-black tracking-wider ${
                             log.status === 'success' ? 'text-emerald-400 bg-emerald-400/10' : 'text-red-400 bg-red-400/10'
                           }`}>
                             {log.status === 'success' ? 'OK' : 'Error'}
                           </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number | string; color: string }) {
  const getTheme = () => {
    if (color === 'yellow') return 'text-[#FFE600] group-hover:text-[#FFE600]';
    if (color === 'blue') return 'text-blue-400 group-hover:text-blue-500';
    if (color === 'green') return 'text-emerald-400 group-hover:text-emerald-500';
    return 'text-purple-400 group-hover:text-purple-500';
  };

  return (
    <div className="soft rounded-[2rem] p-10 group hover:bg-white/[0.04] transition-all border border-white/5 hover:border-[#f00856]/30 shadow-xl overflow-hidden relative bg-white/[0.01]">
      <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-white/5 rounded-full group-hover:scale-150 transition-transform duration-700"></div>
      <p className={`text-4xl font-black mb-3 tracking-tighter relative z-10 truncate ${getTheme()}`}>{value}</p>
      <p className="text-[10px] font-black text-slate-650 uppercase tracking-[0.4em] relative z-10 group-hover:text-slate-400 transition-colors">{label}</p>
    </div>
  );
}
