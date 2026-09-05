import React, { useState } from 'react';
import { X, Package, ShieldCheck, Info, ChevronRight, CheckCircle2, AlertTriangle } from 'lucide-react';
import { ImportCostEngine } from '../../lib/customs/ImportCostEngine';
import { getEstimatedWeightKg } from '../../lib/urubox';

interface ProductUruguayCostDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  productPriceUsd: number;
  categoryName?: string;
  knownWeightKg?: number;
  productTitle?: string;
}

export const ProductUruguayCostDrawer: React.FC<ProductUruguayCostDrawerProps> = ({
  isOpen,
  onClose,
  productPriceUsd,
  categoryName,
  knownWeightKg,
  productTitle
}) => {
  if (!isOpen) return null;

  const [selectedCourier, setSelectedCourier] = useState<'puntomio' | 'urubox'>('puntomio');
  const [useFranchise, setUseFranchise] = useState<boolean>(true);

  // Retrieve weight
  const physicalWeight = (knownWeightKg && knownWeightKg > 0) 
    ? knownWeightKg 
    : getEstimatedWeightKg(categoryName);

  // Calculate landed estimate
  const estimate = ImportCostEngine.calculateLandedCost({
    productPriceUsd,
    weightKg: physicalWeight,
    courierCode: selectedCourier,
    forceSimplifiedRegime: !useFranchise,
    exchangeRateUsdToUyu: 42.50
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
      <div 
        className="w-full max-w-lg bg-zinc-900 border border-white/10 rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-zinc-900/90">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🇺🇾</span>
            <div>
              <h3 className="font-bold text-sm text-white">Costo Estimado Puesto en Uruguay</h3>
              <p className="text-[11px] text-zinc-400">Desglose transparente: Producto + Courier + Aduana</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-5 text-sm">
          {productTitle && (
            <div className="text-xs text-zinc-300 font-semibold truncate bg-white/[0.03] p-2.5 rounded-lg border border-white/5">
              {productTitle}
            </div>
          )}

          {/* Courier Selector */}
          <div>
            <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider block mb-2">
              Seleccionar Courier de Casilla en USA
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setSelectedCourier('puntomio')}
                className={`p-3 rounded-xl border text-left transition ${
                  selectedCourier === 'puntomio'
                    ? 'border-sky-500 bg-sky-500/10 text-white'
                    : 'border-white/10 bg-white/[0.02] text-zinc-400 hover:border-white/20 hover:text-white'
                }`}
              >
                <div className="font-bold text-xs">PuntoMio</div>
                <div className="text-[11px] text-sky-400 mt-0.5">Recomendado · Sin handling</div>
              </button>

              <button
                onClick={() => setSelectedCourier('urubox')}
                className={`p-3 rounded-xl border text-left transition ${
                  selectedCourier === 'urubox'
                    ? 'border-sky-500 bg-sky-500/10 text-white'
                    : 'border-white/10 bg-white/[0.02] text-zinc-400 hover:border-white/20 hover:text-white'
                }`}
              >
                <div className="font-bold text-xs">Urubox</div>
                <div className="text-[11px] text-zinc-400 mt-0.5">+ USD 5 handling + URSEC</div>
              </button>
            </div>
          </div>

          {/* Regime Switcher */}
          <div className="bg-white/[0.02] border border-white/10 rounded-xl p-3.5">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-white block">¿Utilizar cupo de Franquicia 2026?</span>
                <span className="text-[11px] text-zinc-400 block">
                  {useFranchise ? '0% aranceles aduaneros (3 por año hasta USD 800)' : 'Aplica Régimen Simplificado (60%, mín. USD 20)'}
                </span>
              </div>
              <button
                onClick={() => setUseFranchise(!useFranchise)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  useFranchise 
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                    : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                }`}
              >
                {useFranchise ? 'Franquicia Sí' : 'Régimen Simplificado'}
              </button>
            </div>
          </div>

          {/* Weight Information */}
          <div className="text-xs flex items-center justify-between text-zinc-400 px-1">
            <span>Peso físico estimado:</span>
            <strong className="text-white">{physicalWeight.toFixed(2)} kg (Ley UY: sin peso volumétrico)</strong>
          </div>

          {/* Cost Breakdown */}
          <div className="bg-zinc-950/80 border border-white/10 rounded-xl p-4 space-y-2.5">
            <div className="flex justify-between items-center text-xs">
              <span className="text-zinc-400">1. Valor del Producto (USA / Origen)</span>
              <span className="font-mono text-white">USD {productPriceUsd.toFixed(2)}</span>
            </div>

            <div className="flex justify-between items-center text-xs">
              <span className="text-zinc-400">2. Flete Courier ({estimate.courier.courierName})</span>
              <span className="font-mono text-white">USD {estimate.courier.totalCourierUsd.toFixed(2)}</span>
            </div>

            <div className="flex justify-between items-center text-xs">
              <span className="text-zinc-400">3. Tributos Aduana (DNA Uruguay)</span>
              <span className={`font-mono ${estimate.customsEvaluation.taxUsd === 0 ? 'text-emerald-400 font-bold' : 'text-amber-400'}`}>
                {estimate.customsEvaluation.taxUsd === 0 ? 'USD 0.00 (Exento)' : `USD ${estimate.customsEvaluation.taxUsd?.toFixed(2)}`}
              </span>
            </div>

            <div className="pt-3 mt-1 border-t border-white/10 flex justify-between items-baseline">
              <div>
                <span className="text-sm font-black text-white block">Total Puesto en Uruguay</span>
                <span className="text-[11px] text-zinc-500">Aprox. $ {estimate.totalCostUyu.toLocaleString('es-UY')} UYU</span>
              </div>
              <div className="text-right">
                <span className="text-lg font-black text-sky-400 font-mono">
                  USD {estimate.totalCostUsd.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Customs Notes */}
          <div className="text-[11px] text-zinc-500 space-y-1">
            <p>• Los valores son estimaciones basadas en las tarifas vigentes de los couriers y las normativas aduaneras 2026.</p>
            <p>• El pago del flete courier y tributos (en caso de corresponder) se realiza directamente a la empresa de logística seleccionada.</p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 bg-zinc-900/60 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
};
