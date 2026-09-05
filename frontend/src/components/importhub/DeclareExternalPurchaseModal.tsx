import React, { useState } from 'react';
import { X, PlusCircle, AlertTriangle, CheckCircle2, DollarSign, Calendar, Package } from 'lucide-react';
import type { UserImportDeclaration } from '../../plugins/collector-import-hub/types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (declaration: Omit<UserImportDeclaration, 'id' | 'created_at'>) => void;
  currentYear: number;
}

export const DeclareExternalPurchaseModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSave,
  currentYear
}) => {
  const [description, setDescription] = useState('');
  const [productPriceUsd, setProductPriceUsd] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [courierName, setCourierName] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const price = parseFloat(productPriceUsd);
    if (!description.trim()) {
      setError('Por favor indica una descripción o nombre del producto');
      return;
    }
    if (isNaN(price) || price <= 0) {
      setError('Ingresa un valor válido en USD');
      return;
    }

    onSave({
      user_id: '',
      year: currentYear,
      origin_type: 'USER_DECLARED',
      description: description.trim(),
      product_price_usd: price,
      weight_kg: weightKg ? parseFloat(weightKg) : undefined,
      courier_name: courierName.trim() || undefined,
      tracking_number: trackingNumber.trim() || undefined,
      purchase_date: purchaseDate
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <PlusCircle className="w-5 h-5 text-amber-400" />
            <h3 className="font-bold text-white text-lg">Declarar Compra Externa (Año {currentYear})</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex gap-3 text-xs text-amber-300">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
            <span>
              Registra compras que hayas traído por fuera de Collectibles para mantener sincronizado tu cupo anual de USD 800 y tus 3 franquicias oficiales.
            </span>
          </div>

          {error && (
            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs p-3 rounded-lg">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Descripción / Artículo *
            </label>
            <input
              type="text"
              required
              placeholder="Ej: Estatua Iron Man Hot Toys o Carta Charizard"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Valor Factura (USD) *
              </label>
              <div className="relative">
                <DollarSign className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  placeholder="120.00"
                  value={productPriceUsd}
                  onChange={(e) => setProductPriceUsd(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Peso Físico (kg) <span className="text-slate-400 font-normal">(Opcional)</span>
              </label>
              <div className="relative">
                <Package className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="20"
                  placeholder="1.5"
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Courier Utilizado <span className="text-slate-400 font-normal">(Opcional)</span>
              </label>
              <input
                type="text"
                placeholder="Ej: Tiendamia, USX, Gripper"
                value={courierName}
                onChange={(e) => setCourierName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Fecha de Compra / Arribo *
              </label>
              <div className="relative">
                <Calendar className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="date"
                  required
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Tracking / Comprobante <span className="text-slate-400 font-normal">(Opcional)</span>
            </label>
            <input
              type="text"
              placeholder="Ej: 94001000000000000000"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 font-mono"
            />
          </div>

          <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-bold bg-amber-500 text-slate-950 hover:bg-amber-400 rounded-xl transition-all shadow-lg shadow-amber-500/20"
            >
              Guardar Declaración
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
