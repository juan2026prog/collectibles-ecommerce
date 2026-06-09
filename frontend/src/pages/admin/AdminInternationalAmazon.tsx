import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Search, Loader2, Import, XCircle, Eye, AlertCircle, RefreshCw, Wand2, ArrowRight, ExternalLink, Code, Sparkles, Filter } from 'lucide-react';
import { useToast } from '../../components/admin/Toast';

const QUICK_COLLECTIONS = [
  { name: '🔥 Top Marvel', query: 'marvel', category: 'Action Figures' },
  { name: '🔥 Top DC', query: 'dc comics', category: 'Action Figures' },
  { name: '🔥 Top Star Wars', query: 'star wars black series' },
  { name: '🔥 Top Pokémon', query: 'pokemon figures' },
  { name: '🔥 Top Anime', query: 'anime figures bandai' },
  { name: '🔥 Top Horror', query: 'horror action figures neca' },
  { name: '🔥 Top Gaming', query: 'video game action figures' },
  { name: '🔥 Top Funko', query: 'funko pop', brand: 'Funko' },
  { name: '🔥 Top Neca', query: 'neca action figures', brand: 'NECA' },
];

const SUGGESTED_BRANDS = [
  'Funko', 'NECA', 'Hasbro', 'Bandai', 'LEGO', 'McFarlane Toys', 'Iron Studios', 'Good Smile Company', 'Super7', 'Mattel', 'Jazwares', 'Kotobukiya', 'Mezco'
];

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
    min_reviews: '',
    sort_by: '',
    availability: '',
    onlyRecognizedBrands: true,
    includeGenerics: false,
    max_results: '20',
    page: '1'
  });

  const [candidates, setCandidates] = useState<any[]>([]);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showImportModal, setShowImportModal] = useState(false);
  const [dbCategories, setDbCategories] = useState<any[]>([]);

  const [importSettings, setImportSettings] = useState({
    collectibles_fee_usd: 5,
    usa_domestic_shipping_usd: 0,
    exchange_rate: 42,
    estimated_delivery_min_days: 5,
    estimated_delivery_max_days: 12,
    target_category_id: '',
    target_subcategory_id: ''
  });

  const [rawModalData, setRawModalData] = useState<any>(null);

  useEffect(() => {
    fetchCandidates();
    fetchCategories();
  }, []);

  async function fetchCategories() {
    const { data, error } = await supabase.from('categories').select('*').order('name');
    if (error) {
      console.error('Error fetching categories:', error);
      addToast({ title: 'Error de Categorías', message: error.message, type: 'error' });
    }
    if (data) {
      setDbCategories(data);
    }
  }

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

  async function handleSearch(e?: React.FormEvent, overrideParams?: any) {
    if (e) e.preventDefault();
    const params = overrideParams || searchParams;
    if (!params.query) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('zinc-search-products', {
        body: {
          query: params.query,
          brand: params.brand || undefined,
          category: params.category || undefined,
          min_price: params.min_price ? Number(params.min_price) : undefined,
          max_price: params.max_price ? Number(params.max_price) : undefined,
          min_rating: params.min_rating ? Number(params.min_rating) : undefined,
          max_results: Number(params.max_results || 20),
          page: Number(params.page || 1),
          sort_by: params.sort_by || undefined
        }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      // El filtrado principal ahora ocurre en la renderización (filteredCandidates)
      addToast({ title: 'Búsqueda completada', message: `Se obtuvieron los resultados de Zinc.`, type: 'success' });
      fetchCandidates();
    } catch (err: any) {
      console.error(err);
      addToast({ title: 'Error buscando', message: err.message || 'No se pudo consultar Zinc', type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  function handleQuickCollection(col: any) {
    const newParams = { ...searchParams, query: col.query, brand: col.brand || '', category: col.category || '' };
    setSearchParams(newParams);
    handleSearch(undefined, newParams);
  }

  async function handleImport() {
    if (selectedIds.length === 0) return;
    setImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke('zinc-import-candidates', {
        body: {
          candidate_ids: selectedIds,
          ...importSettings,
          target_category_id: importSettings.target_category_id || undefined,
          target_subcategory_id: importSettings.target_subcategory_id || undefined
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

  const [enrichingId, setEnrichingId] = useState<string | null>(null);

  async function handleEnrich(id: string) {
    setEnrichingId(id);
    try {
      const { data, error } = await supabase.functions.invoke('zinc-enrich-candidate', {
        body: { candidate_ids: [id] }
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);

      addToast({ title: 'Enriquecimiento completado', message: 'Categoría e imágenes originales obtenidas.', type: 'success' });
      fetchCandidates();
    } catch (err: any) {
      addToast({ title: 'Error', message: err.message, type: 'error' });
    } finally {
      setEnrichingId(null);
    }
  }

  async function handleCreateCategory(candidateId: string, suggestedName: string) {
    if (!suggestedName) return;
    if (!confirm(`¿Crear categoría "${suggestedName}" automáticamente?`)) return;

    try {
      const { data, error } = await supabase.functions.invoke('zinc-create-category', {
        body: { name: suggestedName }
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      addToast({ title: 'Categoría creada', message: 'Se ha creado la categoría exitosamente.', type: 'success' });
      fetchCategories();
    } catch (err: any) {
      addToast({ title: 'Error', message: err.message, type: 'error' });
    }
  }

  const getProxyImageUrl = (url: string) => {
    if (!url) return '';
    const baseUrl = import.meta.env.VITE_SUPABASE_URL;
    return `${baseUrl}/functions/v1/media-proxy?url=${encodeURIComponent(url)}`;
  };

  const getCategoryName = (id: string) => {
    const cat = dbCategories.find(c => c.id === id);
    return cat ? cat.name : 'Desconocida';
  };

  const parentCategories = dbCategories.filter(c => !c.parent_id);
  const importSubCategories = dbCategories.filter(c => c.parent_id === importSettings.target_category_id);

  const filteredCandidates = candidates.filter(c => {
    // Basic local filters
    if (searchParams.min_reviews && c.review_count < Number(searchParams.min_reviews)) return false;
    if (searchParams.availability === 'in_stock' && !(c.raw_data?.availability?.toLowerCase().includes('in stock') || !c.raw_data?.availability)) return false;
    if (searchParams.availability === 'preorder' && !c.raw_data?.availability?.toLowerCase().includes('pre-order')) return false;

    // Brand logic
    const b = (c.brand || '').toLowerCase();
    
    if (searchParams.onlyRecognizedBrands) {
      if (!b || b === 'sin marca' || b === 'generic' || b === 'n/a') return false;
    } else if (!searchParams.includeGenerics) {
      if (b === 'generic' || b === 'sin marca' || !b) return false;
    }

    if (selectedBrands.length > 0) {
      const displayBrand = c.brand || 'Sin Marca';
      const match = selectedBrands.includes(displayBrand);
      if (!match) return false;
    }
    
    return true;
  });

  const extractedBrands = Array.from(new Set(candidates.map(c => c.brand || 'Sin Marca'))).filter(Boolean).sort();

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Curación de Catálogo (Amazon/Zinc)</h2>
          <p className="text-gray-500 text-sm mt-1">Descubrí, clasificá e importá productos internacionales con mapeo inteligente.</p>
        </div>
      </div>

      {/* Quick Collections */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
        <h3 className="text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">Colecciones Rápidas</h3>
        <div className="flex flex-wrap gap-2">
          {QUICK_COLLECTIONS.map((c, i) => (
            <button
              key={i}
              onClick={() => handleQuickCollection(c)}
              className="px-3 py-1.5 bg-orange-50 text-orange-700 hover:bg-orange-100 rounded-full text-sm font-medium transition-colors border border-orange-200"
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {/* Advanced Filters Form */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h3 className="text-sm font-bold text-gray-700 mb-4 uppercase tracking-wide">Búsqueda Avanzada</h3>
        <form onSubmit={(e) => handleSearch(e)} className="grid grid-cols-1 md:grid-cols-12 gap-4">
          <div className="md:col-span-12">
            <label className="block text-sm font-medium text-gray-700">Término de búsqueda (Obligatorio)</label>
            <input type="text" required placeholder="Ej: Marvel Legends Wolverine" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500" value={searchParams.query} onChange={e => setSearchParams({...searchParams, query: e.target.value})} />
          </div>
          
          <div className="md:col-span-4">
            <label className="block text-sm font-medium text-gray-700">Marca</label>
            <input list="brands-list" type="text" placeholder="Ej: Funko" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500" value={searchParams.brand} onChange={e => setSearchParams({...searchParams, brand: e.target.value})} />
            <datalist id="brands-list">
              {SUGGESTED_BRANDS.map(b => <option key={b} value={b} />)}
            </datalist>
          </div>

          <div className="md:col-span-4">
            <label className="block text-sm font-medium text-gray-700">Categoría Amazon</label>
            <select className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500" value={searchParams.category} onChange={e => setSearchParams({...searchParams, category: e.target.value})}>
              <option value="">Todas</option>
              <option value="Action Figures">Action Figures</option>
              <option value="Statues">Statues & Busts</option>
              <option value="Trading Cards">Trading Cards</option>
              <option value="Clothing">Clothing</option>
            </select>
          </div>

          <div className="md:col-span-4">
            <label className="block text-sm font-medium text-gray-700">Ordenar por</label>
            <select className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500" value={searchParams.sort_by} onChange={e => setSearchParams({...searchParams, sort_by: e.target.value})}>
              <option value="">Relevancia</option>
              <option value="price_asc">Menor Precio</option>
              <option value="price_desc">Mayor Precio</option>
              <option value="reviews">Más Reviews</option>
              <option value="newest">Más Recientes</option>
            </select>
          </div>

          <div className="md:col-span-3">
            <label className="block text-sm font-medium text-gray-700">Precio Mín (USD)</label>
            <input type="number" step="0.01" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" value={searchParams.min_price} onChange={e => setSearchParams({...searchParams, min_price: e.target.value})} />
          </div>
          <div className="md:col-span-3">
            <label className="block text-sm font-medium text-gray-700">Precio Máx (USD)</label>
            <input type="number" step="0.01" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" value={searchParams.max_price} onChange={e => setSearchParams({...searchParams, max_price: e.target.value})} />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700">Rating Mín</label>
            <input type="number" step="0.1" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" value={searchParams.min_rating} onChange={e => setSearchParams({...searchParams, min_rating: e.target.value})} />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700">Reviews Mín</label>
            <input type="number" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" value={searchParams.min_reviews} onChange={e => setSearchParams({...searchParams, min_reviews: e.target.value})} />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700">Disponibilidad</label>
            <select className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" value={searchParams.availability} onChange={e => setSearchParams({...searchParams, availability: e.target.value})}>
              <option value="">Cualquiera</option>
              <option value="in_stock">In Stock</option>
              <option value="preorder">Preorder</option>
            </select>
          </div>

          <div className="md:col-span-12 bg-gray-50 rounded-lg border border-gray-200 mt-2 p-4">
            <div className="flex items-center text-sm font-bold text-gray-800 mb-3 border-b pb-2">
              <Filter className="w-4 h-4 mr-2" />
              Filtros Locales (Aplicados sobre resultados)
            </div>
            
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-6">
                <label className="flex items-center space-x-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" className="rounded text-primary-600 focus:ring-primary-500" checked={searchParams.onlyRecognizedBrands} onChange={e => setSearchParams({...searchParams, onlyRecognizedBrands: e.target.checked})} />
                  <span>Solo Marcas Reconocidas</span>
                </label>
                <label className="flex items-center space-x-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" className="rounded text-primary-600 focus:ring-primary-500" checked={searchParams.includeGenerics} onChange={e => setSearchParams({...searchParams, includeGenerics: e.target.checked})} />
                  <span>Incluir Genéricos / Sin Marca</span>
                </label>
                {searchParams.onlyRecognizedBrands && searchParams.includeGenerics && (
                  <span className="text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded border border-orange-200">
                    <AlertCircle className="w-3 h-3 inline mr-1" />
                    Los genéricos están ocultos porque "Solo marcas reconocidas" tiene prioridad.
                  </span>
                )}
              </div>

              {extractedBrands.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-gray-500 mb-2 uppercase">Marcas encontradas:</div>
                  <div className="flex flex-wrap gap-2">
                    {extractedBrands.map(b => (
                      <label key={b} className="flex items-center space-x-1.5 text-sm bg-white border border-gray-200 px-2.5 py-1 rounded-md hover:bg-gray-50 cursor-pointer">
                        <input 
                          type="checkbox" 
                          className="rounded text-primary-600" 
                          checked={selectedBrands.includes(b)}
                          onChange={e => {
                            if (e.target.checked) setSelectedBrands([...selectedBrands, b]);
                            else setSelectedBrands(selectedBrands.filter(sb => sb !== b));
                          }}
                        />
                        <span>{b}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="md:col-span-12 flex justify-end pt-2 border-t mt-2">
            <button type="submit" disabled={loading} className="flex items-center px-6 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 font-medium">
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
            Resultados Enriquecidos ({filteredCandidates.length})
            <button onClick={fetchCandidates} className="text-gray-500 hover:text-primary-600 ml-2" title="Refrescar">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </h3>
          <div className="space-x-2">
            <button 
              onClick={() => {
                const toSelect = filteredCandidates.filter(c => c.status === 'review' && c.price_usd != null).slice(0, 20).map(c => c.id);
                setSelectedIds(toSelect);
              }}
              className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 inline-flex items-center"
            >
              Seleccionar Top 20
            </button>
            <button 
              onClick={() => setShowImportModal(true)} 
              disabled={selectedIds.length === 0} 
              className="px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 inline-flex items-center shadow-sm"
            >
              <Import className="w-4 h-4 mr-1.5" /> Importar Seleccionados ({selectedIds.length})
            </button>
            <button 
              onClick={handleReject} 
              disabled={selectedIds.length === 0} 
              className="px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 inline-flex items-center shadow-sm"
            >
              <XCircle className="w-4 h-4 mr-1.5" /> Rechazar
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left w-12">
                  <input type="checkbox" onChange={e => {
                    if (e.target.checked) setSelectedIds(filteredCandidates.filter(c => c.status === 'review' && c.price_usd != null).map(c => c.id));
                    else setSelectedIds([]);
                  }} checked={selectedIds.length > 0 && selectedIds.length === filteredCandidates.filter(c => c.status === 'review' && c.price_usd != null).length} className="rounded text-primary-600 focus:ring-primary-500" />
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Imagen</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Producto / Marca</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-40">Categoría Amazon</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-40">Mapeo Collectibles</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-32">Entrega</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Métricas</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Estado</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredCandidates.map((c) => (
                <tr key={c.id} className={`${c.status !== 'review' ? 'bg-gray-50 opacity-75' : 'hover:bg-blue-50/30'} transition-colors`}>
                  <td className="px-4 py-4">
                    <input 
                      type="checkbox" 
                      className="rounded text-primary-600 focus:ring-primary-500"
                      disabled={c.status !== 'review' || c.price_usd == null}
                      checked={selectedIds.includes(c.id)}
                      onChange={e => {
                        if (e.target.checked) setSelectedIds([...selectedIds, c.id]);
                        else setSelectedIds(selectedIds.filter(id => id !== c.id));
                      }} 
                    />
                  </td>
                  <td className="px-4 py-4">
                    <div className="w-16 h-16 bg-white border rounded overflow-hidden flex items-center justify-center p-1 relative">
                      {(c.image_url || c.main_image_url_external || c.raw_data?.image) ? (
                         <img 
                           src={getProxyImageUrl(c.image_url || c.main_image_url_external || c.raw_data?.image)} 
                           alt="" 
                           className="max-w-full max-h-full object-contain" 
                           loading="lazy" 
                           referrerPolicy="no-referrer" 
                           onError={(e) => { (e.target as HTMLImageElement).src = 'https://via.placeholder.com/400?text=Error+Image'; }}
                         />
                      ) : (
                         <span className="text-[10px] text-gray-400 text-center leading-tight">Sin<br/>imagen</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="text-sm font-medium text-gray-900 line-clamp-2 leading-tight" title={c.title}>
                      <a href={`https://www.amazon.com/dp/${c.external_product_id}`} target="_blank" rel="noreferrer" className="hover:text-primary-600 hover:underline flex items-center gap-1">
                        {c.title}
                        <ExternalLink className="w-3 h-3 flex-shrink-0" />
                      </a>
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{c.brand || 'Sin Marca'}</span>
                      <span className="text-xs text-gray-400">ASIN: {c.external_product_id}</span>
                      <span className="text-xs text-blue-500 bg-blue-50 px-2 py-0.5 rounded">
                        Vendido por: {c.raw_data?.first_party_seller === true ? 'Amazon' : 'Terceros (Ver en Amazon)'}
                      </span>
                    </div>
                    {c.price_usd == null && <div className="text-xs text-red-500 mt-1 flex items-center"><AlertCircle className="w-3 h-3 mr-1"/> Sin precio, no importable</div>}
                  </td>
                  <td className="px-4 py-4">
                    {c.amazon_category_path ? (
                      <div className="text-[11px] text-gray-700 bg-gray-100 p-1.5 rounded line-clamp-3 leading-tight" title={c.amazon_category_path}>
                        {c.amazon_category_path}
                      </div>
                    ) : c.amazon_category ? (
                      <div className="text-[11px] text-gray-700 bg-gray-100 p-1.5 rounded">
                        {c.amazon_category}
                      </div>
                    ) : (
                      <div className="text-xs text-gray-400 italic">No disponible en búsqueda</div>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    {c.suggested_category_id ? (
                      <div className="space-y-1">
                        <div className="text-[11px] font-medium text-green-700 bg-green-50 inline-block px-1.5 py-1 rounded border border-green-200">
                          {getCategoryName(c.suggested_category_id)}
                          {c.suggested_subcategory_id && <><ArrowRight className="w-3 h-3 inline mx-0.5" />{getCategoryName(c.suggested_subcategory_id)}</>}
                        </div>
                        <div className="text-[10px] text-gray-400">Confianza: {c.mapping_confidence}%</div>
                      </div>
                    ) : (
                      <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 px-2 py-1 rounded-md inline-flex items-center">
                        Sin mapeo
                        {c.brand && (
                          <button onClick={() => handleCreateCategory(c.id, c.brand)} className="ml-2 text-primary-600 hover:text-primary-700" title={`Crear categoría para ${c.brand}`}>
                            <Wand2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-start gap-1.5">
                      <span className="text-sm shrink-0 mt-0.5">
                        {c.amazon_delivery_type === 'prime' ? '⭐' : 
                         c.amazon_delivery_type === 'in_stock' ? '📦' :
                         c.amazon_delivery_type === 'preorder' ? '⏳' :
                         c.amazon_delivery_type === 'backorder' ? '⏳' :
                         c.amazon_delivery_type === 'unknown' ? '🚚' : '❌'}
                      </span>
                      <div className="text-xs text-gray-700 leading-tight">
                        <span className="font-bold block capitalize">{c.amazon_delivery_type === 'in_stock' ? 'En Stock' : c.amazon_delivery_type}</span>
                        {c.amazon_delivery_text}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="text-sm font-bold text-gray-900">${c.price_usd} USD</div>
                    <div className="text-xs text-yellow-600 font-medium flex items-center mt-1">
                       ★ {c.rating || '-'} <span className="text-gray-400 ml-1 font-normal">({c.review_count} revs)</span>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-sm">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      c.status === 'imported' ? 'bg-green-100 text-green-800 border border-green-200' :
                      c.status === 'rejected' ? 'bg-red-100 text-red-800 border border-red-200' :
                      'bg-blue-50 text-blue-700 border border-blue-200'
                    }`}>
                      {c.status === 'imported' ? 'Ya Importado' : c.status}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button 
                        onClick={() => handleEnrich(c.id)} 
                        disabled={enrichingId === c.id}
                        className="text-indigo-600 hover:text-indigo-800 p-1.5 bg-indigo-50 border border-indigo-100 rounded shadow-sm hover:shadow disabled:opacity-50" 
                        title="Enriquecer Detalle (Zinc Product Endpoint)"
                      >
                        {enrichingId === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      </button>
                      <button onClick={() => setRawModalData(c.raw_data)} className="text-gray-600 hover:text-gray-800 p-1.5 bg-gray-50 border border-gray-200 rounded shadow-sm hover:shadow" title="Ver Datos en Bruto (JSON)">
                        <Code className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {candidates.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 mb-4">
                      <Search className="w-6 h-6 text-gray-400" />
                    </div>
                    <h3 className="text-sm font-medium text-gray-900">No hay candidatos en la cola</h3>
                    <p className="mt-1 text-sm text-gray-500">Buscá productos en Amazon o usá las colecciones rápidas.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Import Settings Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden">
            <div className="p-6 border-b border-gray-100 bg-gray-50/50">
              <h3 className="text-xl font-bold text-gray-900">Importación Masiva Inteligente</h3>
              <p className="text-sm text-gray-500 mt-1">Vas a importar {selectedIds.length} productos a Collectibles.</p>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                <h4 className="text-sm font-bold text-blue-900 mb-3">Mapeo Masivo de Categoría (Opcional)</h4>
                <p className="text-xs text-blue-700 mb-3">
                  Si dejás esto en blanco, se usará la categoría sugerida automáticamente para cada producto. Si elegís una categoría aquí, se forzará para TODOS los {selectedIds.length} productos.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-blue-900 mb-1">Categoría Padre</label>
                    <select className="block w-full text-sm rounded-lg border-blue-200 focus:border-blue-500 focus:ring-blue-500 bg-white" value={importSettings.target_category_id} onChange={e => setImportSettings({...importSettings, target_category_id: e.target.value, target_subcategory_id: ''})}>
                      <option value="">-- Usar Auto-Detección --</option>
                      {parentCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-blue-900 mb-1">Subcategoría</label>
                    <select className="block w-full text-sm rounded-lg border-blue-200 focus:border-blue-500 focus:ring-blue-500 bg-white" disabled={!importSettings.target_category_id} value={importSettings.target_subcategory_id} onChange={e => setImportSettings({...importSettings, target_subcategory_id: e.target.value})}>
                      <option value="">-- Usar Auto-Detección --</option>
                      {importSubCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <div className="col-span-2">
                  <h4 className="text-sm font-bold text-gray-900 border-b pb-2">Configuración Financiera y Logística</h4>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Fee Collectibles (USD)</label>
                  <input type="number" step="0.01" className="mt-1 block w-full text-sm rounded-md border-gray-300 shadow-sm" value={importSettings.collectibles_fee_usd} onChange={e => setImportSettings({...importSettings, collectibles_fee_usd: Number(e.target.value)})} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Envío USA Doméstico (USD)</label>
                  <input type="number" step="0.01" className="mt-1 block w-full text-sm rounded-md border-gray-300 shadow-sm" value={importSettings.usa_domestic_shipping_usd} onChange={e => setImportSettings({...importSettings, usa_domestic_shipping_usd: Number(e.target.value)})} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Tipo de Cambio a UYU</label>
                  <input type="number" step="0.01" className="mt-1 block w-full text-sm rounded-md border-gray-300 shadow-sm" value={importSettings.exchange_rate} onChange={e => setImportSettings({...importSettings, exchange_rate: Number(e.target.value)})} />
                </div>
                <div className="col-span-2 mt-4 bg-orange-50 border border-orange-200 p-3 rounded-lg flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="text-sm font-bold text-orange-900">Sobre Tiempos de Entrega</h5>
                    <p className="text-xs text-orange-800 mt-1">
                      El tiempo de entrega desde el courier en USA hasta Uruguay depende del servicio final contratado por el cliente y no está incluido en la estimación provista por Amazon/Zinc. Los días mínimos y máximos genéricos han sido removidos.
                    </p>
                  </div>
                </div>
              </div>

            </div>
            
            <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-between items-center">
              <span className="text-xs text-gray-500">Imágenes se mantendrán servidas por proxy externo</span>
              <div className="flex space-x-3">
                <button onClick={() => setShowImportModal(false)} className="px-5 py-2 text-gray-600 hover:text-gray-900 font-medium rounded-lg hover:bg-gray-100">Cancelar</button>
                <button onClick={handleImport} disabled={importing} className="px-5 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium disabled:opacity-50 shadow-sm flex items-center">
                  {importing ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Import className="w-5 h-5 mr-2" />} 
                  {importing ? 'Importando...' : 'Confirmar e Importar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Raw Data Modal */}
      {rawModalData && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-gray-900">Datos en bruto (Zinc)</h3>
              <button onClick={() => setRawModalData(null)} className="text-gray-400 hover:text-gray-700"><XCircle className="w-6 h-6" /></button>
            </div>
            <div className="p-0 overflow-auto flex-1 bg-gray-900">
              <pre className="text-[11px] text-green-400 p-6 overflow-x-auto font-mono">
                {JSON.stringify(rawModalData, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
