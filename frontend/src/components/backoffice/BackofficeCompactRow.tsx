import React, { ReactNode } from 'react';

export interface BackofficeCompactRowProps {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  status?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  className?: string;
}

export const BackofficeCompactRow: React.FC<BackofficeCompactRowProps> = ({
  leading,
  title,
  subtitle,
  status,
  trailing,
  onClick,
  className = '',
}) => {
  return (
    <div
      onClick={onClick}
      className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 flex items-center justify-between gap-3 min-w-0 transition-colors shadow-2xs ${
        onClick ? 'cursor-pointer hover:border-gray-300 dark:hover:border-gray-600' : ''
      } ${className}`}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {leading && <div className="shrink-0">{leading}</div>}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="font-bold text-gray-900 dark:text-white text-xs sm:text-sm truncate">
              {title}
            </div>
            {status && <div className="shrink-0">{status}</div>}
          </div>
          {subtitle && (
            <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate mt-0.5">
              {subtitle}
            </div>
          )}
        </div>
      </div>

      {trailing && <div className="shrink-0 flex items-center gap-2">{trailing}</div>}
    </div>
  );
};
