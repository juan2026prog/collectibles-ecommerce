import React, { ReactNode } from 'react';

export interface BackofficeResponsiveDataListProps<T> {
  title?: string;
  subtitle?: string;
  data: T[];
  keyExtractor: (item: T) => string;
  renderCard: (item: T) => ReactNode;
  renderTableHeader?: () => ReactNode;
  renderTableRow?: (item: T) => ReactNode;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  action?: ReactNode;
  className?: string;
}

export function BackofficeResponsiveDataList<T>({
  title,
  subtitle,
  data,
  keyExtractor,
  renderCard,
  renderTableHeader,
  renderTableRow,
  loading = false,
  emptyTitle = 'SIN ELEMENTOS',
  emptyDescription = 'No hay datos disponibles para mostrar.',
  action,
  className = '',
}: BackofficeResponsiveDataListProps<T>) {
  return (
    <div className={`space-y-3 ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 min-w-0">
          <div>
            {title && <h3 className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">{title}</h3>}
            {subtitle && <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}

      {/* MOBILE LIST CARDS (< md) */}
      <div className="block md:hidden space-y-2.5">
        {loading ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 text-center text-xs text-gray-400 font-medium border border-gray-200 dark:border-gray-700 animate-pulse">
            Cargando datos...
          </div>
        ) : data.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 text-center text-xs text-gray-400 font-medium border border-gray-200 dark:border-gray-700">
            <p className="font-bold text-gray-900 dark:text-white">{emptyTitle}</p>
            <p className="mt-0.5">{emptyDescription}</p>
          </div>
        ) : (
          data.map((item) => (
            <React.Fragment key={keyExtractor(item)}>
              {renderCard(item)}
            </React.Fragment>
          ))
        )}
      </div>

      {/* DESKTOP TABLE (>= md) */}
      <div className="hidden md:block bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-2xs overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-gray-400 font-medium animate-pulse">
            Cargando datos...
          </div>
        ) : data.length === 0 ? (
          <div className="p-8 text-center text-xs text-gray-400">
            <p className="font-bold text-gray-900 dark:text-white">{emptyTitle}</p>
            <p className="mt-0.5">{emptyDescription}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-xs">
              {renderTableHeader && (
                <thead className="bg-gray-50 dark:bg-gray-900/50">
                  {renderTableHeader()}
                </thead>
              )}
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {renderTableRow && data.map((item) => (
                  <React.Fragment key={keyExtractor(item)}>
                    {renderTableRow(item)}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
