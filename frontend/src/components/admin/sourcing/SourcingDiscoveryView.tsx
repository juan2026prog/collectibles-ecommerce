import React, { useState } from 'react';
import { 
  Sparkles, RefreshCw, Layers, Rocket, Flame, Clock, 
  CheckCircle2, ArrowRight, ShieldCheck, Eye, Bookmark, ExternalLink, Download
} from 'lucide-react';
import type { SourcingProductCandidate } from '../../types/sourcingIntelligence';

interface SourcingDiscoveryViewProps {
  candidates: SourcingProductCandidate[];
  country: string;
  onRunDiscoveryScan: () => void;
  isScanning: boolean;
  onSendToImport: (candidate: SourcingProductCandidate) => void;
  onOpenWhyModal: (candidate: SourcingProductCandidate) => void;
  onToggleWatchlist: (candidate: SourcingProductCandidate) => void;
}

export const SourcingDiscoveryView: React.FC<SourcingDiscoveryViewProps> = ({
  candidates,
  country,
  onRunDiscoveryScan,
  isScanning,
  onSendToImport,
  onOpenWhyModal,
  onToggleWatchlist
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
              <Rocket className="w-4 h-4" />
            </span>
            <span className="text-xs font-black text-purple-300 uppercase tracking-wider">
              Automatic Discovery Engine
            </span>
          </div>
          <h2 className="text-xl font-black text-white tracking-tight">
            Descubrimiento Autónomo de Oportunidades
          </h2>
          <p className="text-xs text-purple-200/80 leading-relaxed">
            Escaneo periódico de nuevos lanzamientos, preorders y picos de demanda en retailers oficiales sin necesidad de introducir términos manuales.
          </p>
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(cand => {
          const isOutside = cand.discovered_from === 'DISCOVERED_OUTSIDE_WATCHLIST';

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
                  <div className="w-16 h-16 rounded-xl bg-gray-50 border border-gray-100 overflow-hidden shrink-0 flex items-center justify-center">
                    <img
                      src={cand.image_url}
                      alt={cand.title}
                      className="w-full h-full object-contain p-1"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded-md uppercase">
                      {cand.brand}
                    </span>
                    <h4 className="text-xs font-black text-gray-900 leading-snug mt-1 line-clamp-2">
                      {cand.title}
                    </h4>
                    <span className="text-[10px] text-gray-500 block truncate">
                      {cand.franchise}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs bg-slate-50 p-2 rounded-xl">
                  <span className="text-[11px] font-bold text-gray-600">Opportunity Score:</span>
                  <span className="text-xs font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
                    {cand.opportunity_score}/100
                  </span>
                </div>

                <div className="text-xs text-gray-600 space-y-1">
                  <div className="flex justify-between">
                    <span>Precio Origen ({cand.retailer_source}):</span>
                    <strong className="text-gray-900">${cand.pricing.amazon_price_usd?.toFixed(2) || 'N/A'}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Costo Puesto {country}:</span>
                    <strong className="text-gray-900">${cand.pricing.landed_cost_estimated_usd.toFixed(2)}</strong>
                  </div>
                  <div className="flex justify-between font-bold text-emerald-600">
                    <span>Margen Estimado:</span>
                    <span>+{cand.pricing.estimated_margin_percent.toFixed(1)}%</span>
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
    </div>
  );
};
