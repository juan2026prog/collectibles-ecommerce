import React, { useState, useEffect, useMemo } from 'react';
import { 
  Sparkles, History, RefreshCw, UploadCloud, SlidersHorizontal, 
  CheckCircle2, AlertTriangle, ArrowRight, ShieldCheck, Download, Clock,
  Layers, Filter
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../components/admin/Toast';
import type { 
  NormalizedProduct, 
  ColumnDefinition, 
  ResearchPack 
} from '../../types/sourcing';
import { SourcingTable } from '../../components/admin/sourcing/SourcingTable';
import { SourcingFilters } from '../../components/admin/sourcing/SourcingFilters';
import type { SourcingFilterState } from '../../components/admin/sourcing/SourcingFilters';
import { SourcingColumnPicker } from '../../components/admin/sourcing/SourcingColumnPicker';
import { SourcingBulkBar } from '../../components/admin/sourcing/SourcingBulkBar';
import { SourcingResearchPackModal } from '../../components/admin/sourcing/SourcingResearchPackModal';
import { SourcingHistoryModal } from '../../components/admin/sourcing/SourcingHistoryModal';
import { sourcingService } from '../../services/sourcing/sourcingService';
import { SAMPLE_MCFARLANE_RESEARCH_PACK } from '../../data/sampleResearchPacks';
import { calculateInternationalPricing } from '../../lib/internationalPricing';

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
  // Optional columns
  { id: 'origin_price', label: 'Precio Origen', visible: false, category: 'costs' },
  { id: 'domestic_shipping', label: 'Shipping USA', visible: false, category: 'costs' },
  { id: 'profit_usd', label: 'Utilidad USD', visible: false, category: 'costs' },
  { id: 'opportunity_score', label: 'Opportunity Score', visible: false, category: 'intelligence' },
  { id: 'catalog_value', label: 'Catalog Value', visible: false, category: 'intelligence' },
  { id: 'sku', label: 'SKU Canónico', visible: false, category: 'metadata' }
];

const PREFERENCES_STORAGE_KEY = 'collectibles_sourcing_column_preferences_v2';

