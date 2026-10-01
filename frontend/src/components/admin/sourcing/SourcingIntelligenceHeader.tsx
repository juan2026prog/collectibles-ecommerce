import React from 'react';
import { 
  Sparkles, Search, Globe, Calendar, Filter, BrainCircuit, 
  Flame, Rocket, TrendingUp, Sparkle, Clock, Gem, X, RefreshCw
} from 'lucide-react';

interface SourcingIntelligenceHeaderProps {
  country: string;
  onCountryChange: (c: string) => void;
  period: '24h' | '7d' | '30d' | '90d';
  onPeriodChange: (p: '24h' | '7d' | '30d' | '90d') => void;
  category: string;
  onCategoryChange: (cat: string) => void;
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  onExecuteSearch: () => void;
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
}

const COUNTRIES = [
  { code: 'UY', label: 'Uruguay', flag: '🇺🇾', active: true },
  { code: 'AR', label: 'Argentina', flag: '🇦🇷', active: true },
  { code: 'CL', label: 'Chile', flag: '🇨🇱', active: true },
  { code: 'PE', label: 'Perú', flag: '🇵🇪', active: true },
  { code: 'MX', label: 'México', flag: '🇲🇽', active: true }
];

const CATEGORIES = [
  'Todas',
  'Figuras de Acción 7"',
  'Figuras 1:12',
  'Figuras Premium 1:6',
  'Trading Cards & TCG',
  'Estatuas & Bustos',
  'Retro & Vintage',
  'Funkos & Miniatures'
];

export const SourcingIntelligenceHeader: React.FC<SourcingIntelligenceHeaderProps> = ({
  country,
  onCountryChange,
  period,
  onPeriodChange,
  category,
  onCategoryChange,
  searchQuery,
  onSearchQueryChange,
  onExecuteSearch,
  isSearching,
  activeCounts,
  activeFilterState = 'all',
  onSelectQuickFilter
}) => {
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
              <h1 className="text-xl font-black tracking-tight text-white">
                SOURCING INTELLIGENCE
              </h1>
              <span className="text-[11px] bg-[#f00856]/30 text-pink-200 px-2.5 py-0.5 rounded-full border border-pink-400/40 uppercase font-black tracking-wider">
                Centro de Inteligencia
              </span>
            </div>
            <p className="text-xs text-slate-300 font-medium mt-0.5">
              Descubrimiento de tendencias, señales de demanda y oportunidades comerciales por país.
            </p>
          </div>
        </div>

        {/* SELECTORES DE CONTEXTO */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Selector de País */}
          <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 hover:border-slate-600 px-3.5 py-2 rounded-xl text-xs transition">
            <Globe className="w-4 h-4 text-pink-400" />
            <span className="text-slate-300 font-bold">Mercado:</span>
            <select
              value={country}
              onChange={(e) => onCountryChange(e.target.value)}
              className="bg-transparent text-white font-extrabold focus:outline-none cursor-pointer pr-1"
            >
              {COUNTRIES.map(c => (
                <option key={c.code} value={c.code} className="bg-slate-900 text-white">
                  {c.flag} {c.label} ({c.code})
                </option>
              ))}
            </select>
          </div>

          {/* Selector de Período */}
          <div className="flex items-center bg-slate-800 border border-slate-700 p-1 rounded-xl text-xs font-bold">
            {(['24h', '7d', '30d', '90d'] as const).map(p => (
              <button
                key={p}
                onClick={() => onPeriodChange(p)}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  period === p 
                    ? 'bg-[#f00856] text-white font-black shadow-xs' 
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {p === '24h' ? '24h' : p === '7d' ? '7 días' : p === '30d' ? '30 días' : '90 días'}
              </button>
            ))}
          </div>

          {/* Selector de Categoría */}
          <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 hover:border-slate-600 px-3.5 py-2 rounded-xl text-xs transition">
            <Filter className="w-4 h-4 text-pink-400" />
            <select
              value={category}
              onChange={(e) => onCategoryChange(e.target.value)}
              className="bg-transparent text-white font-bold focus:outline-none cursor-pointer"
            >
              {CATEGORIES.map(cat => (
                <option key={cat} value={cat} className="bg-slate-900 text-white">
                  {cat}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* CUADRO PROMINENTE: ¿QUÉ QUERÉS INVESTIGAR? */}
      <div className="bg-white border border-gray-200/90 rounded-3xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <label className="text-base font-extrabold text-gray-900 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#f00856]" />
            <span>¿Qué querés investigar hoy?</span>
          </label>
          <span className="text-xs text-gray-500 font-semibold bg-gray-100 px-2.5 py-1 rounded-full">
            AI Gateway Central · Evidencia Verificada · Scoring determinístico
          </span>

        </div>

        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="w-5 h-5 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onExecuteSearch();
              }}
              placeholder={`Ej: "Buscame productos Pokémon en tendencia en ${country}", "Nuevos preorders de McFarlane", "Lanzamientos NECA 7 días"...`}
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
            onClick={onExecuteSearch}
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
