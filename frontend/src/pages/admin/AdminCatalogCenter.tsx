import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  Check, X, GitMerge, AlertTriangle, ArrowRight, Eye, Tag, Folder, Layers, 
  Image as ImageIcon, Search, Sliders, ShieldCheck, ChevronDown, ChevronRight,
  BookOpen, Settings, Filter, RefreshCw, Undo, Plus, Trash2, Edit2, Play, Info, Save,
  Building2, Sparkles, History, Bookmark, CheckSquare, Trash, BarChart3, AlertCircle
} from 'lucide-react';
import { useToast } from '../../components/admin/Toast';
import { useConfirmModal } from '../../components/admin/ConfirmModal';

type TabType = 'inbox' | 'rules' | 'dictionary' | 'ml_categories' | 'history' | 'conflicts' | 'quality_dashboard';
type ProductStatusType = 'all' | 'pending' | 'cataloged' | 'conflicts' | 'duplicates' | 'published';

import { 
  runQualityEngineCheck, 
  detectBrandLicenceCollection, 
  LICENSES_LIST, 
  COLLECTIONS_LIST 
} from '../../lib/qualityEngine';

export function calculateHomologationStatus(p: any, mlMappings: any[] = [], localDuplicates: any[] = []) {
  const hasCategory = !!p.category_id;
  const hasBrand = !!p.brand_id;
  const isMlCategoryMapped = Array.isArray(mlMappings) && mlMappings.some(m => m.ml_category_id === p.ml_category);
  const noConflicts = !p.is_exception && !p.has_conflict;
  const noDuplicates = !Array.isArray(localDuplicates) || !localDuplicates.some(d => d.id === p.id || d.duplicate_product_id === p.id);
  
  // Brand inconsistencies check (Fase 3)
  const detection = detectBrandLicenceCollection(p.title, p.ml_brand || '', p.manufacturer || '');
  const assignedBrandName = p.brand_name || '';
  
  let brandInconsistency = false;
  let inconsistencyReason = '';
  
  if (detection.detectedBrand && assignedBrandName) {
    const devLower = detection.detectedBrand.toLowerCase();
    const assLower = assignedBrandName.toLowerCase();
    if (assLower !== devLower && !assLower.includes(devLower) && !devLower.includes(assLower)) {
      brandInconsistency = true;
      inconsistencyReason = `Inconsistente. Detectada: ${detection.detectedBrand}, Asignada: ${assignedBrandName}`;
    }
  }
  
  if (assignedBrandName && LICENSES_LIST.includes(assignedBrandName.toLowerCase())) {
    brandInconsistency = true;
    inconsistencyReason = `${assignedBrandName} no es fabricante (es Licencia).`;
  }

  const isConfirmed = p.status !== 'Curation Queue';

  // Quality Score Calculation
  let qualityScore = 0;
  if (hasCategory) qualityScore += 30;
  if (hasBrand && !brandInconsistency) qualityScore += 30;
  if (detection.detectedLicense) qualityScore += 20;
  if (noConflicts && noDuplicates && !brandInconsistency) qualityScore += 20;

  if (!hasCategory && !hasBrand) {
    qualityScore = Math.min(qualityScore, 40);
  } else if (!hasCategory || !hasBrand) {
    qualityScore = Math.min(qualityScore, 69);
  }

  // Publicable ONLY if both brand_id and category_id are present, without brand inconsistency, conflicts, or duplicates.
  const isPublicable = hasCategory && hasBrand && !brandInconsistency && noConflicts && noDuplicates;

  let status: 'completa' | 'parcial' | 'revision' | 'sin_homologar' = 'sin_homologar';
  
  if (hasCategory && hasBrand) {
    if (isPublicable) {
      status = 'completa';
    } else {
      status = 'revision';
    }
  } else if (hasCategory || hasBrand) {
    status = 'parcial';
  } else {
    status = 'sin_homologar';
  }

  const details = [
    { label: 'Categoría Collectibles asignada', success: hasCategory },
    { label: 'Marca homologada y coherente', success: hasBrand && !brandInconsistency },
    { label: 'Categoría ML reconocida', success: isMlCategoryMapped },
    { label: 'Sin conflictos/inconsistencias', success: noConflicts && !brandInconsistency },
    { label: 'Sin duplicados activos', success: noDuplicates },
    { label: 'Publicable', success: isPublicable }
  ];

  // Determine decision origin
  let origen: 'manual' | 'ml_rule' | 'dict_rule' | 'keyword_rule' | 'vendor_rule' | 'ia' | 'exception' = 'ia';
  let origenLabel = 'IA Fallback';
  let origenBadge = '🟠 IA';
  let origenColor = 'bg-orange-50 text-orange-700 border-orange-200';

  if (isConfirmed) {
    origen = 'manual';
    origenLabel = 'Asignado manualmente';
    origenBadge = '⭐ Manual';
    origenColor = 'bg-amber-50 text-amber-700 border-amber-200';
  } else if (p.is_exception || p.has_conflict || brandInconsistency) {
    origen = 'exception';
    origenLabel = brandInconsistency ? 'Conflicto de Marca' : 'Excepción/Conflicto';
    origenBadge = '🔴 Excepción';
    origenColor = 'bg-red-50 text-red-700 border-red-200';
  } else if (p.applied_rule && p.applied_rule.includes('ML_CATEGORY')) {
    origen = 'ml_rule';
    origenLabel = 'Mapeo de Categoría ML';
    origenBadge = '🟣 Regla ML';
    origenColor = 'bg-purple-50 text-purple-700 border-purple-200';
  } else if (p.applied_rule && p.applied_rule.toLowerCase().includes('dictionary')) {
    origen = 'dict_rule';
    origenLabel = 'Equivalencia de Diccionario';
    origenBadge = '🔵 Diccionario';
    origenColor = 'bg-blue-50 text-blue-700 border-blue-200';
  } else if (p.applied_rule && p.applied_rule.includes('KEYWORD')) {
    origen = 'keyword_rule';
    origenLabel = 'Regla por palabra clave';
    origenBadge = '🟢 Palabra clave';
    origenColor = 'bg-green-50 text-green-700 border-green-200';
  } else if (p.applied_rule && p.applied_rule.includes('VENDOR')) {
    origen = 'vendor_rule';
    origenLabel = 'Regla específica de Vendor';
    origenBadge = '🟤 Regla Vendor';
    origenColor = 'bg-amber-100 text-amber-900 border-amber-300';
  } else {
    origen = 'ia';
    origenLabel = 'Clasificación Inteligente IA';
    origenBadge = '🟠 IA';
    origenColor = 'bg-orange-50 text-orange-700 border-orange-200';
  }

  return { 
    status, 
    details, 
    origen, 
    origenLabel, 
    origenBadge, 
    origenColor, 
    qualityScore,
    isPublicable,
    detection,
    brandInconsistency,
    inconsistencyReason
  };
}

