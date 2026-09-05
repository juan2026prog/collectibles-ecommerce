import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  Search, Loader2, Import, XCircle, Eye, AlertCircle, RefreshCw, Wand2, ArrowRight, 
  ExternalLink, Code, Sparkles, Filter, SlidersHorizontal, Trash2, Plus, CheckCircle2,
  HelpCircle, BookmarkPlus, Tag, ShieldAlert, Check, ChevronRight, Pencil
} from 'lucide-react';
import { useToast } from '../../components/admin/Toast';
import { resolveInternationalCategory } from '../../../../supabase/functions/_shared/categoryResolver';
import { FALLBACK_IMAGE } from '../../lib/imageUtils';

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
  const [recalculating, setRecalculating] = useState(false);
  
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
  const [candidateCategoryFilter, setCandidateCategoryFilter] = useState<'all' | 'unmapped' | 'suggested'>('all');
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [activeRuleTab, setActiveRuleTab] = useState<'category' | 'brand' | 'keyword'>('category');
  const [dbCategories, setDbCategories] = useState<any[]>([]);

  // Resolution Inspector & Quick Rule Creation Modals
  const [candidateTraceModal, setCandidateTraceModal] = useState<{ candidate: any; traceResult: any } | null>(null);
  const [createRuleCandidate, setCreateRuleCandidate] = useState<{
    candidate: any;
    ruleType: 'category' | 'brand' | 'keyword_include' | 'keyword_exclude';
    keyword: string;
    brand_name: string;
    amazon_category_path: string;
    amazon_subcategory: string;
    collectibles_category_id: string;
    collectibles_subcategory_id: string;
    allow_standalone: boolean;
    blocks: 'brand_mapping' | 'all';
    priority: number;
  } | null>(null);

  // Rules state
  const [catRules, setCatRules] = useState<any[]>([]);
  const [brandRules, setBrandRules] = useState<any[]>([]);
  const [keywordRules, setKeywordRules] = useState<any[]>([]);
  const [loadingRules, setLoadingRules] = useState(false);
  const [rulesSummary, setRulesSummary] = useState<any>({
    category_rules_count: 0,
    brand_rules_count: 0,
    keyword_rules_count: 0,
    active_rules_count: 0,
    review_required_rules_count: 0,
    unmapped_candidates_count: 0
  });
  const [resolverStats, setResolverStats] = useState<any>({
    exact_path: 0,
    leaf: 0,
    brand: 0,
    keyword: 0,
    unmapped: 0
  });

  // Rules filtering & sorting
  const [ruleSearchQuery, setRuleSearchQuery] = useState('');
  const [ruleFilter, setRuleFilter] = useState<'all' | 'active' | 'inactive' | 'with_affected' | 'without_affected' | 'review'>('all');
  const [ruleSortBy, setRuleSortBy] = useState<'affected_desc' | 'confidence_desc' | 'priority_desc' | 'name_asc'>('affected_desc');
  const [editingRule, setEditingRule] = useState<{ type: 'category' | 'brand' | 'keyword'; data: any } | null>(null);

  // New rule form states
  const [newCatRule, setNewCatRule] = useState({ amazon_category: '', amazon_subcategory: '', amazon_category_path: '', collectibles_category_id: '', collectibles_subcategory_id: '', confidence_score: 90 });
  const [newBrandRule, setNewBrandRule] = useState({ brand_name: '', collectibles_category_id: '', collectibles_subcategory_id: '', confidence_score: 70, allow_standalone: true });
  const [newKeywordRule, setNewKeywordRule] = useState({
    keyword: '',
    target_category_id: '',
    target_subcategory_id: '',
    priority: 10,
    rule_type: 'include' as 'include' | 'exclude',
    applies_to: 'title' as 'title' | 'external_path' | 'brand' | 'all',
    blocks: 'brand_mapping' as 'brand_mapping' | 'all'
  });

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
      .limit(100);
    
    if (error) {
      addToast({ title: 'Error', message: error.message, type: 'error' });
    } else {
      setCandidates(data || []);
    }
    setLoading(false);
  }

  async function handleRecalculateSuggestions() {
    setRecalculating(true);
    try {
      const { data, error } = await supabase.rpc('recalculate_candidate_category_suggestions');
      if (error) throw error;
      addToast({
        title: 'Recálculo Completado',
        message: `Se actualizaron sugerencias de ${data} candidatos.`,
        type: 'success'
      });
      fetchCandidates();
      fetchRules();
    } catch (err: any) {
      addToast({ title: 'Error recalculando', message: err.message, type: 'error' });
    } finally {
      setRecalculating(false);
    }
  }

  async function fetchRules() {
    setLoadingRules(true);
    try {
      const [{ data: statsData, error: statsError }, { data: distData }] = await Promise.all([
        supabase.rpc('get_mapping_rules_stats'),
        supabase.from('international_import_candidates').select('category_mapping_source, mapping_confidence').eq('status', 'review')
      ]);

      if (statsError) throw statsError;

      if (statsData) {
        setCatRules(statsData.categories || []);
        setBrandRules(statsData.brands || []);
        setKeywordRules(statsData.keywords || []);
        if (statsData.summary) {
          setRulesSummary(statsData.summary);
        }
      }

      if (distData) {
        const stats = { exact_path: 0, leaf: 0, brand: 0, keyword: 0, unmapped: 0 };
        distData.forEach(item => {
          if (item.category_mapping_source === 'category_mapping') stats.exact_path++;
          else if (item.category_mapping_source === 'category_mapping_leaf') stats.leaf++;
          else if (item.category_mapping_source === 'brand_mapping') stats.brand++;
          else if (item.category_mapping_source === 'keyword_mapping') stats.keyword++;
          else stats.unmapped++;
        });
        setResolverStats(stats);
      }
    } catch (err: any) {
      addToast({ title: 'Error cargando reglas', message: err.message, type: 'error' });
    } finally {
      setLoadingRules(false);
    }
  }

  async function handleToggleRuleActive(type: 'category' | 'brand' | 'keyword', id: string, currentState: boolean) {
    const table = type === 'category' ? 'amazon_category_mapping' : type === 'brand' ? 'amazon_brand_mapping' : 'keyword_mapping_rules';
    try {
      const { error } = await supabase.from(table).update({ is_active: !currentState }).eq('id', id);
      if (error) throw error;
      addToast({ title: 'Estado actualizado', message: `Regla ${!currentState ? 'activada' : 'desactivada'}.`, type: 'success' });
      fetchRules();
    } catch (err: any) {
      addToast({ title: 'Error actualizando', message: err.message, type: 'error' });
    }
  }

  async function handleToggleBrandStandalone(id: string, currentState: boolean) {
    try {
      const { error } = await supabase.from('amazon_brand_mapping').update({ allow_standalone: !currentState }).eq('id', id);
      if (error) throw error;
      addToast({ title: 'Modo actualizado', message: `Modo marca: ${!currentState ? 'Standalone (Autónomo)' : 'Requiere Contexto'}.`, type: 'success' });
      fetchRules();
    } catch (err: any) {
      addToast({ title: 'Error actualizando', message: err.message, type: 'error' });
    }
  }

  async function handleSaveEditRule(e: React.FormEvent) {
    e.preventDefault();
    if (!editingRule) return;

    try {
      if (editingRule.type === 'category') {
        const { error } = await supabase.from('amazon_category_mapping').update({
          amazon_category_path: editingRule.data.amazon_category_path || null,
          amazon_subcategory: editingRule.data.amazon_subcategory || null,
          collectibles_category_id: editingRule.data.collectibles_category_id,
          collectibles_subcategory_id: editingRule.data.collectibles_subcategory_id || null,
          confidence_score: Number(editingRule.data.confidence_score || 90),
          is_active: editingRule.data.is_active
        }).eq('id', editingRule.data.id);
        if (error) throw error;
      } else if (editingRule.type === 'brand') {
        const { error } = await supabase.from('amazon_brand_mapping').update({
          brand_name: editingRule.data.brand_name.trim(),
          collectibles_category_id: editingRule.data.collectibles_category_id,
          collectibles_subcategory_id: editingRule.data.collectibles_subcategory_id || null,
          confidence_score: Number(editingRule.data.confidence_score || 70),
          allow_standalone: editingRule.data.allow_standalone,
          is_active: editingRule.data.is_active
        }).eq('id', editingRule.data.id);
        if (error) throw error;
      } else if (editingRule.type === 'keyword') {
        const { error } = await supabase.from('keyword_mapping_rules').update({
          keyword: editingRule.data.keyword.trim().toLowerCase(),
          target_category_id: editingRule.data.rule_type === 'exclude' ? null : (editingRule.data.target_category_id || null),
          target_subcategory_id: editingRule.data.rule_type === 'exclude' ? null : (editingRule.data.target_subcategory_id || null),
          priority: Number(editingRule.data.priority || 10),
          rule_type: editingRule.data.rule_type || 'include',
          applies_to: editingRule.data.applies_to || 'title',
          blocks: editingRule.data.blocks || 'brand_mapping',
          is_active: editingRule.data.is_active
        }).eq('id', editingRule.data.id);
        if (error) throw error;
      }

      addToast({ title: 'Regla guardada', message: 'Cambios guardados exitosamente.', type: 'success' });
      setEditingRule(null);
      fetchRules();
    } catch (err: any) {
      addToast({ title: 'Error guardando regla', message: err.message, type: 'error' });
    }
  }

  function handleInspectCandidateResolution(candidate: any) {
    const traceResult = resolveInternationalCategory({
      category_path: candidate.amazon_category_path,
      brand: candidate.brand,
      title: candidate.title,
      category_mappings: catRules,
      brand_mappings: brandRules,
      keyword_rules: keywordRules
    });
    setCandidateTraceModal({ candidate, traceResult });
  }

  async function handleAssignCandidateCategory(candidateId: string, categoryId: string, subcategoryId?: string) {
    try {
      const { error } = await supabase.from('international_import_candidates').update({
        suggested_category_id: categoryId,
        suggested_subcategory_id: subcategoryId || null,
        category_mapping_source: 'manual',
        mapping_confidence: 100,
        updated_at: new Date().toISOString()
      }).eq('id', candidateId);

      if (error) throw error;
      addToast({ title: 'Categoría asignada', message: 'Candidato actualizado manualmente (manual / 100).', type: 'success' });
      fetchCandidates();
    } catch (err: any) {
      addToast({ title: 'Error asignando', message: err.message, type: 'error' });
    }
  }

  function handleOpenCreateRuleFromCandidate(candidate: any) {
    setCreateRuleCandidate({
      candidate,
      ruleType: candidate.amazon_category_path ? 'category' : candidate.brand ? 'brand' : 'keyword_include',
      keyword: candidate.title ? candidate.title.split('-')[0].trim().toLowerCase() : '',
      brand_name: candidate.brand || '',
      amazon_category_path: candidate.amazon_category_path || '',
      amazon_subcategory: candidate.amazon_subcategory || '',
      collectibles_category_id: '',
      collectibles_subcategory_id: '',
      allow_standalone: true,
      blocks: 'brand_mapping',
      priority: 10
    });
  }

  async function handleSaveRuleFromCandidate(e: React.FormEvent) {
    e.preventDefault();
    if (!createRuleCandidate) return;

    try {
      if (createRuleCandidate.ruleType === 'category') {
        if (!createRuleCandidate.collectibles_category_id) {
          addToast({ title: 'Campo requerido', message: 'Selecciona una categoría interna.', type: 'error' });
          return;
        }
        const { error } = await supabase.from('amazon_category_mapping').insert({
          amazon_category_path: createRuleCandidate.amazon_category_path || null,
          amazon_subcategory: createRuleCandidate.amazon_subcategory || null,
          collectibles_category_id: createRuleCandidate.collectibles_category_id,
          collectibles_subcategory_id: createRuleCandidate.collectibles_subcategory_id || null,
          confidence_score: 90,
          is_active: true
        });
        if (error) throw error;
      } else if (createRuleCandidate.ruleType === 'brand') {
        if (!createRuleCandidate.brand_name || !createRuleCandidate.collectibles_category_id) {
          addToast({ title: 'Campos requeridos', message: 'Indica la marca y la categoría interna.', type: 'error' });
          return;
        }
        const { error } = await supabase.from('amazon_brand_mapping').insert({
          brand_name: createRuleCandidate.brand_name.trim(),
          collectibles_category_id: createRuleCandidate.collectibles_category_id,
          collectibles_subcategory_id: createRuleCandidate.collectibles_subcategory_id || null,
          confidence_score: 70,
          allow_standalone: createRuleCandidate.allow_standalone,
          is_active: true
        });
        if (error) throw error;
      } else if (createRuleCandidate.ruleType === 'keyword_include') {
        if (!createRuleCandidate.keyword || !createRuleCandidate.collectibles_category_id) {
          addToast({ title: 'Campos requeridos', message: 'Indica la palabra clave y la categoría.', type: 'error' });
          return;
        }
        const { error } = await supabase.from('keyword_mapping_rules').insert({
          keyword: createRuleCandidate.keyword.trim().toLowerCase(),
          target_category_id: createRuleCandidate.collectibles_category_id,
          target_subcategory_id: createRuleCandidate.collectibles_subcategory_id || null,
          priority: Number(createRuleCandidate.priority || 10),
          rule_type: 'include',
          applies_to: 'title',
          blocks: 'brand_mapping',
          is_active: true
        });
        if (error) throw error;
      } else if (createRuleCandidate.ruleType === 'keyword_exclude') {
        if (!createRuleCandidate.keyword) {
          addToast({ title: 'Campo requerido', message: 'Indica la palabra clave a excluir.', type: 'error' });
          return;
        }
        const { error } = await supabase.from('keyword_mapping_rules').insert({
          keyword: createRuleCandidate.keyword.trim().toLowerCase(),
          priority: 100,
          rule_type: 'exclude',
          applies_to: 'title',
          blocks: createRuleCandidate.blocks || 'brand_mapping',
          is_active: true
        });
        if (error) throw error;
      }

      addToast({ title: 'Regla creada', message: 'Nueva regla registrada con éxito.', type: 'success' });
      setCreateRuleCandidate(null);
      handleRecalculateSuggestions();
    } catch (err: any) {
      addToast({ title: 'Error creando regla', message: err.message, type: 'error' });
    }
  }

  async function handleAddCatRule(e: React.FormEvent) {
    e.preventDefault();
    if (!newCatRule.collectibles_category_id) {
      addToast({ title: 'Campo requerido', message: 'Selecciona una categoría interna de Collectibles.', type: 'error' });
      return;
    }
    try {
      const { error } = await supabase.from('amazon_category_mapping').insert({
        amazon_category: newCatRule.amazon_category || null,
        amazon_subcategory: newCatRule.amazon_subcategory || null,
        amazon_category_path: newCatRule.amazon_category_path || null,
        collectibles_category_id: newCatRule.collectibles_category_id,
        collectibles_subcategory_id: newCatRule.collectibles_subcategory_id || null,
        confidence_score: Number(newCatRule.confidence_score || 90),
        is_active: true
      });
      if (error) throw error;
      addToast({ title: 'Regla agregada', message: 'Regla de categoría guardada exitosamente.', type: 'success' });
      setNewCatRule({ amazon_category: '', amazon_subcategory: '', amazon_category_path: '', collectibles_category_id: '', collectibles_subcategory_id: '', confidence_score: 90 });
      fetchRules();
    } catch (err: any) {
      addToast({ title: 'Error', message: err.message, type: 'error' });
    }
  }

  async function handleDeleteCatRule(id: string) {
    if (!confirm('¿Estás seguro de eliminar esta regla de categoría de forma permanente?')) return;
    try {
      const { error } = await supabase.from('amazon_category_mapping').delete().eq('id', id);
      if (error) throw error;
      addToast({ title: 'Regla eliminada', message: 'Regla eliminada exitosamente.', type: 'info' });
      fetchRules();
    } catch (err: any) {
      addToast({ title: 'Error', message: err.message, type: 'error' });
    }
  }

  async function handleAddBrandRule(e: React.FormEvent) {
    e.preventDefault();
    if (!newBrandRule.brand_name || !newBrandRule.collectibles_category_id) {
      addToast({ title: 'Campos requeridos', message: 'Indica la marca y la categoría interna.', type: 'error' });
      return;
    }
    try {
      const { error } = await supabase.from('amazon_brand_mapping').insert({
        brand_name: newBrandRule.brand_name.trim(),
        collectibles_category_id: newBrandRule.collectibles_category_id,
        collectibles_subcategory_id: newBrandRule.collectibles_subcategory_id || null,
        confidence_score: Number(newBrandRule.confidence_score || 70),
        allow_standalone: newBrandRule.allow_standalone,
        is_active: true
      });
      if (error) throw error;
      addToast({ title: 'Regla agregada', message: 'Regla de marca guardada exitosamente.', type: 'success' });
      setNewBrandRule({ brand_name: '', collectibles_category_id: '', collectibles_subcategory_id: '', confidence_score: 70, allow_standalone: true });
      fetchRules();
    } catch (err: any) {
      addToast({ title: 'Error', message: err.message, type: 'error' });
    }
  }

  async function handleDeleteBrandRule(id: string) {
    if (!confirm('¿Estás seguro de eliminar esta regla de marca de forma permanente?')) return;
    try {
      const { error } = await supabase.from('amazon_brand_mapping').delete().eq('id', id);
      if (error) throw error;
      addToast({ title: 'Regla eliminada', message: 'Regla eliminada exitosamente.', type: 'info' });
      fetchRules();
    } catch (err: any) {
      addToast({ title: 'Error', message: err.message, type: 'error' });
    }
  }

  async function handleAddKeywordRule(e: React.FormEvent) {
    e.preventDefault();
    if (!newKeywordRule.keyword) {
      addToast({ title: 'Campo requerido', message: 'Indica la palabra clave.', type: 'error' });
      return;
    }
    if (newKeywordRule.rule_type === 'include' && !newKeywordRule.target_category_id) {
      addToast({ title: 'Campo requerido', message: 'Para reglas de inclusión, selecciona una categoría interna.', type: 'error' });
      return;
    }
    try {
      const { error } = await supabase.from('keyword_mapping_rules').insert({
        keyword: newKeywordRule.keyword.trim().toLowerCase(),
        target_category_id: newKeywordRule.rule_type === 'exclude' ? null : newKeywordRule.target_category_id,
        target_subcategory_id: newKeywordRule.rule_type === 'exclude' ? null : (newKeywordRule.target_subcategory_id || null),
        priority: Number(newKeywordRule.priority || (newKeywordRule.rule_type === 'exclude' ? 100 : 10)),
        rule_type: newKeywordRule.rule_type || 'include',
        applies_to: newKeywordRule.applies_to || 'title',
        blocks: newKeywordRule.blocks || 'brand_mapping',
        is_active: true
      });
      if (error) throw error;
      addToast({ title: 'Regla agregada', message: `Regla de ${newKeywordRule.rule_type === 'exclude' ? 'exclusión negativa' : 'inclusión'} guardada exitosamente.`, type: 'success' });
      setNewKeywordRule({
        keyword: '',
        target_category_id: '',
        target_subcategory_id: '',
        priority: 10,
        rule_type: 'include',
        applies_to: 'title',
        blocks: 'brand_mapping'
      });
      fetchRules();
    } catch (err: any) {
      addToast({ title: 'Error', message: err.message, type: 'error' });
    }
  }

  async function handleDeleteKeywordRule(id: string) {
    if (!confirm('¿Estás seguro de eliminar esta regla de palabra clave de forma permanente?')) return;
    try {
      const { error } = await supabase.from('keyword_mapping_rules').delete().eq('id', id);
      if (error) throw error;
      addToast({ title: 'Regla eliminada', message: 'Regla eliminada exitosamente.', type: 'info' });
      fetchRules();
    } catch (err: any) {
      addToast({ title: 'Error', message: err.message, type: 'error' });
    }
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

  const getCandidateImageUrl = (c: any) => {
    return c?.image_url || c?.main_image_url_external || c?.raw_data?.image || '';
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

    if (candidateCategoryFilter === 'unmapped') {
      if (c.suggested_category_id && c.category_mapping_source !== 'unmapped') return false;
    } else if (candidateCategoryFilter === 'suggested') {
      if (!c.suggested_category_id || c.category_mapping_source === 'unmapped') return false;
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

      {/* Banner Sourcing & Importación Multifuente V2 */}
      <div className="bg-gradient-to-r from-rose-950/90 via-dark-900 to-rose-950/90 p-4 rounded-xl border border-rose-500/40 flex items-center justify-between text-white shadow-lg">
        <div className="flex items-center gap-3">
          <Sparkles className="w-5 h-5 text-rose-400 shrink-0" />
          <div>
            <h3 className="text-sm font-bold text-white">NUEVA HERRAMIENTA DISPONIBLE: SOURCING & IMPORTACIÓN MULTIFUENTE V2</h3>
            <p className="text-xs text-gray-300">Selección multifuente (Amazon, Best Buy, eBay) · Deduplicación · Authenticity Gate · Costo puesto · Margen · Mercado Uruguay.</p>
          </div>
        </div>
        <a
          href="/admin/internacional/sourcing"
          className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg text-xs font-bold whitespace-nowrap shadow-sm transition-all"
        >
          Ir a Sourcing & Importación →
        </a>
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
        <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center flex-wrap gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="font-bold text-gray-800 flex items-center gap-2 text-base">
              Candidatos ({filteredCandidates.length})
              <button onClick={fetchCandidates} className="text-gray-500 hover:text-primary-600 ml-1" title="Refrescar">
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </h3>

            {/* Quick Mapping State Filter */}
            <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 shadow-sm text-xs font-semibold">
              <button
                type="button"
                onClick={() => setCandidateCategoryFilter('all')}
                className={`px-3 py-1 rounded-md transition-all ${
                  candidateCategoryFilter === 'all'
                    ? 'bg-gray-900 text-white shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Todos ({candidates.length})
              </button>
              <button
                type="button"
                onClick={() => setCandidateCategoryFilter('unmapped')}
                className={`px-3 py-1 rounded-md transition-all flex items-center gap-1 ${
                  candidateCategoryFilter === 'unmapped'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'text-rose-700 hover:bg-rose-50'
                }`}
              >
                <AlertCircle className="w-3.5 h-3.5" />
                Sin Mapping ({candidates.filter(c => !c.suggested_category_id || c.category_mapping_source === 'unmapped').length})
              </button>
              <button
                type="button"
                onClick={() => setCandidateCategoryFilter('suggested')}
                className={`px-3 py-1 rounded-md transition-all flex items-center gap-1 ${
                  candidateCategoryFilter === 'suggested'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-emerald-700 hover:bg-emerald-50'
                }`}
              >
                <Check className="w-3.5 h-3.5" />
                Con Sugerencia ({candidates.filter(c => c.suggested_category_id && c.category_mapping_source !== 'unmapped').length})
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button 
              onClick={() => { setShowRulesModal(true); fetchRules(); }}
              className="px-3 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-semibold rounded-lg hover:bg-indigo-100 inline-flex items-center shadow-sm"
              title="Administrar reglas automáticas de mapeo"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 mr-1.5" /> Reglas de Mapeo
            </button>
            <button 
              onClick={handleRecalculateSuggestions}
              disabled={recalculating}
              className="px-3 py-1.5 bg-sky-50 border border-sky-200 text-sky-700 text-xs font-semibold rounded-lg hover:bg-sky-100 disabled:opacity-50 inline-flex items-center shadow-sm"
              title="Re-evaluar sugerencias de categoría para candidatos pendientes"
            >
              <Sparkles className={`w-3.5 h-3.5 mr-1.5 ${recalculating ? 'animate-spin' : ''}`} />
              {recalculating ? 'Recalculando...' : 'Recalcular'}
            </button>
            <button 
              onClick={() => {
                const toSelect = filteredCandidates.filter(c => c.status === 'review' && c.price_usd != null).slice(0, 20).map(c => c.id);
                setSelectedIds(toSelect);
              }}
              className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-50 inline-flex items-center"
            >
              Top 20
            </button>
            <button 
              onClick={() => setShowImportModal(true)} 
              disabled={selectedIds.length === 0} 
              className="px-3 py-1.5 bg-green-600 text-white text-xs font-bold rounded-lg hover:bg-green-700 disabled:opacity-50 inline-flex items-center shadow-sm"
            >
              <Import className="w-3.5 h-3.5 mr-1.5" /> Importar ({selectedIds.length})
            </button>
            <button 
              onClick={handleReject} 
              disabled={selectedIds.length === 0} 
              className="px-3 py-1.5 bg-red-600 text-white text-xs font-bold rounded-lg hover:bg-red-700 disabled:opacity-50 inline-flex items-center shadow-sm"
            >
              <XCircle className="w-3.5 h-3.5 mr-1.5" /> Rechazar
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
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-48">Mapeo Collectibles</th>
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
                      {getCandidateImageUrl(c) ? (
                         <img 
                           src={getCandidateImageUrl(c)} 
                           alt="" 
                           className="max-w-full max-h-full object-contain" 
                           loading="lazy" 
                           referrerPolicy="no-referrer" 
                           onError={(e) => { 
                             const target = e.target as HTMLImageElement;
                             target.onerror = null;
                             target.src = FALLBACK_IMAGE;
                           }}
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
                    <div className="space-y-1.5">
                      {c.suggested_category_id ? (
                        <div>
                          <div className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 inline-flex items-center px-2 py-1 rounded border border-emerald-200">
                            {getCategoryName(c.suggested_category_id)}
                            {c.suggested_subcategory_id && <><ArrowRight className="w-3 h-3 inline mx-0.5" />{getCategoryName(c.suggested_subcategory_id)}</>}
                          </div>
                          <div className="flex items-center gap-1 mt-1 flex-wrap">
                            {c.category_mapping_source === 'manual' ? (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-indigo-100 text-indigo-800 border border-indigo-200">MANUAL (100%)</span>
                            ) : c.category_mapping_source === 'category_mapping' ? (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800">Path Exacto ({c.mapping_confidence || 90}%)</span>
                            ) : c.category_mapping_source === 'category_mapping_leaf' ? (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-teal-100 text-teal-800">Subcategoría ({c.mapping_confidence || 80}%)</span>
                            ) : c.category_mapping_source === 'brand_mapping' ? (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-800">Marca ({c.mapping_confidence || 70}%)</span>
                            ) : c.category_mapping_source === 'keyword_mapping' ? (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800">Keyword ({c.mapping_confidence || 50}%)</span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-100 text-purple-800">Sugerido ({c.mapping_confidence || 0}%)</span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 px-2 py-1 rounded-md inline-flex items-center font-bold">
                          Sin mapeo (0%)
                        </div>
                      )}

                      {/* Quick Inspection & Rule Creation Actions */}
                      <div className="flex items-center gap-1 pt-1 flex-wrap">
                        <button
                          type="button"
                          onClick={() => handleInspectCandidateResolution(c)}
                          className="px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 rounded border border-gray-200 inline-flex items-center gap-1 shadow-xs"
                          title="Inspeccionar paso a paso por qué se asignó o bloqueó esta categoría"
                        >
                          <HelpCircle className="w-3 h-3 text-indigo-600" /> Ver por qué
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenCreateRuleFromCandidate(c)}
                          className="px-1.5 py-0.5 text-[10px] font-medium bg-amber-50 hover:bg-amber-100 text-amber-800 rounded border border-amber-200 inline-flex items-center gap-1 shadow-xs"
                          title="Crear regla de path, marca o exclusión a partir de este producto"
                        >
                          <BookmarkPlus className="w-3 h-3 text-amber-600" /> Crear regla
                        </button>
                      </div>

                      {/* Quick Inline Manual Category Assignment */}
                      {c.status === 'review' && (
                        <div className="pt-0.5">
                          <select
                            className="w-full text-[10px] rounded border-gray-200 py-0.5 px-1 bg-white text-gray-700 focus:ring-primary-500"
                            value={c.category_mapping_source === 'manual' ? (c.suggested_category_id || '') : ''}
                            onChange={e => {
                              if (e.target.value) {
                                handleAssignCandidateCategory(c.id, e.target.value);
                              }
                            }}
                          >
                            <option value="">⚙️ Asignar Manual...</option>
                            {parentCategories.map(cat => (
                              <option key={cat.id} value={cat.id}>{cat.name}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
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

      {/* Rules Manager Modal */}
      {showRulesModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
              <div>
                <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2">
                  <SlidersHorizontal className="w-5 h-5 text-indigo-600" />
                  Mapeos de Catálogo Internacional (Taxonomía Collectibles)
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Gestiona reglas automáticas, audita candidatos afectados y configura modos seguros para marcas y palabras clave.
                </p>
              </div>
              <button onClick={() => setShowRulesModal(false)} className="text-gray-400 hover:text-gray-700 p-1">
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            {/* Summary Metrics Cards */}
            <div className="bg-slate-50 border-b border-gray-200 p-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-center">
                <div className="bg-white p-2.5 rounded-xl border border-gray-200 shadow-sm">
                  <div className="text-[11px] font-medium text-gray-500">Mapeos Categoría</div>
                  <div className="text-lg font-bold text-indigo-700 mt-0.5">{rulesSummary.category_rules_count || catRules.length}</div>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-gray-200 shadow-sm">
                  <div className="text-[11px] font-medium text-gray-500">Mapeos Marca</div>
                  <div className="text-lg font-bold text-blue-700 mt-0.5">{rulesSummary.brand_rules_count || brandRules.length}</div>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-gray-200 shadow-sm">
                  <div className="text-[11px] font-medium text-gray-500">Mapeos Keyword</div>
                  <div className="text-lg font-bold text-amber-700 mt-0.5">{rulesSummary.keyword_rules_count || keywordRules.length}</div>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-gray-200 shadow-sm">
                  <div className="text-[11px] font-medium text-gray-500">Reglas Activas</div>
                  <div className="text-lg font-bold text-emerald-700 mt-0.5">{rulesSummary.active_rules_count || 0}</div>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-gray-200 shadow-sm">
                  <div className="text-[11px] font-medium text-gray-500">Requieren Revisión</div>
                  <div className="text-lg font-bold text-orange-600 mt-0.5">{rulesSummary.review_required_rules_count || 0}</div>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-gray-200 shadow-sm">
                  <div className="text-[11px] font-medium text-gray-500">Candidatos Sin Mapping</div>
                  <div className="text-lg font-bold text-red-600 mt-0.5">{rulesSummary.unmapped_candidates_count || 0}</div>
                </div>
              </div>

              {/* Resolver Distribution Bar */}
              <div className="mt-3 bg-white p-3 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between flex-wrap gap-2 text-xs">
                <span className="font-bold text-gray-700 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  Resultado Actual del Resolver ({candidates.length} en cola):
                </span>
                <div className="flex items-center gap-3 flex-wrap font-medium">
                  <span className="bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded border border-emerald-200">
                    Exact Path (90%): <strong className="font-bold">{resolverStats.exact_path}</strong>
                  </span>
                  <span className="bg-teal-50 text-teal-800 px-2 py-0.5 rounded border border-teal-200">
                    Leaf (80%): <strong className="font-bold">{resolverStats.leaf}</strong>
                  </span>
                  <span className="bg-blue-50 text-blue-800 px-2 py-0.5 rounded border border-blue-200">
                    Brand (70%): <strong className="font-bold">{resolverStats.brand}</strong>
                  </span>
                  <span className="bg-amber-50 text-amber-800 px-2 py-0.5 rounded border border-amber-200">
                    Keyword (50%): <strong className="font-bold">{resolverStats.keyword}</strong>
                  </span>
                  <span className="bg-rose-50 text-rose-800 px-2 py-0.5 rounded border border-rose-200">
                    Unmapped (0%): <strong className="font-bold">{resolverStats.unmapped}</strong>
                  </span>
                </div>
              </div>
            </div>

            {/* Navigation Tabs & Search/Filters Bar */}
            <div className="flex border-b border-gray-200 bg-gray-50 px-4 pt-2 justify-between items-center flex-wrap gap-2">
              <div className="flex gap-2">
                <button
                  onClick={() => setActiveRuleTab('category')}
                  className={`px-4 py-2 text-xs font-bold rounded-t-lg border-b-2 transition-all ${
                    activeRuleTab === 'category'
                      ? 'border-indigo-600 text-indigo-600 bg-white shadow-sm'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Categorías ({catRules.length})
                </button>
                <button
                  onClick={() => setActiveRuleTab('brand')}
                  className={`px-4 py-2 text-xs font-bold rounded-t-lg border-b-2 transition-all ${
                    activeRuleTab === 'brand'
                      ? 'border-indigo-600 text-indigo-600 bg-white shadow-sm'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Marcas ({brandRules.length})
                </button>
                <button
                  onClick={() => setActiveRuleTab('keyword')}
                  className={`px-4 py-2 text-xs font-bold rounded-t-lg border-b-2 transition-all ${
                    activeRuleTab === 'keyword'
                      ? 'border-indigo-600 text-indigo-600 bg-white shadow-sm'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Palabras Clave ({keywordRules.length})
                </button>
              </div>

              {/* Search, Filter & Sort Controls */}
              <div className="flex items-center gap-2 pb-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Buscar regla o categoría..."
                    className="text-xs pl-8 pr-3 py-1.5 rounded-lg border-gray-300 w-44 md:w-56"
                    value={ruleSearchQuery}
                    onChange={e => setRuleSearchQuery(e.target.value)}
                  />
                </div>
                <select
                  className="text-xs py-1.5 px-2.5 rounded-lg border-gray-300 bg-white font-medium text-gray-700"
                  value={ruleFilter}
                  onChange={e => setRuleFilter(e.target.value as any)}
                >
                  <option value="all">Todos</option>
                  <option value="active">Solo Activos</option>
                  <option value="inactive">Solo Inactivos</option>
                  <option value="with_affected">Con Afectados</option>
                  <option value="without_affected">Sin Afectados</option>
                  <option value="review">Requieren Revisión</option>
                </select>
                <select
                  className="text-xs py-1.5 px-2.5 rounded-lg border-gray-300 bg-white font-medium text-gray-700"
                  value={ruleSortBy}
                  onChange={e => setRuleSortBy(e.target.value as any)}
                >
                  <option value="affected_desc">Afectados ↓</option>
                  <option value="confidence_desc">Confianza ↓</option>
                  <option value="priority_desc">Prioridad ↓</option>
                  <option value="name_asc">Nombre A-Z</option>
                </select>
              </div>
            </div>

            {/* Tab Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {loadingRules ? (
                <div className="py-16 text-center">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto text-indigo-600" />
                  <p className="text-sm text-gray-500 mt-2">Cargando reglas y métricas de afectación...</p>
                </div>
              ) : activeRuleTab === 'category' ? (
                <div className="space-y-6">
                  {/* Add category mapping form */}
                  <form onSubmit={handleAddCatRule} className="bg-indigo-50/50 border border-indigo-100 p-4 rounded-xl space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-900 flex items-center gap-1.5">
                      <Plus className="w-4 h-4" /> Agregar Nuevo Mapeo de Categoría
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-medium text-gray-700 mb-1">Path Completo Amazon (Opcional)</label>
                        <input
                          type="text"
                          placeholder="e.g. Toys & Games > Toy Figures > Action Figures"
                          className="w-full text-xs rounded-lg border-gray-300 p-2"
                          value={newCatRule.amazon_category_path}
                          onChange={e => setNewCatRule({ ...newCatRule, amazon_category_path: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-gray-700 mb-1">Subcategoría / Hoja Amazon</label>
                        <input
                          type="text"
                          placeholder="e.g. Action Figures"
                          className="w-full text-xs rounded-lg border-gray-300 p-2"
                          value={newCatRule.amazon_subcategory}
                          onChange={e => setNewCatRule({ ...newCatRule, amazon_subcategory: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-gray-700 mb-1">Categoría Collectibles *</label>
                        <select
                          className="w-full text-xs rounded-lg border-gray-300 p-2 bg-white"
                          value={newCatRule.collectibles_category_id}
                          onChange={e => setNewCatRule({ ...newCatRule, collectibles_category_id: e.target.value, collectibles_subcategory_id: '' })}
                          required
                        >
                          <option value="">-- Seleccionar Categoría --</option>
                          {parentCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-gray-700 mb-1">Subcategoría Collectibles</label>
                        <select
                          className="w-full text-xs rounded-lg border-gray-300 p-2 bg-white"
                          value={newCatRule.collectibles_subcategory_id}
                          onChange={e => setNewCatRule({ ...newCatRule, collectibles_subcategory_id: e.target.value })}
                          disabled={!newCatRule.collectibles_category_id}
                        >
                          <option value="">-- Ninguna / Opcional --</option>
                          {dbCategories.filter(c => c.parent_id === newCatRule.collectibles_category_id).map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-gray-700 mb-1">Puntaje Confianza (0-100)</label>
                        <input
                          type="number"
                          className="w-full text-xs rounded-lg border-gray-300 p-2"
                          value={newCatRule.confidence_score}
                          onChange={e => setNewCatRule({ ...newCatRule, confidence_score: Number(e.target.value) })}
                        />
                      </div>
                      <div className="flex items-end">
                        <button type="submit" className="w-full py-2 bg-indigo-600 text-white font-bold text-xs rounded-lg hover:bg-indigo-700 shadow-sm flex items-center justify-center gap-1.5">
                          <Plus className="w-4 h-4" /> Guardar Mapeo
                        </button>
                      </div>
                    </div>
                  </form>

                  {/* Category Mappings Table */}
                  <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                    <table className="min-w-full divide-y divide-gray-200 text-xs">
                      <thead className="bg-gray-50 text-gray-500 font-bold uppercase text-[10px]">
                        <tr>
                          <th className="px-3 py-2.5 text-left">Categoría Externa</th>
                          <th className="px-3 py-2.5 text-left">Categoría Collectibles</th>
                          <th className="px-3 py-2.5 text-left">Subcategoría</th>
                          <th className="px-3 py-2.5 text-center">Tipo Match</th>
                          <th className="px-3 py-2.5 text-center">Confianza</th>
                          <th className="px-3 py-2.5 text-center">Activa</th>
                          <th className="px-3 py-2.5 text-center">Afectados</th>
                          <th className="px-3 py-2.5 text-center">Riesgo</th>
                          <th className="px-3 py-2.5 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {catRules
                          .filter(r => {
                            if (ruleFilter === 'active') return r.is_active;
                            if (ruleFilter === 'inactive') return !r.is_active;
                            if (ruleFilter === 'with_affected') return (r.affected_candidates > 0 || r.affected_products > 0);
                            if (ruleFilter === 'without_affected') return (r.affected_candidates === 0 && r.affected_products === 0);
                            if (ruleFilter === 'review') return r.confidence_score < 90;
                            return true;
                          })
                          .filter(r => {
                            if (!ruleSearchQuery) return true;
                            const q = ruleSearchQuery.toLowerCase();
                            const path = (r.amazon_category_path || '').toLowerCase();
                            const sub = (r.amazon_subcategory || '').toLowerCase();
                            const catName = getCategoryName(r.collectibles_category_id).toLowerCase();
                            return path.includes(q) || sub.includes(q) || catName.includes(q);
                          })
                          .sort((a, b) => {
                            if (ruleSortBy === 'affected_desc') return (b.affected_candidates + b.affected_products) - (a.affected_candidates + a.affected_products);
                            if (ruleSortBy === 'confidence_desc') return (b.confidence_score || 0) - (a.confidence_score || 0);
                            return (a.amazon_category_path || a.amazon_subcategory || '').localeCompare(b.amazon_category_path || b.amazon_subcategory || '');
                          })
                          .map(r => (
                            <tr key={r.id} className={`hover:bg-indigo-50/20 transition-colors ${!r.is_active ? 'opacity-50 bg-gray-50' : ''}`}>
                              <td className="px-3 py-2.5">
                                {r.amazon_category_path ? (
                                  <div className="font-mono text-gray-800 text-[11px]" title={r.amazon_category_path}>
                                    {r.amazon_category_path}
                                  </div>
                                ) : (
                                  <div className="font-medium text-gray-700">{r.amazon_subcategory || r.amazon_category}</div>
                                )}
                              </td>
                              <td className="px-3 py-2.5 font-bold text-emerald-700">
                                {getCategoryName(r.collectibles_category_id)}
                              </td>
                              <td className="px-3 py-2.5 text-gray-500">
                                {r.collectibles_subcategory_id ? getCategoryName(r.collectibles_subcategory_id) : '—'}
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-700">
                                  {r.amazon_category_path ? 'Path exacto' : 'Leaf'}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                                  {r.confidence_score}%
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <button
                                  onClick={() => handleToggleRuleActive('category', r.id, r.is_active)}
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                                    r.is_active ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                                  }`}
                                  title="Click para alternar activo / inactivo"
                                >
                                  {r.is_active ? 'ACTIVO' : 'INACTIVO'}
                                </button>
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <div className="font-semibold text-gray-800">{r.affected_candidates || 0} cand.</div>
                                <div className="text-[10px] text-gray-400">{r.affected_products || 0} pub.</div>
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  BAJO
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    onClick={() => setEditingRule({ type: 'category', data: { ...r } })}
                                    className="p-1 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded"
                                    title="Editar regla"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteCatRule(r.id)}
                                    className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                                    title="Eliminar regla"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : activeRuleTab === 'brand' ? (
                <div className="space-y-6">
                  {/* Add brand mapping form */}
                  <form onSubmit={handleAddBrandRule} className="bg-blue-50/50 border border-blue-100 p-4 rounded-xl space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-blue-900 flex items-center gap-1.5">
                      <Plus className="w-4 h-4" /> Agregar Nuevo Mapeo de Marca
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-medium text-gray-700 mb-1">Nombre de Marca *</label>
                        <input
                          type="text"
                          placeholder="e.g. NECA, Funko, Bandai"
                          className="w-full text-xs rounded-lg border-gray-300 p-2"
                          value={newBrandRule.brand_name}
                          onChange={e => setNewBrandRule({ ...newBrandRule, brand_name: e.target.value })}
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-gray-700 mb-1">Categoría Collectibles *</label>
                        <select
                          className="w-full text-xs rounded-lg border-gray-300 p-2 bg-white"
                          value={newBrandRule.collectibles_category_id}
                          onChange={e => setNewBrandRule({ ...newBrandRule, collectibles_category_id: e.target.value, collectibles_subcategory_id: '' })}
                          required
                        >
                          <option value="">-- Seleccionar Categoría --</option>
                          {parentCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-gray-700 mb-1">Subcategoría Collectibles</label>
                        <select
                          className="w-full text-xs rounded-lg border-gray-300 p-2 bg-white"
                          value={newBrandRule.collectibles_subcategory_id}
                          onChange={e => setNewBrandRule({ ...newBrandRule, collectibles_subcategory_id: e.target.value })}
                          disabled={!newBrandRule.collectibles_category_id}
                        >
                          <option value="">-- Ninguna / Opcional --</option>
                          {dbCategories.filter(c => c.parent_id === newBrandRule.collectibles_category_id).map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-gray-700 mb-1">Modo de Funcionamiento</label>
                        <select
                          className="w-full text-xs rounded-lg border-gray-300 p-2 bg-white font-medium"
                          value={newBrandRule.allow_standalone ? 'standalone' : 'context'}
                          onChange={e => setNewBrandRule({ ...newBrandRule, allow_standalone: e.target.value === 'standalone' })}
                        >
                          <option value="standalone">Standalone (Autónomo)</option>
                          <option value="context">Requiere Contexto (Seguro)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-gray-700 mb-1">Puntaje Confianza (0-100)</label>
                        <input
                          type="number"
                          className="w-full text-xs rounded-lg border-gray-300 p-2"
                          value={newBrandRule.confidence_score}
                          onChange={e => setNewBrandRule({ ...newBrandRule, confidence_score: Number(e.target.value) })}
                        />
                      </div>
                      <div className="flex items-end">
                        <button type="submit" className="w-full py-2 bg-blue-600 text-white font-bold text-xs rounded-lg hover:bg-blue-700 shadow-sm flex items-center justify-center gap-1.5">
                          <Plus className="w-4 h-4" /> Guardar Mapeo de Marca
                        </button>
                      </div>
                    </div>
                  </form>

                  {/* Brand Mappings Table */}
                  <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                    <table className="min-w-full divide-y divide-gray-200 text-xs">
                      <thead className="bg-gray-50 text-gray-500 font-bold uppercase text-[10px]">
                        <tr>
                          <th className="px-3 py-2.5 text-left">Marca Externa</th>
                          <th className="px-3 py-2.5 text-left">Categoría Collectibles</th>
                          <th className="px-3 py-2.5 text-left">Subcategoría</th>
                          <th className="px-3 py-2.5 text-center">Modo</th>
                          <th className="px-3 py-2.5 text-center">Confianza</th>
                          <th className="px-3 py-2.5 text-center">Activa</th>
                          <th className="px-3 py-2.5 text-center">Afectados</th>
                          <th className="px-3 py-2.5 text-center">Riesgo</th>
                          <th className="px-3 py-2.5 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {brandRules
                          .filter(r => {
                            if (ruleFilter === 'active') return r.is_active;
                            if (ruleFilter === 'inactive') return !r.is_active;
                            if (ruleFilter === 'with_affected') return (r.affected_candidates > 0 || r.affected_products > 0);
                            if (ruleFilter === 'without_affected') return (r.affected_candidates === 0 && r.affected_products === 0);
                            if (ruleFilter === 'review') return !r.allow_standalone;
                            return true;
                          })
                          .filter(r => {
                            if (!ruleSearchQuery) return true;
                            const q = ruleSearchQuery.toLowerCase();
                            const name = (r.brand_name || '').toLowerCase();
                            const catName = getCategoryName(r.collectibles_category_id).toLowerCase();
                            return name.includes(q) || catName.includes(q);
                          })
                          .sort((a, b) => {
                            if (ruleSortBy === 'affected_desc') return (b.affected_candidates + b.affected_products) - (a.affected_candidates + a.affected_products);
                            if (ruleSortBy === 'confidence_desc') return (b.confidence_score || 0) - (a.confidence_score || 0);
                            return (a.brand_name || '').localeCompare(b.brand_name || '');
                          })
                          .map(r => (
                            <tr key={r.id} className={`hover:bg-blue-50/20 transition-colors ${!r.is_active ? 'opacity-50 bg-gray-50' : ''}`}>
                              <td className="px-3 py-2.5 font-bold text-gray-900">{r.brand_name}</td>
                              <td className="px-3 py-2.5 font-bold text-blue-700">
                                {getCategoryName(r.collectibles_category_id)}
                              </td>
                              <td className="px-3 py-2.5 text-gray-500">
                                {r.collectibles_subcategory_id ? getCategoryName(r.collectibles_subcategory_id) : '—'}
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <button
                                  onClick={() => handleToggleBrandStandalone(r.id, r.allow_standalone)}
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-all ${
                                    r.allow_standalone
                                      ? 'bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100'
                                      : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                                  }`}
                                  title="Click para alternar entre Standalone y Requiere Contexto"
                                >
                                  {r.allow_standalone ? 'Standalone' : 'Requiere Contexto'}
                                </button>
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold">
                                  {r.confidence_score}%
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <button
                                  onClick={() => handleToggleRuleActive('brand', r.id, r.is_active)}
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                                    r.is_active ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                                  }`}
                                  title="Click para alternar activo / inactivo"
                                >
                                  {r.is_active ? 'ACTIVO' : 'INACTIVO'}
                                </button>
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <div className="font-semibold text-gray-800">{r.affected_candidates || 0} cand.</div>
                                <div className="text-[10px] text-gray-400">{r.affected_products || 0} pub.</div>
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                {r.allow_standalone ? (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    BAJO
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                    REVISAR
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    onClick={() => setEditingRule({ type: 'brand', data: { ...r } })}
                                    className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded"
                                    title="Editar regla"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteBrandRule(r.id)}
                                    className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                                    title="Eliminar regla"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Add keyword rule form */}
                  <form onSubmit={handleAddKeywordRule} className="bg-amber-50/50 border border-amber-100 p-4 rounded-xl space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-amber-900 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Plus className="w-4 h-4" /> Agregar Nueva Regla por Palabra Clave
                      </span>
                      <span className="text-[10px] font-normal text-amber-700">
                        Soporta Reglas Positivas (Asignar) y Reglas Negativas (Exclusiones)
                      </span>
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-[11px] font-medium text-gray-700 mb-1">Tipo de Regla *</label>
                        <select
                          className="w-full text-xs rounded-lg border-gray-300 p-2 bg-white font-bold"
                          value={newKeywordRule.rule_type}
                          onChange={e => setNewKeywordRule({ ...newKeywordRule, rule_type: e.target.value as 'include' | 'exclude' })}
                        >
                          <option value="include">🟢 Inclusión (Asignar Categoría)</option>
                          <option value="exclude">🔴 Exclusión Negativa (Bloquear)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-gray-700 mb-1">Palabra Clave (en Título) *</label>
                        <input
                          type="text"
                          placeholder={newKeywordRule.rule_type === 'exclude' ? 'e.g. display stand, case' : 'e.g. action figure, plush'}
                          className="w-full text-xs rounded-lg border-gray-300 p-2"
                          value={newKeywordRule.keyword}
                          onChange={e => setNewKeywordRule({ ...newKeywordRule, keyword: e.target.value })}
                          required
                        />
                      </div>

                      {newKeywordRule.rule_type === 'include' ? (
                        <>
                          <div>
                            <label className="block text-[11px] font-medium text-gray-700 mb-1">Categoría Collectibles *</label>
                            <select
                              className="w-full text-xs rounded-lg border-gray-300 p-2 bg-white"
                              value={newKeywordRule.target_category_id}
                              onChange={e => setNewKeywordRule({ ...newKeywordRule, target_category_id: e.target.value, target_subcategory_id: '' })}
                              required={newKeywordRule.rule_type === 'include'}
                            >
                              <option value="">-- Seleccionar Categoría --</option>
                              {parentCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-gray-700 mb-1">Subcategoría (Opcional)</label>
                            <select
                              className="w-full text-xs rounded-lg border-gray-300 p-2 bg-white"
                              value={newKeywordRule.target_subcategory_id}
                              onChange={e => setNewKeywordRule({ ...newKeywordRule, target_subcategory_id: e.target.value })}
                              disabled={!newKeywordRule.target_category_id}
                            >
                              <option value="">-- Ninguna --</option>
                              {dbCategories.filter(c => c.parent_id === newKeywordRule.target_category_id).map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                          </div>
                        </>
                      ) : (
                        <>
                          <div>
                            <label className="block text-[11px] font-medium text-rose-800 mb-1 font-bold">Qué Bloquea *</label>
                            <select
                              className="w-full text-xs rounded-lg border-rose-200 p-2 bg-rose-50 font-semibold text-rose-900"
                              value={newKeywordRule.blocks}
                              onChange={e => setNewKeywordRule({ ...newKeywordRule, blocks: e.target.value as 'brand_mapping' | 'all' })}
                            >
                              <option value="brand_mapping">Bloquea Brand Mapping (Previene falsos positivos)</option>
                              <option value="all">Bloquea Todo (Fuerza a UNMAPPED)</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-gray-700 mb-1">Prioridad Exclusión</label>
                            <input
                              type="number"
                              className="w-full text-xs rounded-lg border-gray-300 p-2"
                              value={newKeywordRule.priority || 100}
                              onChange={e => setNewKeywordRule({ ...newKeywordRule, priority: Number(e.target.value) })}
                            />
                          </div>
                        </>
                      )}

                      <div className="md:col-span-4 flex justify-end">
                        <button type="submit" className={`px-6 py-2 text-white font-bold text-xs rounded-lg shadow-sm flex items-center gap-1.5 ${newKeywordRule.rule_type === 'exclude' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-amber-600 hover:bg-amber-700'}`}>
                          <Plus className="w-4 h-4" /> {newKeywordRule.rule_type === 'exclude' ? 'Guardar Regla de Exclusión' : 'Guardar Mapeo de Palabra Clave'}
                        </button>
                      </div>
                    </div>
                  </form>

                  {/* Keyword Mappings Table */}
                  <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                    <table className="min-w-full divide-y divide-gray-200 text-xs">
                      <thead className="bg-gray-50 text-gray-500 font-bold uppercase text-[10px]">
                        <tr>
                          <th className="px-3 py-2.5 text-left">Palabra Clave</th>
                          <th className="px-3 py-2.5 text-center">Tipo</th>
                          <th className="px-3 py-2.5 text-left">Comportamiento / Categoría</th>
                          <th className="px-3 py-2.5 text-left">Subcategoría</th>
                          <th className="px-3 py-2.5 text-center">Prioridad</th>
                          <th className="px-3 py-2.5 text-center">Activa</th>
                          <th className="px-3 py-2.5 text-center">Afectados</th>
                          <th className="px-3 py-2.5 text-center">Riesgo</th>
                          <th className="px-3 py-2.5 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {keywordRules
                          .filter(r => {
                            if (ruleFilter === 'active') return r.is_active;
                            if (ruleFilter === 'inactive') return !r.is_active;
                            if (ruleFilter === 'with_affected') return (r.affected_candidates > 0 || r.affected_products > 0);
                            if (ruleFilter === 'without_affected') return (r.affected_candidates === 0 && r.affected_products === 0);
                            if (ruleFilter === 'review') return r.rule_type === 'exclude' || r.priority < 10;
                            return true;
                          })
                          .filter(r => {
                            if (!ruleSearchQuery) return true;
                            const q = ruleSearchQuery.toLowerCase();
                            const kw = (r.keyword || '').toLowerCase();
                            const catName = getCategoryName(r.target_category_id).toLowerCase();
                            return kw.includes(q) || catName.includes(q);
                          })
                          .sort((a, b) => {
                            if (ruleSortBy === 'affected_desc') return (b.affected_candidates + b.affected_products) - (a.affected_candidates + a.affected_products);
                            if (ruleSortBy === 'priority_desc') return (b.priority || 0) - (a.priority || 0);
                            return (a.keyword || '').localeCompare(b.keyword || '');
                          })
                          .map(r => (
                            <tr key={r.id} className={`hover:bg-amber-50/20 transition-colors ${!r.is_active ? 'opacity-50 bg-gray-50' : ''}`}>
                              <td className="px-3 py-2.5 font-mono font-bold text-gray-900">
                                "{r.keyword}"
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                {r.rule_type === 'exclude' ? (
                                  <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-extrabold border border-rose-200">
                                    EXCLUDE
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold border border-emerald-200">
                                    INCLUDE
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2.5">
                                {r.rule_type === 'exclude' ? (
                                  <span className="text-[11px] font-semibold text-rose-700">
                                    ⛔ {r.blocks === 'all' ? 'Bloquea Todo (Forzar Unmapped)' : 'Bloquea Brand Mapping'}
                                  </span>
                                ) : (
                                  <span className="font-bold text-amber-700">
                                    {getCategoryName(r.target_category_id)}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-gray-500">
                                {r.rule_type === 'exclude' ? '—' : (r.target_subcategory_id ? getCategoryName(r.target_subcategory_id) : '—')}
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-800 text-[10px] font-bold">
                                  {r.priority || (r.rule_type === 'exclude' ? 100 : 10)}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <button
                                  onClick={() => handleToggleRuleActive('keyword', r.id, r.is_active)}
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                                    r.is_active ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                                  }`}
                                  title="Click para alternar activo / inactivo"
                                >
                                  {r.is_active ? 'ACTIVO' : 'INACTIVO'}
                                </button>
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <div className="font-semibold text-gray-800">{r.affected_candidates || 0} cand.</div>
                                <div className="text-[10px] text-gray-400">{r.affected_products || 0} pub.</div>
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                {r.rule_type === 'exclude' ? (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
                                    PROTECCIÓN
                                  </span>
                                ) : (r.priority || 10) >= 10 ? (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    BAJO
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                    REVISAR
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    onClick={() => setEditingRule({ type: 'keyword', data: { ...r } })}
                                    className="p-1 text-amber-600 hover:text-amber-800 hover:bg-amber-50 rounded"
                                    title="Editar regla"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteKeywordRule(r.id)}
                                    className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                                    title="Eliminar regla"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-between items-center flex-wrap gap-2">
              <button
                onClick={() => {
                  setShowRulesModal(false);
                  handleRecalculateSuggestions();
                }}
                className="px-4 py-2 bg-indigo-600 text-white font-bold text-xs rounded-lg hover:bg-indigo-700 shadow-sm flex items-center gap-1.5"
              >
                <Sparkles className="w-4 h-4" /> Aplicar y Recalcular Sugerencias
              </button>
              <button
                onClick={() => setShowRulesModal(false)}
                className="px-4 py-2 bg-gray-200 text-gray-700 font-medium text-xs rounded-lg hover:bg-gray-300"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Rule Sub-Modal */}
      {editingRule && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                <Pencil className="w-4 h-4 text-indigo-600" />
                Editar Regla de {editingRule.type === 'category' ? 'Categoría' : editingRule.type === 'brand' ? 'Marca' : 'Palabra Clave'}
              </h3>
              <button onClick={() => setEditingRule(null)} className="text-gray-400 hover:text-gray-700">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditRule} className="p-6 space-y-4 text-xs">
              {editingRule.type === 'category' && (
                <>
                  <div>
                    <label className="block font-medium text-gray-700 mb-1">Path Completo Amazon</label>
                    <input
                      type="text"
                      className="w-full rounded-lg border-gray-300 p-2 text-xs"
                      value={editingRule.data.amazon_category_path || ''}
                      onChange={e => setEditingRule({ ...editingRule, data: { ...editingRule.data, amazon_category_path: e.target.value } })}
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-gray-700 mb-1">Subcategoría Amazon (Leaf)</label>
                    <input
                      type="text"
                      className="w-full rounded-lg border-gray-300 p-2 text-xs"
                      value={editingRule.data.amazon_subcategory || ''}
                      onChange={e => setEditingRule({ ...editingRule, data: { ...editingRule.data, amazon_subcategory: e.target.value } })}
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-gray-700 mb-1">Categoría Collectibles *</label>
                    <select
                      className="w-full rounded-lg border-gray-300 p-2 bg-white text-xs"
                      value={editingRule.data.collectibles_category_id}
                      onChange={e => setEditingRule({ ...editingRule, data: { ...editingRule.data, collectibles_category_id: e.target.value, collectibles_subcategory_id: '' } })}
                      required
                    >
                      {parentCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-gray-700 mb-1">Subcategoría Collectibles</label>
                    <select
                      className="w-full rounded-lg border-gray-300 p-2 bg-white text-xs"
                      value={editingRule.data.collectibles_subcategory_id || ''}
                      onChange={e => setEditingRule({ ...editingRule, data: { ...editingRule.data, collectibles_subcategory_id: e.target.value } })}
                      disabled={!editingRule.data.collectibles_category_id}
                    >
                      <option value="">-- Ninguna / Opcional --</option>
                      {dbCategories.filter(c => c.parent_id === editingRule.data.collectibles_category_id).map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {editingRule.type === 'brand' && (
                <>
                  <div>
                    <label className="block font-medium text-gray-700 mb-1">Marca *</label>
                    <input
                      type="text"
                      className="w-full rounded-lg border-gray-300 p-2 text-xs"
                      value={editingRule.data.brand_name}
                      onChange={e => setEditingRule({ ...editingRule, data: { ...editingRule.data, brand_name: e.target.value } })}
                      required
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-gray-700 mb-1">Categoría Collectibles *</label>
                    <select
                      className="w-full rounded-lg border-gray-300 p-2 bg-white text-xs"
                      value={editingRule.data.collectibles_category_id}
                      onChange={e => setEditingRule({ ...editingRule, data: { ...editingRule.data, collectibles_category_id: e.target.value, collectibles_subcategory_id: '' } })}
                      required
                    >
                      {parentCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-gray-700 mb-1">Subcategoría Collectibles</label>
                    <select
                      className="w-full rounded-lg border-gray-300 p-2 bg-white text-xs"
                      value={editingRule.data.collectibles_subcategory_id || ''}
                      onChange={e => setEditingRule({ ...editingRule, data: { ...editingRule.data, collectibles_subcategory_id: e.target.value } })}
                      disabled={!editingRule.data.collectibles_category_id}
                    >
                      <option value="">-- Ninguna / Opcional --</option>
                      {dbCategories.filter(c => c.parent_id === editingRule.data.collectibles_category_id).map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-gray-700 mb-1">Modo de Funcionamiento</label>
                    <select
                      className="w-full rounded-lg border-gray-300 p-2 bg-white text-xs font-medium"
                      value={editingRule.data.allow_standalone ? 'standalone' : 'context'}
                      onChange={e => setEditingRule({ ...editingRule, data: { ...editingRule.data, allow_standalone: e.target.value === 'standalone' } })}
                    >
                      <option value="standalone">Standalone (Autónomo)</option>
                      <option value="context">Requiere Contexto (Seguro)</option>
                    </select>
                  </div>
                </>
              )}

              {editingRule.type === 'keyword' && (
                <>
                  <div>
                    <label className="block font-medium text-gray-700 mb-1">Tipo de Regla *</label>
                    <select
                      className="w-full rounded-lg border-gray-300 p-2 bg-white text-xs font-bold"
                      value={editingRule.data.rule_type || 'include'}
                      onChange={e => setEditingRule({ ...editingRule, data: { ...editingRule.data, rule_type: e.target.value } })}
                    >
                      <option value="include">🟢 Inclusión (Asignar Categoría)</option>
                      <option value="exclude">🔴 Exclusión Negativa (Bloquear)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-gray-700 mb-1">Palabra Clave (en Título) *</label>
                    <input
                      type="text"
                      className="w-full rounded-lg border-gray-300 p-2 text-xs"
                      value={editingRule.data.keyword}
                      onChange={e => setEditingRule({ ...editingRule, data: { ...editingRule.data, keyword: e.target.value } })}
                      required
                    />
                  </div>

                  {editingRule.data.rule_type === 'include' ? (
                    <>
                      <div>
                        <label className="block font-medium text-gray-700 mb-1">Categoría Collectibles *</label>
                        <select
                          className="w-full rounded-lg border-gray-300 p-2 bg-white text-xs"
                          value={editingRule.data.target_category_id || ''}
                          onChange={e => setEditingRule({ ...editingRule, data: { ...editingRule.data, target_category_id: e.target.value, target_subcategory_id: '' } })}
                          required
                        >
                          <option value="">-- Seleccionar Categoría --</option>
                          {parentCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block font-medium text-gray-700 mb-1">Subcategoría Collectibles</label>
                        <select
                          className="w-full rounded-lg border-gray-300 p-2 bg-white text-xs"
                          value={editingRule.data.target_subcategory_id || ''}
                          onChange={e => setEditingRule({ ...editingRule, data: { ...editingRule.data, target_subcategory_id: e.target.value } })}
                          disabled={!editingRule.data.target_category_id}
                        >
                          <option value="">-- Ninguna / Opcional --</option>
                          {dbCategories.filter(c => c.parent_id === editingRule.data.target_category_id).map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                    </>
                  ) : (
                    <div>
                      <label className="block font-medium text-rose-800 mb-1 font-bold">Qué Bloquea *</label>
                      <select
                        className="w-full rounded-lg border-rose-200 p-2 bg-rose-50 text-xs font-semibold text-rose-900"
                        value={editingRule.data.blocks || 'brand_mapping'}
                        onChange={e => setEditingRule({ ...editingRule, data: { ...editingRule.data, blocks: e.target.value } })}
                      >
                        <option value="brand_mapping">Bloquea Brand Mapping (Previene falsos positivos)</option>
                        <option value="all">Bloquea Todo (Fuerza a UNMAPPED)</option>
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block font-medium text-gray-700 mb-1">Prioridad (1-100)</label>
                    <input
                      type="number"
                      className="w-full rounded-lg border-gray-300 p-2 text-xs"
                      value={editingRule.data.priority || 10}
                      onChange={e => setEditingRule({ ...editingRule, data: { ...editingRule.data, priority: Number(e.target.value) } })}
                    />
                  </div>
                </>
              )}

              <div className="flex items-center gap-2 pt-2 border-t">
                <input
                  type="checkbox"
                  id="rule_is_active_checkbox"
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                  checked={editingRule.data.is_active}
                  onChange={e => setEditingRule({ ...editingRule, data: { ...editingRule.data, is_active: e.target.checked } })}
                />
                <label htmlFor="rule_is_active_checkbox" className="font-semibold text-gray-800">Regla Activa</label>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setEditingRule(null)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 shadow-sm"
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Candidate Resolution Trace Inspector Modal ("Ver por qué") */}
      {candidateTraceModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-indigo-600" />
                Inspección de Mapeo de Categoría ("Ver por qué")
              </h3>
              <button onClick={() => setCandidateTraceModal(null)} className="text-gray-400 hover:text-gray-700">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              {/* Product summary card */}
              <div className="bg-gray-50 border border-gray-200 p-3 rounded-xl space-y-1.5">
                <div className="font-bold text-gray-900 text-sm line-clamp-2">
                  {candidateTraceModal.candidate.title}
                </div>
                <div className="flex items-center gap-3 text-gray-600 flex-wrap">
                  <span><strong>Marca:</strong> {candidateTraceModal.candidate.brand || 'Sin Marca'}</span>
                  <span><strong>ASIN:</strong> {candidateTraceModal.candidate.external_product_id}</span>
                </div>
                {candidateTraceModal.candidate.amazon_category_path && (
                  <div className="text-[11px] text-gray-500 bg-white p-1.5 rounded border border-gray-200">
                    <strong>Path Amazon:</strong> {candidateTraceModal.candidate.amazon_category_path}
                  </div>
                )}
              </div>

              {/* Resolution Outcome Banner */}
              <div className={`p-4 rounded-xl border flex items-start gap-3 ${
                candidateTraceModal.traceResult.source === 'unmapped'
                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-900'
              }`}>
                {candidateTraceModal.traceResult.source === 'unmapped' ? (
                  <ShieldAlert className="w-6 h-6 text-rose-600 shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="font-extrabold text-sm flex items-center gap-2">
                    <span>Resultado:</span>
                    {candidateTraceModal.traceResult.source === 'unmapped' ? (
                      <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-xs uppercase font-extrabold">
                        UNMAPPED (0%)
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-extrabold">
                        {getCategoryName(candidateTraceModal.traceResult.category_id)} ({candidateTraceModal.traceResult.confidence}%)
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed opacity-90">
                    {candidateTraceModal.traceResult.reason}
                  </p>
                </div>
              </div>

              {/* Resolution Steps Trace */}
              <div className="space-y-2">
                <h4 className="font-bold text-gray-800 uppercase tracking-wide text-[10px]">
                  Cascada de Decisión Evaluada
                </h4>
                <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 bg-white overflow-hidden shadow-xs">
                  {candidateTraceModal.traceResult.trace?.map((step: any, index: number) => (
                    <div key={index} className={`p-3 flex items-start justify-between gap-3 text-xs ${
                      step.matched
                        ? step.step.includes('Negative')
                          ? 'bg-rose-50/70 text-rose-950 font-semibold'
                          : 'bg-emerald-50/70 text-emerald-950 font-semibold'
                        : 'text-gray-500'
                    }`}>
                      <div className="space-y-0.5">
                        <div className="font-bold flex items-center gap-1.5">
                          {step.step}
                          {step.matched && (
                            <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                              step.step.includes('Negative') ? 'bg-rose-200 text-rose-800' : 'bg-emerald-200 text-emerald-800'
                            }`}>
                              {step.step.includes('Negative') ? 'BLOQUEÓ' : 'COINCIDIÓ'}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] opacity-80">{step.detail}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        {step.matched ? (
                          <span className={`font-bold ${step.step.includes('Negative') ? 'text-rose-600' : 'text-emerald-600'}`}>
                            {step.step.includes('Negative') ? '⛔ Actuó' : '✅ Asignó'}
                          </span>
                        ) : (
                          <span className="text-gray-400">Pasa</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-between items-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    const c = candidateTraceModal.candidate;
                    setCandidateTraceModal(null);
                    handleOpenCreateRuleFromCandidate(c);
                  }}
                  className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold rounded-lg border border-amber-200 flex items-center gap-1.5 shadow-xs"
                >
                  <BookmarkPlus className="w-4 h-4 text-amber-600" /> Crear regla a partir de este caso
                </button>
                <button
                  type="button"
                  onClick={() => setCandidateTraceModal(null)}
                  className="px-4 py-2 bg-gray-900 text-white font-bold rounded-lg hover:bg-gray-800"
                >
                  Entendido
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Rule From Candidate Modal */}
      {createRuleCandidate && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                <BookmarkPlus className="w-5 h-5 text-amber-600" />
                Crear Regla desde Candidato
              </h3>
              <button onClick={() => setCreateRuleCandidate(null)} className="text-gray-400 hover:text-gray-700">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRuleFromCandidate} className="p-6 space-y-4 text-xs">
              <div className="bg-gray-50 border border-gray-200 p-2.5 rounded-lg text-gray-700 line-clamp-2">
                <strong>Producto:</strong> {createRuleCandidate.candidate.title}
              </div>

              <div>
                <label className="block font-bold text-gray-800 mb-1.5 uppercase text-[10px] tracking-wide">
                  Seleccionar Tipo de Regla a Crear
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCreateRuleCandidate({ ...createRuleCandidate, ruleType: 'category' })}
                    className={`p-2.5 rounded-xl border text-left font-bold transition-all ${
                      createRuleCandidate.ruleType === 'category'
                        ? 'bg-emerald-50 border-emerald-400 text-emerald-900 ring-2 ring-emerald-500'
                        : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    1. Path Exacto (90%)
                    <div className="text-[10px] font-normal text-gray-500 mt-0.5">Por categoría Amazon</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCreateRuleCandidate({ ...createRuleCandidate, ruleType: 'brand' })}
                    className={`p-2.5 rounded-xl border text-left font-bold transition-all ${
                      createRuleCandidate.ruleType === 'brand'
                        ? 'bg-blue-50 border-blue-400 text-blue-900 ring-2 ring-blue-500'
                        : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    2. Marca (70%)
                    <div className="text-[10px] font-normal text-gray-500 mt-0.5">Standalone o contextual</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCreateRuleCandidate({ ...createRuleCandidate, ruleType: 'keyword_include' })}
                    className={`p-2.5 rounded-xl border text-left font-bold transition-all ${
                      createRuleCandidate.ruleType === 'keyword_include'
                        ? 'bg-amber-50 border-amber-400 text-amber-900 ring-2 ring-amber-500'
                        : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    3. Keyword Inclusión (50%)
                    <div className="text-[10px] font-normal text-gray-500 mt-0.5">Término en título</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCreateRuleCandidate({ ...createRuleCandidate, ruleType: 'keyword_exclude' })}
                    className={`p-2.5 rounded-xl border text-left font-bold transition-all ${
                      createRuleCandidate.ruleType === 'keyword_exclude'
                        ? 'bg-rose-50 border-rose-400 text-rose-900 ring-2 ring-rose-500'
                        : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    4. Exclusión Negativa
                    <div className="text-[10px] font-normal text-gray-500 mt-0.5">Bloquea falsos positivos</div>
                  </button>
                </div>
              </div>

              {/* Dynamic Form fields based on selected ruleType */}
              {createRuleCandidate.ruleType === 'category' && (
                <div className="space-y-3 bg-emerald-50/40 border border-emerald-200 p-3 rounded-xl">
                  <div>
                    <label className="block font-medium text-gray-700 mb-1">Path Amazon *</label>
                    <input
                      type="text"
                      className="w-full rounded-lg border-gray-300 p-2 text-xs"
                      value={createRuleCandidate.amazon_category_path}
                      onChange={e => setCreateRuleCandidate({ ...createRuleCandidate, amazon_category_path: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-gray-700 mb-1">Categoría Collectibles *</label>
                    <select
                      className="w-full rounded-lg border-gray-300 p-2 bg-white text-xs"
                      value={createRuleCandidate.collectibles_category_id}
                      onChange={e => setCreateRuleCandidate({ ...createRuleCandidate, collectibles_category_id: e.target.value, collectibles_subcategory_id: '' })}
                      required
                    >
                      <option value="">-- Seleccionar Categoría --</option>
                      {parentCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {createRuleCandidate.ruleType === 'brand' && (
                <div className="space-y-3 bg-blue-50/40 border border-blue-200 p-3 rounded-xl">
                  <div>
                    <label className="block font-medium text-gray-700 mb-1">Marca *</label>
                    <input
                      type="text"
                      className="w-full rounded-lg border-gray-300 p-2 text-xs"
                      value={createRuleCandidate.brand_name}
                      onChange={e => setCreateRuleCandidate({ ...createRuleCandidate, brand_name: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-gray-700 mb-1">Categoría Collectibles *</label>
                    <select
                      className="w-full rounded-lg border-gray-300 p-2 bg-white text-xs"
                      value={createRuleCandidate.collectibles_category_id}
                      onChange={e => setCreateRuleCandidate({ ...createRuleCandidate, collectibles_category_id: e.target.value, collectibles_subcategory_id: '' })}
                      required
                    >
                      <option value="">-- Seleccionar Categoría --</option>
                      {parentCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="brand_standalone_create"
                      className="rounded text-blue-600 focus:ring-blue-500"
                      checked={createRuleCandidate.allow_standalone}
                      onChange={e => setCreateRuleCandidate({ ...createRuleCandidate, allow_standalone: e.target.checked })}
                    />
                    <label htmlFor="brand_standalone_create" className="font-semibold text-gray-800">
                      Permitir Standalone (Autónomo sin contexto de título/path)
                    </label>
                  </div>
                </div>
              )}

              {createRuleCandidate.ruleType === 'keyword_include' && (
                <div className="space-y-3 bg-amber-50/40 border border-amber-200 p-3 rounded-xl">
                  <div>
                    <label className="block font-medium text-gray-700 mb-1">Palabra Clave en Título *</label>
                    <input
                      type="text"
                      className="w-full rounded-lg border-gray-300 p-2 text-xs"
                      value={createRuleCandidate.keyword}
                      onChange={e => setCreateRuleCandidate({ ...createRuleCandidate, keyword: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-gray-700 mb-1">Categoría Collectibles *</label>
                    <select
                      className="w-full rounded-lg border-gray-300 p-2 bg-white text-xs"
                      value={createRuleCandidate.collectibles_category_id}
                      onChange={e => setCreateRuleCandidate({ ...createRuleCandidate, collectibles_category_id: e.target.value, collectibles_subcategory_id: '' })}
                      required
                    >
                      <option value="">-- Seleccionar Categoría --</option>
                      {parentCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {createRuleCandidate.ruleType === 'keyword_exclude' && (
                <div className="space-y-3 bg-rose-50/40 border border-rose-200 p-3 rounded-xl">
                  <div>
                    <label className="block font-medium text-rose-900 mb-1">Término de Exclusión (en Título) *</label>
                    <input
                      type="text"
                      className="w-full rounded-lg border-rose-300 p-2 text-xs"
                      value={createRuleCandidate.keyword}
                      onChange={e => setCreateRuleCandidate({ ...createRuleCandidate, keyword: e.target.value })}
                      placeholder="e.g. display stand, protective case"
                      required
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-rose-900 mb-1">Qué Bloquea *</label>
                    <select
                      className="w-full rounded-lg border-rose-200 p-2 bg-rose-50 text-xs font-semibold text-rose-900"
                      value={createRuleCandidate.blocks}
                      onChange={e => setCreateRuleCandidate({ ...createRuleCandidate, blocks: e.target.value as 'brand_mapping' | 'all' })}
                    >
                      <option value="brand_mapping">Bloquea Brand Mapping (Previene falsos positivos de marca)</option>
                      <option value="all">Bloquea Todo (Fuerza producto a UNMAPPED)</option>
                    </select>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setCreateRuleCandidate(null)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-600 text-white font-bold rounded-lg hover:bg-amber-700 shadow-sm"
                >
                  Crear y Aplicar Regla
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
