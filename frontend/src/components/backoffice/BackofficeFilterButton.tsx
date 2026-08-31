import React from 'react';
import { Filter } from 'lucide-react';

export interface BackofficeFilterButtonProps {
  activeCount?: number;
  onClick: () => void;
  label?: string;
  className?: string;
}

export const BackofficeFilterButton: React.FC<BackofficeFilterButtonProps> = ({
  activeCount = 0,
  onClick,
  label = 'Filtros',
  className = '',
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-bold text-xs rounded-xl min-h-[44px] flex items-center justify-center gap-1.5 transition-colors border border-gray-200 dark:border-gray-700 shadow-2xs ${className}`}
    >
      <Filter className="w-3.5 h-3.5" />
      <span>{label}</span>
      {activeCount > 0 && (
        <span className="bg-[#f00856] text-white text-[10px] font-black px-1.5 py-0.2 rounded-full font-mono">
          {activeCount}
        </span>
      )}
    </button>
  );
};
