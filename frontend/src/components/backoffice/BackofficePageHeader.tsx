import React, { ReactNode } from 'react';

export interface BackofficePageHeaderProps {
  title: string;
  subtitle?: string;
  count?: number;
  countLabel?: string;
  actions?: ReactNode;
  variant?: 'admin' | 'operational' | 'affiliate' | 'artist' | 'portal';
  className?: string;
}

export const BackofficePageHeader: React.FC<BackofficePageHeaderProps> = ({
  title,
  subtitle,
  count,
  countLabel,
  actions,
  variant = 'admin',
  className = '',
}) => {
  return (
    <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 min-w-0 ${className}`}>
      <div className="min-w-0">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white tracking-tight">
            {title}
          </h1>
          {count !== undefined && (
            <span className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-xs font-bold px-2.5 py-0.5 rounded-full border border-gray-200 dark:border-gray-700 shrink-0">
              {count} {countLabel || (count === 1 ? 'item' : 'items')}
            </span>
          )}
        </div>
        {subtitle && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-medium truncate">
            {subtitle}
          </p>
        )}
      </div>

      {actions && (
        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
};
