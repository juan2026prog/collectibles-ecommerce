import React, { useState } from 'react';
import { Search, Filter, X, Sparkles, TrendingUp, Clock, AlertTriangle, ShieldCheck, DollarSign } from 'lucide-react';
import type { RetailerSource, ProductType } from '../../../types/sourcing';

export interface SourcingFilterState {
  searchQuery: string;
  sourceFilter: 'all' | RetailerSource;
  quickFilter: string; // 'all' | 'profitable' | 'preorder' | 'retro' | 'trending' | 'evergreen' | 'not_in_catalog' | 'no_competition_uy' | 'catalog_gap' | 'collectibles_pick' | 'margin_25';
  brandFilter: string;
  minMargin: number;
  onlyOfficialVerified: boolean;
  authenticityStatus: string;
}

interface SourcingFiltersProps {
  filters: SourcingFilterState;
  onChangeFilters: (filters: SourcingFilterState) => void;
  availableBrands: string[];
  totalResultsCount: number;
  filteredResultsCount: number;
}

const QUICK_FILTER_BUTTONS = [
  { id: 'all', label: 'Todos' },
  { id: 'source_amazon', label: 'Amazon' },
  { id: 'source_ebay', label: 'eBay' },
  { id: 'source_bestbuy', label: 'Best Buy' },
  { id: 'profitable', label: '💰 Rentables' },
  { id: 'margin_25', label: 'Margen > 25%' },
  { id: 'preorder', label: '⏳ Pre-order' },
  { id: 'retro', label: '📼 Retro / Nostalgia' },
  { id: 'trending', label: '🔥 Trending' },
  { id: 'evergreen', label: '🌲 Evergreen' },
  { id: 'not_in_catalog', label: '✨ No lo tenemos' },
  { id: 'no_competition_uy', label: '🇺🇾 Sin competencia UY' },
  { id: 'catalog_gap', label: '🧩 Catalog Gap' },
  { id: 'collectibles_pick', label: '⭐ Collectibles Pick' }
];

export const SourcingFilters: React.FC<SourcingFiltersProps> = ({
  filters,
  onChangeFilters,
  availableBrands,
  totalResultsCount,
  filteredResultsCount
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [localSearch, setLocalSearch] = useState(filters.searchQuery);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onChangeFilters({ ...filters, searchQuery: localSearch });
  };

  const setQuickFilter = (qf: string) => {
    if (qf === 'source_amazon') {
      onChangeFilters({ ...filters, quickFilter: qf, sourceFilter: 'amazon' });
    } else if (qf === 'source_ebay') {
      onChangeFilters({ ...filters, quickFilter: qf, sourceFilter: 'ebay' });
    } else if (qf === 'source_bestbuy') {
      onChangeFilters({ ...filters, quickFilter: qf, sourceFilter: 'bestbuy' });
    } else if (qf === 'all') {
      onChangeFilters({ ...filters, quickFilter: 'all', sourceFilter: 'all' });
    } else {
      onChangeFilters({ ...filters, quickFilter: qf });
    }
  };

  return (
    <div className="space-y-3">
      {/* Barra principal de búsqueda */}
      <div className="flex items-center gap-2">
        <form onSubmit={handleSearchSubmit} className="flex-1 relative flex items-center">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 pointer-events-none" />
          <input
            type="text"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            placeholder="Buscar por título, personaje, marca, UPC, ASIN o SKU..."
            className="w-full bg-white border border-gray-300 rounded-lg pl-9 pr-24 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#f00856] focus:ring-1 focus:ring-[#f00856] transition-colors shadow-sm"
          />
          <div className="absolute right-2 flex items-center gap-1">
            {localSearch && (
              <button
                type="button"
                onClick={() => {
                  setLocalSearch('');
                  onChangeFilters({ ...filters, searchQuery: '' });
                }}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="submit"
              className="px-3 py-1 bg-[#f00856] hover:bg-[#d0074a] text-white rounded-md text-xs font-semibold shadow-sm transition-colors"
            >
              Buscar
            </button>
          </div>
        </form>

        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border transition-all shadow-sm ${
            showAdvanced || filters.brandFilter || filters.minMargin > 0
              ? 'bg-pink-50 border-pink-200 text-[#f00856]'
              : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
          }`}
        >
          <Filter className="w-3.5 h-3.5" />
          <span>Filtros {filters.brandFilter || filters.minMargin > 0 ? '• Activos' : ''}</span>
        </button>
      </div>

      {/* Quick Filters Horizontales */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
        {QUICK_FILTER_BUTTONS.map(btn => {
          const isActive = filters.quickFilter === btn.id;
          return (
            <button
              key={btn.id}
              onClick={() => setQuickFilter(btn.id)}
              className={`px-3 py-1.5 rounded-lg whitespace-nowrap font-medium transition-all shadow-sm ${
                isActive
                  ? 'bg-[#f00856] text-white font-semibold'
                  : 'bg-white text-gray-700 hover:bg-gray-50 hover:text-gray-900 border border-gray-200'
              }`}
            >
              {btn.label}
            </button>
          );
        })}
      </div>

      {/* Panel de Filtros Avanzados Expandible */}
      {showAdvanced && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 grid grid-cols-1 md:grid-cols-4 gap-4 animate-in fade-in duration-150 text-xs shadow-sm">
          <div>
            <label className="block text-gray-700 mb-1 font-semibold">Marca / Fabricante</label>
            <select
              value={filters.brandFilter}
              onChange={(e) => onChangeFilters({ ...filters, brandFilter: e.target.value })}
              className="w-full bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 text-gray-900 text-xs focus:outline-none focus:border-[#f00856]"
            >
              <option value="">Todas las marcas</option>
              {availableBrands.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-gray-700 mb-1 font-semibold">Margen Mínimo (%)</label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="0"
                max="50"
                step="5"
                value={filters.minMargin}
                onChange={(e) => onChangeFilters({ ...filters, minMargin: Number(e.target.value) })}
                className="w-full accent-[#f00856] cursor-pointer"
              />
              <span className="text-gray-900 font-mono font-bold w-10 text-right">{filters.minMargin}%</span>
            </div>
          </div>

          <div>
            <label className="block text-gray-700 mb-1 font-semibold">Authenticity Gate</label>
            <select
              value={filters.authenticityStatus}
              onChange={(e) => onChangeFilters({ ...filters, authenticityStatus: e.target.value })}
              className="w-full bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 text-gray-900 text-xs focus:outline-none focus:border-[#f00856]"
            >
              <option value="all">Cualquier estado</option>
              <option value="VERIFIED_OFFICIAL">Solo Oficial Verificado (100%)</option>
              <option value="NEEDS_VERIFICATION">Requiere Revisión</option>
            </select>
          </div>

          <div className="flex items-end justify-between">
            <button
              onClick={() => onChangeFilters({
                searchQuery: '',
                sourceFilter: 'all',
                quickFilter: 'all',
                brandFilter: '',
                minMargin: 0,
                onlyOfficialVerified: true,
                authenticityStatus: 'all'
              })}
              className="text-gray-500 hover:text-gray-800 underline text-xs font-medium"
            >
              Limpiar filtros
            </button>
            <span className="text-gray-500 font-mono text-[11px]">
              Mostrando {filteredResultsCount} de {totalResultsCount}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
