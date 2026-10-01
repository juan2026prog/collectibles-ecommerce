import React from 'react';
import { 
  Flame, TrendingUp, TrendingDown, ArrowRight, Bookmark, 
  EyeOff, Sparkles, CheckCircle2, ShieldAlert, Layers
} from 'lucide-react';
import type { SourcingTrendCard } from '../../types/sourcingIntelligence';

interface TrendCardGridProps {
  trends: SourcingTrendCard[];
  onViewResearch: (trend: SourcingTrendCard) => void;
  onViewProducts: (trend: SourcingTrendCard) => void;
  onToggleFollow: (trend: SourcingTrendCard) => void;
  onIgnore: (trendId: string) => void;
}

export const TrendCardGrid: React.FC<TrendCardGridProps> = ({
  trends,
  onViewResearch,
  onViewProducts,
  onToggleFollow,
  onIgnore
}) => {
  if (trends.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-3xl p-12 text-center space-y-3">
        <Sparkles className="w-8 h-8 text-gray-400 mx-auto" />
        <h3 className="text-base font-bold text-gray-900">No hay tendencias activas detectadas</h3>
        <p className="text-xs text-gray-500 max-w-md mx-auto">
          Escribí un término en la caja de investigación o seleccioná otro período/mercado para generar análisis de mercado.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {trends.map(trend => {
        const isTrending = trend.status === 'TRENDING';
        const isEmerging = trend.status === 'EMERGING';
        const isPreorder = trend.status === 'PREORDER';

        return (
          <div
            key={trend.id}
            className="bg-white border border-gray-200/90 hover:border-pink-300 rounded-3xl p-6 shadow-sm transition-all flex flex-col justify-between space-y-5 hover:shadow-md group"
          >
            {/* CABECERA DE TARJETA */}
            <div className="space-y-3.5">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-black tracking-wider uppercase ${
                      isTrending ? 'bg-orange-100 text-orange-800 border border-orange-200' :
                      isEmerging ? 'bg-purple-100 text-purple-800 border border-purple-200' :
                      isPreorder ? 'bg-pink-100 text-pink-800 border border-pink-200' :
                      'bg-blue-100 text-blue-800 border border-blue-200'
                    }`}>
                      {trend.status}
                    </span>
                    <span className="text-[11px] bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-full font-bold">
                      {trend.category}
                    </span>
                  </div>
                  <h3 className="text-base font-black text-gray-900 tracking-tight leading-snug pt-0.5">
                    {trend.topic}
                  </h3>
                </div>

                {/* TREND SCORE BADGE */}
                <div className="flex flex-col items-end shrink-0">
                  <div className="flex items-center gap-1.5 bg-slate-950 text-white px-3 py-1.5 rounded-xl shadow-xs border border-slate-800">
                    <span className="text-[11px] font-bold text-slate-400">Score</span>
                    <span className="text-sm font-black text-white">{trend.composite_trend_score}</span>
                    {trend.direction === 'UP' ? (
                      <TrendingUp className="w-4 h-4 text-emerald-400" />
                    ) : trend.direction === 'DOWN' ? (
                      <TrendingDown className="w-4 h-4 text-rose-400" />
                    ) : null}
                  </div>
                  <span className="text-[10px] text-gray-400 font-bold mt-1">
                    Confianza {trend.confidence}
                  </span>
                </div>
              </div>

              {/* DRIVERS DE TENDENCIA */}
              <div className="bg-slate-50/90 border border-slate-200/80 rounded-2xl p-3.5 space-y-2">
                <span className="text-[11px] font-extrabold text-slate-600 uppercase tracking-wider block">
                  Drivers Detectados ({trend.country}):
                </span>
                <ul className="text-xs text-gray-800 space-y-1.5 font-medium">
                  {trend.drivers.slice(0, 3).map((d, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#f00856] shrink-0 shadow-2xs" />
                      <span className="truncate">{d}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* SUBTRENDS PILLS */}
              {trend.subtrends.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-extrabold text-gray-400 uppercase tracking-wider block">
                    Subtrends Clave:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {trend.subtrends.map((sub, i) => (
                      <span
                        key={i}
                        className="text-xs font-semibold bg-gray-100 hover:bg-pink-50 hover:text-[#f00856] text-gray-700 px-2.5 py-1 rounded-xl transition border border-gray-200 hover:border-pink-200"
                      >
                        {sub}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ACCIONES INFERIORES */}
            <div className="pt-3.5 border-t border-gray-100 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => onToggleFollow(trend)}
                  className={`p-2.5 rounded-xl border text-xs font-bold transition cursor-pointer ${
                    trend.is_following 
                      ? 'bg-pink-50 border-pink-200 text-[#f00856]' 
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-100'
                  }`}
                  title={trend.is_following ? 'Siguiendo en Watchlist' : 'Seguir tendencia'}
                >
                  <Bookmark className="w-4 h-4" />
                </button>

                <button
                  onClick={() => onIgnore(trend.id)}
                  className="p-2.5 rounded-xl border border-gray-200 text-gray-400 hover:text-gray-700 hover:bg-gray-100 text-xs transition cursor-pointer"
                  title="Ignorar esta tendencia"
                >
                  <EyeOff className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => onViewResearch(trend)}
                  className="px-3.5 py-2 rounded-xl border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-bold transition cursor-pointer"
                >
                  Ver Análisis
                </button>

                <button
                  onClick={() => onViewProducts(trend)}
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <span>Ver Productos</span>
                  <ArrowRight className="w-4 h-4 text-pink-400" />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