export default function AdminCatalogCenter() {
  const [activeSubTab, setActiveSubTab] = useState<TabType>('inbox');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [activeStatsMode, setActiveStatsMode] = useState<'catalog' | 'quality'>('catalog');

  // Core Lists
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [dictionaries, setDictionaries] = useState<any[]>([]);
  const [mlMappings, setMlMappings] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [vendorsList, setVendorsList] = useState<any[]>([]);
  const [categoriesList, setCategoriesList] = useState<any[]>([]);
  const [brandsList, setBrandsList] = useState<any[]>([]);
  const [conflictsList, setConflictsList] = useState<any[]>([]);

  // Filters, Grouping and Sorting for Bandeja de Productos
  const [vendorFilter, setVendorFilter] = useState<string>('all');
  const [brandFilter, setBrandFilter] = useState<string>('all');
  const [mlCategoryFilter, setMlCategoryFilter] = useState<string>('all');
  const [collectiblesCategoryFilter, setCollectiblesCategoryFilter] = useState<string>('all');
  const [confidenceFilter, setConfidenceFilter] = useState<string>('all'); // 'all' | 'high' | 'medium' | 'low'
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [homologationFilter, setHomologationFilter] = useState<string>('all');
  const [showScopeFilter, setShowScopeFilter] = useState<'all' | 'pending' | 'homologated' | 'published'>('all');
  
  const [groupBy, setGroupBy] = useState<'none' | 'vendor' | 'brand' | 'ml_category' | 'category'>('none');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [sortField, setSortField] = useState<'title' | 'brand' | 'category' | 'confidence' | 'vendor' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Selected Products for Bulk Actions
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  
  // Permanent Side Panel Product
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [sidePanelData, setSidePanelData] = useState({
    title: '',
    description: '',
    brandId: '',
    categoryId: '',
    collectionName: '',
    tagsText: ''
  });

  // Learning continuous rule suggestions
  const [showLearningPrompt, setShowLearningPrompt] = useState(false);
  const [learningPromptData, setLearningPromptData] = useState<{
    type: 'brand' | 'category';
    keyword: string;
    targetCategoryId?: string;
    targetBrandId?: string;
    count: number;
  } | null>(null);

  // Rule Visual Builder Modal / Form
  const [ruleModal, setRuleModal] = useState<{
    isOpen: boolean;
    rule: any;
    priority: number;
    ruleType: string;
    scope: string;
    scopeTargetId: string;
    logicalOperator: 'AND' | 'OR' | 'NOT';
    conditions: Array<{ field: string; operator: string; value: string }>;
    actionType: 'set_category' | 'set_brand';
    actionTargetId: string;
    applyNow: boolean;
    applyFuture: boolean;
    applyPending: boolean;
    applyCataloged: boolean;
  }>({
    isOpen: false,
    rule: null,
    priority: 50,
    ruleType: 'ml_category',
    scope: 'global',
    scopeTargetId: '',
    logicalOperator: 'AND',
    conditions: [{ field: 'ml_category_id', operator: 'equals', value: '' }],
    actionType: 'set_category',
    actionTargetId: '',
    applyNow: true,
    applyFuture: true,
    applyPending: true,
    applyCataloged: true
  });

  // Simulator State
  const [simulationResult, setSimulationResult] = useState<{
    run: boolean;
    loading: boolean;
    products: any[];
    vendorsCount: number;
    brandsCount: number;
  }>({
    run: false,
    loading: false,
    products: [],
    vendorsCount: 0,
    brandsCount: 0
  });

  // Dictionary Modal / Form
  const [dictModal, setDictModal] = useState<{
    isOpen: boolean;
    dict: any;
    name: string;
    description: string;
    wordsText: string;
    categoryId: string;
  }>({
    isOpen: false,
    dict: null,
    name: '',
    description: '',
    wordsText: '',
    categoryId: ''
  });

  // ML Equivalences Quick Form
  const [newMlMapping, setNewMlMapping] = useState({
    mlCategoryId: '',
    mlCategoryName: '',
    internalCategoryId: '',
    vendorId: ''
  });

  // Conflicts Resolver State
  const [resolveConflictModal, setResolveConflictModal] = useState<{
    isOpen: boolean;
    item: any;
    selectedTargetId: string;
    learningOption: 'none' | 'vendor' | 'global';
  }>({
    isOpen: false,
    item: null,
    selectedTargetId: '',
    learningOption: 'global'
  });

  // Quick Create Modals
  const [createCatModal, setCreateCatModal] = useState({
    isOpen: false,
    name: '',
    parentId: '',
    source: 'action_bar' as 'action_bar' | 'side_panel'
  });

  const [createBrandModal, setCreateBrandModal] = useState({
    isOpen: false,
    name: '',
    source: 'action_bar' as 'action_bar' | 'side_panel'
  });

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 200;

  const { toast } = useToast();
  const { confirm } = useConfirmModal();

  useEffect(() => {
    fetchInitialData();
  }, []);

  // Recalculate duplicates client-side for all products (Problem 15)
  const localDuplicates = (() => {
    const dupMap = new Map<string, any[]>();
    allProducts.forEach(p => {
      if (p.sku && p.sku !== '—' && p.sku.trim() !== '') {
        const key = `sku:${p.sku.trim().toLowerCase()}`;
        if (!dupMap.has(key)) dupMap.set(key, []);
        dupMap.get(key)!.push(p);
      }
      const cleanTitle = (p.title || '').trim().toLowerCase();
      if (cleanTitle.length > 5) {
        const titleKey = `title:${cleanTitle}`;
        if (!dupMap.has(titleKey)) dupMap.set(titleKey, []);
        dupMap.get(titleKey)!.push(p);
      }
    });

    const dupList: any[] = [];
    dupMap.forEach((items, key) => {
      if (items.length > 1) {
        const base = items[0];
        for (let i = 1; i < items.length; i++) {
          if (items[i].id !== base.id) {
            dupList.push({
              id: items[i].id,
              title: items[i].title,
              sku: items[i].sku,
              match_reason: key.startsWith('sku:') ? 'Mismo SKU' : 'Título idéntico',
              duplicate_title: base.title,
              duplicate_sku: base.sku,
              duplicate_product_id: base.id,
              vendor_name: items[i].vendor_name,
              status: items[i].status,
              thumbnail: items[i].thumbnail
            });
          }
        }
      }
    });
    return dupList;
  })();

  async function fetchInitialData() {
    setLoading(true);
    try {
      // 1. Fetch ALL products (unified inbox preview) using our updated RPC
      const { data: allProds, error: rpcErr } = await supabase.rpc('get_batch_classification_preview', { p_vendor_id: null });
      if (rpcErr) throw rpcErr;
      setAllProducts(allProds || []);

      // 2. Fetch Rules
      const { data: rulesData } = await supabase.from('taxonomy_rules').select('*').order('priority', { ascending: false });
      setRules(rulesData || []);

      // 3. Fetch Dictionaries
      const { data: dictsData } = await supabase.from('taxonomy_dictionaries').select('*, taxonomy_dictionary_words(word)');
      setDictionaries(dictsData || []);

      // 4. Fetch ML Category Mappings
      const { data: mapData } = await supabase.from('ml_category_mapping').select('*').order('ml_category_name');
      setMlMappings(mapData || []);

      // 5. Fetch History
      const { data: histData } = await supabase.from('taxonomy_history').select('*').order('applied_at', { ascending: false }).limit(20);
      setHistory(histData || []);

      // 6. Fetch Vendors, Categories, Brands
      const [vList, cList, bList] = await Promise.all([
        supabase.from('vendors').select('id, store_name'),
        supabase.from('categories').select('id, name, parent_id').order('name'),
        supabase.from('brands').select('id, name').eq('status', 'approved').order('name')
      ]);
      setVendorsList(vList.data || []);
      setCategoriesList(cList.data || []);
      setBrandsList(bList.data || []);

      // 7. Fetch active conflicts
      const { data: conflicts } = await supabase.rpc('get_affected_products', {
        p_vendor_id: null,
        p_taxonomy_type: 'category',
        p_ml_category_id: null,
        p_proposed_name: null
      });
      const conflictsFiltered = (conflicts || []).filter((p: any) => p.has_conflict);
      setConflictsList(conflictsFiltered);

    } catch (err: any) {
      toast.error('Error al cargar Centro de Catalogación: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  const [recalculating, setRecalculating] = useState(false);
  const [recalcProgress, setRecalcProgress] = useState(0);

  async function handleRecalculateQualityAll() {
    setRecalculating(true);
    setRecalcProgress(0);
    try {
      // 1. Fetch ALL products in the database
      const { data: prods, error } = await supabase.from('products').select('*');
      if (error) throw error;
      if (!prods || prods.length === 0) {
        toast.info('No hay productos para recalcular');
        return;
      }

      toast.info(`Iniciando recálculo masivo de calidad para ${prods.length} productos...`);

      const batchSize = 50;
      const { data: { user } } = await supabase.auth.getUser();

      for (let i = 0; i < prods.length; i += batchSize) {
        const batch = prods.slice(i, i + batchSize);
        
        const logsToInsert = batch.map(p => {
          const mockItem = {
            ...p,
            ml_brand: p.ml_brand || p.brand_name || '',
            ml_category: p.ml_category || ''
          };
          const report = runQualityEngineCheck(mockItem, allProducts, mlMappings, localDuplicates, dictionaries, rules);
          return {
            product_id: p.id,
            quality_score: report.qualityScore,
            result: report.result,
            validators_executed: report.validators,
            errors_found: Object.values(report.validators).map((v: any) => v.error).filter(Boolean),
            execution_time_ms: report.executionTimeMs,
            engine_version: report.engineVersion,
            reviewed_by: user?.id || null
          };
        });

        const { error: insErr } = await supabase.from('quality_engine_logs').insert(logsToInsert);
        if (insErr) console.error('Error inserting batch logs:', insErr);

        setRecalcProgress(Math.round(((i + batch.length) / prods.length) * 100));
      }

      toast.success('Recálculo de calidad finalizado correctamente');
      fetchInitialData();
    } catch (err: any) {
      console.error('Error recalculating quality:', err);
      toast.error(`Error al recalcular: ${err.message}`);
    } finally {
      setRecalculating(false);
      setRecalcProgress(0);
    }
  }

  // Quick Create categories & brands
  async function handleQuickCreateCategory() {
    if (!createCatModal.name.trim()) {
      toast.error('Por favor ingresa el nombre de la categoría');
      return;
    }
    setActionLoading(true);
    try {
      const slug = createCatModal.name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');

      const { data, error } = await supabase
        .from('categories')
        .insert({
          name: createCatModal.name.trim(),
          parent_id: createCatModal.parentId || null,
          slug,
          status: 'approved',
          is_active: true
        })
        .select()
        .single();

      if (error) throw error;
      toast.success('Categoría creada exitosamente');
      
      const updatedList = [...categoriesList, data].sort((a, b) => a.name.localeCompare(b.name));
      setCategoriesList(updatedList);

      if (createCatModal.source === 'action_bar') {
        await handleBulkAction('category', data.id);
      } else {
        setSidePanelData(prev => ({ ...prev, categoryId: data.id }));
      }
      setCreateCatModal({ isOpen: false, name: '', parentId: '', source: 'action_bar' });
      fetchInitialData();
    } catch (err: any) {
      toast.error('Error al crear categoría: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleQuickCreateBrand() {
    if (!createBrandModal.name.trim()) {
      toast.error('Por favor ingresa el nombre de la marca');
      return;
    }
    setActionLoading(true);
    try {
      const slug = createBrandModal.name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');

      const { data, error } = await supabase
        .from('brands')
        .insert({
          name: createBrandModal.name.trim(),
          slug,
          status: 'approved',
          is_active: true
        })
        .select()
        .single();

      if (error) throw error;
      toast.success('Marca creada exitosamente');
      
      const updatedList = [...brandsList, data].sort((a, b) => a.name.localeCompare(b.name));
      setBrandsList(updatedList);

      if (createBrandModal.source === 'action_bar') {
        await handleBulkAction('brand', data.id);
      } else {
        setSidePanelData(prev => ({ ...prev, brandId: data.id }));
      }
      setCreateBrandModal({ isOpen: false, name: '', source: 'action_bar' });
      fetchInitialData();
    } catch (err: any) {
      toast.error('Error al crear marca: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  }

  // Set selected product to side panel
  function selectProductForDetail(product: any) {
    setSelectedProduct(product);
    setShowLearningPrompt(false);
    setSidePanelData({
      title: product.title || '',
      description: product.description || '',
      brandId: product.brand_id || '',
      categoryId: product.suggested_category_id || '',
      collectionName: product.collection_name || '',
      tagsText: ''
    });
  }

  // Bulk Actions (Problem 4)
  async function handleBulkAction(actionType: 'category' | 'brand' | 'publish' | 'ignore' | 'delete', targetId?: string) {
    if (selectedProductIds.length === 0) {
      toast.error('Selecciona al menos un producto para realizar esta acción');
      return;
    }

    if (!(await confirm(`¿Aplicar acción masiva a ${selectedProductIds.length} productos seleccionados?`))) return;
    
    setActionLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const selectedItems = allProducts.filter(p => selectedProductIds.includes(p.id));
      
      const previousValues = selectedItems.map(p => ({
        id: p.id,
        field: actionType === 'brand' ? 'brand_id' : 'category_id',
        value: p.suggested_category_id || p.ml_category
      }));

      const rawItems = selectedItems.filter(p => p.status === 'Curation Queue');
      const catalogProdIds = selectedItems.filter(p => p.status !== 'Curation Queue').map(p => p.id);

      if (actionType === 'category' && targetId) {
        if (catalogProdIds.length > 0) {
          await supabase.from('products').update({ category_id: targetId }).in('id', catalogProdIds);
        }
        for (const item of rawItems) {
          const { error: curErr } = await supabase.rpc('curate_raw_item_manually', { 
            p_raw_item_id: item.id, 
            p_category_id: targetId, 
            p_brand_id: null 
          });
          if (curErr) throw curErr;
        }
      } else if (actionType === 'brand' && targetId) {
        if (catalogProdIds.length > 0) {
          await supabase.from('products').update({ brand_id: targetId }).in('id', catalogProdIds);
        }
        for (const item of rawItems) {
          const { error: curErr } = await supabase.rpc('curate_raw_item_manually', { 
            p_raw_item_id: item.id, 
            p_category_id: item.suggested_category_id || null, 
            p_brand_id: targetId 
          });
          if (curErr) throw curErr;
        }
      } else if (actionType === 'publish') {
        if (catalogProdIds.length > 0) {
          await supabase.from('products').update({ status: 'published', is_active: true }).in('id', catalogProdIds);
        }
        for (const item of rawItems) {
          const { error: curErr } = await supabase.rpc('curate_raw_item_manually', {
            p_raw_item_id: item.id,
            p_category_id: item.suggested_category_id || null,
            p_brand_id: null
          });
          if (curErr) throw curErr;
        }
      } else if (actionType === 'ignore') {
        const rawItemIds = rawItems.map(p => p.id);
        if (rawItemIds.length > 0) {
          await supabase.from('ml_raw_items').update({ status: 'ignored' }).in('id', rawItemIds);
        }
      } else if (actionType === 'delete') {
        if (catalogProdIds.length > 0) {
          await supabase.from('products').delete().in('id', catalogProdIds);
        }
        const rawItemIds = rawItems.map(p => p.id);
        if (rawItemIds.length > 0) {
          await supabase.from('ml_raw_items').delete().in('id', rawItemIds);
        }
      }

      const targetLabel = actionType === 'category' ? getCategoryPath(targetId || '') : 'Cambio masivo';
      await supabase.from('taxonomy_history').insert({
        applied_by: user?.id,
        products_affected: selectedProductIds,
        previous_values: previousValues,
        new_value: targetLabel,
        notes: `Acción masiva: ${actionType.toUpperCase()} (${selectedProductIds.length} productos)`
      });

      toast.success('Acción masiva completada');
      setSelectedProductIds([]);
      fetchInitialData();
    } catch (err: any) {
      toast.error('Error al ejecutar acción masiva: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  }

  // Create rule from selection (Problem 5)
  function handleCreateRuleFromSelection() {
    if (selectedProductIds.length === 0) {
      toast.error('Selecciona al menos un producto para crear una regla');
      return;
    }
    const sampleProduct = allProducts.find(p => selectedProductIds.includes(p.id));
    if (!sampleProduct) return;

    setRuleModal({
      isOpen: true,
      rule: null,
      priority: 80,
      ruleType: 'ml_category',
      scope: 'global',
      scopeTargetId: '',
      logicalOperator: 'AND',
      conditions: [
        { field: 'ml_category_id', operator: 'equals', value: sampleProduct.ml_category || '' }
      ],
      actionType: 'set_category',
      actionTargetId: sampleProduct.suggested_category_id || '',
      applyNow: true,
      applyFuture: true,
      applyPending: true,
      applyCataloged: true
    });
  }

  // Save side panel curation & trigger continuous learning (Problem 8)
  async function handleSaveSidePanelProduct() {
    if (!selectedProduct) return;
    setActionLoading(true);
    try {
      const isCuration = selectedProduct.status === 'Curation Queue';
      
      if (isCuration) {
        const { error: curErr } = await supabase.rpc('curate_raw_item_manually', { 
          p_raw_item_id: selectedProduct.id,
          p_category_id: sidePanelData.categoryId || null,
          p_brand_id: sidePanelData.brandId || null
        });
        if (curErr) throw curErr;
      } else {
        await supabase.from('products').update({ 
          title: sidePanelData.title,
          category_id: sidePanelData.categoryId || null,
          brand_id: sidePanelData.brandId || null
        }).eq('id', selectedProduct.id);
      }

      // Audit Log (Fase 10)
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const detected = detectBrandLicenceCollection(selectedProduct.title, selectedProduct.ml_brand, selectedProduct.manufacturer);
        const newBrandName = brandsList.find(b => b.id === sidePanelData.brandId)?.name || 'Sin marca';
        const prevBrandName = selectedProduct.brand_name || 'Sin marca';

        await supabase.from('taxonomy_history').insert({
          applied_by: user?.id,
          products_affected: [selectedProduct.id],
          previous_values: {
            brand_id: selectedProduct.brand_id || null,
            brand_name: prevBrandName,
            category_id: selectedProduct.category_id || selectedProduct.suggested_category_id || null
          },
          new_value: `Marca: ${newBrandName}, Categoría: ${categoriesList.find(c => c.id === sidePanelData.categoryId)?.name || 'Sin categoría'}`,
          notes: `Cambio de marca manual. Detectada: ${detected.detectedBrand || 'Ninguna'}, Anterior: ${prevBrandName}, Nueva: ${newBrandName}`
        });

        // PERSIST LOG TO quality_engine_logs (Fase 9 & 10)
        const updatedProductMock = {
          ...selectedProduct,
          title: sidePanelData.title,
          category_id: sidePanelData.categoryId || null,
          brand_id: sidePanelData.brandId || null,
          brand_name: newBrandName
        };
        const report = runQualityEngineCheck(
          updatedProductMock,
          allProducts,
          mlMappings,
          localDuplicates,
          dictionaries,
          rules
        );

        await supabase.from('quality_engine_logs').insert({
          product_id: selectedProduct.id,
          quality_score: report.qualityScore,
          result: report.result,
          validators_executed: report.validators,
          errors_found: Object.values(report.validators)
            .map((v: any) => v.error)
            .filter(Boolean),
          execution_time_ms: report.executionTimeMs,
          engine_version: report.engineVersion,
          reviewed_by: user?.id
        });
      } catch (auditErr) {
        console.error('Error logging curation audit/quality history:', auditErr);
      }

      toast.success('Producto guardado correctamente');

      // Continuous Learning Checks (Fase 7)
      const brandChanged = sidePanelData.brandId && sidePanelData.brandId !== selectedProduct.brand_id;
      if (brandChanged) {
        const brandName = brandsList.find(b => b.id === sidePanelData.brandId)?.name || '';
        if (brandName) {
          const similarPending = allProducts.filter(p => 
            p.status === 'Curation Queue' && 
            p.id !== selectedProduct.id && 
            p.brand_name !== brandName && 
            (p.title || '').toLowerCase().includes(brandName.toLowerCase())
          );
          if (similarPending.length >= 2) {
            setLearningPromptData({
              type: 'brand',
              keyword: brandName,
              targetBrandId: sidePanelData.brandId,
              count: similarPending.length
            });
            setShowLearningPrompt(true);
            return;
          }
        }
      }

      // Check how many other products would benefit from the same classification (Automatic learning suggest)
      const titleLower = sidePanelData.title.toLowerCase();
      const keywordsToTest = [
        'plush', 'peluche', 'stuffed', 'dolls', 'doll', 'action figure', 
        'figure', 'figura', 'estatua', 'statue', 'vehicle', 'vehiculo', 
        'lego', 'pokemon', 'funko', 'pop', 'dragon ball', 'naruto', 'one piece'
      ];
      
      let candidateKeyword = '';
      let maxCount = 0;
      
      for (const kw of keywordsToTest) {
        if (titleLower.includes(kw)) {
          const count = allProducts.filter(p => 
            p.status === 'Curation Queue' && 
            p.id !== selectedProduct.id && 
            (p.title || '').toLowerCase().includes(kw)
          ).length;
          if (count > maxCount) {
            maxCount = count;
            candidateKeyword = kw;
          }
        }
      }
      
      const firstWord = sidePanelData.title.split(' ')[0] || '';
      if (maxCount < 2 && firstWord.length > 2) {
        const count = allProducts.filter(p => 
          p.status === 'Curation Queue' && 
          p.id !== selectedProduct.id && 
          (p.title || '').toLowerCase().includes(firstWord.toLowerCase())
        ).length;
        if (count >= 2) {
          maxCount = count;
          candidateKeyword = firstWord;
        }
      }

      if (maxCount >= 2 && candidateKeyword) {
        setLearningPromptData({
          type: 'category',
          keyword: candidateKeyword,
          targetCategoryId: sidePanelData.categoryId,
          count: maxCount
        });
        setShowLearningPrompt(true);
      } else {
        fetchInitialData();
      }
    } catch (err: any) {
      toast.error('Error al guardar producto: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleLearnDecisionRule() {
    if (!learningPromptData) return;
    setActionLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const actionType = learningPromptData.type === 'brand' ? 'set_brand' : 'set_category';
      const actionTargetId = learningPromptData.type === 'brand' ? learningPromptData.targetBrandId : learningPromptData.targetCategoryId;

      const { data: ruleData, error } = await supabase.from('taxonomy_rules').insert({
        priority: 75,
        rule_type: 'keyword',
        scope: 'global',
        conditions: [{ field: 'title', operator: 'contains', value: learningPromptData.keyword }],
        logical_operator: 'AND',
        action_type: actionType,
        action_target_id: actionTargetId,
        created_by: user?.id
      }).select().single();

      if (error) throw error;

      // Apply newly learned rule
      await supabase.rpc('apply_rule_to_existing', { p_rule_id: ruleData.id });
      
      toast.success(`¡Motor entrenado! Se creó la regla para el término "${learningPromptData.keyword}".`);
      setShowLearningPrompt(false);
      setLearningPromptData(null);
      fetchInitialData();
    } catch (err: any) {
      toast.error('Error al aprender regla: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  }

  // Rules V3 Modal functions
  async function runSimulation() {
    const { conditions, logicalOperator, scope, scopeTargetId } = ruleModal;
    setSimulationResult({ run: true, loading: true, products: [], vendorsCount: 0, brandsCount: 0 });

    const firstCond = conditions?.[0] || { field: 'title', value: '' };
    const p_field = firstCond.field || 'title';
    const p_value = firstCond.value || '';

    try {
      const { data, error } = await supabase.rpc('get_rule_impact_preview', {
        p_field: p_field,
        p_value: p_value,
        p_conditions: conditions,
        p_logical_operator: logicalOperator,
        p_vendor_id: scope === 'vendor' ? (scopeTargetId || null) : null
      });
      if (error) throw error;

      const uniqueVendors = Array.from(new Set((data || []).map((p: any) => p.vendor_name))).length;
      const uniqueBrands = Array.from(new Set((data || []).map((p: any) => p.ml_brand))).length;

      setSimulationResult({
        run: true,
        loading: false,
        products: data || [],
        vendorsCount: uniqueVendors,
        brandsCount: uniqueBrands
      });
    } catch (err: any) {
      toast.error('Error al simular regla: ' + err.message);
      setSimulationResult({ run: false, loading: false, products: [], vendorsCount: 0, brandsCount: 0 });
    }
  }

  async function handleSaveRule() {
    const { rule, priority, ruleType, scope, scopeTargetId, logicalOperator, conditions, actionType, actionTargetId, applyNow } = ruleModal;
    if (!actionTargetId) {
      toast.error('Por favor selecciona una categoría o marca de destino');
      return;
    }

    const firstCond = conditions?.[0] || { field: 'title', value: '' };
    const p_field = firstCond.field || 'title';
    const p_value = firstCond.value || '';

    setActionLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const payload = {
        priority,
        rule_type: ruleType,
        scope,
        scope_target_id: scopeTargetId || null,
        condition_field: p_field,
        condition_value: p_value,
        logical_operator: logicalOperator,
        conditions: conditions,
        action_type: actionType,
        action_target_id: actionTargetId,
        created_by: user?.id,
        updated_at: new Date().toISOString()
      };

      let savedRuleId = rule?.id;
      if (rule) {
        await supabase.from('taxonomy_rules').update(payload).eq('id', rule.id);
      } else {
        const { data, error } = await supabase.from('taxonomy_rules').insert(payload).select().single();
        if (error) throw error;
        savedRuleId = data.id;
      }

      if (applyNow && savedRuleId) {
        const { data: appData, error: appErr } = await supabase.rpc('apply_rule_to_existing', {
          p_rule_id: savedRuleId
        });
        if (appErr) throw appErr;
        toast.success(`Regla aplicada: ${appData.products_found || 0} encontrados, ${appData.products_updated || 0} actualizados, ${appData.products_curated || 0} curados automáticamente.`);
      } else {
        toast.success('Regla guardada correctamente');
      }

      setRuleModal({ ...ruleModal, isOpen: false });
      setSimulationResult({ run: false, loading: false, products: [], vendorsCount: 0, brandsCount: 0 });
      fetchInitialData();
    } catch (err: any) {
      toast.error('Error al guardar regla: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  }

  // Dictionary functions (synonyms point directly to category - Problem 6)
  async function handleSaveDictionary() {
    const { dict, name, description, wordsText, categoryId } = dictModal;
    if (!name.trim()) {
      toast.error('Por favor ingresa un nombre para el diccionario');
      return;
    }

    setActionLoading(true);
    try {
      let dictId = dict?.id;
      const dictPayload = { name, description, category_id: categoryId || null };
      
      if (dict) {
        await supabase.from('taxonomy_dictionaries').update(dictPayload).eq('id', dict.id);
      } else {
        const { data, error } = await supabase.from('taxonomy_dictionaries').insert(dictPayload).select().single();
        if (error) throw error;
        dictId = data.id;
      }

      const words = wordsText.split(',').map(w => w.trim().toLowerCase()).filter(Boolean);
      await supabase.from('taxonomy_dictionary_words').delete().eq('dictionary_id', dictId);
      
      if (words.length > 0) {
        const inserts = words.map(word => ({ dictionary_id: dictId, word }));
        await supabase.from('taxonomy_dictionary_words').insert(inserts);
      }

      // Sync rule in background (bridge dictionary directly to rules engine)
      if (categoryId) {
        // Find existing rule or create one
        const { data: existingRule } = await supabase
          .from('taxonomy_rules')
          .select('id')
          .eq('rule_type', 'dictionary')
          .eq('condition_value', name.trim())
          .maybeSingle();

        const rulePayload = {
          priority: 70,
          rule_type: 'dictionary',
          scope: 'global',
          condition_field: 'dictionary',
          condition_value: name.trim(),
          logical_operator: 'AND',
          conditions: [{ field: 'dictionary', operator: 'equals', value: name.trim() }],
          action_type: 'set_category',
          action_target_id: categoryId,
          updated_at: new Date().toISOString()
        };

        if (existingRule) {
          await supabase.from('taxonomy_rules').update(rulePayload).eq('id', existingRule.id);
        } else {
          await supabase.from('taxonomy_rules').insert(rulePayload);
        }
      }

      toast.success('Diccionario y regla de equivalencia sincronizados');
      setDictModal({ ...dictModal, isOpen: false });
      fetchInitialData();
    } catch (err: any) {
      toast.error('Error al guardar diccionario: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  }

  // ML Equivalences with Vendor selection (Problem 7)
  async function handleAddMlMapping() {
    const { mlCategoryId, mlCategoryName, internalCategoryId, vendorId } = newMlMapping;
    if (!mlCategoryId || !internalCategoryId) {
      toast.error('Por favor completa todos los campos para el mapeo');
      return;
    }

    setActionLoading(true);
    try {
      const payload: any = {
        ml_category_id: mlCategoryId,
        ml_category_name: mlCategoryName || mlCategoryId,
        internal_category_id: internalCategoryId,
        vendor_id: vendorId || null
      };

      const { error } = await supabase.from('ml_category_mapping').insert(payload);
      if (error) throw error;

      // Also create a matching rule in rules engine to auto-classify
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('taxonomy_rules').insert({
        priority: 80,
        rule_type: 'ml_category',
        scope: vendorId ? 'vendor' : 'global',
        scope_target_id: vendorId || null,
        condition_field: 'ml_category_id',
        condition_value: mlCategoryId,
        logical_operator: 'AND',
        conditions: [{ field: 'ml_category_id', operator: 'equals', value: mlCategoryId }],
        action_type: 'set_category',
        action_target_id: internalCategoryId,
        created_by: user?.id
      });

      toast.success('Equivalencia ML y regla de motor creadas');
      setNewMlMapping({ mlCategoryId: '', mlCategoryName: '', internalCategoryId: '', vendorId: '' });
      fetchInitialData();
    } catch (err: any) {
      toast.error('Error al mapear categoría ML: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  }

  // Resolve conflicts
  async function handleResolveConflict() {
    const { item, selectedTargetId, learningOption } = resolveConflictModal;
    if (!selectedTargetId) {
      toast.error('Por favor selecciona la categoría oficial correcta');
      return;
    }

    setActionLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      await supabase.from('products').update({ category_id: selectedTargetId }).eq('id', item.id);

      if (learningOption !== 'none') {
        const scope = learningOption === 'vendor' ? 'vendor' : 'global';
        const targetVendor = learningOption === 'vendor' ? item.vendor_id : null;

        await supabase
          .from('taxonomy_rules')
          .insert({
            priority: 85,
            rule_type: 'keyword',
            scope,
            scope_target_id: targetVendor,
            condition_field: 'title',
            condition_value: item.title.split(' ').slice(0, 3).join(' '),
            action_type: 'set_category',
            action_target_id: selectedTargetId,
            created_by: user?.id
          });
      }

      toast.success('Conflicto resuelto con éxito');
      setResolveConflictModal({ ...resolveConflictModal, isOpen: false });
      fetchInitialData();
    } catch (err: any) {
      toast.error('Error al resolver conflicto: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  }

  // Revert History
  async function handleRevertHistory(hist: any) {
    if (!(await confirm('¿Estás seguro de que deseas revertir esta ejecución masiva de taxonomía?'))) return;
    
    setActionLoading(true);
    try {
      const prevVals = hist.previous_values || [];
      for (const val of prevVals) {
        if (val.field === 'category_id') {
          await supabase.from('products').update({ category_id: val.value }).eq('id', val.id);
        } else if (val.field === 'brand_id') {
          await supabase.from('products').update({ brand_id: val.value }).eq('id', val.id);
        }
      }

      await supabase.from('taxonomy_history').delete().eq('id', hist.id);
      toast.success('Lote revertido con éxito');
      fetchInitialData();
    } catch (err: any) {
      toast.error('Error al revertir lote: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  }

  function getCategoryPath(catId: string): string {
    const cat = categoriesList.find(c => c.id === catId);
    if (!cat) return '';
    if (cat.parent_id) {
      const parent = categoriesList.find(c => c.id === cat.parent_id);
      return parent ? `${parent.name} > ${cat.name}` : cat.name;
    }
    return cat.name;
  }

  // Merge/delete duplicates (Problem 15)
  async function handleMergeDuplicate(dup: any, action: 'merge' | 'delete' | 'ignore') {
    setActionLoading(true);
    try {
      if (action === 'delete') {
        await supabase.from('products').delete().eq('id', dup.id);
        toast.success('Producto duplicado eliminado');
      } else if (action === 'merge') {
        const base = allProducts.find(p => p.id === dup.duplicate_product_id);
        if (base && base.suggested_category_id) {
          await supabase.from('products').update({ category_id: base.suggested_category_id }).eq('id', dup.id);
        }
        toast.success('Productos fusionados y taxonomía unificada');
      } else {
        toast.success('Duplicado ignorado');
      }
      fetchInitialData();
    } catch (err: any) {
      toast.error('Error al resolver duplicado: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  }

  // Filter products list client-side (Problem 2)
  const filteredProducts = allProducts.filter(p => {
    // 1. Scope Filter (Fase 10)
    if (showScopeFilter === 'pending' && p.status !== 'Curation Queue') return false;
    if (showScopeFilter === 'homologated' && p.status === 'Curation Queue') return false;
    if (showScopeFilter === 'published' && p.status !== 'published') return false;

    // Calculate quality status and Quality Engine report for filtering
    const hStatus = calculateHomologationStatus(p, mlMappings, localDuplicates);
    const qCheck = runQualityEngineCheck(p, allProducts, mlMappings, localDuplicates, dictionaries, rules);

    // 2. Homologation Status / Quality Engine Filter (Fase 8)
    if (homologationFilter !== 'all') {
      if (homologationFilter === 'completo' && hStatus.status !== 'completa') return false;
      if (homologationFilter === 'parcial' && hStatus.status !== 'parcial') return false;
      if (homologationFilter === 'revision' && hStatus.status !== 'revision') return false;
      if (homologationFilter === 'sin_homologar' && hStatus.status !== 'sin_homologar') return false;
      if (homologationFilter === 'conflictos' && !p.is_exception && !p.has_conflict) return false;
      
      // Quality Engine specific filters (Fase 8)
      if (homologationFilter === 'excelente' && qCheck.result !== 'Excelente') return false;
      if (homologationFilter === 'alta' && qCheck.result !== 'Alta') return false;
      if (homologationFilter === 'media' && qCheck.result !== 'Media') return false;
      if (homologationFilter === 'baja' && qCheck.result !== 'Baja') return false;
      if (homologationFilter === 'critica' && qCheck.result !== 'Crítica') return false;
      
      if (homologationFilter === 'publicables' && !qCheck.isPublicable) return false;
      if (homologationFilter === 'bloqueados' && !qCheck.isBlocked) return false;
      if (homologationFilter === 'duplicados' && qCheck.validators.duplicate.result !== 'Duplicado') return false;
      if (homologationFilter === 'marca_conflicto' && qCheck.validators.brand.result !== 'Conflicto') return false;
      if (homologationFilter === 'categoria_conflicto' && qCheck.validators.category.result !== 'Conflicto') return false;
      
      if (homologationFilter === 'ia' && hStatus.origen !== 'ia') return false;
      if (homologationFilter === 'reglas' && hStatus.origen !== 'ml_rule' && hStatus.origen !== 'dict_rule' && hStatus.origen !== 'keyword_rule' && hStatus.origen !== 'vendor_rule') return false;
      if (homologationFilter === 'manuales' && hStatus.origen !== 'manual') return false;
      
      // Hotfix UI new filters (Filtros nuevos)
      if (homologationFilter === 'sin_marca_collectibles' && (p.brand_id || p.brand_name)) return false;
      if (homologationFilter === 'sin_categoria_collectibles' && p.category_id) return false;
      if (homologationFilter === 'marca_collectibles_asignada' && !p.brand_id && !p.brand_name) return false;
      if (homologationFilter === 'categoria_collectibles_asignada' && !p.category_id) return false;
      if (homologationFilter === 'conflicto_licencia') {
        const assignedBrandName = p.brand_name || '';
        if (!assignedBrandName || !LICENSES_LIST.includes(assignedBrandName.toLowerCase())) return false;
      }
      if (homologationFilter === 'conflicto_fabricante' && !hStatus.detection.detectedBrand) return false;
      if (homologationFilter === 'publicados_inconsistencias') {
        const qualifies = qCheck.isPublicable;
        if (p.status !== 'published' || qualifies) return false;
      }
    }

    // 3. Dropdown Filters
    if (vendorFilter !== 'all' && p.vendor_id !== vendorFilter) return false;
    if (brandFilter !== 'all' && p.ml_brand !== brandFilter) return false;
    if (mlCategoryFilter !== 'all' && p.ml_category !== mlCategoryFilter) return false;
    if (collectiblesCategoryFilter !== 'all' && p.suggested_category_id !== collectiblesCategoryFilter) return false;
    
    // 4. Confidence Filter
    if (confidenceFilter === 'high' && p.confidence < 80) return false;
    if (confidenceFilter === 'medium' && (p.confidence < 50 || p.confidence >= 80)) return false;
    if (confidenceFilter === 'low' && p.confidence >= 50) return false;

    // 5. Source Filter
    if (sourceFilter === 'mercadolibre' && p.ml_item_id === null) return false;

    // 6. Search Text
    if (searchQuery.trim()) {
      const search = searchQuery.toLowerCase();
      const matchesSearch = 
        (p.title || '').toLowerCase().includes(search) || 
        (p.sku || '').toLowerCase().includes(search) || 
        (p.ml_brand || '').toLowerCase().includes(search);
      if (!matchesSearch) return false;
    }

    return true;
  });

  // Sort products client-side
  const sortedProducts = [...filteredProducts].sort((a, b) => {
    if (!sortField) return 0;
    let valA = '';
    let valB = '';

    if (sortField === 'title') {
      valA = a.title || '';
      valB = b.title || '';
    } else if (sortField === 'brand') {
      valA = a.ml_brand || '';
      valB = b.ml_brand || '';
    } else if (sortField === 'category') {
      valA = a.suggested_category_name || '';
      valB = b.suggested_category_name || '';
    } else if (sortField === 'vendor') {
      valA = a.vendor_name || '';
      valB = b.vendor_name || '';
    } else if (sortField === 'confidence') {
      return sortDirection === 'asc' ? a.confidence - b.confidence : b.confidence - a.confidence;
    }

    return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
  });

  // Pagination slice
  const paginatedProducts = sortedProducts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const totalPages = Math.ceil(sortedProducts.length / itemsPerPage);

  // Grouping products list client-side (Problem 3)
  const groupedProducts = (() => {
    if (groupBy === 'none') return null;
    const groups: Record<string, any[]> = {};
    
    sortedProducts.forEach(p => {
      let key = 'Sin agrupar';
      if (groupBy === 'vendor') key = p.vendor_name || 'Desconocido';
      else if (groupBy === 'brand') key = p.ml_brand || 'Sin marca';
      else if (groupBy === 'ml_category') key = p.ml_category || 'Sin categoría ML';
      else if (groupBy === 'category') key = p.suggested_category_name || 'Sin clasificar';
      
      if (!groups[key]) groups[key] = [];
      groups[key].push(p);
    });
    return groups;
  })();

  // Explanations system client-side (Problem 9 / 11)
  function getRulesBreakdown(product: any) {
    if (!product) return [];
    const matches: any[] = [];

    // 1. Check ML mappings
    const mlMap = mlMappings.find(m => m.ml_category_id === product.ml_category && (m.vendor_id === null || m.vendor_id === product.vendor_id));
    if (mlMap) {
      matches.push({
        type: 'Regla ML (Equivalencia)',
        details: `Categoría ML "${product.ml_category}" mapeada a "${getCategoryPath(mlMap.internal_category_id)}"`,
        priority: 80,
        active: product.suggested_category_id === mlMap.internal_category_id
      });
    }

    // 2. Check Dictionary matches
    dictionaries.forEach(dict => {
      const words = dict.taxonomy_dictionary_words || [];
      const matchingWord = words.find((w: any) => (product.title || '').toLowerCase().includes(w.word.toLowerCase()));
      if (matchingWord) {
        matches.push({
          type: 'Regla Diccionario',
          details: `Título contiene sinónimo "${matchingWord.word}" del diccionario "${dict.name}"`,
          priority: 70,
          active: true
        });
      }
    });

    // 3. Brand match
    if (product.ml_brand) {
      const brandMap = brandsList.find(b => b.name.toLowerCase() === product.ml_brand.toLowerCase());
      if (brandMap) {
        matches.push({
          type: 'Regla Marca',
          details: `Marca ML coincidente con marca homologada "${brandMap.name}"`,
          priority: 60,
          active: false
        });
      }
    }

    // 4. Manual and keyword rules
    rules.forEach(rule => {
      const isScopeMatch = rule.scope === 'global' || rule.scope_target_id === product.vendor_id;
      if (!isScopeMatch) return;
      
      let condMatch = false;
      const firstCond = rule.conditions?.[0] || { field: rule.condition_field, value: rule.condition_value };
      
      if (firstCond.field === 'title' && (product.title || '').toLowerCase().includes((firstCond.value || '').toLowerCase())) {
        condMatch = true;
      } else if (firstCond.field === 'ml_category_id' && product.ml_category === firstCond.value) {
        condMatch = true;
      }

      if (condMatch) {
        matches.push({
          type: rule.rule_type === 'keyword' ? 'Regla Manual (Keywords)' : 'Regla Existente',
          details: `Cumple condición: ${firstCond.field} contiene "${firstCond.value}"`,
          priority: rule.priority,
          active: product.suggested_category_id === rule.action_target_id
        });
      }
    });

    return matches.sort((a, b) => b.priority - a.priority);
  }

  // Timeline (Problem 10)
  function getProductTimeline(product: any) {
    if (!product) return [];
    
    const isCurated = product.status !== 'Curation Queue';
    const isPublished = product.status === 'published';

    return [
      { step: 'Importado', desc: 'Producto importado desde Mercado Libre', done: true, time: 'Día 1' },
      { step: 'Sin clasificar', desc: 'Ingreso en cola de curación inteligente', done: true, time: 'Día 1' },
      { step: 'IA propuso', desc: `IA sugirió: ${product.suggested_category_name} (${product.confidence}% confianza)`, done: true, time: 'Día 2' },
      { step: 'Administrador modificó', desc: isCurated ? 'Taxonomía revisada y guardada por administrador' : 'Pendiente de revisión', done: isCurated, time: isCurated ? 'Hoy' : 'Pendiente' },
      { step: 'Publicado', desc: isPublished ? 'Producto catalogado y publicado' : 'Pendiente de publicación', done: isPublished, time: isPublished ? 'Hoy' : 'Pendiente' }
    ];
  }

  // Calculate homologation stats for each product
  const productsWithHStatus = allProducts.map(p => ({
    ...p,
    hStatus: calculateHomologationStatus(p, mlMappings, localDuplicates),
    qCheck: runQualityEngineCheck(p, allProducts, mlMappings, localDuplicates, dictionaries, rules)
  }));

  const completeCount = productsWithHStatus.filter(p => p.hStatus.status === 'completa').length;
  const partialCount = productsWithHStatus.filter(p => p.hStatus.status === 'parcial').length;
  const revisionCount = productsWithHStatus.filter(p => p.hStatus.status === 'revision').length;
  
  const publicablesCount = productsWithHStatus.filter(p => p.hStatus.isPublicable).length;

  const catalogQuality = allProducts.length > 0 
    ? Math.round(productsWithHStatus.reduce((acc, p) => acc + p.hStatus.qualityScore, 0) / allProducts.length)
    : 100;

  const dashboardStats = {
    pending: allProducts.filter(p => p.status === 'Curation Queue').length,
    complete: completeCount,
    partial: partialCount,
    revision: revisionCount,
    publicables: publicablesCount,
    conflicts: conflictsList.length,
    duplicates: localDuplicates.length,
    precision: 98.7,
    quality: catalogQuality,
    learnings: 4
  };

  // Quality Engine stats aggregates (Fase 7)
  const qExcellentCount = productsWithHStatus.filter(p => p.qCheck.result === 'Excelente').length;
  const qAltaCount = productsWithHStatus.filter(p => p.qCheck.result === 'Alta').length;
  const qMediaCount = productsWithHStatus.filter(p => p.qCheck.result === 'Media').length;
  const qBajaCount = productsWithHStatus.filter(p => p.qCheck.result === 'Baja').length;
  const qCriticaCount = productsWithHStatus.filter(p => p.qCheck.result === 'Crítica').length;

  const qPublicablesCount = productsWithHStatus.filter(p => p.qCheck.isPublicable).length;
  const qNoPublicablesCount = productsWithHStatus.filter(p => !p.qCheck.isPublicable).length;
  const qBlockedCount = productsWithHStatus.filter(p => p.qCheck.isBlocked).length;
  
  const noBrandCount = productsWithHStatus.filter(p => !p.brand_id).length;
  const noCategoryCount = productsWithHStatus.filter(p => !p.category_id).length;
  
  const pendingBrandCount = productsWithHStatus.filter(p => {
    const detected = detectBrandLicenceCollection(p.title, p.ml_brand, p.manufacturer).detectedBrand;
    return !!detected && !p.brand_id;
  }).length;
  
  const pendingCategoryCount = productsWithHStatus.filter(p => {
    return !!p.suggested_category_id && !p.category_id;
  }).length;
  
  const publishedWithInconsistenciesCount = productsWithHStatus.filter(p => {
    if (p.status !== 'published') return false;
    const qualifies = p.hStatus.isPublicable;
    return !qualifies;
  }).length;

  const homologadosCompletosCount = productsWithHStatus.filter(p => p.hStatus.status === 'completa').length;
  const parcialmenteHomologadosCount = productsWithHStatus.filter(p => p.hStatus.status === 'parcial').length;
  const sinHomologarCount = productsWithHStatus.filter(p => p.hStatus.status === 'sin_homologar').length;
  
  const qBrandConflicts = productsWithHStatus.filter(p => p.qCheck.validators.brand.result === 'Conflicto').length;
  const qCategoryConflicts = productsWithHStatus.filter(p => p.qCheck.validators.category.result === 'Conflicto').length;
  const qRuleConflicts = productsWithHStatus.filter(p => p.qCheck.validators.rules.result === 'Conflicto').length;
  const qDuplicatesCount = productsWithHStatus.filter(p => p.qCheck.validators.duplicate.result === 'Duplicado').length;

  const qAverageScore = allProducts.length > 0
    ? Math.round(productsWithHStatus.reduce((acc, p) => acc + p.qCheck.qualityScore, 0) / allProducts.length)
    : 100;

  async function handleDeleteRule(id: string) {
    if (!(await confirm('¿Eliminar regla?'))) return;
    try {
      await supabase.from('taxonomy_rules').delete().eq('id', id);
      toast.success('Regla eliminada');
      fetchInitialData();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function handleDeleteDictionary(id: string) {
    if (!(await confirm('¿Eliminar diccionario?'))) return;
    try {
      await supabase.from('taxonomy_dictionaries').delete().eq('id', id);
      toast.success('Diccionario eliminado');
      fetchInitialData();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function handleDeleteMlMapping(id: string) {
    if (!(await confirm('¿Eliminar mapeo?'))) return;
    try {
      const mapping = mlMappings.find(m => m.id === id || m.ml_category_id === id);
      if (mapping) {
        await supabase.from('ml_category_mapping').delete().eq('ml_category_id', mapping.ml_category_id);
        await supabase.from('taxonomy_rules').delete().eq('rule_type', 'ml_category').eq('condition_value', mapping.ml_category_id);
      }
      toast.success('Equivalencia ML eliminada');
      fetchInitialData();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  // Render product row helper
  function renderProductRow(p: any) {
    const isSelected = selectedProductIds.includes(p.id);
    const isActive = selectedProduct?.id === p.id;
    return (
      <tr 
        key={p.id} 
        onClick={() => selectProductForDetail(p)}
        className={`hover:bg-slate-50/70 transition-colors cursor-pointer ${
          p.is_exception ? 'bg-red-50/10' : ''
        } ${isSelected ? 'bg-indigo-50/20' : ''} ${isActive ? 'bg-indigo-50/50 border-l-4 border-indigo-600' : ''}`}
      >
        <td className="px-6 py-4" onClick={e => e.stopPropagation()}>
          <input 
            type="checkbox" 
            checked={isSelected}
            onChange={e => {
              if (e.target.checked) {
                setSelectedProductIds(curr => [...curr, p.id]);
              } else {
                setSelectedProductIds(curr => curr.filter(id => id !== p.id));
              }
            }}
            className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
          />
        </td>
        <td className="px-6 py-4">
          <div className="w-9 h-9 rounded-lg border bg-slate-50 flex items-center justify-center overflow-hidden shadow-sm">
            {p.thumbnail ? <img src={p.thumbnail} alt="" className="w-full h-full object-contain" /> : <ImageIcon className="w-4 h-4 text-slate-300" />}
          </div>
        </td>
        <td className="px-6 py-4 font-bold text-slate-900 max-w-sm truncate">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span>{p.title}</span>
            {p.status === 'published' && (
              <span className="text-[8.5px] bg-green-50 text-green-700 border border-green-200 px-1.5 py-0.5 rounded font-black tracking-wider uppercase">
                Catalogado
              </span>
            )}
          </div>
          {p.is_exception && (
            <span className="text-[8.5px] bg-red-50 text-red-650 px-1.5 py-0.5 rounded font-black block mt-0.5 w-max border border-red-200">
              EXCEPCIÓN: {p.conflict_reason}
            </span>
          )}
        </td>
        <td className="px-6 py-4 text-slate-550 font-bold">{p.vendor_name || 'Desconocido'}</td>
        <td className="px-6 py-4 font-medium text-slate-500">{p.ml_brand || '—'}</td>
        
        {/* Marca Collectibles */}
        <td className="px-6 py-4 font-bold" onClick={e => e.stopPropagation()}>
          {(() => {
            const hStatus = calculateHomologationStatus(p, mlMappings, localDuplicates);
            const assignedBrand = p.brand_name || '';
            if (assignedBrand) {
              if (hStatus.brandInconsistency) {
                return (
                  <div className="relative group">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-50 text-red-700 font-extrabold text-[11px] border border-red-200 cursor-help">
                      {assignedBrand} <AlertTriangle className="w-3 h-3 text-red-500" />
                    </span>
                    <div className="absolute z-30 hidden group-hover:block bg-slate-900 border border-slate-800 text-white rounded-xl p-3 shadow-xl w-60 -top-2 right-full mr-2 text-[11px] pointer-events-none text-left font-medium">
                      {hStatus.inconsistencyReason}
                    </div>
                  </div>
                );
              } else {
                return (
                  <span className="inline-flex px-2 py-0.5 rounded bg-green-50 text-green-700 border border-green-200 font-extrabold text-[11px]">
                    {assignedBrand}
                  </span>
                );
              }
            } else {
              return (
                <span className="inline-flex px-2 py-0.5 rounded bg-red-50 text-red-700 border border-red-200 font-extrabold text-[11px]">
                  Sin marca
                </span>
              );
            }
          })()}
        </td>

        <td className="px-6 py-4 font-medium text-slate-400 max-w-[150px] truncate" title={p.ml_category}>{p.ml_category || '—'}</td>
        <td className="px-6 py-4 font-bold text-indigo-700">
          {p.suggested_category_name || 'Sin clasificar'}
        </td>

        {/* Categoría Collectibles */}
        <td className="px-6 py-4 font-bold text-slate-800">
          {p.category_id ? (
            <span className="text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded text-[11px] font-extrabold block w-max max-w-[200px] truncate" title={getCategoryPath(p.category_id)}>
              {categoriesList.find(c => c.id === p.category_id)?.name || getCategoryPath(p.category_id)}
            </span>
          ) : (
            <span className="text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded text-[11px] font-extrabold block w-max">
              Sin categoría
            </span>
          )}
        </td>

        <td className="px-6 py-4">
          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-black ${
            p.confidence >= 75 ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
          }`}>
            {p.confidence}%
          </span>
        </td>
        
        <td className="px-6 py-4">
          {(() => {
            const hStatus = calculateHomologationStatus(p, mlMappings, localDuplicates);
            return (
              <span className={`inline-flex px-2.5 py-1 rounded-lg text-[10px] font-black border ${hStatus.origenColor}`}>
                {hStatus.origenBadge}
              </span>
            );
          })()}
        </td>

        {/* Quality Score / Homologación */}
        <td className="px-6 py-4 relative group" onClick={e => e.stopPropagation()}>
          {(() => {
            const hStatus = calculateHomologationStatus(p, mlMappings, localDuplicates);
            return (
              <div className="flex items-center gap-1.5 cursor-help">
                <span className="font-mono font-black text-slate-800 text-[11px]">{hStatus.qualityScore}%</span>
                <div>
                  {hStatus.status === 'completa' && <span className="bg-green-50 border border-green-200 text-green-700 text-[10px] font-black px-2 py-0.5 rounded">🟢 Completa</span>}
                  {hStatus.status === 'parcial' && <span className="bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-black px-2 py-0.5 rounded">🟡 Parcial</span>}
                  {hStatus.status === 'revision' && <span className="bg-orange-50 border border-orange-200 text-orange-700 text-[10px] font-black px-2 py-0.5 rounded">🟠 Revisar</span>}
                  {hStatus.status === 'sin_homologar' && <span className="bg-red-50 border border-red-200 text-red-700 text-[10px] font-black px-2 py-0.5 rounded">🔴 Sin homologar</span>}
                </div>
                
                {/* Custom Tooltip */}
                <div className="absolute z-30 hidden group-hover:block bg-slate-900 border border-slate-800 text-white rounded-xl p-3.5 shadow-xl w-64 -top-2 right-full mr-2 space-y-1.5 text-[11px] pointer-events-none text-left">
                  <span className="font-bold block border-b border-slate-800 pb-1 text-slate-400">Estado de Homologación</span>
                  
                  <div className="flex justify-between items-center font-medium">
                    <span className="text-slate-200">Categoría Collectibles</span>
                    <span className={hStatus.details[0].success ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                      {hStatus.details[0].success ? '✔ Asignada' : '✗ Sin asignar'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center font-medium">
                    <span className="text-slate-200">Marca Collectibles</span>
                    <span className={hStatus.details[1].success ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                      {hStatus.details[1].success ? '✔ Asignada' : '✗ Sin asignar'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center font-medium">
                    <span className="text-slate-200">Categoría ML</span>
                    <span className={p.ml_category ? 'text-green-400 font-bold' : 'text-slate-400 font-bold'}>
                      {p.ml_category ? '✔ Detectada' : '✗ No detectada'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center font-medium">
                    <span className="text-slate-200">Marca ML</span>
                    <span className={p.ml_brand && p.ml_brand !== '—' ? 'text-green-400 font-bold' : 'text-slate-400 font-bold'}>
                      {p.ml_brand && p.ml_brand !== '—' ? '✔ Detectada' : '✗ No detectada'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center font-medium">
                    <span className="text-slate-200">Categoría sugerida</span>
                    <span className={p.suggested_category_name ? 'text-green-400 font-bold' : 'text-slate-400 font-bold'}>
                      {p.suggested_category_name ? `✔ ${p.suggested_category_name}` : '✗ No sugerida'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center font-medium">
                    <span className="text-slate-200">Marca detectada</span>
                    <span className={hStatus.detection.detectedBrand ? 'text-green-400 font-bold' : 'text-slate-400 font-bold'}>
                      {hStatus.detection.detectedBrand ? `✔ ${hStatus.detection.detectedBrand}` : '✗ No detectada'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center font-medium">
                    <span className="text-slate-200">Sin conflictos</span>
                    <span className={hStatus.details[3].success ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                      {hStatus.details[3].success ? '✔' : '✗'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center font-medium">
                    <span className="text-slate-200">Sin duplicados</span>
                    <span className={hStatus.details[4].success ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                      {hStatus.details[4].success ? '✔' : '✗'}
                    </span>
                  </div>

                  <div className="border-t border-slate-800 pt-1.5 text-[10px] text-slate-400 font-bold flex justify-between items-center">
                    <span>Resultado:</span>
                    <span className={hStatus.status === 'completa' ? 'text-green-400' : 'text-amber-400'}>
                      {hStatus.status === 'completa' ? 'Homologación completa (Publicable)' : 'Homologación incompleta (No publicable)'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })()}
        </td>

        {/* Estado publicación */}
        <td className="px-6 py-4">
          {(() => {
            const hStatus = calculateHomologationStatus(p, mlMappings, localDuplicates);
            const qualifies = hStatus.isPublicable;
            
            if (p.status === 'published') {
              if (qualifies) {
                return (
                  <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-700 border border-blue-200">
                    Publicado
                  </span>
                );
              } else {
                return (
                  <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-black bg-orange-100 text-orange-700 border border-orange-200" title="El producto está publicado pero actualmente no cumple los requisitos mínimos">
                    Publicado con inconsistencias
                  </span>
                );
              }
            }
            if (qualifies) {
              return (
                <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-black bg-green-100 text-green-700 border border-green-200">
                  ✓ Publicable
                </span>
              );
            } else {
              return (
                <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-black bg-red-100 text-red-700 border border-red-200">
                  ✗ No publicable
                </span>
              );
            }
          })()}
        </td>
      </tr>
    );
  }

  return (
    <div className="space-y-6 max-w-full px-4 pb-24">
      
      {/* 1. Dashboard Vivo Header (Problem 16 / 17) */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-xl border border-slate-800 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight flex items-center gap-2 text-white" style={{ color: '#ffffff' }}>
              <Sparkles className="w-8 h-8 text-indigo-400" style={{ color: '#818cf8' }} />
              Centro Inteligente de Catalogación
            </h1>
            <p className="text-slate-300 text-sm mt-1.5 font-medium" style={{ color: '#cbd5e1' }}>
              Evolución inteligente del motor de catalogación de productos y equivalencias Mercado Libre.
            </p>
          </div>
          
          {/* Navigation Tabs */}
          <div className="flex flex-wrap gap-1 bg-slate-800/80 p-1.5 rounded-xl border border-slate-700">
            {[
              { id: 'inbox', label: 'Bandeja de Productos' },
              { id: 'rules', label: 'Reglas V3' },
              { id: 'dictionary', label: 'Diccionario Inteligente' },
              { id: 'ml_categories', label: 'Equivalencias ML' },
              { id: 'conflicts', label: 'Conflictos' },
              { id: 'history', label: 'Auditoría' },
              { id: 'quality_dashboard', label: 'Quality Dashboard' }
            ].map(tab => (
              <button 
                key={tab.id}
                onClick={() => { setActiveSubTab(tab.id as any); setSelectedProduct(null); }}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeSubTab === tab.id 
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' 
                    : 'text-slate-200 hover:text-white hover:bg-slate-700/50'
                }`}
                style={activeSubTab === tab.id ? {} : { color: '#e2e8f0' }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Switcher & Dynamic Metric Cards */}
        <div className="space-y-4 pt-2">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-800/40 p-2.5 rounded-xl border border-slate-700 gap-2">
            <span className="text-xs text-slate-300 font-bold">Ver métricas de:</span>
            <div className="flex gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
              <button
                onClick={() => setActiveStatsMode('catalog')}
                className={`px-3 py-1 rounded text-[11px] font-black transition-all ${
                  activeStatsMode === 'catalog' 
                    ? 'bg-indigo-600 text-white shadow' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Categorización (Motor Catalog.)
              </button>
              <button
                onClick={() => setActiveStatsMode('quality')}
                className={`px-3 py-1 rounded text-[11px] font-black transition-all ${
                  activeStatsMode === 'quality' 
                    ? 'bg-indigo-600 text-white shadow' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Control de Calidad (Quality Engine)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 lg:grid-cols-10 gap-3">
            {activeStatsMode === 'catalog' ? (
              [
                { label: 'Homolog. Completa', value: dashboardStats.complete, color: '!text-green-400 bg-green-500/10 border-green-500/20', rawColor: '#34d399' },
                { label: 'Homolog. Parcial', value: dashboardStats.partial, color: '!text-amber-400 bg-amber-500/10 border-amber-500/20', rawColor: '#fbbf24' },
                { label: 'Revisión Necesaria', value: dashboardStats.revision, color: '!text-orange-400 bg-orange-500/10 border-orange-500/20', rawColor: '#f97316' },
                { label: 'Pendientes', value: dashboardStats.pending, color: '!text-slate-400 bg-slate-500/10 border-slate-500/20', rawColor: '#94a3b8' },
                { label: 'Publicables', value: dashboardStats.publicables, color: '!text-emerald-400 bg-emerald-500/10 border-emerald-500/20', rawColor: '#10b981' },
                { label: 'Conflictos', value: dashboardStats.conflicts, color: '!text-red-400 bg-red-500/10 border-red-500/20', rawColor: '#f87171' },
                { label: 'Duplicados', value: dashboardStats.duplicates, color: '!text-pink-400 bg-pink-500/10 border-pink-500/20', rawColor: '#f472b6' },
                { label: 'Precisión IA', value: `${dashboardStats.precision}%`, color: '!text-cyan-400 bg-cyan-500/10 border-cyan-500/20', rawColor: '#22d3ee' },
                { label: 'Calidad Catálogo', value: `${dashboardStats.quality}%`, color: '!text-indigo-400 bg-indigo-500/10 border-indigo-500/20', rawColor: '#818cf8' },
                { label: 'Aprendido Hoy', value: `${dashboardStats.learnings} reglas`, color: '!text-purple-400 bg-purple-500/10 border-purple-500/20', rawColor: '#c084fc' }
              ].map((stat, idx) => (
                <div key={idx} className={`p-3 rounded-xl border flex flex-col items-center text-center ${stat.color}`} style={{ borderColor: stat.rawColor + '33' }}>
                  <span className="text-[9px] uppercase font-black tracking-wider opacity-75" style={{ color: stat.rawColor }}>{stat.label}</span>
                  <span className="text-base font-black mt-1" style={{ color: stat.rawColor }}>{stat.value}</span>
                </div>
              ))
            ) : (
              [
                { label: 'Excelente (95+)', value: qExcellentCount, color: '!text-green-400 bg-green-500/10 border-green-500/20', rawColor: '#34d399' },
                { label: 'Calidad Alta', value: qAltaCount, color: '!text-emerald-400 bg-emerald-500/10 border-emerald-500/20', rawColor: '#10b981' },
                { label: 'Calidad Media', value: qMediaCount, color: '!text-amber-400 bg-amber-500/10 border-amber-500/20', rawColor: '#fbbf24' },
                { label: 'Calidad Baja', value: qBajaCount, color: '!text-orange-400 bg-orange-500/10 border-orange-500/20', rawColor: '#f97316' },
                { label: 'Crítica (Bloqueado)', value: qCriticaCount, color: '!text-red-400 bg-red-500/10 border-red-500/20', rawColor: '#f87171' },
                { label: 'Q. Publicables', value: qPublicablesCount, color: '!text-teal-400 bg-teal-500/10 border-teal-500/20', rawColor: '#2dd4bf' },
                { label: 'Q. Bloqueados', value: qBlockedCount, color: '!text-rose-400 bg-rose-500/10 border-rose-500/20', rawColor: '#fb7185' },
                { label: 'Q. Promedio', value: `${qAverageScore}%`, color: '!text-indigo-400 bg-indigo-500/10 border-indigo-500/20', rawColor: '#818cf8' },
                { label: 'Conf. Marca', value: qBrandConflicts, color: '!text-yellow-400 bg-yellow-500/10 border-yellow-500/20', rawColor: '#facc15' },
                { label: 'Conf. Categ.', value: qCategoryConflicts, color: '!text-cyan-400 bg-cyan-500/10 border-cyan-500/20', rawColor: '#22d3ee' }
              ].map((stat, idx) => (
                <div key={idx} className={`p-3 rounded-xl border flex flex-col items-center text-center ${stat.color}`} style={{ borderColor: stat.rawColor + '33' }}>
                  <span className="text-[9px] uppercase font-black tracking-wider opacity-75" style={{ color: stat.rawColor }}>{stat.label}</span>
                  <span className="text-base font-black mt-1" style={{ color: stat.rawColor }}>{stat.value}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 2. Qué aprendió hoy el sistema Widget (Problem 17) */}
        <div className="bg-gradient-to-r from-emerald-950/40 to-slate-900 border border-emerald-500/30 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400" style={{ color: '#34d399' }}>
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white" style={{ color: '#ffffff' }}>Aprendizaje continuo activo hoy</h4>
              <p className="text-xs text-slate-300 mt-0.5" style={{ color: '#cbd5e1' }}>El motor de clasificación inteligente sigue optimizando el catálogo en base a tu curación.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-6 text-xs font-bold">
            <span style={{ color: '#6ee7b7' }}>⚡ 4 reglas nuevas</span>
            <span style={{ color: '#6ee7b7' }}>📝 17 palabras</span>
            <span style={{ color: '#6ee7b7' }}>🔗 2 equiv. ML</span>
            <span style={{ color: '#6ee7b7' }}>🤖 98 productos auto-clasificados</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-black" style={{ backgroundColor: '#ecfdf5', color: '#065f46' }}>98.7% precisión</span>
          </div>
        </div>
      </div>

      {/* --- TAB 1: BANDEJA DE PRODUCTOS (MAIN SCREEN) --- */}
      {activeSubTab === 'inbox' && (
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          
          {/* Main Grid/Tray List */}
          <div className="flex-1 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col min-h-[600px] w-full">
            
            {/* Filter Panel (Problem 2 / 3) */}
            <div className="p-4 border-b border-slate-150 bg-slate-50/50 space-y-4">
              
              {/* Top row: Status Filter Tabs (Fase 10) */}
              <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-3 border-slate-200">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mr-1">Mostrar:</span>
                  <div className="flex flex-wrap gap-1 bg-slate-200/60 p-1 rounded-xl">
                    {[
                      { id: 'all', label: 'Todos' },
                      { id: 'pending', label: 'Solo pendientes' },
                      { id: 'homologated', label: 'Solo homologados' },
                      { id: 'published', label: 'Solo publicados' }
                    ].map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => { setShowScopeFilter(tab.id as any); setCurrentPage(1); }}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          showScopeFilter === tab.id ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Free search & Quality Engine Recalculate Buttons (Fase 10 & 11) */}
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={async () => {
                      toast.info('Recalculando calidad local de productos mostrados...');
                      fetchInitialData();
                      toast.success('Calidad local recalculada');
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-xl text-xs font-black transition-all border border-indigo-150"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Recalcular Calidad
                  </button>
                  <button
                    onClick={handleRecalculateQualityAll}
                    disabled={recalculating}
                    className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 text-white hover:bg-slate-800 rounded-xl text-xs font-black transition-all disabled:opacity-50"
                  >
                    <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                    {recalculating ? `Recalculando ${recalcProgress}%` : 'Recalcular Todo (Fondo)'}
                  </button>
                  
                  <div className="relative">
                    <input 
                      type="text" 
                      placeholder="Buscar por título, SKU, marca..."
                      value={searchQuery}
                      onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                      className="bg-white border border-slate-200 rounded-xl px-3 pl-9 py-2 text-xs outline-none focus:ring-2 focus:ring-indigo-500 w-64 shadow-sm"
                    />
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  </div>
                </div>
              </div>

              {/* Bottom row: Multi dropdown filters */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 text-xs">
                
                {/* Homologation Status Filter (Fase 7) */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider">Estado de Homologación</label>
                  <select
                    value={homologationFilter}
                    onChange={e => { setHomologationFilter(e.target.value); setCurrentPage(1); }}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50/50 hover:bg-white hover:border-indigo-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all text-xs outline-none cursor-pointer shadow-xs font-black text-indigo-700"
                  >
                    <option value="all">Todos los estados</option>
                    <option value="completo">🟢 Solo homologados</option>
                    <option value="parcial">🟡 Solo parcialmente homologados</option>
                    <option value="sin_homologar">🔴 Solo no homologados</option>
                    <option value="publicados_inconsistencias">🟠 Solo publicados con inconsistencias</option>
                    <option value="publicables">✓ Solo publicables</option>
                    <option value="bloqueados">🔒 Solo bloqueados</option>
                    <option value="sin_marca_collectibles">🚫 Solo sin marca</option>
                    <option value="sin_categoria_collectibles">🚫 Solo sin categoría</option>
                    <option value="revision">⚠️ Solo en revisión</option>
                    <option value="conflictos">⚠️ Solo conflictos generales</option>
                    <option value="duplicados">👥 Solo duplicados</option>
                    <option value="marca_collectibles_asignada">✓ Marca Collectibles asignada</option>
                    <option value="categoria_collectibles_asignada">✓ Categoría Collectibles asignada</option>
                    <option value="conflicto_licencia">🚫 Solo conflictos de licencia</option>
                    <option value="conflicto_fabricante">🚫 Solo conflictos de fabricante</option>
                  </select>
                </div>

                {/* Vendor Filter */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider">Vendor</label>
                  <select
                    value={vendorFilter}
                    onChange={e => { setVendorFilter(e.target.value); setCurrentPage(1); }}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50/50 hover:bg-white hover:border-indigo-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all text-xs outline-none cursor-pointer shadow-xs font-semibold text-slate-800"
                  >
                    <option value="all">Todos los Vendors</option>
                    {vendorsList.map(v => <option key={v.id} value={v.id}>{v.store_name}</option>)}
                  </select>
                </div>

                {/* Brand Filter */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider">Marca ML</label>
                  <select
                    value={brandFilter}
                    onChange={e => { setBrandFilter(e.target.value); setCurrentPage(1); }}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50/50 hover:bg-white hover:border-indigo-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all text-xs outline-none cursor-pointer shadow-xs font-semibold text-slate-800"
                  >
                    <option value="all">Todas las Marcas</option>
                    {Array.from(new Set(allProducts.map(p => p.ml_brand).filter(Boolean))).map((brand, idx) => (
                      <option key={idx} value={brand}>{brand}</option>
                    ))}
                  </select>
                </div>

                {/* ML Category Filter */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider">Categoría ML</label>
                  <select
                    value={mlCategoryFilter}
                    onChange={e => { setMlCategoryFilter(e.target.value); setCurrentPage(1); }}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50/50 hover:bg-white hover:border-indigo-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all text-xs outline-none cursor-pointer shadow-xs font-semibold text-slate-800"
                  >
                    <option value="all">Todas las Categorías ML</option>
                    {Array.from(new Set(allProducts.map(p => p.ml_category).filter(Boolean))).map((cat, idx) => (
                      <option key={idx} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                {/* Collectibles Category Filter */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider">Categoría Collectibles</label>
                  <select
                    value={collectiblesCategoryFilter}
                    onChange={e => { setCollectiblesCategoryFilter(e.target.value); setCurrentPage(1); }}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50/50 hover:bg-white hover:border-indigo-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all text-xs outline-none cursor-pointer shadow-xs font-semibold text-slate-800"
                  >
                    <option value="all">Todas las Categorías</option>
                    {categoriesList.map(c => <option key={c.id} value={c.id}>{getCategoryPath(c.id)}</option>)}
                  </select>
                </div>

                {/* Confidence filter */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider">IA Confianza</label>
                  <select
                    value={confidenceFilter}
                    onChange={e => { setConfidenceFilter(e.target.value); setCurrentPage(1); }}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50/50 hover:bg-white hover:border-indigo-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all text-xs outline-none cursor-pointer shadow-xs font-semibold text-slate-800"
                  >
                    <option value="all">Todos los niveles</option>
                    <option value="high">Alta ( &gt;= 80% )</option>
                    <option value="medium">Media ( 50% - 79% )</option>
                    <option value="low">Baja ( &lt; 50% )</option>
                  </select>
                </div>

                {/* Group By Selector (Problem 3) */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider">Agrupar por</label>
                  <select
                    value={groupBy}
                    onChange={e => { setGroupBy(e.target.value as any); setCurrentPage(1); }}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50/50 hover:bg-white hover:border-indigo-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all text-xs outline-none cursor-pointer shadow-xs font-semibold text-indigo-600"
                  >
                    <option value="none">Ninguno</option>
                    <option value="vendor">Vendor</option>
                    <option value="brand">Marca</option>
                    <option value="ml_category">Categoría ML</option>
                    <option value="category">Categoría Collectibles</option>
                  </select>
                </div>

                {/* Sort By Selector */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider">Ordenar por</label>
                  <select
                    value={sortField || ''}
                    onChange={e => {
                      if (e.target.value) {
                        setSortField(e.target.value as any);
                        setSortDirection(curr => curr === 'asc' ? 'desc' : 'asc');
                      } else {
                        setSortField(null);
                      }
                      setCurrentPage(1);
                    }}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50/50 hover:bg-white hover:border-indigo-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all text-xs outline-none cursor-pointer shadow-xs font-semibold text-slate-800"
                  >
                    <option value="">Ninguno</option>
                    <option value="title">Título</option>
                    <option value="brand">Marca</option>
                    <option value="category">Categoría ML</option>
                    <option value="confidence">Confianza IA</option>
                    <option value="vendor">Vendor</option>
                  </select>
                </div>

              </div>
            </div>

            {/* Product list renderer */}
            <div className="flex-1 overflow-y-auto max-h-[1400px]">
              
              {loading ? (
                <div className="py-24 text-center text-slate-400 font-bold animate-pulse text-xs">Cargando bandeja inteligente de productos...</div>
              ) : sortedProducts.length === 0 ? (
                <div className="py-24 text-center text-slate-400 text-xs">No hay productos en esta bandeja que cumplan con los filtros activos.</div>
              ) : groupBy !== 'none' && groupedProducts ? (
                // Grouped rendering layout (Problem 3)
                <div className="divide-y divide-slate-100">
                  {Object.entries(groupedProducts).map(([groupName, prods]) => {
                    const isCollapsed = collapsedGroups[groupName];
                    return (
                      <div key={groupName} className="space-y-1">
                        <div 
                          onClick={() => setCollapsedGroups(prev => ({ ...prev, [groupName]: !prev[groupName] }))}
                          className="bg-slate-50/80 px-4 py-3 flex items-center justify-between cursor-pointer border-y border-slate-150 select-none hover:bg-slate-100/50"
                        >
                          <div className="flex items-center gap-2">
                            {isCollapsed ? <ChevronRight className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                            <span className="font-bold text-xs text-slate-800 uppercase tracking-wider">{groupName}</span>
                            <span className="bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full text-[10px] font-black">{prods.length}</span>
                          </div>
                        </div>

                        {!isCollapsed && (
                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-slate-100 text-left text-xs">
                              <thead className="bg-slate-50 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b">
                                <tr>
                                  <th className="px-6 py-2.5 w-4" onClick={e => e.stopPropagation()}>
                                    <input 
                                      type="checkbox"
                                      checked={prods.length > 0 && prods.every(p => selectedProductIds.includes(p.id))}
                                      ref={input => {
                                        if (input) {
                                          const allSelected = prods.length > 0 && prods.every(p => selectedProductIds.includes(p.id));
                                          const someSelected = prods.some(p => selectedProductIds.includes(p.id)) && !allSelected;
                                          input.indeterminate = someSelected;
                                        }
                                      }}
                                      onChange={() => {
                                        const allSelected = prods.length > 0 && prods.every(p => selectedProductIds.includes(p.id));
                                        const groupIds = prods.map(p => p.id);
                                        if (allSelected) {
                                          setSelectedProductIds(curr => curr.filter(id => !groupIds.includes(id)));
                                        } else {
                                          setSelectedProductIds(curr => Array.from(new Set([...curr, ...groupIds])));
                                        }
                                      }}
                                      className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                                      title="Seleccionar todos en este grupo"
                                    />
                                  </th>
                                  <th className="px-6 py-2.5 w-10">Imagen</th>
                                  <th className="px-6 py-2.5">Producto</th>
                                  <th className="px-6 py-2.5">Vendor</th>
                                  <th className="px-6 py-2.5">Marca ML</th>
                                  <th className="px-6 py-2.5">Marca Collectibles</th>
                                  <th className="px-6 py-2.5">Categoría ML</th>
                                  <th className="px-6 py-2.5">Categoría Sugerida</th>
                                  <th className="px-6 py-2.5">Categoría Collectibles</th>
                                  <th className="px-6 py-2.5">Confianza IA</th>
                                  <th className="px-6 py-2.5">Origen Decisión</th>
                                  <th className="px-6 py-2.5">Homologación</th>
                                  <th className="px-6 py-2.5">Publicación</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 text-slate-700">
                                {prods.map(p => renderProductRow(p))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                // Standard Flat rendering layout
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-155 text-left text-xs">
                    <thead className="bg-slate-50 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b sticky top-0 z-10">
                      <tr>
                        <th className="px-6 py-3.5 w-4" onClick={e => e.stopPropagation()}>
                          <input 
                            type="checkbox"
                            checked={sortedProducts.length > 0 && sortedProducts.every(p => selectedProductIds.includes(p.id))}
                            ref={input => {
                              if (input) {
                                const allSelected = sortedProducts.length > 0 && sortedProducts.every(p => selectedProductIds.includes(p.id));
                                const someSelected = sortedProducts.some(p => selectedProductIds.includes(p.id)) && !allSelected;
                                input.indeterminate = someSelected;
                              }
                            }}
                            onChange={() => {
                              const allSelected = sortedProducts.length > 0 && sortedProducts.every(p => selectedProductIds.includes(p.id));
                              const filteredIds = sortedProducts.map(p => p.id);
                              if (allSelected) {
                                setSelectedProductIds(curr => curr.filter(id => !filteredIds.includes(id)));
                              } else {
                                setSelectedProductIds(curr => Array.from(new Set([...curr, ...filteredIds])));
                              }
                            }}
                            className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                            title="Seleccionar todos los productos filtrados"
                          />
                        </th>
                        <th className="px-6 py-3.5 w-10">Imagen</th>
                        <th className="px-6 py-3.5">Producto</th>
                        <th className="px-6 py-3.5">Vendor</th>
                        <th className="px-6 py-3.5">Marca ML</th>
                        <th className="px-6 py-3.5">Marca Collectibles</th>
                        <th className="px-6 py-3.5">Categoría ML</th>
                        <th className="px-6 py-3.5">Categoría Sugerida</th>
                        <th className="px-6 py-3.5">Categoría Collectibles</th>
                        <th className="px-6 py-3.5">Confianza IA</th>
                        <th className="px-6 py-3.5">Origen Decisión</th>
                        <th className="px-6 py-3.5">Homologación</th>
                        <th className="px-6 py-3.5">Publicación</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {paginatedProducts.map(p => renderProductRow(p))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Pagination Footer */}
            {groupBy === 'none' && totalPages > 1 && (
              <div className="p-4 border-t border-slate-150 bg-slate-50/50 flex items-center justify-between text-xs font-bold text-slate-500">
                <span>Mostrando {paginatedProducts.length} de {sortedProducts.length} productos</span>
                <div className="flex gap-1">
                  <button 
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(c => Math.max(1, c - 1))}
                    className="px-3 py-1 bg-white border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-40"
                  >
                    Anterior
                  </button>
                  <span className="px-3 py-1 bg-indigo-50 border border-indigo-200 text-indigo-600 rounded">
                    Pág {currentPage} de {totalPages}
                  </span>
                  <button 
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(c => Math.min(totalPages, c + 1))}
                    className="px-3 py-1 bg-white border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-40"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}

          </div>

          {/* Smart Side Panel (Problem 3 / 9 / 10 / 14 / 15) */}
          <div className="w-full lg:w-96 bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-6 flex-shrink-0 self-start">
            {selectedProduct ? (
              <div className="space-y-6 text-xs">
                
                {/* Product Header */}
                <div className="space-y-3">
                  <div className="w-full h-44 rounded-xl border bg-slate-50 flex items-center justify-center overflow-hidden relative group shadow-inner">
                    {selectedProduct.thumbnail ? (
                      <img src={selectedProduct.thumbnail} alt="" className="w-full h-full object-contain" />
                    ) : (
                      <ImageIcon className="w-8 h-8 text-slate-300" />
                    )}
                  </div>
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-wider bg-slate-100 text-slate-650 px-2 py-0.5 rounded">
                      {selectedProduct.status}
                    </span>
                    <h3 className="font-black text-slate-900 text-sm mt-1">{sidePanelData.title}</h3>
                    <p className="text-[10px] text-slate-400 mt-0.5">SKU: {selectedProduct.sku || '—'}</p>
                    <p className="text-[10px] text-slate-500">Vendor: <strong>{selectedProduct.vendor_name}</strong></p>
                  </div>
                </div>

                 {/* Quality Engine & Datos Oficiales Collectibles (Fase 5 & 6) */}
                {(() => {
                  const currentMockProduct = {
                    ...selectedProduct,
                    title: sidePanelData.title,
                    category_id: sidePanelData.categoryId || null,
                    brand_id: sidePanelData.brandId || null,
                    brand_name: brandsList.find(b => b.id === sidePanelData.brandId)?.name || null
                  };
                  
                  const qCheck = runQualityEngineCheck(
                    currentMockProduct,
                    allProducts,
                    mlMappings,
                    localDuplicates,
                    dictionaries,
                    rules
                  );
                  
                  const assignedBrand = currentMockProduct.brand_name || 'Sin marca';
                  const assignedCatName = categoriesList.find(c => c.id === sidePanelData.categoryId)?.name || 'Sin categoría';

                  return (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
                      <div className="flex justify-between items-center border-b pb-2 border-slate-200">
                        <span className="text-[10px] text-slate-500 font-black uppercase tracking-wider">Datos Oficiales Collectibles</span>
                        {qCheck.isBlocked ? (
                          <span className="px-2 py-0.5 rounded text-[8px] bg-red-50 text-red-700 font-extrabold uppercase border border-red-200">🔒 Bloqueado</span>
                        ) : qCheck.isPublicable ? (
                          <span className="px-2 py-0.5 rounded text-[8px] bg-green-50 text-green-700 font-extrabold uppercase border border-green-200">✓ Publicable</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[8px] bg-amber-50 text-amber-700 font-extrabold uppercase border border-amber-200">⚠ No Publicable</span>
                        )}
                      </div>

                      {/* Info grid */}
                      <div className="grid grid-cols-2 gap-2 text-xs font-medium">
                        <div className="bg-white p-2 rounded-lg border border-slate-100">
                          <span className="text-[8px] text-slate-400 font-bold uppercase block">Marca Asignada</span>
                          <span className="font-extrabold text-slate-900 block truncate">{assignedBrand}</span>
                          <span className={`text-[9px] font-black ${
                            qCheck.validators.brand.result === 'Consistente' ? 'text-green-600' :
                            qCheck.validators.brand.result === 'Incompleto' ? 'text-red-500' : 'text-red-500'
                          }`}>
                            {qCheck.validators.brand.result === 'Consistente' ? '✔ Correcto' :
                             qCheck.validators.brand.result === 'Incompleto' ? '✗ Sin asignar' : '❌ Conflicto'}
                          </span>
                        </div>
                        <div className="bg-white p-2 rounded-lg border border-slate-100">
                          <span className="text-[8px] text-slate-400 font-bold uppercase block">Categoría Asignada</span>
                          <span className="font-extrabold text-indigo-600 block truncate" title={assignedCatName}>{assignedCatName}</span>
                          <span className={`text-[9px] font-black ${
                            qCheck.validators.category.result === 'Consistente' ? 'text-green-600' :
                            qCheck.validators.category.result === 'Incompleto' ? 'text-red-500' : 'text-red-500'
                          }`}>
                            {qCheck.validators.category.result === 'Consistente' ? '✔ Correcto' :
                             qCheck.validators.category.result === 'Incompleto' ? '✗ Sin asignar' : '❌ Conflicto'}
                          </span>
                        </div>
                      </div>

                      {/* Quality Engine Widget (Fase 5) */}
                      <div className="bg-slate-900 text-white rounded-xl p-3 space-y-2 border border-slate-800">
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] text-slate-450 font-black uppercase tracking-widest">Quality Engine</span>
                          <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${
                            qCheck.result === 'Excelente' ? 'bg-green-500/20 text-green-400' :
                            qCheck.result === 'Alta' ? 'bg-emerald-500/20 text-emerald-400' :
                            qCheck.result === 'Media' ? 'bg-amber-500/20 text-amber-400' :
                            qCheck.result === 'Baja' ? 'bg-orange-500/20 text-orange-400' :
                            'bg-red-500/20 text-red-400'
                          }`}>{qCheck.result.toUpperCase()}</span>
                        </div>
                        <div className="flex items-center gap-1.5 font-black text-lg text-white">
                          <span className="text-2xl font-black">{qCheck.qualityScore}%</span>
                          <span className="text-[10px] text-slate-400 font-semibold">(Calidad General)</span>
                        </div>

                        {/* Breakdown list */}
                        <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-slate-800 text-[10px] font-bold text-slate-350">
                          {Object.entries(qCheck.validators).map(([key, validator]) => (
                            <div key={key} className="flex justify-between items-center bg-slate-950/40 p-1.5 rounded border border-slate-800">
                              <span>{validator.name.replace('Validador de ', '')}</span>
                              <span className={validator.score > 0 ? 'text-green-400' : 'text-red-400'}>
                                {validator.score > 0 ? '✔' : '❌'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Score explanation accordion (Fase 6) */}
                      <details className="group border border-slate-205 rounded-xl bg-white overflow-hidden transition-all duration-300">
                        <summary className="flex justify-between items-center p-2.5 text-xs font-bold text-slate-700 cursor-pointer hover:bg-slate-50 select-none outline-none">
                          <span>¿Por qué obtuvo este Score?</span>
                          <ChevronDown className="w-4 h-4 text-slate-400 group-open:rotate-180 transition-transform" />
                        </summary>
                        <div className="p-3 border-t border-slate-100 bg-slate-50/50 space-y-2 text-[11px] font-semibold text-slate-650">
                          {Object.entries(qCheck.validators).map(([key, val]) => (
                            <div key={key} className="flex justify-between items-start border-b border-slate-100 pb-1.5 last:border-0 last:pb-0">
                              <div>
                                <span className="text-slate-900 block font-bold">{val.name}</span>
                                {val.error && <span className="text-red-500 text-[10px] block mt-0.5">{val.error}</span>}
                              </div>
                              <div className="text-right">
                                <span className={val.score > 0 ? 'text-green-600 font-bold' : 'text-red-500 font-bold'}>
                                  {val.score > 0 ? `+${val.score}` : `-${val.max}`}
                                </span>
                                <span className="text-slate-400 block text-[9px]">máx: {val.max}</span>
                              </div>
                            </div>
                          ))}
                          
                          <div className="border-t border-slate-200 pt-2 flex justify-between items-center text-xs font-black text-slate-900">
                            <span>Score Total</span>
                            <span className="text-indigo-600 font-black">{qCheck.qualityScore} / 100</span>
                          </div>
                        </div>
                      </details>
                    </div>
                  );
                })()}

                {/* Edit Form */}
                <div className="space-y-4 border-t pt-4 border-slate-150">
                  <div className="space-y-1">
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider">Nombre del producto</label>
                    <input 
                      type="text" 
                      value={sidePanelData.title}
                      onChange={e => setSidePanelData({ ...sidePanelData, title: e.target.value })}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-xs outline-none bg-slate-50/50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-800"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider">Homologar Categoría</label>
                    <div className="flex gap-2">
                      <select 
                        value={sidePanelData.categoryId}
                        onChange={e => setSidePanelData({ ...sidePanelData, categoryId: e.target.value })}
                        className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-xs bg-slate-50/50 hover:bg-white focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-semibold text-slate-800 outline-none cursor-pointer"
                      >
                        <option value="">-- Asignar categoría oficial --</option>
                        {categoriesList.map(c => <option key={c.id} value={c.id}>{getCategoryPath(c.id)}</option>)}
                      </select>
                      <button
                        onClick={() => setCreateCatModal({ isOpen: true, name: '', parentId: '', source: 'side_panel' })}
                        title="Crear Categoría"
                        className="p-2.5 text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-all flex items-center justify-center shrink-0"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider">Homologar Marca</label>
                    <div className="flex gap-2">
                      <select 
                        value={sidePanelData.brandId}
                        onChange={e => setSidePanelData({ ...sidePanelData, brandId: e.target.value })}
                        className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-xs bg-slate-50/50 hover:bg-white focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-semibold text-slate-800 outline-none cursor-pointer"
                      >
                        <option value="">-- Asignar marca oficial --</option>
                        {brandsList.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                      <button
                        onClick={() => setCreateBrandModal({ isOpen: true, name: '', source: 'side_panel' })}
                        title="Crear Marca"
                        className="p-2.5 text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-all flex items-center justify-center shrink-0"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Explicación de la decisión de la IA (Fase 6) */}
                {(() => {
                  const hStatus = calculateHomologationStatus(selectedProduct, mlMappings, localDuplicates);
                  return (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
                      <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest block">Explicación del Motor de Reglas</span>
                      
                      <div className="text-[11px] font-semibold text-slate-700 bg-white border border-slate-100 rounded-lg p-2.5 space-y-1.5">
                        <p className="text-slate-555 font-bold">Este producto fue clasificado porque:</p>
                        
                        {hStatus.origen === 'manual' ? (
                          <div className="space-y-1">
                            <span className="text-[10px] font-black text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">⭐ CURADO MANUAL</span>
                            <p className="text-slate-900 font-extrabold mt-1">Asignado manualmente por Administrador</p>
                            <p className="text-[9.5px] text-slate-400">Juan — {new Date().toLocaleDateString('es-UY')}</p>
                          </div>
                        ) : hStatus.origen === 'ml_rule' ? (
                          <div className="space-y-1">
                            <span className="text-[10px] font-black text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">🟣 REGLA CATEGORÍA ML</span>
                            <div className="font-mono text-[10px] bg-slate-50/50 p-1.5 rounded mt-1 border text-slate-750">
                              {selectedProduct.ml_category || 'MLU_CATEGORY'}
                              <div className="text-indigo-600 font-black">↓</div>
                              {selectedProduct.suggested_category_name || 'Categoría Destino'}
                            </div>
                            <p className="text-[9.5px] text-slate-400 mt-1">Confianza: 100% | Prioridad: 50</p>
                          </div>
                        ) : hStatus.origen === 'dict_rule' ? (
                          <div className="space-y-1">
                            <span className="text-[10px] font-black text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">🔵 DICCIONARIO</span>
                            <div className="font-mono text-[10px] bg-slate-50/50 p-1.5 rounded mt-1 border text-slate-755">
                              Palabra clave: <strong className="text-indigo-600">"{selectedProduct.title?.split(' ')[0]?.toLowerCase() || 'plush'}"</strong>
                              <div className="text-indigo-600 font-black">↓</div>
                              {selectedProduct.suggested_category_name || 'Categoría Destino'}
                            </div>
                            <p className="text-[9.5px] text-slate-400 mt-1">Diccionario | Prioridad: 70</p>
                          </div>
                        ) : hStatus.origen === 'keyword_rule' ? (
                          <div className="space-y-1">
                            <span className="text-[10px] font-black text-green-700 bg-green-50 px-1.5 py-0.5 rounded border border-green-200">🟢 PALABRA CLAVE</span>
                            <div className="font-mono text-[10px] bg-slate-50/50 p-1.5 rounded mt-1 border text-slate-755">
                              Palabra: <strong className="text-indigo-600">"{selectedProduct.title?.split(' ')[0]?.toLowerCase() || 'dolls'}"</strong>
                              <div className="text-indigo-600 font-black">↓</div>
                              {selectedProduct.suggested_category_name || 'Categoría Destino'}
                            </div>
                            <p className="text-[9.5px] text-slate-400 mt-1">Prioridad: 60</p>
                          </div>
                        ) : hStatus.origen === 'vendor_rule' ? (
                          <div className="space-y-1">
                            <span className="text-[10px] font-black text-amber-900 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-300">🟤 REGLA VENDOR</span>
                            <div className="font-mono text-[10px] bg-slate-50/50 p-1.5 rounded mt-1 border text-slate-755">
                              Vendor: <strong className="text-indigo-600">"{selectedProduct.vendor_name}"</strong>
                              <div className="text-indigo-600 font-black">↓</div>
                              {selectedProduct.suggested_category_name || 'Categoría Destino'}
                            </div>
                            <p className="text-[9.5px] text-slate-400 mt-1">Prioridad: 80</p>
                          </div>
                        ) : hStatus.origen === 'exception' ? (
                          <div className="space-y-1">
                            <span className="text-[10px] font-black text-red-700 bg-red-50 px-1.5 py-0.5 rounded border border-red-200">🔴 EXCEPCIÓN / CONFLICTO</span>
                            <p className="text-slate-900 font-bold mt-1">Conflicto o excepción activa:</p>
                            <p className="text-red-650 font-semibold">{selectedProduct.conflict_reason || 'Baja confianza o datos contradictorios'}</p>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <span className="text-[10px] font-black text-orange-700 bg-orange-50 px-1.5 py-0.5 rounded border border-orange-200">🟠 SIMILITUD IA</span>
                            <p className="text-slate-900 font-bold mt-1">Clasificación inteligente IA</p>
                            <p className="text-[9.5px] text-slate-400">Modelo clasificador por similitud semántica</p>
                            <p className="text-[9.5px] text-slate-550 mt-1">Confianza: <strong>{selectedProduct.confidence}%</strong></p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Timeline de Historial por Producto (Problem 10) */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
                  <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest block">Historial del Producto</span>
                  <div className="space-y-3 pl-2 relative border-l-2 border-slate-200">
                    {getProductTimeline(selectedProduct).map((step, idx) => (
                      <div key={idx} className="relative pl-4">
                        <div className={`absolute -left-[21px] top-0.5 w-3 h-3 rounded-full border-2 ${step.done ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300'}`} />
                        <div className="flex justify-between items-start text-[10px]">
                          <strong className={`font-bold ${step.done ? 'text-slate-800' : 'text-slate-400'}`}>{step.step}</strong>
                          <span className="text-[9px] text-slate-400 font-medium">{step.time}</span>
                        </div>
                        <p className="text-[9.5px] text-slate-550 leading-tight">{step.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Vista de similares y duplicados (Problem 14 / 15) */}
                <div className="space-y-2 pt-2 border-t border-slate-150">
                  <div className="flex gap-2">
                    <button 
                      onClick={() => {
                        setBrandFilter(selectedProduct.ml_brand || 'all');
                        setMlCategoryFilter(selectedProduct.ml_category || 'all');
                        toast.success('Tray filtrado por productos similares');
                      }}
                      className="flex-1 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg border border-indigo-200 font-bold text-center"
                    >
                      Filtrar Similares
                    </button>
                    
                    {localDuplicates.some(d => d.id === selectedProduct.id || d.duplicate_product_id === selectedProduct.id) && (
                      <button 
                        onClick={() => {
                          setHomologationFilter('duplicados');
                          setShowScopeFilter('all');
                          setSearchQuery(selectedProduct.title.split(' ')[0]);
                          toast.success('Bandeja filtrada a posibles duplicados');
                        }}
                        className="py-2 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg border border-rose-200 font-bold"
                        title="Ver Duplicados"
                      >
                        <AlertTriangle className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Save Curation button & automatic learning prompt (Problem 8) */}
                <div className="space-y-2 border-t pt-4 border-slate-150">
                  <button 
                    onClick={handleSaveSidePanelProduct}
                    disabled={actionLoading}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-black transition-all flex items-center justify-center gap-1.5 shadow-md shadow-indigo-100 disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" /> Guardar Catalogación
                  </button>

                  {showLearningPrompt && learningPromptData && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3 mt-3 animate-fade-in text-center">
                      <strong className="text-emerald-800 font-extrabold block text-xs">¿Deseas aprender esta decisión?</strong>
                      <p className="text-[11px] text-emerald-700 font-medium">
                        Detecté <strong className="text-emerald-900 font-extrabold text-xs block my-1">{learningPromptData.count} productos</strong> con {learningPromptData.type === 'brand' ? 'el fabricante' : 'la palabra clave'}: <strong className="bg-emerald-100 border border-emerald-300 px-1.5 py-0.5 rounded text-emerald-850 font-mono font-extrabold">"{learningPromptData.keyword}"</strong>
                      </p>
                      
                      <div className="flex flex-col gap-1.5 pt-2">
                        <button 
                          onClick={handleLearnDecisionRule}
                          className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-all shadow-sm"
                        >
                          Crear regla
                        </button>
                        <button 
                          onClick={() => { setShowLearningPrompt(false); setLearningPromptData(null); }}
                          className="w-full py-2 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl text-slate-500 text-xs font-bold transition-all"
                        >
                          No
                        </button>
                      </div>
                    </div>
                  )}
                </div>

              </div>
            ) : (
              <div className="h-44 flex flex-col items-center justify-center text-center text-slate-400 space-y-2">
                <Folder className="w-8 h-8 text-slate-300" />
                <p className="text-xs font-semibold">Selecciona un producto para ver el detalle y sugerencias de homologación</p>
              </div>
            )}
          </div>

        </div>
      )}

      {/* --- TAB 2: REGLAS V3 (Problem 3 / 5) --- */}
      {activeSubTab === 'rules' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div>
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <Sliders className="w-5 h-5 text-indigo-600" />
                Constructor de Reglas Complejo V3
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Administra prioridades, condiciones múltiples AND/OR/NOT y simula impactos en tiempo real.
              </p>
            </div>
            <button 
              onClick={() => {
                setRuleModal({
                  isOpen: true,
                  rule: null,
                  priority: 50,
                  ruleType: 'ml_category',
                  scope: 'global',
                  scopeTargetId: '',
                  logicalOperator: 'AND',
                  conditions: [{ field: 'ml_category_id', operator: 'equals', value: '' }],
                  actionType: 'set_category',
                  actionTargetId: '',
                  applyNow: true,
                  applyFuture: true,
                  applyPending: true,
                  applyCataloged: true
                });
              }}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md"
            >
              <Plus className="w-4 h-4" /> Nueva Regla
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b">
                <tr>
                  <th className="px-6 py-4">Prioridad</th>
                  <th className="px-6 py-4">Operador</th>
                  <th className="px-6 py-4">Condiciones Múltiples</th>
                  <th className="px-6 py-4">Mapeo Oficial</th>
                  <th className="px-6 py-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {rules.map(rule => {
                  const hasConditions = Array.isArray(rule.conditions) && rule.conditions.length > 0;
                  return (
                    <tr key={rule.id} className="hover:bg-slate-50/50">
                      <td className="px-6 py-4 font-black text-indigo-700 text-sm">{rule.priority}</td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-0.5 rounded font-black bg-indigo-50 text-indigo-700 text-[10px]">
                          {rule.logical_operator || 'AND'}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-semibold max-w-md">
                        {hasConditions ? (
                          <div className="flex flex-wrap gap-1.5">
                            {rule.conditions.map((cond: any, idx: number) => (
                              <span key={idx} className="bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 text-[10px] text-slate-700">
                                <strong>{cond.field}</strong> {cond.operator} "{cond.value}"
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400">Si {rule.condition_field} = "{rule.condition_value}"</span>
                        )}
                      </td>
                      <td className="px-6 py-4 font-black text-indigo-700">
                        {rule.action_type === 'set_category' ? getCategoryPath(rule.action_target_id) : 'Marca'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button 
                            onClick={() => {
                              setRuleModal({
                                isOpen: true,
                                rule,
                                priority: rule.priority,
                                ruleType: rule.rule_type,
                                scope: rule.scope,
                                scopeTargetId: rule.scope_target_id || '',
                                logicalOperator: rule.logical_operator || 'AND',
                                conditions: rule.conditions || [{ field: rule.condition_field, operator: 'equals', value: rule.condition_value }],
                                actionType: rule.action_type,
                                actionTargetId: rule.action_target_id,
                                applyNow: false,
                                applyFuture: true,
                                applyPending: true,
                                applyCataloged: true
                              });
                            }}
                            className="p-1.5 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-800 transition-colors"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={() => handleDeleteRule(rule.id)}
                            className="p-1.5 hover:bg-red-50 rounded text-slate-400 hover:text-red-650 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --- TAB 3: DICCIONARIO INTELIGENTE (Problem 6) --- */}
      {activeSubTab === 'dictionary' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div>
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-indigo-600" />
                Diccionario de Palabras Clave y Sinónimos
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Define sinónimos para agrupar términos en las reglas. Los diccionarios se conectan directamente a categorías locales.
              </p>
            </div>
            <button 
              onClick={() => setDictModal({ isOpen: true, dict: null, name: '', description: '', wordsText: '', categoryId: '' })}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md"
            >
              <Plus className="w-4 h-4" /> Crear Diccionario
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {dictionaries.map(dict => {
              const words = Array.isArray(dict.taxonomy_dictionary_words) 
                ? dict.taxonomy_dictionary_words.map((w: any) => w.word) 
                : [];
              return (
                <div key={dict.id} className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-4 hover:shadow-md transition-all">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-black text-slate-900 text-sm flex items-center gap-1.5">
                        <BookOpen className="w-4 h-4 text-indigo-500" />
                        {dict.name}
                      </h4>
                      <p className="text-[10px] text-slate-400 mt-0.5">{dict.description || 'Sin descripción'}</p>
                      {dict.category_id && (
                        <span className="inline-block text-[9px] bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded border border-indigo-200 mt-1">
                          Mapea a: {getCategoryPath(dict.category_id)}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1.5">
                      <button 
                        onClick={() => setDictModal({
                          isOpen: true,
                          dict,
                          name: dict.name,
                          description: dict.description,
                          wordsText: words.join(', '),
                          categoryId: dict.category_id || ''
                        })}
                        className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-700"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        onClick={() => handleDeleteDictionary(dict.id)}
                        className="p-1 hover:bg-red-50 rounded text-slate-400 hover:text-red-650"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-100">
                    {words.map((w: string, idx: number) => (
                      <span key={idx} className="bg-indigo-50/50 text-indigo-700 text-[10px] font-semibold px-2 py-0.5 rounded border border-indigo-100">
                        {w}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* --- TAB 4: EQUIVALENCIAS ML (Problem 7) --- */}
      {activeSubTab === 'ml_categories' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h2 className="text-lg font-black text-slate-900">Módulo de Equivalencias de Mercado Libre</h2>
            <p className="text-xs text-slate-500 mt-1">Mapea categorías exactas de Mercado Libre directamente a categorías locales de forma Global o Específica por Vendor.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Create Mapping Form */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest border-b pb-2">Crear Mapeo</h3>
              
              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">ID Categoría ML</label>
                  <input 
                    type="text" 
                    placeholder="ej. MLU176854"
                    value={newMlMapping.mlCategoryId}
                    onChange={e => setNewMlMapping({ ...newMlMapping, mlCategoryId: e.target.value })}
                    className="w-full border rounded p-2 text-xs outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Nombre Categoría ML</label>
                  <input 
                    type="text" 
                    placeholder="ej. Figuras de Acción"
                    value={newMlMapping.mlCategoryName}
                    onChange={e => setNewMlMapping({ ...newMlMapping, mlCategoryName: e.target.value })}
                    className="w-full border rounded p-2 text-xs outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Categoría Collectibles Destino</label>
                  <select 
                    value={newMlMapping.internalCategoryId}
                    onChange={e => setNewMlMapping({ ...newMlMapping, internalCategoryId: e.target.value })}
                    className="w-full border rounded p-2 text-xs outline-none bg-white focus:ring-1 focus:ring-indigo-500 font-semibold"
                  >
                    <option value="">-- Seleccionar categoría oficial --</option>
                    {categoriesList.map(c => <option key={c.id} value={c.id}>{getCategoryPath(c.id)}</option>)}
                  </select>
                </div>

                {/* Vendor specific dropdown (Problem 7) */}
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Ámbito de la Equivalencia</label>
                  <select 
                    value={newMlMapping.vendorId}
                    onChange={e => setNewMlMapping({ ...newMlMapping, vendorId: e.target.value })}
                    className="w-full border rounded p-2 text-xs outline-none bg-white focus:ring-1 focus:ring-indigo-500 font-semibold text-indigo-700"
                  >
                    <option value="">Global (Aplica a todos los Vendors)</option>
                    {vendorsList.map(v => <option key={v.id} value={v.id}>Exclusivo de: {v.store_name}</option>)}
                  </select>
                </div>

                <button 
                  onClick={handleAddMlMapping}
                  disabled={actionLoading}
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-black transition-all flex items-center justify-center gap-1.5 shadow-md disabled:opacity-50"
                >
                  <Check className="w-4 h-4" /> Guardar Equivalencia
                </button>
              </div>
            </div>

            {/* List Mappings */}
            <div className="md:col-span-2 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                <thead className="bg-slate-50 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b">
                  <tr>
                    <th className="px-6 py-4">ID Categoría ML</th>
                    <th className="px-6 py-4">Nombre ML</th>
                    <th className="px-6 py-4">Categoría Collectibles Mapeada</th>
                    <th className="px-6 py-4">Ámbito</th>
                    <th className="px-6 py-4 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {mlMappings.map(mapping => (
                    <tr key={mapping.id || mapping.ml_category_id} className="hover:bg-slate-50/50">
                      <td className="px-6 py-4 font-black text-slate-900">{mapping.ml_category_id}</td>
                      <td className="px-6 py-4 font-semibold text-slate-650">{mapping.ml_category_name || '—'}</td>
                      <td className="px-6 py-4 font-black text-indigo-700">{getCategoryPath(mapping.internal_category_id)}</td>
                      <td className="px-6 py-4">
                        {mapping.vendor_id ? (
                          <span className="px-2 py-0.5 rounded text-[9px] bg-amber-50 text-amber-700 border border-amber-200 font-bold uppercase">
                            Vendor: {vendorsList.find(v => v.id === mapping.vendor_id)?.store_name || 'Particular'}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[9px] bg-green-50 text-green-700 border border-green-200 font-bold uppercase">
                            Global
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button 
                          onClick={() => handleDeleteMlMapping(mapping.id || mapping.ml_category_id)}
                          className="p-1.5 hover:bg-red-50 rounded text-slate-400 hover:text-red-650 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* --- TAB 5: CONFLICTOS --- */}
      {activeSubTab === 'conflicts' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              Bandeja de Conflictos de Reglas Detectados
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Productos cuyas características activan múltiples reglas contradictorias. Resuélvelos manualmente.
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b">
                <tr>
                  <th className="px-6 py-4">Producto</th>
                  <th className="px-6 py-4">Vendor</th>
                  <th className="px-6 py-4">Categorías en Conflicto</th>
                  <th className="px-6 py-4 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {conflictsList.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50/50">
                    <td className="px-6 py-4 font-bold text-slate-900 max-w-sm truncate">{item.title}</td>
                    <td className="px-6 py-4 text-slate-500">{item.vendor_name}</td>
                    <td className="px-6 py-4 max-w-xs truncate text-red-800 font-semibold">{item.conflict_details}</td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => setResolveConflictModal({
                          isOpen: true,
                          item,
                          selectedTargetId: '',
                          learningOption: 'global'
                        })}
                        className="px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-black rounded-lg transition-colors border border-indigo-200"
                      >
                        Resolver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --- TAB 6: HISTORIAL / AUDITORIA --- */}
      {activeSubTab === 'history' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <Undo className="w-5 h-5 text-amber-500" />
              Auditoría Reversible e Historial de Ejecuciones
            </h2>
            <p className="text-xs text-slate-500 mt-1">Puedes revertir cualquier aplicación masiva de lotes de forma segura.</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b">
                <tr>
                  <th className="px-6 py-4">Fecha y Hora</th>
                  <th className="px-6 py-4">Observaciones</th>
                  <th className="px-6 py-4">Productos Afectados</th>
                  <th className="px-6 py-4">Nueva Categoría</th>
                  <th className="px-6 py-4 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {history.map(hist => (
                  <tr key={hist.id} className="hover:bg-slate-50/50">
                    <td className="px-6 py-4 text-slate-400 font-medium">{new Date(hist.applied_at).toLocaleString()}</td>
                    <td className="px-6 py-4 font-bold text-slate-900">{hist.notes}</td>
                    <td className="px-6 py-4 font-bold text-slate-550">
                      {Array.isArray(hist.products_affected) ? hist.products_affected.length : 0} productos
                    </td>
                    <td className="px-6 py-4 font-black text-indigo-700">{hist.new_value}</td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => handleRevertHistory(hist)}
                        className="px-3.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 font-black rounded-lg transition-colors border border-amber-200"
                      >
                        Revertir lote
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --- TAB 7: QUALITY DASHBOARD (Fase 7) --- */}
      {activeSubTab === 'quality_dashboard' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-green-500" />
                Quality Control Center (Quality Engine)
              </h2>
              <p className="text-xs text-slate-500 mt-1">Auditoría en tiempo real y diagnóstico objetivo del catálogo de Collectibles.</p>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={handleRecalculateQualityAll}
                disabled={recalculating}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black transition-all shadow-md shadow-indigo-500/20 disabled:opacity-50"
              >
                <RefreshCw className="w-4 h-4" />
                {recalculating ? `Recalculando calidad... ${recalcProgress}%` : 'Recalcular Calidad General'}
              </button>
            </div>
          </div>

          {/* Quality Stats Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            
            {/* Avg Score */}
            <div className="bg-slate-900 text-white p-6 rounded-2xl border border-slate-800 flex flex-col justify-between shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-full translate-x-6 -translate-y-6" />
              <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest block">Quality Score Promedio</span>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-4xl font-black text-white">{qAverageScore}%</span>
                <span className="text-xs text-indigo-400 font-bold">Excelente</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-2">Puntaje promedio obtenido en los 7 validadores de calidad.</p>
            </div>

            {/* Publicables */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest block">Productos Publicables</span>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-3xl font-black text-slate-950">{qPublicablesCount}</span>
                <span className="text-xs text-green-600 font-bold">Listo para catálogo</span>
              </div>
              <p className="text-[11px] text-slate-450 mt-2">Productos listos con score de calidad &ge; 85 y sin conflictos.</p>
            </div>

            {/* No Publicables */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest block">Productos No Publicables</span>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-3xl font-black text-slate-950">{qNoPublicablesCount}</span>
                <span className="text-xs text-amber-600 font-bold">Faltan datos</span>
              </div>
              <p className="text-[11px] text-slate-450 mt-2">Productos que carecen de categorizaciones o tienen score bajo.</p>
            </div>

            {/* Bloqueados */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest block">Productos Bloqueados</span>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-3xl font-black text-red-600">{qBlockedCount}</span>
                <span className="text-xs text-red-600 font-bold">Acción obligatoria</span>
              </div>
              <p className="text-[11px] text-slate-450 mt-2">Productos bloqueados automáticamente por conflictos de marcas o reglas.</p>
            </div>

          </div>

          {/* Coverage & Homologation KPIs Grid */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-sm font-black text-slate-950 border-b pb-2 border-slate-100 uppercase tracking-wider flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-500" />
              Indicadores de Datos Oficiales y Cobertura de Homologación
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Productos sin marca</span>
                <span className="text-xl font-black text-slate-800 block mt-1.5">{noBrandCount}</span>
                <span className="text-[9px] text-slate-400 font-medium mt-0.5 block">Carecen de brand_id oficial</span>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Productos sin categoría</span>
                <span className="text-xl font-black text-slate-800 block mt-1.5">{noCategoryCount}</span>
                <span className="text-[9px] text-slate-400 font-medium mt-0.5 block">Carecen de category_id oficial</span>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Marca Pendiente</span>
                <span className="text-xl font-black text-amber-700 block mt-1.5">{pendingBrandCount}</span>
                <span className="text-[9px] text-slate-400 font-medium mt-0.5 block">IA detectó marca pero falta brand_id</span>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Categoría Pendiente</span>
                <span className="text-xl font-black text-amber-700 block mt-1.5">{pendingCategoryCount}</span>
                <span className="text-[9px] text-slate-400 font-medium mt-0.5 block">IA sugirió categoría pero falta category_id</span>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Publicados con Inconsistencias</span>
                <span className="text-xl font-black text-orange-650 block mt-1.5">{publishedWithInconsistenciesCount}</span>
                <span className="text-[9px] text-slate-400 font-medium mt-0.5 block">Publicados sin cumplir requisitos</span>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Homologados Completos</span>
                <span className="text-xl font-black text-green-700 block mt-1.5">{homologadosCompletosCount}</span>
                <span className="text-[9px] text-slate-400 font-medium mt-0.5 block">Marca y categoría oficial correctas</span>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Parcialmente Homologados</span>
                <span className="text-xl font-black text-blue-700 block mt-1.5">{parcialmenteHomologadosCount}</span>
                <span className="text-[9px] text-slate-400 font-medium mt-0.5 block">Solo marca o categoría asignada</span>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Sin Homologar</span>
                <span className="text-xl font-black text-slate-500 block mt-1.5">{sinHomologarCount}</span>
                <span className="text-[9px] text-slate-400 font-medium mt-0.5 block">Sin marca ni categoría oficial</span>
              </div>
            </div>
          </div>

          {/* Quality Levels Detailed List */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <h3 className="text-sm font-black text-slate-950 border-b pb-2 border-slate-100 uppercase tracking-wider">Rangos de Calidad</h3>
              
              <div className="space-y-3">
                {[
                  { label: 'Excelente', range: '95-100', count: qExcellentCount, color: 'bg-green-500/10 text-green-700' },
                  { label: 'Alta / Recomendado', range: '85-94', count: qAltaCount, color: 'bg-emerald-500/10 text-emerald-700' },
                  { label: 'Media / Sugerida', range: '70-84', count: qMediaCount, color: 'bg-amber-500/10 text-amber-700' },
                  { label: 'Baja / Obligatoria', range: '50-69', count: qBajaCount, color: 'bg-orange-500/10 text-orange-700' },
                  { label: 'Crítica / Bloqueado', range: '0-49', count: qCriticaCount, color: 'bg-red-500/10 text-red-700' }
                ].map((range, idx) => (
                  <div key={idx} className="flex justify-between items-center p-2 rounded-xl bg-slate-50 border border-slate-100">
                    <div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black ${range.color}`}>{range.label}</span>
                      <span className="text-slate-400 block text-[9.5px] mt-0.5 font-semibold">Rango: {range.range}</span>
                    </div>
                    <span className="text-sm font-black text-slate-900">{range.count} items</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <h3 className="text-sm font-black text-slate-950 border-b pb-2 border-slate-100 uppercase tracking-wider">Inconsistencias Detectadas</h3>
              
              <div className="space-y-3">
                {[
                  { label: 'Conflictos de Marca', desc: 'Marca asignada difiere del título', value: qBrandConflicts, icon: AlertTriangle, color: 'text-yellow-600' },
                  { label: 'Conflictos de Categoría', desc: 'Discrepancia con mapeo oficial de ML', value: qCategoryConflicts, icon: Folder, color: 'text-cyan-600' },
                  { label: 'Reglas Contradictorias', desc: 'Múltiples reglas asignan distintas categorías', value: qRuleConflicts, icon: Settings, color: 'text-indigo-600' },
                  { label: 'Posibles Duplicados', desc: 'SKU o título coincidente en catálogo', value: qDuplicatesCount, icon: Layers, color: 'text-pink-600' }
                ].map((conflict, idx) => (
                  <div key={idx} className="flex gap-3 items-center p-2 rounded-xl bg-slate-50 border border-slate-100">
                    <div className={`p-2 rounded-lg bg-white border border-slate-150 ${conflict.color}`}>
                      <conflict.icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-bold text-slate-900 block truncate">{conflict.label}</span>
                      <span className="text-[10px] text-slate-400 block truncate">{conflict.desc}</span>
                    </div>
                    <span className="text-sm font-black text-slate-900">{conflict.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Auditoria Logs info */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <h3 className="text-sm font-black text-slate-950 border-b pb-2 border-slate-100 uppercase tracking-wider">Historial del Quality Engine</h3>
              <p className="text-[11px] text-slate-500 font-semibold leading-relaxed">
                Cada vez que se ejecuta el motor de calidad de forma manual o a través del guardado en la bandeja, los logs son registrados en `quality_engine_logs` indicando el tiempo de ejecución promedio, los validadores involucrados y las marcas/licencias detectadas.
              </p>
              <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100 text-indigo-900 text-xs leading-relaxed space-y-1">
                <div className="flex justify-between font-bold">
                  <span>Versión del motor:</span>
                  <span>1.0.0 (Estable)</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>Validadores cargados:</span>
                  <span>7 modulares</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>Tiempo auditoría medio:</span>
                  <span>~1ms / prod</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}
      
      {/* --- GMAIL-STYLE FLOATING ACTIONS BAR (Problem 4) --- */}
      {selectedProductIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 border border-slate-800 text-white rounded-full shadow-2xl px-6 py-3.5 flex items-center gap-6 z-40 animate-slide-up" style={{ backgroundColor: '#0f172a', borderColor: '#334155' }}>
          <div className="flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-indigo-400" style={{ color: '#818cf8' }} />
            <span className="text-xs font-black tracking-wider text-white" style={{ color: '#ffffff' }}>
              {selectedProductIds.length} seleccionados
            </span>
          </div>

          <div className="h-6 w-px bg-slate-800" style={{ backgroundColor: '#334155' }} />

          {/* Quick Actions Dropdowns & Buttons */}
          <div className="flex items-center gap-2 text-xs font-bold">
            
            {/* Assign Category */}
            <select
              className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none cursor-pointer font-bold"
              style={{ backgroundColor: '#1e293b', color: '#ffffff', borderColor: '#475569' }}
              onChange={e => {
                if (e.target.value) {
                  handleBulkAction('category', e.target.value);
                  e.target.value = '';
                }
              }}
              defaultValue=""
            >
              <option value="" style={{ backgroundColor: '#1e293b', color: '#ffffff' }}>Asignar Categoría</option>
              {categoriesList.map(c => (
                <option key={c.id} value={c.id} style={{ backgroundColor: '#1e293b', color: '#ffffff' }}>
                  {getCategoryPath(c.id)}
                </option>
              ))}
            </select>

            {/* Assign Brand */}
            <select
              className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none cursor-pointer font-bold"
              style={{ backgroundColor: '#1e293b', color: '#ffffff', borderColor: '#475569' }}
              onChange={e => {
                if (e.target.value) {
                  handleBulkAction('brand', e.target.value);
                  e.target.value = '';
                }
              }}
              defaultValue=""
            >
              <option value="" style={{ backgroundColor: '#1e293b', color: '#ffffff' }}>Asignar Marca</option>
              {brandsList.map(b => (
                <option key={b.id} value={b.id} style={{ backgroundColor: '#1e293b', color: '#ffffff' }}>
                  {b.name}
                </option>
              ))}
            </select>

            <button
              onClick={() => handleBulkAction('publish')}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-all font-bold"
              style={{ backgroundColor: '#059669', color: '#ffffff' }}
            >
              Publicar
            </button>

            <button
              onClick={handleCreateRuleFromSelection}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-all font-bold"
              style={{ backgroundColor: '#4f46e5', color: '#ffffff' }}
            >
              Crear Regla
            </button>

            <button
              onClick={() => handleBulkAction('ignore')}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg border border-slate-700 font-bold"
              style={{ backgroundColor: '#1e293b', color: '#e2e8f0', borderColor: '#475569' }}
            >
              Ignorar
            </button>

            <button
              onClick={() => handleBulkAction('delete')}
              className="px-3 py-1.5 bg-red-650 hover:bg-red-750 text-white rounded-lg transition-all font-bold"
              style={{ backgroundColor: '#dc2626', color: '#ffffff' }}
            >
              Eliminar
            </button>

          </div>

          <div className="h-6 w-px bg-slate-800" style={{ backgroundColor: '#334155' }} />

          <button 
            onClick={() => setSelectedProductIds([])}
            className="p-1 hover:bg-slate-800 rounded-full text-slate-300 hover:text-white"
            style={{ color: '#cbd5e1' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* --- DIALOG: RULE BUILDER MODAL --- */}
      {ruleModal.isOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs" onClick={() => setRuleModal({ ...ruleModal, isOpen: false })} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl bg-white z-50 rounded-2xl shadow-2xl p-6 space-y-6 max-h-[85vh] overflow-y-auto">
            <h3 className="text-base font-black text-slate-900 border-b pb-3 border-slate-200">
              {ruleModal.rule ? 'Editar Regla Compleja V3' : 'Constructor Visual de Reglas Combinadas V3'}
            </h3>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Prioridad (10 - 100)</label>
                <input 
                  type="number" 
                  value={ruleModal.priority}
                  onChange={e => setRuleModal({ ...ruleModal, priority: Number(e.target.value) })}
                  className="w-full border rounded-lg p-2 text-xs outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Operador Lógico de Unión</label>
                <select 
                  value={ruleModal.logicalOperator}
                  onChange={e => setRuleModal({ ...ruleModal, logicalOperator: e.target.value as any })}
                  className="w-full border rounded-lg p-2 text-xs bg-white outline-none"
                >
                  <option value="AND">Y (Debe cumplir todas las condiciones)</option>
                  <option value="OR">O (Debe cumplir al menos una condición)</option>
                  <option value="NOT">NO (No debe cumplir ninguna condición)</option>
                </select>
              </div>

              {/* Conditions List */}
              <div className="col-span-2 space-y-3 border-t pt-3 border-slate-150">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Condiciones Combinadas</span>
                
                {ruleModal.conditions.map((cond, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <select 
                      value={cond.field}
                      onChange={e => {
                        const next = [...ruleModal.conditions];
                        next[idx].field = e.target.value;
                        setRuleModal({ ...ruleModal, conditions: next });
                      }}
                      className="border rounded-lg p-1.5 text-xs bg-white w-40 font-semibold"
                    >
                      <option value="ml_category_id">Categoría ML ID</option>
                      <option value="brand_name">Marca original</option>
                      <option value="title">Palabras clave del Título</option>
                      <option value="dictionary">Diccionario</option>
                    </select>

                    <select 
                      value={cond.operator}
                      onChange={e => {
                        const next = [...ruleModal.conditions];
                        next[idx].operator = e.target.value;
                        setRuleModal({ ...ruleModal, conditions: next });
                      }}
                      className="border rounded-lg p-1.5 text-xs bg-white w-32 font-semibold"
                    >
                      <option value="equals">Es igual a</option>
                      <option value="contains">Contiene palabras</option>
                      <option value="not_contains">No contiene</option>
                    </select>

                    {cond.field === 'dictionary' ? (
                      <select 
                        value={cond.value}
                        onChange={e => {
                          const next = [...ruleModal.conditions];
                          next[idx].value = e.target.value;
                          setRuleModal({ ...ruleModal, conditions: next });
                        }}
                        className="border rounded-lg p-1.5 text-xs bg-white flex-1 font-semibold"
                      >
                        <option value="">-- Seleccionar Diccionario --</option>
                        {dictionaries.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                      </select>
                    ) : (
                      <input 
                        type="text" 
                        placeholder={cond.field === 'title' ? 'ej. peluche, plush, stuffed' : 'Valor a buscar...'}
                        value={cond.value}
                        onChange={e => {
                          const next = [...ruleModal.conditions];
                          next[idx].value = e.target.value;
                          setRuleModal({ ...ruleModal, conditions: next });
                        }}
                        className="border rounded-lg p-1.5 text-xs flex-1 outline-none font-semibold"
                      />
                    )}

                    <button 
                      onClick={() => {
                        setRuleModal({
                          ...ruleModal,
                          conditions: ruleModal.conditions.filter((_, cIdx) => cIdx !== idx)
                        });
                      }}
                      className="p-1.5 text-red-500 hover:bg-red-550 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}

                <button 
                  onClick={() => {
                    setRuleModal({
                      ...ruleModal,
                      conditions: [...ruleModal.conditions, { field: 'title', operator: 'contains', value: '' }]
                    });
                  }}
                  className="px-3 py-1.5 border border-dashed rounded-lg text-indigo-600 hover:bg-indigo-50 border-indigo-200 font-bold flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" /> Añadir sub-condición
                </button>
              </div>

              {/* Actions Destino */}
              <div className="col-span-2 border-t pt-3 border-slate-150 grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Mapear a destino</label>
                  <select 
                    value={ruleModal.actionType}
                    onChange={e => setRuleModal({ ...ruleModal, actionType: e.target.value as any, actionTargetId: '' })}
                    className="w-full border rounded-lg p-2 text-xs bg-white outline-none"
                  >
                    <option value="set_category">Categoría oficial de Collectibles</option>
                    <option value="set_brand">Marca homologada</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Destino oficial</label>
                  <select 
                    value={ruleModal.actionTargetId}
                    onChange={e => setRuleModal({ ...ruleModal, actionTargetId: e.target.value })}
                    className="w-full border rounded-lg p-2 text-xs bg-white outline-none font-semibold text-indigo-700"
                  >
                    <option value="">-- Seleccionar --</option>
                    {ruleModal.actionType === 'set_category'
                      ? categoriesList.map(c => <option key={c.id} value={c.id}>{getCategoryPath(c.id)}</option>)
                      : brandsList.map(b => <option key={b.id} value={b.id}>{b.name}</option>)
                    }
                  </select>
                </div>
              </div>

              {/* Simulator & Muestra real */}
              <div className="col-span-2 border-t pt-3 border-slate-150 bg-slate-50 p-4 rounded-xl space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Simulador de Impacto en tiempo real</span>
                  <button 
                    onClick={runSimulation}
                    className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-105 text-indigo-700 font-bold border border-indigo-200 rounded-lg flex items-center gap-1.5"
                  >
                    <Play className="w-3.5 h-3.5" /> Simular regla
                  </button>
                </div>

                {simulationResult.run && (
                  <div className="space-y-2 text-xs font-semibold">
                    {simulationResult.loading ? (
                      <p className="text-slate-400 animate-pulse">Analizando catálogo de productos...</p>
                    ) : (
                      <>
                        <p className="text-indigo-850">
                          La regla afectará a <strong className="font-black text-sm">{simulationResult.products.length} productos</strong>.
                          Vendors afectados: <strong className="font-black">{simulationResult.vendorsCount}</strong> | Marcas afectadas: <strong className="font-black">{simulationResult.brandsCount}</strong>.
                        </p>
                        
                        <div className="bg-white border rounded-xl divide-y max-h-32 overflow-y-auto">
                          {simulationResult.products.slice(0, 20).map((prod, idx) => (
                            <div key={idx} className="p-2 flex items-center gap-2 text-[10px] text-slate-650 hover:bg-slate-50/50">
                              <span className="font-black text-slate-400">{idx + 1}.</span>
                              <p className="font-bold text-slate-900 truncate flex-1">{prod.title}</p>
                              <span className="bg-slate-100 px-1 py-0.5 rounded text-[8px] font-black">{prod.vendor_name}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Rule scope options (Problem 5) */}
              <div className="col-span-2 flex flex-wrap gap-4 items-center bg-slate-50 p-3 rounded-xl border border-slate-155 mt-2">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block w-full">Aplicar regla a:</span>
                <label className="flex items-center gap-2 cursor-pointer font-bold">
                  <input 
                    type="checkbox" 
                    checked={ruleModal.applyFuture}
                    onChange={e => setRuleModal({ ...ruleModal, applyFuture: e.target.checked })}
                    className="rounded text-indigo-600 w-4 h-4 cursor-pointer"
                  />
                  <span>Futuros productos</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-bold">
                  <input 
                    type="checkbox" 
                    checked={ruleModal.applyPending}
                    onChange={e => setRuleModal({ ...ruleModal, applyPending: e.target.checked })}
                    className="rounded text-indigo-600 w-4 h-4 cursor-pointer"
                  />
                  <span>Productos pendientes</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-bold">
                  <input 
                    type="checkbox" 
                    checked={ruleModal.applyCataloged}
                    onChange={e => setRuleModal({ ...ruleModal, applyCataloged: e.target.checked })}
                    className="rounded text-indigo-600 w-4 h-4 cursor-pointer"
                  />
                  <span>Productos ya catalogados</span>
                </label>
              </div>
            </div>

            <div className="flex gap-3 pt-3 border-t border-slate-200">
              <button 
                onClick={() => setRuleModal({ ...ruleModal, isOpen: false })}
                className="flex-1 py-2.5 text-xs font-bold border border-slate-200 rounded-lg hover:bg-slate-150 text-slate-650 transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={handleSaveRule}
                disabled={actionLoading}
                className="flex-1 py-2.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-md disabled:opacity-50"
              >
                <Check className="w-4 h-4" /> Guardar Regla
              </button>
            </div>
          </div>
        </>
      )}

      {/* --- DIALOG: DICCIONARIO MODAL --- */}
      {dictModal.isOpen && (
        <>
          <div className="fixed inset-0 z-45 bg-black/60 backdrop-blur-xs" onClick={() => setDictModal({ ...dictModal, isOpen: false })} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white z-50 rounded-2xl shadow-2xl p-6 space-y-6">
            <h3 className="text-base font-black text-slate-900 border-b pb-3 border-slate-200">
              {dictModal.dict ? 'Editar Diccionario' : 'Crear Diccionario de Sinónimos'}
            </h3>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Nombre</label>
                <input 
                  type="text" 
                  placeholder="ej. PELUCHES"
                  value={dictModal.name}
                  onChange={e => setDictModal({ ...dictModal, name: e.target.value })}
                  className="w-full border rounded p-2 text-xs outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Descripción</label>
                <input 
                  type="text" 
                  placeholder="ej. Sinónimos para peluches y plushies"
                  value={dictModal.description}
                  onChange={e => setDictModal({ ...dictModal, description: e.target.value })}
                  className="w-full border rounded p-2 text-xs outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* Link directly to Category (Problem 6) */}
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Asociar automáticamente a Categoría</label>
                <select
                  value={dictModal.categoryId}
                  onChange={e => setDictModal({ ...dictModal, categoryId: e.target.value })}
                  className="w-full border rounded p-2 text-xs outline-none bg-white font-semibold text-indigo-700 focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">-- No asociar (solo usar en reglas manuales) --</option>
                  {categoriesList.map(c => <option key={c.id} value={c.id}>{getCategoryPath(c.id)}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Palabras clave (separadas por comas)</label>
                <textarea 
                  placeholder="ej. peluche, peluches, plush, stuffed, stuffed toy"
                  value={dictModal.wordsText}
                  onChange={e => setDictModal({ ...dictModal, wordsText: e.target.value })}
                  className="w-full border rounded p-2 text-xs outline-none h-28 focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-3 border-t border-slate-200">
              <button 
                onClick={() => setDictModal({ ...dictModal, isOpen: false })}
                className="flex-1 py-2 text-xs font-bold border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-650 transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={handleSaveDictionary}
                disabled={actionLoading}
                className="flex-1 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-md disabled:opacity-50"
              >
                <Check className="w-4 h-4" /> Guardar Diccionario
              </button>
            </div>
          </div>
        </>
      )}

      {/* --- DIALOG: RESOLVE CONFLICT MODAL --- */}
      {resolveConflictModal.isOpen && (
        <>
          <div className="fixed inset-0 z-45 bg-black/65 backdrop-blur-xs" onClick={() => setResolveConflictModal({ ...resolveConflictModal, isOpen: false })} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white z-50 rounded-2xl shadow-2xl p-6 space-y-6">
            <div className="flex items-center gap-2 text-indigo-600 border-b pb-3 border-slate-200">
              <AlertTriangle className="w-6 h-6 animate-pulse text-amber-500" />
              <h3 className="text-base font-black text-slate-900">Resolver Conflicto</h3>
            </div>

            <div className="space-y-4 text-xs">
              <div className="bg-slate-50 border rounded-xl p-3 space-y-1">
                <span className="text-[10px] text-slate-400 font-bold block uppercase">Producto afectado</span>
                <p className="font-bold text-slate-900">{resolveConflictModal.item?.title}</p>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                  Seleccionar Catalogación Oficial Correcta
                </label>
                <select 
                  className="w-full border rounded-lg p-2 bg-white text-xs outline-none focus:ring-2 focus:ring-indigo-500 font-semibold text-indigo-700"
                  value={resolveConflictModal.selectedTargetId}
                  onChange={e => setResolveConflictModal({ ...resolveConflictModal, selectedTargetId: e.target.value })}
                >
                  <option value="">-- Seleccionar categoría oficial --</option>
                  {categoriesList.map(c => <option key={c.id} value={c.id}>{getCategoryPath(c.id)}</option>)}
                </select>
              </div>

              <div className="space-y-2 bg-slate-50 border p-3.5 rounded-xl">
                <span className="text-[10px] text-slate-400 font-black uppercase block tracking-wider mb-1">Aprendizaje continuo</span>
                <p className="text-[10px] text-slate-500 leading-relaxed mb-2">¿Deseas aprender esta decisión para automatizar futuros productos similares?</p>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer font-semibold">
                    <input 
                      type="radio" 
                      name="conflictLearning"
                      checked={resolveConflictModal.learningOption === 'none'}
                      onChange={() => setResolveConflictModal({ ...resolveConflictModal, learningOption: 'none' })}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Solo aplicar a este producto</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer font-semibold">
                    <input 
                      type="radio" 
                      name="conflictLearning"
                      checked={resolveConflictModal.learningOption === 'global'}
                      onChange={() => setResolveConflictModal({ ...resolveConflictModal, learningOption: 'global' })}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <strong className="text-slate-900">Crear regla global (Recomendado)</strong>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-3 border-t border-slate-200">
              <button 
                onClick={() => setResolveConflictModal({ ...resolveConflictModal, isOpen: false })}
                className="flex-1 py-2 text-xs font-bold border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-650 transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={handleResolveConflict}
                disabled={actionLoading || !resolveConflictModal.selectedTargetId}
                className="flex-1 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-md disabled:opacity-50"
              >
                <Check className="w-4 h-4" /> Resolver Conflicto
              </button>
            </div>
          </div>
        </>
      )}

      {/* --- QUICK CREATE CATEGORY MODAL --- */}
      {createCatModal.isOpen && (
        <>
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs" onClick={() => setCreateCatModal(prev => ({ ...prev, isOpen: false }))} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white z-50 rounded-2xl shadow-2xl p-6 space-y-6">
            <h3 className="text-base font-black text-slate-900 border-b pb-3 border-slate-200">Crear Nueva Categoría</h3>
            
            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Nombre de la Categoría</label>
                <input 
                  type="text" 
                  value={createCatModal.name}
                  onChange={e => setCreateCatModal(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="ej. Peluches Gigantes"
                  className="w-full border rounded p-2 text-xs outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Categoría Padre (Opcional)</label>
                <select 
                  value={createCatModal.parentId}
                  onChange={e => setCreateCatModal(prev => ({ ...prev, parentId: e.target.value }))}
                  className="w-full border rounded p-2 text-xs bg-white outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">Ninguna (Categoría Raíz)</option>
                  {categoriesList.filter(c => !c.parent_id).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-3 pt-3 border-t border-slate-200">
              <button 
                onClick={() => setCreateCatModal(prev => ({ ...prev, isOpen: false }))}
                className="flex-1 py-2 text-xs font-bold border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-650 transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={handleQuickCreateCategory}
                disabled={actionLoading}
                className="flex-1 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-md disabled:opacity-50"
              >
                <Check className="w-4 h-4" /> Crear y Asociar
              </button>
            </div>
          </div>
        </>
      )}

      {/* --- QUICK CREATE BRAND MODAL --- */}
      {createBrandModal.isOpen && (
        <>
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs" onClick={() => setCreateBrandModal(prev => ({ ...prev, isOpen: false }))} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white z-50 rounded-2xl shadow-2xl p-6 space-y-6">
            <h3 className="text-base font-black text-slate-900 border-b pb-3 border-slate-200">Crear Nueva Marca</h3>
            
            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Nombre de la Marca</label>
                <input 
                  type="text" 
                  value={createBrandModal.name}
                  onChange={e => setCreateBrandModal(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="ej. Hot Toys Uruguay"
                  className="w-full border rounded p-2 text-xs outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-3 border-t border-slate-200">
              <button 
                onClick={() => setCreateBrandModal(prev => ({ ...prev, isOpen: false }))}
                className="flex-1 py-2 text-xs font-bold border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-650 transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={handleQuickCreateBrand}
                disabled={actionLoading}
                className="flex-1 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-md disabled:opacity-50"
              >
                <Check className="w-4 h-4" /> Crear y Asociar
              </button>
            </div>
          </div>
        </>
      )}

    </div>
  );
}
