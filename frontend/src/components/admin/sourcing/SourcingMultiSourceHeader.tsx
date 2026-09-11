import React from 'react';
import { Search, Sparkles, Loader2, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import type { SearchSourceOption, SourceSearchStatus } from '../../../services/sourcing/multiSourceSearchService';

interface SourcingMultiSourceHeaderProps {
  query: string;
  onQueryChange: (q: string) => void;
  onSearch: () => void;
  selectedSource: SearchSourceOption;
  onSelectSource: (s: SearchSourceOption) => void;
  sourceStatus: {
    amazon: SourceSearchStatus;
    ebay: SourceSearchStatus;
    bestbuy: SourceSearchStatus;
  };
  isSearching: boolean;
  onApplyPreset: (preset: string) => void;
}

const PRESETS = [
  'Street Fighter Jada Toys',
  'Star Wars Black Series',
  'Mortal Kombat Storm Collectibles',
  'NECA Predator',
  'Marvel Legends X-Men 97'
];

export const SourcingMultiSourceHeader: React.FC<SourcingMultiSourceHeaderProps> = ({
  query,
  onQueryChange,
  onSearch,
  selectedSource,
  onSelectSource,
  sourceStatus,
  isSearching,
  onApplyPreset
}) => {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onSearch();
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4">
      {/* Título y Descripción */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-lg font-black text-gray-900 tracking-tight flex items-center gap-2">
            <Search className="w-5 h-5 text-[#f00856]" />
            <span>Buscar productos en Sourcing</span>
          </h2>
          <p className="text-xs text-gray-500 font-medium">
            Terminal de exploración y comparación multifuente (Amazon, eBay, Best Buy) con canonicalización automática.
          </p>
        </div>

        {/* Indicadores de Conexión en Vivo */}
        <div className="flex items-center gap-3 text-xs bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-200">
          <div className="flex items-center gap-1.5" title="Amazon US vía Zinc API">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-semibold text-gray-700">Amazon</span>
          </div>
          <span className="text-gray-300">|</span>
          <div className="flex items-center gap-1.5" title="eBay US Adapter Activo">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="font-semibold text-gray-700">eBay</span>
          </div>
          <span className="text-gray-300">|</span>
          <div className="flex items-center gap-1.5" title="Best Buy pendiente de API Key oficial">
            <span className="w-2 h-2 rounded-full bg-gray-300" />
            <span className="font-medium text-gray-400">Best Buy</span>
          </div>
        </div>
      </div>

      {/* Input Principal Grande + CTA Buscar */}
      <div className="relative flex items-center gap-2">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400">
            <Search className="w-5 h-5" />
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="¿Qué producto querés buscar? (Ej. Street Fighter Jada Toys, Star Wars Black Series...)"
            className="w-full pl-12 pr-4 py-3.5 bg-gray-50/70 border border-gray-300 rounded-xl text-sm font-semibold text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#f00856] focus:bg-white transition-all shadow-inner"
          />
        </div>

        <button
          onClick={onSearch}
          disabled={isSearching || !query.trim()}
          className="px-6 py-3.5 bg-[#f00856] hover:bg-[#d0074a] disabled:opacity-50 text-white text-sm font-black rounded-xl shadow-sm transition-all flex items-center gap-2 shrink-0 cursor-pointer"
        >
          {isSearching ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Buscando...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>Buscar</span>
            </>
          )}
        </button>
      </div>

      {/* Selector de Fuente (Tabs Grandes) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 border-t border-gray-100">
        <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-xl border border-gray-200">
          <button
            onClick={() => onSelectSource('all')}
            className={`px-4 py-2 text-xs font-black rounded-lg transition-all cursor-pointer ${
              selectedSource === 'all'
                ? 'bg-white text-[#f00856] shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            TODOS
          </button>

          <button
            onClick={() => onSelectSource('amazon')}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-black rounded-lg transition-all cursor-pointer ${
              selectedSource === 'amazon'
                ? 'bg-white text-amber-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <span>AMAZON</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          </button>

          <button
            onClick={() => onSelectSource('ebay')}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-black rounded-lg transition-all cursor-pointer ${
              selectedSource === 'ebay'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <span>EBAY</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          </button>

          <button
            onClick={() => onSelectSource('bestbuy')}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-black rounded-lg transition-all cursor-pointer ${
              selectedSource === 'bestbuy'
                ? 'bg-white text-yellow-600 shadow-sm'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <span>BEST BUY</span>
            <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
          </button>
        </div>

        {/* Presets Rápidos */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider shrink-0 mr-1">
            Ejemplos:
          </span>
          {PRESETS.map((p, idx) => (
            <button
              key={idx}
              onClick={() => onApplyPreset(p)}
              className="px-2.5 py-1 text-xs font-medium bg-gray-50 hover:bg-pink-50 hover:text-[#f00856] text-gray-700 rounded-lg border border-gray-200 transition-all shrink-0 cursor-pointer"
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Alerta si Best Buy está seleccionado */}
      {selectedSource === 'bestbuy' && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
          <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Best Buy no está configurado actualmente.</span>
            <p className="text-[11px] text-amber-700 mt-0.5">
              El adaptador está listo en código (`ADAPTER_READY`), pero requiere configurar `BESTBUY_API_KEY` en producción.
              Podés continuar buscando normalmente en **Amazon** y **eBay**.
            </p>
          </div>
        </div>
      )}

      {/* Barra de Estado de Búsqueda Activa */}
      {(sourceStatus.amazon.resultCount > 0 || sourceStatus.ebay.resultCount > 0 || sourceStatus.bestbuy.resultCount > 0) && (
        <div className="flex items-center gap-4 text-xs font-semibold text-gray-600 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
          <span className="text-gray-400 uppercase tracking-wider text-[10px]">Fuentes encontradas:</span>
          <span className="flex items-center gap-1 text-amber-700">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Amazon: <strong>{sourceStatus.amazon.resultCount}</strong> ofertas
          </span>
          <span className="flex items-center gap-1 text-blue-700">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            eBay: <strong>{sourceStatus.ebay.resultCount}</strong> ofertas
          </span>
          {sourceStatus.bestbuy.resultCount > 0 ? (
            <span className="flex items-center gap-1 text-yellow-700">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              Best Buy: <strong>{sourceStatus.bestbuy.resultCount}</strong> ofertas
            </span>
          ) : (
            <span className="flex items-center gap-1 text-gray-400">
              <AlertCircle className="w-3.5 h-3.5 text-gray-400" />
              Best Buy: Sin configurar
            </span>
          )}
        </div>
      )}
    </div>
  );
};
