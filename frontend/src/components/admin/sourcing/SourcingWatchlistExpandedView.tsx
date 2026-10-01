import React, { useState } from 'react';
import { 
  Bookmark, Plus, Trash2, Search, Sparkles, Filter, 
  Tag, Layers, ShieldCheck, CheckCircle2, ArrowRight
} from 'lucide-react';
import type { WatchlistExpandedItem, WatchlistScopeType } from '../../types/sourcingIntelligence';

interface SourcingWatchlistExpandedViewProps {
  watchlistItems: WatchlistExpandedItem[];
  onAddItem: (item: Omit<WatchlistExpandedItem, 'id' | 'created_at'>) => void;
  onRemoveItem: (id: string) => void;
  onInvestigateItem: (item: WatchlistExpandedItem) => void;
}

export const SourcingWatchlistExpandedView: React.FC<SourcingWatchlistExpandedViewProps> = ({
  watchlistItems,
  onAddItem,
  onRemoveItem,
  onInvestigateItem
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [scopeType, setScopeType] = useState<WatchlistScopeType>('BRAND');
  const [priority, setPriority] = useState<'HIGH' | 'MEDIUM' | 'LOW'>('HIGH');
  const [notes, setNotes] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    onAddItem({
      name: name.trim(),
      value: value.trim() || name.trim(),
      type: scopeType,
      priority,
      notes: notes.trim() || undefined
    });

    setName('');
    setValue('');
    setNotes('');
    setShowAddForm(false);
  };

  return (
    <div className="space-y-5">
      {/* CABECERA DE WATCHLIST */}
      <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-amber-100 text-amber-800">
              <Bookmark className="w-4 h-4" />
            </span>
            <h2 className="text-base font-black text-gray-900 tracking-tight">
              Watchlist Comercial ({watchlistItems.length})
            </h2>
          </div>
          <p className="text-xs text-gray-500">
            Marcas, franquicias, líneas y productos monitoreados con prioridad en el Discovery Automático.
          </p>
        </div>

        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-[#f00856] hover:bg-[#d0074a] text-white text-xs font-black rounded-xl transition shadow-xs cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>{showAddForm ? 'Cerrar Formulario' : 'Agregar a Watchlist'}</span>
        </button>
      </div>

      {/* FORMULARIO PARA AGREGAR NUEVO CRITERIO A WATCHLIST */}
      {showAddForm && (
        <form onSubmit={handleSubmit} className="bg-slate-50 border border-slate-200 rounded-3xl p-5 space-y-4 animate-in fade-in duration-200">
          <h3 className="text-xs font-black uppercase text-gray-700 tracking-wider">
            Nuevo Criterio de Vigilancia Comercial
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] font-bold text-gray-600 block mb-1">Tipo de Vigilancia</label>
              <select
                value={scopeType}
                onChange={(e) => setScopeType(e.target.value as WatchlistScopeType)}
                className="w-full bg-white border border-gray-300 rounded-xl p-2.5 text-xs font-semibold text-gray-900 focus:ring-2 focus:ring-[#f00856] focus:outline-none"
              >
                <option value="BRAND">Marca (Brand)</option>
                <option value="MANUFACTURER">Fabricante</option>
                <option value="FRANCHISE">Franquicia / Licencia</option>
                <option value="LINE">Línea de Producto</option>
                <option value="CHARACTER">Personaje</option>
                <option value="CATEGORY">Categoría</option>
                <option value="SKU">Producto / SKU Específico</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] font-bold text-gray-600 block mb-1">Nombre Descriptivo</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: McFarlane Toys, Street Fighter, etc."
                className="w-full bg-white border border-gray-300 rounded-xl p-2.5 text-xs font-semibold text-gray-900 focus:ring-2 focus:ring-[#f00856] focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-gray-600 block mb-1">Prioridad de Escaneo</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as any)}
                className="w-full bg-white border border-gray-300 rounded-xl p-2.5 text-xs font-semibold text-gray-900 focus:ring-2 focus:ring-[#f00856] focus:outline-none"
              >
                <option value="HIGH">Alta (Escaneo Diario)</option>
                <option value="MEDIUM">Media (Cada 3 días)</option>
                <option value="LOW">Baja (Semanal)</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 border border-gray-300 rounded-xl text-xs font-bold text-gray-600 hover:bg-white transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-black rounded-xl transition cursor-pointer"
            >
              Guardar en Watchlist
            </button>
          </div>
        </form>
      )}

      {/* GRID DE ELEMENTOS VIGILADOS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {watchlistItems.map(item => (
          <div
            key={item.id}
            className="bg-white border border-gray-200 hover:border-gray-300 rounded-2xl p-4 shadow-2xs flex items-center justify-between gap-3 transition"
          >
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
                  {item.type}
                </span>
                <span className="text-[10px] text-gray-400 font-bold">
                  Prioridad {item.priority}
                </span>
              </div>
              <h4 className="text-xs font-black text-gray-900 truncate">
                {item.name}
              </h4>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => onInvestigateItem(item)}
                className="p-2 rounded-xl bg-slate-100 hover:bg-[#f00856] hover:text-white text-gray-700 text-xs font-bold transition cursor-pointer"
                title="Investigar este criterio ahora"
              >
                <Search className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => onRemoveItem(item.id)}
                className="p-2 rounded-xl text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                title="Eliminar de Watchlist"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
