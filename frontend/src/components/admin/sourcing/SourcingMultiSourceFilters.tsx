import React from 'react';
import { 
  Filter, X, SlidersHorizontal, Sparkles, Package, Layers, 
  Tag, ShieldCheck, DollarSign, Eye, CheckCircle2 
} from 'lucide-react';
import type { CanonicalProductCondition } from '../../../services/sourcing/conditionMapper';
import { CANONICAL_CONDITIONS_META } from '../../../services/sourcing/conditionMapper';

export interface MultiSourceFilterState {
  conditionFilter: 'all' | CanonicalProductCondition;
  minPrice: number;
  maxPrice: number;
  onlyInStock: boolean;
  brandFilter: string;
  licenseFilter: string;
  ebayListingType: 'individual' | 'lots';
  includeAuctions: boolean;
  retroInBoxOnly: boolean;
  viewMode: 'compact' | 'detailed';
  sortBy: 'relevance' | 'price_asc' | 'price_desc' | 'opportunity_score' | 'risk_score';
}

interface SourcingMultiSourceFiltersProps {
  filters: MultiSourceFilterState;
  onChangeFilters: (filters: MultiSourceFilterState) => void;
  availableBrands: string[];
  availableLicenses: string[];
  totalResultsCount: number;
  filteredResultsCount: number;
}