export default function AdminSourcingImport() {
  const { addToast } = useToast();

  // Columns & Preferences
  const [columns, setColumns] = useState<ColumnDefinition[]>(() => {
    try {
      const saved = localStorage.getItem(PREFERENCES_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // fallback
    }
    return DEFAULT_COLUMNS;
  });

  // State of products & pack
  const [activePackTitle, setActivePackTitle] = useState<string>('McFarlane US · Septiembre 2026');
  const [products, setProducts] = useState<NormalizedProduct[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [isProcessingBulk, setIsProcessingBulk] = useState(false);

  // Modals
  const [showPackModal, setShowPackModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Filters
  const [filters, setFilters] = useState<SourcingFilterState>({
    searchQuery: '',
    sourceFilter: 'all',
    quickFilter: 'all',
    brandFilter: '',
    minMargin: 0,
    onlyOfficialVerified: false,
    authenticityStatus: 'all'
  });

  // Load existing catalog titles and seed initial pack on mount
  useEffect(() => {
    loadInitialCatalogAndPack();
  }, []);

  const loadInitialCatalogAndPack = async () => {
    setLoading(true);
    let existingTitles: string[] = [];

    try {
      const { data } = await supabase.from('products').select('title').limit(500);
      if (data) {
        existingTitles = data.map(p => p.title);
      }
    } catch (e) {
      console.warn('Could not fetch existing catalog titles from Supabase:', e);
    }

    // Process default demo pack
    const initialNormalized = await sourcingService.processResearchPack(
      SAMPLE_MCFARLANE_RESEARCH_PACK,
      existingTitles
    );
    setProducts(initialNormalized);
    setActivePackTitle(SAMPLE_MCFARLANE_RESEARCH_PACK.title);
    setLoading(false);
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

  // Instant in-line sale price edit
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

    addToast({
      title: 'Precio Actualizado',
      message: `Nuevo precio de venta: $${newPrice.toFixed(2)} USD. Margen recalculado al instante.`,
      type: 'success'
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

  // Selection helpers
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
      // 1. Search Query
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

      // 2. Source Filter
      if (filters.sourceFilter !== 'all') {
        const activeOffer = prod.offers.find(o => o.id === prod.selected_source_id);
        if (activeOffer?.source !== filters.sourceFilter) {
          return false;
        }
      }

      // 3. Quick Filters
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

      // 4. Advanced: Brand
      if (filters.brandFilter && prod.brand !== filters.brandFilter) return false;

      // 5. Advanced: Min Margin
      if (filters.minMargin > 0 && prod.financials.margin_percent < filters.minMargin) return false;

      // 6. Advanced: Authenticity
      if (filters.authenticityStatus !== 'all' && prod.authenticity.status !== filters.authenticityStatus) return false;

      return true;
    });
  }, [products, filters]);

  const availableBrands = useMemo(() => {
    return Array.from(new Set(products.map(p => p.brand))).filter(Boolean);
  }, [products]);

  const profitableCount = products.filter(p => p.financials.profit_usd > 0).length;
  const reviewCount = products.filter(p => p.authenticity.status === 'NEEDS_VERIFICATION').length;

  return (
    <div className="space-y-6 pb-28">
      {/* Header Principal */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2.5">
            <span>Sourcing & Importación Multifuente</span>
          </h1>
          <p className="text-xs text-gray-500 mt-1 font-medium">
            Selección inteligente de proveedores (Amazon, eBay, Best Buy, etc.) · Costos puestos UY · Margen comercial · Análisis de Mercado Libre
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowHistoryModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 shadow-sm transition-colors"
          >
            <History className="w-4 h-4 text-gray-500" />
            <span>Historial</span>
          </button>

          <button
            onClick={() => setShowPackModal(true)}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg bg-[#f00856] hover:bg-[#d0074a] text-white shadow-sm transition-all hover:shadow"
          >
            <Sparkles className="w-4 h-4" />
            <span>Cargar Investigación ChatGPT</span>
          </button>
        </div>
      </div>

      {/* Banner de Research Pack Activo y Métricas */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-gray-500">Research Pack Activo:</span>
            <strong className="text-sm font-bold text-gray-900">{activePackTitle}</strong>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="bg-gray-100 text-gray-700 px-2.5 py-1 rounded-md font-medium">
              <strong>{products.length}</strong> productos
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

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <SourcingColumnPicker
            columns={columns}
            onChangeColumns={setColumns}
            onSavePreset={handleSaveColumnPreset}
          />
        </div>
      </div>

      {/* Filtros */}
      <SourcingFilters
        filters={filters}
        onChangeFilters={setFilters}
        availableBrands={availableBrands}
        totalResultsCount={products.length}
        filteredResultsCount={filteredProducts.length}
      />

      {/* Tabla Principal */}
      <SourcingTable
        products={filteredProducts}
        columns={columns}
        selectedIds={selectedIds}
        onToggleSelectAll={handleToggleSelectAll}
        onToggleSelectOne={handleToggleSelectOne}
        onImportProduct={handleImportSingle}
        onPublishPreorder={handlePublishPreorderSingle}
        onUpdateSalePrice={handleUpdateSalePrice}
        onSelectSource={handleSelectSource}
        onRefreshLiveCheck={async (prod) => {
          const res = await sourcingService.executeLiveCheck(prod);
          if (res.hasChanges) {
            setProducts(prev => prev.map(p => p.id === prod.id ? res.updatedProduct : p));
            addToast({
              title: 'Live Check Actualizado',
              message: res.changesSummary.join(', '),
              type: 'info'
            });
          } else {
            addToast({
              title: 'Live Check Confirmado',
              message: 'Precio, disponibilidad y Profit Protection al día.',
              type: 'success'
            });
          }
        }}
      />

      {/* Barra Flotante Inferior de Acciones Masivas */}
      <SourcingBulkBar
        selectedProducts={products.filter(p => selectedIds.includes(p.id))}
        onClearSelection={() => setSelectedIds([])}
        onBulkImport={handleBulkImport}
        onBulkPreorder={handleBulkPreorder}
        isProcessing={isProcessingBulk}
      />

      {/* Modales */}
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
    </div>
  );
}
