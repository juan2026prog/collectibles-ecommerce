import React from 'react';
import { Sparkles, RefreshCw, AlertCircle, SearchX } from 'lucide-react';

export const SourcingTableSkeleton: React.FC = () => {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm animate-pulse">
      <div className="p-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
        <div className="h-4 bg-gray-200 rounded w-1/4" />
        <div className="h-4 bg-gray-200 rounded w-1/6" />
      </div>
      <div className="p-4 space-y-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex items-center gap-4 py-2 border-b border-gray-100 last:border-0">
            <div className="w-10 h-10 bg-gray-200 rounded-lg shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 bg-gray-200 rounded w-3/4" />
              <div className="h-2.5 bg-gray-100 rounded w-1/2" />
            </div>
            <div className="w-20 h-4 bg-gray-200 rounded" />
            <div className="w-16 h-4 bg-gray-200 rounded" />
            <div className="w-24 h-8 bg-gray-200 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
};

export const SourcingCardGridSkeleton: React.FC = () => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 animate-pulse">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3 shadow-xs">
          <div className="flex justify-between items-center">
            <div className="w-12 h-4 bg-gray-200 rounded" />
            <div className="w-16 h-4 bg-gray-200 rounded-full" />
          </div>
          <div className="flex gap-3">
            <div className="w-16 h-16 bg-gray-200 rounded-xl shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 bg-gray-200 rounded w-full" />
              <div className="h-3 bg-gray-100 rounded w-2/3" />
            </div>
          </div>
          <div className="h-8 bg-gray-100 rounded-xl" />
          <div className="space-y-2 pt-2">
            <div className="h-3 bg-gray-100 rounded w-full" />
            <div className="h-3 bg-gray-100 rounded w-4/5" />
          </div>
          <div className="h-8 bg-gray-200 rounded-lg" />
        </div>
      ))}
    </div>
  );
};

interface SourcingEmptyStateProps {
  title?: string;
  description?: string;
  actionText?: string;
  onAction?: () => void;
  icon?: 'search' | 'alert' | 'sparkles';
}

export const SourcingEmptyState: React.FC<SourcingEmptyStateProps> = ({
  title = 'No se encontraron oportunidades',
  description = 'No existen productos que coincidan exactamente con los criterios de búsqueda o filtros seleccionados.',
  actionText = 'Limpiar Filtros',
  onAction,
  icon = 'search'
}) => {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center shadow-sm space-y-4 max-w-md mx-auto my-8">
      <div className="w-14 h-14 bg-pink-50 text-[#f00856] rounded-2xl flex items-center justify-center mx-auto border border-pink-100">
        {icon === 'search' && <SearchX className="w-7 h-7" />}
        {icon === 'alert' && <AlertCircle className="w-7 h-7 text-amber-600" />}
        {icon === 'sparkles' && <Sparkles className="w-7 h-7" />}
      </div>

      <div className="space-y-1">
        <h3 className="text-base font-bold text-gray-900">{title}</h3>
        <p className="text-xs text-gray-500 max-w-sm mx-auto leading-relaxed">{description}</p>
      </div>

      {onAction && (
        <button
          onClick={onAction}
          className="px-4 py-2 bg-[#f00856] hover:bg-[#d0074a] text-white text-xs font-bold rounded-lg shadow-sm transition-all hover:shadow"
        >
          {actionText}
        </button>
      )}
    </div>
  );
};