export const SourcingMultiSourceFilters: React.FC<SourcingMultiSourceFiltersProps> = ({
  filters,
  onChangeFilters,
  availableBrands,
  availableLicenses,
  totalResultsCount,
  filteredResultsCount
}) => {
  const handleClearAll = () => {
    onChangeFilters({
      conditionFilter: 'all',
      minPrice: 0,
      maxPrice: 0,
      onlyInStock: false,
      brandFilter: '',
      licenseFilter: '',
      ebayListingType: 'individual',
      includeAuctions: false,
      retroInBoxOnly: false,
      viewMode: filters.viewMode,
      sortBy: 'relevance'
    });
  };

  const hasActiveFilters = 
    filters.conditionFilter !== 'all' ||
    filters.minPrice > 0 ||
    filters.maxPrice > 0 ||
    filters.onlyInStock ||
    Boolean(filters.brandFilter) ||
    Boolean(filters.licenseFilter) ||
    filters.ebayListingType !== 'individual' ||
    filters.includeAuctions ||
    filters.retroInBoxOnly ||
    filters.sortBy !== 'relevance';

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm space-y-4">
      {/* Barra Superior de Controles: Modo Retro en Caja + Vista Compacta/Detallada + Orden */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-wrap">
        
        {/* Toggle Editorial "Retro en Caja" */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onChangeFilters({ ...filters, retroInBoxOnly: !filters.retroInBoxOnly })}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-black transition-all border cursor-pointer ${
              filters.retroInBoxOnly
                ? 'bg-gradient-to-r from-purple-900 to-indigo-900 text-amber-300 border-purple-700 shadow-md ring-2 ring-purple-300'
                : 'bg-gray-50 hover:bg-gray-100 text-gray-700 border-gray-300'
            }`}
          >
            <Sparkles className={`w-4 h-4 ${filters.retroInBoxOnly ? 'text-amber-300 fill-current' : 'text-purple-600'}`} />
            <span>RETRO EN CAJA</span>
            {filters.retroInBoxOnly && (
              <span className="text-[10px] bg-amber-400/20 text-amber-200 px-1.5 py-0.5 rounded font-extrabold uppercase">
                Activo
              </span>
            )}
          </button>

          {/* Toggle de Lotes en eBay */}
          <div className="flex items-center bg-gray-100 p-1 rounded-xl border border-gray-200 text-xs font-bold">
            <button
              onClick={() => onChangeFilters({ ...filters, ebayListingType: 'individual' })}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                filters.ebayListingType === 'individual'
                  ? 'bg-white text-gray-900 shadow-xs'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Individual
            </button>
            <button
              onClick={() => onChangeFilters({ ...filters, ebayListingType: 'lots' })}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                filters.ebayListingType === 'lots'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Lotes & Packs
            </button>
          </div>
        </div>

        {/* Ordenamiento + Modo de Vista */}
        <div className="flex items-center gap-3">
          {/* Ordenar por */}
          <div className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className="font-semibold text-gray-400">Orden:</span>
            <select
              value={filters.sortBy}
              onChange={(e) => onChangeFilters({ ...filters, sortBy: e.target.value as any })}
              className="bg-gray-50 border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-800 font-bold focus:outline-none focus:border-[#f00856]"
            >
              <option value="relevance">Relevancia</option>
              <option value="price_asc">Menor Precio</option>
              <option value="price_desc">Mayor Precio</option>
              <option value="opportunity_score">Opportunity Score</option>
              <option value="risk_score">Menor Riesgo</option>
            </select>
          </div>

          {/* Selector de Modo de Vista */}
          <div className="flex items-center bg-gray-100 p-1 rounded-xl border border-gray-200">
            <button
              onClick={() => onChangeFilters({ ...filters, viewMode: 'compact' })}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                filters.viewMode === 'compact'
                  ? 'bg-white text-gray-900 shadow-xs'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Compacta
            </button>
            <button
              onClick={() => onChangeFilters({ ...filters, viewMode: 'detailed' })}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                filters.viewMode === 'detailed'
                  ? 'bg-white text-gray-900 shadow-xs'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Detallada
            </button>
          </div>

          <div className="text-xs text-gray-500 font-medium shrink-0">
            <strong>{filteredResultsCount}</strong> de {totalResultsCount}
          </div>
        </div>
      </div>

      {/* Banner Explicativo cuando "Retro en Caja" está activo */}
      {filters.retroInBoxOnly && (
        <div className="p-3 bg-purple-50/80 border border-purple-200 rounded-xl flex items-center justify-between text-xs text-purple-950">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-700 shrink-0" />
            <span>
              <strong>MODO RETRO EN CAJA ACTIVO:</strong> Mostrando productos de líneas anteriores y vintage que conservan su empaque original (excluye piezas loose o incompletas).
            </span>
          </div>
          <button
            onClick={() => onChangeFilters({ ...filters, retroInBoxOnly: false })}
            className="text-[11px] font-bold text-purple-700 hover:underline shrink-0 ml-2 cursor-pointer"
          >
            Desactivar
          </button>
        </div>
      )}

      {/* Cuadrícula de Filtros Principales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 pt-2 border-t border-gray-100">
        
        {/* Condición Canónica (6 valores) */}
        <div>
          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
            Condición Canónica
          </label>
          <select
            value={filters.conditionFilter}
            onChange={(e) => onChangeFilters({ ...filters, conditionFilter: e.target.value as any })}
            className="w-full bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-800 font-semibold focus:outline-none focus:border-[#f00856]"
          >
            <option value="all">Todas las Condiciones</option>
            <option value="new_sealed">Nuevo Sellado (Fábrica)</option>
            <option value="new_open_box">Nuevo / Open Box</option>
            <option value="used_complete">Usado Completo (con Caja)</option>
            <option value="used_incomplete">Usado Incompleto</option>
            <option value="loose_complete">Loose Completo (sin Caja)</option>
            <option value="loose_incomplete">Loose Incompleto</option>
          </select>
        </div>

        {/* Marca */}
        <div>
          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
            Marca ({availableBrands.length})
          </label>
          <select
            value={filters.brandFilter}
            onChange={(e) => onChangeFilters({ ...filters, brandFilter: e.target.value })}
            className="w-full bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-800 font-semibold focus:outline-none focus:border-[#f00856]"
          >
            <option value="">Todas las Marcas</option>
            {availableBrands.map(b => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>

        {/* Licencia */}
        <div>
          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
            Licencia ({availableLicenses.length})
          </label>
          <select
            value={filters.licenseFilter}
            onChange={(e) => onChangeFilters({ ...filters, licenseFilter: e.target.value })}
            className="w-full bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-800 font-semibold focus:outline-none focus:border-[#f00856]"
          >
            <option value="">Todas las Licencias</option>
            {availableLicenses.map(l => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>

        {/* Precio Máximo */}
        <div>
          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
            Precio Máx USD ({filters.maxPrice > 0 ? `$${filters.maxPrice}` : 'Sin Límite'})
          </label>
          <input
            type="number"
            min="0"
            max="1000"
            step="10"
            placeholder="Ej: 50"
            value={filters.maxPrice > 0 ? filters.maxPrice : ''}
            onChange={(e) => onChangeFilters({ ...filters, maxPrice: Number(e.target.value) || 0 })}
            className="w-full bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-800 font-semibold focus:outline-none focus:border-[#f00856]"
          />
        </div>

        {/* Disponibilidad y Subastas */}
        <div className="flex flex-col justify-center space-y-1.5 pl-1">
          <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.onlyInStock}
              onChange={(e) => onChangeFilters({ ...filters, onlyInStock: e.target.checked })}
              className="rounded border-gray-300 text-[#f00856] focus:ring-[#f00856] w-3.5 h-3.5"
            />
            <span>Solo en Stock</span>
          </label>

          <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 cursor-pointer" title="Por defecto las subastas están excluidas de compras y cálculos automáticos">
            <input
              type="checkbox"
              checked={filters.includeAuctions}
              onChange={(e) => onChangeFilters({ ...filters, includeAuctions: e.target.checked })}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-600 w-3.5 h-3.5"
            />
            <span>Incluir Subastas</span>
          </label>
        </div>
      </div>

      {/* Botón de Limpiar Filtros */}
      {hasActiveFilters && (
        <div className="flex justify-end pt-1">
          <button
            onClick={handleClearAll}
            className="text-xs text-[#f00856] font-bold hover:underline flex items-center gap-1 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            <span>Limpiar todos los filtros</span>
          </button>
        </div>
      )}
    </div>
  );
};
