import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  RefreshCw, CheckCircle2, AlertCircle, X, ShieldCheck, Check, Trash2,
  List, Grid3X3, Search, Edit2, Link2, Plus, ArrowRight, Eye, ImageIcon, HelpCircle, Layers, ExternalLink
} from 'lucide-react';
import { useToast } from '../../components/admin/Toast';
import { useConfirmModal } from '../../components/admin/ConfirmModal';

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

export default function AdminMLCuration() {
  const [items, setItems] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('review_needed');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  
  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  // Edit Form Modals
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
    title: '',
    suggested_category_id: '',
    brand_id: '',
    detected_universe: '',
    detected_line: ''
  });

  // Create Product Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    title: '',
    description: '',
    price: 0,
    stock: 0,
    category_id: '',
    brand_id: '',
    universe: '',
    line: '',
    selected_image: ''
  });

  // Link Product Modal
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkSearch, setLinkSearch] = useState('');
  const [foundProducts, setFoundProducts] = useState<any[]>([]);
  const [selectedProductToLink, setSelectedProductToLink] = useState<any>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string>('');

  const { toast } = useToast();
  const { confirm } = useConfirmModal();

  useEffect(() => {
    fetchItems();
    fetchCategoriesAndBrands();
  }, [statusFilter, categoryFilter]);

  async function fetchItems() {
    setLoading(true);
    try {
      let query = supabase.from('ml_raw_items').select('*, ml_import_matches(*, products(id, title, base_price, product_images(url)))');
      
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }
      
      query = query.order('created_at', { ascending: false });
      
      const { data, error } = await query;
      if (error) throw error;

      // Filter locally for category and title/sku search
      let filtered = data || [];
      if (categoryFilter !== 'all') {
        filtered = filtered.filter(item => item.raw_payload?.normalized_metadata?.suggested_category_id === categoryFilter);
      }
      
      setItems(filtered);
      setSelectedIds(new Set());
    } catch (err: any) {
      toast.error('Error al obtener ítems de staging: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchCategoriesAndBrands() {
    const { data: catData } = await supabase.from('categories').select('id, name, slug').order('name', { ascending: true });
    setCategories(catData || []);

    const { data: brandData } = await supabase.from('brands').select('id, name').order('name', { ascending: true });
    setBrands(brandData || []);
  }

  // Handle Search for linkable products
  useEffect(() => {
    if (linkSearch.trim().length > 1) {
      searchProductsToLink();
    } else {
      setFoundProducts([]);
    }
  }, [linkSearch]);

  async function searchProductsToLink() {
    try {
      const { data } = await supabase
        .from('products')
        .select('id, title, base_price, product_variants(id, sku, name), product_images(url)')
        .ilike('title', `%${linkSearch}%`)
        .limit(10);
      setFoundProducts(data || []);
    } catch (_e) { /* ignore */ }
  }

  // Actions
  async function handleIgnore(id: string) {
    if (!(await confirm('¿Ignorar este ítem de Mercado Libre? Se quitará de la cola.', { danger: true }))) return;
    setActionLoading(true);
    try {
      await callEdgeFunction({ action: 'curate_ignore', raw_item_id: id });
      toast.success('Ítem ignorado');
      setSelectedItem(null);
      fetchItems();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setActionLoading(false);
    }
  }

  // Edit item metadata
  function openEdit(item: any) {
    const meta = item.raw_payload?.normalized_metadata || {};
    setEditForm({
      title: meta.clean_title || item.title,
      suggested_category_id: meta.suggested_category_id || '',
      brand_id: meta.brand_id || '',
      detected_universe: meta.detected_universe || '',
      detected_line: meta.detected_line || ''
    });
    setShowEditModal(true);
  }

  async function saveEdit() {
    if (!selectedItem) return;
    setActionLoading(true);
    try {
      await callEdgeFunction({
        action: 'curate_edit_raw',
        raw_item_id: selectedItem.id,
        title: editForm.title,
        suggested_category_id: editForm.suggested_category_id || null,
        brand_id: editForm.brand_id || null,
        detected_universe: editForm.detected_universe || null,
        detected_line: editForm.detected_line || null
      });
      toast.success('Metadatos actualizados');
      setShowEditModal(false);
      // Reload item info
      const { data } = await supabase
        .from('ml_raw_items')
        .select('*, ml_import_matches(*, products(id, title, base_price, product_images(url)))')
        .eq('id', selectedItem.id)
        .single();
      if (data) setSelectedItem(data);
      fetchItems();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setActionLoading(false);
    }
  }

  // Link Action
  function openLinkModal() {
    setLinkSearch('');
    setFoundProducts([]);
    setSelectedProductToLink(null);
    setSelectedVariantId('');
    setShowLinkModal(true);
  }

  async function executeLink(prodId: string, varId: string) {
    if (!selectedItem) return;
    if (!(await confirm('¿Confirmas que deseas vincular este producto de Mercado Libre al producto local seleccionado?'))) return;
    setActionLoading(true);
    try {
      await callEdgeFunction({
        action: 'curate_link',
        raw_item_id: selectedItem.id,
        product_id: prodId,
        variant_id: varId || null
      });
      toast.success('Producto vinculado y stock sincronizado');
      setShowLinkModal(false);
      setSelectedItem(null);
      fetchItems();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setActionLoading(false);
    }
  }

  // Create Product Action
  function openCreateModal() {
    if (!selectedItem) return;
    const meta = selectedItem.raw_payload?.normalized_metadata || {};
    setCreateForm({
      title: meta.clean_title || selectedItem.title,
      description: selectedItem.raw_payload?.description || selectedItem.title,
      price: Number(selectedItem.price || 0),
      stock: Number(selectedItem.available_quantity || 0),
      category_id: meta.suggested_category_id || '',
      brand_id: meta.brand_id || '',
      universe: meta.detected_universe || '',
      line: meta.detected_line || '',
      selected_image: selectedItem.thumbnail || ''
    });
    setShowCreateModal(true);
  }

  async function executeCreate() {
    if (!selectedItem) return;
    if (!createForm.title.trim()) {
      toast.error('El título es requerido');
      return;
    }
    if (!createForm.category_id) {
      toast.error('La categoría es requerida');
      return;
    }
    if (!(await confirm('¿Deseas crear un nuevo producto en el catálogo basándote en este ítem? Se creará como Borrador (No visible).'))) return;
    setActionLoading(true);
    try {
      await callEdgeFunction({
        action: 'curate_create',
        raw_item_id: selectedItem.id,
        title: createForm.title,
        description: createForm.description,
        price: createForm.price,
        stock: createForm.stock,
        category_id: createForm.category_id,
        brand_id: createForm.brand_id || null,
        universe: createForm.universe || null,
        line: createForm.line || null,
        selected_image: createForm.selected_image
      });
      toast.success('Producto creado y vinculado con éxito');
      setShowCreateModal(false);
      setSelectedItem(null);
      fetchItems();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setActionLoading(false);
    }
  }

  // Bulk Actions
  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  async function executeBulkAction(
    bulkAction: 'ignore' | 'assign_category' | 'assign_universe' | 'assign_brand' | 'link_strong', 
    params?: { categoryId?: string, universe?: string, brandId?: string }
  ) {
    if (selectedIds.size === 0) return;
    const itemsCount = selectedIds.size;
    let msg = `¿Deseas aplicar la acción en lote a los ${itemsCount} ítems seleccionados?`;
    if (bulkAction === 'ignore') {
      msg = `¿Confirmas que deseas ignorar los ${itemsCount} ítems seleccionados? Se removerán de la cola.`;
    } else if (bulkAction === 'link_strong') {
      msg = `¿Confirmas que deseas vincular de forma masiva los ${itemsCount} ítems seleccionados? Solo se procesarán aquellos con coincidencia exacta/fuerte detectada.`;
    } else if (bulkAction === 'assign_category') {
      msg = `¿Confirmas que deseas asignar esta categoría a los ${itemsCount} ítems seleccionados?`;
    } else if (bulkAction === 'assign_universe') {
      msg = `¿Confirmas que deseas asignar el universo "${params?.universe}" a los ${itemsCount} ítems seleccionados?`;
    } else if (bulkAction === 'assign_brand') {
      msg = `¿Confirmas que deseas asignar esta marca a los ${itemsCount} ítems seleccionados?`;
    }
    
    if (!(await confirm(msg))) return;
    setActionLoading(true);
    try {
      const res = await callEdgeFunction({
        action: 'curate_bulk',
        raw_item_ids: Array.from(selectedIds),
        bulk_action: bulkAction,
        category_id: params?.categoryId || null,
        universe: params?.universe || null,
        brand_id: params?.brandId || null
      });

      const successCount = res.results?.filter((r: any) => r.status === 'success')?.length || 0;
      const errorCount = (res.results?.length || 0) - successCount;
      if (errorCount > 0) {
        toast.success(`Acción completada: ${successCount} exitosos, ${errorCount} omitidos/error.`);
      } else {
        toast.success(`Acción completada con éxito para los ${successCount} ítems.`);
      }
      setSelectedIds(new Set());
      setSelectedItem(null);
      fetchItems();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setActionLoading(false);
    }
  }

  // Filter items matching query
  const filteredItems = items.filter(item => {
    const titleMatch = item.title.toLowerCase().includes(searchQuery.toLowerCase());
    const sku = item.raw_payload?.normalized_metadata?.extracted_seller_sku || '';
    const skuMatch = sku.toLowerCase().includes(searchQuery.toLowerCase());
    const itemIdMatch = item.ml_item_id.toLowerCase().includes(searchQuery.toLowerCase());
    return titleMatch || skuMatch || itemIdMatch;
  });

  return (
    <div className="flex flex-col xl:flex-row gap-6 relative">
      {/* Sidebar: Lists items in staging */}
      <div className="w-full xl:w-2/5 bg-white border rounded-2xl shadow-sm flex flex-col h-[80vh] overflow-hidden">
        {/* Header and filters */}
        <div className="p-4 border-b space-y-3 bg-gray-50/50">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              <Layers className="w-5 h-5 text-blue-600" />
              Cola de staging ({filteredItems.length})
            </h3>
            <div className="flex gap-1.5">
              <button 
                onClick={() => setStatusFilter('review_needed')}
                className={`text-xs font-bold px-3 py-1.5 rounded-full transition-colors ${statusFilter === 'review_needed' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                Revisión
              </button>
              <button 
                onClick={() => setStatusFilter('pending')}
                className={`text-xs font-bold px-3 py-1.5 rounded-full transition-colors ${statusFilter === 'pending' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                Pendientes
              </button>
              <button 
                onClick={() => setStatusFilter('ignored')}
                className={`text-xs font-bold px-3 py-1.5 rounded-full transition-colors ${statusFilter === 'ignored' ? 'bg-gray-200 text-gray-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                Ignorados
              </button>
            </div>
          </div>

          <div className="flex gap-2">
            <div className="flex-1 flex items-center gap-2 bg-white border rounded-xl px-3 py-2 shadow-inner focus-within:ring-2 focus-within:ring-blue-500/20">
              <Search className="w-4 h-4 text-gray-400" />
              <input 
                type="text" 
                placeholder="Buscar por título, SKU, ID..." 
                className="text-xs bg-transparent outline-none w-full border-none ring-0 focus:ring-0" 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="text-xs font-bold bg-white border text-blue-600 rounded-xl px-2 py-2 outline-none shadow-sm cursor-pointer"
            >
              <option value="all">Categorías (Todas)</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Staged raw items list */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400 animate-pulse">
              <RefreshCw className="w-8 h-8 animate-spin mb-2" />
              <span className="text-xs font-medium">Buscando cola de staging...</span>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-20">
              <AlertCircle className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500 text-xs font-medium">No se encontraron productos en staging.</p>
            </div>
          ) : (
            filteredItems.map(item => {
              const meta = item.raw_payload?.normalized_metadata || {};
              const sku = meta.extracted_seller_sku || '';
              const matchesCount = item.ml_import_matches?.length || 0;
              const hasStrongMatch = item.ml_import_matches?.some((m: any) => m.is_strong);

              return (
                <div 
                  key={item.id} 
                  className={`p-4 hover:bg-blue-50/20 transition-all flex gap-3 cursor-pointer ${selectedItem?.id === item.id ? 'bg-blue-50/50 border-l-4 border-blue-600 pl-3' : ''}`}
                  onClick={() => setSelectedItem(item)}
                >
                  <div className="flex items-center" onClick={e => e.stopPropagation()}>
                    <input 
                      type="checkbox" 
                      checked={selectedIds.has(item.id)}
                      onChange={() => toggleSelect(item.id)}
                      className="rounded border-gray-300 text-blue-600 w-4 h-4 cursor-pointer"
                    />
                  </div>
                  
                  <div className="w-12 h-12 bg-gray-100 border rounded object-cover overflow-hidden flex-shrink-0">
                    <img src={item.thumbnail} alt="" className="w-full h-full object-cover" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-1">
                      <p className="font-bold text-[13px] text-gray-900 leading-tight truncate">{meta.clean_title || item.title}</p>
                      <span className="text-xs font-black text-blue-700">UYU${Math.round(item.price)}</span>
                    </div>
                    
                    <p className="text-[10px] text-gray-400 font-mono mt-0.5">{item.ml_item_id}</p>
                    
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      {sku && (
                        <span className="text-[9px] font-mono font-bold bg-gray-100 text-gray-600 px-1 rounded">{sku}</span>
                      )}
                      {meta.brand_name && (
                        <span className="text-[9px] font-bold bg-blue-50 text-blue-700 border border-blue-100 px-1 rounded">{meta.brand_name}</span>
                      )}
                      
                      {matchesCount > 0 ? (
                        <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full flex items-center gap-1 ${hasStrongMatch ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                          {matchesCount} Match{matchesCount > 1 ? 'es' : ''} {hasStrongMatch && '⚠️'}
                        </span>
                      ) : (
                        <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">
                          Nuevo
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Main Curation Workspace */}
      <div className="flex-1 bg-white border rounded-2xl shadow-sm min-h-[80vh] flex flex-col overflow-hidden">
        {selectedItem ? (
          <div className="flex flex-col h-full divide-y">
            {/* Header */}
            <div className="p-6 bg-gray-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Reviewing ML Item</span>
                <h2 className="text-xl font-bold text-gray-900 mt-1 leading-tight flex items-center gap-2">
                  {selectedItem.title}
                  <a href={selectedItem.permalink} target="_blank" rel="noreferrer" title="Ver en Mercado Libre" className="text-blue-500 hover:text-blue-700">
                    <ExternalLink className="w-4 h-4 inline" />
                  </a>
                </h2>
                <p className="text-xs text-gray-400 font-mono mt-1">Staging ID: {selectedItem.id} | ML Item ID: {selectedItem.ml_item_id}</p>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => openEdit(selectedItem)}
                  className="btn-secondary text-xs px-3 py-2 flex items-center gap-1.5"
                >
                  <Edit2 className="w-3.5 h-3.5" /> Editar Datos
                </button>
                <button 
                  onClick={() => handleIgnore(selectedItem.id)}
                  className="px-3 py-2 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg flex items-center gap-1 border border-red-100"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Ignorar Item
                </button>
              </div>
            </div>

            {/* Content Split: Left Info, Right Actions/Matches */}
            <div className="flex-1 p-6 flex flex-col md:flex-row gap-6 overflow-y-auto max-h-[55vh]">
              {/* Product Info Cards */}
              <div className="flex-1 space-y-4">
                <div className="flex flex-col sm:flex-row gap-4 bg-gray-50 p-4 rounded-xl border">
                  <div className="w-24 h-24 bg-white border rounded object-cover overflow-hidden flex-shrink-0 shadow-sm mx-auto sm:mx-0">
                    <img src={selectedItem.thumbnail} alt="" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 space-y-2 text-xs">
                    <p className="text-sm font-black text-gray-800 border-b pb-1.5">Datos Normalizados Ingestados</p>
                    <p className="flex justify-between border-b pb-1"><span className="text-gray-400">Título limpio:</span> <span className="font-semibold text-gray-900">{selectedItem.raw_payload?.normalized_metadata?.clean_title || selectedItem.title}</span></p>
                    <p className="flex justify-between border-b pb-1"><span className="text-gray-400">Marca sugerida:</span> <span className="font-semibold text-gray-900">{selectedItem.raw_payload?.normalized_metadata?.brand_name || 'Ninguna'}</span></p>
                    <p className="flex justify-between border-b pb-1"><span className="text-gray-400">Universo detectado:</span> <span className="font-semibold text-gray-900">{selectedItem.raw_payload?.normalized_metadata?.detected_universe || 'Ninguno'}</span></p>
                    <p className="flex justify-between border-b pb-1"><span className="text-gray-400">Línea detectada:</span> <span className="font-semibold text-gray-900">{selectedItem.raw_payload?.normalized_metadata?.detected_line || 'Ninguna'}</span></p>
                    <p className="flex justify-between border-b pb-1"><span className="text-gray-400">Categoría sugerida:</span> <span className="font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-100">
                      {categories.find(c => c.id === selectedItem.raw_payload?.normalized_metadata?.suggested_category_id)?.name || 'Sin Categorizar'}
                    </span></p>
                    <div className="flex gap-4 pt-1">
                      <p><span className="text-gray-400 mr-2">Precio:</span> <strong className="text-sm text-blue-700">UYU${Math.round(selectedItem.price)}</strong></p>
                      <p><span className="text-gray-400 mr-2">Stock:</span> <strong className="text-sm text-green-700">{selectedItem.available_quantity} u.</strong></p>
                    </div>
                  </div>
                </div>

                <div className="border rounded-xl p-4">
                  <h4 className="text-xs font-black uppercase tracking-wider text-gray-500 mb-2">Descripción Ingestada (ML)</h4>
                  <div className="text-xs text-gray-600 bg-gray-50 p-3 rounded-lg border max-h-36 overflow-y-auto whitespace-pre-line leading-relaxed font-sans shadow-inner">
                    {selectedItem.raw_payload?.description || 'Sin descripción.'}
                  </div>
                </div>
              </div>

              {/* Duplicate matches engine */}
              <div className="w-full md:w-1/2 flex flex-col gap-4">
                <div className="border rounded-xl p-4 flex-1 flex flex-col">
                  <h4 className="text-xs font-black uppercase tracking-wider text-gray-500 border-b pb-2 mb-3 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-orange-500" />
                    Posibles Duplicados ({selectedItem.ml_import_matches?.length || 0})
                  </h4>

                  <div className="flex-1 space-y-3 overflow-y-auto max-h-60 pr-1">
                    {selectedItem.ml_import_matches && selectedItem.ml_import_matches.length > 0 ? (
                      selectedItem.ml_import_matches.map((match: any) => {
                        const prod = match.products;
                        const score = Number(match.confidence_score) * 100;
                        const isStrong = match.is_strong;
                        const mainImg = prod?.product_images?.find((img: any) => img.is_main)?.url || prod?.product_images?.[0]?.url || '';

                        return (
                          <div 
                            key={match.id} 
                            className={`p-3 rounded-xl border flex gap-3 transition-colors ${isStrong ? 'bg-red-50/30 border-red-100 hover:bg-red-50/50' : 'bg-gray-50/50 hover:bg-gray-50'}`}
                          >
                            <div className="w-10 h-10 bg-white border rounded object-cover overflow-hidden flex-shrink-0">
                              {mainImg ? <img src={mainImg} alt="" className="w-full h-full object-cover" /> : <ImageIcon className="w-4 h-4 text-gray-300 m-auto mt-2" />}
                            </div>

                            <div className="flex-1 min-w-0 text-xs">
                              <p className="font-bold text-gray-900 truncate leading-snug">{prod?.title || 'Producto Eliminado'}</p>
                              
                              <div className="flex items-center gap-2 mt-1.5">
                                <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full ${
                                  match.match_type === 'sku' ? 'bg-blue-100 text-blue-700' :
                                  match.match_type === 'gtin' ? 'bg-purple-100 text-purple-700' :
                                  match.match_type === 'catalog_id' ? 'bg-teal-100 text-teal-700' : 'bg-orange-100 text-orange-700'
                                }`}>
                                  {match.match_type}
                                </span>
                                
                                <span className={`text-[10px] font-bold ${isStrong ? 'text-red-600 font-extrabold' : 'text-gray-500'}`}>
                                  Confianza: {score.toFixed(0)}%
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center">
                              <button 
                                onClick={() => executeLink(prod.id, '')}
                                className="px-2.5 py-1 text-[11px] font-black bg-blue-600 hover:bg-blue-700 text-white rounded shadow-sm hover:shadow active:scale-95 flex items-center gap-0.5"
                              >
                                <Link2 className="w-3 h-3" /> Vincular
                              </button>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-center py-8 text-gray-400">
                        <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-1.5" />
                        <p className="text-xs font-bold text-gray-500">Ningún duplicado detectado</p>
                        <p className="text-[10px] text-gray-400 mt-1"> pg_trgm y validadores no arrojaron duplicados.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Actions Workspace */}
            <div className="p-6 bg-gray-50/50 flex flex-col sm:flex-row gap-4 items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">
                  Resuelve el estado del ítem en el catálogo definitivo de Collectibles.
                </p>
              </div>
              <div className="flex gap-3 w-full sm:w-auto">
                <button 
                  onClick={openLinkModal}
                  disabled={actionLoading}
                  className="btn-secondary py-2.5 px-4 text-xs font-bold flex-1 sm:flex-none flex items-center justify-center gap-1.5 active:scale-95 shadow-sm"
                >
                  <Link2 className="w-4 h-4 text-blue-600" /> Vincular a Existente
                </button>
                <button 
                  onClick={openCreateModal}
                  disabled={actionLoading}
                  className="btn-primary py-2.5 px-6 text-xs font-black flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-blue-600 border-blue-600 hover:bg-blue-700 active:scale-95 shadow-md shadow-blue-500/20"
                >
                  <Plus className="w-4 h-4" /> Crear Nuevo Producto Master
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-32 text-gray-400 my-auto">
            <Layers className="w-12 h-12 text-gray-300 mb-3" />
            <p className="font-bold text-sm text-gray-500">Selecciona un ítem de la cola</p>
            <p className="text-xs text-gray-400 mt-1">Haz clic en cualquier producto de staging para abrir el Centro de Curación.</p>
          </div>
        )}
      </div>

      {/* Bulk action floating panel */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white rounded-2xl shadow-2xl px-6 py-4 flex flex-col md:flex-row items-center gap-4 z-40 border border-slate-700 animate-slide-up">
          <div className="flex items-center gap-2 border-r border-slate-700 pr-4">
            <span className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center font-bold text-xs">{selectedIds.size}</span>
            <span className="text-xs font-bold text-slate-300">seleccionados en lote</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button 
              onClick={() => executeBulkAction('ignore')}
              disabled={actionLoading}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-bold transition-all text-red-400 flex items-center gap-1 active:scale-95"
            >
              <Trash2 className="w-3.5 h-3.5" /> Ignorar
            </button>

            <select
              onChange={e => {
                if(e.target.value) {
                  executeBulkAction('assign_category', { categoryId: e.target.value });
                  e.target.value = '';
                }
              }}
              disabled={actionLoading}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border-none rounded-lg text-xs font-bold text-purple-300 outline-none cursor-pointer"
            >
              <option value="">Asignar Categoría...</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>

            <select
              onChange={e => {
                if(e.target.value) {
                  executeBulkAction('assign_brand', { brandId: e.target.value });
                  e.target.value = '';
                }
              }}
              disabled={actionLoading}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border-none rounded-lg text-xs font-bold text-blue-300 outline-none cursor-pointer"
            >
              <option value="">Asignar Marca...</option>
              {brands.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>

            <button
              onClick={async () => {
                const universe = prompt("Escribe el nombre del universo (ej. Star Wars, Marvel):");
                if (universe && universe.trim()) {
                  executeBulkAction('assign_universe', { universe: universe.trim() });
                }
              }}
              disabled={actionLoading}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-bold text-teal-300 transition-all flex items-center gap-1 active:scale-95"
            >
              Asignar Universo...
            </button>

            <button 
              onClick={() => executeBulkAction('link_strong')}
              disabled={actionLoading}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs font-black transition-all flex items-center gap-1 active:scale-95"
            >
              <Link2 className="w-3.5 h-3.5" /> Vincular Coincidencias Fuertes
            </button>
            
            <button 
              onClick={() => setSelectedIds(new Set())}
              className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* FORM MODAL: EDIT staging raw metadata */}
      {showEditModal && selectedItem && (
        <>
          <div className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm" onClick={() => setShowEditModal(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-white z-[60] rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-6 pb-4 border-b">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-gray-500" />
                Editar Metadatos del Item
              </h3>
              <button onClick={() => setShowEditModal(false)} className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-900 transition-colors"><X className="w-5 h-5" /></button>
            </div>
            
            <div className="space-y-4">
              <div>
                 <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Título Limpio de Curador <span className="text-red-500">*</span></label>
                 <input className="form-input w-full" value={editForm.title} onChange={e => setEditForm({...editForm, title: e.target.value})} placeholder="Ej: Funko Pop Harry Potter" />
                 <p className="text-[10px] text-gray-400 mt-1">Este título se usará como sugerencia definitiva al crear o asociar.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                   <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Categoría Curatorial</label>
                   <select className="form-input w-full" value={editForm.suggested_category_id} onChange={e => setEditForm({...editForm, suggested_category_id: e.target.value})}>
                      <option value="">Selecciona...</option>
                      {categories.map(c => (
                         <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                   </select>
                </div>
                <div>
                   <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Marca Fabricante</label>
                   <select className="form-input w-full" value={editForm.brand_id} onChange={e => setEditForm({...editForm, brand_id: e.target.value})}>
                      <option value="">Selecciona...</option>
                      {brands.map(b => (
                         <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                   </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                   <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Universo / IP</label>
                   <input className="form-input w-full" value={editForm.detected_universe} onChange={e => setEditForm({...editForm, detected_universe: e.target.value})} placeholder="Marvel, DC, Star Wars..." />
                </div>
                <div>
                   <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Línea de Colección</label>
                   <input className="form-input w-full" value={editForm.detected_line} onChange={e => setEditForm({...editForm, detected_line: e.target.value})} placeholder="Marvel Legends, Pop!..." />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-8 pt-4 border-t">
              <button onClick={() => setShowEditModal(false)} className="px-4 py-2 bg-white text-gray-700 font-bold border border-gray-300 rounded-lg hover:bg-gray-50 w-full transition-colors">Cancelar</button>
              <button onClick={saveEdit} className="px-4 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 w-full transition-colors flex items-center justify-center gap-2 shadow-[0_4px_14px_rgba(37,99,235,0.3)]"><SaveIcon className="w-4 h-4" /> Guardar Cambios</button>
            </div>
          </div>
        </>
      )}

      {/* CREATE PRODUCT MODAL */}
      {showCreateModal && selectedItem && (
        <>
          <div className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm" onClick={() => setShowCreateModal(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl bg-white z-[60] rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-6 pb-4 border-b">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <Plus className="w-5 h-5 text-blue-600" />
                Crear Nuevo Producto Master
              </h3>
              <button onClick={() => setShowCreateModal(false)} className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-900 transition-colors"><X className="w-5 h-5" /></button>
            </div>

            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
              <div>
                 <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Título del Producto <span className="text-red-500">*</span></label>
                 <input className="form-input w-full font-bold" value={createForm.title} onChange={e => setCreateForm({...createForm, title: e.target.value})} placeholder="Ej: Harry Potter Llavero Plush" />
              </div>

              <div>
                 <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Descripción Editorial</label>
                 <textarea className="form-input w-full text-xs h-20 resize-none" value={createForm.description} onChange={e => setCreateForm({...createForm, description: e.target.value})} placeholder="Descripción..." />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                   <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Precio Sugerido ($) <span className="text-red-500">*</span></label>
                   <input type="number" className="form-input w-full" value={createForm.price} onChange={e => setCreateForm({...createForm, price: Number(e.target.value)})} />
                </div>
                <div>
                   <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Inventario Inicial <span className="text-red-500">*</span></label>
                   <input type="number" className="form-input w-full" value={createForm.stock} onChange={e => setCreateForm({...createForm, stock: Number(e.target.value)})} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                   <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Categoría <span className="text-red-500">*</span></label>
                   <select className="form-input w-full" value={createForm.category_id} onChange={e => setCreateForm({...createForm, category_id: e.target.value})}>
                      <option value="">Selecciona...</option>
                      {categories.map(c => (
                         <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                   </select>
                </div>
                <div>
                   <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Marca Fabricante</label>
                   <select className="form-input w-full" value={createForm.brand_id} onChange={e => setCreateForm({...createForm, brand_id: e.target.value})}>
                      <option value="">Selecciona...</option>
                      {brands.map(b => (
                         <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                   </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                   <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Universo / IP</label>
                   <input className="form-input w-full" value={createForm.universe} onChange={e => setCreateForm({...createForm, universe: e.target.value})} placeholder="Marvel, Star Wars..." />
                </div>
                <div>
                   <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Línea</label>
                   <input className="form-input w-full" value={createForm.line} onChange={e => setCreateForm({...createForm, line: e.target.value})} placeholder="Funko Pop, Legends..." />
                </div>
              </div>

              {/* Image Picker */}
              <div>
                <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Seleccionar Imagen Principal</label>
                <div className="flex gap-2 flex-wrap max-h-32 overflow-y-auto bg-gray-50 p-3 border rounded-xl">
                  {/* Collect all photos from raw item pictures */}
                  {([selectedItem.thumbnail, ...(selectedItem.raw_payload?.pictures?.map((p:any) => p.secure_url || p.url) || [])])
                    .filter((url, index, self) => url && self.indexOf(url) === index)
                    .map((url: string, index: number) => (
                      <div 
                        key={index} 
                        className={`w-14 h-14 bg-white border rounded cursor-pointer relative overflow-hidden transition-all ${createForm.selected_image === url ? 'ring-4 ring-blue-500 border-transparent scale-95' : 'hover:scale-105'}`}
                        onClick={() => setCreateForm({...createForm, selected_image: url})}
                      >
                        <img src={url} alt="" className="w-full h-full object-cover" />
                        {createForm.selected_image === url && (
                          <div className="absolute inset-0 bg-blue-500/10 flex items-center justify-center">
                            <span className="bg-blue-600 text-white rounded-full p-0.5"><Check className="w-3.5 h-3.5" /></span>
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-8 pt-4 border-t">
              <button onClick={() => setShowCreateModal(false)} className="px-4 py-2 bg-white text-gray-700 font-bold border border-gray-300 rounded-lg hover:bg-gray-50 w-full transition-colors">Cancelar</button>
              <button onClick={executeCreate} className="px-4 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 w-full transition-colors flex items-center justify-center gap-2 shadow-[0_4px_14px_rgba(37,99,235,0.3)]"><Check className="w-4 h-4" /> Crear e Importar</button>
            </div>
          </div>
        </>
      )}

      {/* LINK TO EXISTENT PRODUCT MODAL */}
      {showLinkModal && selectedItem && (
        <>
          <div className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm" onClick={() => setShowLinkModal(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-white z-[60] rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-6 pb-4 border-b">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <Link2 className="w-5 h-5 text-gray-500" />
                Vincular a Producto Existente
              </h3>
              <button onClick={() => setShowLinkModal(false)} className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-900 transition-colors"><X className="w-5 h-5" /></button>
            </div>

            <div className="space-y-4">
              <div>
                 <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Buscar en el Catálogo Master</label>
                 <div className="flex items-center gap-2 bg-gray-50 border rounded-xl px-3 py-2.5 shadow-inner focus-within:ring-2 focus-within:ring-blue-500/20">
                   <Search className="w-4 h-4 text-gray-400" />
                   <input 
                     type="text" 
                     placeholder="Escribe título o SKU..." 
                     className="text-xs bg-transparent outline-none w-full border-none ring-0 focus:ring-0" 
                     value={linkSearch}
                     onChange={e => setLinkSearch(e.target.value)}
                   />
                 </div>
              </div>

              {/* Search results */}
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {foundProducts.length > 0 ? (
                  foundProducts.map(p => {
                    const img = p.product_images?.find((i:any) => i.is_main)?.url || p.product_images?.[0]?.url || '';
                    return (
                      <div 
                        key={p.id} 
                        className={`p-2.5 rounded-xl border flex items-center gap-3 cursor-pointer hover:bg-blue-50/20 transition-colors ${selectedProductToLink?.id === p.id ? 'bg-blue-50/50 border-blue-200' : 'bg-gray-50/30'}`}
                        onClick={() => {
                          setSelectedProductToLink(p);
                          setSelectedVariantId(p.product_variants?.[0]?.id || '');
                        }}
                      >
                        <div className="w-10 h-10 bg-white border rounded object-cover overflow-hidden flex-shrink-0">
                          {img ? <img src={img} alt="" className="w-full h-full object-cover" /> : <ImageIcon className="w-4 h-4 text-gray-300 m-auto mt-2" />}
                        </div>
                        <div className="flex-1 min-w-0 text-xs">
                          <p className="font-bold text-gray-900 truncate leading-snug">{p.title}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">Precio: UYU${Math.round(p.base_price)} | SKU: {p.product_variants?.[0]?.sku || '-'}</p>
                        </div>
                        <div className="flex items-center">
                          <span className={`w-4 h-4 rounded-full border flex items-center justify-center ${selectedProductToLink?.id === p.id ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300'}`}>
                            {selectedProductToLink?.id === p.id && <Check className="w-2.5 h-2.5" />}
                          </span>
                        </div>
                      </div>
                    );
                  })
                ) : linkSearch.trim().length > 1 ? (
                  <p className="text-center text-xs text-gray-400 py-6">No se encontraron productos coincidentes.</p>
                ) : (
                  <p className="text-center text-xs text-gray-400 py-6">Escribe algo en el buscador para ver coincidencias.</p>
                )}
              </div>

              {/* Variant Selector */}
              {selectedProductToLink && selectedProductToLink.product_variants && selectedProductToLink.product_variants.length > 0 && (
                <div className="bg-yellow-50 p-4 border border-yellow-100 rounded-xl space-y-2">
                   <label className="block text-xs font-black text-yellow-800 uppercase tracking-widest">Variante a Vincular</label>
                   <select 
                     value={selectedVariantId}
                     onChange={e => setSelectedVariantId(e.target.value)}
                     className="form-input w-full border-yellow-300 focus:ring-yellow-500 focus:border-yellow-500"
                   >
                     {selectedProductToLink.product_variants.map((v: any) => (
                       <option key={v.id} value={v.id}>{v.name || 'Estándar'} ({v.sku || 'Sin SKU'})</option>
                     ))}
                   </select>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-8 pt-4 border-t">
              <button onClick={() => setShowLinkModal(false)} className="px-4 py-2 bg-white text-gray-700 font-bold border border-gray-300 rounded-lg hover:bg-gray-50 w-full transition-colors">Cancelar</button>
              <button 
                onClick={() => executeLink(selectedProductToLink.id, selectedVariantId)} 
                disabled={!selectedProductToLink} 
                className="px-4 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 w-full transition-colors flex items-center justify-center gap-2 disabled:opacity-50 shadow-[0_4px_14px_rgba(37,99,235,0.3)]"
              >
                <Link2 className="w-4 h-4" /> Vincular Ahora
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Helper: Simple Save Icon
// ═══════════════════════════════════════════════════════════════
function SaveIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
    </svg>
  );
}
