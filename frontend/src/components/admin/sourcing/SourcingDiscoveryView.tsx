import React, { useState } from 'react';
import { 
  Sparkles, RefreshCw, Layers, Rocket, Flame, Clock, 
  CheckCircle2, ArrowRight, ShieldCheck, Eye, Bookmark, ExternalLink, Download, ImageOff, AlertCircle
} from 'lucide-react';
import type { SourcingProductCandidate, SourcingResearchSource } from '../../../types/sourcingIntelligence';

const ProductThumbnail: React.FC<{ src?: string | null; alt: string; isPreorder?: boolean }> = ({ src, alt, isPreorder }) => {
  const [hasError, setHasError] = useState(false);
  const isValid = Boolean(src && typeof src === 'string' && src.startsWith('http') && !src.includes('unsplash.com') && !hasError);

  return (
    <div className="w-16 h-16 rounded-2xl bg-gray-50 border border-gray-100 overflow-hidden shrink-0 flex items-center justify-center relative">
      {isValid ? (
        <img
          src={src!}
          alt={alt}
          className="w-full h-full object-contain p-1"
          onError={() => setHasError(true)}
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center p-1 text-center bg-slate-50 text-slate-400 text-[9px] font-medium">
          <ImageOff className="w-4 h-4 mb-0.5 text-slate-300" />
          <span>Sin imagen</span>
        </div>
      )}
      {isPreorder && (
        <span className="absolute bottom-1 left-1 bg-pink-600 text-white text-[8px] font-black px-1 py-0.2 rounded-md">
          PRE
        </span>
      )}
    </div>
  );
};

interface SourcingDiscoveryViewProps {
  candidates: SourcingProductCandidate[];
  country: string;
  onRunDiscoveryScan: () => void;
  isScanning: boolean;
  discoverySources: SourcingResearchSource[];
  onDiscoverySourcesChange: (sources: SourcingResearchSource[]) => void;
  onSendToImport: (candidate: SourcingProductCandidate) => void;
  onOpenWhyModal: (candidate: SourcingProductCandidate) => void;
  onToggleWatchlist: (candidate: SourcingProductCandidate) => void;
  lastExecutionTelemetry?: {
    input_tokens: number | null;
    output_tokens: number | null;
    total_tokens: number | null;
    cost_usd: number | null;
    cached: boolean;
    calls: number;
  } | null;
}

