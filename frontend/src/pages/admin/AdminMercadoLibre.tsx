import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { RefreshCw, Play, AlertCircle, CheckCircle2, Settings2, Save, ExternalLink, Link2, X, Loader2 } from 'lucide-react';

export default function AdminMercadoLibre() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [dbClientId, setDbClientId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  
  // Settings state
  const [markupType, setMarkupType] = useState('percentage');
  const [markupValue, setMarkupValue] = useState('10');
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
    const { data } = await supabase.from('site_settings').select('*').in('key', ['ml_price_markup_type', 'ml_price_markup_value']);
    if (data) {
       const type = data.find(d => d.key === 'ml_price_markup_type')?.value;
       const val = data.find(d => d.key === 'ml_price_markup_value')?.value;
       if (type) setMarkupType(type);
       if (val) setMarkupValue(val);
    }
  }

  async function saveSettings() {
    setSavingSettings(true);
    await supabase.from('site_settings').upsert([
       { key: 'ml_price_markup_type', value: markupType, updated_at: new Date().toISOString() },
       { key: 'ml_price_markup_value', value: markupValue, updated_at: new Date().toISOString() }
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
      .select('id, title, status, base_price, product_variants(sku, inventory_count)')
      .limit(10);
    setProducts(data || []);
    setLoading(false);
  }

  async function triggerSync(action: 'publish' | 'sync_stock', productIds: string[]) {
    setSyncing(true);
    setSyncStatus(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mercadolibre-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ action, product_ids: productIds })
      });
      const result = await response.json();
      if (response.ok) {
        setSyncStatus(`Éxito: ${result.message}`);
      } else {
        throw new Error(result.error || 'Error desconocido');
      }
    } catch (err: any) {
      setSyncStatus(`Error: ${err.message}`);
    } finally {
      setSyncing(false);
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
            <h3 className="font-bold text-lg flex items-center gap-2"><Settings2 className="w-5 h-5 text-gray-500" /> Reglas de Precios (Locales vs ML)</h3>
            <button onClick={saveSettings} disabled={savingSettings} className="btn-secondary text-sm py-1.5 px-3 flex items-center gap-2">
               {savingSettings ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" /> } Guardar Regla
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
             {syncing ? 'Procesando...' : 'Ver Productos en ML'}
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
                 <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">SKU Base</th>
                 <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Stock Local</th>
                 <th className="px-6 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-widest">ML Status</th>
               </tr>
             </thead>
             <tbody className="divide-y divide-gray-100">
               {products.map(p => (
                 <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                   <td className="px-6 py-4 font-medium text-sm text-gray-900">{p.title} <span className="text-gray-400 block text-xs">Ajuste Sugerido: ${Math.round(p.base_price * (1 + Number(markupValue) / 100))}</span></td>
                   <td className="px-6 py-4 text-sm font-mono text-gray-500">{p.product_variants?.[0]?.sku || '-'}</td>
                   <td className="px-6 py-4 font-bold text-blue-600">{p.product_variants?.[0]?.inventory_count || 0} u.</td>
                   <td className="px-6 py-4"><span className="px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-widest border border-gray-200 bg-gray-100 text-gray-500">Sin vincular</span></td>
                 </tr>
               ))}
               {products.length === 0 && (
                  <tr>
                     <td colSpan={4} className="px-6 py-12 text-center text-gray-500">No hay productos en la base de datos para sincronizar.</td>
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
          onImport={(ids) => {
            setShowImportModal(false);
            triggerSync('import', [], ids);
          }}
          loading={syncing}
        />
      )}
    </div>
  );
}

function MLImportModal({ onClose, onImport, loading }: { onClose: () => void, onImport: (ids: string[]) => void, loading: boolean }) {
  const [items, setItems] = useState<any[]>([]);
  const [fetching, setFetching] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchMLItems();
  }, []);

  async function fetchMLItems() {
    try {
      const { data, error } = await supabase.functions.invoke('mercadolibre-sync', {
        body: { action: 'list_items' }
      });
      if (error) throw error;
      setItems(data.items || []);
    } catch (err) {
      alert("Error al obtener items: " + (err as any).message);
      onClose();
    } finally {
      setFetching(false);
    }
  }

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-zoom-in">
        <div className="p-6 border-b flex items-center justify-between bg-gray-50">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-blue-600" />
              Seleccionar Productos de Mercado Libre
            </h2>
            <p className="text-xs text-gray-500 mt-1">Se muestran los productos activos de tu cuenta.</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {fetching ? (
            <div className="flex flex-col items-center justify-center py-20 text-blue-600">
              <Loader2 className="w-10 h-10 animate-spin mb-4" />
              <p className="font-medium">Conectando con Mercado Libre...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-20 text-gray-500">No se encontraron productos activos en tu cuenta de ML.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white border-b text-left text-xs font-bold text-gray-400 uppercase">
                <tr>
                  <th className="p-4 w-12 pt-0 h-10">
                    <input 
                      type="checkbox" 
                      onChange={(e) => setSelected(e.target.checked ? new Set(items.map((i:any) => i.ml_id)) : new Set())}
                      checked={selected.size === items.length && items.length > 0}
                      className="rounded border-gray-300"
                    />
                  </th>
                  <th className="p-4 pt-0 h-10">Producto</th>
                  <th className="p-4 pt-0 h-10">Detalles</th>
                  <th className="p-4 pt-0 h-10 text-right pr-6">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((item:any) => (
                  <tr key={item.ml_id} className={`hover:bg-blue-50/40 transition-colors ${selected.has(item.ml_id) ? 'bg-blue-50/60' : ''}`}>
                    <td className="p-4">
                      <input 
                        type="checkbox" 
                        checked={selected.has(item.ml_id)}
                        onChange={() => toggleSelect(item.ml_id)}
                        className="rounded border-gray-300 text-blue-600 w-4 h-4"
                      />
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-4">
                        <img src={item.thumbnail} alt="" className="w-12 h-12 rounded-lg object-cover border bg-white" />
                        <div>
                          <p className="font-bold text-gray-900 leading-tight">{item.title}</p>
                          <p className="text-[10px] text-gray-400 mt-1 uppercase font-mono">{item.ml_id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-xs">
                      <div className="space-y-1">
                        <p className="font-medium text-gray-600">Stock: <span className="text-gray-900">{item.available_quantity || 0}</span></p>
                        <p className="font-medium text-blue-600">Precio: ${item.price}</p>
                      </div>
                    </td>
                    <td className="p-4 text-right pr-6">
                       <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${item.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                         {item.status}
                       </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="p-6 border-t bg-gray-50 flex items-center justify-between">
           <span className="text-sm font-medium text-gray-600">
             {selected.size} productos seleccionados
           </span>
           <div className="flex gap-3">
             <button onClick={onClose} className="px-6 py-2.5 rounded-xl text-gray-600 hover:bg-gray-200 font-bold transition-all">Cancelar</button>
             <button 
              onClick={() => onImport(Array.from(selected))}
              disabled={selected.size === 0 || loading}
              className="px-8 py-2.5 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:opacity-50 disabled:bg-gray-400 shadow-lg shadow-blue-200 transition-all transform hover:-translate-y-0.5"
             >
               {loading ? 'Importando...' : 'Importar Selección'}
             </button>
           </div>
        </div>
      </div>
    </div>
  );
}
