import React, { useState } from 'react';
import { 
  Search, Sparkles, X, Filter, History, Tag, SlidersHorizontal, ArrowUpDown, ChevronDown
} from 'lucide-react';
import type { SourcingFilterState } from './SourcingFilters';

interface SourcingSearchTerminalProps {
  filters: SourcingFilterState;
  onChangeFilters: (filters: SourcingFilterState) => void;
  availableBrands: string[];
  totalResultsCount: number;
  filteredResultsCount: number;
  viewMode: 'table' | 'cards';
  onChangeViewMode: (mode: 'table' | 'cards') => void;
}

const NATURAL_SEARCH_PRESETS = [
  { label: 'McFarlane DC', query: 'McFarlane' },
  { label: 'Pokémon TCG', query: 'Pokémon' },
  { label: 'Star Wars LEGO', query: 'LEGO Star Wars' },
  { label: 'Street Fighter', query: 'Street Fighter' },
  { label: 'Margen > 25%', quick: 'margin_25' },
  { label: 'Sin Competencia UY', quick: 'no_competition_uy' },
  { label: 'Pre-orders Activas', quick: 'preorder' },
  { label: 'Catalog Gap', quick: 'catalog_gap' }
];

export const SourcingSearchTerminal: React.FC<SourcingSearchTerminalProps> = ({
  filters,
  onChangeFilters,
  availableBrands,
  totalResultsCount,
  filteredResultsCount,
  viewMode,
  onChangeViewMode
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([
    'McFarlane Batman 1989', 'Goku S.H.Figuarts', 'Spider-Man Hasbro'
  ]);

  const handleQueryChange = (val: string) => {
    onChangeFilters({ ...filters, searchQuery: val });
  };

  const handleApplyPreset = (preset: { query?: string; quick?: string }) => {
    if (preset.query !== undefined) {
      onChangeFilters({ ...filters, searchQuery: preset.query });
      if (preset.query && !recentSearches.includes(preset.query)) {
        setRecentSearches(prev => [preset.query!, ...prev.slice(0, 4)]);
      }
    }
    if (preset.quick !== undefined) {
      onChangeFilters({ ...filters, quickFilter: preset.quick });
    }
  };

  const handleClearAll = () => {
    onChangeFilters({
      searchQuery: '',
      sourceFilter: 'all',
      quickFilter: 'all',
      brandFilter: '',
      minMargin: 0,
      onlyOfficialVerified: false,
      authenticityStatus: 'all'
    });
  };

  const hasActiveFilters = 
    filters.searchQuery || 
    filters.sourceFilter !== 'all' || 
    filters.quickFilter !== 'all' || 
    filters.brandFilter || 
    filters.minMargin > 0 || 
    filters.onlyOfficialVerified || 
    filters.authenticityStatus !== 'all';

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3.5">
      {/* Terminal Natural Search Input */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
          <Search className="w-5 h-5" />
        </div>
        <input
          type="text"
          value={filters.searchQuery}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="Terminal de Sourcing: busque por franquicia, marca, personaje, SKU, UPC o comandos (ej: McFarlane, Pokémon, Street Fighter)..."
          className="w-full pl-11 pr-24 py-3 bg-gray-50 border border-gray-300 rounded-xl text-sm text-gray-900 font-medium placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#f00856] focus:bg-white transition-all shadow-inner"
        />
        <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center gap-1.5">
          {filters.searchQuery && (
            <button
              onClick={() => handleQueryChange('')}
              className="p-1 rounded-lg hover:bg-gray-200 text-gray-400 hover:text-gray-700 transition-colors"
              title="Limpiar búsqueda"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
              showAdvanced || hasActiveFilters
                ? 'bg-pink-50 text-[#f00856] border-pink-200'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Filtros</span>
            {hasActiveFilters && (
              <span className="w-2 h-2 rounded-full bg-[#f00856]" />
            )}
          </button>
        </div>
      </div>

      {/* Preset Chips & Quick Filters */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none max-w-full">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider shrink-0 mr-1">
            Búsquedas Rapidas:
          </span>
          {NATURAL_SEARCH_PRESETS.map((p, idx) => (
            <button
              key={idx}
              onClick={() => handleApplyPreset(p)}
              className="px-2.5 py-1 text-xs font-medium bg-gray-100 hover:bg-pink-50 hover:text-[#f00856] hover:border-pink-200 text-gray-700 rounded-lg border border-gray-200 transition-all shrink-0 shadow-2xs"
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* View Mode & Count */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-xs text-gray-600">
            Mostrando <strong className="text-gray-900 font-bold">{filteredResultsCount}</strong> de {totalResultsCount} productos
          </div>

          <div className="flex items-center bg-gray-100 p-1 rounded-lg border border-gray-200">
            <button
              onClick={() => onChangeViewMode('table')}
              className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all ${
                viewMode === 'table'
                  ? 'bg-white text-gray-900 shadow-xs'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Tabla
            </button>
            <button
              onClick={() => onChangeViewMode('cards')}
              className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all ${
                viewMode === 'cards'
                  ? 'bg-white text-gray-900 shadow-xs'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Cards
            </button>
          </div>
        </div>
      </div>

      {/* Advanced Filter Panel */}
      {showAdvanced && (
        <div className="pt-3 border-t border-gray-200 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-gray-50/50 p-3 rounded-xl">
          {/* Retailer Source */}
          <div>
            <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wider block mb-1">
              Proveedor / Retailer
            </label>
            <select
              value={filters.sourceFilter}
              onChange={(e) => onChangeFilters({ ...filters, sourceFilter: e.target.value as any })}
              className="w-full bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-800 font-semibold focus:outline-none focus:border-[#f00856]"
            >
              <option value="all">Todos los Proveedores</option>
              <option value="amazon">Amazon US</option>
              <option value="ebay">eBay US</option>
              <option value="bestbuy">Best Buy US</option>
              <option value="walmart">Walmart US</option>
              <option value="target">Target US</option>
            </select>
          </div>

          {/* Strategic Quick Filter */}
          <div>
            <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wider block mb-1">
              Categoría Estratégica
            </label>
            <select
              value={filters.quickFilter}
              onChange={(e) => onChangeFilters({ ...filters, quickFilter: e.target.value })}
              className="w-full bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-800 font-semibold focus:outline-none focus:border-[#f00856]"
            >
              <option value="all">Todas las Estrategias</option>
              <option value="profitable">Solo Rentables (&gt; $0 Profit)</option>
              <option value="margin_25">Alto Margen (&gt; 25%)</option>
              <option value="preorder">Preventas Activas</option>
              <option value="retro">Colecciones Retro / Nostalgia</option>
              <option value="trending">En Tendencia Global</option>
              <option value="not_in_catalog">Faltante en Catálogo UY</option>
              <option value="no_competition_uy">Sin Competencia Directa ML UY</option>
              <option value="collectibles_pick">Recomendado Collectibles</option>
            </select>
          </div>

          {/* Marca / Brand */}
          <div>
            <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wider block mb-1">
              Marca
            </label>
            <select
              value={filters.brandFilter}
              onChange={(e) => onChangeFilters({ ...filters, brandFilter: e.target.value })}
              className="w-full bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-800 font-semibold focus:outline-none focus:border-[#f00856]"
            >
              <option value="">Todas las Marcas ({availableBrands.length})</option>
              {availableBrands.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          {/* Margen Mínimo */}
          <div>
            <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wider block mb-1">
              Margen Mínimo % ({filters.minMargin}%)
            </label>
            <input
              type="range"
              min="0"
              max="50"
              step="5"
              value={filters.minMargin}
              onChange={(e) => onChangeFilters({ ...filters, minMargin: Number(e.target.value) })}
              className="w-full accent-[#f00856] cursor-pointer"
            />
          </div>

          {hasActiveFilters && (
            <div className="col-span-full flex justify-end pt-1">
              <button
                onClick={handleClearAll}
                className="text-xs text-[#f00856] font-bold hover:underline flex items-center gap-1"
              >
                <X className="w-3.5 h-3.5" /> Limpiar Todos los Filtros
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
