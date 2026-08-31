import React from 'react';

export interface BackofficeTabItem {
  key: string;
  label: string;
  count?: number;
}

export interface BackofficeTabsProps {
  tabs: BackofficeTabItem[];
  activeTab: string;
  onChange: (key: string) => void;
  className?: string;
}

export const BackofficeTabs: React.FC<BackofficeTabsProps> = ({
  tabs,
  activeTab,
  onChange,
  className = '',
}) => {
  return (
    <div className={`space-y-2 ${className}`}>
      {/* Mobile Select (< md) */}
      <div className="md:hidden w-full">
        <select
          value={activeTab}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2.5 text-xs font-bold text-gray-900 dark:text-white shadow-2xs focus:ring-2 focus:ring-[#f00856] outline-none min-h-[44px] cursor-pointer"
        >
          {tabs.map((tab) => (
            <option key={tab.key} value={tab.key}>
              {tab.label} {tab.count !== undefined ? `(${tab.count})` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Desktop Pills (>= md) */}
      <div className="hidden md:flex flex-wrap gap-1 bg-gray-100 dark:bg-gray-800/80 p-1 rounded-xl border border-gray-200 dark:border-gray-700">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => onChange(tab.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                isActive
                  ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-xs'
                  : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
              }`}
            >
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  isActive ? 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200' : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
