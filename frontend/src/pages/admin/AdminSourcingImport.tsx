import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  Sparkles, Layers, Bookmark, Server, Activity, 
  Flame, Rocket, TrendingUp, Sparkle, Clock, Gem, 
  Download, HelpCircle, RefreshCw, Bot
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../components/admin/Toast';

// Sourcing Intelligence Components
import { SourcingIntelligenceHeader } from '../../components/admin/sourcing/SourcingIntelligenceHeader';
import { TrendCardGrid } from '../../components/admin/sourcing/TrendCardGrid';
import { ProductCandidatesView } from '../../components/admin/sourcing/ProductCandidatesView';
import { SourcingDiscoveryView } from '../../components/admin/sourcing/SourcingDiscoveryView';
import { SourcingWatchlistExpandedView } from '../../components/admin/sourcing/SourcingWatchlistExpandedView';
import { SourcingControlAutomationView } from '../../components/admin/sourcing/SourcingControlAutomationView';
import { WhyExplainabilityModal } from '../../components/admin/sourcing/WhyExplainabilityModal';

// Existing Operational Import Workbench & Modals
import { ImportWorkbench, type ImportCandidateItem } from '../../components/admin/sourcing/ImportWorkbench';
import { SourcingProductAnalysisModal } from '../../components/admin/sourcing/SourcingProductAnalysisModal';
import { SourcingResearchPackModal } from '../../components/admin/sourcing/SourcingResearchPackModal';
import { SourcingHistoryModal } from '../../components/admin/sourcing/SourcingHistoryModal';

// Sourcing Services & Engines
import { researchIntelligenceService } from '../../services/sourcing/researchIntelligenceService';
import { TrendEngine } from '../../services/sourcing/trendEngine';
import { sourcingDiscoveryEngine } from '../../services/sourcing/sourcingDiscoveryEngine';
import { sourcingWatchlistService } from '../../services/sourcing/sourcingWatchlistService';
import { sourcingService } from '../../services/sourcing/sourcingService';
import { checkOpenAIStatus } from '../../services/sourcing/openaiResearchService';
import { multiSourceSearchService } from '../../services/sourcing/multiSourceSearchService';

import type { 
  SourcingTrendCard, 
  SourcingProductCandidate, 
  WatchlistExpandedItem 
} from '../../types/sourcingIntelligence';
import type { NormalizedProduct, ResearchPack } from '../../types/sourcing';

type SourcingIntelligenceTab = 
  | 'trends' 
  | 'discovery' 
  | 'candidates' 
  | 'workbench' 
  | 'watchlist' 
  | 'automation';

