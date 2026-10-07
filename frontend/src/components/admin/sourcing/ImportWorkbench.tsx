import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Search, Filter, SlidersHorizontal, ArrowUpDown, CheckSquare, Square, 
  ExternalLink, Sparkles, RefreshCw, Eye, Image as ImageIcon, ImageOff, 
  CheckCircle2, AlertTriangle, ChevronLeft, ChevronRight, ArrowRight, 
  Layers, Download, Trash2, X, Plus, ShieldCheck, Tag, Info, Check, Edit3, ShoppingBag,
  TrendingUp, Star, Zap, DollarSign, PackageCheck
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useToast } from '../../admin/Toast';
import { ProductImage } from '../../common/ProductImage';
import { extractCandidateImages } from '../../../lib/imageUtils';
import { calculateCandidateImportAnalysis } from '../../../services/sourcing/candidateImportAnalysis';
import { sanitizeBrand } from '../../../lib/brandUtils';
import { checkTiendamiaByAsin, type TiendamiaMatchResult } from '../../../services/sourcing/tiendamiaMatchingService';
import { getStoredExchangeRate, convertUsdToDisplay, type ExchangeRateDetail } from '../../../services/currencyService';

export interface ImportCandidateItem {
  id: string;
  external_product_id: string; // ASIN
  title: string;
  brand: string;
  franchise?: string;
  category?: string;
  amazon_category?: string;
  amazon_subcategory?: string;
  amazon_category_path?: string;
  image_url: string;
  gallery_images?: string[];
  product_url_external?: string;
  price_usd: number | null;
  rating?: number | null;
  review_count?: number;
  availability?: string;
  prime?: boolean;
  seller?: string;
  source?: string;
  data_origin?: 'LIVE' | 'CACHE' | 'DATABASE';
  sourcing_score?: number;
  ranking_score?: number;
  opportunity_score?: number;
  created_at?: string;
  search_query?: string;
  raw_data?: any;
  // Status flags
  already_imported?: boolean;
  catalog_product_id?: string;
  status?: 'review' | 'imported' | 'rejected' | 'pending_review';
}

export type QuickChipType = 
  | 'all' 
  | 'ai_recommended' 
  | 'high_margin' 
  | 'high_demand' 
  | 'new' 
  | 'preorder' 
  | 'not_imported' 
  | 'imported' 
  | 'with_image' 
  | 'no_image';

interface ImportWorkbenchProps {
  initialItems?: ImportCandidateItem[];
  searchQuery?: string;
  onRefresh?: () => void;
  isLoading?: boolean;
  onImportSuccess?: () => void;
  pricingSettings?: any;
  onSelectionChange?: (count: number) => void;
  onReviewModalToggle?: (isOpen: boolean) => void;
  onImportingStateChange?: (isImporting: boolean) => void;
  targetCountry?: string;
}

