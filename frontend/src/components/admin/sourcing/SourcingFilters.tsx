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
            placeholder="Buscar por título, personaje, marca, UPC o SKU..."
            className="w-full bg-dark-900 border border-white/10 rounded-xl pl-9 pr-24 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary-500 transition-colors"
          />
          <div className="absolute right-2 flex items-center gap-1">
            {localSearch && (
              <button
                type="button"
                onClick={() => {
                  setLocalSearch('');
                  onChangeFilters({ ...filters, searchQuery: '' });
                }}
                className="p-1 text-gray-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="submit"
              className="px-3 py-1 bg-primary-600 hover:bg-primary-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
            >
              Buscar
            </button>
          </div>
        </form>

        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border transition-all ${
            showAdvanced || filters.brandFilter || filters.minMargin > 0
              ? 'bg-primary-600/20 border-primary-500 text-primary-300'
              : 'bg-dark-800 border-white/10 text-gray-300 hover:text-white hover:bg-dark-700'
          }`}
        >
          <Filter className="w-3.5 h-3.5" />
          <span>Filtros {filters.brandFilter || filters.minMargin > 0 ? '• Activos' : ''}</span>
        </button>
      </div>

      {/* Quick Filters Horizontales */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar text-xs">
        {QUICK_FILTER_BUTTONS.map(btn => {
          const isActive = filters.quickFilter === btn.id;
          return (
            <button
              key={btn.id}
              onClick={() => setQuickFilter(btn.id)}
              className={`px-3 py-1.5 rounded-lg whitespace-nowrap font-medium transition-all ${
                isActive
                  ? 'bg-primary-600 text-white shadow-sm font-semibold'
                  : 'bg-dark-900/80 text-gray-400 hover:text-white hover:bg-dark-800 border border-white/5'
              }`}
            >
              {btn.label}
            </button>
          );
        })}
      </div>

      {/* Panel de Filtros Avanzados Expandible */}
      {showAdvanced && (
        <div className="bg-dark-900/95 border border-white/10 rounded-xl p-4 grid grid-cols-1 md:grid-cols-4 gap-4 animate-in fade-in slide-in-from-top-2 duration-150 text-xs">
          <div>
            <label className="block text-gray-400 mb-1 font-medium">Marca / Fabricante</label>
            <select
              value={filters.brandFilter}
              onChange={(e) => onChangeFilters({ ...filters, brandFilter: e.target.value })}
              className="w-full bg-dark-800 border border-white/10 rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-primary-500"
            >
              <option value="">Todas las marcas</option>
              {availableBrands.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-gray-400 mb-1 font-medium">Margen Mínimo (%)</label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="0"
                max="50"
                step="5"
                value={filters.minMargin}
                onChange={(e) => onChangeFilters({ ...filters, minMargin: Number(e.target.value) })}
                className="w-full accent-primary-500 cursor-pointer"
              />
              <span className="text-white font-mono w-10 text-right">{filters.minMargin}%</span>
            </div>
          </div>

          <div>
            <label className="block text-gray-400 mb-1 font-medium">Authenticity Gate</label>
            <select
              value={filters.authenticityStatus}
              onChange={(e) => onChangeFilters({ ...filters, authenticityStatus: e.target.value })}
              className="w-full bg-dark-800 border border-white/10 rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-primary-500"
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
              className="text-gray-400 hover:text-white underline text-xs"
            >
              Limpiar todos los filtros
            </button>
            <span className="text-gray-400 font-mono text-[11px]">
              Mostrando {filteredResultsCount} de {totalResultsCount}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
