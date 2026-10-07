import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  Search, Loader2, Import, XCircle, Eye, AlertCircle, RefreshCw, Wand2, ArrowRight, 
  ExternalLink, Code, Sparkles, Filter, SlidersHorizontal, Trash2, Plus, CheckCircle2,
  HelpCircle, BookmarkPlus, Tag, ShieldAlert, Check, ChevronRight, Pencil, ChevronDown, ChevronUp,
  CheckSquare, ArrowDown, PackageCheck
} from 'lucide-react';
import { useToast } from '../../components/admin/Toast';
import { resolveInternationalCategory } from '../../../../supabase/functions/_shared/categoryResolver';
import { FALLBACK_IMAGE } from '../../lib/imageUtils';
import { sanitizeBrand } from '../../lib/brandUtils';
import { ImportWorkbench, type ImportCandidateItem } from '../../components/admin/sourcing/ImportWorkbench';

const QUICK_SEARCHES = [
  { name: 'Marvel', query: 'marvel' },
  { name: 'Star Wars', query: 'star wars' },
  { name: 'Pokémon', query: 'pokemon' },
  { name: 'Funko', query: 'funko pop', brand: 'Funko' },
  { name: 'NECA', query: 'neca action figures', brand: 'NECA' },
  { name: 'DC', query: 'dc comics' },
  { name: 'Anime', query: 'anime figures' },
];

const QUICK_COLLECTIONS = [
  { name: 'Top Marvel', query: 'marvel', category: 'Action Figures' },
  { name: 'Top DC', query: 'dc comics', category: 'Action Figures' },
  { name: 'Top Star Wars', query: 'star wars black series' },
  { name: 'Top Pokémon', query: 'pokemon figures' },
  { name: 'Top Anime', query: 'anime figures bandai' },
  { name: 'Top Horror', query: 'horror action figures neca' },
  { name: 'Top Gaming', query: 'video game action figures' },
  { name: 'Top Funko', query: 'funko pop', brand: 'Funko' },
  { name: 'Top NECA', query: 'neca action figures', brand: 'NECA' },
];

const SUGGESTED_BRANDS = [
  'Funko', 'NECA', 'Hasbro', 'Bandai', 'LEGO', 'McFarlane Toys', 'Iron Studios', 'Good Smile Company', 'Super7', 'Mattel', 'Jazwares', 'Kotobukiya', 'Mezco'
];

