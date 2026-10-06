import React, { useState, useEffect, useRef } from 'react';
import { 
  Sparkles, Search, Globe, Calendar, Filter, BrainCircuit, 
  Flame, Rocket, TrendingUp, Sparkle, Clock, Gem, X, RefreshCw,
  Zap, AlertTriangle, CheckCircle2, ShieldAlert, ChevronRight, RotateCcw,
  Bot, ChevronDown, Package
} from 'lucide-react';
import { aiGateway } from '../../../services/ai/aiGateway';
import { useAuth } from '../../../contexts/AuthContext';
import type { AIPreFlightEstimate, ResearchDepthMode, AIModelCapabilityInfo } from '../../../services/ai/types';
import { COLLECTIBLES_PRODUCT_FAMILIES } from '../../../types/sourcingIntelligence';

interface SourcingIntelligenceHeaderProps {
  country: string;
  onCountryChange: (c: string) => void;
  period: '24h' | '7d' | '30d' | '90d' | 'all';
  onPeriodChange: (p: '24h' | '7d' | '30d' | '90d' | 'all') => void;
  productFamily?: string;
  onProductFamilyChange?: (pf: string) => void;
  category?: string;
  onCategoryChange?: (cat: string) => void;
  resultLimit?: 'AUTO' | 10 | 25 | 50 | 100;
  onResultLimitChange?: (limit: 'AUTO' | 10 | 25 | 50 | 100) => void;
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  onExecuteSearch: (mode?: ResearchDepthMode, requestedModel?: string, forceRefresh?: boolean, resultLimit?: 'AUTO' | 10 | 25 | 50 | 100) => void;
  isSearching: boolean;
  activeCounts: {
    trending: number;
    emerging: number;
    growing: number;
    newReleases: number;
    preorders: number;
    opportunities: number;
  };
  activeFilterState?: string;
  onSelectQuickFilter?: (state: string) => void;
  lastExecutionTelemetry?: {
    model: string;
    requested_model?: string;
    actual_model?: string;
    automatic_or_manual?: 'AUTO' | 'MANUAL';
    cost_usd: number | null;
    latency_ms: number;
    input_tokens?: number | null;
    output_tokens?: number | null;
    total_tokens?: number | null;
    cached?: boolean;
    research_depth?: string;
  } | null;
}

const COUNTRIES = [
  { code: 'ALL', label: 'Todos', flag: '🌎', active: true },
  { code: 'UY', label: 'Uruguay', flag: '🇺🇾', active: true },
  { code: 'AR', label: 'Argentina', flag: '🇦🇷', active: true },
  { code: 'CL', label: 'Chile', flag: '🇨🇱', active: true },
  { code: 'PE', label: 'Perú', flag: '🇵🇪', active: true },
  { code: 'MX', label: 'México', flag: '🇲🇽', active: true }
];

