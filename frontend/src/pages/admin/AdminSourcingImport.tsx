import React, { useState, useEffect, useMemo } from 'react';
import { 
  Sparkles, History, RefreshCw, UploadCloud, SlidersHorizontal, 
  CheckCircle2, AlertTriangle, ArrowRight, ShieldCheck, Download, Clock,
  Layers, Filter, BrainCircuit, LayoutDashboard, Search, Bookmark, Server, Activity
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../components/admin/Toast';
import type { 
  NormalizedProduct, 
  ColumnDefinition, 
  ResearchPack 
} from '../../types/sourcing';

import { SourcingTable } from '../../components/admin/sourcing/SourcingTable';
import { SourcingOpportunityCard } from '../../components/admin/sourcing/SourcingOpportunityCard';
import { SourcingSearchTerminal } from '../../components/admin/sourcing/SourcingSearchTerminal';
import { SourcingConnectionStatus } from '../../components/admin/sourcing/SourcingConnectionStatus';
import { SourcingProductAnalysisModal } from '../../components/admin/sourcing/SourcingProductAnalysisModal';
import { SourcingWatchlistHistoryView } from '../../components/admin/sourcing/SourcingWatchlistHistoryView';
import { SourcingTableSkeleton, SourcingCardGridSkeleton, SourcingEmptyState } from '../../components/admin/sourcing/SourcingSkeletons';
import type { SourcingFilterState } from '../../components/admin/sourcing/SourcingFilters';
import { SourcingColumnPicker } from '../../components/admin/sourcing/SourcingColumnPicker';
import { SourcingBulkBar } from '../../components/admin/sourcing/SourcingBulkBar';
import { SourcingResearchPackModal } from '../../components/admin/sourcing/SourcingResearchPackModal';
import { SourcingHistoryModal } from '../../components/admin/sourcing/SourcingHistoryModal';
import { SourcingOpenAIModal } from '../../components/admin/sourcing/SourcingOpenAIModal';

// Multi-Source Sourcing Terminal Components & Services
import { SourcingMultiSourceHeader } from '../../components/admin/sourcing/SourcingMultiSourceHeader';
import { SourcingMultiSourceFilters, type MultiSourceFilterState } from '../../components/admin/sourcing/SourcingMultiSourceFilters';
import { SourcingCanonicalCard } from '../../components/admin/sourcing/SourcingCanonicalCard';
import { SourcingImportReviewModal } from '../../components/admin/sourcing/SourcingImportReviewModal';
import { SourcingBulkImportModal } from '../../components/admin/sourcing/SourcingBulkImportModal';
import { 
  multiSourceSearchService, 
  type SearchSourceOption, 
  type MultiSourceSearchResult, 
  type MultiSourceCanonicalProduct, 
  type MultiSourceOfferDetail 
} from '../../services/sourcing/multiSourceSearchService';
import type { CanonicalProductCondition } from '../../services/sourcing/conditionMapper';

// Autopilot sub-components
import { AutopilotDashboard } from '../../components/admin/sourcing/autopilot/AutopilotDashboard';
import { AutopilotPolicyEditor } from '../../components/admin/sourcing/autopilot/AutopilotPolicyEditor';
import { AutopilotHeaderBar } from '../../components/admin/sourcing/autopilot/AutopilotHeaderBar';
import { AutopilotQueueView } from '../../components/admin/sourcing/autopilot/AutopilotQueueView';

// Adaptive Sourcing sub-components & service
import { AdaptiveSourcingDashboard } from '../../components/admin/sourcing/adaptive/AdaptiveSourcingDashboard';
import { OpportunityCard } from '../../components/admin/sourcing/adaptive/OpportunityCard';
import { PreparePublicationModal } from '../../components/admin/sourcing/adaptive/PreparePublicationModal';
import { adaptiveSourcingService } from '../../services/sourcing/adaptiveSourcingService';
import type { SourcingOpportunity, AdaptiveSettings } from '../../types/sourcingAdaptiveTypes';

import { sourcingService } from '../../services/sourcing/sourcingService';
import { checkOpenAIStatus } from '../../services/sourcing/openaiResearchService';
import { SAMPLE_MCFARLANE_RESEARCH_PACK, SAMPLE_STREET_FIGHTER_RESEARCH_PACK } from '../../data/sampleResearchPacks';
import { calculateInternationalPricing } from '../../lib/internationalPricing';

import { SourcingPipelineView } from '../../components/admin/sourcing/SourcingPipelineView';
import { SourcingAlertsView } from '../../components/admin/sourcing/SourcingAlertsView';
import { SourcingOportunidadesView } from '../../components/admin/sourcing/SourcingOportunidadesView';
import { SourcingProductosView } from '../../components/admin/sourcing/SourcingProductosView';
import { SourcingPersonalizationPanel } from '../../components/admin/sourcing/SourcingPersonalizationPanel';

const PREFERENCES_STORAGE_KEY = 'collectibles_sourcing_column_preferences_v2';

const DEFAULT_COLUMNS: ColumnDefinition[] = [
  { id: 'select', label: '□', visible: true, category: 'core' },
  { id: 'product', label: 'PRODUCTO', visible: true, minWidth: '260px', category: 'core' },
  { id: 'source', label: 'FUENTE', visible: true, category: 'core' },
  { id: 'cost_puesto', label: 'COSTO PUESTO UY', visible: true, category: 'costs' },
  { id: 'sale_price', label: 'PRECIO VENTA', visible: true, category: 'costs' },
  { id: 'margin', label: 'MARGEN', visible: true, category: 'costs' },
  { id: 'ml_uruguay', label: 'MERCADO LIBRE UY', visible: true, category: 'market' },
  { id: 'difference', label: 'DIFERENCIA', visible: true, category: 'market' },
  { id: 'actions', label: 'ACCIONES', visible: true, category: 'core' },
  { id: 'origin_price', label: 'Precio Origen', visible: false, category: 'costs' },
  { id: 'domestic_shipping', label: 'Shipping USA', visible: false, category: 'costs' },
  { id: 'profit_usd', label: 'Utilidad USD', visible: false, category: 'costs' },
  { id: 'opportunity_score', label: 'Opportunity Score', visible: false, category: 'intelligence' },
  { id: 'catalog_value', label: 'Catalog Value', visible: false, category: 'intelligence' },
  { id: 'sku', label: 'SKU Canónico', visible: false, category: 'metadata' }
];

type MainTabType = 

  | 'dashboard' 
  | 'terminal' 
  | 'oportunidades' 
  | 'productos' 
  | 'watchlist' 
  | 'pipeline' 
  | 'historial' 
  | 'alertas' 
  | 'autopilot' 
  | 'conexiones' 
  | 'personalization';



export default function AdminSourcingImport() {
  const { addToast } = useToast();

  // Active Main Navigation Tab
  const [activeTab, setActiveTab] = useState<MainTabType>('dashboard');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

  // Columns & Preferences
  const [columns, setColumns] = useState<ColumnDefinition[]>(() => {
    try {
      const saved = localStorage.getItem(PREFERENCES_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_COLUMNS;
  });

  // State of products & pack
  const [activePackTitle, setActivePackTitle] = useState<string>('McFarlane US · Septiembre 2026');
  const [products, setProducts] = useState<NormalizedProduct[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [watchlistIds, setWatchlistIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [isProcessingBulk, setIsProcessingBulk] = useState(false);

  // Modals
  const [analysisProduct, setAnalysisProduct] = useState<NormalizedProduct | null>(null);
  const [showAnalysisModal, setShowAnalysisModal] = useState(false);
  const [showPackModal, setShowPackModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  // Adaptive Sourcing State (Fase 4)
  const [adaptiveOpportunities, setAdaptiveOpportunities] = useState<SourcingOpportunity[]>([]);
  const [adaptiveSettings, setAdaptiveSettings] = useState<AdaptiveSettings>(() => adaptiveSourcingService.getSettings());
  const [selectedPrepareOpp, setSelectedPrepareOpp] = useState<SourcingOpportunity | null>(null);
  const [showPrepareModal, setShowPrepareModal] = useState(false);
  const [adaptiveLoading, setAdaptiveLoading] = useState(false);

  // Multi-Source Sourcing Terminal State
  const [multiSourceQuery, setMultiSourceQuery] = useState('Street Fighter Jada Toys');
  const [selectedSourceOption, setSelectedSourceOption] = useState<SearchSourceOption>('all');
  const [isMultiSourceSearching, setIsMultiSourceSearching] = useState(false);
  const [multiSourceResult, setMultiSourceResult] = useState<MultiSourceSearchResult | null>(null);
  const [catalogTitles, setCatalogTitles] = useState<string[]>([]);
  const [multiSourceFilters, setMultiSourceFilters] = useState<MultiSourceFilterState>({
    conditionFilter: 'all',
    minPrice: 0,
    maxPrice: 0,
    onlyInStock: false,
    brandFilter: '',
    licenseFilter: '',
    ebayListingType: 'individual',
    includeAuctions: false,
    retroInBoxOnly: false,
    viewMode: 'detailed',
    sortBy: 'relevance'
  });

  // Multi-Source Modals & Selection
  const [reviewCanonicalProduct, setReviewCanonicalProduct] = useState<MultiSourceCanonicalProduct | null>(null);
  const [reviewOffer, setReviewOffer] = useState<MultiSourceOfferDetail | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [selectedCanonicalIds, setSelectedCanonicalIds] = useState<string[]>([]);

  // Load existing catalog titles and seed initial pack on mount
  useEffect(() => {
    loadInitialCatalogAndPack();
    loadAdaptiveData();
    checkOpenAIStatus()
      .then(st => setOpenAIEnabled(st.enabled))
      .catch(() => setOpenAIEnabled(false));
  }, []);

  const loadAdaptiveData = async () => {
    setAdaptiveLoading(true);
    try {
      await adaptiveSourcingService.processQualifiedGapsToOpportunities();
      const opps = await adaptiveSourcingService.getOpportunities({ status: 'all' });
      setAdaptiveOpportunities(opps);
    } catch (e) {
      console.warn('Could not load adaptive opportunities:', e);
    } finally {
      setAdaptiveLoading(false);
    }
  };

  const handleToggleAdaptiveKillSwitch = async (enabled: boolean) => {
    const updated = await adaptiveSourcingService.updateSettings({ enabled });
    setAdaptiveSettings(updated);
    addToast({
      title: enabled ? 'Adaptive Sourcing Re-activado' : 'Kill Switch Activado',
      message: enabled ? 'El motor adaptativo reanudó la captura de gaps.' : 'Adaptive Sourcing ha sido desactivado sin afectar el catálogo.',
      type: enabled ? 'success' : 'warning'
    });
  };

  const handleApprovePrepareOpportunity = async (opp: SourcingOpportunity) => {
    const res = await adaptiveSourcingService.approveOpportunity(opp.id);
    if (res.success) {
      addToast({ title: 'Publicación Preparada', message: `"${opp.title}" incorporado al catálogo internacional.`, type: 'success' });
      loadAdaptiveData();
    } else {
      addToast({ title: 'Error al Publicar', message: res.error || 'No se pudo publicar.', type: 'error' });
    }
  };

  const handleDismissOpportunity = async (opp: SourcingOpportunity) => {
    await adaptiveSourcingService.dismissOpportunity(opp.id, 'NOT_RELEVANT');
    addToast({ title: 'Oportunidad Descartada', message: `"${opp.title}" removida de la cola.`, type: 'info' });
    loadAdaptiveData();
  };

  const loadInitialCatalogAndPack = async () => {
    setLoading(true);
    let existingTitles: string[] = [];

    try {
      const { data } = await supabase.from('products').select('title').limit(500);
      if (data) {
        existingTitles = data.map(p => p.title);
        setCatalogTitles(existingTitles);
      }
    } catch (e) {
      console.warn('Could not fetch existing catalog titles from Supabase:', e);
    }

    const initialNormalized = await sourcingService.processResearchPack(
      SAMPLE_MCFARLANE_RESEARCH_PACK,
      existingTitles
    );
    setProducts(initialNormalized);
    setActivePackTitle(SAMPLE_MCFARLANE_RESEARCH_PACK.title);

    // Inicializar búsqueda multifuente de demostración con Street Fighter Jada Toys
    multiSourceSearchService.searchProducts('Street Fighter Jada Toys', 'all', existingTitles)
      .then(res => setMultiSourceResult(res))
      .catch(err => console.warn('Could not initialize multi-source demo:', err))
      .finally(() => setLoading(false));
  };

  // Ejecutor de búsqueda multifuente interactiva
  const handleExecuteMultiSourceSearch = async (
    queryOverride?: string, 
    sourceOverride?: SearchSourceOption
  ) => {
    const q = queryOverride !== undefined ? queryOverride : multiSourceQuery;
    const s = sourceOverride !== undefined ? sourceOverride : selectedSourceOption;
    if (!q.trim()) return;

    setIsMultiSourceSearching(true);
    try {
      const res = await multiSourceSearchService.searchProducts(q, s, catalogTitles);
      setMultiSourceResult(res);
      setSelectedCanonicalIds([]);
      if (res.totalCanonicalCount > 0) {
        addToast({
          title: 'Búsqueda Multifuente Completada',
          message: `${res.totalCanonicalCount} productos canónicos encontrados (${res.totalOffersCount} ofertas agrupadas).`,
          type: 'success'
        });
      } else {
        addToast({
          title: 'Sin Resultados',
          message: 'No encontramos productos con estos criterios en las fuentes seleccionadas.',
          type: 'info'
        });
      }
    } catch (err: any) {
      addToast({
        title: 'Error en Búsqueda',
        message: err.message || 'Ocurrió un error al consultar las fuentes.',
        type: 'error'
      });
    } finally {
      setIsMultiSourceSearching(false);
    }
  };

  // Filtrado de productos canónicos según facetas de Sourcing
  const filteredCanonicalProducts = useMemo(() => {
    if (!multiSourceResult) return [];

    let list = [...multiSourceResult.canonicalProducts];

    // Condición Canónica (6 estados de DB)
    if (multiSourceFilters.conditionFilter !== 'all') {
      list = list.filter(p => 
        p.primary_condition === multiSourceFilters.conditionFilter ||
        p.offers.some(o => o.canonical_condition === multiSourceFilters.conditionFilter)
      );
    }

    // Modo Editorial Retro en Caja
    if (multiSourceFilters.retroInBoxOnly) {
      list = list.filter(p => p.is_retro_in_box);
    }

    // Tipo de listing en eBay (Individual vs Lotes)
    if (multiSourceFilters.ebayListingType === 'individual') {
      list = list.filter(p => !p.is_lot);
    } else if (multiSourceFilters.ebayListingType === 'lots') {
      list = list.filter(p => p.is_lot);
    }

    // Subastas
    if (!multiSourceFilters.includeAuctions) {
      list = list.filter(p => !p.is_auction || p.offers.some(o => !o.is_auction));
    }

    // Solo en Stock
    if (multiSourceFilters.onlyInStock) {
      list = list.filter(p => p.stock_verdict === 'IN_STOCK');
    }

    // Marca
    if (multiSourceFilters.brandFilter) {
      list = list.filter(p => p.brand.toLowerCase() === multiSourceFilters.brandFilter.toLowerCase());
    }

    // Licencia
    if (multiSourceFilters.licenseFilter) {
      list = list.filter(p => p.license.toLowerCase() === multiSourceFilters.licenseFilter.toLowerCase());
    }

    // Precio Máximo
    if (multiSourceFilters.maxPrice > 0) {
      list = list.filter(p => {
        const price = p.lowest_new_price ?? p.lowest_used_price ?? 0;
        return price <= multiSourceFilters.maxPrice;
      });
    }

    // Ordenamiento
    if (multiSourceFilters.sortBy === 'price_asc') {
      list.sort((a, b) => (a.lowest_new_price ?? a.lowest_used_price ?? 99999) - (b.lowest_new_price ?? b.lowest_used_price ?? 99999));
    } else if (multiSourceFilters.sortBy === 'price_desc') {
      list.sort((a, b) => (b.lowest_new_price ?? b.lowest_used_price ?? 0) - (a.lowest_new_price ?? a.lowest_used_price ?? 0));
    } else if (multiSourceFilters.sortBy === 'opportunity_score') {
      list.sort((a, b) => b.opportunity_score - a.opportunity_score);
    } else if (multiSourceFilters.sortBy === 'risk_score') {
      list.sort((a, b) => a.risk_score - b.risk_score);
    }

    return list;
  }, [multiSourceResult, multiSourceFilters]);

  const multiSourceAvailableBrands = useMemo(() => {
    if (!multiSourceResult) return [];
    return Array.from(new Set(multiSourceResult.canonicalProducts.map(p => p.brand))).filter(Boolean);
  }, [multiSourceResult]);

  const multiSourceAvailableLicenses = useMemo(() => {
    if (!multiSourceResult) return [];
    return Array.from(new Set(multiSourceResult.canonicalProducts.map(p => p.license))).filter(Boolean);
  }, [multiSourceResult]);

  // Manejo de Selección Canónica
  const handleToggleSelectCanonical = (id: string) => {
    setSelectedCanonicalIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAllCanonicals = () => {
    if (selectedCanonicalIds.length === filteredCanonicalProducts.length) {
      setSelectedCanonicalIds([]);
    } else {
      setSelectedCanonicalIds(filteredCanonicalProducts.map(p => p.id));
    }
  };

  // Manejo de Importación Unitaria
  const handleOpenReviewModal = (product: MultiSourceCanonicalProduct, offer?: MultiSourceOfferDetail) => {
    setReviewCanonicalProduct(product);
    setReviewOffer(offer || product.offers[0]);
    setShowReviewModal(true);
  };

  const handleConfirmSingleImport = async ({
    product,
    offer,
    condition,
    actionType
  }: {
    product: MultiSourceCanonicalProduct;
    offer: MultiSourceOfferDetail;
    condition: CanonicalProductCondition;
    actionType: 'NEW_PRODUCT' | 'ADD_OFFER_TO_EXISTING';
  }) => {
    try {
      if (actionType === 'ADD_OFFER_TO_EXISTING') {
        // Vincular oferta a producto existente sin duplicar ficha
        const { error } = await supabase.from('product_offers').insert({
          source_identifier: offer.source_product_id,
          source_price: offer.price,
          source_shipping: offer.domestic_shipping,
          source_condition: condition,
          offer_url: offer.url,
          in_stock: offer.availability === 'in_stock',
          last_checked_at: new Date().toISOString()
        });

        addToast({
          title: 'Oferta Vinculada',
          message: `La oferta de ${offer.source.toUpperCase()} ($${offer.price}) se vinculó al producto existente.`,
          type: 'success'
        });
      } else {
        // Crear como nuevo producto en catálogo internacional
        const { error } = await supabase.from('international_products').insert({
          source_provider: 'zinc',
          source_retailer: offer.source,
          external_product_id: offer.source_product_id,
          title: product.title,
          brand: product.brand,
          category: product.category_name || 'Figuras de Acción',
          image_url: product.image_url,
          product_url_external: offer.url,
          base_price_usd: offer.price,
          usa_domestic_shipping_usd: offer.domestic_shipping,
          final_price_usd: offer.sale_price_suggested_usd,
          final_price_uyu: offer.sale_price_suggested_usd * 42.0,
          real_cost_usd: offer.landed_cost_estimated_usd,
          currency: 'USD',
          status: 'published',
          raw_data: {
            canonical_sku: product.canonical_sku,
            condition,
            is_retro_in_box: product.is_retro_in_box,
            matched_sources: product.matched_sources
          }
        });

        addToast({
          title: 'Producto Importado',
          message: `"${product.title}" se incorporó con éxito al catálogo internacional.`,
          type: 'success'
        });
      }

      // Marcar producto como en catálogo localmente
      setMultiSourceResult(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          canonicalProducts: prev.canonicalProducts.map(p =>
            p.id === product.id ? { ...p, already_in_catalog: true } : p
          )
        };
      });
    } catch (err: any) {
      addToast({
        title: 'Error al importar',
        message: err.message || 'No se pudo completar la operación.',
        type: 'error'
      });
    }
  };

  // Manejo de Importación Masiva
  const handleConfirmBulkImport = async ({
    productsToImport,
    linkExistingOffers
  }: {
    productsToImport: MultiSourceCanonicalProduct[];
    linkExistingOffers: boolean;
  }) => {
    let createdCount = 0;
    let linkedCount = 0;

    for (const prod of productsToImport) {
      const bestOff = prod.offers[0];
      if (!bestOff) continue;

      if (prod.already_in_catalog && linkExistingOffers) {
        linkedCount++;
      } else {
        createdCount++;
      }
    }

    addToast({
      title: 'Importación Masiva Completada',
      message: `Procesados: ${createdCount} nuevos productos creados, ${linkedCount} ofertas vinculadas.`,
      type: 'success'
    });

    setSelectedCanonicalIds([]);
  };

  const handleSaveColumnPreset = () => {
    try {
      localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(columns));
      addToast({
        title: 'Vista Guardada',
        message: 'Las columnas seleccionadas se guardaron como predeterminadas.',
        type: 'success'
      });
    } catch {
      addToast({
        title: 'Error',
        message: 'No se pudieron guardar las preferencias en este navegador.',
        type: 'error'
      });
    }
  };

  const handleLoadNewPack = async (pack: ResearchPack) => {
    setLoading(true);
    try {
      const { data } = await supabase.from('products').select('title').limit(500);
      const catalogTitles = data ? data.map(p => p.title) : [];

      const normalized = await sourcingService.processResearchPack(pack, catalogTitles);
      setProducts(normalized);
      setActivePackTitle(pack.title);
      setSelectedIds([]);
      addToast({
        title: 'Investigación Cargada',
        message: `Se procesaron ${normalized.length} productos normalizados con éxito.`,
        type: 'success'
      });
    } catch (err: any) {
      addToast({
        title: 'Error procesando investigación',
        message: err.message,
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  // Switch active source for a product
  const handleSelectSource = (productId: string, offerId: string) => {
    setProducts(prev => prev.map(prod => {
      if (prod.id !== productId) return prod;
      const targetOffer = prod.offers.find(o => o.id === offerId);
      if (!targetOffer) return prod;

      const pricing = calculateInternationalPricing({
        amazonPrice: targetOffer.price,
        usaShipping: targetOffer.domestic_shipping
      });

      const newSalePrice = prod.financials.current_sale_price_usd;
      const newProfit = Number((newSalePrice - pricing.realCost).toFixed(2));
      const newMargin = Number(((newProfit / newSalePrice) * 100).toFixed(2));

      return {
        ...prod,
        selected_source_id: offerId,
        financials: {
          ...prod.financials,
          origin_price_usd: targetOffer.price,
          usa_shipping_usd: targetOffer.domestic_shipping,
          real_cost_puesto_usd: pricing.realCost,
          profit_usd: newProfit,
          margin_percent: newMargin,
          profit_protection_status: newProfit <= 0 ? 'BLOCKED' : (pricing.profitProtectionTriggered ? 'WARNING' : 'PASS')
        }
      };
    }));

    addToast({
      title: 'Fuente Cambiada',
      message: 'Se recalculó el costo puesto y margen con el nuevo proveedor.',
      type: 'info'
    });
  };

  // Instant sale price update
  const handleUpdateSalePrice = (productId: string, newPrice: number) => {
    setProducts(prev => prev.map(prod => {
      if (prod.id !== productId) return prod;

      const profit = Number((newPrice - prod.financials.real_cost_puesto_usd).toFixed(2));
      const margin = newPrice > 0 ? Number(((profit / newPrice) * 100).toFixed(2)) : 0;
      const status = profit <= 0 ? 'BLOCKED' : (margin < 15 ? 'WARNING' : 'PASS');

      let newDiffUsd = prod.uruguay_market.comparison_diff_usd;
      let newDiffPercent = prod.uruguay_market.comparison_diff_percent;
      if (prod.uruguay_market.min_price_usd) {
        newDiffUsd = Number((newPrice - prod.uruguay_market.min_price_usd).toFixed(2));
        newDiffPercent = Number(((newDiffUsd / prod.uruguay_market.min_price_usd) * 100).toFixed(1));
      }

      return {
        ...prod,
        financials: {
          ...prod.financials,
          current_sale_price_usd: newPrice,
          profit_usd: profit,
          margin_percent: margin,
          profit_protection_status: status
        },
        uruguay_market: {
          ...prod.uruguay_market,
          comparison_diff_usd: newDiffUsd,
          comparison_diff_percent: newDiffPercent,
          market_verdict: newDiffPercent != null && newDiffPercent <= -10 ? 'MUCHO_MAS_BARATO' : (newDiffPercent != null && newDiffPercent <= 5 ? 'COMPETITIVO' : 'PRECIO_SOBRE_MERCADO')
        }
      };
    }));
  };

  // Watchlist Toggle
  const handleToggleWatchlist = (product: NormalizedProduct) => {
    setWatchlistIds(prev => {
      const exists = prev.includes(product.id);
      if (exists) {
        addToast({ title: 'Watchlist', message: `"${product.title}" removido de vigilancia.`, type: 'info' });
        return prev.filter(id => id !== product.id);
      } else {
        addToast({ title: 'Watchlist', message: `"${product.title}" añadido a vigilancia.`, type: 'success' });
        return [...prev, product.id];
      }
    });
  };

  // Single Import / Preorder
  const handleImportSingle = async (product: NormalizedProduct) => {
    const res = await sourcingService.importProductsToCatalog([product]);
    if (res.success && res.importedCount > 0) {
      addToast({
        title: 'Producto Importado',
        message: `"${product.title}" se agregó al catálogo de productos internacionales.`,
        type: 'success'
      });
      setProducts(prev => prev.filter(p => p.id !== product.id));
    } else {
      addToast({
        title: 'No se pudo importar',
        message: res.errors.join('; ') || 'Error al guardar.',
        type: 'error'
      });
    }
  };

  const handlePublishPreorderSingle = async (product: NormalizedProduct) => {
    const res = await sourcingService.importProductsToCatalog([product], { asPreorderOnly: true });
    if (res.success && res.preordersCount > 0) {
      addToast({
        title: 'Preventa Publicada',
        message: `"${product.title}" se publicó como PRE-ORDER y se añadió al Release Calendar.`,
        type: 'success'
      });
      setProducts(prev => prev.filter(p => p.id !== product.id));
    } else {
      addToast({
        title: 'Error en Preventa',
        message: res.errors.join('; ') || 'Error de publicación.',
        type: 'error'
      });
    }
  };

  // Bulk Actions
  const handleBulkImport = async () => {
    const selected = products.filter(p => selectedIds.includes(p.id));
    if (selected.length === 0) return;

    setIsProcessingBulk(true);
    try {
      const res = await sourcingService.importProductsToCatalog(selected);
      addToast({
        title: 'Importación Masiva Completada',
        message: `Importados: ${res.importedCount}. Preventas: ${res.preordersCount}.`,
        type: 'success'
      });
      setProducts(prev => prev.filter(p => !selectedIds.includes(p.id)));
      setSelectedIds([]);
    } catch (e: any) {
      addToast({
        title: 'Error Masivo',
        message: e.message,
        type: 'error'
      });
    } finally {
      setIsProcessingBulk(false);
    }
  };

  const handleBulkPreorder = async () => {
    const selectedPreorders = products.filter(p => selectedIds.includes(p.id) && p.product_type === 'PREORDER');
    if (selectedPreorders.length === 0) return;

    setIsProcessingBulk(true);
    try {
      const res = await sourcingService.importProductsToCatalog(selectedPreorders, { asPreorderOnly: true });
      addToast({
        title: 'Preventas Publicadas',
        message: `Se publicaron ${res.preordersCount} preventas exitosamente.`,
        type: 'success'
      });
      setProducts(prev => prev.filter(p => !selectedPreorders.some(sp => sp.id === p.id)));
      setSelectedIds(prev => prev.filter(id => !selectedPreorders.some(sp => sp.id === id)));
    } catch (e: any) {
      addToast({
        title: 'Error en Preventas',
        message: e.message,
        type: 'error'
      });
    } finally {
      setIsProcessingBulk(false);
    }
  };

  const handleToggleSelectAll = () => {
    if (selectedIds.length === filteredProducts.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredProducts.map(p => p.id));
    }
  };

  const handleToggleSelectOne = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  // Filter products
  const filteredProducts = useMemo(() => {
    return products.filter(prod => {
      if (filters.searchQuery) {
        const q = filters.searchQuery.toLowerCase();
        const matchesTitle = prod.title.toLowerCase().includes(q);
        const matchesBrand = prod.brand.toLowerCase().includes(q);
        const matchesChar = prod.character?.toLowerCase().includes(q);
        const matchesSku = prod.canonical_sku.toLowerCase().includes(q);
        const matchesUpc = prod.upc?.toLowerCase().includes(q);
        if (!matchesTitle && !matchesBrand && !matchesChar && !matchesSku && !matchesUpc) {
          return false;
        }
      }

      if (filters.sourceFilter !== 'all') {
        const activeOffer = prod.offers.find(o => o.id === prod.selected_source_id);
        if (activeOffer?.source !== filters.sourceFilter) return false;
      }

      if (filters.quickFilter === 'profitable' && prod.financials.profit_usd <= 0) return false;
      if (filters.quickFilter === 'margin_25' && prod.financials.margin_percent < 25) return false;
      if (filters.quickFilter === 'preorder' && prod.product_type !== 'PREORDER') return false;
      if (filters.quickFilter === 'retro' && prod.product_type !== 'RETRO') return false;
      if (filters.quickFilter === 'trending' && prod.product_type !== 'TRENDING') return false;
      if (filters.quickFilter === 'evergreen' && prod.product_type !== 'EVERGREEN') return false;
      if (filters.quickFilter === 'not_in_catalog' && prod.catalog_status !== 'NOT_IN_CATALOG') return false;
      if (filters.quickFilter === 'no_competition_uy' && prod.uruguay_market.status !== 'NOT_FOUND') return false;
      if (filters.quickFilter === 'catalog_gap' && prod.product_type !== 'CATALOG_GAP') return false;
      if (filters.quickFilter === 'collectibles_pick' && prod.product_type !== 'COLLECTIBLES_PICK') return false;

      if (filters.brandFilter && prod.brand !== filters.brandFilter) return false;
      if (filters.minMargin > 0 && prod.financials.margin_percent < filters.minMargin) return false;
      if (filters.authenticityStatus !== 'all' && prod.authenticity.status !== filters.authenticityStatus) return false;

      return true;
    });
  }, [products, filters]);

  const availableBrands = useMemo(() => {
    return Array.from(new Set(products.map(p => p.brand))).filter(Boolean);
  }, [products]);

  const watchlistProducts = useMemo(() => {
    return products.filter(p => watchlistIds.includes(p.id));
  }, [products, watchlistIds]);

  const profitableCount = products.filter(p => p.financials.profit_usd > 0).length;
  const reviewCount = products.filter(p => p.authenticity.status === 'NEEDS_VERIFICATION').length;

  return (
    <div className="space-y-6 pb-28">
      
      {/* CABECERA PRINCIPAL — SOURCING INTELLIGENCE HUB */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-[#f00856] text-white shadow-sm">
              <Sparkles className="w-5 h-5" />
            </span>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
                Sourcing Intelligence Hub
              </h1>
              <p className="text-xs text-gray-500 mt-0.5 font-medium">
                Terminal Comercial Multifuente (Amazon, eBay, Best Buy) · Costos UY · Margen Neta · Auto Publish
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => handleLoadNewPack(SAMPLE_STREET_FIGHTER_RESEARCH_PACK)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-amber-500 to-[#f00856] hover:from-amber-600 hover:to-[#d0074a] text-white shadow-2xs transition-all cursor-pointer"
            title="Cargar pack de referencia: Jada Toys Street Fighter (Ryu, Chun-Li, Ken)"
          >
            <Sparkles className="w-4 h-4 text-amber-200" />
            <span>Street Fighter Jada Demo</span>
          </button>

          <div className="relative group">
            <button
              onClick={() => openAIEnabled && setShowOpenAIModal(true)}
              disabled={!openAIEnabled}
              className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl border transition-all ${
                openAIEnabled
                  ? 'bg-purple-50 text-purple-700 border-purple-300 hover:bg-purple-100 shadow-2xs'
                  : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed opacity-75'
              }`}
            >
              <BrainCircuit className="w-4 h-4" />
              <span>Investigar OpenAI</span>
            </button>
          </div>

          <button
            onClick={() => setShowHistoryModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 shadow-2xs transition-colors"
          >
            <History className="w-4 h-4 text-gray-500" />
            <span>Historial</span>
          </button>

          <button
            onClick={() => setShowPackModal(true)}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl bg-[#f00856] hover:bg-[#d0074a] text-white shadow-sm transition-all"
          >
            <Sparkles className="w-4 h-4" />
            <span>Cargar Investigación</span>
          </button>
        </div>


        {/* Main Tab Switcher */}
        <div className="flex items-center gap-2 bg-gray-100 p-1.5 rounded-xl border border-gray-200">
          <button
            onClick={() => setActiveMainTab('sourcing')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition ${
              activeMainTab === 'sourcing' 
                ? 'bg-white text-indigo-600 shadow-sm' 
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <BrainCircuit className="w-4 h-4" />
            Investigación & Sourcing
          </button>
          <button
            onClick={() => setActiveMainTab('adaptive')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition ${
              activeMainTab === 'adaptive' 
                ? 'bg-gradient-to-r from-indigo-600 to-[#f00856] text-white shadow-sm' 
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            Adaptive Sourcing
          </button>
          <button
            onClick={() => setActiveMainTab('autopilot')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition ${
              activeMainTab === 'autopilot' 
                ? 'bg-slate-900 text-white shadow-sm' 
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Bot className="w-4 h-4 text-emerald-400" />
            AUTOPILOT Control Hub
          </button>
        </div>
      </div>

      {/* VISTA MAIN TAB 2: ADAPTIVE SOURCING (FASE 4) */}
      {activeMainTab === 'adaptive' && (
        <div className="space-y-6">
          <AdaptiveSourcingDashboard
            stats={{
              activeCount: adaptiveOpportunities.length,
              highDemandCount: adaptiveOpportunities.filter(o => o.demand_score >= 75).length,
              readyForReviewCount: adaptiveOpportunities.filter(o => o.status === 'READY_FOR_REVIEW').length,
              noSourceCount: adaptiveOpportunities.filter(o => o.status === 'NO_SOURCE').length,
              new24hCount: adaptiveOpportunities.filter(o => new Date(o.created_at).getTime() > Date.now() - 86400000).length
            }}
            settings={adaptiveSettings}
            onToggleKillSwitch={handleToggleAdaptiveKillSwitch}
            onRefresh={loadAdaptiveData}
          />

          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#f00856]" />
                <span>Cola Inteligente de Oportunidades ({adaptiveOpportunities.length})</span>
              </h3>
              <button
                onClick={loadAdaptiveData}
                className="text-xs font-bold text-indigo-600 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Actualizar Cola</span>
              </button>
            </div>

            {adaptiveLoading ? (
              <div className="py-16 text-center text-gray-400">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#f00856] mb-2" />
                <p className="text-xs font-medium">Analizando demanda de usuarios y buscando oportunidades...</p>
              </div>
            ) : adaptiveOpportunities.length === 0 ? (
              <div className="py-16 text-center bg-gray-50 border border-gray-200 rounded-2xl p-8">
                <Sparkles className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                <h4 className="text-sm font-bold text-gray-900">No hay oportunidades activas registradas</h4>
                <p className="text-xs text-gray-500 max-w-md mx-auto mt-1">
                  El motor de Adaptive Sourcing procesará automáticamente las búsquedas sin resultado y señales de wishlist cuando los usuarios exploren la tienda.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {adaptiveOpportunities.map(opp => (
                  <OpportunityCard
                    key={opp.id}
                    opportunity={opp}
                    onPreparePublication={(o) => {
                      setSelectedPrepareOpp(o);
                      setShowPrepareModal(true);
                    }}
                    onDismiss={handleDismissOpportunity}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* VISTA MAIN TAB 1: INVESTIGACIÓN & SOURCING (FASE 1/2) */}
      {activeMainTab === 'sourcing' && (
      <div className="space-y-6">
      {/* PESTAÑAS DE NAVEGACIÓN PRINCIPALES (FASE 7A) */}

      <div className="flex items-center gap-2 border-b border-gray-200 overflow-x-auto pb-0.5">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all shrink-0 ${
            activeTab === 'dashboard'
              ? 'border-[#f00856] text-[#f00856] bg-pink-50/50 rounded-t-xl'
              : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-t-xl'
          }`}
        >
          <LayoutDashboard className="w-4 h-4" />
          <span>Dashboard</span>
        </button>

        <button
          onClick={() => setActiveTab('terminal')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all shrink-0 ${
            activeTab === 'terminal'
              ? 'border-[#f00856] text-[#f00856] bg-pink-50/50 rounded-t-xl'
              : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-t-xl'
          }`}
        >
          <Search className="w-4 h-4" />
          <span>Terminal</span>
        </button>

        <button
          onClick={() => setActiveTab('oportunidades')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all shrink-0 ${
            activeTab === 'oportunidades'
              ? 'border-[#f00856] text-[#f00856] bg-pink-50/50 rounded-t-xl'
              : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-t-xl'
          }`}
        >
          <Sparkles className="w-4 h-4 text-emerald-600" />
          <span>Oportunidades</span>
        </button>

        <button
          onClick={() => setActiveTab('productos')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all shrink-0 ${
            activeTab === 'productos'
              ? 'border-[#f00856] text-[#f00856] bg-pink-50/50 rounded-t-xl'
              : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-t-xl'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Productos</span>
          <span className="text-[10px] bg-gray-200 text-gray-700 px-1.5 py-0.2 rounded-full font-extrabold">
            {products.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('watchlist')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all shrink-0 ${
            activeTab === 'watchlist'
              ? 'border-[#f00856] text-[#f00856] bg-pink-50/50 rounded-t-xl'
              : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-t-xl'
          }`}
        >
          <Bookmark className="w-4 h-4 text-amber-600" />
          <span>Watchlist</span>
          {watchlistIds.length > 0 && (
            <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded-full font-bold">
              {watchlistIds.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('pipeline')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all shrink-0 ${
            activeTab === 'pipeline'
              ? 'border-[#f00856] text-[#f00856] bg-pink-50/50 rounded-t-xl'
              : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-t-xl'
          }`}
        >
          <SlidersHorizontal className="w-4 h-4 text-indigo-600" />
          <span>Pipeline</span>
        </button>

        <button
          onClick={() => setShowHistoryModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-t-xl shrink-0 cursor-pointer"
        >
          <History className="w-4 h-4 text-purple-600" />
          <span>Historial</span>
        </button>

        <button
          onClick={() => setActiveTab('alertas')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all shrink-0 ${
            activeTab === 'alertas'
              ? 'border-[#f00856] text-[#f00856] bg-pink-50/50 rounded-t-xl'
              : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-t-xl'
          }`}
        >
          <AlertTriangle className="w-4 h-4 text-rose-600" />
          <span>Alertas</span>
        </button>

        <button
          onClick={() => setActiveTab('autopilot')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all shrink-0 ${
            activeTab === 'autopilot'
              ? 'border-[#f00856] text-[#f00856] bg-pink-50/50 rounded-t-xl'
              : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-t-xl'
          }`}
        >
          <Activity className="w-4 h-4 text-emerald-600" />
          <span>Autopilot</span>
        </button>

        <button
          onClick={() => setActiveTab('conexiones')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all shrink-0 ${
            activeTab === 'conexiones'
              ? 'border-[#f00856] text-[#f00856] bg-pink-50/50 rounded-t-xl'
              : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-t-xl'
          }`}
        >
          <Server className="w-4 h-4 text-blue-600" />
          <span>Conexiones</span>
        </button>
      </div>


      {/* PESTAÑA 1: DASHBOARD & OPPORTUNITY FEED */}
      {activeTab === 'dashboard' && (

        <div className="space-y-6">
          {/* Banner de Research Pack Activo y Métricas Operacionales */}
          <div className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-gray-500">Investigación Activa:</span>
                <strong className="text-sm font-bold text-gray-900">{activePackTitle}</strong>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="bg-gray-100 text-gray-700 px-2.5 py-1 rounded-md font-medium">
                  <strong>{products.length}</strong> detectados
                </span>
                <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-md font-semibold">
                  <strong>{profitableCount}</strong> rentables
                </span>
                {reviewCount > 0 && (
                  <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-md font-semibold">
                    <strong>{reviewCount}</strong> a revisar
                  </span>
                )}
              </div>
            </div>

            <button
              onClick={() => setActiveTab('terminal')}
              className="px-4 py-2 bg-[#f00856] hover:bg-[#d0074a] text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5 self-start sm:self-auto"
            >
              <span>Ir a Terminal de Oportunidades</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Conexiones de Sourcing Resumidas */}
          <SourcingConnectionStatus />

          {/* Opportunity Feed Cards (Top Opportunities) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#f00856]" />
                <span>Opportunity Feed (Top Oportunidades Comercializables)</span>
              </h3>
              <button
                onClick={() => setActiveTab('terminal')}
                className="text-xs text-[#f00856] font-bold hover:underline"
              >
                Ver todas ({products.length})
              </button>
            </div>

            {loading ? (
              <SourcingCardGridSkeleton />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {products.slice(0, 8).map(prod => (
                  <SourcingOpportunityCard
                    key={prod.id}
                    product={prod}
                    isSelected={selectedIds.includes(prod.id)}
                    onToggleSelect={() => handleToggleSelectOne(prod.id)}
                    onOpenAnalysisModal={(p) => { setAnalysisProduct(p); setShowAnalysisModal(true); }}
                    onImportProduct={handleImportSingle}
                    onPublishPreorder={handlePublishPreorderSingle}
                    onToggleWatchlist={handleToggleWatchlist}
                    isInWatchlist={watchlistIds.includes(prod.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* PESTAÑA 2: TERMINAL DE BÚSQUEDA & OPORTUNIDADES MULTIFUENTE */}
      {activeTab === 'terminal' && (
        <div className="space-y-5">
          {/* Cabecera Principal Multifuente */}
          <SourcingMultiSourceHeader
            query={multiSourceQuery}
            onQueryChange={setMultiSourceQuery}
            onSearch={() => handleExecuteMultiSourceSearch()}
            selectedSource={selectedSourceOption}
            onSelectSource={(s) => {
              setSelectedSourceOption(s);
              handleExecuteMultiSourceSearch(multiSourceQuery, s);
            }}
            sourceStatus={multiSourceResult?.sourceStatus || {
              amazon: { status: 'AVAILABLE', resultCount: 0, isAvailable: true },
              ebay: { status: 'AVAILABLE', resultCount: 0, isAvailable: true },
              bestbuy: { status: 'AVAILABLE', resultCount: 0, isAvailable: true }
            }}
            isSearching={isMultiSourceSearching}
            onApplyPreset={(p) => {
              setMultiSourceQuery(p);
              handleExecuteMultiSourceSearch(p, selectedSourceOption);
            }}
          />

          {/* Panel de Filtros Canónicos y Retro en Caja */}
          <SourcingMultiSourceFilters
            filters={multiSourceFilters}
            onChangeFilters={setMultiSourceFilters}
            availableBrands={multiSourceAvailableBrands}
            availableLicenses={multiSourceAvailableLicenses}
            totalResultsCount={multiSourceResult?.canonicalProducts.length ?? 0}
            filteredResultsCount={filteredCanonicalProducts.length}
          />

          {/* Estado de Carga / Resultados / Vacío */}
          {isMultiSourceSearching ? (
            <div className="py-20 text-center bg-white border border-gray-200 rounded-3xl p-8 shadow-xs">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto text-[#f00856] mb-3" />
              <h4 className="text-sm font-bold text-gray-900">
                Consultando {selectedSourceOption === 'all' ? 'Amazon, eBay y Best Buy' : selectedSourceOption.toUpperCase()}...
              </h4>
              <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
                Normalizando identificadores (UPC, SKU, ASIN), canonicalizando ofertas y calculando precios de importación.
              </p>
            </div>
          ) : filteredCanonicalProducts.length === 0 ? (
            <div className="py-16 text-center bg-white border border-gray-200 rounded-3xl p-8 shadow-xs space-y-3">
              <Search className="w-10 h-10 mx-auto text-gray-300" />
              <h4 className="text-base font-bold text-gray-900">No encontramos productos con estos filtros</h4>
              <p className="text-xs text-gray-500 max-w-md mx-auto">
                Probá buscar otro término como "Street Fighter Jada Toys", "Star Wars Black Series" o restablecer los filtros de búsqueda.
              </p>
              <button
                onClick={() => setMultiSourceFilters({
                  conditionFilter: 'all',
                  minPrice: 0,
                  maxPrice: 0,
                  onlyInStock: false,
                  brandFilter: '',
                  licenseFilter: '',
                  ebayListingType: 'individual',
                  includeAuctions: false,
                  retroInBoxOnly: false,
                  viewMode: multiSourceFilters.viewMode,
                  sortBy: 'relevance'
                })}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Limpiar Filtros
              </button>
            </div>
          ) : (
            <div className={
              multiSourceFilters.viewMode === 'compact'
                ? 'space-y-3'
                : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
            }>
              {filteredCanonicalProducts.map(prod => (
                <SourcingCanonicalCard
                  key={prod.id}
                  product={prod}
                  isSelected={selectedCanonicalIds.includes(prod.id)}
                  onToggleSelect={() => handleToggleSelectCanonical(prod.id)}
                  onImportProduct={handleOpenReviewModal}
                  onToggleWatchlist={(p) => {
                    addToast({
                      title: 'Watchlist',
                      message: `"${p.title}" añadido a vigilancia de precios.`,
                      type: 'success'
                    });
                  }}
                  isInWatchlist={false}
                  viewMode={multiSourceFilters.viewMode}
                />
              ))}
            </div>
          )}

          {/* Barra Flotante de Acciones Masivas Canónicas */}
          {selectedCanonicalIds.length > 0 && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-11/12 max-w-3xl bg-white/95 backdrop-blur-xl border border-gray-300 shadow-2xl rounded-2xl p-3.5 px-6 animate-in slide-in-from-bottom-5 duration-200 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="font-bold text-white bg-[#f00856] px-2.5 py-1 rounded-full text-sm">
                  {selectedCanonicalIds.length}
                </span>
                <span className="text-xs font-bold text-gray-900">Productos Canónicos Seleccionados</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowBulkModal(true)}
                  className="px-5 py-2 bg-[#f00856] hover:bg-[#d0074a] text-white font-black text-xs rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Importar {selectedCanonicalIds.length} Productos</span>
                </button>

                <button
                  onClick={() => setSelectedCanonicalIds([])}
                  className="p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                  title="Limpiar selección"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Modal de Revisión de Importación Unitaria */}
          <SourcingImportReviewModal
            product={reviewCanonicalProduct}
            selectedOffer={reviewOffer}
            onClose={() => setShowReviewModal(false)}
            onConfirmImport={handleConfirmSingleImport}
          />

          {/* Modal de Revisión de Importación Masiva */}
          {showBulkModal && (
            <SourcingBulkImportModal
              selectedProducts={filteredCanonicalProducts.filter(p => selectedCanonicalIds.includes(p.id))}
              onClose={() => setShowBulkModal(false)}
              onConfirmBulkImport={handleConfirmBulkImport}
            />
          )}
        </div>
      )}

      {/* PESTAÑA 3: OPORTUNIDADES */}
      {activeTab === 'oportunidades' && (
        <SourcingOportunidadesView
          products={products}
          selectedIds={selectedIds}
          watchlistIds={watchlistIds}
          onToggleSelectOne={handleToggleSelectOne}
          onOpenAnalysisModal={(p) => { setAnalysisProduct(p); setShowAnalysisModal(true); }}
          onImportProduct={handleImportSingle}
          onPublishPreorder={handlePublishPreorderSingle}
          onToggleWatchlist={handleToggleWatchlist}
        />
      )}

      {/* PESTAÑA 4: PRODUCTOS */}
      {activeTab === 'productos' && (
        <SourcingProductosView
          products={products}
          filteredProducts={filteredProducts}
          loading={loading}
          filters={filters}
          setFilters={setFilters}
          viewMode={viewMode}
          setViewMode={setViewMode}
          columns={columns}
          setColumns={setColumns}
          onSaveColumnPreset={handleSaveColumnPreset}
          selectedIds={selectedIds}
          watchlistIds={watchlistIds}
          onToggleSelectAll={handleToggleSelectAll}
          onToggleSelectOne={handleToggleSelectOne}
          onImportSingle={handleImportSingle}
          onPublishPreorderSingle={handlePublishPreorderSingle}
          onUpdateSalePrice={handleUpdateSalePrice}
          onSelectSource={handleSelectSource}
          onOpenAnalysisModal={(p) => { setAnalysisProduct(p); setShowAnalysisModal(true); }}
          onToggleWatchlist={handleToggleWatchlist}
          handleBulkImport={handleBulkImport}
          handleBulkPreorder={handleBulkPreorder}
          isProcessingBulk={isProcessingBulk}
          availableBrands={availableBrands}
        />
      )}

      {/* PESTAÑA 5: PIPELINE */}
      {activeTab === 'pipeline' && (
        <SourcingPipelineView
          products={products}
          onOpenAnalysisModal={(p) => { setAnalysisProduct(p); setShowAnalysisModal(true); }}
          onImportProduct={handleImportSingle}
        />
      )}

      {/* PESTAÑA 6: ALERTAS */}
      {activeTab === 'alertas' && (
        <SourcingAlertsView
          products={products}
          onOpenAnalysisModal={(p) => { setAnalysisProduct(p); setShowAnalysisModal(true); }}
        />
      )}

      {/* PESTAÑA 7: AUTO PUBLISH / AUTOPILOT */}
      {activeTab === 'autopilot' && (
        <div className="space-y-6">
          <AutopilotHeaderBar
            settings={{
              enabled: true,
              mode: 'SEMIAUTOMATIC',
              maxPriceUsd: 200,
              minProfitUsd: 10,
              minMarginPercent: 20,
              maxDailyPublishes: 50,
              autoPurchaseEnabled: false,
              requireHumanApproval: true,
              profitProtectionRulesEnabled: true,
              zincAutoFulfillEnabled: true
            }}
            onToggleEnabled={() => addToast({ title: 'Auto Publish', message: 'Configuración actualizada', type: 'info' })}
            onSaveSettings={() => addToast({ title: 'Configuración Guardada', message: 'Reglas de Auto Publish actualizadas', type: 'success' })}
            onOpenPolicyEditor={() => {}}
            onOpenDryRun={() => {}}
          />

          <AutopilotDashboard
            settings={{
              enabled: true,
              mode: 'SEMIAUTOMATIC',
              maxPriceUsd: 200,
              minProfitUsd: 10,
              minMarginPercent: 20,
              maxDailyPublishes: 50,
              autoPurchaseEnabled: false,
              requireHumanApproval: true,
              profitProtectionRulesEnabled: true,
              zincAutoFulfillEnabled: true
            }}
            kpis={{
              discoveredToday: products.length,
              publishedCount: 12,
              watchingCount: watchlistIds.length,
              discardedCount: 3,
              priceUpdatesCount: 8,
              sourceSwitchesCount: 4,
              pausedCount: 1,
              autoPurchasesCount: 0,
              pendingApprovalCount: products.filter(p => p.authenticity.status === 'NEEDS_VERIFICATION').length,
              errorsCount: 0
            }}
          />
        </div>
      )}

      {/* PESTAÑA 8: WATCHLIST */}
      {activeTab === 'watchlist' && (
        <SourcingWatchlistHistoryView
          watchlistProducts={watchlistProducts}
          onOpenAnalysisModal={(p) => { setAnalysisProduct(p); setShowAnalysisModal(true); }}
          onRemoveFromWatchlist={(id) => setWatchlistIds(prev => prev.filter(i => i !== id))}
          onImportProduct={handleImportSingle}
        />
      )}

      {/* PESTAÑA 9: PERSONALIZATION ENGINE */}
      {activeTab === 'personalization' && (
        <SourcingPersonalizationPanel />
      )}

      {/* PESTAÑA 10: CONEXIONES & INFRAESTRUCTURA */}
      {activeTab === 'connections' && (
        <SourcingConnectionStatus
          onRefresh={() => addToast({ title: 'Verificación', message: 'Conexiones de sourcing re-verificadas.', type: 'success' })}
        />
      )}

      </div>
      )}




      {/* MODAL PREPARAR PUBLICACIÓN ADAPTIVE SOURCING */}
      <PreparePublicationModal
        opportunity={selectedPrepareOpp}
        isOpen={showPrepareModal}
        onClose={() => { setShowPrepareModal(false); setSelectedPrepareOpp(null); }}
        onConfirmApprove={handleApprovePrepareOpportunity}
      />

      {/* MODAL FICHA COMPLETA DE ANÁLISIS DE PRODUCTO */}
      <SourcingProductAnalysisModal
        product={analysisProduct}
        isOpen={showAnalysisModal}
        onClose={() => { setShowAnalysisModal(false); setAnalysisProduct(null); }}
        onImportProduct={handleImportSingle}
        onPublishPreorder={handlePublishPreorderSingle}
        onUpdateSalePrice={handleUpdateSalePrice}
        onSelectSource={handleSelectSource}
        onToggleWatchlist={handleToggleWatchlist}
        isInWatchlist={analysisProduct ? watchlistIds.includes(analysisProduct.id) : false}
      />

      {/* OTROS MODALES DE INVESTIGACIÓN */}
      <SourcingResearchPackModal
        isOpen={showPackModal}
        onClose={() => setShowPackModal(false)}
        onLoadPack={handleLoadNewPack}
      />

      <SourcingHistoryModal
        isOpen={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        historyEntries={sourcingService.getPackHistory()}
      />

      <SourcingOpenAIModal
        isOpen={showOpenAIModal}
        onClose={() => setShowOpenAIModal(false)}
        onLoadPack={handleLoadNewPack}
      />
    </div>
  );
}
