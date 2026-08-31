import React, { ReactNode, ComponentType } from 'react';

export interface BackofficeKPIProps {
  label: string;
  value: string | number;
  secondaryBadge?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  variant?: 'admin' | 'operational';
  className?: string;
}

export const BackofficeKPI: React.FC<BackofficeKPIProps> = ({
  label,
  value,
  secondaryBadge,
  icon: Icon,
  variant = 'admin',
  className = '',
}) => {
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-2xs border border-gray-200 dark:border-gray-700 p-3 sm:p-4 min-w-0 ${className}`}>
      <div className="flex justify-between items-start gap-2">
        <div className="text-gray-500 dark:text-gray-400 font-bold text-[10px] sm:text-xs tracking-wider uppercase truncate">
          {label}
        </div>
        {Icon && (
          <div className="p-1.5 bg-gray-100 dark:bg-gray-700 rounded-lg shrink-0 text-gray-700 dark:text-gray-200">
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>
      <div className="mt-2 flex items-baseline gap-1.5 flex-wrap">
        <div className="text-lg sm:text-2xl font-black text-gray-900 dark:text-white tracking-tight">
          {value}
        </div>
        {secondaryBadge && <div className="shrink-0">{secondaryBadge}</div>}
      </div>
    </div>
  );
};