export default function AdminInternationalAmazon() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  
  // Selection and flow state from workbench
  const [selectedCount, setSelectedCount] = useState(0);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [isImportingInProgress, setIsImportingInProgress] = useState(false);

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

  // Server-side pagination & Multi-country selection
  const [candidatePage, setCandidatePage] = useState(1);
  const [candidatePageSize, setCandidatePageSize] = useState(50);
  const [totalCandidates, setTotalCandidates] = useState(0);
  const [selectedCountry, setSelectedCountry] = useState<'ALL' | 'UY' | 'AR' | 'CL' | 'PE' | 'MX'>('ALL');

  useEffect(() => {
    fetchCandidates(candidatePage, candidatePageSize);
    fetchCategories();
  }, [candidatePage, candidatePageSize]);

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

  async function fetchCandidates(page: number = candidatePage, pageSize: number = candidatePageSize) {
    setLoading(true);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await supabase
      .from('international_import_candidates')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);
    
    if (error) {
      addToast({ title: 'Error', message: error.message, type: 'error' });
    } else {
      setCandidates(data || []);
      if (count !== null) setTotalCandidates(count);
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

      addToast({ title: 'Búsqueda completada', message: 'Se obtuvieron los resultados de Amazon.', type: 'success' });
      fetchCandidates();
    } catch (err: any) {
      console.error(err);
      addToast({ title: 'Error buscando', message: err.message || 'No se pudo consultar Amazon/Zinc', type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  function handleQuickSearchTag(tag: { query: string; brand?: string }) {
    const newParams = { ...searchParams, query: tag.query, brand: tag.brand || '' };
    setSearchParams(newParams);
    handleSearch(undefined, newParams);
  }

  function handleQuickCollection(col: any) {
    const newParams = { ...searchParams, query: col.query, brand: col.brand || '', category: col.category || '' };
    setSearchParams(newParams);
    handleSearch(undefined, newParams);
  }

  const getCategoryName = (id: string) => {
    const cat = dbCategories.find(c => c.id === id);
    return cat ? cat.name : 'Desconocida';
  };

  const parentCategories = dbCategories.filter(c => !c.parent_id);

  const extractedBrands = useMemo(() => {
    const s = new Set<string>();
    candidates.forEach(c => {
      const b = sanitizeBrand(c.brand);
      if (b) s.add(b);
    });
    return Array.from(s).sort();
  }, [candidates]);

  const mappedWorkbenchItems: ImportCandidateItem[] = useMemo(() => {
    return candidates.map(c => ({
      id: c.id,
      external_product_id: c.external_product_id,
      title: c.title,
      brand: sanitizeBrand(c.brand) || 'Sin Marca',
      franchise: c.franchise || c.raw_data?.franchise || '',
      category: c.category || c.amazon_category,
      amazon_category: c.amazon_category,
      amazon_subcategory: c.amazon_subcategory,
      amazon_category_path: c.amazon_category_path,
      image_url: c.image_url || c.main_image_url_external || c.raw_data?.image || '',
      gallery_images: c.raw_data?.images || c.gallery_images || [],
      product_url_external: c.product_url_external || `https://www.amazon.com/dp/${c.external_product_id}`,
      price_usd: Number(c.price_usd || 0),
      rating: c.rating,
      review_count: c.review_count || 0,
      availability: c.availability || 'available',
      prime: c.amazon_delivery_type === 'prime' || c.prime,
      seller: c.seller || (c.raw_data?.first_party_seller === true ? 'Amazon.com' : 'Terceros'),
      source: 'amazon',
      data_origin: 'LIVE',
      sourcing_score: c.mapping_confidence || 80,
      ranking_score: c.mapping_confidence || 80,
      opportunity_score: c.mapping_confidence || 80,
      status: c.status,
      raw_data: c.raw_data
    }));
  }, [candidates]);

  // Current Step for the 4-step horizontal indicator
  const currentStep = useMemo(() => {
    if (isImportingInProgress) return 4;
    if (isReviewModalOpen) return 3;
    if (selectedCount > 0) return 2;
    return 1;
  }, [isImportingInProgress, isReviewModalOpen, selectedCount]);

  return (
    <div className="space-y-6 pb-20">
      {/* 1. ENCABEZADO */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">
            Curación de Catálogo · Amazon/Zinc
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            Descubrí productos, analizá su rentabilidad y decidí qué incorporar al catálogo.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Selector de Mercado Objetivo Multipaís */}
          <div className="flex items-center gap-1.5 bg-white border border-gray-200 px-3 py-1.5 rounded-xl shadow-xs text-xs">
            <span className="text-gray-500 font-semibold">Mercado:</span>
            <select
              value={selectedCountry}
              onChange={(e) => setSelectedCountry(e.target.value as any)}
              className="bg-transparent border-0 text-xs font-bold text-gray-900 focus:ring-0 p-0 pr-6 cursor-pointer"
            >
              <option value="ALL">🌎 Todos / Global</option>
              <option value="UY">🇺🇾 Uruguay (UY)</option>
              <option value="AR">🇦🇷 Argentina (AR)</option>
              <option value="CL">🇨🇱 Chile (CL)</option>
              <option value="PE">🇵🇪 Perú (PE)</option>
              <option value="MX">🇲🇽 México (MX)</option>
            </select>
          </div>

          <button
            onClick={() => {
              setShowRulesModal(true);
              fetchRules();
            }}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50 shadow-xs transition"
          >
            <SlidersHorizontal className="w-4 h-4 text-gray-500" />
            <span>Reglas de Mapeo</span>
          </button>
        </div>
      </div>

      {/* 2. INDICADOR DE FLUJO (1 Buscar → 2 Seleccionar → 3 Revisar → 4 Importar) */}
      <div className="bg-white border border-gray-200 rounded-2xl p-3 shadow-xs">
        <div className="grid grid-cols-4 gap-2 text-center text-xs">
          {/* Step 1: Buscar */}
          <div className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl transition ${
            currentStep === 1 
              ? 'bg-gray-900 text-white font-bold shadow-xs' 
              : currentStep > 1 
              ? 'text-emerald-700 bg-emerald-50 font-semibold' 
              : 'text-gray-400 font-medium'
          }`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
              currentStep === 1 
                ? 'bg-white text-gray-900 font-bold' 
                : currentStep > 1 
                ? 'bg-emerald-600 text-white font-bold' 
                : 'bg-gray-200 text-gray-600'
            }`}>
              {currentStep > 1 ? '✓' : '1'}
            </span>
            <span>1. Buscar</span>
          </div>

          {/* Step 2: Seleccionar */}
          <div className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl transition ${
            currentStep === 2 
              ? 'bg-gray-900 text-white font-bold shadow-xs' 
              : currentStep > 2 
              ? 'text-emerald-700 bg-emerald-50 font-semibold' 
              : 'text-gray-400 font-medium'
          }`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
              currentStep === 2 
                ? 'bg-white text-gray-900 font-bold' 
                : currentStep > 2 
                ? 'bg-emerald-600 text-white font-bold' 
                : 'bg-gray-200 text-gray-600'
            }`}>
              {currentStep > 2 ? '✓' : '2'}
            </span>
            <span>2. Seleccionar {selectedCount > 0 && `(${selectedCount})`}</span>
          </div>

          {/* Step 3: Revisar */}
          <div className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl transition ${
            currentStep === 3 
              ? 'bg-gray-900 text-white font-bold shadow-xs' 
              : currentStep > 3 
              ? 'text-emerald-700 bg-emerald-50 font-semibold' 
              : 'text-gray-400 font-medium'
          }`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
              currentStep === 3 
                ? 'bg-white text-gray-900 font-bold' 
                : currentStep > 3 
                ? 'bg-emerald-600 text-white font-bold' 
                : 'bg-gray-200 text-gray-600'
            }`}>
              {currentStep > 3 ? '✓' : '3'}
            </span>
            <span>3. Revisar</span>
          </div>

          {/* Step 4: Importar */}
          <div className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl transition ${
            currentStep === 4 
              ? 'bg-[#f00856] text-white font-bold shadow-xs' 
              : 'text-gray-400 font-medium'
          }`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
              currentStep === 4 
                ? 'bg-white text-[#f00856] font-bold' 
                : 'bg-gray-200 text-gray-600'
            }`}>
              4
            </span>
            <span>4. Importar</span>
          </div>
        </div>
      </div>

      {/* 3. BUSCADOR PRINCIPAL (CARD PRINCIPAL LIMPIA) */}
      <div className="bg-white p-6 rounded-2xl shadow-xs border border-gray-200 space-y-4">
        <div>
          <h3 className="text-base font-bold text-gray-900">Buscar productos en Amazon</h3>
          <p className="text-xs text-gray-500 mt-0.5">Ingresá términos de búsqueda, colecciones o códigos ASIN para consultar en vivo.</p>
        </div>

        <form onSubmit={(e) => handleSearch(e)} className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                <Search className="w-5 h-5" />
              </div>
              <input
                type="text"
                required
                value={searchParams.query}
                onChange={e => setSearchParams({ ...searchParams, query: e.target.value })}
                placeholder="Producto, personaje, colección, marca o ASIN"
                className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-900 focus:bg-white focus:border-gray-900 focus:ring-0 transition"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-gray-900 hover:bg-gray-800 text-white font-bold text-sm rounded-xl transition shadow-xs disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              <span>{loading ? 'Buscando...' : 'Buscar en Amazon'}</span>
            </button>
          </div>

          {/* Accesos rápidos debajo del input */}
          <div className="flex items-center gap-2 flex-wrap text-xs pt-1">
            <span className="text-gray-400 font-semibold text-[11px]">Accesos rápidos:</span>
            {QUICK_SEARCHES.map(item => (
              <button
                key={item.name}
                type="button"
                onClick={() => handleQuickSearchTag(item)}
                className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition"
              >
                {item.name}
              </button>
            ))}

            {/* Toggle Filtros Avanzados */}
            <button
              type="button"
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className="ml-auto flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-gray-900"
            >
              <span>{showAdvancedFilters ? 'Ocultar filtros avanzados' : 'Filtros avanzados'}</span>
              {showAdvancedFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>

          {/* 4. FILTROS AVANZADOS COLAPSABLES */}
          {showAdvancedFilters && (
            <div className="pt-4 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-12 gap-3 text-xs animate-in fade-in">
              <div className="md:col-span-3">
                <label className="block text-[11px] font-medium text-gray-600 mb-1">Marca</label>
                <input
                  list="suggested-brands"
                  type="text"
                  placeholder="Ej: Funko, NECA"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs"
                  value={searchParams.brand}
                  onChange={e => setSearchParams({ ...searchParams, brand: e.target.value })}
                />
                <datalist id="suggested-brands">
                  {SUGGESTED_BRANDS.map(b => <option key={b} value={b} />)}
                </datalist>
              </div>

              <div className="md:col-span-3">
                <label className="block text-[11px] font-medium text-gray-600 mb-1">Categoría Amazon</label>
                <select
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs"
                  value={searchParams.category}
                  onChange={e => setSearchParams({ ...searchParams, category: e.target.value })}
                >
                  <option value="">Todas las categorías</option>
                  <option value="Action Figures">Action Figures</option>
                  <option value="Statues">Statues & Busts</option>
                  <option value="Trading Cards">Trading Cards</option>
                  <option value="Clothing">Clothing</option>
                </select>
              </div>

              <div className="md:col-span-3">
                <label className="block text-[11px] font-medium text-gray-600 mb-1">Ordenar por</label>
                <select
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs"
                  value={searchParams.sort_by}
                  onChange={e => setSearchParams({ ...searchParams, sort_by: e.target.value })}
                >
                  <option value="">Relevancia</option>
                  <option value="price_asc">Menor Precio</option>
                  <option value="price_desc">Mayor Precio</option>
                  <option value="reviews">Más Reviews</option>
                  <option value="newest">Más Recientes</option>
                </select>
              </div>

              <div className="md:col-span-3">
                <label className="block text-[11px] font-medium text-gray-600 mb-1">Disponibilidad</label>
                <select
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs"
                  value={searchParams.availability}
                  onChange={e => setSearchParams({ ...searchParams, availability: e.target.value })}
                >
                  <option value="">Cualquiera</option>
                  <option value="in_stock">In Stock</option>
                  <option value="preorder">Preorder</option>
                </select>
              </div>

              <div className="md:col-span-3">
                <label className="block text-[11px] font-medium text-gray-600 mb-1">Precio Mín (USD)</label>
                <input
                  type="number"
                  step="0.01"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs"
                  value={searchParams.min_price}
                  onChange={e => setSearchParams({ ...searchParams, min_price: e.target.value })}
                />
              </div>

              <div className="md:col-span-3">
                <label className="block text-[11px] font-medium text-gray-600 mb-1">Precio Máx (USD)</label>
                <input
                  type="number"
                  step="0.01"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs"
                  value={searchParams.max_price}
                  onChange={e => setSearchParams({ ...searchParams, max_price: e.target.value })}
                />
              </div>

              <div className="md:col-span-3">
                <label className="block text-[11px] font-medium text-gray-600 mb-1">Rating Mínimo</label>
                <input
                  type="number"
                  step="0.1"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs"
                  value={searchParams.min_rating}
                  onChange={e => setSearchParams({ ...searchParams, min_rating: e.target.value })}
                />
              </div>

              <div className="md:col-span-3">
                <label className="block text-[11px] font-medium text-gray-600 mb-1">Reviews Mínimas</label>
                <input
                  type="number"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs"
                  value={searchParams.min_reviews}
                  onChange={e => setSearchParams({ ...searchParams, min_reviews: e.target.value })}
                />
              </div>

              <div className="md:col-span-12 flex flex-wrap items-center gap-4 pt-2">
                <label className="flex items-center space-x-2 text-xs text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    className="rounded text-[#f00856] focus:ring-[#f00856]"
                    checked={searchParams.onlyRecognizedBrands}
                    onChange={e => setSearchParams({ ...searchParams, onlyRecognizedBrands: e.target.checked })}
                  />
                  <span>Solo Marcas Reconocidas</span>
                </label>

                <label className="flex items-center space-x-2 text-xs text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    className="rounded text-[#f00856] focus:ring-[#f00856]"
                    checked={searchParams.includeGenerics}
                    onChange={e => setSearchParams({ ...searchParams, includeGenerics: e.target.checked })}
                  />
                  <span>Incluir Genéricos / Sin Marca</span>
                </label>
              </div>

              {extractedBrands.length > 0 && (
                <div className="md:col-span-12 pt-2">
                  <div className="text-[10px] font-bold text-gray-500 uppercase mb-1.5">Marcas encontradas en los resultados:</div>
                  <div className="flex flex-wrap gap-1.5">
                    {extractedBrands.map(b => (
                      <label key={b} className="flex items-center space-x-1 text-xs bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-md hover:bg-gray-100 cursor-pointer">
                        <input 
                          type="checkbox" 
                          className="rounded text-[#f00856]" 
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
          )}
        </form>
      </div>

      {/* 5. COLECCIONES RÁPIDAS (ELEMENTO VISUALMENTE SECUNDARIO DEBAJO DEL BUSCADOR) */}
      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Colecciones Rápidas</span>
          <span className="text-[11px] text-gray-400">· Exploración directa</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_COLLECTIONS.map((c, i) => (
            <button
              key={i}
              onClick={() => handleQuickCollection(c)}
              className="px-3 py-1 bg-gray-50 text-gray-700 hover:bg-gray-100 hover:text-gray-900 rounded-lg text-xs font-medium transition border border-gray-200"
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {/* 6. MESA DE IMPORTACIÓN (CORAZÓN DE LA PANTALLA) */}
      <ImportWorkbench
        initialItems={mappedWorkbenchItems}
        searchQuery={searchParams.query}
        onRefresh={fetchCandidates}
        isLoading={loading}
        onImportSuccess={fetchCandidates}
        onSelectionChange={setSelectedCount}
        onReviewModalToggle={setIsReviewModalOpen}
        onImportingStateChange={setIsImportingInProgress}
        targetCountry={selectedCountry === 'ALL' ? 'UY' : selectedCountry}
      />

      {/* 7. MODAL DE REGLAS DE MAPEO */}
      {showRulesModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
            {/* Modal Header */}
            <div className="p-5 border-b border-gray-200 flex justify-between items-center bg-gray-50">
              <div>
                <h3 className="font-bold text-gray-900 text-base flex items-center gap-2">
                  <SlidersHorizontal className="w-5 h-5 text-indigo-600" />
                  Mapeos de Catálogo Internacional (Taxonomía Collectibles)
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Gestioná reglas automáticas, audita candidatos afectados y configurá modos seguros para marcas y palabras clave.
                </p>
              </div>
              <button onClick={() => setShowRulesModal(false)} className="text-gray-400 hover:text-gray-700 p-1">
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            {/* Summary Metrics Cards */}
            <div className="bg-slate-50 border-b border-gray-200 p-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-center">
                <div className="bg-white p-2.5 rounded-xl border border-gray-200 shadow-2xs">
                  <div className="text-[11px] font-medium text-gray-500">Mapeos Categoría</div>
                  <div className="text-lg font-bold text-indigo-700 mt-0.5">{rulesSummary.category_rules_count || catRules.length}</div>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-gray-200 shadow-2xs">
                  <div className="text-[11px] font-medium text-gray-500">Mapeos Marca</div>
                  <div className="text-lg font-bold text-blue-700 mt-0.5">{rulesSummary.brand_rules_count || brandRules.length}</div>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-gray-200 shadow-2xs">
                  <div className="text-[11px] font-medium text-gray-500">Mapeos Keyword</div>
                  <div className="text-lg font-bold text-amber-700 mt-0.5">{rulesSummary.keyword_rules_count || keywordRules.length}</div>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-gray-200 shadow-2xs">
                  <div className="text-[11px] font-medium text-gray-500">Reglas Activas</div>
                  <div className="text-lg font-bold text-emerald-700 mt-0.5">{rulesSummary.active_rules_count || 0}</div>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-gray-200 shadow-2xs">
                  <div className="text-[11px] font-medium text-gray-500">Requieren Revisión</div>
                  <div className="text-lg font-bold text-orange-600 mt-0.5">{rulesSummary.review_required_rules_count || 0}</div>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-gray-200 shadow-2xs">
                  <div className="text-[11px] font-medium text-gray-500">Candidatos Sin Mapping</div>
                  <div className="text-lg font-bold text-red-600 mt-0.5">{rulesSummary.unmapped_candidates_count || 0}</div>
                </div>
              </div>

              {/* Resolver Distribution Bar */}
              <div className="mt-3 bg-white p-3 rounded-xl border border-gray-200 shadow-2xs flex items-center justify-between flex-wrap gap-2 text-xs">
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
                      ? 'border-indigo-600 text-indigo-600 bg-white shadow-2xs'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Categorías ({catRules.length})
                </button>
                <button
                  onClick={() => setActiveRuleTab('brand')}
                  className={`px-4 py-2 text-xs font-bold rounded-t-lg border-b-2 transition-all ${
                    activeRuleTab === 'brand'
                      ? 'border-indigo-600 text-indigo-600 bg-white shadow-2xs'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Marcas ({brandRules.length})
                </button>
                <button
                  onClick={() => setActiveRuleTab('keyword')}
                  className={`px-4 py-2 text-xs font-bold rounded-t-lg border-b-2 transition-all ${
                    activeRuleTab === 'keyword'
                      ? 'border-indigo-600 text-indigo-600 bg-white shadow-2xs'
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
                    placeholder="Buscar regla..."
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
                        <button type="submit" className="w-full py-2 bg-indigo-600 text-white font-bold text-xs rounded-lg hover:bg-indigo-700 shadow-xs flex items-center justify-center gap-1.5">
                          <Plus className="w-4 h-4" /> Guardar Mapeo
                        </button>
                      </div>
                    </div>
                  </form>

                  {/* Category Mappings Table */}
                  <div className="border border-gray-200 rounded-xl overflow-hidden shadow-2xs">
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
                        <button type="submit" className="w-full py-2 bg-blue-600 text-white font-bold text-xs rounded-lg hover:bg-blue-700 shadow-xs flex items-center justify-center gap-1.5">
                          <Plus className="w-4 h-4" /> Guardar Mapeo de Marca
                        </button>
                      </div>
                    </div>
                  </form>

                  {/* Brand Mappings Table */}
                  <div className="border border-gray-200 rounded-xl overflow-hidden shadow-2xs">
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
                        <button type="submit" className={`px-6 py-2 text-white font-bold text-xs rounded-lg shadow-2xs flex items-center gap-1.5 ${newKeywordRule.rule_type === 'exclude' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-amber-600 hover:bg-amber-700'}`}>
                          <Plus className="w-4 h-4" /> {newKeywordRule.rule_type === 'exclude' ? 'Guardar Regla de Exclusión' : 'Guardar Mapeo de Palabra Clave'}
                        </button>
                      </div>
                    </div>
                  </form>

                  {/* Keyword Mappings Table */}
                  <div className="border border-gray-200 rounded-xl overflow-hidden shadow-2xs">
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
                className="px-4 py-2 bg-indigo-600 text-white font-bold text-xs rounded-xl hover:bg-indigo-700 shadow-xs flex items-center gap-1.5"
              >
                <Sparkles className="w-4 h-4" /> Aplicar y Recalcular Sugerencias
              </button>
              <button
                onClick={() => setShowRulesModal(false)}
                className="px-4 py-2 bg-gray-200 text-gray-700 font-medium text-xs rounded-xl hover:bg-gray-300"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Rule Sub-Modal */}
      {editingRule && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95">
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
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-xs"
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
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95">
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

              <div className="space-y-2">
                <h4 className="font-bold text-gray-800 uppercase tracking-wide text-[10px]">
                  Cascada de Decisión Evaluada
                </h4>
                <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 bg-white overflow-hidden shadow-2xs">
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
                  className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold rounded-xl border border-amber-200 flex items-center gap-1.5 shadow-2xs"
                >
                  <BookmarkPlus className="w-4 h-4 text-amber-600" /> Crear regla a partir de este caso
                </button>
                <button
                  type="button"
                  onClick={() => setCandidateTraceModal(null)}
                  className="px-4 py-2 bg-gray-900 text-white font-bold rounded-xl hover:bg-gray-800"
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
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95">
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
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-600 text-white font-bold rounded-xl hover:bg-amber-700 shadow-xs"
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
