import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { RefreshCw, Play, AlertCircle, CheckCircle2, Settings2, Save, ExternalLink, Link2, X, Loader2 } from 'lucide-react';

async function callEdgeFunction(body: any) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const session = (await supabase.auth.getSession()).data.session;
  const token = session?.access_token || '';
  const res = await fetch(`${supabaseUrl}/functions/v1/mercadolibre-sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY || ''
    },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${data?.error || data?.message || JSON.stringify(data)}`);
  if (!data.success) throw new Error(data.error || 'Error desconocido');
  return data;
}

export default function AdminMercadoLibre() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [dbClientId, setDbClientId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  
  // Settings state
  const [markupType, setMarkupType] = useState('percentage');
  const [markupValue, setMarkupValue] = useState('10');
  const [rulesEnabled, setRulesEnabled] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    fetchProducts();
    fetchSettings();
    checkConnection();
  }, []);

  async function checkConnection() {
    const { data } = await supabase
      .from('site_settings')
      .select('key, value')
      .in('key', ['mercadolibre_access_token', 'mercadolibre_client_id']);
    
    if (data) {
      const token = data.find(d => d.key === 'mercadolibre_access_token')?.value;
      const clientId = data.find(d => d.key === 'mercadolibre_client_id')?.value;
      setIsConnected(!!token);
      if (clientId) setDbClientId(clientId);
    }
  }

  async function fetchSettings() {
    const { data } = await supabase.from('site_settings').select('*').in('key', ['ml_price_markup_type', 'ml_price_markup_value', 'ml_price_rules_enabled']);
    if (data) {
       const type = data.find(d => d.key === 'ml_price_markup_type')?.value;
       const val = data.find(d => d.key === 'ml_price_markup_value')?.value;
       const enabled = data.find(d => d.key === 'ml_price_rules_enabled')?.value;
       if (type) setMarkupType(type);
       if (val) setMarkupValue(val);
       if (enabled !== undefined) setRulesEnabled(enabled === 'true');
    }
  }

  async function saveSettings() {
    setSavingSettings(true);
    await supabase.from('site_settings').upsert([
       { key: 'ml_price_markup_type', value: markupType, updated_at: new Date().toISOString() },
       { key: 'ml_price_markup_value', value: markupValue, updated_at: new Date().toISOString() },
       { key: 'ml_price_rules_enabled', value: rulesEnabled ? 'true' : 'false', updated_at: new Date().toISOString() }
    ], { onConflict: 'key' });
    setSavingSettings(false);
  }

  function handleConnect() {
    // Priority: .env > database
    const clientId = import.meta.env.VITE_ML_CLIENT_ID || dbClientId;
    const redirectUri = `${window.location.origin}/callback`;
    
    if (!clientId) {
      alert('Error: No se encontró ML_CLIENT_ID en el sistema. Asegúrate de que esté configurado.');
      return;
    }

    const authUrl = `https://auth.mercadolibre.com.uy/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}`;
    
    // Use current window for more reliable redirection
    window.location.href = authUrl;
  }

  async function fetchProducts() {
    setLoading(true);
    const { data } = await supabase
      .from('products')
      .select('id, title, status, base_price, ml_item_id, ml_status, category_id, categories(name), brands(name), product_variants(sku, inventory_count)')
      .order('updated_at', { ascending: false })
      .limit(50);
    setProducts(data || []);
    setLoading(false);
  }


  async function triggerSync(action: string, productIds: string[] = [], mlItemIds: string[] = [], limit: number = 20, status: string = 'active') {
    setSyncing(true);
    setSyncStatus(null);
    setSyncProgress(0);
    try {
      const targetIds = action === 'import' ? mlItemIds : productIds;
      const useBatching = targetIds.length > 5;

      if (useBatching) {
        // Batch processing for large sets to avoid Edge Function timeouts
        const chunkSize = 5;
        let processed = 0;
        let totalProcessed = 0;

        for (let i = 0; i < targetIds.length; i += chunkSize) {
            const chunk = targetIds.slice(i, i + chunkSize);
            
            const reqBody = { 
               action, 
               product_ids: action === 'import' ? [] : chunk, 
               ml_item_ids: action === 'import' ? chunk : [], 
               limit, 
               status 
            };

            const data = await callEdgeFunction(reqBody);
            
            totalProcessed += (data.count || data.results?.length || 0);
            processed += chunk.length;
            setSyncProgress(Math.round((processed / targetIds.length) * 100));
        }
        setSyncStatus(`¡Operación '${action}' completada con éxito! (${totalProcessed} items procesados)`);
      } else {
        const data = await callEdgeFunction({ action, product_ids: productIds, ml_item_ids: mlItemIds, limit, status });
        
        const count = data.count || data.results?.length || 0;
        setSyncStatus(`¡Operación '${action}' completada con éxito! (${count} items procesados)`);
      }
      fetchProducts();
    } catch (err: any) {
      setSyncStatus(`Error: ${err.message}`);
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncProgress(0), 3000);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold dark:text-white flex items-center gap-2">
            <div className="w-8 h-8 bg-yellow-400 rounded-full flex items-center justify-center font-bold text-blue-900 text-sm">ML</div>
            Mercado Libre Sync
          </h2>
          <p className="text-gray-500 mt-1">Sincroniza stock, precios y estados mediante la Edge Function.</p>
        </div>
        <button 
          onClick={handleConnect}
          disabled={connecting}
          className="btn-primary bg-yellow-400 text-blue-900 border-yellow-400 hover:bg-yellow-500 flex items-center gap-2"
        >
          {connecting ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : isConnected ? (
            <>
              <Link2 className="w-4 h-4" />
              Cuenta Conectada
            </>
          ) : (
            <>
              <ExternalLink className="w-4 h-4" />
              Conectar Cuenta
            </>
          )}
        </button>
      </div>

      {/* Pricing Rules Configuration */}
      <div className="bg-white p-6 rounded-xl border shadow-sm">
         <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <h3 className="font-bold text-lg flex items-center gap-2"><Settings2 className="w-5 h-5 text-gray-500" /> Reglas de Precios (Locales vs ML)</h3>
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer bg-gray-50 px-3 py-1.5 rounded-full border border-gray-200">
                 <input 
                   type="checkbox" 
                   checked={rulesEnabled} 
                   onChange={e => setRulesEnabled(e.target.checked)} 
                   className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                 />
                 <span className="font-medium select-none">Activar reglas (sincronización y publicación)</span>
              </label>
            </div>
            <button onClick={saveSettings} disabled={savingSettings} className="btn-secondary text-sm py-1.5 px-3 flex items-center gap-2">
               {savingSettings ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" /> } Guardar Ajustes
            </button>
         </div>
         <p className="text-sm text-gray-500 mb-4 border-b pb-4">Define cómo se deben comportar los precios en tu e-commerce respecto al precio original que tienes en Mercado Libre, o viceversa, cuando ocurre la sincronización.</p>
         
         <div className="flex flex-col sm:flex-row gap-4 items-end">
             <div className="flex-1">
                 <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Tipo de Ajuste (Markup)</label>
                 <select className="form-input w-full" value={markupType} onChange={e => setMarkupType(e.target.value)}>
                    <option value="percentage">Aumento Porcentual (%)</option>
                    <option value="fixed">Monto Fijo Exacto ($)</option>
                    <option value="discount_percentage">Descuento Porcentual (%)</option>
                    <option value="equal">Mantener mismo precio (1:1)</option>
                 </select>
             </div>
             <div className="flex-1">
                 <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Valor del Ajuste</label>
                 <div className="flex">
                    <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 font-bold">
                       {markupType.includes('percentage') ? '%' : '$'}
                    </span>
                    <input type="number" className="form-input flex-1 rounded-l-none" value={markupValue} onChange={e => setMarkupValue(e.target.value)} disabled={markupType === 'equal'} />
                 </div>
             </div>
         </div>
         <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-800">
            <strong>Ejemplo:</strong> Si un producto en Mercado Libre cuesta <strong>$1000</strong> y tienes un "Aumento Porcentual de 10", el precio en tu tienda local se configurará en <strong>$1100</strong> para absorber la comisión, o dar margen extra.
         </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <div className="bg-white p-6 rounded-xl border shadow-sm border-blue-100 bg-blue-50/20">
           <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-4">
              <RefreshCw className="w-6 h-6" />
           </div>
           <h3 className="font-bold text-lg mb-2">Importar Catálogo (ML → Web)</h3>
           <p className="text-sm text-gray-500 mb-4">Selecciona qué productos de Mercado Libre quieres traer a tu tienda.</p>
           <button 
             onClick={() => setShowImportModal(true)}
             disabled={syncing}
             className="btn-primary w-full bg-blue-600 border-blue-600 hover:bg-blue-700 flex justify-center gap-2"
           >
             {syncing ? 'Sincronizando...' : 'Gestionar Importación (ML)'}
           </button>
         </div>

         <div className="bg-white p-6 rounded-xl border shadow-sm">
           <div className="w-10 h-10 bg-yellow-100 text-yellow-600 rounded-full flex items-center justify-center mb-4">
              <Play className="w-6 h-6" />
           </div>
           <h3 className="font-bold text-lg mb-2">Publicación (Web → ML)</h3>
           <p className="text-sm text-gray-500 mb-4">Envía productos nuevos de la base de datos hacia Mercado Libre aplicando las reglas vigentes.</p>
           <button 
             onClick={() => triggerSync('publish', products.map(p => p.id))}
             disabled={syncing || products.length === 0}
             className="btn-primary w-full bg-yellow-400 text-blue-900 border-yellow-400 hover:bg-yellow-500 flex justify-center gap-2"
           >
             {syncing ? 'Sincronizando...' : 'Publicar Catálogo Web'}
           </button>
         </div>

         <div className="bg-white p-6 rounded-xl border shadow-sm">
           <div className="w-10 h-10 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4">
              <RefreshCw className="w-6 h-6" />
           </div>
           <h3 className="font-bold text-lg mb-2">Actualizar Stock (Sync)</h3>
           <p className="text-sm text-gray-500 mb-4">Actualiza stock y precios bidireccionalmente respetando las reglas de Markup configuradas.</p>
           <button 
             onClick={() => triggerSync('sync_stock', products.map(p => p.id))}
             disabled={syncing || products.length === 0}
             className="btn-secondary w-full border-green-200 text-green-700 bg-green-50 hover:bg-green-100 flex justify-center gap-2"
           >
             {syncing ? 'Actualizando...' : 'Sincronizar Stock/Precios'}
           </button>
         </div>
      </div>

      {syncing && syncProgress > 0 && (
         <div className="bg-white p-4 rounded-xl border shadow-sm flex flex-col gap-2">
             <div className="flex justify-between items-center text-sm font-bold text-blue-900">
                <span>Progreso de Sincronización / Importación</span>
                <span>{syncProgress}%</span>
             </div>
             <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${syncProgress}%` }}></div>
             </div>
         </div>
      )}

      {syncStatus && (
        <div className={`p-4 rounded-lg flex items-center gap-3 ${syncStatus.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700 border border-green-200'}`}>
           {syncStatus.startsWith('Error') ? <AlertCircle /> : <CheckCircle2 className="text-green-500" />}
           <span className="font-medium">{syncStatus}</span>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h3 className="font-bold text-lg">Últimas vinculaciones detectadas</h3>
        </div>
        {loading ? (
          <div className="p-12 text-center text-gray-500 animate-pulse">Cargando productos...</div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
             <thead className="bg-gray-50">
               <tr>
                 <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Producto (Local)</th>
                 <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Categoría</th>
                 <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">SKU Base</th>
                 <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Stock Local</th>
                 <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">ML Status</th>
               </tr>
             </thead>
             <tbody className="divide-y divide-gray-100">
               {products.map(p => (
                 <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                   <td className="px-6 py-4 font-medium text-sm text-gray-900">
                     <div className="flex items-center gap-2">
                        {p.title}
                        {(p as any).brands?.name && (
                           <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100">
                             {(p as any).brands.name}
                           </span>
                        )}
                     </div>
                     {p.ml_item_id && <span className="text-blue-400 block text-[10px] font-mono mt-0.5">{p.ml_item_id}</span>}
                     {rulesEnabled && <span className="text-gray-400 block text-xs mt-1">Ajuste Sugerido: ${Math.round(p.base_price * (1 + Number(markupValue) / 100))}</span>}
                   </td>
                   <td className="px-6 py-4 text-sm text-gray-600">
                     {(p as any).categories?.name ? (
                       <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-600 border border-purple-100">{(p as any).categories.name}</span>
                     ) : (
                       <span className="text-gray-300 text-xs">—</span>
                     )}
                   </td>
                   <td className="px-6 py-4 text-sm font-mono text-gray-500">{p.product_variants?.[0]?.sku || '-'}</td>
                   <td className="px-6 py-4 font-bold text-blue-600">{p.product_variants?.[0]?.inventory_count || 0} u.</td>
                   <td className="px-6 py-4">
                     {p.ml_item_id ? (
                       <span className="px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-widest border border-green-200 bg-green-50 text-green-600">Vinculado</span>
                     ) : (
                       <span className="px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-widest border border-gray-200 bg-gray-100 text-gray-500">Sin vincular</span>
                     )}
                   </td>
                 </tr>
               ))}
               {products.length === 0 && (
                  <tr>
                     <td colSpan={5} className="px-6 py-12 text-center text-gray-500">No hay productos en la base de datos para sincronizar.</td>
                  </tr>
               )}
             </tbody>
          </table>
        )}
      </div>
      {/* ═══ ML IMPORT SELECTOR MODAL ═══ */}
      {showImportModal && (
        <MLImportModal 
          onClose={() => setShowImportModal(false)} 
          onImport={(ids, limit, status) => {
            setShowImportModal(false);
            triggerSync('import', [], ids);
          }}
          loading={syncing}
        />
      )}
    </div>
  );
}

function MLImportModal({ onClose, onImport, loading }: { onClose: () => void, onImport: (ids: string[], limit: number, status: string) => void, loading: boolean }) {
  const [items, setItems] = useState<any[]>([]);
  const [fetching, setFetching] = useState(true);
  const [fetchProgress, setFetchProgress] = useState(0);
  const [fetchPhase, setFetchPhase] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(20);
  const [itemStatus, setItemStatus] = useState('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [orderBy, setOrderBy] = useState('relevance');

  useEffect(() => {
    fetchMLItems();
  }, [limit, itemStatus, orderBy]);


  async function fetchMLItems() {
    setFetching(true);
    setFetchProgress(0);
    setFetchPhase('Buscando IDs en Mercado Libre...');
    setItems([]);
    try {
      // Phase 1: Get all item IDs (fast)
      const idsData = await callEdgeFunction({ action: 'list_item_ids', limit, status: itemStatus, sort: orderBy });
      const allIds: string[] = idsData.item_ids || [];
      
      if (!allIds.length) {
        setItems([]);
        setFetching(false);
        return;
      }

      // Phase 2: Fetch details in batches of 50
      setFetchPhase(`Cargando detalles de ${allIds.length} productos...`);
      const BATCH_SIZE = 50;
      const accumulated: any[] = [];
      
      for (let i = 0; i < allIds.length; i += BATCH_SIZE) {
        const chunk = allIds.slice(i, i + BATCH_SIZE);
        const detailData = await callEdgeFunction({ action: 'get_item_details', ml_ids: chunk });
        accumulated.push(...(detailData.items || []));
        setItems([...accumulated]);
        setFetchProgress(Math.round(((i + chunk.length) / allIds.length) * 100));
      }
      
      setFetchProgress(100);
    } catch (err: any) {
      console.error("Fetch ML Items Error:", err);
      alert("Error al obtener items: " + err.message);
    } finally {
      setFetching(false);
      setFetchPhase('');
    }
  }

  const filteredItems = items.filter(item => 
    item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-zoom-in">
        <div className="p-6 border-b flex items-center justify-between bg-gray-50 text-blue-900 border-blue-100">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-blue-600" />
              Mercado Libre: Selección de Productos
            </h2>
            <div className="flex items-center flex-wrap gap-3 mt-3">
               <div className="flex items-center gap-2 mr-4 bg-white border border-blue-100 rounded-lg px-2 py-1 shadow-inner focus-within:ring-2 focus-within:ring-blue-500/20">
                 <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                 <input 
                   type="text" 
                   placeholder="Buscar en el listado..." 
                   className="text-xs bg-transparent outline-none w-32 border-none ring-0 focus:ring-0" 
                   value={searchQuery}
                   onChange={e => setSearchQuery(e.target.value)}
                 />
               </div>

               <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Ver:</span>
               <select 
                 value={limit} 
                 onChange={(e) => setLimit(Number(e.target.value))}
                 className="text-xs font-bold bg-white border border-blue-200 text-blue-600 rounded-md px-2 py-1.5 outline-none transition-all focus:border-blue-500 shadow-sm"
               >
                 <option value={20}>20 prod.</option>
                 <option value={50}>50 prod.</option>
                 <option value={100}>100 prod.</option>
                 <option value={200}>200 prod.</option>
                 <option value={500}>500 prod.</option>
                 <option value={-1}>Todos (Sin límite)</option>
               </select>

               <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Estado:</span>
               <select 
                 value={itemStatus} 
                 onChange={(e) => setItemStatus(e.target.value)}
                 className="text-xs font-bold bg-white border border-blue-200 text-blue-600 rounded-md px-2 py-1.5 outline-none transition-all focus:border-blue-500 shadow-sm"
               >
                 <option value="active">Activas</option>
                 <option value="paused">Pausadas</option>
                 <option value="closed">Finalizadas</option>
                 <option value="all">Todas</option>
               </select>

               <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Orden:</span>
               <select 
                 value={orderBy} 
                 onChange={(e) => setOrderBy(e.target.value)}
                 className="text-xs font-bold bg-white border border-blue-200 text-blue-600 rounded-md px-2 py-1.5 outline-none transition-all focus:border-blue-500 shadow-sm"
               >
                 <option value="relevance">Recientes / Rellevancia</option>
                 <option value="price_asc">Menor Precio</option>
                 <option value="price_desc">Mayor Precio</option>
               </select>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-full transition-colors"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 bg-white">
          {fetching && items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-blue-600">
              <Loader2 className="w-12 h-12 animate-spin mb-4 opacity-70" />
              <p className="font-bold tracking-tight">{fetchPhase || 'Sincronizando con Mercado Libre...'}</p>
              {fetchProgress > 0 && (
                <div className="w-64 mt-4">
                  <div className="flex justify-between text-xs font-bold text-gray-500 mb-1">
                    <span>Progreso</span>
                    <span>{fetchProgress}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                    <div className="bg-blue-600 h-3 rounded-full transition-all duration-300 ease-out" style={{ width: `${fetchProgress}%` }}></div>
                  </div>
                </div>
              )}
              <p className="text-xs text-gray-400 mt-2">{items.length > 0 ? `${items.length} productos cargados...` : 'Esto puede demorar unos segundos para listas largas.'}</p>
            </div>
          ) : !fetching && items.length === 0 ? (
            <div className="text-center py-24">
               <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-gray-100">
                  <AlertCircle className="w-8 h-8 text-gray-300" />
               </div>
               <p className="text-gray-500 font-medium">No se encontraron productos activos.</p>
               <p className="text-xs text-gray-400 mt-1">Verifica que tu cuenta de ML Uruguay tenga publicaciones vigentes.</p>
            </div>
          ) : (
            <>
            {fetching && fetchProgress > 0 && (
              <div className="mb-3 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                <div className="flex justify-between items-center text-xs font-bold text-blue-800 mb-1.5">
                  <span className="flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> {fetchPhase}</span>
                  <span>{fetchProgress}%</span>
                </div>
                <div className="w-full bg-blue-100 rounded-full h-2 overflow-hidden">
                  <div className="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out" style={{ width: `${fetchProgress}%` }}></div>
                </div>
              </div>
            )}
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white border-b-2 border-gray-100 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">
                <tr>
                  <th className="p-4 w-12 pb-2">
                    <input 
                      type="checkbox" 
                      onChange={(e) => setSelected(e.target.checked ? new Set(filteredItems.map((i:any) => i.id)) : new Set())}
                      checked={selected.size === filteredItems.length && filteredItems.length > 0}
                      className="rounded border-gray-300 w-4 h-4 text-blue-600 cursor-pointer"
                    />
                  </th>
                  <th className="p-4 pb-2">Producto</th>
                  <th className="p-4 pb-2">Categoría ML</th>
                  <th className="p-4 pb-2">Inventario / Precio</th>
                  <th className="p-4 pb-2 text-right pr-6">Estado ML</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredItems.map((item:any) => (
                  <tr key={item.id} className={`hover:bg-blue-50/20 transition-all ${selected.has(item.id) ? 'bg-blue-50/50' : ''}`}>
                    <td className="p-4">
                      <input 
                        type="checkbox" 
                        checked={selected.has(item.id)}
                        onChange={() => toggleSelect(item.id)}
                        className="rounded border-gray-300 text-blue-600 w-4 h-4 cursor-pointer"
                      />
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-xl object-cover border-2 border-gray-50 overflow-hidden shadow-sm flex-shrink-0">
                           <img src={item.thumbnail?.replace('http://', 'https://')} alt="" className="w-full h-full object-cover" />
                        </div>
                        <div>
                          <p className="font-bold text-gray-800 leading-tight line-clamp-2">{item.title}</p>
                          <p className="text-[9px] text-gray-400 mt-1 font-mono">{item.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      {item.category_name ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] font-bold text-purple-700 bg-purple-50 border border-purple-100 rounded-full px-2 py-0.5 inline-block max-w-[180px] truncate" title={item.category_name}>
                            {item.category_name.split(' > ').pop()}
                          </span>
                          <span className="text-[8px] text-gray-400 truncate max-w-[180px]" title={item.category_name}>
                            {item.category_name}
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="p-4 text-xs">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 font-bold text-gray-700">
                           <span className={`w-2 h-2 rounded-full ${item.available_quantity > 0 ? 'bg-green-500' : 'bg-red-500'}`} />
                           {item.available_quantity || 0} disponibles
                        </div>
                        <p className="font-black text-blue-700 text-sm tracking-tight">UYU ${item.price.toLocaleString()}</p>
                      </div>
                    </td>
                    <td className="p-4 text-right pr-6">
                       <span className={`px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-tighter ${item.status === 'active' ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-gray-100 text-gray-500 border border-gray-200'}`}>
                         {item.status === 'active' ? 'ACTIVA' : item.status}
                       </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </>
          )}
        </div>

        <div className="p-6 border-t bg-gray-50 flex items-center justify-between">
           <div className="flex flex-col">
              <span className="text-sm font-black text-blue-900">
                {selected.size} productos seleccionados para importar
              </span>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">De un total de {filteredItems.length} filtrados ({items.length} cargados)</p>
           </div>
           <div className="flex gap-4">
             <button onClick={onClose} className="px-6 py-2.5 rounded-xl text-gray-500 font-bold hover:bg-gray-200 transition-all active:scale-95">Descartar</button>
             <button 
              onClick={() => onImport(Array.from(selected), limit, itemStatus)}
              disabled={selected.size === 0 || loading}
              className="px-10 py-3 rounded-xl bg-blue-600 text-white font-black hover:bg-blue-700 disabled:opacity-40 disabled:grayscale shadow-lg shadow-blue-200 transition-all transform hover:-translate-y-1 active:translate-y-0 active:scale-95"
             >
               {loading ? 'PROCESANDO...' : 'IMPORTAR AHORA'}
             </button>
           </div>
        </div>
      </div>
    </div>
  );
}