export default function AdminSourcingImport() {
  const { addToast } = useToast();
  const [searchParams] = useSearchParams();
  const urlQuery = searchParams.get('query') || searchParams.get('q') || '';

  // Active Main Navigation Tab (6 Consolidated Areas)
  const [activeTab, setActiveTab] = useState<SourcingIntelligenceTab>('trends');

  // Country, Period, Product Family and Category context
  const [selectedCountry, setSelectedCountry] = useState<string>('UY');
  const [selectedPeriod, setSelectedPeriod] = useState<'24h' | '7d' | '30d' | '90d' | 'all'>('all');
  const [selectedProductFamily, setSelectedProductFamily] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Research Query state
  const [searchQuery, setSearchQuery] = useState<string>(urlQuery || '');
  const [selectedResultLimit, setSelectedResultLimit] = useState<'AUTO' | 10 | 25 | 50 | 100>('AUTO');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [isDiscoveryScanning, setIsDiscoveryScanning] = useState<boolean>(false);
  const [quickFilterState, setQuickFilterState] = useState<string>('all');

  // Data Collections
  const [trends, setTrends] = useState<SourcingTrendCard[]>([]);
  const [candidates, setCandidates] = useState<SourcingProductCandidate[]>([]);
  const [zeroResultReason, setZeroResultReason] = useState<string | undefined>(undefined);
  const [watchlistItems, setWatchlistItems] = useState<WatchlistExpandedItem[]>([]);
  const [workbenchItems, setWorkbenchItems] = useState<ImportCandidateItem[]>([]);

  // Modals & Inspection
  const [selectedCandidateForWhy, setSelectedCandidateForWhy] = useState<SourcingProductCandidate | null>(null);
  const [showWhyModal, setShowWhyModal] = useState<boolean>(false);
  const [analysisProduct, setAnalysisProduct] = useState<NormalizedProduct | null>(null);
  const [showAnalysisModal, setShowAnalysisModal] = useState<boolean>(false);

  // Load initial intelligence on mount or country change
  useEffect(() => {
    loadIntelligenceForCountry(selectedCountry);
    loadWatchlist();
  }, [selectedCountry]);

  const loadWatchlist = async () => {
    try {
      const items = await sourcingWatchlistService.getWatchlistItems();
      setWatchlistItems(items);
    } catch (e) {
      console.warn('Could not load watchlist:', e);
    }
  };

  const loadIntelligenceForCountry = async (countryCode: string) => {
    setIsSearching(true);
    try {
      // 1. Cargar tendencias dinámicas reales desde Supabase / señales observables
      const dynamicTrends = await sourcingDiscoveryEngine.loadLiveTrends(countryCode);
      setTrends(dynamicTrends);

      // 2. Cargar descubrimientos reales persistidos
      const liveCandidates = await sourcingDiscoveryEngine.loadLiveDiscoveries(countryCode);
      setCandidates(liveCandidates);

      // 3. Poblar workbench con candidatos reales si existen
      if (liveCandidates.length > 0) {
        const mapped: ImportCandidateItem[] = liveCandidates.map(c => ({
          id: c.id,
          external_product_id: (c.provenance?.asin?.verification === 'SOURCE_VERIFIED' ? c.asin : c.sku) || c.id,
          title: c.title,
          brand: c.brand,
          franchise: c.franchise,
          category: c.category,
          image_url: c.image_url,
          gallery_images: c.gallery_images || [c.image_url],
          product_url_external: c.retailer_url,
          price_usd: c.pricing.origin_price_usd ?? null,
          rating: null,
          review_count: undefined,
          availability: c.stock_status === 'IN_STOCK' ? 'in_stock' : c.stock_status === 'PREORDER' ? 'preorder' : 'unknown',
          prime: undefined,
          seller: c.retailer_source.toUpperCase(),
          source: c.retailer_source,
          data_origin: 'LIVE',
          opportunity_score: c.opportunity_score,
          sourcing_score: c.opportunity_score,
          status: 'review',
          raw_data: c
        }));
        setWorkbenchItems(mapped);
      } else {
        setWorkbenchItems([]);
      }

    } catch (err: any) {
      console.warn('Error loading country intelligence:', err);
    } finally {
      setIsSearching(false);
    }
  };


  // Execution Telemetry
  const [lastExecutionTelemetry, setLastExecutionTelemetry] = useState<{
    model: string;
    requested_model?: string;
    actual_model?: string;
    automatic_or_manual?: 'AUTO' | 'MANUAL';
    cost_usd: number;
    latency_ms: number;
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    cached?: boolean;
    research_depth?: string;
  } | null>(null);

  // Handle Manual Research Execution
  const handleExecuteSearch = async (
    queryOverride?: string, 
    modeOverride?: 'ECONOMICO' | 'ESTANDAR' | 'PROFUNDO', 
    requestedModel?: string,
    forceRefresh = false,
    resultLimitOverride?: 'AUTO' | 10 | 25 | 50 | 100
  ) => {
    const q = (queryOverride !== undefined ? queryOverride : searchQuery).trim();
    if (!q) return;

    const limitToUse = resultLimitOverride || selectedResultLimit;

    setIsSearching(true);
    try {
      const res = await researchIntelligenceService.research({
        query: q,
        country: selectedCountry,
        product_family: selectedProductFamily,
        category: selectedProductFamily !== 'ALL' ? selectedProductFamily : undefined,
        period: selectedPeriod,
        research_depth: modeOverride || 'ECONOMICO',
        requested_model: requestedModel,
        result_limit: limitToUse,
        resultLimit: limitToUse,
        force_refresh: forceRefresh
      });

      console.log('[FRONTEND_RESEARCH_TRACE]', {
        step: 'ADMIN_RECEIVED_ITEMS',
        candidatesCount: res?.candidates?.length || 0,
        trendsCount: res?.trends?.length || 0,
        success: res?.success
      });

      setTrends(prev => [res.trends[0], ...prev.filter(t => t.topic !== q)]);
      setCandidates(res.candidates);
      setZeroResultReason(res.zero_result_reason);
      setActiveTab('candidates');

      setLastExecutionTelemetry({
        model: res.model,
        requested_model: res.requested_model,
        actual_model: res.actual_model,
        automatic_or_manual: res.automatic_or_manual,
        cost_usd: res.cost_usd,
        latency_ms: res.latency_ms,
        input_tokens: res.input_tokens,
        output_tokens: res.output_tokens,
        total_tokens: res.total_tokens,
        cached: res.cached,
        research_depth: res.research_depth
      });

      addToast({
        title: res.cached ? 'Investigación Reutilizada (Caché)' : 'Investigación Completada',
        message: `${res.candidates.length} productos identificados para ${selectedCountry} (${res.cached ? 'Caché $0.000' : `Costo: $${res.cost_usd.toFixed(4)}`}).`,
        type: 'success'
      });
    } catch (err: any) {
      addToast({
        title: 'Error de Investigación',
        message: err.message || 'No se pudo completar la consulta.',
        type: 'error'
      });
    } finally {
      setIsSearching(false);
    }
  };

  // Handle Server-Side Discovery Scan (Calls the exact same pipeline as cron)
  const handleRunDiscoveryScan = async () => {
    setIsDiscoveryScanning(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const response = await fetch('/api/sourcing-discovery', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ trigger: 'MANUAL', country: selectedCountry })
      });

      const data = await response.json();

      if (!response.ok || data.status === 'FORBIDDEN') {
        throw new Error(data.error || `Error ${response.status}: Acceso no autorizado o fallo de escaneo.`);
      }

      // Si el endpoint retorna candidatos descubiertos, pasarlos por el pipeline canónico unificado
      if (Array.isArray(data.candidates) && data.candidates.length > 0) {
        try {
          await sourcingDiscoveryEngine.processDiscoveredCandidates(data.candidates, selectedCountry);
        } catch (pipeErr: any) {
          console.warn('[Discovery] Error en pipeline canónico post-discovery:', pipeErr.message);
        }
      }

      // Recargar datos reales persistidos
      await loadIntelligenceForCountry(selectedCountry);

      addToast({
        title: 'Discovery Completado & Enriquecido',
        message: `Escaneo finalizado con éxito (${data.status}). Señales: ${data.signals_created || 0}, Descubrimientos: ${data.discoveries_created || 0}. Pipeline Zinc + Comercial completado.`,
        type: 'success'
      });
    } catch (err: any) {
      console.warn('Error en escaneo discovery server-side:', err);
      addToast({
        title: 'Error de Discovery',
        message: err.message || 'No se pudo completar el escaneo.',
        type: 'error'
      });
    } finally {
      setIsDiscoveryScanning(false);
    }
  };


  // Handle Sending a Candidate to Import Workbench
  const handleSendCandidateToImport = (cand: SourcingProductCandidate) => {
    const newWorkbenchItem: ImportCandidateItem = {
      id: cand.id,
      external_product_id: (cand.provenance?.asin?.verification === 'SOURCE_VERIFIED' ? cand.asin : cand.sku) || cand.id,
      title: cand.title,
      brand: cand.brand,
      franchise: cand.franchise,
      category: cand.category,
      image_url: cand.image_url,
      gallery_images: cand.gallery_images || [cand.image_url],
      product_url_external: cand.retailer_url,
      price_usd: cand.pricing.origin_price_usd ?? null,
      rating: 4.8,
      review_count: undefined,
      availability: cand.stock_status === 'IN_STOCK' ? 'in_stock' : cand.stock_status === 'PREORDER' ? 'preorder' : 'unknown',
      prime: true,
      seller: cand.retailer_source.toUpperCase(),
      source: cand.retailer_source,
      data_origin: 'LIVE',
      opportunity_score: cand.opportunity_score,
      sourcing_score: cand.opportunity_score,
      status: 'review',
      raw_data: cand
    };

    setWorkbenchItems(prev => [newWorkbenchItem, ...prev.filter(item => item.id !== cand.id)]);
    setActiveTab('workbench');

    addToast({
      title: 'Enviado a Productos para Importar',
      message: `"${cand.title}" cargado en la mesa de cálculo comercial.`,
      type: 'success'
    });
  };

  // Handle Toggle Watchlist for candidate
  const handleToggleCandidateWatchlist = async (cand: SourcingProductCandidate) => {
    await sourcingWatchlistService.addWatchlistItem({
      name: cand.title,
      value: cand.asin || cand.title,
      type: 'SKU',
      priority: 'HIGH',
      target_country: selectedCountry,
      notes: `Añadido desde Sourcing Intelligence (${cand.brand})`
    });
    loadWatchlist();
    addToast({
      title: 'Watchlist',
      message: `"${cand.title}" añadido a vigilancia comercial en ${selectedCountry}.`,
      type: 'success'
    });
  };

  // KPI Active Counts (Estricto: si no hay registros, devuelve 0)
  const activeCounts = useMemo(() => {
    const trendTrending = trends.filter(t => t.status === 'TRENDING').length;
    const candTrending = candidates.filter(c => c.status === 'TRENDING').length;
    const trendEmerging = trends.filter(t => t.status === 'EMERGING').length;
    const candEmerging = candidates.filter(c => c.status === 'EMERGING').length;
    const trendGrowing = trends.filter(t => t.status === 'GROWING').length;
    const candGrowing = candidates.filter(c => c.status === 'GROWING').length;
    const trendNew = trends.filter(t => t.status === 'NEW').length;
    const candNew = candidates.filter(c => c.status === 'NEW').length;
    const trendPreorder = trends.filter(t => t.status === 'PREORDER').length;
    const candPreorder = candidates.filter(c => c.status === 'PREORDER').length;
    const trendOpp = trends.filter(t => t.status === 'OPPORTUNITY' || t.composite_trend_score >= 80).length;
    const candOpp = candidates.filter(c => c.status === 'OPPORTUNITY' || c.opportunity_score >= 80).length;

    return {
      trending: candTrending > 0 ? candTrending : trendTrending,
      emerging: candEmerging > 0 ? candEmerging : trendEmerging,
      growing: candGrowing > 0 ? candGrowing : trendGrowing,
      newReleases: candNew > 0 ? candNew : trendNew,
      preorders: candPreorder > 0 ? candPreorder : trendPreorder,
      opportunities: candOpp > 0 ? candOpp : trendOpp
    };
  }, [candidates, trends]);


  return (
    <div className="space-y-6 pb-28">
      
      {/* SOURCING INTELLIGENCE HEADER */}
      <SourcingIntelligenceHeader
        country={selectedCountry}
        onCountryChange={setSelectedCountry}
        period={selectedPeriod}
        onPeriodChange={setSelectedPeriod}
        productFamily={selectedProductFamily}
        onProductFamilyChange={setSelectedProductFamily}
        category={selectedProductFamily}
        onCategoryChange={setSelectedProductFamily}
        resultLimit={selectedResultLimit}
        onResultLimitChange={setSelectedResultLimit}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        onExecuteSearch={(mode, requestedModel, forceRefresh, resultLimit) => handleExecuteSearch(undefined, mode, requestedModel, forceRefresh, resultLimit)}
        isSearching={isSearching}
        activeCounts={activeCounts}
        activeFilterState={quickFilterState}
        onSelectQuickFilter={(st) => {
          setQuickFilterState(st);
          if (st !== 'all') setActiveTab('candidates');
        }}
        lastExecutionTelemetry={lastExecutionTelemetry}
      />

      {/* 6 CONSOLIDATED NAVIGATION TABS */}
      <div className="flex items-center gap-2 bg-white p-2 rounded-2xl border border-gray-200 shadow-sm overflow-x-auto">
        {[
          { key: 'trends', label: '1. Overview & Trends', icon: Flame, badge: trends.length },
          { key: 'discovery', label: '2. Automatic Discovery', icon: Rocket, badge: candidates.filter(c => c.status === 'PREORDER' || c.status === 'EMERGING').length },
          { key: 'candidates', label: '3. Product Candidates', icon: Gem, badge: candidates.length },
          { key: 'workbench', label: '4. Productos para Importar', icon: Layers, badge: workbenchItems.length, highlight: true },
          { key: 'watchlist', label: '5. Watchlist Comercial', icon: Bookmark, badge: watchlistItems.length },
          { key: 'automation', label: '6. Control & Automation', icon: Bot }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;

          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as SourcingIntelligenceTab)}
              className={`flex items-center gap-2.5 px-4.5 py-3 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
                isActive
                  ? tab.highlight 
                    ? 'bg-[#f00856] text-white shadow-md font-black' 
                    : 'bg-slate-900 text-white shadow-md font-black'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? (tab.highlight ? 'text-white' : 'text-pink-400') : 'text-gray-500'}`} />
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-black ${
                  isActive ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-700'
                }`}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* TAB 1: OVERVIEW & TRENDS */}
      {activeTab === 'trends' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-gray-200 pb-2">
            <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
              <Flame className="w-4 h-4 text-[#f00856]" />
              <span>Tendencias Detectadas en {selectedCountry} ({trends.length})</span>
            </h3>
            <span className="text-xs text-gray-400">
              Datos actualizados en tiempo real · Scoring determinístico
            </span>
          </div>

          <TrendCardGrid
            trends={trends}
            onViewResearch={(t) => {
              setSearchQuery(t.topic);
              handleExecuteSearch(t.topic);
            }}
            onViewProducts={(t) => {
              setSearchQuery(t.topic);
              handleExecuteSearch(t.topic);
            }}
            onToggleFollow={async (t) => {
              await sourcingWatchlistService.addWatchlistItem({
                name: t.topic,
                value: t.topic,
                type: 'BRAND',
                priority: 'HIGH',
                target_country: selectedCountry
              });
              loadWatchlist();
              addToast({ title: 'Tendencia Guardada', message: `"${t.topic}" añadida a Watchlist.`, type: 'success' });
            }}
            onIgnore={(id) => {
              setTrends(prev => prev.filter(t => t.id !== id));
              addToast({ title: 'Tendencia Ignorada', message: 'Removida del tablero actual.', type: 'info' });
            }}
          />
        </div>
      )}

      {/* TAB 2: AUTOMATIC DISCOVERY */}
      {activeTab === 'discovery' && (
        <SourcingDiscoveryView
          candidates={candidates}
          country={selectedCountry}
          onRunDiscoveryScan={handleRunDiscoveryScan}
          isScanning={isDiscoveryScanning}
          onSendToImport={handleSendCandidateToImport}
          onOpenWhyModal={(c) => {
            setSelectedCandidateForWhy(c);
            setShowWhyModal(true);
          }}
          onToggleWatchlist={handleToggleCandidateWatchlist}
        />
      )}

      {/* TAB 3: PRODUCT CANDIDATES */}
      {activeTab === 'candidates' && (
        <ProductCandidatesView
          candidates={candidates}
          country={selectedCountry}
          zeroResultReason={zeroResultReason}
          onOpenWhyModal={(c) => {
            setSelectedCandidateForWhy(c);
            setShowWhyModal(true);
          }}
          onSendToImport={handleSendCandidateToImport}
          onToggleWatchlist={handleToggleCandidateWatchlist}
          onIgnore={(id) => setCandidates(prev => prev.filter(c => c.id !== id))}
        />
      )}

      {/* TAB 4: PRODUCTOS PARA IMPORTAR (OPERATIONAL WORKBENCH) */}
      {activeTab === 'workbench' && (
        <div className="space-y-4">
          <div className="p-4 bg-pink-50/60 border border-pink-200/80 rounded-2xl flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <h3 className="text-xs font-black uppercase text-[#f00856] tracking-wider">
                Mesa de Cálculo Comercial & Importación
              </h3>
              <p className="text-xs text-gray-600">
                Aquí se calculan números reales de importación: Landed Cost, Franquicia $200 UY, Arancel 60%, Markup y Publicación.
              </p>
            </div>
            <span className="text-[11px] font-bold text-pink-700 bg-pink-100 px-2.5 py-1 rounded-lg">
              {workbenchItems.length} productos listos
            </span>
          </div>

          <ImportWorkbench
            initialItems={workbenchItems}
            searchQuery={searchQuery}
            onRefresh={() => loadIntelligenceForCountry(selectedCountry)}
            isLoading={isSearching}
            onImportSuccess={() => loadIntelligenceForCountry(selectedCountry)}
          />
        </div>
      )}

      {/* TAB 5: WATCHLIST COMERCIAL */}
      {activeTab === 'watchlist' && (
        <SourcingWatchlistExpandedView
          watchlistItems={watchlistItems}
          onAddItem={async (item) => {
            await sourcingWatchlistService.addWatchlistItem(item);
            loadWatchlist();
            addToast({ title: 'Watchlist', message: `"${item.name}" guardado exitosamente.`, type: 'success' });
          }}
          onRemoveItem={async (id) => {
            await sourcingWatchlistService.removeFromWatchlist(id);
            loadWatchlist();
            addToast({ title: 'Watchlist', message: 'Elemento eliminado de vigilancia.', type: 'info' });
          }}
          onInvestigateItem={(item) => {
            setSearchQuery(item.name);
            handleExecuteSearch(item.name);
          }}
        />
      )}

      {/* TAB 6: CONTROL & AUTOMATION */}
      {activeTab === 'automation' && (
        <SourcingControlAutomationView
          country={selectedCountry}
        />
      )}

      {/* MODAL EXPLAINABILITY ("WHY?") */}
      <WhyExplainabilityModal
        candidate={selectedCandidateForWhy}
        isOpen={showWhyModal}
        onClose={() => {
          setShowWhyModal(false);
          setSelectedCandidateForWhy(null);
        }}
        onSendToImport={handleSendCandidateToImport}
      />
    </div>
  );
}
