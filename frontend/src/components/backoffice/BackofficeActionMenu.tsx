import React, { useState, useRef, useEffect, ComponentType } from 'react';
import { MoreVertical } from 'lucide-react';

export interface BackofficeMenuItem {
  label: string;
  icon?: ComponentType<{ className?: string }>;
  onClick: () => void;
  danger?: boolean;
}

export interface BackofficeActionMenuProps {
  items: BackofficeMenuItem[];
  className?: string;
}

export const BackofficeActionMenu: React.FC<BackofficeActionMenuProps> = ({
  items,
  className = '',
}) => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={menuRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className="p-1.5 text-gray-500 hover:text-black dark:text-gray-400 dark:hover:text-white bg-gray-50 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700 rounded-lg min-h-[36px] min-w-[36px] flex items-center justify-center font-bold transition-colors"
        title="Acciones"
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {open && (
        <div className="absolute right-0 bottom-full mb-1 sm:bottom-auto sm:top-full sm:mt-1 w-40 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-30 py-1 text-xs font-medium animate-fade-in">
          {items.map((item, idx) => {
            const Icon = item.icon;
            return (
              <button
                key={idx}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  item.onClick();
                }}
                className={`w-full px-3 py-2 text-left flex items-center gap-2 transition-colors ${
                  item.danger
                    ? 'text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                    : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