export const SourcingDiscoveryView: React.FC<SourcingDiscoveryViewProps> = ({
  candidates,
  country,
  onRunDiscoveryScan,
  isScanning,
  discoverySources,
  onDiscoverySourcesChange,
  onSendToImport,
  onOpenWhyModal,
  onToggleWatchlist,
  lastExecutionTelemetry
}) => {
  const [filterMode, setFilterMode] = useState<'all' | 'outside_watchlist' | 'preorders' | 'emerging'>('all');

  const filtered = candidates.filter(c => {
    if (filterMode === 'outside_watchlist') return c.discovered_from === 'DISCOVERED_OUTSIDE_WATCHLIST';
    if (filterMode === 'preorders') return c.status === 'PREORDER';
    if (filterMode === 'emerging') return c.status === 'EMERGING';
    return true;
  });

  const outsideWatchlistCount = candidates.filter(c => c.discovered_from === 'DISCOVERED_OUTSIDE_WATCHLIST').length;
  const preordersCount = candidates.filter(c => c.status === 'PREORDER').length;
  const emergingCount = candidates.filter(c => c.status === 'EMERGING').length;

  return (
    <div className="space-y-5">
      {/* CABECERA DE DISCOVERY */}
      <div className="bg-gradient-to-r from-purple-950 via-slate-900 to-indigo-950 text-white rounded-3xl p-6 shadow-md border border-purple-900/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5 max-w-2xl">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-400/30">
              <Rocket className="w-4 h-4 text-purple-300" />
            </span>
            <span 
              className="text-xs font-black uppercase tracking-wider text-purple-200"
              style={{ color: '#e9d5ff' }}
            >
              Automatic Discovery Engine
            </span>
          </div>
          <h2 
            className="text-xl font-black text-white tracking-tight"
            style={{ color: '#ffffff' }}
          >
            Descubrimiento Autónomo de Oportunidades
          </h2>
          <p 
            className="text-xs leading-relaxed text-slate-200"
            style={{ color: '#e2e8f0' }}
          >
            Escaneo periódico de nuevos lanzamientos, preorders y picos de demanda en retailers oficiales sin necesidad de introducir términos manuales.
          </p>

          {/* Preflight Info Badge ($0 Preflight) */}
          <div className="flex items-center gap-3 pt-1 text-[11px] text-purple-200">
            <span className="flex items-center gap-1 bg-purple-900/60 px-2 py-0.5 rounded-lg border border-purple-700/50">
              <ShieldCheck className="w-3.5 h-3.5 text-purple-300" />
              <span>Modo: ECONÓMICO</span>
            </span>
            <span className="bg-purple-900/60 px-2 py-0.5 rounded-lg border border-purple-700/50">
              Preflight: <strong>$0.00 (0 llamadas)</strong>
            </span>
            <span className="bg-purple-900/60 px-2 py-0.5 rounded-lg border border-purple-700/50">
              Candidatos: <strong>{candidates.length}</strong>
            </span>
          </div>

          {lastExecutionTelemetry && (
            <div className="flex flex-wrap items-center gap-2 pt-2 text-[11px]">
              <span className="bg-white/10 px-2 py-1 rounded-lg border border-purple-500/30">
                Último run: <strong>{lastExecutionTelemetry.calls} llamada{lastExecutionTelemetry.calls === 1 ? '' : 's'} IA</strong>
              </span>
              <span className="bg-white/10 px-2 py-1 rounded-lg border border-purple-500/30">
                Tokens reales: <strong>{lastExecutionTelemetry.total_tokens == null ? 'UNKNOWN' : lastExecutionTelemetry.total_tokens.toLocaleString()}</strong>
              </span>
              <span className="bg-white/10 px-2 py-1 rounded-lg border border-purple-500/30">
                Costo real: <strong>{lastExecutionTelemetry.cached ? 'USD $0.0000 (caché)' : (lastExecutionTelemetry.cost_usd == null ? 'UNKNOWN' : `USD ${lastExecutionTelemetry.cost_usd.toFixed(6)}`)}</strong>
              </span>
            </div>
          )}
        </div>

        <button
          onClick={onRunDiscoveryScan}
          disabled={isScanning}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-[#f00856] to-pink-600 hover:from-[#d0074a] hover:to-pink-700 text-white text-xs font-black rounded-2xl shadow-md transition disabled:opacity-50 cursor-pointer shrink-0"
        >
          {isScanning ? (
            <RefreshCw className="w-4 h-4 animate-spin text-white" />
          ) : (
            <Sparkles className="w-4 h-4 text-pink-200" />
          )}
          <span>{isScanning ? 'Escaneando Mercados...' : 'Ejecutar Escaneo Discovery'}</span>
        </button>
      </div>

      {/* FUENTES DEL DESCUBRIMIENTO: Radar/Release/Watchlist son señales, no fuentes */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-extrabold text-slate-700 mr-1">Dónde investigar automáticamente:</span>
        {([
          { id: 'WEB', label: 'Toda la Web', available: true },
          { id: 'AMAZON', label: 'Amazon', available: true },
          { id: 'EBAY', label: 'eBay', available: false },
          { id: 'BESTBUY', label: 'Best Buy', available: false }
        ] as const).map(source => {
          const checked = discoverySources.includes(source.id as SourcingResearchSource);
          return (
            <label key={source.id} className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold ${source.available ? (checked ? 'border-purple-300 bg-purple-50 text-slate-900 cursor-pointer' : 'border-slate-200 bg-white text-slate-600 cursor-pointer') : 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed'}`}>
              <input
                type="checkbox"
                checked={checked}
                disabled={!source.available || isScanning}
                onChange={() => {
                  if (!source.available) return;
                  const next = checked ? discoverySources.filter(s => s !== source.id) : [...discoverySources, source.id as SourcingResearchSource];
                  if (next.length > 0) onDiscoverySourcesChange(next);
                }}
                className="accent-purple-600"
              />
              <span>{source.label}</span>
              {!source.available && <span className="text-[10px] font-black uppercase">No disponible</span>}
            </label>
          );
        })}
        <span className="text-[11px] text-slate-500 ml-1">Radar, Release Calendar y Watchlist aportan señales; no son fuentes de búsqueda.</span>
      </div>

      {/* TABS DE FILTRO DISCOVERY */}
      <div className="flex items-center gap-2 flex-wrap">
        {[
          { key: 'all', label: 'Todos los Descubrimientos', count: candidates.length },
          { key: 'outside_watchlist', label: '🌟 Fuera de Watchlist', count: outsideWatchlistCount },
          { key: 'preorders', label: '⏳ Nuevos Preorders', count: preordersCount },
          { key: 'emerging', label: '🚀 Señales Emergentes', count: emergingCount }
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilterMode(tab.key as any)}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-2 ${
              filterMode === tab.key 
                ? 'bg-slate-900 text-white shadow-sm' 
                : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <span>{tab.label}</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
              filterMode === tab.key ? 'bg-pink-500 text-white' : 'bg-gray-100 text-gray-700'
            }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* GRID DE CANDIDATOS DESCUBIERTOS */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-3xl p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mx-auto">
            <Sparkles className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-black text-gray-900">
            {candidates.length === 0 
              ? 'No hay descubrimientos registrados para esta selección' 
              : 'No hay descubrimientos que coincidan con este filtro'}
          </h3>
          <p className="text-xs text-gray-500 max-w-md mx-auto">
            {candidates.length === 0
              ? 'Haz clic en "Ejecutar Escaneo Discovery" para explorar fuentes oficiales globales y detectar nuevos lanzamientos y oportunidades de importación.'
              : 'Selecciona otro filtro superior para ver otros descubrimientos disponibles.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(cand => {
            const isOutside = cand.discovered_from === 'DISCOVERED_OUTSIDE_WATCHLIST';
            const priceOrigin = cand.pricing?.amazon_price_usd ?? cand.pricing.origin_price_usd;
            const landedCost = cand.pricing?.landed_cost_estimated_usd ?? null;
            const marginPct = cand.pricing?.estimated_margin_percent ?? null;

            return (
              <div
                key={cand.id}
                className={`bg-white border rounded-3xl p-4 shadow-xs flex flex-col justify-between space-y-3 transition-all hover:shadow-md ${
                  isOutside ? 'border-amber-300 ring-1 ring-amber-200/60' : 'border-gray-200'
                }`}
              >
                <div className="space-y-2.5">
                  {isOutside && (
                    <div className="flex items-center gap-1.5 text-[10px] font-extrabold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-xl border border-amber-200">
                      <Sparkles className="w-3 h-3 text-amber-600 shrink-0" />
                      <span>Tendencia emergente detectada fuera de Watchlist habitual</span>
                    </div>
                  )}

                  <div className="flex gap-3 items-start">
                    <ProductThumbnail
                      src={cand.image_url}
                      alt={cand.title}
                      isPreorder={cand.status === 'PREORDER'}
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded-md uppercase">
                        {cand.brand || 'Coleccionables'}
                      </span>
                      <h4 className="text-xs font-black text-gray-900 leading-snug mt-1 line-clamp-2" title={cand.title}>
                        {cand.title}
                      </h4>
                      <span className="text-[10px] text-gray-500 block truncate">
                        {cand.franchise || 'General'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs bg-slate-50 p-2 rounded-xl">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold text-gray-600">Score:</span>
                      <span className="text-xs font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
                        {cand.opportunity_score}/100
                      </span>
                    </div>
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-md uppercase border ${
                      cand.commercial_readiness === 'READY'
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : cand.commercial_readiness === 'PARTIAL'
                          ? 'bg-amber-100 text-amber-800 border-amber-300'
                          : 'bg-slate-200 text-slate-700 border-slate-300'
                    }`}>
                      {cand.commercial_readiness || 'PARTIAL'}
                    </span>
                  </div>

                  <div className="text-xs text-gray-600 space-y-1">
                    <div className="flex justify-between">
                      <span>Precio Origen ({cand.retailer_source || 'Retailer'}):</span>
                      <strong className="text-gray-900">
                        {priceOrigin ? `$${Number(priceOrigin).toFixed(2)}` : 'N/A'}
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Costo Puesto {country}:</span>
                      <strong className="text-gray-900">
                        {landedCost !== null && landedCost !== undefined ? `$${Number(landedCost).toFixed(2)}` : 'Pendiente'}
                      </strong>
                    </div>
                    <div className="flex justify-between font-bold text-emerald-600">
                      <span>Margen Estimado:</span>
                      {marginPct !== null && marginPct !== undefined ? (
                        <span>+{Number(marginPct).toFixed(1)}%</span>
                      ) : (
                        <span className="text-slate-400 font-normal italic">Sin referencia local</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-gray-100 flex items-center justify-between gap-2">
                  <button
                    onClick={() => onOpenWhyModal(cand)}
                    className="px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-50 transition cursor-pointer"
                  >
                    ¿Por qué?
                  </button>

                  <button
                    onClick={() => onSendToImport(cand)}
                    className="px-3.5 py-1.5 bg-[#f00856] hover:bg-[#d0074a] text-white text-xs font-black rounded-xl transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Importar</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
