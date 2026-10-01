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
      <div className="bg-slate-900 text-white rounded-2xl p-4 shadow-md flex flex-wrap items-center justify-between gap-4 border border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-tr from-[#f00856] to-pink-500 shadow-sm">
            <BrainCircuit className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
              <span>SOURCING INTELLIGENCE</span>
              <span className="text-[10px] bg-pink-500/20 text-pink-300 px-2 py-0.5 rounded-full border border-pink-500/30 uppercase font-bold tracking-wider">
                Centro Comercial
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Descubrimiento de tendencias, señales de demanda y oportunidades comerciales por país.
            </p>
          </div>
        </div>

        {/* SELECTORES DE CONTEXTO */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Selector de País */}
          <div className="flex items-center gap-1.5 bg-slate-800/90 border border-slate-700 px-3 py-1.5 rounded-xl text-xs">
            <Globe className="w-3.5 h-3.5 text-pink-400" />
            <span className="text-slate-400 font-medium">Mercado:</span>
            <select
              value={country}
              onChange={(e) => onCountryChange(e.target.value)}
              className="bg-transparent text-white font-bold focus:outline-none cursor-pointer pr-1"
            >
              {COUNTRIES.map(c => (
                <option key={c.code} value={c.code} className="bg-slate-900 text-white">
                  {c.flag} {c.label} ({c.code})
                </option>
              ))}
            </select>
          </div>

          {/* Selector de Período */}
          <div className="flex items-center bg-slate-800/90 border border-slate-700 p-0.5 rounded-xl text-xs font-semibold">
            {(['24h', '7d', '30d', '90d'] as const).map(p => (
              <button
                key={p}
                onClick={() => onPeriodChange(p)}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  period === p 
                    ? 'bg-[#f00856] text-white font-black shadow-xs' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {p === '24h' ? '24h' : p === '7d' ? '7 días' : p === '30d' ? '30 días' : '90 días'}
              </button>
            ))}
          </div>

          {/* Selector de Categoría */}
          <div className="flex items-center gap-1.5 bg-slate-800/90 border border-slate-700 px-3 py-1.5 rounded-xl text-xs">
            <Filter className="w-3.5 h-3.5 text-pink-400" />
            <select
              value={category}
              onChange={(e) => onCategoryChange(e.target.value)}
              className="bg-transparent text-white font-semibold focus:outline-none cursor-pointer"
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
      <div className="bg-gradient-to-br from-white to-pink-50/40 border border-pink-100 rounded-3xl p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-extrabold text-gray-900 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#f00856]" />
            <span>¿Qué querés investigar hoy?</span>
          </label>
          <span className="text-[11px] text-gray-400 font-medium">
            AI Gateway Central · Datos en tiempo real · Normalización Product Identity
          </span>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onExecuteSearch();
              }}
              placeholder={`Ej: "Buscame productos Pokémon en tendencia en ${country}", "Nuevos preorders de McFarlane", "Lanzamientos NECA 7 días"...`}
              className="w-full pl-10 pr-10 py-3.5 bg-white border border-gray-200 rounded-2xl text-xs font-semibold text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#f00856] focus:border-transparent transition shadow-xs"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchQueryChange('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            onClick={onExecuteSearch}
            disabled={isSearching}
            className="flex items-center justify-center gap-2 px-8 py-3.5 bg-[#f00856] hover:bg-[#d0074a] text-white font-black text-xs rounded-2xl shadow-md transition disabled:opacity-50 cursor-pointer shrink-0"
          >
            {isSearching ? (
              <RefreshCw className="w-4 h-4 animate-spin text-white" />
            ) : (
              <Sparkles className="w-4 h-4 text-pink-200" />
            )}
            <span>INVESTIGAR</span>
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap text-[11px] text-gray-500 pt-1">
          <span className="font-bold text-gray-700">Sugerencias rápidas:</span>
          {['Pokémon TCG en UY', 'Nuevos preorders McFarlane', 'Figuras NECA Alien Romulus', 'Street Fighter Jada 1:12', 'Marvel Legends Spider-Man'].map((sug) => (
            <button
              key={sug}
              onClick={() => {
                onSearchQueryChange(sug);
              }}
              className="px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-pink-100 hover:text-[#f00856] text-gray-700 font-medium transition cursor-pointer"
            >
              {sug}
            </button>
          ))}
        </div>
      </div>

      {/* BLOQUE RESUMEN EJECUTIVO: 6 ESTADOS CLAVE */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {[
          { key: 'TRENDING', label: 'TRENDING', icon: Flame, color: 'from-orange-500 to-amber-500', count: activeCounts.trending, desc: 'Alta tracción comprobada' },
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
              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden group ${
                isSelected
                  ? 'bg-slate-900 border-slate-900 text-white shadow-md ring-2 ring-[#f00856]'
                  : 'bg-white border-gray-200 hover:border-gray-300 text-gray-900 shadow-2xs'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className={`p-1.5 rounded-lg bg-gradient-to-r ${item.color} text-white shadow-2xs`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <span className={`text-xl font-black ${isSelected ? 'text-white' : 'text-gray-900'}`}>
                  {item.count}
                </span>
              </div>
              <div className={`text-xs font-black uppercase tracking-wider ${isSelected ? 'text-pink-400' : 'text-gray-800'}`}>
                {item.label}
              </div>
              <div className={`text-[10px] truncate mt-0.5 ${isSelected ? 'text-slate-400' : 'text-gray-400'}`}>
                {item.desc}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
