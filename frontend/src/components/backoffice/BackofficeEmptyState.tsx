import React, { ReactNode, ComponentType } from 'react';
import { Inbox } from 'lucide-react';

export interface BackofficeEmptyStateProps {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}

export const BackofficeEmptyState: React.FC<BackofficeEmptyStateProps> = ({
  icon: Icon = Inbox,
  title,
  description,
  action,
  compact = true,
  className = '',
}) => {
  return (
    <div className={`flex flex-col items-center justify-center text-center bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-6 ${compact ? 'min-h-[140px]' : 'min-h-[220px]'} ${className}`}>
      <div className="w-10 h-10 bg-gray-50 dark:bg-gray-700 rounded-full flex items-center justify-center mb-2 shrink-0">
        <Icon className="w-5 h-5 text-gray-400 dark:text-gray-300" />
      </div>
      <h4 className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">{title}</h4>
      {description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 max-w-xs">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
};
