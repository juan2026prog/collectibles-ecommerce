import React, { useState, useEffect } from 'react';
import { Filter, X, RotateCcw, Check } from 'lucide-react';

interface FilterDrawerProps {
  activeCount?: number;
  onApply?: () => void;
  onClear?: () => void;
  children: React.ReactNode;
}

export default function FilterDrawer({
  activeCount = 0,
  onApply,
  onClear,
  children
}: FilterDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleApply = () => {
    onApply?.();
    setIsOpen(false);
  };

  const handleClear = () => {
    onClear?.();
    setIsOpen(false);
  };

  return (
    <>
      {/* Mobile Filter Button */}
      <div className="md:hidden mb-4">
        <button
          onClick={() => setIsOpen(true)}
          className="w-full py-2.5 px-4 bg-white border border-gray-300 rounded-xl font-medium text-sm text-gray-700 flex items-center justify-center gap-2 shadow-sm hover:bg-gray-50 active:bg-gray-100 min-h-[44px]"
        >
          <Filter className="w-4 h-4 text-gray-500" />
          <span>Filtros</span>
          {activeCount > 0 && (
            <span className="bg-primary-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {activeCount}
            </span>
          )}
        </button>
      </div>

      {/* Mobile Filter Bottom Sheet / Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex flex-col justify-end" role="dialog" aria-modal="true">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={() => setIsOpen(false)}
          />

          {/* Bottom Sheet Content */}
          <div className="relative z-10 w-full bg-white rounded-t-2xl shadow-2xl flex flex-col max-h-[85vh] animate-slideUp">
            {/* Sheet Header */}
            <div className="p-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10 rounded-t-2xl">
              <div className="flex items-center gap-2">
                <Filter className="w-5 h-5 text-primary-600" />
                <h3 className="font-bold text-gray-900 text-base">Filtros</h3>
                {activeCount > 0 && (
                  <span className="bg-primary-100 text-primary-700 text-xs font-bold px-2 py-0.5 rounded-full">
                    {activeCount} activos
                  </span>
                )}
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Sheet Body */}
            <div className="p-4 overflow-y-auto space-y-4 flex-1">
              {children}
            </div>

            {/* Sheet Sticky Footer */}
            <div className="p-4 border-t border-gray-200 bg-gray-50 flex items-center gap-3 sticky bottom-0 z-10 pb-safe">
              {onClear && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="flex-1 py-3 px-4 bg-white border border-gray-300 rounded-xl font-bold text-sm text-gray-700 hover:bg-gray-100 flex items-center justify-center gap-2 min-h-[44px]"
                >
                  <RotateCcw className="w-4 h-4" />
                  Limpiar
                </button>
              )}
              <button
                type="button"
                onClick={handleApply}
                className="flex-1 py-3 px-4 bg-primary-600 text-white rounded-xl font-bold text-sm hover:bg-primary-700 flex items-center justify-center gap-2 shadow-sm min-h-[44px]"
              >
                <Check className="w-4 h-4" />
                Aplicar filtros
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Desktop Filter View */}
      <div className="hidden md:block w-full">
        {children}
      </div>
    </>
  );
}
