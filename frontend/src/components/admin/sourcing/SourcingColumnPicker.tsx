import React, { useState } from 'react';
import type { ColumnDefinition } from '../../../types/sourcing';
import { SlidersHorizontal, Check, Eye, RotateCcw } from 'lucide-react';

interface SourcingColumnPickerProps {
  columns: ColumnDefinition[];
  onChangeColumns: (columns: ColumnDefinition[]) => void;
  onSavePreset?: () => void;
}

export const SourcingColumnPicker: React.FC<SourcingColumnPickerProps> = ({
  columns,
  onChangeColumns,
  onSavePreset
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const toggleColumn = (id: string) => {
    const updated = columns.map(col => 
      col.id === id ? { ...col, visible: !col.visible } : col
    );
    onChangeColumns(updated);
  };

  const resetDefaults = () => {
    const defaultIds = ['select', 'product', 'source', 'cost_puesto', 'sale_price', 'margin', 'ml_uruguay', 'difference', 'actions'];
    const updated = columns.map(col => ({
      ...col,
      visible: defaultIds.includes(col.id)
    }));
    onChangeColumns(updated);
  };

  return (
    <div className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-dark-800 text-gray-300 hover:text-white hover:bg-dark-700 border border-white/10 shadow-sm transition-all"
      >
        <SlidersHorizontal className="w-3.5 h-3.5 text-primary-500" />
        <span>Columnas ({columns.filter(c => c.visible).length})</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 bg-dark-900 border border-white/15 rounded-xl shadow-2xl z-50 p-3 backdrop-blur-lg animate-in fade-in zoom-in-95 duration-100">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5 text-primary-400" />
              Columnas Visibles
            </span>
            <button
              onClick={resetDefaults}
              title="Restaurar por defecto"
              className="text-[10px] text-gray-400 hover:text-primary-400 flex items-center gap-1"
            >
              <RotateCcw className="w-2.5 h-2.5" />
              Por defecto
            </button>
          </div>

          <div className="max-h-64 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
            {columns.map(col => (
              <label
                key={col.id}
                className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-dark-800 cursor-pointer text-xs select-none transition-colors"
              >
                <span className={col.visible ? 'text-white font-medium' : 'text-gray-400'}>
                  {col.label}
                </span>
                <input
                  type="checkbox"
                  checked={col.visible}
                  onChange={() => toggleColumn(col.id)}
                  className="rounded border-gray-600 bg-dark-800 text-primary-600 focus:ring-primary-500 w-3.5 h-3.5 cursor-pointer"
                />
              </label>
            ))}
          </div>

          {onSavePreset && (
            <div className="pt-2 mt-2 border-t border-white/10 flex justify-end">
              <button
                onClick={() => {
                  onSavePreset();
                  setIsOpen(false);
                }}
                className="w-full py-1 text-center bg-primary-600 hover:bg-primary-500 text-white rounded-lg text-xs font-semibold transition-colors"
              >
                Guardar como Vista Predeterminada
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