export const SourcingIntelligenceHeader: React.FC<SourcingIntelligenceHeaderProps> = ({
  country,
  onCountryChange,
  period,
  onPeriodChange,
  productFamily,
  onProductFamilyChange,
  category,
  onCategoryChange,
  resultLimit: propResultLimit,
  onResultLimitChange,
  searchQuery,
  onSearchQueryChange,
  onExecuteSearch,
  isSearching,
  activeCounts,
  activeFilterState = 'all',
  onSelectQuickFilter,
  lastExecutionTelemetry
}) => {
  const { isSuperAdmin } = useAuth();
  const [researchMode, setResearchMode] = useState<ResearchDepthMode>('ECONOMICO');
  const [selectedModel, setSelectedModel] = useState<string>('AUTO');
  const [localResultLimit, setLocalResultLimit] = useState<'AUTO' | 10 | 25 | 50 | 100>(propResultLimit || 'AUTO');
  const [availableModels, setAvailableModels] = useState<AIModelCapabilityInfo[]>([]);
  const [preFlightEstimate, setPreFlightEstimate] = useState<AIPreFlightEstimate | null>(null);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [isEstimating, setIsEstimating] = useState<boolean>(false);
  const [showConfirmationWarning, setShowConfirmationWarning] = useState<boolean>(false);

  const effectiveFamily = productFamily || category || 'ALL';

  const handleLimitChange = (newLimit: 'AUTO' | 10 | 25 | 50 | 100) => {
    setLocalResultLimit(newLimit);
    if (onResultLimitChange) onResultLimitChange(newLimit);
  };

  const handleFamilySelect = (val: string) => {
    if (onProductFamilyChange) onProductFamilyChange(val);
    if (onCategoryChange) onCategoryChange(val);
  };

  // Fetch Central Models Catalog on Mount (Zero Hardcoded List)
  useEffect(() => {
    let isMounted = true;
    aiGateway.getAvailableModels('RESEARCH_INTELLIGENCE')
      .then(res => {
        if (isMounted && res && Array.isArray(res.models)) {
          setAvailableModels(res.models);
        }
      })
      .catch(err => {
        console.warn('[SourcingHeader] Models fetch error:', err);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Live Zero-Cost Pre-Flight Estimator Trigger (Debounced & Deduplicated)
  const lastEstimateKeyRef = useRef<string>('');

  useEffect(() => {
    const clean = (searchQuery || '').trim();
    if (!clean || clean.length < 3) {
      setPreFlightEstimate(null);
      setEstimateError(null);
      setShowConfirmationWarning(false);
      lastEstimateKeyRef.current = '';
      return;
    }

    const currentKey = `${clean}|${country}|${period}|${researchMode}|${selectedModel}|${effectiveFamily}|${localResultLimit}`;
    if (lastEstimateKeyRef.current === currentKey) {
      return; // Deduplicate identical params
    }

    let isMounted = true;
    const timer = setTimeout(async () => {
      // Mark key immediately to prevent duplicate loops
      lastEstimateKeyRef.current = currentKey;
      setIsEstimating(true);
      setEstimateError(null);

      try {
        const est = await aiGateway.estimateCost({
          query: clean,
          country,
          product_family: effectiveFamily,
          category: effectiveFamily,
          research_depth: researchMode,
          requested_model: selectedModel,
          time_scope: period === 'all' ? 'ALL_TIME' : period,
          period: period === 'all' ? 'ALL_TIME' : period,
          result_limit: localResultLimit,
          resultLimit: localResultLimit
        });

        if (isMounted) {
          setPreFlightEstimate(est);
          setEstimateError(null);
          if (est?.requires_confirmation) {
            setShowConfirmationWarning(true);
          } else {
            setShowConfirmationWarning(false);
          }
        }
      } catch (err: any) {
        console.warn('[SourcingHeader] Pre-flight estimation error:', err);
        if (isMounted) {
          setPreFlightEstimate(null);
          setEstimateError(err?.message || 'Error al conectar con el estimador');
          setShowConfirmationWarning(false);
        }
      } finally {
        if (isMounted) setIsEstimating(false);
      }
    }, 380);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [searchQuery, country, period, researchMode, selectedModel, effectiveFamily, localResultLimit]);

  const handleRunSearch = (forceRefresh = false) => {
    if (preFlightEstimate?.requires_confirmation && !showConfirmationWarning && !forceRefresh) {
      setShowConfirmationWarning(true);
      return;
    }
    setShowConfirmationWarning(false);
    onExecuteSearch(researchMode, selectedModel, forceRefresh, localResultLimit);
  };

  return (
    <div className="space-y-4">
      {/* BARRA SUPERIOR: MERCADO OBJETIVO + PERÍODO + CATEGORÍA */}
      <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 text-white rounded-2xl p-5 shadow-lg flex flex-wrap items-center justify-between gap-4 border border-slate-800">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-xl bg-gradient-to-tr from-[#f00856] via-pink-600 to-rose-500 shadow-md">
            <BrainCircuit className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 
                className="text-xl font-black tracking-tight text-white"
                style={{ color: '#ffffff' }}
              >
                SOURCING INTELLIGENCE
              </h1>
              <span className="text-[11px] bg-[#f00856]/30 text-pink-200 px-2.5 py-0.5 rounded-full border border-pink-400/40 uppercase font-black tracking-wider">
                Centro de Inteligencia
              </span>
            </div>
            <p 
              className="text-xs text-slate-300 font-medium mt-0.5"
              style={{ color: '#cbd5e1' }}
            >
              Descubrimiento de tendencias, señales de demanda y oportunidades comerciales por país.
            </p>
          </div>
        </div>

        {/* SELECTORES DE CONTEXTO */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Selector de Mercado Objetivo */}
          <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 hover:border-slate-600 px-3.5 py-2 rounded-xl text-xs transition">
            <Globe className="w-4 h-4 text-pink-400" />
            <span className="text-slate-300 font-bold" style={{ color: '#cbd5e1' }}>Mercado Objetivo:</span>
            <select
              value={country}
              onChange={(e) => onCountryChange(e.target.value)}
              className="bg-transparent text-white font-extrabold focus:outline-none cursor-pointer pr-1"
              style={{ color: '#ffffff' }}
            >
              {COUNTRIES.map(c => (
                <option key={c.code} value={c.code} className="bg-slate-900 text-white">
                  {c.flag} {c.label} {c.code !== 'ALL' ? `(${c.code})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Selector de Período */}
          <div className="flex items-center bg-slate-800 border border-slate-700 p-1 rounded-xl text-xs font-bold">
            {(['all', '24h', '7d', '30d', '90d'] as const).map(p => (
              <button
                key={p}
                onClick={() => onPeriodChange(p)}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  period === p 
                    ? 'bg-[#f00856] text-white font-black shadow-xs' 
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {p === 'all' ? 'Sin límite' : p === '24h' ? '24h' : p === '7d' ? '7 días' : p === '30d' ? '30 días' : '90 días'}
              </button>
            ))}
          </div>

          {/* Selector de Tipo de Producto (Product Families) */}
          <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 hover:border-slate-600 px-3.5 py-2 rounded-xl text-xs transition">
            <Package className="w-4 h-4 text-pink-400" />
            <span className="text-slate-300 font-bold" style={{ color: '#cbd5e1' }}>Tipo de Producto:</span>
            <select
              value={effectiveFamily}
              onChange={(e) => handleFamilySelect(e.target.value)}
              className="bg-transparent text-white font-bold focus:outline-none cursor-pointer"
            >
              {COLLECTIBLES_PRODUCT_FAMILIES.map(fam => (
                <option key={fam.id} value={fam.id} className="bg-slate-900 text-white">
                  {fam.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* CUADRO PROMINENTE: ¿QUÉ QUERÉS INVESTIGAR? + COST CONTROL SUITE */}
      <div className="bg-white border border-gray-200/90 rounded-3xl p-6 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <label className="text-base font-extrabold text-gray-900 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#f00856]" />
            <span>¿Qué querés investigar hoy?</span>
          </label>

          {/* CONTROLES DE MODO Y MODELO DE IA */}
          <div className="flex flex-wrap items-center gap-2">
            {/* SELECTOR DE CANTIDAD DE RESULTADOS (HASTA 100 CON BATCHING) */}
            <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl border border-gray-200 text-xs font-bold">
              <span className="text-[11px] text-gray-500 font-extrabold uppercase px-2">Resultados:</span>
              <select
                value={localResultLimit}
                onChange={(e) => handleLimitChange(e.target.value as any)}
                className="bg-white border border-gray-200 text-xs font-extrabold rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#f00856] cursor-pointer text-slate-800"
                title="Cantidad de productos candidatos a descubrir (hasta 100 con particionamiento en lotes)"
              >
                <option value="AUTO">Automático (15)</option>
                <option value="10">10 productos (1 lote)</option>
                <option value="25">25 productos (2 lotes)</option>
                <option value="50">50 productos (3 lotes)</option>
                <option value="100">100 productos (5 lotes)</option>
              </select>
            </div>

            {/* SELECTOR DE MODO DE INVESTIGACIÓN (CHEAP-FIRST DEFAULT) */}
            <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl border border-gray-200 text-xs font-bold">
              <span className="text-[11px] text-gray-500 font-extrabold uppercase px-2">Modo:</span>
              {[
                { id: 'ECONOMICO', label: '⚡ Económico', desc: 'gpt-4o-mini · ~$0.003 - $0.004' },
                { id: 'ESTANDAR', label: '🔎 Estándar', desc: 'gpt-5.6-terra · ~$0.04 - $0.08' },
                { id: 'PROFUNDO', label: '🧠 Profundo', desc: 'gpt-5.6-terra max · ~$0.07 - $0.13' }
              ].map(m => (
                <button
                  key={m.id}
                  onClick={() => setResearchMode(m.id as ResearchDepthMode)}
                  className={`px-3 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
                    researchMode === m.id
                      ? 'bg-slate-900 text-white shadow-xs font-black'
                      : 'text-gray-700 hover:text-gray-900 hover:bg-white'
                  }`}
                  title={m.desc}
                >
                  <span>{m.label}</span>
                </button>
              ))}
            </div>

            {/* SELECTOR MANUAL DE MODELO DE IA (SUPERADMIN ONLY) */}
            {isSuperAdmin ? (
              <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl border border-gray-200 text-xs font-bold">
                <span className="text-[11px] text-gray-500 font-extrabold uppercase px-2 flex items-center gap-1">
                  <Bot className="w-3.5 h-3.5 text-slate-700" />
                  <span>Modelo:</span>
                </span>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className={`bg-white border text-xs font-extrabold rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#f00856] cursor-pointer ${
                    selectedModel !== 'AUTO' 
                    ? 'border-pink-500 text-pink-700 bg-pink-50/50' 
                    : 'border-gray-200 text-slate-800'
                  }`}
                  title="Control exclusivo para Superadmin"
                >
                  <option value="AUTO" className="font-bold">
                    🤖 Automático (Recomendado)
                  </option>
                  {availableModels.map(m => (
                    <option 
                      key={m.id} 
                      value={m.id} 
                      disabled={!m.allowed}
                      className="font-medium"
                    >
                      {m.display_name} {m.badge ? `· ${m.badge}` : ''} {!m.allowed ? `(${m.incompatible_reason || 'No compatible'})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl border border-gray-200 text-xs font-bold">
                <span className="text-[11px] text-gray-500 font-extrabold uppercase px-2 flex items-center gap-1">
                  <Bot className="w-3.5 h-3.5 text-slate-700" />
                  <span>Modelo:</span>
                </span>
                <span className="bg-white border border-gray-200 text-xs font-bold text-slate-700 rounded-xl px-3 py-1.5 flex items-center gap-1">
                  🤖 Automático
                </span>
              </div>
            )}
          </div>
        </div>

        {/* INPUT DE BÚSQUEDA Y BOTÓN PRINCIPAL */}
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="w-5 h-5 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRunSearch(false);
              }}
              placeholder={`Ej: "Buscame productos Pokémon en tendencia", "Nuevos preorders de McFarlane", "Lanzamientos Care Bears 7 días"...`}
              className="w-full pl-12 pr-11 py-4 bg-gray-50/70 border border-gray-300 rounded-2xl text-sm font-semibold text-gray-900 placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#f00856] focus:border-transparent transition shadow-inner"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchQueryChange('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-200 transition"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <button
            onClick={() => handleRunSearch(false)}
            disabled={isSearching}
            className="flex items-center justify-center gap-2 px-9 py-4 bg-gradient-to-r from-[#f00856] to-pink-600 hover:from-[#d0074a] hover:to-pink-700 text-white font-black text-xs rounded-2xl shadow-md transition disabled:opacity-50 cursor-pointer shrink-0"
          >
            {isSearching ? (
              <RefreshCw className="w-4 h-4 animate-spin text-white" />
            ) : (
              <Sparkles className="w-4 h-4 text-pink-200" />
            )}
            <span className="tracking-wider">INVESTIGAR</span>
          </button>
        </div>

        {/* BANNER PRE-FLIGHT DE ESTIMACIÓN DE COSTO Y CACHÉ (USD 0 OPENAI EXECUTED) */}
        {preFlightEstimate && (
          <div className="bg-slate-900 text-white rounded-2xl p-4 border border-slate-800 shadow-md space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 flex-wrap">
                {/* MERCADO OBJETIVO */}
                <div className="flex items-center gap-1.5 bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700">
                  <span className="text-slate-400 font-medium">Mercado Objetivo:</span>
                  <span className="text-white font-bold">
                    {country === 'ALL' || country === 'GLOBAL' ? '🌎 Todos (Global)' : `${COUNTRIES.find(c => c.code === country)?.flag || '🇺🇾'} ${COUNTRIES.find(c => c.code === country)?.label || country}`}
                  </span>
                </div>

                {/* ALCANCE DE BÚSQUEDA */}
                <div className="flex items-center gap-1.5 bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700">
                  <span className="text-slate-400 font-medium">Búsqueda:</span>
                  <span className="text-sky-400 font-bold">🌎 Global</span>
                </div>

                {/* VENTANA TEMPORAL */}
                <div className="flex items-center gap-1.5 bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700">
                  <span className="text-slate-400 font-medium">Período:</span>
                  <span className="text-amber-300 font-bold">
                    {period === 'all' ? 'Sin límite' : (period === '24h' ? '24h' : (period === '7d' ? '7 días' : (period === '30d' ? '30 días' : '90 días')))}
                  </span>
                </div>

                {/* TIPO DE PRODUCTO */}
                <div className="flex items-center gap-1.5 bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700">
                  <Package className="w-3.5 h-3.5 text-purple-400" />
                  <span className="text-slate-400 font-medium">Tipo:</span>
                  <span className="text-purple-300 font-bold">
                    {COLLECTIBLES_PRODUCT_FAMILIES.find(f => f.id === effectiveFamily || f.label === effectiveFamily)?.label || effectiveFamily}
                  </span>
                </div>

                {/* CANTIDAD OBJETIVO Y LOTES PLANIFICADOS */}
                <div className="flex items-center gap-1.5 bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700">
                  <span className="text-slate-400 font-medium">Objetivo:</span>
                  <span className="text-pink-400 font-bold">
                    {preFlightEstimate.max_candidates} productos
                    {preFlightEstimate.batches_planned && preFlightEstimate.batches_planned > 1 ? ` (${preFlightEstimate.batches_planned} lotes)` : ''}
                  </span>
                </div>

                {/* MODELO */}
                <div className="flex items-center gap-1.5 bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-slate-400 font-medium">Modelo:</span>
                  <span className="text-white font-bold">
                    {preFlightEstimate.model}
                    {preFlightEstimate.is_manual_override ? ' (Manual)' : ''}
                  </span>
                </div>

                {/* TOKENS ESTIMADOS */}
                <div className="flex items-center gap-1.5 bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700" title={preFlightEstimate.confidence_label || 'Estimación basada en telemetría de OpenAI Web Search'}>
                  <span className="text-slate-400 font-medium">Tokens est.:</span>
                  <span className="text-white font-bold">
                    {preFlightEstimate.estimated_input_tokens_min && preFlightEstimate.estimated_input_tokens_max
                      ? `~${(preFlightEstimate.estimated_input_tokens_min / 1000).toFixed(1)}K–${(preFlightEstimate.estimated_input_tokens_max / 1000).toFixed(1)}K (Esp. ~${Math.round(preFlightEstimate.estimated_input_tokens / 1000)}K)`
                      : `~${preFlightEstimate.estimated_input_tokens + preFlightEstimate.max_output_tokens}`
                    }
                  </span>
                </div>

                {/* WEB SEARCH */}
                <div className="flex items-center gap-1.5 bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700">
                  <span className="text-slate-400 font-medium">Web Search:</span>
                  <span className="text-emerald-400 font-bold">✓ Activado</span>
                </div>
              </div>

              {/* ESTIMATED COST BADGE */}
              <div className="flex items-center gap-2">
                <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">Costo Estimado:</span>
                <span className="text-base font-black px-3 py-1 rounded-xl bg-[#f00856] text-white shadow-xs">
                  {preFlightEstimate.cache.status === 'HIT' || preFlightEstimate.cache.status === 'HIT_DISCOVERIES' 
                    ? 'USD $0.0000 (Caché)' 
                    : `USD $${preFlightEstimate.estimated_total_min_usd.toFixed(4)} - $${preFlightEstimate.estimated_total_max_usd.toFixed(4)}`
                  }
                </span>
              </div>
            </div>

            {/* CACHE HIT BANNER & ACTIONS */}
            {(preFlightEstimate.cache.status === 'HIT' || preFlightEstimate.cache.status === 'HIT_DISCOVERIES') && (
              <div className="bg-emerald-950/70 border border-emerald-500/40 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 text-emerald-300 font-semibold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    ♻ Resultado reciente disponible en caché ({preFlightEstimate.cache.cached_items_count || 0} productos detectados hace {Math.round((preFlightEstimate.cache.age_seconds || 0) / 60)} min).
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleRunSearch(false)}
                    className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-lg transition cursor-pointer shadow-xs"
                  >
                    USAR RESULTADO RECIENTE ($0.000)
                  </button>
                  <button
                    onClick={() => handleRunSearch(true)}
                    className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-lg transition cursor-pointer border border-slate-700"
                  >
                    INVESTIGAR DE NUEVO
                  </button>
                </div>
              </div>
            )}

            {/* HIGH COST WARNING & DOWNSHIFT OPTION */}
            {showConfirmationWarning && preFlightEstimate.cache.status === 'MISS' && (
              <div className="bg-amber-950/80 border border-amber-500/50 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5 text-amber-200">
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                  <div>
                    <span className="font-black text-white">Aviso de Presupuesto: </span>
                    <span>
                      {selectedModel !== 'AUTO' && preFlightEstimate.cheaper_alternative
                        ? `El modelo manual '${preFlightEstimate.model}' (${preFlightEstimate.cheaper_alternative.cost_multiplier || 10}x más caro) incrementa el costo a ~$${preFlightEstimate.estimated_total_max_usd.toFixed(4)}. Usando Automático costaría ~$${preFlightEstimate.cheaper_alternative.estimated_max_cost_usd.toFixed(4)} (-${preFlightEstimate.cheaper_alternative.savings_percent}% ahorro).`
                        : `Esta consulta en modo ${preFlightEstimate.research_depth_label} puede superar el límite sugerido de $${preFlightEstimate.warning_threshold_usd.toFixed(2)}.`
                      }
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setSelectedModel('AUTO');
                      setResearchMode('ECONOMICO');
                      setShowConfirmationWarning(false);
                    }}
                    className="px-3.5 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black rounded-lg transition cursor-pointer shadow-xs flex items-center gap-1.5"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>VOLVER A AUTOMÁTICO</span>
                  </button>
                  <button
                    onClick={() => setShowConfirmationWarning(false)}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-lg transition cursor-pointer"
                  >
                    CANCELAR
                  </button>
                  <button
                    onClick={() => {
                      setShowConfirmationWarning(false);
                      onExecuteSearch(researchMode, selectedModel, false);
                    }}
                    className="px-3.5 py-1.5 bg-[#f00856] hover:bg-[#d0074a] text-white font-black rounded-lg transition cursor-pointer"
                  >
                    EJECUTAR IGUAL
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ESTIMATION ERROR NOTICE (FAIL-SAFE CONTROLLED NOTIFICATION) */}
        {estimateError && !preFlightEstimate && !isEstimating && (
          <div className="bg-amber-950/80 border border-amber-500/40 text-amber-200 rounded-2xl p-3.5 text-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                No se pudo calcular el costo previo automáticamente ({estimateError}). Podés ejecutar la investigación normalmente.
              </span>
            </div>
            <button
              onClick={() => {
                lastEstimateKeyRef.current = '';
                setEstimateError(null);
                setIsEstimating(true);
                aiGateway.estimateCost({
                  query: (searchQuery || '').trim(),
                  country,
                  research_depth: researchMode,
                  requested_model: selectedModel,
                  time_scope: period === 'all' ? 'ALL_TIME' : period,
                  period: period === 'all' ? 'ALL_TIME' : period
                }).then(est => {
                  setPreFlightEstimate(est);
                  setEstimateError(null);
                }).catch(err => {
                  setEstimateError(err?.message || 'Error de conexión');
                }).finally(() => setIsEstimating(false));
              }}
              className="px-2.5 py-1 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold rounded-lg transition cursor-pointer shrink-0"
            >
              Reintentar
            </button>
          </div>
        )}

        {/* POST-EXECUTION COST & TELEMETRY BADGE */}
        {lastExecutionTelemetry && (
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs font-semibold">
            <div className="flex items-center gap-3 text-slate-700 flex-wrap">
              <span className="font-extrabold text-slate-900 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Última Ejecución:
              </span>
              <span className="bg-white px-2 py-0.5 rounded-md border border-slate-200 text-slate-800">
                Modo: <b>{lastExecutionTelemetry.research_depth || 'ECONOMICO'}</b>
              </span>
              <span className="bg-white px-2 py-0.5 rounded-md border border-slate-200 text-slate-800">
                Modelo Solicitado: <b>{lastExecutionTelemetry.requested_model || 'Automático'}</b>
              </span>
              <span className="bg-white px-2 py-0.5 rounded-md border border-slate-200 text-slate-800">
                Modelo Utilizado: <b>{lastExecutionTelemetry.actual_model || lastExecutionTelemetry.model}</b>
              </span>
              <span className="bg-white px-2 py-0.5 rounded-md border border-slate-200 text-slate-800">
                Latencia: <b>{lastExecutionTelemetry.latency_ms}ms</b>
              </span>
              <span className="bg-white px-2 py-0.5 rounded-md border border-slate-200 text-slate-800">
                Tokens: <b>{lastExecutionTelemetry.total_tokens == null ? 'UNKNOWN' : lastExecutionTelemetry.total_tokens.toLocaleString()}</b>
                {lastExecutionTelemetry.total_tokens != null && (
                  <span className="text-slate-500"> · entrada {lastExecutionTelemetry.input_tokens?.toLocaleString() ?? 'UNKNOWN'} · salida {lastExecutionTelemetry.output_tokens?.toLocaleString() ?? 'UNKNOWN'}</span>
                )}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-500 font-bold uppercase text-[11px]">Costo Real Incurrido:</span>
              <span className={`px-2.5 py-1 rounded-lg font-black text-xs ${
                lastExecutionTelemetry.cost_usd === 0 || lastExecutionTelemetry.cached
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  : 'bg-slate-900 text-white'
              }`}>
                {lastExecutionTelemetry.cached
                  ? 'USD $0.0000 (costo adicional · caché)'
                  : lastExecutionTelemetry.cost_usd == null
                    ? 'UNKNOWN'
                    : `USD ${lastExecutionTelemetry.cost_usd.toFixed(6)}`
                }
              </span>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap text-xs text-gray-600 pt-1">
          <span className="font-extrabold text-gray-800">Sugerencias:</span>
          {['Pokémon TCG en UY', 'Nuevos preorders McFarlane', 'Figuras NECA Alien Romulus', 'Street Fighter Jada 1:12', 'Marvel Legends Spider-Man'].map((sug) => (
            <button
              key={sug}
              onClick={() => {
                onSearchQueryChange(sug);
              }}
              className="px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-pink-100 hover:text-[#f00856] text-gray-700 font-semibold transition cursor-pointer border border-gray-200 hover:border-pink-200"
            >
              {sug}
            </button>
          ))}
        </div>
      </div>

      {/* BLOQUE RESUMEN EJECUTIVO: 6 ESTADOS CLAVE */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { key: 'TRENDING', label: 'TRENDING', icon: Flame, color: 'from-orange-500 to-amber-500', count: activeCounts.trending, desc: 'Alta tracción' },
          { key: 'EMERGING', label: 'EMERGING', icon: Rocket, color: 'from-purple-600 to-indigo-600', count: activeCounts.emerging, desc: 'Detección temprana' },
          { key: 'GROWING', label: 'GROWING', icon: TrendingUp, color: 'from-blue-600 to-cyan-500', count: activeCounts.growing, desc: 'Demanda ascendente' },
          { key: 'NEW', label: 'NEW RELEASES', icon: Sparkle, color: 'from-emerald-500 to-teal-500', count: activeCounts.newReleases, desc: 'Recién anunciados' },
          { key: 'PREORDER', label: 'PREORDERS', icon: Clock, color: 'from-pink-600 to-rose-500', count: activeCounts.preorders, desc: 'Ventana de reserva' },
          { key: 'OPPORTUNITY', label: 'OPPORTUNITIES', icon: Gem, color: 'from-amber-500 to-yellow-400', count: activeCounts.opportunities, desc: 'Margen + Demanda' }
        ].map(item => {
          const Icon = item.icon;
          const isSelected = activeFilterState === item.key;

          return (
            <button
              key={item.key}
              onClick={() => onSelectQuickFilter && onSelectQuickFilter(isSelected ? 'all' : item.key)}
              className={`p-4 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden group ${
                isSelected
                  ? 'bg-slate-900 border-slate-900 text-white shadow-md ring-2 ring-[#f00856]'
                  : 'bg-white border-gray-200 hover:border-gray-300 text-gray-900 shadow-2xs hover:shadow-xs'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className={`p-2 rounded-xl bg-gradient-to-r ${item.color} text-white shadow-2xs`}>
                  <Icon className="w-4 h-4" />
                </div>
                <span className={`text-2xl font-black ${isSelected ? 'text-white' : 'text-gray-900'}`}>
                  {item.count}
                </span>
              </div>
              <div className={`text-xs font-black uppercase tracking-wider ${isSelected ? 'text-pink-400' : 'text-gray-800'}`}>
                {item.label}
              </div>
              <div className={`text-[11px] truncate mt-0.5 ${isSelected ? 'text-slate-400' : 'text-gray-500 font-medium'}`}>
                {item.desc}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