export const ImportWorkbench: React.FC<ImportWorkbenchProps> = ({
  initialItems = [],
  searchQuery = '',
  onRefresh,
  isLoading = false,
  onImportSuccess,
  pricingSettings,
  onSelectionChange,
  onReviewModalToggle,
  onImportingStateChange,
  targetCountry: propTargetCountry = 'UY'
}) => {
  const { addToast } = useToast();

  // 1. Raw Candidate pool
  const [candidates, setCandidates] = useState<ImportCandidateItem[]>(initialItems);
  const [dbCategories, setDbCategories] = useState<any[]>([]);
  const [existingCatalogAsins, setExistingCatalogAsins] = useState<Set<string>>(new Set());

  // 2. Selection state (PERSISTENT ACROSS PAGES & FILTERS)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Notify parent of selection changes
  useEffect(() => {
    onSelectionChange?.(selectedIds.size);
  }, [selectedIds, onSelectionChange]);

  // 3. View mode & Quantity Control
  const [pageSizeOption, setPageSizeOption] = useState<number | 'custom'>(25);
  const [customPageSize, setCustomPageSize] = useState<number>(50);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [jumpPageInput, setJumpPageInput] = useState<string>('1');

  // 4. Sorting & Quick Chips
  const [sortBy, setSortBy] = useState<string>('potential_desc');
  const [activeChip, setActiveChip] = useState<QuickChipType>('all');

  // 5. Filters
  const [searchTerm, setSearchTerm] = useState<string>(searchQuery);
  const [filterBrand, setFilterBrand] = useState<string>('all');
  const [filterFranchise, setFilterFranchise] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterMinScore, setFilterMinScore] = useState<number>(0);
  const [filterMaxPrice, setFilterMaxPrice] = useState<string>('');
  const [filterMinPrice, setFilterMinPrice] = useState<string>('');
  const [filterAvailability, setFilterAvailability] = useState<'all' | 'available' | 'prime'>('all');

  // 6. Modals & Drawers
  const [detailItem, setDetailItem] = useState<ImportCandidateItem | null>(null);
  const [showBulkReviewModal, setShowBulkReviewModal] = useState<boolean>(false);
  const [batchCategory, setBatchCategory] = useState<string>('');
  const [batchMarkup, setBatchMarkup] = useState<number>(pricingSettings?.target_margin_percent ?? 3);
  const [isImporting, setIsImporting] = useState<boolean>(false);

  // 7. TiendaMía Matching Cache & Loading state per ASIN
  const [tiendamiaResults, setTiendamiaResults] = useState<Record<string, TiendamiaMatchResult>>({});
  const [loadingTiendamiaAsins, setLoadingTiendamiaAsins] = useState<Set<string>>(new Set());

  // 8. Currency FX & Regional State
  const [exchangeRateDetail, setExchangeRateDetail] = useState<ExchangeRateDetail>(() => getStoredExchangeRate('UYU'));
  const [targetCountry, setTargetCountry] = useState<string>(propTargetCountry);

  useEffect(() => {
    if (propTargetCountry) {
      setTargetCountry(propTargetCountry);
    }
  }, [propTargetCountry]);

  // Notify parent of modal & importing state
  useEffect(() => {
    onReviewModalToggle?.(showBulkReviewModal);
  }, [showBulkReviewModal, onReviewModalToggle]);

  useEffect(() => {
    onImportingStateChange?.(isImporting);
  }, [isImporting, onImportingStateChange]);

  // Sync initial items when provided
  useEffect(() => {
    if (initialItems) {
      setCandidates(initialItems);
    }
  }, [initialItems]);

  // Sync searchQuery prop changes with searchTerm
  useEffect(() => {
    if (searchQuery !== undefined) {
      setSearchTerm(searchQuery);
    }
  }, [searchQuery]);

  // Fetch Categories & Existing ASINs from DB
  useEffect(() => {
    fetchAuxiliaryData();
  }, []);

  async function fetchAuxiliaryData() {
    try {
      // 1. Fetch categories
      const { data: cats } = await supabase.from('categories').select('*').order('name');
      if (cats) setDbCategories(cats);

      // 2. Fetch existing international products ASINs for deduplication
      const { data: prods } = await supabase.from('international_products').select('external_product_id');
      if (prods) {
        const set = new Set<string>();
        prods.forEach(p => {
          if (p.external_product_id) set.add(String(p.external_product_id).toUpperCase());
        });
        setExistingCatalogAsins(set);
      }
    } catch (err) {
      console.error('Error fetching auxiliary data:', err);
    }
  }

  // Derive unique brands & franchises for filters with strict sanitization
  const uniqueBrands = useMemo(() => {
    const s = new Set<string>();
    candidates.forEach(c => {
      const b = sanitizeBrand(c.brand);
      if (b) s.add(b);
    });
    return Array.from(s).sort();
  }, [candidates]);

  const uniqueFranchises = useMemo(() => {
    const s = new Set<string>();
    candidates.forEach(c => {
      const f = c.franchise || c.raw_data?.franchise;
      if (f) s.add(f);
    });
    return Array.from(s).sort();
  }, [candidates]);

  // Pricing helper for candidate items
  const getItemFinancials = useCallback((item: ImportCandidateItem, overrideMarkup?: number) => {
    const markup = overrideMarkup ?? pricingSettings?.target_margin_percent ?? 3;
    return calculateCandidateImportAnalysis(item, pricingSettings, markup, targetCountry);
  }, [pricingSettings, targetCountry]);

  // Calculate score for candidate
  const getItemScore = useCallback((item: ImportCandidateItem) => {
    if (item.opportunity_score != null && item.opportunity_score > 0) return Math.round(item.opportunity_score);
    if (item.sourcing_score != null && item.sourcing_score > 0) return Math.round(item.sourcing_score);
    if (item.ranking_score != null && item.ranking_score > 0) return Math.round(item.ranking_score);
    
    let score = 50;
    if (item.rating) score += Math.min(25, item.rating * 5);
    if (item.review_count) score += Math.min(15, Math.log10(item.review_count + 1) * 5);
    if (item.prime) score += 10;
    return Math.min(100, Math.round(score));
  }, []);

  // Helper for score opportunity level
  const getScoreLevel = useCallback((score: number) => {
    if (score >= 80) return { label: 'Alta oportunidad', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    if (score >= 60) return { label: 'Media', color: 'bg-blue-50 text-blue-700 border-blue-200' };
    return { label: 'Baja', color: 'bg-gray-50 text-gray-600 border-gray-200' };
  }, []);

  // Check if item has a valid image
  const hasValidImage = useCallback((item: ImportCandidateItem) => {
    const imgs = extractCandidateImages(item);
    return imgs.length > 0;
  }, []);

  // Status computation for an item
  const getItemStatus = useCallback((item: ImportCandidateItem) => {
    const asin = String(item.external_product_id || '').toUpperCase();
    if (existingCatalogAsins.has(asin) || item.already_imported || item.status === 'imported') {
      return { code: 'YA_IMPORTADO', label: 'YA IMPORTADO', bg: 'bg-emerald-50 text-emerald-800 border-emerald-200' };
    }
    if (item.status === 'pending_review') {
      return { code: 'PENDING_REVIEW', label: 'PENDING_REVIEW', bg: 'bg-indigo-50 text-indigo-800 border-indigo-200' };
    }
    if (!hasValidImage(item)) {
      return { code: 'SIN_IMAGEN', label: 'SIN IMAGEN', bg: 'bg-rose-50 text-rose-800 border-rose-200' };
    }
    if (!item.category && !item.amazon_category) {
      return { code: 'REVISAR', label: 'REVISAR', bg: 'bg-amber-50 text-amber-800 border-amber-200' };
    }
    return { code: 'NUEVO', label: 'NUEVO', bg: 'bg-blue-50 text-blue-800 border-blue-200' };
  }, [existingCatalogAsins, hasValidImage]);

  // TiendaMía fetching helper for a single ASIN
  const fetchTiendamiaForAsin = useCallback(async (asin: string) => {
    if (!asin || tiendamiaResults[asin] || loadingTiendamiaAsins.has(asin)) return;

    setLoadingTiendamiaAsins(prev => new Set(prev).add(asin));
    try {
      const item = candidates.find(c => c.external_product_id === asin);
      const res = await checkTiendamiaByAsin(asin, { identifierVerification: item?.raw_data?.provenance?.asin?.verification, sourceUrl: item?.product_url_external, title: item?.title });
      setTiendamiaResults(prev => ({ ...prev, [asin]: res }));
    } catch {
      setTiendamiaResults(prev => ({
        ...prev,
        [asin]: {
          asin,
          found: false,
          exactMatch: false,
          priceUsd: null,
          productUrl: null,
          status: 'ERROR',
          checkedAt: new Date().toISOString(),
          statusMessage: 'Error al consultar TiendaMía',
          method: 'EXACT_ASIN_MATCH'
        }
      }));
    } finally {
      setLoadingTiendamiaAsins(prev => {
        const next = new Set(prev);
        next.delete(asin);
        return next;
      });
    }
  }, [tiendamiaResults, loadingTiendamiaAsins, candidates]);

  // 1. FILTERING ENGINE (COMBINABLE INTERSECTIONS & CHIPS)
  const filteredCandidates = useMemo(() => {
    return candidates.filter(item => {
      const asin = String(item.external_product_id || '').toUpperCase();
      const isImported = existingCatalogAsins.has(asin) || item.already_imported || item.status === 'imported';
      const hasImg = hasValidImage(item);
      const score = getItemScore(item);
      const fin = getItemFinancials(item);

      // Quick Chips Filter
      if (activeChip === 'ai_recommended' && score < 80) return false;
      if (activeChip === 'high_margin' && fin.marginPercent < 10 && fin.estimatedProfit < 8) return false;
      if (activeChip === 'high_demand' && !((item.review_count || 0) >= 40 || (item.rating || 0) >= 4.5)) return false;
      if (activeChip === 'new' && isImported) return false;
      if (activeChip === 'preorder' && !(item.availability === 'preorder' || item.title?.toLowerCase().includes('pre-order') || item.title?.toLowerCase().includes('preventa'))) return false;
      if (activeChip === 'not_imported' && isImported) return false;
      if (activeChip === 'imported' && !isImported) return false;
      if (activeChip === 'with_image' && !hasImg) return false;
      if (activeChip === 'no_image' && hasImg) return false;

      // Search term
      if (searchTerm.trim()) {
        const tokens = searchTerm.toLowerCase().split(/\s+/).filter(Boolean);
        const targetText = `${item.title || ''} ${item.external_product_id || ''} ${item.brand || ''} ${item.franchise || item.raw_data?.franchise || ''} ${item.category || item.amazon_category || ''}`.toLowerCase();
        const matchesAllTokens = tokens.every(token => targetText.includes(token));
        if (!matchesAllTokens) return false;
      }

      // Brand filter
      if (filterBrand !== 'all') {
        const itemBrand = sanitizeBrand(item.brand);
        if (!itemBrand || itemBrand.toLowerCase() !== filterBrand.toLowerCase()) return false;
      }

      // Franchise filter
      if (filterFranchise !== 'all') {
        const itemFran = item.franchise || item.raw_data?.franchise || '';
        if (itemFran.toLowerCase() !== filterFranchise.toLowerCase()) return false;
      }

      // Category filter
      if (filterCategory !== 'all') {
        const cat = (item.category || item.amazon_category || '').toLowerCase();
        if (!cat.includes(filterCategory.toLowerCase())) return false;
      }

      // Score filter
      if (filterMinScore > 0 && score < filterMinScore) return false;

      // Price filter
      const price = Number(item.price_usd || 0);
      if (filterMinPrice && price < Number(filterMinPrice)) return false;
      if (filterMaxPrice && price > Number(filterMaxPrice)) return false;

      // Availability / Prime filter
      if (filterAvailability === 'available' && item.availability === 'out_of_stock') return false;
      if (filterAvailability === 'prime' && !item.prime) return false;

      return true;
    });
  }, [
    candidates, activeChip, searchTerm, filterBrand, filterFranchise, filterCategory, 
    filterMinScore, filterMinPrice, filterMaxPrice, filterAvailability, 
    existingCatalogAsins, hasValidImage, getItemScore, getItemFinancials
  ]);

  // 2. SORTING ENGINE
  const sortedCandidates = useMemo(() => {
    const list = [...filteredCandidates];

    list.sort((a, b) => {
      switch (sortBy) {
        case 'potential_desc':
        case 'score_desc':
          return getItemScore(b) - getItemScore(a);
        case 'score_asc':
          return getItemScore(a) - getItemScore(b);
        case 'reviews_desc':
          return (b.review_count || 0) - (a.review_count || 0);
        case 'price_asc':
          return Number(a.price_usd || 0) - Number(b.price_usd || 0);
        case 'price_desc':
          return Number(b.price_usd || 0) - Number(a.price_usd || 0);
        case 'cost_asc': {
          const costA = getItemFinancials(a).realCost;
          const costB = getItemFinancials(b).realCost;
          return costA - costB;
        }
        case 'profit_desc': {
          const profitA = getItemFinancials(a).estimatedProfit;
          const profitB = getItemFinancials(b).estimatedProfit;
          return profitB - profitA;
        }
        case 'brand_asc':
          return (a.brand || '').localeCompare(b.brand || '');
        case 'franchise_asc': {
          const fA = a.franchise || a.raw_data?.franchise || '';
          const fB = b.franchise || b.raw_data?.franchise || '';
          return fA.localeCompare(fB);
        }
        case 'recent':
          return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
        default:
          return 0;
      }
    });

    return list;
  }, [filteredCandidates, sortBy, getItemScore, getItemFinancials]);

  // 3. PAGINATION ENGINE
  const effectivePageSize = pageSizeOption === 'custom' ? Math.max(1, customPageSize) : pageSizeOption;
  const totalPages = Math.max(1, Math.ceil(sortedCandidates.length / effectivePageSize));
  const validPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedCandidates = useMemo(() => {
    const start = (validPage - 1) * effectivePageSize;
    return sortedCandidates.slice(start, start + effectivePageSize);
  }, [sortedCandidates, validPage, effectivePageSize]);

  // Header Counters
  const totalFound = candidates.length;
  const totalImported = candidates.filter(c => existingCatalogAsins.has(String(c.external_product_id || '').toUpperCase()) || c.already_imported || c.status === 'imported').length;
  const totalNotImported = totalFound - totalImported;
  const totalWithImage = candidates.filter(hasValidImage).length;
  const totalNoImage = totalFound - totalWithImage;
  const totalSelected = selectedIds.size;

  // Selection handlers
  const handleToggleSelectOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAllVisible = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      paginatedCandidates.forEach(c => next.add(c.id));
      return next;
    });
    addToast({ title: 'Selección visible', message: `Se seleccionaron ${paginatedCandidates.length} productos visibles.`, type: 'info' });
  };

  const handleDeselectAllVisible = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      paginatedCandidates.forEach(c => next.delete(c.id));
      return next;
    });
  };

  const handleSelectAllFiltered = () => {
    setSelectedIds(new Set(sortedCandidates.map(c => c.id)));
    addToast({ title: 'Selección total', message: `Se seleccionaron todos los ${sortedCandidates.length} productos filtrados.`, type: 'info' });
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  // Bulk financial totals for selected items
  const selectedItemsList = useMemo(() => {
    return candidates.filter(c => selectedIds.has(c.id));
  }, [candidates, selectedIds]);

  const selectedFinancials = useMemo(() => {
    let totalRealCost = 0;
    let incomplete = false;
    let totalProfit = 0;
    let totalSalePrice = 0;
    let itemsWithoutImage = 0;
    let itemsAlreadyExisting = 0;

    selectedItemsList.forEach(item => {
      const fin = getItemFinancials(item, batchMarkup);
      if (fin.realCost == null || fin.finalPrice == null) incomplete = true;
      totalRealCost += fin.realCost ?? 0;
      totalProfit += fin.estimatedProfit;
      totalSalePrice += fin.finalPrice;
      if (!hasValidImage(item)) itemsWithoutImage++;
      const asin = String(item.external_product_id || '').toUpperCase();
      if (existingCatalogAsins.has(asin)) itemsAlreadyExisting++;
    });

    return {
      count: selectedItemsList.length,
      totalRealCost: incomplete ? null : Number(totalRealCost.toFixed(2)),
      totalProfit: incomplete ? null : Number(totalProfit.toFixed(2)),
      totalSalePrice: incomplete ? null : Number(totalSalePrice.toFixed(2)),
      itemsWithoutImage,
      itemsAlreadyExisting
    };
  }, [selectedItemsList, batchMarkup, getItemFinancials, hasValidImage, existingCatalogAsins]);

  // Import Action Handler (IMPORT TO PENDING_REVIEW)
  const handleExecuteImport = async () => {
    if (selectedIds.size === 0) return;
    setIsImporting(true);

    try {
      const itemsToImport = selectedItemsList.filter(item => {
        const asin = String(item.external_product_id || '').toUpperCase();
        return !existingCatalogAsins.has(asin);
      });

      if (itemsToImport.length === 0) {
        addToast({ 
          title: 'Ya importados', 
          message: 'Todos los productos seleccionados ya existen en el catálogo.', 
          type: 'info' 
        });
        setIsImporting(false);
        setShowBulkReviewModal(false);
        return;
      }

      if (itemsToImport.some(item => item.raw_data?.validation_version && (item.raw_data.provenance?.identity?.status !== 'OBSERVED' || getItemFinancials(item, batchMarkup).realCost == null || getItemFinancials(item, batchMarkup).finalPrice == null))) {
        throw new Error('Completá la verificación del producto y su cotización de importación antes de incorporarlo al catálogo.');
      }

      // Format payload for international_products
      const rowsToInsert = itemsToImport.map(item => {
        const fin = getItemFinancials(item, batchMarkup);
        const rawImgs = extractCandidateImages(item);
        
        return {
          source_provider: 'zinc',
          source_retailer: item.source || 'amazon',
          external_product_id: item.external_product_id,
          title: item.title,
          brand: item.brand,
          category: item.category || item.amazon_category || 'Collectibles',
          amazon_category: item.amazon_category || item.category,
          amazon_subcategory: item.amazon_subcategory,
          amazon_category_path: item.amazon_category_path,
          category_mapping_source: batchCategory ? 'manual' : 'import_workbench',
          category_mapping_confidence: 100,
          image_url: rawImgs[0] || item.image_url || null,
          product_url_external: item.product_url_external || null,
          base_price_usd: fin.amazonPrice,
          amazon_current_price_usd: fin.amazonPrice,
          pricing_mode: pricingSettings?.pricing_mode || 'amazon_price_plus_fee',
          usa_domestic_shipping_usd: item.raw_data?.import_quote?.shipping ?? 0,
          collectibles_fee_usd: fin.estimatedProfit,
          final_price_usd: fin.finalPrice,
          final_price_uyu: fin.finalPrice ? convertUsdToDisplay(fin.finalPrice, 'UYU', exchangeRateDetail.rate) : null,
          currency: 'USD',
          expected_profit_usd: fin.estimatedProfit,
          real_cost_usd: fin.realCost,
          availability: item.availability || 'available',
          rating: item.rating,
          review_count: item.review_count || 0,
          collectibles_category_id: batchCategory || null,
          gallery_images: rawImgs,
          status: 'pending_review',
          raw_data: {
            ...(item.raw_data || {}),
            target_country: targetCountry,
            quote_status: fin.quoteStatus,
            quote_explanation: fin.statusExplanation,
            fx_rate: exchangeRateDetail.rate,
            fx_target: exchangeRateDetail.target,
            fx_source: exchangeRateDetail.source_name,
            fx_status: exchangeRateDetail.status,
            fx_updated_at: exchangeRateDetail.effective_at
          }
        };
      });

      const { error: insertError } = await supabase
        .from('international_products')
        .insert(rowsToInsert)
        .select('id, external_product_id');

      if (insertError) throw insertError;

      // Update candidates status in DB if candidate_ids exist
      const candidateDbIds = itemsToImport.map(i => i.id).filter(id => !id.startsWith('temp_'));
      if (candidateDbIds.length > 0) {
        await supabase
          .from('international_import_candidates')
          .update({ status: 'imported' })
          .in('id', candidateDbIds);
      }

      addToast({
        title: 'Importación exitosa',
        message: `Se importaron ${rowsToInsert.length} productos a PENDING_REVIEW listos para su revisión final.`,
        type: 'success'
      });

      setSelectedIds(new Set());
      setShowBulkReviewModal(false);
      fetchAuxiliaryData();
      onImportSuccess?.();
      onRefresh?.();
    } catch (err: any) {
      console.error('Error in handleExecuteImport:', err);
      addToast({ title: 'Error al importar', message: err.message || 'Fallo en la base de datos', type: 'error' });
    } finally {
      setIsImporting(false);
    }
  };

  const handleClearAllFilters = () => {
    setSearchTerm('');
    setFilterBrand('all');
    setFilterFranchise('all');
    setFilterCategory('all');
    setActiveChip('all');
    setFilterMinScore(0);
    setFilterMinPrice('');
    setFilterMaxPrice('');
    setFilterAvailability('all');
    setCurrentPage(1);
  };

  const isAllVisibleSelected = paginatedCandidates.length > 0 && paginatedCandidates.every(c => selectedIds.has(c.id));

  return (
    <div className="space-y-4">
      {/* 1. CABECERA DE LA MESA (Métricas e Indicadores de Estado) */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-gray-900 text-white">
                <Layers className="w-4 h-4 text-[#f00856]" />
              </span>
              <h3 className="text-base font-bold text-gray-900">
                Mesa de Importación
              </h3>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-700 font-semibold border border-gray-200">
                {filteredCandidates.length} productos encontrados
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Analizá rentabilidad real, compará con el mercado, seleccioná productos y revisá el lote antes de importar.
            </p>
          </div>

          {/* Quick Metrics Badges */}
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <div className="px-3 py-1 bg-gray-50 border border-gray-200 rounded-lg text-gray-600 font-medium">
              Total: <strong className="text-gray-900">{totalFound}</strong>
            </div>
            <div className="px-3 py-1 bg-blue-50 border border-blue-200 rounded-lg text-blue-800 font-medium">
              Nuevos: <strong>{totalNotImported}</strong>
            </div>
            <div className="px-3 py-1 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 font-medium">
              Importados: <strong>{totalImported}</strong>
            </div>
            {totalNoImage > 0 && (
              <div className="px-3 py-1 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 font-medium">
                Sin imagen: <strong>{totalNoImage}</strong>
              </div>
            )}
            {totalSelected > 0 && (
              <div className="px-3 py-1 bg-pink-50 border border-pink-200 rounded-lg font-bold text-[#f00856]">
                Seleccionados: {totalSelected}
              </div>
            )}
          </div>
        </div>

        {/* 2. FILTROS DE RESULTADOS (Fila 1: Buscador + Dropdowns, Fila 2: Chips rápidos) */}
        <div className="space-y-3 pt-2 border-t border-gray-100">
          {/* Fila 1: Buscador dentro de resultados + Marca + Franquicia + Ordenar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 text-xs">
            <div className="lg:col-span-5 relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                <Search className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={searchTerm}
                onChange={e => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Buscar dentro de resultados (título, marca, ASIN)..."
                className="w-full pl-9 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 focus:bg-white focus:border-gray-400 focus:ring-0 transition"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-gray-400 hover:text-gray-700"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Marca */}
            <div className="lg:col-span-2">
              <select
                value={filterBrand}
                onChange={e => { setFilterBrand(e.target.value); setCurrentPage(1); }}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium text-gray-700 focus:bg-white"
              >
                <option value="all">Todas las marcas ({uniqueBrands.length})</option>
                {uniqueBrands.map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>

            {/* Franquicia */}
            <div className="lg:col-span-2">
              <select
                value={filterFranchise}
                onChange={e => { setFilterFranchise(e.target.value); setCurrentPage(1); }}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium text-gray-700 focus:bg-white"
              >
                <option value="all">Todas las franquicias</option>
                {uniqueFranchises.map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>

            {/* Ordenar por */}
            <div className="lg:col-span-3">
              <div className="flex items-center gap-1.5">
                <ArrowUpDown className="w-4 h-4 text-gray-400 shrink-0" />
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:bg-white"
                >
                  <option value="potential_desc">Mayor Oportunidad (Score)</option>
                  <option value="profit_desc">Mayor Ganancia USD</option>
                  <option value="reviews_desc">Más Reviews</option>
                  <option value="price_asc">Menor Precio Amazon</option>
                  <option value="price_desc">Mayor Precio Amazon</option>
                  <option value="cost_asc">Menor Costo Final</option>
                  <option value="brand_asc">Marca A-Z</option>
                  <option value="franchise_asc">Franquicia A-Z</option>
                  <option value="recent">Más Recientes</option>
                </select>
              </div>
            </div>
          </div>

          {/* Fila 2: Chips rápidos intuitivos */}
          <div className="flex items-center gap-1.5 flex-wrap pt-1 text-xs">
            <span className="text-[11px] font-bold text-gray-400 uppercase mr-1">Filtros:</span>

            <button
              onClick={() => { setActiveChip('all'); setCurrentPage(1); }}
              className={`px-3 py-1 rounded-lg font-semibold transition text-xs border ${
                activeChip === 'all'
                  ? 'bg-gray-900 text-white border-gray-900 shadow-2xs'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              Todos
            </button>

            <button
              onClick={() => { setActiveChip(activeChip === 'ai_recommended' ? 'all' : 'ai_recommended'); setCurrentPage(1); }}
              className={`px-3 py-1 rounded-lg font-semibold transition text-xs border flex items-center gap-1 ${
                activeChip === 'ai_recommended'
                  ? 'bg-purple-600 text-white border-purple-600 shadow-2xs'
                  : 'bg-white text-purple-700 border-purple-200 hover:bg-purple-50'
              }`}
            >
              <Sparkles className="w-3 h-3" />
              Recomendados IA
            </button>

            <button
              onClick={() => { setActiveChip(activeChip === 'high_margin' ? 'all' : 'high_margin'); setCurrentPage(1); }}
              className={`px-3 py-1 rounded-lg font-semibold transition text-xs border flex items-center gap-1 ${
                activeChip === 'high_margin'
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                  : 'bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50'
              }`}
            >
              <TrendingUp className="w-3 h-3" />
              Mayor margen
            </button>

            <button
              onClick={() => { setActiveChip(activeChip === 'high_demand' ? 'all' : 'high_demand'); setCurrentPage(1); }}
              className={`px-3 py-1 rounded-lg font-semibold transition text-xs border flex items-center gap-1 ${
                activeChip === 'high_demand'
                  ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                  : 'bg-white text-amber-700 border-amber-200 hover:bg-amber-50'
              }`}
            >
              <Zap className="w-3 h-3" />
              Alta demanda
            </button>

            <button
              onClick={() => { setActiveChip(activeChip === 'new' ? 'all' : 'new'); setCurrentPage(1); }}
              className={`px-3 py-1 rounded-lg font-semibold transition text-xs border ${
                activeChip === 'new'
                  ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              Nuevos
            </button>

            <button
              onClick={() => { setActiveChip(activeChip === 'preorder' ? 'all' : 'preorder'); setCurrentPage(1); }}
              className={`px-3 py-1 rounded-lg font-semibold transition text-xs border ${
                activeChip === 'preorder'
                  ? 'bg-orange-600 text-white border-orange-600 shadow-2xs'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              Preventa
            </button>

            <button
              onClick={() => { setActiveChip(activeChip === 'not_imported' ? 'all' : 'not_imported'); setCurrentPage(1); }}
              className={`px-3 py-1 rounded-lg font-semibold transition text-xs border ${
                activeChip === 'not_imported'
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              No importados
            </button>

            <button
              onClick={() => { setActiveChip(activeChip === 'imported' ? 'all' : 'imported'); setCurrentPage(1); }}
              className={`px-3 py-1 rounded-lg font-semibold transition text-xs border ${
                activeChip === 'imported'
                  ? 'bg-teal-600 text-white border-teal-600 shadow-2xs'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              Ya importados
            </button>

            <button
              onClick={() => { setActiveChip(activeChip === 'with_image' ? 'all' : 'with_image'); setCurrentPage(1); }}
              className={`px-3 py-1 rounded-lg font-semibold transition text-xs border ${
                activeChip === 'with_image'
                  ? 'bg-slate-700 text-white border-slate-700 shadow-2xs'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              Con imagen
            </button>

            <button
              onClick={() => { setActiveChip(activeChip === 'no_image' ? 'all' : 'no_image'); setCurrentPage(1); }}
              className={`px-3 py-1 rounded-lg font-semibold transition text-xs border ${
                activeChip === 'no_image'
                  ? 'bg-rose-600 text-white border-rose-600 shadow-2xs'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              Sin imagen
            </button>

            {(activeChip !== 'all' || searchTerm || filterBrand !== 'all' || filterFranchise !== 'all') && (
              <button
                onClick={handleClearAllFilters}
                className="ml-auto px-2.5 py-1 text-xs font-semibold text-rose-600 hover:text-rose-700 transition"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 3. TABLA PRINCIPAL */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-xs overflow-hidden">
        {/* Table Selection Sub-bar */}
        <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between text-xs flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <button
              onClick={isAllVisibleSelected ? handleDeselectAllVisible : handleSelectAllVisible}
              className="flex items-center gap-1.5 font-semibold text-gray-700 hover:text-gray-900"
            >
              {isAllVisibleSelected ? <CheckSquare className="w-4 h-4 text-[#f00856]" /> : <Square className="w-4 h-4 text-gray-400" />}
              <span>Seleccionar visibles ({paginatedCandidates.length})</span>
            </button>

            <span className="text-gray-300">|</span>

            <button
              onClick={handleSelectAllFiltered}
              className="font-semibold text-indigo-600 hover:underline"
            >
              Seleccionar todos los filtrados ({sortedCandidates.length})
            </button>
          </div>

          <div className="flex items-center gap-3">
            {selectedIds.size > 0 && (
              <button
                onClick={handleClearSelection}
                className="font-medium text-gray-500 hover:text-rose-600"
              >
                Quitar selección ({selectedIds.size})
              </button>
            )}

            {/* Quantity per page selector */}
            <div className="flex items-center gap-1 text-[11px] text-gray-500">
              <span>Mostrar:</span>
              {[25, 50, 100].map(qty => (
                <button
                  key={qty}
                  onClick={() => { setPageSizeOption(qty); setCurrentPage(1); }}
                  className={`px-2 py-0.5 rounded font-bold transition ${
                    pageSizeOption === qty ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {qty}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Table View */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={isAllVisibleSelected}
                    onChange={isAllVisibleSelected ? handleDeselectAllVisible : handleSelectAllVisible}
                    className="rounded text-[#f00856] focus:ring-[#f00856]"
                  />
                </th>
                <th className="py-3 px-3 min-w-[280px]">PRODUCTO</th>
                <th className="py-3 px-3 text-right">AMAZON</th>
                <th className="py-3 px-3 text-right">COSTO FINAL</th>
                <th className="py-3 px-3 text-center">TIENDAMÍA</th>
                <th className="py-3 px-3 text-right">VENTA SUGERIDA</th>
                <th className="py-3 px-3 text-right">GANANCIA</th>
                <th className="py-3 px-3 text-center">MARGEN</th>
                <th className="py-3 px-3 text-center">SCORE</th>
                <th className="py-3 px-3 text-center">ESTADO</th>
                <th className="py-3 px-3 text-center">ACCIONES</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr>
                  <td colSpan={11} className="py-16 text-center text-gray-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#f00856] mb-2" />
                    <p className="text-xs font-medium">Consultando catálogo y calculando costos...</p>
                  </td>
                </tr>
              ) : paginatedCandidates.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-16 text-center text-gray-400">
                    <Layers className="w-8 h-8 mx-auto text-gray-300 mb-2" />
                    <p className="text-sm font-bold text-gray-700">No hay productos que coincidan con la búsqueda</p>
                    <p className="text-xs text-gray-400 mt-1">Probá cambiando el término o limpiando los filtros.</p>
                  </td>
                </tr>
              ) : (
                paginatedCandidates.map(item => {
                  const isSelected = selectedIds.has(item.id);
                  const fin = getItemFinancials(item);
                  const score = getItemScore(item);
                  const scoreLevel = getScoreLevel(score);
                  const status = getItemStatus(item);
                  const candidateImgs = extractCandidateImages(item);
                  const asin = item.external_product_id;
                  const tmResult = tiendamiaResults[asin];
                  const tmLoading = loadingTiendamiaAsins.has(asin);

                  return (
                    <tr 
                      key={item.id}
                      className={`hover:bg-gray-50/80 transition-colors ${
                        isSelected ? 'bg-pink-50/40' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-3 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectOne(item.id)}
                          className="rounded text-[#f00856] focus:ring-[#f00856]"
                        />
                      </td>

                      {/* PRODUCTO (Jerarquía visual clara + imagen 55-60px) */}
                      <td className="py-3 px-3">
                        <div className="flex items-start gap-3">
                          {/* Image container (50-65px) */}
                          <div className="w-14 h-14 shrink-0 rounded-xl overflow-hidden bg-white border border-gray-200 flex items-center justify-center p-0.5">
                            <ProductImage
                              src={candidateImgs[0] || item.image_url}
                              alternativeUrls={candidateImgs.slice(1)}
                              alt={item.title}
                              size="md"
                              showMissingBadge
                            />
                          </div>

                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="font-bold text-gray-950 text-xs line-clamp-2 leading-tight" title={item.title}>
                              {item.title}
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] text-gray-500 flex-wrap">
                              <span className="font-semibold text-gray-700">{item.brand || 'Collectibles'}</span>
                              <span>·</span>
                              <span className="font-mono text-[10px] text-gray-400">ASIN {item.external_product_id}</span>
                            </div>

                            {/* Clean Badges Row */}
                            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                              {item.data_origin === 'LIVE' ? (
                                <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                                  {item.raw_data?.validation_version ? 'Sourcing / evidencia' : 'Amazon Live'}
                                </span>
                              ) : (
                                <span className="text-[9px] font-bold text-gray-600 bg-gray-100 px-1.5 py-0.2 rounded">
                                  Amazon DB
                                </span>
                              )}

                              {(item.availability === 'preorder' || item.title?.toLowerCase().includes('pre-order') || item.title?.toLowerCase().includes('preventa')) && (
                                <span className="text-[9px] font-bold text-orange-700 bg-orange-50 px-1.5 py-0.2 rounded border border-orange-200">
                                  Preorder
                                </span>
                              )}

                              {((item.review_count || 0) >= 50 || (item.rating || 0) >= 4.5) && (
                                <span className="text-[9px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.2 rounded border border-purple-200">
                                  Alta demanda
                                </span>
                              )}

                              {item.prime && (
                                <span className="text-[9px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                                  Prime
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* AMAZON USD */}
                      <td className="py-3 px-3 text-right font-mono font-medium text-gray-700">
                        USD {fin.amazonPrice == null ? 'No calculable' : fin.amazonPrice.toFixed(2)}
                      </td>

                      {/* COSTO FINAL USD */}
                      <td className="py-3 px-3 text-right font-mono font-semibold text-gray-900">
                        USD {fin.realCost == null ? 'No calculable' : fin.realCost.toFixed(2)}
                      </td>

                      {/* TIENDAMÍA USD (Matching exacto por ASIN) */}
                      <td className="py-3 px-3 text-center font-mono">
                        {tmLoading ? (
                          <div className="flex items-center justify-center gap-1 text-[10px] text-gray-400">
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            <span>Verificando</span>
                          </div>
                        ) : tmResult?.status === 'FOUND' && tmResult.priceUsd ? (
                          (() => {
                            const diff = fin.finalPrice - tmResult.priceUsd;
                            const isCheaperInCollectibles = diff < 0;
                            const diffPercent = tmResult.priceUsd > 0
                              ? Math.abs((diff / tmResult.priceUsd) * 100).toFixed(0)
                              : '0';

                            return (
                              <div className="space-y-0.5">
                                <div className="font-bold text-gray-900 text-xs flex items-center justify-center gap-1">
                                  <span>USD {tmResult.priceUsd.toFixed(2)}</span>
                                  {tmResult.productUrl && (
                                    <a
                                      href={tmResult.productUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-gray-400 hover:text-gray-700"
                                      title="Ver en TiendaMía"
                                    >
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  )}
                                </div>
                                <div className={`text-[10px] font-bold ${isCheaperInCollectibles ? 'text-emerald-600' : 'text-rose-600'}`}>
                                  {isCheaperInCollectibles ? `-${diffPercent}% vs TiendaMía` : `+${diffPercent}% vs TiendaMía`}
                                </div>
                              </div>
                            );
                          })()
                        ) : tmResult?.status === 'NOT_FOUND' ? (
                          <span className="text-[11px] text-gray-400 italic">No localizado</span>
                        ) : tmResult?.status === 'UNAVAILABLE' ? (
                          <span className="text-[10px] text-slate-400">No disponible</span>
                        ) : (
                          <button
                            onClick={() => fetchTiendamiaForAsin(asin)}
                            className="text-[10px] font-medium text-gray-500 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 px-2 py-0.5 rounded transition"
                          >
                            Consultar
                          </button>
                        )}
                      </td>

                      {/* VENTA SUGERIDA USD */}
                      <td className="py-3 px-3 text-right font-mono font-bold text-gray-900 text-xs">
                        USD {fin.finalPrice == null ? 'No calculable' : fin.finalPrice.toFixed(2)}
                      </td>

                      {/* GANANCIA USD */}
                      <td className={`py-3 px-3 text-right font-mono font-bold ${
                        fin.estimatedProfit > 0 ? 'text-emerald-600' : 'text-rose-600'
                      }`}>
                        USD {fin.estimatedProfit == null ? 'No calculable' : fin.estimatedProfit.toFixed(2)}
                      </td>

                      {/* MARGEN % */}
                      <td className="py-3 px-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded font-bold text-[11px] ${
                          fin.marginPercent >= 10 ? 'bg-emerald-50 text-emerald-800' :
                          fin.marginPercent > 0 ? 'bg-gray-100 text-gray-800' :
                          'bg-rose-50 text-rose-800'
                        }`}>
                          {fin.markupPercent}%
                        </span>
                      </td>

                      {/* SCORE (Score numérico + Alta oportunidad / Media / Baja) */}
                      <td className="py-3 px-3 text-center">
                        <div className="space-y-0.5">
                          <div className="font-black text-gray-900 text-xs">{score}</div>
                          <span className={`inline-block px-1.5 py-0.2 rounded text-[9px] font-bold border ${scoreLevel.color}`}>
                            {scoreLevel.label}
                          </span>
                        </div>
                      </td>

                      {/* ESTADO */}
                      <td className="py-3 px-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider ${status.bg}`}>
                          {status.label}
                        </span>
                      </td>

                      {/* ACCIONES */}
                      <td className="py-3 px-3 text-center">
                        <button
                          onClick={() => setDetailItem(item)}
                          className="px-2.5 py-1 text-xs font-semibold text-gray-700 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
                        >
                          Ver detalle
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 4. PAGINACIÓN */}
        <div className="px-4 py-3 bg-white border-t border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="text-gray-500 font-medium">
            Página <strong>{validPage}</strong> de <strong>{totalPages}</strong> ({sortedCandidates.length} productos filtrados)
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={validPage <= 1}
              className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Anterior</span>
            </button>

            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={validPage >= totalPages}
              className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              <span>Siguiente</span>
              <ChevronRight className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-1 ml-2">
              <span className="text-gray-400">Ir a:</span>
              <input
                type="number"
                min="1"
                max={totalPages}
                value={jumpPageInput}
                onChange={e => setJumpPageInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const num = Number(jumpPageInput);
                    if (num >= 1 && num <= totalPages) setCurrentPage(num);
                  }
                }}
                className="w-12 px-2 py-1 bg-gray-50 border border-gray-300 rounded text-center font-bold text-xs"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 5. STICKY BOTTOM BAR (BARRA FIJA INFERIOR PARA ACCIONES MASIVAS) */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-4 inset-x-4 max-w-5xl mx-auto z-40 bg-gray-900 text-white rounded-2xl p-4 shadow-2xl border border-gray-700 flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in slide-in-from-bottom-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#f00856] animate-pulse" />
              <span className="font-bold text-sm text-white">
                {selectedFinancials.count} productos seleccionados
              </span>
            </div>

            <div className="text-xs space-x-3 text-gray-300 font-mono">
              <span>Costo real: <strong className="text-white">USD {selectedFinancials.totalRealCost == null ? 'No calculable' : selectedFinancials.totalRealCost.toFixed(2)}</strong></span>
              <span>Ganancia: <strong className="text-emerald-400">USD {selectedFinancials.totalProfit == null ? 'No calculable' : selectedFinancials.totalProfit.toFixed(2)}</strong></span>
              <span>Venta: <strong className="text-white">USD {selectedFinancials.totalSalePrice == null ? 'No calculable' : selectedFinancials.totalSalePrice.toFixed(2)}</strong></span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleClearSelection}
              className="px-3 py-2 text-xs font-semibold text-gray-400 hover:text-white transition"
            >
              Quitar selección
            </button>

            <button
              onClick={() => setShowBulkReviewModal(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#f00856] hover:bg-[#d0074a] text-white rounded-xl text-xs font-bold shadow-md transition"
            >
              <span>Revisar selección ({selectedFinancials.count})</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* 6. MODAL DE REVISIÓN PREVIA A LA IMPORTACIÓN */}
      {showBulkReviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-gray-200 shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-5 border-b border-gray-200 flex items-center justify-between bg-gray-50">
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  Revisar Selección antes de Importar ({selectedFinancials.count} productos)
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Verificá rentabilidad, márgenes y categorías antes de incorporar estos productos al catálogo.
                </p>
              </div>
              <button
                onClick={() => setShowBulkReviewModal(false)}
                className="p-1.5 rounded-xl hover:bg-gray-200 text-gray-400 hover:text-gray-700 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 text-xs text-gray-700 flex-1">
              {/* Summary Metric Cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 text-center">
                  <div className="text-[10px] text-gray-500 font-bold uppercase">Costo Total Real</div>
                  <div className="text-base font-black text-gray-900 mt-1">USD {selectedFinancials.totalRealCost == null ? 'No calculable' : selectedFinancials.totalRealCost.toFixed(2)}</div>
                </div>
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-center">
                  <div className="text-[10px] text-emerald-700 font-bold uppercase">Ganancia Estimada</div>
                  <div className="text-base font-black text-emerald-600 mt-1">USD {selectedFinancials.totalProfit == null ? 'No calculable' : selectedFinancials.totalProfit.toFixed(2)}</div>
                </div>
                <div className="p-3 bg-gray-900 text-white rounded-xl text-center">
                  <div className="text-[10px] text-pink-300 font-bold uppercase">Precio Venta Total</div>
                  <div className="text-base font-black text-white mt-1">USD {selectedFinancials.totalSalePrice == null ? 'No calculable' : selectedFinancials.totalSalePrice.toFixed(2)}</div>
                </div>
              </div>

              {/* Warnings / Flags */}
              {selectedFinancials.itemsAlreadyExisting > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                  <span><strong>{selectedFinancials.itemsAlreadyExisting}</strong> productos ya existen en el catálogo y serán ignorados automáticamente por deduplicación.</span>
                </div>
              )}

              {selectedFinancials.itemsWithoutImage > 0 && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 flex items-center gap-2">
                  <ImageOff className="w-4 h-4 shrink-0 text-rose-600" />
                  <span><strong>{selectedFinancials.itemsWithoutImage}</strong> productos no poseen imagen válida. Entrarán con estado REVISAR IMAGEN.</span>
                </div>
              )}

              {/* Table of selected items */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="bg-gray-50 px-3 py-2 font-bold text-gray-700 text-[11px] border-b border-gray-200">
                  Productos Seleccionados ({selectedItemsList.length})
                </div>
                <div className="max-h-56 overflow-y-auto divide-y divide-gray-100">
                  {selectedItemsList.map(item => {
                    const fin = getItemFinancials(item, batchMarkup);
                    const imgs = extractCandidateImages(item);
                    return (
                      <div key={item.id} className="p-2.5 flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <div className="w-8 h-8 rounded-lg overflow-hidden bg-white border border-gray-200 shrink-0">
                            <ProductImage src={imgs[0] || item.image_url} alt={item.title} size="sm" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-gray-900 truncate" title={item.title}>{item.title}</div>
                            <div className="text-[10px] text-gray-400 font-mono">ASIN {item.external_product_id}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 shrink-0 font-mono text-right">
                          <div>
                            <div className="text-[10px] text-gray-400">Costo</div>
                            <div className="font-semibold text-gray-700">USD {fin.realCost == null ? 'No calculable' : fin.realCost.toFixed(2)}</div>
                          </div>
                          <div>
                            <div className="text-[10px] text-gray-400">Venta</div>
                            <div className="font-bold text-gray-900">USD {fin.finalPrice == null ? 'No calculable' : fin.finalPrice.toFixed(2)}</div>
                          </div>
                          <div>
                            <div className="text-[10px] text-gray-400">Ganancia</div>
                            <div className="font-bold text-emerald-600">USD {fin.estimatedProfit == null ? 'No calculable' : fin.estimatedProfit.toFixed(2)}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Batch Actions Form */}
              <div className="space-y-4 pt-2 border-t border-gray-100">
                <div>
                  <label className="font-bold text-gray-900 block mb-1">Asignar Categoría en Lote (Opcional)</label>
                  <select
                    value={batchCategory}
                    onChange={e => setBatchCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs font-semibold text-gray-800"
                  >
                    <option value="">Mantener categorías detectadas automáticamente</option>
                    {dbCategories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-gray-900">Ajustar Markup para este lote (%)</label>
                    <span className="font-bold text-[#f00856]">{batchMarkup}%</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="50"
                    step="1"
                    value={batchMarkup}
                    onChange={e => setBatchMarkup(Number(e.target.value))}
                    className="w-full accent-[#f00856]"
                  />
                  <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                    <span>1%</span>
                    <span>3% (Recomendado)</span>
                    <span>15%</span>
                    <span>50%</span>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-[11px] leading-relaxed">
                ℹ️ <strong>Los productos se importarán al catálogo en estado PENDING_REVIEW.</strong> No se publicarán en el storefront hasta su aprobación final.
              </div>
            </div>

            <div className="p-5 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
              <button
                onClick={() => setShowBulkReviewModal(false)}
                className="px-4 py-2 text-xs font-bold text-gray-600 hover:text-gray-900"
              >
                Volver
              </button>

              <button
                onClick={handleExecuteImport}
                disabled={isImporting}
                className="flex items-center gap-2 px-6 py-2.5 bg-[#f00856] hover:bg-[#d0074a] text-white rounded-xl text-xs font-bold shadow-md transition disabled:opacity-50"
              >
                {isImporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                <span>Confirmar importación</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. DETALLE DEL PRODUCTO (Drawer/Modal) */}
      {detailItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-gray-200 shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-5 border-b border-gray-200 flex items-center justify-between bg-gray-50">
              <div className="min-w-0 pr-4">
                <h3 className="text-base font-bold text-gray-900 truncate">{detailItem.title}</h3>
                <div className="text-xs text-gray-500 flex items-center gap-2 mt-0.5">
                  <span>{detailItem.brand || 'Collectibles'}</span>
                  <span>· ASIN {detailItem.external_product_id}</span>
                </div>
              </div>
              <button
                onClick={() => setDetailItem(null)}
                className="p-1.5 rounded-xl hover:bg-gray-200 text-gray-400 hover:text-gray-700 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 text-xs text-gray-700 flex-1">
              {/* SECCIÓN PRODUCTO & IMÁGENES */}
              <div className="flex gap-4 items-start">
                <div className="w-24 h-24 shrink-0 rounded-2xl overflow-hidden bg-white border border-gray-200 p-1 flex items-center justify-center">
                  <ProductImage
                    src={detailItem.image_url}
                    alternativeUrls={extractCandidateImages(detailItem)}
                    alt={detailItem.title}
                    size="lg"
                    showMissingBadge
                  />
                </div>
                <div className="space-y-1.5 flex-1">
                  <div className="font-bold text-gray-900">{detailItem.title}</div>
                  <div className="text-gray-500">Marca: <strong>{detailItem.brand || 'N/A'}</strong></div>
                  <div className="text-gray-500">Franquicia: <strong>{detailItem.franchise || detailItem.raw_data?.franchise || 'N/A'}</strong></div>
                  <div className="text-gray-500">Categoría: <strong>{detailItem.category || detailItem.amazon_category || 'N/A'}</strong></div>
                  <div className="text-gray-500">Reviews: <strong>{detailItem.review_count ?? 'No disponible'} ({detailItem.rating ? `${detailItem.rating} ★` : 'Sin calificación'})</strong></div>
                  {detailItem.product_url_external && (
                    <a
                      href={detailItem.product_url_external}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[#f00856] font-bold hover:underline pt-1"
                    >
                      <span>Ver en Amazon</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>

              {detailItem.raw_data?.validation_version && (
                <div className="border rounded-2xl p-4 space-y-3 text-xs">
                  <p className="font-bold">Cotización para importar (USD)</p>
                  <p className="text-gray-500">Ingresá los costos cotizados y el precio de venta validado. Los campos vacíos permanecen pendientes.</p>
                  <div className="grid grid-cols-2 gap-3">
                    {[['shipping', 'Envío cotizado'], ['customs', 'Aduana / impuestos'], ['fees', 'Otros costos cotizados'], ['sale_price', 'Precio de venta validado']].map(([field, label]) => (
                      <label key={field} className="space-y-1">{label}
                        <input type="number" min="0" step="0.01" aria-label={label} value={detailItem.raw_data?.import_quote?.[field] ?? ''}
                          className="block w-full border rounded-lg p-2"
                          onChange={e => {
                            const value = e.target.value === '' ? null : Number(e.target.value);
                            const updated = { ...detailItem, raw_data: { ...detailItem.raw_data, import_quote: { ...detailItem.raw_data.import_quote, [field]: value, observed_at: new Date().toISOString(), source: 'ADMIN_QUOTE' } } };
                            setDetailItem(updated); setCandidates(prev => prev.map(c => c.id === updated.id ? updated : c));
                          }} />
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* SECCIÓN COSTOS Y PRICING */}
              {(() => {
                const fin = getItemFinancials(detailItem);
                return (
                  <div className="border border-gray-200 rounded-2xl p-4 bg-gray-50 space-y-3 font-mono">
                    <div className="text-[11px] font-bold text-gray-700 uppercase font-sans">Desglose Financiero & Costo Real</div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Precio Amazon:</span>
                        <span>USD {fin.amazonPrice == null ? 'No calculable' : fin.amazonPrice.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Zinc Fee:</span>
                        <span>USD {pricingSettings?.zinc_fee_usd ?? 1.00}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Prex % + Fijo:</span>
                        <span>{fin.realCost == null ? 'No calculable' : 'Incluido por el motor canónico'}</span>
                      </div>
                      <div className="flex justify-between font-bold text-gray-900 border-t pt-1">
                        <span>Costo Real Total:</span>
                        <span>USD {fin.realCost == null ? 'No calculable' : fin.realCost.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-gray-200 grid grid-cols-3 gap-2 text-center">
                      <div className="p-2 bg-white rounded-lg border border-gray-200">
                        <div className="text-[9px] text-gray-500 uppercase font-sans">Markup</div>
                        <div className="font-black text-gray-900">{fin.markupPercent}%</div>
                      </div>
                      <div className="p-2 bg-emerald-50 rounded-lg border border-emerald-200">
                        <div className="text-[9px] text-emerald-700 uppercase font-sans">Ganancia USD</div>
                        <div className="font-black text-emerald-600">USD {fin.estimatedProfit == null ? 'No calculable' : fin.estimatedProfit.toFixed(2)}</div>
                      </div>
                      <div className="p-2 bg-gray-900 text-white rounded-lg">
                        <div className="text-[9px] text-pink-300 uppercase font-sans">Precio Venta</div>
                        <div className="font-black text-white">USD {fin.finalPrice == null ? 'No calculable' : fin.finalPrice.toFixed(2)}</div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* SECCIÓN TIENDAMÍA EXACT ASIN COMPARISON */}
              {(() => {
                const asin = detailItem.external_product_id;
                const tmResult = tiendamiaResults[asin];
                const tmLoading = loadingTiendamiaAsins.has(asin);

                return (
                  <div className="p-4 bg-gray-50 border border-gray-200 rounded-2xl space-y-3 text-xs">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-bold text-gray-900 flex items-center gap-1.5">
                          <span>Comparativa TiendaMía</span>
                          {tmLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin text-gray-400" />}
                        </div>
                        <div className="text-[11px] text-gray-500">
                          Match exclusivo por ASIN: <span className="font-mono font-bold text-gray-700">{asin || 'N/A'}</span>
                        </div>
                      </div>

                      <div>
                        {tmLoading ? (
                          <span className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 font-bold rounded-lg text-[11px] flex items-center gap-1">
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            Consultando...
                          </span>
                        ) : tmResult?.status === 'FOUND' ? (
                          <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold rounded-lg text-[11px]">
                            ENCONTRADO
                          </span>
                        ) : tmResult?.status === 'NOT_FOUND' ? (
                          <span className="px-2.5 py-1 bg-gray-100 text-gray-700 border border-gray-300 font-bold rounded-lg text-[11px]">
                            NO ENCONTRADO
                          </span>
                        ) : tmResult?.status === 'UNAVAILABLE' ? (
                          <span className="px-2.5 py-1 bg-slate-200 text-slate-700 border border-slate-300 font-bold rounded-lg text-[11px]">
                            SERVICIO NO DISPONIBLE
                          </span>
                        ) : (
                          <button
                            onClick={() => fetchTiendamiaForAsin(asin)}
                            className="px-2.5 py-1 bg-gray-200 text-gray-700 hover:bg-gray-300 font-bold rounded-lg text-[11px]"
                          >
                            Consultar
                          </button>
                        )}
                      </div>
                    </div>

                    {!tmLoading && tmResult?.status === 'FOUND' && tmResult.priceUsd && (
                      <div className="pt-2 border-t border-gray-200 space-y-2">
                        {(() => {
                          const fin = getItemFinancials(detailItem);
                          const diff = fin.finalPrice - tmResult.priceUsd;
                          const diffPercent = tmResult.priceUsd > 0
                            ? Math.abs((diff / tmResult.priceUsd) * 100).toFixed(1)
                            : '0.0';
                          const isCheaper = diff < 0;
                          const isSame = Math.abs(diff) < 0.01;

                          return (
                            <div className="space-y-2">
                              <div className="grid grid-cols-3 gap-2 bg-white p-2.5 rounded-xl border border-gray-200 font-mono text-center">
                                <div>
                                  <div className="text-[10px] text-gray-500 font-sans">TiendaMía</div>
                                  <div className="font-bold text-gray-900">USD {tmResult.priceUsd.toFixed(2)}</div>
                                </div>
                                <div>
                                  <div className="text-[10px] text-gray-500 font-sans">Collectibles</div>
                                  <div className="font-bold text-gray-900">USD {fin.finalPrice == null ? 'No calculable' : fin.finalPrice.toFixed(2)}</div>
                                </div>
                                <div>
                                  <div className="text-[10px] text-gray-500 font-sans">Diferencia</div>
                                  <div className={`font-bold ${isCheaper ? 'text-emerald-600' : isSame ? 'text-gray-700' : 'text-rose-600'}`}>
                                    {isCheaper ? `-USD ${Math.abs(diff).toFixed(2)}` : `+USD ${diff.toFixed(2)}`}
                                  </div>
                                </div>
                              </div>
                              <div className="text-[11px] font-semibold flex items-center justify-between px-1">
                                <span className={isCheaper ? 'text-emerald-700' : isSame ? 'text-gray-600' : 'text-amber-700'}>
                                  {isSame
                                    ? 'Mismo precio de mercado'
                                    : `${diffPercent}% ${isCheaper ? 'más barato en Collectibles' : 'más caro en Collectibles'}`}
                                </span>
                                {tmResult.productUrl && (
                                  <a
                                    href={tmResult.productUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-[#f00856] font-bold hover:underline"
                                  >
                                    <span>Ver producto</span>
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* SECCIÓN SOURCING */}
              <div className="border border-gray-200 rounded-2xl p-4 space-y-2">
                <div className="text-[11px] font-bold text-gray-700 uppercase">Inteligencia de Catálogo</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>Score Comercial: <strong>{getItemScore(detailItem)} / 100</strong></div>
                  <div>Origen: <strong>{detailItem.data_origin || 'LIVE'}</strong></div>
                  <div>Seller: <strong>{detailItem.seller || 'Amazon.com'}</strong></div>
                  <div>Disponibilidad: <strong>{detailItem.availability || 'In Stock'}</strong></div>
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-gray-200 bg-gray-50 flex items-center justify-end">
              <button
                onClick={() => setDetailItem(null)}
                className="px-4 py-2 bg-gray-900 text-white text-xs font-bold rounded-xl"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
