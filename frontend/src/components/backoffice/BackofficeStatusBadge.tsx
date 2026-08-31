import React from 'react';

export interface BackofficeStatusBadgeProps {
  status: string;
  label?: string;
  type?: 'success' | 'warning' | 'error' | 'info' | 'neutral';
  size?: 'sm' | 'md';
  className?: string;
}

export const BackofficeStatusBadge: React.FC<BackofficeStatusBadgeProps> = ({
  status,
  label,
  type = 'neutral',
  size = 'sm',
  className = '',
}) => {
  const displayLabel = label || status;

  const typeMap = {
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
    warning: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
    error: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800',
    info: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
    neutral: 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700',
  };

  const sizeMap = {
    sm: 'px-2 py-0.5 text-[9px] font-bold',
    md: 'px-2.5 py-1 text-xs font-bold',
  };

  return (
    <span className={`inline-flex items-center uppercase tracking-wider rounded border shrink-0 ${typeMap[type]} ${sizeMap[size]} ${className}`}>
      {displayLabel}
    </span>
  );
};
