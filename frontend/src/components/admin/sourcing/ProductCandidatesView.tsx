import React, { useState } from 'react';
import { 
  Sparkles, ExternalLink, Bookmark, HelpCircle, ArrowRight, 
  CheckCircle2, AlertTriangle, Layers, Clock, ShieldCheck, Download, Search
} from 'lucide-react';
import type { SourcingProductCandidate } from '../../types/sourcingIntelligence';

interface ProductCandidatesViewProps {
  candidates: SourcingProductCandidate[];
  country: string;
  onOpenWhyModal: (candidate: SourcingProductCandidate) => void;
  onSendToImport: (candidate: SourcingProductCandidate) => void;
  onToggleWatchlist: (candidate: SourcingProductCandidate) => void;
  onIgnore: (candidateId: string) => void;
  isSendingToImport?: boolean;
}

export const ProductCandidatesView: React.FC<ProductCandidatesViewProps> = ({
  candidates,
  country,
  onOpenWhyModal,
  onSendToImport,
  onToggleWatchlist,
  onIgnore,
  isSendingToImport = false
}) => {
  const [filterQuery, setFilterQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filtered = candidates.filter(c => {
    if (filterQuery) {
      const q = filterQuery.toLowerCase();
      const matchTitle = c.title.toLowerCase().includes(q);
      const matchBrand = c.brand.toLowerCase().includes(q);
      const matchFran = c.franchise.toLowerCase().includes(q);
      if (!matchTitle && !matchBrand && !matchFran) return false;
    }
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    return true;
  });

  if (candidates.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-3xl p-12 text-center space-y-3">
        <Sparkles className="w-8 h-8 text-gray-400 mx-auto" />
        <h3 className="text-base font-bold text-gray-900">No hay productos candidatos en esta vista</h3>
        <p className="text-xs text-gray-500 max-w-md mx-auto">
          Ejecutá una investigación desde la barra superior o activá el Discovery Automático para detectar oportunidades comerciales.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* BARRA DE FILTRADO INTERNO */}
      <div className="bg-white border border-gray-200 rounded-2xl p-3 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Filtrar candidatos por nombre, marca o franquicia..."
            className="w-full text-xs font-semibold focus:outline-none text-gray-900 placeholder:text-gray-500"
          />
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-bold text-gray-700">Estado:</span>
          {['all', 'OPPORTUNITY', 'TRENDING', 'EMERGING', 'PREORDER', 'NEW'].map(st => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                statusFilter === st 
                  ? 'bg-slate-900 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {st === 'all' ? 'Todos' : st}
            </button>
          ))}
        </div>
      </div>

      {/* GRID DE CANDIDATOS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(cand => {
          const isPreorder = cand.status === 'PREORDER';
          const isOpportunity = cand.status === 'OPPORTUNITY';
          const isOutsideWatchlist = cand.discovered_from === 'DISCOVERED_OUTSIDE_WATCHLIST';

          return (
            <div
              key={cand.id}
              className="bg-white border border-gray-200 hover:border-gray-300 rounded-3xl p-4 shadow-xs flex flex-col justify-between space-y-3 transition-all hover:shadow-md"
            >
              <div className="space-y-3">
                {/* CABECERA CON IMAGEN Y BADGES */}
                <div className="flex gap-3 items-start">
                  <div className="w-20 h-20 rounded-2xl bg-gray-50 border border-gray-100 overflow-hidden shrink-0 flex items-center justify-center relative">
                    <img
                      src={cand.image_url}
                      alt={cand.title}
                      className="w-full h-full object-contain p-1"
                      onError={(e) => {
                        (e.target as any).src = 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600&auto=format&fit=crop&q=80';
                      }}
                    />
                    {isPreorder && (
                      <span className="absolute bottom-1 left-1 bg-pink-600 text-white text-[9px] font-black px-1.5 py-0.2 rounded-md">
                        PREORDER
                      </span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded-md uppercase truncate">
                        {cand.brand}
                      </span>
                      {isOutsideWatchlist && (
                        <span className="text-[9px] bg-amber-100 text-amber-800 font-extrabold px-1.5 py-0.5 rounded-md border border-amber-200">
                          Fuera de Watchlist
                        </span>
                      )}
                    </div>
                    <h4 className="text-xs font-black text-gray-900 leading-snug mt-1 line-clamp-2">
                      {cand.title}
                    </h4>
                    <span className="text-[10px] text-gray-500 font-medium block truncate mt-0.5">
                      {cand.franchise} {cand.line ? `· ${cand.line}` : ''}
                    </span>
                  </div>
                </div>

                {/* SCORES DETERMINÍSTICOS */}
                <div className="grid grid-cols-2 gap-2 bg-slate-50 border border-slate-100 p-2.5 rounded-2xl">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-500">Opportunity</span>
                    <span className="text-xs font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
                      {cand.opportunity_score}/100
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-500">Trend Score</span>
                    <span className="text-xs font-black text-slate-900 bg-white px-2 py-0.5 rounded-lg border border-slate-200">
                      {cand.trend_score}/100
                    </span>
                  </div>
                </div>

                {/* BENCHMARKS DE PRECIOS & MERCADO */}
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between text-gray-600">
                    <span className="text-[11px]">Origen ({cand.retailer_source.toUpperCase()}):</span>
                    <strong className="text-gray-900 font-bold">
                      ${cand.pricing.amazon_price_usd?.toFixed(2) || 'N/A'}
                    </strong>
                  </div>

                  {cand.pricing.tiendamia_price_usd ? (
                    <div className="flex items-center justify-between text-gray-600">
                      <span className="text-[11px]">TiendaMía ({country}):</span>
                      <span className="text-slate-800 font-bold">
                        ${cand.pricing.tiendamia_price_usd.toFixed(2)}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between text-gray-400 text-[10px]">
                      <span>TiendaMía:</span>
                      <span>No listado (Oportunidad)</span>
                    </div>
                  )}

                  {cand.pricing.mercadolibre_price_local && (
                    <div className="flex items-center justify-between text-gray-600">
                      <span className="text-[11px]">Mercado Libre {country}:</span>
                      <span className="text-blue-700 font-extrabold">
                        {cand.pricing.mercadolibre_currency === 'UYU' ? '$U' : '$'} {cand.pricing.mercadolibre_price_local.toLocaleString()}
                      </span>
                    </div>
                  )}

                  <div className="pt-1.5 border-t border-gray-100 flex items-center justify-between font-bold">
                    <span className="text-[11px] text-gray-500">Costo Puesto / Margen:</span>
                    <div className="text-right">
                      <span className="text-gray-900 font-black">${cand.pricing.landed_cost_estimated_usd.toFixed(2)}</span>
                      <span className="text-emerald-600 font-black text-[11px] ml-1.5">
                        (+{cand.pricing.estimated_margin_percent.toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* BOTONES DE ACCIÓN */}
              <div className="pt-2 border-t border-gray-100 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onOpenWhyModal(cand)}
                    className="p-2 rounded-xl border border-pink-200 bg-pink-50/50 hover:bg-pink-100 text-[#f00856] text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                    title="Ver explicación completa: ¿Por qué Collectibles recomienda esto?"
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                    <span className="text-[10px]">WHY?</span>
                  </button>

                  <button
                    onClick={() => onToggleWatchlist(cand)}
                    className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-600 text-xs transition cursor-pointer"
                    title="Añadir a Watchlist"
                  >
                    <Bookmark className="w-3.5 h-3.5" />
                  </button>

                  <a
                    href={cand.retailer_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-400 hover:text-gray-700 transition"
                    title="Ver publicación de origen"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>

                <button
                  onClick={() => onSendToImport(cand)}
                  disabled={isSendingToImport}
                  className="px-3.5 py-2 bg-[#f00856] hover:bg-[#d0074a] text-white text-xs font-black rounded-xl transition flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50 shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Enviar a Importar</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
