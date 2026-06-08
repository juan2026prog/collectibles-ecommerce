import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Search, Loader2, Import, XCircle, Eye, AlertCircle, RefreshCw } from 'lucide-react';
import { useToast } from '../../components/admin/Toast';

export default function AdminInternationalAmazon() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [searchParams, setSearchParams] = useState({
    query: '',
    brand: '',
    category: '',
    min_price: '',
    max_price: '',
    min_rating: '',
    max_results: '20',
    page: '1'
  });
  const [candidates, setCandidates] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importSettings, setImportSettings] = useState({
    collectibles_fee_usd: 5,
    usa_domestic_shipping_usd: 0,
    exchange_rate: 42,
    estimated_delivery_min_days: 5,
    estimated_delivery_max_days: 12
  });

  const [rawModalData, setRawModalData] = useState<any>(null);

  // Load existing draft candidates on mount
  useEffect(() => {
    fetchCandidates();
  }, []);

  async function fetchCandidates() {
    setLoading(true);
    const { data, error } = await supabase
      .from('international_import_candidates')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    
    if (error) {
      addToast({ title: 'Error', message: error.message, type: 'error' });
    } else {
      setCandidates(data || []);
    }
    setLoading(false);
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchParams.query) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('zinc-search-products', {
        body: {
          query: searchParams.query,
          brand: searchParams.brand || undefined,
          category: searchParams.category || undefined,
          min_price: searchParams.min_price ? Number(searchParams.min_price) : undefined,
          max_price: searchParams.max_price ? Number(searchParams.max_price) : undefined,
          min_rating: searchParams.min_rating ? Number(searchParams.min_rating) : undefined,
          max_results: Number(searchParams.max_results),
          page: Number(searchParams.page)
        }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      addToast({ title: 'Búsqueda completada', message: `Se encontraron ${data.candidates.length} resultados.`, type: 'success' });
      fetchCandidates();
    } catch (err: any) {
      console.error(err);
      addToast({ title: 'Error buscando', message: err.message || 'No se pudo consultar Zinc', type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    if (selectedIds.length === 0) return;
    setImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke('zinc-import-candidates', {
        body: {
          candidate_ids: selectedIds,
          ...importSettings
        }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      addToast({ 
        title: 'Importación completada', 
        message: `Importados: ${data.imported}. Ignorados/Duplicados: ${data.skipped}.`, 
        type: 'success' 
      });
      setShowImportModal(false);
      setSelectedIds([]);
      fetchCandidates();
    } catch (err: any) {
      console.error(err);
      addToast({ title: 'Error importando', message: err.message, type: 'error' });
    } finally {
      setImporting(false);
    }
  }

  async function handleReject() {
    if (selectedIds.length === 0) return;
    try {
      const { error } = await supabase
        .from('international_import_candidates')
        .update({ status: 'rejected' })
        .in('id', selectedIds);
      if (error) throw error;
      
      addToast({ title: 'Rechazados', message: 'Se han rechazado los candidatos seleccionados.', type: 'info' });
      setSelectedIds([]);
      fetchCandidates();
    } catch (err: any) {
      addToast({ title: 'Error', message: err.message, type: 'error' });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">Importador Amazon (Zinc)</h2>
      </div>

      {/* Search Form */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700">Búsqueda (Obligatorio)</label>
            <input type="text" required placeholder="Ej: funko spiderman" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500" value={searchParams.query} onChange={e => setSearchParams({...searchParams, query: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Marca</label>
            <input type="text" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500" value={searchParams.brand} onChange={e => setSearchParams({...searchParams, brand: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Categoría</label>
            <input type="text" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500" value={searchParams.category} onChange={e => setSearchParams({...searchParams, category: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Precio Mín (USD)</label>
            <input type="number" step="0.01" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500" value={searchParams.min_price} onChange={e => setSearchParams({...searchParams, min_price: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Precio Máx (USD)</label>
            <input type="number" step="0.01" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500" value={searchParams.max_price} onChange={e => setSearchParams({...searchParams, max_price: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Rating Mín</label>
            <input type="number" step="0.1" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500" value={searchParams.min_rating} onChange={e => setSearchParams({...searchParams, min_rating: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Max Resultados</label>
            <input type="number" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500" value={searchParams.max_results} onChange={e => setSearchParams({...searchParams, max_results: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Página</label>
            <input type="number" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500" value={searchParams.page} onChange={e => setSearchParams({...searchParams, page: e.target.value})} />
          </div>
          <div className="md:col-span-4 flex justify-end">
            <button type="submit" disabled={loading} className="flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">
              {loading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Search className="w-5 h-5 mr-2" />}
              Buscar en Amazon
            </button>
          </div>
        </form>
      </div>

      {/* Results Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
          <h3 className="font-bold text-gray-800 flex items-center gap-2">
            Candidatos a Importar
            <button onClick={fetchCandidates} className="text-gray-500 hover:text-primary-600">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </h3>
          <div className="space-x-2">
            <button 
              onClick={() => setShowImportModal(true)} 
              disabled={selectedIds.length === 0} 
              className="px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 inline-flex items-center"
            >
              <Import className="w-4 h-4 mr-1" /> Importar Seleccionados
            </button>
            <button 
              onClick={handleReject} 
              disabled={selectedIds.length === 0} 
              className="px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 inline-flex items-center"
            >
              <XCircle className="w-4 h-4 mr-1" /> Rechazar Seleccionados
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left">
                  <input type="checkbox" onChange={e => {
                    if (e.target.checked) setSelectedIds(candidates.filter(c => c.status === 'review' && c.price_usd != null).map(c => c.id));
                    else setSelectedIds([]);
                  }} checked={selectedIds.length > 0 && selectedIds.length === candidates.filter(c => c.status === 'review' && c.price_usd != null).length} />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Imagen</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Producto</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Precio USD</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rating</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {candidates.map((c) => (
                <tr key={c.id} className={c.status !== 'review' ? 'opacity-50' : ''}>
                  <td className="px-6 py-4">
                    <input 
                      type="checkbox" 
                      disabled={c.status !== 'review' || c.price_usd == null}
                      checked={selectedIds.includes(c.id)}
                      onChange={e => {
                        if (e.target.checked) setSelectedIds([...selectedIds, c.id]);
                        else setSelectedIds(selectedIds.filter(id => id !== c.id));
                      }} 
                    />
                  </td>
                  <td className="px-6 py-4"><img src={c.image_url} alt="" className="w-12 h-12 object-cover rounded" /></td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900 line-clamp-2" title={c.title}>{c.title}</div>
                    <div className="text-xs text-gray-500">{c.brand}</div>
                    {c.price_usd == null && <div className="text-xs text-red-500 mt-1 flex items-center"><AlertCircle className="w-3 h-3 mr-1"/> Sin precio, no importable</div>}
                  </td>
                  <td className="px-6 py-4 text-sm font-bold">${c.price_usd}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{c.rating} ({c.review_count})</td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                      c.status === 'imported' ? 'bg-green-100 text-green-800' :
                      c.status === 'rejected' ? 'bg-red-100 text-red-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button onClick={() => setRawModalData(c.raw_data)} className="text-gray-400 hover:text-gray-600" title="Ver raw data">
                      <Eye className="w-5 h-5 inline" />
                    </button>
                    <a href={c.product_url_external} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline text-xs block mt-1">Ver en Amazon</a>
                  </td>
                </tr>
              ))}
              {candidates.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500">No hay candidatos. Realizá una búsqueda para empezar.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Import Settings Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Configurar Importación</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Fee Collectibles (USD)</label>
                  <input type="number" step="0.01" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" value={importSettings.collectibles_fee_usd} onChange={e => setImportSettings({...importSettings, collectibles_fee_usd: Number(e.target.value)})} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Envío USA Doméstico Estimado (USD)</label>
                  <input type="number" step="0.01" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" value={importSettings.usa_domestic_shipping_usd} onChange={e => setImportSettings({...importSettings, usa_domestic_shipping_usd: Number(e.target.value)})} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Tipo de Cambio a UYU</label>
                  <input type="number" step="0.01" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" value={importSettings.exchange_rate} onChange={e => setImportSettings({...importSettings, exchange_rate: Number(e.target.value)})} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Días Mínimos</label>
                    <input type="number" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" value={importSettings.estimated_delivery_min_days} onChange={e => setImportSettings({...importSettings, estimated_delivery_min_days: Number(e.target.value)})} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Días Máximos</label>
                    <input type="number" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" value={importSettings.estimated_delivery_max_days} onChange={e => setImportSettings({...importSettings, estimated_delivery_max_days: Number(e.target.value)})} />
                  </div>
                </div>
              </div>
              <div className="mt-6 flex justify-end space-x-3">
                <button onClick={() => setShowImportModal(false)} className="px-4 py-2 text-gray-600 hover:text-gray-900 font-medium">Cancelar</button>
                <button onClick={handleImport} disabled={importing} className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium disabled:opacity-50 flex items-center">
                  {importing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Confirmar e Importar
                </button>
              </div>
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
