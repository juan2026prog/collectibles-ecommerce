import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { RefreshCw, Play, AlertCircle, CheckCircle2, Settings2, Save } from 'lucide-react';

export default function AdminMercadoLibre() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  
  // Settings state
  const [markupType, setMarkupType] = useState('percentage');
  const [markupValue, setMarkupValue] = useState('10');
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    fetchProducts();
    fetchSettings();
  }, []);

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
        <button className="btn-primary bg-yellow-400 text-blue-900 border-yellow-400 hover:bg-yellow-500 flex items-center gap-2" disabled={syncing}>
          Conectar Cuenta
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
         <div className="bg-white p-6 rounded-xl border shadow-sm">
           <h3 className="font-bold text-lg mb-2">Publicación Masiva</h3>
           <p className="text-sm text-gray-500 mb-4">Envía productos nuevos de la base de datos hacia Mercado Libre aplicando las reglas vigentes.</p>
           <button 
             onClick={() => triggerSync('publish', products.map(p => p.id))}
             disabled={syncing || products.length === 0}
             className="btn-primary w-full flex justify-center gap-2"
           >
             <Play size={18} /> {syncing ? 'Sincronizando...' : 'Publicar Todo (Demo)'}
           </button>
         </div>

         <div className="bg-white p-6 rounded-xl border shadow-sm">
           <h3 className="font-bold text-lg mb-2">Sincronización Bidireccional</h3>
           <p className="text-sm text-gray-500 mb-4">Actualiza cantidades y precios entre Mercad Libre y tu sistema local respetando tu Markup.</p>
           <button 
             onClick={() => triggerSync('sync_stock', products.map(p => p.id))}
             disabled={syncing || products.length === 0}
             className="btn-secondary w-full flex justify-center gap-2 text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100"
           >
             <RefreshCw size={18} className={syncing ? 'animate-spin' : ''} /> 
             {syncing ? 'Actualizando...' : 'Sincronizar Catálogo Completo'}
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
    </div>
  );
}
