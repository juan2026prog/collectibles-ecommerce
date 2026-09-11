import React, { useState, useEffect } from 'react';
import { 
  BrainCircuit, Activity, SlidersHorizontal, CheckCircle2, 
  AlertTriangle, RefreshCw, Eye, Sparkles, Database, ShieldAlert,
  Search, Info, ChevronRight, BarChart3, HelpCircle
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { 
  getPersonalizationEngineStatus, 
  debugInspectProductScore,
  updatePersonalizationWeightSettings,
  type PersonalizationEngineStatus,
  type DebugScoreResult
} from '../../../services/sourcing/personalizationAdminService';
import { DEFAULT_SIGNAL_WEIGHTS, type SignalEventType } from '../../../services/sourcing/personalizationEngine';

export function SourcingPersonalizationPanel() {
  const [statusData, setStatusData] = useState<PersonalizationEngineStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [weights, setWeights] = useState<Record<SignalEventType, number>>(DEFAULT_SIGNAL_WEIGHTS);
  const [savingWeights, setSavingWeights] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Debug Inspector State
  const [debugSearchQuery, setDebugSearchQuery] = useState('');
  const [candidateProducts, setCandidateProducts] = useState<any[]>([]);
  const [searchingProducts, setSearchingProducts] = useState(false);
  const [selectedDebugProduct, setSelectedDebugProduct] = useState<any | null>(null);
  const [debugResult, setDebugResult] = useState<DebugScoreResult | null>(null);

  useEffect(() => {
    loadEngineStatus();
  }, []);

  const loadEngineStatus = async () => {
    setLoadingStatus(true);
    const res = await getPersonalizationEngineStatus();
    setStatusData(res);
    setLoadingStatus(false);
  };

  const handleWeightChange = (key: SignalEventType, val: number) => {
    setWeights(prev => ({ ...prev, [key]: val }));
  };

  const handleSaveWeights = async () => {
    setSavingWeights(true);
    const ok = await updatePersonalizationWeightSettings(weights);
    setSavingWeights(false);
    if (ok) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }
  };

  const handleSearchDebugProducts = async (query: string) => {
    setDebugSearchQuery(query);
    if (!query.trim()) {
      setCandidateProducts([]);
      return;
    }
    setSearchingProducts(true);
    try {
      const { data } = await supabase
        .from('products')
        .select('id, title, slug, base_price, brand:brands(name), category:categories(name)')
        .ilike('title', `%${query.trim()}%`)
        .limit(6);

      setCandidateProducts(data || []);
    } catch {
      setCandidateProducts([]);
    } finally {
      setSearchingProducts(false);
    }
  };

  const handleSelectDebugProduct = async (product: any) => {
    setSelectedDebugProduct(product);
    const result = await debugInspectProductScore(product);
    setDebugResult(result);
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-950 border border-white/10 p-6 rounded-3xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#f00856]/10 border border-[#f00856]/30 flex items-center justify-center text-[#f00856]">
            <BrainCircuit size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black text-white uppercase tracking-tight">Personalization Engine</h2>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${
                statusData?.status === 'OPERATIVO'
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
              }`}>
                {statusData?.status || 'CARGANDO'}
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              FASE 3 — Motor determinístico de relevancia personal y ranking de productos
            </p>
          </div>
        </div>

        <button
          onClick={loadEngineStatus}
          disabled={loadingStatus}
          className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition cursor-pointer self-start md:self-auto"
        >
          <RefreshCw size={14} className={loadingStatus ? 'animate-spin' : ''} />
          <span>Actualizar Métricas</span>
        </button>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-zinc-950 border border-white/10 p-5 rounded-2xl">
          <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500 block mb-1">Señales (24h)</span>
          <span className="text-2xl font-mono font-black text-white">{statusData?.processedSignals24h ?? 0}</span>
          <span className="text-[10px] text-emerald-400 block mt-1">Eventos registrados</span>
        </div>

        <div className="bg-zinc-950 border border-white/10 p-5 rounded-2xl">
          <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500 block mb-1">Perfiles Activos</span>
          <span className="text-2xl font-mono font-black text-white">{statusData?.activeProfilesCount ?? 0}</span>
          <span className="text-[10px] text-sky-400 block mt-1">Usuarios aprendidos</span>
        </div>

        <div className="bg-zinc-950 border border-white/10 p-5 rounded-2xl">
          <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500 block mb-1">Latencia Media</span>
          <span className="text-2xl font-mono font-black text-white">{statusData?.avgRankTimeMs ?? 0} ms</span>
          <span className="text-[10px] text-emerald-400 block mt-1">Sin impacto en render</span>
        </div>

        <div className="bg-zinc-950 border border-white/10 p-5 rounded-2xl">
          <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500 block mb-1">Cobertura</span>
          <span className="text-2xl font-mono font-black text-white">{statusData?.personalizationCoveragePercent ?? 0}%</span>
          <span className="text-[10px] text-purple-400 block mt-1">Personalización activa</span>
        </div>

        <div className="bg-zinc-950 border border-white/10 p-5 rounded-2xl">
          <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500 block mb-1">Fallback Rate</span>
          <span className="text-2xl font-mono font-black text-white">{statusData?.fallbackRatePercent ?? 0}%</span>
          <span className="text-[10px] text-amber-400 block mt-1">Ranking global seguro</span>
        </div>

        <div className="bg-zinc-950 border border-white/10 p-5 rounded-2xl">
          <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500 block mb-1">CTR Personalizado</span>
          <span className="text-2xl font-mono font-black text-[#f00856]">{statusData?.ctrPercent ?? 0}%</span>
          <span className="text-[10px] text-zinc-400 block mt-1">Ratio de conversión</span>
        </div>
      </div>

      {/* Main Grid: Settings & Debug Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Signal Weight Controls */}
        <div className="bg-zinc-950 border border-white/10 p-6 rounded-3xl space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-2">
                <SlidersHorizontal size={18} className="text-[#f00856]" />
                Ponderación de Señales
              </h3>
              <p className="text-xs text-zinc-400 mt-1">Configuración central determinística de pesos por comportamiento</p>
            </div>
            <button
              onClick={handleSaveWeights}
              disabled={savingWeights}
              className="px-4 py-2 rounded-xl bg-[#f00856] hover:bg-[#d0074a] text-white text-xs font-bold uppercase tracking-wider transition cursor-pointer"
            >
              {savingWeights ? 'Guardando...' : saveSuccess ? '✓ Guardado' : 'Guardar Pesos'}
            </button>
          </div>

          <div className="space-y-3 max-h-[420px] overflow-y-auto pr-2">
            {Object.entries(weights).map(([signalKey, weightValue]) => (
              <div key={signalKey} className="flex items-center justify-between p-3 bg-zinc-900/60 border border-white/5 rounded-xl text-xs">
                <div>
                  <span className="font-mono font-bold text-white block">{signalKey}</span>
                  <span className="text-[10px] text-zinc-500">
                    {weightValue > 5 ? 'Señal fuerte' : weightValue > 2 ? 'Señal media' : weightValue < 0 ? 'Señal negativa' : 'Señal débil'}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="-10"
                    max="20"
                    step="0.5"
                    value={weightValue}
                    onChange={(e) => handleWeightChange(signalKey as SignalEventType, parseFloat(e.target.value))}
                    className="w-24 accent-[#f00856]"
                  />
                  <span className="font-mono font-bold text-white w-10 text-right">
                    {weightValue > 0 ? `+${weightValue}` : weightValue}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Debug Mode Inspector */}
        <div className="bg-zinc-950 border border-white/10 p-6 rounded-3xl space-y-6">
          <div>
            <h3 className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-2">
              <Eye size={18} className="text-sky-400" />
              Debug Mode — Score Inspector
            </h3>
            <p className="text-xs text-zinc-400 mt-1">Auditoría transparente de la fórmula de ordenamiento por producto</p>
          </div>

          {/* Search Product to Inspect */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Buscar producto para auditar score..."
              value={debugSearchQuery}
              onChange={(e) => handleSearchDebugProducts(e.target.value)}
              className="w-full bg-zinc-900 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-sky-400"
            />
          </div>

          {/* Candidate Product List */}
          {candidateProducts.length > 0 && (
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {candidateProducts.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleSelectDebugProduct(p)}
                  className={`w-full p-3 rounded-xl border text-left text-xs transition flex items-center justify-between ${
                    selectedDebugProduct?.id === p.id
                      ? 'bg-sky-500/20 border-sky-500 text-white'
                      : 'bg-zinc-900/40 border-white/5 text-zinc-300 hover:border-white/20'
                  }`}
                >
                  <span className="font-bold truncate">{p.title}</span>
                  <span className="text-[10px] font-mono text-zinc-500">{p.brand?.name}</span>
                </button>
              ))}
            </div>
          )}

          {/* Debug Result Breakdown */}
          {debugResult ? (
            <div className="bg-zinc-900/80 border border-white/10 p-5 rounded-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div>
                  <h4 className="font-black text-white text-sm">{debugResult.productTitle}</h4>
                  <span className="text-[10px] text-zinc-400 font-mono">
                    {debugResult.brand} · {debugResult.license || 'Sin Licencia'} · {debugResult.scale || 'Sin Escala'}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-zinc-500 block">FINAL RANK</span>
                  <span className="text-2xl font-mono font-black text-[#f00856]">{debugResult.breakdown.finalRank}</span>
                </div>
              </div>

              {/* Sub-scores */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-zinc-950 p-2.5 rounded-xl border border-white/5">
                  <span className="text-zinc-500 text-[10px] font-bold uppercase block">Opportunity Score</span>
                  <span className="font-mono font-bold text-white">{debugResult.breakdown.opportunityScore} / 100</span>
                </div>
                <div className="bg-zinc-950 p-2.5 rounded-xl border border-white/5">
                  <span className="text-zinc-500 text-[10px] font-bold uppercase block">Personal Relevance</span>
                  <span className="font-mono font-bold text-sky-400">{debugResult.breakdown.personalRelevance} / 100</span>
                </div>
                <div className="bg-zinc-950 p-2.5 rounded-xl border border-white/5">
                  <span className="text-zinc-500 text-[10px] font-bold uppercase block">Freshness Score</span>
                  <span className="font-mono font-bold text-emerald-400">+{debugResult.breakdown.freshnessScore}</span>
                </div>
                <div className="bg-zinc-950 p-2.5 rounded-xl border border-white/5">
                  <span className="text-zinc-500 text-[10px] font-bold uppercase block">Frequency Penalty</span>
                  <span className="font-mono font-bold text-amber-400">-{debugResult.breakdown.frequencyPenalty}</span>
                </div>
              </div>

              {/* Reasons */}
              <div>
                <span className="text-[10px] font-bold text-zinc-400 uppercase block mb-2">Razones atribuidas:</span>
                {debugResult.breakdown.reasons.length > 0 ? (
                  <div className="space-y-1">
                    {debugResult.breakdown.reasons.map((r, idx) => (
                      <div key={idx} className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg">
                        <CheckCircle2 size={12} />
                        <span>{r.label}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-zinc-500 italic block">Sin razones de alta afinidad (ranking base comercial)</span>
                )}
              </div>
            </div>
          ) : (
            <div className="p-8 text-center border border-dashed border-white/10 rounded-2xl">
              <Info size={28} className="mx-auto mb-2 text-zinc-600" />
              <p className="text-xs text-zinc-400">Buscá un producto arriba para inspeccionar el desglose completo del algoritmo.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
