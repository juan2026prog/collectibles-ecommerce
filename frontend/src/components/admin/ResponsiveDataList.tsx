import React from 'react';
import { PackageX } from 'lucide-react';

interface ResponsiveDataListProps<T> {
  items: T[];
  keyExtractor: (item: T, index: number) => string | number;
  renderCard: (item: T, index: number) => React.ReactNode;
  renderTableHeader?: () => React.ReactNode;
  renderTableRow?: (item: T, index: number) => React.ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  loading?: boolean;
}

export default function ResponsiveDataList<T>({
  items,
  keyExtractor,
  renderCard,
  renderTableHeader,
  renderTableRow,
  emptyTitle = 'No hay resultados',
  emptyDescription = 'No se encontraron registros en esta sección.',
  emptyAction,
  loading = false
}: ResponsiveDataListProps<T>) {
  if (loading) {
    return (
      <div className="space-y-3 py-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 bg-gray-200/70 rounded-xl animate-pulse w-full" />
        ))}
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center my-4 shadow-sm">
        <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3 text-gray-400">
          <PackageX className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-gray-800">{emptyTitle}</h3>
        <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">{emptyDescription}</p>
        {emptyAction && <div className="mt-4">{emptyAction}</div>}
      </div>
    );
  }

  return (
    <div className="w-full min-w-0">
      {/* Mobile Card List View (< md/lg) */}
      <div className="block md:hidden space-y-3 min-w-0">
        {items.map((item, idx) => (
          <React.Fragment key={keyExtractor(item, idx)}>
            {renderCard(item, idx)}
          </React.Fragment>
        ))}
      </div>

      {/* Desktop Table View (>= md/lg) */}
      {renderTableHeader && renderTableRow && (
        <div className="hidden md:block bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden min-w-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold uppercase tracking-wider text-gray-500">
                {renderTableHeader()}
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {items.map((item, idx) => (
                  <React.Fragment key={keyExtractor(item, idx)}>
                    {renderTableRow(item, idx)}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
