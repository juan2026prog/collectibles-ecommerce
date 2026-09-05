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
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-white text-gray-700 hover:bg-gray-50 border border-gray-300 shadow-sm transition-all"
      >
        <SlidersHorizontal className="w-3.5 h-3.5 text-[#f00856]" />
        <span>Columnas ({columns.filter(c => c.visible).length})</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 bg-white border border-gray-200 rounded-xl shadow-xl z-50 p-3 animate-in fade-in duration-100">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-gray-200">
            <span className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5 text-[#f00856]" />
              Columnas Visibles
            </span>
            <button
              onClick={resetDefaults}
              title="Restaurar por defecto"
              className="text-[10px] text-gray-500 hover:text-[#f00856] flex items-center gap-1 font-medium"
            >
              <RotateCcw className="w-2.5 h-2.5" />
              Por defecto
            </button>
          </div>

          <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
            {columns.map(col => (
              <label
                key={col.id}
                className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer text-xs select-none transition-colors"
              >
                <span className={col.visible ? 'text-gray-900 font-medium' : 'text-gray-400'}>
                  {col.label}
                </span>
                <input
                  type="checkbox"
                  checked={col.visible}
                  onChange={() => toggleColumn(col.id)}
                  className="rounded border-gray-300 text-[#f00856] focus:ring-[#f00856] w-3.5 h-3.5 cursor-pointer"
                />
              </label>
            ))}
          </div>

          {onSavePreset && (
            <div className="pt-2 mt-2 border-t border-gray-200 flex justify-end">
              <button
                onClick={() => {
                  onSavePreset();
                  setIsOpen(false);
                }}
                className="w-full py-1.5 text-center bg-[#f00856] hover:bg-[#d0074a] text-white rounded-lg text-xs font-semibold transition-colors shadow-xs"
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
