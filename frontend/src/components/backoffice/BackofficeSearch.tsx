import React from 'react';
import { Search as SearchIcon, X } from 'lucide-react';

export interface BackofficeSearchProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
}

export const BackofficeSearch: React.FC<BackofficeSearchProps> = ({
  value,
  onChange,
  placeholder = 'Buscar...',
  className = '',
}) => {
  return (
    <div className={`relative w-full ${className}`}>
      <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 shrink-0" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl pl-9 pr-8 py-2 text-xs font-medium text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-gray-900 dark:focus:border-white focus:ring-1 focus:ring-gray-900 dark:focus:ring-white transition-all shadow-2xs min-h-[44px]"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
