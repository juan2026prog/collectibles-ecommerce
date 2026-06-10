import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Edit, RefreshCw, XCircle, Eye, Loader2, Search, ExternalLink, Code } from 'lucide-react';
import { useToast } from '../../components/admin/Toast';
import { formatUSD, formatUYU, formatPercent, formatDate } from '../../lib/formatters';

export default function AdminInternationalProducts() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [rawModalData, setRawModalData] = useState<any>(null);

  useEffect(() => {
    fetchProducts();
  }, [statusFilter]);

  async function fetchProducts() {
    setLoading(true);
    let q = supabase.from('international_products').select('*').order('created_at', { ascending: false });
    if (statusFilter !== 'all') {
      q = q.eq('status', statusFilter);
    }
    const { data, error } = await q;
    if (error) {
      addToast({ title: 'Error', message: error.message, type: 'error' });
    } else {
      setProducts(data || []);
    }
    setLoading(false);
  }

  async function handleSync(productIdsToSync?: string[] | string) {
    let ids: string[];
    if (Array.isArray(productIdsToSync)) {
      ids = productIdsToSync;
    } else if (productIdsToSync) {
      ids = [productIdsToSync];
    } else {
      ids = products.map(p => p.id);
    }
    if (ids.length === 0) return;
    
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('zinc-sync-international-products', {
        body: { product_ids: ids }
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);

      addToast({ title: 'Sincronización completa', message: `Sincronizados: ${data.synced}. Errores: ${data.errors}.`, type: 'success' });
      fetchProducts();
    } catch (err: any) {
      addToast({ title: 'Error sincronizando', message: err.message, type: 'error' });
    } finally {
      setSyncing(false);
    }
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingProduct) return;
    
    try {
      const { error } = await supabase
        .from('international_products')
        .update({
          title: editingProduct.title,
          description: editingProduct.description,
          brand: editingProduct.brand,
          category: editingProduct.category,
          image_url: editingProduct.image_url,
          base_price_usd: Number(editingProduct.base_price_usd),
          usa_domestic_shipping_usd: Number(editingProduct.usa_domestic_shipping_usd),
          collectibles_fee_usd: Number(editingProduct.collectibles_fee_usd),
          final_price_usd: Number(editingProduct.final_price_usd),
          final_price_uyu: Number(editingProduct.final_price_uyu),
          estimated_delivery_min_days: Number(editingProduct.estimated_delivery_min_days),
          estimated_delivery_max_days: Number(editingProduct.estimated_delivery_max_days),
          status: editingProduct.status
        })
        .eq('id', editingProduct.id);

      if (error) throw error;

      addToast({ title: 'Guardado', message: 'Producto actualizado.', type: 'success' });
      setEditingProduct(null);
      fetchProducts();
    } catch (err: any) {
      addToast({ title: 'Error', message: err.message, type: 'error' });
    }
  }

  async function handleBulkStatusChange(newStatus: string) {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('international_products')
        .update({ status: newStatus })
        .in('id', ids);

      if (error) throw error;

      addToast({ title: 'Éxito', message: `Se actualizaron ${ids.length} productos a ${newStatus}.`, type: 'success' });
      setSelectedIds(new Set());
      fetchProducts();
    } catch (err: any) {
      addToast({ title: 'Error', message: err.message, type: 'error' });
      setLoading(false);
    }
  }

  const filteredProducts = products.filter(p => 
    p.title.toLowerCase().includes(search.toLowerCase()) || 
    (p.brand && p.brand.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">Productos Internacionales (Amazon)</h2>
        <div className="flex gap-2 items-center flex-wrap">
          {selectedIds.size > 0 && (
            <>
              <span className="text-sm text-gray-500 mr-2">{selectedIds.size} seleccionados</span>
              <button 
                onClick={() => handleBulkStatusChange('published')} 
                className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors"
              >
                Publicar
              </button>
              <button 
                onClick={() => handleBulkStatusChange('draft')} 
                className="px-3 py-1.5 bg-yellow-500 text-white text-sm rounded-lg hover:bg-yellow-600 transition-colors"
              >
                Borrador
              </button>
              <button 
                onClick={() => handleSync(Array.from(selectedIds))} 
                disabled={syncing}
                className="flex items-center px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} /> Sincronizar ({selectedIds.size})
              </button>
            </>
          )}
          <button 
            onClick={() => handleSync()} 
            disabled={syncing || products.length === 0} 
            className="flex items-center px-4 py-1.5 bg-gray-800 text-white text-sm rounded-lg hover:bg-gray-900 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} /> Sincronizar Todos
          </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="w-5 h-5 absolute left-3 top-2.5 text-gray-400" />
          <input 
            type="text" 
            placeholder="Buscar por título o marca..." 
            className="pl-10 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select 
          className="rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          <option value="all">Todos los estados</option>
          <option value="draft">Borrador (Draft)</option>
          <option value="published">Publicado</option>
          <option value="disabled">Desactivado</option>
          <option value="unavailable">No Disponible</option>
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left">
                  <input 
                    type="checkbox" 
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    checked={filteredProducts.length > 0 && selectedIds.size === filteredProducts.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedIds(new Set(filteredProducts.map(p => p.id)));
                      } else {
                        setSelectedIds(new Set());
                      }
                    }}
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Imagen</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Título</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Costos Base (Amazon + USA)</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rentabilidad</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Final Collectibles</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Costo Final Estimado (Urubox)</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sincronización</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredProducts.map((p) => (
                <tr key={p.id} className={selectedIds.has(p.id) ? 'bg-blue-50/50' : ''}>
                  <td className="px-6 py-4">
                    <input 
                      type="checkbox" 
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      checked={selectedIds.has(p.id)}
                      onChange={(e) => {
                        const newSet = new Set(selectedIds);
                        if (e.target.checked) newSet.add(p.id);
                        else newSet.delete(p.id);
                        setSelectedIds(newSet);
                      }}
                    />
                  </td>
                  <td className="px-6 py-4">
                    <img src={p.image_url} alt="" referrerPolicy="no-referrer" loading="lazy" className="w-12 h-12 object-cover rounded" />
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900 line-clamp-2" title={p.title}>
                      <a href={`https://www.amazon.com/dp/${p.id}`} target="_blank" rel="noreferrer" className="hover:text-primary-600 hover:underline flex items-center gap-1">
                        {p.title}
                        <ExternalLink className="w-3 h-3 flex-shrink-0" />
                      </a>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      <span className="font-bold text-gray-700">{p.brand || 'Sin Marca'}</span> | Disp: {p.availability}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-1 truncate max-w-xs" title={p.category || p.raw_data?.categories?.[0] || 'Sin categoría'}>
                      Cat: {p.category || p.raw_data?.categories?.[0] || 'Sin categoría'}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-xs text-gray-600">
                    <div>Amazon: {formatUSD(p.amazon_current_price_usd || p.base_price_usd)}</div>
                    {p.amazon_list_price_usd && <div className="line-through text-gray-400">Lista: {formatUSD(p.amazon_list_price_usd)}</div>}
                    <div>Envío USA: {formatUSD(p.usa_domestic_shipping_usd || 0)}</div>
                    <div className="font-bold text-gray-700 mt-1 border-t pt-1">Costo Real: {p.real_cost_usd ? formatUSD(p.real_cost_usd) : '?'}</div>
                  </td>
                  <td className="px-6 py-4 text-xs text-gray-600">
                    <div>Margen Esperado: {p.expected_profit_usd ? formatUSD(p.expected_profit_usd) : '?'}</div>
                    <div className="font-bold text-green-700">Fee Aplicado: {formatUSD(p.collectibles_fee_usd)}</div>
                    <div className="text-gray-500">{formatPercent(p.final_price_usd > 0 ? ((Number(p.collectibles_fee_usd) / Number(p.final_price_usd)) * 100) : 0)} del Final</div>
                  </td>
                  <td className="px-6 py-4 text-sm font-bold">
                    <div className="text-primary-600">{formatUSD(p.final_price_usd)}</div>
                    <div className="text-gray-500 text-xs font-normal">{formatUYU(p.final_price_uyu)}</div>
                  </td>
                  <td className="px-6 py-4 text-xs text-gray-600">
                    <div>Flete Urubox: {p.urubox_estimated_cost_usd ? formatUSD(p.urubox_estimated_cost_usd) : '?'}</div>
                    <div className="font-bold text-red-600 border-t pt-1 mt-1">Total: {p.total_estimated_cost_usd ? formatUSD(p.total_estimated_cost_usd) : '?'}</div>
                  </td>
                  <td className="px-6 py-4 text-xs">
                    <span className={`px-2 py-1 rounded-full font-bold mb-2 inline-block ${
                      p.status === 'published' ? 'bg-green-100 text-green-800' :
                      p.status === 'draft' ? 'bg-yellow-100 text-yellow-800' :
                      p.status === 'unavailable' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs">
                    <div className="font-semibold text-gray-700">Estado: {p.sync_status || 'N/A'}</div>
                    <div className="text-gray-500 mt-1">Última vez: {formatDate(p.last_synced_at)}</div>
                    {p.price_change_percent && (
                      <div className={`mt-1 font-bold ${p.price_change_percent > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        Dif: {p.price_change_percent > 0 ? '+' : ''}{formatPercent(p.price_change_percent)}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button onClick={() => handleSync(p.id)} title="Sincronizar ahora" className="text-blue-500 hover:text-blue-700">
                      <RefreshCw className="w-5 h-5 inline" />
                    </button>
                    <button onClick={() => setEditingProduct({...p})} title="Editar" className="text-gray-500 hover:text-primary-600">
                      <Edit className="w-5 h-5 inline" />
                    </button>
                    <button onClick={() => setRawModalData(p.raw_data)} title="Ver raw data técnico" className="text-gray-400 hover:text-gray-600">
                      <Code className="w-5 h-5 inline" />
                    </button>
                  </td>
                </tr>
              ))}
              {loading && <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-500"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></td></tr>}
              {!loading && filteredProducts.length === 0 && <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-500">No hay productos internacionales.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      {editingProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="font-bold text-lg">Editar Producto Internacional</h3>
              <button onClick={() => setEditingProduct(null)}><XCircle className="w-6 h-6 text-gray-400 hover:text-gray-600" /></button>
            </div>
            <div className="p-6 overflow-auto flex-1">
              <form id="edit-form" onSubmit={handleSaveEdit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700">Título Visible</label>
                    <input type="text" required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" value={editingProduct.title} onChange={e => setEditingProduct({...editingProduct, title: e.target.value})} />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700">Descripción Visible</label>
                    <textarea rows={3} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" value={editingProduct.description || ''} onChange={e => setEditingProduct({...editingProduct, description: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Marca</label>
                    <input type="text" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" value={editingProduct.brand || ''} onChange={e => setEditingProduct({...editingProduct, brand: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Categoría</label>
                    <input type="text" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" value={editingProduct.category || ''} onChange={e => setEditingProduct({...editingProduct, category: e.target.value})} />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700">Imagen Principal (URL)</label>
                    <input type="text" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" value={editingProduct.image_url || ''} onChange={e => setEditingProduct({...editingProduct, image_url: e.target.value})} />
                  </div>
                  
                  {/* Precios */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Precio Base Amazon (USD)</label>
                    <input type="number" step="0.01" required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm bg-gray-50" value={editingProduct.base_price_usd} onChange={e => setEditingProduct({...editingProduct, base_price_usd: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Envío Doméstico USA (USD)</label>
                    <input type="number" step="0.01" required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" value={editingProduct.usa_domestic_shipping_usd} onChange={e => setEditingProduct({...editingProduct, usa_domestic_shipping_usd: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Fee Collectibles (USD)</label>
                    <input type="number" step="0.01" required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" value={editingProduct.collectibles_fee_usd} onChange={e => setEditingProduct({...editingProduct, collectibles_fee_usd: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Estado (Publicación)</label>
                    <select className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" value={editingProduct.status} onChange={e => setEditingProduct({...editingProduct, status: e.target.value})}>
                      <option value="draft">Borrador</option>
                      <option value="published">Publicado</option>
                      <option value="disabled">Desactivado</option>
                      <option value="unavailable">No Disponible (Amazon)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Precio Final Calculado (USD)</label>
                    <input type="number" step="0.01" required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm font-bold text-primary-700" value={editingProduct.final_price_usd} onChange={e => setEditingProduct({...editingProduct, final_price_usd: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Precio Final Calculado (UYU)</label>
                    <input type="number" step="0.01" required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm font-bold text-primary-700" value={editingProduct.final_price_uyu} onChange={e => setEditingProduct({...editingProduct, final_price_uyu: e.target.value})} />
                  </div>
                  
                  {/* Entrega */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Días Mín Entrega (USA)</label>
                    <input type="number" required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" value={editingProduct.estimated_delivery_min_days} onChange={e => setEditingProduct({...editingProduct, estimated_delivery_min_days: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Días Máx Entrega (USA)</label>
                    <input type="number" required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" value={editingProduct.estimated_delivery_max_days} onChange={e => setEditingProduct({...editingProduct, estimated_delivery_max_days: e.target.value})} />
                  </div>

                  {/* Read Only Info */}
                  <div className="md:col-span-2 pt-4 border-t border-gray-200 mt-2">
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Datos Técnicos (Solo Lectura)</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm text-gray-600 bg-gray-50 p-4 rounded-lg">
                      <div><span className="font-semibold">Provider:</span> {editingProduct.source_provider} / {editingProduct.source_retailer}</div>
                      <div><span className="font-semibold">External ID:</span> {editingProduct.external_product_id}</div>
                      <div className="col-span-2"><span className="font-semibold">URL:</span> <a href={editingProduct.product_url_external} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline break-all">{editingProduct.product_url_external}</a></div>
                    </div>
                  </div>
                </div>
              </form>
            </div>
            <div className="p-4 border-t border-gray-200 flex justify-end gap-3 bg-gray-50">
              <button onClick={() => setEditingProduct(null)} className="px-4 py-2 text-gray-700 hover:text-gray-900 font-medium">Cancelar</button>
              <button form="edit-form" type="submit" className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium">Guardar Cambios</button>
            </div>
          </div>
        </div>
      )}

      {/* Raw Data Modal */}
      {rawModalData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="font-bold">Datos en bruto de Zinc</h3>
              <button onClick={() => setRawModalData(null)}><XCircle className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="p-4 overflow-auto flex-1">
              <pre className="text-xs bg-gray-50 p-4 rounded border border-gray-200 overflow-x-auto">
                {JSON.stringify(rawModalData, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
