import React from 'react';
import type { NormalizedProduct } from '../../../types/sourcing';
import { 
  Bookmark, History, ArrowRight, Eye, CheckCircle2, AlertTriangle, 
  TrendingDown, TrendingUp, RefreshCw, XCircle, Clock, Trash2
} from 'lucide-react';

interface SourcingWatchlistHistoryViewProps {
  watchlistProducts: NormalizedProduct[];
  onOpenAnalysisModal: (product: NormalizedProduct) => void;
  onRemoveFromWatchlist: (productId: string) => void;
  onImportProduct: (product: NormalizedProduct) => void;
}

export const SourcingWatchlistHistoryView: React.FC<SourcingWatchlistHistoryViewProps> = ({
  watchlistProducts,
  onOpenAnalysisModal,
  onRemoveFromWatchlist,
  onImportProduct
}) => {
  return (
    <div className="space-y-6">
      {/* SECCIÓN WATCHLIST */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div>
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <Bookmark className="w-4 h-4 text-[#f00856] fill-current" />
              <span>Oportunidades en Vigilancia (Watchlist)</span>
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Productos monitoreados continuamente ante fluctuaciones de precio origen, stock o scoring.
            </p>
          </div>
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-pink-50 text-[#f00856] border border-pink-200">
            {watchlistProducts.length} Vigilando
          </span>
        </div>

        {watchlistProducts.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {watchlistProducts.map((prod) => (
              <div 
                key={prod.id}
                className="p-4 bg-gray-50/70 border border-gray-200 rounded-xl hover:border-gray-300 transition-all flex flex-col justify-between space-y-3"
              >
                <div className="flex gap-3 items-start">
                  <img
                    src={prod.image_url}
                    alt={prod.title}
                    className="w-12 h-12 object-cover rounded-lg bg-gray-100 border border-gray-200 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <h4 
                      onClick={() => onOpenAnalysisModal(prod)}
                      className="font-bold text-xs text-gray-900 line-clamp-1 cursor-pointer hover:text-[#f00856]"
                    >
                      {prod.title}
                    </h4>
                    <p className="text-[11px] text-gray-500 mt-0.5">{prod.brand} · {prod.license}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Score: {prod.opportunity_score}/100
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs pt-2 border-t border-gray-200/60">
                  <div>
                    <span className="text-gray-500 text-[10px] block">Costo Puesto UY</span>
                    <span className="font-mono font-bold text-gray-900">${prod.financials.real_cost_puesto_usd.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 text-[10px] block">Precio Sugerido</span>
                    <span className="font-mono font-bold text-[#f00856]">${prod.financials.current_sale_price_usd.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 text-[10px] block">Margen</span>
                    <span className="font-mono font-bold text-emerald-600">+{prod.financials.margin_percent.toFixed(0)}%</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-gray-200/60 gap-2">
                  <button
                    onClick={() => onRemoveFromWatchlist(prod.id)}
                    className="p-1.5 text-gray-400 hover:text-rose-600 rounded-lg transition-colors"
                    title="Remover de Watchlist"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => onOpenAnalysisModal(prod)}
                    className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold rounded-lg border border-gray-200"
                  >
                    Ver Ficha
                  </button>

                  <button
                    onClick={() => onImportProduct(prod)}
                    className="px-3 py-1.5 bg-[#f00856] hover:bg-[#d0074a] text-white text-xs font-bold rounded-lg shadow-xs"
                  >
                    Aprobar
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center bg-gray-50/50 rounded-xl border border-gray-200/60 text-xs text-gray-500">
            No tiene productos en Watchlist. Añada productos desde la lista de oportunidades para monitorearlos.
          </div>
        )}
      </div>

      {/* TIMELINE DE CICLO DE VIDA DEL PIPELINE */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="border-b border-gray-100 pb-3">
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <History className="w-4 h-4 text-[#f00856]" />
            <span>Ciclo de Vida de Oportunidades & Trazabilidad</span>
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Estados estandarizados del pipeline de sourcing desde la detección inicial hasta la publicación en producción.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2 text-center text-xs font-bold">
          <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
            <span className="text-[10px] text-gray-400 block uppercase">Fase 1</span>
            <span className="text-gray-900 block mt-1">1. DETECTADO</span>
          </div>

          <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
            <span className="text-[10px] text-gray-400 block uppercase">Fase 2</span>
            <span className="text-gray-900 block mt-1">2. ANALIZANDO</span>
          </div>

          <div className="p-3 bg-blue-50 text-blue-900 rounded-xl border border-blue-200">
            <span className="text-[10px] text-blue-500 block uppercase">Fase 3</span>
            <span className="block mt-1">3. OPORTUNIDAD</span>
          </div>

          <div className="p-3 bg-amber-50 text-amber-900 rounded-xl border border-amber-200">
            <span className="text-[10px] text-amber-600 block uppercase">Fase 4</span>
            <span className="block mt-1">4. WATCHLIST</span>
          </div>

          <div className="p-3 bg-indigo-50 text-indigo-900 rounded-xl border border-indigo-200">
            <span className="text-[10px] text-indigo-500 block uppercase">Fase 5</span>
            <span className="block mt-1">5. APROBADO</span>
          </div>

          <div className="p-3 bg-purple-50 text-purple-900 rounded-xl border border-purple-200">
            <span className="text-[10px] text-purple-500 block uppercase">Fase 6</span>
            <span className="block mt-1">6. LISTO</span>
          </div>

          <div className="p-3 bg-emerald-50 text-emerald-900 rounded-xl border border-emerald-200">
            <span className="text-[10px] text-emerald-600 block uppercase">Fase 7</span>
            <span className="block mt-1">7. PUBLICADO</span>
          </div>
        </div>
      </div>
    </div>
  );
};
