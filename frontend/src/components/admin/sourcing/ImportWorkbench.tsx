import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Search, Filter, SlidersHorizontal, ArrowUpDown, CheckSquare, Square, 
  ExternalLink, Sparkles, RefreshCw, Eye, Image as ImageIcon, ImageOff, 
  CheckCircle2, AlertTriangle, ChevronLeft, ChevronRight, ArrowRight, 
  Layers, Download, Trash2, X, Plus, ShieldCheck, Tag, Info, Check, Edit3, ShoppingBag
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useToast } from '../../admin/Toast';
import { ProductImage } from '../../common/ProductImage';
import { extractCandidateImages } from '../../../lib/imageUtils';
import { calculateInternationalPricing } from '../../../lib/internationalPricing';

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
  price_usd: number;
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

interface ImportWorkbenchProps {
  initialItems?: ImportCandidateItem[];
  searchQuery?: string;
  onRefresh?: () => void;
  isLoading?: boolean;
  onImportSuccess?: () => void;
  pricingSettings?: any;
}

export const ImportWorkbench: React.FC<ImportWorkbenchProps> = ({
  initialItems = [],
  searchQuery = '',
  onRefresh,
  isLoading = false,
  onImportSuccess,
  pricingSettings
}) => {
  const { addToast } = useToast();

  // 1. Raw Candidate pool
  const [candidates, setCandidates] = useState<ImportCandidateItem[]>(initialItems);
  const [dbCategories, setDbCategories] = useState<any[]>([]);
  const [existingCatalogAsins, setExistingCatalogAsins] = useState<Set<string>>(new Set());

  // 2. Selection state (PERSISTENT ACROSS PAGES & FILTERS)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 3. View mode & Quantity Control
  const [topView, setTopView] = useState<'all' | 'top10' | 'top30' | 'top50'>('all');
  const [pageSizeOption, setPageSizeOption] = useState<number | 'custom'>(25);
  const [customPageSize, setCustomPageSize] = useState<number>(50);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [jumpPageInput, setJumpPageInput] = useState<string>('1');

  // 4. Sorting
  const [sortBy, setSortBy] = useState<string>('potential_desc');

  // 5. Filters
  const [searchTerm, setSearchTerm] = useState<string>(searchQuery);
  const [filterBrand, setFilterBrand] = useState<string>('all');
  const [filterFranchise, setFilterFranchise] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterImportStatus, setFilterImportStatus] = useState<'all' | 'not_imported' | 'imported'>('all');
  const [filterImageStatus, setFilterImageStatus] = useState<'all' | 'with_image' | 'no_image'>('all');
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

  // Sync initial items when provided
  useEffect(() => {
    if (initialItems && initialItems.length > 0) {
      setCandidates(initialItems);
    }
  }, [initialItems]);

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

  // Derive unique brands & franchises for filters
  const uniqueBrands = useMemo(() => {
    const s = new Set<string>();
    candidates.forEach(c => {
      if (c.brand && c.brand !== 'Generic' && c.brand !== 'Sin Marca') s.add(c.brand);
    });
    return Array.from(s).sort();
  }, [candidates]);

  const uniqueFranchises = useMemo(() => {
    const s = new Set<string>();
    candidates.forEach(c => {
      if (c.franchise) s.add(c.franchise);
      else if (c.raw_data?.franchise) s.add(c.raw_data.franchise);
    });
    return Array.from(s).sort();
  }, [candidates]);

  // Pricing helper for candidate items
  const getItemFinancials = useCallback((item: ImportCandidateItem, overrideMarkup?: number) => {
    const amazonPrice = Number(item.price_usd || 0);
    const markup = overrideMarkup ?? pricingSettings?.target_margin_percent ?? 3;
    const settings = {
      ...pricingSettings,
      target_margin_percent: markup,
      percentage_markup: markup
    };
    const pricing = calculateInternationalPricing({ amazonPrice, usaShipping: 0 }, settings);
    const realCost = pricing.realCost;
    const finalPrice = Number((realCost * (1 + (markup / 100))).toFixed(2));
    const estimatedProfit = Number((finalPrice - realCost).toFixed(2));

    return {
      amazonPrice,
      realCost,
      markupPercent: markup,
      estimatedProfit,
      finalPrice
    };
  }, [pricingSettings]);

  // Calculate score for candidate (Certified Sourcing / Opportunity score)
  const getItemScore = useCallback((item: ImportCandidateItem) => {
    if (item.opportunity_score != null && item.opportunity_score > 0) return Math.round(item.opportunity_score);
    if (item.sourcing_score != null && item.sourcing_score > 0) return Math.round(item.sourcing_score);
    if (item.ranking_score != null && item.ranking_score > 0) return Math.round(item.ranking_score);
    
    // Deterministic fallback based on rating & reviews & profitability
    let score = 50;
    if (item.rating) score += Math.min(25, item.rating * 5);
    if (item.review_count) score += Math.min(15, Math.log10(item.review_count + 1) * 5);
    if (item.prime) score += 10;
    return Math.min(100, Math.round(score));
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
      return { code: 'YA_IMPORTADO', label: 'YA IMPORTADO', bg: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
    }
    if (item.status === 'pending_review') {
      return { code: 'PENDING_REVIEW', label: 'PENDING_REVIEW', bg: 'bg-indigo-100 text-indigo-800 border-indigo-300' };
    }
    if (!hasValidImage(item)) {
      return { code: 'SIN_IMAGEN', label: 'SIN IMAGEN', bg: 'bg-rose-100 text-rose-800 border-rose-300' };
    }
    if (!item.category && !item.amazon_category) {
      return { code: 'REVISAR', label: 'REVISAR', bg: 'bg-amber-100 text-amber-800 border-amber-300' };
    }
    return { code: 'NUEVO', label: 'NUEVO', bg: 'bg-blue-100 text-blue-800 border-blue-300' };
  }, [existingCatalogAsins, hasValidImage]);

  // 1. FILTERING ENGINE (COMBINABLE INTERSECTIONS)
  const filteredCandidates = useMemo(() => {
    return candidates.filter(item => {
      // Search term (Title, ASIN, Brand, Franchise)
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchesTitle = (item.title || '').toLowerCase().includes(q);
        const matchesAsin = (item.external_product_id || '').toLowerCase().includes(q);
        const matchesBrand = (item.brand || '').toLowerCase().includes(q);
        const matchesFranchise = (item.franchise || item.raw_data?.franchise || '').toLowerCase().includes(q);
        if (!matchesTitle && !matchesAsin && !matchesBrand && !matchesFranchise) return false;
      }

      // Brand filter
      if (filterBrand !== 'all' && item.brand !== filterBrand) return false;

      // Franchise filter
      if (filterFranchise !== 'all') {
        const itemFran = item.franchise || item.raw_data?.franchise || '';
        if (itemFran !== filterFranchise) return false;
      }

      // Category filter
      if (filterCategory !== 'all') {
        const cat = (item.category || item.amazon_category || '').toLowerCase();
        if (!cat.includes(filterCategory.toLowerCase())) return false;
      }

      // Import status filter
      const asin = String(item.external_product_id || '').toUpperCase();
      const isImported = existingCatalogAsins.has(asin) || item.already_imported || item.status === 'imported';
      if (filterImportStatus === 'not_imported' && isImported) return false;
      if (filterImportStatus === 'imported' && !isImported) return false;

      // Image status filter
      const hasImg = hasValidImage(item);
      if (filterImageStatus === 'with_image' && !hasImg) return false;
      if (filterImageStatus === 'no_image' && hasImg) return false;

      // Score filter
      const score = getItemScore(item);
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
    candidates, searchTerm, filterBrand, filterFranchise, filterCategory, 
    filterImportStatus, filterImageStatus, filterMinScore, filterMinPrice, 
    filterMaxPrice, filterAvailability, existingCatalogAsins, hasValidImage, getItemScore
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

    // Handle Top Presets (TOP 10, TOP 30, TOP 50)
    if (topView === 'top10') return list.slice(0, 10);
    if (topView === 'top30') return list.slice(0, 30);
    if (topView === 'top50') return list.slice(0, 50);

    return list;
  }, [filteredCandidates, sortBy, topView, getItemScore, getItemFinancials]);

  // 3. PAGINATION ENGINE
  const effectivePageSize = pageSizeOption === 'custom' ? Math.max(1, customPageSize) : pageSizeOption;
  const totalPages = Math.max(1, Math.ceil(sortedCandidates.length / effectivePageSize));

  // Ensure current page is in bounds
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
    let totalProfit = 0;
    let totalSalePrice = 0;
    let itemsWithoutImage = 0;
    let itemsAlreadyExisting = 0;

    selectedItemsList.forEach(item => {
      const fin = getItemFinancials(item, batchMarkup);
      totalRealCost += fin.realCost;
      totalProfit += fin.estimatedProfit;
      totalSalePrice += fin.finalPrice;
      if (!hasValidImage(item)) itemsWithoutImage++;
      const asin = String(item.external_product_id || '').toUpperCase();
      if (existingCatalogAsins.has(asin)) itemsAlreadyExisting++;
    });

    return {
      count: selectedItemsList.length,
      totalRealCost: Number(totalRealCost.toFixed(2)),
      totalProfit: Number(totalProfit.toFixed(2)),
      totalSalePrice: Number(totalSalePrice.toFixed(2)),
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
        return !existingCatalogAsins.has(asin); // avoid duplicate insert
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

      // Format payload for international_products
      const rowsToInsert = itemsToImport.map(item => {
        const fin = getItemFinancials(item, batchMarkup);
        const rawImgs = extractCandidateImages(item);
        
        return {
          source_provider: 'zinc',
          source_retailer: 'amazon',
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
          product_url_external: item.product_url_external || `https://www.amazon.com/dp/${item.external_product_id}`,
          base_price_usd: fin.amazonPrice,
          amazon_current_price_usd: fin.amazonPrice,
          pricing_mode: pricingSettings?.pricing_mode || 'amazon_price_plus_fee',
          usa_domestic_shipping_usd: 0,
          collectibles_fee_usd: fin.estimatedProfit,
          final_price_usd: fin.finalPrice,
          final_price_uyu: Number((fin.finalPrice * 42.5).toFixed(2)),
          currency: 'USD',
          expected_profit_usd: fin.estimatedProfit,
          real_cost_usd: fin.realCost,
          availability: item.availability || 'available',
          rating: item.rating,
          review_count: item.review_count || 0,
          collectibles_category_id: batchCategory || null,
          gallery_images: rawImgs,
          status: 'pending_review', // Strictly enter as pending_review
          raw_data: item.raw_data || {}
        };
      });

      const { data: inserted, error: insertError } = await supabase
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
        message: `Se importaron ${rowsToInsert.length} productos a PENDING_REVIEW sin publicar automáticamente.`,
        type: 'success'
      });

      // Clear selection and refresh auxiliary data
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
    setFilterImportStatus('all');
    setFilterImageStatus('all');
    setFilterMinScore(0);
    setFilterMinPrice('');
    setFilterMaxPrice('');
    setFilterAvailability('all');
    setTopView('all');
    setCurrentPage(1);
  };

  const isAllVisibleSelected = paginatedCandidates.length > 0 && paginatedCandidates.every(c => selectedIds.has(c.id));

  return (
    <div className="space-y-4">
      {/* 1. CABECERA DE LA MESA (Métricas e Indicadores de Estado) */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="p-2 rounded-xl bg-slate-900 text-white shadow-2xs">
              <Layers className="w-5 h-5 text-pink-400" />
            </span>
            <div>
              <h2 className="text-lg font-black text-gray-900 tracking-tight flex items-center gap-2">
                <span>Mesa de Importación</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold border border-slate-200">
                  {filteredCandidates.length} de {totalFound} productos
                </span>
              </h2>
              <p className="text-xs text-gray-500 font-medium">
                Filtrá, evaluá scores comerciales, seleccioná y enviá lotes a <strong>PENDING_REVIEW</strong>.
              </p>
            </div>
          </div>

          {/* Quick Stats Badges */}
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <div className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl font-medium text-gray-700">
              Encontrados: <strong className="text-gray-900">{totalFound}</strong>
            </div>
            <div className="px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-xl font-medium text-blue-800">
              Nuevos / No importados: <strong>{totalNotImported}</strong>
            </div>
            <div className="px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-xl font-medium text-emerald-800">
              Ya importados: <strong>{totalImported}</strong>
            </div>
            <div className="px-3 py-1.5 bg-rose-50 border border-rose-200 rounded-xl font-medium text-rose-800">
              Sin imagen: <strong>{totalNoImage}</strong>
            </div>
            {totalSelected > 0 && (
              <div className="px-3 py-1.5 bg-pink-50 border border-pink-300 rounded-xl font-bold text-[#f00856] animate-pulse">
                Seleccionados: {totalSelected}
              </div>
            )}
          </div>
        </div>

        {/* TOP PRESETS & CANTIDAD POR PÁGINA */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-gray-100">
          {/* Top Presets */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-bold text-gray-500 uppercase text-[11px] mr-1">VISTA:</span>
            {(['all', 'top10', 'top30', 'top50'] as const).map(preset => (
              <button
                key={preset}
                onClick={() => {
                  setTopView(preset);
                  setCurrentPage(1);
                }}
                className={`px-3 py-1 rounded-lg font-bold transition text-xs ${
                  topView === preset
                    ? 'bg-[#f00856] text-white shadow-2xs'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {preset === 'all' ? 'TODOS' : `TOP ${preset.replace('top', '')}`}
              </button>
            ))}
          </div>

          {/* Quantity Selector */}
          <div className="flex items-center gap-1.5 text-xs flex-wrap">
            <span className="font-bold text-gray-500 uppercase text-[11px] mr-1">MOSTRAR:</span>
            {[10, 25, 50, 100, 250, 500, 1000].map(qty => (
              <button
                key={qty}
                onClick={() => {
                  setPageSizeOption(qty);
                  setCurrentPage(1);
                }}
                className={`px-2.5 py-1 rounded-lg font-bold transition text-xs ${
                  pageSizeOption === qty
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {qty}
              </button>
            ))}
            <div className="flex items-center gap-1 ml-1">
              <button
                onClick={() => {
                  setPageSizeOption('custom');
                  setCurrentPage(1);
                }}
                className={`px-2.5 py-1 rounded-lg font-bold transition text-xs ${
                  pageSizeOption === 'custom'
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Personalizado
              </button>
              {pageSizeOption === 'custom' && (
                <input
                  type="number"
                  min="1"
                  max="2000"
                  value={customPageSize}
                  onChange={e => setCustomPageSize(Math.max(1, Number(e.target.value)))}
                  className="w-16 px-2 py-1 bg-white border border-gray-300 rounded-lg text-xs font-bold text-center"
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 2. BARRA DE FILTROS POTENTE & CHIPS */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs space-y-3">
        {/* Buscador y Dropdowns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
          {/* Search text */}
          <div className="sm:col-span-2 relative">
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
              placeholder="Buscar por título, ASIN, marca, franquicia..."
              className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-[#f00856] focus:bg-white transition"
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
          <div>
            <select
              value={filterBrand}
              onChange={e => { setFilterBrand(e.target.value); setCurrentPage(1); }}
              className="w-full px-2.5 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs font-semibold text-gray-700 focus:bg-white"
            >
              <option value="all">Todas las marcas ({uniqueBrands.length})</option>
              {uniqueBrands.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          {/* Franquicia */}
          <div>
            <select
              value={filterFranchise}
              onChange={e => { setFilterFranchise(e.target.value); setCurrentPage(1); }}
              className="w-full px-2.5 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs font-semibold text-gray-700 focus:bg-white"
            >
              <option value="all">Todas las franquicias</option>
              {uniqueFranchises.map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>

          {/* Ordenar por */}
          <div className="sm:col-span-2">
            <div className="flex items-center gap-1.5">
              <ArrowUpDown className="w-4 h-4 text-gray-400 shrink-0" />
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                className="w-full px-2.5 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs font-bold text-gray-800 focus:bg-white"
              >
                <option value="potential_desc">Ordenar: Mayor Potencial (Score)</option>
                <option value="reviews_desc">Ordenar: Más Reviews</option>
                <option value="price_asc">Ordenar: Menor Precio Amazon</option>
                <option value="price_desc">Ordenar: Mayor Precio Amazon</option>
                <option value="cost_asc">Ordenar: Menor Costo Real</option>
                <option value="profit_desc">Ordenar: Mayor Ganancia USD</option>
                <option value="brand_asc">Ordenar: Marca A-Z</option>
                <option value="franchise_asc">Ordenar: Franquicia A-Z</option>
                <option value="recent">Ordenar: Más Recientes</option>
              </select>
            </div>
          </div>
        </div>

        {/* Chips de Filtros Rápidos */}
        <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-gray-100 text-xs">
          <span className="font-bold text-gray-400 text-[11px]">Filtros Rápidos:</span>

          <button
            onClick={() => setFilterImportStatus(filterImportStatus === 'not_imported' ? 'all' : 'not_imported')}
            className={`px-3 py-1 rounded-full font-bold transition text-xs border ${
              filterImportStatus === 'not_imported'
                ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
            }`}
          >
            No importados
          </button>

          <button
            onClick={() => setFilterImportStatus(filterImportStatus === 'imported' ? 'all' : 'imported')}
            className={`px-3 py-1 rounded-full font-bold transition text-xs border ${
              filterImportStatus === 'imported'
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
            }`}
          >
            Ya importados
          </button>

          <button
            onClick={() => setFilterImageStatus(filterImageStatus === 'with_image' ? 'all' : 'with_image')}
            className={`px-3 py-1 rounded-full font-bold transition text-xs border ${
              filterImageStatus === 'with_image'
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
            }`}
          >
            Con imagen
          </button>

          <button
            onClick={() => setFilterImageStatus(filterImageStatus === 'no_image' ? 'all' : 'no_image')}
            className={`px-3 py-1 rounded-full font-bold transition text-xs border ${
              filterImageStatus === 'no_image'
                ? 'bg-rose-600 text-white border-rose-600 shadow-2xs'
                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
            }`}
          >
            Sin imagen
          </button>

          <button
            onClick={() => setFilterMinScore(filterMinScore === 80 ? 0 : 80)}
            className={`px-3 py-1 rounded-full font-bold transition text-xs border ${
              filterMinScore === 80
                ? 'bg-purple-600 text-white border-purple-600 shadow-2xs'
                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
            }`}
          >
            Score ≥ 80
          </button>

          <button
            onClick={() => setFilterMinScore(filterMinScore === 90 ? 0 : 90)}
            className={`px-3 py-1 rounded-full font-bold transition text-xs border ${
              filterMinScore === 90
                ? 'bg-purple-600 text-white border-purple-600 shadow-2xs'
                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
            }`}
          >
            Score ≥ 90
          </button>

          <button
            onClick={() => setFilterAvailability(filterAvailability === 'prime' ? 'all' : 'prime')}
            className={`px-3 py-1 rounded-full font-bold transition text-xs border ${
              filterAvailability === 'prime'
                ? 'bg-amber-500 text-white border-amber-500 shadow-2xs'
                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
            }`}
          >
            Prime
          </button>

          <button
            onClick={handleClearAllFilters}
            className="ml-auto px-3 py-1 text-xs font-bold text-gray-500 hover:text-rose-600 transition hover:underline"
          >
            LIMPIAR FILTROS
          </button>
        </div>

        {/* Counter of Active Filters */}
        <div className="text-[11px] text-gray-500 font-medium">
          <strong>{filteredCandidates.length}</strong> resultados después de aplicar filtros
        </div>
      </div>

      {/* 3. TABLA PRINCIPAL OPERATIVA */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-xs overflow-hidden">
        {/* Table Selection Action Sub-header */}
        <div className="px-4 py-2.5 bg-slate-50 border-b border-gray-200 flex items-center justify-between text-xs">
          <div className="flex items-center gap-3">
            <button
              onClick={isAllVisibleSelected ? handleDeselectAllVisible : handleSelectAllVisible}
              className="flex items-center gap-1.5 font-bold text-gray-700 hover:text-gray-900"
            >
              {isAllVisibleSelected ? <CheckSquare className="w-4 h-4 text-[#f00856]" /> : <Square className="w-4 h-4 text-gray-400" />}
              <span>Seleccionar todos los visibles ({paginatedCandidates.length})</span>
            </button>

            <span className="text-gray-300">|</span>

            <button
              onClick={handleSelectAllFiltered}
              className="text-xs font-bold text-indigo-600 hover:underline"
            >
              Seleccionar todos los resultados filtrados ({sortedCandidates.length})
            </button>
          </div>

          {selectedIds.size > 0 && (
            <button
              onClick={handleClearSelection}
              className="text-xs font-bold text-gray-500 hover:text-rose-600"
            >
              Deseleccionar todo ({selectedIds.size})
            </button>
          )}
        </div>

        {/* Table element */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100/70 border-b border-gray-200 text-gray-600 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={isAllVisibleSelected}
                    onChange={isAllVisibleSelected ? handleDeselectAllVisible : handleSelectAllVisible}
                    className="rounded text-[#f00856] focus:ring-[#f00856]"
                  />
                </th>
                <th className="py-3 px-3 min-w-[280px]">PRODUCTO</th>
                <th className="py-3 px-3 text-right">PRECIO AMAZON</th>
                <th className="py-3 px-3 text-right">COSTO REAL</th>
                <th className="py-3 px-3 text-center">MARKUP</th>
                <th className="py-3 px-3 text-right">GANANCIA</th>
                <th className="py-3 px-3 text-right">PRECIO VENTA</th>
                <th className="py-3 px-3 text-center">SCORE</th>
                <th className="py-3 px-3 text-center">ESTADO</th>
                <th className="py-3 px-3 text-center">ACCIONES</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="py-16 text-center text-gray-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#f00856] mb-2" />
                    <p className="text-xs font-medium">Cargando candidatos de importación...</p>
                  </td>
                </tr>
              ) : paginatedCandidates.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-16 text-center text-gray-400">
                    <Layers className="w-8 h-8 mx-auto text-gray-300 mb-2" />
                    <p className="text-sm font-bold text-gray-700">No hay productos que coincidan con los filtros</p>
                    <p className="text-xs text-gray-400 mt-1">Probá cambiando los términos de búsqueda o limpiando filtros.</p>
                  </td>
                </tr>
              ) : (
                paginatedCandidates.map(item => {
                  const isSelected = selectedIds.has(item.id);
                  const fin = getItemFinancials(item);
                  const score = getItemScore(item);
                  const status = getItemStatus(item);
                  const candidateImgs = extractCandidateImages(item);

                  return (
                    <tr 
                      key={item.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
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

                      {/* Producto */}
                      <td className="py-3 px-3">
                        <div className="flex items-start gap-3">
                          {/* Image with robust fallback & no black boxes */}
                          <div className="w-14 h-14 shrink-0">
                            <ProductImage
                              src={candidateImgs[0] || item.image_url}
                              alternativeUrls={candidateImgs.slice(1)}
                              alt={item.title}
                              size="md"
                              showMissingBadge
                            />
                          </div>

                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="font-bold text-gray-900 line-clamp-2 leading-tight" title={item.title}>
                              {item.title}
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-gray-500 flex-wrap">
                              <span className="font-bold text-gray-700">{item.brand || 'Collectibles'}</span>
                              {item.franchise && <span>· {item.franchise}</span>}
                              <span className="font-mono text-[10px] text-gray-400">ASIN {item.external_product_id}</span>
                              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded">
                                {item.data_origin === 'LIVE' ? 'Amazon LIVE' : 'Amazon DB'}
                              </span>
                              {item.prime && (
                                <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded">
                                  Prime
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* PRECIO AMAZON */}
                      <td className="py-3 px-3 text-right font-mono font-semibold text-gray-700">
                        USD {fin.amazonPrice.toFixed(2)}
                      </td>

                      {/* COSTO REAL */}
                      <td className="py-3 px-3 text-right font-mono font-semibold text-gray-900">
                        USD {fin.realCost.toFixed(2)}
                      </td>

                      {/* MARKUP */}
                      <td className="py-3 px-3 text-center">
                        <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-800 font-bold rounded text-[11px]">
                          {fin.markupPercent}%
                        </span>
                      </td>

                      {/* GANANCIA */}
                      <td className="py-3 px-3 text-right font-mono font-bold text-emerald-600">
                        USD {fin.estimatedProfit.toFixed(2)}
                      </td>

                      {/* PRECIO VENTA */}
                      <td className="py-3 px-3 text-right font-mono font-black text-gray-900 text-sm">
                        USD {fin.finalPrice.toFixed(2)}
                      </td>

                      {/* SCORE */}
                      <td className="py-3 px-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded font-black text-xs ${
                          score >= 85 ? 'bg-purple-100 text-purple-800' :
                          score >= 70 ? 'bg-emerald-100 text-emerald-800' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {score}
                        </span>
                      </td>

                      {/* ESTADO */}
                      <td className="py-3 px-3 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black border uppercase tracking-wider ${status.bg}`}>
                          {status.label}
                        </span>
                      </td>

                      {/* ACCIONES */}
                      <td className="py-3 px-3 text-center">
                        <button
                          onClick={() => setDetailItem(item)}
                          className="px-2.5 py-1 text-xs font-bold text-gray-700 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
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
              className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-bold disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Anterior</span>
            </button>

            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={validPage >= totalPages}
              className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-bold disabled:opacity-40 disabled:cursor-not-allowed transition"
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

      {/* 5. BARRA PERSISTENTE DE ACCIONES MASIVAS */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-4 inset-x-4 max-w-5xl mx-auto z-40 bg-slate-900 text-white rounded-2xl p-4 shadow-2xl border border-slate-700 flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in slide-in-from-bottom-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#f00856] animate-ping" />
              <span className="font-black text-sm text-pink-300">
                {selectedFinancials.count} PRODUCTOS SELECCIONADOS
              </span>
            </div>

            <div className="text-xs space-x-3 text-slate-300 font-mono">
              <span>Costo real: <strong className="text-white">USD {selectedFinancials.totalRealCost.toFixed(2)}</strong></span>
              <span>Ganancia: <strong className="text-emerald-400">USD {selectedFinancials.totalProfit.toFixed(2)}</strong></span>
              <span>Venta: <strong className="text-white">USD {selectedFinancials.totalSalePrice.toFixed(2)}</strong></span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleClearSelection}
              className="px-3 py-2 text-xs font-bold text-slate-400 hover:text-white"
            >
              Excluir / Limpiar
            </button>

            <button
              onClick={() => setShowBulkReviewModal(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#f00856] hover:bg-[#d0074a] text-white rounded-xl text-xs font-black shadow-lg transition"
            >
              <span>REVISAR E IMPORTAR</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* 6. MODAL DE REVISIÓN PREVIA A LA IMPORTACIÓN */}
      {showBulkReviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-gray-200 shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-5 border-b border-gray-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-base font-black text-gray-900">
                  Revisión antes de Importar ({selectedFinancials.count} productos)
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Verificá categorías, markup y costos antes de ingresar al catálogo administrativo.
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
                  <div className="text-[10px] text-gray-500 font-bold uppercase">Costo total real</div>
                  <div className="text-base font-black text-gray-900 mt-1">USD {selectedFinancials.totalRealCost.toFixed(2)}</div>
                </div>
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-center">
                  <div className="text-[10px] text-emerald-700 font-bold uppercase">Ganancia estimada</div>
                  <div className="text-base font-black text-emerald-600 mt-1">USD {selectedFinancials.totalProfit.toFixed(2)}</div>
                </div>
                <div className="p-3 bg-slate-900 text-white rounded-xl text-center">
                  <div className="text-[10px] text-pink-300 font-bold uppercase">Precio venta total</div>
                  <div className="text-base font-black text-white mt-1">USD {selectedFinancials.totalSalePrice.toFixed(2)}</div>
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

              {/* Batch Actions Form */}
              <div className="space-y-4 pt-3 border-t border-gray-100">
                <div>
                  <label className="font-bold text-gray-900 block mb-1">Asignar Categoría en Lote (Opcional)</label>
                  <select
                    value={batchCategory}
                    onChange={e => setBatchCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs font-semibold"
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

              <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-[11px] leading-relaxed">
                ℹ️ <strong>Estos productos se incorporarán al catálogo administrativo en PENDING_REVIEW.</strong> No serán publicados automáticamente ni comprados en origen.
              </div>
            </div>

            <div className="p-5 border-t border-gray-200 bg-slate-50 flex items-center justify-between">
              <button
                onClick={() => setShowBulkReviewModal(false)}
                className="px-4 py-2 text-xs font-bold text-gray-600 hover:text-gray-900"
              >
                Volver a la Mesa
              </button>

              <button
                onClick={handleExecuteImport}
                disabled={isImporting}
                className="flex items-center gap-2 px-6 py-2.5 bg-[#f00856] hover:bg-[#d0074a] text-white rounded-xl text-xs font-black shadow-md transition disabled:opacity-50"
              >
                {isImporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                <span>IMPORTAR A PENDING_REVIEW</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. DETALLE DEL PRODUCTO (Drawer/Modal) */}
      {detailItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-gray-200 shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-5 border-b border-gray-200 flex items-center justify-between bg-slate-50">
              <div className="min-w-0 pr-4">
                <h3 className="text-base font-black text-gray-900 truncate">{detailItem.title}</h3>
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
                <div className="w-28 h-28 shrink-0">
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
                  <div className="text-gray-500">Reviews: <strong>{detailItem.review_count || 0} ({detailItem.rating ? `${detailItem.rating} ★` : 'Sin calificación'})</strong></div>
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

              {/* SECCIÓN COSTOS Y PRICING */}
              {(() => {
                const fin = getItemFinancials(detailItem);
                return (
                  <div className="border border-gray-200 rounded-2xl p-4 bg-gray-50 space-y-3 font-mono">
                    <div className="text-[11px] font-bold text-gray-700 uppercase font-sans">Desglose Financiero & Costo Real</div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Precio Amazon:</span>
                        <span>USD {fin.amazonPrice.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Zinc Fee:</span>
                        <span>USD {pricingSettings?.zinc_fee_usd ?? 1.00}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Prex % + Fijo:</span>
                        <span>USD {((fin.amazonPrice * (pricingSettings?.financial_fee_percent ?? 2.5)/100) + (pricingSettings?.financial_fee_fixed_usd ?? 0.5)).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-gray-900 border-t pt-1">
                        <span>Costo Real Total:</span>
                        <span>USD {fin.realCost.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-gray-200 grid grid-cols-3 gap-2 text-center">
                      <div className="p-2 bg-white rounded-lg border border-gray-200">
                        <div className="text-[9px] text-gray-500 uppercase font-sans">Markup</div>
                        <div className="font-black text-gray-900">{fin.markupPercent}%</div>
                      </div>
                      <div className="p-2 bg-emerald-50 rounded-lg border border-emerald-200">
                        <div className="text-[9px] text-emerald-700 uppercase font-sans">Ganancia USD</div>
                        <div className="font-black text-emerald-600">USD {fin.estimatedProfit.toFixed(2)}</div>
                      </div>
                      <div className="p-2 bg-slate-900 text-white rounded-lg">
                        <div className="text-[9px] text-pink-300 uppercase font-sans">Precio Venta</div>
                        <div className="font-black text-white">USD {fin.finalPrice.toFixed(2)}</div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* SECCIÓN TIENDAMÍA READY */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
                <div>
                  <div className="font-bold text-gray-900">Comparativa TiendaMía</div>
                  <div className="text-[11px] text-gray-500">Verificación de competitividad de mercado</div>
                </div>
                <span className="px-2.5 py-1 bg-gray-200 text-gray-700 font-bold rounded-lg text-[11px]">
                  TiendaMía: N/D
                </span>
              </div>

              {/* SECCIÓN SOURCING */}
              <div className="border border-gray-200 rounded-2xl p-4 space-y-2">
                <div className="text-[11px] font-bold text-gray-700 uppercase">Inteligencia de Sourcing</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>Score Comercial: <strong>{getItemScore(detailItem)} / 100</strong></div>
                  <div>Origen: <strong>{detailItem.data_origin || 'LIVE'}</strong></div>
                  <div>Seller: <strong>{detailItem.seller || 'Amazon.com'}</strong></div>
                  <div>Disponibilidad: <strong>{detailItem.availability || 'In Stock'}</strong></div>
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-gray-200 bg-slate-50 flex items-center justify-end">
              <button
                onClick={() => setDetailItem(null)}
                className="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl"
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
